import { ApiError } from './http.js';

/** Une page de liste du serveur : jamais le tableau entier d'une table nationale. `hasMore` dit s'il y a une suite ; il n'y a volontairement aucun total. */
export interface PageResult<T> { items: T[]; page: number; size: number; hasMore: boolean }

/** La taille demandée à chaque page (le serveur plafonne à 200) et le nombre d'éléments au-delà duquel on renonce à tout charger d'un coup. */
export const LIST_PAGE_SIZE = 200;
export const LIST_MAX_ITEMS = 5000;

/**
 * Charge toutes les pages d'une liste, une à la fois, jusqu'à `limit` éléments. Au-delà, c'est une **erreur explicite** (413) et non une liste tronquée en silence : un écran qui
 * croirait avoir tout vu agirait sur un sous-ensemble sans le savoir. Le signal d'annulation passe par l'appel de page.
 */
export async function allPages<T>(fetchPage: (page: number, size: number) => Promise<PageResult<T>>, limit = LIST_MAX_ITEMS): Promise<T[]> {
    const items: T[] = [];
    for (let page = 0; ; page++) {
        const result = await fetchPage(page, LIST_PAGE_SIZE);
        items.push(...result.items);
        if (items.length > limit) throw new ApiError(413, 'LIST_TOO_LARGE', `La liste dépasse ${limit} éléments : elle ne se charge pas d'un coup. Affinez le périmètre ou la recherche.`);
        if (!result.hasMore || result.items.length === 0) return items;
        if (page >= Math.ceil(limit / LIST_PAGE_SIZE) + 1) throw new ApiError(413, 'LIST_TOO_LARGE', `La liste dépasse ${limit} éléments : elle ne se charge pas d'un coup. Affinez le périmètre ou la recherche.`);
    }
}
