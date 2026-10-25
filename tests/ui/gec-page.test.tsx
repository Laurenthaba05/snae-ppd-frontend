import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { beforeEach, expect, it, vi } from 'vitest';

// La page des courriers de la GEC : le journal de ce qui est arrivé (filtres, pages, détail avec les pièces et la raison d'un échec) et les sources autorisées (déclarer, modifier).
// Le téléversement est fait par la GEC elle-même : la page n'en propose aucun.
const fixture = vi.hoisted(() => ({
    epoch: 1, me: { user: { id: 'u1' } } as unknown, allowed: new Set<string>(),
    scope: { institutionId: null as string | null, departmentId: null as string | null },
    gec: { sources: vi.fn(), courriers: vi.fn(), courrier: vi.fn(), createSource: vi.fn(), updateSource: vi.fn() },
    records: { documentTypes: vi.fn() },
    classification: { nodes: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: fixture.scope }) }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
vi.mock('../../src/ui/names', () => ({ EntityName: ({ id }: { id: string }) => <span>{'Institution ' + id}</span> }));
vi.mock('../../src/ui/navigation', () => ({ navigate: vi.fn() }));
import { navigate } from '../../src/ui/navigation';
import { GecPage } from '../../src/ui/Gec';

const INSTITUTION = '11111111-1111-4111-8111-111111111111';
const source = (over: Record<string, unknown> = {}) => ({ id: 's1', code: 'GEC-A', nom: 'GEC du ministère', institutionId: INSTITUTION, departementId: null, typeDocumentId: 't1', noeudClassementId: null,
    confidentialiteDefaut: 'INTERNE', actif: true, version: 3, updatedAt: '2026-10-22T10:00:00Z', ...over });
const row = (over: Record<string, unknown> = {}) => ({ id: 'c1', sourceCode: 'GEC-A', sourceNom: 'GEC du ministère', referenceGec: 'ref-1', numeroEnregistrement: 'ARR-2026-000123', sens: 'ARRIVEE',
    objet: 'Demande d’autorisation d’ouverture', dateCourrier: '2026-10-20', statut: 'ARCHIVE', etape: 'CLOS', codeErreur: null, documentId: 'd1', documentReference: 'GEC-GEC-A-ARR-2026-000123',
    accuseNumero: 'GEC-AR-2026-000042', accuseLe: '2026-10-22T17:03:11Z', pieces: 2, recuLe: '2026-10-22T17:03:00Z', ...over });
const detail = (over: Record<string, unknown> = {}) => ({ id: 'c1', source: 'GEC-A', referenceGec: 'ref-1', numeroEnregistrement: 'ARR-2026-000123', sens: 'ARRIVEE', objet: 'Demande d’autorisation d’ouverture',
    dateCourrier: '2026-10-20', dateCloture: '2026-10-22', expediteur: 'Société ABC', destinataires: ['Direction des archives'], metadonnees: { circuit: ['visa 1'] }, statut: 'ARCHIVE', etape: 'CLOS',
    codeErreur: null, accuse: 'GEC-AR-2026-000042', accuseLe: '2026-10-22T17:03:11Z', rejeu: false,
    document: { id: 'd1', reference: 'GEC-GEC-A-ARR-2026-000123', statutMetier: 'CLOS', statutArchivistique: 'ACTIF' }, dossier: { id: 'dos1', reference: 'AFF-2026-017' },
    version: { id: 'v1', numero: 1, scellee: true, empreinte: 'f'.repeat(64) },
    pieces: [
        { rang: 1, nomOrigine: 'Lettre n°12.pdf', nomDepose: 'Lettre n_12.pdf', role: 'PRINCIPAL', sha256: 'a'.repeat(64), taille: 183204, statut: 'VALIDE', fichierId: 'f1', codeErreur: null, tentatives: 1 },
        { rang: 2, nomOrigine: 'annexe.txt', nomDepose: 'annexe.txt', role: 'ANNEXE', sha256: 'b'.repeat(64), taille: 120, statut: 'VALIDE', fichierId: 'f2', codeErreur: null, tentatives: 1 }
    ], tentatives: 1, recuLe: '2026-10-22T17:03:00Z', ...over });

beforeEach(() => {
    fixture.epoch += 1; fixture.allowed = new Set(['GEC_READ', 'GEC_MANAGE']); fixture.scope = { institutionId: INSTITUTION, departmentId: null };
    vi.mocked(navigate).mockReset();
    const g = fixture.gec;
    g.sources.mockReset().mockResolvedValue([source(), source({ id: 's2', code: 'GEC-B', nom: 'Seconde GEC', actif: false })]);
    g.courriers.mockReset().mockResolvedValue({ items: [row(), row({ id: 'c2', numeroEnregistrement: 'DEP-2026-000007', sens: 'DEPART', objet: 'Réponse', statut: 'ECHEC', etape: 'DOCUMENT_CREE', codeErreur: 'SCAN_INFECTED', documentReference: null, accuseNumero: null, accuseLe: null })], page: 0, size: 25, hasMore: false });
    g.courrier.mockReset().mockResolvedValue(detail());
    g.createSource.mockReset().mockResolvedValue(source());
    g.updateSource.mockReset().mockResolvedValue(source());
    fixture.records.documentTypes.mockReset().mockResolvedValue([{ id: 't1', code: 'COURRIER', label: 'Courrier' }, { id: 't2', code: 'NOTE', label: 'Note de service' }]);
    fixture.classification.nodes.mockReset().mockResolvedValue([{ id: 'n1', parentId: null, institutionId: INSTITUTION, code: 'COUR', libelle: 'Correspondance', description: null }]);
});

it('sans institution dans le périmètre, la page le dit et ne lit rien', async () => {
    fixture.scope = { institutionId: null, departmentId: null };
    render(<GecPage />);
    expect(await screen.findByText(/Choisissez une institution dans le périmètre de travail/)).toBeTruthy();
    expect(fixture.gec.courriers).not.toHaveBeenCalled(); expect(fixture.gec.sources).not.toHaveBeenCalled();
});

it('sans habilitation de lecture, la page le dit et ne lit rien', async () => {
    fixture.allowed = new Set();
    render(<GecPage />);
    expect(await screen.findByText(/exige l’habilitation de lecture des courriers de la GEC/)).toBeTruthy();
    expect(fixture.gec.courriers).not.toHaveBeenCalled();
});

it('le journal montre chaque courrier : état, document archivé, accusé, et pourquoi un échec s’est arrêté', async () => {
    render(<GecPage />);
    expect(await screen.findByText('ARR-2026-000123')).toBeTruthy();
    expect(fixture.gec.courriers).toHaveBeenCalledWith(INSTITUTION, { source: '', statut: '', q: '' }, 0, 25, expect.anything());
    const ok = screen.getByText('ARR-2026-000123').closest('tr') as HTMLElement;
    expect(within(ok).getByText('Archivé')).toBeTruthy();
    expect(within(ok).getByText('GEC-GEC-A-ARR-2026-000123')).toBeTruthy();
    expect(within(ok).getByText('GEC-AR-2026-000042')).toBeTruthy();
    const bad = screen.getByText('DEP-2026-000007').closest('tr') as HTMLElement;
    expect(within(bad).getByText('En échec')).toBeTruthy();
    expect(within(bad).getByText(/L’antivirus a trouvé une menace/)).toBeTruthy();
    expect(within(bad).getByText('Document créé')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('1 archivé(s), 0 en cours, 1 en échec');
    // la page ne propose aucun téléversement : c'est la GEC qui téléverse
    expect(screen.queryByRole('button', { name: /téléverser|déposer/i })).toBeNull();
});

it('les filtres repartent de la première page, se combinent et s’effacent', async () => {
    render(<GecPage />);
    await screen.findByText('ARR-2026-000123');
    fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'GEC-A' } });
    await waitFor(() => expect(fixture.gec.courriers).toHaveBeenLastCalledWith(INSTITUTION, { source: 'GEC-A', statut: '', q: '' }, 0, 25, expect.anything()));
    fireEvent.change(screen.getByLabelText('État'), { target: { value: 'ECHEC' } });
    fireEvent.change(screen.getByLabelText('Recherche'), { target: { value: ' ARR-2026 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Chercher' }));
    await waitFor(() => expect(fixture.gec.courriers).toHaveBeenLastCalledWith(INSTITUTION, { source: 'GEC-A', statut: 'ECHEC', q: 'ARR-2026' }, 0, 25, expect.anything()));
    fireEvent.click(screen.getByRole('button', { name: 'Effacer les filtres' }));
    await waitFor(() => expect(fixture.gec.courriers).toHaveBeenLastCalledWith(INSTITUTION, { source: '', statut: '', q: '' }, 0, 25, expect.anything()));
});

it('les pages se parcourent une à une : la suite n’est proposée que s’il y en a une', async () => {
    fixture.gec.courriers.mockResolvedValueOnce({ items: [row()], page: 0, size: 25, hasMore: true }).mockResolvedValue({ items: [row({ id: 'c9', numeroEnregistrement: 'ARR-2026-000999' })], page: 1, size: 25, hasMore: false });
    render(<GecPage />);
    await screen.findByText('ARR-2026-000123');
    expect((screen.getByRole('button', { name: 'Précédente' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Suivante' }));
    expect(await screen.findByText('ARR-2026-000999')).toBeTruthy();
    expect(fixture.gec.courriers).toHaveBeenLastCalledWith(INSTITUTION, { source: '', statut: '', q: '' }, 1, 25, expect.anything());
    expect((screen.getByRole('button', { name: 'Suivante' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Précédente' }) as HTMLButtonElement).disabled).toBe(false);
});

it('un journal vide le dit, avec ou sans filtre, et une erreur du serveur se relit', async () => {
    fixture.gec.courriers.mockResolvedValueOnce({ items: [], page: 0, size: 25, hasMore: false });
    render(<GecPage />);
    expect(await screen.findByText('Aucune GEC n’a encore versé de courrier dans cette institution.')).toBeTruthy();
    fixture.gec.courriers.mockResolvedValueOnce({ items: [], page: 0, size: 25, hasMore: false });
    fireEvent.change(screen.getByLabelText('État'), { target: { value: 'RECU' } });
    expect(await screen.findByText('Aucun courrier ne correspond à ces filtres.')).toBeTruthy();
    fixture.gec.courriers.mockRejectedValueOnce(new Error('Journal indisponible')).mockResolvedValue({ items: [row()], page: 0, size: 25, hasMore: false });
    fireEvent.change(screen.getByLabelText('État'), { target: { value: 'ARCHIVE' } });
    expect(await screen.findByText('Journal indisponible')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer la lecture' }));
    expect(await screen.findByText('ARR-2026-000123')).toBeTruthy();
});

it('le détail d’un courrier donne l’accusé, le document, le scellé et chaque pièce avec son nom déposé ; il ouvre le document', async () => {
    render(<GecPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Voir le détail du courrier ARR-2026-000123' }));
    const dialog = await screen.findByRole('dialog');
    expect(fixture.gec.courrier).toHaveBeenCalledWith('c1', expect.anything());
    expect(await within(dialog).findByText('Société ABC')).toBeTruthy();
    expect(within(dialog).getByText('Direction des archives')).toBeTruthy();
    expect(within(dialog).getByText('AFF-2026-017')).toBeTruthy();
    expect(within(dialog).getByText(/Empreinte du scellé/)).toBeTruthy();
    expect(within(dialog).getByText('Lettre n°12.pdf')).toBeTruthy();
    expect(within(dialog).getByText('Déposée sous le nom : Lettre n_12.pdf')).toBeTruthy();
    expect(within(dialog).getByText('Pièce principale')).toBeTruthy();
    expect(within(dialog).getByText('179 Ko')).toBeTruthy();
    expect(within(dialog).getByText(/"visa 1"/)).toBeTruthy();
    // aucun identifiant technique n'est montré
    expect(dialog.textContent).not.toContain('f1'.repeat(8));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ouvrir le document' }));
    expect(navigate).toHaveBeenCalledWith('/app/documents/d1');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

it('le détail d’un courrier en échec dit où il s’est arrêté et ce qu’il faut faire', async () => {
    fixture.gec.courrier.mockResolvedValue(detail({ statut: 'ECHEC', etape: 'DOCUMENT_CREE', codeErreur: 'GEC_PIECE_REJETEE', accuse: null, accuseLe: null, version: null,
        pieces: [{ rang: 1, nomOrigine: 'a.pdf', nomDepose: 'a.pdf', role: 'PRINCIPAL', sha256: 'a'.repeat(64), taille: 10, statut: 'ECHEC', fichierId: null, codeErreur: 'SCAN_INFECTED', tentatives: 2 }] }));
    render(<GecPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Voir le détail du courrier DEP-2026-000007' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/nouvelle référence/)).toBeTruthy();
    expect(within(dialog).getByText('Refusée')).toBeTruthy();
    expect(within(dialog).getByText(/L’antivirus a trouvé une menace/)).toBeTruthy();
});

it('les sources se listent avec le nom du type de document, sans identifiant', async () => {
    render(<GecPage />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Sources' }));
    expect(await screen.findByText('GEC du ministère')).toBeTruthy();
    const first = screen.getByText('GEC-A').closest('tr') as HTMLElement;
    await waitFor(() => expect(within(first).getByText('Courrier')).toBeTruthy());
    expect(within(first).getByText('Interne')).toBeTruthy(); expect(within(first).getByText('Actif')).toBeTruthy();
    expect(within(screen.getByText('GEC-B').closest('tr') as HTMLElement).getByText('Inactif')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Déclarer une source' })).toBeTruthy();
});

it('une personne qui lit sans gérer ne peut ni déclarer ni modifier une source', async () => {
    fixture.allowed = new Set(['GEC_READ']);
    render(<GecPage />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Sources' }));
    await screen.findByText('GEC du ministère');
    expect(screen.queryByRole('button', { name: 'Déclarer une source' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Modifier la source/ })).toBeNull();
});

it('déclarer une source : le code se met en majuscules, le formulaire refuse l’incomplet, l’envoi porte le type et la confidentialité', async () => {
    render(<GecPage />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Sources' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Déclarer une source' }));
    const dialog = await screen.findByRole('dialog');
    const save = within(dialog).getByRole('button', { name: 'Enregistrer' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/^Code/), { target: { value: 'gec-min-1' } });
    fireEvent.change(within(dialog).getByLabelText(/^Nom/), { target: { value: ' GEC du cabinet ' } });
    expect(save.disabled).toBe(true);
    await waitFor(() => expect(within(dialog).getByRole('option', { name: 'Note de service' })).toBeTruthy());
    fireEvent.change(within(dialog).getByLabelText(/^Type de document/), { target: { value: 't2' } });
    await waitFor(() => expect(within(dialog).getByRole('option', { name: 'COUR · Correspondance' })).toBeTruthy());
    fireEvent.change(within(dialog).getByLabelText(/^Plan de classement/), { target: { value: 'n1' } });
    fireEvent.change(within(dialog).getByLabelText(/^Confidentialité par défaut/), { target: { value: 'CONFIDENTIEL' } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(fixture.gec.createSource).toHaveBeenCalledTimes(1));
    expect(fixture.gec.createSource).toHaveBeenCalledWith({ code: 'GEC-MIN-1', nom: 'GEC du cabinet', institutionId: INSTITUTION, departementId: null, typeDocumentId: 't2', noeudClassementId: 'n1',
        confidentialiteDefaut: 'CONFIDENTIEL', actif: true }, expect.any(String));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

it('un code invalide est dit et n’est pas envoyé ; un refus du serveur est dit dans la fenêtre, qui reste ouverte avec la saisie', async () => {
    fixture.gec.createSource.mockRejectedValueOnce(new Error('Ce code de source existe déjà.'));
    render(<GecPage />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Sources' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Déclarer une source' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/^Code/), { target: { value: '-mauvais' } });
    fireEvent.change(within(dialog).getByLabelText(/^Nom/), { target: { value: 'GEC' } });
    await waitFor(() => expect(within(dialog).getByRole('option', { name: 'Courrier' })).toBeTruthy());
    fireEvent.change(within(dialog).getByLabelText(/^Type de document/), { target: { value: 't1' } });
    expect(within(dialog).getByText(/Le code compte de 2 à 30 caractères/)).toBeTruthy();
    expect((within(dialog).getByRole('button', { name: 'Enregistrer' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/^Code/), { target: { value: 'GEC-A' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(await within(dialog).findByText('Ce code de source existe déjà.')).toBeTruthy();
    expect((within(dialog).getByLabelText(/^Nom/) as HTMLInputElement).value).toBe('GEC');
});

it('modifier une source garde son code, envoie la version lue et peut la désactiver', async () => {
    render(<GecPage />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Sources' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier la source GEC du ministère' }));
    const dialog = await screen.findByRole('dialog');
    expect((within(dialog).getByLabelText(/^Code/) as HTMLInputElement).disabled).toBe(true);
    expect((within(dialog).getByLabelText(/^Code/) as HTMLInputElement).value).toBe('GEC-A');
    fireEvent.click(within(dialog).getByLabelText('Cette source accepte de nouveaux courriers'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(fixture.gec.updateSource).toHaveBeenCalledTimes(1));
    expect(fixture.gec.updateSource).toHaveBeenCalledWith('s1', { nom: 'GEC du ministère', institutionId: INSTITUTION, departementId: null, typeDocumentId: 't1', noeudClassementId: null,
        confidentialiteDefaut: 'INTERNE', actif: false, version: 3 }, expect.any(String));
});

it('le journal et le détail n’ont aucune violation d’accessibilité détectable', async () => {
    const { container } = render(<GecPage />);
    await screen.findByText('ARR-2026-000123');
    const page = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(page.violations.map(v => v.id + ': ' + v.nodes.map(n => n.target.join(' ')).join(' | '))).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Voir le détail du courrier ARR-2026-000123' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Société ABC');
    const modal = await axe.run(dialog, { rules: { 'color-contrast': { enabled: false } } });
    expect(modal.violations.map(v => v.id)).toEqual([]);
});
