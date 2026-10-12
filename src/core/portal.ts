import type { AccessRequestState, AdminPlan, AdminSubscription, PaymentMode, PortalAccessRequest, PortalNotice, PortalNoticeDocument, PortalNoticeSummary, PortalReadablePage, PortalReader, PortalReceipt, PortalSubscription, PublicPlan, RegistrationForm, SubscriptionState } from './types.js';
import { dayText } from './placement.js';

/* Portail public : le catalogue est ouvert à tous, la lecture des images exige un compte et un abonnement en cours.
   Les règles de mot de passe, de formule et de paiement reprennent celles du serveur pour guider ; le serveur reste seul juge. */

export const MOTIF_MIN = 10;
export const SUBSCRIPTION_STATE_LABELS: Record<SubscriptionState, string> = { EN_ATTENTE_PAIEMENT: 'En attente de paiement', A_VENIR: 'À venir', EN_COURS: 'En cours', EXPIRE: 'Expiré', ANNULE: 'Annulé' };
export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = { ESPECES: 'Espèces', VIREMENT: 'Virement', MOBILE_MONEY: 'Argent mobile', AUTRE: 'Autre' };
export const PAYMENT_MODES = Object.keys(PAYMENT_MODE_LABELS) as PaymentMode[];
export const subscriptionStateLabel = (s: string | null | undefined): string => s ? (SUBSCRIPTION_STATE_LABELS[s as SubscriptionState] ?? s) : '—';
export const paymentModeLabel = (m: string | null | undefined): string => m ? (PAYMENT_MODE_LABELS[m as PaymentMode] ?? m) : '—';
export const stateTone = (s: SubscriptionState): 'ok' | 'warn' | 'bad' | '' => s === 'EN_COURS' ? 'ok' : s === 'EN_ATTENTE_PAIEMENT' || s === 'A_VENIR' ? 'warn' : s === 'EXPIRE' ? 'bad' : '';

// ---------- compte lecteur

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const PASSWORD_MIN = 10;
const COMMON = ['motdepasse', 'password', 'azertyuiop', 'qwertyuiop', '1234567890', '0123456789', 'bienvenue', 'guinee2026', 'guinee2025', 'administrateur'];
export const emailProblem = (email: string): string | null => { const v = email.trim(); return v.length > 254 || !EMAIL.test(v) ? 'L’adresse électronique n’est pas valide.' : null; };

/** Les raisons pour lesquelles un mot de passe serait refusé : dix caractères, trois sortes de caractères, ni courant ni contenant l'adresse. */
export function passwordProblems(password: string, email: string): string[] {
    const problems: string[] = [];
    if (password.length < PASSWORD_MIN) problems.push(`Au moins ${PASSWORD_MIN} caractères.`);
    if (password.length > 128) problems.push('128 caractères au plus.');
    const kinds = [/[a-zà-ÿ]/.test(password), /[A-ZÀ-Þ]/.test(password), /\d/.test(password), /[^A-Za-zÀ-ÿ\d]/.test(password)].filter(Boolean).length;
    if (kinds < 3) problems.push('Mélangez au moins trois sortes de caractères : minuscules, majuscules, chiffres, signes.');
    const lowered = password.toLowerCase();
    if (COMMON.includes(lowered) || COMMON.some(c => lowered.startsWith(c) && /^\d*$/.test(lowered.slice(c.length)))) problems.push('Ce mot de passe est trop courant.');
    const local = email.trim().toLowerCase().split('@')[0] ?? '';
    if (email.trim() && (lowered === email.trim().toLowerCase() || (local.length >= 4 && lowered.includes(local)))) problems.push('Le mot de passe ne doit pas contenir votre adresse.');
    if (password.length >= PASSWORD_MIN && new Set(password).size < 5) problems.push('Ce mot de passe répète trop les mêmes caractères.');
    return problems;
}

export const emptyRegistration = (): RegistrationForm => ({ email: '', motDePasse: '', prenom: '', nom: '', organisme: '', categorie: '', accepteConditions: false });
export function registrationProblems(form: RegistrationForm): string[] {
    const problems: string[] = [];
    const mail = emailProblem(form.email); if (mail) problems.push(mail);
    if (!form.prenom.trim()) problems.push('Le prénom est obligatoire.');
    if (!form.nom.trim()) problems.push('Le nom est obligatoire.');
    for (const p of passwordProblems(form.motDePasse, form.email)) problems.push('Mot de passe : ' + p);
    if (!form.accepteConditions) problems.push('Acceptez les conditions d’utilisation pour vous inscrire.');
    return problems;
}
export function registrationBody(form: RegistrationForm): Record<string, unknown> {
    const body: Record<string, unknown> = { email: form.email.trim(), motDePasse: form.motDePasse, prenom: form.prenom.trim(), nom: form.nom.trim(), accepteConditions: form.accepteConditions };
    if (form.organisme.trim()) body.organisme = form.organisme.trim();
    if (form.categorie) body.categorie = form.categorie;
    return body;
}

// ---------- formules et abonnements

/** Un montant avec sa devise (code ISO), sans décimales quand il est entier ; un code de devise inconnu s'écrit tel quel. */
export function formatAmount(amount: number, currency: string): string {
    try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency, minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 }).format(amount); }
    catch { return amount.toLocaleString('fr-FR') + ' ' + currency; }
}
export function durationText(months: number): string {
    if (months % 12 === 0) { const years = months / 12; return years === 1 ? '1 an' : years + ' ans'; }
    return months === 1 ? '1 mois' : months + ' mois';
}
export const planSummary = (plan: Pick<PublicPlan, 'libelle' | 'dureeMois' | 'montant' | 'devise'>): string => `${plan.libelle} — ${durationText(plan.dureeMois)} — ${plan.montant === 0 ? 'sur exonération' : formatAmount(plan.montant, plan.devise)}`;

/** L'abonnement en cours (payé, commencé, non échu) ; null sinon. */
export const currentSubscription = (subs: readonly PortalSubscription[]): PortalSubscription | null => subs.find(s => s.etat === 'EN_COURS') ?? null;
export const pendingSubscription = (subs: readonly PortalSubscription[]): PortalSubscription | null => subs.find(s => s.etat === 'EN_ATTENTE_PAIEMENT') ?? null;
/** Ce que la fiche d'une notice propose : se connecter, s'abonner, payer ce qui est demandé, ou lire. */
export type AccessState = 'ANONYME' | 'SANS_ABONNEMENT' | 'EN_ATTENTE' | 'ABONNE';
export function accessState(reader: Pick<PortalReader, 'id'> | null, subs: readonly PortalSubscription[]): AccessState {
    if (!reader) return 'ANONYME';
    if (currentSubscription(subs)) return 'ABONNE';
    return pendingSubscription(subs) ? 'EN_ATTENTE' : 'SANS_ABONNEMENT';
}
/** Jours restants avant la fin d'un abonnement (arrondis à la hausse) ; null sans échéance. */
export function daysLeft(finLe: string | null, now: Date = new Date()): number | null {
    if (!finLe) return null;
    return Math.max(0, Math.ceil((new Date(finLe).valueOf() - now.valueOf()) / 86_400_000));
}
export function validityText(sub: Pick<PortalSubscription, 'etat' | 'debutLe' | 'finLe'>): string {
    if (!sub.debutLe || !sub.finLe) return sub.etat === 'EN_ATTENTE_PAIEMENT' ? 'Elle s’ouvre dès que votre paiement est enregistré au guichet.' : '';
    return `Du ${dayText(sub.debutLe)} au ${dayText(sub.finLe)}`;
}
/** Les instructions de paiement : la référence à donner au guichet ou à indiquer sur le virement. Aucun paiement ne se fait en ligne. */
export const paymentInstructions = (sub: Pick<PortalSubscription, 'referencePaiement' | 'montant' | 'devise'>): string => sub.montant === 0
    ? `Cette formule est accordée sur décision de l’institution. Présentez-vous au guichet en indiquant la référence ${sub.referencePaiement} : votre abonnement s’ouvre dès qu’un agent l’accorde.`
    : `Réglez ${formatAmount(sub.montant, sub.devise)} au guichet de l’institution, ou par virement, en indiquant la référence ${sub.referencePaiement}. Votre abonnement s’ouvre dès que le caissier enregistre votre paiement.`;

// ---------- catalogue et lecture

export function noticeDateText(n: Pick<PortalNotice, 'dateTexte' | 'dateDebut' | 'dateFin'>): string | null {
    if (n.dateTexte) return n.dateTexte;
    if (n.dateDebut && n.dateFin && n.dateDebut !== n.dateFin) return `${dayText(n.dateDebut)} — ${dayText(n.dateFin)}`;
    const only = n.dateDebut ?? n.dateFin;
    return only ? dayText(only) : null;
}
/** Une page demandée dans l'adresse : un entier de 1 au nombre de pages, sinon la première. */
export function pageNumber(raw: string | null | undefined, max: number): number {
    const n = Number(raw);
    return Number.isInteger(n) && n >= 1 && n <= Math.max(1, max) ? n : 1;
}
/** L'adresse d'une image d'une page (la première par défaut) : la vignette et le rang de l'image ne s'écrivent que s'ils servent. */
export function pageUrl(documentId: string, page: number, thumbnail = false, image = 1): string {
    const params = [thumbnail ? 'vignette=true' : '', image > 1 ? 'image=' + image : ''].filter(Boolean);
    return `/api/v1/portal/documents/${documentId}/pages/${page}${params.length ? '?' + params.join('&') : ''}`;
}

/** Ce que le lecteur parcourt : une image d'une page. Une page d'une seule image donne une vue ; un TIFF de plusieurs images en donne autant que d'images. */
export interface ReadingView { page: number; image: number; images: number }
export function readingViews(pages: ReadonlyArray<PortalReadablePage>): ReadingView[] {
    return pages.flatMap(p => Array.from({ length: Math.max(1, p.images) }, (_, i) => ({ page: p.number, image: i + 1, images: Math.max(1, p.images) })));
}
/** L'indice de la vue demandée dans l'adresse (page et image), sinon la première. */
export function findView(views: ReadonlyArray<ReadingView>, page: number, image: number): number {
    const index = views.findIndex(v => v.page === page && v.image === image);
    return index >= 0 ? index : 0;
}
export const viewLabel = (v: ReadingView): string => v.images > 1 ? `Page ${v.page} · image ${v.image} sur ${v.images}` : `Page ${v.page}`;
export const viewValue = (v: Pick<ReadingView, 'page' | 'image'>): string => `${v.page}:${v.image}`;
/** Lit « 4:2 » (page 4, image 2) ; null si la valeur n'a pas cette forme. */
export function parseViewValue(value: string): { page: number; image: number } | null {
    const m = /^(\d{1,6}):(\d{1,2})$/.exec(value);
    return m ? { page: Number(m[1]), image: Number(m[2]) } : null;
}
/** Le chemin d'un écran du portail, avec ses paramètres d'adresse non vides. */
export function portalPath(path: string, params: Record<string, string | number | null | undefined> = {}): string {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== '') q.set(k, String(v));
    const s = q.toString();
    return '/portail' + path + (s ? '?' + s : '');
}

/** Où revenir après la connexion : seulement une page du portail (jamais une adresse extérieure ni une autre partie du site). */
export function safeReturnPath(raw: string | null | undefined, fallback = '/portail/compte'): string {
    const v = (raw ?? '').trim();
    return /^\/portail(\/[A-Za-z0-9._~%-]+)*(\?[A-Za-z0-9._~%=&-]*)?$/.test(v) && !v.includes('..') ? v : fallback;
}

// ---------- personnel : formules, caisse

export interface PlanForm { code: string; libelle: string; description: string; dureeMois: string; montant: string; devise: string; telechargement: boolean; categorie: string; ordre: string }
export const emptyPlanForm = (): PlanForm => ({ code: '', libelle: '', description: '', dureeMois: '12', montant: '', devise: '', telechargement: false, categorie: '', ordre: '100' });
export const planFormOf = (p: AdminPlan): PlanForm => ({ code: p.code, libelle: p.libelle, description: p.description ?? '', dureeMois: String(p.dureeMois), montant: String(p.montant), devise: p.devise, telechargement: p.telechargement, categorie: p.categorie ?? '', ordre: String(p.ordre) });
const decimal = (text: string): number | null => { const t = text.trim().replace(/\s/g, '').replace(',', '.'); return /^\d+(\.\d{1,2})?$/.test(t) ? Number(t) : null; };
export function planProblems(form: PlanForm, existing = false): string[] {
    const problems: string[] = [];
    if (!existing && !/^[A-Za-z0-9][A-Za-z0-9_-]{1,39}$/.test(form.code.trim())) problems.push('Le code compte 2 à 40 caractères : lettres, chiffres, tirets et soulignés.');
    if (!form.libelle.trim()) problems.push('Le libellé est obligatoire.');
    const months = Number(form.dureeMois);
    if (!Number.isInteger(months) || months < 1 || months > 120) problems.push('La durée se donne de 1 à 120 mois.');
    if (decimal(form.montant) === null) problems.push('Le montant est positif ou nul, avec deux décimales au plus (0 pour une formule sur exonération).');
    if (!/^[A-Za-z]{3}$/.test(form.devise.trim())) problems.push('La devise s’écrit avec son code à trois lettres (ISO 4217).');
    return problems;
}
export function planBody(form: PlanForm, existing = false, version?: number, actif?: boolean): Record<string, unknown> {
    const body: Record<string, unknown> = { libelle: form.libelle.trim(), dureeMois: Number(form.dureeMois), montant: decimal(form.montant), devise: form.devise.trim().toUpperCase(), telechargement: form.telechargement, ordre: Number(form.ordre) || 100 };
    if (!existing) body.code = form.code.trim().toUpperCase();
    if (form.description.trim()) body.description = form.description.trim();
    if (form.categorie) body.categorie = form.categorie;
    if (version !== undefined) body.expectedVersion = version;
    if (actif !== undefined) body.actif = actif;
    return body;
}

export interface PaymentForm { mode: PaymentMode | ''; reference: string; montant: string; note: string }
export const emptyPaymentForm = (sub: Pick<AdminSubscription, 'montant'>): PaymentForm => ({ mode: 'ESPECES', reference: '', montant: String(sub.montant), note: '' });
/** Un encaissement : le montant exact de la formule demandée, et hors espèces la pièce qui permet de le retrouver. */
export function paymentProblems(form: PaymentForm, sub: Pick<AdminSubscription, 'montant' | 'devise'>): string[] {
    const problems: string[] = [];
    if (!form.mode) problems.push('Indiquez le mode d’encaissement.');
    const amount = decimal(form.montant);
    if (amount === null) problems.push('Indiquez le montant encaissé.');
    else if (Math.abs(amount - sub.montant) > 0.004) problems.push(`Le montant encaissé doit être exactement celui de la formule demandée : ${formatAmount(sub.montant, sub.devise)}.`);
    if (form.mode && form.mode !== 'ESPECES' && form.reference.trim().length < 3) problems.push('Hors espèces, indiquez la pièce de l’encaissement (référence du virement ou de l’opération), au moins 3 caractères.');
    return problems;
}
export function paymentBody(form: PaymentForm, sub: Pick<AdminSubscription, 'id' | 'devise'>): Record<string, unknown> {
    const body: Record<string, unknown> = { abonnementId: sub.id, mode: form.mode, montant: decimal(form.montant), devise: sub.devise };
    if (form.reference.trim()) body.referenceExterne = form.reference.trim();
    if (form.note.trim()) body.note = form.note.trim();
    return body;
}
export const motifProblems = (text: string, label = 'Motif'): string[] => text.trim().length >= MOTIF_MIN ? [] : [`${label} : un texte écrit d’au moins ${MOTIF_MIN} caractères est exigé.`];
/** Une référence de paiement, telle que le lecteur la dicte : majuscules, sans espaces autour. */
export const normalizeReference = (text: string): string => text.trim().toUpperCase();
export const referenceProblem = (text: string): string | null => /^PAY-[A-Z0-9]{8}$/.test(normalizeReference(text)) ? null : 'Une référence de paiement s’écrit PAY- suivi de huit lettres ou chiffres.';

const escape = (text: unknown): string => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]!));
/** Le reçu, prêt à imprimer. Tout le texte est échappé. */
export function receiptHtml(receipt: PortalReceipt, institution = 'SNAE-PPD'): string {
    const p = receipt.paiement;
    const rows: Array<[string, string]> = [['Reçu', p.numero], ['Date', dayText(p.recuLe)], ['Lecteur', `${p.lecteurNom} (${p.lecteurNumero})`], ['Adresse', receipt.lecteurEmail], ['Abonnement', `${p.formuleLibelle} — ${p.abonnementNumero}`],
        ['Durée', durationText(receipt.dureeMois)], ['Période', receipt.debutLe && receipt.finLe ? `Du ${dayText(receipt.debutLe)} au ${dayText(receipt.finLe)}` : '—'], ['Montant', formatAmount(p.montant, p.devise)],
        ['Mode', paymentModeLabel(p.mode) + (p.referenceExterne ? ' — ' + p.referenceExterne : '')], ['Encaissé par', p.recuPar ?? '—']];
    const cancelled = p.statut === 'ANNULE' ? `<p class="void">REÇU ANNULÉ le ${escape(p.annuleLe ? dayText(p.annuleLe) : '')} — ${escape(p.annuleMotif)}</p>` : '';
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escape(p.numero)}</title><style>body{font:14px/1.5 system-ui,sans-serif;margin:32px;color:#1b2a22}h1{font-size:20px;margin:0 0 4px}small{color:#5d7176}table{border-collapse:collapse;margin-top:18px;width:100%}td{padding:8px 10px;border-bottom:1px solid #dce5dc;vertical-align:top}td:first-child{color:#5d7176;width:150px}.void{color:#8f2f1d;font-weight:700;border:2px solid #8f2f1d;padding:8px;margin-top:16px}.sign{margin-top:48px;display:flex;justify-content:space-between}.sign div{border-top:1px solid #1b2a22;width:42%;padding-top:6px;font-size:12px}</style></head><body><h1>${escape(institution)} — Reçu d’abonnement</h1><small>Portail public</small>${cancelled}<table>${rows.map(([k, v]) => `<tr><td>${escape(k)}</td><td>${escape(v)}</td></tr>`).join('')}</table><div class="sign"><div>Le caissier</div><div>Le lecteur</div></div></body></html>`;
}

// ---------- accès sur demande

export const ACCESS_MOTIVE_MIN = 20;
export const ACCESS_MESSAGE_MIN = 10;
export const ACCESS_STATE_LABELS: Record<AccessRequestState, string> = { DEPOSEE: 'Déposée', EN_INSTRUCTION: 'En instruction', ACCORDEE: 'Accordée', EXPIREE: 'Expirée', REFUSEE: 'Refusée', ANNULEE: 'Annulée', REVOQUEE: 'Révoquée' };
export const accessStateLabel = (s: string | null | undefined): string => s ? (ACCESS_STATE_LABELS[s as AccessRequestState] ?? s) : '—';
export const accessTone = (s: AccessRequestState): 'ok' | 'warn' | 'bad' | '' => s === 'ACCORDEE' ? 'ok' : s === 'DEPOSEE' || s === 'EN_INSTRUCTION' ? 'warn' : s === 'REFUSEE' || s === 'REVOQUEE' || s === 'EXPIREE' ? 'bad' : '';
/** Ce qui se filtre dans la liste du personnel : ce qui reste à traiter, les accès en cours, puis chaque étape. */
export const ACCESS_FILTERS: Array<[string, string]> = [['OUVERTES', 'À traiter'], ['ACTIFS', 'Accès en cours'], ...(Object.keys(ACCESS_STATE_LABELS) as AccessRequestState[]).filter(s => s !== 'EXPIREE').map(s => [s, ACCESS_STATE_LABELS[s]] as [string, string])];
export const isPendingRequest = (r: Pick<PortalAccessRequest, 'statut'>): boolean => r.statut === 'DEPOSEE' || r.statut === 'EN_INSTRUCTION';

/** Le motif de la demande : pourquoi le lecteur a besoin du document, par écrit. */
export const accessMotiveProblems = (text: string): string[] => text.trim().length >= ACCESS_MOTIVE_MIN ? [] : [`Dites pourquoi vous avez besoin de ce document (recherche, projet, droit à faire valoir…) : au moins ${ACCESS_MOTIVE_MIN} caractères.`];

export type DocumentActionKind = 'LIRE' | 'CONNEXION' | 'ABONNEMENT' | 'VOIR_DEMANDE' | 'DEMANDER' | 'EN_COURS';
export interface DocumentAction { kind: DocumentActionKind; /** La demande la plus récente du lecteur pour ce document, quand il y en a une. */ request: PortalAccessRequest | null; /** Une phrase qui dit où l'on en est. */ note: string | null }
/** Le dernier jour d'un accès accordé : le serveur le borne à la fin de ce jour (minuit UTC suivant). */
export const accessUntilText = (r: Pick<PortalAccessRequest, 'accordeJusquAu'>): string => r.accordeJusquAu ? dayText(new Date(new Date(r.accordeJusquAu).valueOf() - 1000).toISOString()) : '';

/**
 * Ce que la fiche d'une notice propose pour un document : lire (document libre, ou accès accordé et valide, avec un abonnement), se connecter, s'abonner, voir sa demande d'abonnement,
 * déposer une demande d'accès (document sur demande, abonné) ou attendre la réponse. `requests` : les demandes du lecteur, les plus récentes d'abord.
 */
export function documentAction(doc: Pick<PortalNoticeDocument, 'id' | 'acces'>, access: AccessState, requests: readonly PortalAccessRequest[]): DocumentAction {
    const request = requests.find(r => r.documentId === doc.id) ?? null;
    const gate = (note: string | null, ready: DocumentActionKind): DocumentAction => ({ kind: access === 'ABONNE' ? ready : access === 'ANONYME' ? 'CONNEXION' : access === 'EN_ATTENTE' ? 'VOIR_DEMANDE' : 'ABONNEMENT', request, note });
    // Un serveur qui ne dit pas l'accès (plus ancien que l'accès sur demande) ne propose que la lecture libre.
    if (doc.acces !== 'SUR_DEMANDE') return gate(null, 'LIRE');
    if (request?.etat === 'ACCORDEE') return gate('Accès accordé jusqu’au ' + accessUntilText(request) + '.', 'LIRE');
    if (request && isPendingRequest(request)) return { kind: 'EN_COURS', request, note: `Demande ${request.numero} déposée le ${dayText(request.deposeLe)} : ${request.statut === 'EN_INSTRUCTION' ? 'l’institution l’instruit' : 'elle attend d’être prise en charge'}.` };
    const note = !request ? null : request.etat === 'REFUSEE' ? 'Votre dernière demande a été refusée' + (request.message ? ' : ' + request.message : '.')
        : request.etat === 'REVOQUEE' ? 'Votre accès a été révoqué' + (request.message ? ' : ' + request.message : '.') : request.etat === 'EXPIREE' ? 'Votre accès a expiré le ' + accessUntilText(request) + '.' : null;
    return gate(note, 'DEMANDER');
}

/** La phrase du catalogue : « 2 documents à lire, 1 sur demande ». */
export function documentsText(n: Pick<PortalNoticeSummary, 'documents' | 'surDemande'>): string {
    const plural = (k: number) => k > 1 ? 's' : '';
    const parts: string[] = [];
    if (n.documents > 0) parts.push(`${n.documents} document${plural(n.documents)} à lire`);
    if (n.surDemande > 0) parts.push(`${n.surDemande} sur demande`);
    return parts.length ? parts.join(', ') : 'Notice seule';
}

// ---------- accès sur demande : le personnel

export const ACCESS_MAX_DAYS = 365;
export interface GrantForm { jusquAu: string; message: string }
const plusDays = (iso: string, days: number): string => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
export const emptyGrantForm = (today: string): GrantForm => ({ jusquAu: plusDays(today, 30), message: '' });
/** Contrôles avant l'envoi (miroir du serveur) : un jour à venir, dans l'année ; un message facultatif. */
export function grantProblems(form: GrantForm, today: string): string[] {
    if (!form.jusquAu) return ['Indiquez jusqu’à quand l’accès est accordé.'];
    if (form.jusquAu <= today) return ['L’accès est accordé jusqu’à un jour à venir.'];
    if (form.jusquAu > plusDays(today, ACCESS_MAX_DAYS)) return ['Un accès s’accorde pour un an au plus.'];
    return [];
}
export const grantBody = (form: GrantForm): Record<string, unknown> => ({ jusquAu: form.jusquAu, ...(form.message.trim() ? { message: form.message.trim() } : {}) });
/** Le message écrit pour le lecteur : exigé pour refuser ou révoquer. */
export const messageProblems = (text: string): string[] => text.trim().length >= ACCESS_MESSAGE_MIN ? [] : [`Écrivez le message qui sera communiqué au lecteur (au moins ${ACCESS_MESSAGE_MIN} caractères).`];
export const messageBody = (text: string): Record<string, unknown> => ({ message: text.trim() });

/** Une ligne de l'historique d'une demande d'accès. */
export function accessJournalText(genre: string): string {
    switch (genre) {
        case 'DEPOT': return 'Demande déposée';
        case 'PRISE_EN_CHARGE': return 'Prise en charge';
        case 'ACCORD': return 'Accès accordé';
        case 'REFUS': return 'Demande refusée';
        case 'ANNULATION': return 'Demande annulée par le lecteur';
        case 'REVOCATION': return 'Accès révoqué';
        default: return genre;
    }
}
