import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { beforeEach, expect, it, vi } from 'vitest';
const session = vi.hoisted(() => ({ epoch: 1, me: null }));
vi.mock('../../src/auth/session', () => ({ useSession: () => session }));
import { ArchiveImport } from '../../src/pages/ArchivalDescription';
import { ArchivesApi, type ArchiveCsvKind, type CsvPreview } from '../../src/api/archives';

const institution = '11111111-1111-4111-8111-111111111111';
const good: CsvPreview = { hash: 'hash1', rows: 3, issues: [], created: 1, updated: 1, unchanged: 1, entries: [
    { row: 2, reference: 'F1', title: 'Titre révisé', level: 'FONDS', action: 'UPDATE', existingId: 'existing', confidentiality: 'INTERNE', parent: null, changes: [{ field: 'title', before: 'Titre précédent', after: 'Titre révisé' }, { field: 'status', before: 'VALIDEE', after: 'BROUILLON' }, { field: 'processing.plan', before: 'Classer', after: 'Classer puis décrire' }] },
    { row: 3, reference: 'F1/S', title: 'Nouvelle série', level: 'SERIE', action: 'CREATE', existingId: null, confidentiality: 'INTERNE', parent: 'F1 · Titre révisé', changes: [] },
    { row: 4, reference: 'F2', title: 'Fonds stable', level: 'FONDS', action: 'UNCHANGED', existingId: 'stable', confidentiality: 'INTERNE', parent: null, changes: [] },
] };
let current: CsvPreview;
const request = vi.fn();
const result = { count: 3, created: 1, updated: 1, unchanged: 1 };
beforeEach(() => { session.epoch++; current = good; request.mockReset().mockImplementation((path: string) => Promise.resolve(path.endsWith('/preview') ? current : result)); });
function setup(kind: ArchiveCsvKind = 'descriptions') {
    const onClose = vi.fn(), onImported = vi.fn();
    render(<ArchiveImport api={new ArchivesApi({ request })} institution={institution} kind={kind} onClose={onClose} onImported={onImported} />);
    return { onClose, onImported };
}
async function upload(text = 'CSV contenu') {
    const file = new File([text], 'fonds.csv', { type: 'text/csv' });
    fireEvent.change(screen.getByLabelText('Fichier CSV'), { target: { files: [file] } });
    await waitFor(() => expect((screen.getByRole('button', { name: 'Contrôler le fichier' }) as HTMLButtonElement).disabled).toBe(false));
}
async function check() { fireEvent.click(screen.getByRole('button', { name: 'Contrôler le fichier' })); await screen.findByRole('status'); }
const mode = () => screen.getByRole('checkbox', { name: 'Mettre à jour les fonds et descriptions existants' });
const confirm = () => screen.getByRole('button', { name: 'Confirmer les créations et mises à jour' }) as HTMLButtonElement;

it('présente les valeurs avant et après puis transmet le mode et l’empreinte contrôlés', async () => {
    const { onClose, onImported } = setup(); expect((mode() as HTMLInputElement).checked).toBe(false);
    fireEvent.click(mode()); await upload(); expect(confirm().disabled).toBe(true); await check();
    expect(request.mock.calls[0][1].body).toEqual({ institutionId: institution, kind: 'descriptions', csv: 'CSV contenu', updateExisting: true });
    expect(screen.getByText('1 à créer · 1 à mettre à jour · 1 inchangée(s).')).toBeTruthy();
    const list = screen.getByRole('list', { name: 'Notices lues' });
    expect(list.textContent).toContain('Avant : Titre précédent'); expect(list.textContent).toContain('Après : Titre révisé');
    expect(list.textContent).toContain('Avant : Validée'); expect(list.textContent).toContain('Après : Brouillon');
    expect(list.textContent).toContain('Plan de traitement'); expect(list.textContent).toContain('Inchangée — aucune modification');
    expect((await axe.run(screen.getByRole('dialog'))).violations).toEqual([]);
    fireEvent.click(confirm()); await waitFor(() => expect(onImported).toHaveBeenCalledWith(result)); expect(onClose).toHaveBeenCalled();
    expect(request.mock.calls[1][1].body).toEqual({ institutionId: institution, kind: 'descriptions', csv: 'CSV contenu', updateExisting: true, previewHash: 'hash1' });
});

it('invalide l’aperçu quand le mode ou le fichier change', async () => {
    setup(); await upload(); await check(); fireEvent.click(mode()); expect(screen.queryByRole('status')).toBeNull(); expect(confirm().disabled).toBe(true);
    await check(); expect(confirm().disabled).toBe(false); await upload('Autre CSV'); expect(screen.queryByRole('status')).toBeNull(); expect(confirm().disabled).toBe(true);
});

it('une erreur de contrôle bloque l’ensemble du lot et indique la ligne', async () => {
    current = { ...good, issues: [{ row: 3, message: 'Parent indisponible' }] };
    setup(); fireEvent.click(mode()); await upload(); await check(); expect(screen.getByText('Ligne 3 : Parent indisponible')).toBeTruthy(); expect(confirm().disabled).toBe(true);
    fireEvent.click(confirm()); expect(request).toHaveBeenCalledTimes(1);
});

it('conserve la clé au nouvel essai réseau et la renouvelle après un nouveau contrôle', async () => {
    request.mockImplementation((path: string) => path.endsWith('/preview') ? Promise.resolve(current) : Promise.reject(new Error('Réseau interrompu')));
    setup(); fireEvent.click(mode()); await upload(); await check(); fireEvent.click(confirm()); await screen.findByRole('alert');
    fireEvent.click(confirm()); await waitFor(() => expect(request).toHaveBeenCalledTimes(3)); const firstKey = request.mock.calls[1][1].idempotencyKey;
    expect(request.mock.calls[2][1].idempotencyKey).toBe(firstKey); await waitFor(() => expect(confirm().disabled).toBe(false));
    current = { ...good, hash: 'hash2' }; await check(); fireEvent.click(confirm()); await waitFor(() => expect(request).toHaveBeenCalledTimes(5)); expect(request.mock.calls[4][1].idempotencyKey).not.toBe(firstKey);
});

it('rend les différences au-delà des cent premières notices', async () => {
    current = { ...good, rows: 101, entries: [...Array.from({ length: 100 }, (_, i) => ({ ...good.entries![2], row: i + 2, reference: `F${i}` })), { ...good.entries![0], row: 102, reference: 'DERNIER' }] };
    setup(); fireEvent.click(mode()); await upload(); await check();
    expect(within(screen.getByRole('list', { name: 'Notices lues' })).getAllByRole('listitem')).toHaveLength(100); expect(screen.queryByText(/Ligne 102/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Afficher les 1 notices suivantes' })); expect(screen.getByText(/Ligne 102 · DERNIER/)).toBeTruthy(); expect(screen.getByRole('list', { name: 'Notices lues' }).textContent).toContain('Avant : Titre précédent');
});

it('la création CSV des producteurs reste disponible sans activer la mise à jour', async () => {
    current = { hash: 'authorities', rows: 1, issues: [], entries: [], created: 1, updated: 0, unchanged: 0 };
    setup('authorities'); expect((screen.getByRole('checkbox', { name: 'Mettre à jour les producteurs existants' }) as HTMLInputElement).checked).toBe(false); await upload(); await check();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’import' })); await waitFor(() => expect(request).toHaveBeenCalledTimes(2)); expect(request.mock.calls[1][1].body.updateExisting).toBe(false);
});

it('refuse les fichiers trop gros et le contenu qui n’est pas en UTF-8', async () => {
    setup(); fireEvent.change(screen.getByLabelText('Fichier CSV'), { target: { files: [new File([new Uint8Array(2_000_001)], 'gros.csv')] } });
    expect((await screen.findByRole('alert')).textContent).toContain('dépasse 2 Mo');
    fireEvent.change(screen.getByLabelText('Fichier CSV'), { target: { files: [new File([new Uint8Array([0xff])], 'latin.csv')] } });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('encodé en UTF-8')); expect(request).not.toHaveBeenCalled();
});

const authorityPreview: CsvPreview = { hash: 'authority-hash', rows: 3, issues: [], created: 1, updated: 1, unchanged: 1, authorities: [
    { row: 2, code: 'PROD-A', name: 'Famille corrigée', kind: 'FAMILLE', action: 'UPDATE', existingId: 'existing', changes: [
        { field: 'name', before: 'Nom précédent', after: 'Famille corrigée' }, { field: 'kind', before: 'PERSONNE', after: 'FAMILLE' },
        { field: 'status', before: 'VALIDEE', after: 'BROUILLON' }, { field: 'history', before: 'Histoire précédente', after: 'Histoire corrigée\nDeuxième ligne' },
        { field: 'actorId', before: 'acteur-1', after: 'acteur-2' }, { field: 'detailLevel', before: 'MINIMAL', after: 'COMPLET' },
    ] },
    { row: 3, code: 'PROD-B', name: 'Nouveau service', kind: 'COLLECTIVITE', action: 'CREATE', existingId: null, changes: [] },
    { row: 4, code: 'PROD-C', name: 'Producteur conservé', kind: 'PERSONNE', action: 'UNCHANGED', existingId: 'stable', changes: [] },
] };
it('affiche et confirme les différences CSV des producteurs, avec les libellés de type et d’état', async () => {
    current = authorityPreview; const { onImported, onClose } = setup('authorities'); const toggle = screen.getByRole('checkbox', { name: 'Mettre à jour les producteurs existants' });
    expect((toggle as HTMLInputElement).checked).toBe(false); fireEvent.click(toggle); await upload(); await check();
    const list = screen.getByRole('list', { name: 'Producteurs lus' });
    for (const text of ['Avant : Nom précédent', 'Après : Famille corrigée', 'Avant : Personne', 'Après : Famille', 'Avant : Validée', 'Après : Brouillon', 'Avant : Minimal', 'Après : Complet', 'Lien acteur', 'Inchangé — aucune écriture']) expect(list.textContent).toContain(text);
    expect(screen.queryByText(/Confidentialité :/)).toBeNull(); expect((await axe.run(screen.getByRole('dialog'))).violations).toEqual([]);
    expect(request.mock.calls[0][1].body).toEqual({ institutionId: institution, kind: 'authorities', csv: 'CSV contenu', updateExisting: true });
    fireEvent.click(confirm()); await waitFor(() => expect(onImported).toHaveBeenCalledWith(result)); expect(onClose).toHaveBeenCalled();
    expect(request.mock.calls[1][1].body).toEqual({ institutionId: institution, kind: 'authorities', csv: 'CSV contenu', updateExisting: true, previewHash: 'authority-hash' });
});
it('annuler l’aperçu des producteurs n’envoie aucune confirmation et changer le mode invalide l’aperçu', async () => {
    current = authorityPreview; const { onClose, onImported } = setup('authorities'); const toggle = screen.getByRole('checkbox');
    fireEvent.click(toggle); await upload(); await check(); fireEvent.click(toggle); expect(screen.queryByRole('status')).toBeNull(); expect((screen.getByRole('button', { name: 'Confirmer l’import' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' })); expect(onClose).toHaveBeenCalled(); expect(onImported).not.toHaveBeenCalled(); expect(request).toHaveBeenCalledTimes(1);
});
it('une relation incompatible bloque la confirmation des producteurs et montre la ligne en cause', async () => {
    current = { ...authorityPreview, issues: [{ row: 2, message: 'Relation existante incompatible : une tutelle relie des collectivités.' }] };
    setup('authorities'); fireEvent.click(screen.getByRole('checkbox')); await upload(); await check();
    expect(screen.getByText(/Ligne 2 : Relation existante incompatible/)).toBeTruthy(); expect(confirm().disabled).toBe(true); fireEvent.click(confirm()); expect(request).toHaveBeenCalledTimes(1);
});
it('permet de lire les différences du dernier producteur au-delà des cent premiers', async () => {
    current = { ...authorityPreview, rows: 101, authorities: [...Array.from({ length: 100 }, (_, i) => ({ ...authorityPreview.authorities![2], row: i + 2, code: `P${i}` })), { ...authorityPreview.authorities![0], row: 102, code: 'DERNIER' }] };
    setup('authorities'); fireEvent.click(screen.getByRole('checkbox')); await upload(); await check();
    expect(within(screen.getByRole('list', { name: 'Producteurs lus' })).getAllByRole('listitem')).toHaveLength(100); expect(screen.queryByText(/Ligne 102/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Afficher les 1 producteurs suivants' })); expect(screen.getByText(/Ligne 102 · DERNIER/)).toBeTruthy(); expect(screen.getByRole('list', { name: 'Producteurs lus' }).textContent).toContain('Avant : Nom précédent');
});

const functionPreview: CsvPreview = { hash: 'function-hash', rows: 3, issues: [], created: 1, updated: 1, unchanged: 1, functions: [
    { row: 2, code: 'RH', name: 'Gestion RH révisée', kind: 'FONCTION', action: 'UPDATE', existingId: 'existing', parent: 'ADMIN · Administration', changes: [
        { field: 'name', before: 'Ancien nom', after: 'Gestion RH révisée' }, { field: 'kind', before: 'SOUS_FONCTION', after: 'FONCTION' },
        { field: 'status', before: 'REVISEE', after: 'BROUILLON' }, { field: 'parentId', before: 'OLD · Ancienne mère', after: 'ADMIN · Administration' },
        { field: 'history', before: 'Historique précédent', after: 'Historique corrigé\nDeuxième ligne' }, { field: 'detailLevel', before: 'MINIMAL', after: 'COMPLET' },
    ] },
    { row: 3, code: 'RH-A', name: 'Nouvelle activité', kind: 'ACTIVITE', action: 'CREATE', existingId: null, parent: 'RH · Gestion RH révisée', changes: [] },
    { row: 4, code: 'FIN', name: 'Gestion financière', kind: 'FONCTION', action: 'UNCHANGED', existingId: 'stable', parent: null, changes: [] },
] };
it('présente les différences CSV des fonctions puis confirme le fichier et son mode contrôlés', async () => {
    current = functionPreview; const { onImported, onClose } = setup('functions'); const toggle = screen.getByRole('checkbox', { name: 'Mettre à jour les fonctions existantes' });
    expect((toggle as HTMLInputElement).checked).toBe(false); fireEvent.click(toggle); await upload(); await check();
    expect(request.mock.calls[0][1].body).toEqual({ institutionId: institution, kind: 'functions', csv: 'CSV contenu', updateExisting: true });
    const list = screen.getByRole('list', { name: 'Fonctions lues' });
    for (const text of ['Avant : Ancien nom', 'Après : Gestion RH révisée', 'Avant : Sous-fonction', 'Après : Fonction', 'Avant : Révisée', 'Après : Brouillon', 'Avant : Minimal', 'Après : Complet', 'Avant : OLD · Ancienne mère', 'Inchangée — aucune modification']) expect(list.textContent).toContain(text);
    expect((await axe.run(screen.getByRole('dialog'))).violations).toEqual([]);
    fireEvent.click(confirm()); await waitFor(() => expect(onImported).toHaveBeenCalledWith(result)); expect(onClose).toHaveBeenCalled();
    expect(request.mock.calls[1][1].body).toEqual({ institutionId: institution, kind: 'functions', csv: 'CSV contenu', updateExisting: true, previewHash: 'function-hash' });
});
it('invalide l’aperçu des fonctions après changement de mode ou de fichier et annule sans confirmer', async () => {
    current = functionPreview; const { onClose, onImported } = setup('functions'); const toggle = screen.getByRole('checkbox');
    fireEvent.click(toggle); await upload(); await check(); fireEvent.click(toggle); expect(screen.queryByRole('status')).toBeNull(); expect((screen.getByRole('button', { name: 'Confirmer l’import' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(toggle); await check(); await upload('Autres fonctions'); expect(confirm().disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' })); expect(onClose).toHaveBeenCalled(); expect(onImported).not.toHaveBeenCalled(); expect(request).toHaveBeenCalledTimes(2);
});
it('bloque le lot des fonctions si la hiérarchie finale est incohérente', async () => {
    current = { ...functionPreview, issues: [{ row: 2, message: 'Une fonction ne peut être sa propre ancêtre.' }] };
    setup('functions'); fireEvent.click(screen.getByRole('checkbox')); await upload(); await check(); expect(screen.getByText(/Ligne 2 : Une fonction/)).toBeTruthy(); expect(confirm().disabled).toBe(true); fireEvent.click(confirm()); expect(request).toHaveBeenCalledTimes(1);
});
it('permet de lire la dernière différence au-delà des cent premières fonctions', async () => {
    current = { ...functionPreview, rows: 101, functions: [...Array.from({ length: 100 }, (_, i) => ({ ...functionPreview.functions![2], row: i + 2, code: `FN-${i}` })), { ...functionPreview.functions![0], row: 102, code: 'DERNIERE' }] };
    setup('functions'); fireEvent.click(screen.getByRole('checkbox')); await upload(); await check(); expect(within(screen.getByRole('list', { name: 'Fonctions lues' })).getAllByRole('listitem')).toHaveLength(100);
    fireEvent.click(screen.getByRole('button', { name: 'Afficher les 1 fonctions suivantes' })); expect(screen.getByText(/Ligne 102 · DERNIERE/)).toBeTruthy(); expect(screen.getByRole('list', { name: 'Fonctions lues' }).textContent).toContain('Avant : Ancien nom');
});
it('conserve la clé de confirmation des fonctions après une erreur réseau', async () => {
    current = functionPreview; request.mockImplementation((path: string) => path.endsWith('/preview') ? Promise.resolve(current) : Promise.reject(new Error('Réseau interrompu')));
    setup('functions'); fireEvent.click(screen.getByRole('checkbox')); await upload(); await check(); fireEvent.click(confirm()); await screen.findByRole('alert'); fireEvent.click(confirm());
    await waitFor(() => expect(request).toHaveBeenCalledTimes(3)); expect(request.mock.calls[2][1].idempotencyKey).toBe(request.mock.calls[1][1].idempotencyKey);
});

const linkPreview: CsvPreview = { hash: 'links-hash', rows: 3, issues: [], created: 1, updated: 1, unchanged: 1, functionLinks: [
    { row: 2, functionCode: 'RH', functionName: 'Gestion RH', targetKind: 'DESCRIPTION', targetCode: 'FONDS', targetName: 'Fonds du ministère', nature: 'DOCUMENTEE_PAR', dateStart: '2001', dateEnd: '2015', description: 'Commentaire révisé', action: 'UPDATE', existingId: 'link-1', changes: [
        { field: 'functionId', before: 'ADM · Administration', after: 'RH · Gestion RH' }, { field: 'targetKind', before: 'AUTHORITY', after: 'DESCRIPTION' },
        { field: 'targetId', before: 'PROD · Producteur précédent', after: 'FONDS · Fonds du ministère' }, { field: 'nature', before: 'EXERCEE_PAR', after: 'DOCUMENTEE_PAR' },
        { field: 'dateStart', before: '2000', after: '2001' }, { field: 'dateEnd', before: null, after: '2015' }, { field: 'description', before: 'Ancien commentaire', after: 'Commentaire révisé\nDeuxième ligne' },
    ] },
    { row: 3, functionCode: 'RH', functionName: 'Gestion RH', targetKind: 'AUTHORITY', targetCode: 'PROD', targetName: 'Producteur', nature: 'EXERCEE_PAR', dateStart: null, dateEnd: null, description: null, action: 'CREATE', existingId: null, changes: [] },
    { row: 4, functionCode: 'RH', functionName: 'Gestion RH', targetKind: 'FUNCTION', targetCode: 'FIN', targetName: 'Finances', nature: 'ASSOCIEE', dateStart: null, dateEnd: null, description: null, action: 'UNCHANGED', existingId: 'link-2', changes: [] },
] };
it('présente les liens et leurs différences lisibles puis confirme exactement le fichier contrôlé', async () => {
    current = linkPreview; const { onImported, onClose } = setup('function-links'); const toggle = screen.getByRole('checkbox', { name: 'Mettre à jour les liens existants' });
    expect((toggle as HTMLInputElement).checked).toBe(false); fireEvent.click(toggle); await upload(); await check();
    expect(request.mock.calls[0][1].body).toEqual({ institutionId: institution, kind: 'function-links', csv: 'CSV contenu', updateExisting: true });
    const list = screen.getByRole('list', { name: 'Liens lus' });
    for (const text of ['Fonction source', 'Avant : ADM · Administration', 'Après : RH · Gestion RH', 'Avant : Producteur (notice d’autorité)', 'Après : Fonds ou description', 'Avant : PROD · Producteur précédent', 'Après : FONDS · Fonds du ministère', 'Avant : Exercée par', 'Après : Documentée par', 'Avant : 2000', 'Après : 2001', 'Avant : Non renseigné', 'Après : 2015', 'Avant : Ancien commentaire', 'Inchangé — aucune modification']) expect(list.textContent).toContain(text);
    expect(screen.queryByText(/repassent en brouillon/)).toBeNull(); expect(screen.getByRole('status').textContent).toContain('3 lien(s) contrôlé(s)');
    expect((await axe.run(screen.getByRole('dialog'))).violations).toEqual([]);
    fireEvent.click(confirm()); await waitFor(() => expect(onImported).toHaveBeenCalledWith(result)); expect(onClose).toHaveBeenCalled();
    expect(request.mock.calls[1][1].body).toEqual({ institutionId: institution, kind: 'function-links', csv: 'CSV contenu', updateExisting: true, previewHash: 'links-hash' });
});
it('crée des liens sans activer la mise à jour et exige le contrôle avant confirmation', async () => {
    current = { ...linkPreview, rows: 1, created: 1, updated: 0, unchanged: 0, functionLinks: [linkPreview.functionLinks![1]] }; setup('function-links'); await upload();
    const create = screen.getByRole('button', { name: 'Confirmer l’import' }) as HTMLButtonElement; expect(create.disabled).toBe(true); await check(); expect(create.disabled).toBe(false);
    fireEvent.click(create); await waitFor(() => expect(request).toHaveBeenCalledTimes(2)); expect(request.mock.calls[1][1].body.updateExisting).toBe(false);
});
it('invalide l’aperçu des liens si le fichier ou le mode change et annule sans écriture', async () => {
    current = linkPreview; const { onClose, onImported } = setup('function-links'); const toggle = screen.getByRole('checkbox');
    fireEvent.click(toggle); await upload(); await check(); fireEvent.click(toggle); expect(screen.queryByRole('status')).toBeNull(); expect((screen.getByRole('button', { name: 'Confirmer l’import' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(toggle); await check(); await upload('Autres liens'); expect(confirm().disabled).toBe(true); fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onClose).toHaveBeenCalled(); expect(onImported).not.toHaveBeenCalled(); expect(request).toHaveBeenCalledTimes(2);
});
it('bloque les liens invalides et affiche aussi les différences après la centième ligne', async () => {
    current = { ...linkPreview, rows: 101, issues: [{ row: 102, message: 'Cible introuvable ou non autorisée.' }], functionLinks: [...Array.from({ length: 100 }, (_, i) => ({ ...linkPreview.functionLinks![2], row: i + 2 })), { ...linkPreview.functionLinks![0], row: 102 }] };
    setup('function-links'); fireEvent.click(screen.getByRole('checkbox')); await upload(); await check(); expect(confirm().disabled).toBe(true);
    expect(within(screen.getByRole('list', { name: 'Liens lus' })).getAllByRole('listitem')).toHaveLength(100); expect(screen.queryByText('Fonction source')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Afficher les 1 liens suivants' })); expect(screen.getByText('Fonction source')).toBeTruthy(); expect(screen.getByText(/Ligne 102 : Cible introuvable/)).toBeTruthy(); fireEvent.click(confirm()); expect(request).toHaveBeenCalledTimes(1);
});
it('réutilise la clé de confirmation des liens après une interruption réseau', async () => {
    current = linkPreview; request.mockImplementation((path: string) => path.endsWith('/preview') ? Promise.resolve(current) : Promise.reject(new Error('Réseau interrompu')));
    setup('function-links'); fireEvent.click(screen.getByRole('checkbox')); await upload(); await check(); fireEvent.click(confirm()); await screen.findByRole('alert'); fireEvent.click(confirm());
    await waitFor(() => expect(request).toHaveBeenCalledTimes(3)); expect(request.mock.calls[2][1].idempotencyKey).toBe(request.mock.calls[1][1].idempotencyKey);
});
