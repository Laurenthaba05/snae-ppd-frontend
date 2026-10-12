import { code, text, uuid, utc, scopeCheck, period } from './validation.js';
import type { Catalog } from './types.js';
export type Draft = Record<string, string>;
const id = (x: string | undefined) => x?.trim() ? uuid(x.trim()) : null;
const opt = (x: string | undefined, max: number) => text(x ?? '', max, false);
export function entityCommand(kind: Catalog, d: Draft, version?: number): Record<string, unknown> {
    const common = version === undefined ? {} : { expectedVersion: version, reason: text(d.reason ?? '', 2000) };
    if (version !== undefined && (!Number.isSafeInteger(version) || version < 0))
        throw new Error('Version serveur manquante ou invalide.');
    if (kind === 'institutions')
        return version === undefined ? { code: code(d.code ?? ''), nom: text(d.nom ?? '', 255), sigle: opt(d.sigle, 50), typeInstitution: text(d.typeInstitution ?? '', 50) } : { ...common, nom: text(d.nom ?? '', 255), sigle: opt(d.sigle, 50) };
    if (kind === 'departments')
        return { ...common, ...(version === undefined ? { institutionId: uuid(d.institutionId ?? ''), code: code(d.code ?? '') } : {}), parentId: id(d.parentId), nom: text(d.nom ?? '', 255), typeUnite: opt(d.typeUnite, 50) };
    if (kind === 'roles' && version === undefined && !['NATIONAL', 'INSTITUTION', 'DEPARTEMENT'].includes(d.scope ?? ''))
        throw new Error('Portée de rôle invalide.');
    if (kind === 'roles')
        return { ...common, ...(version === undefined ? { code: code(d.code ?? '', 80), scope: d.scope } : {}), nom: text(d.nom ?? '', 150), description: opt(d.description, 5000) };
    const email = opt(d.email, 320)?.toLowerCase() ?? null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        throw new Error('Adresse email invalide.');
    if (version !== undefined)
        return { ...common, nom: opt(d.nom, 150), prenom: opt(d.prenom, 150), email };
    const institutionId = id(d.institutionId), departmentId = id(d.departmentId), scope = d.scope ?? 'INSTITUTION', typeCompte = d.typeCompte ?? 'USER';
    scopeCheck(scope, institutionId, departmentId, typeCompte);
    const ssoId = text(d.ssoId ?? '', 255)!;
    if (/\s/.test(ssoId))
        throw new Error('Le sub SSO ne doit pas contenir d’espace.');
    return { scope, typeCompte, institutionId, departmentId, ssoId, nom: opt(d.nom, 150), prenom: opt(d.prenom, 150), email };
}
export function assignmentCommand(userId: string, d: Draft): Record<string, unknown> {
    const institutionId = id(d.institutionId), departmentId = id(d.departmentId);
    scopeCheck(d.scope ?? '', institutionId, departmentId);
    const dateDebut = utc(d.dateDebut ?? ''), dateFin = utc(d.dateFin ?? '');
    period(dateDebut, dateFin);
    return { utilisateurId: uuid(userId), roleId: uuid(d.roleId ?? ''), scope: d.scope, institutionId, departmentId, dateDebut, dateFin, motif: text(d.motif ?? '', 2000) };
}
