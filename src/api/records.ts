import type { Transport, RequestOptions } from '../core/http.js';
import { query } from '../core/http.js';
import { parsePage } from '../core/contracts.js';
import { uuid } from '../core/validation.js';
import { identifier } from '../core/iiifViewer.js';
import type { PreservationMonitor, BackupMonitor } from '../core/types.js';
import type { Volumetry, DocumentRelation, DocumentRelations, RelationType } from '../core/recordInfo.js';
import type { DocumentSignature } from '../core/signatures.js';
import type { TrustAnchor } from '../core/trustAnchors.js';
import type { ReplicationStatus } from '../core/replication.js';
import type { DocumentLifecycle, Page, RecordDocument, Dossier, DocumentVersion, DocumentFile, DocumentType, Ingestion, Actor, DocumentActor, QualifiedTimestamp, IntegrityCheck, PreservationEvent, PreservationEventListItem } from '../core/types.js';
export class RecordsApi {
    constructor(readonly transport: Transport) { }
    backupMonitor(signal?: AbortSignal): Promise<BackupMonitor> { return this.transport.request('/preservation/backups', { signal }); }
    /** L'hébergement : stockage principal, réplicas, ce que chacun détient, ce qui manque ou est en erreur. */
    replicationStatus(signal?: AbortSignal): Promise<ReplicationStatus> { return this.transport.request('/storage/replication', { signal }); }
    documentTypes(signal?: AbortSignal): Promise<DocumentType[]> { return this.transport.request('/document-types', { signal }); }
    async documents(params: Record<string, string | number | null | undefined>, signal?: AbortSignal): Promise<Page<RecordDocument>> { return parsePage<RecordDocument>(await this.transport.request('/documents' + query(params), { signal })); }
    /** Où en est le document sur le chemin brouillon → version scellée → clos, et ce qui empêche l'étape suivante. */
    lifecycle(id: string, signal?: AbortSignal): Promise<DocumentLifecycle> { return this.transport.request('/documents/' + uuid(id) + '/lifecycle', { signal }); }
    document(id: string, signal?: AbortSignal): Promise<RecordDocument> { return this.transport.request('/documents/' + uuid(id), { signal }); }
    versions(documentId: string, signal?: AbortSignal): Promise<DocumentVersion[]> { return this.transport.request('/documents/' + uuid(documentId) + '/versions', { signal }); }
    files(versionId: string, signal?: AbortSignal): Promise<DocumentFile[]> { return this.transport.request('/versions/' + uuid(versionId) + '/files', { signal }); }
    /** Copie de consultation (JPEG d'affichage ou vignette) d'un fichier maître : consultable avant la validation du maître. */
    fileDerivative(fileId: string, kind: 'consultation' | 'thumbnail', signal?: AbortSignal, frame = 1): Promise<Blob> { return this.transport.request('/files/' + uuid(fileId) + '/derivatives/' + kind + (frame > 1 ? '?frame=' + Math.trunc(frame) : ''), { signal, responseType: 'blob' }); }
    // ---- images IIIF des copies de consultation (API d'images 3.0) : dimensions, régions, texte reconnu, manifeste d'un document
    iiifInfo(fileId: string, frame: number, signal?: AbortSignal): Promise<{ width: number; height: number }> {
        return this.transport.request('/iiif/' + identifier(uuid(fileId), frame) + '/info.json', { signal });
    }
    /** Une image : région et taille de l'API d'images (par exemple `full` et `!1400,1400`), en JPEG de qualité par défaut, sans rotation. */
    iiifImage(id: string, region: string, size: string, signal?: AbortSignal, rotation = '0', quality = 'default.jpg'): Promise<Blob> {
        return this.transport.request('/iiif/' + id + '/' + region + '/' + size + '/' + rotation + '/' + quality, { signal, responseType: 'blob' });
    }
    iiifOcr(fileId: string, frame: number, signal?: AbortSignal): Promise<unknown> { return this.transport.request('/iiif/' + identifier(uuid(fileId), frame) + '/annotations/ocr', { signal }); }
    /** Le manifeste IIIF (présentation 3.0) du document, en fichier JSON : pour un visualiseur compatible, avec le même jeton d'accès. */
    iiifManifest(documentId: string, signal?: AbortSignal): Promise<Blob> { return this.transport.request('/documents/' + uuid(documentId) + '/iiif/manifest', { signal, responseType: 'blob' }); }
    fileContent(fileId: string, signal?: AbortSignal): Promise<Blob> { return this.transport.request('/files/' + uuid(fileId) + '/content', { signal, responseType: 'blob' }); }
    async dossiers(params: Record<string, string | number | null | undefined>, signal?: AbortSignal): Promise<Page<Dossier>> { return parsePage<Dossier>(await this.transport.request('/dossiers' + query(params), { signal })); }
    dossier(id: string, signal?: AbortSignal): Promise<Dossier> { return this.transport.request('/dossiers/' + uuid(id), { signal }); }
    // ---- informations d'archivage, relations, structure des dossiers (V77)
    documentByPersistentId(pid: string, signal?: AbortSignal): Promise<RecordDocument> { return this.transport.request('/documents/by-persistent-id/' + encodeURIComponent(pid.trim()), { signal }); }
    saveDocumentInfo(id: string, body: Record<string, unknown>, key: string): Promise<RecordDocument> { return this.command('/documents/' + uuid(id) + '/record-info', body, key, 'PUT'); }
    saveDossierInfo(id: string, body: Record<string, unknown>, key: string): Promise<Dossier> { return this.command('/dossiers/' + uuid(id) + '/record-info', body, key, 'PUT'); }
    async dossierDocuments(id: string, params: Record<string, string | number | null | undefined>, signal?: AbortSignal): Promise<Page<RecordDocument>> { return parsePage<RecordDocument>(await this.transport.request('/dossiers/' + uuid(id) + '/documents' + query(params), { signal })); }
    dossierChildren(id: string, signal?: AbortSignal): Promise<Dossier[]> { return this.transport.request('/dossiers/' + uuid(id) + '/children', { signal }); }
    dossierVolumetry(id: string, signal?: AbortSignal): Promise<Volumetry> { return this.transport.request('/dossiers/' + uuid(id) + '/volumetry', { signal }); }
    documentRelations(id: string, signal?: AbortSignal): Promise<DocumentRelations> { return this.transport.request('/documents/' + uuid(id) + '/relations', { signal }); }
    addRelation(id: string, targetId: string, type: RelationType, comment: string | null, key: string): Promise<DocumentRelation> { return this.command('/documents/' + uuid(id) + '/relations', { targetId, type, comment }, key); }
    updateRelation(id: string, relationId: string, comment: string | null, version: number, key: string): Promise<DocumentRelation> { return this.command('/documents/' + uuid(id) + '/relations/' + uuid(relationId), { comment, version }, key, 'PUT'); }
    deleteRelation(id: string, relationId: string, version: number, key: string): Promise<void> { return this.command('/documents/' + uuid(id) + '/relations/' + uuid(relationId) + '/delete', { version }, key); }
    // ---- signatures électroniques (V78)
    documentSignatures(id: string, signal?: AbortSignal): Promise<DocumentSignature[]> { return this.transport.request('/documents/' + uuid(id) + '/signatures', { signal }); }
    declareSignature(id: string, body: Record<string, unknown>, key: string): Promise<DocumentSignature> { return this.command('/documents/' + uuid(id) + '/signatures', body, key); }
    /** Le serveur relit le fichier, vérifie chaque signature du PDF et remplace ses verdicts précédents. */
    verifySignatures(id: string, fileId: string, key: string): Promise<DocumentSignature[]> { return this.command('/documents/' + uuid(id) + '/files/' + uuid(fileId) + '/signatures/verify', {}, key); }
    /** Une signature CAdES détachée (.p7s) d'un autre fichier du document, vérifiée contre le fichier signé. */
    verifyDetachedSignature(id: string, fileId: string, signatureFileId: string, key: string): Promise<DocumentSignature[]> {
        return this.command('/documents/' + uuid(id) + '/files/' + uuid(fileId) + '/signatures/verify-detached?signatureFileId=' + uuid(signatureFileId), {}, key);
    }
    trustAnchors(institutionId: string | null | undefined, includeRetired: boolean, signal?: AbortSignal): Promise<TrustAnchor[]> {
        return this.transport.request('/trust-anchors' + query({ institutionId, includeRetired: includeRetired ? 'true' : undefined }), { signal });
    }
    addTrustAnchor(institutionId: string | null, label: string, certificate: string, key: string): Promise<TrustAnchor> { return this.command('/trust-anchors', { institutionId, label, certificate }, key); }
    retireTrustAnchor(id: string, reason: string, key: string): Promise<TrustAnchor> { return this.command('/trust-anchors/' + uuid(id) + '/retire', { reason }, key); }
    deleteSignature(id: string, signatureId: string, version: number, key: string): Promise<void> { return this.command('/documents/' + uuid(id) + '/signatures/' + uuid(signatureId) + '/delete', { version }, key); }
    command<T>(path: string, body: unknown, key: string, method: 'POST' | 'PUT' = 'POST'): Promise<T> { return this.transport.request(path, { method, body, idempotencyKey: key } satisfies RequestOptions); }
    uploadContent(versionId: string, file: File, role: 'PIECE_JOINTE' | 'MAITRE_CONSERVATION', key: string, signal?: AbortSignal): Promise<Ingestion> { return this.transport.upload!('/versions/' + uuid(versionId) + '/content', file, { role }, key, signal); }
    ingestion(id: string, signal?: AbortSignal): Promise<Ingestion> { return this.transport.request('/ingestions/' + uuid(id), { signal }); }
    ingestions(versionId: string, signal?: AbortSignal, before?: string | null): Promise<{ items: Ingestion[]; nextCursor: string | null }> { return this.transport.request('/versions/' + uuid(versionId) + '/ingestions' + query({ before, limit: 20 }), { signal }); }
    async actors(params: Record<string, string | number | null | undefined>, signal?: AbortSignal): Promise<Page<Actor>> { return parsePage<Actor>(await this.transport.request('/actors' + query(params), { signal })); }
    documentActors(documentId: string, signal?: AbortSignal): Promise<DocumentActor[]> { return this.transport.request('/documents/' + uuid(documentId) + '/actors', { signal }); }
    createTimestamp(versionId: string, key: string): Promise<QualifiedTimestamp> { return this.transport.request('/versions/' + uuid(versionId) + '/timestamp', { method: 'POST', idempotencyKey: key }); }
    timestamp(versionId: string, signal?: AbortSignal): Promise<QualifiedTimestamp> { return this.transport.request('/versions/' + uuid(versionId) + '/timestamp', { signal }); }
    classify(documentId: string, classificationNodeId: string | null, key: string): Promise<RecordDocument> { return this.transport.request('/documents/' + uuid(documentId) + '/classification', { method: 'PUT', body: { classificationNodeId }, idempotencyKey: key } satisfies RequestOptions); }
    createDocumentType(code: string, label: string, family: string | null, description: string | null, key: string): Promise<DocumentType> { return this.transport.request('/admin/document-types', { method: 'POST', body: { code, label, family, description }, idempotencyKey: key } satisfies RequestOptions); }
    verifyIntegrity(fileId: string, key: string): Promise<IntegrityCheck> { return this.transport.request('/files/' + uuid(fileId) + '/verify-integrity', { method: 'POST', idempotencyKey: key } satisfies RequestOptions); }
    preservationEvents(fileId: string, signal?: AbortSignal): Promise<PreservationEvent[]> { return this.transport.request('/files/' + uuid(fileId) + '/preservation-events', { signal }); }
    preservationMonitor(institutionId: string | null | undefined, departmentId: string | null | undefined, page: number, attentionOnly: boolean, signal?: AbortSignal): Promise<PreservationMonitor> {
        return this.transport.request('/preservation/monitor' + query({ institutionId, departmentId, page, size: 25, attentionOnly: String(attentionOnly) }), { signal });
    }
    allPreservationEvents(institutionId: string | null | undefined, departmentId: string | null | undefined, signal?: AbortSignal): Promise<PreservationEventListItem[]> { return this.transport.request('/preservation-events' + query({ institutionId, departmentId }), { signal }); }
    recordPreservationEvent(fileId: string, typeEvenement: string, resultat: string, outil: string | null, versionOutil: string | null, description: string | null, details: { agentId?: string | null; source?: unknown; destination?: unknown } = {}): Promise<PreservationEvent> {
        return this.transport.request('/files/' + uuid(fileId) + '/preservation-events', { method: 'POST', body: { ...details, typeEvenement, resultat, outil, versionOutil, description } } satisfies RequestOptions);
    }
}
