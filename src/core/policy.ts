import type { Me, Grant, ScopeTarget, Change } from './types.js';
export function activeGrant(grant: Grant, now = Date.now()): boolean {
    return grant.expiresAt === null || (Number.isFinite(Date.parse(grant.expiresAt)) && Date.parse(grant.expiresAt) > now);
}
export function covers(grant: Grant, target: ScopeTarget): boolean {
    if (grant.scope === 'NATIONAL')
        return true;
    if (!target.institutionId || grant.institutionId !== target.institutionId)
        return false;
    if (grant.scope === 'INSTITUTION')
        return true;
    // une unité couvre ses sous-unités, jamais ses sœurs : le serveur donne la liste des unités couvertes (sans elle, l'unité nommée seulement)
    return !!target.departmentId && (grant.departmentIds?.length ? grant.departmentIds.includes(target.departmentId) : grant.departmentId === target.departmentId);
}
export function can(me: Me | null, permission: string, target: ScopeTarget = {}, now = Date.now()): boolean {
    return !!me && me.user.status === 'ACTIF' && me.user.accountType === 'USER' && me.grants.some(g => g.permission === permission && activeGrant(g, now) && covers(g, target));
}
export function platform(me: Me | null, now = Date.now()): boolean {
    return !!me && me.user.status === 'ACTIF' && me.user.accountType === 'USER' && me.grants.some(g => g.roleCode === 'SNAE_PLATFORM_ADMIN' && g.scope === 'NATIONAL' && g.delegationId === null && activeGrant(g, now));
}
export function canResolve(me: Me | null, change: Change, operation: 'approve' | 'reject' | 'cancel', now = Date.now()): boolean {
    if (!platform(me, now) || change.status !== 'PENDING')
        return false;
    if (operation === 'cancel')
        return change.requestedBy === me?.user.id;
    if (change.requestedBy === me?.user.id)
        return false;
    return operation === 'reject' || Date.parse(change.expiresAt) > now;
}
export function subjectTarget(me: Me): ScopeTarget { return { institutionId: me.user.institutionId, departmentId: me.user.departmentId }; }
export function safeReturnPath(raw: unknown): string {
    if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || /[\\\r\n]/.test(raw))
        return '/app';
    return (raw === '/app' || raw.startsWith('/app/') || raw.startsWith('/app?')) && !raw.includes('://') && !/%(?:2f|5c|0d|0a)/i.test(raw) ? raw : '/app';
}
export function normalizePermissions(values: string[]): string[] { return [...new Set(values)].sort(); }
