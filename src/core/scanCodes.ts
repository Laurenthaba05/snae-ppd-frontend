/**
 * Codes SNAE imprimés sur les feuilles séparatrices et les étiquettes de numérisation :
 *   SNAE:E:<identifiant>   un élément de numérisation      SNAE:L:<identifiant>   un lot
 * Forme longue (QR) : l'UUID complet, en majuscules (le mode alphanumérique du QR est plus compact).
 * Forme courte (Code 128) : les 8 premiers caractères hexadécimaux de l'UUID, assez courte pour tenir sur une feuille A4 ;
 * elle n'est résolue qu'au sein d'un projet connu, et refusée si elle est ambiguë.
 */
export type CodeKind = 'ELEMENT' | 'LOT';
export interface ScanCode { kind: CodeKind; /** UUID complet ou préfixe hexadécimal, en minuscules, sans tirets. */ ref: string; full: boolean }

const LETTER: Record<CodeKind, string> = { ELEMENT: 'E', LOT: 'L' };
const UUID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
export const SHORT_LENGTH = 8;
const compact = (id: string) => id.replace(/-/g, '').toLowerCase();

export function buildCode(kind: CodeKind, id: string, form: 'long' | 'short' = 'long'): string {
    if (!UUID.test(id)) throw new Error('Identifiant invalide : un UUID est attendu.');
    return form === 'long' ? `SNAE:${LETTER[kind]}:${id.toUpperCase()}` : `SNAE:${LETTER[kind]}:${compact(id).slice(0, SHORT_LENGTH).toUpperCase()}`;
}

/** Interprète le texte lu (QR, Code 128, douchette ou saisie) ; null si ce n'est pas un code SNAE. */
export function parseCode(text: string): ScanCode | null {
    const match = /^SNAE:([EL]):([0-9A-F-]{8,36})$/i.exec(text.trim());
    if (!match) return null;
    const kind: CodeKind = match[1]!.toUpperCase() === 'E' ? 'ELEMENT' : 'LOT';
    const ref = compact(match[2]!);
    if (UUID.test(match[2]!)) return { kind, ref, full: true };
    return /^[0-9a-f]{8,31}$/.test(ref) && !match[2]!.includes('-') ? { kind, ref, full: false } : null;
}

export const matchesId = (code: ScanCode, id: string) => code.full ? compact(id) === code.ref : compact(id).startsWith(code.ref);

/** Retrouve l'élément ou le lot désigné parmi `items` : un seul candidat, ou ambigu. */
export function resolveAmong<T extends { id: string }>(code: ScanCode, items: readonly T[]): { match: T | null; ambiguous: boolean } {
    const hits = items.filter(item => matchesId(code, item.id));
    return { match: hits.length === 1 ? hits[0]! : null, ambiguous: hits.length > 1 };
}
