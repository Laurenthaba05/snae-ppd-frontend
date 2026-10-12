import { ApiError } from '../core/http';
import { ingestionMessage } from '../core/ingestion';
import type { PlanRow } from '../core/pageNumbering';
import type { DigitizationApi } from '../api/digitization';
import type { RecordsApi } from '../api/records';

export interface ImportOutcome { state: 'ok' | 'error'; message?: string }
export interface ImportJob { id: string; row: PlanRow; file: File }
export interface RunOptions {
    digitization: DigitizationApi;
    records: RecordsApi;
    elementId: string;
    versionId: string;
    jobs: ImportJob[];
    /** Résolution à retenir quand le fichier n'en indique pas (saisie, signalée comme telle). */
    fallbackDpi: number | null;
    /** Clés d'idempotence conservées entre deux tentatives : rejouer une page dont le résultat est incertain ne duplique rien. */
    keys: Map<string, string>;
    isCancelled: () => boolean;
    onOutcome: (id: string, outcome: ImportOutcome) => void;
}

/** Arrêt après autant d'échecs serveur ou réseau consécutifs : inutile d'insister si le service est indisponible. */
const MAX_CONSECUTIVE_FAILURES = 5;

/**
 * Téléverse chaque image dans la version du document (maître de conservation) puis enregistre la page, dans l'ordre des numéros.
 * Renvoie la raison d'un arrêt anticipé, ou null si toutes les lignes ont été tentées.
 */
export async function importPageRows(options: RunOptions): Promise<string | null> {
    let consecutive = 0;
    for (const job of [...options.jobs].sort((a, b) => a.row.numero - b.row.numero)) {
        if (options.isCancelled()) return 'Import interrompu : les pages restantes n’ont pas été traitées.';
        const stored = options.keys.get(job.id) ?? crypto.randomUUID() + '|' + crypto.randomUUID();
        options.keys.set(job.id, stored);
        const [uploadKey, pageKey] = stored.split('|') as [string, string];
        try {
            const ingestion = await options.records.uploadContent(options.versionId, job.file, 'MAITRE_CONSERVATION', uploadKey);
            if (ingestion.status !== 'COMPLETED' || !ingestion.fileId) throw new Error(ingestionMessage(ingestion));
            const dpi = job.row.info.dpi ?? options.fallbackDpi;
            await options.digitization.command(`/elements/${options.elementId}/pages`, { pages: [{ numeroPage: job.row.numero, face: job.row.face, statut: 'PRESENTE', fichierId: ingestion.fileId, largeurPx: job.row.info.width, hauteurPx: job.row.info.height, dpi, sourceDpi: job.row.info.dpi !== null ? 'FICHIER' : dpi !== null ? 'SAISIE' : null }] }, pageKey, 'POST');
            options.onOutcome(job.id, { state: 'ok' });
            consecutive = 0;
        } catch (error) {
            const api = error instanceof ApiError ? error : null;
            options.onOutcome(job.id, { state: 'error', message: error instanceof Error ? error.message : 'Erreur inattendue.' });
            if (api && (api.status === 401 || api.status === 403)) return api.status === 401 ? 'Session expirée : reconnectez-vous puis réessayez.' : 'Droits insuffisants : import arrêté.';
            consecutive = !api || api.status >= 500 || api.status === 0 ? consecutive + 1 : 0;
            if (consecutive >= MAX_CONSECUTIVE_FAILURES) return 'Le serveur ne répond pas correctement : import arrêté. Réessayez plus tard.';
        }
    }
    return null;
}
