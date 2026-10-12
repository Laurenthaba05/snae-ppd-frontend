import type { DigitizationOrder, OrderLot, OrderProject, OrderStage, OrderStatus, OrderTransitionOption } from './types.js';
import { MOTIF_MIN } from './heritageAssets.js';
import { MAX_DAYS_AHEAD, addDays } from './movements.js';

/* Numérisation commandée par le patrimoine : le patrimoine commande, l'atelier prend en charge, le patrimoine réceptionne.
   La commande relie la sortie de l'original, l'élément du suivi du traitement et le document qui devient la représentation du bien. */

export const STATUS_LABELS: Record<OrderStatus, string> = { COMMANDEE: 'Commandée', EN_COURS: 'Prise en charge', RECEPTIONNEE: 'Réceptionnée', ANNULEE: 'Annulée' };
export const STATUS_FILTERS: Array<[string, string]> = [['OUVERTES', 'Commandes ouvertes'], ['A_PRENDRE_EN_CHARGE', 'À prendre en charge'], ...(Object.keys(STATUS_LABELS) as OrderStatus[]).map(s => [s, STATUS_LABELS[s]] as [string, string])];
export const STAGE_LABELS: Record<OrderStage, string> = {
    SORTIE_A_AUTORISER: 'Sortie à autoriser', A_PRENDRE_EN_CHARGE: 'À prendre en charge', ORIGINAL_A_REMETTRE: 'Original à remettre', NUMERISATION: 'Numérisation en cours', ORIGINAL_A_RENDRE: 'Original à rendre',
    FINALISATION: 'Validation en cours', A_RECEPTIONNER: 'À réceptionner', RECEPTIONNEE: 'Réceptionnée', ANNULEE: 'Annulée'
};
/** Ce que chaque étape attend, et de qui. */
export const STAGE_NEXT_STEPS: Record<OrderStage, string> = {
    SORTIE_A_AUTORISER: 'Une autre personne que le commanditaire autorise la sortie de l’original (onglet « Mouvements »).',
    A_PRENDRE_EN_CHARGE: 'L’atelier de numérisation prend la commande en charge : il choisit le projet et le lot, et crée l’élément de numérisation.',
    ORIGINAL_A_REMETTRE: 'Le magasinier remet l’original à l’atelier (onglet « Mouvements ») ; aucune page ne s’enregistre avant.',
    NUMERISATION: 'L’atelier numérise, indexe et fait contrôler les pages dans le suivi du traitement.',
    ORIGINAL_A_RENDRE: 'Le contrôle qualité est passé : l’original peut rentrer en réserve (retour à enregistrer dans l’onglet « Mouvements »).',
    FINALISATION: 'L’original est rentré ; l’atelier termine la validation et le scellement de la numérisation.',
    A_RECEPTIONNER: 'Une autre personne que le commanditaire réceptionne la représentation numérique.',
    RECEPTIONNEE: 'La représentation numérique est réceptionnée : elle est reliée au bien.',
    ANNULEE: 'Commande close : elle a été annulée.'
};
export const statusLabel = (s: string | null | undefined): string => s ? (STATUS_LABELS[s as OrderStatus] ?? s) : '—';
export const stageLabel = (s: string | null | undefined): string => s ? (STAGE_LABELS[s as OrderStage] ?? s) : '—';
export const isOpen = (s: OrderStatus): boolean => s === 'COMMANDEE' || s === 'EN_COURS';
export const stageTone = (stage: OrderStage, late = false): 'ok' | 'warn' | 'bad' | '' =>
    late ? 'bad' : stage === 'SORTIE_A_AUTORISER' || stage === 'A_PRENDRE_EN_CHARGE' || stage === 'ORIGINAL_A_REMETTRE' || stage === 'A_RECEPTIONNER' ? 'warn' : stage === 'RECEPTIONNEE' ? 'ok' : '';

/** Étapes de l'élément de numérisation à partir desquelles les pages sont contrôlées (miroir de ce que le serveur exige avant le retour de l'original). */
export const CONTROLLED_ELEMENT_STAGES: readonly string[] = ['METADONNEES', 'VALIDATION', 'TERMINE', 'ANNULE'];
export const ELEMENT_STAGE_LABELS: Record<string, string> = {
    RECEPTION: 'Réception', NUMERISATION: 'Numérisation', OCR_INDEXATION: 'OCR et indexation', CONTROLE_QUALITE: 'Contrôle qualité', METADONNEES: 'Métadonnées', VALIDATION: 'Validation', TERMINE: 'Prêt pour versement', SUSPENDU: 'Suspendu', ANNULE: 'Annulé'
};
export const elementStageLabel = (s: string | null | undefined): string => s ? (ELEMENT_STAGE_LABELS[s] ?? s) : '—';

// ---------- déroulé

export interface TimelineStep { key: string; label: string; state: 'done' | 'current' | 'todo' | 'cancelled' }
/** Le déroulé d'une commande : ce qui est fait, ce qui est en cours, ce qui reste. Rien n'est stocké : tout se lit des trois cycles de vie. */
export function timeline(order: Pick<DigitizationOrder, 'statut' | 'etape' | 'mouvement' | 'element' | 'priseEnCharge'>): TimelineStep[] {
    const movement = order.mouvement.statut;
    const out = movement === 'REMISE' || movement === 'RECUE' || movement === 'RETOURNEE';
    const element = order.element?.statut ?? null;
    const flags: Array<[string, string, boolean, OrderStage | null]> = [
        ['commande', 'Commandée', true, null],
        ['autorisation', 'Sortie autorisée', movement === 'AUTORISEE' || out, 'SORTIE_A_AUTORISER'],
        ['prise', 'Prise en charge par l’atelier', order.priseEnCharge !== null, 'A_PRENDRE_EN_CHARGE'],
        ['remise', 'Original remis à l’atelier', out, 'ORIGINAL_A_REMETTRE'],
        ['controle', 'Pages numérisées et contrôlées', element !== null && element !== 'ANNULE' && CONTROLLED_ELEMENT_STAGES.includes(element), 'NUMERISATION'],
        ['retour', 'Original rentré en réserve', movement === 'RETOURNEE', 'ORIGINAL_A_RENDRE'],
        ['validation', 'Numérisation validée et scellée', element === 'TERMINE', 'FINALISATION'],
        ['reception', 'Représentation réceptionnée', order.statut === 'RECEPTIONNEE', 'A_RECEPTIONNER']
    ];
    let currentFound = false;
    return flags.map(([key, label, done, stage]) => {
        if (done) return { key, label, state: 'done' as const };
        if (order.statut === 'ANNULEE') return { key, label, state: 'cancelled' as const };
        const isCurrent = !currentFound && stage !== null && order.etape === stage;
        if (isCurrent) currentFound = true;
        return { key, label, state: isCurrent ? 'current' as const : 'todo' as const };
    });
}

// ---------- commande

export interface OrderForm {
    typeDocumentId: string; motif: string; consignes: string; resolutionMinDpi: string; pagesAttendues: string; rectoVerso: boolean; destination: string; destinataire: string; retourPrevu: string;
}
export const emptyOrderForm = (): OrderForm => ({ typeDocumentId: '', motif: '', consignes: '', resolutionMinDpi: '', pagesAttendues: '', rectoVerso: false, destination: '', destinataire: '', retourPrevu: '' });

const whole = (text: string): number | null => /^\d+$/.test(text.trim()) ? Number(text.trim()) : null;

/** Contrôles avant l'envoi, pour guider : le serveur refait les mêmes contrôles et reste seul juge. */
export function orderProblems(form: OrderForm, today: string): string[] {
    const problems: string[] = [];
    if (!form.typeDocumentId) problems.push('Indiquez le type du document qui recevra la numérisation.');
    if (form.motif.trim().length < MOTIF_MIN) problems.push(`Le motif dit pourquoi numériser : au moins ${MOTIF_MIN} caractères.`);
    if (form.resolutionMinDpi.trim()) {
        const dpi = whole(form.resolutionMinDpi);
        if (dpi === null || dpi < 50 || dpi > 9600) problems.push('La résolution minimale se donne entre 50 et 9600 dpi.');
    }
    if (form.pagesAttendues.trim()) {
        const pages = whole(form.pagesAttendues);
        if (pages === null || pages < 1 || pages > 100_000) problems.push('Le nombre de pages attendues se donne entre 1 et 100000.');
    }
    if (!form.destination.trim()) problems.push('Indiquez où l’original ira (atelier de numérisation…).');
    if (!form.destinataire.trim()) problems.push('Indiquez qui le reçoit (personne ou organisme).');
    if (!form.retourPrevu) problems.push('Indiquez la date de retour prévue : une sortie a toujours une échéance.');
    else if (form.retourPrevu < today) problems.push('Le retour prévu ne peut pas être dans le passé.');
    else if (form.retourPrevu > addDays(today, MAX_DAYS_AHEAD)) problems.push('Le retour prévu ne peut pas dépasser cinq ans.');
    return problems;
}

/** Corps de la commande : seuls les champs renseignés partent. */
export function orderBody(form: OrderForm): Record<string, unknown> {
    const body: Record<string, unknown> = { typeDocumentId: form.typeDocumentId, motif: form.motif.trim(), destination: form.destination.trim(), destinataire: form.destinataire.trim(), retourPrevu: form.retourPrevu, rectoVerso: form.rectoVerso };
    if (form.consignes.trim()) body.consignes = form.consignes.trim();
    const dpi = whole(form.resolutionMinDpi); if (dpi !== null) body.resolutionMinDpi = dpi;
    const pages = whole(form.pagesAttendues); if (pages !== null) body.pagesAttendues = pages;
    return body;
}

// ---------- passages

export function transitionLabel(to: OrderStatus): string {
    switch (to) {
        case 'EN_COURS': return 'Prendre en charge';
        case 'RECEPTIONNEE': return 'Réceptionner la représentation';
        case 'ANNULEE': return 'Annuler la commande';
        default: return STATUS_LABELS[to] ?? to;
    }
}

export interface TakeForm { projetId: string; lotId: string }
export const emptyTakeForm = (): TakeForm => ({ projetId: '', lotId: '' });
export const lotsOf = (projects: readonly OrderProject[], projetId: string): OrderLot[] => projects.find(p => p.id === projetId)?.lots ?? [];

/** Ce que la prise en charge exige du projet et du lot (miroir du serveur) : une résolution minimale commandée exige un lot qui la respecte. */
export function takeProblems(order: Pick<DigitizationOrder, 'resolutionMinDpi'>, projects: readonly OrderProject[], form: TakeForm): string[] {
    const problems: string[] = [];
    if (!form.projetId) problems.push('Choisissez le projet de numérisation qui prend la commande en charge.');
    const lot = form.lotId ? lotsOf(projects, form.projetId).find(l => l.id === form.lotId) : undefined;
    if (form.lotId && !lot) problems.push('Ce lot n’appartient pas au projet choisi.');
    if (order.resolutionMinDpi !== null) {
        if (!form.lotId) problems.push(`La commande impose une résolution minimale de ${order.resolutionMinDpi} dpi : choisissez un lot dont la résolution minimale la respecte, il la fera contrôler page par page.`);
        else if (lot && lot.resolutionMinDpi < order.resolutionMinDpi) problems.push(`La résolution minimale du lot (${lot.resolutionMinDpi} dpi) est inférieure à la consigne du patrimoine (${order.resolutionMinDpi} dpi).`);
    }
    return problems;
}

export interface OrderTransitionForm { texte: string; projetId: string; lotId: string }
export const emptyTransitionForm = (): OrderTransitionForm => ({ texte: '', projetId: '', lotId: '' });

/** Un passage de commande ouvre toujours une fenêtre : prendre en charge choisit un projet, réceptionner et annuler engagent. */
export const needsForm = (_option: Pick<OrderTransitionOption, 'vers'>): boolean => true;

export function transitionProblems(option: Pick<OrderTransitionOption, 'vers' | 'motifRequis'>, order: Pick<DigitizationOrder, 'resolutionMinDpi'>, projects: readonly OrderProject[], form: OrderTransitionForm): string[] {
    const problems: string[] = [];
    if (option.motifRequis && form.texte.trim().length < MOTIF_MIN) problems.push(`Motif : un texte écrit d’au moins ${MOTIF_MIN} caractères est exigé.`);
    if (option.vers === 'EN_COURS') problems.push(...takeProblems(order, projects, form));
    return problems;
}

/** Corps de la demande de passage : seuls les champs utiles et renseignés partent. */
export function transitionBody(vers: OrderStatus, expectedVersion: number, form: OrderTransitionForm): Record<string, unknown> {
    const body: Record<string, unknown> = { vers, expectedVersion };
    if (form.texte.trim()) body.texte = form.texte.trim();
    if (vers === 'EN_COURS') { body.projetId = form.projetId; if (form.lotId) body.lotId = form.lotId; }
    return body;
}

/** Une ligne de l'historique d'une commande. */
export function journalSummary(genre: string, from: unknown, to: unknown): string {
    if (genre === 'CREATION') return 'Commande déposée';
    return statusLabel(String(from)) + ' → ' + statusLabel(String(to));
}

/** « 12 pages sur 48 » ; seul le nombre de pages présentes quand le nombre attendu n'est pas connu. */
export function pagesText(element: { pagesAttendues: number | null; pagesPresentes: number }): string {
    const present = element.pagesPresentes;
    const unit = (n: number) => n > 1 ? 'pages' : 'page';
    return element.pagesAttendues !== null ? `${present} ${unit(present)} sur ${element.pagesAttendues}` : `${present} ${unit(present)}`;
}
