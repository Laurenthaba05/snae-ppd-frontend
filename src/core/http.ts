export class ApiError extends Error {
    constructor(public readonly status: number, public readonly code: string, message: string, public readonly correlationId: string | null = null, public readonly fieldErrors: Record<string, string> = {}, public readonly uncertain = false) { super(message); this.name = 'ApiError'; }
}
export interface RequestOptions {
    method?: 'GET' | 'POST' | 'PUT';
    body?: unknown;
    signal?: AbortSignal;
    idempotencyKey?: string;
}
export interface Transport {
    request<T>(path: string, options?: RequestOptions): Promise<T>;
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
    async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
        if (!path.startsWith('/') || path.startsWith('//') || path.includes('..') || /[\\\r\n]/.test(path))
            throw new Error('Chemin API interdit.');
        const method = options.method ?? 'GET';
        if (method !== 'GET' && !/^[A-Za-z0-9._:-]{1,128}$/.test(options.idempotencyKey ?? ''))
            throw new Error('Idempotency-Key obligatoire.');
        const controller = new AbortController();
        this.controllers.add(controller);
        const relay = () => controller.abort();
        options.signal?.addEventListener('abort', relay, { once: true });
        if (options.signal?.aborted)
            controller.abort();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        const correlationId = crypto.randomUUID();
        try {
            const token = await this.token();
            if (!token) {
                this.unauthorized();
                throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Votre session a expiré. Reconnectez-vous.');
            }
            if (controller.signal.aborted)
                throw new DOMException('Aborted', 'AbortError');
            const response = await this.fetcher(this.base + path, { method, credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal,
                headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-Correlation-Id': correlationId, ...(method !== 'GET' ? { 'Content-Type': 'application/json', 'Idempotency-Key': options.idempotencyKey! } : {}) },
                ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }) });
            const id = response.headers.get('X-Correlation-Id') || correlationId;
            if (response.status === 401)
                this.unauthorized();
            const raw = await response.text();
            let data: unknown = null;
            try {
                data = raw ? JSON.parse(raw) : null;
            }
            catch {
                if (response.ok)
                    throw new ApiError(response.status, 'INVALID_RESPONSE', 'Réponse serveur illisible.', id, {}, method !== 'GET');
            }
            if (!response.ok) {
                const p = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
                const fields: Record<string, string> = {};
                if (p.fieldErrors && typeof p.fieldErrors === 'object')
                    for (const [k, v] of Object.entries(p.fieldErrors))
                        if (typeof v === 'string')
                            fields[k] = v;
                const fallback = response.status === 403 ? 'Accès refusé.' : response.status === 404 ? 'Ressource indisponible ou non autorisée.' : response.status === 409 ? 'Les données ont changé ou cette opération est en conflit.' : 'Le serveur ne peut pas traiter cette requête.';
                const message = response.status >= 500 ? 'Le service est momentanément indisponible.' : (typeof p.message === 'string' ? p.message : fallback);
                throw new ApiError(response.status, typeof p.code === 'string' ? p.code : 'HTTP_ERROR', message, typeof p.correlationId === 'string' ? p.correlationId : id, fields, method !== 'GET' && response.status >= 500);
            }
            return data as T;
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
}
export function query(params: Record<string, string | number | null | undefined>): string {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params))
        if (v !== null && v !== undefined && v !== '')
            q.set(k, String(v));
    const s = q.toString();
    return s ? '?' + s : '';
}
