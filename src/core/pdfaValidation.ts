import { formatDay } from './format.js';

/**
 * Validation PDF/A (V116) : un validateur externe (veraPDF) juge chaque PDF contre le profil qu'il déclare (ou un profil par défaut), l'application garde le constat et les règles
 * échouées. La déclaration XMP seule ne prouve rien ; un fichier illisible est « non analysable », jamais présumé conforme. Le serveur reste seul juge.
 */
export type PdfaState = 'CONFORME' | 'NON_CONFORME' | 'NON_ANALYSABLE';

export interface PdfaStatus { enabled: boolean; configured: boolean; tool: string | null; toolVersion: string | null; flavour: string; defaultFlavour: string; lastRunAt: string | null }
export interface PdfaProfileRow { code: string; name: string | null; compliant: number; nonCompliant: number }
export interface PdfaFailureRow { specification: string | null; clause: string; description: string; files: number }
export interface PdfaNonCompliantFile {
    fileId: string; documentId: string; documentReference: string; profileCode: string; profileName: string | null; declaration: string | null; failedRules: number; verifiedAt: string;
}
export interface PdfaSummary {
    institutionId: string; eligible: number; validated: number; compliant: number; nonCompliant: number; unreadable: number; pending: number;
    profiles: PdfaProfileRow[]; failures: PdfaFailureRow[]; files: PdfaNonCompliantFile[];
}
export interface PdfaRuleFailure { specification: string | null; clause: string; testNumber: number; description: string; failedChecks: number; message: string | null }
export interface PdfaFinding {
    profileCode: string; profileName: string | null; status: PdfaState; declaration: string | null; passedRules: number; failedRules: number; passedChecks: number;
    failedChecks: number; failures: PdfaRuleFailure[]; exception: string | null; tool: string; toolVersion: string | null; verifiedAt: string;
}
export interface FilePdfaValidation { fileId: string; fileName: string; findings: PdfaFinding[] }
export interface PdfaRun { processed: number; compliant: number; nonCompliant: number; unreadable: number; failed: number; failures: string[]; remaining: number }

export const PDFA_STATE_LABELS: Record<PdfaState, string> = { CONFORME: 'Conforme', NON_CONFORME: 'Non conforme', NON_ANALYSABLE: 'Non analysable' };
export function pdfaBadge(s: PdfaState): string { return s === 'CONFORME' ? 'ACTIF' : s === 'NON_CONFORME' ? 'ECHEC' : 'BROUILLON'; }

/** « PDF/A-2b » d'après le code court d'un profil ; les profils d'accessibilité et inconnus gardent leur intitulé. */
export function profileLabel(code: string, name: string | null): string {
    if (name) return name.replace(/\s+validation profile$/i, '');
    if (code === 'aucun') return 'Aucun profil (fichier illisible)';
    return code;
}

/** « Sur 12 PDF : 9 conformes, 2 non conformes, 1 non analysable ; 3 restent à valider. » */
export function pdfaSummaryText(s: Pick<PdfaSummary, 'eligible' | 'validated' | 'compliant' | 'nonCompliant' | 'unreadable' | 'pending'>): string {
    if (s.eligible === 0) return 'Aucun PDF validé à contrôler dans ce périmètre.';
    const parts: string[] = [];
    if (s.compliant) parts.push(`${s.compliant} conforme${s.compliant > 1 ? 's' : ''}`);
    if (s.nonCompliant) parts.push(`${s.nonCompliant} non conforme${s.nonCompliant > 1 ? 's' : ''}`);
    if (s.unreadable) parts.push(`${s.unreadable} non analysable${s.unreadable > 1 ? 's' : ''}`);
    let text = `Sur ${s.eligible} PDF`;
    if (parts.length) text += ` : ${parts.join(', ')}`;
    text += '.';
    if (s.pending) text += ` ${s.pending} ${s.pending > 1 ? 'restent' : 'reste'} à valider.`;
    return text;
}

const FAILURES: Record<string, string> = {
    PDFA_NOT_CONFIGURED: 'le validateur PDF/A n’est pas configuré sur le serveur',
    PDFA_TIMEOUT: 'le validateur n’a pas répondu à temps',
    PDFA_TOOL_FAILED: 'le validateur a échoué',
    PDFA_OUTPUT_INVALID: 'la réponse du validateur est illisible',
    PDFA_SOURCE_NOT_VERIFIED: 'un fichier n’est plus validé, sain et vérifié dans le stockage',
    PDFA_SOURCE_INTEGRITY: 'le contenu relu ne correspond plus à l’empreinte enregistrée',
    PDFA_NOT_A_PDF: 'un fichier n’est pas un PDF',
    STORAGE_UNAVAILABLE: 'le stockage est indisponible',
    STORAGE_BUSY: 'la capacité du stockage est atteinte',
    PDFA_FAILED: 'échec inattendu (journaux d’exploitation)'
};
export const pdfaFailureText = (code: string): string => FAILURES[code] ?? code;

/** Le bilan d'un passage, en une phrase. */
export function pdfaRunText(r: PdfaRun): string {
    if (r.processed === 0) return r.remaining === 0 ? 'Rien à valider : tous les PDF l’ont été.' : 'Aucun fichier n’a pu être traité.';
    const parts = [`${r.compliant} conforme${r.compliant > 1 ? 's' : ''}`, `${r.nonCompliant} non conforme${r.nonCompliant > 1 ? 's' : ''}`,
        `${r.unreadable} non analysable${r.unreadable > 1 ? 's' : ''}`];
    let text = `${r.processed} fichier${r.processed > 1 ? 's' : ''} traité${r.processed > 1 ? 's' : ''} : ${parts.join(', ')}`;
    if (r.failed) text += `, ${r.failed} en échec (${r.failures.map(pdfaFailureText).join(' ; ')})`;
    text += r.remaining ? `. ${r.remaining} restent à valider : relancez un passage.` : '. Plus aucun PDF à valider.';
    return text;
}

/** Une règle échouée, lisible : « 6.6.2.1 (ISO 19005-2:2011) — 1 contrôle ». */
export function failureLine(f: PdfaRuleFailure): string {
    const spec = f.specification ? ` (${f.specification})` : '';
    return `${f.clause}${spec} — ${f.failedChecks} contrôle${f.failedChecks > 1 ? 's' : ''}`;
}

/** Ce que le profil par défaut signifie pour un fichier qui ne déclare rien. */
export function profileModeText(status: Pick<PdfaStatus, 'flavour' | 'defaultFlavour'>): string {
    return status.flavour === '0'
        ? `Chaque PDF est jugé contre le profil qu’il déclare ; un PDF qui ne déclare rien est jugé contre PDF/A-${status.defaultFlavour} (il dit alors s’il pourrait y être conforme).`
        : `Tous les PDF sont jugés contre le même profil, imposé par la configuration : ${status.flavour}.`;
}

export const nonCompliantText = (f: PdfaNonCompliantFile): string =>
    `${f.documentReference} : ${profileLabel(f.profileCode, f.profileName)}${f.declaration ? `, déclare ${f.declaration}` : ', ne déclare aucun profil'} — ${f.failedRules} règle${f.failedRules > 1 ? 's' : ''} échouée${f.failedRules > 1 ? 's' : ''} (${formatDay(f.verifiedAt)})`;
