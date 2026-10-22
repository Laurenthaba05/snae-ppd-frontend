import type { Transport } from '../core/http.js';
import type { AssistantConfig, AssistantHistory, AssistantPersona, AssistantReply } from '../core/assistant.js';

/** L'assistant d'aide du personnel (Moriba / Heny) : une conversation par personne connectée, qui explique l'application sans lire ni écrire aucune donnée de l'archive. */
export class AssistantApi {
    constructor(readonly transport: Transport) { }
    /** Disponible ? et les deux assistants avec leur message d'accueil. Lisible même quand l'assistant est désactivé (`actif` vaut alors faux). */
    config(signal?: AbortSignal): Promise<AssistantConfig> { return this.transport.request('/assistant/config', { signal }); }
    /** Le fil de la personne (vide s'il n'y en a pas) et l'assistant qu'elle a choisi. */
    history(signal?: AbortSignal): Promise<AssistantHistory> { return this.transport.request('/assistant/messages', { signal }); }
    /** Pose une question. `page` : l'écran où se trouve la personne (premier segment de l'adresse après /app), pour que l'assistant sache de quoi elle parle. */
    send(body: { message: string; persona?: AssistantPersona; page?: string }, key: string, signal?: AbortSignal): Promise<AssistantReply> {
        return this.transport.request('/assistant/messages', { method: 'POST', body, idempotencyKey: key, signal });
    }
    /** Efface les messages de la personne (pas son choix de Moriba ou Heny). */
    forget(key: string): Promise<void> { return this.transport.request('/assistant/forget', { method: 'POST', body: {}, idempotencyKey: key }); }
}
