import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { ReplicationStatus } from '../../src/core/replication';

const fixture = vi.hoisted(() => ({
    epoch: 1, me: null as unknown, demo: false, allowed: new Set<string>(),
    records: { replicationStatus: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
import { ReplicationMonitoring } from '../../src/ui/ReplicationMonitoring';

const status = (over: Partial<ReplicationStatus> = {}): ReplicationStatus => ({
    enabled: true, configured: true, primaryProvider: 'LOCAL_PRIVATE', posture: { copies: 2, distinctStores: 2, offsiteCopies: 1, meetsThreeTwoOne: false }, trackedObjects: 14, fallbackReads: 0,
    lastCycleStartedAt: new Date().toISOString(), lastCycleFinishedAt: new Date().toISOString(), lastCycleCode: null, lastInventoryAt: new Date().toISOString(), problems: [],
    replicas: [{ name: 'copie-nationale', provider: 'LOCAL_PRIVATE', offsite: true, jurisdiction: 'Centre de données national', copied: 12, pending: 1, mismatched: 0, failed: 1, toDelete: 0,
        copiedBytes: 4096, oldestPendingAt: '2026-10-09T08:00:00Z', lastVerifiedAt: '2026-10-10T08:00:00Z' }],
    ...over
});

beforeEach(() => {
    fixture.epoch += 1; fixture.demo = false;
    fixture.allowed = new Set(['PRESERVATION_BACKUP_READ']);
    fixture.records.replicationStatus.mockReset();
    fixture.records.replicationStatus.mockResolvedValue(status());
});

it('ne montre rien sans le droit de surveiller les sauvegardes, ni en démonstration', () => {
    fixture.allowed = new Set();
    const { container } = render(<ReplicationMonitoring />);
    expect(container.textContent).toBe('');
    expect(fixture.records.replicationStatus).not.toHaveBeenCalled();
});

it('montre la posture, chaque réplica avec son support, son état et ses copies, sans identifiant', async () => {
    fixture.records.replicationStatus.mockResolvedValue(status({
        problems: [{ replica: 'copie-nationale', status: 'ERREUR', attempts: 8, errorCode: 'REPLICA_SOURCE_MISMATCH', kind: 'FICHIER', documentReference: 'DOC-2026-001', fileName: 'Registre.pdf', size: 2048, updatedAt: '2026-10-10T09:00:00Z' }]
    }));
    render(<ReplicationMonitoring />);
    expect(await screen.findByText('Hébergement et réplicas')).toBeTruthy();
    expect(screen.getByText(/la règle 3-2-1 \(trois copies, deux supports, une hors site\) n’est pas atteinte/)).toBeTruthy();
    const row = screen.getAllByText('copie-nationale')[0]!.closest('tr')!;
    expect(within(row).getByText('Centre de données national')).toBeTruthy();
    expect(within(row).getByText('Hors site')).toBeTruthy();
    expect(within(row).getByText('À examiner')).toBeTruthy();
    expect(within(row).getByText(/12 copies vérifiées/)).toBeTruthy();
    expect(within(row).getByText(/1 à copier · 1 impossible/)).toBeTruthy();
    // l'objet à examiner se lit par son fichier et son document
    expect(screen.getByText('Registre.pdf du document DOC-2026-001')).toBeTruthy();
    expect(screen.getByText(/ne correspond plus à son empreinte/)).toBeTruthy();
    expect(screen.getByText('Copie impossible')).toBeTruthy();
    expect(screen.getByText('8 essais')).toBeTruthy();
});

it('sans réplica configuré, le dit et n’invente aucune protection', async () => {
    fixture.records.replicationStatus.mockResolvedValue(status({ configured: false, enabled: false, replicas: [], trackedObjects: 0, posture: { copies: 1, distinctStores: 1, offsiteCopies: 0, meetsThreeTwoOne: false } }));
    render(<ReplicationMonitoring />);
    expect(await screen.findByText('Aucun réplica configuré')).toBeTruthy();
    expect(screen.getByText(/Une seule copie/)).toBeTruthy();
    expect(screen.getByText('Aucun réplica n’est configuré.')).toBeTruthy();
});

it('signale les lectures servies par un réplica et un cycle en échec', async () => {
    fixture.records.replicationStatus.mockResolvedValue(status({ fallbackReads: 3, lastCycleCode: 'REPLICATION_CYCLE_FAILED' }));
    render(<ReplicationMonitoring />);
    expect(await screen.findByText(/3 lectures ont été servies par un réplica/)).toBeTruthy();
    expect(screen.getByText(/Le dernier cycle de réplication a échoué/)).toBeTruthy();
});

it('affiche l’erreur de chargement avec la possibilité de réessayer', async () => {
    fixture.records.replicationStatus.mockRejectedValue(new Error('Hors ligne'));
    render(<ReplicationMonitoring />);
    expect(await screen.findByRole('button', { name: /Réessayer/ })).toBeTruthy();
});
