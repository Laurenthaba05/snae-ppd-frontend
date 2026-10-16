import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { AuditChainVerification } from '../../src/core/auditChain';

const fixture = vi.hoisted(() => ({
    audit: { verifyChain: vi.fn() },
    me: { user: { id: 'u1' } } as unknown,
    permissions: new Set<string>(['AUDIT_VERIFY']),
    epoch: 1
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.permissions.has(code) }));
import { AuditChainPanel } from '../../src/ui/AuditChainPanel';

const part = (over: Partial<AuditChainVerification> = {}): AuditChainVerification => ({
    ok: true, fromSequence: 1, lastVerifiedSequence: 40, checked: 40, headSequence: 40, complete: true, nextSequence: null, anomalyCount: 0, anomalies: [],
    legacy: { events: 0, chained: null, note: 'Aucun événement historique : la chaîne commence au numéro 1.' }, verifiedAt: '2026-10-16T12:00:00Z', durationMillis: 1200, ...over
});

beforeEach(() => {
    fixture.permissions = new Set(['AUDIT_VERIFY']); fixture.epoch += 1;
    fixture.audit.verifyChain.mockReset().mockResolvedValue(part());
});

it('sans l’habilitation de vérification, le panneau n’apparaît pas', () => {
    fixture.permissions = new Set(['AUDIT_READ']);
    const { container } = render(<AuditChainPanel />);
    expect(container.textContent).toBe('');
    expect(fixture.audit.verifyChain).not.toHaveBeenCalled();
});

it('une chaîne saine est annoncée intacte jusqu’à la tête, avec l’historique', async () => {
    render(<AuditChainPanel />);
    expect(fixture.audit.verifyChain).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier la chaîne' }));
    expect(await screen.findByText(/Aucune anomalie/)).toBeTruthy();
    expect(screen.getByText(/forment une chaîne cohérente jusqu’à la tête \(événement n° 40\)/)).toBeTruthy();
    expect(screen.getByText(/Aucun événement historique/)).toBeTruthy();
    expect(fixture.audit.verifyChain).toHaveBeenCalledWith(1, 10_000, expect.anything());
    expect(screen.queryByRole('table')).toBeNull();
});

it('enchaîne les tranches jusqu’à la tête, en reprenant là où la précédente s’arrête', async () => {
    fixture.audit.verifyChain
        .mockResolvedValueOnce(part({ lastVerifiedSequence: 10_000, checked: 10_000, headSequence: 25_000, complete: false, nextSequence: 10_001 }))
        .mockResolvedValueOnce(part({ fromSequence: 10_001, lastVerifiedSequence: 20_000, checked: 10_000, headSequence: 25_001, complete: false, nextSequence: 20_001 }))
        .mockResolvedValueOnce(part({ fromSequence: 20_001, lastVerifiedSequence: 25_002, checked: 5_002, headSequence: 25_002, complete: true, nextSequence: null }));
    render(<AuditChainPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier la chaîne' }));
    await screen.findByText(/Aucune anomalie/);
    expect(fixture.audit.verifyChain.mock.calls.map(c => c[0])).toEqual([1, 10_001, 20_001]);
    expect(screen.getByText(/les 25002 événements relus/)).toBeTruthy();
    expect(screen.getByText(/3 tranche\(s\)/)).toBeTruthy();
});

it('liste les anomalies relevées avec leur nature, leur numéro et leur détail, sans conclure à une chaîne saine', async () => {
    fixture.audit.verifyChain.mockResolvedValue(part({
        ok: false, anomalyCount: 2,
        anomalies: [{ kind: 'HASH_MISMATCH', sequence: 12, eventId: '00000000-0000-4000-8000-000000000001', detail: 'L’empreinte enregistrée n’est pas celle de la charge utile.' },
            { kind: 'CHAIN_BREAK', sequence: 13, eventId: null, detail: 'La chaîne est rompue.' }]
    }));
    render(<AuditChainPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier la chaîne' }));
    expect(await screen.findByText(/2 anomalie\(s\) relevée\(s\)/)).toBeTruthy();
    expect(screen.queryByText(/Aucune anomalie/)).toBeNull();
    const table = screen.getByRole('table');
    expect(within(table).getByText('Événement modifié')).toBeTruthy();
    expect(within(table).getByText('Chaîne rompue')).toBeTruthy();
    expect(within(table).getByText('12')).toBeTruthy();
    expect(table.textContent).not.toMatch(/00000000-0000/);
});

it('une erreur du serveur est dite, et rien n’est annoncé intact', async () => {
    fixture.audit.verifyChain.mockRejectedValue(Object.assign(new Error('Une vérification de la chaîne est déjà en cours'), { status: 409 }));
    render(<AuditChainPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier la chaîne' }));
    await screen.findByRole('alert');
    expect(screen.queryByText(/Aucune anomalie/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Vérifier la chaîne' }).hasAttribute('disabled')).toBe(false);
});

it('on peut interrompre : la relecture s’arrête et le dit', async () => {
    let release: (v: AuditChainVerification) => void = () => {};
    fixture.audit.verifyChain
        .mockResolvedValueOnce(part({ lastVerifiedSequence: 10_000, checked: 10_000, headSequence: 50_000, complete: false, nextSequence: 10_001 }))
        .mockImplementationOnce((_from: number, _count: number, signal?: AbortSignal) => new Promise<AuditChainVerification>((resolve, reject) => {
            release = resolve; signal?.addEventListener('abort', () => reject(new DOMException('annulé', 'AbortError')));
        }));
    render(<AuditChainPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier la chaîne' }));
    const stop = await screen.findByRole('button', { name: 'Interrompre' });
    await waitFor(() => expect(fixture.audit.verifyChain).toHaveBeenCalledTimes(2));
    fireEvent.click(stop);
    expect(await screen.findByText(/Relecture interrompue/)).toBeTruthy();
    expect(screen.getByText(/jusqu’à l’événement n° 10000/)).toBeTruthy();
    expect(screen.queryByText(/Aucune anomalie/)).toBeNull();
    release(part());
});
