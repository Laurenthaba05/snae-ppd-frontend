import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Me } from '../../src/core/types';
import type { GroupMember, UserGroup } from '../../src/core/userGroups';

// Les groupes d'utilisateurs : le choix à la création d'un compte, la page des groupes et leurs membres, les groupes d'un compte sur sa fiche.
const f = vi.hoisted(() => ({
    epoch: 1, me: null as Me | null, refresh: vi.fn(),
    api: { groups: vi.fn(), allGroups: vi.fn(), groupMembers: vi.fn(), userGroups: vi.fn(), allUserGroups: vi.fn(), command: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => f }));
vi.mock('../../src/ui/names', async importOriginal => ({ ...(await importOriginal<typeof import('../../src/ui/names')>()), EntityName: ({ id }: { id: string | null }) => <span>{id ? 'Institution ' + id.slice(0, 2) : '—'}</span> }));
import { GroupChoice } from '../../src/ui/GroupChoice';
import { GroupsPage } from '../../src/pages/Groups';
import { UserGroupsPanel } from '../../src/ui/UserGroupsPanel';

const INSTITUTION = 'aa000000-0000-4000-8000-000000000001', OTHER = 'bb000000-0000-4000-8000-000000000002';
const ADMIN = '10000000-0000-4000-8000-0000000000aa', MEMBER = '10000000-0000-4000-8000-0000000000bb';
const group = (code: string, institutionId: string | null, extra: Partial<UserGroup> = {}): UserGroup =>
    ({ id: 'cc000000-0000-4000-8000-0000000000' + (code.charCodeAt(0) % 90 + 10), institutionId, code, nom: 'Groupe ' + code, description: null, defaultGroup: false, status: 'ACTIF', version: 2, memberCount: 3, ...extra });
const page = <T,>(items: T[], hasMore = false) => ({ items, page: 0, size: 25, hasMore });
const grant = (permission: string, over: Record<string, unknown> = {}) => ({ roleId: 'dd000000-0000-4000-8000-000000000001', roleCode: 'ROLE', permission, scope: 'NATIONAL', institutionId: null, departmentId: null, delegationId: null, expiresAt: null, ...over });
const platformAdmin = (): Me => ({ user: { id: ADMIN, status: 'ACTIF', accountType: 'USER', scope: 'NATIONAL', email: 'admin@example.test' }, truncated: false,
    grants: [grant('IAM_USER_READ', { roleCode: 'SNAE_PLATFORM_ADMIN' }), grant('IAM_USER_MANAGE', { roleCode: 'SNAE_PLATFORM_ADMIN' })] } as unknown as Me);
const reader = (): Me => ({ user: { id: ADMIN, status: 'ACTIF', accountType: 'USER', scope: 'INSTITUTION', email: 'lecteur@example.test' }, truncated: false,
    grants: [grant('IAM_USER_READ', { scope: 'INSTITUTION', institutionId: INSTITUTION })] } as unknown as Me);

const national = group('GENERAL', null, { defaultGroup: true, memberCount: 12 });
const team = group('EQUIPE', INSTITUTION);
const archived = group('ANCIEN', INSTITUTION, { status: 'ARCHIVE' });
const other = group('AUTRE', OTHER);
const member: GroupMember = { userId: MEMBER, nom: 'Diallo', prenom: 'Aïssatou', email: 'a.diallo@example.test', addedAt: '2026-10-01T09:00:00Z' };

beforeEach(() => {
    f.epoch += 1; f.me = platformAdmin(); f.refresh.mockReset();
    f.api.groups.mockReset().mockResolvedValue(page([national, team, archived]));
    f.api.allGroups.mockReset().mockResolvedValue([team, archived, other, national]);
    f.api.groupMembers.mockReset().mockResolvedValue(page([member]));
    f.api.userGroups.mockReset().mockResolvedValue(page([national, team]));
    f.api.allUserGroups.mockReset().mockImplementation(async (...args: unknown[]) => (await f.api.userGroups(...args)).items);
    f.api.command.mockReset().mockResolvedValue({});
});

it('à la création d’un compte, seuls les groupes actifs de l’institution sont proposés, avec le groupe par défaut en premier choix', async () => {
    const onChange = vi.fn();
    render(<GroupChoice institutionId={INSTITUTION} value="" onChange={onChange} />);
    const select = await screen.findByLabelText('Groupe du compte');
    await waitFor(() => expect((select as HTMLSelectElement).disabled).toBe(false));
    expect(f.api.allGroups).toHaveBeenCalledWith(INSTITUTION, expect.anything());
    expect(within(select).getAllByRole('option').map(o => o.textContent)).toEqual(['Groupe par défaut', 'Groupe EQUIPE']);
    fireEvent.change(select, { target: { value: team.id } });
    expect(onChange).toHaveBeenCalledWith(team.id);
});

it('un groupe choisi qui n’est plus proposé (autre institution) laisse la place au groupe par défaut', async () => {
    const onChange = vi.fn();
    render(<GroupChoice institutionId={INSTITUTION} value={other.id} onChange={onChange} />);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(''));
});

it('un compte national n’a pas de groupe à choisir : le groupe national par défaut l’accueille', () => {
    render(<GroupChoice institutionId={null} value="" onChange={vi.fn()} />);
    expect((screen.getByLabelText('Groupe du compte') as HTMLSelectElement).disabled).toBe(true);
    expect(f.api.allGroups).not.toHaveBeenCalled();
});

it('la page liste les groupes par leur nom, leur portée et leur nombre de membres, sans identifiant', async () => {
    render(<GroupsPage />);
    expect(await screen.findByText('Groupe GENERAL')).toBeTruthy();
    const row = screen.getByText('Groupe GENERAL').closest('tr')!;
    expect(within(row).getByText('National')).toBeTruthy();
    expect(within(row).getByText('12')).toBeTruthy();
    expect(row.textContent).toContain('groupe par défaut');
    const teamRow = screen.getByText('Groupe EQUIPE').closest('tr')!;
    expect(within(teamRow).getByText(/Institution aa/)).toBeTruthy();
    expect(document.body.textContent).not.toContain(team.id);
    expect(screen.getByRole('button', { name: 'Créer un groupe' })).toBeTruthy();
});

it('la recherche interroge le serveur sur tout le périmètre, un instant après la frappe', async () => {
    render(<GroupsPage />);
    await screen.findByText('Groupe GENERAL');
    fireEvent.change(screen.getByLabelText('Rechercher un groupe'), { target: { value: ' equipe ' } });
    await waitFor(() => expect(f.api.groups).toHaveBeenLastCalledWith({ page: 0, size: 25, q: 'equipe' }, expect.anything()));
});

it('ouvrir un groupe montre ses membres par leur nom et leur adresse', async () => {
    render(<GroupsPage />);
    const row = (await screen.findByText('Groupe EQUIPE')).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Ouvrir' }));
    expect(await screen.findByText('Aïssatou Diallo')).toBeTruthy();
    expect(screen.getByText('a.diallo@example.test')).toBeTruthy();
    expect(f.api.groupMembers).toHaveBeenCalledWith(team.id, 0, expect.anything());
    expect(document.body.textContent).not.toContain(MEMBER);
});

it('retirer un membre demande un motif, puis envoie la commande de retrait', async () => {
    render(<GroupsPage />);
    fireEvent.click(within((await screen.findByText('Groupe EQUIPE')).closest('tr')!).getByRole('button', { name: 'Ouvrir' }));
    await screen.findByText('Aïssatou Diallo');
    fireEvent.click(screen.getByRole('button', { name: 'Retirer' }));
    fireEvent.change(await screen.findByLabelText(/Motif/), { target: { value: 'Changement d’équipe' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    expect(f.api.command).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole('button', { name: 'Retirer' }).at(-1)!);   // le bouton de confirmation du dialogue, après celui de la ligne
    await waitFor(() => expect(f.api.command).toHaveBeenCalledWith('/groups/' + team.id + '/members/' + MEMBER + '/remove', { reason: 'Changement d’équipe' }, expect.any(String), 'POST'));
});

it('un lecteur voit les groupes sans pouvoir ni en créer, ni en modifier, ni retirer un membre', async () => {
    f.me = reader();
    render(<GroupsPage />);
    fireEvent.click(within((await screen.findByText('Groupe EQUIPE')).closest('tr')!).getByRole('button', { name: 'Ouvrir' }));
    await screen.findByText('Aïssatou Diallo');
    expect(screen.queryByRole('button', { name: 'Créer un groupe' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Modifier' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Archiver' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retirer' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ajouter un membre' })).toBeNull();
});

const account = { id: MEMBER, institutionId: INSTITUTION, departmentId: null, accountType: 'USER' } as never;

it('sur la fiche d’un compte, ses groupes sont listés et le retrait est possible tant qu’il en reste un autre', async () => {
    render(<UserGroupsPanel user={account} />);
    expect(await screen.findByText('Groupe GENERAL')).toBeTruthy();
    expect(f.api.userGroups).toHaveBeenCalledWith(MEMBER, expect.anything());
    const buttons = screen.getAllByRole('button', { name: 'Retirer' });
    expect(buttons).toHaveLength(2);
    expect(buttons.every(b => !(b as HTMLButtonElement).disabled)).toBe(true);
});

it('un compte qui n’a plus qu’un groupe ne peut pas en être retiré', async () => {
    f.api.userGroups.mockResolvedValue(page([national]));
    render(<UserGroupsPanel user={account} />);
    await screen.findByText('Groupe GENERAL');
    const button = screen.getByRole('button', { name: 'Retirer' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toContain('au moins un groupe');
});

it('ajouter un compte à un autre groupe propose les groupes actifs de son institution où il n’est pas déjà', async () => {
    f.api.userGroups.mockResolvedValue(page([national]));
    render(<UserGroupsPanel user={account} />);
    await screen.findByText('Groupe GENERAL');
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter à un groupe' }));
    const select = await screen.findByLabelText(/Groupe \*/);
    await waitFor(() => expect(within(select).getAllByRole('option').length).toBeGreaterThan(1));
    expect(within(select).getAllByRole('option').map(o => o.textContent)).toEqual(['Choisir un groupe', 'Groupe EQUIPE']);
});

it('un compte technique n’a pas de panneau de groupes', () => {
    const { container } = render(<UserGroupsPanel user={{ ...(account as object), accountType: 'SERVICE' } as never} />);
    expect(container.textContent).toBe('');
});

it('la fiche expose les groupes au-delà de la centième ligne et permet le retrait depuis la dernière page', async () => {
    const groups = Array.from({length:101},(_,i) => group('P', INSTITUTION, {id:'cc000000-0000-4000-8000-'+i.toString(16).padStart(12,'0'),nom:'Équipe '+i}));
    f.api.allUserGroups.mockResolvedValue(groups);
    render(<UserGroupsPanel user={account} />);
    await screen.findByText('Équipe 0');
    expect(screen.queryByText('Équipe 100')).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Suivante'}));
    await screen.findByText('Équipe 100');
    expect((screen.getByRole('button',{name:'Retirer'}) as HTMLButtonElement).disabled).toBe(false);
});
