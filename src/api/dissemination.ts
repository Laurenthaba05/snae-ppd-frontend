import type { Transport } from '../core/http.js';
import { query } from '../core/http.js';
import { uuid } from '../core/validation.js';
import type { ArkAuthority, ArkIdentifier, OaiStatus } from '../core/dissemination.js';
import type { FindingAidCandidate, FindingAidPreview, FindingAidPublication } from '../core/findingAids.js';

/** Identifiants pérennes ARK et état du dépôt OAI-PMH (V90). */
export class DisseminationApi {
    constructor(readonly transport: Transport) { }
    authority(institutionId: string, signal?: AbortSignal): Promise<ArkAuthority | null> { return this.transport.request('/dissemination/ark-authority' + query({ institutionId }), { signal }); }
    declareAuthority(institutionId: string, naan: string, prefix: string, key: string): Promise<ArkAuthority> {
        return this.command('/dissemination/ark-authority', { institutionId, naan, prefix }, key);
    }
    identifiers(institutionId: string, objectType: string | null | undefined, signal?: AbortSignal): Promise<ArkIdentifier[]> {
        return this.transport.request('/dissemination/ark-identifiers' + query({ institutionId, objectType }), { signal });
    }
    /** L'identifiant de l'objet ; 404 tant qu'il n'en a pas. */
    ofObject(objectType: string, objectId: string, signal?: AbortSignal): Promise<ArkIdentifier> {
        return this.transport.request('/dissemination/ark-identifiers/object' + query({ objectType, objectId: uuid(objectId) }), { signal });
    }
    mint(objectType: string, objectId: string, key: string): Promise<ArkIdentifier> { return this.command('/dissemination/ark-identifiers', { objectType, objectId }, key); }
    oaiStatus(signal?: AbortSignal): Promise<OaiStatus> { return this.transport.request('/dissemination/oai-status', { signal }); }

    // ---------- instruments de recherche publiés (V94)
    findingAids(institutionId: string, includeRetired: boolean, signal?: AbortSignal): Promise<FindingAidPublication[]> {
        return this.transport.request('/finding-aids' + query({ institutionId, includeRetired: includeRetired ? 'true' : undefined }), { signal });
    }
    findingAidCandidates(institutionId: string, signal?: AbortSignal): Promise<FindingAidCandidate[]> { return this.transport.request('/finding-aids/candidates' + query({ institutionId }), { signal }); }
    findingAidPreview(descriptionId: string, signal?: AbortSignal): Promise<FindingAidPreview> { return this.transport.request('/finding-aids/preview' + query({ descriptionId: uuid(descriptionId) }), { signal }); }
    publishFindingAid(descriptionId: string, key: string): Promise<FindingAidPublication> { return this.command('/finding-aids', { descriptionId }, key); }
    retireFindingAid(id: string, reason: string, key: string): Promise<FindingAidPublication> { return this.command('/finding-aids/' + uuid(id) + '/retire', { reason }, key); }
    command<T>(path: string, body: unknown, key: string): Promise<T> { return this.transport.request(path, { method: 'POST', body, idempotencyKey: key }); }
}
