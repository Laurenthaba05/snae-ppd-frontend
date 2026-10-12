import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { DigitizationOrder, DigitizationOrderPage, DigitizationOrderRow, HeritageAsset, MovementRequest, OrderProject, OrderStage, OrderStatus, OrderTransitionOption } from '../../src/core/types';
const INST = '00000000-0000-4000-8000-0000000000a1';
const fixture = vi.hoisted(() => ({
    epoch: 1, me: null as unknown, allowed: new Set<string>(['HERITAGE_READ', 'HERITAGE_DIGITIZATION_ORDER']),
    heritage: { digitizations: vi.fn(), digitization: vi.fn(), digitizationJournal: vi.fn(), digitizationProjects: vi.fn(), movement: vi.fn(), movementJournal: vi.fn(), references: vi.fn(), command: vi.fn() },
    records: { documentTypes: vi.fn(), documents: vi.fn() },
    navigate: vi.fn()
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
vi.mock('../../src/ui/navigation', () => ({ navigate: (path: string) => fixture.navigate(path) }));
import { DigitizationOrdersPanel, DigitizationTab } from '../../src/ui/HeritageDigitization';

const ID = '00000000-0000-4000-8000-0000000000';
const option = (vers: OrderStatus, extra: Partial<OrderTransitionOption> = {}): OrderTransitionOption =>
    ({ vers, permissions: ['DIGITIZATION_MANAGE'], peutAgir: true, motifRequis: false, projetRequis: vers === 'EN_COURS', bloquants: [], ...extra });
const step = (par = 'Awa Camara', le = '2026-10-01T09:00:00Z') => ({ parId: ID + 'u1', par, le });
const order = (extra: Partial<DigitizationOrder> = {}): DigitizationOrder => ({ id: ID + 'n1', numero: 'NUM-2026-000001', bienId: ID + 'b1', bienIdentifiant: 'PAT-000001', bienIntitule: 'Atlas du cercle de Kankan', institutionId: INST,
    archiveId: ID + 'a1', cote: 'ARCH-001', documentId: ID + 'd1', documentIdentifiant: 'NUM-2026-000001', statut: 'COMMANDEE', etape: 'A_PRENDRE_EN_CHARGE', motif: 'Numérisation de l’atlas pour sa consultation',
    consignes: 'Gants, support rigide', resolutionMinDpi: 400, pagesAttendues: 48, rectoVerso: false, reprise: false, commande: step(), priseEnCharge: null, reception: null, receptionNote: null, fermeture: null, fermeMotif: null,
    mouvement: { id: ID + 'm1', numero: 'MVT-2026-000001', statut: 'AUTORISEE', destination: 'Atelier de numérisation', destinataire: 'Atelier', retourPrevu: '2026-11-05', enRetard: false, joursRetard: null },
    element: null, passages: [option('EN_COURS'), option('ANNULEE', { permissions: ['HERITAGE_DIGITIZATION_ORDER'], motifRequis: true, projetRequis: false })], version: 3, createdAt: '2026-10-01T09:00:00Z', ...extra });
const row = (extra: Partial<DigitizationOrderRow> = {}): DigitizationOrderRow => ({ id: ID + 'n1', numero: 'NUM-2026-000001', bienId: ID + 'b1', bienIdentifiant: 'PAT-000001', bienIntitule: 'Atlas du cercle de Kankan', archiveId: ID + 'a1', cote: 'ARCH-001',
    statut: 'COMMANDEE', etape: 'A_PRENDRE_EN_CHARGE', retourPrevu: '2026-11-05', enRetard: false, joursRetard: null, reprise: false, commandeLe: '2026-10-01T09:00:00Z', commandePar: 'Awa Camara', elementStatut: null, ...extra });
const page = (items: DigitizationOrderRow[]): DigitizationOrderPage => ({ items, page: 0, size: 20, total: items.length, hasMore: false });
const asset = (extra: Partial<HeritageAsset> = {}) => ({ id: ID + 'b1', version: 4, institutionId: INST, champs: { natureOriginale: 'PHYSIQUE' }, originaux: [{ archivePhysiqueId: ID + 'a1', cote: 'ARCH-001', libelle: 'Atlas', support: null, etatPhysique: null }], ...extra }) as unknown as HeritageAsset;
const projects: OrderProject[] = [
    { id: ID + 'p1', nom: 'Projet cartes', code: 'CARTES', lots: [{ id: ID + 'l3', code: 'L-300', nom: null, resolutionMinDpi: 300 }, { id: ID + 'l4', code: 'L-400', nom: 'Cartes fines', resolutionMinDpi: 400 }] },
    { id: ID + 'p2', nom: 'Projet registres', code: null, lots: [] }];

beforeEach(() => {
    fixture.allowed = new Set(['HERITAGE_READ', 'HERITAGE_DIGITIZATION_ORDER']);
    for (const fn of Object.values(fixture.heritage)) fn.mockReset();
    fixture.navigate.mockReset();
    fixture.records.documentTypes.mockReset().mockResolvedValue([{ id: ID + 't1', code: 'REPRESENTATION', label: 'Représentation numérique', family: null, status: 'ACTIF' }, { id: ID + 't2', code: 'ANCIEN', label: 'Ancien type', family: null, status: 'INACTIF' }]);
    fixture.heritage.digitizations.mockResolvedValue(page([]));
    fixture.heritage.digitization.mockResolvedValue(order());
    fixture.heritage.digitizationJournal.mockResolvedValue([]);
    fixture.heritage.digitizationProjects.mockResolvedValue(projects);
    fixture.heritage.references.mockResolvedValue([]);
    fixture.heritage.movement.mockResolvedValue({ id: ID + 'm1', numero: 'MVT-2026-000001', bienId: ID + 'b1', bienIdentifiant: 'PAT-000001', bienIntitule: 'Atlas du cercle de Kankan', institutionId: INST, archiveId: ID + 'a1', cote: 'ARCH-001',
        objet: 'NUMERISATION', motif: 'Numérisation NUM-2026-000001 : Numérisation de l’atlas', destination: 'Atelier de numérisation', destinataire: 'Atelier', retourPrevu: '2026-11-05', statut: 'AUTORISEE', demande: step(), decision: step('Mamadou Bah'),
        decisionMotif: null, conditions: null, remise: null, mouvementId: null, reception: null, retour: null, retourConforme: null, retourNote: null, retourConstatId: null, fermeture: null, fermeMotif: null, enRetard: false, joursRetard: null,
        modifiable: false, passages: [], version: 2, createdAt: '2026-10-01T09:00:00Z', numerisation: { id: ID + 'n1', numero: 'NUM-2026-000001', statut: 'COMMANDEE' } } as MovementRequest);
    fixture.heritage.movementJournal.mockResolvedValue([]);
    fixture.heritage.command.mockResolvedValue(order());
});

const top = () => { const all = screen.getAllByRole('dialog'); return all[all.length - 1]!; };
const card = async (cote = 'ARCH-001') => await screen.findByRole('region', { name: 'Numérisation de ' + cote });

it('l’onglet d’un original sans commande propose d’en passer une, et rappelle les deux autres personnes qui interviennent', async () => {
    render(<DigitizationTab asset={asset()} onChanged={vi.fn()} />);
    const c = await card();
    expect(within(c).getByText('Aucune commande ouverte')).toBeTruthy();
    expect(within(c).getByText(/Cet original n’a pas de numérisation en cours/)).toBeTruthy();
    expect(within(c).getByRole('button', { name: 'Commander une numérisation' })).toBeTruthy();
    expect(screen.getByText(/La numérisation d’un original se commande/)).toBeTruthy();
    expect(fixture.heritage.digitizations).toHaveBeenCalledWith({ bienId: ID + 'b1', page: 0, size: 100 }, expect.anything());
});

it('sans l’habilitation de commander, l’onglet se lit sans bouton de commande', async () => {
    fixture.allowed = new Set(['HERITAGE_READ']);
    render(<DigitizationTab asset={asset()} onChanged={vi.fn()} />);
    expect(within(await card()).queryByRole('button', { name: 'Commander une numérisation' })).toBeNull();
});

it('un bien numérique natif ou sans original n’a rien à numériser', async () => {
    const { unmount } = render(<DigitizationTab asset={asset({ originaux: [] } as Partial<HeritageAsset>)} onChanged={vi.fn()} />);
    expect(await screen.findByText('Aucun original relié')).toBeTruthy();
    unmount();
    render(<DigitizationTab asset={asset({ originaux: [], champs: { natureOriginale: 'NUMERIQUE_NATIF' } } as Partial<HeritageAsset>)} onChanged={vi.fn()} />);
    expect(await screen.findByText('Bien numérique natif')).toBeTruthy();
});

it('une commande ouverte se résume avec son étape et ce qui est attendu, les commandes closes se listent', async () => {
    fixture.heritage.digitizations.mockResolvedValue(page([
        row({ etape: 'NUMERISATION', statut: 'EN_COURS', enRetard: true, joursRetard: 4, retourPrevu: '2026-10-01' }),
        row({ id: ID + 'n0', numero: 'NUM-2026-000000', statut: 'RECEPTIONNEE', etape: 'RECEPTIONNEE' }),
        row({ id: ID + 'n9', numero: 'NUM-2026-000009', statut: 'ANNULEE', etape: 'ANNULEE', reprise: true })]));
    render(<DigitizationTab asset={asset()} onChanged={vi.fn()} />);
    const c = await card();
    expect(within(c).getByText('Numérisation en cours', { selector: '.badge' })).toBeTruthy();
    expect(within(c).getByText('En retard', { selector: '.badge' })).toBeTruthy();
    expect(within(c).getByText(/L’atelier numérise, indexe et fait contrôler les pages dans le suivi du traitement\. En retard de 4 jours\./)).toBeTruthy();
    expect(within(c).queryByRole('button', { name: 'Commander une numérisation' })).toBeNull();
    expect(within(c).getByText('Commandes closes')).toBeTruthy();
    expect(within(c).getByText('NUM-2026-000000')).toBeTruthy();
    expect(within(c).getByText('Réceptionnée', { selector: '.badge' })).toBeTruthy();
    expect(within(c).getByText(/nouvelle numérisation/)).toBeTruthy();
    fireEvent.click(within(c).getByRole('button', { name: 'Ouvrir la commande' }));
    await waitFor(() => expect(fixture.heritage.digitization).toHaveBeenCalledWith(ID + 'n1', expect.anything()));
});

it('la commande exige tout ce qu’une numérisation suppose, ne propose que les types actifs, part avec une clé stable et ouvre la fiche créée', async () => {
    const onChanged = vi.fn();
    render(<DigitizationTab asset={asset()} onChanged={onChanged} />);
    fireEvent.click(await within(await card()).findByRole('button', { name: 'Commander une numérisation' }));
    const dialog = top();
    expect(within(dialog).getByText(/autorisée par une autre personne que vous/)).toBeTruthy();
    const confirm = within(dialog).getByRole('button', { name: 'Commander la numérisation' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    const type = await within(dialog).findByLabelText(/Type du document/) as HTMLSelectElement;
    expect([...type.options].map(o => o.textContent)).toEqual(['Choisir…', 'Représentation numérique']);
    fireEvent.change(type, { target: { value: ID + 't1' } });
    fireEvent.change(within(dialog).getByLabelText(/Pourquoi numériser/), { target: { value: 'court' } });
    expect(within(dialog).getByText(/Le motif dit pourquoi numériser/)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText(/Pourquoi numériser/), { target: { value: '  Numérisation de l’atlas pour sa consultation  ' } });
    fireEvent.change(within(dialog).getByLabelText(/Où l’original ira/), { target: { value: 'Atelier de numérisation' } });
    fireEvent.change(within(dialog).getByLabelText(/Qui le reçoit/), { target: { value: 'Atelier' } });
    fireEvent.change(within(dialog).getByLabelText(/Résolution minimale/), { target: { value: '10' } });
    expect(within(dialog).getByText(/entre 50 et 9600 dpi/)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText(/Résolution minimale/), { target: { value: '400' } });
    fireEvent.change(within(dialog).getByLabelText(/Nombre de pages attendu/), { target: { value: '48' } });
    fireEvent.click(within(dialog).getByLabelText('Numérisation recto-verso'));
    fireEvent.change(within(dialog).getByLabelText(/Consignes pour l’atelier/), { target: { value: 'Gants, support rigide' } });
    const near = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/Retour prévu/), { target: { value: near } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    const [path, body, key, method] = fixture.heritage.command.mock.calls[0]!;
    expect(path).toBe('/assets/' + ID + 'b1/originals/' + ID + 'a1/digitizations');
    expect(body).toEqual({ typeDocumentId: ID + 't1', motif: 'Numérisation de l’atlas pour sa consultation', destination: 'Atelier de numérisation', destinataire: 'Atelier', retourPrevu: near, rectoVerso: true,
        consignes: 'Gants, support rigide', resolutionMinDpi: 400, pagesAttendues: 48 });
    expect(typeof key).toBe('string'); expect(method).toBe('POST');
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    await waitFor(() => expect(fixture.heritage.digitization).toHaveBeenCalledWith(ID + 'n1', expect.anything()));
});

async function openFiche(o: DigitizationOrder) {
    fixture.heritage.digitization.mockResolvedValue(o);
    fixture.heritage.digitizations.mockResolvedValue(page([row({ statut: o.statut, etape: o.etape })]));
    render(<DigitizationTab asset={asset()} onChanged={vi.fn()} />);
    fireEvent.click(await within(await card()).findByRole('button', { name: ['RECEPTIONNEE', 'ANNULEE'].includes(o.statut) ? 'Ouvrir' : 'Ouvrir la commande' }));
    return await screen.findByRole('dialog');
}

it('la fiche montre le déroulé, ce qui est attendu, les consignes, la sortie de l’original et les passages possibles', async () => {
    fixture.heritage.digitizationJournal.mockResolvedValue([
        { id: ID + 'j1', genre: 'CREATION', champ: null, ancienneValeur: null, nouvelleValeur: { numero: 'NUM-2026-000001' }, motif: null, auteurId: null, createdAt: '2026-10-01T09:00:00Z' }]);
    const dialog = await openFiche(order());
    expect(await within(dialog).findByText('Atlas du cercle de Kankan')).toBeTruthy();
    expect(within(dialog).getByText('Commandée', { selector: '.badge' })).toBeTruthy();
    expect(within(dialog).getByText('À prendre en charge', { selector: '.badge' })).toBeTruthy();
    expect(within(dialog).getByText(/L’atelier de numérisation prend la commande en charge/)).toBeTruthy();
    const steps = [...document.querySelectorAll('.order-timeline li')].map(li => li.className + ':' + (li.firstElementChild?.nextSibling?.textContent ?? ''));
    expect(steps).toHaveLength(8);
    expect(steps.slice(0, 3)).toEqual(['done:Commandée', 'done:Sortie autorisée', 'current:Prise en charge par l’atelier']);
    expect(within(dialog).getByText('Gants, support rigide')).toBeTruthy();
    expect(within(dialog).getByText('400 dpi')).toBeTruthy();
    expect(within(dialog).getByText('MVT-2026-000001', { selector: 'strong' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Prendre en charge' })).toBeTruthy();
    const cancel = within(dialog).getByRole('button', { name: 'Annuler la commande' });
    expect(cancel).toBeTruthy();
    await waitFor(() => expect(within(dialog).getByText('Commande déposée')).toBeTruthy());
});

it('un passage que la personne ne peut pas faire est grisé avec la raison, et les obstacles sont affichés', async () => {
    const dialog = await openFiche(order({ etape: 'A_RECEPTIONNER', statut: 'EN_COURS', passages: [
        option('RECEPTIONNEE', { permissions: ['HERITAGE_DIGITIZATION_RECEIVE'], bloquants: [{ code: 'FOUR_EYES', message: 'La représentation doit être réceptionnée par une autre personne que celle qui a commandé la numérisation.', bloque: null }] }),
        option('ANNULEE', { permissions: ['HERITAGE_DIGITIZATION_ORDER'], peutAgir: false, motifRequis: true, projetRequis: false })] }));
    const receive = await within(dialog).findByRole('button', { name: 'Réceptionner la représentation' }) as HTMLButtonElement;
    expect(receive.disabled).toBe(true);
    expect(receive.title).toBe('Conditions non remplies');
    expect(within(dialog).getByRole('list', { name: 'Réceptionner la représentation' }).textContent).toContain('autre personne que celle qui a commandé');
    const cancel = within(dialog).getByRole('button', { name: 'Annuler la commande' }) as HTMLButtonElement;
    expect(cancel.disabled).toBe(true);
    expect(cancel.title).toContain('Habilitation requise');
});

it('l’atelier choisit un projet, et un lot qui respecte la résolution minimale commandée, avant de prendre la commande en charge', async () => {
    const dialog = await openFiche(order());
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Prendre en charge' }));
    const form = top();
    expect(within(form).getByText(/crée l’élément de numérisation/)).toBeTruthy();
    expect(within(form).getByText('400 dpi', { selector: 'strong' })).toBeTruthy();
    const confirm = within(form).getByRole('button', { name: 'Confirmer' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    const project = await within(form).findByLabelText(/Projet de numérisation/) as HTMLSelectElement;
    fireEvent.change(project, { target: { value: ID + 'p1' } });
    expect(within(form).getByText(/résolution minimale de 400 dpi/)).toBeTruthy();
    expect(confirm.disabled).toBe(true);
    const lot = within(form).getByLabelText(/Lot/) as HTMLSelectElement;
    expect([...lot.options].map(o => o.textContent)).toEqual(['Choisir…', 'L-300 (300 dpi minimum)', 'L-400 — Cartes fines (400 dpi minimum)']);
    fireEvent.change(lot, { target: { value: ID + 'l3' } });
    expect(within(form).getByText(/La résolution minimale du lot \(300 dpi\) est inférieure/)).toBeTruthy();
    expect(confirm.disabled).toBe(true);
    fireEvent.change(lot, { target: { value: ID + 'l4' } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    const [path, body, , method] = fixture.heritage.command.mock.calls[0]!;
    expect(path).toBe('/digitizations/' + ID + 'n1/transitions');
    expect(body).toEqual({ vers: 'EN_COURS', expectedVersion: 3, projetId: ID + 'p1', lotId: ID + 'l4' });
    expect(method).toBe('POST');
});

it('sans résolution minimale commandée, le lot est facultatif', async () => {
    const dialog = await openFiche(order({ resolutionMinDpi: null }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Prendre en charge' }));
    const form = top();
    fireEvent.change(await within(form).findByLabelText(/Projet de numérisation/), { target: { value: ID + 'p2' } });
    expect((within(form).getByRole('button', { name: 'Confirmer' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(within(form).getByRole('button', { name: 'Confirmer' }));
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    expect(fixture.heritage.command.mock.calls[0]![1]).toEqual({ vers: 'EN_COURS', expectedVersion: 3, projetId: ID + 'p2' });
});

it('réceptionner la représentation demande une note facultative et part avec la version attendue', async () => {
    const dialog = await openFiche(order({ statut: 'EN_COURS', etape: 'A_RECEPTIONNER', passages: [option('RECEPTIONNEE', { permissions: ['HERITAGE_DIGITIZATION_RECEIVE'], projetRequis: false })] }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Réceptionner la représentation' }));
    const form = top();
    expect(within(form).getByText(/par une autre personne que celle qui a commandé/)).toBeTruthy();
    const confirm = within(form).getByRole('button', { name: 'Confirmer' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);
    fireEvent.change(within(form).getByLabelText(/Note de réception/), { target: { value: ' Pages contrôlées par sondage ' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    expect(fixture.heritage.command.mock.calls[0]![1]).toEqual({ vers: 'RECEPTIONNEE', expectedVersion: 3, texte: 'Pages contrôlées par sondage' });
});

it('annuler la commande exige un motif écrit et prévient de ses effets', async () => {
    const dialog = await openFiche(order({ passages: [option('ANNULEE', { permissions: ['HERITAGE_DIGITIZATION_ORDER'], motifRequis: true, projetRequis: false })] }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Annuler la commande' }));
    const form = top();
    expect(within(form).getByText(/annule la demande de sortie de l’original/)).toBeTruthy();
    const confirm = within(form).getByRole('button', { name: 'Confirmer' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(form).getByLabelText(/Motif/), { target: { value: 'La commande a été passée pour le mauvais bien' } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    expect(fixture.heritage.command.mock.calls[0]![1]).toEqual({ vers: 'ANNULEE', expectedVersion: 3, texte: 'La commande a été passée pour le mauvais bien' });
});

it('la fiche d’une commande prise en charge ouvre la sortie liée et, avec le droit de lire la numérisation, le suivi du traitement', async () => {
    fixture.allowed = new Set(['HERITAGE_READ', 'HERITAGE_DIGITIZATION_ORDER', 'DIGITIZATION_READ']);
    const dialog = await openFiche(order({ statut: 'EN_COURS', etape: 'NUMERISATION', priseEnCharge: step('Fatou Sow'), passages: [],
        mouvement: { id: ID + 'm1', numero: 'MVT-2026-000001', statut: 'REMISE', destination: 'Atelier de numérisation', destinataire: 'Atelier', retourPrevu: '2026-10-01', enRetard: true, joursRetard: 4 },
        element: { id: ID + 'e1', statut: 'CONTROLE_QUALITE', projetId: ID + 'p1', projetNom: 'Projet cartes', lotId: ID + 'l4', lotCode: 'L-400', pagesAttendues: 48, pagesPresentes: 12 } }));
    expect(await within(dialog).findByText(/Projet cartes · lot L-400 — Contrôle qualité · 12 pages sur 48/)).toBeTruthy();
    expect(within(dialog).getByText(/vers Atelier de numérisation \(Atelier\), retour prévu le 1 octobre 2026 · En retard de 4 jours/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ouvrir la sortie' }));
    await waitFor(() => expect(fixture.heritage.movement).toHaveBeenCalledWith(ID + 'm1', expect.anything()));
    expect(await screen.findByText(/Cette sortie est liée à la commande de numérisation/)).toBeTruthy();
    fireEvent.click(within(top()).getAllByRole('button', { name: 'Fermer' }).pop()!);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ouvrir dans le suivi du traitement' }));
    expect(fixture.navigate).toHaveBeenCalledWith('/app/numerisation?project=' + ID + 'p1&element=' + ID + 'e1');
});

it('sans le droit de lire la numérisation, le suivi du traitement ne s’ouvre pas', async () => {
    const dialog = await openFiche(order({ statut: 'EN_COURS', etape: 'NUMERISATION', passages: [],
        element: { id: ID + 'e1', statut: 'NUMERISATION', projetId: ID + 'p1', projetNom: 'Projet cartes', lotId: null, lotCode: null, pagesAttendues: null, pagesPresentes: 0 } }));
    expect(await within(dialog).findByText(/Projet cartes — Numérisation · 0 page/)).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Ouvrir dans le suivi du traitement' })).toBeNull();
});

it('la liste de la page montre les commandes à prendre en charge d’abord et ouvre la fiche d’une commande', async () => {
    fixture.heritage.digitizations.mockResolvedValue(page([
        row(),
        row({ id: ID + 'n2', numero: 'NUM-2026-000002', statut: 'EN_COURS', etape: 'NUMERISATION', elementStatut: 'NUMERISATION', bienIdentifiant: 'PAT-000002', bienIntitule: 'Registre', cote: 'ARCH-002', enRetard: true, joursRetard: 4, retourPrevu: '2026-10-01', reprise: true })]));
    render(<DigitizationOrdersPanel />);
    expect(await screen.findByText('2 commandes')).toBeTruthy();
    const rows = [...document.querySelectorAll('tbody tr')].map(tr => tr.textContent ?? '');
    expect(rows[0]).toMatch(/NUM-2026-000001.*PAT-000001.*ARCH-001.*—.*À prendre en charge/);
    expect(rows[1]).toMatch(/NUM-2026-000002.*nouvelle numérisation.*PAT-000002.*ARCH-002.*En retard de 4 jours.*Numérisation.*Numérisation en cours.*En retard/);
    expect(fixture.heritage.digitizations).toHaveBeenCalledWith(expect.objectContaining({ statut: 'OUVERTES', page: 0, size: 20 }), expect.anything());
    fireEvent.click(screen.getByRole('button', { name: 'NUM-2026-000001' }));
    await waitFor(() => expect(fixture.heritage.digitization).toHaveBeenCalledWith(ID + 'n1', expect.anything()));
});

it('les filtres de la liste distinguent les commandes à prendre en charge et mes commandes', async () => {
    render(<DigitizationOrdersPanel />);
    await screen.findByText('Aucune commande');
    const select = screen.getByLabelText('Étape') as HTMLSelectElement;
    expect([...select.options].map(o => o.value).slice(0, 3)).toEqual(['', 'OUVERTES', 'A_PRENDRE_EN_CHARGE']);
    fireEvent.change(select, { target: { value: 'A_PRENDRE_EN_CHARGE' } });
    await waitFor(() => expect(fixture.heritage.digitizations).toHaveBeenLastCalledWith(expect.objectContaining({ statut: 'A_PRENDRE_EN_CHARGE', mine: '' }), expect.anything()));
    fireEvent.click(screen.getByLabelText('Mes commandes'));
    await waitFor(() => expect(fixture.heritage.digitizations).toHaveBeenLastCalledWith(expect.objectContaining({ mine: 'true' }), expect.anything()));
    expect(await screen.findByText('Aucune commande ne correspond à ces critères.')).toBeTruthy();
});

it('sans commande dans le périmètre, la liste explique où les passer', async () => {
    render(<DigitizationOrdersPanel />);
    expect(await screen.findByText('Aucune commande')).toBeTruthy();
    expect(screen.getByText(/onglet « Numérisation »/)).toBeTruthy();
});
