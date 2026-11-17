import { humanize } from './format.js';
import type { Permission } from './types.js';

/* Le catalogue des permissions rangé par domaine, avec pour chaque permission les rôles qui la détiennent (son attribution). Le serveur ne change rien : il donne la liste, l'écran la range. */

/** Un rôle qui détient une permission. */
export interface AttributedRole { id: string; code: string; name: string; scope: string; status: string }
/** Une permission du catalogue avec les rôles qui la détiennent. */
export interface PermissionAttribution extends Permission { roles: AttributedRole[] }

export interface PermissionGroup { domain: string; label: string; permissions: PermissionAttribution[]; unassigned: number }

/** Le nom lisible de chaque domaine du catalogue ; un domaine nouveau s'affiche avec son code mis en forme (jamais caché). */
export const DOMAIN_LABELS: Record<string, string> = {
    ACQUISITION: 'Acquisition et imports',
    ARCHIVAL_DESCRIPTION: 'Description archivistique',
    ARCHIVAL_INTAKE: 'Versements et entrées',
    AUDIT: 'Journal d’audit',
    CLASSIFICATION: 'Plan de classement',
    CONSULTATION: 'Consultations',
    DASHBOARD: 'Tableaux de bord',
    DIGITIZATION: 'Numérisation',
    DISSEMINATION: 'Diffusion',
    HERITAGE: 'Patrimoine',
    IAM: 'Identité et habilitations',
    INGESTION: 'Dépôt de fichiers',
    METADATA: 'Métadonnées',
    PHYSICALARCHIVES: 'Archives physiques',
    PORTAIL: 'Portail des lecteurs',
    PRESERVATION: 'Conservation numérique',
    PUBLICATION: 'Publication',
    RECORDS: 'Documents et dossiers',
    RECORDS_ADMIN: 'Documents : administration',
    RETENTION: 'Durées de conservation et sort final',
    RIGHTS: 'Droits et communicabilité',
    SALLE_LECTURE: 'Salle de lecture',
    SEARCH: 'Recherche',
    STORAGE: 'Stockage',
    WORKFLOW: 'Circuits de validation'
};

export const domainLabel = (domain: string): string => DOMAIN_LABELS[domain] ?? humanize(domain);

const byFrench = (a: string, b: string): number => a.localeCompare(b, 'fr');

/** Range les permissions par domaine (domaines par nom lisible, permissions par code) et compte dans chaque groupe celles qu'aucun rôle ne détient. */
export function groupByDomain(items: readonly PermissionAttribution[]): PermissionGroup[] {
    const groups = new Map<string, PermissionAttribution[]>();
    for (const item of items) groups.set(item.domain, [...(groups.get(item.domain) ?? []), item]);
    return [...groups.entries()]
        .map(([domain, permissions]) => ({ domain, label: domainLabel(domain), permissions: [...permissions].sort((a, b) => byFrench(a.code, b.code)), unassigned: permissions.filter(p => p.roles.length === 0).length }))
        .sort((a, b) => byFrench(a.label, b.label));
}

/** Les chiffres du catalogue : permissions, domaines, permissions sans aucun rôle. */
export function catalogSummary(groups: readonly PermissionGroup[]): { permissions: number; domains: number; unassigned: number } {
    return { permissions: groups.reduce((n, g) => n + g.permissions.length, 0), domains: groups.length, unassigned: groups.reduce((n, g) => n + g.unassigned, 0) };
}

/** Garde les permissions qu'aucun rôle ne détient (le filtre « sans rôle »). */
export const onlyUnassigned = (items: readonly PermissionAttribution[]): PermissionAttribution[] => items.filter(p => p.roles.length === 0);

/** « 3 rôles », « 1 rôle », « aucun rôle » : le texte de l'attribution d'une permission. */
export const attributionText = (roles: readonly unknown[]): string => roles.length === 0 ? 'Aucun rôle' : roles.length === 1 ? '1 rôle' : `${roles.length} rôles`;
