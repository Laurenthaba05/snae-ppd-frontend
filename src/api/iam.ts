import type { Transport, RequestOptions } from '../core/http.js';
import { query } from '../core/http.js';
import { parseMe, parsePage } from '../core/contracts.js';
import { uuid } from '../core/validation.js';
import type { PermissionAttribution } from '../core/permissionGroups.js';
import { parseMemberPage } from '../core/userGroups.js';
import type { UserGroup, GroupMember } from '../core/userGroups.js';
import type { Me, Page, Catalog, RecordEntity, RolePermissions, Permission, Assignment, Delegation, Change, Impact, Summary, DepartmentImpact } from '../core/types.js';
export class IamApi {
    constructor(readonly transport: Transport) { }
    async me(signal?: AbortSignal): Promise<Me> { return parseMe(await this.transport.request('/iam/me', { signal })); }
    async list<T extends RecordEntity>(catalog: Catalog, params: Record<string, string | number | null | undefined>, signal?: AbortSignal): Promise<Page<T>> { return parsePage<T>(await this.transport.request('/iam/' + catalog + query(params), { signal })); }
    userOverview(params: Record<string, string | number | null | undefined>, signal?: AbortSignal): Promise<import('../core/types').UserOverview> {
        return this.transport.request('/iam/users/overview' + query(params), { signal });
    }
    get<T>(catalog: Catalog, id: string, signal?: AbortSignal): Promise<T> { return this.transport.request('/iam/' + catalog + '/' + uuid(id), { signal }); }
    async permissions(page = 0, signal?: AbortSignal, search = ''): Promise<Page<Permission>> { return parsePage<Permission>(await this.transport.request('/iam/permissions' + query({ page, size: 100, ...(search.trim()?{q:search.trim()}:{}) }), { signal })); }
    /** Le catalogue des permissions avec, pour chacune, les rôles qui la détiennent (lecture seule, 100 par page) ; `search` filtre comme `permissions`. */
    async permissionAttributions(page = 0, signal?: AbortSignal, search = ''): Promise<Page<PermissionAttribution>> { return parsePage<PermissionAttribution>(await this.transport.request('/iam/permissions/attributions' + query({ page, size: 100, ...(search.trim() ? { q: search.trim() } : {}) }), { signal })); }
    /** Toutes les pages du catalogue avec leurs attributions (jamais un tableau sans borne : au-delà de 1 000 permissions, une erreur explicite). */
    async allPermissionAttributions(signal?: AbortSignal, search = ''): Promise<PermissionAttribution[]> {
        const all: PermissionAttribution[] = [];
        for (let page = 0; page < 10; page++) {
            const result = await this.permissionAttributions(page, signal, search);
            all.push(...result.items);
            if (!result.hasMore) return all;
        }
        throw new Error('Catalogue supérieur à 1 000 permissions : chargement incomplet.');
    }
    /** Les groupes d'utilisateurs visibles du compte ; `institutionId` restreint aux groupes de cette institution, `search` filtre par nom ou code. */
    async groups(params: { institutionId?: string | null; page?: number; size?: number; q?: string }, signal?: AbortSignal): Promise<Page<UserGroup>> { return parsePage<UserGroup>(await this.transport.request('/iam/groups' + query({ page: 0, size: 25, ...params }), { signal })); }
    /** Selectors load complete collections; large collections fail explicitly, never silently truncate. */
    private async groupPages(fetchPage: (page: number) => Promise<Page<UserGroup>>): Promise<UserGroup[]> {
        const all: UserGroup[] = [], seen = new Set<string>();
        for (let page = 0; page < 50; page++) {
            const result = await fetchPage(page);
            if (result.page !== page || (result.hasMore && result.items.length === 0)) throw new Error('Pagination des groupes incohérente.');
            for (const item of result.items) {
                if (seen.has(item.id)) throw new Error('Pagination des groupes incohérente.');
                seen.add(item.id); all.push(item);
            }
            if (!result.hasMore) return all;
        }
        throw new Error('Plus de 5 000 groupes : affinez le périmètre.');
    }
    allGroups(institutionId: string | null | undefined, signal?: AbortSignal): Promise<UserGroup[]> {
        return this.groupPages(page => this.groups({ institutionId, page, size: 100 }, signal));
    }
    allUserGroups(id: string, signal?: AbortSignal): Promise<UserGroup[]> {
        return this.groupPages(page => this.userGroups(id, signal, page));
    }
    async groupMembers(id: string, page = 0, signal?: AbortSignal): Promise<Page<GroupMember>> { return parseMemberPage(await this.transport.request(`/iam/groups/${uuid(id)}/members` + query({ page, size: 20 }), { signal })); }
    async userGroups(id: string, signal?: AbortSignal, page = 0): Promise<Page<UserGroup>> { return parsePage<UserGroup>(await this.transport.request(`/iam/users/${uuid(id)}/groups` + query({ page, size: 100 }), { signal })); }
    rolePermissions(id: string, signal?: AbortSignal): Promise<RolePermissions> { return this.transport.request(`/iam/roles/${uuid(id)}/permissions`, { signal }); }
    impact(id: string, signal?: AbortSignal): Promise<Impact> { return this.transport.request(`/iam/roles/${uuid(id)}/impact`, { signal }); }
    summary(id: string, signal?: AbortSignal): Promise<Summary> { return this.transport.request(`/iam/users/${uuid(id)}/access-summary`, { signal }); }
    departmentImpact(id: string, signal?: AbortSignal): Promise<DepartmentImpact> { return this.transport.request(`/iam/departments/${uuid(id)}/impact`, { signal }); }
    async assignments(id: string, page = 0, signal?: AbortSignal): Promise<Page<Assignment>> { return parsePage<Assignment>(await this.transport.request(`/iam/users/${uuid(id)}/role-assignments` + query({ page, size: 20 }), { signal })); }
    async delegations(id: string, page = 0, signal?: AbortSignal): Promise<Page<Delegation>> { return parsePage<Delegation>(await this.transport.request(`/iam/users/${uuid(id)}/delegations` + query({ page, size: 20 }), { signal })); }
    async changes(roleId: string, page = 0, signal?: AbortSignal): Promise<Page<Change>> { return parsePage<Change>(await this.transport.request(`/iam/roles/${uuid(roleId)}/permission-changes` + query({ page, size: 20 }), { signal })); }
    change(id: string, signal?: AbortSignal): Promise<Change> { return this.transport.request(`/iam/permission-changes/${uuid(id)}`, { signal }); }
    command<T>(path: string, body: unknown, key: string, method: 'POST' | 'PUT' = 'POST'): Promise<T> { return this.transport.request('/iam' + path, { method, body, idempotencyKey: key }); }
    request<T>(path: string, options?: RequestOptions): Promise<T> { return this.transport.request('/iam' + path, options); }
}
