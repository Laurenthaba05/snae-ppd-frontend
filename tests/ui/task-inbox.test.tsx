import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Me, WorkflowInboxItem } from '../../src/core/types';
import { ApiError } from '../../src/core/http';
const fixture = vi.hoisted(() => ({
    epoch: 1, me: null as Me | null, scope: { institutionId: 'inst', departmentId: 'dept' },
    workflow: { inbox: vi.fn(), command: vi.fn(), taskActions: vi.fn() },
}));
const navigate = vi.hoisted(() => vi.fn());
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: fixture.scope }) }));
vi.mock('../../src/ui/navigation', () => ({ navigate }));
import { TaskInboxPage } from '../../src/pages/TaskInbox';
import { moduleVisible } from '../../src/design/navigation';
const task: WorkflowInboxItem = { id: 't1', instanceId: 'i1', stepId: 's1', stepLabel: 'Vérification', status: 'EN_COURS',
    dueAt: '2020-01-01T00:00:00Z', documentId: 'doc1', documentReference: 'DOC-001', documentTitle: 'Registre de recette' };
const page = (items = [task], hasMore = false) => ({ items, page: 0, size: 20, hasMore });
beforeEach(() => {
    fixture.epoch++;
    fixture.scope = { institutionId: 'inst', departmentId: 'dept' };
    fixture.me = { user: { id: 'u1', status: 'ACTIF', accountType: 'USER' }, grants: [
        { permission: 'WORKFLOW_TASK_CLAIM', scope: 'DEPARTEMENT', institutionId: 'inst', departmentId: 'dept', expiresAt: null },
        { permission: 'WORKFLOW_TASK_COMPLETE', scope: 'DEPARTEMENT', institutionId: 'inst', departmentId: 'dept', expiresAt: null },
    ] } as Me;
    fixture.workflow.inbox.mockReset().mockResolvedValue(page());
    fixture.workflow.command.mockReset().mockResolvedValue({});
    fixture.workflow.taskActions.mockReset().mockResolvedValue({ taskId: 't1', stepLabel: 'Vérification', canCompleteFinal: true, options: [], advisory: true });
    navigate.mockReset();
});
it('montre les tâches de tous les périmètres et ouvre le document associé', async () => {
    render(<TaskInboxPage />);
    await screen.findByText(task.documentTitle);
    expect(fixture.workflow.inbox).toHaveBeenCalledWith('MINE', {}, 0, expect.any(AbortSignal));
    expect(screen.getByText('Échéance dépassée')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le document' }));
    expect(navigate).toHaveBeenCalledWith('/app/documents/doc1');
});
it('pagine côté serveur puis réinitialise la page en changeant de boîte ou de périmètre', async () => {
    fixture.workflow.inbox.mockResolvedValue(page([task], true));
    render(<TaskInboxPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Suivante' }));
    await waitFor(() => expect(fixture.workflow.inbox).toHaveBeenLastCalledWith('MINE', {}, 1, expect.any(AbortSignal)));
    fireEvent.click(screen.getByRole('button', { name: 'À prendre en charge', exact: true }));
    await waitFor(() => expect(fixture.workflow.inbox).toHaveBeenLastCalledWith('AVAILABLE', {}, 0, expect.any(AbortSignal)));
    fireEvent.click(screen.getByLabelText('Tous mes périmètres'));
    await waitFor(() => expect(fixture.workflow.inbox).toHaveBeenLastCalledWith('AVAILABLE', fixture.scope, 0, expect.any(AbortSignal)));
});
it('prend une tâche puis passe à Mes tâches, sans double envoi', async () => {
    fixture.workflow.inbox.mockImplementation(async (bucket: string) => page(bucket === 'AVAILABLE' ? [{ ...task, status: 'OUVERTE' }] : [task]));
    let resolve!: (value: object) => void;
    fixture.workflow.command.mockImplementation(() => new Promise(r => { resolve = r; }));
    render(<TaskInboxPage />);
    fireEvent.click(screen.getByRole('button', { name: 'À prendre en charge', exact: true }));
    const claim = await screen.findByRole('button', { name: 'Prendre en charge', exact: true });
    fireEvent.click(claim); fireEvent.click(claim);
    expect(fixture.workflow.command).toHaveBeenCalledTimes(1);
    expect(fixture.workflow.command).toHaveBeenCalledWith('/workflow-tasks/t1/claim', {}, expect.any(String), 'POST');
    resolve({});
    await screen.findByText(/a été prise en charge/);
    expect(screen.getByRole('button', { name: 'Mes tâches' }).getAttribute('aria-pressed')).toBe('true');
    await screen.findByRole('button', { name: 'Terminer' });
});
it('garde une clé identique après une réponse incertaine et recharge les disponibilités', async () => {
    fixture.workflow.inbox.mockResolvedValue(page([{ ...task, status: 'OUVERTE' }]));
    fixture.workflow.command.mockRejectedValue(new ApiError(503, 'UNAVAILABLE', 'Réponse inconnue', null, {}, true));
    render(<TaskInboxPage />);
    fireEvent.click(screen.getByRole('button', { name: 'À prendre en charge', exact: true }));
    fireEvent.click(await screen.findByRole('button', { name: 'Prendre en charge', exact: true }));
    await screen.findByRole('alert');
    fireEvent.click(await screen.findByRole('button', { name: 'Prendre en charge', exact: true }));
    await waitFor(() => expect(fixture.workflow.command).toHaveBeenCalledTimes(2));
    expect(fixture.workflow.command.mock.calls[0][2]).toBe(fixture.workflow.command.mock.calls[1][2]);
});
it('termine une étape finale et actualise la boîte', async () => {
    render(<TaskInboxPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Terminer' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText(/la dernière/);
    fixture.workflow.inbox.mockResolvedValue(page([]));
    fireEvent.change(within(dialog).getByLabelText('Commentaire'), { target: { value: ' Vérifié ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Terminer' }));
    await screen.findByText('Aucune tâche en cours');
    expect(fixture.workflow.command).toHaveBeenCalledWith('/workflow-tasks/t1/complete', { transitionCode: null, comment: 'Vérifié' }, expect.any(String), 'POST');
    expect(screen.queryByRole('dialog')).toBeNull();
});
it('bloque la fin de tâche si les actions ne sont pas lisibles et permet de réessayer', async () => {
    fixture.workflow.taskActions.mockRejectedValueOnce(new ApiError(403, 'FORBIDDEN', 'Lecture refusée'));
    render(<TaskInboxPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Terminer' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('alert');
    expect((within(dialog).getByRole('button', { name: 'Terminer' }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(dialog).queryByLabelText('Code de transition')).toBeNull();
    expect(fixture.workflow.command).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Réessayer la lecture' }));
    await within(dialog).findByText(/la dernière/);
    expect((within(dialog).getByRole('button', { name: 'Terminer' }) as HTMLButtonElement).disabled).toBe(false);
});
it('masque la boîte sans habilitation active et accepte un droit départemental', () => {
    expect(moduleVisible(fixture.me, 'taches', {})).toBe(true);
    fixture.me!.grants.forEach(g => { g.expiresAt = '2020-01-01T00:00:00Z'; });
    render(<TaskInboxPage />);
    expect(screen.getByText(/ne dispose pas/)).toBeTruthy();
    expect(fixture.workflow.inbox).not.toHaveBeenCalled();
});
it('ne confond pas erreur et boîte vide, et réessaie la lecture', async () => {
    fixture.workflow.inbox.mockRejectedValueOnce(new ApiError(403, 'FORBIDDEN', 'Lecture refusée')).mockResolvedValue(page([]));
    render(<TaskInboxPage />);
    await screen.findByRole('alert');
    expect(screen.queryByText('Aucune tâche en cours')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer la lecture' }));
    await screen.findByText('Aucune tâche en cours');
});
it('annule la lecture précédente lors du changement de boîte et ignore sa réponse tardive', async () => {
    let resolve!: (value: unknown) => void;
    fixture.workflow.inbox.mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValue(page([]));
    render(<TaskInboxPage />);
    const signal = fixture.workflow.inbox.mock.calls[0][3] as AbortSignal;
    fireEvent.click(screen.getByRole('button', { name: 'À prendre en charge', exact: true }));
    await screen.findByText('Aucune tâche à prendre en charge');
    expect(signal.aborted).toBe(true);
    resolve(page());
    await waitFor(() => expect(screen.queryByText(task.documentTitle)).toBeNull());
});
