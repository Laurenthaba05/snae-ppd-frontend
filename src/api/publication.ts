import type { Transport } from '../core/http.js';
import { uuid } from '../core/validation.js';
import type { Licence, Publication } from '../core/types.js';
export class PublicationApi {
    constructor(readonly transport: Transport) { }
    licences(signal?: AbortSignal): Promise<Licence[]> { return this.transport.request('/publication/licences', { signal }); }
    documentPublications(documentId: string, signal?: AbortSignal): Promise<Publication[]> { return this.transport.request('/publication/documents/' + uuid(documentId) + '/publications', { signal }); }
    command<T>(path: string, body: unknown, key: string, method: 'POST' | 'PUT' = 'POST'): Promise<T> { return this.transport.request('/publication' + path, { method, body, idempotencyKey: key }); }
}
