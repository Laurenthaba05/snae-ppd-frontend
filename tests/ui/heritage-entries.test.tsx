import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/core/http';
import type { EntryDashboard, EntryJournalEntry, EntryPage, EntryReceipt, EntrySummary, EntryTransitionOption, HeritageEntry, HeritageReference, HeritageReprise } from '../../src/core/types';
const INST = '00000000-0000-4000-8000-0000000000a1';
const fixture = vi.hoisted(() => ({
    epoch: 1, me: null as unknown, allowed: new Set<string>(['HERITAGE_READ', 'HERITAGE_ENTRY_MANAGE', 'HERITAGE_ENTRY_DECIDE']),
    heritage: { entries: vi.fn(), entriesSummary: vi.fn(), entry: vi.fn(), entryJournal: vi.fn(), entryReceipt: vi.fn(), reprises: vi.fn(), references: vi.fn(), assets: vi.fn(), command: vi.fn() },
    records: { documents: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: { institutionId: '00000000-0000-4000-8000-0000000000a1', departmentId: null } }) }));
import { HeritageEntriesPanel } from '../../src/ui/HeritageEntries';

const ID = '00000000-0000-4000-8000-0000000000';
const categories: HeritageReference[] = [
    { domaine: 'CATEGORIE', code: 'REGISTRE', libelle: 'Registre', description: null, ordre: 20, actif: true },
    { domaine: 'CATEGORIE', code: 'CARTE_PLAN', libelle: 'Carte ou plan', description: null, ordre: 40, actif: true }];
const summary = (n: number, extra: Partial<EntrySummary> = {}): EntrySummary => ({ id: ID + 'e' + n, numero: 'ENT-2026-00000' + n, institutionId: INST, modeReception: 'DON', deposant: 'Famille Camara', dateReception: '2026-10-01',
    statut: 'EN_EXAMEN', nombreBiens: 2, decisionType: null, updatedAt: '2026-10-04T10:00:00Z', ...extra });
const page = (items: EntrySummary[]): EntryPage => ({ items, page: 0, size: 20, total: items.length, hasMore: false });
const dashboard = (extra: Partial<EntryDashboard> = {}): EntryDashboard => ({ total: 4, parStatut: { RECUE: 1, EN_EXAMEN: 2, COMPLEMENT_REQUIS: 1 }, sansDecisionDepuisJours: 1, ...extra });
const option = (vers: EntryTransitionOption['vers'], extra: Partial<EntryTransitionOption> = {}): EntryTransitionOption => ({ vers, permissions: ['HERITAGE_ENTRY_MANAGE', 'HERITAGE_ENTRY_DECIDE'], peutAgir: true, motifRequis: false, decision: false, bloquants: [], ...extra });
const examining = [option('COMPLEMENT_REQUIS', { motifRequis: true }), option('SITUATION_A_CLARIFIER', { motifRequis: true, permissions: ['HERITAGE_ENTRY_DECIDE'] }),
    option('ACCEPTEE', { decision: true, permissions: ['HERITAGE_ENTRY_DECIDE'] }), option('REFUSEE', { decision: true, motifRequis: true, permissions: ['HERITAGE_ENTRY_DECIDE'] })];
const WAITING = 'Réception en vue d’un examen. La remise des biens ne vaut ni acquisition, ni dépôt, ni prêt, et ne transfère pas la propriété.';
const entry = (extra: Partial<HeritageEntry> = {}): HeritageEntry => ({ id: ID + 'e1', numero: 'ENT-2026-000001', institutionId: INST, departementId: null,
    champs: { modeReception: 'DON', deposantNom: 'Famille Camara', dateReception: '2026-10-01', motifReception: null, nombrePieces: 2, descriptionLot: null, constatEtat: 'Reliure abîmée.', moyensConservation: null,
        examenProvenance: null, situationJuridique: 'CLAIRE', situationJuridiqueNote: null, conditionsProposees: null, conditionsRetenues: null },
    statut: 'EN_EXAMEN', decisionType: null, decisionMotif: null, decisionParId: null, decisionLe: null, conventionReference: null, conventionDateDebut: null, conventionDateFin: null,
    retourLe: null, retourDestinataire: null, retourNote: null, enregistreParId: null, modifiable: true, mention: { code: 'EN_ATTENTE_DE_DECISION', texte: WAITING },
    biens: [{ bienId: ID + '01', identifiant: 'PAT-000001', intitule: 'Registre d’état civil', categorie: 'REGISTRE', statutPriseEnCharge: 'A_EXAMINER' }], ressources: [], passages: examining,
    version: 2, createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-04T10:00:00Z', ...extra });
const lot = (extra: Partial<HeritageReprise> = {}): HeritageReprise => ({ id: ID + 'f1', institutionId: INST, departementId: null, libelle: 'Registre d’inventaire de 1978', source: null, dateReference: '1978-06-01',
    statut: 'OUVERTE', biens: 12, sansDate: 4, sansResume: 7, provenanceAEtablir: 12, valeurNonEvaluee: 12, sansOriginal: 9, clotureeLe: null, version: 3, createdAt: '2026-10-01T10:00:00Z', ...extra });

beforeEach(() => {
    fixture.allowed = new Set(['HERITAGE_READ', 'HERITAGE_ENTRY_MANAGE', 'HERITAGE_ENTRY_DECIDE']);
    for (const fn of Object.values(fixture.heritage)) fn.mockReset();
    fixture.records.documents.mockReset().mockResolvedValue({ items: [], page: 0, size: 100, hasMore: false });
    fixture.heritage.entries.mockResolvedValue(page([]));
    fixture.heritage.entriesSummary.mockResolvedValue(dashboard());
    fixture.heritage.references.mockResolvedValue(categories);
    fixture.heritage.reprises.mockResolvedValue([]);
    fixture.heritage.entryJournal.mockResolvedValue([]);
    fixture.heritage.assets.mockResolvedValue({ items: [], page: 0, size: 100, total: 0, hasMore: false });
    fixture.heritage.command.mockResolvedValue(entry());
    fixture.heritage.entry.mockResolvedValue(entry());
});

const top = () => { const all = screen.getAllByRole('dialog'); return all[all.length - 1]!; };

it('la liste montre les entrées avec leur étape et leur décision, et un clic sur une étape filtre', async () => {
    fixture.heritage.entries.mockResolvedValue(page([summary(1), summary(2, { statut: 'FORMALISEE', decisionType: 'DEPOT', modeReception: 'DEPOT', deposant: null })]));
    render(<HeritageEntriesPanel />);
    expect(await screen.findByRole('button', { name: 'ENT-2026-000001' })).toBeTruthy();
    const table = within(screen.getByRole('table'));
    expect(table.getByText('Dépôt proposé')).toBeTruthy();
    expect(table.getByText('Dépôt')).toBeTruthy();
    expect(table.getByText('Formalisée')).toBeTruthy();
    const overview = await screen.findByRole('list', { name: 'Vue d’ensemble des entrées' });
    expect(within(overview).getByText('4 entrées')).toBeTruthy();
    expect(within(overview).getByText('2 en examen')).toBeTruthy();
    expect(within(overview).getByText('1 en attente depuis plus de 30 jours')).toBeTruthy();
    fireEvent.click(within(overview).getByRole('button', { name: '1 complément requis' }));
    await waitFor(() => expect(fixture.heritage.entries).toHaveBeenLastCalledWith(expect.objectContaining({ statut: 'COMPLEMENT_REQUIS', page: 0 }), expect.anything()));
});

it('sans la permission de gestion, aucun bouton de réception ni de lot', async () => {
    fixture.allowed = new Set(['HERITAGE_READ']);
    render(<HeritageEntriesPanel />);
    await screen.findByText('Aucune entrée');
    expect(screen.queryByRole('button', { name: 'Nouvelle réception' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Nouveau lot' })).toBeNull();
    expect(screen.getByText('Aucune entrée dans votre périmètre.')).toBeTruthy();
    expect(screen.getByText('Aucun lot dans votre périmètre.')).toBeTruthy();
});

it('une réception dit qu’elle ne vaut pas acquisition, part avec une clé stable et ouvre la fiche', async () => {
    render(<HeritageEntriesPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Nouvelle réception' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/ne vaut ni acquisition, ni dépôt, ni prêt/)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText(/Type de réception/), { target: { value: 'PRET_ENTRANT' } });
    fireEvent.change(within(dialog).getByLabelText(/Déposant ou source/), { target: { value: '  Famille Camara ' } });
    fireEvent.change(within(dialog).getByLabelText(/Nombre de pièces/), { target: { value: 'douze' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer la réception' }));
    expect(await within(dialog).findByText(/entier positif/)).toBeTruthy();
    expect(fixture.heritage.command).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText(/Nombre de pièces/), { target: { value: '3' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer la réception' }));
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    const [path, body, key, method] = fixture.heritage.command.mock.calls[0]!;
    expect(path).toBe('/entries');
    expect(body).toEqual({ institutionId: INST, departementId: null, champs: { modeReception: 'PRET_ENTRANT', deposantNom: 'Famille Camara', nombrePieces: '3' } });
    expect(typeof key).toBe('string');
    expect(method).toBe('POST');
    expect(await screen.findByText('ENT-2026-000001')).toBeTruthy();
});

async function openEntry(view: HeritageEntry) {
    fixture.heritage.entries.mockResolvedValue(page([summary(1)]));
    fixture.heritage.entry.mockResolvedValue(view);
    render(<HeritageEntriesPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'ENT-2026-000001' }));
    return await screen.findByRole('dialog');
}

it('la fiche montre le parcours, la mention de prise en charge et les passages possibles', async () => {
    const dialog = await openEntry(entry());
    const steps = await waitFor(() => { const el = dialog.querySelector('.entry-steps'); expect(el).toBeTruthy(); return el as HTMLElement; });
    expect([...steps.querySelectorAll('li')].map(li => li.className)).toEqual(['done', 'current', 'todo', 'todo']);
    expect(steps.querySelector('li.current')!.getAttribute('aria-current')).toBe('step');
    expect(within(dialog).getByRole('note').textContent).toContain('ne vaut ni acquisition, ni dépôt, ni prêt');
    for (const name of ['Demander un complément', 'Signaler une situation à clarifier', 'Accepter la prise en charge', 'Refuser la prise en charge']) expect(within(dialog).getByRole('button', { name })).toBeTruthy();
    expect(within(dialog).getByText('Reliure abîmée.')).toBeTruthy();
});

it('un passage sans formulaire part directement avec la version', async () => {
    const dialog = await openEntry(entry({ statut: 'RECUE', passages: [option('EN_EXAMEN')] }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Commencer l’examen' }));
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    const [path, body, , method] = fixture.heritage.command.mock.calls[0]!;
    expect(path).toBe('/entries/' + ID + 'e1/transitions');
    expect(body).toEqual({ vers: 'EN_EXAMEN', expectedVersion: 2 });
    expect(method).toBe('POST');
});

it('un passage bloqué est grisé et dit pourquoi', async () => {
    const dialog = await openEntry(entry({ statut: 'RECUE', passages: [option('EN_EXAMEN', { bloquants: [{ code: 'NO_CONDITION_REPORT', message: 'Le constat d’état à la réception est obligatoire avant l’examen.', bloque: null }] })] }));
    const button = await within(dialog).findByRole('button', { name: 'Commencer l’examen' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.getAttribute('title')).toBe('Conditions non remplies');
    expect(within(dialog).getByText(/constat d’état à la réception est obligatoire/)).toBeTruthy();
});

it('sans l’habilitation de décision, accepter est grisé et nomme l’habilitation requise', async () => {
    const dialog = await openEntry(entry({ passages: [option('ACCEPTEE', { decision: true, peutAgir: false, permissions: ['HERITAGE_ENTRY_DECIDE'] })] }));
    const button = await within(dialog).findByRole('button', { name: 'Accepter la prise en charge' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.getAttribute('title')).toBe('Habilitation requise : HERITAGE_ENTRY_DECIDE');
});

it('accepter exige la nature de la prise en charge, et un prêt entrant ne peut devenir qu’un prêt', async () => {
    const dialog = await openEntry(entry({ champs: { ...entry().champs, modeReception: 'PRET_ENTRANT' } }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Accepter la prise en charge' }));
    const form = top();
    expect(within(form).getByText(/engage l’institution/)).toBeTruthy();
    const confirm = within(form).getByRole('button', { name: 'Confirmer' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(within(form).getByText(/Indiquez la nature de la prise en charge/)).toBeTruthy();
    const select = within(form).getByLabelText(/Nature de la prise en charge/) as HTMLSelectElement;
    expect([...select.options].map(o => o.value)).toEqual(['', 'PRET_ENTRANT']);
    fireEvent.change(select, { target: { value: 'PRET_ENTRANT' } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    expect(fixture.heritage.command.mock.calls[0]![1]).toEqual({ vers: 'ACCEPTEE', expectedVersion: 2, decisionType: 'PRET_ENTRANT' });
});

it('une acquisition est refusée à l’écran tant que la situation juridique est à clarifier', async () => {
    const dialog = await openEntry(entry({ champs: { ...entry().champs, situationJuridique: 'A_CLARIFIER' } }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Accepter la prise en charge' }));
    const form = top();
    fireEvent.change(within(form).getByLabelText(/Nature de la prise en charge/), { target: { value: 'ACQUISITION' } });
    expect(within(form).getByText(/situation juridique claire/)).toBeTruthy();
    expect((within(form).getByRole('button', { name: 'Confirmer' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(form).getByLabelText(/Nature de la prise en charge/), { target: { value: 'DEPOT' } });
    expect((within(form).getByRole('button', { name: 'Confirmer' }) as HTMLButtonElement).disabled).toBe(false);
});

it('un refus exige un motif écrit d’au moins 10 caractères', async () => {
    const dialog = await openEntry(entry());
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Refuser la prise en charge' }));
    const form = top();
    const confirm = within(form).getByRole('button', { name: 'Confirmer' }) as HTMLButtonElement;
    fireEvent.change(within(form).getByLabelText(/Motif/), { target: { value: 'court' } });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(form).getByLabelText(/Motif/), { target: { value: 'Provenance non établie après examen' } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    expect(fixture.heritage.command.mock.calls[0]![1]).toEqual({ vers: 'REFUSEE', expectedVersion: 2, motif: 'Provenance non établie après examen' });
});

it('la formalisation d’un dépôt demande l’acte et l’échéance, la restitution sa date et son destinataire', async () => {
    let dialog = await openEntry(entry({ statut: 'ACCEPTEE', decisionType: 'DEPOT', modifiable: false, passages: [option('FORMALISEE', { permissions: ['HERITAGE_ENTRY_DECIDE'] })] }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Formaliser par un acte' }));
    let form = top();
    expect((within(form).getByRole('button', { name: 'Confirmer' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(form).getByLabelText(/Référence de l’acte/), { target: { value: 'Convention de dépôt 12' } });
    expect(within(form).getByText(/date de fin/)).toBeTruthy();
    fireEvent.change(within(form).getByLabelText(/Fin de la convention/), { target: { value: '2031-10-04' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Confirmer' }));
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    expect(fixture.heritage.command.mock.calls[0]![1]).toEqual({ vers: 'FORMALISEE', expectedVersion: 2, conventionReference: 'Convention de dépôt 12', conventionDateFin: '2031-10-04' });
    fixture.heritage.command.mockClear();
    document.body.innerHTML = '';
    dialog = await openEntry(entry({ statut: 'REFUSEE', modifiable: false, passages: [option('RETOURNEE')] }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Enregistrer la restitution' }));
    form = top();
    fireEvent.change(within(form).getByLabelText(/Date de la restitution/), { target: { value: '2026-10-03' } });
    fireEvent.change(within(form).getByLabelText(/Repris par/), { target: { value: 'M. Camara' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Confirmer' }));
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    expect(fixture.heritage.command.mock.calls[0]![1]).toEqual({ vers: 'RETOURNEE', expectedVersion: 2, retourLe: '2026-10-03', retourDestinataire: 'M. Camara' });
});

it('modifier envoie seulement les champs changés avec la version', async () => {
    const dialog = await openEntry(entry());
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Modifier' }));
    fireEvent.change(within(dialog).getByLabelText('Nombre de pièces'), { target: { value: '5' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    const [path, body, , method] = fixture.heritage.command.mock.calls[0]!;
    expect(path).toBe('/entries/' + ID + 'e1');
    expect(method).toBe('PUT');
    expect(body).toEqual({ expectedVersion: 2, changes: { nombrePieces: '5' } });
});

it('une fois la décision prise, les champs ne se modifient plus et la fiche l’explique', async () => {
    const dialog = await openEntry(entry({ statut: 'ACCEPTEE', modifiable: false, decisionType: 'ACQUISITION', decisionLe: '2026-10-04T09:00:00Z', decisionMotif: 'Pièce majeure', passages: [] }));
    await within(dialog).findByText('Acceptée', { selector: '.badge' });
    expect(within(dialog).queryByRole('button', { name: 'Modifier' })).toBeNull();
    expect(within(dialog).getByText(/ne se modifient plus/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('tab', { name: /Biens reçus/ }));
    expect(within(dialog).queryByRole('button', { name: 'Enregistrer un bien reçu' })).toBeNull();
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Décision' }));
    expect(within(dialog).getByText('Acquisition')).toBeTruthy();
    expect(within(dialog).getByText('Pièce majeure')).toBeTruthy();
});

it('enregistrer un bien reçu l’ajoute à l’entrée avec une clé stable ; détacher le retire', async () => {
    const dialog = await openEntry(entry());
    fireEvent.click(await within(dialog).findByRole('tab', { name: /Biens reçus/ }));
    expect(within(dialog).getByText(/Registre d’état civil/)).toBeTruthy();
    expect(within(dialog).getByText(/À examiner/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer un bien reçu' }));
    const form = top();
    fireEvent.change(within(form).getByLabelText(/Intitulé/), { target: { value: '  Carte de 1912  ' } });
    fireEvent.change(within(form).getByLabelText(/Catégorie/), { target: { value: 'CARTE_PLAN' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Enregistrer le bien' }));
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    const [path, body, key, method] = fixture.heritage.command.mock.calls[0]!;
    expect(path).toBe('/entries/' + ID + 'e1/assets');
    expect(body).toEqual({ intitule: 'Carte de 1912', categorie: 'CARTE_PLAN', natureOriginale: 'PHYSIQUE' });
    expect(typeof key).toBe('string'); expect(method).toBe('POST');
    fixture.heritage.command.mockClear();
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Détacher' }));
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    expect(fixture.heritage.command.mock.calls[0]![0]).toBe('/entries/' + ID + 'e1/assets/' + ID + '01/unlink');
});

it('l’historique nomme les étapes, les modifications et les liens, le plus récent en premier', async () => {
    const journal: EntryJournalEntry[] = [
        { id: ID + 'j1', genre: 'CREATION', champ: null, ancienneValeur: null, nouvelleValeur: { numero: 'ENT-2026-000001' }, motif: null, automatique: false, auteurId: null, createdAt: '2026-10-01T10:00:00Z' },
        { id: ID + 'j2', genre: 'MODIFICATION', champ: null, ancienneValeur: null, nouvelleValeur: ['constatEtat', 'nombrePieces'], motif: null, automatique: false, auteurId: null, createdAt: '2026-10-02T10:00:00Z' },
        { id: ID + 'j3', genre: 'TRANSITION', champ: 'statut', ancienneValeur: 'RECUE', nouvelleValeur: 'EN_EXAMEN', motif: null, automatique: false, auteurId: null, createdAt: '2026-10-03T10:00:00Z' },
        { id: ID + 'j4', genre: 'LIEN', champ: 'bien', ancienneValeur: null, nouvelleValeur: { bienId: ID + '01' }, motif: null, automatique: false, auteurId: null, createdAt: '2026-10-03T11:00:00Z' }];
    fixture.heritage.entryJournal.mockResolvedValue(journal);
    const dialog = await openEntry(entry());
    fireEvent.click(await within(dialog).findByRole('tab', { name: 'Historique' }));
    await within(dialog).findByText(/Reçue → En examen/);
    const texts = [...dialog.querySelectorAll('.asset-journal > li')].map(li => li.textContent ?? '');
    expect(texts).toHaveLength(4);
    expect(texts[0]).toMatch(/Lien.*Bien.*Ajouté/);
    expect(texts[1]).toMatch(/Passage.*Reçue → En examen/);
    expect(texts[2]).toMatch(/Modification.*Constat d’état, Nombre de pièces/);
    expect(texts[3]).toMatch(/Réception enregistrée/);
});

it('le reçu dit ce que la remise n’est pas et propose l’impression', async () => {
    const receipt: EntryReceipt = { numero: 'ENT-2026-000001', institution: 'Archives nationales', dateReception: '2026-10-01', modeReception: 'DON', deposant: 'Famille Camara', nombrePieces: 2, motifReception: null,
        biens: [{ bienId: ID + '01', identifiant: 'PAT-000001', intitule: 'Registre d’état civil', categorie: 'REGISTRE', statutPriseEnCharge: 'A_EXAMINER' }], mention: { code: 'EN_ATTENTE_DE_DECISION', texte: WAITING }, genereLe: '2026-10-04T10:00:00Z' };
    fixture.heritage.entryReceipt.mockResolvedValue(receipt);
    const dialog = await openEntry(entry());
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Reçu de réception' }));
    const sheet = await screen.findByRole('article', { name: 'Reçu ENT-2026-000001' });
    expect(within(sheet).getByText('Archives nationales')).toBeTruthy();
    expect(within(sheet).getByText('Famille Camara')).toBeTruthy();
    expect(within(sheet).getByText(/ne vaut ni acquisition, ni dépôt, ni prêt/)).toBeTruthy();
    expect(within(top()).getByRole('button', { name: /Imprimer/ })).toBeTruthy();
    expect(within(top()).getByRole('button', { name: /Copier le texte/ })).toBeTruthy();
});

it('les lots de reprise montrent ce qui reste à compléter et se clôturent avec la version lue', async () => {
    fixture.heritage.reprises.mockResolvedValue([lot(), lot({ id: ID + 'f2', libelle: 'Registre de 1952', statut: 'CLOTUREE', biens: 3, sansDate: 0, sansResume: 0 })]);
    render(<HeritageEntriesPanel />);
    const row = (await screen.findByText('Registre d’inventaire de 1978')).closest('tr')!;
    expect(within(row).getByText('Registre de 1 juin 1978')).toBeTruthy();
    expect(within(row).getAllByText('12').length).toBe(3);
    expect(within(row).getByText('9')).toBeTruthy();
    const closed = screen.getByText('Registre de 1952').closest('tr')!;
    expect(within(closed).queryByRole('button', { name: 'Clôturer' })).toBeNull();
    expect(within(closed).getAllByText('—').length).toBeGreaterThan(1);
    fireEvent.click(within(row).getByRole('button', { name: 'Clôturer' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/plus aucun bien ne peut être ajouté/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Clôturer le lot' }));
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    expect(fixture.heritage.command.mock.calls[0]!.slice(0, 2)).toEqual(['/reprises/' + ID + 'f1/close', { expectedVersion: 3 }]);
});

it('un nouveau lot est créé avec une clé stable puis l’import du registre s’ouvre', async () => {
    fixture.heritage.command.mockResolvedValue(lot());
    render(<HeritageEntriesPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Nouveau lot' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Libellé du lot/), { target: { value: ' Registre d’inventaire de 1978 ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer le lot' }));
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(1));
    const [path, body, key, method] = fixture.heritage.command.mock.calls[0]!;
    expect(path).toBe('/reprises');
    expect(body).toEqual({ institutionId: INST, departementId: null, libelle: 'Registre d’inventaire de 1978' });
    expect(typeof key).toBe('string'); expect(method).toBe('POST');
    expect(await screen.findByText('Reprendre un registre d’inventaire')).toBeTruthy();
});

const header = 'Numéro d’inventaire;Intitulé;Catégorie;Date;Résumé;Support;Dimensions;Cote ou ancienne référence;Provenance connue';
const csv = [header, 'INV-001;Registre des naissances;Registre;1952;Un registre.;Papier;;A-12;', 'INV-002;Carte;Carte ou plan;époque coloniale;;;;;', 'INV-003;Tableau;Peinture;;;;;;'].join('\n') + '\n';
const upload = (file: File) => fireEvent.change(document.querySelector('input[type=file]') as HTMLInputElement, { target: { files: [file] } });
async function openImport() {
    fixture.heritage.reprises.mockResolvedValue([lot()]);
    render(<HeritageEntriesPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Importer un registre' }));
    return await screen.findByRole('dialog');
}

it('l’import contrôle d’abord : lignes valides, à qualifier et en erreur, avec la raison', async () => {
    const dialog = await openImport();
    upload(new File([csv], 'registre.csv', { type: 'text/csv' }));
    await within(dialog).findByRole('button', { name: /Reprendre 2 biens/ });
    expect(within(dialog).getByText(/ignorée.*erreurs/)).toBeTruthy();
    expect(within(dialog).getByText(/Catégorie inconnue « Peinture »/)).toBeTruthy();
    expect(within(dialog).getByText(/Date non interprétée/)).toBeTruthy();
    expect(within(dialog).getByText(/à qualifier/, { selector: '.imp-count' })).toBeTruthy();
    expect(fixture.heritage.command).not.toHaveBeenCalled();
});

it('l’import reprend chaque ligne valide dans le lot avec une clé par ligne, et les anciennes références du registre', async () => {
    fixture.heritage.command.mockImplementation((_p: string, body: { champs: { numeroInventaire: string } }) => Promise.resolve({ identifiant: 'PAT-' + body.champs.numeroInventaire.slice(-3) }));
    const dialog = await openImport();
    upload(new File([csv], 'registre.csv'));
    fireEvent.click(await within(dialog).findByRole('button', { name: /Reprendre 2 biens/ }));
    await within(dialog).findByRole('button', { name: /Télécharger le rapport/ });
    const calls = fixture.heritage.command.mock.calls.filter(c => c[0] === '/assets') as Array<[string, Record<string, any>, string, string]>;
    expect(calls).toHaveLength(2);
    expect(calls[0]![1]).toEqual({ institutionId: INST, departementId: null, origine: 'REPRISE_INVENTAIRE', repriseId: ID + 'f1',
        champs: { intitule: 'Registre des naissances', categorie: 'REGISTRE', natureOriginale: 'PHYSIQUE', precisionDate: 'ANNEE', dateDebut: '1952-01-01', dateFin: '1952-12-31', numeroInventaire: 'INV-001',
            anciennesReferences: [{ systeme: 'Registre d’inventaire de 1978', valeur: 'A-12' }], resume: 'Un registre.', support: 'Papier' } });
    expect(calls[1]![1].champs).toEqual({ intitule: 'Carte', categorie: 'CARTE_PLAN', natureOriginale: 'PHYSIQUE', numeroInventaire: 'INV-002', dateTexte: 'époque coloniale' });
    expect(calls[0]![2]).not.toBe(calls[1]![2]);
    expect(calls[0]![3]).toBe('POST');
    expect(within(dialog).getByText(/Reprise \(PAT-001\)/)).toBeTruthy();
    expect(within(dialog).getByText(/Reprise \(PAT-002\)/)).toBeTruthy();
});

it('un échec n’arrête pas les autres lignes et le rejeu réutilise la même clé', async () => {
    fixture.heritage.command.mockRejectedValueOnce(new ApiError(409, 'HERITAGE_ASSET_INVENTORY_NUMBER_EXISTS', 'Ce numéro d’inventaire existe déjà dans l’institution.'));
    fixture.heritage.command.mockResolvedValue({ identifiant: 'PAT-000009' });
    const dialog = await openImport();
    upload(new File([csv], 'registre.csv'));
    fireEvent.click(await within(dialog).findByRole('button', { name: /Reprendre 2 biens/ }));
    await within(dialog).findByText('Ce numéro d’inventaire existe déjà dans l’institution.');
    expect(fixture.heritage.command).toHaveBeenCalledTimes(2);
    const firstKey = fixture.heritage.command.mock.calls[0]![2];
    fireEvent.click(within(dialog).getByRole('button', { name: /Réessayer 1 ligne/ }));
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledTimes(3));
    expect(fixture.heritage.command.mock.calls[2]![2]).toBe(firstKey);
});

it('un lot clôturé en cours d’import arrête tout et n’invite pas à réessayer', async () => {
    fixture.heritage.command.mockRejectedValue(new ApiError(409, 'HERITAGE_REPRISE_CLOSED', 'Ce lot de reprise d’inventaire est clôturé.'));
    const dialog = await openImport();
    upload(new File([csv], 'registre.csv'));
    fireEvent.click(await within(dialog).findByRole('button', { name: /Reprendre 2 biens/ }));
    await within(dialog).findByText(/Ce lot est clôturé : plus aucun bien ne peut y être ajouté/);
    expect(fixture.heritage.command).toHaveBeenCalledTimes(1);
    expect(within(dialog).queryByRole('button', { name: /Réessayer/ })).toBeNull();
});

it('un fichier sans les colonnes attendues est refusé sans rien envoyer', async () => {
    const dialog = await openImport();
    upload(new File(['Nom;Ville\nA;B\n'], 'x.csv'));
    await within(dialog).findByText(/Colonnes obligatoires introuvables/);
    expect(fixture.heritage.command).not.toHaveBeenCalled();
});
