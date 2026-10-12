import type { Ingestion } from './types.js';

export function isIngestion(value: unknown): value is Ingestion {
    if (!value || typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;
    const id = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return typeof v.id === 'string' && id.test(v.id) && typeof v.versionId === 'string' && id.test(v.versionId)
        && ['COMPLETED', 'REJECTED', 'RETRYABLE', 'PROCESSING'].includes(String(v.status))
        && typeof v.filename === 'string' && typeof v.size === 'number' && Number.isFinite(v.size) && v.size >= 0
        && (v.fileId === null || typeof v.fileId === 'string' && id.test(v.fileId))
        && typeof v.mediaType === 'string' && typeof v.sha256 === 'string'
        && typeof v.attempts === 'number' && Number.isInteger(v.attempts) && v.attempts >= 0
        && (v.resultCode === null || typeof v.resultCode === 'string')
        && (v.leaseExpired === undefined || typeof v.leaseExpired === 'boolean')
        && typeof v.createdAt === 'string' && typeof v.updatedAt === 'string';
}

export function isInterruptedIngestion(result: Ingestion): boolean {
    return result.status === 'RETRYABLE' || (result.status === 'PROCESSING' && result.leaseExpired === true);
}

export function ingestionMessage(result: Ingestion): string {
    if (result.status === 'PROCESSING' && result.leaseExpired === true)
        return 'Le délai de traitement est dépassé. Vous pouvez réessayer avec le même fichier dans la fenêtre de dépôt, ou abandonner ce dépôt depuis le suivi avant un nouveau téléversement.';
    const messages: Record<string, string> = {
        SCANNER_NOT_CONFIGURED: 'Le contrôle antivirus n’est pas configuré sur le serveur. Un administrateur doit l’activer avant que le fichier puisse être validé.',
        SCAN_UNAVAILABLE: 'Le service antivirus est injoignable. Réessayez lorsque le service sera disponible.',
        SCAN_INCOMPLETE: 'L’analyse antivirus n’a pas pu se terminer. Le fichier n’a pas été validé.',
        SCAN_THREAT_DETECTED: 'L’antivirus a détecté une menace. Ce fichier a été rejeté ; sélectionnez un autre fichier.',
        INGESTION_CANCELLED: 'Ce dépôt a été annulé. Aucun fichier n’a été ajouté.',
    };
    return messages[result.resultCode ?? ''] ?? (result.status === 'REJECTED'
        ? 'Ce fichier a été rejeté par les contrôles de sécurité. Sélectionnez un autre fichier.'
        : 'Le fichier n’a pas pu être validé. Vous pouvez réessayer avec le même fichier lorsque le service sera disponible.');
}

/**
 * Ce que le serveur refuse au scellement d'une version, dit en clair avec la suite à donner. `open` : l'action que l'écran propose pour avancer (le suivi des dépôts, le circuit de validation).
 */
export interface SealHint { text: string; open: 'INGESTIONS' | 'WORKFLOW' | null }
const SEAL_HINTS: Record<string, SealHint> = {
    INGESTION_PENDING: { text: 'Des dépôts de cette version sont encore en cours ou interrompus et empêchent de la sceller. Ouvrez le suivi des dépôts : terminez-les ou abandonnez ceux qui ne servent plus.', open: 'INGESTIONS' },
    WORKFLOW_PENDING: { text: 'Un circuit de validation est en cours sur ce document. Terminez-le (ou annulez-le) avant de sceller la version.', open: 'WORKFLOW' },
    MANDATORY_WORKFLOW_INCOMPLETE: { text: 'Le circuit de validation obligatoire pour ce type de document doit être terminé avant de sceller la version.', open: 'WORKFLOW' },
    VALIDATED_CONTENT_REQUIRED: { text: 'Pour sceller, la version doit avoir un fichier « Maître de conservation » validé, et tous ses autres fichiers (hors fichiers rejetés) doivent être validés. Déposez le maître avec ce rôle puis cliquez sur « Valider comme maître ».', open: null },
    MASTER_KIND_CONFLICT: { text: 'Une version ne mélange pas un maître sans numéro de page et des maîtres paginés.', open: null }
};
export const sealHint = (code: string | null | undefined): SealHint | null => (code ? SEAL_HINTS[code] : undefined) ?? null;
