import type { Transport } from '../core/http.js';
import { query } from '../core/http.js';
import { uuid } from '../core/validation.js';
import type { FileFormat, FileRelation, FormatRiskReport, OaisDiagnostic, OaisIndicator, PackageExport, PreservationAgent, PreservationRight } from '../core/preservationPlanning.js';

/** Registre des formats et diagnostic de risque, agents, relations entre fichiers, droits et export PREMIS (V88). */
export class PreservationPlanningApi {
    constructor(readonly transport: Transport) { }
    agents(institutionId: string | null | undefined, includeRetired: boolean, signal?: AbortSignal): Promise<PreservationAgent[]> {
        return this.transport.request('/preservation/agents' + query({ institutionId, includeRetired: includeRetired ? 'true' : undefined }), { signal });
    }
    createAgent(body: Record<string, unknown>, key: string): Promise<PreservationAgent> { return this.command('/preservation/agents', body, key); }
    retireAgent(id: string, key: string): Promise<PreservationAgent> { return this.command('/preservation/agents/' + uuid(id) + '/retire', {}, key); }
    formats(institutionId: string | null | undefined, includeRetired: boolean, signal?: AbortSignal): Promise<FileFormat[]> {
        return this.transport.request('/preservation/formats' + query({ institutionId, includeRetired: includeRetired ? 'true' : undefined }), { signal });
    }
    createFormat(body: Record<string, unknown>, key: string): Promise<FileFormat> { return this.command('/preservation/formats', body, key); }
    retireFormat(id: string, key: string): Promise<FileFormat> { return this.command('/preservation/formats/' + uuid(id) + '/retire', {}, key); }
    formatRisk(institutionId: string, signal?: AbortSignal): Promise<FormatRiskReport> { return this.transport.request('/preservation/format-risk' + query({ institutionId }), { signal }); }
    relations(documentId: string, signal?: AbortSignal): Promise<FileRelation[]> { return this.transport.request('/documents/' + uuid(documentId) + '/preservation/relations', { signal }); }
    addRelation(sourceFileId: string, targetFileId: string, type: string, eventId: string | null, key: string): Promise<FileRelation> {
        return this.command('/files/' + uuid(sourceFileId) + '/preservation-relations', { targetFileId, type, eventId }, key);
    }
    rights(documentId: string, signal?: AbortSignal): Promise<PreservationRight[]> { return this.transport.request('/documents/' + uuid(documentId) + '/preservation/rights', { signal }); }
    addRight(documentId: string, body: Record<string, unknown>, key: string): Promise<PreservationRight> { return this.command('/documents/' + uuid(documentId) + '/preservation/rights', body, key); }
    retireRight(id: string, reason: string, key: string): Promise<PreservationRight> { return this.command('/preservation/rights/' + uuid(id) + '/retire', { reason }, key); }
    premis(documentId: string, signal?: AbortSignal): Promise<Blob> { return this.transport.request('/documents/' + uuid(documentId) + '/premis', { signal, responseType: 'blob' }); }
    packages(documentId: string, signal?: AbortSignal): Promise<PackageExport[]> { return this.transport.request('/documents/' + uuid(documentId) + '/preservation/packages', { signal }); }
    /** Le paquet BagIt (ZIP) du document, assemblé par le serveur et inscrit à son registre. */
    downloadPackage(documentId: string, profile: string, signal?: AbortSignal): Promise<Blob> {
        return this.transport.request('/documents/' + uuid(documentId) + '/preservation/package' + query({ profile }), { signal, responseType: 'blob' });
    }
    oaisDiagnostic(institutionId: string, signal?: AbortSignal): Promise<OaisDiagnostic> { return this.transport.request('/preservation/oais-diagnostic' + query({ institutionId }), { signal }); }
    evaluateOais(institutionId: string, indicator: string, status: string, justification: string, key: string): Promise<OaisIndicator> {
        return this.command('/preservation/oais-evaluations', { institutionId, indicator, status, justification }, key);
    }
    command<T>(path: string, body: unknown, key: string): Promise<T> { return this.transport.request(path, { method: 'POST', body, idempotencyKey: key }); }
}
