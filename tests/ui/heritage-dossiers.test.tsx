import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/core/http';
import type { LoanDossier, DossierElement, DossierPage, DossierRow, DossierSummary, DossierTransitionOption, HeritageAsset, HeritageAssetPage, HeritageReference, MovementRequest } from '../../src/core/types';
const INST = '00000000-0000-4000-8000-0000000000a1';
const fixture = vi.hoisted(() => ({
    epoch: 1, me: null as unknown, allowed: new Set<string>(['HERITAGE_READ', 'HERITAGE_LOAN_MANAGE']),
    heritage: { dossiers: vi.fn(), dossiersSummary: vi.fn(), dossier: vi.fn(), dossierJournal: vi.fn(), assetDossiers: vi.fn(), assets: vi.fn(), asset: vi.fn(), movement: vi.fn(), movementJournal: vi.fn(), references: vi.fn(), command: vi.fn() },
    records: { documents: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: { institutionId: INST, departmentId: null } }) }));
vi.mock('../../src/ui/printHtml', () => ({ printHtml: vi.fn() }));
import { printHtml } from '../../src/ui/printHtml';
import { DossiersPanel, DossiersTab } from '../../src/ui/HeritageDossiers';

const ID = '00000000-0000-4000-8000-0000000000';
const flat = (text: string | null) => (text ?? '').replace(/[  ]/g, ' ');
const today = new Date().toISOString().slice(0, 10);
const plus = (days: number) => { const d = new Date(today + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const step = (par = 'Awa Camara') => ({ parId: ID + 'u1', par, le: '2026-10-01T09:00:00Z' });
const alterations: HeritageReference[] = [{ domaine: 'ALTERATION', code: 'DECHIRURE', libelle: 'Déchirure', description: null, ordre: 10, actif: true }];
const option = (vers: DossierTransitionOption['vers'], extra: Partial<DossierTransitionOption> = {}): DossierTransitionOption => ({ vers, permissions: ['HERITAGE_LOAN_DECIDE'], peutAgir: true, motifRequis: false, bloquants: [], ...extra });
const element = (extra: Partial<DossierElement> = {}): DossierElement => ({ id: ID + 'e1', bienId: ID + 'b1', bienIdentifiant: 'PAT-000001', bienIntitule: 'Registre des naissances', archiveId: ID + 'a1', cote: 'ARCH-001', valeurAssuree: 1500000,
    conditions: 'Vitrine climatisée', emplacement: 'Salle 2', sortie: null, constatDepart: null, constatRetour: null, obstacles: [], ...extra });
const dossier = (extra: Partial<LoanDossier> = {}): LoanDossier => ({ id: ID + 'd1', numero: 'PRE-2026-000001', nature: 'PRET', institutionId: INST, intitule: 'Prêt à l’université de Kankan', objet: 'Prêt pour une exposition de recherche sur l’état civil',
    lieuNom: 'Université de Kankan', lieuAdresse: 'Campus de Kankan', dateDebut: plus(10), dateFin: plus(100), retourPrevu: plus(100), emprunteurNom: 'Université de Kankan', emprunteurContact: 'recteur@exemple.gn', commissaire: null,
    convention: { reference: null, signeeLe: null, signataire: null }, assurance: { assureur: null, police: null, du: null, au: null, exonerationMotif: null, devise: null }, transport: { mode: null, transporteur: null, convoyeur: null, allerLe: null, retourLe: null, emballage: null },
    statut: 'EN_INSTRUCTION', etape: 'EN_INSTRUCTION', creation: step(), decision: null, decisionMotif: null, fermeture: null, fermeMotif: null, enRetard: false, joursRetard: null, prolongations: 0, valeurTotale: 1500000,
    elements: [element()], preparation: [], passages: [option('ACCEPTE'), option('REFUSE', { motifRequis: true }), option('ANNULE', { permissions: ['HERITAGE_LOAN_MANAGE'], motifRequis: true })],
    peutModifier: true, peutCompleter: true, peutPreparer: false, peutProlonger: false, peutConstater: false, sortiesADemander: 0, version: 2, createdAt: '2026-10-01T09:00:00Z', ...extra });
const accepted = (extra: Partial<LoanDossier> = {}) => dossier({ statut: 'ACCEPTE', etape: 'A_PREPARER', decision: step('Mamadou Bah'), passages: [option('ANNULE', { motifRequis: true }), option('CLOS', { permissions: ['HERITAGE_LOAN_MANAGE'], bloquants: [{ code: 'NOT_RETURNED', message: 'Des originaux ne sont pas rentrés en réserve (ARCH-001).', bloque: null }] })],
    peutModifier: false, peutPreparer: true, peutProlonger: true, peutConstater: true, sortiesADemander: 1,
    preparation: [{ code: 'CONVENTION_MISSING', message: 'La convention de prêt n’est pas enregistrée : indiquez sa référence et sa date de signature.', bloque: null }, { code: 'DEPARTURE_REPORT_MISSING', message: 'Original ARCH-001 : aucun constat d’état de départ. Il se fait juste avant le départ.', bloque: null }], ...extra });
const row = (extra: Partial<DossierRow> = {}): DossierRow => ({ id: ID + 'd1', numero: 'PRE-2026-000001', nature: 'PRET', intitule: 'Prêt à l’université de Kankan', lieuNom: 'Université de Kankan', emprunteurNom: 'Université de Kankan', dateDebut: plus(10), dateFin: plus(100),
    retourPrevu: plus(100), statut: 'EN_INSTRUCTION', etape: 'EN_INSTRUCTION', enRetard: false, joursRetard: null, originaux: 1, creeLe: '2026-10-01T09:00:00Z', creePar: 'Awa Camara', ...extra });
const page = (items: DossierRow[]): DossierPage => ({ items, page: 0, size: 20, total: items.length, hasMore: false });
const summary = (extra: Partial<DossierSummary> = {}): DossierSummary => ({ aDecider: 2, aPreparer: 1, enPreparation: 0, enCours: 3, enRetard: 1, aClore: 0, retoursSous30Jours: 2, ...extra });
const asset = (extra: Partial<HeritageAsset> = {}) => ({ id: ID + 'b1', identifiant: 'PAT-000001', version: 4, institutionId: INST, departementId: null, champs: { natureOriginale: 'PHYSIQUE', intitule: 'Registre des naissances' },
    originaux: [{ archivePhysiqueId: ID + 'a1', cote: 'ARCH-001', libelle: null, support: null, etatPhysique: null }], ...extra }) as unknown as HeritageAsset;
const found = (): HeritageAssetPage => ({ items: [{ id: ID + 'b1', identifiant: 'PAT-000001', institutionId: INST, intitule: 'Registre des naissances' } as never, { id: ID + 'b9', identifiant: 'PAT-000009', institutionId: ID + 'zz', intitule: 'Autre institution' } as never], page: 0, size: 8, total: 2, hasMore: false });

beforeEach(() => {
    fixture.allowed = new Set(['HERITAGE_READ', 'HERITAGE_LOAN_MANAGE']);
    for (const fn of [...Object.values(fixture.heritage), fixture.records.documents]) fn.mockReset();
    vi.mocked(printHtml).mockReset();
    fixture.records.documents.mockResolvedValue({ items: [], page: 0, size: 100, hasMore: false });
    fixture.heritage.references.mockResolvedValue(alterations);
    fixture.heritage.dossiers.mockResolvedValue(page([]));
    fixture.heritage.dossiersSummary.mockResolvedValue(summary());
    fixture.heritage.dossier.mockResolvedValue(dossier());
    fixture.heritage.dossierJournal.mockResolvedValue([]);
    fixture.heritage.assetDossiers.mockResolvedValue([]);
    fixture.heritage.assets.mockResolvedValue(found());
    fixture.heritage.asset.mockResolvedValue(asset());
    fixture.heritage.movementJournal.mockResolvedValue([]);
    fixture.heritage.command.mockResolvedValue(dossier());
});

const top = () => { const all = screen.getAllByRole('dialog'); return all[all.length - 1]!; };
const fiche = async (d: LoanDossier) => {
    fixture.heritage.dossier.mockResolvedValue(d);
    fixture.heritage.dossiers.mockResolvedValue(page([row({ id: d.id, numero: d.numero })]));
    render(<DossiersPanel />);
    fireEvent.click(await screen.findByRole('button', { name: d.numero }));
    return await screen.findByRole('dialog');
};

it('la liste montre ce qui demande une action, filtre par carte et distingue les dossiers en retard', async () => {
    fixture.heritage.dossiers.mockResolvedValue(page([row({ etape: 'EN_COURS', statut: 'ACCEPTE', enRetard: true, joursRetard: 4 }), row({ id: ID + 'd2', numero: 'EXP-2026-000001', nature: 'EXPOSITION', intitule: 'Mémoire de Kankan', emprunteurNom: null, lieuNom: 'Salle des fêtes' })]));
    render(<DossiersPanel />);
    expect(await screen.findByText('2 dossiers')).toBeTruthy();
    expect(screen.getByText('En retard de 4 jours')).toBeTruthy();
    expect(screen.getByText('Exposition', { selector: 'small' })).toBeTruthy();
    expect(fixture.heritage.dossiers).toHaveBeenCalledWith(expect.objectContaining({ statut: 'OUVERTS', nature: '', mine: '' }), expect.anything());
    const cards = await screen.findByRole('list', { name: 'À faire' });
    expect(within(cards).getByText('3')).toBeTruthy(); expect(within(cards).getByText('2 retours attendus sous 30 jours')).toBeTruthy();
    fireEvent.click(within(cards).getByRole('button', { name: /En retard/ }));
    await waitFor(() => expect(fixture.heritage.dossiers).toHaveBeenLastCalledWith(expect.objectContaining({ statut: 'EN_RETARD' }), expect.anything()));
    fireEvent.change(screen.getByLabelText('Nature'), { target: { value: 'EXPOSITION' } });
    await waitFor(() => expect(fixture.heritage.dossiers).toHaveBeenLastCalledWith(expect.objectContaining({ nature: 'EXPOSITION' }), expect.anything()));
});

it('sans le droit de monter des dossiers, la page n’offre pas de création ; sans dossier elle le dit', async () => {
    fixture.allowed = new Set(['HERITAGE_READ']);
    render(<DossiersPanel />);
    expect(await screen.findByText('Aucun dossier')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Monter un prêt' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Monter une exposition' })).toBeNull();
});

it('un prêt se monte avec son emprunteur, ses dates et ses originaux choisis parmi les biens de l’institution', async () => {
    fixture.heritage.command.mockResolvedValue(dossier());
    render(<DossiersPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Monter un prêt' }));
    const form = top();
    const create = within(form).getByRole('button', { name: 'Monter le prêt' }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    fireEvent.change(within(form).getByLabelText(/Intitulé du prêt/), { target: { value: 'Prêt à l’université de Kankan' } });
    fireEvent.change(within(form).getByLabelText(/^Objet/), { target: { value: 'court' } });
    expect(within(form).getByText(/au moins 10 caractères/, { selector: 'li span' })).toBeTruthy();
    fireEvent.change(within(form).getByLabelText(/^Objet/), { target: { value: 'Prêt pour une exposition de recherche' } });
    fireEvent.change(within(form).getByLabelText(/^Emprunteur/), { target: { value: 'Université de Kankan' } });
    fireEvent.change(within(form).getByLabelText(/^Lieu chez l’emprunteur/), { target: { value: 'Université de Kankan' } });
    fireEvent.change(within(form).getByLabelText(/^Début du prêt/), { target: { value: plus(10) } });
    fireEvent.change(within(form).getByLabelText(/^Retour prévu/), { target: { value: plus(100) } });
    expect(create.disabled).toBe(false);
    fireEvent.change(within(form).getByLabelText(/au moins 2 caractères/), { target: { value: 'registre' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Chercher' }));
    expect(await within(form).findByText('Registre des naissances', { exact: false })).toBeTruthy();
    expect(within(form).queryByText(/Autre institution/)).toBeNull();
    fireEvent.click(within(form).getByRole('button', { name: 'Ses originaux' }));
    fireEvent.click(await within(form).findByRole('button', { name: 'Choisir' }));
    expect(within(within(form).getByRole('list', { name: 'Originaux choisis' })).getByText(/ARCH-001/)).toBeTruthy();
    expect((await within(form).findByRole('button', { name: 'Déjà choisi' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(create);
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    const [path, body, key, method] = fixture.heritage.command.mock.calls[0]!;
    expect(path).toBe('/dossiers'); expect(method).toBe('POST'); expect(typeof key).toBe('string');
    expect(body).toEqual({ nature: 'PRET', intitule: 'Prêt à l’université de Kankan', objet: 'Prêt pour une exposition de recherche', lieuNom: 'Université de Kankan', dateDebut: plus(10), retourPrevu: plus(100),
        emprunteurNom: 'Université de Kankan', institutionId: INST, originaux: [{ bienId: ID + 'b1', archiveId: ID + 'a1' }] });
    expect(await screen.findByRole('heading', { name: 'Prêt à l’université de Kankan' })).toBeTruthy();
});

it('un envoi dont la réponse est incertaine se rejoue avec la même clé d’idempotence', async () => {
    fixture.heritage.command.mockRejectedValueOnce(new ApiError(0, 'NETWORK_UNCERTAIN', 'La réponse n’est pas confirmée.', null, {}, true)).mockResolvedValue(dossier());
    render(<DossiersPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Monter une exposition' }));
    const form = top();
    fireEvent.change(within(form).getByLabelText(/^Titre de l’exposition/), { target: { value: 'Mémoire de Kankan' } });
    fireEvent.change(within(form).getByLabelText(/^Objet/), { target: { value: 'Exposition sur l’état civil colonial' } });
    fireEvent.change(within(form).getByLabelText(/^Lieu de l’exposition/), { target: { value: 'Salle des fêtes' } });
    fireEvent.change(within(form).getByLabelText(/^Ouverture/), { target: { value: plus(30) } });
    fireEvent.change(within(form).getByLabelText(/^Fermeture/), { target: { value: plus(90) } });
    fireEvent.change(within(form).getByLabelText(/^Retour des originaux prévu/), { target: { value: plus(97) } });
    expect(within(form).queryByLabelText(/^Emprunteur/)).toBeNull();
    fireEvent.click(within(form).getByRole('button', { name: 'Monter l’exposition' }));
    expect(await within(form).findByText('La réponse n’est pas confirmée.')).toBeTruthy();
    fireEvent.click(within(form).getByRole('button', { name: 'Monter l’exposition' }));
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(2));
    const [first, second] = fixture.heritage.command.mock.calls;
    expect(first![2]).toBe(second![2]);
    expect(first![1]).toMatchObject({ nature: 'EXPOSITION', dateFin: plus(90), retourPrevu: plus(97) });
    expect(first![1]).not.toHaveProperty('emprunteurNom');
});

it('la fiche d’un dossier à décider montre le déroulé, les passages et leurs conditions, et retire un original', async () => {
    const dialog = await fiche(dossier({ passages: [option('ACCEPTE', { peutAgir: false }), option('REFUSE', { motifRequis: true }), option('ANNULE', { permissions: ['HERITAGE_LOAN_MANAGE'], motifRequis: true })] }));
    expect(within(dialog).getByText('Prêt à l’université de Kankan', { selector: 'h2' })).toBeTruthy();
    expect(within(dialog).getByText(/Une autre personne que celle qui a monté le dossier l’accepte ou le refuse/)).toBeTruthy();
    expect(within(within(dialog).getByRole('list', { name: 'Déroulé du dossier' })).getByText('Accepté par une autre personne').closest('li')!.className).toBe('current');
    const accept = within(dialog).getByRole('button', { name: 'Accepter le dossier' }) as HTMLButtonElement;
    expect(accept.disabled).toBe(true); expect(accept.title).toContain('HERITAGE_LOAN_DECIDE');
    expect(within(dialog).getByText('Campus de Kankan')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retirer du dossier' }));
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    const [path, body] = fixture.heritage.command.mock.calls[0]!;
    expect(path).toBe('/dossiers/' + ID + 'd1/elements/' + ID + 'e1/remove'); expect(body).toEqual({ expectedVersion: 2 });
});

it('accepter, refuser ou annuler passe par une fenêtre ; le refus se motive', async () => {
    const dialog = await fiche(dossier());
    fireEvent.click(within(dialog).getByRole('button', { name: 'Refuser le dossier' }));
    let form = top();
    const confirm = within(form).getByRole('button', { name: 'Confirmer' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(form).getByLabelText(/Motif/), { target: { value: 'Les originaux sont trop fragiles pour voyager' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    expect(fixture.heritage.command.mock.calls[0]!.slice(0, 2)).toEqual(['/dossiers/' + ID + 'd1/transitions', { vers: 'REFUSE', expectedVersion: 2, texte: 'Les originaux sont trop fragiles pour voyager' }]);
    await waitFor(() => expect(screen.getAllByRole('dialog').length).toBe(1));
    fireEvent.click(within(top()).getByRole('button', { name: 'Accepter le dossier' }));
    form = top();
    expect(within(form).getByText(/L’acceptation engage l’institution/)).toBeTruthy();
    fireEvent.click(within(form).getByRole('button', { name: 'Confirmer' }));
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(2));
    expect(fixture.heritage.command.mock.calls[1]![1]).toEqual({ vers: 'ACCEPTE', expectedVersion: 2 });
});

it('un dossier accepté dit ce qui manque avant le départ, demande les sorties et bloque la clôture tant que tout n’est pas rentré', async () => {
    const dialog = await fiche(accepted());
    expect(within(dialog).getByText(/demandez la sortie de chaque original/)).toBeTruthy();
    const list = within(dialog).getByRole('list', { name: 'Avant le départ' });
    expect(within(list).getByText(/La convention de prêt n’est pas enregistrée/)).toBeTruthy();
    expect(within(list).getByText(/aucun constat d’état de départ/)).toBeTruthy();
    const close = within(dialog).getByRole('button', { name: 'Clore le dossier' }) as HTMLButtonElement;
    expect(close.disabled).toBe(true);
    // Ce qui bloque la clôture ne s'affiche qu'une fois des originaux sortis : avant, ce serait du bruit.
    expect(within(dialog).queryByRole('list', { name: 'Clore le dossier' })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Demander les sorties (1)' }));
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    expect(fixture.heritage.command.mock.calls[0]!.slice(0, 2)).toEqual(['/dossiers/' + ID + 'd1/prepare', { expectedVersion: 2 }]);
});

it('une fois des originaux sortis, la fiche dit ce qui bloque la clôture', async () => {
    const dialog = await fiche(accepted({ etape: 'EN_COURS', elements: [element({ sortie: { id: ID + 'm1', numero: 'MVT-2026-000001', statut: 'RECUE', retourPrevu: plus(100), enRetard: false, joursRetard: null } })] }));
    expect(within(dialog).getByRole('list', { name: 'Clore le dossier' }).textContent).toContain('ne sont pas rentrés');
});

it('quand tout est prêt, le dossier le dit, et la fiche de transport s’imprime avec son contenu', async () => {
    const dialog = await fiche(accepted({ preparation: [], convention: { reference: 'CONV-2026-01', signeeLe: '2026-10-03', signataire: 'Le recteur' },
        assurance: { assureur: 'Assurance Nationale', police: 'POL-77', du: '2026-10-04', au: plus(200), exonerationMotif: null, devise: 'GNF' }, transport: { mode: 'Camion climatisé', transporteur: 'Transports Kankan', convoyeur: null, allerLe: null, retourLe: null, emballage: null } }));
    expect(within(dialog).getByText(/Tout est prêt pour le départ/)).toBeTruthy();
    expect(within(dialog).getByText('CONV-2026-01')).toBeTruthy();
    expect(within(dialog).getByText('Assurance Nationale')).toBeTruthy();
    expect(flat(within(dialog).getByText('Valeur assurée totale').nextSibling!.textContent)).toMatch(/1 500 000\s?GNF/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Imprimer la fiche de transport' }));
    expect(printHtml).toHaveBeenCalledTimes(1);
    expect(vi.mocked(printHtml).mock.calls[0]![0]).toContain('PRE-2026-000001');
    expect(vi.mocked(printHtml).mock.calls[0]![0]).toContain('Camion climatisé');
});

it('la convention, l’assurance et le transport se complètent avec la version attendue, et l’assurance se motive quand il n’y en a pas', async () => {
    const dialog = await fiche(accepted());
    fireEvent.click(within(dialog).getByRole('button', { name: 'Convention, assurance, transport' }));
    const form = top();
    fireEvent.change(within(form).getByLabelText('Référence de la convention'), { target: { value: 'CONV-2026-01' } });
    fireEvent.change(within(form).getByLabelText('Signée le'), { target: { value: today } });
    fireEvent.change(within(form).getByLabelText('Assureur'), { target: { value: 'Assurance Nationale' } });
    fireEvent.change(within(form).getByLabelText('Numéro de police'), { target: { value: 'POL-77' } });
    fireEvent.change(within(form).getByLabelText('Couverture du'), { target: { value: today } });
    fireEvent.change(within(form).getByLabelText(/^Couverture au/), { target: { value: plus(120) } });
    fireEvent.change(within(form).getByLabelText(/^Devise/), { target: { value: 'gnf' } });
    fireEvent.change(within(form).getByLabelText('Mode de transport'), { target: { value: 'Camion climatisé' } });
    fireEvent.click(within(form).getByRole('radio', { name: /Pas d’assurance/ }));
    const save = within(form).getByRole('button', { name: 'Enregistrer' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(within(form).getByLabelText(/Motif de l’absence d’assurance/), { target: { value: 'Garantie de l’État accordée pour ce prêt' } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    const [path, body, , method] = fixture.heritage.command.mock.calls[0]!;
    expect(path).toBe('/dossiers/' + ID + 'd1/terms'); expect(method).toBe('PUT');
    expect(body).toEqual({ expectedVersion: 2, termes: { conventionReference: 'CONV-2026-01', conventionSigneeLe: today, assuranceExonerationMotif: 'Garantie de l’État accordée pour ce prêt', devise: 'GNF', transportMode: 'Camion climatisé' } });
});

it('le constat d’état de départ se fait depuis le dossier, sans choisir de circonstances', async () => {
    const dialog = await fiche(accepted());
    fireEvent.click(within(dialog).getByRole('button', { name: 'Constat de départ' }));
    const form = top();
    expect(within(form).queryByLabelText(/Circonstances/)).toBeNull();
    const save = within(form).getByRole('button', { name: 'Enregistrer le constat' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(within(form).getByRole('radio', { name: /Stable/ }));
    fireEvent.change(within(form).getByLabelText(/Manipulation/), { target: { value: 'LIBRE' } });
    fireEvent.change(within(form).getByLabelText(/Observations/), { target: { value: 'Constat avant le départ pour le prêt' } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    const [path, body] = fixture.heritage.command.mock.calls[0]!;
    expect(path).toBe('/dossiers/' + ID + 'd1/elements/' + ID + 'e1/departure-report');
    expect(body).toEqual({ constat: { etat: 'STABLE', manipulation: 'LIBRE', urgence: 'AUCUNE', alterations: [], observations: 'Constat avant le départ pour le prêt' } });
});

it('une sortie refusée se redemande, et un original sorti ne se constate plus au départ', async () => {
    const dialog = await fiche(accepted({ etape: 'EN_COURS', elements: [
        element({ sortie: { id: ID + 'm1', numero: 'MVT-2026-000001', statut: 'REFUSEE', retourPrevu: plus(100), enRetard: false, joursRetard: null } }),
        element({ id: ID + 'e2', archiveId: ID + 'a2', cote: 'ARCH-002', bienIntitule: 'Carte de Siguiri', sortie: { id: ID + 'm2', numero: 'MVT-2026-000002', statut: 'RECUE', retourPrevu: plus(100), enRetard: true, joursRetard: 3 } })] }));
    expect(within(dialog).getByText('Refusée — à redemander')).toBeTruthy();
    expect(within(dialog).getByText('Sorti de réserve, en retard.')).toBeTruthy();
    const cards = within(dialog).getByRole('list', { name: 'Originaux du dossier' });
    expect(within(cards).getAllByRole('button', { name: 'Constat de départ' })).toHaveLength(1);
});

it('la prolongation exige une fin postérieure, un motif, et une assurance qui couvre le nouveau retour', async () => {
    const dialog = await fiche(accepted({ assurance: { assureur: 'Assurance Nationale', police: 'POL-77', du: '2026-10-04', au: plus(110), exonerationMotif: null, devise: 'GNF' } }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Prolonger' }));
    const form = top();
    const go = within(form).getByRole('button', { name: 'Prolonger' }) as HTMLButtonElement;
    fireEvent.change(within(form).getByLabelText(/Nouvelle fin/), { target: { value: plus(130) } });
    fireEvent.change(within(form).getByLabelText(/Motif/), { target: { value: 'Le prêt est prolongé de trente jours' } });
    expect(within(form).getByText(/L’assurance prend fin le/)).toBeTruthy();
    expect(go.disabled).toBe(true);
    fireEvent.change(within(form).getByLabelText(/Nouvelle fin/), { target: { value: plus(105) } });
    expect(go.disabled).toBe(false);
    fireEvent.click(go);
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    expect(fixture.heritage.command.mock.calls[0]!.slice(0, 2)).toEqual(['/dossiers/' + ID + 'd1/prolong', { expectedVersion: 2, nouvelleFin: plus(105), motif: 'Le prêt est prolongé de trente jours' }]);
});

const linkedMovement = (): MovementRequest => ({ id: ID + 'm2', numero: 'MVT-2026-000002', bienId: ID + 'b1', bienIdentifiant: 'PAT-000001', bienIntitule: 'Registre des naissances', institutionId: INST, archiveId: ID + 'a1', cote: 'ARCH-001',
    objet: 'PRET', motif: 'Dossier PRE-2026-000001 : prêt', destination: 'Université de Kankan', destinataire: 'Université de Kankan', retourPrevu: plus(100), statut: 'RECUE', demande: step(), decision: step('Mamadou Bah'), decisionMotif: null,
    conditions: null, remise: step(), mouvementId: ID + 'x1', reception: step(), retour: null, retourConforme: null, retourNote: null, retourConstatId: null, fermeture: null, fermeMotif: null, enRetard: false, joursRetard: null, modifiable: false,
    passages: [{ vers: 'RETOURNEE', permissions: ['HERITAGE_MOVEMENT_HANDLE'], peutAgir: true, motifRequis: false, conditionsRequises: false, conformiteRequise: true, bloquants: [], constatRequis: true }], version: 5, createdAt: '2026-10-01T09:00:00Z',
    dossier: { id: ID + 'd1', numero: 'PRE-2026-000001', nature: 'PRET', statut: 'ACCEPTE' } });

it('la sortie liée à un dossier dit son dossier, et son retour exige un constat d’état même conforme', async () => {
    fixture.heritage.movement.mockResolvedValue(linkedMovement());
    const dialog = await fiche(accepted({ etape: 'EN_COURS', elements: [element({ sortie: { id: ID + 'm2', numero: 'MVT-2026-000002', statut: 'RECUE', retourPrevu: plus(100), enRetard: false, joursRetard: null } })] }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ouvrir la sortie' }));
    await waitFor(() => expect(screen.getAllByRole('dialog').length).toBe(2));
    const movement = top();
    expect(await within(movement).findByText(/Cette sortie fait partie du dossier/)).toBeTruthy();
    expect(within(movement).getByText('PRE-2026-000001', { selector: 'strong' })).toBeTruthy();
    fireEvent.click(await within(movement).findByRole('button', { name: 'Enregistrer le retour' }));
    const form = top();
    const confirm = within(form).getByRole('button', { name: 'Confirmer' }) as HTMLButtonElement;
    fireEvent.click(within(form).getByRole('radio', { name: /Rendu dans l’état où il est parti/ }));
    expect(confirm.disabled).toBe(true);
    expect(within(form).getByText(/même s’il est rendu dans l’état où il est parti/)).toBeTruthy();
    fireEvent.click(within(form).getByRole('radio', { name: /Stable/ }));
    fireEvent.change(within(form).getByLabelText(/Manipulation/), { target: { value: 'LIBRE' } });
    fireEvent.change(within(form).getByLabelText(/Observations/), { target: { value: 'Constat au retour du prêt, sans changement' } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    const [path, body] = fixture.heritage.command.mock.calls[0]!;
    expect(path).toBe('/movements/' + ID + 'm2/transitions');
    expect(body).toMatchObject({ vers: 'RETOURNEE', expectedVersion: 5, conforme: true });
    expect((body as { constat: Record<string, unknown> }).constat).toEqual({ etat: 'STABLE', manipulation: 'LIBRE', urgence: 'AUCUNE', alterations: [], observations: 'Constat au retour du prêt, sans changement' });
});

it('l’onglet d’un bien liste ses dossiers, et propose d’en monter avec ses originaux déjà choisis', async () => {
    fixture.heritage.assetDossiers.mockResolvedValue([row({ statut: 'ACCEPTE', etape: 'EN_PREPARATION' }), row({ id: ID + 'd3', numero: 'EXP-2026-000002', nature: 'EXPOSITION', statut: 'CLOS', etape: 'CLOS', intitule: 'Exposition de 2025' })]);
    render(<DossiersTab asset={asset()} onChanged={vi.fn()} />);
    expect(await screen.findByText('Dossiers ouverts')).toBeTruthy();
    expect(screen.getByText('Dossiers clos')).toBeTruthy();
    expect(screen.getByText('Exposition de 2025', { exact: false })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Monter une exposition avec ce bien' }));
    const form = top();
    expect(within(within(form).getByRole('list', { name: 'Originaux choisis' })).getByText(/ARCH-001/)).toBeTruthy();
});

it('l’onglet d’un bien sans dossier le dit, et sans le droit de monter il n’offre pas de création', async () => {
    fixture.allowed = new Set(['HERITAGE_READ']);
    render(<DossiersTab asset={asset()} onChanged={vi.fn()} />);
    expect(await screen.findByText('Aucun prêt ni exposition')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Monter un prêt/ })).toBeNull();
});
