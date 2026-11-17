import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Me, Grant } from '../../src/core/types';
import { moduleVisible } from '../../src/design/navigation';
const fixture = vi.hoisted(() => ({ me: null as Me | null, epoch: 1, retention: { events: vi.fn(), legalHolds: vi.fn() } }));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: { institutionId: 'M-001' } }) }));
vi.mock('../../src/pages/Records', () => ({ EventDispositions: () => null, ReleaseHoldDialog: () => null }));
vi.mock('../../src/ui/RetentionRules', () => ({ RetentionRulesPanel: () => <p>Règles autorisées</p> }));
vi.mock('../../src/ui/TriggerEvents', () => ({ TriggerEventTypesPanel: () => null }));
vi.mock('../../src/ui/Bordereaux', () => ({ BordereauxPanel: () => <p>Bordereaux autorisés</p>, BordereauDialog: () => null }));
vi.mock('../../src/ui/ArchiveTransfers', () => ({ ArchiveTransfersPanel: () => null, TransferDialog: () => null }));
vi.mock('../../src/ui/SamplingCampaigns', () => ({ SamplingCampaignsPanel: () => null }));
vi.mock('../../src/ui/Intermediate', () => ({ IntermediatePanel: () => null }));
vi.mock('../../src/ui/Destruction', () => ({ CertificatesPanel: () => null }));
import { RetentionNationalPage } from '../../src/pages/RetentionNational';
const account = (permission: string, scope: Grant['scope'] = 'INSTITUTION') => ({ user: { status: 'ACTIF', accountType: 'USER' }, grants: [{ permission, scope, institutionId: 'M-001', departmentId: 'D-001', expiresAt: null }] } as Me);
beforeEach(() => { vi.clearAllMocks(); history.replaceState(null, '', '/app/eliminations'); fixture.retention.events.mockResolvedValue([]); fixture.retention.legalHolds.mockResolvedValue([]); });
it.each(['DISPOSITION_PROPOSE','DISPOSITION_VALIDATE','DISPOSITION_EXECUTE','RETENTION_RULE_MANAGE'])('ouvre les fonctions de %s sans charger les échéances ni les gels', async permission => {
    fixture.me = account(permission); expect(moduleVisible(fixture.me, 'eliminations', { institutionId: 'M-001' })).toBe(true);
    expect(moduleVisible(fixture.me, 'sort-final', { institutionId: 'M-002' })).toBe(false);
    render(<RetentionNationalPage/>); await screen.findByText(permission === 'RETENTION_RULE_MANAGE' ? 'Règles autorisées' : 'Bordereaux autorisés');
    await waitFor(() => expect(fixture.retention.events).not.toHaveBeenCalled()); expect(fixture.retention.legalHolds).not.toHaveBeenCalled();
    expect(screen.queryByText(/Cette section exige/)).toBeNull();
});
it('ne confond pas une habilitation de service avec la gestion institutionnelle des bordereaux', () => {
    expect(moduleVisible(account('DISPOSITION_VALIDATE','DEPARTMENT'), 'eliminations', { institutionId: 'M-001', departmentId: 'D-001' })).toBe(false);
    expect(moduleVisible(account('RETENTION_REVIEW','DEPARTMENT'), 'sort-final', { institutionId: 'M-001', departmentId: 'D-001' })).toBe(true);
});
it('un gestionnaire des gels ne charge que les gels', async () => {
    fixture.me = account('LEGAL_HOLD_MANAGE'); render(<RetentionNationalPage/>); await screen.findByText('Aucun gel légal');
    expect(fixture.retention.events).not.toHaveBeenCalled(); expect(fixture.retention.legalHolds).toHaveBeenCalled();
});
