import type { Transport } from '../core/http.js';
import { query } from '../core/http.js';
import { uuid } from '../core/validation.js';
import type { ConsultationRequest, Communication } from '../core/types.js';
export class ConsultationApi {
    constructor(readonly transport: Transport) { }
    createRequest(documentId: string | null, dossierId: string | null, motif: string, key: string): Promise<ConsultationRequest> {
        return this.transport.request('/consultations/requests', { method: 'POST', body: { documentId, dossierId, motif }, idempotencyKey: key });
    }
    request(id: string, signal?: AbortSignal): Promise<ConsultationRequest> { return this.transport.request('/consultations/requests/' + uuid(id), { signal }); }
    requestsByInstitution(institutionId: string, signal?: AbortSignal): Promise<ConsultationRequest[]> { return this.transport.request('/consultations/requests' + query({ institutionId }), { signal }); }
    myRequests(signal?: AbortSignal): Promise<ConsultationRequest[]> { return this.transport.request('/consultations/requests' + query({ mine: 'true' }), { signal }); }
    claim(id: string, key: string): Promise<ConsultationRequest> { return this.transport.request('/consultations/requests/' + uuid(id) + '/claim', { method: 'POST', idempotencyKey: key }); }
    authorize(id: string, decisionMotif: string | null, key: string): Promise<ConsultationRequest> { return this.transport.request('/consultations/requests/' + uuid(id) + '/authorize', { method: 'POST', body: { decisionMotif }, idempotencyKey: key }); }
    refuse(id: string, decisionMotif: string, key: string): Promise<ConsultationRequest> { return this.transport.request('/consultations/requests/' + uuid(id) + '/refuse', { method: 'POST', body: { decisionMotif }, idempotencyKey: key }); }
    createCommunication(documentId: string | null, dossierId: string | null, beneficiaireId: string, demandeConsultationId: string | null, lieu: string | null, key: string): Promise<Communication> {
        return this.transport.request('/communications', { method: 'POST', body: { documentId, dossierId, beneficiaireId, demandeConsultationId, lieu }, idempotencyKey: key });
    }
    communication(id: string, signal?: AbortSignal): Promise<Communication> { return this.transport.request('/communications/' + uuid(id), { signal }); }
    communicationsByInstitution(institutionId: string, signal?: AbortSignal): Promise<Communication[]> { return this.transport.request('/communications' + query({ institutionId }), { signal }); }
    deliver(id: string, key: string): Promise<Communication> { return this.transport.request('/communications/' + uuid(id) + '/deliver', { method: 'POST', idempotencyKey: key }); }
    returnItem(id: string, key: string): Promise<Communication> { return this.transport.request('/communications/' + uuid(id) + '/return', { method: 'POST', idempotencyKey: key }); }
}
