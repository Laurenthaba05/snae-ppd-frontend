import { formatBytes } from './format.js';
import { uuid } from './validation.js';

/**
 * Migration de formats (V113) : un convertisseur applique le format cible que le registre désigne, par campagne préparée puis validée par une autre personne. L'original n'est jamais
 * remplacé : la copie migrée est rangée à côté et se lit avec les droits du contenu. Le serveur reste seul juge (éligibilité, politique du registre, deux personnes).
 */
export type MigrationStatus = 'BROUILLON' | 'VALIDEE' | 'TERMINEE' | 'ANNULEE';
export type MigrationLineStatus = 'A_FAIRE' | 'EN_COURS' | 'MIGRE' | 'ECHEC' | 'ANNULEE';

export interface MigrationConverter {
    code: string; version: string; label: string; sources: string[]; target: string; extension: string; lossless: boolean; enabled: boolean;
}
export interface MigrationPolicy {
    registered: boolean; name: string | null; scope: 'NATIONAL' | 'INSTITUTION' | null; risk: string | null; perennity: string | null; registryTarget: string | null;
    converterTarget: string; matches: boolean;
}
export interface MigrationCandidate { fileId: string; documentId: string; documentReference: string; mediaType: string; size: number; version: number; role: string }
export interface MigrationCandidates { converter: MigrationConverter; policy: MigrationPolicy; items: MigrationCandidate[]; hasMore: boolean }
export interface MigrationCampaignSummary {
    id: string; reference: string; institutionId: string; title: string; converter: string; converterVersion: string; sourceType: string; targetType: string;
    status: MigrationStatus; lines: number; pending: number; migrated: number; failed: number; cancelled: number; createdById: string; createdAt: string;
    validatedById: string | null; validatedAt: string | null; completedAt: string | null; version: number;
}
export interface MigrationLine {
    id: string; rank: number; fileId: string; documentId: string; documentReference: string; size: number; status: MigrationLineStatus; attempts: number;
    errorCode: string | null; errorMessage: string | null; copyId: string | null; eventId: string | null; processedAt: string | null;
}
export interface MigrationCampaign {
    summary: MigrationCampaignSummary; motive: string; cancelledById: string | null; cancelledAt: string | null; cancellationReason: string | null; lines: MigrationLine[];
}
export interface MigratedCopy {
    id: string; fileId: string; fileName: string; mediaType: string; size: number; sha256: string; width: number; height: number; converter: string;
    campaignReference: string | null; eventId: string | null; createdAt: string;
}

export const MIGRATION_STATUS_LABELS: Record<MigrationStatus, string> = {
    BROUILLON: 'Brouillon', VALIDEE: 'Validée, en cours', TERMINEE: 'Terminée', ANNULEE: 'Annulée'
};
export const MIGRATION_LINE_LABELS: Record<MigrationLineStatus, string> = {
    A_FAIRE: 'À faire', EN_COURS: 'En cours', MIGRE: 'Migré', ECHEC: 'En échec', ANNULEE: 'Abandonné'
};

export function migrationBadge(status: MigrationStatus): string {
    return status === 'TERMINEE' ? 'ACTIF' : status === 'ANNULEE' ? 'RETIRE' : status === 'VALIDEE' ? 'EN_COURS' : 'BROUILLON';
}
export function lineBadge(status: MigrationLineStatus): string {
    return status === 'MIGRE' ? 'ACTIF' : status === 'ECHEC' ? 'ECHEC' : status === 'ANNULEE' ? 'RETIRE' : status === 'EN_COURS' ? 'EN_COURS' : 'BROUILLON';
}

/** « 3 migrés, 1 en échec, 2 en attente sur 6 fichiers » : ce que dit une campagne d'elle-même. */
export function migrationSummary(c: Pick<MigrationCampaignSummary, 'lines' | 'migrated' | 'failed' | 'pending' | 'cancelled'>): string {
    const parts: string[] = [];
    if (c.migrated) parts.push(`${c.migrated} migré${c.migrated > 1 ? 's' : ''}`);
    if (c.failed) parts.push(`${c.failed} en échec`);
    if (c.pending) parts.push(`${c.pending} en attente`);
    if (c.cancelled) parts.push(`${c.cancelled} abandonné${c.cancelled > 1 ? 's' : ''}`);
    return `${parts.length ? parts.join(', ') : 'Rien à migrer'} sur ${c.lines} fichier${c.lines > 1 ? 's' : ''}.`;
}

/** Ce que le registre dit de ce type pour ce convertisseur : sans inscription, sans format cible ou avec un autre, aucune campagne n'est possible. */
export function policyNotice(p: MigrationPolicy, sourceType: string): { ok: boolean; text: string } {
    if (!p.registered) return { ok: false, text: `Le type ${sourceType} ne figure pas au registre des formats : inscrivez-le, avec son format cible, avant de préparer une migration.` };
    if (!p.registryTarget) return { ok: false, text: `Le registre n’indique aucun format cible pour ${sourceType} : une migration ne se décide pas sans lui.` };
    if (!p.matches) return { ok: false, text: `Le registre désigne ${p.registryTarget} comme format cible de ${sourceType} ; ce convertisseur produit ${p.converterTarget}.` };
    return { ok: true, text: `Conforme au registre (${p.scope === 'NATIONAL' ? 'national' : 'institution'}) : ${sourceType} → ${p.registryTarget}.` };
}

export interface MigrationForm { converter: string; sourceType: string; title: string; motive: string; fileIds: string[] }
export const emptyMigrationForm: MigrationForm = { converter: '', sourceType: '', title: '', motive: '', fileIds: [] };
export const MAX_MIGRATION_FILES = 500;

export function migrationProblems(form: MigrationForm): string[] {
    const problems: string[] = [];
    if (!form.converter) problems.push('Choisissez un convertisseur.');
    if (!form.sourceType) problems.push('Choisissez le format à migrer.');
    if (!form.title.trim()) problems.push('L’intitulé de la campagne est obligatoire.');
    if (form.title.trim().length > 300) problems.push('L’intitulé est limité à 300 caractères.');
    if (form.motive.trim().length < 10) problems.push('Le motif de la migration est obligatoire (10 caractères au moins).');
    if (form.motive.trim().length > 2000) problems.push('Le motif est limité à 2000 caractères.');
    if (form.fileIds.length === 0) problems.push('Choisissez au moins un fichier.');
    if (form.fileIds.length > MAX_MIGRATION_FILES) problems.push(`Une campagne compte ${MAX_MIGRATION_FILES} fichiers au plus.`);
    return problems;
}

export function migrationBody(institutionId: string, form: MigrationForm): Record<string, unknown> {
    return {
        institutionId: uuid(institutionId), converter: form.converter, sourceType: form.sourceType, title: form.title.trim(), motive: form.motive.trim(),
        fileIds: [...new Set(form.fileIds)].map(id => uuid(id))
    };
}

/** Qui peut valider : une personne habilitée, autre que celle qui a préparé, sur un brouillon. Le serveur le contrôle de nouveau. */
export function validationState(c: Pick<MigrationCampaignSummary, 'status' | 'createdById'>, userId: string | null | undefined, mayApprove: boolean): { allowed: boolean; reason: string | null } {
    if (c.status !== 'BROUILLON') return { allowed: false, reason: null };
    if (!mayApprove) return { allowed: false, reason: 'La validation exige l’habilitation de validation des migrations.' };
    if (userId && c.createdById === userId) return { allowed: false, reason: 'La campagne doit être validée par une autre personne que celle qui l’a préparée.' };
    return { allowed: true, reason: null };
}

export const canCancelMigration = (status: MigrationStatus) => status === 'BROUILLON' || status === 'VALIDEE';
export const canRetryMigration = (c: Pick<MigrationCampaignSummary, 'status' | 'failed'>) => (c.status === 'VALIDEE' || c.status === 'TERMINEE') && c.failed > 0;

export function candidateText(c: MigrationCandidate): string { return `${c.documentReference} — version ${c.version}, ${formatBytes(c.size)}`; }
export function migratedCopyFileName(copy: Pick<MigratedCopy, 'fileName' | 'mediaType'>): string {
    const stem = copy.fileName.replace(/\.[^.]+$/, '') || 'copie';
    const ext = copy.mediaType === 'image/tiff' ? 'tif' : copy.mediaType === 'image/png' ? 'png' : 'bin';
    return `${stem}.${ext}`;
}
export function copyText(copy: MigratedCopy): string {
    const size = copy.width > 0 && copy.height > 0 ? `${copy.width} × ${copy.height} px, ` : '';
    return `${copy.mediaType} — ${size}${formatBytes(copy.size)}`;
}
