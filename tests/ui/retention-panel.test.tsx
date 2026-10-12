import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/core/http';
import type { RetentionPlanning } from '../../src/core/types';
const DOC = '80f0f431-a8f1-4da0-b0b2-bbca91b9a739';
const INST = '97571d20-3f49-497e-a185-dac22208eb3f';
const fixture = vi.hoisted(() => ({
    epoch: 1, me: null as unknown, allowed: new Set<string>(),
    retention: { documentEvents: vi.fn(), planning: vi.fn(), schedule: vi.fn(), command: vi.fn(), triggerEvents: vi.fn(), triggerEventTypes: vi.fn() },
    records: { command: vi.fn(), documentTypes: vi.fn() },
    classification: { nodes: vi.fn() },
    api: { get: vi.fn(), list: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: { institutionId: INST, departmentId: null } }), RecordWorkspaceProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
import { RetentionPanel } from '../../src/pages/Records';

const rule = { code: 'CONS-10', label: 'Conservation 10 ans', scope: 'INSTITUTION', versionNumber: 1, trigger: 'DATE_CLOTURE_DOCUMENT', duration: 10, unit: 'ANNEES', finalDisposition: 'CONSERVER_DEFINITIVEMENT' };
const planning = (extra: Partial<RetentionPlanning> = {}): RetentionPlanning => ({ documentClosed: true, scheduled: false, rule, baseDate: '2026-10-05', dueDate: '2036-10-05', blockers: [], ...extra });
const panel = (status: string, onChanged = vi.fn()) => render(<RetentionPanel documentId={DOC} businessStatus={status} onDocumentChanged={onChanged} />);

beforeEach(() => {
    fixture.epoch += 1;
    fixture.allowed = new Set(['DOCUMENT_CLOSE', 'RETENTION_SCHEDULE', 'RETENTION_RULE_MANAGE']);
    for (const fn of [...Object.values(fixture.retention), ...Object.values(fixture.records), ...Object.values(fixture.classification), ...Object.values(fixture.api)]) fn.mockReset();
    fixture.retention.triggerEvents.mockResolvedValue([]);
    fixture.retention.triggerEventTypes.mockResolvedValue([]);
    fixture.retention.documentEvents.mockResolvedValue([]);
    fixture.retention.planning.mockResolvedValue(planning());
    fixture.retention.schedule.mockResolvedValue({});
    fixture.records.command.mockResolvedValue({});
    fixture.records.documentTypes.mockResolvedValue([{ id: 't-rapport', code: 'RAPPORT', label: 'Rapport', family: null, status: 'ACTIF' }]);
    fixture.classification.nodes.mockResolvedValue([]);
});

it('un document en brouillon dit ce qui manque : le document à clore et la règle qui ne s’applique pas', async () => {
    fixture.retention.planning.mockResolvedValue(planning({ documentClosed: false, rule: null, baseDate: null, dueDate: null, blockers: ['DOCUMENT_NOT_CLOSED', 'NO_APPLICABLE_RULE'] }));
    panel('BROUILLON');
    const box = await screen.findByRole('status', { name: 'Situation de la conservation' });
    expect(within(box).getByText(/Aucune échéance n’est encore planifiée/)).toBeTruthy();
    expect(within(box).getByText(/n’est pas encore clos/)).toBeTruthy();
    expect(within(box).getByText(/Aucune règle active ne s’applique à ce document/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Clore le document' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Planifier la conservation' })).toBeNull();
});

it('une règle applicable dont la date de départ manque est signalée avec le déclencheur en clair', async () => {
    fixture.retention.planning.mockResolvedValue(planning({ rule: { ...rule, trigger: 'DATE_ARCHIVAGE' }, baseDate: null, dueDate: null, blockers: ['BASE_DATE_MISSING'] }));
    panel('CLOS');
    const box = await screen.findByRole('status', { name: 'Situation de la conservation' });
    expect(within(box).getByText('CONS-10', { selector: 'strong' })).toBeTruthy();
    expect(within(box).getByText(/Le délai part de la date d’archivage, et cette date n’existe pas encore/)).toBeTruthy();
    const button = screen.getByRole('button', { name: 'Planifier la conservation' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(document.body.textContent).not.toContain('BASE_DATE_MISSING');
});

it('quand tout est prêt, la règle, la date de départ et l’échéance prévue s’affichent et la planification est possible', async () => {
    panel('CLOS');
    const box = await screen.findByRole('status', { name: 'Situation de la conservation' });
    expect(within(box).getByText(/10 ans après la clôture du document, puis conserver définitivement/)).toBeTruthy();
    expect(within(box).getByText('5 octobre 2036', { selector: 'strong' })).toBeTruthy();
    expect(within(box).getByText(/Tout est prêt/)).toBeTruthy();
    const button = screen.getByRole('button', { name: 'Planifier la conservation' }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fixture.retention.documentEvents.mockResolvedValue([{ id: 'e1', documentId: DOC, dossierId: null, ruleVersionId: 'v1', institutionId: INST, departmentId: null, baseDate: '2026-10-05', dueDate: '2036-10-05', status: 'PLANIFIE', suspendedFromStatus: null, suspendedAt: null, reviewCount: 0, closedAt: null, version: 0 }]);
    fireEvent.click(button);
    await waitFor(() => expect(fixture.retention.schedule).toHaveBeenCalledWith(DOC, expect.any(String)));
    expect(await screen.findByText('Planifiée')).toBeTruthy();
    expect(screen.queryByRole('status', { name: 'Situation de la conservation' })).toBeNull();
});

it('si la situation ne peut pas être lue (serveur plus ancien), l’ancien message et l’ancien bouton restent', async () => {
    fixture.retention.planning.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Introuvable.'));
    panel('CLOS');
    expect(await screen.findByText('Aucune échéance planifiée')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Planifier la conservation' }) as HTMLButtonElement).disabled).toBe(false);
});

it('une planification refusée par le serveur s’affiche', async () => {
    fixture.retention.schedule.mockRejectedValue(new ApiError(422, 'RETENTION_RULE_NOT_FOUND', 'Aucune règle applicable.'));
    panel('CLOS');
    fireEvent.click(await screen.findByRole('button', { name: 'Planifier la conservation' }));
    expect(await screen.findByText('Aucune règle applicable.')).toBeTruthy();
});

it('après la configuration d’une règle, un message la confirme et la situation du document est relue', async () => {
    fixture.retention.command.mockImplementation(async (path: string) => path === '/rules' ? { id: 'rule-1' } : path.endsWith('/versions') ? { id: 'version-1' } : {});
    panel('BROUILLON');
    await screen.findByRole('status', { name: 'Situation de la conservation' });
    expect(fixture.retention.planning).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Configurer une règle' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(await within(dialog).findByLabelText(/^Code/), { target: { value: 'cons-10' } });
    fireEvent.change(within(dialog).getByLabelText(/^Intitulé/), { target: { value: 'Conservation 10 ans' } });
    fireEvent.change(within(dialog).getByLabelText(/^Durée/), { target: { value: '10' } });
    fireEvent.click(await within(dialog).findByLabelText('Rapport'));
    fireEvent.click(within(dialog).getByRole('button', { name: /Créer et activer/ }));
    expect(await screen.findByText(/La règle CONS-10 est active/)).toBeTruthy();
    await waitFor(() => expect(fixture.retention.planning).toHaveBeenCalledTimes(2));
});
