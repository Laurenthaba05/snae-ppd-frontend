import type { Transport, RequestOptions } from '../core/http.js';
import { uuid } from '../core/validation.js';
import type { LegalSource, LegalStatus, AccessRestriction } from '../core/types.js';
import type { Communicability, CommunicabilityCategory, DocumentCommunicability, PendingItem, PersonalDataGap, RedactionPage, RedactionZone, UpcomingItem } from '../core/communicability.js';
export class RightsApi {
    constructor(readonly transport: Transport) { }
    sources(signal?: AbortSignal): Promise<LegalSource[]> { return this.transport.request('/rights/sources', { signal }); }
    documentStatuses(documentId: string, signal?: AbortSignal): Promise<LegalStatus[]> { return this.transport.request('/rights/documents/' + uuid(documentId) + '/statuses', { signal }); }
    documentRestrictions(documentId: string, signal?: AbortSignal): Promise<AccessRestriction[]> { return this.transport.request('/rights/documents/' + uuid(documentId) + '/restrictions', { signal }); }
    // ---- communicabilité et occultation (V81)
    communicabilityCategories(institutionId: string, signal?: AbortSignal): Promise<CommunicabilityCategory[]> { return this.transport.request('/rights/communicability-categories?institutionId=' + uuid(institutionId), { signal }); }
    createCommunicabilityCategory(body: Record<string, unknown>, key: string): Promise<CommunicabilityCategory> { return this.command('/communicability-categories', body, key); }
    retireCommunicabilityCategory(id: string, key: string): Promise<CommunicabilityCategory> { return this.command('/communicability-categories/' + uuid(id) + '/retire', {}, key); }
    pendingCommunicability(categoryId: string, institutionId: string, signal?: AbortSignal): Promise<PendingItem[]> { return this.transport.request('/rights/communicability-categories/' + uuid(categoryId) + '/pending?institutionId=' + uuid(institutionId), { signal }); }
    applyCommunicabilityBatch(categoryId: string, documentIds: string[], reason: string | null, key: string): Promise<Communicability[]> { return this.command('/communicability-categories/' + uuid(categoryId) + '/apply', { documentIds, reason }, key); }
    documentCommunicability(documentId: string, signal?: AbortSignal): Promise<DocumentCommunicability> { return this.transport.request('/rights/documents/' + uuid(documentId) + '/communicability', { signal }); }
    applyCommunicability(documentId: string, body: Record<string, unknown>, key: string): Promise<Communicability> { return this.command('/documents/' + uuid(documentId) + '/communicability', body, key); }
    removeCommunicability(documentId: string, reason: string, key: string): Promise<Communicability> { return this.command('/documents/' + uuid(documentId) + '/communicability/remove', { reason }, key); }
    upcomingCommunicability(institutionId: string, days: number, signal?: AbortSignal): Promise<UpcomingItem[]> { return this.transport.request('/rights/communicability/upcoming?institutionId=' + uuid(institutionId) + '&days=' + Math.trunc(days), { signal }); }
    personalDataGaps(institutionId: string, signal?: AbortSignal): Promise<PersonalDataGap[]> { return this.transport.request('/rights/communicability/personal-data-gaps?institutionId=' + uuid(institutionId), { signal }); }
    redactionPages(documentId: string, signal?: AbortSignal): Promise<RedactionPage[]> { return this.transport.request('/rights/documents/' + uuid(documentId) + '/redaction-pages', { signal }); }
    redactionZones(documentId: string, signal?: AbortSignal): Promise<RedactionZone[]> { return this.transport.request('/rights/documents/' + uuid(documentId) + '/redaction-zones', { signal }); }
    addRedactionZone(documentId: string, body: Record<string, unknown>, key: string): Promise<RedactionZone> { return this.command('/documents/' + uuid(documentId) + '/redaction-zones', body, key); }
    removeRedactionZone(documentId: string, zoneId: string, reason: string, key: string): Promise<RedactionZone> { return this.command('/documents/' + uuid(documentId) + '/redaction-zones/' + uuid(zoneId) + '/remove', { reason }, key); }
    command<T>(path: string, body: unknown, key: string, method: 'POST' | 'PUT' = 'POST'): Promise<T> { return this.transport.request('/rights' + path, { method, body, idempotencyKey: key } satisfies RequestOptions); }
}
