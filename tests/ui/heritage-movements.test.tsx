import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { HeritageAsset, HeritageReference, MovementPage, MovementRequest, MovementRequestStatus, MovementRow, MovementTransitionOption } from '../../src/core/types';
const INST = '00000000-0000-4000-8000-0000000000a1';
const fixture = vi.hoisted(() => ({
    epoch: 1, me: null as unknown, allowed: new Set<string>(['HERITAGE_READ', 'HERITAGE_MOVEMENT_REQUEST']),
    heritage: { movements: vi.fn(), movement: vi.fn(), movementJournal: vi.fn(), references: vi.fn(), command: vi.fn() },
    records: { documents: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
import { MovementsPanel, MovementsTab } from '../../src/ui/HeritageMovements';

const ID = '00000000-0000-4000-8000-0000000000';
const alterations: HeritageReference[] = [
    { domaine: 'ALTERATION', code: 'DECHIRURE', libelle: 'Déchirure', description: null, ordre: 10, actif: true },
    { domaine: 'ALTERATION', code: 'TACHE', libelle: 'Tache', description: null, ordre: 30, actif: true }];
const option = (vers: MovementRequestStatus, extra: Partial<MovementTransitionOption> = {}): MovementTransitionOption =>
    ({ vers, permissions: ['HERITAGE_MOVEMENT_AUTHORIZE'], peutAgir: true, motifRequis: false, conditionsRequises: false, conformiteRequise: false, bloquants: [], ...extra });
const step = (par = 'Awa Camara', le = '2026-10-01T09:00:00Z') => ({ parId: ID + 'u1', par, le });
const request = (extra: Partial<MovementRequest> = {}): MovementRequest => ({ id: ID + 'm1', numero: 'MVT-2026-000001', bienId: ID + 'b1', bienIdentifiant: 'PAT-000001', bienIntitule: 'Registre des naissances', institutionId: INST,
    archiveId: ID + 'a1', cote: 'ARCH-001', objet: 'CONSULTATION', motif: 'Consultation par un chercheur accrédité', destination: 'Salle de lecture', destinataire: 'Équipe de recherche', retourPrevu: '2026-10-20',
    statut: 'DEMANDEE', demande: step(), decision: null, decisionMotif: null, conditions: null, remise: null, mouvementId: null, reception: null, retour: null, retourConforme: null, retourNote: null, retourConstatId: null,
    fermeture: null, fermeMotif: null, enRetard: false, joursRetard: null, modifiable: false,
    passages: [option('AUTORISEE'), option('REFUSEE', { motifRequis: true }), option('ANNULEE', { permissions: ['HERITAGE_MOVEMENT_REQUEST'], motifRequis: true, peutAgir: false })], version: 2, createdAt: '2026-10-01T09:00:00Z', ...extra });
const row = (extra: Partial<MovementRow> = {}): MovementRow => ({ id: ID + 'm1', numero: 'MVT-2026-000001', bienId: ID + 'b1', bienIdentifiant: 'PAT-000001', bienIntitule: 'Registre des naissances', archiveId: ID + 'a1', cote: 'ARCH-001',
    objet: 'CONSULTATION', destination: 'Salle de lecture', destinataire: 'Équipe de recherche', retourPrevu: '2026-10-20', statut: 'DEMANDEE', demandeLe: '2026-10-01T09:00:00Z', demandePar: 'Awa Camara', enRetard: false, joursRetard: null, ...extra });
const page = (items: MovementRow[], extra: Partial<MovementPage> = {}): MovementPage => ({ items, page: 0, size: 20, total: items.length, hasMore: false, ...extra });
const asset = (extra: Partial<HeritageAsset> = {}) => ({ id: ID + 'b1', version: 4, institutionId: INST, champs: { natureOriginale: 'PHYSIQUE' }, originaux: [{ archivePhysiqueId: ID + 'a1', cote: 'ARCH-001', libelle: 'Registre des naissances', support: null, etatPhysique: null }], ...extra }) as unknown as HeritageAsset;

beforeEach(() => {
    fixture.allowed = new Set(['HERITAGE_READ', 'HERITAGE_MOVEMENT_REQUEST']);
    for (const fn of Object.values(fixture.heritage)) fn.mockReset();
    fixture.records.documents.mockReset().mockResolvedValue({ items: [], page: 0, size: 100, hasMore: false });
    fixture.heritage.references.mockResolvedValue(alterations);
    fixture.heritage.movements.mockResolvedValue(page([]));
    fixture.heritage.movement.mockResolvedValue(request());
    fixture.heritage.movementJournal.mockResolvedValue([]);
    fixture.heritage.command.mockResolvedValue(request());
});

const top = () => { const all = screen.getAllByRole('dialog'); return all[all.length - 1]!; };
const card = async (cote = 'ARCH-001') => await screen.findByRole('region', { name: 'Mouvements de ' + cote });

it('l’onglet d’un original en réserve propose de demander un mouvement, et rappelle que la sortie sera autorisée par une autre personne', async () => {
    render(<MovementsTab asset={asset()} onChanged={vi.fn()} />);
    const c = await card();
    expect(within(c).getByText('Aucune demande ouverte')).toBeTruthy();
    expect(within(c).getByText(/Cet original est en réserve/)).toBeTruthy();
    expect(within(c).getByRole('button', { name: 'Demander un mouvement' })).toBeTruthy();
    expect(screen.getByText(/la sortie est demandée, autorisée par une autre personne/)).toBeTruthy();
    expect(fixture.heritage.movements).toHaveBeenCalledWith({ bienId: ID + 'b1', page: 0, size: 100 }, expect.anything());
});

it('sans l’habilitation de demander, l’onglet se lit sans bouton de demande', async () => {
    fixture.allowed = new Set(['HERITAGE_READ']);
    render(<MovementsTab asset={asset()} onChanged={vi.fn()} />);
    const c = await card();
    expect(within(c).queryByRole('button', { name: 'Demander un mouvement' })).toBeNull();
});

it('un bien numérique natif ou sans original n’a rien à déplacer', async () => {
    const { unmount } = render(<MovementsTab asset={asset({ originaux: [] } as Partial<HeritageAsset>)} onChanged={vi.fn()} />);
    expect(await screen.findByText('Aucun original relié')).toBeTruthy();
    unmount();
    render(<MovementsTab asset={asset({ originaux: [], champs: { natureOriginale: 'NUMERIQUE_NATIF' } } as Partial<HeritageAsset>)} onChanged={vi.fn()} />);
    expect(await screen.findByText('Bien numérique natif')).toBeTruthy();
});

it('une demande ouverte se résume avec son étape et ce qui est attendu, et remplace le bouton de demande', async () => {
    fixture.heritage.movements.mockResolvedValue(page([row({ statut: 'RECUE', retourPrevu: '2026-10-01', enRetard: true, joursRetard: 4 })]));
    render(<MovementsTab asset={asset()} onChanged={vi.fn()} />);
    const c = await card();
    expect(within(c).getByText('Reçue', { selector: '.badge' })).toBeTruthy();
    expect(within(c).getByText('En retard', { selector: '.badge' })).toBeTruthy();
    expect(within(c).getByText(/MVT-2026-000001/)).toBeTruthy();
    expect(within(c).getByText(/Consultation vers Salle de lecture \(Équipe de recherche\), retour prévu le 1 octobre 2026 · En retard de 4 jours/)).toBeTruthy();
    expect(within(c).getByText(/L’original est chez son destinataire/)).toBeTruthy();
    expect(within(c).queryByRole('button', { name: 'Demander un mouvement' })).toBeNull();
    fireEvent.click(within(c).getByRole('button', { name: 'Ouvrir la demande' }));
    await waitFor(() => expect(fixture.heritage.movement).toHaveBeenCalledWith(ID + 'm1', expect.anything()));
});

it('les demandes closes se listent avec leur étape', async () => {
    fixture.heritage.movements.mockResolvedValue(page([row({ id: ID + 'm0', numero: 'MVT-2026-000000', statut: 'RETOURNEE', objet: 'NUMERISATION', destination: 'Atelier' }), row({ id: ID + 'm9', numero: 'MVT-2026-000009', statut: 'REFUSEE' })]));
    render(<MovementsTab asset={asset()} onChanged={vi.fn()} />);
    const c = await card();
    expect(within(c).getByText('Demandes closes')).toBeTruthy();
    expect(within(c).getByText('MVT-2026-000000')).toBeTruthy();
    expect(within(c).getByText('Rendue', { selector: '.badge' })).toBeTruthy();
    expect(within(c).getByText('Refusée', { selector: '.badge' })).toBeTruthy();
    expect(within(c).getByRole('button', { name: 'Demander un mouvement' })).toBeTruthy();
});

it('la demande exige tout ce qu’une sortie suppose, part avec une clé stable et ouvre la fiche créée', async () => {
    const onChanged = vi.fn();
    fixture.heritage.command.mockResolvedValue(request());
    render(<MovementsTab asset={asset()} onChanged={onChanged} />);
    fireEvent.click(await within(await card()).findByRole('button', { name: 'Demander un mouvement' }));
    const dialog = top();
    expect(within(dialog).getByText(/autorisée par une autre personne que vous/)).toBeTruthy();
    const confirm = within(dialog).getByRole('button', { name: 'Déposer la demande' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    const purposes = [...(within(dialog).getByLabelText(/Pour quoi/) as HTMLSelectElement).options].map(o => o.value);
    // La numérisation se commande : elle n'est pas offerte parmi les objets d'une demande de sortie ordinaire.
    expect(purposes).not.toContain('NUMERISATION');
    expect(purposes).not.toContain('PRET'); expect(purposes).not.toContain('EXPOSITION'); expect(purposes).toContain('EXPERTISE');
    fireEvent.change(within(dialog).getByLabelText(/Pour quoi/), { target: { value: 'EXPERTISE' } });
    fireEvent.change(within(dialog).getByLabelText(/Motif/), { target: { value: 'court' } });
    expect(within(dialog).getByText(/Le motif dit pourquoi l’original sort/)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText(/Motif/), { target: { value: '  Numérisation du registre complet  ' } });
    fireEvent.change(within(dialog).getByLabelText(/Où l’original ira/), { target: { value: 'Atelier de numérisation' } });
    fireEvent.change(within(dialog).getByLabelText(/Qui le reçoit/), { target: { value: 'Atelier' } });
    expect(confirm.disabled).toBe(true);
    const due = '2099-01-15';
    fireEvent.change(within(dialog).getByLabelText(/Retour prévu/), { target: { value: due } });
    expect(within(dialog).getByText(/ne peut pas dépasser cinq ans/)).toBeTruthy();
    expect(confirm.disabled).toBe(true);
    const near = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    fireEvent.change(within(dialog).getByLabelText(/Retour prévu/), { target: { value: near } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    const [path, body, key, method] = fixture.heritage.command.mock.calls[0]!;
    expect(path).toBe('/assets/' + ID + 'b1/originals/' + ID + 'a1/movements');
    expect(body).toEqual({ objet: 'EXPERTISE', motif: 'Numérisation du registre complet', destination: 'Atelier de numérisation', destinataire: 'Atelier', retourPrevu: near });
    expect(typeof key).toBe('string'); expect(method).toBe('POST');
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    await waitFor(() => expect(fixture.heritage.movement).toHaveBeenCalledWith(ID + 'm1', expect.anything()));
});

async function openFiche(m: MovementRequest) {
    fixture.heritage.movement.mockResolvedValue(m);
    fixture.heritage.movements.mockResolvedValue(page([row({ statut: m.statut })]));
    render(<MovementsTab asset={asset()} onChanged={vi.fn()} />);
    fireEvent.click(await within(await card()).findByRole('button', { name: ['REFUSEE', 'ANNULEE', 'RETOURNEE'].includes(m.statut) ? 'Ouvrir' : 'Ouvrir la demande' }));
    return await screen.findByRole('dialog');
}

it('la fiche d’une demande montre pour quoi, où, pour qui, jusqu’à quand, ce qui est attendu et les passages possibles', async () => {
    fixture.heritage.movementJournal.mockResolvedValue([
        { id: ID + 'j1', genre: 'CREATION', champ: null, ancienneValeur: null, nouvelleValeur: { numero: 'MVT-2026-000001' }, motif: null, auteurId: null, createdAt: '2026-10-01T09:00:00Z' }]);
    const dialog = await openFiche(request());
    expect(await within(dialog).findByText('Registre des naissances')).toBeTruthy();
    expect(within(dialog).getByText('Demandée', { selector: '.badge' })).toBeTruthy();
    expect(within(dialog).getByText('Consultation', { selector: '.badge' })).toBeTruthy();
    expect(within(dialog).getByText(/Une autre personne que le demandeur autorise ou refuse la sortie/)).toBeTruthy();
    expect(within(dialog).getByText('Salle de lecture')).toBeTruthy();
    expect(within(dialog).getByText('Équipe de recherche')).toBeTruthy();
    expect(within(dialog).getByText('Consultation par un chercheur accrédité')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Autoriser la sortie' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Refuser la demande' })).toBeTruthy();
    const cancel = within(dialog).getByRole('button', { name: 'Annuler la demande' }) as HTMLButtonElement;
    expect(cancel.disabled).toBe(true);
    expect(cancel.title).toContain('Habilitation requise');
    await waitFor(() => expect(within(dialog).getByText('Demande déposée')).toBeTruthy());
});

it('une sortie liée à une commande de numérisation le dit, et ne se modifie pas', async () => {
    const dialog = await openFiche(request({ objet: 'NUMERISATION', modifiable: false, numerisation: { id: ID + 'n1', numero: 'NUM-2026-000001', statut: 'EN_COURS' } }));
    expect(await within(dialog).findByText(/Cette sortie est liée à la commande de numérisation/)).toBeTruthy();
    expect(within(dialog).getByText('NUM-2026-000001', { selector: 'strong' })).toBeTruthy();
    expect(within(dialog).getByText('Numérisation', { selector: '.badge' })).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Modifier la demande' })).toBeNull();
});

it('le demandeur ne peut pas autoriser sa propre demande : le passage est grisé et la raison affichée', async () => {
    const dialog = await openFiche(request({ passages: [option('AUTORISEE', { bloquants: [{ code: 'FOUR_EYES', message: 'La sortie doit être autorisée par une autre personne que celle qui l’a demandée.', bloque: null }] }), option('REFUSEE', { motifRequis: true })] }));
    const authorize = await within(dialog).findByRole('button', { name: 'Autoriser la sortie' }) as HTMLButtonElement;
    expect(authorize.disabled).toBe(true);
    expect(authorize.title).toBe('Conditions non remplies');
    expect(within(dialog).getByRole('list', { name: 'Autoriser la sortie' }).textContent).toContain('autorisée par une autre personne');
});

it('un original à manipuler avec précautions n’est autorisé qu’avec des conditions écrites', async () => {
    const dialog = await openFiche(request({ passages: [option('AUTORISEE', { conditionsRequises: true }), option('REFUSEE', { motifRequis: true })] }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Autoriser la sortie' }));
    const form = top();
    expect(within(form).getByText(/L’autorisation engage l’institution/)).toBeTruthy();
    const confirm = within(form).getByRole('button', { name: 'Confirmer' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(form).getByLabelText(/Conditions de manipulation/), { target: { value: 'court' } });
    expect(within(form).getByText(/Le dernier constat d’état demande des précautions/, { selector: 'li span' })).toBeTruthy();
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(form).getByLabelText(/Conditions de manipulation/), { target: { value: 'Gants de coton, support rigide, pas de photocopie' } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    const [path, body, , method] = fixture.heritage.command.mock.calls[0]!;
    expect(path).toBe('/movements/' + ID + 'm1/transitions');
    expect(body).toEqual({ vers: 'AUTORISEE', expectedVersion: 2, conditions: 'Gants de coton, support rigide, pas de photocopie' });
    expect(method).toBe('POST');
});

it('refuser exige un motif écrit et prévient que la décision est définitive', async () => {
    const dialog = await openFiche(request());
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Refuser la demande' }));
    const form = top();
    expect(within(form).getByText(/Cette décision est définitive/)).toBeTruthy();
    const confirm = within(form).getByRole('button', { name: 'Confirmer' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(form).getByLabelText(/Motif du refus/), { target: { value: 'Le fonds est en cours de récolement, la pièce ne sort pas' } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    expect(fixture.heritage.command.mock.calls[0]![1]).toEqual({ vers: 'REFUSEE', expectedVersion: 2, texte: 'Le fonds est en cours de récolement, la pièce ne sort pas' });
});

it('remettre l’original et confirmer la réception se font d’un clic, sans fenêtre', async () => {
    const dialog = await openFiche(request({ statut: 'AUTORISEE', decision: step('Mamadou Bah'), passages: [option('REMISE', { permissions: ['HERITAGE_MOVEMENT_HANDLE'] }), option('ANNULEE', { motifRequis: true })] }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Remettre l’original' }));
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    expect(fixture.heritage.command.mock.calls[0]![1]).toEqual({ vers: 'REMISE', expectedVersion: 2 });
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    await waitFor(() => expect(fixture.heritage.movement).toHaveBeenCalledTimes(2));
});

it('un original rendu dans l’état où il est parti se confirme sans constat', async () => {
    const dialog = await openFiche(request({ statut: 'RECUE', reception: step(), passages: [option('RETOURNEE', { permissions: ['HERITAGE_MOVEMENT_HANDLE'], conformiteRequise: true })] }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Enregistrer le retour' }));
    const form = top();
    const confirm = within(form).getByRole('button', { name: 'Confirmer' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(within(form).getByRole('radio', { name: /Rendu dans l’état où il est parti/ }));
    expect(confirm.disabled).toBe(false);
    expect(within(form).queryByLabelText(/Observations/)).toBeNull();
    fireEvent.click(confirm);
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    expect(fixture.heritage.command.mock.calls[0]![1]).toEqual({ vers: 'RETOURNEE', expectedVersion: 2, conforme: true });
});

it('un original rendu dans un autre état se décrit et se constate avant d’enregistrer le retour', async () => {
    const dialog = await openFiche(request({ statut: 'RECUE', reception: step(), passages: [option('RETOURNEE', { permissions: ['HERITAGE_MOVEMENT_HANDLE'], conformiteRequise: true })] }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Enregistrer le retour' }));
    const form = top();
    const confirm = within(form).getByRole('button', { name: 'Confirmer' }) as HTMLButtonElement;
    fireEvent.click(within(form).getByRole('radio', { name: /Rendu dans un autre état/ }));
    expect(confirm.disabled).toBe(true);
    expect(within(form).getByText(/Décrivez l’anomalie constatée au retour/)).toBeTruthy();
    fireEvent.change(within(form).getByLabelText(/Anomalie constatée/), { target: { value: 'Déchirure en marge de la page 3' } });
    fireEvent.click(within(form).getByRole('radio', { name: /Fragile/ }));
    fireEvent.change(within(form).getByLabelText(/Manipulation/), { target: { value: 'PRECAUTIONS' } });
    fireEvent.click(within(within(form).getByRole('group', { name: /Altérations constatées/ })).getByLabelText('Déchirure'));
    fireEvent.change(within(form).getByLabelText(/Observations/), { target: { value: 'Déchirure apparue en marge pendant la consultation' } });
    expect(within(form).queryByLabelText(/Circonstances/)).toBeNull();
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    const body = fixture.heritage.command.mock.calls[0]![1] as Record<string, unknown>;
    expect(body).toMatchObject({ vers: 'RETOURNEE', expectedVersion: 2, conforme: false, texte: 'Déchirure en marge de la page 3' });
    expect(body.constat).toEqual({ etat: 'FRAGILE', manipulation: 'PRECAUTIONS', urgence: 'AUCUNE', alterations: ['DECHIRURE'], observations: 'Déchirure apparue en marge pendant la consultation' });
});

it('une demande rendue montre l’état au retour et renvoie au constat d’état du bien', async () => {
    const dialog = await openFiche(request({ statut: 'RETOURNEE', decision: step('Mamadou Bah'), remise: step(), reception: step(), retour: step('Fatou Sow', '2026-10-12T10:00:00Z'), retourConforme: false,
        retourNote: 'Déchirure en marge de la page 3', retourConstatId: ID + 'c1', passages: [] }));
    expect(await within(dialog).findByText('Rendue', { selector: '.badge' })).toBeTruthy();
    expect(within(dialog).getByText('Rendu dans un autre état')).toBeTruthy();
    expect(within(dialog).getByText('Anomalie constatée')).toBeTruthy();
    expect(within(dialog).getByText('Déchirure en marge de la page 3')).toBeTruthy();
    expect(within(dialog).getByText(/voir l’onglet « Conservation » du bien/)).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Enregistrer le retour' })).toBeNull();
});

it('le demandeur modifie sa demande tant qu’elle n’est pas autorisée, avec la version attendue', async () => {
    const dialog = await openFiche(request({ modifiable: true }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Modifier la demande' }));
    const form = top();
    expect((within(form).getByLabelText(/Motif/) as HTMLTextAreaElement).value).toBe('Consultation par un chercheur accrédité');
    fireEvent.change(within(form).getByLabelText(/Où l’original ira/), { target: { value: 'Salle de lecture annexe' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    const [path, body, , method] = fixture.heritage.command.mock.calls[0]!;
    expect(path).toBe('/movements/' + ID + 'm1');
    expect(body).toMatchObject({ destination: 'Salle de lecture annexe', expectedVersion: 2 });
    expect(method).toBe('PUT');
});

it('la liste de la page montre les sorties en retard avec leur retard, et ouvre la fiche d’une demande', async () => {
    fixture.heritage.movements.mockResolvedValue(page([
        row({ id: ID + 'm2', numero: 'MVT-2026-000002', statut: 'RECUE', retourPrevu: '2026-09-25', enRetard: true, joursRetard: 10, objet: 'EXPOSITION', destination: 'Musée régional', destinataire: 'Mme Bah' }),
        row()]));
    render(<MovementsPanel />);
    expect(await screen.findByText('2 demandes')).toBeTruthy();
    const rows = [...document.querySelectorAll('tbody tr')].map(tr => tr.textContent ?? '');
    expect(rows[0]).toMatch(/MVT-2026-000002.*Exposition.*Musée régional.*En retard de 10 jours.*Reçue.*En retard/);
    expect(rows[1]).toMatch(/MVT-2026-000001.*Consultation.*Demandée/);
    expect(fixture.heritage.movements).toHaveBeenCalledWith(expect.objectContaining({ statut: 'OUVERTES', page: 0, size: 20 }), expect.anything());
    fireEvent.click(screen.getByRole('button', { name: 'MVT-2026-000001' }));
    await waitFor(() => expect(fixture.heritage.movement).toHaveBeenCalledWith(ID + 'm1', expect.anything()));
});

it('les filtres de la liste regroupent les ouvertes, les originaux sortis et les sorties en retard', async () => {
    render(<MovementsPanel />);
    await screen.findByText('Aucune demande');
    const select = screen.getByLabelText('Étape') as HTMLSelectElement;
    expect([...select.options].map(o => o.value).slice(0, 3)).toEqual(['', 'OUVERTES', 'DEHORS']);
    fireEvent.change(select, { target: { value: 'DEHORS' } });
    await waitFor(() => expect(fixture.heritage.movements).toHaveBeenLastCalledWith(expect.objectContaining({ statut: 'DEHORS', enRetard: '', mine: '' }), expect.anything()));
    fireEvent.click(screen.getByLabelText('Sorties en retard'));
    await waitFor(() => expect(fixture.heritage.movements).toHaveBeenLastCalledWith(expect.objectContaining({ statut: 'DEHORS', enRetard: 'true' }), expect.anything()));
    fireEvent.click(screen.getByLabelText('Mes demandes'));
    await waitFor(() => expect(fixture.heritage.movements).toHaveBeenLastCalledWith(expect.objectContaining({ mine: 'true' }), expect.anything()));
    fireEvent.change(screen.getByLabelText('Pour quoi'), { target: { value: 'PRET' } });
    await waitFor(() => expect(fixture.heritage.movements).toHaveBeenLastCalledWith(expect.objectContaining({ objet: 'PRET' }), expect.anything()));
    expect(await screen.findByText('Aucune demande ne correspond à ces critères.')).toBeTruthy();
});

it('sans demande dans le périmètre, la liste explique où les déposer', async () => {
    render(<MovementsPanel />);
    expect(await screen.findByText('Aucune demande')).toBeTruthy();
    expect(screen.getByText(/onglet « Mouvements »/)).toBeTruthy();
});
