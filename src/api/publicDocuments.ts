import { ApiError, query } from '../core/http';
import { UUID_RE } from '../core/validation';

export interface PublicPageMatch { fileId: string; page: number }
export interface PublicDocument { id: string; title: string; reference: string; date: string | null; matches?: PublicPageMatch[]; matchesTruncated?: boolean }
export interface PublicFile { id: string; filename: string; mediaType: string; size: number }
export interface PublicDocumentDetail { document: PublicDocument; files: PublicFile[] }
export interface PublicDocumentsPage { items: PublicDocument[]; page: number; size: number; hasMore: boolean }
export interface PublicReading { documentPageCount?: number; documentFreePageCount?: number; pageCount: number; freePageCount: number; previewPercent: number; fullAccess: boolean; downloadAllowed: boolean }
export interface DocumentOffer { mode?: 'DISABLED' | 'LOCAL_TEST'; tariff: { typeLabel: string; amountGnf: number; durationDays: number } | null; currency: string; providers: Array<{ code: string; label: string; available: boolean; reason: string }> }
const id = (value: string) => { if (!UUID_RE.test(value)) throw new Error('Identifiant invalide.'); return value; };

/** Anonymous metadata and preview omit credentials; reader calls use only the portal cookie. */
export class PublicDocumentsApi {
    constructor(private fetcher: typeof fetch = fetch.bind(globalThis)) {}
    private async call<T>(path: string, signal?: AbortSignal, binary = false, reader = false): Promise<T> {
        const response = await this.fetcher((reader ? '/api/v1/portal/public-documents' : '/api/v1/public/documents') + path, {
            method: 'GET', credentials: reader ? 'same-origin' : 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal,
            headers: { Accept: binary ? 'image/png' : 'application/json' } });
        if (!response.ok) throw new ApiError(response.status, 'PUBLIC_DOCUMENT_UNAVAILABLE', response.status === 404 ? 'Ce document ou cette page n’est pas disponible en consultation publique.'
            : response.status === 402 ? 'Cette page nécessite un compte lecteur et un paiement validé.' : response.status === 401 ? 'Votre session lecteur a expiré. Reconnectez-vous.'
            : response.status === 429 ? 'Trop de consultations. Réessayez dans un instant.' : 'La consultation est indisponible. Réessayez.');
        return (binary ? response.blob() : response.json()) as Promise<T>;
    }
    list(q: string, page: number, signal?: AbortSignal): Promise<PublicDocumentsPage> { return this.call(query({ q: q || undefined, page, size: 20 }), signal); }
    document(documentId: string, signal?: AbortSignal): Promise<PublicDocumentDetail> { return this.call('/' + id(documentId), signal); }
    offer(documentId: string, signal?: AbortSignal): Promise<DocumentOffer> { return this.call('/' + id(documentId) + '/offer', signal); }
    private file(documentId: string, fileId: string) { return '/' + id(documentId) + '/files/' + id(fileId); }
    reading(documentId: string, fileId: string, reader: boolean, signal?: AbortSignal): Promise<PublicReading> { return this.call(this.file(documentId, fileId) + '/reading', signal, false, reader); }
    image(documentId: string, fileId: string, page: number, reader: boolean, signal?: AbortSignal): Promise<Blob> { return this.call(this.file(documentId, fileId) + '/pages/' + page + '/image', signal, true, reader); }
}
