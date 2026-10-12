import { formatBytes } from './format.js';
import { bordereauBlockerText, selectionText, volumeText } from './bordereaux.js';

/**
 * Transfert vers l'institution d'archives : le service versant constitue un bordereau de versement et le soumet ; l'institution destinataire accepte ou refuse chaque ligne
 * avec son accusé de réception ; une troisième personne remet, ce qui conserve définitivement le document et constate son nouveau détenteur. Les règles reprennent celles
 * du serveur pour guider la saisie ; le serveur reste seul juge.
 */
export type TransferStatus = 'BROUILLON' | 'SOUMIS' | 'ACCEPTE' | 'REFUSE' | 'EXECUTE' | 'ANNULE';
export type TransferLineStatus = 'INSCRITE' | 'PROPOSEE' | 'ACCEPTEE' | 'REFUSEE' | 'TRANSFEREE' | 'ANNULEE';

export interface TransferSummary {
    id: string; reference: string; institutionId: string; destinationId: string; title: string; status: TransferStatus; lines: number; registered: number; proposed: number; accepted: number;
    refused: number; transferred: number; cancelled: number; totalBytes: number; createdById: string; createdAt: string; submittedAt: string | null; receivedAt: string | null;
    completedAt: string | null; receiptReference: string | null; version: number;
}
export interface TransferLine {
    id: string; rank: number; status: TransferLineStatus; eventId: string; documentId: string; reference: string; title: string; baseDate: string; dueDate: string; rule: string | null;
    fileCount: number; totalBytes: number; contentFingerprint: string; actionId: string | null; refusalReason: string | null;
}
export interface Transfer {
    summary: TransferSummary; observations: string | null; submittedById: string | null; receivedById: string | null; actReference: string | null; procesVerbal: string | null;
    completedById: string | null; cancelledById: string | null; cancelledAt: string | null; cancellationReason: string | null; lines: TransferLine[];
}
export interface TransferCandidate {
    eventId: string; documentId: string; reference: string; title: string; departmentId: string | null; baseDate: string; dueDate: string; rule: string | null; fileCount: number;
    totalBytes: number; blockers: string[]; transferId: string | null; transferReference: string | null;
}
export interface TransferDestination { id: string; code: string; name: string }
export interface DocumentTransferInfo { transferId: string; reference: string; receiptReference: string | null; destinationId: string; transferredAt: string }

export const STATUS_LABELS: Record<TransferStatus, string> = {
    BROUILLON: 'Brouillon', SOUMIS: 'En attente de réception', ACCEPTE: 'Accepté, à remettre', REFUSE: 'Refusé', EXECUTE: 'Remis', ANNULE: 'Annulé'
};
export const LINE_LABELS: Record<TransferLineStatus, string> = {
    INSCRITE: 'Inscrit', PROPOSEE: 'En attente de réception', ACCEPTEE: 'Accepté, à remettre', REFUSEE: 'Refusé', TRANSFEREE: 'Remis', ANNULEE: 'Retiré'
};
export const MAX_LINES = 500;

export const TRANSFER_BLOCKERS: Record<string, string> = {
    NOT_A_TRANSFER: 'Le sort final de la règle n’est pas le transfert.',
    ALREADY_TRANSFERRED: 'Le document a déjà été remis à une institution d’archives.',
    ALREADY_IN_TRANSFER: 'Le document figure déjà sur un autre bordereau de versement en cours.',
    TRANSFER_NOT_ACCEPTED: 'Ce transfert n’a pas été accepté par l’institution destinataire.'
};
export const transferBlockerText = (code: string): string => TRANSFER_BLOCKERS[code] ?? bordereauBlockerText(code);
export const isSelectable = (c: Pick<TransferCandidate, 'blockers'>): boolean => c.blockers.length === 0;
export { selectionText, volumeText };

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

export function creationProblems(title: string, destinationId: string, selectedCount: number): string[] {
    const problems: string[] = [];
    if (!title.trim()) problems.push('L’intitulé du bordereau de versement est obligatoire.');
    else if (title.trim().length > 300) problems.push('L’intitulé est limité à 300 caractères.');
    if (!destinationId) problems.push('Choisissez l’institution d’archives destinataire.');
    if (selectedCount === 0) problems.push('Choisissez au moins un document.');
    if (selectedCount > MAX_LINES) problems.push(`Un bordereau compte ${MAX_LINES} documents au plus.`);
    return problems;
}

// ---------- réception
export interface ReceiptForm { actReference: string; procesVerbal: string; decisions: Record<string, boolean>; reasons: Record<string, string> }
export const emptyReceipt = (lineIds: readonly string[] = []): ReceiptForm => ({ actReference: '', procesVerbal: '', decisions: Object.fromEntries(lineIds.map(id => [id, true])), reasons: {} });

export function receiptProblems(form: ReceiptForm, lineIds: readonly string[]): string[] {
    const problems: string[] = [];
    const undecided = lineIds.filter(id => form.decisions[id] === undefined);
    if (undecided.length > 0) problems.push(`${plural(undecided.length, 'ligne n’est pas décidée', 'lignes ne sont pas décidées')} : acceptez-la ou refusez-la.`);
    const unreasoned = lineIds.filter(id => form.decisions[id] === false && !(form.reasons[id] ?? '').trim());
    if (unreasoned.length > 0) problems.push(`${plural(unreasoned.length, 'refus doit être motivé', 'refus doivent être motivés')}.`);
    if (form.actReference.trim().length > 255) problems.push('La référence de l’acte de versement est limitée à 255 caractères.');
    if (lineIds.some(id => form.decisions[id] === true)) {
        if (!form.procesVerbal.trim()) problems.push('Le procès-verbal de réception est obligatoire pour accepter des lignes.');
        else if (form.procesVerbal.trim().length > 15000) problems.push('Le procès-verbal est limité à 15000 caractères.');
    }
    return problems;
}

export function receiptBody(form: ReceiptForm, lineIds: readonly string[]): Record<string, unknown> {
    const accepted = lineIds.some(id => form.decisions[id] === true);
    return {
        actReference: form.actReference.trim() || null, procesVerbal: accepted ? form.procesVerbal.trim() : null,
        decisions: lineIds.map(id => form.decisions[id] === false ? { lineId: id, accept: false, reason: (form.reasons[id] ?? '').trim() } : { lineId: id, accept: true, reason: null })
    };
}
export function receiptSummary(form: ReceiptForm, lineIds: readonly string[]): string {
    const accepted = lineIds.filter(id => form.decisions[id] === true).length;
    const refused = lineIds.filter(id => form.decisions[id] === false).length;
    return `${plural(accepted, 'document accepté', 'documents acceptés')}, ${plural(refused, 'refusé', 'refusés')}.`;
}

// ---------- avancement
export interface Capabilities { propose: boolean; validate: boolean; execute: boolean }
export type TransferAction = 'ADD' | 'SUBMIT' | 'RECEIVE' | 'EXECUTE' | 'CANCEL' | 'RETIRE';

/** Ce que la personne peut faire maintenant, selon l'état et ses droits. La réception se fait côté institution destinataire : `canReceive` dit si elle y a le droit. */
export function availableActions(b: Pick<TransferSummary, 'status' | 'accepted'>, can: Capabilities, canReceive = can.validate): TransferAction[] {
    const actions: TransferAction[] = [];
    if (b.status === 'BROUILLON' && can.propose) actions.push('ADD', 'SUBMIT', 'CANCEL');
    if (b.status === 'SOUMIS') { if (canReceive) actions.push('RECEIVE'); if (can.propose) actions.push('RETIRE', 'CANCEL'); }
    if (b.status === 'ACCEPTE') { if (can.execute && b.accepted > 0) actions.push('EXECUTE'); if (can.propose) actions.push('RETIRE', 'CANCEL'); }
    return actions;
}

export function progressText(s: TransferSummary, named = ''): string {
    const destination = named.trim() || 'l’institution destinataire';
    switch (s.status) {
        case 'BROUILLON': return `Brouillon de ${volumeText(s.registered, s.totalBytes)} à verser à ${destination}. Il n’est pas encore soumis.`;
        case 'SOUMIS': return `${plural(s.proposed, 'ligne attend', 'lignes attendent')} la réception de ${destination}.`;
        case 'ACCEPTE': return `${plural(s.accepted, 'document accepté reste', 'documents acceptés restent')} à remettre à ${destination}${s.receiptReference ? ` (accusé ${s.receiptReference})` : ''}.`;
        case 'REFUSE': return `${destination.charAt(0).toUpperCase()}${destination.slice(1)} a refusé toutes les lignes : aucun document n’est remis, leurs échéances sont de nouveau disponibles.`;
        case 'EXECUTE': return `${plural(s.transferred, 'document remis', 'documents remis')} à ${destination}, conservés définitivement.`;
        case 'ANNULE': return 'Bordereau annulé : rien n’a été remis.';
    }
}

export function lineText(l: Pick<TransferLine, 'status' | 'refusalReason'>): string {
    return l.status === 'REFUSEE' ? `Refusé : ${l.refusalReason ?? 'motif non renseigné'}` : LINE_LABELS[l.status];
}

// ---------- impression
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export interface TransferNames { producer: string; destination: string; createdBy: string; receivedBy: string; date: (iso: string) => string; day: (iso: string | null) => string }

/** Le bordereau de versement en page autonome à imprimer et signer : en-tête, accusé de réception, chaque document avec l'empreinte de son contenu. */
export function transferHtml(t: Transfer, names: TransferNames): string {
    const row = (cells: string[]) => `<tr>${cells.map(x => `<td>${esc(x)}</td>`).join('')}</tr>`;
    const lines = t.lines.map(l => row([String(l.rank), l.reference, l.title, names.day(l.dueDate), `${l.fileCount} · ${formatBytes(l.totalBytes)}`, l.contentFingerprint, LINE_LABELS[l.status] + (l.refusalReason ? ` : ${l.refusalReason}` : '')])).join('');
    const s = t.summary;
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Bordereau de versement ${esc(s.reference)}</title><style>
body{font:14px/1.5 Georgia,serif;color:#111;margin:32px auto;max-width:1000px;padding:0 16px}h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:24px 0 6px}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #888;padding:5px 8px;text-align:left;vertical-align:top;font-size:12.5px}th{background:#eee}.hash{font-family:monospace;font-size:10px;word-break:break-all}
.sign{display:flex;justify-content:space-between;margin-top:56px}.sign div{width:30%;border-top:1px solid #333;padding-top:6px;text-align:center}
</style></head><body>
<h1>Bordereau de versement</h1><p>Référence : <strong>${esc(s.reference)}</strong> · ${esc(STATUS_LABELS[s.status])}</p>
<table>${row(['Intitulé', s.title])}${row(['Service versant', names.producer])}${row(['Institution destinataire', names.destination])}${row(['Constitué par', `${names.createdBy}, le ${names.date(s.createdAt)}`])}
${row(['Accusé de réception', s.receiptReference ? `${s.receiptReference}, le ${names.date(s.receivedAt ?? '')} (${names.receivedBy})` : '—'])}${row(['Acte de versement', t.actReference ?? '—'])}${row(['Volume', volumeText(s.lines, s.totalBytes)])}</table>
${t.observations ? `<h2>Observations</h2><p>${esc(t.observations)}</p>` : ''}
<h2>Documents</h2><table><tr><th>N°</th><th>Cote</th><th>Intitulé</th><th>Échéance</th><th>Fichiers</th><th>Empreinte du contenu</th><th>Décision</th></tr>${lines}</table>
${t.procesVerbal ? `<h2>Procès-verbal de réception</h2><p>${esc(t.procesVerbal).replace(/\n/g, '<br>')}</p>` : ''}
<div class="sign"><div>Le service versant</div><div>L’institution destinataire</div><div>Le responsable de la remise</div></div></body></html>`;
}
