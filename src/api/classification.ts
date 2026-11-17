import type { Transport, RequestOptions } from '../core/http.js';
import { query } from '../core/http.js';
import type { ClassificationNode } from '../core/types.js';
export interface ClassificationSuggestion { nodeId: string; code: string | null; label: string; score: number; matchedTerms: string[] }
export interface ClassificationSuggestions { revision: string; currentNodeId: string | null; candidates: ClassificationSuggestion[]; ocrResults: number; unvalidatedResults: number; ocrPending: boolean; limited: boolean }
export class ClassificationApi {
    suggestions(kind: 'documents' | 'dossiers', id: string, signal?: AbortSignal): Promise<ClassificationSuggestions> { return this.transport.request(`/classification/suggestions/${kind}/${id}`, { signal }); }
    acceptSuggestion(kind: 'documents' | 'dossiers', id: string, body: { nodeId: string; revision: string; reason: string }): Promise<void> { return this.command(`/suggestions/${kind}/${id}/accept`, body, crypto.randomUUID()); }
    keywords(id: string, signal?: AbortSignal): Promise<{ keywords: string[]; version: number }> { return this.transport.request(`/classification/nodes/${id}/keywords`, { signal }); }
    saveKeywords(id: string, keywords: string[], version: number): Promise<{ keywords: string[]; version: number }> { return this.command(`/nodes/${id}/keywords`, { keywords, version }, crypto.randomUUID(), 'PUT'); }
    constructor(readonly transport: Transport) { }
    nodes(institutionId: string | null | undefined, signal?: AbortSignal): Promise<ClassificationNode[]> { return this.transport.request('/classification/nodes' + query({ institutionId }), { signal }); }
    node(id: string, signal?: AbortSignal): Promise<ClassificationNode> { return this.transport.request('/classification/nodes/' + id, { signal }); }
    command<T>(path: string, body: unknown, key: string, method: 'POST' | 'PUT' = 'POST'): Promise<T> { return this.transport.request('/classification' + path, { method, body, idempotencyKey: key } satisfies RequestOptions); }
}
