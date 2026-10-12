import { ApiError, query } from '../core/http.js';
import type { PortalReader, PublicPlan, PortalSubscription, PortalNoticeSummary, PortalNotice, PortalNoticeFilters, PortalCategory, PortalPage, PortalReadablePage, PortalReceipt, PortalAccessRequest } from '../core/types.js';

import type { PublicFindingAid, PublicNode } from '../core/findingAids.js';

const BASE = '/api/v1/portal';

/**
 * Le client du portail public. Les lecteurs ne passent pas par l'identité de l'institution : leur session est un cookie HttpOnly que le navigateur envoie
 * seul, et toute requête qui modifie quelque chose porte l'en-tête que seul ce portail envoie (protection contre les requêtes venues d'un autre site).
 */
export class PortalApi {
    constructor(private fetcher: typeof fetch = fetch.bind(globalThis), private timeoutMs = 20000) { }

    private async call<T>(path: string, method: 'GET' | 'POST' | 'PUT' = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
        if (!path.startsWith('/') || path.startsWith('//') || path.includes('..') || /[\\\r\n]/.test(path)) throw new Error('Chemin API interdit.');
        const controller = new AbortController();
        const relay = () => controller.abort();
        signal?.addEventListener('abort', relay, { once: true });
        if (signal?.aborted) controller.abort();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const response = await this.fetcher(BASE + path, { method, credentials: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal,
                headers: { Accept: 'application/json', ...(method !== 'GET' ? { 'Content-Type': 'application/json', 'X-Requested-With': 'snae-portail' } : {}) },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
            const raw = await response.text();
            let data: unknown = null;
            try { data = raw ? JSON.parse(raw) : null; } catch { if (response.ok) throw new ApiError(response.status, 'INVALID_RESPONSE', 'Réponse du serveur illisible.'); }
            if (!response.ok) {
                const p = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
                const fallback = response.status === 401 ? 'Connectez-vous pour continuer.' : response.status === 402 ? 'Un abonnement en cours est nécessaire pour lire ce document.' : response.status === 404 ? 'Ressource indisponible.'
                    : response.status === 429 ? 'Trop de demandes : réessayez dans un moment.' : response.status === 422 ? 'Demande refusée par les contrôles du serveur.' : 'Le serveur ne peut pas traiter cette demande.';
                throw new ApiError(response.status, typeof p.code === 'string' ? p.code : 'HTTP_ERROR', response.status >= 500 ? 'Le service est momentanément indisponible.' : (typeof p.message === 'string' ? p.message : fallback));
            }
            return data as T;
        } catch (error) {
            if (error instanceof ApiError) throw error;
            if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
            throw new ApiError(0, 'NETWORK', method === 'GET' ? 'Connexion impossible. Réessayez dans un moment.' : 'La réponse n’est pas confirmée : vérifiez votre compte avant de recommencer.');
        } finally { clearTimeout(timer); signal?.removeEventListener('abort', relay); }
    }

    // ---------- public
    termsVersion(signal?: AbortSignal): Promise<{ version: string }> { return this.call('/terms', 'GET', undefined, signal); }
    plans(signal?: AbortSignal): Promise<PublicPlan[]> { return this.call('/plans', 'GET', undefined, signal); }
    categories(signal?: AbortSignal): Promise<PortalCategory[]> { return this.call('/catalog/categories', 'GET', undefined, signal); }
    /** Les catégories de lecteurs définies par l'institution, proposées à l'inscription. */
    readerCategories(signal?: AbortSignal): Promise<PortalCategory[]> { return this.call('/reader-categories', 'GET', undefined, signal); }
    notices(filters: PortalNoticeFilters, signal?: AbortSignal): Promise<PortalPage<PortalNoticeSummary>> { return this.call('/catalog/notices' + query({ ...filters }), 'GET', undefined, signal); }
    notice(id: string, signal?: AbortSignal): Promise<PortalNotice> { return this.call('/catalog/notices/' + encodeURIComponent(id), 'GET', undefined, signal); }

    // ---------- instruments de recherche publiés
    findingAids(signal?: AbortSignal): Promise<PublicFindingAid[]> { return this.call('/inventaires', 'GET', undefined, signal); }
    findingAidNode(id: string, page: number, signal?: AbortSignal): Promise<PublicNode> {
        return this.call('/inventaires/notices/' + encodeURIComponent(id) + query({ page: page || undefined }), 'GET', undefined, signal);
    }

    // ---------- compte
    register(body: Record<string, unknown>): Promise<{ message: string }> { return this.call('/register', 'POST', body); }
    verifyEmail(jeton: string): Promise<{ message: string }> { return this.call('/verify-email', 'POST', { jeton }); }
    resendVerification(email: string): Promise<{ message: string }> { return this.call('/verification/resend', 'POST', { email }); }
    login(email: string, motDePasse: string): Promise<PortalReader> { return this.call('/login', 'POST', { email, motDePasse }); }
    logout(): Promise<{ message: string }> { return this.call('/logout', 'POST', {}); }
    forgotPassword(email: string): Promise<{ message: string }> { return this.call('/password/forgot', 'POST', { email }); }
    resetPassword(jeton: string, motDePasse: string): Promise<{ message: string }> { return this.call('/password/reset', 'POST', { jeton, motDePasse }); }

    // ---------- lecteur connecté
    me(signal?: AbortSignal): Promise<PortalReader> { return this.call('/me', 'GET', undefined, signal); }
    updateMe(body: Record<string, unknown>): Promise<PortalReader> { return this.call('/me', 'PUT', body); }
    changePassword(actuel: string, nouveau: string): Promise<{ message: string }> { return this.call('/me/password', 'POST', { actuel, nouveau }); }
    subscriptions(signal?: AbortSignal): Promise<PortalSubscription[]> { return this.call('/me/subscriptions', 'GET', undefined, signal); }
    subscribe(formuleId: string): Promise<PortalSubscription> { return this.call('/me/subscriptions', 'POST', { formuleId }); }
    cancelSubscription(id: string): Promise<PortalSubscription> { return this.call('/me/subscriptions/' + encodeURIComponent(id) + '/cancel', 'POST', {}); }
    receipt(numero: string, signal?: AbortSignal): Promise<PortalReceipt> { return this.call('/me/receipts/' + encodeURIComponent(numero), 'GET', undefined, signal); }

    // ---------- accès sur demande
    accessRequests(signal?: AbortSignal): Promise<PortalAccessRequest[]> { return this.call('/me/access-requests', 'GET', undefined, signal); }
    requestAccess(documentId: string, motif: string): Promise<PortalAccessRequest> { return this.call('/documents/' + encodeURIComponent(documentId) + '/access-requests', 'POST', { motif }); }
    cancelAccessRequest(id: string): Promise<PortalAccessRequest> { return this.call('/me/access-requests/' + encodeURIComponent(id) + '/cancel', 'POST', {}); }

    // ---------- lecture
    pages(documentId: string, signal?: AbortSignal): Promise<PortalReadablePage[]> { return this.call('/documents/' + encodeURIComponent(documentId) + '/pages', 'GET', undefined, signal); }
}
