import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { SealKeyStatus } from '../../src/core/sealKey';

const fixture = vi.hoisted(() => ({
    epoch: 1, demo: false, me: null as unknown, allowed: new Set<string>(),
    records: { sealKeyStatus: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
import { SealKeyStatusSection } from '../../src/ui/SealKeyStatus';

const status = (over: Partial<SealKeyStatus> = {}): SealKeyStatus => ({
    enabled: true, storeType: 'PKCS11', hardware: true, alias: 'sceau', subject: 'CN=Sceau SNAE-PPD,O=Archives nationales', issuer: 'CN=Autorité nationale', serial: '1a2b',
    fingerprint: 'ab'.repeat(32), notBefore: '2026-01-01T00:00:00Z', notAfter: '2027-01-01T00:00:00Z', daysRemaining: 260, rotationDue: false, rotationWarnDays: 90,
    algorithm: 'SHA256withRSA', keyBits: 3072, sealsWithCurrentKey: 12,
    history: [
        { fingerprint: 'ab'.repeat(32), subject: 'CN=Sceau SNAE-PPD', seals: 12, firstSealedAt: '2026-03-01T00:00:00Z', lastSealedAt: '2026-10-09T00:00:00Z', current: true },
        { fingerprint: 'cd'.repeat(32), subject: 'CN=Ancien sceau', seals: 4, firstSealedAt: '2025-05-01T00:00:00Z', lastSealedAt: '2025-12-01T00:00:00Z', current: false }
    ],
    warnings: ['1 autre certificat a servi à sceller des actes : ces sceaux restent vérifiables tant que leur autorité est déclarée parmi les autorités de confiance.'], ...over
});

beforeEach(() => {
    fixture.epoch += 1; fixture.demo = false;
    fixture.allowed = new Set(['TRUST_ANCHOR_MANAGE']);
    fixture.records.sealKeyStatus.mockReset().mockResolvedValue(status());
});

it('montre la garde de la clé, le certificat, la validité et l’historique des certificats employés', async () => {
    render(<SealKeyStatusSection />);
    const region = await screen.findByRole('region', { name: 'Clé de scellement des actes' });
    expect(await within(region).findByText('Module matériel (PKCS#11)')).toBeTruthy();
    expect(within(region).getByText('260 jours restants')).toBeTruthy();
    expect(within(region).getByText('SHA-256 avec RSA, 3072 bits')).toBeTruthy();
    expect(within(region).getByText('12 actes scellés')).toBeTruthy();
    expect(within(region).getByText('Clé actuelle')).toBeTruthy();
    expect(within(region).getByText('Ancienne clé')).toBeTruthy();
    expect(within(region).getByText(/1 autre certificat a servi/)).toBeTruthy();
});

it('une rotation due et un certificat expiré se lisent', async () => {
    fixture.records.sealKeyStatus.mockResolvedValue(status({ daysRemaining: 20, rotationDue: true, warnings: ['Le certificat expire dans 20 jours.'] }));
    render(<SealKeyStatusSection />);
    expect(await screen.findByText('20 jours restants — rotation à préparer (seuil : 90 jours)')).toBeTruthy();
    expect(screen.getByText('Le certificat expire dans 20 jours.')).toBeTruthy();
});

it('sans scellement activé, la section le dit', async () => {
    fixture.records.sealKeyStatus.mockResolvedValue(status({ enabled: false, storeType: null, hardware: false, alias: null, subject: null, issuer: null, fingerprint: null, notAfter: null, daysRemaining: null,
        history: [], warnings: [], sealsWithCurrentKey: 0, keyBits: null, algorithm: null }));
    render(<SealKeyStatusSection />);
    expect(await screen.findByText(/n’est pas activé sur ce serveur/)).toBeTruthy();
    expect(screen.getByText('Non activée')).toBeTruthy();
});

it('sans habilitation nationale ou en démonstration, rien n’est affiché', async () => {
    fixture.allowed = new Set();
    const { container, rerender } = render(<SealKeyStatusSection />);
    expect(container.innerHTML).toBe('');
    expect(fixture.records.sealKeyStatus).not.toHaveBeenCalled();
    fixture.allowed = new Set(['TRUST_ANCHOR_MANAGE']); fixture.demo = true;
    rerender(<SealKeyStatusSection />);
    expect(container.innerHTML).toBe('');
});
