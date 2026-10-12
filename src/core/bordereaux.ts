import { formatBytes } from './format.js';
import { blockerText } from './destruction.js';

/**
 * Bordereau d'élimination : une liste de documents échus, soumise au visa d'une autorité ligne par ligne, puis détruits un à un avec leur certificat. Les règles reprennent celles
 * du serveur pour guider la saisie ; le serveur reste seul juge. Trois fonctions distinctes : constituer et soumettre (proposer), viser (valider), détruire (exécuter).
 */
export type BordereauStatus = 'BROUILLON' | 'SOUMIS' | 'VISE' | 'REFUSE' | 'EXECUTE' | 'ANNULE';
export type BordereauLineStatus = 'INSCRITE' | 'PROPOSEE' | 'ACCEPTEE' | 'REFUSEE' | 'DETRUITE' | 'ANNULEE';

export interface BordereauSummary {
    id: string; reference: string; institutionId: string; title: string; status: BordereauStatus; lines: number; registered: number; proposed: number; accepted: number; refused: number;
    destroyed: number; cancelled: number; totalBytes: number; createdById: string; createdAt: string; submittedAt: string | null; visaAt: string | null; completedAt: string | null; version: number;
}
export interface BordereauLine {
    id: string; rank: number; status: BordereauLineStatus; eventId: string; documentId: string; reference: string; title: string; baseDate: string; dueDate: string; rule: string | null;
    fileCount: number; totalBytes: number; actionId: string | null; refusalReason: string | null; certificateId: string | null; certificateReference: string | null; attempts: number; lastError: string | null;
}
export interface Bordereau {
    summary: BordereauSummary; observations: string | null; authority: string | null; visaReference: string | null; visaDate: string | null; procesVerbal: string | null; submittedById: string | null;
    visaById: string | null; cancelledById: string | null; cancelledAt: string | null; cancellationReason: string | null; fingerprint: string | null; lines: BordereauLine[];
}
export interface BordereauCandidate {
    eventId: string; documentId: string; reference: string; title: string; departmentId: string | null; baseDate: string; dueDate: string; rule: string | null; fileCount: number; totalBytes: number;
    blockers: string[]; bordereauId: string | null; bordereauReference: string | null;
}
export interface BordereauLineFailure { lineId: string; rank: number; reference: string; code: string; message: string }
export interface BordereauExecution { bordereau: Bordereau; destroyedNow: number; failures: BordereauLineFailure[]; remaining: number }
export interface BordereauReadiness { bordereauId: string; lines: Array<{ lineId: string; blockers: string[] }> }

export const STATUS_LABELS: Record<BordereauStatus, string> = {
    BROUILLON: 'Brouillon', SOUMIS: 'Soumis au visa', VISE: 'Visé', REFUSE: 'Refusé', EXECUTE: 'Détruit', ANNULE: 'Annulé'
};
export const LINE_LABELS: Record<BordereauLineStatus, string> = {
    INSCRITE: 'Inscrit', PROPOSEE: 'En attente de visa', ACCEPTEE: 'Visé, à détruire', REFUSEE: 'Refusé', DETRUITE: 'Détruit', ANNULEE: 'Retiré'
};
export const MAX_LINES = 500;
export const EXECUTION_BATCH = 25;

/** Les obstacles d'une inscription, en plus de ceux de la destruction. */
export const CANDIDATE_BLOCKERS: Record<string, string> = {
    NOT_AN_ELIMINATION: 'Le sort final de la règle n’est pas l’élimination.',
    RETENTION_EVENT_NOT_DUE: 'L’échéance n’est pas arrivée, ou une décision est déjà en cours.',
    DOCUMENT_DESTROYED: 'Le document est déjà détruit.',
    DOCUMENT_NOT_CLOSED: 'Le document n’est pas clos.',
    DOCUMENT_ESSENTIAL: 'Document essentiel : retirez d’abord la mention, avec son motif.',
    ACTIVE_LEGAL_HOLD: 'Un gel juridique actif bloque le document.',
    DOCUMENT_WORKFLOW_ACTIVE: 'Un circuit de traitement est toujours actif sur le document.',
    ALREADY_IN_BORDEREAU: 'Le document figure déjà sur un autre bordereau en cours.'
};
export const bordereauBlockerText = (code: string): string => CANDIDATE_BLOCKERS[code] ?? blockerText(code);

/** L'échéance peut-elle être cochée ? Elle l'est quand rien ne la bloque. */
export const isSelectable = (c: Pick<BordereauCandidate, 'blockers'>): boolean => c.blockers.length === 0;

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/** « 12 documents (3,4 Mo) » : ce que contient une sélection ou un bordereau. */
export function volumeText(count: number, bytes: number): string {
    return count === 0 ? 'aucun document' : `${plural(count, 'document', 'documents')} (${formatBytes(bytes)})`;
}
export function selectionText(candidates: ReadonlyArray<Pick<BordereauCandidate, 'eventId' | 'totalBytes'>>, selected: ReadonlySet<string>): string {
    const chosen = candidates.filter(c => selected.has(c.eventId));
    return chosen.length === 0 ? 'Aucun document choisi.' : `${volumeText(chosen.length, chosen.reduce((s, c) => s + c.totalBytes, 0))} choisi${chosen.length > 1 ? 's' : ''}.`;
}

export function creationProblems(title: string, selectedCount: number): string[] {
    const problems: string[] = [];
    if (!title.trim()) problems.push('L’intitulé du bordereau est obligatoire.');
    else if (title.trim().length > 300) problems.push('L’intitulé est limité à 300 caractères.');
    if (selectedCount === 0) problems.push('Choisissez au moins un document.');
    if (selectedCount > MAX_LINES) problems.push(`Un bordereau compte ${MAX_LINES} documents au plus.`);
    return problems;
}

// ---------- visa
export interface VisaForm {
    authority: string; visaReference: string; visaDate: string; procesVerbal: string;
    /** Par ligne : accepter (true) ou refuser (false) ; une ligne absente n'est pas encore décidée. */
    decisions: Record<string, boolean>;
    reasons: Record<string, string>;
}
export const emptyVisa = (lineIds: readonly string[] = [], today = ''): VisaForm => ({
    authority: '', visaReference: '', visaDate: today, procesVerbal: '', decisions: Object.fromEntries(lineIds.map(id => [id, true])), reasons: {}
});

export function visaProblems(form: VisaForm, lineIds: readonly string[], today: string): string[] {
    const problems: string[] = [];
    if (!form.authority.trim()) problems.push('L’autorité qui vise est obligatoire.');
    else if (form.authority.trim().length > 300) problems.push('Le nom de l’autorité est limité à 300 caractères.');
    const undecided = lineIds.filter(id => form.decisions[id] === undefined);
    if (undecided.length > 0) problems.push(`${plural(undecided.length, 'ligne n’est pas décidée', 'lignes ne sont pas décidées')} : acceptez-la ou refusez-la.`);
    const unreasoned = lineIds.filter(id => form.decisions[id] === false && !(form.reasons[id] ?? '').trim());
    if (unreasoned.length > 0) problems.push(`${plural(unreasoned.length, 'refus doit être motivé', 'refus doivent être motivés')}.`);
    if (lineIds.some(id => (form.reasons[id] ?? '').trim().length > 4000)) problems.push('Le motif d’un refus est limité à 4000 caractères.');
    const accepted = lineIds.filter(id => form.decisions[id] === true).length;
    if (accepted > 0) {
        if (!form.visaReference.trim()) problems.push('La référence du visa est obligatoire pour accepter des lignes.');
        else if (form.visaReference.trim().length > 255) problems.push('La référence du visa est limitée à 255 caractères.');
        if (!form.visaDate) problems.push('La date du visa est obligatoire pour accepter des lignes.');
        else if (form.visaDate > today) problems.push('La date du visa ne peut pas être dans le futur.');
        if (!form.procesVerbal.trim()) problems.push('Le procès-verbal de la décision est obligatoire pour accepter des lignes.');
        else if (form.procesVerbal.trim().length > 15000) problems.push('Le procès-verbal est limité à 15000 caractères.');
    }
    return problems;
}

/** Le corps de la requête : la référence, la date et le procès-verbal ne partent que si au moins une ligne est acceptée. */
export function visaBody(form: VisaForm, lineIds: readonly string[]): Record<string, unknown> {
    const accepted = lineIds.some(id => form.decisions[id] === true);
    return {
        authority: form.authority.trim(), visaReference: accepted ? form.visaReference.trim() : null, visaDate: accepted ? form.visaDate : null, procesVerbal: accepted ? form.procesVerbal.trim() : null,
        decisions: lineIds.map(id => form.decisions[id] === false ? { lineId: id, accept: false, reason: (form.reasons[id] ?? '').trim() } : { lineId: id, accept: true, reason: null })
    };
}
export function visaSummary(form: VisaForm, lineIds: readonly string[]): string {
    const accepted = lineIds.filter(id => form.decisions[id] === true).length;
    const refused = lineIds.filter(id => form.decisions[id] === false).length;
    return `${plural(accepted, 'document accepté', 'documents acceptés')}, ${plural(refused, 'refusé', 'refusés')}.`;
}

// ---------- état d'avancement
export interface Capabilities { propose: boolean; validate: boolean; execute: boolean }

/** Ce que la personne peut faire maintenant, selon l'état du bordereau et ses droits ; vide si rien. Les actions sont nommées comme les boutons. */
export function availableActions(b: Pick<BordereauSummary, 'status' | 'accepted' | 'proposed'>, can: Capabilities): Array<'ADD' | 'SUBMIT' | 'VISA' | 'EXECUTE' | 'CANCEL' | 'RETIRE'> {
    const actions: Array<'ADD' | 'SUBMIT' | 'VISA' | 'EXECUTE' | 'CANCEL' | 'RETIRE'> = [];
    if (b.status === 'BROUILLON' && can.propose) actions.push('ADD', 'SUBMIT', 'CANCEL');
    if (b.status === 'SOUMIS') { if (can.validate) actions.push('VISA'); if (can.propose) actions.push('RETIRE', 'CANCEL'); }
    if (b.status === 'VISE') { if (can.execute && b.accepted > 0) actions.push('EXECUTE'); if (can.propose) actions.push('RETIRE', 'CANCEL'); }
    return actions;
}

/** La phrase qui dit où en est le bordereau et ce qui vient ensuite. */
export function progressText(s: BordereauSummary): string {
    switch (s.status) {
        case 'BROUILLON': return `Brouillon de ${volumeText(s.registered, s.totalBytes)}. Il n’est pas encore soumis à l’autorité.`;
        case 'SOUMIS': return `${plural(s.proposed, 'ligne attend', 'lignes attendent')} le visa de l’autorité. Rien ne peut être détruit avant son visa.`;
        case 'VISE': return s.accepted > 0
            ? `${plural(s.destroyed, 'document détruit', 'documents détruits')} sur ${s.destroyed + s.accepted} visés : ${plural(s.accepted, 'reste', 'restent')} à détruire.`
            : `${plural(s.destroyed, 'document détruit', 'documents détruits')}.`;
        case 'REFUSE': return 'L’autorité a refusé toutes les lignes : aucun document n’est détruit, leurs échéances sont de nouveau disponibles.';
        case 'EXECUTE': return `${plural(s.destroyed, 'document détruit', 'documents détruits')}, chacun avec son certificat de destruction.`;
        case 'ANNULE': return 'Bordereau annulé : aucune destruction n’a eu lieu.';
    }
}

/** Le résumé d'un lot de destruction pour la personne qui l'a lancé. */
export function executionText(r: Pick<BordereauExecution, 'destroyedNow' | 'failures' | 'remaining'>): string {
    const parts = [plural(r.destroyedNow, 'document détruit', 'documents détruits')];
    if (r.failures.length > 0) parts.push(`${plural(r.failures.length, 'échec', 'échecs')} (voir ci-dessous)`);
    if (r.remaining > 0) parts.push(`${plural(r.remaining, 'reste', 'restent')} à détruire`);
    return parts.join(' ; ') + '.';
}

/** L'état d'une ligne, en une phrase, avec ce qui la bloque ou ce qu'elle a produit. */
export function lineText(l: Pick<BordereauLine, 'status' | 'refusalReason' | 'certificateReference' | 'lastError' | 'attempts'>, blockers: readonly string[] = []): string {
    switch (l.status) {
        case 'REFUSEE': return `Refusé : ${l.refusalReason ?? 'motif non renseigné'}`;
        case 'DETRUITE': return `Détruit · certificat ${l.certificateReference ?? ''}`.trim();
        case 'ACCEPTEE':
            if (blockers.length > 0) return 'Bloqué : ' + blockers.map(bordereauBlockerText).join(' ');
            return l.lastError ? `Échec à la dernière tentative (${l.attempts} essai${l.attempts > 1 ? 's' : ''}) : ${bordereauBlockerText(l.lastError)}` : LINE_LABELS.ACCEPTEE;
        default: return LINE_LABELS[l.status];
    }
}

// ---------- impression
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export interface BordereauNames { institution: string; createdBy: string; submittedBy: string; visaBy: string; date: (iso: string) => string; day: (iso: string | null) => string }

/** Le bordereau en page autonome à imprimer et signer : en-tête, lignes avec leur sort, visa, certificats. */
export function bordereauHtml(b: Bordereau, names: BordereauNames): string {
    const row = (cells: string[]) => `<tr>${cells.map(x => `<td>${esc(x)}</td>`).join('')}</tr>`;
    const lines = b.lines.map(l => row([String(l.rank), l.reference, l.title, names.day(l.baseDate), names.day(l.dueDate), l.rule ?? '—', `${l.fileCount} · ${formatBytes(l.totalBytes)}`,
        LINE_LABELS[l.status] + (l.refusalReason ? ` : ${l.refusalReason}` : ''), l.certificateReference ?? '—'])).join('');
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Bordereau d’élimination ${esc(b.summary.reference)}</title><style>
body{font:14px/1.5 Georgia,serif;color:#111;margin:32px auto;max-width:1000px;padding:0 16px}h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:24px 0 6px}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #888;padding:5px 8px;text-align:left;vertical-align:top;font-size:12.5px}th{background:#eee}.hash{font-family:monospace;font-size:11px;word-break:break-all}
.sign{display:flex;justify-content:space-between;margin-top:56px}.sign div{width:30%;border-top:1px solid #333;padding-top:6px;text-align:center}
</style></head><body>
<h1>Bordereau d’élimination</h1><p>Référence : <strong>${esc(b.summary.reference)}</strong> · ${esc(STATUS_LABELS[b.summary.status])}</p>
<table>${row(['Intitulé', b.summary.title])}${row(['Institution', names.institution])}${row(['Constitué par', `${names.createdBy}, le ${names.date(b.summary.createdAt)}`])}${row(['Soumis', b.summary.submittedAt ? `${names.submittedBy}, le ${names.date(b.summary.submittedAt)}` : '—'])}${row(['Autorité qui vise', b.authority ?? '—'])}${row(['Visa', b.visaReference ? `${b.visaReference}, du ${names.day(b.visaDate)}` : '—'])}${row(['Visé par', b.summary.visaAt ? `${names.visaBy}, le ${names.date(b.summary.visaAt)}` : '—'])}${row(['Volume', volumeText(b.summary.lines, b.summary.totalBytes)])}</table>
${b.observations ? `<h2>Observations</h2><p>${esc(b.observations)}</p>` : ''}
<h2>Documents</h2><table><tr><th>N°</th><th>Cote</th><th>Intitulé</th><th>Date de base</th><th>Échéance</th><th>Règle</th><th>Fichiers</th><th>Décision</th><th>Certificat</th></tr>${lines}</table>
${b.procesVerbal ? `<h2>Procès-verbal de la décision</h2><p>${esc(b.procesVerbal).replace(/\n/g, '<br>')}</p>` : ''}
${b.fingerprint ? `<p>Empreinte des certificats de destruction : <span class="hash">${esc(b.fingerprint)}</span></p>` : ''}
<div class="sign"><div>Le service versant</div><div>L’autorité qui vise</div><div>Le responsable de la destruction</div></div></body></html>`;
}


// ---------------------------------------------------------------- dossier entier (élimination par dossier)

export interface DossierEliminationDocument {
    documentId: string; reference: string; title: string; dossierReference: string; eventId: string | null; dueDate: string | null; blockers: string[]; blockerMessages: string[];
}
export interface DossierEliminationPlan {
    dossierId: string; reference: string; title: string; closed: boolean; documents: DossierEliminationDocument[]; destroyedDocuments: number; complete: boolean; problems: string[]; eventIds: string[];
}

/** Ce que le plan dit en une phrase : combien de documents, combien sont prêts, et si le dossier peut partir en entier. */
export function dossierPlanText(plan: Pick<DossierEliminationPlan, 'documents' | 'complete' | 'closed' | 'destroyedDocuments'>): string {
    const total = plan.documents.length;
    if (!plan.closed) return 'Le dossier n’est pas clos : il ne peut pas être éliminé.';
    if (total === 0) return plan.destroyedDocuments > 0 ? 'Tous les documents de ce dossier sont déjà détruits.' : 'Ce dossier ne contient aucun document à éliminer.';
    const ready = plan.documents.filter(d => d.blockers.length === 0).length;
    if (plan.complete) return `Les ${total} document${total > 1 ? 's' : ''} du dossier (sous-dossiers compris) peuvent être éliminés ensemble.`;
    return `${ready} document${ready > 1 ? 's' : ''} sur ${total} prêt${ready > 1 ? 's' : ''} : un dossier ne s’élimine qu’en entier, aucun bordereau n’est possible tant que chacun n’est pas prêt.`;
}
