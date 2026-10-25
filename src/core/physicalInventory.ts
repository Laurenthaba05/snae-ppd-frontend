import { parsePhysicalCode } from './physicalLabels.js';

/* Récolement d'une unité de rangement par lecture des étiquettes : on lit chaque archive (douchette, qui « tape » la cote ou le code du QR), celles qui sont là sont constatées présentes,
   celles qui manquent sont proposées « introuvables » à la fin. On constate, on ne devine pas : rien n'est déclaré introuvable sans une note écrite. */

/** Minuscules et sans accents : on retrouve une cote lue même si l'étiquette l'a imprimée sans ses accents. */
export const foldCote = (text: string): string => text.normalize('NFD').replace(/\p{M}+/gu, '').replace(/œ/gi, 'oe').replace(/æ/gi, 'ae').trim().toLowerCase();

export interface Expected { id: string; cote: string }

/** Ce que veut dire une lecture : une archive attendue dans l'unité, le code d'une archive qu'on ne connaît pas ici, une cote inconnue ici, ou rien. */
export type Reading =
    | { kind: 'EXPECTED'; id: string }
    | { kind: 'OTHER_CODE'; id: string }
    | { kind: 'COTE'; cote: string }
    | { kind: 'UNIT'; id: string }
    | { kind: 'EMPTY' };

export function readScan(text: string, expected: readonly Expected[]): Reading {
    const clean = text.trim();
    if (!clean) return { kind: 'EMPTY' };
    const code = parsePhysicalCode(clean);
    if (code?.kind === 'UNIT') return { kind: 'UNIT', id: code.id };
    if (code?.kind === 'ARCHIVE') return expected.some(e => e.id.toLowerCase() === code.id) ? { kind: 'EXPECTED', id: expected.find(e => e.id.toLowerCase() === code.id)!.id } : { kind: 'OTHER_CODE', id: code.id };
    const folded = foldCote(clean);
    const matches = expected.filter(e => foldCote(e.cote) === folded);
    // une cote qui désigne deux archives de l'unité n'est pas reconnue d'office : mieux vaut la relire par son QR
    if (matches.length === 1) return { kind: 'EXPECTED', id: matches[0]!.id };
    return { kind: 'COTE', cote: clean };
}

/** La note d'un constat « introuvable » : elle dit où l'on a cherché, au moins dix caractères (le serveur l'exige aussi). */
export const NOTE_MIN = 10;
export const lostNoteProblem = (note: string): string | null => note.trim().length >= NOTE_MIN ? null : `Dire qu’une archive est introuvable engage : indiquez où elle a été cherchée (au moins ${NOTE_MIN} caractères).`;
