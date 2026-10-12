import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiError } from '../../src/core/http';
import { beforeEach, expect, it, vi } from 'vitest';
const session = vi.hoisted(() => ({ epoch: 1, me: null, records: {
    ingestions: vi.fn(), ingestion: vi.fn(), uploadContent: vi.fn(), command: vi.fn(),
} }));
vi.mock('../../src/auth/session', () => ({ useSession: () => session }));
import { UploadDialog } from '../../src/pages/Records';
import { IngestionHistory } from '../../src/ui/IngestionHistory';

const versionId = '11111111-1111-4111-8111-111111111111';
const attempt = {
    id: '11111111-1111-4111-8111-111111111112', versionId, status: 'PROCESSING', fileId: null,
    filename: 'depot-interrompu.pdf', size: 42, mediaType: 'application/pdf', sha256: 'a'.repeat(64),
    attempts: 1, resultCode: null, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
};
beforeEach(() => vi.resetAllMocks());

it('offers only the original-file roles supported by the ingestion endpoint', () => {
    render(<UploadDialog versionId={versionId} onClose={() => {}} onSuccess={() => {}}/>);
    expect([...(screen.getByRole('combobox') as HTMLSelectElement).options].map(o => o.value))
        .toEqual(['PIECE_JOINTE', 'MAITRE_CONSERVATION']);
});

it('cancels a server-expired attempt with a reason and refreshes the history', async () => {
    session.records.ingestions.mockResolvedValue({ items: [{ ...attempt, leaseExpired: true }], nextCursor: null });
    session.records.command.mockResolvedValue({ ...attempt, status: 'REJECTED', resultCode: 'INGESTION_CANCELLED' });
    const refresh = vi.fn();
    render(<IngestionHistory versionId={versionId} onClose={() => {}} onRefreshFiles={refresh}/>);
    await screen.findByText('Traitement expiré');
    fireEvent.click(screen.getByRole('button', { name: 'Abandonner ce dépôt' }));
    const confirm = screen.getByRole('button', { name: 'Confirmer l’abandon' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Navigateur fermé pendant le dépôt' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(session.records.command).toHaveBeenCalledWith('/ingestions/' + attempt.id + '/cancel',
        { reason: 'Navigateur fermé pendant le dépôt' }, expect.any(String)));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
});

it('does not infer expiry from an old browser timestamp', async () => {
    session.records.ingestions.mockResolvedValue({ items: [{ ...attempt, leaseExpired: false }], nextCursor: null });
    render(<IngestionHistory versionId={versionId} onClose={() => {}} onRefreshFiles={() => {}}/>);
    await screen.findByText('Analyse en cours');
    expect(screen.queryByRole('button', { name: 'Abandonner ce dépôt' })).toBeNull();
});

it('reuses the upload key when a refreshed server status confirms expiration', async () => {
    const file = new File(['%PDF-1.7'], attempt.filename, { type: 'application/pdf' });
    session.records.uploadContent.mockResolvedValue({ ...attempt, leaseExpired: false });
    session.records.ingestion.mockResolvedValue({ ...attempt, leaseExpired: true });
    render(<UploadDialog versionId={versionId} initialFile={file} onClose={() => {}} onSuccess={() => {}}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Téléverser' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Actualiser le statut' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Téléverser' }));
    await waitFor(() => expect(session.records.uploadContent).toHaveBeenCalledTimes(2));
    expect(session.records.uploadContent.mock.calls[1]).toEqual(session.records.uploadContent.mock.calls[0]);
});

const stale = (n: number) => ({ ...attempt, id: `22222222-2222-4222-8222-22222222222${n}`, status: 'RETRYABLE', resultCode: 'SCANNER_NOT_CONFIGURED', filename: `ancien-${n}.pdf` });

it('abandons all interrupted attempts of the page at once with a single reason', async () => {
    session.records.ingestions.mockResolvedValue({ items: [stale(1), stale(2), stale(3), { ...attempt, status: 'COMPLETED', fileId: 'f1', filename: 'termine.pdf' }], nextCursor: null });
    session.records.command.mockResolvedValue({});
    const refresh = vi.fn();
    render(<IngestionHistory versionId={versionId} onClose={() => {}} onRefreshFiles={refresh}/>);
    fireEvent.click(await screen.findByRole('button', { name: 'Abandonner les 3 dépôts interrompus de cette page' }));
    const confirm = screen.getByRole('button', { name: 'Abandonner 3 dépôts' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Antivirus non configuré à l’époque' } });
    fireEvent.click(confirm);
    await screen.findByText('3 dépôts abandonnés.');
    const paths = session.records.command.mock.calls.map(c => c[0]);
    expect(paths).toEqual([1, 2, 3].map(n => `/ingestions/22222222-2222-4222-8222-22222222222${n}/cancel`));
    expect(session.records.command.mock.calls.every(c => (c[1] as { reason: string }).reason === 'Antivirus non configuré à l’époque')).toBe(true);
    expect(new Set(session.records.command.mock.calls.map(c => c[2])).size).toBe(3);
    expect(refresh).toHaveBeenCalled();
});

it('stops at the first refusal and says how many were abandoned before it', async () => {
    session.records.ingestions.mockResolvedValue({ items: [stale(1), stale(2), stale(3)], nextCursor: null });
    session.records.command.mockResolvedValueOnce({}).mockRejectedValueOnce(new ApiError(409, 'INGESTION_NOT_CANCELLABLE', 'Ce dépôt ne peut plus être annulé.'));
    render(<IngestionHistory versionId={versionId} onClose={() => {}} onRefreshFiles={() => {}}/>);
    fireEvent.click(await screen.findByRole('button', { name: /Abandonner les 3 dépôts interrompus/ }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Nettoyage des dépôts anciens' } });
    fireEvent.click(screen.getByRole('button', { name: 'Abandonner 3 dépôts' }));
    expect(await screen.findByText('Ce dépôt ne peut plus être annulé.')).toBeTruthy();
    expect(await screen.findByText('1 dépôt abandonné avant l’erreur.')).toBeTruthy();
    expect(session.records.command).toHaveBeenCalledTimes(2);
});

it('offers no bulk action for a single interrupted attempt', async () => {
    session.records.ingestions.mockResolvedValue({ items: [stale(1)], nextCursor: null });
    render(<IngestionHistory versionId={versionId} onClose={() => {}} onRefreshFiles={() => {}}/>);
    await screen.findByText('Traitement interrompu');
    expect(screen.queryByRole('button', { name: /Abandonner les/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Abandonner ce dépôt' })).toBeTruthy();
});
