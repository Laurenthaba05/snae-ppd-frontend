import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Change } from '../../src/core/types';

// La gouvernance des habilitations : réservée à l'administration centrale, un rôle à la fois ; la personne qui a proposé un changement ne peut pas l'approuver, seulement l'annuler.
const fixture = vi.hoisted(() => ({
    api: { impact: vi.fn(), changes: vi.fn(), change: vi.fn(), permissions: vi.fn() },
    me: null as unknown, epoch: 1
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/ui/names', () => ({ EntityName: ({ id }: { id: string }) => <span>{id === 'u-moi' ? 'Moi-même' : 'Aminata Camara'}</span> }));
vi.mock('../../src/ui/ReferencePicker', () => ({ ReferencePicker: () => <div>sélecteur de rôle</div> }));
vi.mock('../../src/ui/CommandDialog', () => ({ CommandDialog: ({ title }: { title: string }) => <div role="dialog" aria-label={title} /> }));
vi.mock('../../src/ui/navigation', () => ({ navigate: vi.fn() }));
import { GovernancePage } from '../../src/pages/Governance';
import { allPermissions } from '../../src/pages/RolePermissions';

const ROLE = 'r-1';
// Un vrai profil : la règle réelle de l'administration centrale (rôle SNAE_PLATFORM_ADMIN, portée nationale, attribution directe et non expirée) décide de ce que l'écran propose.
const admin = (grant: Record<string, unknown> = {}) => ({
    user: { id: 'u-moi', status: 'ACTIF', accountType: 'USER' },
    grants: [{ roleCode: 'SNAE_PLATFORM_ADMIN', scope: 'NATIONAL', delegationId: null, expiresAt: null, ...grant }]
});
const change = (over: Partial<Change> = {}): Change => ({
    id: 'c-1', roleId: ROLE, expectedRoleVersion: 3, previousPermissionIds: ['p-a', 'p-b'], requestedPermissionIds: ['p-b', 'p-c'], requestedBy: 'u-autre', requestedAt: '2026-10-10T08:00:00Z',
    expiresAt: '2099-01-01T00:00:00Z', reason: 'Ouvrir la lecture des archives', status: 'PENDING', version: 1, resolutionReason: null, ...over
} as unknown as Change);
const impact = { roleId: ROLE, roleVersion: 3, permissionRevision: 12, currentOrFutureAssignments: 4, currentOrFutureDelegations: 2, distinctAssignedUsers: 4, pendingChanges: 1, approvalRequired: true };

beforeEach(() => {
    fixture.epoch += 1; fixture.me = admin();
    fixture.api.impact.mockReset().mockResolvedValue(impact);
    fixture.api.changes.mockReset().mockResolvedValue({ items: [change()], page: 0, size: 20, hasMore: false });
    fixture.api.change.mockReset().mockResolvedValue(change());
    fixture.api.permissions.mockReset().mockResolvedValue({ items: [{ id: 'p-a', code: 'DOCUMENT_READ' }, { id: 'p-b', code: 'DOCUMENT_CREATE' }, { id: 'p-c', code: 'AUDIT_READ' }], page: 0, size: 100, hasMore: false });
});

it('sans l’attribution nationale du rôle d’administration centrale, la page le dit et ne montre rien', () => {
    fixture.me = admin({ roleCode: 'AUTRE_ROLE' });
    render(<GovernancePage roleId={ROLE} />);
    expect(screen.getByText(/exige une attribution nationale directe du rôle d’administration centrale/)).toBeTruthy();
    expect(screen.queryByText('Demandes de changement')).toBeNull();
});

it('sans rôle choisi, invite à en choisir un et n’interroge rien', () => {
    render(<GovernancePage roleId="" />);
    expect(screen.getByText('Commencez par un rôle')).toBeTruthy();
    expect(fixture.api.impact).not.toHaveBeenCalled();
});

it('un rôle choisi montre son impact et ses demandes, sans identifiant brut', async () => {
    render(<GovernancePage roleId={ROLE} />);
    expect(await screen.findByText('Demandes de changement')).toBeTruthy();
    expect(screen.getByText('Attributions actuelles ou futures').nextSibling!.textContent).toBe('4');
    expect(screen.getByText('Délégations enregistrées').nextSibling!.textContent).toBe('2');
    expect(screen.getByText(/Révision des permissions : 12/)).toBeTruthy();
    expect(screen.getByText('Ouvrir la lecture des archives')).toBeTruthy();
    expect(screen.getByText('Aminata Camara')).toBeTruthy();
    expect(screen.queryByText('u-autre')).toBeNull();
    expect(fixture.api.impact).toHaveBeenCalledWith(ROLE, expect.anything());
    expect(fixture.api.changes).toHaveBeenCalledWith(ROLE, 0, expect.anything());
});

it('un rôle sans demande le dit', async () => {
    fixture.api.changes.mockResolvedValue({ items: [], page: 0, size: 20, hasMore: false });
    render(<GovernancePage roleId={ROLE} />);
    expect(await screen.findByText('Aucune demande pour ce rôle')).toBeTruthy();
});

it('une erreur du serveur est dite, sans présenter un rôle vide', async () => {
    fixture.api.impact.mockRejectedValue(new Error('Indisponible'));
    render(<GovernancePage roleId={ROLE} />);
    await screen.findByRole('alert');
    expect(screen.queryByText('Aucune demande pour ce rôle')).toBeNull();
});

it('l’examen d’une demande d’une autre personne compare les permissions, avec leurs noms, et propose d’approuver et de rejeter mais pas d’annuler', async () => {
    render(<GovernancePage roleId={ROLE} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Examiner' }));
    const detail = (await screen.findByText('Examen indépendant')).closest('section')!;
    expect(await within(detail).findByText('Permissions précédentes')).toBeTruthy();
    const previous = within(detail).getByText('Permissions précédentes').parentElement!;
    const requested = within(detail).getByText('Permissions demandées').parentElement!;
    expect(within(previous).getByText('DOCUMENT_READ').className).toContain('removed');
    expect(within(previous).getByText('DOCUMENT_CREATE').className).not.toContain('removed');
    expect(within(requested).getByText('AUDIT_READ').className).toContain('added');
    expect(within(detail).getByRole('button', { name: 'Approuver' })).toBeTruthy();
    expect(within(detail).getByRole('button', { name: 'Rejeter' })).toBeTruthy();
    expect(within(detail).queryByRole('button', { name: 'Annuler ma demande' })).toBeNull();
    fireEvent.click(within(detail).getByRole('button', { name: 'Approuver' }));
    expect(await screen.findByRole('dialog', { name: 'Approuver le changement' })).toBeTruthy();
});

it('sa propre demande ne s’approuve pas : l’écran explique et ne propose que de l’annuler', async () => {
    fixture.api.changes.mockResolvedValue({ items: [change({ requestedBy: 'u-moi' })], page: 0, size: 20, hasMore: false });
    fixture.api.change.mockResolvedValue(change({ requestedBy: 'u-moi' }));
    render(<GovernancePage roleId={ROLE} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Examiner' }));
    const detail = (await screen.findByText('Examen indépendant')).closest('section')!;
    expect(await within(detail).findByText(/Vous êtes à l’origine de cette demande/)).toBeTruthy();
    expect(within(detail).queryByRole('button', { name: 'Approuver' })).toBeNull();
    expect(within(detail).queryByRole('button', { name: 'Rejeter' })).toBeNull();
    expect(within(detail).getByRole('button', { name: 'Annuler ma demande' })).toBeTruthy();
});

it('une demande qui retire toutes les permissions est signalée, une demande résolue ne propose plus d’action', async () => {
    fixture.api.change.mockResolvedValue(change({ requestedPermissionIds: [], status: 'APPROVED', resolutionReason: 'Validé en comité' }));
    render(<GovernancePage roleId={ROLE} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Examiner' }));
    const detail = (await screen.findByText('Examen indépendant')).closest('section')!;
    expect(await within(detail).findByText('Cette demande retire toutes les permissions du rôle.')).toBeTruthy();
    expect(within(detail).getByText(/Décision : Validé en comité/)).toBeTruthy();
    expect(within(detail).queryByRole('button', { name: 'Approuver' })).toBeNull();
});

it('le catalogue des permissions se lit page par page et refuse de se tronquer en silence', async () => {
    const pages = [0, 1, 2].map(p => ({ items: [{ id: 'p' + p, code: 'CODE_' + p }], page: p, size: 1, hasMore: p < 2 }));
    const api = { permissions: vi.fn(async (p: number) => pages[p]) };
    expect((await allPermissions(api as never, new AbortController().signal)).map(p => p.code)).toEqual(['CODE_0', 'CODE_1', 'CODE_2']);
    const endless = { permissions: vi.fn(async (p: number) => ({ items: [{ id: 'x' + p, code: 'X' + p }], page: p, size: 1, hasMore: true })) };
    await expect(allPermissions(endless as never, new AbortController().signal)).rejects.toThrow('Catalogue supérieur à 1 000 permissions');
    expect(endless.permissions).toHaveBeenCalledTimes(10);
});
