import type { Transport, RequestOptions } from '../core/http.js';
import { query } from '../core/http.js';
import { uuid } from '../core/validation.js';
import type { CodificationCheck, CodificationKind, CodificationMode, CodificationModel, CodificationProposal, CodificationSegment } from '../core/codification.js';

/** La codification guidée des références : le modèle de chaque institution, la proposition de la référence suivante, la vérification d'une référence saisie. */
export class CodificationApi {
    constructor(readonly transport: Transport) { }
    /** Les modèles de l'institution (réservé à qui les gère). */
    models(institutionId: string, signal?: AbortSignal): Promise<CodificationModel[]> {
        return this.transport.request('/codification/models' + query({ institutionId }), { signal });
    }
    /** Le modèle d'un type d'objet, `null` s'il n'y en a pas : la référence est alors libre. */
    model(kind: CodificationKind, institutionId: string, signal?: AbortSignal): Promise<CodificationModel | null> {
        return this.transport.request('/codification/models/' + kind + query({ institutionId }), { signal });
    }
    saveModel(kind: CodificationKind, body: { institutionId: string; label: string | null; segments: CodificationSegment[]; mode: CodificationMode }, key: string): Promise<CodificationModel> {
        return this.transport.request('/codification/models/' + kind, { method: 'PUT', body, idempotencyKey: key } satisfies RequestOptions);
    }
    removeModel(kind: CodificationKind, institutionId: string, key: string): Promise<void> {
        return this.transport.request('/codification/models/' + kind + '/remove', { method: 'POST', body: { institutionId }, idempotencyKey: key } satisfies RequestOptions);
    }
    /** La référence suivante du modèle (non réservée) ; `parentId` : le dossier ou la notice parente, `classementId` : le nœud du plan de classement. */
    proposal(kind: CodificationKind, institutionId: string, parentId: string | null, classementId: string | null, signal?: AbortSignal): Promise<CodificationProposal> {
        return this.transport.request('/codification/proposal' + query({ institutionId, kind, parentId: parentId ? uuid(parentId) : undefined, classementId: classementId ? uuid(classementId) : undefined }), { signal });
    }
    /** Une référence saisie respecte-t-elle le modèle ? (aide à la saisie : ne refuse rien). */
    check(kind: CodificationKind, institutionId: string, code: string, parentId: string | null, classementId: string | null, signal?: AbortSignal): Promise<CodificationCheck> {
        return this.transport.request('/codification/check' + query({ institutionId, kind, code, parentId: parentId ? uuid(parentId) : undefined, classementId: classementId ? uuid(classementId) : undefined }), { signal });
    }
}
