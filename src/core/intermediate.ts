import { formatBytes } from './format.js';

/**
 * Phase intermédiaire : quand la phase courante d'un document est terminée (règle de conservation), on constate son passage en archives intermédiaires, avec le lieu et le
 * responsable. Le document devient « semi-actif » jusqu'à l'échéance, où le sort final s'applique. Les règles reprennent celles du serveur ; il reste seul juge.
 */
export interface IntermediateCandidate {
    eventId: string; documentId: string; reference: string; title: string; departmentId: string | null; baseDate: string; phaseDate: string; dueDate: string; rule: string | null;
    fileCount: number; totalBytes: number; phaseReached: boolean; blockers: string[];
}
export interface IntermediateLine {
    rank: number; documentId: string; reference: string; title: string; baseDate: string; phaseDate: string; dueDate: string; rule: string | null; fileCount: number; totalBytes: number;
}
export interface IntermediatePassageSummary {
    id: string; reference: string; institutionId: string; place: string; manager: string; versementReference: string | null; documentCount: number; totalBytes: number; createdById: string; createdAt: string;
}
export interface IntermediatePassage { summary: IntermediatePassageSummary; observations: string | null; lines: IntermediateLine[] }
export interface IntermediateDocumentInfo { passageId: string; reference: string; place: string; manager: string; versementReference: string | null; passedAt: string; phaseDate: string; dueDate: string }

export const MAX_LINES = 500;

export const BLOCKER_TEXT: Record<string, string> = {
    NO_INTERMEDIATE_PHASE: 'La règle de conservation ne prévoit pas de phase intermédiaire pour ce document.',
    DOCUMENT_DESTROYED: 'Le document est déjà détruit.',
    DOCUMENT_NOT_CLOSED: 'Le document n’est pas clos.',
    ALREADY_INTERMEDIATE: 'Le document n’est plus en phase courante : il est déjà passé en archives intermédiaires ou conservé définitivement.',
    RETENTION_EVENT_NOT_OPEN: 'L’échéance du document n’est plus ouverte : une décision est en cours ou close.',
    PHASE_NOT_REACHED: 'La phase courante n’est pas terminée.',
    NOT_ALLOWED_TO_PASS: 'Vous n’avez pas le droit de faire passer ce document (revue de la conservation et proposition de décision).'
};
export const blockerText = (code: string): string => BLOCKER_TEXT[code] ?? code.toLowerCase().replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()) + '.';

/** Peut-on cocher le document ? Quand rien ne le bloque. */
export const isSelectable = (c: Pick<IntermediateCandidate, 'blockers'>): boolean => c.blockers.length === 0;

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

export function volumeText(count: number, bytes: number): string {
    return count === 0 ? 'aucun document' : `${plural(count, 'document', 'documents')} (${formatBytes(bytes)})`;
}

export function selectionText(candidates: ReadonlyArray<Pick<IntermediateCandidate, 'eventId' | 'totalBytes'>>, selected: ReadonlySet<string>): string {
    const chosen = candidates.filter(c => selected.has(c.eventId));
    return chosen.length === 0 ? 'Aucun document choisi.' : `${volumeText(chosen.length, chosen.reduce((s, c) => s + c.totalBytes, 0))} choisi${chosen.length > 1 ? 's' : ''}.`;
}

export interface PassageForm { place: string; manager: string; versementReference: string; observations: string }
export const emptyPassage = (): PassageForm => ({ place: '', manager: '', versementReference: '', observations: '' });

export function passageProblems(form: PassageForm, selectedCount: number): string[] {
    const problems: string[] = [];
    if (!form.place.trim()) problems.push('Le lieu des archives intermédiaires est obligatoire.');
    else if (form.place.trim().length > 300) problems.push('Le lieu est limité à 300 caractères.');
    if (!form.manager.trim()) problems.push('Le responsable des archives intermédiaires est obligatoire.');
    else if (form.manager.trim().length > 300) problems.push('Le nom du responsable est limité à 300 caractères.');
    if (form.versementReference.trim().length > 255) problems.push('La référence du versement est limitée à 255 caractères.');
    if (form.observations.trim().length > 4000) problems.push('Les observations sont limitées à 4000 caractères.');
    if (selectedCount === 0) problems.push('Choisissez au moins un document.');
    if (selectedCount > MAX_LINES) problems.push(`Un passage compte ${MAX_LINES} documents au plus.`);
    return problems;
}

export function passageBody(form: PassageForm, institutionId: string, eventIds: readonly string[]): Record<string, unknown> {
    return {
        institutionId, place: form.place.trim(), manager: form.manager.trim(), versementReference: form.versementReference.trim() || null,
        observations: form.observations.trim() || null, eventIds: [...eventIds]
    };
}

/** « Phase courante terminée le 12 mai 2025 : le document peut passer » / « Passage prévu le … ». */
export function phaseStateText(c: Pick<IntermediateCandidate, 'phaseReached'>, day: (iso: string) => string, phaseDate: string): string {
    return c.phaseReached ? `Phase courante terminée le ${day(phaseDate)}.` : `Passage prévu le ${day(phaseDate)}.`;
}

/** Le texte de la fiche d'un document semi-actif : où il est, depuis quand, sous la garde de qui, jusqu'à quand. */
export function documentInfoText(info: Pick<IntermediateDocumentInfo, 'place' | 'manager' | 'phaseDate' | 'dueDate'>, day: (iso: string) => string): string {
    return `En archives intermédiaires depuis le ${day(info.phaseDate)} : ${info.place}, sous la garde de ${info.manager}. Conservé jusqu’à l’échéance du ${day(info.dueDate)}, où le sort final s’applique.`;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export interface PassageNames { institution: string; createdBy: string; date: (iso: string) => string; day: (iso: string) => string }

/** Le passage en page autonome à imprimer et signer : le lieu, le responsable, chaque document avec ses dates. */
export function passageHtml(p: IntermediatePassage, names: PassageNames): string {
    const row = (cells: string[]) => `<tr>${cells.map(x => `<td>${esc(x)}</td>`).join('')}</tr>`;
    const lines = p.lines.map(l => row([String(l.rank), l.reference, l.title, names.day(l.baseDate), names.day(l.phaseDate), names.day(l.dueDate), l.rule ?? '—', `${l.fileCount} · ${formatBytes(l.totalBytes)}`])).join('');
    const s = p.summary;
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Passage en archives intermédiaires ${esc(s.reference)}</title><style>
body{font:14px/1.5 Georgia,serif;color:#111;margin:32px auto;max-width:1000px;padding:0 16px}h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:24px 0 6px}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #888;padding:5px 8px;text-align:left;vertical-align:top;font-size:12.5px}th{background:#eee}
.sign{display:flex;justify-content:space-between;margin-top:56px}.sign div{width:40%;border-top:1px solid #333;padding-top:6px;text-align:center}
</style></head><body>
<h1>Passage en archives intermédiaires</h1><p>Référence : <strong>${esc(s.reference)}</strong> · établi le ${esc(names.date(s.createdAt))}</p>
<table>${row(['Institution', names.institution])}${row(['Lieu', s.place])}${row(['Responsable', s.manager])}${row(['Référence du versement', s.versementReference ?? '—'])}${row(['Établi par', names.createdBy])}${row(['Volume', volumeText(s.documentCount, s.totalBytes)])}</table>
${p.observations ? `<h2>Observations</h2><p>${esc(p.observations)}</p>` : ''}
<h2>Documents</h2><table><tr><th>N°</th><th>Cote</th><th>Intitulé</th><th>Date de base</th><th>Fin de phase courante</th><th>Échéance</th><th>Règle</th><th>Fichiers</th></tr>${lines}</table>
<div class="sign"><div>Le service versant</div><div>Le responsable des archives intermédiaires</div></div></body></html>`;
}
