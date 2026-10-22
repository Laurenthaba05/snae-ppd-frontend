/**
 * L'assistant d'aide du personnel (Moriba / Heny) : ce que le serveur renvoie, et ce qu'il faut pour afficher une réponse sans jamais la croire.
 * Le modèle de langue écrit un texte libre : il est affiché comme du texte (jamais comme du HTML), et les liens vers les écrans viennent du guide du serveur, jamais du texte du modèle.
 */
export type AssistantPersona = 'MORIBA' | 'HENY';

export interface PersonaInfo { code: AssistantPersona; nom: string; presentation: string }
export interface AssistantConfig { actif: boolean; personaParDefaut: AssistantPersona; personas: PersonaInfo[]; accueil: Record<string, string> }
/** Un écran de l'application que la réponse invite à ouvrir (la personne peut l'utiliser : le serveur le vérifie). */
export interface AssistantLink { cle: string; titre: string; route: string }
export interface AssistantReply { persona: AssistantPersona; personaNom: string; reponse: string; degrade: boolean; liens: AssistantLink[] }
export interface AssistantHistoryMessage { role: 'USER' | 'ASSISTANT'; contenu: string; creeLe: string }
export interface AssistantHistory { persona: AssistantPersona; messages: AssistantHistoryMessage[] }

/** Un message de la fenêtre : `failed` quand le serveur n'a pas pu y répondre ; `links` et `degraded` ne concernent que la dernière réponse reçue. */
export interface ChatMessage { id: string; role: 'USER' | 'ASSISTANT'; text: string; links?: AssistantLink[]; degraded?: boolean }

/** La longueur d'une question : celle que le serveur garde (il coupe au-delà). */
export const MAX_QUESTION = 1000;

/** L'écran où se trouve la personne : le premier segment de l'adresse après `/app` (vide : l'accueil). Seul un nom d'écran lisible est transmis. */
export function pageOf(pathname: string): string {
    const first = pathname.split('?')[0]!.split('#')[0]!.split('/').filter(Boolean)[1] ?? '';
    return /^[a-z0-9-]{1,40}$/.test(first) ? first : '';
}

/** Une adresse d'écran de l'application (`/app` ou `/app/<écran>`), ou rien : le seul lien que la fenêtre ouvre. */
export function safeRoute(route: string): string | null {
    return /^\/app(\/[a-z0-9-]{1,40})?$/.test(route) ? route : null;
}

/** Un morceau de texte, en gras ou non. */
export interface Inline { text: string; bold: boolean }
export type Block = { kind: 'p'; inline: Inline[] } | { kind: 'ul' | 'ol'; items: Inline[][] };

/** `**gras**` découpé en morceaux ; tout le reste (autres balisages, liens, HTML) reste du texte, jamais interprété. */
export function inlineOf(text: string): Inline[] {
    const parts = text.split('**');
    // un nombre impair de « ** » (gras jamais fermé) : le dernier « ** » n'est que du texte
    const balanced = parts.length % 2 === 1 ? parts : [...parts.slice(0, -2), parts[parts.length - 2] + '**' + parts[parts.length - 1]];
    return balanced.map((part, index) => ({ text: part, bold: index % 2 === 1 })).filter(piece => piece.text !== '');
}

/** Le Markdown léger d'une réponse (paragraphes, listes à puces ou numérotées, titres montrés en gras, **gras**) rangé en blocs affichables. */
export function blocksOf(markdown: string): Block[] {
    const blocks: Block[] = [];
    let paragraph: string[] = [];
    let list: { kind: 'ul' | 'ol'; items: string[] } | null = null;
    const closeParagraph = () => { if (paragraph.length) blocks.push({ kind: 'p', inline: inlineOf(paragraph.join(' ')) }); paragraph = []; };
    const closeList = () => { if (list) blocks.push({ kind: list.kind, items: list.items.map(inlineOf) }); list = null; };
    for (const raw of markdown.replace(/\r\n?/g, '\n').split('\n')) {
        const line = raw.trim();
        if (!line) { closeParagraph(); closeList(); continue; }
        const bullet = /^[-*•]\s+(.*)$/.exec(line);
        const numbered = /^\d{1,2}[.)]\s+(.*)$/.exec(line);
        const heading = /^#{1,6}\s+(.*)$/.exec(line);
        if (bullet || numbered) {
            closeParagraph();
            const kind = bullet ? 'ul' : 'ol';
            if (list && list.kind !== kind) closeList();
            list ??= { kind, items: [] };
            list.items.push((bullet ?? numbered)![1]!);
        } else if (heading) {
            closeParagraph(); closeList();
            blocks.push({ kind: 'p', inline: [{ text: heading[1]!.replace(/\*\*/g, ''), bold: true }] });
        } else {
            closeList();
            paragraph.push(line);
        }
    }
    closeParagraph(); closeList();
    return blocks;
}
