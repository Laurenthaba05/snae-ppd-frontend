import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/core/http';
import type { AssetConservation, ConditionReport, ConservationQueuePage, ConservationQueueRow, HeritageAsset, HeritageReference, OriginalConservation, Treatment, TreatmentJournalEntry, TreatmentTransitionOption } from '../../src/core/types';
const INST = '00000000-0000-4000-8000-0000000000a1';
const fixture = vi.hoisted(() => ({
    epoch: 1, me: null as unknown,
    heritage: { assetConservation: vi.fn(), treatment: vi.fn(), treatmentJournal: vi.fn(), conservationQueue: vi.fn(), references: vi.fn(), command: vi.fn() },
    records: { documents: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
import { ConservationQueuePanel, ConservationTab } from '../../src/ui/HeritageConservation';

const ID = '00000000-0000-4000-8000-0000000000';
const alterations: HeritageReference[] = [
    { domaine: 'ALTERATION', code: 'DECHIRURE', libelle: 'Déchirure', description: null, ordre: 10, actif: true },
    { domaine: 'ALTERATION', code: 'MOISISSURE', libelle: 'Moisissure', description: null, ordre: 40, actif: true },
    { domaine: 'ALTERATION', code: 'TACHE', libelle: 'Tache', description: null, ordre: 30, actif: true }];
const report = (extra: Partial<ConditionReport> = {}): ConditionReport => ({ id: ID + 'r1', archiveId: ID + 'a1', contexte: 'PERIODIQUE', etat: 'STABLE', manipulation: 'LIBRE', urgence: 'AUCUNE', alterations: [],
    observations: 'État général satisfaisant, reliure solide', traitementRecommande: null, constateLe: '2026-09-20', auteurId: ID + 'u1', auteur: 'Awa Camara', createdAt: '2026-09-20T10:00:00Z', documents: [], ...extra });
const option = (vers: TreatmentTransitionOption['vers'], extra: Partial<TreatmentTransitionOption> = {}): TreatmentTransitionOption =>
    ({ vers, permissions: ['HERITAGE_CONSERVATION_MANAGE'], peutAgir: true, motifRequis: false, intervenantRequis: false, constatRequis: false, bloquants: [], ...extra });
const treatment = (extra: Partial<Treatment> = {}): Treatment => ({ id: ID + 't1', numero: 'TRT-2026-000001', bienId: ID + 'b1', archiveId: ID + 'a1', intitule: 'Consolidation du dos', typeTraitement: 'CONSOLIDATION',
    diagnostic: 'Déchirure traversante du dos et moisissure', traitementPrevu: 'Consolidation par papier japon puis traitement fongicide', constatAvantId: ID + 'r1', constatApresId: null, statut: 'PROPOSE',
    proposeParId: ID + 'u1', proposeLe: '2026-10-01T09:00:00Z', valideParId: null, valideLe: null, fermeParId: null, fermeLe: null, fermeMotif: null, intervenant: null, debutLe: null, finLe: null, compteRendu: null,
    modifiable: true, passages: [option('VALIDE', { permissions: ['HERITAGE_CONSERVATION_VALIDATE'] }), option('REFUSE', { permissions: ['HERITAGE_CONSERVATION_VALIDATE'], motifRequis: true }), option('ANNULE', { motifRequis: true })],
    version: 3, createdAt: '2026-10-01T09:00:00Z', ...extra });
const original = (extra: Partial<OriginalConservation> = {}): OriginalConservation => ({ archiveId: ID + 'a1', cote: 'ARCH-001', libelle: 'Registre des naissances', etat: 'STABLE', manipulation: 'LIBRE', urgence: 'AUCUNE',
    contexte: 'PERIODIQUE', constateLe: '2026-09-20', ageConstatJours: 14, enTraitement: false, attention: [], constats: [report()], traitements: [], peutConstater: true, peutProposer: true, seuilConstatJours: 730, ...extra });
const conservation = (originaux: OriginalConservation[], etat = 'STABLE'): AssetConservation => ({ bienId: ID + 'b1', identifiant: 'PAT-000001', intitule: 'Registre des naissances', institutionId: INST, etatMateriel: etat, originaux });
const asset = (extra: Partial<HeritageAsset> = {}) => ({ id: ID + 'b1', version: 4, institutionId: INST, champs: { natureOriginale: 'PHYSIQUE' }, ...extra }) as unknown as HeritageAsset;
const damaged = () => original({ etat: 'INTERVENTION_REQUISE', manipulation: 'INTERDITE', urgence: 'URGENTE', attention: ['INTERVENTION_REQUISE'],
    constats: [report({ etat: 'INTERVENTION_REQUISE', manipulation: 'INTERDITE', urgence: 'URGENTE', alterations: ['DECHIRURE', 'MOISISSURE'], observations: 'Déchirure traversante du dos et moisissure', traitementRecommande: 'Consolidation puis traitement fongicide', constateLe: '2026-10-02' }), report()],
    constateLe: '2026-10-02', ageConstatJours: 2 });

beforeEach(() => {
    for (const fn of Object.values(fixture.heritage)) fn.mockReset();
    fixture.records.documents.mockReset().mockResolvedValue({ items: [{ id: ID + 'd1', title: 'Photo du dos', reference: 'DOC-1' }], page: 0, size: 100, hasMore: false });
    fixture.heritage.references.mockResolvedValue(alterations);
    fixture.heritage.assetConservation.mockResolvedValue(conservation([original()]));
    fixture.heritage.treatment.mockResolvedValue(treatment());
    fixture.heritage.treatmentJournal.mockResolvedValue([]);
    fixture.heritage.command.mockResolvedValue({});
});

const top = () => { const all = screen.getAllByRole('dialog'); return all[all.length - 1]!; };
const card = async (cote = 'ARCH-001') => await screen.findByRole('region', { name: 'Conservation de ' + cote });

it('l’onglet montre l’état constaté, la manipulation, l’ancienneté du dernier constat et ses observations', async () => {
    fixture.heritage.assetConservation.mockResolvedValue(conservation([damaged()], 'INTERVENTION_REQUISE'));
    render(<ConservationTab asset={asset()} onChanged={vi.fn()} />);
    const c = await card();
    expect(within(c).getByText('ARCH-001 — Registre des naissances')).toBeTruthy();
    expect(within(c).getAllByText('Intervention requise').length).toBeGreaterThan(0);
    expect(within(c).getAllByText('Manipulation interdite').length).toBeGreaterThan(0);
    expect(within(c).getByText('À traiter', { selector: '.badge' })).toBeTruthy();
    expect(within(c).getByText(/Dernier constat 2 octobre 2026 \(il y a 2 jours\) : intervention requise/)).toBeTruthy();
    expect(within(c).getByText('Déchirure, Moisissure')).toBeTruthy();
    expect(within(c).getByText('Déchirure traversante du dos et moisissure')).toBeTruthy();
    expect(within(c).getByText('Consolidation puis traitement fongicide')).toBeTruthy();
    expect(within(c).getByText('Proposer un traitement de conservation.')).toBeTruthy();
    expect(screen.getByText(/ne se saisit pas/)).toBeTruthy();
});

it('un original jamais constaté le dit, et on ne propose pas de traitement sans constat', async () => {
    fixture.heritage.assetConservation.mockResolvedValue(conservation([original({ etat: null, manipulation: null, urgence: null, contexte: null, constateLe: null, ageConstatJours: null, constats: [], attention: ['SANS_CONSTAT'], peutProposer: false })], 'NON_EVALUE'));
    render(<ConservationTab asset={asset()} onChanged={vi.fn()} />);
    const c = await card();
    expect(within(c).getByText('L’état de cet original n’a jamais été constaté.')).toBeTruthy();
    expect(within(c).getByText('Non évalué', { selector: '.badge' })).toBeTruthy();
    expect(within(c).getByRole('button', { name: 'Nouveau constat d’état' })).toBeTruthy();
    expect(within(c).queryByRole('button', { name: 'Proposer un traitement' })).toBeNull();
});

it('sans l’habilitation de conservation, la fiche se lit sans boutons d’action', async () => {
    fixture.heritage.assetConservation.mockResolvedValue(conservation([original({ peutConstater: false, peutProposer: false })]));
    render(<ConservationTab asset={asset()} onChanged={vi.fn()} />);
    const c = await card();
    expect(within(c).queryByRole('button', { name: 'Nouveau constat d’état' })).toBeNull();
    expect(within(c).queryByRole('button', { name: 'Proposer un traitement' })).toBeNull();
});

it('un bien numérique natif ou sans original n’a rien à constater', async () => {
    fixture.heritage.assetConservation.mockResolvedValue(conservation([]));
    const { unmount } = render(<ConservationTab asset={asset()} onChanged={vi.fn()} />);
    expect(await screen.findByText('Aucun original relié')).toBeTruthy();
    unmount();
    render(<ConservationTab asset={asset({ champs: { natureOriginale: 'NUMERIQUE_NATIF' } } as Partial<HeritageAsset>)} onChanged={vi.fn()} />);
    expect(await screen.findByText('Bien numérique natif')).toBeTruthy();
});

it('un constat stable part avec une clé stable, sans altération, puis recharge l’onglet et le bien', async () => {
    const onChanged = vi.fn();
    render(<ConservationTab asset={asset()} onChanged={onChanged} />);
    fireEvent.click(await within(await card()).findByRole('button', { name: 'Nouveau constat d’état' }));
    const dialog = top();
    const confirm = within(dialog).getByRole('button', { name: 'Enregistrer le constat' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(within(dialog).getByRole('radio', { name: /Stable/ }));
    expect(within(dialog).queryByLabelText(/Altérations/)).toBeNull();
    fireEvent.change(within(dialog).getByLabelText(/Manipulation/), { target: { value: 'LIBRE' } });
    fireEvent.change(within(dialog).getByLabelText(/Observations/), { target: { value: 'État général satisfaisant, reliure solide' } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    const [path, body, key, method] = fixture.heritage.command.mock.calls[0]!;
    expect(path).toBe('/assets/' + ID + 'b1/originals/' + ID + 'a1/condition-reports');
    expect(body).toEqual({ etat: 'STABLE', manipulation: 'LIBRE', urgence: 'AUCUNE', alterations: [], observations: 'État général satisfaisant, reliure solide', contexte: 'PERIODIQUE' });
    expect(typeof key).toBe('string'); expect(method).toBe('POST');
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    await waitFor(() => expect(fixture.heritage.assetConservation).toHaveBeenCalledTimes(2));
});

it('une intervention requise exige altération et traitement recommandé, et n’est jamais en manipulation libre', async () => {
    render(<ConservationTab asset={asset()} onChanged={vi.fn()} />);
    fireEvent.click(await within(await card()).findByRole('button', { name: 'Nouveau constat d’état' }));
    const dialog = top();
    fireEvent.click(within(dialog).getByRole('radio', { name: /Intervention requise/ }));
    const manipulation = within(dialog).getByLabelText(/Manipulation/) as HTMLSelectElement;
    expect([...manipulation.options].map(o => o.value)).toEqual(['', 'PRECAUTIONS', 'INTERDITE']);
    const confirm = within(dialog).getByRole('button', { name: 'Enregistrer le constat' }) as HTMLButtonElement;
    fireEvent.change(manipulation, { target: { value: 'INTERDITE' } });
    fireEvent.change(within(dialog).getByLabelText(/Observations/), { target: { value: 'Déchirure traversante du dos' } });
    expect(within(dialog).getByText(/au moins une altération/)).toBeTruthy();
    expect(confirm.disabled).toBe(true);
    const group = within(dialog).getByRole('group', { name: /Altérations constatées/ });
    fireEvent.click(within(group).getByLabelText('Déchirure'));
    fireEvent.change(within(dialog).getByLabelText(/Urgence/), { target: { value: 'URGENTE' } });
    expect(within(dialog).getByText(/Une intervention requise dit laquelle/)).toBeTruthy();
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/Traitement recommandé/), { target: { value: 'Consolidation par papier japon' } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    expect(fixture.heritage.command.mock.calls[0]![1]).toEqual({ etat: 'INTERVENTION_REQUISE', manipulation: 'INTERDITE', urgence: 'URGENTE', alterations: ['DECHIRURE'], observations: 'Déchirure traversante du dos',
        contexte: 'PERIODIQUE', traitementRecommande: 'Consolidation par papier japon' });
});

it('le constat peut joindre une photographie du bien, et la retirer', async () => {
    render(<ConservationTab asset={asset()} onChanged={vi.fn()} />);
    fireEvent.click(await within(await card()).findByRole('button', { name: 'Nouveau constat d’état' }));
    const dialog = top();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Joindre un document' }));
    const picker = top();
    fireEvent.click(await within(picker).findByRole('button', { name: 'Choisir' }));
    await waitFor(() => expect(within(dialog).getByText('Photo du dos')).toBeTruthy());
    expect(fixture.records.documents).toHaveBeenCalledWith(expect.objectContaining({ institutionId: INST }), expect.anything());
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retirer' }));
    expect(within(dialog).queryByText('Photo du dos')).toBeNull();
});

it('les constats successifs se déplient avec leur circonstance, leur manipulation, leurs altérations et leur auteur', async () => {
    fixture.heritage.assetConservation.mockResolvedValue(conservation([damaged()], 'INTERVENTION_REQUISE'));
    render(<ConservationTab asset={asset()} onChanged={vi.fn()} />);
    fireEvent.click(await within(await card()).findByRole('button', { name: 'Constats successifs (2)' }));
    const items = [...document.querySelectorAll('.conservation-history > li')].map(li => li.textContent ?? '');
    expect(items).toHaveLength(2);
    expect(items[0]).toMatch(/2 octobre 2026.*Intervention requise.*Contrôle périodique · Manipulation interdite · Urgente · par Awa Camara/);
    expect(items[0]).toMatch(/Altérations : Déchirure, Moisissure/);
    expect(items[0]).toMatch(/Traitement recommandé : Consolidation puis traitement fongicide/);
    expect(items[1]).toMatch(/20 septembre 2026.*Stable/);
});

it('proposer un traitement exige des textes écrits et part avec une clé stable', async () => {
    fixture.heritage.assetConservation.mockResolvedValue(conservation([damaged()], 'INTERVENTION_REQUISE'));
    render(<ConservationTab asset={asset()} onChanged={vi.fn()} />);
    fireEvent.click(await within(await card()).findByRole('button', { name: 'Proposer un traitement' }));
    const dialog = top();
    expect(within(dialog).getByText(/validé ou refusé par une autre personne que vous/)).toBeTruthy();
    const confirm = within(dialog).getByRole('button', { name: 'Proposer le traitement' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/Intitulé/), { target: { value: '  Consolidation du dos  ' } });
    fireEvent.change(within(dialog).getByLabelText(/Nature du traitement/), { target: { value: 'CONSOLIDATION' } });
    fireEvent.change(within(dialog).getByLabelText(/Diagnostic/), { target: { value: 'Déchirure traversante et moisissure' } });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/Traitement prévu/), { target: { value: 'Consolidation par papier japon puis fongicide' } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    const [path, body, key, method] = fixture.heritage.command.mock.calls[0]!;
    expect(path).toBe('/assets/' + ID + 'b1/originals/' + ID + 'a1/treatments');
    expect(body).toEqual({ intitule: 'Consolidation du dos', typeTraitement: 'CONSOLIDATION', diagnostic: 'Déchirure traversante et moisissure', traitementPrevu: 'Consolidation par papier japon puis fongicide' });
    expect(typeof key).toBe('string'); expect(method).toBe('POST');
});

const withTreatment = (t: Treatment, extra: Partial<OriginalConservation> = {}) => conservation([original({ etat: 'INTERVENTION_REQUISE', manipulation: 'INTERDITE', attention: ['TRAITEMENT_A_VALIDER'], traitements: [t], peutProposer: false, ...extra })], 'INTERVENTION_REQUISE');
async function openTreatment(t: Treatment = treatment()) {
    fixture.heritage.assetConservation.mockResolvedValue(withTreatment(t));
    fixture.heritage.treatment.mockResolvedValue(t);
    render(<ConservationTab asset={asset()} onChanged={vi.fn()} />);
    const c = await card();
    expect(within(c).getByText('TRT-2026-000001', { selector: 'strong' })).toBeTruthy();
    fireEvent.click(within(c).getByRole('button', { name: 'Ouvrir' }));
    return await screen.findByRole('dialog');
}

it('la fiche d’un traitement montre le diagnostic, le traitement prévu, les passages et son historique', async () => {
    fixture.heritage.treatmentJournal.mockResolvedValue([
        { id: ID + 'j1', genre: 'CREATION', champ: null, ancienneValeur: null, nouvelleValeur: { numero: 'TRT-2026-000001' }, motif: null, auteurId: null, createdAt: '2026-10-01T09:00:00Z' },
        { id: ID + 'j2', genre: 'TRANSITION', champ: 'statut', ancienneValeur: 'PROPOSE', nouvelleValeur: 'REFUSE', motif: 'Trop lourd pour ce volume', auteurId: null, createdAt: '2026-10-02T09:00:00Z' }] as TreatmentJournalEntry[]);
    const dialog = await openTreatment();
    expect(await within(dialog).findByText('Déchirure traversante du dos et moisissure')).toBeTruthy();
    expect(within(dialog).getByText('Consolidation par papier japon puis traitement fongicide')).toBeTruthy();
    for (const name of ['Valider le traitement', 'Refuser le traitement', 'Annuler le traitement']) expect(within(dialog).getByRole('button', { name })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Modifier la proposition' })).toBeTruthy();
    await within(dialog).findByText(/Proposé → Refusé/);
    expect(within(dialog).getByText('Motif : Trop lourd pour ce volume')).toBeTruthy();
});

it('valider part sans formulaire, avec la version', async () => {
    const dialog = await openTreatment();
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Valider le traitement' }));
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    const [path, body, , method] = fixture.heritage.command.mock.calls[0]!;
    expect(path).toBe('/treatments/' + ID + 't1/transitions');
    expect(body).toEqual({ vers: 'VALIDE', expectedVersion: 3 });
    expect(method).toBe('POST');
});

it('la validation par la personne qui a proposé est grisée et dit pourquoi ; sans habilitation, elle l’est aussi', async () => {
    const dialog = await openTreatment(treatment({ passages: [option('VALIDE', { bloquants: [{ code: 'FOUR_EYES', message: 'Le traitement doit être validé par une autre personne que celle qui l’a proposé.', bloque: null }], permissions: ['HERITAGE_CONSERVATION_VALIDATE'] }),
        option('REFUSE', { peutAgir: false, motifRequis: true, permissions: ['HERITAGE_CONSERVATION_VALIDATE'] })] }));
    const validate = await within(dialog).findByRole('button', { name: 'Valider le traitement' }) as HTMLButtonElement;
    expect(validate.disabled).toBe(true);
    expect(validate.title).toBe('Conditions non remplies');
    expect(within(dialog).getByText(/validé par une autre personne que celle qui l’a proposé/)).toBeTruthy();
    const refuse = within(dialog).getByRole('button', { name: 'Refuser le traitement' }) as HTMLButtonElement;
    expect(refuse.disabled).toBe(true);
    expect(refuse.title).toBe('Habilitation requise : HERITAGE_CONSERVATION_VALIDATE');
});

it('refuser exige un motif écrit', async () => {
    const dialog = await openTreatment();
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Refuser le traitement' }));
    const form = top();
    const confirm = within(form).getByRole('button', { name: 'Confirmer' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(form).getByLabelText(/Motif/), { target: { value: 'court' } });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(form).getByLabelText(/Motif/), { target: { value: 'Le traitement proposé est trop lourd pour ce volume' } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    expect(fixture.heritage.command.mock.calls[0]![1]).toEqual({ vers: 'REFUSE', expectedVersion: 3, texte: 'Le traitement proposé est trop lourd pour ce volume' });
});

it('démarrer dit qui réalise le traitement, et le bien passe en restauration', async () => {
    const dialog = await openTreatment(treatment({ statut: 'VALIDE', modifiable: false, valideParId: ID + 'u2', passages: [option('EN_COURS', { intervenantRequis: true }), option('ANNULE', { motifRequis: true })] }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Démarrer le traitement' }));
    const form = top();
    expect(within(form).getByText(/le bien est « en restauration »/)).toBeTruthy();
    const confirm = within(form).getByRole('button', { name: 'Confirmer' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(form).getByLabelText(/Réalisé par/), { target: { value: ' Atelier de restauration ' } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    expect(fixture.heritage.command.mock.calls[0]![1]).toEqual({ vers: 'EN_COURS', expectedVersion: 3, intervenant: 'Atelier de restauration' });
});

it('terminer exige un compte rendu et le constat d’état après traitement, sans contexte à choisir', async () => {
    const dialog = await openTreatment(treatment({ statut: 'EN_COURS', modifiable: false, valideParId: ID + 'u2', intervenant: 'Atelier de restauration', debutLe: '2026-10-02T09:00:00Z', passages: [option('TERMINE', { motifRequis: true, constatRequis: true }), option('ANNULE', { motifRequis: true })] }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Terminer le traitement' }));
    const form = top();
    expect(within(form).getByRole('heading', { name: 'État de l’objet après le traitement' })).toBeTruthy();
    expect(within(form).queryByLabelText(/Circonstances/)).toBeNull();
    const confirm = within(form).getByRole('button', { name: 'Confirmer' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(form).getByLabelText(/Compte rendu du traitement/), { target: { value: 'Consolidation faite, traitement fongicide appliqué' } });
    expect(confirm.disabled).toBe(true);
    fireEvent.click(within(form).getByRole('radio', { name: /Stable/ }));
    fireEvent.change(within(form).getByLabelText(/Manipulation/), { target: { value: 'PRECAUTIONS' } });
    fireEvent.change(within(form).getByLabelText(/Observations/), { target: { value: 'Stable après consolidation du dos' } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    expect(fixture.heritage.command.mock.calls[0]![1]).toEqual({ vers: 'TERMINE', expectedVersion: 3, texte: 'Consolidation faite, traitement fongicide appliqué',
        constat: { etat: 'STABLE', manipulation: 'PRECAUTIONS', urgence: 'AUCUNE', alterations: [], observations: 'Stable après consolidation du dos' } });
});

it('la proposition se modifie tant qu’elle est une proposition, avec la version', async () => {
    const dialog = await openTreatment();
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Modifier la proposition' }));
    const form = top();
    expect((within(form).getByLabelText(/Intitulé/) as HTMLInputElement).value).toBe('Consolidation du dos');
    fireEvent.change(within(form).getByLabelText(/Intitulé/), { target: { value: 'Consolidation et fongicide' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    const [path, body, , method] = fixture.heritage.command.mock.calls[0]!;
    expect(path).toBe('/treatments/' + ID + 't1');
    expect(method).toBe('PUT');
    expect(body).toEqual(expect.objectContaining({ intitule: 'Consolidation et fongicide', typeTraitement: 'CONSOLIDATION', expectedVersion: 3 }));
});

it('un traitement validé ne se modifie plus', async () => {
    const dialog = await openTreatment(treatment({ statut: 'VALIDE', modifiable: false, passages: [option('EN_COURS', { intervenantRequis: true })] }));
    await within(dialog).findByRole('button', { name: 'Démarrer le traitement' });
    expect(within(dialog).queryByRole('button', { name: 'Modifier la proposition' })).toBeNull();
});

it('l’erreur du serveur (un traitement est déjà ouvert) s’affiche dans la fenêtre', async () => {
    fixture.heritage.command.mockRejectedValue(new ApiError(409, 'HERITAGE_TRAITEMENT_ALREADY_OPEN', 'Un traitement est déjà ouvert pour cet original : terminez-le, refusez-le ou annulez-le d’abord.'));
    fixture.heritage.assetConservation.mockResolvedValue(conservation([damaged()], 'INTERVENTION_REQUISE'));
    render(<ConservationTab asset={asset()} onChanged={vi.fn()} />);
    fireEvent.click(await within(await card()).findByRole('button', { name: 'Proposer un traitement' }));
    const dialog = top();
    fireEvent.change(within(dialog).getByLabelText(/Intitulé/), { target: { value: 'Consolidation du dos' } });
    fireEvent.change(within(dialog).getByLabelText(/Nature du traitement/), { target: { value: 'CONSOLIDATION' } });
    fireEvent.change(within(dialog).getByLabelText(/Diagnostic/), { target: { value: 'Déchirure traversante et moisissure' } });
    fireEvent.change(within(dialog).getByLabelText(/Traitement prévu/), { target: { value: 'Consolidation par papier japon puis fongicide' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Proposer le traitement' }));
    expect(await within(dialog).findByText(/Un traitement est déjà ouvert/)).toBeTruthy();
});

const row = (n: number, extra: Partial<ConservationQueueRow> = {}): ConservationQueueRow => ({ bienId: ID + 'b' + n, bienIdentifiant: 'PAT-00000' + n, bienIntitule: 'Registre ' + n, archiveId: ID + 'a' + n, cote: 'ARCH-00' + n,
    etat: 'INTERVENTION_REQUISE', manipulation: 'INTERDITE', urgence: 'URGENTE', constateLe: '2026-10-02', traitementId: null, traitementNumero: null, traitementStatut: null, attention: ['INTERVENTION_REQUISE'], ...extra });
const queue = (items: ConservationQueueRow[], total = items.length): ConservationQueuePage => ({ items, page: 0, size: 20, total, hasMore: false });

it('la liste « à traiter » montre l’état, la manipulation, le traitement et les points d’attention, et filtre', async () => {
    fixture.heritage.conservationQueue.mockResolvedValue(queue([row(1), row(2, { etat: 'FRAGILE', manipulation: 'PRECAUTIONS', urgence: 'AUCUNE', attention: ['FRAGILE'], traitementId: ID + 't2', traitementNumero: 'TRT-2026-000002', traitementStatut: 'EN_COURS' }),
        row(3, { etat: null, manipulation: null, urgence: null, constateLe: null, attention: ['SANS_CONSTAT'] })], 3));
    render(<ConservationQueuePanel />);
    expect(await screen.findByRole('button', { name: 'PAT-000001' })).toBeTruthy();
    const table = within(screen.getByRole('table'));
    expect(table.getByText('À traiter', { selector: '.badge' })).toBeTruthy();
    expect(table.getAllByText('Fragile', { selector: '.badge' }).length).toBe(2);
    expect(table.getByText('Jamais constaté', { selector: '.badge' })).toBeTruthy();
    expect(table.getByText('TRT-2026-000002')).toBeTruthy();
    expect(table.getByText('Urgente')).toBeTruthy();
    expect(table.getByText('Jamais')).toBeTruthy();
    expect(screen.getByText('3 originaux à suivre')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Point d’attention'), { target: { value: 'TRAITEMENT_A_VALIDER' } });
    await waitFor(() => expect(fixture.heritage.conservationQueue).toHaveBeenLastCalledWith(expect.objectContaining({ attention: 'TRAITEMENT_A_VALIDER', page: 0 }), expect.anything()));
});

it('sans original à suivre, la liste le dit ; ouvrir un bien de la liste montre la fiche de conservation de ses originaux', async () => {
    fixture.heritage.conservationQueue.mockResolvedValue(queue([]));
    const { unmount } = render(<ConservationQueuePanel />);
    expect(await screen.findByText('Rien à suivre')).toBeTruthy();
    expect(screen.getByText(/Aucun original ne demande d’attention/)).toBeTruthy();
    unmount();
    fixture.heritage.conservationQueue.mockResolvedValue(queue([row(1)]));
    fixture.heritage.assetConservation.mockResolvedValue(conservation([damaged()], 'INTERVENTION_REQUISE'));
    render(<ConservationQueuePanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'PAT-000001' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('PAT-000001', { selector: 'h2' })).toBeTruthy();
    expect(within(dialog).getByText('Registre des naissances')).toBeTruthy();
    expect(within(dialog).getByText('État matériel du bien : Intervention requise')).toBeTruthy();
    expect(within(dialog).getByRole('region', { name: 'Conservation de ARCH-001' })).toBeTruthy();
    expect(fixture.heritage.assetConservation).toHaveBeenCalledWith(ID + 'b1', expect.anything());
});
