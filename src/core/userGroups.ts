import { UUID_RE, code, text, uuid } from './validation.js';
import type { Page } from './types.js';

/** Un groupe d'utilisateurs : sans institution il est national. Il range des comptes, il n'accorde aucun droit (les rôles restent attribués à part). */
export interface UserGroup {
    id: string;
    institutionId: string | null;
    code: string;
    nom: string;
    description: string | null;
    defaultGroup: boolean;
    status: string;
    version: number;
    memberCount: number;
}

export interface GroupMember {
    userId: string;
    nom: string | null;
    prenom: string | null;
    email: string | null;
    addedAt: string;
}

/**
 * Une page de membres. Un membre se reconnaît par `userId` (c'est un compte, pas une ressource propre) : le contrôle commun des pages, qui exige un `id`, ne lui convient pas ; celui-ci
 * garde la même rigueur (forme de la page, taille bornée, identifiant du compte en UUID, adresse et noms en texte ou vides).
 */
export function parseMemberPage(data: unknown): Page<GroupMember> {
    const d = data as Record<string, unknown> | null;
    if (!d || typeof d !== 'object' || !Array.isArray(d.items) || !Number.isSafeInteger(d.page) || Number(d.page) < 0 || !Number.isSafeInteger(d.size) || Number(d.size) < 1 || Number(d.size) > 100 || typeof d.hasMore !== 'boolean')
        throw new Error('Page API invalide.');
    const optional = (v: unknown) => v === null || v === undefined || typeof v === 'string';
    for (const x of d.items as Record<string, unknown>[])
        if (!x || typeof x !== 'object' || typeof x.userId !== 'string' || !UUID_RE.test(x.userId) || !optional(x.nom) || !optional(x.prenom) || !optional(x.email) || typeof x.addedAt !== 'string')
            throw new Error('Identifiant de ressource invalide.');
    return data as unknown as Page<GroupMember>;
}

/** Le nom d'un membre, jamais son identifiant : « Prénom Nom », sinon l'adresse, sinon une mention explicite. */
export function memberName(member: Pick<GroupMember, 'nom' | 'prenom' | 'email'>): string {
    return [member.prenom, member.nom].filter(Boolean).join(' ').trim() || member.email || 'Compte sans nom';
}

/** La portée d'un groupe en mots : national, ou propre à une institution. */
export function groupScope(group: Pick<UserGroup, 'institutionId'>): string {
    return group.institutionId ? 'Institution' : 'National';
}

/** Les groupes où l'on peut ranger un nouveau compte de cette institution : actifs et propres à l'institution (le groupe par défaut reste le choix « aucun »). */
export function groupsForNewAccount(groups: UserGroup[], institutionId: string | null | undefined): UserGroup[] {
    if (!institutionId) return [];
    return groups.filter(g => g.status === 'ACTIF' && g.institutionId === institutionId);
}

/** Ce que l'écran dit du groupe où entrera le compte quand on n'en choisit pas : celui de l'institution s'il existe, sinon le groupe national par défaut. */
export function defaultGroupFor(groups: UserGroup[], institutionId: string | null | undefined): UserGroup | null {
    const own = institutionId ? groups.find(g => g.defaultGroup && g.status === 'ACTIF' && g.institutionId === institutionId) : undefined;
    return own ?? groups.find(g => g.defaultGroup && g.status === 'ACTIF' && g.institutionId === null) ?? null;
}

/** Le corps de la création d'un groupe ; le code se normalise comme les autres codes (majuscules, lettres, chiffres, _ et -). */
export function createGroupCommand(d: Record<string, string>, institutionId: string | null): Record<string, unknown> {
    return {
        institutionId: institutionId ? uuid(institutionId) : null,
        code: code(d.code ?? '', 50),
        nom: text(d.nom ?? '', 150),
        description: text(d.description ?? '', 5000, false),
        defaultGroup: d.defaultGroup === 'true'
    };
}

export function updateGroupCommand(group: Pick<UserGroup, 'version'>, d: Record<string, string>): Record<string, unknown> {
    if (!Number.isSafeInteger(group.version) || group.version < 0) throw new Error('Version serveur manquante ou invalide.');
    return { expectedVersion: group.version, nom: text(d.nom ?? '', 150), description: text(d.description ?? '', 5000, false), defaultGroup: d.defaultGroup === 'true', reason: text(d.reason ?? '', 2000) };
}

export function archiveGroupCommand(group: Pick<UserGroup, 'version'>, d: Record<string, string>): Record<string, unknown> {
    if (!Number.isSafeInteger(group.version) || group.version < 0) throw new Error('Version serveur manquante ou invalide.');
    return { expectedVersion: group.version, reason: text(d.reason ?? '', 2000) };
}

export function addMemberCommand(userId: string, d: Record<string, string>): Record<string, unknown> {
    return { utilisateurId: uuid(userId), motif: text(d.motif ?? '', 2000) };
}

export function removeMemberCommand(d: Record<string, string>): Record<string, unknown> {
    return { reason: text(d.reason ?? '', 2000) };
}
