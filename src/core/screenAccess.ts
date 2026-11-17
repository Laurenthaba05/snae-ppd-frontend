import { can, canAnywhere } from './policy.js';
import type { Me, ScopeTarget } from './types.js';

export const dispositionReadPermissions = ['RETENTION_REVIEW', 'DISPOSITION_PROPOSE', 'DISPOSITION_VALIDATE', 'DISPOSITION_EXECUTE'];
export function retentionVisible(me: Me | null, scope: ScopeTarget): boolean {
    return can(me, 'RETENTION_REVIEW', scope) || can(me, 'LEGAL_HOLD_MANAGE', scope)
        || ['RETENTION_RULE_MANAGE', ...dispositionReadPermissions].some(code => can(me, code, { institutionId: scope.institutionId }));
}
/** Entrées d'écran seulement : chaque panneau et chaque action gardent leur propre permission. */
export function scannerVisible(me: Me | null): boolean {
    return canAnywhere(me, 'DIGITIZATION_READ') || canAnywhere(me, 'FILE_INGEST');
}
export function documentPreservationVisible(me: Me | null, scope: ScopeTarget): boolean {
    return ['RETENTION_REVIEW', 'LEGAL_HOLD_MANAGE', 'PRESERVATION_EVENT_READ', 'DISSEMINATION_READ', 'DISSEMINATION_MANAGE']
        .some(code => can(me, code, scope)) || can(me, 'HERITAGE_READ', {});
}
export function conservationVisible(me: Me | null, scope: ScopeTarget): boolean {
    if (can(me, 'PRESERVATION_EVENT_READ', scope) || can(me, 'PRESERVATION_BACKUP_READ', {}) || can(me, 'TRUST_ANCHOR_MANAGE', {})) return true;
    return !!scope.institutionId && ['PRESERVATION_PLANNING_READ', 'PRESERVATION_PLANNING_MANAGE',
        'PRESERVATION_DIAGNOSTIC_READ', 'PRESERVATION_DIAGNOSTIC_MANAGE', 'PRESERVATION_MIGRATION_MANAGE',
        'PRESERVATION_MIGRATION_APPROVE', 'DISSEMINATION_READ', 'DISSEMINATION_MANAGE', 'FINDING_AID_PUBLISH', 'TRUST_ANCHOR_MANAGE']
        .some(code => can(me, code, { institutionId: scope.institutionId }));
}
