import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/core/http';
import { totals, type BordereauLine, type BordereauView, type IntakeStage } from '../../src/core/structuredIntake';
import type { AgreementView } from '../../src/core/depositAgreements';

const INST = '00000000-0000-4000-8000-0000000000a1';
const PROD = '00000000-0000-4000-8000-0000000000b1';
const ENTRY = '00000000-0000-4000-8000-0000000000e1';
const ACC = '00000000-0000-4000-8000-0000000000c1';
const session = vi.hoisted(() => ({
    epoch: 1, me: null as unknown, allowed: new Set<string>(['ARCHIVAL_INTAKE_READ', 'ARCHIVAL_INTAKE_MANAGE']),
    archivalIntake: { entries: vi.fn(), cycle: vi.fn(), journal: vi.fn(), bordereau: vi.fn(), replaceBordereau: vi.fn(), addLine: vi.fn(), updateLine: vi.fn(), deleteLine: vi.fn(), controlLine: vi.fn(),
        conformRemaining: vi.fn(), agreements: vi.fn(), saveAgreement: vi.fn(), command: vi.fn(),
        integrations: vi.fn(), integrationPreview: vi.fn(), integrate: vi.fn(), sedaExport: vi.fn() },
    records: { transport: { request: vi.fn() } }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => session }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => session.allowed.has(code) }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: { institutionId: INST, departmentId: null } }) }));
vi.mock('../../src/ui/names', () => ({ EntityName: ({ id }: { id: string }) => <>{id === INST ? 'Archives nationales' : 'Agent ' + id.slice(-2)}</>, useEntityName: () => ({ name: 'Archives nationales', loading: false }) }));
vi.mock('../../src/ui/ReferencePicker', () => ({ ReferencePicker: ({ label, onChange, value, disabled }: { label: string; onChange: (id: string) => void; value: string; disabled?: boolean }) => <button type="button" disabled={disabled} onClick={() => onChange(INST)}>{value ? 'Choisi : ' + label : label}</button> }));
import { ArchivalIntakePage } from '../../src/pages/ArchivalIntake';

const intake = (extra: Record<string, unknown> = {}) => ({ id: ENTRY, numero: 'ENT-2026-001', modeEntree: 'VERSEMENT', sourceActeurId: null, sourceInstitutionId: null, dateEntree: '2026-10-01T09:00:00Z', statut: 'OUVERTE',
    instrument: null, referencePreuve: null, responsableId: null, description: null, versionLock: 0, etape: 'PREPARATION', accordId: null, producteurId: PROD, institutionArchivesId: INST,
    dateSoumission: null, dateDecision: null, motifDecision: null, accuseReference: null, accuseDate: null, ...extra });
const classic = () => intake({ id: '00000000-0000-4000-8000-0000000000e2', numero: 'ENT-OLD', modeEntree: 'DON', etape: null, producteurId: null, institutionArchivesId: null });
let counter = 0;
const lineOf = (reference: string, over: Record<string, unknown> = {}, input: Record<string, unknown> = {}): BordereauLine => ({ id: `00000000-0000-4000-8000-00000000${(++counter).toString(16).padStart(4, '0')}`, rang: counter, version: 0,
    input: { reference, intitule: 'Registres ' + reference, dateDebut: '1960', dateFin: '1965', quantite: 3.5, unite: 'ML', support: null, duaAnnees: null, sortFinal: null, observations: null, ...input },
    constat: null, quantiteConstatee: null, motifEcart: null, ...over } as BordereauLine);
const bordereau = (etape: IntakeStage, lignes: BordereauLine[], extra: Partial<BordereauView> = {}): BordereauView => ({ etape, lignes, totaux: totals(lignes.map(l => l.input)), bilan: null, avertissements: [],
    modifiable: etape === 'PREPARATION' || etape === 'A_CORRIGER', controlable: etape === 'ACCEPTE', ...extra });
const authority = { id: PROD, input: { institutionId: INST, code: 'MIN-FIN', name: 'Ministère des Finances', kind: 'COLLECTIVITE', details: {} }, version: 1, updatedAt: '2026-10-01T00:00:00Z' };
const agreement = (over: Record<string, unknown> = {}): AgreementView => ({ id: ACC, version: 2, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', versements: 1,
    input: { reference: 'ACC-2026-01', intitule: 'Versements annuels des Finances', producteurId: PROD, serviceVersantId: null, institutionArchivesId: INST, statut: 'ACTIF', dateDebut: '2026-01-01', dateFin: '2026-12-31',
        periodicite: 'ANNUEL', volumePrevu: 10, uniteVolume: 'ML', formatsAcceptes: null, conditions: null, ...over } });

function serve(entries: unknown[], view: BordereauView | null, agreements: AgreementView[] = []) {
    session.archivalIntake.entries.mockResolvedValue(entries);
    session.archivalIntake.bordereau.mockImplementation(async () => view);
    session.archivalIntake.agreements.mockResolvedValue(agreements);
    session.archivalIntake.integrations.mockResolvedValue([]);
    session.archivalIntake.journal.mockResolvedValue([{ id: 'j1', de: null, vers: 'PREPARATION', acteurId: '00000000-0000-4000-8000-0000000000d1', date: '2026-10-01T09:00:00Z', motif: null }]);
    session.records.transport.request.mockImplementation(async (path: string) => { if (path.startsWith('/archives/authorities?')) return [authority]; throw new Error('appel inattendu ' + path); });
}
async function openDetail(name = 'ENT-2026-001') {
    render(<ArchivalIntakePage />);
    fireEvent.click(await screen.findByRole('button', { name }));
    return await screen.findByRole('dialog');
}
beforeEach(() => {
    counter = 0; session.allowed = new Set(['ARCHIVAL_INTAKE_READ', 'ARCHIVAL_INTAKE_MANAGE']);
    for (const fn of Object.values(session.archivalIntake)) fn.mockReset();
    session.records.transport.request.mockReset();
});

it('la liste distingue les versements structurés, avec leur étape, des entrées simples', async () => {
    serve([intake({ etape: 'EN_CONTROLE' }), classic()], null);
    render(<ArchivalIntakePage />);
    const rows = (await screen.findAllByRole('row')).slice(1).map(r => r.textContent ?? '');
    expect(rows[0]).toContain('ENT-2026-001'); expect(rows[0]).toContain('En contrôle'); expect(rows[0]).toContain('Versement');
    expect(rows[1]).toContain('Entrée simple'); expect(rows[1]).toContain('Don');
});

it('la fiche d’un versement en préparation montre les parties par leur nom, l’étape et la volumétrie', async () => {
    serve([intake({ accordId: ACC })], bordereau('PREPARATION', [lineOf('B-1'), lineOf('B-2', {}, { quantite: 12, unite: 'ML' })]), [agreement()]);
    const dialog = await openDetail();
    expect(await within(dialog).findByText('Ministère des Finances')).toBeTruthy();                    // le producteur par son nom
    expect(within(dialog).getAllByText('Archives nationales').length).toBeGreaterThan(0);
    expect(await within(dialog).findByText('ACC-2026-01 · Versements annuels des Finances')).toBeTruthy();
    expect(within(dialog).getByText(/Le bordereau est en cours de saisie/)).toBeTruthy();
    expect(await within(dialog).findByText(/volumétrie annoncée : 15,5 mètres linéaires/)).toBeTruthy();
    expect(dialog.textContent).not.toContain(PROD);                                                    // jamais d'identifiant
    expect(within(dialog).getByText(/Création \(en préparation\)/)).toBeTruthy();
});

it('soumettre est bloqué tant que le bordereau est vide, avec la raison', async () => {
    serve([intake()], bordereau('PREPARATION', []));
    const dialog = await openDetail();
    expect(await within(dialog).findByText('Le bordereau est vide : ajoutez au moins une ligne.')).toBeTruthy();
    expect((within(dialog).getByRole('button', { name: 'Soumettre le bordereau' }) as HTMLButtonElement).disabled).toBe(true);
});

it('avec des lignes valides, soumettre se confirme puis part au serveur', async () => {
    serve([intake()], bordereau('PREPARATION', [lineOf('B-1')]));
    const dialog = await openDetail();
    await waitFor(() => expect((within(dialog).getByRole('button', { name: 'Soumettre le bordereau' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Soumettre le bordereau' }));
    expect(within(dialog).getByText(/ne pourra plus être modifié/)).toBeTruthy();
    session.archivalIntake.cycle.mockResolvedValue(intake({ etape: 'SOUMIS' }));
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Soumettre le bordereau' }).at(-1)!);
    await waitFor(() => expect(session.archivalIntake.cycle).toHaveBeenCalledWith(ENTRY, 'submit', undefined));
});

it('un accord suspendu empêche la soumission et le dit', async () => {
    serve([intake({ accordId: ACC })], bordereau('PREPARATION', [lineOf('B-1')]), [agreement({ statut: 'SUSPENDU' })]);
    const dialog = await openDetail();
    expect(await within(dialog).findByText(/L’accord ACC-2026-01 n’est pas actif \(suspendu\)/)).toBeTruthy();
    expect((within(dialog).getByRole('button', { name: 'Soumettre le bordereau' }) as HTMLButtonElement).disabled).toBe(true);
});

it('rejeter exige un motif et le transmet', async () => {
    serve([intake({ etape: 'EN_CONTROLE' })], bordereau('EN_CONTROLE', [lineOf('B-1')]));
    const dialog = await openDetail();
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Rejeter le versement' }));
    const confirm = () => within(dialog).getAllByRole('button', { name: 'Rejeter le versement' }).at(-1) as HTMLButtonElement;
    expect(confirm().disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText('Motif'), { target: { value: 'Hors périmètre' } });
    expect(confirm().disabled).toBe(false);
    session.archivalIntake.cycle.mockResolvedValue(intake({ etape: 'REJETE' }));
    fireEvent.click(confirm());
    await waitFor(() => expect(session.archivalIntake.cycle).toHaveBeenCalledWith(ENTRY, 'reject', 'Hors périmètre'));
});

it('une correction demandée s’affiche avec son motif, et le bordereau redevient modifiable', async () => {
    serve([intake({ etape: 'A_CORRIGER', motifDecision: 'Dates manquantes à la ligne 2' })], bordereau('A_CORRIGER', [lineOf('B-1')]));
    const dialog = await openDetail();
    expect(await within(dialog).findByText(/Dates manquantes à la ligne 2/)).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Ajouter une ligne' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Soumettre à nouveau' })).toBeTruthy();
});

it('en contrôle, le bordereau n’est plus modifiable ; les décisions sont proposées', async () => {
    serve([intake({ etape: 'EN_CONTROLE' })], bordereau('EN_CONTROLE', [lineOf('B-1')]));
    const dialog = await openDetail();
    await within(dialog).findByText(/Le service d’archives contrôle le bordereau/);
    expect(within(dialog).queryByRole('button', { name: 'Ajouter une ligne' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Modifier' })).toBeNull();
    for (const name of ['Accepter le bordereau', 'Demander une correction', 'Rejeter le versement']) expect(within(dialog).getByRole('button', { name })).toBeTruthy();
});

it('sans droit de gestion, aucune action ni modification n’est proposée', async () => {
    session.allowed = new Set(['ARCHIVAL_INTAKE_READ']);
    serve([intake()], bordereau('PREPARATION', [lineOf('B-1')]));
    const dialog = await openDetail();
    await within(dialog).findByText(/volumétrie annoncée/);
    expect(within(dialog).queryByRole('button', { name: 'Soumettre le bordereau' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Ajouter une ligne' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Modifier' })).toBeNull();
});

it('une ligne avec une quantité sans unité est signalée avant l’envoi, puis enregistrée avec le bon contenu', async () => {
    serve([intake()], bordereau('PREPARATION', []));
    const dialog = await openDetail();
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Ajouter une ligne' }));
    const form = (await screen.findAllByRole('dialog')).at(-1)!;
    const save = () => within(form).getByRole('button', { name: 'Enregistrer' }) as HTMLButtonElement;
    fireEvent.change(within(form).getByLabelText(/^Référence/), { target: { value: 'DAF/001' } });
    fireEvent.change(within(form).getByLabelText('Intitulé'), { target: { value: 'Registres de paie' } });
    fireEvent.change(within(form).getByLabelText('Quantité'), { target: { value: '12,5' } });
    expect(within(form).getByRole('alert').textContent).toContain('ET l’unité'); expect(save().disabled).toBe(true);
    fireEvent.change(within(form).getByLabelText('Unité'), { target: { value: 'ML' } });
    fireEvent.change(within(form).getByLabelText(/^Date de début/), { target: { value: '1960' } });
    expect(within(form).queryByRole('alert')).toBeNull(); expect(save().disabled).toBe(false);
    session.archivalIntake.addLine.mockResolvedValue(lineOf('DAF/001'));
    fireEvent.click(save());
    await waitFor(() => expect(session.archivalIntake.addLine).toHaveBeenCalled());
    expect(session.archivalIntake.addLine.mock.calls[0]).toEqual([ENTRY, expect.objectContaining({ reference: 'DAF/001', intitule: 'Registres de paie', quantite: 12.5, unite: 'ML', dateDebut: '1960', dateFin: null })]);
});

it('un conflit de version à l’enregistrement d’une ligne est montré sans fermer le formulaire', async () => {
    const line = lineOf('B-1');
    serve([intake()], bordereau('PREPARATION', [line]));
    const dialog = await openDetail();
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Modifier' }));
    const form = (await screen.findAllByRole('dialog')).at(-1)!;
    session.archivalIntake.updateLine.mockRejectedValue(new ApiError(409, 'BORDEREAU_LINE_VERSION_CONFLICT', 'Cette ligne a été modifiée entre-temps ; rechargez le bordereau.', 'c1'));
    fireEvent.change(within(form).getByLabelText('Intitulé'), { target: { value: 'Autre' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Enregistrer' }));
    expect(await within(form).findByText(/modifiée entre-temps/)).toBeTruthy();
    expect(session.archivalIntake.updateLine).toHaveBeenCalledWith(ENTRY, line.id, expect.objectContaining({ intitule: 'Autre' }), 0);
});

function csv(text: string) { const f = new File([text], 'bordereau.csv', { type: 'text/csv' }); Object.defineProperty(f, 'arrayBuffer', { value: async () => new TextEncoder().encode(text).buffer }); return f; }

it('l’import d’un fichier avec des erreurs liste les lignes fautives et ne remplace rien', async () => {
    serve([intake()], bordereau('PREPARATION', [lineOf('B-1')]));
    const dialog = await openDetail();
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Importer un fichier' }));
    const importer = (await screen.findAllByRole('dialog')).at(-1)!;
    expect(within(importer).getByText(/remplace tout le bordereau actuel \(1 ligne\)/)).toBeTruthy();
    fireEvent.change(within(importer).getByLabelText('Fichier du bordereau'), { target: { files: [csv('Référence;Intitulé;Date de début;Quantité;Unité\nR1;Registres;1960;3;mètres linéaires\n;Sans référence;1961;2;boîtes\nR3;Mauvaise unité;1962;2;tonnes')] } });
    expect(await within(importer).findByText(/3 lignes lues, 2 en erreur/)).toBeTruthy();
    expect(within(importer).getByText('La référence est obligatoire.')).toBeTruthy();
    expect(within(importer).getByText('Unité « tonnes » inconnue.')).toBeTruthy();
    expect((within(importer).getByRole('button', { name: 'Importer' }) as HTMLButtonElement).disabled).toBe(true);
    expect(session.archivalIntake.replaceBordereau).not.toHaveBeenCalled();
});

it('un fichier valide remplace le bordereau d’un coup', async () => {
    serve([intake()], bordereau('PREPARATION', []));
    const dialog = await openDetail();
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Importer un fichier' }));
    const importer = (await screen.findAllByRole('dialog')).at(-1)!;
    fireEvent.change(within(importer).getByLabelText('Fichier du bordereau'), { target: { files: [csv('Référence;Intitulé;Date de début;Date de fin;Quantité;Unité\nR1;Registres;1960;1965;3,5;mètres linéaires\nR2;Plans;12/05/1970;;2;boîtes')] } });
    const go = await within(importer).findByRole('button', { name: 'Importer 2 lignes' });
    session.archivalIntake.replaceBordereau.mockResolvedValue(bordereau('PREPARATION', []));
    fireEvent.click(go);
    await waitFor(() => expect(session.archivalIntake.replaceBordereau).toHaveBeenCalled());
    const [id, lignes] = session.archivalIntake.replaceBordereau.mock.calls[0] as [string, Array<Record<string, unknown>>];
    expect(id).toBe(ENTRY);
    expect(lignes.map(l => [l.reference, l.quantite, l.unite, l.dateDebut])).toEqual([['R1', 3.5, 'ML', '1960'], ['R2', 2, 'BOITES', '1970-05-12']]);
});

it('après acceptation, on contrôle chaque ligne ; recevoir reste bloqué tant qu’une ligne n’est pas contrôlée', async () => {
    const a = lineOf('B-1'), b = lineOf('B-2', {}, { quantite: 10 });
    serve([intake({ etape: 'ACCEPTE' })], bordereau('ACCEPTE', [a, b], { bilan: { conformes: 0, ecarts: 0, absents: 0, annonce: totals([a.input, b.input]), constate: [] } }));
    const dialog = await openDetail();
    expect(await within(dialog).findByText('2 lignes n’ont pas encore été contrôlées.')).toBeTruthy();
    expect((within(dialog).getByRole('button', { name: 'Constater la réception' }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(dialog).getAllByText('à contrôler').length).toBe(2);
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Contrôler' })[1]!);
    const control = (await screen.findAllByRole('dialog')).at(-1)!;
    expect(within(control).getByText(/Annoncé au bordereau/).textContent).toContain('10 mètres linéaires');
    fireEvent.change(within(control).getByLabelText('Constat'), { target: { value: 'ECART' } });
    const save = () => within(control).getByRole('button', { name: 'Enregistrer le constat' }) as HTMLButtonElement;
    expect(within(control).getByRole('alert').textContent).toContain('Expliquez l’écart'); expect(save().disabled).toBe(true);
    fireEvent.change(within(control).getByLabelText('Quantité constatée'), { target: { value: '9' } });
    fireEvent.change(within(control).getByLabelText(/^Motif de l’écart/), { target: { value: 'Une boîte manquante' } });
    expect(save().disabled).toBe(false);
    session.archivalIntake.controlLine.mockResolvedValue({ ...b, constat: 'ECART' });
    fireEvent.click(save());
    await waitFor(() => expect(session.archivalIntake.controlLine).toHaveBeenCalledWith(ENTRY, b.id, { constat: 'ECART', quantiteConstatee: 9, motifEcart: 'Une boîte manquante' }, 0));
});

it('« lignes restantes conformes » appelle le serveur en un seul geste', async () => {
    serve([intake({ etape: 'ACCEPTE' })], bordereau('ACCEPTE', [lineOf('B-1'), lineOf('B-2')]));
    const dialog = await openDetail();
    session.archivalIntake.conformRemaining.mockResolvedValue(bordereau('ACCEPTE', []));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Déclarer conformes les lignes restantes' }));
    await waitFor(() => expect(session.archivalIntake.conformRemaining).toHaveBeenCalledWith(ENTRY));
});

it('un versement reçu montre son accusé, plus aucune action, et se clôture', async () => {
    const a = lineOf('B-1', { constat: 'CONFORME' });
    serve([intake({ etape: 'RECU', accuseReference: 'AR-2026-000001', accuseDate: '2026-10-09T10:00:00Z' })], bordereau('RECU', [a], { modifiable: false, controlable: false }));
    const dialog = await openDetail();
    expect(await within(dialog).findByText('AR-2026-000001')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Afficher et imprimer' })).toBeTruthy();
    for (const name of ['Constater la réception', 'Rejeter le versement', 'Ajouter une ligne']) expect(within(dialog).queryByRole('button', { name })).toBeNull();
    expect((within(dialog).getByRole('button', { name: 'Clôturer l’entrée' }) as HTMLButtonElement).disabled).toBe(false);
});

it('un versement non terminé ne se clôture pas, et l’explique', async () => {
    serve([intake({ etape: 'SOUMIS' })], bordereau('SOUMIS', [lineOf('B-1')]));
    const dialog = await openDetail();
    const close = await within(dialog).findByRole('button', { name: 'Clôturer l’entrée' }) as HTMLButtonElement;
    expect(close.disabled).toBe(true); expect(close.title).toMatch(/reçu ou rejeté/);
});

it('créer un versement structuré : l’accord fixe le producteur et le service d’archives, et part dans la requête', async () => {
    serve([], null, [agreement(), agreement({ statut: 'SUSPENDU', reference: 'ACC-OLD' })]);
    render(<ArchivalIntakePage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Créer une entrée' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Numéro'), { target: { value: 'ENT-2026-050' } });
    fireEvent.change(within(dialog).getByLabelText('Date d’entrée'), { target: { value: '2026-10-01T09:00' } });
    const create = () => within(dialog).getByRole('button', { name: 'Créer' }) as HTMLButtonElement;
    expect(create().disabled).toBe(false);                                           // une entrée simple n'a pas de parties
    fireEvent.click(within(dialog).getByLabelText(/Versement structuré/));
    expect(create().disabled).toBe(true);                                            // il faut désigner producteur et service d'archives
    const select = await within(dialog).findByLabelText(/^Accord de versement/);
    const options = within(select as HTMLElement).getAllByRole('option').map(o => o.textContent);
    expect(options).toEqual(['Sans accord', 'ACC-2026-01 · Versements annuels des Finances']);   // seuls les accords en vigueur
    fireEvent.change(select, { target: { value: ACC } });
    await waitFor(() => expect(create().disabled).toBe(false));
    session.archivalIntake.command.mockResolvedValue(intake());
    fireEvent.click(create());
    await waitFor(() => expect(session.archivalIntake.command).toHaveBeenCalled());
    const [path, body] = session.archivalIntake.command.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe('/entries');
    expect(body).toMatchObject({ numero: 'ENT-2026-050', modeEntree: 'VERSEMENT', structured: true, accordId: ACC, producteurId: PROD, institutionArchivesId: INST });
});

it('l’onglet des accords liste les accords avec le nom du producteur, la période et le volume', async () => {
    serve([], null, [agreement(), agreement({ statut: 'CLOS', reference: 'ACC-OLD', volumePrevu: null, uniteVolume: null, periodicite: 'PONCTUEL', dateFin: null })]);
    render(<ArchivalIntakePage />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Accords de versement' }));
    const rows = (await screen.findAllByRole('row')).slice(1);
    await waitFor(() => expect(rows[0]!.textContent).toContain('Ministère des Finances'));
    expect(rows[0]!.textContent).toContain('2026-01-01 → 2026-12-31'); expect(rows[0]!.textContent).toContain('10 mètres linéaires par an'); expect(rows[0]!.textContent).toContain('Actif');
    expect(rows[1]!.textContent).toContain('sans échéance'); expect(rows[1]!.textContent).toContain('Clos');
    expect(screen.queryByRole('button', { name: 'Créer une entrée' })).toBeNull();
});

it('un nouvel accord incomplet dit ce qui manque, puis s’enregistre en projet', async () => {
    serve([], null, []);
    render(<ArchivalIntakePage />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Accords de versement' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Nouvel accord' }));
    const dialog = await screen.findByRole('dialog');
    const save = () => within(dialog).getByRole('button', { name: 'Enregistrer' }) as HTMLButtonElement;
    expect(within(dialog).getByRole('alert').textContent).toContain('La référence de l’accord est obligatoire.'); expect(save().disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText('Référence de l’accord'), { target: { value: 'ACC-2027-01' } });
    fireEvent.change(within(dialog).getByLabelText('Intitulé'), { target: { value: 'Versements des Finances' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Service d’archives destinataire' }));
    const producer = await within(dialog).findByLabelText(/^Producteur/);
    await waitFor(() => expect((producer as HTMLSelectElement).disabled).toBe(false));
    fireEvent.change(producer, { target: { value: PROD } });
    fireEvent.change(within(dialog).getByLabelText('Date de début'), { target: { value: '2027-01-01' } });
    expect(within(dialog).queryByRole('alert')).toBeNull();
    session.archivalIntake.saveAgreement.mockResolvedValue(agreement());
    fireEvent.click(save());
    await waitFor(() => expect(session.archivalIntake.saveAgreement).toHaveBeenCalled());
    const [id, body] = session.archivalIntake.saveAgreement.mock.calls[0] as [string | undefined, Record<string, unknown>];
    expect(id).toBeUndefined();
    expect(body).toMatchObject({ reference: 'ACC-2027-01', producteurId: PROD, institutionArchivesId: INST, statut: 'PROJET', dateDebut: '2027-01-01', dateFin: null, volumePrevu: null, uniteVolume: null, version: 0 });
});

it('un accord clos ou utilisé par des versements ne change plus ses parties', async () => {
    serve([], null, [agreement()]);
    render(<ArchivalIntakePage />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Accords de versement' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Des versements s’appuient sur cet accord/)).toBeTruthy();
    expect((within(dialog).getByRole('button', { name: /Service d’archives destinataire/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(dialog).getAllByRole('option').map(o => o.textContent)).toEqual(expect.arrayContaining(['Actif', 'Suspendu', 'Clos']));
    expect(within(dialog).queryByRole('option', { name: 'En projet' })).toBeNull();            // pas de retour en arrière
});
