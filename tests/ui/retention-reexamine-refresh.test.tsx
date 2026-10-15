import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const INST = '97571d20-3f49-497e-a185-dac22208eb3f';
const EVENT = '11111111-1111-4111-8111-111111111111';
const ACTION = '22222222-2222-4222-8222-222222222222';
const fixture = vi.hoisted(() => ({
    epoch: 1, me: null as unknown, allowed: new Set<string>(),
    retention: { eventDispositions: vi.fn(), readiness: vi.fn(), destructionPreview: vi.fn(), certificateOfAction: vi.fn(), command: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: { institutionId: INST, departmentId: null } }), RecordWorkspaceProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('../../src/ui/names', () => ({ EntityName: ({ id }: { id: string }) => <>{'Agent ' + id.slice(0, 2)}</>, useEntityName: (_kind: string, id: string | null) => ({ name: id ? 'Agent ' + id.slice(0, 2) : null, loading: false }) }));
import { EventDispositions } from '../../src/pages/Records';
import { RefreshDueButton } from '../../src/ui/RetentionRefresh';

const disposition = (decision: string, status: string) => ({ id: ACTION, eventId: EVENT, decision, status, proposedBy: '11-a', validatedBy: '22-b', executedBy: null, proposedAt: '2026-10-09T09:00:00Z', validatedAt: '2026-10-10T09:00:00Z', executedAt: null });
const render_ = () => render(<table><tbody><EventDispositions eventId={EVENT} eventStatus="EN_DECISION" /></tbody></table>);

beforeEach(() => {
    fixture.epoch += 1;
    fixture.allowed = new Set(['DISPOSITION_PROPOSE', 'DISPOSITION_VALIDATE', 'DISPOSITION_EXECUTE', 'DISPOSITION_CANCEL']);
    for (const fn of Object.values(fixture.retention)) fn.mockReset();
    fixture.retention.readiness.mockResolvedValue({ actionId: ACTION, executable: true, blockers: [] });
    fixture.retention.command.mockResolvedValue({});
});

it('une décision « réexaminer » validée se réexamine avec une date et un motif, elle ne s’« exécute » pas', async () => {
    fixture.retention.eventDispositions.mockResolvedValue([disposition('REEXAMINER', 'VALIDEE')]);
    render_();
    expect(await screen.findByRole('button', { name: 'Réexaminer' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Exécuter' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Réexaminer' }));
    const dialog = await screen.findByRole('dialog');
    const submit = within(dialog).getByRole('button', { name: 'Réexaminer' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/Prochaine date de revue/), { target: { value: '2027-06-30' } });
    fireEvent.change(within(dialog).getByLabelText(/Motif/), { target: { value: 'Litige en cours' } });
    await waitFor(() => expect(submit.disabled).toBe(false));
    fireEvent.click(submit);
    await waitFor(() => expect(fixture.retention.command).toHaveBeenCalled());
    const [path, body, , method] = fixture.retention.command.mock.calls[0] as [string, Record<string, unknown>, string, string];
    expect(path).toBe(`/dispositions/${ACTION}/reexamine`);
    expect(body).toEqual({ nextReviewDate: '2027-06-30', reason: 'Litige en cours' });
    expect(method).toBe('POST');
    // la liste est relue après l'enregistrement
    await waitFor(() => expect(fixture.retention.eventDispositions.mock.calls.length).toBeGreaterThan(1));
});

it('les autres décisions validées gardent le bouton « Exécuter »', async () => {
    fixture.retention.eventDispositions.mockResolvedValue([disposition('CONSERVER_DEFINITIVEMENT', 'VALIDEE')]);
    render_();
    expect(await screen.findByRole('button', { name: 'Exécuter' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Réexaminer' })).toBeNull();
});

it('l’actualisation des échéances rend le nombre d’échéances arrivées à terme et prévient s’il en reste', async () => {
    fixture.retention.command.mockResolvedValue({ examined: 3, changed: 3, hasMore: true });
    const done = vi.fn();
    render(<RefreshDueButton institutionId={INST} departmentId={null} onDone={done} />);
    fireEvent.click(screen.getByRole('button', { name: 'Actualiser les échéances' }));
    expect(await screen.findByText(/3 échéances arrivées à terme ; il en reste, relancez l’actualisation\./)).toBeTruthy();
    const [path, body, , method] = fixture.retention.command.mock.calls[0] as [string, Record<string, unknown>, string, string];
    expect(path).toBe('/events/refresh-due');
    expect(body).toEqual({ institutionId: INST, departmentId: null, limit: 100 });
    expect(method).toBe('POST');
    expect(done).toHaveBeenCalled();
});

it('sans échéance nouvelle, l’actualisation le dit ; une erreur du serveur s’affiche', async () => {
    fixture.retention.command.mockResolvedValueOnce({ examined: 0, changed: 0, hasMore: false });
    render(<RefreshDueButton institutionId={INST} />);
    fireEvent.click(screen.getByRole('button', { name: 'Actualiser les échéances' }));
    expect(await screen.findByText(/Aucune échéance nouvelle/)).toBeTruthy();
    fixture.retention.command.mockRejectedValueOnce(Object.assign(new Error('Accès refusé.'), { status: 403, code: 'FORBIDDEN' }));
    fireEvent.click(screen.getByRole('button', { name: 'Actualiser les échéances' }));
    await waitFor(() => expect(screen.queryByText(/Aucune échéance nouvelle/)).toBeNull());
    expect(await screen.findByText(/Accès refusé/)).toBeTruthy();
});
