import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Assignment, Me, User } from '../../src/core/types';
import { ApiError } from '../../src/core/http';
const f = vi.hoisted(() => ({ me: null as Me | null, api: { command: vi.fn(), transport: { request: vi.fn() } }, refresh: vi.fn(), epoch: 1 }));
vi.mock('../../src/auth/session', () => ({ useSession: () => f }));
vi.mock('../../src/ui/ReferencePicker', () => ({
    ReferencePicker: ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) => <input aria-label={label} value={value} onChange={e => onChange(e.target.value)} />
}));
vi.mock('../../src/ui/names', () => ({ EntityName: () => <>Rôle de traitement documentaire</> }));
import { DelegationDialog, UserScopeDialog, mayDelegate } from '../../src/ui/IdentityScopeActions';
import { ResourceDetailsDialog } from '../../src/ui/ResourceDetails';
const own = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222', inst = '33333333-3333-4333-8333-333333333333';
const role = '44444444-4444-4444-8444-444444444444', aid = '55555555-5555-4555-8555-555555555555';
const source = (): Assignment => ({ id: aid, userId: own, roleId: role, scope: 'INSTITUTION', institutionId: inst, departmentId: null,
    status: 'ACTIF', startsAt: new Date(Date.now() - 86400000).toISOString(), endsAt: null, revokedAt: null, version: 2 });
const target = (): User => ({ ...f.me!.user, id: other, version: 7 });
const cb = () => ({ onClose: vi.fn(), onDone: vi.fn() });
const dateAfter = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 16);
beforeEach(() => {
    f.api.command.mockReset().mockResolvedValue({});
    f.api.transport.request.mockReset().mockResolvedValue({ service: 'SNAE-PPD', status: 'UP' });
    f.refresh.mockReset().mockResolvedValue(undefined);
    f.me = { user: { id: own, scope: 'INSTITUTION', institutionId: inst, departmentId: null, status: 'ACTIF', accountType: 'USER', version: 3 },
        grants: [{ roleId: '66666666-6666-4666-8666-666666666666', roleCode: 'SNAE_PLATFORM_ADMIN', permission: 'IAM_DELEGATION_MANAGE', scope: 'NATIONAL', institutionId: null, departmentId: null, delegationId: null, expiresAt: null }] } as Me;
});
it('réserve la délégation au titulaire direct et exclut les rôles administratifs et les sources expirées', () => {
    expect(mayDelegate(f.me, source())).toBe(true);
    expect(mayDelegate(f.me, { ...source(), userId: other })).toBe(false);
    expect(mayDelegate(f.me, { ...source(), endsAt: new Date(Date.now() - 1000).toISOString() })).toBe(false);
    f.me!.grants.push({ ...f.me!.grants[0]!, roleId: role, permission: 'IAM_USER_MANAGE' });
    expect(mayDelegate(f.me, source())).toBe(false);
});
it('prévisualise une délégation et transmet la source détenue, jamais une portée inventée', async () => {
    render(<DelegationDialog source={source()} {...cb()} />);
    fireEvent.change(screen.getByLabelText('Destinataire de la délégation'), { target: { value: other } });
    fireEvent.change(screen.getByLabelText('Fin de la délégation *'), { target: { value: dateAfter(2) } });
    fireEvent.change(screen.getByLabelText('Motif de la délégation *'), { target: { value: 'Remplacement temporaire' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    expect(f.api.command).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmer la délégation' }));
    await waitFor(() => expect(f.api.command).toHaveBeenCalledWith('/delegations',
        { sourceAssignmentId: aid, delegataireId: other, dateDebut: null, dateFin: expect.any(String), motif: 'Remplacement temporaire' }, expect.any(String), 'POST'));
});
it('bloque une délégation trop longue avant tout appel', async () => {
    render(<DelegationDialog source={source()} {...cb()} />);
    fireEvent.change(screen.getByLabelText('Destinataire de la délégation'), { target: { value: other } });
    fireEvent.change(screen.getByLabelText('Fin de la délégation *'), { target: { value: dateAfter(95) } });
    fireEvent.change(screen.getByLabelText('Motif de la délégation *'), { target: { value: 'Remplacement temporaire' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    await screen.findByRole('alert');
    expect(f.api.command).not.toHaveBeenCalled();
});
it('le rattachement exige une autre autorité centrale et la version lue', async () => {
    render(<UserScopeDialog user={target()} {...cb()} />);
    fireEvent.change(screen.getByLabelText('Portée du compte'), { target: { value: 'NATIONAL' } });
    fireEvent.change(screen.getByLabelText('Motif du rattachement *'), { target: { value: 'Changement de service' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    expect(f.api.command).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmer le rattachement' }));
    await waitFor(() => expect(f.api.command).toHaveBeenCalledWith('/users/' + other + '/scope',
        { expectedVersion: 7, scope: 'NATIONAL', institutionId: null, departmentId: null, reason: 'Changement de service' }, expect.any(String), 'POST'));
});
it('ne propose pas de changer son propre rattachement', () => {
    render(<UserScopeDialog user={f.me!.user} {...cb()} />);
    expect(screen.queryByRole('button', { name: 'Continuer' })).toBeNull();
    expect(f.api.command).not.toHaveBeenCalled();
});
it('un conflit de version bloque le rejeu du rattachement et impose une relecture', async () => {
    f.api.command.mockRejectedValue(new ApiError(409, 'IAM_STALE_VERSION', 'Le compte a changé.'));
    render(<UserScopeDialog user={target()} {...cb()} />);
    fireEvent.change(screen.getByLabelText('Motif du rattachement *'), { target: { value: 'Changement de service' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmer le rattachement' }));
    await screen.findByRole('alert');
    expect((screen.getByRole('button', { name: 'Confirmer le rattachement' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Fermer et relire' })).toBeTruthy();
});
it('lit l’état du service sans ajouter un identifiant au chemin', async () => {
    render(<ResourceDetailsDialog resource="systemStatus" onClose={vi.fn()} />);
    await screen.findByText('SNAE-PPD');
    expect(f.api.transport.request).toHaveBeenCalledWith('/system/status', { signal: expect.any(AbortSignal) });
});
