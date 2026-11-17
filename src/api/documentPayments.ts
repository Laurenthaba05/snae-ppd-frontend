import { ApiError, query } from '../core/http';
import { UUID_RE } from '../core/validation';

export type DocumentPaymentProvider = 'ORANGE_MONEY' | 'PAYCARD';
export interface DocumentPayment {
    id: string; documentId: string; provider: DocumentPaymentProvider; amountGnf: number; currency: string;
    durationDays: number; status: 'EN_ATTENTE' | 'CONFIRME' | 'ANNULE' | 'REMBOURSE'; mode: 'LOCAL_TEST' | 'NON_VERIFIE';
    checkoutUrl: string | null; verifiedAt: string | null; validUntil: string | null; downloadAllowed: false;
}
export interface ReaderDocumentPayment {
    id: string; documentId: string; documentTitle: string; documentReference: string | null;
    provider: DocumentPaymentProvider; amountGnf: number; currency: string; durationDays: number;
    status: DocumentPayment['status']; mode: string; createdAt: string; validFrom: string | null; validUntil: string | null;
    accessStatus: 'EN_COURS' | 'EXPIRE' | 'REMBOURSE' | 'ANNULE' | 'NON_CONFIRME' | 'INDISPONIBLE' | 'A_VENIR';
    accessAlert: 'EXPIRING_SOON' | 'EXPIRED' | null;
    documentAvailable: boolean; canRead: boolean; downloadAllowed: false;
}
export interface ReaderDocumentPaymentsPage { items: ReaderDocumentPayment[]; page: number; size: number; hasMore: boolean; mode: string; evaluatedAt: string; alertWindowDays: number; downloadAllowed: false }
const id = (value: string) => { if (!UUID_RE.test(value)) throw new Error('Identifiant invalide.'); return value; };
/** Reader cookie only; payment status/price can never be supplied by the browser. */
export class DocumentPaymentsApi {
    constructor(private fetcher: typeof fetch = fetch.bind(globalThis)) {}
    private async call<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
        const response = await this.fetcher('/api/v1/portal/document-payments' + path, {
            method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal,
            headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'X-Requested-With': 'snae-portail' }) },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({})) as { code?: string; message?: string };
            throw new ApiError(response.status, error.code ?? 'DOCUMENT_PAYMENT_UNAVAILABLE', response.status === 401 ? 'Votre session lecteur a expiré. Reconnectez-vous.' : error.message ?? 'Le paiement est indisponible. Réessayez.');
        }
        return response.json() as Promise<T>;
    }
    history(page: number, status?: string, signal?: AbortSignal): Promise<ReaderDocumentPaymentsPage> { return this.call('/history' + query({ page, size: 20, status }), undefined, signal); }
    alerts(page: number, signal?: AbortSignal): Promise<ReaderDocumentPaymentsPage> { return this.call('/access-alerts' + query({ page, size: 20 }), undefined, signal); }
    purchased(page: number, signal?: AbortSignal): Promise<ReaderDocumentPaymentsPage> { return this.call('/purchased-documents' + query({ page, size: 20 }), undefined, signal); }
    purchasedDocument(document: string, signal?: AbortSignal): Promise<ReaderDocumentPaymentsPage> { return this.call('/purchased-documents/' + id(document), undefined, signal); }
    start(document: string, provider: DocumentPaymentProvider, key: string): Promise<DocumentPayment> { return this.call('/documents/' + id(document), { provider, idempotencyKey: id(key) }); }
    latest(document: string, signal?: AbortSignal): Promise<{ payment: DocumentPayment | null }> { return this.call('/documents/' + id(document) + '/latest', undefined, signal); }
    refresh(payment: string): Promise<DocumentPayment> { return this.call('/' + id(payment) + '/refresh', {}); }
}
export function testCheckoutUrl(payment: DocumentPayment): string | null {
    if (payment.mode !== 'LOCAL_TEST' || !payment.checkoutUrl || payment.status !== 'EN_ATTENTE') return null;
    try {
        const url = new URL(payment.checkoutUrl);
        return url.protocol === 'http:' && url.hostname === '127.0.0.1' && !!url.port && !url.username && !url.password && !url.hash && url.pathname.startsWith('/checkout/') ? url.href : null;
    } catch { return null; }
}
