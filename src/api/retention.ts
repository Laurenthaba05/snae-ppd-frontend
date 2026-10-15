import type { Transport } from '../core/http.js';
import { query } from '../core/http.js';
import { uuid } from '../core/validation.js';
import type { RetentionEvent, RetentionPlanning, RetentionRuleListItem, Disposition, LegalHold, DispositionReadiness } from '../core/types.js';
import type { DestructionCertificate, DestructionPreview } from '../core/destruction.js';
import type { Bordereau, BordereauCandidate, BordereauExecution, BordereauReadiness, BordereauSummary, DossierEliminationPlan } from '../core/bordereaux.js';
import type { IntermediateCandidate, IntermediateDocumentInfo, IntermediatePassage, IntermediatePassageSummary } from '../core/intermediate.js';
import type { DocumentTransferInfo, Transfer, TransferCandidate, TransferDestination, TransferSummary } from '../core/transfers.js';
import type { TriggerEvent, TriggerEventDocument, TriggerEventScheduling, TriggerEventType } from '../core/triggerEvents.js';
import type { Campaign, CampaignSummary, DocumentSampling, SamplingCandidate, SamplingRun } from '../core/sampling.js';
import type { ActSeal, ActType } from '../core/actSeals.js';
export class RetentionApi {
    constructor(readonly transport: Transport) { }
    // ---- sceau des actes (certificat de destruction, accusés de réception) : lire, vérifier, télécharger, sceller à la demande
    actSeal(type: ActType, id: string, signal?: AbortSignal): Promise<ActSeal> { return this.transport.request('/acts/' + type + '/' + uuid(id) + '/seal', { signal }); }
    sealAct(type: ActType, id: string, key: string): Promise<ActSeal> { return this.transport.request('/acts/' + type + '/' + uuid(id) + '/seal', { method: 'POST', idempotencyKey: key }); }
    actSealContent(type: ActType, id: string, signal?: AbortSignal): Promise<Blob> { return this.transport.request('/acts/' + type + '/' + uuid(id) + '/seal/content', { signal, responseType: 'blob' }); }
    actSealSignature(type: ActType, id: string, signal?: AbortSignal): Promise<Blob> { return this.transport.request('/acts/' + type + '/' + uuid(id) + '/seal/signature', { signal, responseType: 'blob' }); }
    events(institutionId: string, departmentId: string | null | undefined, signal?: AbortSignal): Promise<RetentionEvent[]> { return this.transport.request('/retention/events' + query({ institutionId, departmentId }), { signal }); }
    legalHolds(institutionId: string, departmentId: string | null | undefined, signal?: AbortSignal): Promise<LegalHold[]> { return this.transport.request('/retention/legal-holds' + query({ institutionId, departmentId }), { signal }); }
    documentEvents(documentId: string, signal?: AbortSignal): Promise<RetentionEvent[]> { return this.transport.request('/retention/documents/' + uuid(documentId) + '/events', { signal }); }
    /** Les règles de conservation que la personne gère : nationales et, si une institution est donnée, celles de l'institution. */
    rules(institutionId: string | null | undefined, signal?: AbortSignal): Promise<RetentionRuleListItem[]> { return this.transport.request('/retention/rules' + query({ institutionId }), { signal }); }
    /** Où en est la planification de la conservation du document : la règle qui s'appliquerait, la date de départ, l'échéance prévue et ce qui empêche de planifier. */
    planning(documentId: string, signal?: AbortSignal): Promise<RetentionPlanning> { return this.transport.request('/retention/documents/' + uuid(documentId) + '/planning', { signal }); }
    eventDispositions(eventId: string, signal?: AbortSignal): Promise<Disposition[]> { return this.transport.request('/retention/events/' + uuid(eventId) + '/dispositions', { signal }); }
    documentHolds(documentId: string, signal?: AbortSignal): Promise<LegalHold[]> { return this.transport.request('/retention/documents/' + uuid(documentId) + '/legal-holds', { signal }); }
    readiness(dispositionId: string, signal?: AbortSignal): Promise<DispositionReadiness> { return this.transport.request('/retention/dispositions/' + uuid(dispositionId) + '/readiness', { signal }); }
    /** Ce que l'exécution d'une élimination supprimerait : fichiers, copies, PDF d'accès, textes dérivés ; et ce qui l'en empêche. */
    destructionPreview(dispositionId: string, signal?: AbortSignal): Promise<DestructionPreview> { return this.transport.request('/retention/dispositions/' + uuid(dispositionId) + '/destruction-preview', { signal }); }
    /** Le certificat de destruction d'une action exécutée. */
    certificateOfAction(dispositionId: string, signal?: AbortSignal): Promise<DestructionCertificate> { return this.transport.request('/retention/dispositions/' + uuid(dispositionId) + '/certificate', { signal }); }
    /** Le certificat de destruction d'un document détruit (404 si le document n'a pas été détruit). */
    certificateOfDocument(documentId: string, signal?: AbortSignal): Promise<DestructionCertificate> { return this.transport.request('/retention/documents/' + uuid(documentId) + '/destruction-certificate', { signal }); }
    certificate(id: string, signal?: AbortSignal): Promise<DestructionCertificate> { return this.transport.request('/retention/certificates/' + uuid(id), { signal }); }
    certificates(institutionId: string, signal?: AbortSignal): Promise<DestructionCertificate[]> { return this.transport.request('/retention/certificates' + query({ institutionId }), { signal }); }
    // ---- bordereaux d'élimination (V79)
    eliminationCandidates(institutionId: string, departmentId: string | null | undefined, signal?: AbortSignal): Promise<BordereauCandidate[]> { return this.transport.request('/retention/elimination-candidates' + query({ institutionId, departmentId }), { signal }); }
    dossierEliminationPlan(institutionId: string, dossierId: string, signal?: AbortSignal): Promise<DossierEliminationPlan> {
        return this.transport.request('/retention/elimination-dossiers/' + uuid(dossierId) + query({ institutionId }), { signal });
    }
    createBordereauFromDossier(institutionId: string, dossierId: string, title: string | null, observations: string | null, key: string): Promise<Bordereau> {
        return this.command('/elimination-bordereaux/from-dossier', { institutionId, dossierId, title, observations }, key);
    }
    addDossierToBordereau(id: string, dossierId: string, key: string): Promise<Bordereau> { return this.command('/elimination-bordereaux/' + uuid(id) + '/dossier', { dossierId }, key); }
    bordereaux(institutionId: string, signal?: AbortSignal): Promise<BordereauSummary[]> { return this.transport.request('/retention/elimination-bordereaux' + query({ institutionId }), { signal }); }
    bordereau(id: string, signal?: AbortSignal): Promise<Bordereau> { return this.transport.request('/retention/elimination-bordereaux/' + uuid(id), { signal }); }
    bordereauReadiness(id: string, signal?: AbortSignal): Promise<BordereauReadiness> { return this.transport.request('/retention/elimination-bordereaux/' + uuid(id) + '/readiness', { signal }); }
    createBordereau(institutionId: string, title: string, observations: string | null, eventIds: string[], key: string): Promise<Bordereau> { return this.command('/elimination-bordereaux', { institutionId, title, observations, eventIds }, key); }
    addBordereauLines(id: string, eventIds: string[], key: string): Promise<Bordereau> { return this.command('/elimination-bordereaux/' + uuid(id) + '/lines', { eventIds }, key); }
    removeBordereauLine(id: string, lineId: string, key: string): Promise<Bordereau> { return this.command('/elimination-bordereaux/' + uuid(id) + '/lines/' + uuid(lineId) + '/remove', {}, key); }
    retireBordereauLine(id: string, lineId: string, reason: string, key: string): Promise<Bordereau> { return this.command('/elimination-bordereaux/' + uuid(id) + '/lines/' + uuid(lineId) + '/retire', { reason }, key); }
    submitBordereau(id: string, key: string): Promise<Bordereau> { return this.command('/elimination-bordereaux/' + uuid(id) + '/submit', {}, key); }
    visaBordereau(id: string, body: Record<string, unknown>, key: string): Promise<Bordereau> { return this.command('/elimination-bordereaux/' + uuid(id) + '/visa', body, key); }
    /** Détruit les prochaines lignes visées (par lots) : chaque document a son certificat, une ligne en échec n'arrête pas les autres. */
    executeBordereau(id: string, limit: number, key: string): Promise<BordereauExecution> { return this.command('/elimination-bordereaux/' + uuid(id) + '/execute', { limit }, key); }
    cancelBordereau(id: string, reason: string, key: string): Promise<Bordereau> { return this.command('/elimination-bordereaux/' + uuid(id) + '/cancel', { reason }, key); }
    // ---- phase intermédiaire (V80)
    intermediateCandidates(institutionId: string, departmentId: string | null | undefined, signal?: AbortSignal): Promise<IntermediateCandidate[]> { return this.transport.request('/retention/intermediate-candidates' + query({ institutionId, departmentId }), { signal }); }
    intermediatePassages(institutionId: string, signal?: AbortSignal): Promise<IntermediatePassageSummary[]> { return this.transport.request('/retention/intermediate-passages' + query({ institutionId }), { signal }); }
    intermediatePassage(id: string, signal?: AbortSignal): Promise<IntermediatePassage> { return this.transport.request('/retention/intermediate-passages/' + uuid(id), { signal }); }
    createIntermediatePassage(body: Record<string, unknown>, key: string): Promise<IntermediatePassage> { return this.command('/intermediate-passages', body, key); }
    /** Le passage du document en archives intermédiaires ; null tant qu'il est en phase courante. */
    documentIntermediate(documentId: string, signal?: AbortSignal): Promise<IntermediateDocumentInfo | null> { return this.transport.request('/retention/documents/' + uuid(documentId) + '/intermediate-passage', { signal }); }
    // ---- transfert vers l'institution d'archives (V82)
    transferCandidates(institutionId: string, departmentId: string | null | undefined, signal?: AbortSignal): Promise<TransferCandidate[]> { return this.transport.request('/retention/transfer-candidates' + query({ institutionId, departmentId }), { signal }); }
    transferDestinations(institutionId: string, signal?: AbortSignal): Promise<TransferDestination[]> { return this.transport.request('/retention/transfer-destinations' + query({ institutionId }), { signal }); }
    /** Les bordereaux de versement où l'institution est versante ou destinataire. */
    archiveTransfers(institutionId: string, signal?: AbortSignal): Promise<TransferSummary[]> { return this.transport.request('/retention/archive-transfers' + query({ institutionId }), { signal }); }
    archiveTransfer(id: string, signal?: AbortSignal): Promise<Transfer> { return this.transport.request('/retention/archive-transfers/' + uuid(id), { signal }); }
    createArchiveTransfer(institutionId: string, destinationId: string, title: string, observations: string | null, eventIds: string[], key: string): Promise<Transfer> {
        return this.command('/archive-transfers', { institutionId, destinationId, title, observations, eventIds }, key);
    }
    addArchiveTransferLines(id: string, eventIds: string[], key: string): Promise<Transfer> { return this.command('/archive-transfers/' + uuid(id) + '/lines', { eventIds }, key); }
    removeArchiveTransferLine(id: string, lineId: string, key: string): Promise<Transfer> { return this.command('/archive-transfers/' + uuid(id) + '/lines/' + uuid(lineId) + '/remove', {}, key); }
    retireArchiveTransferLine(id: string, lineId: string, reason: string, key: string): Promise<Transfer> { return this.command('/archive-transfers/' + uuid(id) + '/lines/' + uuid(lineId) + '/retire', { reason }, key); }
    submitArchiveTransfer(id: string, key: string): Promise<Transfer> { return this.command('/archive-transfers/' + uuid(id) + '/submit', {}, key); }
    receiveArchiveTransfer(id: string, body: Record<string, unknown>, key: string): Promise<Transfer> { return this.command('/archive-transfers/' + uuid(id) + '/receive', body, key); }
    executeArchiveTransfer(id: string, key: string): Promise<Transfer> { return this.command('/archive-transfers/' + uuid(id) + '/execute', {}, key); }
    cancelArchiveTransfer(id: string, reason: string, key: string): Promise<Transfer> { return this.command('/archive-transfers/' + uuid(id) + '/cancel', { reason }, key); }
    /** Le transfert du document vers une institution d'archives ; null tant qu'il n'a pas été remis. */
    documentTransfer(documentId: string, signal?: AbortSignal): Promise<DocumentTransferInfo | null> { return this.transport.request('/retention/documents/' + uuid(documentId) + '/archive-transfer', { signal }); }
    // ---- déclencheurs liés à un événement (V85)
    triggerEventTypes(institutionId: string | null | undefined, signal?: AbortSignal): Promise<TriggerEventType[]> { return this.transport.request('/retention/trigger-event-types' + query({ institutionId }), { signal }); }
    createTriggerEventType(body: Record<string, unknown>, key: string): Promise<TriggerEventType> { return this.command('/trigger-event-types', body, key); }
    retireTriggerEventType(id: string, key: string): Promise<TriggerEventType> { return this.command('/trigger-event-types/' + uuid(id) + '/retire', {}, key); }
    /** Les événements constatés : ceux d'un document (et de ses dossiers), d'un dossier, ou les plus récents d'une institution. */
    triggerEvents(filter: { institutionId?: string | null; documentId?: string | null; dossierId?: string | null }, signal?: AbortSignal): Promise<TriggerEvent[]> { return this.transport.request('/retention/trigger-events' + query({ ...filter }), { signal }); }
    declareTriggerEvent(body: Record<string, unknown>, key: string): Promise<TriggerEvent> { return this.command('/trigger-events', body, key); }
    cancelTriggerEvent(id: string, reason: string, key: string): Promise<TriggerEvent> { return this.command('/trigger-events/' + uuid(id) + '/cancel', { reason }, key); }
    triggerEventDocuments(id: string, signal?: AbortSignal): Promise<TriggerEventDocument[]> { return this.transport.request('/retention/trigger-events/' + uuid(id) + '/documents', { signal }); }
    scheduleTriggerEvent(id: string, key: string): Promise<TriggerEventScheduling> { return this.command('/trigger-events/' + uuid(id) + '/schedule', {}, key); }
    // ---- tri par échantillonnage (V86)
    samplingCandidates(institutionId: string, departmentId: string | null | undefined, signal?: AbortSignal): Promise<SamplingCandidate[]> { return this.transport.request('/retention/sampling-candidates' + query({ institutionId, departmentId }), { signal }); }
    samplingCampaigns(institutionId: string, signal?: AbortSignal): Promise<CampaignSummary[]> { return this.transport.request('/retention/sampling-campaigns' + query({ institutionId }), { signal }); }
    samplingCampaign(id: string, signal?: AbortSignal): Promise<Campaign> { return this.transport.request('/retention/sampling-campaigns/' + uuid(id), { signal }); }
    createSamplingCampaign(institutionId: string, ruleVersionId: string, title: string, observations: string | null, eventIds: string[], key: string): Promise<Campaign> {
        return this.command('/sampling-campaigns', { institutionId, ruleVersionId, title, observations, eventIds }, key);
    }
    addSamplingLines(id: string, eventIds: string[], key: string): Promise<Campaign> { return this.command('/sampling-campaigns/' + uuid(id) + '/lines', { eventIds: eventIds.map(uuid) }, key); }
    removeSamplingLine(id: string, lineId: string, key: string): Promise<Campaign> { return this.command('/sampling-campaigns/' + uuid(id) + '/lines/' + uuid(lineId) + '/remove', {}, key); }
    resetSamplingLine(id: string, lineId: string, key: string): Promise<Campaign> { return this.command('/sampling-campaigns/' + uuid(id) + '/lines/' + uuid(lineId) + '/reset', {}, key); }
    adjustSamplingLine(id: string, lineId: string, retained: boolean, reason: string, key: string): Promise<Campaign> {
        return this.command('/sampling-campaigns/' + uuid(id) + '/lines/' + uuid(lineId) + '/adjust', { retained, reason }, key);
    }
    stopSamplingCampaign(id: string, key: string): Promise<Campaign> { return this.command('/sampling-campaigns/' + uuid(id) + '/stop', {}, key); }
    validateSamplingRetained(id: string, visaReference: string, procesVerbal: string, key: string): Promise<Campaign> {
        return this.command('/sampling-campaigns/' + uuid(id) + '/validate-retained', { visaReference, procesVerbal }, key);
    }
    executeSamplingRetained(id: string, key: string): Promise<SamplingRun> { return this.command('/sampling-campaigns/' + uuid(id) + '/execute-retained', {}, key); }
    cancelSamplingCampaign(id: string, reason: string, key: string): Promise<Campaign> { return this.command('/sampling-campaigns/' + uuid(id) + '/cancel', { reason }, key); }
    /** Le sort décidé par une campagne de tri pour le document ; null s'il n'est dans aucune campagne. */
    documentSampling(documentId: string, signal?: AbortSignal): Promise<DocumentSampling | null> { return this.transport.request('/retention/documents/' + uuid(documentId) + '/sampling', { signal }); }
    schedule(documentId: string, key: string): Promise<RetentionEvent> { return this.transport.request('/retention/documents/' + uuid(documentId) + '/schedule', { method: 'POST', idempotencyKey: key }); }
    command<T>(path: string, body: unknown, key: string, method: 'POST' | 'PUT' = 'POST'): Promise<T> { return this.transport.request('/retention' + path, { method, body, idempotencyKey: key }); }
}
