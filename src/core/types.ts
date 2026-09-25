export type Scope = 'NATIONAL' | 'INSTITUTION' | 'DEPARTEMENT';
export type Status = 'ACTIF' | 'INACTIF' | 'SUSPENDU' | 'ARCHIVE';
export interface Page<T> {
    items: T[];
    page: number;
    size: number;
    hasMore: boolean;
}
export interface Institution {
    id: string;
    code: string;
    nom: string;
    sigle: string | null;
    typeInstitution: string;
    status: string;
    version: number;
    createdAt: string;
    updatedAt: string;
}
export interface Department {
    id: string;
    institutionId: string;
    parentId: string | null;
    code: string;
    nom: string;
    typeUnite: string | null;
    status: string;
    version: number;
}
export interface User {
    id: string;
    institutionId: string | null;
    departmentId: string | null;
    ssoId: string | null;
    nom: string | null;
    prenom: string | null;
    email: string | null;
    accountType: 'USER' | 'SERVICE';
    scope: Scope | 'SERVICE';
    status: Status;
    authNotBefore: string | null;
    version: number;
}
export interface Role {
    id: string;
    code: string;
    nom: string;
    description: string | null;
    scope: Scope;
    status: Status;
    version: number;
}
export interface Permission {
    id: string;
    code: string;
    description: string | null;
    domain: string;
}
export interface Grant {
    roleId: string;
    roleCode: string;
    permission: string;
    scope: Scope;
    institutionId: string | null;
    departmentId: string | null;
    expiresAt: string | null;
    delegationId: string | null;
}
export interface Me {
    user: User;
    grants: Grant[];
    truncated: boolean;
}
export interface Assignment {
    id: string;
    userId: string;
    roleId: string;
    scope: Scope;
    institutionId: string | null;
    departmentId: string | null;
    startsAt: string;
    endsAt: string | null;
    status: 'ACTIF' | 'REVOQUE' | 'EXPIRE';
    revokedAt: string | null;
    version: number;
}
export interface Delegation {
    id: string;
    sourceAssignmentId: string | null;
    delegantId: string;
    delegataireId: string;
    roleId: string | null;
    scope: Scope;
    institutionId: string | null;
    departmentId: string | null;
    startsAt: string;
    endsAt: string;
    status: 'ACTIF' | 'REVOQUE' | 'EXPIRE';
    revokedAt: string | null;
    version: number;
    sourcePermissionRevision: number | null;
}
export interface RolePermissions {
    role: Role;
    permissions: Permission[];
}
export interface Change {
    id: string;
    roleId: string;
    expectedRoleVersion: number;
    previousPermissionIds: string[];
    requestedPermissionIds: string[];
    requestedBy: string;
    requestedAt: string;
    expiresAt: string;
    reason: string;
    status: 'PENDING' | 'APPLIED' | 'REJECTED' | 'CANCELLED';
    version: number;
    resolvedBy: string | null;
    resolvedAt: string | null;
    resolutionReason: string | null;
    resultingRoleVersion: number | null;
    requestHash: string;
}
export interface Impact {
    roleId: string;
    roleVersion: number;
    permissionRevision: number;
    currentOrFutureAssignments: number;
    currentOrFutureDelegations: number;
    distinctAssignedUsers: number;
    pendingChanges: number;
    approvalRequired: boolean;
    observedAt: string;
}
export interface Summary {
    user: User;
    effectiveAccountActive: boolean;
    effectiveDirectGrants: number;
    effectiveDelegatedGrants: number;
    scheduledAssignments: number;
    distinctPermissions: number;
    delegationsWithChangedRole: number;
    observedAt: string;
}
export interface DepartmentImpact {
    departmentId: string;
    version: number;
    descendantDepartments: number;
    attachedAccounts: number;
    currentlyEffectiveAccounts: number;
    currentOrFutureAssignments: number;
    observedAt: string;
}
export interface ScopeTarget {
    institutionId?: string | null;
    departmentId?: string | null;
}
export type RecordEntity = Institution | Department | User | Role;
export type Catalog = 'institutions' | 'departments' | 'users' | 'roles';
export type Json = null | boolean | number | string | Json[] | {
    [key: string]: Json;
};
