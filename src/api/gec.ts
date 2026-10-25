import type { Transport, RequestOptions } from '../core/http.js';
import { query } from '../core/http.js';
import { uuid } from '../core/validation.js';
import type { PageResult } from '../core/paging.js';
import type { GecCourrier, GecCourrierRow, GecSource, GecSourceBody } from '../core/gec.js';

/**
 * L'interopérabilité avec la GEC, côté personnel : les sources de courrier déclarées et le journal des courriers reçus. Le téléversement lui-même est fait par la GEC (API
 * multipart `POST /gec/courriers`, voir docs/GEC.md du serveur) : l'interface ne téléverse pas.
 */
export class GecApi {
    constructor(readonly transport: Transport) { }
    sources(institutionId: string, signal?: AbortSignal): Promise<GecSource[]> {
        return this.transport.request('/gec/sources' + query({ institutionId: uuid(institutionId) }), { signal });
    }
    createSource(body: GecSourceBody, key: string): Promise<GecSource> {
        return this.transport.request('/gec/sources', { method: 'POST', body, idempotencyKey: key } satisfies RequestOptions);
    }
    updateSource(id: string, body: GecSourceBody, key: string): Promise<GecSource> {
        return this.transport.request('/gec/sources/' + uuid(id), { method: 'PUT', body, idempotencyKey: key } satisfies RequestOptions);
    }
    /** Le journal des courriers reçus d'une institution, du plus récent au plus ancien, une page à la fois. */
    courriers(institutionId: string, filters: { source?: string; statut?: string; q?: string }, page: number, size: number, signal?: AbortSignal): Promise<PageResult<GecCourrierRow>> {
        return this.transport.request('/gec/courriers' + query({ institutionId: uuid(institutionId), source: filters.source || undefined, statut: filters.statut || undefined, q: filters.q?.trim() || undefined, page, size }), { signal });
    }
    courrier(id: string, signal?: AbortSignal): Promise<GecCourrier> {
        return this.transport.request('/gec/courriers/' + uuid(id), { signal });
    }
}
