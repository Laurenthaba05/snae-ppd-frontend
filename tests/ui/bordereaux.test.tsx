import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Bordereau, BordereauCandidate, BordereauLine, BordereauSummary } from '../../src/core/bordereaux';

const INST = '97571d20-3f49-497e-a185-dac22208eb3f';
const BID = '11111111-1111-4111-8111-111111111111';
const fixture = vi.hoisted(() => ({
    epoch: 1, me: null as unknown, allowed: new Set<string>(),
    retention: {
        bordereaux: vi.fn(), bordereau: vi.fn(), bordereauReadiness: vi.fn(), eliminationCandidates: vi.fn(), createBordereau: vi.fn(), addBordereauLines: vi.fn(), removeBordereauLine: vi.fn(),
        retireBordereauLine: vi.fn(), submitBordereau: vi.fn(), visaBordereau: vi.fn(), executeBordereau: vi.fn(), cancelBordereau: vi.fn(),
        dossierEliminationPlan: vi.fn(), createBordereauFromDossier: vi.fn(), addDossierToBordereau: vi.fn()
    },
    records: { dossiers: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
vi.mock('../../src/ui/names', () => ({
    EntityName: ({ id }: { id: string }) => <>{'Agent ' + id.slice(0, 2)}</>,
    useEntityName: (_kind: string, id: string | null | undefined) => ({ name: id ? 'Agent ' + id.slice(0, 2) : null, loading: false })
}));
import { BordereauxPanel } from '../../src/ui/Bordereaux';

const summary = (over: Partial<BordereauSummary> = {}): BordereauSummary => ({
    id: BID, reference: 'BE-2026-000001', institutionId: INST, title: 'Registres de 1990', status: 'BROUILLON', lines: 2, registered: 2, proposed: 0, accepted: 0, refused: 0, destroyed: 0, cancelled: 0,
    totalBytes: 2048, createdById: '11-a', createdAt: '2026-10-10T08:00:00Z', submittedAt: null, visaAt: null, completedAt: null, version: 0, ...over
});
const line = (n: number, over: Partial<BordereauLine> = {}): BordereauLine => ({
    id: `l${n}`, rank: n, status: 'INSCRITE', eventId: `e${n}`, documentId: `d${n}`, reference: `DOC-${n}`, title: `Registre ${n}`, baseDate: '1990-01-01', dueDate: '2020-01-01', rule: 'Élimination des registres',
    fileCount: 1, totalBytes: 1024, actionId: null, refusalReason: null, certificateId: null, certificateReference: null, attempts: 0, lastError: null, ...over
});
const bordereau = (status: Bordereau['summary']['status'], lines: BordereauLine[], over: Partial<Bordereau> = {}, sum: Partial<BordereauSummary> = {}): Bordereau => ({
    summary: summary({ status, lines: lines.length, ...sum }), observations: null, authority: null, visaReference: null, visaDate: null, procesVerbal: null, submittedById: null, visaById: null,
    cancelledById: null, cancelledAt: null, cancellationReason: null, fingerprint: null, lines, ...over
});
const candidate = (n: number, over: Partial<BordereauCandidate> = {}): BordereauCandidate => ({
    eventId: `e${n}`, documentId: `d${n}`, reference: `DOC-${n}`, title: `Registre ${n}`, departmentId: null, baseDate: '1990-01-01', dueDate: '2020-01-01', rule: 'Élimination des registres',
    fileCount: 1, totalBytes: 1024, blockers: [], bordereauId: null, bordereauReference: null, ...over
});

beforeEach(() => {
    fixture.epoch += 1;
    fixture.allowed = new Set(['DISPOSITION_PROPOSE', 'DISPOSITION_VALIDATE', 'DISPOSITION_EXECUTE']);
    for (const fn of Object.values(fixture.retention)) fn.mockReset();
    fixture.retention.bordereaux.mockResolvedValue([]);
    fixture.retention.bordereauReadiness.mockResolvedValue({ bordereauId: BID, lines: [] });
    fixture.retention.eliminationCandidates.mockResolvedValue([]);
});

const panel = () => render(<BordereauxPanel institutionId={INST} />);
const opened = async (b: Bordereau) => {
    fixture.retention.bordereaux.mockResolvedValue([b.summary]);
    fixture.retention.bordereau.mockResolvedValue(b);
    panel();
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir' }));
    return await screen.findByRole('dialog');
};

it('sans bordereau, le panneau l’explique et propose d’en constituer un à qui peut proposer', async () => {
    panel();
    expect(await screen.findByText('Aucun bordereau')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Nouveau bordereau' })).toBeTruthy();
});

it('sans le droit de proposer, on ne constitue pas de bordereau', async () => {
    fixture.allowed = new Set(['DISPOSITION_VALIDATE']);
    panel();
    await screen.findByText('Aucun bordereau');
    expect(screen.queryByRole('button', { name: 'Nouveau bordereau' })).toBeNull();
});

it('la liste montre chaque bordereau avec son état, son avancement et son auteur par son nom', async () => {
    fixture.retention.bordereaux.mockResolvedValue([summary({ status: 'VISE', accepted: 1, destroyed: 1, lines: 2 }), summary({ id: 'b2', reference: 'BE-2026-000002', title: 'Archives de 1985', status: 'SOUMIS', proposed: 3, lines: 3 })]);
    panel();
    expect(await screen.findByText('BE-2026-000001')).toBeTruthy();
    expect(screen.getByText('Visé')).toBeTruthy(); expect(screen.getByText('Soumis au visa')).toBeTruthy();
    expect(screen.getByText('1 document détruit sur 2 visés : 1 reste à détruire.')).toBeTruthy();
    expect(screen.getByText(/3 lignes attendent le visa/)).toBeTruthy();
    expect(screen.getAllByText('Agent 11').length).toBeGreaterThan(0);
});

it('constituer un bordereau : les documents bloqués se lisent, ne se cochent pas, et la création part avec les échéances choisies', async () => {
    fixture.retention.eliminationCandidates.mockResolvedValue([candidate(1), candidate(2), candidate(3, { blockers: ['DOCUMENT_ESSENTIAL'] }), candidate(4, { blockers: ['ALREADY_IN_BORDEREAU'], bordereauReference: 'BE-2026-000009' })]);
    fixture.retention.createBordereau.mockResolvedValue(bordereau('BROUILLON', [line(1), line(2)]));
    fixture.retention.bordereau.mockResolvedValue(bordereau('BROUILLON', [line(1), line(2)]));
    panel();
    fireEvent.click(await screen.findByRole('button', { name: 'Nouveau bordereau' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('DOC-1')).toBeTruthy();
    expect(within(dialog).getByText(/Document essentiel : retirez d’abord la mention/)).toBeTruthy();
    expect(within(dialog).getByText('Déjà inscrit au bordereau BE-2026-000009.')).toBeTruthy();
    expect((within(dialog).getByLabelText('Choisir DOC-3') as HTMLInputElement).disabled).toBe(true);
    expect((within(dialog).getByLabelText('Choisir DOC-4') as HTMLInputElement).disabled).toBe(true);
    // rien ne part sans intitulé ni sélection : les manques sont nommés
    fireEvent.click(within(dialog).getByRole('button', { name: 'Constituer le bordereau' }));
    expect(await within(dialog).findByText('L’intitulé du bordereau est obligatoire.')).toBeTruthy();
    expect(within(dialog).getByText('Choisissez au moins un document.')).toBeTruthy();
    expect(fixture.retention.createBordereau).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByLabelText('Tout choisir'));
    expect(within(dialog).getByText(/^2 documents \(.*\) choisis\.$/)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText(/^Intitulé du bordereau/), { target: { value: 'Registres de 1990' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Constituer le bordereau' }));
    await waitFor(() => expect(fixture.retention.createBordereau).toHaveBeenCalledWith(INST, 'Registres de 1990', null, ['e1', 'e2'], expect.any(String)));
    // le bordereau constitué s'ouvre aussitôt
    expect(await screen.findByText('Bordereau d’élimination')).toBeTruthy();
});

it('un brouillon se soumet à l’autorité, se complète, et une ligne s’en ôte', async () => {
    const b = bordereau('BROUILLON', [line(1), line(2)]);
    fixture.retention.removeBordereauLine.mockResolvedValue(bordereau('BROUILLON', [line(2)]));
    fixture.retention.submitBordereau.mockResolvedValue(bordereau('SOUMIS', [line(1, { status: 'PROPOSEE' })], {}, { proposed: 2 }));
    const dialog = await opened(b);
    expect(within(dialog).getByText('Registre 1')).toBeTruthy();
    expect(within(dialog).getByText(/Il n’est pas encore soumis à l’autorité/)).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Ajouter des documents' })).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Viser le bordereau' })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ôter DOC-1' }));
    await waitFor(() => expect(fixture.retention.removeBordereauLine).toHaveBeenCalledWith(BID, 'l1', expect.any(String)));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Soumettre à l’autorité' }));
    await waitFor(() => expect(fixture.retention.submitBordereau).toHaveBeenCalledWith(BID, expect.any(String)));
});

it('le visa exige l’autorité, une décision motivée pour chaque refus, puis part avec la référence et le procès-verbal', async () => {
    const b = bordereau('SOUMIS', [line(1, { status: 'PROPOSEE', actionId: 'a1' }), line(2, { status: 'PROPOSEE', actionId: 'a2' })], { submittedById: '22-b' }, { proposed: 2 });
    fixture.retention.visaBordereau.mockResolvedValue(bordereau('VISE', [line(1, { status: 'ACCEPTEE' }), line(2, { status: 'REFUSEE', refusalReason: 'Valeur historique' })]));
    const detail = await opened(b);
    expect(within(detail).queryByRole('button', { name: 'Détruire les documents visés' })).toBeNull();
    fireEvent.click(within(detail).getByRole('button', { name: 'Viser le bordereau' }));
    const dialogs = await screen.findAllByRole('dialog');
    const dialog = dialogs[dialogs.length - 1]!;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer le visa' }));
    expect(await within(dialog).findByText('L’autorité qui vise est obligatoire.')).toBeTruthy();
    expect(fixture.retention.visaBordereau).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText(/^Autorité qui vise/), { target: { value: 'Archives nationales' } });
    fireEvent.change(within(dialog).getByLabelText(/^Référence du visa/), { target: { value: 'VISA-2026-014' } });
    fireEvent.change(within(dialog).getByLabelText(/^Procès-verbal/), { target: { value: 'Décision de la commission.' } });
    // refuser la ligne 2 : le motif devient obligatoire
    const fieldset = within(dialog).getByRole('group', { name: 'Décision pour DOC-2' });
    fireEvent.click(within(fieldset).getByLabelText('Refuser'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer le visa' }));
    expect(await within(dialog).findByText('1 refus doit être motivé.')).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText('Motif du refus de DOC-2'), { target: { value: 'Valeur historique' } });
    expect(within(dialog).getByText('1 document accepté, 1 refusé.')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer le visa' }));
    await waitFor(() => expect(fixture.retention.visaBordereau).toHaveBeenCalled());
    const [id, body] = fixture.retention.visaBordereau.mock.calls[0] as [string, Record<string, unknown>, string];
    expect(id).toBe(BID);
    expect(body).toMatchObject({ authority: 'Archives nationales', visaReference: 'VISA-2026-014', procesVerbal: 'Décision de la commission.',
        decisions: [{ lineId: 'l1', accept: true, reason: null }, { lineId: 'l2', accept: false, reason: 'Valeur historique' }] });
    expect(String(body.visaDate)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

it('la personne qui peut seulement proposer ne voit pas le bouton de visa', async () => {
    fixture.allowed = new Set(['DISPOSITION_PROPOSE']);
    const dialog = await opened(bordereau('SOUMIS', [line(1, { status: 'PROPOSEE' })], {}, { proposed: 1 }));
    expect(within(dialog).queryByRole('button', { name: 'Viser le bordereau' })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Annuler le bordereau' })).toBeTruthy();
});

it('la destruction exige une confirmation, procède par lots, et affiche le bordereau exécuté', async () => {
    const b = bordereau('VISE', [line(1, { status: 'ACCEPTEE', actionId: 'a1' }), line(2, { status: 'ACCEPTEE', actionId: 'a2' })], { visaReference: 'VISA-2026-014', authority: 'Archives nationales' }, { accepted: 2 });
    const done = bordereau('EXECUTE', [line(1, { status: 'DETRUITE', certificateReference: 'CD-2026-000001' }), line(2, { status: 'DETRUITE', certificateReference: 'CD-2026-000002' })], {}, { destroyed: 2 });
    fixture.retention.executeBordereau.mockResolvedValueOnce({ bordereau: b, destroyedNow: 1, failures: [], remaining: 1 }).mockResolvedValueOnce({ bordereau: done, destroyedNow: 1, failures: [], remaining: 0 });
    const detail = await opened(b);
    fireEvent.click(within(detail).getByRole('button', { name: 'Détruire les documents visés' }));
    const dialogs = await screen.findAllByRole('dialog');
    const dialog = dialogs[dialogs.length - 1]!;
    expect(within(dialog).getByText(/2 documents \(.*\) vont être détruits/)).toBeTruthy();
    const run = () => within(dialog).getByRole('button', { name: 'Détruire' }) as HTMLButtonElement;
    expect(run().disabled).toBe(true);                                                  // pas de destruction sans avoir coché
    fireEvent.click(within(dialog).getByLabelText(/Je confirme la destruction définitive de 2 documents de ce bordereau/));
    await waitFor(() => expect(run().disabled).toBe(false));
    fireEvent.click(run());
    await waitFor(() => expect(fixture.retention.executeBordereau).toHaveBeenCalledTimes(2));
    expect(fixture.retention.executeBordereau).toHaveBeenCalledWith(BID, 25, expect.any(String));
    expect(await within(dialog).findByText('Tous les documents visés ont été détruits : le bordereau est exécuté.')).toBeTruthy();
});

it('une destruction en échec s’arrête, dit la ligne et la raison, et se reprend', async () => {
    const b = bordereau('VISE', [line(1, { status: 'ACCEPTEE', actionId: 'a1' })], {}, { accepted: 1 });
    fixture.retention.executeBordereau.mockResolvedValueOnce({ bordereau: b, destroyedNow: 0, remaining: 1,
        failures: [{ lineId: 'l1', rank: 1, reference: 'DOC-1', code: 'STORAGE_PROVIDER_REJECTED', message: 'Le fournisseur de stockage a refusé la suppression.' }] });
    const detail = await opened(b);
    fireEvent.click(within(detail).getByRole('button', { name: 'Détruire les documents visés' }));
    const dialogs = await screen.findAllByRole('dialog');
    const dialog = dialogs[dialogs.length - 1]!;
    fireEvent.click(within(dialog).getByLabelText(/Je confirme la destruction définitive de 1 document de ce bordereau/));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Détruire' }));
    expect(await within(dialog).findByText(/Ligne 1 \(DOC-1\) : Le fournisseur de stockage a refusé la suppression\./)).toBeTruthy();
    expect(within(dialog).getByText(/0 document détruit ; 1 échec \(voir ci-dessous\) ; 1 reste à détruire\./)).toBeTruthy();
    expect(fixture.retention.executeBordereau).toHaveBeenCalledTimes(1);                // l'échec arrête la boucle
    expect(within(dialog).getByRole('button', { name: 'Reprendre la destruction' })).toBeTruthy();
});

it('une ligne bloquée par la vérification est dite, et se retire avec un motif', async () => {
    fixture.retention.bordereauReadiness.mockResolvedValue({ bordereauId: BID, lines: [{ lineId: 'l1', blockers: ['DOCUMENT_ESSENTIAL'] }] });
    fixture.retention.retireBordereauLine.mockResolvedValue(bordereau('VISE', [line(1, { status: 'ANNULEE' })]));
    const b = bordereau('VISE', [line(1, { status: 'ACCEPTEE', actionId: 'a1' })], {}, { accepted: 1 });
    const detail = await opened(b);
    expect(await within(detail).findByText(/Bloqué : Document essentiel/)).toBeTruthy();
    fireEvent.click(within(detail).getByRole('button', { name: 'Retirer DOC-1' }));
    const dialogs = await screen.findAllByRole('dialog');
    const reason = dialogs[dialogs.length - 1]!;
    const confirm = () => within(reason).getByRole('button', { name: 'Retirer du bordereau' }) as HTMLButtonElement;
    expect(confirm().disabled).toBe(true);
    fireEvent.change(within(reason).getByLabelText(/^Motif/), { target: { value: 'Document reconnu essentiel' } });
    fireEvent.click(confirm());
    await waitFor(() => expect(fixture.retention.retireBordereauLine).toHaveBeenCalledWith(BID, 'l1', 'Document reconnu essentiel', expect.any(String)));
});

it('un bordereau exécuté n’offre plus aucune action, et montre ses certificats et son empreinte', async () => {
    const b = bordereau('EXECUTE', [line(1, { status: 'DETRUITE', certificateReference: 'CD-2026-000001' }), line(2, { status: 'REFUSEE', refusalReason: 'Valeur historique' })],
        { fingerprint: 'f'.repeat(64), visaReference: 'VISA-2026-014', authority: 'Archives nationales' }, { destroyed: 1, refused: 1 });
    const dialog = await opened(b);
    expect(within(dialog).getByText('Détruit · certificat CD-2026-000001')).toBeTruthy();
    expect(within(dialog).getByText('Refusé : Valeur historique')).toBeTruthy();
    expect(within(dialog).getByText(/Empreinte des certificats de destruction/)).toBeTruthy();
    for (const name of ['Soumettre à l’autorité', 'Viser le bordereau', 'Détruire les documents visés', 'Annuler le bordereau', 'Ajouter des documents'])
        expect(within(dialog).queryByRole('button', { name })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Afficher et imprimer' })).toBeTruthy();
    expect(dialog.textContent).not.toContain('d1');                                      // aucun identifiant interne
});


// ---------------------------------------------------------------- dossier entier
const DOSSIER = '22222222-2222-4222-8222-222222222222';
const plan = (over: Record<string, unknown> = {}) => ({
    dossierId: DOSSIER, reference: 'DOS-1990-001', title: 'Dossier du personnel 1990', closed: true, destroyedDocuments: 0, complete: true, problems: [], eventIds: ['e1', 'e2'],
    documents: [{ documentId: 'd1', reference: 'DOC-1', title: 'Registre 1', dossierReference: 'DOS-1990-001', eventId: 'e1', dueDate: '2020-01-01', blockers: [], blockerMessages: [] },
        { documentId: 'd2', reference: 'DOC-2', title: 'Registre 2', dossierReference: 'DOS-1990-001', eventId: 'e2', dueDate: '2020-01-01', blockers: [], blockerMessages: [] }], ...over
});
const chooseDossier = async () => {
    fixture.records.dossiers.mockResolvedValue({ items: [{ id: DOSSIER, reference: 'DOS-1990-001', title: 'Dossier du personnel 1990' }], page: 0, size: 20, total: 1, hasMore: false });
    panel();
    fireEvent.click(await screen.findByRole('button', { name: 'Éliminer un dossier entier' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(await within(dialog).findByLabelText('Dossier'), { target: { value: DOSSIER } });
    return dialog;
};

it('un dossier entièrement éliminable se constitue en un bordereau', async () => {
    fixture.retention.dossierEliminationPlan.mockResolvedValue(plan());
    fixture.retention.createBordereauFromDossier.mockResolvedValue(bordereau('BROUILLON', [line(1), line(2)]));
    fixture.retention.bordereau.mockResolvedValue(bordereau('BROUILLON', [line(1), line(2)]));
    const dialog = await chooseDossier();
    expect(await within(dialog).findByText(/Les 2 documents du dossier/)).toBeTruthy();
    expect(fixture.retention.dossierEliminationPlan).toHaveBeenCalledWith(INST, DOSSIER, expect.anything());
    fireEvent.click(within(dialog).getByRole('button', { name: 'Constituer le bordereau du dossier' }));
    await waitFor(() => expect(fixture.retention.createBordereauFromDossier).toHaveBeenCalledWith(INST, DOSSIER, null, null, expect.any(String)));
});

it('un dossier dont un document est bloqué ne se constitue pas, et dit pourquoi', async () => {
    fixture.retention.dossierEliminationPlan.mockResolvedValue(plan({ complete: false, problems: ['DOC-2 : Un gel juridique actif bloque le document.'],
        documents: [plan().documents[0], { ...plan().documents[1], blockers: ['ACTIVE_LEGAL_HOLD'], blockerMessages: ['Un gel juridique actif bloque le document.'] }] }));
    const dialog = await chooseDossier();
    expect(await within(dialog).findByText(/1 document sur 2 prêt : un dossier ne s’élimine qu’en entier/)).toBeTruthy();
    expect(within(dialog).getByText('Un gel juridique actif bloque le document.')).toBeTruthy();
    expect((within(dialog).getByRole('button', { name: 'Constituer le bordereau du dossier' }) as HTMLButtonElement).disabled).toBe(true);
    expect(fixture.retention.createBordereauFromDossier).not.toHaveBeenCalled();
});
