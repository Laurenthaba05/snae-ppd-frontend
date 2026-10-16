import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

// La vue nationale de la rétention : chaque section n'apparaît qu'avec son habilitation (le serveur reste l'autorité), l'absence d'institution est dite, et une erreur du serveur n'est jamais
// présentée comme une liste vide.
const fixture = vi.hoisted(() => ({
    retention: { events: vi.fn(), legalHolds: vi.fn() },
    me: { user: { id: 'u1' } } as unknown, epoch: 1,
    allowed: new Set<string>(), scope: { institutionId: 'i-1' as string | null, departmentId: null as string | null }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: fixture.scope }) }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
vi.mock('../../src/ui/ResourceDetails', () => ({ ResourceDetailsButton: () => null }));
vi.mock('../../src/ui/LegalHoldDialog', () => ({ LegalHoldDialog: () => <div role="dialog" aria-label="Ouvrir un gel légal" /> }));
vi.mock('../../src/pages/Records', () => ({ EventDispositions: ({ eventId }: { eventId: string }) => <div data-testid={'dispositions-' + eventId} />, ReleaseHoldDialog: ({ holdId }: { holdId: string }) => <div role="dialog" aria-label={'Lever le gel ' + holdId} /> }));
vi.mock('../../src/ui/RetentionRules', () => ({ RetentionRulesPanel: () => <div data-testid="rules" /> }));
vi.mock('../../src/ui/RetentionRefresh', () => ({ RefreshDueButton: () => <div data-testid="refresh" /> }));
vi.mock('../../src/ui/Destruction', () => ({ CertificatesPanel: () => <div data-testid="certificates" /> }));
vi.mock('../../src/ui/Bordereaux', () => ({ BordereauxPanel: () => <div data-testid="bordereaux" /> }));
vi.mock('../../src/ui/Intermediate', () => ({ IntermediatePanel: () => <div data-testid="intermediate" /> }));
vi.mock('../../src/ui/ArchiveTransfers', () => ({ ArchiveTransfersPanel: () => <div data-testid="transfers" /> }));
vi.mock('../../src/ui/TriggerEvents', () => ({ TriggerEventTypesPanel: () => <div data-testid="trigger-types" /> }));
vi.mock('../../src/ui/SamplingCampaigns', () => ({ SamplingCampaignsPanel: () => <div data-testid="sampling" /> }));
import { RetentionNationalPage } from '../../src/pages/RetentionNational';

const event = (n: number, over: Record<string, unknown> = {}) => ({ id: 'e' + n, documentId: 'd' + n, dossierId: null, ruleVersionId: 'v1', institutionId: 'i-1', departmentId: null, baseDate: '2020-01-01', dueDate: '2030-01-01', status: 'ACTIF', suspendedFromStatus: null, suspendedAt: null, reviewCount: n, closedAt: null, ...over });
const hold = (n: number, over: Record<string, unknown> = {}) => ({ id: 'h' + n, reference: 'GEL-' + n, reason: 'Enquête en cours ' + n, status: 'ACTIF', institutionId: 'i-1', departmentId: null, openedBy: 'u1', openedAt: '2026-10-01T08:00:00Z', releasedBy: null, releasedAt: null, releaseReference: null, ...over });

beforeEach(() => {
    fixture.allowed = new Set(); fixture.scope = { institutionId: 'i-1', departmentId: null }; fixture.epoch += 1;
    fixture.retention.events.mockReset().mockResolvedValue([event(1), event(2, { status: 'SUSPENDU' })]);
    fixture.retention.legalHolds.mockReset().mockResolvedValue([hold(1), hold(2, { status: 'LEVE' })]);
});

it('sans institution dans le périmètre, la page le dit et n’interroge rien', () => {
    fixture.scope = { institutionId: null, departmentId: null };
    render(<RetentionNationalPage />);
    expect(screen.getByRole('alert').textContent).toContain('Choisissez une institution');
    expect(fixture.retention.events).not.toHaveBeenCalled();
});

it('sans aucune habilitation, chaque section dit laquelle lui manque et aucun panneau ne s’ouvre', async () => {
    render(<RetentionNationalPage />);
    expect(await screen.findByText(/exige une habilitation de revue de rétention/)).toBeTruthy();
    expect(screen.getByText(/exige une habilitation de gestion des gels légaux/)).toBeTruthy();
    for (const id of ['rules', 'trigger-types', 'refresh', 'intermediate', 'sampling', 'bordereaux', 'transfers', 'certificates']) expect(screen.queryByTestId(id)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ouvrir un gel' })).toBeNull();
});

it('la revue ouvre les échéances et les panneaux de suite, mais pas la gestion des règles ni des gels', async () => {
    fixture.allowed = new Set(['RETENTION_REVIEW']);
    render(<RetentionNationalPage />);
    await waitFor(() => expect(screen.getAllByRole('row').length).toBeGreaterThan(1));
    for (const id of ['refresh', 'intermediate', 'sampling', 'bordereaux', 'transfers', 'certificates', 'trigger-types']) expect(screen.getByTestId(id)).toBeTruthy();
    expect(screen.queryByTestId('rules')).toBeNull();
    expect(screen.getByText(/exige une habilitation de gestion des gels légaux/)).toBeTruthy();
    expect(fixture.retention.events).toHaveBeenCalledWith('i-1', null, expect.anything());
});

it('les échéances se listent, et se déplient sur leurs dispositions', async () => {
    fixture.allowed = new Set(['RETENTION_REVIEW']);
    render(<RetentionNationalPage />);
    const dispositions = await screen.findByRole('button', { name: /^1 · Dispositions/ });
    expect(screen.getByRole('button', { name: /^2 · Dispositions/ })).toBeTruthy();
    expect(screen.queryByTestId('dispositions-e1')).toBeNull();
    fireEvent.click(dispositions);
    expect(screen.getByTestId('dispositions-e1')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^1 · Masquer/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^1 · Masquer/ }));
    expect(screen.queryByTestId('dispositions-e1')).toBeNull();
});

it('une institution sans échéance le dit, et une erreur du serveur n’est pas présentée comme une liste vide', async () => {
    fixture.allowed = new Set(['RETENTION_REVIEW']);
    fixture.retention.events.mockResolvedValue([]);
    const { unmount } = render(<RetentionNationalPage />);
    expect(await screen.findByText('Aucune échéance de rétention')).toBeTruthy();
    unmount();
    fixture.epoch += 1;
    fixture.retention.events.mockRejectedValue(new Error('Indisponible'));
    render(<RetentionNationalPage />);
    expect(await screen.findByText('Indisponible')).toBeTruthy();
    expect(screen.queryByText('Aucune échéance de rétention')).toBeNull();
});

it('la gestion des gels liste les gels, ne propose de lever que les gels actifs et ouvre les deux dialogues', async () => {
    fixture.allowed = new Set(['LEGAL_HOLD_MANAGE']);
    render(<RetentionNationalPage />);
    expect(await screen.findByText('GEL-1')).toBeTruthy();
    expect(screen.getByText('GEL-2')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Lever' }).length).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Lever' }));
    expect(await screen.findByRole('dialog', { name: 'Lever le gel h1' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir un gel' }));
    expect(await screen.findByRole('dialog', { name: 'Ouvrir un gel légal' })).toBeTruthy();
});

it('la gestion des règles ouvre le panneau des règles et celui des types d’événement déclencheur', async () => {
    fixture.allowed = new Set(['RETENTION_RULE_MANAGE']);
    render(<RetentionNationalPage />);
    expect(await screen.findByTestId('rules')).toBeTruthy();
    expect(screen.getByTestId('trigger-types')).toBeTruthy();
    expect(screen.queryByTestId('certificates')).toBeNull();
});

it('une proposition de sort final ouvre les bordereaux sans ouvrir la revue des échéances', async () => {
    fixture.allowed = new Set(['DISPOSITION_PROPOSE']);
    render(<RetentionNationalPage />);
    expect(await screen.findByTestId('bordereaux')).toBeTruthy();
    expect(screen.getByTestId('transfers')).toBeTruthy();
    expect(screen.queryByTestId('intermediate')).toBeNull();
    expect(screen.getByText(/exige une habilitation de revue de rétention/)).toBeTruthy();
});
