import { isIngestion } from './ingestion.js';
export class ApiError extends Error {
    constructor(public readonly status: number, public readonly code: string, message: string, public readonly correlationId: string | null = null, public readonly fieldErrors: Record<string, string> = {}, public readonly uncertain = false) { super(message); this.name = 'ApiError'; }
}
export interface RequestOptions {
    method?: 'GET' | 'POST' | 'PUT';
    body?: unknown;
    signal?: AbortSignal;
    idempotencyKey?: string;
    responseType?: 'json' | 'blob';
}
export interface Transport {
    request<T>(path: string, options?: RequestOptions): Promise<T>;
    upload?<T>(path: string, file: File, fields: Record<string, string>, idempotencyKey: string, signal?: AbortSignal): Promise<T>;
}
export class HttpTransport implements Transport {
    private controllers = new Set<AbortController>();
    constructor(private base: string, private token: () => Promise<string | null>, private unauthorized: () => void, private fetcher: typeof fetch = fetch.bind(globalThis), private timeoutMs = 20000) {
        if (!base.startsWith('/api/') || base.includes('?') || base.includes('#') || base.includes('..') || base.endsWith('/'))
            throw new Error('API relative de même origine requise.');
    }
    abortAll(): void {
        for (const c of this.controllers)
            c.abort();
        this.controllers.clear();
    }
    private async perform<T>(path: string, init: RequestInit, correlationId: string, controller: AbortController, uncertainOnWrite: boolean, ingestionResponse = false, binary = false): Promise<T> {
        const response = await this.fetcher(this.base + path, init);
        const id = response.headers.get('X-Correlation-Id') || correlationId;
        if (response.status === 401) {
            // Expiring the session aborts all requests, including this response body.
            // Preserve the authentication failure without attempting to consume that body.
            this.unauthorized();
            throw new ApiError(401, 'SESSION_EXPIRED', 'Votre session a expiré. Reconnectez-vous.', id);
        }
        if (response.ok && binary) {
            if (response.status !== 200)
                throw new ApiError(response.status, 'INVALID_CONTENT_RESPONSE', 'Le serveur n’a pas renvoyé le fichier complet.', id);
            return await response.blob() as T;
        }
        const raw = await response.text();
        let data: unknown = null;
        try {
            data = raw ? JSON.parse(raw) : null;
        }
        catch {
            if (response.ok)
                throw new ApiError(response.status, 'INVALID_RESPONSE', 'Réponse serveur illisible.', id, {}, uncertainOnWrite);
        }
        if (ingestionResponse && isIngestion(data) &&
            ((response.status === 422 && data.status === 'REJECTED') || (response.status === 503 && data.status === 'RETRYABLE')))
            return data as T;
        if (!response.ok) {
            const p = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
            const fields: Record<string, string> = {};
            if (p.fieldErrors && typeof p.fieldErrors === 'object')
                for (const [k, v] of Object.entries(p.fieldErrors))
                    if (typeof v === 'string')
                        fields[k] = v;
            const fallback = response.status === 403 ? 'Accès refusé.' : response.status === 404 ? 'Ressource indisponible ou non autorisée.' : response.status === 409 ? 'Les données ont changé ou cette opération est en conflit.' : response.status === 422 ? 'Ressource rejetée par les contrôles du serveur.' : 'Le serveur ne peut pas traiter cette requête.';
            const message = response.status >= 500 ? 'Le service est momentanément indisponible.' : (typeof p.message === 'string' ? p.message : fallback);
            throw new ApiError(response.status, typeof p.code === 'string' ? p.code : 'HTTP_ERROR', message, typeof p.correlationId === 'string' ? p.correlationId : id, fields, uncertainOnWrite && response.status >= 500);
        }
        return data as T;
    }
    async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
        if (!path.startsWith('/') || path.startsWith('//') || path.includes('..') || /[\\\r\n]/.test(path))
            throw new Error('Chemin API interdit.');
        const method = options.method ?? 'GET';
        if (options.responseType === 'blob' && method !== 'GET')
            throw new Error('La lecture de fichiers nécessite une requête GET.');
        if (method !== 'GET' && !/^[A-Za-z0-9._:-]{1,128}$/.test(options.idempotencyKey ?? ''))
            throw new Error('Idempotency-Key obligatoire.');
        const controller = new AbortController();
        this.controllers.add(controller);
        const relay = () => controller.abort();
        options.signal?.addEventListener('abort', relay, { once: true });
        if (options.signal?.aborted)
            controller.abort();
        const timer = setTimeout(() => controller.abort(), options.responseType === 'blob' ? Math.max(this.timeoutMs, 120000) : this.timeoutMs);
        const correlationId = crypto.randomUUID();
        try {
            const token = await this.token();
            if (!token) {
                this.unauthorized();
                throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Votre session a expiré. Reconnectez-vous.');
            }
            if (controller.signal.aborted)
                throw new DOMException('Aborted', 'AbortError');
            return await this.perform<T>(path, { method, credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal,
                headers: { Accept: options.responseType === 'blob' ? '*/*' : 'application/json', Authorization: `Bearer ${token}`, 'X-Correlation-Id': correlationId, ...(method !== 'GET' ? { 'Content-Type': 'application/json', 'Idempotency-Key': options.idempotencyKey! } : {}) },
                ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }) }, correlationId, controller, method !== 'GET', false, options.responseType === 'blob');
        }
        catch (error) {
            if (error instanceof ApiError)
                throw error;
            if (options.signal?.aborted)
                throw new DOMException('Aborted', 'AbortError');
            throw new ApiError(0, 'NETWORK_UNCERTAIN', method === 'GET' ? 'Connexion impossible. Vérifiez le backend.' : 'La réponse n’est pas confirmée. Vérifiez la ressource ; un rejeu identique conservera la même clé.', correlationId, {}, method !== 'GET');
        }
        finally {
            clearTimeout(timer);
            this.controllers.delete(controller);
            options.signal?.removeEventListener('abort', relay);
        }
    }
    async upload<T>(path: string, file: File, fields: Record<string, string>, idempotencyKey: string, signal?: AbortSignal): Promise<T> {
        if (!path.startsWith('/') || path.startsWith('//') || path.includes('..') || /[\\\r\n]/.test(path))
            throw new Error('Chemin API interdit.');
        if (!/^[A-Za-z0-9._:-]{1,128}$/.test(idempotencyKey))
            throw new Error('Idempotency-Key obligatoire.');
        const controller = new AbortController();
        this.controllers.add(controller);
        const relay = () => controller.abort();
        signal?.addEventListener('abort', relay, { once: true });
        if (signal?.aborted)
            controller.abort();
        const timer = setTimeout(() => controller.abort(), Math.max(this.timeoutMs, 120000));
        const correlationId = crypto.randomUUID();
        try {
            const token = await this.token();
            if (!token) {
                this.unauthorized();
                throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Votre session a expiré. Reconnectez-vous.');
            }
            if (controller.signal.aborted)
                throw new DOMException('Aborted', 'AbortError');
            const body = new FormData();
            body.append('file', file);
            for (const [k, v] of Object.entries(fields))
                body.append(k, v);
            return await this.perform<T>(path, { method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal,
                headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-Correlation-Id': correlationId, 'Idempotency-Key': idempotencyKey }, body }, correlationId, controller, true, true);
        }
        catch (error) {
            if (error instanceof ApiError)
                throw error;
            if (signal?.aborted)
                throw new DOMException('Aborted', 'AbortError');
            throw new ApiError(0, 'NETWORK_UNCERTAIN', 'Le téléversement n’est pas confirmé. Vérifiez l’état avant de recommencer.', correlationId, {}, true);
        }
        finally {
            clearTimeout(timer);
            this.controllers.delete(controller);
            signal?.removeEventListener('abort', relay);
        }
    }
}
export function query(params: Record<string, string | number | null | undefined>): string {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params))
        if (v !== null && v !== undefined && v !== '')
            q.set(k, String(v));
    const s = q.toString();
    return s ? '?' + s : '';
}
