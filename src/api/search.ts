import type { Transport } from '../core/http.js';
import { query } from '../core/http.js';
import type { SearchReindexReport, SearchReindexStatus, SearchResultPage, SearchStatus, SearchTargetType } from '../core/types.js';
export class SearchApi {
    constructor(readonly transport: Transport) { }
    /**
     * `keywords` : les identifiants des termes qu'un résultat doit tous porter comme mots-clés (10 au plus). `metadataTerms` : ceux qu'un document doit tous porter dans ses
     * métadonnées (10 au plus ; exige le droit de lire les métadonnées).
     */
    search(q: string, type: SearchTargetType, page: number, size: number, signal?: AbortSignal, keywords: string[] = [], metadataTerms: string[] = []): Promise<SearchResultPage> {
        return this.transport.request('/search' + query({ q, type, page, size, keywords: keywords.length ? keywords.join(',') : undefined,
            metadataTerms: metadataTerms.length ? metadataTerms.join(',') : undefined }), { signal });
    }
    /** État du moteur : joignable, index présents, sains et alignés sur la base. */
    status(signal?: AbortSignal): Promise<SearchStatus> { return this.transport.request('/search/status', { signal }); }
    /** Lance la réindexation en arrière-plan (202) ; `resume` reprend la dernière exécution interrompue ou en échec. L'avancement se lit avec `reindexStatus`. */
    reindex(key: string, resume = false): Promise<SearchReindexReport> {
        return this.transport.request('/search/reindex' + query({ resume: resume ? 'true' : undefined }), { method: 'POST', idempotencyKey: key });
    }
    /** La dernière exécution et son avancement (détenteur de SEARCH_REINDEX). */
    reindexStatus(signal?: AbortSignal): Promise<SearchReindexStatus> { return this.transport.request('/search/reindex', { signal }); }
}
