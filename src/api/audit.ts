import type { Transport } from '../core/http.js';
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
    event(id: string, signal?: AbortSignal): Promise<AuditEvent> { return this.transport.request('/audit/events/' + uuid(id), { signal }); }
}
