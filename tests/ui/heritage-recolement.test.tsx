import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/core/http';
import type { Recolement, RecolementElement, RecolementElementPage, RecolementJournalEntry, RecolementPage, RecolementProgress, RecolementReport, RecolementSummary, RecolementTransitionOption, StoragePlace } from '../../src/core/types';
const INST = '00000000-0000-4000-8000-0000000000a1';
const fixture = vi.hoisted(() => ({
    epoch: 1, me: null as unknown, allowed: new Set<string>(['HERITAGE_READ', 'HERITAGE_RECOLEMENT_MANAGE', 'HERITAGE_RECOLEMENT_PERFORM']),
    heritage: { recolements: vi.fn(), recolement: vi.fn(), recolementJournal: vi.fn(), recolementElements: vi.fn(), recolementReport: vi.fn(), recolementUnits: vi.fn(), recolementLocations: vi.fn(), command: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: { institutionId: '00000000-0000-4000-8000-0000000000a1', departmentId: null } }) }));
import { RecolementsPanel } from '../../src/ui/HeritageRecolement';

const ID = '00000000-0000-4000-8000-0000000000';
const place = (n: number): StoragePlace => ({ unitId: ID + '1' + n, cote: 'R-' + n, typeUnite: 'RAYONNAGE', localisation: ['Magasin 1'], actif: true });
const progress = (extra: Partial<RecolementProgress> = {}): RecolementProgress => ({ total: 8, verifies: 4, conformes: 2, autresEmplacements: 1, introuvables: 1, reportes: 1, restants: 3, traitesPourcent: 62, verifiesPourcent: 50, ...extra });
const summary = (n: number, extra: Partial<RecolementSummary> = {}): RecolementSummary => ({ id: ID + 'c' + n, numero: 'REC-2026-00000' + n, institutionId: INST, libelle: 'Récolement ' + n, localisation: ['Archives', 'Magasin 2'], statut: 'EN_COURS',
    dateDebutPrevue: '2026-10-01', dateFinPrevue: '2026-10-30', lanceLe: '2026-10-01T09:00:00Z', clotureLe: null, progres: progress(), updatedAt: '2026-10-04T10:00:00Z', ...extra });
const page = (items: RecolementSummary[]): RecolementPage => ({ items, page: 0, size: 20, total: items.length, hasMore: false });
const option = (vers: RecolementTransitionOption['vers'], extra: Partial<RecolementTransitionOption> = {}): RecolementTransitionOption => ({ vers, permissions: ['HERITAGE_RECOLEMENT_MANAGE'], peutAgir: true, motifRequis: false, bloquants: [], ...extra });
const campaign = (extra: Partial<Recolement> = {}): Recolement => ({ id: ID + 'c1', numero: 'REC-2026-000001', institutionId: INST, departementId: null, libelle: 'Récolement 1', objet: 'Vérification annuelle', localisationId: ID + 'l2',
    localisation: ['Archives', 'Magasin 2'], dateDebutPrevue: '2026-10-01', dateFinPrevue: '2026-10-30', statut: 'EN_COURS', lanceParId: ID + 'u1', lanceLe: '2026-10-01T09:00:00Z', clotureParId: null, clotureLe: null, clotureResume: null,
    annuleLe: null, annuleMotif: null, perimetre: null, progres: progress(), modifiable: false, peutConstater: true,
    passages: [option('CLOTUREE', { motifRequis: true, bloquants: [{ code: 'REMAINING_ELEMENTS', message: '3 éléments restent à vérifier : constatez leur présence ou reportez-les avec un motif.', bloque: null }] }), option('ANNULEE', { motifRequis: true })],
    version: 5, createdAt: '2026-10-01T08:00:00Z', updatedAt: '2026-10-04T10:00:00Z', ...extra });
const element = (n: number, extra: Partial<RecolementElement> = {}): RecolementElement => ({ id: ID + 'e' + n, archiveId: ID + 'a' + n, cote: 'ARCH-00' + n, support: 'Papier', etatPhysique: null, bienId: ID + 'b' + n, bienIdentifiant: 'PAT-00000' + n,
    bienIntitule: 'Registre ' + n, habituel: place(1), statut: 'A_VERIFIER', resultat: null, verifieLe: null, verifiePar: null, uniteConstatee: null, note: null, motifReport: null, traiteLe: null, enSortie: false, version: 2, ...extra });
const elements = (items: RecolementElement[]): RecolementElementPage => ({ items, page: 0, size: 25, total: items.length, hasMore: false });

beforeEach(() => {
    fixture.allowed = new Set(['HERITAGE_READ', 'HERITAGE_RECOLEMENT_MANAGE', 'HERITAGE_RECOLEMENT_PERFORM']);
    for (const fn of Object.values(fixture.heritage)) fn.mockReset();
    fixture.heritage.recolements.mockResolvedValue(page([]));
    fixture.heritage.recolement.mockResolvedValue(campaign());
    fixture.heritage.recolementJournal.mockResolvedValue([]);
    fixture.heritage.recolementElements.mockResolvedValue(elements([element(1), element(2)]));
    fixture.heritage.recolementUnits.mockResolvedValue([place(1), place(2), place(3)]);
    fixture.heritage.recolementLocations.mockResolvedValue([{ id: ID + 'l1', parentId: null, libelle: 'Archives', typeLocalisation: 'BATIMENT' }, { id: ID + 'l2', parentId: ID + 'l1', libelle: 'Magasin 2', typeLocalisation: 'MAGASIN' }]);
    fixture.heritage.command.mockResolvedValue(campaign());
});

const top = () => { const all = screen.getAllByRole('dialog'); return all[all.length - 1]!; };
async function openCampaign(view: Recolement = campaign()) {
    fixture.heritage.recolements.mockResolvedValue(page([summary(1, { statut: view.statut })]));
    fixture.heritage.recolement.mockResolvedValue(view);
    render(<RecolementsPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'REC-2026-000001' }));
    return await screen.findByRole('dialog');
}

it('la liste montre les campagnes avec leur étape, leur périmètre et leur avancement, et filtre par étape', async () => {
    fixture.heritage.recolements.mockResolvedValue(page([summary(1), summary(2, { statut: 'CLOTUREE', localisation: [], libelle: 'Récolement 2' })]));
    render(<RecolementsPanel />);
    expect(await screen.findByRole('button', { name: 'REC-2026-000001' })).toBeTruthy();
    const table = within(screen.getByRole('table'));
    expect(table.getByText('Archives › Magasin 2')).toBeTruthy();
    expect(table.getByText('Toute l’institution')).toBeTruthy();
    expect(table.getAllByText('Du 1 octobre 2026 au 30 octobre 2026').length).toBe(2);
    expect(table.getByText('En cours', { selector: '.badge' })).toBeTruthy();
    expect(table.getByText('Clôturée', { selector: '.badge' })).toBeTruthy();
    expect(table.getAllByText('50 % vérifié').length).toBe(2);
    expect(table.getAllByRole('img')[0]!.getAttribute('aria-label')).toMatch(/4 vérifiés sur 8 \(50 %\), 1 reporté, 3 à vérifier/);
    fireEvent.change(screen.getByLabelText('Étape'), { target: { value: 'CLOTUREE' } });
    await waitFor(() => expect(fixture.heritage.recolements).toHaveBeenLastCalledWith(expect.objectContaining({ statut: 'CLOTUREE', page: 0 }), expect.anything()));
});

it('un état vide invite à planifier la première campagne', async () => {
    render(<RecolementsPanel />);
    expect(await screen.findByText('Aucune campagne de récolement')).toBeTruthy();
    expect(screen.getByText(/Planifiez la première campagne/)).toBeTruthy();
});

it('sans la permission de gestion, aucun bouton de création', async () => {
    fixture.allowed = new Set(['HERITAGE_READ']);
    render(<RecolementsPanel />);
    await screen.findByText('Aucune campagne de récolement');
    expect(screen.queryByRole('button', { name: 'Nouvelle campagne' })).toBeNull();
    expect(screen.getByText('Aucune campagne dans votre périmètre.')).toBeTruthy();
});

it('planifier une campagne envoie le libellé et le périmètre choisi avec une clé stable, puis ouvre la fiche', async () => {
    fixture.heritage.command.mockResolvedValue(campaign({ statut: 'PLANIFIEE', perimetre: 12, modifiable: true, peutConstater: false, lanceLe: null, lanceParId: null, progres: progress({ total: 0, verifies: 0, conformes: 0, autresEmplacements: 0, introuvables: 0, reportes: 0, restants: 0, traitesPourcent: 0, verifiesPourcent: 0 }), passages: [option('EN_COURS')] }));
    fixture.heritage.recolement.mockResolvedValue(campaign({ statut: 'PLANIFIEE' }));
    render(<RecolementsPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Nouvelle campagne' }));
    const dialog = await screen.findByRole('dialog');
    const submit = within(dialog).getByRole('button', { name: 'Planifier la campagne' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/Libellé/), { target: { value: '  Récolement 2026  ' } });
    const select = await within(dialog).findByLabelText(/Périmètre/) as HTMLSelectElement;
    await waitFor(() => expect([...select.options].map(o => o.textContent)).toEqual(['Toute l’institution', 'Archives', 'Archives › Magasin 2']));
    fireEvent.change(select, { target: { value: ID + 'l2' } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    const [path, body, key, method] = fixture.heritage.command.mock.calls[0]!;
    expect(path).toBe('/recolements');
    expect(body).toEqual({ libelle: 'Récolement 2026', localisationId: ID + 'l2', institutionId: INST, departementId: null });
    expect(typeof key).toBe('string'); expect(method).toBe('POST');
    expect(await screen.findByText(/REC-2026-000001 · /, { selector: 'p' })).toBeTruthy();
});

it('une date de fin avant la date de début est refusée avant l’envoi', async () => {
    render(<RecolementsPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Nouvelle campagne' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Libellé/), { target: { value: 'Récolement' } });
    fireEvent.change(within(dialog).getByLabelText('Début prévu'), { target: { value: '2026-10-10' } });
    fireEvent.change(within(dialog).getByLabelText('Fin prévue'), { target: { value: '2026-10-01' } });
    expect(within(dialog).getByText(/doit suivre/)).toBeTruthy();
    expect((within(dialog).getByRole('button', { name: 'Planifier la campagne' }) as HTMLButtonElement).disabled).toBe(true);
});

it('la fiche montre l’avancement, la répartition, et la clôture grisée avec ce qui reste à vérifier', async () => {
    const dialog = await openCampaign();
    expect(within(dialog).getAllByRole('img', { name: /4 vérifiés sur 8/ }).length).toBe(2);
    const legend = within(dialog).getByRole('list', { name: 'Répartition des éléments' });
    expect(within(legend).getByText('Introuvables').closest('li')!.textContent).toContain('1');
    expect(within(dialog).getByText(/Constatez chaque archive en allant la voir/)).toBeTruthy();
    const close = within(dialog).getByRole('button', { name: 'Clôturer la campagne' }) as HTMLButtonElement;
    expect(close.disabled).toBe(true);
    expect(close.title).toBe('Conditions non remplies');
    expect(within(dialog).getByText(/3 éléments restent à vérifier/)).toBeTruthy();
    expect(within(dialog).getByText('Vérification annuelle')).toBeTruthy();
});

it('lancer fige le périmètre : la fenêtre le dit et le passage part avec la version', async () => {
    const planned = campaign({ statut: 'PLANIFIEE', perimetre: 12, modifiable: true, peutConstater: false, lanceLe: null, lanceParId: null, passages: [option('EN_COURS'), option('ANNULEE', { motifRequis: true })] });
    const dialog = await openCampaign(planned);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lancer le récolement' }));
    const form = top();
    expect(within(form).getByText(/12 originaux physiques seront à vérifier/)).toBeTruthy();
    expect(within(form).getByText(/une autre personne que vous/)).toBeTruthy();
    fireEvent.click(within(form).getByRole('button', { name: 'Confirmer' }));
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    const [path, body, , method] = fixture.heritage.command.mock.calls[0]!;
    expect(path).toBe('/recolements/' + ID + 'c1/transitions');
    expect(body).toEqual({ vers: 'EN_COURS', expectedVersion: 5 });
    expect(method).toBe('POST');
});

it('clôturer exige une conclusion écrite et envoie le texte', async () => {
    const dialog = await openCampaign(campaign({ passages: [option('CLOTUREE', { motifRequis: true }), option('ANNULEE', { motifRequis: true })], progres: progress({ restants: 0 }) }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Clôturer la campagne' }));
    const form = top();
    const confirm = within(form).getByRole('button', { name: 'Confirmer' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(within(form).getByText(/clôture est définitive/)).toBeTruthy();
    fireEvent.change(within(form).getByLabelText(/Conclusion de la campagne/), { target: { value: 'court' } });
    expect(confirm.disabled).toBe(true);
    expect(within(form).getByText(/un texte écrit d’au moins 10 caractères/)).toBeTruthy();
    fireEvent.change(within(form).getByLabelText(/Conclusion de la campagne/), { target: { value: 'Campagne terminée, deux écarts à régulariser' } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    expect(fixture.heritage.command.mock.calls[0]![1]).toEqual({ vers: 'CLOTUREE', expectedVersion: 5, texte: 'Campagne terminée, deux écarts à régulariser' });
});

it('la clôture refusée par le serveur (autre personne exigée) s’affiche dans la fenêtre', async () => {
    fixture.heritage.command.mockRejectedValue(new ApiError(422, 'HERITAGE_TRANSITION_BLOCKED', 'La clôture doit être faite par une autre personne que celle qui a lancé la campagne.'));
    const dialog = await openCampaign(campaign({ passages: [option('CLOTUREE', { motifRequis: true })], progres: progress({ restants: 0 }) }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Clôturer la campagne' }));
    const form = top();
    fireEvent.change(within(form).getByLabelText(/Conclusion de la campagne/), { target: { value: 'Campagne terminée, deux écarts à régulariser' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Confirmer' }));
    expect(await within(form).findByText(/autre personne que celle qui a lancé/)).toBeTruthy();
});

async function openParcours(view: Recolement = campaign()) {
    const dialog = await openCampaign(view);
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Parcours' }));
    await within(dialog).findByText('ARCH-001');
    return dialog;
}

it('le parcours liste les éléments dans l’ordre de la visite, avec le bien et ce qui a été fait', async () => {
    fixture.heritage.recolementElements.mockResolvedValue(elements([element(1), element(2, { statut: 'VERIFIE', resultat: 'AUTRE_EMPLACEMENT', uniteConstatee: place(2), verifieLe: '2026-10-05T10:00:00Z', traiteLe: '2026-10-05T10:00:00Z', verifiePar: 'Awa Camara', note: 'Sur le chariot' }),
        element(3, { statut: 'REPORTE', motifReport: 'Local inaccessible', traiteLe: '2026-10-05T11:00:00Z' })]));
    const dialog = await openParcours();
    const table = within(within(dialog).getByRole('table'));
    expect(table.getAllByText('Magasin 1 · R-1').length).toBe(3);
    expect(table.getByText('PAT-000001')).toBeTruthy();
    expect(table.getByText('Trouvée ailleurs : Magasin 1 · R-2')).toBeTruthy();
    expect(table.getByText(/5 octobre 2026 · Awa Camara/)).toBeTruthy();
    expect(table.getByText('Sur le chariot')).toBeTruthy();
    expect(table.getByText('Reporté : Local inaccessible')).toBeTruthy();
    expect(within(dialog).getByText(/3 éléments, dans l’ordre du parcours/)).toBeTruthy();
    expect(table.getAllByRole('button', { name: 'Constater' }).length).toBe(2);
    expect(table.getByRole('button', { name: 'Revérifier' })).toBeTruthy();
});

it('constater « présente » envoie le constat de l’élément avec sa version et une clé stable, puis recharge', async () => {
    const dialog = await openParcours();
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Constater' })[0]!);
    const form = top();
    expect(within(form).getByRole('heading', { name: 'Vérifier la présence' })).toBeTruthy();
    fireEvent.click(within(form).getByRole('radio', { name: /Présente à son emplacement habituel/ }));
    fireEvent.click(within(form).getByRole('button', { name: 'Enregistrer le constat' }));
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    const [path, body, key, method] = fixture.heritage.command.mock.calls[0]!;
    expect(path).toBe('/recolements/' + ID + 'c1/elements/' + ID + 'e1/verify');
    expect(body).toEqual({ resultat: 'PRESENTE', expectedVersion: 2 });
    expect(typeof key).toBe('string'); expect(method).toBe('POST');
    await waitFor(() => expect(fixture.heritage.recolementElements.mock.calls.length).toBeGreaterThan(1));
    await waitFor(() => expect(fixture.heritage.recolement.mock.calls.length).toBeGreaterThan(1));
});

it('« trouvée ailleurs » propose les emplacements de la campagne, sans droit national sur les archives', async () => {
    const dialog = await openParcours();
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Constater' })[0]!);
    const form = top();
    fireEvent.click(within(form).getByRole('radio', { name: /Trouvée à un autre emplacement/ }));
    const select = await within(form).findByLabelText(/Emplacement où elle a été trouvée/) as HTMLSelectElement;
    await waitFor(() => expect([...select.options].map(o => o.textContent)).toEqual(['Choisir…', 'Magasin 1 · R-2', 'Magasin 1 · R-3']));
    expect(fixture.heritage.recolementUnits).toHaveBeenCalledWith(ID + 'c1', expect.anything());
    fireEvent.change(select, { target: { value: ID + '13' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Enregistrer le constat' }));
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    expect(fixture.heritage.command.mock.calls[0]![1]).toEqual({ resultat: 'AUTRE_EMPLACEMENT', uniteConstateeId: ID + '13', expectedVersion: 2 });
});

it('une archive sortie ne se constate pas : le bouton est grisé et le report est proposé', async () => {
    fixture.heritage.recolementElements.mockResolvedValue(elements([element(1, { enSortie: true })]));
    const dialog = await openParcours();
    const verify = within(dialog).getByRole('button', { name: 'Constater' }) as HTMLButtonElement;
    expect(verify.disabled).toBe(true);
    expect(verify.title).toMatch(/Archive sortie/);
    expect(within(dialog).getByText('À reporter ou à vérifier au retour')).toBeTruthy();
    expect(within(dialog).getAllByText('Sortie de réserve').length).toBeGreaterThan(0);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reporter' }));
    const form = top();
    const confirm = within(form).getByRole('button', { name: 'Reporter' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(within(form).getByText(/Un report n’est pas une vérification/)).toBeTruthy();
    fireEvent.change(within(form).getByLabelText(/Motif/), { target: { value: 'court' } });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(form).getByLabelText(/Motif/), { target: { value: 'Archive sortie en consultation, retour prévu' } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    const [path, body] = fixture.heritage.command.mock.calls[0]!;
    expect(path).toBe('/recolements/' + ID + 'c1/elements/' + ID + 'e1/postpone');
    expect(body).toEqual({ expectedVersion: 2, motif: 'Archive sortie en consultation, retour prévu' });
});

it('sans l’habilitation de constater, le parcours se lit sans boutons d’action', async () => {
    const dialog = await openParcours(campaign({ peutConstater: false }));
    expect(within(dialog).queryByRole('button', { name: 'Constater' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Reporter' })).toBeNull();
    expect(within(dialog).queryByText(/Constatez chaque archive/)).toBeNull();
});

it('le parcours se filtre par étape et par constat', async () => {
    const dialog = await openParcours();
    fireEvent.change(within(dialog).getByLabelText('Étape'), { target: { value: 'A_VERIFIER' } });
    await waitFor(() => expect(fixture.heritage.recolementElements).toHaveBeenLastCalledWith(ID + 'c1', expect.objectContaining({ statut: 'A_VERIFIER', page: 0 }), expect.anything()));
    fireEvent.change(within(dialog).getByLabelText('Constat'), { target: { value: 'ABSENTE' } });
    await waitFor(() => expect(fixture.heritage.recolementElements).toHaveBeenLastCalledWith(ID + 'c1', expect.objectContaining({ resultat: 'ABSENTE' }), expect.anything()));
});

it('avant le lancement, le parcours annonce le périmètre sans liste, et la campagne se modifie', async () => {
    const planned = campaign({ statut: 'PLANIFIEE', perimetre: 12, modifiable: true, peutConstater: false, lanceLe: null, lanceParId: null, passages: [option('EN_COURS')] });
    const dialog = await openCampaign(planned);
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Parcours' }));
    expect(await within(dialog).findByText(/La liste des éléments se fige au lancement : 12 originaux physiques/)).toBeTruthy();
    expect(fixture.heritage.recolementElements).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Modifier' }));
    const form = top();
    fireEvent.change(within(form).getByLabelText(/Libellé/), { target: { value: 'Récolement du magasin 2' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    const [path, body, , method] = fixture.heritage.command.mock.calls[0]!;
    expect(path).toBe('/recolements/' + ID + 'c1');
    expect(method).toBe('PUT');
    expect(body).toEqual(expect.objectContaining({ libelle: 'Récolement du magasin 2', objet: 'Vérification annuelle', localisationId: ID + 'l2', expectedVersion: 5 }));
});

const report = (): RecolementReport => ({ progres: progress(), ecartsTotal: 2, ecartsOuverts: 1, reportesTotal: 1,
    ecarts: [{ element: element(1, { statut: 'VERIFIE', resultat: 'ABSENTE', note: 'Cherchée sur toute la travée' }), ouvert: true, ecartsActuels: ['INTROUVABLE'] },
        { element: element(2, { statut: 'VERIFIE', resultat: 'AUTRE_EMPLACEMENT', uniteConstatee: place(2) }), ouvert: false, ecartsActuels: [] }],
    reportes: [element(3, { statut: 'REPORTE', motifReport: 'Local inaccessible' })] });

it('le procès-verbal liste les écarts avec leur sort actuel et les éléments reportés, et s’imprime', async () => {
    fixture.heritage.recolementReport.mockResolvedValue(report());
    const dialog = await openCampaign();
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Procès-verbal' }));
    expect(await within(dialog).findByText('Écarts constatés (2)')).toBeTruthy();
    expect(within(dialog).getByText(/1 écart encore ouvert aujourd’hui ; les autres ont été régularisés/)).toBeTruthy();
    expect(within(dialog).getByText('Encore ouvert', { selector: '.badge' })).toBeTruthy();
    expect(within(dialog).getByText('Régularisé', { selector: '.badge' })).toBeTruthy();
    expect(within(dialog).getByText('Éléments reportés (1)')).toBeTruthy();
    expect(within(dialog).getByText(/Local inaccessible/)).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Imprimer le procès-verbal' })).toBeTruthy();
});

it('sans l’habilitation de récolement, le procès-verbal détaillé n’est pas demandé', async () => {
    fixture.allowed = new Set(['HERITAGE_READ']);
    const dialog = await openCampaign(campaign({ peutConstater: false }));
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Procès-verbal' }));
    expect(await within(dialog).findByText(/exige l’habilitation de récolement/)).toBeTruthy();
    expect(fixture.heritage.recolementReport).not.toHaveBeenCalled();
});

it('l’historique nomme les passages et garde la conclusion et le motif, le plus récent en premier', async () => {
    const journal: RecolementJournalEntry[] = [
        { id: ID + 'j1', genre: 'CREATION', champ: null, ancienneValeur: null, nouvelleValeur: { numero: 'REC-2026-000001' }, motif: null, auteurId: null, createdAt: '2026-10-01T08:00:00Z' },
        { id: ID + 'j2', genre: 'MODIFICATION', champ: null, ancienneValeur: null, nouvelleValeur: ['libelle', 'dates'], motif: null, auteurId: null, createdAt: '2026-10-01T08:30:00Z' },
        { id: ID + 'j3', genre: 'TRANSITION', champ: 'statut', ancienneValeur: 'PLANIFIEE', nouvelleValeur: 'EN_COURS', motif: null, auteurId: null, createdAt: '2026-10-01T09:00:00Z' },
        { id: ID + 'j4', genre: 'TRANSITION', champ: 'statut', ancienneValeur: 'EN_COURS', nouvelleValeur: 'CLOTUREE', motif: 'Campagne terminée, deux écarts', auteurId: null, createdAt: '2026-10-20T16:00:00Z' }];
    fixture.heritage.recolementJournal.mockResolvedValue(journal);
    const dialog = await openCampaign();
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Historique' }));
    await within(dialog).findByText(/En cours → Clôturée/);
    const items = [...dialog.querySelectorAll('.asset-journal > li')].map(li => li.textContent ?? '');
    expect(items).toHaveLength(4);
    expect(items[0]).toMatch(/Passage.*En cours → Clôturée.*Conclusion : Campagne terminée, deux écarts/);
    expect(items[1]).toMatch(/Planifiée → En cours/);
    expect(items[2]).toMatch(/Modification.*Libellé, Dates prévues/);
    expect(items[3]).toMatch(/Campagne créée/);
});
