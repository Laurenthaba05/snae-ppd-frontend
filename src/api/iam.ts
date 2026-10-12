import type { Transport, RequestOptions } from '../core/http.js';
import { query } from '../core/http.js';
import { parseMe, parsePage } from '../core/contracts.js';
import { uuid } from '../core/validation.js';
import type { Me, Page, Catalog, RecordEntity, RolePermissions, Permission, Assignment, Delegation, Change, Impact, Summary, DepartmentImpact } from '../core/types.js';
export class IamApi {
    constructor(readonly transport: Transport) { }
    async me(signal?: AbortSignal): Promise<Me> { return parseMe(await this.transport.request('/iam/me', { signal })); }
    async list<T extends RecordEntity>(catalog: Catalog, params: Record<string, string | number | null | undefined>, signal?: AbortSignal): Promise<Page<T>> { return parsePage<T>(await this.transport.request('/iam/' + catalog + query(params), { signal })); }
    get<T>(catalog: Catalog, id: string, signal?: AbortSignal): Promise<T> { return this.transport.request('/iam/' + catalog + '/' + uuid(id), { signal }); }
    async permissions(page = 0, signal?: AbortSignal): Promise<Page<Permission>> { return parsePage<Permission>(await this.transport.request('/iam/permissions' + query({ page, size: 100 }), { signal })); }
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
