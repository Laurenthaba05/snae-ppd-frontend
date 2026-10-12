import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { AssetGap, HeritageAsset, HeritageAssetPage, HeritageDashboard, HeritageReference } from '../../src/core/types';
import type { Keyword } from '../../src/core/vocabulary';

const INST = '00000000-0000-4000-8000-0000000000a1';
const ASSET = '00000000-0000-4000-8000-000000000001';
const TERM = '00000000-0000-4000-8000-0000000000c1';
const fixture = vi.hoisted(() => ({
    epoch: 1, me: null as unknown, allowed: new Set<string>(['HERITAGE_READ', 'HERITAGE_ASSET_MANAGE']),
    heritage: { assets: vi.fn(), assetsDashboard: vi.fn(), asset: vi.fn(), assetJournal: vi.fn(), references: vi.fn(), command: vi.fn(), places: vi.fn(), historicalEvents: vi.fn(), subjects: vi.fn() },
    vocabulary: { keywords: vi.fn(), list: vi.fn(), terms: vi.fn(), addKeywords: vi.fn(), removeKeyword: vi.fn() },
    physicalArchives: { archives: vi.fn() }, records: { documents: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: { institutionId: INST, departmentId: null } }) }));
import { HeritageAssetsPanel } from '../../src/ui/HeritageAssets';

const categories: HeritageReference[] = [{ domaine: 'CATEGORIE', code: 'REGISTRE', libelle: 'Registre', description: null, ordre: 20, actif: true }];
const criteres: HeritageReference[] = [{ domaine: 'CRITERE_VALEUR', code: 'HISTORIQUE', libelle: 'Intérêt historique', description: null, ordre: 10, actif: true }];
const dashboard: HeritageDashboard = { total: 1, parStatutDescription: { EN_REDACTION: 1 }, parStatutPriseEnCharge: {}, parEtatMateriel: {}, sansOriginal: 0, provenanceAEtablir: 0,
    situationJuridiqueAClarifier: 0, valeurNonEvaluee: 0, introuvables: 0 } as unknown as HeritageDashboard;
const asset = (extra: Partial<HeritageAsset> = {}): HeritageAsset => ({
    id: ASSET, identifiant: 'PAT-000001', institutionId: INST, departementId: null, origineEnregistrement: 'CREATION',
    champs: { intitule: 'Registre des naissances', categorie: 'REGISTRE', natureOriginale: 'PHYSIQUE', numeroInventaire: null, anciennesReferences: [], resume: 'Un registre.', langues: [], ecritures: [],
        support: null, materiaux: null, dimensions: null, quantite: null, uniteQuantite: null, paginationDuree: null, precisionDate: 'DECENNIE', dateDebut: '1953-01-01', dateFin: null,
        dateTexte: null, dateSource: null, attributionIncertaine: false, attributionSource: null, bibliographie: null, historiqueProvenance: null, provenanceStatut: 'CONNUE',
        proprietaireStatut: 'ETAT', situationJuridique: 'CLAIRE', situationJuridiqueNote: null, valeurCriteres: [], valeurAppreciation: null, valeurSources: null,
        technique: 'Encre ferro-gallique', periodeCulture: null, inscriptions: null, titresAlternatifs: [{ type: 'Titre ancien', valeur: 'Registre des déclarations' }],
        valeurAssurance: '2500000', valeurAssuranceDevise: 'GNF', valeurAssuranceDate: '2026-09-30', droitsImage: 'A_CLARIFIER', droitsImageNote: null },
    statutPriseEnCharge: 'ACQUISITION_VALIDEE', statutDescription: 'EN_REDACTION', etatMateriel: 'NON_EVALUE', disponibilite: 'NON_LOCALISE', numerisation: 'NON_PROGRAMMEE', diffusion: 'NON_EXAMINEE',
    descriptionSoumiseParId: null, descriptionValideeParId: null, descriptionValideeLe: null, valeurEvaluateurId: null,
    lacunes: [{ code: 'IMAGE_RIGHTS_TO_CLARIFY', message: 'Les droits d’image et de reproduction sont à clarifier avant toute diffusion d’une reproduction.', bloque: null } as AssetGap],
    passages: [], originaux: [], ressources: [], lieux: [], evenements: [], sujets: [], version: 3, createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-04T10:00:00Z', ...extra });
const keyword = (over: Partial<Keyword> = {}): Keyword => ({ termId: TERM, label: 'Parchemin', vocabularyId: 'v1', vocabularyName: 'Matériaux', vocabularyCode: 'MAT', status: 'ACTIF',
    replacedByLabel: null, addedAt: '2026-10-05T10:00:00Z', ...over });

beforeEach(() => {
    fixture.allowed = new Set(['HERITAGE_READ', 'HERITAGE_ASSET_MANAGE']);
    for (const fn of [...Object.values(fixture.heritage), ...Object.values(fixture.vocabulary)]) fn.mockReset();
    fixture.physicalArchives.archives.mockReset().mockResolvedValue([]);
    fixture.records.documents.mockReset().mockResolvedValue({ items: [], page: 0, size: 100, hasMore: false });
    fixture.heritage.assets.mockResolvedValue({ items: [], page: 0, size: 20, total: 0, hasMore: false } as HeritageAssetPage);
    fixture.heritage.assetsDashboard.mockResolvedValue(dashboard);
    fixture.heritage.references.mockImplementation((domaine: string) => Promise.resolve(domaine === 'CATEGORIE' ? categories : criteres));
    fixture.heritage.assetJournal.mockResolvedValue([]);
    fixture.heritage.command.mockResolvedValue(asset());
    fixture.heritage.asset.mockResolvedValue(asset());
    fixture.heritage.places.mockResolvedValue([]); fixture.heritage.historicalEvents.mockResolvedValue([]); fixture.heritage.subjects.mockResolvedValue([]);
    fixture.vocabulary.keywords.mockResolvedValue([keyword()]);
    fixture.vocabulary.list.mockResolvedValue([]);
    fixture.vocabulary.terms.mockResolvedValue({ items: [], page: 0, size: 50, total: 0, hasMore: false });
});

it('un lien « bien » ouvre directement la fiche, et un identifiant mal formé est ignoré', async () => {
    const first = render(<HeritageAssetsPanel initialAssetId={ASSET} />);
    expect(await screen.findByRole('dialog')).toBeTruthy();
    await waitFor(() => expect(fixture.heritage.asset).toHaveBeenCalledWith(ASSET, expect.anything()));
    first.unmount();
    fixture.heritage.asset.mockClear();
    render(<HeritageAssetsPanel initialAssetId="pas-un-identifiant" />);
    await screen.findByText('Biens patrimoniaux');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fixture.heritage.asset).not.toHaveBeenCalled();
});

it('la fiche montre les compléments, les droits d’image à clarifier en information, et les mots-clés', async () => {
    render(<HeritageAssetsPanel initialAssetId={ASSET} />);
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Encre ferro-gallique')).toBeTruthy();
    expect(within(dialog).getByText('Titre ancien : Registre des déclarations')).toBeTruthy();
    expect(within(dialog).getByText(/Les droits d’image et de reproduction sont à clarifier/)).toBeTruthy();
    const keywords = await within(dialog).findByRole('region', { name: 'Mots-clés' });
    expect(within(keywords).getByText('Parchemin')).toBeTruthy();
    expect(within(keywords).getByText('Matériaux')).toBeTruthy();
    expect(within(keywords).getByRole('button', { name: 'Ajouter des mots-clés' })).toBeTruthy();
    expect(within(keywords).getByRole('button', { name: 'Retirer le mot-clé Parchemin' })).toBeTruthy();
});

it('une description à relire ou validée ne propose plus de poser ni de retirer un mot-clé', async () => {
    fixture.heritage.asset.mockResolvedValue(asset({ statutDescription: 'A_RELIRE' }));
    render(<HeritageAssetsPanel initialAssetId={ASSET} />);
    const dialog = await screen.findByRole('dialog');
    const keywords = await within(dialog).findByRole('region', { name: 'Mots-clés' });
    expect(within(keywords).getByText('Parchemin')).toBeTruthy();
    expect(within(keywords).queryByRole('button', { name: 'Ajouter des mots-clés' })).toBeNull();
    expect(within(keywords).queryByRole('button', { name: 'Retirer le mot-clé Parchemin' })).toBeNull();
});

it('sans l’habilitation de gestion, les mots-clés se lisent sans pouvoir être modifiés', async () => {
    fixture.allowed = new Set(['HERITAGE_READ']);
    render(<HeritageAssetsPanel initialAssetId={ASSET} />);
    const dialog = await screen.findByRole('dialog');
    const keywords = await within(dialog).findByRole('region', { name: 'Mots-clés' });
    expect(within(keywords).queryByRole('button', { name: 'Ajouter des mots-clés' })).toBeNull();
});

it('les titres alternatifs se modifient ligne par ligne, une ligne mal formée est refusée avant l’envoi', async () => {
    render(<HeritageAssetsPanel initialAssetId={ASSET} />);
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Modifier' }));
    const titles = within(dialog).getByLabelText(/^Titres alternatifs/) as HTMLTextAreaElement;
    expect(titles.value).toBe('Titre ancien : Registre des déclarations');
    fireEvent.change(titles, { target: { value: 'Titre ancien : Registre des déclarations\nsans séparateur' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(await within(dialog).findByText(/Chaque titre alternatif s’écrit « type : titre »/)).toBeTruthy();
    expect(fixture.heritage.command).not.toHaveBeenCalled();
    fireEvent.change(titles, { target: { value: 'Titre ancien : Registre des déclarations\nTitre usuel : Livre des naissances' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    const [, body] = fixture.heritage.command.mock.calls[0]!;
    expect(body).toEqual({ expectedVersion: 3, changes: { titresAlternatifs: [
        { type: 'Titre ancien', valeur: 'Registre des déclarations' }, { type: 'Titre usuel', valeur: 'Livre des naissances' }] } });
});
