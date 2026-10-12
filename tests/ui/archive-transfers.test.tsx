import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { DocumentTransferInfo, Transfer, TransferCandidate, TransferLine, TransferSummary } from '../../src/core/transfers';

const INST = '97571d20-3f49-497e-a185-dac22208eb3f';
const DEST = '22222222-2222-4222-8222-222222222222';
const TID = '11111111-1111-4111-8111-111111111111';
const fixture = vi.hoisted(() => ({
    epoch: 1, me: null as unknown, allowed: new Set<string>(),
    retention: {
        archiveTransfers: vi.fn(), archiveTransfer: vi.fn(), transferCandidates: vi.fn(), transferDestinations: vi.fn(), createArchiveTransfer: vi.fn(), addArchiveTransferLines: vi.fn(),
        removeArchiveTransferLine: vi.fn(), retireArchiveTransferLine: vi.fn(), submitArchiveTransfer: vi.fn(), receiveArchiveTransfer: vi.fn(), executeArchiveTransfer: vi.fn(),
        cancelArchiveTransfer: vi.fn(), documentTransfer: vi.fn()
    }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
vi.mock('../../src/ui/names', () => ({
    EntityName: ({ kind, id }: { kind: string; id: string }) => <>{(kind === 'institutions' ? 'Institution ' : 'Agent ') + id.slice(0, 2)}</>,
    useEntityName: (kind: string, id: string | null | undefined) => ({ name: id ? (kind === 'institutions' ? 'Institution ' : 'Agent ') + id.slice(0, 2) : null, loading: false })
}));
import { ArchiveTransfersPanel, DocumentTransferNotice } from '../../src/ui/ArchiveTransfers';

const summary = (over: Partial<TransferSummary> = {}): TransferSummary => ({
    id: TID, reference: 'TV-2026-000001', institutionId: INST, destinationId: DEST, title: 'Registres de 1950', status: 'BROUILLON', lines: 2, registered: 2, proposed: 0, accepted: 0, refused: 0,
    transferred: 0, cancelled: 0, totalBytes: 2048, createdById: '11-a', createdAt: '2026-10-10T08:00:00Z', submittedAt: null, receivedAt: null, completedAt: null, receiptReference: null, version: 0, ...over
});
const line = (n: number, over: Partial<TransferLine> = {}): TransferLine => ({
    id: `l${n}`, rank: n, status: 'INSCRITE', eventId: `e${n}`, documentId: `d${n}`, reference: `DOC-${n}`, title: `Registre ${n}`, baseDate: '1950-01-01', dueDate: '2020-01-01', rule: 'Versement aux archives',
    fileCount: 1, totalBytes: 1024, contentFingerprint: 'c'.repeat(64), actionId: null, refusalReason: null, ...over
});
const transfer = (status: TransferSummary['status'], lines: TransferLine[], over: Partial<Transfer> = {}, sum: Partial<TransferSummary> = {}): Transfer => ({
    summary: summary({ status, lines: lines.length, ...sum }), observations: null, submittedById: null, receivedById: null, actReference: null, procesVerbal: null, completedById: null,
    cancelledById: null, cancelledAt: null, cancellationReason: null, lines, ...over
});
const candidate = (n: number, over: Partial<TransferCandidate> = {}): TransferCandidate => ({
    eventId: `e${n}`, documentId: `d${n}`, reference: `DOC-${n}`, title: `Registre ${n}`, departmentId: null, baseDate: '1950-01-01', dueDate: '2020-01-01', rule: 'Versement aux archives',
    fileCount: 1, totalBytes: 1024, blockers: [], transferId: null, transferReference: null, ...over
});

beforeEach(() => {
    fixture.epoch += 1;
    fixture.allowed = new Set(['DISPOSITION_PROPOSE', 'DISPOSITION_VALIDATE', 'DISPOSITION_EXECUTE']);
    for (const fn of Object.values(fixture.retention)) fn.mockReset();
    fixture.retention.archiveTransfers.mockResolvedValue([]);
    fixture.retention.transferCandidates.mockResolvedValue([]);
    fixture.retention.transferDestinations.mockResolvedValue([{ id: DEST, code: 'AN', name: 'Archives nationales' }]);
});

const panel = () => render(<ArchiveTransfersPanel institutionId={INST} />);
const opened = async (t: Transfer) => {
    fixture.retention.archiveTransfers.mockResolvedValue([t.summary]);
    fixture.retention.archiveTransfer.mockResolvedValue(t);
    panel();
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir' }));
    return await screen.findByRole('dialog');
};
const lastDialog = async () => { const dialogs = await screen.findAllByRole('dialog'); return dialogs[dialogs.length - 1]!; };

it('sans versement, le panneau l’explique et propose d’en constituer un à qui peut proposer', async () => {
    panel();
    expect(await screen.findByText('Aucun versement')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Nouveau versement' })).toBeTruthy();
});

it('sans le droit de proposer, on ne constitue pas de versement', async () => {
    fixture.allowed = new Set(['DISPOSITION_VALIDATE']);
    panel();
    await screen.findByText('Aucun versement');
    expect(screen.queryByRole('button', { name: 'Nouveau versement' })).toBeNull();
});

it('la liste montre chaque versement avec son état, ses deux institutions par leur nom et son avancement', async () => {
    fixture.retention.archiveTransfers.mockResolvedValue([summary({ status: 'SOUMIS', proposed: 2 }), summary({ id: 'b2', reference: 'TV-2026-000002', title: 'Plans de 1960', status: 'EXECUTE', transferred: 3, lines: 3 })]);
    panel();
    expect(await screen.findByText('TV-2026-000001')).toBeTruthy();
    expect(screen.getByText('En attente de réception')).toBeTruthy(); expect(screen.getByText('Remis')).toBeTruthy();
    expect(screen.getByText(/2 lignes attendent la réception/)).toBeTruthy();
    expect(screen.getAllByText('Institution 97').length).toBeGreaterThan(0); expect(screen.getAllByText('Institution 22').length).toBeGreaterThan(0);
});

it('constituer un versement : institution destinataire par son nom, documents bloqués lisibles, création avec les échéances choisies', async () => {
    fixture.retention.transferCandidates.mockResolvedValue([candidate(1), candidate(2), candidate(3, { blockers: ['ALREADY_TRANSFERRED'] }), candidate(4, { blockers: ['ALREADY_IN_TRANSFER'], transferReference: 'TV-2026-000009' })]);
    fixture.retention.createArchiveTransfer.mockResolvedValue(transfer('BROUILLON', [line(1), line(2)]));
    fixture.retention.archiveTransfer.mockResolvedValue(transfer('BROUILLON', [line(1), line(2)]));
    panel();
    fireEvent.click(await screen.findByRole('button', { name: 'Nouveau versement' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('DOC-1')).toBeTruthy();
    expect(within(dialog).getByRole('option', { name: 'Archives nationales' })).toBeTruthy();
    expect(within(dialog).getByText(/déjà été remis à une institution d’archives/)).toBeTruthy();
    expect(within(dialog).getByText('Déjà inscrit au versement TV-2026-000009.')).toBeTruthy();
    expect((within(dialog).getByLabelText('Choisir DOC-3') as HTMLInputElement).disabled).toBe(true);
    // rien ne part sans destinataire, intitulé ni sélection
    fireEvent.click(within(dialog).getByRole('button', { name: 'Constituer le bordereau' }));
    expect(await within(dialog).findByText('Choisissez l’institution d’archives destinataire.')).toBeTruthy();
    expect(within(dialog).getByText('L’intitulé du bordereau de versement est obligatoire.')).toBeTruthy();
    expect(within(dialog).getByText('Choisissez au moins un document.')).toBeTruthy();
    expect(fixture.retention.createArchiveTransfer).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByLabelText('Tout choisir'));
    fireEvent.change(within(dialog).getByLabelText(/^Institution d’archives destinataire/), { target: { value: DEST } });
    fireEvent.change(within(dialog).getByLabelText(/^Intitulé du bordereau/), { target: { value: 'Registres de 1950' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Constituer le bordereau' }));
    await waitFor(() => expect(fixture.retention.createArchiveTransfer).toHaveBeenCalledWith(INST, DEST, 'Registres de 1950', null, ['e1', 'e2'], expect.any(String)));
    expect(await screen.findByText('Bordereau de versement')).toBeTruthy();       // le bordereau constitué s'ouvre aussitôt
});

it('un brouillon se soumet à l’institution d’archives, se complète, et une ligne s’en ôte', async () => {
    fixture.retention.removeArchiveTransferLine.mockResolvedValue(transfer('BROUILLON', [line(2)]));
    fixture.retention.submitArchiveTransfer.mockResolvedValue(transfer('SOUMIS', [line(1, { status: 'PROPOSEE' })], {}, { proposed: 2 }));
    const dialog = await opened(transfer('BROUILLON', [line(1), line(2)]));
    expect(within(dialog).getByText('Registre 1')).toBeTruthy();
    expect(within(dialog).getByText(/Il n’est pas encore soumis/)).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Ajouter des documents' })).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Recevoir le versement' })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ôter DOC-1' }));
    await waitFor(() => expect(fixture.retention.removeArchiveTransferLine).toHaveBeenCalledWith(TID, 'l1', expect.any(String)));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Soumettre à l’institution d’archives' }));
    await waitFor(() => expect(fixture.retention.submitArchiveTransfer).toHaveBeenCalledWith(TID, expect.any(String)));
});

it('la réception exige une décision motivée pour chaque refus et le procès-verbal, puis part avec l’acte et chaque décision', async () => {
    const t = transfer('SOUMIS', [line(1, { status: 'PROPOSEE', actionId: 'a1' }), line(2, { status: 'PROPOSEE', actionId: 'a2' })], { submittedById: '22-b' }, { proposed: 2 });
    fixture.retention.receiveArchiveTransfer.mockResolvedValue(transfer('ACCEPTE', [line(1, { status: 'ACCEPTEE' }), line(2, { status: 'REFUSEE', refusalReason: 'Déjà versé' })], {}, { accepted: 1, receiptReference: 'ART-2026-000001' }));
    const detail = await opened(t);
    expect(within(detail).queryByRole('button', { name: 'Remettre les documents acceptés' })).toBeNull();
    fireEvent.click(within(detail).getByRole('button', { name: 'Recevoir le versement' }));
    const dialog = await lastDialog();
    // tout est accepté par défaut : le procès-verbal manque
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer la réception' }));
    expect(await within(dialog).findByText('Le procès-verbal de réception est obligatoire pour accepter des lignes.')).toBeTruthy();
    expect(fixture.retention.receiveArchiveTransfer).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText(/^Procès-verbal de réception/), { target: { value: 'Réception du 11 octobre.' } });
    fireEvent.change(within(dialog).getByLabelText(/^Référence de l’acte de versement/), { target: { value: 'Acte n° 12' } });
    fireEvent.click(within(within(dialog).getByRole('group', { name: 'Décision pour DOC-2' })).getByLabelText('Refuser'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer la réception' }));
    expect(await within(dialog).findByText('1 refus doit être motivé.')).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText('Motif du refus de DOC-2'), { target: { value: 'Déjà versé' } });
    expect(within(dialog).getByText('1 document accepté, 1 refusé.')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer la réception' }));
    await waitFor(() => expect(fixture.retention.receiveArchiveTransfer).toHaveBeenCalled());
    const [id, body] = fixture.retention.receiveArchiveTransfer.mock.calls[0] as [string, Record<string, unknown>, string];
    expect(id).toBe(TID);
    expect(body).toEqual({ actReference: 'Acte n° 12', procesVerbal: 'Réception du 11 octobre.',
        decisions: [{ lineId: 'l1', accept: true, reason: null }, { lineId: 'l2', accept: false, reason: 'Déjà versé' }] });
});

it('la personne qui peut seulement proposer ne voit pas le bouton de réception, mais peut annuler', async () => {
    fixture.allowed = new Set(['DISPOSITION_PROPOSE']);
    const dialog = await opened(transfer('SOUMIS', [line(1, { status: 'PROPOSEE' })], {}, { proposed: 1 }));
    expect(within(dialog).queryByRole('button', { name: 'Recevoir le versement' })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Annuler le versement' })).toBeTruthy();
});

it('la remise exige une confirmation, puis part et affiche le versement', async () => {
    const t = transfer('ACCEPTE', [line(1, { status: 'ACCEPTEE', actionId: 'a1' }), line(2, { status: 'ACCEPTEE', actionId: 'a2' })], { receivedById: '33-c', actReference: 'Acte n° 12', procesVerbal: 'Réception.' },
        { accepted: 2, receiptReference: 'ART-2026-000001' });
    fixture.retention.executeArchiveTransfer.mockResolvedValue(transfer('EXECUTE', [line(1, { status: 'TRANSFEREE' }), line(2, { status: 'TRANSFEREE' })], {}, { transferred: 2 }));
    const detail = await opened(t);
    expect(within(detail).getByText('ART-2026-000001')).toBeTruthy();
    expect(within(detail).getByText('Acte n° 12')).toBeTruthy();
    fireEvent.click(within(detail).getByRole('button', { name: 'Remettre les documents acceptés' }));
    const dialog = await lastDialog();
    expect(within(dialog).getByText(/2 documents \(.*\) vont être remis à Institution 22/)).toBeTruthy();
    const run = () => within(dialog).getByRole('button', { name: 'Remettre' }) as HTMLButtonElement;
    expect(run().disabled).toBe(true);
    fireEvent.click(within(dialog).getByLabelText(/Je confirme la remise de 2 documents de ce versement/));
    await waitFor(() => expect(run().disabled).toBe(false));
    fireEvent.click(run());
    await waitFor(() => expect(fixture.retention.executeArchiveTransfer).toHaveBeenCalledWith(TID, expect.any(String)));
});

it('une ligne se retire avec un motif', async () => {
    fixture.retention.retireArchiveTransferLine.mockResolvedValue(transfer('ACCEPTE', [line(1, { status: 'ANNULEE' })]));
    const detail = await opened(transfer('ACCEPTE', [line(1, { status: 'ACCEPTEE', actionId: 'a1' })], {}, { accepted: 1 }));
    fireEvent.click(within(detail).getByRole('button', { name: 'Retirer DOC-1' }));
    const reason = await lastDialog();
    const confirm = () => within(reason).getByRole('button', { name: 'Retirer du versement' }) as HTMLButtonElement;
    expect(confirm().disabled).toBe(true);
    fireEvent.change(within(reason).getByLabelText(/^Motif/), { target: { value: 'Document réclamé par le service' } });
    fireEvent.click(confirm());
    await waitFor(() => expect(fixture.retention.retireArchiveTransferLine).toHaveBeenCalledWith(TID, 'l1', 'Document réclamé par le service', expect.any(String)));
});

it('un versement remis n’offre plus aucune action, et montre ses lignes, l’accusé et les empreintes, sans identifiant interne', async () => {
    const t = transfer('EXECUTE', [line(1, { status: 'TRANSFEREE' }), line(2, { status: 'REFUSEE', refusalReason: 'Déjà versé' })], { receivedById: '33-c', procesVerbal: 'Réception du 11 octobre.' },
        { transferred: 1, refused: 1, receiptReference: 'ART-2026-000001' });
    const dialog = await opened(t);
    expect(within(dialog).getByText('Refusé : Déjà versé')).toBeTruthy();
    expect(within(dialog).getByText('Procès-verbal de réception')).toBeTruthy();
    expect(within(dialog).getAllByText(/^Empreinte cccccccccccc…$/).length).toBe(2);
    for (const name of ['Soumettre à l’institution d’archives', 'Recevoir le versement', 'Remettre les documents acceptés', 'Annuler le versement', 'Ajouter des documents'])
        expect(within(dialog).queryByRole('button', { name })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Afficher et imprimer' })).toBeTruthy();
    expect(dialog.textContent).not.toContain('d1');
});

it('la fiche d’un document remis dit qui le détient, depuis quand et sous quel accusé', async () => {
    const info: DocumentTransferInfo = { transferId: TID, reference: 'TV-2026-000001', receiptReference: 'ART-2026-000001', destinationId: DEST, transferredAt: '2026-10-11T09:00:00Z' };
    fixture.retention.documentTransfer.mockResolvedValue(info);
    render(<DocumentTransferNotice documentId="d1" />);
    expect(await screen.findByText('Remis aux archives.')).toBeTruthy();
    expect(screen.getByText(/conservé définitivement par Institution 22/)).toBeTruthy();
    expect(screen.getByText(/Versement TV-2026-000001, accusé de réception ART-2026-000001/)).toBeTruthy();
});

it('la fiche d’un document non remis ne montre rien', async () => {
    fixture.retention.documentTransfer.mockResolvedValue(null);
    const { container } = render(<DocumentTransferNotice documentId="d1" />);
    await waitFor(() => expect(fixture.retention.documentTransfer).toHaveBeenCalled());
    expect(container.textContent).toBe('');
});
