// La vérification de la chaîne du journal d'audit : le serveur relit une tranche à la fois, l'écran enchaîne les tranches jusqu'à la tête et résume.

export interface AuditChainAnomaly { kind: string; sequence: number | null; eventId: string | null; detail: string }
export interface AuditLegacyReport { events: number; chained: boolean | null; note: string }
export interface AuditChainVerification {
    ok: boolean; fromSequence: number; lastVerifiedSequence: number | null; checked: number; headSequence: number; complete: boolean; nextSequence: number | null;
    anomalyCount: number; anomalies: AuditChainAnomaly[]; legacy: AuditLegacyReport | null; verifiedAt: string; durationMillis: number;
}

/** Le nombre d'événements relus par appel (le serveur plafonne à 50 000). */
export const CHAIN_WINDOW = 10_000;
/** Garde-fou : une chaîne de plus de cent millions d'événements ne se relit pas depuis un écran. */
export const CHAIN_MAX_WINDOWS = 10_000;
export const CHAIN_MAX_ANOMALIES = 100;

export const ANOMALY_LABELS: Record<string, string> = {
    GAP: 'Événements manquants',
    HASH_MISMATCH: 'Événement modifié',
    CHAIN_BREAK: 'Chaîne rompue',
    PAYLOAD_MISSING: 'Contenu absent',
    PAYLOAD_UNREADABLE: 'Contenu illisible',
    PAYLOAD_MISMATCH: 'Contenu incohérent avec la ligne',
    COLUMN_MISMATCH: 'Colonnes différentes du contenu signé',
    HEAD_MISMATCH: 'Tête de chaîne incohérente',
    GENESIS_MISMATCH: 'Début de chaîne incohérent',
    LEGACY_FORK: 'Historique : chaîne divisée',
    LEGACY_DUPLICATE: 'Historique : empreinte en double',
    LEGACY_UNLINKED: 'Historique : événements non reliés',
    LEGACY_NO_ROOT: 'Historique : racine absente ou multiple'
};
export const anomalyLabel = (kind: string): string => ANOMALY_LABELS[kind] ?? 'Anomalie';

/** Le cumul de toutes les tranches d'une vérification. */
export interface ChainRun {
    windows: number; checked: number; headSequence: number; lastVerifiedSequence: number | null; complete: boolean;
    anomalyCount: number; anomalies: AuditChainAnomaly[]; legacy: AuditLegacyReport | null; durationMillis: number; verifiedAt: string | null;
}
export const emptyRun = (): ChainRun => ({ windows: 0, checked: 0, headSequence: 0, lastVerifiedSequence: null, complete: false, anomalyCount: 0, anomalies: [], legacy: null, durationMillis: 0, verifiedAt: null });

export function mergeRun(run: ChainRun, part: AuditChainVerification): ChainRun {
    return {
        windows: run.windows + 1,
        checked: run.checked + part.checked,
        headSequence: part.headSequence,
        lastVerifiedSequence: part.lastVerifiedSequence ?? run.lastVerifiedSequence,
        complete: part.complete,
        anomalyCount: run.anomalyCount + part.anomalyCount,
        anomalies: [...run.anomalies, ...part.anomalies].slice(0, CHAIN_MAX_ANOMALIES),
        legacy: run.legacy ?? part.legacy,
        durationMillis: run.durationMillis + part.durationMillis,
        verifiedAt: part.verifiedAt
    };
}

export type ChainVerdict = 'EN_COURS' | 'INTACTE' | 'ANOMALIES' | 'INCOMPLETE';

/** `INTACTE` seulement si la chaîne a été relue de 1 jusqu'à la tête sans la moindre anomalie ; `INCOMPLETE` si la relecture s'est arrêtée avant la tête (annulée, ou trop longue). */
export function runVerdict(run: ChainRun, running: boolean): ChainVerdict {
    if (run.anomalyCount > 0) return 'ANOMALIES';
    if (running) return 'EN_COURS';
    return run.complete ? 'INTACTE' : 'INCOMPLETE';
}

/** Part de la chaîne déjà relue, de 0 à 100 (la tête avance pendant la relecture : chaque tranche s'inscrit au journal). */
export function progressPercent(run: ChainRun): number {
    if (run.headSequence <= 0) return run.complete ? 100 : 0;
    return Math.min(100, Math.floor(((run.lastVerifiedSequence ?? 0) / run.headSequence) * 100));
}

/**
 * Relit toute la chaîne, tranche après tranche, jusqu'à la tête. S'arrête à l'annulation (`signal`) ou si le serveur n'avance pas. `onProgress` reçoit le cumul après chaque tranche.
 * Les erreurs du serveur (droit absent, vérification déjà en cours) remontent à l'appelant.
 */
export async function verifyWholeChain(
    call: (fromSequence: number, count: number, signal?: AbortSignal) => Promise<AuditChainVerification>,
    onProgress: (run: ChainRun) => void, signal?: AbortSignal, window = CHAIN_WINDOW): Promise<ChainRun> {
    let run = emptyRun();
    let from = 1;
    while (run.windows < CHAIN_MAX_WINDOWS) {
        if (signal?.aborted) break;
        const part = await call(from, window, signal);
        run = mergeRun(run, part);
        onProgress(run);
        if (part.complete || part.nextSequence == null) break;
        if (part.nextSequence <= from) break;
        from = part.nextSequence;
    }
    return run;
}
