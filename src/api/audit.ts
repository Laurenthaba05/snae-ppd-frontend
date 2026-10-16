import type { RequestOptions, Transport } from '../core/http.js';
import type { AuditChainVerification } from '../core/auditChain.js';
import { query } from '../core/http.js';
import { parsePage } from '../core/contracts.js';
import { uuid } from '../core/validation.js';
import type { Page, AuditEvent } from '../core/types.js';
export class AuditApi {
    constructor(readonly transport: Transport) { }
    async objectEvents(objectType: string, objectId: string, page: number, size: number, signal?: AbortSignal): Promise<Page<AuditEvent>> {
        return parsePage<AuditEvent>(await this.transport.request('/audit/objects/' + encodeURIComponent(objectType) + '/' + uuid(objectId) + '/events' + query({ page, size }), { signal }));
    }
    async recentEvents(category: string | null, page: number, size: number, signal?: AbortSignal): Promise<Page<AuditEvent>> {
        return parsePage<AuditEvent>(await this.transport.request('/audit/events' + query({ category, page, size }), { signal }));
    }
    /** Relit une tranche de la chaîne du journal (le serveur plafonne à 50 000 événements) ; `complete` dit si elle atteint la tête, `nextSequence` par où reprendre. S'inscrit au journal. */
    verifyChain(fromSequence: number, count: number, signal?: AbortSignal): Promise<AuditChainVerification> {
        return this.transport.request('/audit/chain/verifications', { method: 'POST', body: { fromSequence, count }, idempotencyKey: crypto.randomUUID(), signal } satisfies RequestOptions);
    }
    event(id: string, signal?: AbortSignal): Promise<AuditEvent> { return this.transport.request('/audit/events/' + uuid(id), { signal }); }
}
