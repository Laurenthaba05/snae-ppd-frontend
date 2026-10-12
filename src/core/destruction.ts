import { formatBytes } from './format.js';

/**
 * Élimination vérifiable : ce que l'exécution d'une élimination supprimerait (aperçu), le certificat de destruction qui en prouve l'exécution, et les raisons lisibles
 * qui empêchent une exécution. Les règles sont celles du serveur ; l'écran n'en est que le miroir.
 */
export type DestructionKind = 'FICHIER' | 'COPIE' | 'PDF_ACCES';
export const KIND_LABELS: Record<DestructionKind, string> = { FICHIER: 'Fichier de conservation', COPIE: 'Copie de consultation', PDF_ACCES: 'PDF d’accès' };

export interface PreviewObject { kind: DestructionKind; name: string | null; size: number; sha256: string | null }
export interface DestructionPreview {
    actionId: string; documentId: string | null; objects: PreviewObject[]; objectCount: number; totalSize: number; texts: number;
    blockers: string[]; previousAttempts: number; lastError: string | null;
}
export interface CertificateObject {
    kind: DestructionKind; name: string | null; mediaType: string | null; sha256: string | null; size: number; provider: string;
    deletedAt: string | null; alreadyAbsent: boolean; absenceVerified: boolean;
}
export interface DestructionCertificate {
    id: string; reference: string; actionId: string; documentId: string; institutionId: string; identifiantMetier: string; title: string; status: 'EN_COURS' | 'COMPLET';
    method: string; operatorId: string; proposedById: string | null; validatedById: string | null; visaReference: string | null; startedAt: string; finishedAt: string | null;
    objectCount: number; totalSize: number; purgedTexts: number; fingerprint: string | null; objects: CertificateObject[];
}

/** Les obstacles à une exécution, dits en français. Un code que l'écran ne connaît pas est rendu lisible plutôt que montré tel quel. */
export const BLOCKER_TEXT: Record<string, string> = {
    DISPOSITION_NOT_VALIDATED: 'La décision n’est pas encore validée.',
    RETENTION_EVENT_NOT_IN_DECISION: 'L’échéance n’est plus en cours de décision.',
    ACTIVE_LEGAL_HOLD: 'Un gel légal actif bloque l’opération.',
    DISPOSITION_DUAL_CONTROL: 'Vous avez déjà proposé ou validé cette décision : l’exécution revient à une troisième personne.',
    DESTRUCTION_STORAGE_NOT_CONFIGURED: 'Le stockage ne permet pas de supprimer le contenu : aucune destruction n’est possible tant qu’il n’est pas raccordé.',
    DESTRUCTION_PROVIDER_MISMATCH: 'Certains fichiers sont conservés chez un autre fournisseur de stockage que celui configuré.',
    DESTRUCTION_TOO_MANY_OBJECTS: 'Ce document compte trop d’objets pour une seule destruction : demandez à l’administrateur de la découper.',
    DESTRUCTION_INVENTORY_MISSING: 'La validation ne comporte pas l’inventaire des fichiers : annulez cette action et proposez-la de nouveau.',
    DESTRUCTION_INVENTORY_CHANGED: 'Les fichiers ont changé depuis la validation : annulez cette action et proposez-la de nouveau.',
    TRANSFER_NOT_ACCEPTED: 'Ce transfert n’a pas été accepté par l’institution destinataire : il se traite depuis son bordereau de versement.',
    TRANSFER_REQUIRED: 'Un transfert vers l’institution d’archives se propose depuis un bordereau de versement.',
    DISPOSITION_IN_TRANSFER: 'Cette décision appartient à un bordereau de versement : elle se traite depuis ce bordereau.',
    REEXAMINATION_REQUIRED: 'Cette décision est un réexamen : utilisez l’opération de réexamen.',
    DISPOSITION_EVIDENCE_CHANGED: 'Le dossier de preuve a changé : la décision doit être validée de nouveau.',
    DOCUMENT_NOT_DISPOSABLE: 'Le document doit être clos et non détruit.',
    DOCUMENT_WORKFLOW_ACTIVE: 'Un circuit de validation du document est encore actif.',
    RETENTION_SCOPE_CHANGED: 'Le rattachement du document a changé depuis la proposition.',
    DOSSIER_DISPOSITION_NOT_SUPPORTED: 'L’élimination d’un dossier entier se traite document par document.'
};
export const blockerText = (code: string): string => BLOCKER_TEXT[code] ?? code.toLowerCase().replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()) + '.';

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;
/** « 3 objets (1,2 Mo) et 2 textes dérivés à vider » ; « aucun fichier » si le document n'a aucun contenu stocké. */
export function previewSummary(p: Pick<DestructionPreview, 'objectCount' | 'totalSize' | 'texts'>): string {
    if (p.objectCount === 0 && p.texts === 0) return 'Ce document n’a aucun contenu stocké : seule sa notice demeure.';
    const parts = [] as string[];
    if (p.objectCount > 0) parts.push(`${plural(p.objectCount, 'objet', 'objets')} (${formatBytes(p.totalSize)})`);
    if (p.texts > 0) parts.push(`${plural(p.texts, 'texte dérivé', 'textes dérivés')} à vider`);
    return parts.join(' et ');
}

/** Ce que le certificat dit avoir détruit : « 2 objets (1,2 Mo) et 1 texte dérivé vidé » ; « aucun contenu stocké » pour un document sans fichier. */
export function destroyedSummary(c: { objectCount: number; totalSize: number; purgedTexts: number }): string {
    if (c.objectCount === 0 && c.purgedTexts === 0) return 'Aucun contenu stocké : seule la notice demeure.';
    const parts = [] as string[];
    if (c.objectCount > 0) parts.push(`${plural(c.objectCount, 'objet', 'objets')} (${formatBytes(c.totalSize)})`);
    if (c.purgedTexts > 0) parts.push(`${c.purgedTexts} ${c.purgedTexts > 1 ? 'textes dérivés vidés' : 'texte dérivé vidé'}`);
    return parts.join(' et ');
}

/** Combien de fichiers de conservation, de copies et de PDF d'accès. */
export function kindCounts(objects: ReadonlyArray<{ kind: DestructionKind }>): Array<{ kind: DestructionKind; count: number }> {
    return (Object.keys(KIND_LABELS) as DestructionKind[]).map(kind => ({ kind, count: objects.filter(o => o.kind === kind).length })).filter(x => x.count > 0);
}

/** Ce qu'il faut avoir lu pour confirmer une destruction : une confirmation explicite, nommant le nombre d'objets. */
export const confirmationText = (p: Pick<DestructionPreview, 'objectCount'>): string =>
    p.objectCount > 0 ? `Je confirme la destruction définitive de ${plural(p.objectCount, 'objet', 'objets')} de ce document.` : 'Je confirme la destruction définitive de ce document.';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export interface CertificateNames { operator: string; proposer: string; validator: string; institution: string; date: (iso: string) => string }

/** Le certificat de destruction en page HTML autonome à imprimer ou enregistrer : le tombeau, les trois personnes, chaque objet détruit avec son empreinte. */
export function certificateHtml(c: DestructionCertificate, names: CertificateNames): string {
    const row = (cells: string[]) => `<tr>${cells.map(x => `<td>${esc(x)}</td>`).join('')}</tr>`;
    const objects = c.objects.map(o => row([KIND_LABELS[o.kind], o.name ?? '—', formatBytes(o.size), o.sha256 ?? '—', o.deletedAt ? names.date(o.deletedAt) : '—', o.alreadyAbsent ? 'Déjà absent' : 'Supprimé', o.absenceVerified ? 'Oui' : 'Non'])).join('');
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Certificat de destruction ${esc(c.reference)}</title><style>
body{font:14px/1.5 Georgia,serif;color:#111;margin:32px auto;max-width:900px;padding:0 16px}h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:24px 0 6px}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #888;padding:5px 8px;text-align:left;vertical-align:top;font-size:13px}th{background:#eee}.hash{font-family:monospace;font-size:11px;word-break:break-all}.sign{display:flex;justify-content:space-between;margin-top:56px}.sign div{width:30%;border-top:1px solid #111;padding-top:4px}
</style></head><body>
<h1>Certificat de destruction</h1><p>Référence : <strong>${esc(c.reference)}</strong> · établi le ${esc(c.finishedAt ? names.date(c.finishedAt) : '—')}</p>
<table>${row(['Document', `${c.identifiantMetier} — ${c.title}`])}${row(['Service', names.institution])}${row(['Visa de la validation', c.visaReference ?? '—'])}${row(['Méthode', 'Suppression des objets du stockage privé, avec vérification de leur absence'])}${row(['Proposée par', names.proposer])}${row(['Validée par', names.validator])}${row(['Exécutée par', names.operator])}${row(['Contenu détruit', destroyedSummary(c)])}</table>
<h2>Objets détruits</h2><table><tr><th>Nature</th><th>Nom</th><th>Taille</th><th>Empreinte SHA-256</th><th>Supprimé le</th><th>État</th><th>Absence vérifiée</th></tr>${objects || row(['—', 'Aucun objet stocké', '—', '—', '—', '—', '—'])}</table>
<p>Empreinte de la liste des objets : <span class="hash">${esc(c.fingerprint ?? '—')}</span></p>
<p><small>Les sauvegardes et réplicas éventuels de l’hébergeur ne sont pas couverts par ce certificat.</small></p>
<div class="sign"><div>Proposant</div><div>Valideur</div><div>Exécutant</div></div></body></html>`;
}
