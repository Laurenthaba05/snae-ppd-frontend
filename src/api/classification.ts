import type { Transport, RequestOptions } from '../core/http.js';
import { query } from '../core/http.js';
import type { ClassificationNode } from '../core/types.js';
export class ClassificationApi {
    constructor(readonly transport: Transport) { }
    nodes(institutionId: string | null | undefined, signal?: AbortSignal): Promise<ClassificationNode[]> { return this.transport.request('/classification/nodes' + query({ institutionId }), { signal }); }
    node(id: string, signal?: AbortSignal): Promise<ClassificationNode> { return this.transport.request('/classification/nodes/' + id, { signal }); }
    command<T>(path: string, body: unknown, key: string, method: 'POST' | 'PUT' = 'POST'): Promise<T> { return this.transport.request('/classification' + path, { method, body, idempotencyKey: key } satisfies RequestOptions); }
}
