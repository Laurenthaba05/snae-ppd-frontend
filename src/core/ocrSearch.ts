import type { DocumentFile } from './types.js';

export interface OcrSearchFocus { resultId: string; page: number; query: string }
export interface OcrSearchTarget { file: DocumentFile; focus: OcrSearchFocus }
const tokens = (text: string): string[] => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr').match(/[\p{L}\p{N}]+/gu) ?? [];
/** Exact words, ignoring case, accents and punctuation; never highlight ALPHA inside ALPHABET. */
export function ocrSearchMatcher(query: string): (word: string) => boolean {
    const terms = new Set(tokens(query));
    return word => tokens(word).some(term => terms.has(term));
}

