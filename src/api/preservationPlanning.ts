import type { Transport } from '../core/http.js';
import { query } from '../core/http.js';
import { uuid } from '../core/validation.js';
import type { FileFormat, FileRelation, FormatRiskReport, OaisDiagnostic, OaisIndicator, PackageExport, PreservationAgent, PreservationRight } from '../core/preservationPlanning.js';
import type { MigratedCopy, MigrationCampaign, MigrationCampaignSummary, MigrationCandidates, MigrationConverter } from '../core/formatMigration.js';
import type { FileIdentification, IdentificationRun, IdentificationStatus, IdentificationSummary } from '../core/formatIdentification.js';
import type { FilePdfaValidation, PdfaRun, PdfaStatus, PdfaSummary } from '../core/pdfaValidation.js';

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
    // ---- identification par signature (V114)
    identificationStatus(institutionId: string, signal?: AbortSignal): Promise<IdentificationStatus> {
        return this.transport.request('/preservation/identification/status' + query({ institutionId }), { signal });
    }
    identificationSummary(institutionId: string, signal?: AbortSignal): Promise<IdentificationSummary> {
        return this.transport.request('/preservation/identification/summary' + query({ institutionId }), { signal });
    }
    runIdentification(institutionId: string, key: string): Promise<IdentificationRun> { return this.command('/preservation/identification/run', { institutionId }, key); }
    identifyFile(fileId: string, key: string): Promise<FileIdentification> { return this.command('/files/' + uuid(fileId) + '/preservation/identify', {}, key); }
    documentIdentifications(documentId: string, signal?: AbortSignal): Promise<FileIdentification[]> {
        return this.transport.request('/documents/' + uuid(documentId) + '/preservation/identifications', { signal });
    }
    // ---- validation PDF/A (V116)
    pdfaStatus(institutionId: string, signal?: AbortSignal): Promise<PdfaStatus> {
        return this.transport.request('/preservation/pdfa-validation/status' + query({ institutionId }), { signal });
    }
    pdfaSummary(institutionId: string, signal?: AbortSignal): Promise<PdfaSummary> {
        return this.transport.request('/preservation/pdfa-validation/summary' + query({ institutionId }), { signal });
    }
    runPdfaValidation(institutionId: string, key: string): Promise<PdfaRun> { return this.command('/preservation/pdfa-validation/run', { institutionId }, key); }
    validatePdfa(fileId: string, key: string): Promise<FilePdfaValidation> { return this.command('/files/' + uuid(fileId) + '/preservation/validate-pdfa', {}, key); }
    documentPdfaValidations(documentId: string, signal?: AbortSignal): Promise<FilePdfaValidation[]> {
        return this.transport.request('/documents/' + uuid(documentId) + '/preservation/pdfa-validations', { signal });
    }
    // ---- migration de formats (V113)
    migrationConverters(institutionId: string, signal?: AbortSignal): Promise<MigrationConverter[]> {
        return this.transport.request('/preservation/migration/converters' + query({ institutionId }), { signal });
    }
    migrationCandidates(institutionId: string, converter: string, sourceType: string, limit: number, signal?: AbortSignal): Promise<MigrationCandidates> {
        return this.transport.request('/preservation/migration/candidates' + query({ institutionId, converter, sourceType, limit: String(limit) }), { signal });
    }
    migrationCampaigns(institutionId: string, signal?: AbortSignal): Promise<MigrationCampaignSummary[]> {
        return this.transport.request('/preservation/migration/campaigns' + query({ institutionId }), { signal });
    }
    migrationCampaign(id: string, signal?: AbortSignal): Promise<MigrationCampaign> { return this.transport.request('/preservation/migration/campaigns/' + uuid(id), { signal }); }
    createMigration(body: Record<string, unknown>, key: string): Promise<MigrationCampaign> { return this.command('/preservation/migration/campaigns', body, key); }
    validateMigration(id: string, key: string): Promise<MigrationCampaign> { return this.command('/preservation/migration/campaigns/' + uuid(id) + '/validate', {}, key); }
    cancelMigration(id: string, reason: string, key: string): Promise<MigrationCampaign> { return this.command('/preservation/migration/campaigns/' + uuid(id) + '/cancel', { reason }, key); }
    retryMigration(id: string, lineId: string | null, key: string): Promise<MigrationCampaign> {
        return this.command('/preservation/migration/campaigns/' + uuid(id) + '/retry', lineId ? { lineId: uuid(lineId) } : {}, key);
    }
    documentMigrations(documentId: string, signal?: AbortSignal): Promise<MigratedCopy[]> { return this.transport.request('/documents/' + uuid(documentId) + '/preservation/migrations', { signal }); }
    /** Le contenu d'une copie migrée : mêmes droits que le contenu du maître, octets vérifiés par le serveur. */
    downloadMigratedCopy(fileId: string, copyId: string, signal?: AbortSignal): Promise<Blob> {
        return this.transport.request('/files/' + uuid(fileId) + '/migrations/' + uuid(copyId) + '/content', { signal, responseType: 'blob' });
    }
    command<T>(path: string, body: unknown, key: string): Promise<T> { return this.transport.request(path, { method: 'POST', body, idempotencyKey: key }); }
}
