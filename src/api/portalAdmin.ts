import type { Transport } from '../core/http.js';
import { query } from '../core/http.js';
import { uuid } from '../core/validation.js';
import type { MailStatus } from '../core/mail.js';
import type { AdminPlan, AdminSubscription, AdminReader, PortalPayment, PortalReceipt, PortalPage, PaymentFilters, AdminSubscriptionFilters, AdminReaderFilters, AdminAccessRequest, AccessRequestRow, AccessRequestFilters, AccessJournalEntry } from '../core/types.js';

/** L'administration du portail par le personnel habilité (formules, lecteurs, abonnements, caisse). Le système n'exécute aucun paiement : la caisse enregistre ce qui a été encaissé. */
export class PortalAdminApi {
    constructor(readonly transport: Transport) { }
    plans(signal?: AbortSignal): Promise<AdminPlan[]> { return this.transport.request('/portal-admin/plans', { signal }); }
    /** L'envoi de courrier : compteurs, pause éventuelle, échecs (destinataire masqué, jamais le contenu). */
    mailStatus(signal?: AbortSignal): Promise<MailStatus> { return this.transport.request('/mail/status', { signal }); }
    readers(filters: AdminReaderFilters, signal?: AbortSignal): Promise<PortalPage<AdminReader>> { return this.transport.request('/portal-admin/readers' + query({ ...filters }), { signal }); }
    subscriptions(filters: AdminSubscriptionFilters, signal?: AbortSignal): Promise<PortalPage<AdminSubscription>> { return this.transport.request('/portal-admin/subscriptions' + query({ ...filters }), { signal }); }
    subscription(id: string, signal?: AbortSignal): Promise<AdminSubscription> { return this.transport.request('/portal-admin/subscriptions/' + uuid(id), { signal }); }
    /** Retrouve un abonnement par la référence PAY-… que le lecteur donne au guichet. */
    subscriptionByReference(reference: string, signal?: AbortSignal): Promise<AdminSubscription> { return this.transport.request('/portal-admin/subscriptions/by-reference/' + encodeURIComponent(reference), { signal }); }
    payments(filters: PaymentFilters, signal?: AbortSignal): Promise<PortalPage<PortalPayment>> { return this.transport.request('/portal-admin/payments' + query({ ...filters }), { signal }); }
    receipt(paymentId: string, signal?: AbortSignal): Promise<PortalReceipt> { return this.transport.request('/portal-admin/payments/' + uuid(paymentId) + '/receipt', { signal }); }
    /** Les demandes d'accès des lecteurs aux documents de l'institution (permissions de consultation, jugées sur l'institution du document). */
    accessRequests(filters: AccessRequestFilters, signal?: AbortSignal): Promise<PortalPage<AccessRequestRow>> { return this.transport.request('/portal-admin/access-requests' + query({ ...filters }), { signal }); }
    accessRequest(id: string, signal?: AbortSignal): Promise<AdminAccessRequest> { return this.transport.request('/portal-admin/access-requests/' + uuid(id), { signal }); }
    accessRequestJournal(id: string, signal?: AbortSignal): Promise<AccessJournalEntry[]> { return this.transport.request('/portal-admin/access-requests/' + uuid(id) + '/journal', { signal }); }
    command<T>(path: string, body: unknown, key: string, method: 'POST' | 'PUT' = 'POST'): Promise<T> { return this.transport.request('/portal-admin' + path, { method, body, idempotencyKey: key }); }
}
