import type { QualityAnalysis, QualityPage } from './types.js';

export interface QualitySummary {
    /** Fichiers courants de l'élément. */
    total: number;
    analyzed: number;
    flagged: number;
    /** Tâche en file ou en cours, pas encore de mesure : la liste doit être rafraîchie. */
    pending: number;
    failed: number;
    /** Fichiers sans mesure ni tâche active : l'analyse peut les (re)lancer. */
    runnable: number;
}

/** Résume l'état de l'analyse d'image : une page mesurée compte comme analysée, quelle que soit sa dernière tâche. */
export function summarizeQuality(analysis: Pick<QualityAnalysis, 'pages'>): QualitySummary {
    const summary: QualitySummary = { total: analysis.pages.length, analyzed: 0, flagged: 0, pending: 0, failed: 0, runnable: 0 };
    for (const page of analysis.pages) {
        if (page.analyzed) { summary.analyzed++; if (page.flagged) summary.flagged++; continue; }
        if (page.jobState === 'QUEUED' || page.jobState === 'RUNNING') summary.pending++;
        else { summary.runnable++; if (page.jobState === 'FAILED') summary.failed++; }
    }
    return summary;
}

/**
 * Pages à renvoyer au scanner par défaut : celles dont l'image est floue, inclinée, sombre ou peu contrastée.
 * Une page presque blanche n'est pas proposée : elle se déclare « blanche » ou se rescanne selon ce qu'elle devait porter.
 */
export function suggestedRescan(pages: ReadonlyArray<QualityPage>): number[] {
    return pages.filter(p => p.numeroPage !== null && p.issues.some(i => i.code !== 'BLANK_PAGE')).map(p => p.numeroPage!).sort((a, b) => a - b);
}

/** Pages de l'échantillon qui ne sont pas déjà signalées : celles que la personne doit regarder en plus. */
export function sampleToView(analysis: Pick<QualityAnalysis, 'sample' | 'flagged'>): number[] {
    const flagged = new Set(analysis.flagged);
    return analysis.sample.filter(page => !flagged.has(page));
}

/** Mesures lisibles d'une page : « netteté 126 · inclinaison −2,5° ». */
export function metricsText(page: Pick<QualityPage, 'metrics'>): string {
    const m = page.metrics;
    if (!m) return '';
    const fr = (value: number, digits = 0) => value.toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    return ['netteté ' + fr(m.sharpness), m.skewDegrees === null ? null : 'inclinaison ' + fr(m.skewDegrees, 1) + '°', 'luminosité ' + fr(m.brightness), 'contraste ' + fr(m.contrast)].filter(Boolean).join(' · ');
}

const ERRORS: Record<string, string> = {
    IMAGE_PIXEL_LIMIT: 'image trop grande pour le moteur',
    IMAGE_FORMAT_NOT_ALLOWED: 'format d’image non pris en charge (JPEG, PNG ou TIFF)',
    FILE_TOO_LARGE: 'fichier plus grand que la limite de traitement du serveur (snae.storage.max-bytes)',
    STORAGE_UNAVAILABLE: 'stockage indisponible',
    STORAGE_NOT_CONFIGURED: 'stockage non configuré',
    PILLOW_NOT_INSTALLED: 'composant Python manquant sur le serveur',
    EXTRACTION_TIMEOUT: 'délai dépassé',
    SOURCE_NOT_READY: 'le fichier n’a pas été validé (analyse antivirus en attente ou échouée)',
    SOURCE_INTEGRITY_MISMATCH: 'intégrité du fichier non confirmée',
    QUALITY_RESULT_INVALID: 'résultat du moteur illisible',
    QUALITY_SOURCE_CHANGED: 'le fichier a changé pendant l’analyse',
    REQUESTER_ACCESS_REVOKED: 'les droits de la personne qui a importé la page ont été retirés',
    WORKER_INTERRUPTED: 'moteur interrompu pendant l’analyse'
};

/** Explication courte d'un échec d'analyse ; le code technique est conservé tel quel quand il n'est pas connu. */
export function qualityErrorText(code: string | null | undefined): string {
    if (!code) return 'échec sans précision';
    return ERRORS[code] ?? 'échec (' + code + ')';
}
