import type { Me, Page } from './types.js';
import { UUID_RE } from './validation.js';
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const nullableId = (x: unknown) => x === null || (typeof x === 'string' && UUID_RE.test(x));
export function parseMe(data: unknown): Me {
    if (!record(data) || !record(data.user) || !Array.isArray(data.grants) || typeof data.truncated !== 'boolean')
        throw new Error('Contrat /iam/me invalide.');
    const u = data.user;
    if (typeof u.id !== 'string' || !UUID_RE.test(u.id) || !['ACTIF', 'INACTIF', 'SUSPENDU', 'ARCHIVE'].includes(String(u.status)) || !['USER', 'SERVICE'].includes(String(u.accountType)) || !['NATIONAL', 'INSTITUTION', 'DEPARTEMENT', 'SERVICE'].includes(String(u.scope)) || !nullableId(u.institutionId) || !nullableId(u.departmentId))
        throw new Error('Identité serveur invalide.');
    for (const g of data.grants)
        if (!record(g) || typeof g.permission !== 'string' || typeof g.roleCode !== 'string' || typeof g.roleId !== 'string' || !UUID_RE.test(g.roleId) || !['NATIONAL', 'INSTITUTION', 'DEPARTEMENT'].includes(String(g.scope)) || !nullableId(g.institutionId) || !nullableId(g.departmentId) || !nullableId(g.delegationId) || !(g.expiresAt === null || (typeof g.expiresAt === 'string' && Number.isFinite(Date.parse(g.expiresAt)))))
            throw new Error('Droits serveur invalides.');
    return data as unknown as Me;
}
export function parsePage<T>(data: unknown): Page<T> {
    if (!record(data) || !Array.isArray(data.items) || !Number.isSafeInteger(data.page) || Number(data.page) < 0 || !Number.isSafeInteger(data.size) || Number(data.size) < 1 || Number(data.size) > 100 || typeof data.hasMore !== 'boolean')
        throw new Error('Page API invalide.');
    for (const x of data.items)
        if (!record(x) || typeof x.id !== 'string' || !UUID_RE.test(x.id))
            throw new Error('Identifiant de ressource invalide.');
    return data as unknown as Page<T>;
}
