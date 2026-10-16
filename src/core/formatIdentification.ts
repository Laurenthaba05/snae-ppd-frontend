import { formatBytes } from './format.js';

/**
 * Identification des formats par signature (V114) : un outil externe (Siegfried) compare le contenu de chaque fichier à la base PRONOM ; l'application garde le PUID reconnu et le
 * compare au type de média déclaré. Un fichier non reconnu est « inconnu », jamais présumé sûr. Le serveur reste seul juge.
 */
export type IdentificationState = 'IDENTIFIE' | 'AMBIGU' | 'INCONNU';
export type IdentificationConcordance = 'CONCORDE' | 'DIFFERE' | 'NON_EVALUEE';

export interface IdentificationStatus { enabled: boolean; configured: boolean; tool: string | null; toolVersion: string | null; signature: string | null; lastRunAt: string | null }
export interface IdentificationRow { puid: string | null; name: string | null; version: string | null; mediaType: string | null; files: number; bytes: number; mismatches: number; registered: boolean }
export interface IdentificationMismatch {
    fileId: string; documentId: string; documentReference: string; declaredMediaType: string | null; puid: string | null; name: string | null; mediaType: string | null;
}
export interface IdentificationSummary {
    institutionId: string; eligible: number; identified: number; ambiguous: number; unknown: number; pending: number; mismatched: number;
    rows: IdentificationRow[]; mismatches: IdentificationMismatch[];
}
export interface FileIdentification {
    fileId: string; fileName: string; status: IdentificationState; puid: string | null; name: string | null; version: string | null; mediaType: string | null;
    declaredMediaType: string | null; concordance: IdentificationConcordance; warning: string | null; candidates: number; tool: string; toolVersion: string | null;
    signature: string | null; identifiedAt: string;
}
export interface IdentificationRun { processed: number; identified: number; ambiguous: number; unknown: number; failed: number; failures: string[]; remaining: number }

export const IDENTIFICATION_STATE_LABELS: Record<IdentificationState, string> = { IDENTIFIE: 'Identifié', AMBIGU: 'Ambigu', INCONNU: 'Inconnu' };
export const CONCORDANCE_LABELS: Record<IdentificationConcordance, string> = {
    CONCORDE: 'Conforme au type déclaré', DIFFERE: 'Différent du type déclaré', NON_EVALUEE: 'Non comparé'
};

export function concordanceBadge(c: IdentificationConcordance): string { return c === 'CONCORDE' ? 'ACTIF' : c === 'DIFFERE' ? 'ECHEC' : 'BROUILLON'; }
export function stateBadge(s: IdentificationState): string { return s === 'IDENTIFIE' ? 'ACTIF' : s === 'AMBIGU' ? 'EN_COURS' : 'BROUILLON'; }

/** « Sur 12 fichiers : 9 identifiés, 1 ambigu, 1 inconnu ; 1 reste à identifier ; 2 ont un type déclaré différent. » */
export function identificationSummaryText(s: Pick<IdentificationSummary, 'eligible' | 'identified' | 'ambiguous' | 'unknown' | 'pending' | 'mismatched'>): string {
    if (s.eligible === 0) return 'Aucun fichier validé à identifier dans ce périmètre.';
    const parts: string[] = [];
    if (s.identified) parts.push(`${s.identified} identifié${s.identified > 1 ? 's' : ''}`);
    if (s.ambiguous) parts.push(`${s.ambiguous} ambigu${s.ambiguous > 1 ? 's' : ''}`);
    if (s.unknown) parts.push(`${s.unknown} inconnu${s.unknown > 1 ? 's' : ''}`);
    let text = `Sur ${s.eligible} fichier${s.eligible > 1 ? 's' : ''}`;
    if (parts.length) text += ` : ${parts.join(', ')}`;
    text += '.';
    if (s.pending) text += ` ${s.pending} ${s.pending > 1 ? 'restent' : 'reste'} à identifier.`;
    if (s.mismatched) text += ` ${s.mismatched} ${s.mismatched > 1 ? 'ont' : 'a'} un type déclaré différent du format reconnu.`;
    return text;
}

const FAILURES: Record<string, string> = {
    IDENTIFICATION_NOT_CONFIGURED: 'l’outil d’identification n’est pas configuré sur le serveur',
    IDENTIFICATION_TIMEOUT: 'l’outil d’identification n’a pas répondu à temps',
    IDENTIFICATION_TOOL_FAILED: 'l’outil d’identification a échoué',
    IDENTIFICATION_OUTPUT_INVALID: 'la réponse de l’outil est illisible',
    IDENTIFICATION_SOURCE_NOT_VERIFIED: 'un fichier n’est plus validé, sain et vérifié dans le stockage',
    IDENTIFICATION_SOURCE_INTEGRITY: 'le contenu relu ne correspond plus à l’empreinte enregistrée',
    STORAGE_UNAVAILABLE: 'le stockage est indisponible',
    STORAGE_BUSY: 'la capacité du stockage est atteinte',
    IDENTIFICATION_FAILED: 'échec inattendu (journaux d’exploitation)'
};
export const failureText = (code: string): string => FAILURES[code] ?? code;

/** Le bilan d'un passage, en une phrase. */
export function runText(r: IdentificationRun): string {
    if (r.processed === 0) return r.remaining === 0 ? 'Rien à identifier : tous les fichiers l’ont été.' : 'Aucun fichier n’a pu être traité.';
    const parts = [`${r.identified} identifié${r.identified > 1 ? 's' : ''}`, `${r.ambiguous} ambigu${r.ambiguous > 1 ? 's' : ''}`, `${r.unknown} inconnu${r.unknown > 1 ? 's' : ''}`];
    let text = `${r.processed} fichier${r.processed > 1 ? 's' : ''} traité${r.processed > 1 ? 's' : ''} : ${parts.join(', ')}`;
    if (r.failed) text += `, ${r.failed} en échec (${r.failures.map(failureText).join(' ; ')})`;
    text += r.remaining ? `. ${r.remaining} restent à identifier : relancez un passage.` : '. Plus aucun fichier à identifier.';
    return text;
}

export function rowFormatName(r: Pick<IdentificationRow, 'name' | 'version' | 'puid'>): string {
    const name = r.name ?? r.puid ?? 'Format inconnu';
    return r.version && !name.includes(r.version) ? `${name} ${r.version}` : name;
}
export const rowVolume = (r: Pick<IdentificationRow, 'bytes'>) => formatBytes(r.bytes);

export function mismatchText(m: IdentificationMismatch): string {
    return `${m.documentReference} : déclaré ${m.declaredMediaType ?? '—'}, reconnu ${m.mediaType ?? '—'}${m.puid ? ` (${m.puid})` : ''}`;
}
