import type { Transport } from '../core/http.js';
import { query } from '../core/http.js';
import type { SearchReindexReport, SearchResultPage, SearchStatus, SearchTargetType } from '../core/types.js';
export class SearchApi {
    constructor(readonly transport: Transport) { }
    /** `keywords` : les identifiants des termes qu'un résultat doit tous porter (10 au plus). */
    search(q: string, type: SearchTargetType, page: number, size: number, signal?: AbortSignal, keywords: string[] = []): Promise<SearchResultPage> {
        return this.transport.request('/search' + query({ q, type, page, size, keywords: keywords.length ? keywords.join(',') : undefined }), { signal });
    }
    /** État du moteur : joignable, index présents, sains et alignés sur la base. */
    status(signal?: AbortSignal): Promise<SearchStatus> { return this.transport.request('/search/status', { signal }); }
    reindex(key: string): Promise<SearchReindexReport> { return this.transport.request('/search/reindex', { method: 'POST', idempotencyKey: key }); }
}
