import type { OcrJobItem } from './types.js';

export interface OcrJobsSummary {
    /** Fichiers courants de l'élément. */
    total: number;
    queued: number;
    running: number;
    /** Fichiers qui ont un texte (reconnu par le moteur ou enregistré à la main). */
    withText: number;
    failed: number;
    /** Reconnaissance terminée sans aucun texte (page blanche, photographie, écriture illisible). */
    noText: number;
    /** Fichiers sans texte ni tâche active : le moteur peut les (re)lancer. */
    runnable: number;
    /** Une tâche est en cours ou en attente : la liste doit être rafraîchie. */
    active: boolean;
}

/** Résume l'état de l'OCR automatique : un fichier avec texte compte comme traité quelle que soit sa dernière tâche. */
export function summarizeOcrJobs(items: ReadonlyArray<OcrJobItem>): OcrJobsSummary {
    const summary: OcrJobsSummary = { total: items.length, queued: 0, running: 0, withText: 0, failed: 0, noText: 0, runnable: 0, active: false };
    for (const item of items) {
        if (item.state === 'QUEUED') summary.queued++;
        else if (item.state === 'RUNNING') summary.running++;
        if (item.hasText) { summary.withText++; continue; }
        if (item.state === 'FAILED') summary.failed++;
        else if (item.state === 'DONE') summary.noText++;
        if (item.state !== 'QUEUED' && item.state !== 'RUNNING') summary.runnable++;
    }
    summary.active = summary.queued + summary.running > 0;
    return summary;
}

const ERRORS: Record<string, string> = {
    TESSERACT_LANGUAGE_NOT_INSTALLED: 'le modèle de langue n’est pas installé sur le serveur',
    IMAGE_PIXEL_LIMIT: 'image trop grande pour le moteur',
    IMAGE_FORMAT_NOT_ALLOWED: 'format d’image non pris en charge (JPEG, PNG ou TIFF)',
    EXTRACTION_TIMEOUT: 'délai dépassé',
    EXTRACTION_COMMAND_TIMEOUT: 'délai dépassé',
    EXTRACTION_FORMAT_UNSUPPORTED: 'format de fichier non pris en charge',
    ENCRYPTED_PDF_UNSUPPORTED: 'PDF protégé par un mot de passe',
    PAGE_LIMIT: 'trop de pages dans le fichier',
    SOURCE_NOT_READY: 'le fichier n’a pas été validé (analyse antivirus en attente ou échouée)',
    SOURCE_INTEGRITY_MISMATCH: 'intégrité du fichier non confirmée',
    EXTRACTION_SOURCE_INVALID: 'fichier trop volumineux ou modifié',
    OCR_SOURCE_CHANGED: 'le fichier a changé pendant la reconnaissance',
    REQUESTER_ACCESS_REVOKED: 'les droits de la personne qui a importé la page ont été retirés',
    WORKER_INTERRUPTED: 'moteur interrompu en cours de reconnaissance',
    FILE_TOO_LARGE: 'fichier plus grand que la limite de traitement du serveur (snae.storage.max-bytes)',
    STORAGE_UNAVAILABLE: 'stockage indisponible',
    STORAGE_NOT_CONFIGURED: 'stockage non configuré',
    PILLOW_NOT_INSTALLED: 'composant Python manquant sur le serveur'
};

/** Explication courte d'un échec d'OCR ; le code technique est conservé tel quel quand il n'est pas connu. */
export function ocrErrorText(code: string | null | undefined): string {
    if (!code) return 'échec sans précision';
    return ERRORS[code] ?? 'échec (' + code + ')';
}
