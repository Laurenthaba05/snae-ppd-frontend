import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Me, Grant } from '../../src/core/types';
import { conservationVisible, documentPreservationVisible, scannerVisible } from '../../src/core/screenAccess';
import { moduleVisible } from '../../src/design/navigation';
const fixture = vi.hoisted(() => ({ me: null as Me | null, epoch: 1, demo: false,
    records: { allPreservationEvents: vi.fn() }, digitization: { scanners: vi.fn() }, profiles: vi.fn(), monitor: vi.fn() }));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: { institutionId: 'M-001' } }) }));
vi.mock('../../src/ui/ScannerCapture', () => ({ ScannerWorkspace: () => <p>Acquisition de recette</p> }));
vi.mock('../../src/ui/ScanProfiles', () => ({ ScanProfilesSection: () => { fixture.profiles(); return null; } }));
vi.mock('../../src/ui/PreservationMonitoring', () => ({ PreservationMonitoring: () => { fixture.monitor(); return null; } }));
vi.mock('../../src/ui/BackupMonitoring', () => ({ BackupMonitoring: () => null }));
vi.mock('../../src/ui/ReplicationMonitoring', () => ({ ReplicationMonitoring: () => null }));
vi.mock('../../src/ui/PreservationPlanning', () => ({ PreservationPlanningSection: () => null }));
vi.mock('../../src/ui/Dissemination', () => ({ DisseminationSection: () => null }));
vi.mock('../../src/ui/TrustAnchors', () => ({ TrustAnchorsSection: () => null }));
vi.mock('../../src/ui/RevocationLists', () => ({ RevocationListsSection: () => null }));
vi.mock('../../src/ui/SealKeyStatus', () => ({ SealKeyStatusSection: () => null }));
import { PreservationEventListPage } from '../../src/ui/RecordFiles';
import { ScannersPage } from '../../src/pages/Scanners';
const account = (codes: string[], scope: Grant['scope'] = 'INSTITUTION'): Me => ({
    user: { status: 'ACTIF', accountType: 'USER' },
    grants: codes.map(permission => ({ permission, scope, institutionId: 'M-001', departmentId: 'D-001', expiresAt: null })),
} as Me);
beforeEach(() => { vi.clearAllMocks(); fixture.records.allPreservationEvents.mockResolvedValue([]); fixture.digitization.scanners.mockResolvedValue([]); });
it('ouvre PREMIS pour le rôle de conservation sans exiger rétention ou patrimoine', () => {
    const me = account(['DOCUMENT_READ','PRESERVATION_EVENT_READ','PRESERVATION_EVENT_MANAGE','PRESERVATION_PACKAGE_EXPORT']);
    expect(documentPreservationVisible(me, { institutionId: 'M-001' })).toBe(true);
    expect(documentPreservationVisible(me, { institutionId: 'M-002' })).toBe(false);
    expect(documentPreservationVisible(account(['PRESERVATION_EVENT_MANAGE']), { institutionId: 'M-001' })).toBe(false);
});
it.each(['PRESERVATION_PLANNING_READ','PRESERVATION_PLANNING_MANAGE','PRESERVATION_DIAGNOSTIC_READ','PRESERVATION_DIAGNOSTIC_MANAGE',
    'PRESERVATION_MIGRATION_MANAGE','PRESERVATION_MIGRATION_APPROVE','DISSEMINATION_READ','DISSEMINATION_MANAGE','FINDING_AID_PUBLISH','TRUST_ANCHOR_MANAGE'])('ouvre la conservation spécialisée %s uniquement dans son institution', permission => {
    const me = account([permission]);
    expect(moduleVisible(me, 'conservation', { institutionId: 'M-001' })).toBe(true);
    expect(conservationVisible(me, { institutionId: 'M-002' })).toBe(false);
    expect(conservationVisible(me, {})).toBe(false);
    expect(conservationVisible(account([permission], 'DEPARTMENT'), { institutionId: 'M-001', departmentId: 'D-001' })).toBe(false);
});
it('réserve les sauvegardes au périmètre national et refuse les comptes inactifs ou expirés', () => {
    expect(conservationVisible(account(['PRESERVATION_BACKUP_READ'], 'NATIONAL'), {})).toBe(true);
    expect(conservationVisible(account(['PRESERVATION_BACKUP_READ']), { institutionId: 'M-001' })).toBe(false);
    const me = account(['FILE_INGEST']); me.grants[0]!.expiresAt = '2000-01-01T00:00:00Z';
    expect(scannerVisible(me)).toBe(false); me.grants[0]!.expiresAt = null; me.user.status = 'INACTIF';
    expect(scannerVisible(me)).toBe(false);
});
it('ne charge ni journal ni contrôles d’intégrité pour un lecteur des sauvegardes seul', async () => {
    fixture.me = account(['PRESERVATION_BACKUP_READ'], 'NATIONAL');
    render(<PreservationEventListPage />);
    await screen.findByRole('heading', { name: 'Conservation', exact: true });
    await waitFor(() => expect(fixture.records.allPreservationEvents).not.toHaveBeenCalled());
    expect(fixture.monitor).not.toHaveBeenCalled();
    expect(screen.queryByText('Aucun événement')).toBeNull();
});
it('continue de charger le journal pour un lecteur de conservation autorisé', async () => {
    fixture.me = account(['PRESERVATION_EVENT_READ']); render(<PreservationEventListPage />);
    await screen.findByText('Aucun événement');
    expect(fixture.records.allPreservationEvents).toHaveBeenCalledWith('M-001', undefined, expect.any(AbortSignal));
    expect(fixture.monitor).toHaveBeenCalled();
});
it('ouvre la capture institutionnelle sans appeler le parc ni les profils nationaux', async () => {
    fixture.me = account(['FILE_INGEST']);
    expect(moduleVisible(fixture.me, 'scanners', {})).toBe(true);
    expect(scannerVisible(account(['DIGITIZATION_READ']))).toBe(true);
    render(<ScannersPage />);
    await screen.findByText('Acquisition de recette');
    expect((screen.getByRole('button', { name: 'Parc et profils de qualité' }) as HTMLButtonElement).disabled).toBe(true);
    expect(fixture.digitization.scanners).not.toHaveBeenCalled(); expect(fixture.profiles).not.toHaveBeenCalled();
});
