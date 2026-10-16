import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { AssetGap, HeritageAsset, HeritageAssetPage, HeritageAssetSummary, HeritageDashboard, HeritageJournalEntry, HeritageReference } from '../../src/core/types';
const INST = '00000000-0000-4000-8000-0000000000a1';
const fixture = vi.hoisted(() => ({
    epoch: 1, me: null as unknown, allowed: new Set<string>(['HERITAGE_READ', 'HERITAGE_ASSET_MANAGE']),
    heritage: { assets: vi.fn(), assetsDashboard: vi.fn(), asset: vi.fn(), assetJournal: vi.fn(), references: vi.fn(), command: vi.fn(), places: vi.fn(), historicalEvents: vi.fn(), subjects: vi.fn() },
    physicalArchives: { searchArchives: vi.fn() }, records: { documents: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: { institutionId: '00000000-0000-4000-8000-0000000000a1', departmentId: null } }) }));
import { HeritageAssetsPanel } from '../../src/ui/HeritageAssets';

const ID = '00000000-0000-4000-8000-0000000000';
const categories: HeritageReference[] = [
    { domaine: 'CATEGORIE', code: 'REGISTRE', libelle: 'Registre', description: null, ordre: 20, actif: true },
    { domaine: 'CATEGORIE', code: 'CARTE_PLAN', libelle: 'Carte ou plan', description: null, ordre: 40, actif: true }];
const criteres: HeritageReference[] = [
    { domaine: 'CRITERE_VALEUR', code: 'HISTORIQUE', libelle: 'Intérêt historique', description: null, ordre: 10, actif: true },
    { domaine: 'CRITERE_VALEUR', code: 'SOCIAL', libelle: 'Intérêt social', description: null, ordre: 30, actif: true }];
const summary = (n: number, extra: Partial<HeritageAssetSummary> = {}): HeritageAssetSummary => ({ id: ID + '0' + n, identifiant: 'PAT-00000' + n, institutionId: INST, intitule: 'Registre d’état civil ' + n, categorie: 'REGISTRE',
    numeroInventaire: 'INV-' + n, natureOriginale: 'PHYSIQUE', precisionDate: 'DECENNIE', dateDebut: '1953-01-01', dateFin: null, dateTexte: null, statutPriseEnCharge: 'ACQUISITION_VALIDEE',
    statutDescription: 'EN_REDACTION', etatMateriel: 'FRAGILE', originaux: 0, representations: 0, lacunes: 3, lacunesBloquantes: 2, updatedAt: '2026-10-04T10:00:00Z', ...extra });
const page = (items: HeritageAssetSummary[], extra: Partial<HeritageAssetPage> = {}): HeritageAssetPage => ({ items, page: 0, size: 20, total: items.length, hasMore: false, ...extra });
const dashboard = (extra: Partial<HeritageDashboard> = {}): HeritageDashboard => ({ total: 4, parStatutDescription: { MINIMALE: 1, EN_REDACTION: 1, A_RELIRE: 1, VALIDEE: 1 }, parStatutPriseEnCharge: {}, parEtatMateriel: {},
    sansOriginal: 3, provenanceAEtablir: 2, situationJuridiqueAClarifier: 1, valeurNonEvaluee: 2, introuvables: 0, ...extra });
const asset = (extra: Partial<HeritageAsset> = {}): HeritageAsset => ({ id: ID + '01', identifiant: 'PAT-000001', institutionId: INST, departementId: null, origineEnregistrement: 'CREATION',
    champs: { intitule: 'Registre d’état civil 1', categorie: 'REGISTRE', natureOriginale: 'PHYSIQUE', numeroInventaire: 'INV-1', anciennesReferences: [], resume: 'Registre des naissances.', langues: ['français'], ecritures: [], support: null, materiaux: null,
        dimensions: null, quantite: null, uniteQuantite: null, paginationDuree: null, precisionDate: 'DECENNIE', dateDebut: '1953-01-01', dateFin: null, dateTexte: null, dateSource: null, attributionIncertaine: false,
        attributionSource: null, bibliographie: null, historiqueProvenance: null, provenanceStatut: 'A_ETABLIR', proprietaireStatut: 'A_ETABLIR', situationJuridique: 'A_CLARIFIER', situationJuridiqueNote: null,
        valeurCriteres: [], valeurAppreciation: null, valeurSources: null },
    statutPriseEnCharge: 'ACQUISITION_VALIDEE', statutDescription: 'EN_REDACTION', etatMateriel: 'NON_EVALUE', disponibilite: 'NON_LOCALISE', numerisation: 'NON_PROGRAMMEE', diffusion: 'NON_EXAMINEE',
    descriptionSoumiseParId: null, descriptionValideeParId: null, descriptionValideeLe: null, valeurEvaluateurId: null,
    lacunes: [{ code: 'PROVENANCE_TO_ESTABLISH', message: 'La provenance est à établir : renseignez-la, ou déclarez-la inconnue.', bloque: 'VALIDATION' } as AssetGap,
        { code: 'NO_ORIGINAL_LINKED', message: 'Aucun original physique n’est relié à ce bien : il n’est pas localisé.', bloque: null } as AssetGap],
    passages: [{ vers: 'A_RELIRE', permissions: ['HERITAGE_ASSET_MANAGE'], peutAgir: true, motifRequis: false, renvoi: false, bloquants: [] }],
    originaux: [], ressources: [], lieux: [], evenements: [], sujets: [], version: 3, createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-04T10:00:00Z', ...extra });

beforeEach(() => {
    fixture.allowed = new Set(['HERITAGE_READ', 'HERITAGE_ASSET_MANAGE']);
    for (const fn of Object.values(fixture.heritage)) fn.mockReset();
    fixture.physicalArchives.searchArchives.mockReset().mockResolvedValue({ items: [], page: 0, size: 20, hasMore: false });
    fixture.records.documents.mockReset().mockResolvedValue({ items: [], page: 0, size: 100, hasMore: false });
    fixture.heritage.assets.mockResolvedValue(page([]));
    fixture.heritage.assetsDashboard.mockResolvedValue(dashboard());
    fixture.heritage.references.mockImplementation((domaine: string) => Promise.resolve(domaine === 'CATEGORIE' ? categories : criteres));
    fixture.heritage.assetJournal.mockResolvedValue([]);
    fixture.heritage.command.mockResolvedValue(asset());
    fixture.heritage.asset.mockResolvedValue(asset());
    fixture.heritage.places.mockResolvedValue([]); fixture.heritage.historicalEvents.mockResolvedValue([]); fixture.heritage.subjects.mockResolvedValue([]);
});

it('la liste montre les biens avec leurs états, la date sans fausse précision, les manques et la vue d’ensemble', async () => {
    fixture.heritage.assets.mockResolvedValue(page([summary(1), summary(2, { statutDescription: 'VALIDEE', precisionDate: 'ESTIMEE', dateDebut: '1930-01-01', originaux: 1, lacunesBloquantes: 0, etatMateriel: 'STABLE' })]));
    render(<HeritageAssetsPanel />);
    expect(await screen.findByText('PAT-000001')).toBeTruthy();
    expect(screen.getByText('années 1950')).toBeTruthy();
    expect(screen.getByText('vers 1930')).toBeTruthy();
    expect(screen.getAllByText('En rédaction').length).toBeGreaterThan(0);
    expect(screen.getByText('Non localisé')).toBeTruthy();
    expect(screen.getByText('1 relié')).toBeTruthy();
    expect(screen.getByTitle('Manques qui bloquent la relecture ou la validation').textContent).toBe('2');
    const overview = await screen.findByRole('list', { name: 'Vue d’ensemble' });
    expect(within(overview).getByText('4 biens')).toBeTruthy();
    expect(within(overview).getByText('3 sans original localisé')).toBeTruthy();
    expect(within(overview).getByText('2 provenance à établir')).toBeTruthy();
    expect(within(overview).getByText('1 situation juridique à clarifier')).toBeTruthy();
});

it('un clic sur « à relire » filtre la liste, et un état vide invite à créer le premier bien', async () => {
    render(<HeritageAssetsPanel />);
    expect(await screen.findByText('Aucun bien patrimonial')).toBeTruthy();
    expect(screen.getByText(/Créez le premier bien/)).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: '1 à relire' }));
    await waitFor(() => expect(fixture.heritage.assets).toHaveBeenLastCalledWith(expect.objectContaining({ statutDescription: 'A_RELIRE', page: 0 }), expect.anything()));
});

it('sans la permission de gestion, aucun bouton de création', async () => {
    fixture.allowed = new Set(['HERITAGE_READ']);
    render(<HeritageAssetsPanel />);
    await screen.findByText('Aucun bien patrimonial');
    expect(screen.queryByRole('button', { name: 'Nouveau bien' })).toBeNull();
    expect(screen.getByText('Aucun bien dans votre périmètre.')).toBeTruthy();
});

it('la création envoie une identification minimale avec une clé stable, et ouvre la fiche', async () => {
    fixture.heritage.asset.mockResolvedValue(asset());
    render(<HeritageAssetsPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Nouveau bien' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Intitulé/), { target: { value: '  Registre des naissances  ' } });
    fireEvent.change(within(dialog).getByLabelText(/Catégorie/), { target: { value: 'REGISTRE' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer le bien' }));
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    const [path, body, key, method] = fixture.heritage.command.mock.calls[0]!;
    expect(path).toBe('/assets');
    expect(body).toEqual({ institutionId: INST, departementId: null, origine: 'CREATION', champs: { intitule: 'Registre des naissances', categorie: 'REGISTRE', natureOriginale: 'PHYSIQUE' } });
    expect(typeof key).toBe('string');
    expect(method).toBe('POST');
    expect(await screen.findByText(/PAT-000001/)).toBeTruthy();
});

it('une reprise d’inventaire sans ancienne référence est refusée avant l’envoi, une référence mal formée aussi', async () => {
    render(<HeritageAssetsPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Nouveau bien' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Intitulé/), { target: { value: 'Carte ancienne' } });
    fireEvent.change(within(dialog).getByLabelText(/Catégorie/), { target: { value: 'CARTE_PLAN' } });
    fireEvent.change(within(dialog).getByLabelText(/Origine de l’enregistrement/), { target: { value: 'REPRISE_INVENTAIRE' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer le bien' }));
    expect(await within(dialog).findByText(/conserve les anciennes références/)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText(/Anciennes références/), { target: { value: 'sans séparateur' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer le bien' }));
    expect(await within(dialog).findByText(/« système : valeur »/)).toBeTruthy();
    expect(fixture.heritage.command).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText(/Anciennes références/), { target: { value: 'Inventaire 1978 : A-12' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer le bien' }));
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    expect(fixture.heritage.command.mock.calls[0]![1].champs.anciennesReferences).toEqual([{ systeme: 'Inventaire 1978', valeur: 'A-12' }]);
});

async function openAsset(view: HeritageAsset) {
    fixture.heritage.assets.mockResolvedValue(page([summary(1)]));
    fixture.heritage.asset.mockResolvedValue(view);
    render(<HeritageAssetsPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'PAT-000001' }));
    return await screen.findByRole('dialog');
}

it('la fiche montre les états indépendants, dont trois calculés, les manques et le passage possible', async () => {
    const dialog = await openAsset(asset());
    const strip = await waitFor(() => { const el = dialog.querySelector('.asset-states'); expect(el).toBeTruthy(); return within(el as HTMLElement); });
    for (const term of ['Prise en charge', 'Description', 'État matériel', 'Disponibilité', 'Numérisation', 'Diffusion']) expect(strip.getByText(term)).toBeTruthy();
    expect(strip.getByText('Acquisition validée')).toBeTruthy();
    expect(strip.getByText('Non localisé')).toBeTruthy();
    expect(strip.getByText('Non numérisé')).toBeTruthy();
    expect(strip.getByText('Non examinée')).toBeTruthy();
    expect(strip.getAllByText('calculée').length).toBe(3);
    expect(within(dialog).getByText(/La provenance est à établir/)).toBeTruthy();
    expect(within(dialog).getByText(/Aucun original physique n’est relié/)).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Soumettre à la relecture' })).toBeTruthy();
});

it('modifier envoie seulement les champs changés avec la version, sans motif avant la validation', async () => {
    const dialog = await openAsset(asset());
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Modifier' }));
    fireEvent.change(within(dialog).getByLabelText('Support'), { target: { value: 'Papier' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    const [path, body, , method] = fixture.heritage.command.mock.calls[0]!;
    expect(path).toBe('/assets/' + ID + '01');
    expect(method).toBe('PUT');
    expect(body).toEqual({ expectedVersion: 3, changes: { support: 'Papier' } });
});

it('rien à enregistrer quand rien n’a changé', async () => {
    const dialog = await openAsset(asset());
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Modifier' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(await within(dialog).findByText('Aucune modification à enregistrer.')).toBeTruthy();
    expect(fixture.heritage.command).not.toHaveBeenCalled();
});

it('une description validée exige un motif pour toute correction, et l’envoie avec la source', async () => {
    const dialog = await openAsset(asset({ statutDescription: 'VALIDEE', passages: [] }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Modifier' }));
    fireEvent.change(within(dialog).getByLabelText('Support'), { target: { value: 'Parchemin' } });
    expect(within(dialog).getByText(/chaque correction conserve l’ancienne valeur/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer la correction' }));
    expect(await within(dialog).findByText(/exige un motif écrit/)).toBeTruthy();
    expect(fixture.heritage.command).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText(/Motif de la correction/), { target: { value: 'Support relevé sur la couverture' } });
    fireEvent.change(within(dialog).getByLabelText(/Source.*justifie la correction/), { target: { value: 'Constat du 12 mars 2026' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer la correction' }));
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    expect(fixture.heritage.command.mock.calls[0]![1]).toEqual({ expectedVersion: 3, changes: { support: 'Parchemin' }, motif: 'Support relevé sur la couverture', source: 'Constat du 12 mars 2026' });
});

it('une description en relecture prévient que la modifier la renvoie en rédaction', async () => {
    const dialog = await openAsset(asset({ statutDescription: 'A_RELIRE', passages: [] }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Modifier' }));
    expect(within(dialog).getByText(/la modifier la renvoie en rédaction/)).toBeTruthy();
});

it('un passage bloqué est désactivé avec la raison, un renvoi demande un motif d’au moins 10 caractères', async () => {
    const blocked = asset({ statutDescription: 'A_RELIRE', passages: [
        { vers: 'VALIDEE', permissions: ['HERITAGE_ASSET_VALIDATE'], peutAgir: true, motifRequis: false, renvoi: false, bloquants: [{ code: 'FOUR_EYES', message: 'La validation scientifique doit être faite par une personne qui n’a pas soumis la description à la relecture.', bloque: null }] },
        { vers: 'EN_REDACTION', permissions: ['HERITAGE_ASSET_MANAGE', 'HERITAGE_ASSET_VALIDATE'], peutAgir: true, motifRequis: true, renvoi: true, bloquants: [] }] });
    const dialog = await openAsset(blocked);
    const validate = await within(dialog).findByRole('button', { name: 'Valider scientifiquement' }) as HTMLButtonElement;
    expect(validate.disabled).toBe(true);
    expect(within(dialog).getByText(/n’a pas soumis la description/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Renvoyer en rédaction' }));
    const motifDialog = (await screen.findAllByRole('dialog')).at(-1)!;
    const confirm = within(motifDialog).getByRole('button', { name: 'Confirmer' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(motifDialog).getByRole('textbox'), { target: { value: 'Provenance à compléter avant validation' } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    expect(fixture.heritage.command.mock.calls[0]![0]).toBe('/assets/' + ID + '01/transitions');
    expect(fixture.heritage.command.mock.calls[0]![1]).toEqual({ vers: 'EN_REDACTION', expectedVersion: 3, motif: 'Provenance à compléter avant validation' });
});

it('sans l’habilitation, le passage est désactivé et le titre dit laquelle manque', async () => {
    const view = asset({ passages: [{ vers: 'A_RELIRE', permissions: ['HERITAGE_ASSET_MANAGE'], peutAgir: false, motifRequis: false, renvoi: false, bloquants: [] }] });
    fixture.allowed = new Set(['HERITAGE_READ']);
    const dialog = await openAsset(view);
    const button = await within(dialog).findByRole('button', { name: 'Soumettre à la relecture' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toContain('HERITAGE_ASSET_MANAGE');
    expect(within(dialog).queryByRole('button', { name: 'Modifier' })).toBeNull();
});

it('l’historique montre les corrections avec ancienne et nouvelle valeur, motif et source', async () => {
    const journal: HeritageJournalEntry[] = [
        { id: 'j1', genre: 'CREATION', champ: null, ancienneValeur: null, nouvelleValeur: { intitule: 'Registre' }, motif: null, source: null, automatique: false, auteurId: null, createdAt: '2026-10-01T10:00:00Z' },
        { id: 'j2', genre: 'CORRECTION', champ: 'precisionDate', ancienneValeur: 'DECENNIE', nouvelleValeur: 'ANNEE', motif: 'Date lue sur la couverture', source: 'Constat du 12 mars 2026', automatique: false, auteurId: null, createdAt: '2026-10-03T10:00:00Z' },
        { id: 'j3', genre: 'TRANSITION', champ: 'statutDescription', ancienneValeur: 'EN_REDACTION', nouvelleValeur: 'A_RELIRE', motif: null, source: null, automatique: false, auteurId: null, createdAt: '2026-10-02T10:00:00Z' },
        // Le passage de prise en charge vient d'une entrée patrimoniale : il se lit avec ses propres libellés, pas ceux de la description.
        { id: 'j4', genre: 'TRANSITION', champ: 'statutPriseEnCharge', ancienneValeur: 'A_EXAMINER', nouvelleValeur: 'ACQUISITION_VALIDEE', motif: 'Entrée ENT-2026-000001 : acceptee', source: null, automatique: true, auteurId: null, createdAt: '2026-10-04T10:00:00Z' }];
    fixture.heritage.assetJournal.mockResolvedValue(journal);
    const dialog = await openAsset(asset());
    fireEvent.click(await within(dialog).findByRole('tab', { name: 'Historique' }));
    await waitFor(() => expect(document.querySelectorAll('.asset-journal li')).toHaveLength(4));
    const items = [...document.querySelectorAll('.asset-journal li')];
    // Du plus récent au plus ancien.
    expect(items[0]!.textContent).toContain('Prise en charge');
    expect(items[0]!.textContent).toContain('À examiner → Acquisition validée');
    expect(items[0]!.textContent).toContain('automatique');
    items.shift();
    expect(items[0]!.textContent).toContain('En rédaction → À relire');
    expect(items[1]!.textContent).toContain('Correction');
    expect(items[1]!.textContent).toContain('Précision de la date');
    expect(items[1]!.textContent).toContain('DECENNIE → ANNEE');
    expect(items[1]!.textContent).toContain('Motif : Date lue sur la couverture');
    expect(items[1]!.textContent).toContain('Source : Constat du 12 mars 2026');
    expect(items[2]!.textContent).toContain('Création');
});

it('les liens : originaux et ressources se retirent, une archive se relie, et un document garde son rôle', async () => {
    const view = asset({ originaux: [{ archivePhysiqueId: ID + 'b1', cote: 'COTE-1', libelle: 'Volume 1', support: 'Papier', etatPhysique: null }],
        ressources: [{ documentId: ID + 'd1', role: 'REPRESENTATION', titre: 'Numérisation du registre', identifiantMetier: 'DOC-1', libelle: null, confidentiel: false }] });
    fixture.physicalArchives.searchArchives.mockResolvedValue({ items: [{ id: ID + 'b2', cote: 'COTE-2', support: 'Parchemin', etatPhysique: null, documentId: null, uniteStockageId: ID + 'c1', description: null, dateExtremeDebut: null, dateExtremeFin: null, quantite: null, uniteQuantite: null, versionLock: 0 }], page: 0, size: 20, hasMore: false });
    fixture.records.documents.mockResolvedValue({ items: [{ id: ID + 'd2', title: 'Contrat de dépôt', reference: 'DOC-2' }], page: 0, size: 100, hasMore: false });
    const dialog = await openAsset(view);
    fireEvent.click(await within(dialog).findByRole('tab', { name: 'Ressources et liens' }));
    expect(await within(dialog).findByText('COTE-1')).toBeTruthy();
    expect(within(dialog).getByText('Numérisation du registre')).toBeTruthy();
    expect(within(dialog).getByText('Représentation numérique')).toBeTruthy();
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Retirer' })[0]!);
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledWith('/assets/' + ID + '01/originals/' + ID + 'b1/unlink', {}, expect.any(String), 'POST'));

    fireEvent.click(await within(dialog).findByRole('button', { name: 'Relier un original' }));
    const picker = (await screen.findAllByRole('dialog')).at(-1)!;
    fireEvent.click(await within(picker).findByRole('button', { name: 'Choisir' }));
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledWith('/assets/' + ID + '01/originals/' + ID + 'b2', {}, expect.any(String), 'POST'));
});

it('relier un original : la recherche est faite par le serveur, une fois la saisie terminée, et dit s’il y a d’autres résultats', async () => {
    const archive = (cote: string) => ({ id: ID + cote, cote, support: null, etatPhysique: null, documentId: null, uniteStockageId: ID + 'c1', description: 'Registre de ' + cote, dateExtremeDebut: null, dateExtremeFin: null, quantite: null, uniteQuantite: null, versionLock: 0 });
    fixture.physicalArchives.searchArchives.mockImplementation(async (text: string) => ({ items: text ? [archive('FOND-77')] : [archive('FOND-01'), archive('FOND-02')], page: 0, size: 20, hasMore: text === '' }));
    const dialog = await openAsset(asset());
    fireEvent.click(await within(dialog).findByRole('tab', { name: 'Ressources et liens' }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Relier un original' }));
    const picker = (await screen.findAllByRole('dialog')).at(-1)!;
    expect(await within(picker).findByText('FOND-01')).toBeTruthy();
    expect(within(picker).getByText(/D'autres résultats existent/)).toBeTruthy();
    const box = within(picker).getByLabelText('Rechercher');
    for (const text of ['f', 'fo', 'fond-7', 'fond-77']) fireEvent.change(box, { target: { value: text } });
    expect(await within(picker).findByText('FOND-77')).toBeTruthy();
    expect(within(picker).queryByText('FOND-01')).toBeNull();
    const asked = fixture.physicalArchives.searchArchives.mock.calls.map(c => c[0]);
    expect(asked).toEqual(['', 'fond-77']);
});

it('relier un document envoie son rôle, et une erreur du serveur reste affichée', async () => {
    fixture.records.documents.mockResolvedValue({ items: [{ id: ID + 'd2', title: 'Contrat de dépôt', reference: 'DOC-2' }], page: 0, size: 100, hasMore: false });
    const dialog = await openAsset(asset());
    fireEvent.click(await within(dialog).findByRole('tab', { name: 'Ressources et liens' }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Relier un document' }));
    const picker = (await screen.findAllByRole('dialog')).at(-1)!;
    fireEvent.change(await within(picker).findByLabelText('Rôle du document'), { target: { value: 'JUSTIFICATIF' } });
    fixture.heritage.command.mockRejectedValueOnce(Object.assign(new Error('Ce document est déjà la représentation d’un autre bien.'), { status: 409, code: 'HERITAGE_REPRESENTATION_ALREADY_LINKED' }));
    fireEvent.click(await within(picker).findByRole('button', { name: 'Choisir' }));
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledWith('/assets/' + ID + '01/resources', { documentId: ID + 'd2', role: 'JUSTIFICATIF' }, expect.any(String), 'POST'));
    expect(await within(picker).findByText(/déjà la représentation d’un autre bien/)).toBeTruthy();
});

it('un original introuvable se voit partout : puce du tableau de bord, état « Introuvable » en alerte et onglet Localisation', async () => {
    fixture.heritage.assetsDashboard.mockResolvedValue(dashboard({ introuvables: 2 }));
    const dialog = await openAsset(asset({ disponibilite: 'INTROUVABLE' }));
    const overview = await screen.findByRole('list', { name: 'Vue d’ensemble' });
    expect(within(overview).getByText('2 introuvables')).toBeTruthy();
    const strip = await waitFor(() => { const el = dialog.querySelector('.asset-states'); expect(el).toBeTruthy(); return el as HTMLElement; });
    const state = within(strip).getByText('Introuvable').closest('div')!;
    expect(state.className).toContain('bad');
    expect(within(dialog).getByRole('tab', { name: 'Localisation' })).toBeTruthy();
});
