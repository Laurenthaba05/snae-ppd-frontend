import { ApiError, type RequestOptions, type Transport } from '../core/http';
import { canonical } from '../core/validation';
import { normalizePermissions } from '../core/policy';
import type { UserGroup } from '../core/userGroups';
import type { Me, Institution, Department, User, Role, Permission, Assignment, Change, Delegation } from '../core/types';
export const DEMO_IDS = { a: '10000000-0000-4000-8000-000000000001', b: '10000000-0000-4000-8000-000000000002', agent: '10000000-0000-4000-8000-000000000003', institution: '20000000-0000-4000-8000-000000000001', department: '30000000-0000-4000-8000-000000000001', role: '40000000-0000-4000-8000-000000000002' };
const stamp = () => new Date().toISOString();
const permissionCodes = ['IAM_INSTITUTION_READ', 'IAM_INSTITUTION_MANAGE', 'IAM_DEPARTMENT_READ', 'IAM_DEPARTMENT_MANAGE', 'IAM_USER_READ', 'IAM_USER_MANAGE', 'IAM_ROLE_READ', 'IAM_ROLE_MANAGE', 'IAM_ASSIGNMENT_MANAGE', 'IAM_DELEGATION_MANAGE', 'DOCUMENT_CREATE', 'DOCUMENT_READ', 'DOSSIER_CREATE', 'DOCUMENT_METADATA_READ'];
export class DemoTransport implements Transport {
    persona: 'a' | 'b' | 'agent' = 'a';
    /** Les membres d'un groupe ; le groupe national par défaut accueille d'office, au premier accès, tous les comptes humains déjà présents. */
    private membersOf(g: UserGroup): string[] {
        return (this.groupMembers[g.id] ??= g.defaultGroup && !g.institutionId ? this.users.filter(u => u.accountType === 'USER').map(u => u.id) : []);
    }
    private directory(url: URL): User[] {
        const p=url.searchParams, inst=p.get('institutionId'), dep=p.get('departmentId');
        if(this.persona==='agent' && (inst!==DEMO_IDS.institution || (dep && dep!==DEMO_IDS.department)))
            throw new ApiError(403,'ACCESS_DENIED','Choisissez le périmètre autorisé.');
        const q=p.get('q')?.trim().toLowerCase();
        return this.users.filter(u => (!inst||u.institutionId===inst) && (!dep||u.departmentId===dep)
            && (this.persona!=='agent'||u.scope==='DEPARTEMENT')
            && (!q||[u.prenom,u.nom,u.email,u.ssoId,u.scope].filter(Boolean).join(' ').toLowerCase().includes(q))
            && (!p.get('status')||u.status===p.get('status')) && (!p.get('excludeId')||u.id!==p.get('excludeId'))
            && (!p.get('accountType')||u.accountType===p.get('accountType')) && (!p.get('accountScope')||u.scope===p.get('accountScope'))
            && (!p.get('completeness') || (p.get('completeness')==='MISSING_EMAIL'&&!u.email?.trim())
                || (p.get('completeness')==='MISSING_SSO'&&!u.ssoId?.trim()) || (p.get('completeness')==='MISSING_NAME'&&!u.nom?.trim())));
    }
    permissions: Permission[] = permissionCodes.map((code, i) => ({ id: `50000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, code, description: code.startsWith('IAM') ? 'Administration du périmètre autorisé.' : 'Opération documentaire contrôlée.', domain: code.startsWith('IAM') ? 'IDENTITY' : 'DOCUMENT' }));
    institutions: Institution[] = [{ id: DEMO_IDS.institution, code: 'MIN_DEMO_A', nom: 'Ministère de démonstration A', sigle: 'MDA', typeInstitution: 'MINISTERE', status: 'ACTIF', version: 0, createdAt: stamp(), updatedAt: stamp() }, { id: '20000000-0000-4000-8000-000000000002', code: 'ARCHIVES_DEMO', nom: 'Service des archives de démonstration', sigle: 'SAD', typeInstitution: 'DIRECTION_GENERALE', status: 'ACTIF', version: 0, createdAt: stamp(), updatedAt: stamp() }, { id: '20000000-0000-4000-8000-000000000003', code: 'INST_DEMO_C', nom: 'Institution de démonstration C', sigle: 'IDC', typeInstitution: 'ETABLISSEMENT_PUBLIC', status: 'SUSPENDU', version: 1, createdAt: stamp(), updatedAt: stamp() }];
    departments: Department[] = [{ id: DEMO_IDS.department, institutionId: DEMO_IDS.institution, parentId: null, code: 'DIRECTION_ARCHIVES', nom: 'Direction des archives et de la documentation', typeUnite: 'DIRECTION', status: 'ACTIF', version: 0 }, { id: '30000000-0000-4000-8000-000000000002', institutionId: DEMO_IDS.institution, parentId: DEMO_IDS.department, code: 'SERVICE_NUM', nom: 'Service de numérisation', typeUnite: 'SERVICE', status: 'ACTIF', version: 0 }];
    users: User[] = [{ id: DEMO_IDS.a, institutionId: null, departmentId: null, ssoId: 'demo-admin-a', nom: 'Administrateur A', prenom: null, email: 'admin-a@example.test', accountType: 'USER', scope: 'NATIONAL', status: 'ACTIF', authNotBefore: null, version: 0 }, { id: DEMO_IDS.b, institutionId: null, departmentId: null, ssoId: 'demo-admin-b', nom: 'Administrateur B', prenom: null, email: 'admin-b@example.test', accountType: 'USER', scope: 'NATIONAL', status: 'ACTIF', authNotBefore: null, version: 0 }, { id: DEMO_IDS.agent, institutionId: DEMO_IDS.institution, departmentId: DEMO_IDS.department, ssoId: 'demo-agent', nom: 'Agent de recette', prenom: null, email: 'agent@example.test', accountType: 'USER', scope: 'DEPARTEMENT', status: 'ACTIF', authNotBefore: null, version: 0 }];
    roles: Role[] = [{ id: '40000000-0000-4000-8000-000000000001', code: 'SNAE_PLATFORM_ADMIN', nom: 'Administration centrale', description: 'Rôle réservé. Non modifiable.', scope: 'NATIONAL', status: 'ACTIF', version: 0 }, { id: DEMO_IDS.role, code: 'ARCHIVISTE_DEMO', nom: 'Archiviste de démonstration', description: 'Préparation des dossiers dans l’institution de recette.', scope: 'INSTITUTION', status: 'ACTIF', version: 0 }, { id: '40000000-0000-4000-8000-000000000003', code: 'LECTEUR_DEMO', nom: 'Consultation documentaire', description: 'Lecture contrôlée des documents.', scope: 'DEPARTEMENT', status: 'ACTIF', version: 0 }];
    rolePermissionIds: Record<string, string[]> = {};
    assignments: Assignment[] = [];
    delegations: Delegation[] = [];
    changes: Change[] = [];
    /** Groupes d'utilisateurs de la démonstration : un groupe national par défaut où entrent d'office tous les comptes humains, plus ceux qu'on crée. */
    groups: UserGroup[] = [{ id: '60000000-0000-4000-8000-000000000001', institutionId: null, code: 'GENERAL', nom: 'Groupe général', description: 'Groupe où entre tout compte créé sans autre choix. Il n’accorde aucun droit.', defaultGroup: true, status: 'ACTIF', version: 0, memberCount: 0 }];
    groupMembers: Record<string, string[]> = {};
    receipts = new Map<string, {
        body: string;
        response: unknown;
    }>();
    constructor() { this.rolePermissionIds[this.roles[0]!.id] = this.permissions.filter(p => p.code.startsWith('IAM')).map(p => p.id); this.rolePermissionIds[DEMO_IDS.role] = this.permissions.filter(p => ['DOCUMENT_CREATE', 'DOCUMENT_READ'].includes(p.code)).map(p => p.id); this.assignments = [{ id: '60000000-0000-4000-8000-000000000001', userId: DEMO_IDS.agent, roleId: DEMO_IDS.role, scope: 'INSTITUTION', institutionId: DEMO_IDS.institution, departmentId: null, startsAt: stamp(), endsAt: null, status: 'ACTIF', revokedAt: null, version: 0 }]; }
    me(): Me { const user = this.users.find(u => u.id === DEMO_IDS[this.persona])!; const central = this.persona !== 'agent'; return { user, grants: this.permissions.filter(p => central ? p.code.startsWith('IAM') : ['IAM_INSTITUTION_READ', 'IAM_DEPARTMENT_READ', 'IAM_USER_READ', 'IAM_ROLE_READ', 'DOCUMENT_READ'].includes(p.code)).map(p => ({ roleId: central ? this.roles[0]!.id : this.roles[2]!.id, roleCode: central ? 'SNAE_PLATFORM_ADMIN' : 'LECTEUR_DEMO', permission: p.code, scope: central ? 'NATIONAL' : 'DEPARTEMENT', institutionId: central ? null : DEMO_IDS.institution, departmentId: central ? null : DEMO_IDS.department, expiresAt: null, delegationId: null })), truncated: false }; }
    async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
        await new Promise(r => setTimeout(r, 80));
        if (options.signal?.aborted)
            throw new DOMException('Aborted', 'AbortError');
        const method = options.method ?? 'GET';
        const url = new URL(path, 'https://demo.invalid');
        const parts = url.pathname.split('/').filter(Boolean).slice(1);
        const [kind, id, action] = parts;
        const body = (options.body ?? {}) as Record<string, any>;
        const fail = (status: number, code: string, msg: string): never => { throw new ApiError(status, code, msg, crypto.randomUUID()); };
        const recKey = this.persona + ':' + method + ':' + url.pathname + ':' + options.idempotencyKey;
        if (method !== 'GET') {
            if (this.persona === 'agent')
                fail(403, 'ACCESS_DENIED', 'Démonstration : cet agent ne dispose pas de droits de modification.');
            if (!options.idempotencyKey)
                fail(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Clé requise.');
            const rec = this.receipts.get(recKey);
            if (rec) {
                if (rec.body !== canonical(body))
                    fail(409, 'IDEMPOTENCY_PAYLOAD_MISMATCH', 'La clé a déjà été utilisée avec un contenu différent.');
                return structuredClone(rec.response) as T;
            }
        }
        const page = (values: any[]) => { const p = Number(url.searchParams.get('page') ?? 0), s = Number(url.searchParams.get('size') ?? 20); return { items: values.slice(p * s, (p + 1) * s), page: p, size: s, hasMore: values.length > (p + 1) * s }; };
        const collection = ({ institutions: this.institutions, departments: this.departments, users: this.users, roles: this.roles, permissions: this.permissions, 'role-assignments': this.assignments, delegations: this.delegations, 'permission-changes': this.changes } as Record<string, any[]>)[kind ?? ''];
        let result: any;
        if (kind === 'me') {
            result = this.me();
        }
        else if (kind === 'users' && action === 'role-assignments') {
            result = page(this.assignments.filter(a => a.userId === id));
        }
        else if (kind === 'users' && action === 'delegations') {
            result = page(this.delegations.filter(d => d.delegantId === id || d.delegataireId === id));
        }
        else if (kind === 'users' && action === 'access-summary') {
            result = { user: this.users.find(u => u.id === id), effectiveAccountActive: true, effectiveDirectGrants: this.assignments.filter(a => a.userId === id && a.status === 'ACTIF').length, effectiveDelegatedGrants: 0, scheduledAssignments: 0, distinctPermissions: 2, delegationsWithChangedRole: 0, observedAt: stamp() };
        }
        else if (kind === 'departments' && action === 'impact') {
            result = { departmentId: id, version: this.departments.find(d => d.id === id)?.version ?? 0, descendantDepartments: this.departments.filter(d => d.parentId === id).length, attachedAccounts: this.users.filter(u => u.departmentId === id).length, currentlyEffectiveAccounts: 1, currentOrFutureAssignments: 0, observedAt: stamp() };
        }
        else if (kind === 'roles' && action === 'impact') {
            result = { roleId: id, roleVersion: this.roles.find(r => r.id === id)?.version, permissionRevision: 1, currentOrFutureAssignments: this.assignments.filter(a => a.roleId === id && a.status === 'ACTIF').length, currentOrFutureDelegations: 0, distinctAssignedUsers: 1, pendingChanges: this.changes.filter(c => c.roleId === id && c.status === 'PENDING').length, approvalRequired: this.assignments.some(a => a.roleId === id && a.status === 'ACTIF'), observedAt: stamp() };
        }
        else if (kind === 'roles' && action === 'permissions') {
            const role = this.roles.find(r => r.id === id);
            if (!role)
                fail(404, 'NOT_FOUND', 'Rôle introuvable.');
            if (method === 'PUT') {
                if (role!.code === 'SNAE_PLATFORM_ADMIN')
                    fail(422, 'IAM_RESERVED_ROLE', 'Rôle réservé.');
                if (this.assignments.some(a => a.roleId === id && a.status === 'ACTIF'))
                    fail(409, 'IAM_PERMISSION_APPROVAL_REQUIRED', 'Ce rôle est attribué : une proposition indépendante est nécessaire.');
                if (body.expectedVersion !== role!.version)
                    fail(409, 'IAM_STALE_VERSION', 'Le rôle a changé.');
                this.rolePermissionIds[id!] = body.permissionIds;
                role!.version++;
            }
            result = { role, permissions: this.permissions.filter(p => this.rolePermissionIds[id!]?.includes(p.id)) };
        }
        else if (kind === 'roles' && action === 'permission-changes') {
            if (method === 'GET')
                result = page(this.changes.filter(c => c.roleId === id));
            else {
                const role = this.roles.find(r => r.id === id);
                if (!role)
                    fail(404, 'NOT_FOUND', 'Rôle introuvable.');
                if (body.expectedRoleVersion !== role!.version)
                    fail(409, 'IAM_STALE_VERSION', 'Le rôle a changé.');
                result = { id: crypto.randomUUID(), roleId: id, expectedRoleVersion: role!.version, previousPermissionIds: this.rolePermissionIds[id!] ?? [], requestedPermissionIds: normalizePermissions(body.permissionIds), requestedBy: DEMO_IDS[this.persona], requestedAt: stamp(), expiresAt: new Date(Date.now() + 86400000).toISOString(), reason: body.reason, status: 'PENDING', version: 0, resolvedBy: null, resolvedAt: null, resolutionReason: null, resultingRoleVersion: null, requestHash: 'empreinte-de-demonstration' };
                this.changes.push(result);
            }
        }
        else if (kind === 'permission-changes' && action) {
            const c = this.changes.find(x => x.id === id);
            if (!c)
                fail(404, 'NOT_FOUND', 'Demande introuvable.');
            if (c!.status !== 'PENDING' || c!.version !== body.expectedVersion)
                fail(409, 'IAM_STALE_VERSION', 'La demande a changé.');
            if (action === 'cancel' ? c!.requestedBy !== DEMO_IDS[this.persona] : c!.requestedBy === DEMO_IDS[this.persona])
                fail(422, 'IAM_SECOND_APPROVER_REQUIRED', 'Une autre personne habilitée doit intervenir.');
            if (action === 'approve' && Date.parse(c!.expiresAt) <= Date.now())
                fail(422, 'IAM_CHANGE_EXPIRED', 'Demande expirée.');
            if (action === 'approve' && this.roles.find(r => r.id === c!.roleId)?.version !== c!.expectedRoleVersion)
                fail(409, 'IAM_STALE_VERSION', 'Version de rôle périmée.');
            c!.status = action === 'approve' ? 'APPLIED' : action === 'reject' ? 'REJECTED' : 'CANCELLED';
            c!.resolvedBy = DEMO_IDS[this.persona];
            c!.resolvedAt = stamp();
            c!.resolutionReason = body.reason;
            c!.version++;
            if (action === 'approve') {
                const r = this.roles.find(r => r.id === c!.roleId)!;
                if (r.version !== c!.expectedRoleVersion)
                    fail(409, 'IAM_STALE_VERSION', 'Version de rôle périmée.');
                this.rolePermissionIds[r.id] = c!.requestedPermissionIds;
                r.version++;
                c!.resultingRoleVersion = r.version;
            }
            result = c;
        }
        else if (kind === 'permissions' && id === 'attributions') {
            // le catalogue avec les rôles qui détiennent chaque permission
            const text = (url.searchParams.get('q') ?? '').trim().toLowerCase();
            result = page(this.permissions.filter(p => !text || (p.code + ' ' + p.domain + ' ' + (p.description ?? '')).toLowerCase().includes(text))
                .map(p => ({ ...p, roles: this.roles.filter(r => this.rolePermissionIds[r.id]?.includes(p.id)).map(r => ({ id: r.id, code: r.code, name: r.nom, scope: r.scope, status: r.status })) })));
        }
        else if (kind === 'groups' || (kind === 'users' && action === 'groups')) {
            // les groupes d'utilisateurs : le groupe national par défaut accueille d'office tous les comptes humains ; un compte n'est jamais laissé sans groupe
            const members = (g: UserGroup) => this.membersOf(g);
            const view = (g: UserGroup) => ({ ...g, memberCount: members(g).length });
            const text = (url.searchParams.get('q') ?? '').trim().toLowerCase();
            if (kind === 'users')
                result = page(this.groups.filter(g => members(g).includes(id!)).map(view));
            else if (!id && method === 'GET')
                result = page(this.groups.filter(g => !text || (g.nom + ' ' + g.code).toLowerCase().includes(text)).map(view));
            else if (!id) {
                const code = String(body.code ?? '').trim().toUpperCase(), institutionId = body.institutionId ?? null;
                if (this.groups.some(g => g.institutionId === institutionId && g.code === code))
                    fail(409, 'IAM_CODE_EXISTS', 'Ce code existe déjà.');
                if (body.defaultGroup)
                    this.groups.filter(g => g.institutionId === institutionId).forEach(g => { g.defaultGroup = false; g.version++; });
                const created: UserGroup = { id: crypto.randomUUID(), institutionId, code, nom: String(body.nom), description: body.description ?? null, defaultGroup: !!body.defaultGroup, status: 'ACTIF', version: 0, memberCount: 0 };
                this.groups.push(created);
                result = view(created);
            }
            else {
                const g = this.groups.find(x => x.id === id);
                if (!g)
                    fail(404, 'IAM_GROUP_NOT_FOUND', 'Ressource introuvable.');
                const found = g!;
                if (action === 'members' && method === 'GET')
                    result = page(members(found).map(uid => this.users.find(u => u.id === uid)!).filter(Boolean).map(u => ({ userId: u.id, nom: u.nom, prenom: u.prenom, email: u.email, addedAt: stamp() })));
                else if (action === 'members' && !parts[3]) {
                    const user = this.users.find(u => u.id === body.utilisateurId);
                    if (!user)
                        fail(404, 'IAM_USER_NOT_FOUND', 'Ressource introuvable.');
                    if (found.institutionId && user!.institutionId !== found.institutionId)
                        fail(422, 'IAM_GROUP_MEMBER_OUTSIDE_INSTITUTION', 'Ce groupe n’accueille que les comptes de son institution.');
                    if (members(found).includes(user!.id))
                        fail(409, 'IAM_GROUP_MEMBER_EXISTS', 'Ce compte est déjà dans ce groupe.');
                    members(found).push(user!.id);
                    result = { userId: user!.id, nom: user!.nom, prenom: user!.prenom, email: user!.email, addedAt: stamp() };
                }
                else if (action === 'members' && parts[4] === 'remove') {
                    const user = this.users.find(u => u.id === parts[3]);
                    if (!user || !members(found).includes(user.id))
                        fail(404, 'IAM_GROUP_MEMBER_NOT_FOUND', 'Ce compte n’est pas dans ce groupe.');
                    if (this.groups.filter(x => x.id !== found.id && members(x).includes(user!.id)).length === 0)
                        fail(422, 'IAM_GROUP_LAST_MEMBERSHIP', 'Un compte appartient toujours à au moins un groupe : ajoutez-le d’abord à un autre groupe.');
                    this.groupMembers[found.id] = members(found).filter(uid => uid !== user!.id);
                    result = { userId: user!.id, nom: user!.nom, prenom: user!.prenom, email: user!.email, addedAt: stamp() };
                }
                else if (action === 'archive') {
                    if (body.expectedVersion !== found.version)
                        fail(409, 'IAM_STALE_VERSION', 'Le groupe a changé.');
                    if (found.defaultGroup)
                        fail(422, 'IAM_GROUP_DEFAULT_REQUIRED', 'Le groupe par défaut ne peut pas être archivé : désignez-en un autre d’abord.');
                    if (members(found).length)
                        fail(422, 'IAM_GROUP_NOT_EMPTY', 'Ce groupe a encore des membres : déplacez-les avant de l’archiver.');
                    found.status = 'ARCHIVE';
                    found.version++;
                    result = view(found);
                }
                else if (method === 'PUT') {
                    if (body.expectedVersion !== found.version)
                        fail(409, 'IAM_STALE_VERSION', 'Le groupe a changé.');
                    if (!body.defaultGroup && found.defaultGroup && !found.institutionId)
                        fail(422, 'IAM_GROUP_DEFAULT_REQUIRED', 'Le groupe national par défaut ne peut pas être retiré : désignez-en un autre à sa place.');
                    if (body.defaultGroup && !found.defaultGroup)
                        this.groups.filter(g => g.institutionId === found.institutionId).forEach(g => { g.defaultGroup = false; g.version++; });
                    Object.assign(found, { nom: String(body.nom), description: body.description ?? null, defaultGroup: !!body.defaultGroup, version: found.version + 1 });
                    result = view(found);
                }
                else
                    result = view(found);
            }
        }
        else if (kind==='users' && id==='overview' && method==='GET') {
            const rows=this.directory(url);
            result={total:rows.length,active:rows.filter(u=>u.status==='ACTIF').length,inactive:rows.filter(u=>u.status==='INACTIF').length,
                suspended:rows.filter(u=>u.status==='SUSPENDU').length,archived:rows.filter(u=>u.status==='ARCHIVE').length,
                human:rows.filter(u=>u.accountType==='USER').length,service:rows.filter(u=>u.accountType==='SERVICE').length,
                missingEmail:rows.filter(u=>!u.email?.trim()).length,missingSso:rows.filter(u=>!u.ssoId?.trim()).length,missingName:rows.filter(u=>!u.nom?.trim()).length};
        }
        else if (collection) {
            if (method === 'GET') {
                if (id) {
                    result = collection.find(x => x.id === id);
                    if (!result)
                        fail(404, 'NOT_FOUND', 'Ressource introuvable.');
                }
                else {
                    let items = kind==='users' ? this.directory(url) : collection;
                    const inst = url.searchParams.get('institutionId'), dep = url.searchParams.get('departmentId');
                    if (inst)
                        items = items.filter(x => kind === 'institutions' ? x.id === inst : x.institutionId === inst);
                    if (dep)
                        items = items.filter(x => kind === 'departments' ? x.id === dep : x.departmentId === dep);
                    if (this.persona === 'agent' && ['institutions', 'departments', 'users'].includes(kind!) && !inst)
                        fail(403, 'ACCESS_DENIED', 'Choisissez le périmètre autorisé.');
                    const search=url.searchParams.get('q')?.trim().toLowerCase(), status=url.searchParams.get('status'), excluded=url.searchParams.get('excludeId');
                    if(search)items=items.filter(x=>[x.code,x.prenom,x.nom,x.email,x.ssoId,x.sigle,x.typeInstitution,x.typeUnite,x.scope,x.domain,x.description].filter(Boolean).join(' ').toLowerCase().includes(search));
                    if(status)items=items.filter(x=>x.status===status);
                    if(excluded)items=items.filter(x=>x.id!==excluded);
                    result = page(items);
                }
            }
            else if (!id) {
                if (body.code && collection.some(x => x.code === body.code))
                    fail(409, 'DATA_INTEGRITY_CONFLICT', 'Ce code est déjà utilisé.');
                const base = { id: crypto.randomUUID(), version: 0, status: 'ACTIF', createdAt: stamp(), updatedAt: stamp() };
                result = { ...base, ...body };
                if (kind === 'users') {
                    const { groupId, ...account } = body;
                    result = { ...base, institutionId: null, departmentId: null, prenom: null, nom: null, email: null, authNotBefore: null, ...account, accountType: body.typeCompte ?? 'USER' };
                    if (result.accountType === 'USER') {
                        // un compte humain entre dans un groupe dès sa création : celui qu'on choisit, sinon le groupe par défaut de son institution, sinon le groupe national par défaut
                        const chosen = groupId ? this.groups.find(g => g.id === groupId && g.status === 'ACTIF' && g.institutionId === result.institutionId) : undefined;
                        if (groupId && !chosen)
                            fail(422, 'IAM_GROUP_UNUSABLE', 'Ce groupe n’existe pas, est archivé ou n’est pas utilisable pour ce compte.');
                        const target = chosen ?? this.groups.find(g => g.defaultGroup && g.status === 'ACTIF' && g.institutionId === result.institutionId) ?? this.groups.find(g => g.defaultGroup && !g.institutionId)!;
                        this.groups.forEach(g => this.membersOf(g));
                        this.membersOf(target).push(result.id);
                    }
                }
                if (kind === 'role-assignments') {
                    if (body.utilisateurId === DEMO_IDS[this.persona])
                        fail(422, 'IAM_SELF_ADMINISTRATION_FORBIDDEN', 'Auto-attribution interdite.');
                    result = { ...base, userId: body.utilisateurId, roleId: body.roleId, scope: body.scope, institutionId: body.institutionId ?? null, departmentId: body.departmentId ?? null, startsAt: body.dateDebut ?? stamp(), endsAt: body.dateFin ?? null, revokedAt: null };
                }
                if (kind === 'delegations')
                    result = { ...base, ...body, delegantId: DEMO_IDS[this.persona], startsAt: body.dateDebut ?? stamp(), endsAt: body.dateFin, sourcePermissionRevision: 1, revokedAt: null };
                collection.push(result);
            }
            else {
                const entity = collection.find(x => x.id === id);
                if (!entity)
                    fail(404, 'NOT_FOUND', 'Ressource introuvable.');
                if (entity.version !== body.expectedVersion)
                    fail(409, 'IAM_STALE_VERSION', 'Cette ressource a changé. Relisez-la.');
                if (kind === 'users' && id === DEMO_IDS[this.persona])
                    fail(422, 'IAM_SELF_ADMINISTRATION_FORBIDDEN', 'Une autre autorité doit modifier votre compte.');
                if (entity.status === 'ARCHIVE')
                    fail(422, 'IAM_ARCHIVED_TERMINAL', 'Cet archivage est définitif.');
                if (action === 'status')
                    entity.status = body.status;
                else if (action === 'revoke-tokens')
                    entity.authNotBefore = stamp();
                else if (action === 'revoke') {
                    entity.status = 'REVOQUE';
                    entity.revokedAt = stamp();
                }
                else {
                    for (const [k, v] of Object.entries(body))
                        if (!['expectedVersion', 'reason'].includes(k))
                            entity[k] = v;
                }
                entity.version++;
                result = entity;
            }
        }
        else
            fail(404, 'DEMO_NOT_IMPLEMENTED', 'Ce parcours n’est pas simulé dans cette démonstration.');
        if (method !== 'GET')
            this.receipts.set(recKey, { body: canonical(body), response: structuredClone(result) });
        return structuredClone(result) as T;
    }
}
