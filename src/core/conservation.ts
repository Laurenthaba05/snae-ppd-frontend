import type { ConditionState, ConservationAttention, Handling, HeritageReference, ReportContext, Treatment, TreatmentStatus, TreatmentTransitionOption, TreatmentType, Urgency } from './types.js';
import { MOTIF_MIN } from './heritageAssets.js';

/* Conservation : l'état matériel d'un original se constate, à des dates successives, et ne se déduit pas.
   Un traitement part d'un constat, est validé par une autre personne que celle qui l'a proposé, et ne se termine qu'avec un constat d'état après traitement. */

export const STATE_LABELS: Record<ConditionState, string> = { STABLE: 'Stable', FRAGILE: 'Fragile', INTERVENTION_REQUISE: 'Intervention requise' };
export const STATE_HINTS: Record<ConditionState, string> = {
    STABLE: 'Aucune dégradation évolutive : l’objet se conserve en l’état.',
    FRAGILE: 'Des altérations fragilisent l’objet : il demande des précautions.',
    INTERVENTION_REQUISE: 'Sans traitement, l’objet se dégrade : une intervention de conservation est nécessaire.'
};
export const HANDLING_LABELS: Record<Handling, string> = { LIBRE: 'Manipulation libre', PRECAUTIONS: 'Avec précautions', INTERDITE: 'Manipulation interdite' };
export const URGENCY_LABELS: Record<Urgency, string> = { AUCUNE: 'Aucune urgence', A_PLANIFIER: 'À planifier', URGENTE: 'Urgente' };
export const CONTEXT_LABELS: Record<ReportContext, string> = {
    RECEPTION: 'À la réception', REPRISE_INVENTAIRE: 'Reprise d’inventaire', PERIODIQUE: 'Contrôle périodique', RECOLEMENT: 'Lors d’un récolement', AVANT_MOUVEMENT: 'Avant un mouvement',
    APRES_MOUVEMENT: 'Après un mouvement', AVANT_TRAITEMENT: 'Avant un traitement', APRES_TRAITEMENT: 'Après un traitement', AUTRE: 'Autre circonstance'
};
/** Les circonstances que l'on peut choisir : le constat après traitement s'enregistre en terminant le traitement. */
export const CONTEXT_CHOICES = (Object.keys(CONTEXT_LABELS) as ReportContext[]).filter(c => c !== 'APRES_TRAITEMENT');
export const TREATMENT_TYPE_LABELS: Record<TreatmentType, string> = {
    NETTOYAGE: 'Nettoyage', CONSOLIDATION: 'Consolidation', RESTAURATION: 'Restauration', RELIURE: 'Reliure', DESACIDIFICATION: 'Désacidification', CONDITIONNEMENT: 'Conditionnement', AUTRE: 'Autre traitement'
};
export const TREATMENT_STATUS_LABELS: Record<TreatmentStatus, string> = { PROPOSE: 'Proposé', VALIDE: 'Validé', EN_COURS: 'En cours', TERMINE: 'Terminé', REFUSE: 'Refusé', ANNULE: 'Annulé' };
export const ATTENTION_LABELS: Record<ConservationAttention, string> = {
    INTERVENTION_REQUISE: 'À traiter', TRAITEMENT_A_VALIDER: 'Traitement à valider', TRAITEMENT_A_DEMARRER: 'Traitement à démarrer', TRAITEMENT_EN_COURS: 'Traitement en cours',
    FRAGILE: 'Fragile', CONSTAT_ANCIEN: 'Constat ancien', SANS_CONSTAT: 'Jamais constaté'
};
/** Ce que chaque point d'attention demande de faire. */
export const ATTENTION_NEXT_STEPS: Record<ConservationAttention, string> = {
    INTERVENTION_REQUISE: 'Proposer un traitement de conservation.',
    TRAITEMENT_A_VALIDER: 'Une autre personne que celle qui l’a proposé valide ou refuse le traitement.',
    TRAITEMENT_A_DEMARRER: 'Démarrer le traitement en indiquant qui le réalise.',
    TRAITEMENT_EN_COURS: 'Terminer le traitement avec un compte rendu et un constat d’état après traitement.',
    FRAGILE: 'Manipuler avec précautions ; envisager un traitement préventif.',
    CONSTAT_ANCIEN: 'Constater de nouveau l’état de l’objet.',
    SANS_CONSTAT: 'Constater l’état de l’objet.'
};

export const stateLabel = (state: string | null | undefined): string => state ? (STATE_LABELS[state as ConditionState] ?? state) : 'Non évalué';
export const attentionLabel = (a: string): string => ATTENTION_LABELS[a as ConservationAttention] ?? a;
export const statusLabel = (s: string | null | undefined): string => s ? (TREATMENT_STATUS_LABELS[s as TreatmentStatus] ?? s) : '—';
export const stateTone = (state: ConditionState | null): 'ok' | 'warn' | 'bad' | '' => state === 'STABLE' ? 'ok' : state === 'FRAGILE' ? 'warn' : state === 'INTERVENTION_REQUISE' ? 'bad' : '';
export const handlingTone = (h: Handling | null): 'ok' | 'warn' | 'bad' | '' => h === 'LIBRE' ? 'ok' : h === 'PRECAUTIONS' ? 'warn' : h === 'INTERDITE' ? 'bad' : '';

const ATTENTION_ORDER: ConservationAttention[] = ['INTERVENTION_REQUISE', 'TRAITEMENT_A_VALIDER', 'TRAITEMENT_A_DEMARRER', 'TRAITEMENT_EN_COURS', 'FRAGILE', 'CONSTAT_ANCIEN', 'SANS_CONSTAT'];
/** Le point d'attention le plus grave d'une liste, ou null. */
export const worstAttention = (list: readonly ConservationAttention[]): ConservationAttention | null => ATTENTION_ORDER.find(a => list.includes(a)) ?? null;
export const attentionTone = (a: ConservationAttention | null): 'ok' | 'warn' | 'bad' | '' =>
    a === 'INTERVENTION_REQUISE' ? 'bad' : a === 'TRAITEMENT_A_VALIDER' || a === 'TRAITEMENT_A_DEMARRER' || a === 'FRAGILE' ? 'warn' : '';

/** Les libellés des altérations d'un constat, d'après le référentiel ; un code retiré du référentiel reste lisible. */
export function alterationLabels(codes: readonly string[], references: readonly Pick<HeritageReference, 'code' | 'libelle'>[]): string[] {
    const byCode = new Map(references.map(r => [r.code, r.libelle] as const));
    return codes.map(code => byCode.get(code) ?? code);
}

/** Les manipulations compatibles avec un état : une intervention requise n'est jamais en manipulation libre. */
export const handlingChoices = (state: ConditionState | ''): Handling[] => state === 'INTERVENTION_REQUISE' ? ['PRECAUTIONS', 'INTERDITE'] : ['LIBRE', 'PRECAUTIONS', 'INTERDITE'];

// ---------- constat d'état

export interface ReportForm {
    contexte: ReportContext | ''; constateLe: string; etat: ConditionState | ''; manipulation: Handling | ''; urgence: Urgency; alterations: string[]; observations: string; traitementRecommande: string; documentIds: string[];
}
export const emptyReportForm = (contexte: ReportContext | '' = 'PERIODIQUE'): ReportForm =>
    ({ contexte, constateLe: '', etat: '', manipulation: '', urgence: 'AUCUNE', alterations: [], observations: '', traitementRecommande: '', documentIds: [] });

/** Contrôles avant l'envoi, pour guider : le serveur refait les mêmes contrôles et reste seul juge. `final` : le constat d'après traitement, dont le contexte est imposé. */
export function reportProblems(form: ReportForm, today: string, final = false): string[] {
    const problems: string[] = [];
    if (!final && !form.contexte) problems.push('Indiquez dans quelles circonstances l’état est constaté.');
    if (!form.etat) problems.push('Indiquez l’état constaté : stable, fragile ou intervention requise.');
    if (!form.manipulation) problems.push('Indiquez ce que l’on peut faire de l’objet : manipulation libre, avec précautions ou interdite.');
    if (form.etat && form.etat !== 'STABLE' && form.alterations.length === 0) problems.push('Un état fragile ou à traiter se constate avec au moins une altération.');
    if (form.etat === 'INTERVENTION_REQUISE') {
        if (form.traitementRecommande.trim().length < MOTIF_MIN) problems.push(`Une intervention requise dit laquelle : indiquez le traitement recommandé (au moins ${MOTIF_MIN} caractères).`);
        if (form.manipulation === 'LIBRE') problems.push('Un objet dont l’état exige une intervention n’est pas en manipulation libre.');
    }
    if (form.observations.trim().length < MOTIF_MIN) problems.push(`Les observations disent ce qui a été vu : au moins ${MOTIF_MIN} caractères.`);
    if (form.constateLe && form.constateLe > today) problems.push('La date du constat ne peut pas être dans le futur.');
    return problems;
}

/** Corps du constat : seuls les champs renseignés partent ; le constat d'après traitement n'envoie pas de contexte. */
export function reportBody(form: ReportForm, final = false): Record<string, unknown> {
    const body: Record<string, unknown> = { etat: form.etat, manipulation: form.manipulation, urgence: form.urgence, alterations: form.alterations, observations: form.observations.trim() };
    if (!final) body.contexte = form.contexte;
    if (form.constateLe) body.constateLe = form.constateLe;
    if (form.traitementRecommande.trim()) body.traitementRecommande = form.traitementRecommande.trim();
    if (form.documentIds.length) body.documentIds = form.documentIds;
    return body;
}

// ---------- traitement

export interface ProposalForm { intitule: string; typeTraitement: TreatmentType | ''; diagnostic: string; traitementPrevu: string }
export const emptyProposalForm = (): ProposalForm => ({ intitule: '', typeTraitement: '', diagnostic: '', traitementPrevu: '' });
export const proposalOf = (t: Pick<Treatment, 'intitule' | 'typeTraitement' | 'diagnostic' | 'traitementPrevu'>): ProposalForm => ({ intitule: t.intitule, typeTraitement: t.typeTraitement, diagnostic: t.diagnostic, traitementPrevu: t.traitementPrevu });

export function proposalProblems(form: ProposalForm): string[] {
    const problems: string[] = [];
    if (!form.intitule.trim()) problems.push('L’intitulé du traitement est obligatoire.');
    if (!form.typeTraitement) problems.push('Indiquez la nature du traitement.');
    if (form.diagnostic.trim().length < MOTIF_MIN) problems.push(`Le diagnostic dit pourquoi traiter : au moins ${MOTIF_MIN} caractères.`);
    if (form.traitementPrevu.trim().length < MOTIF_MIN) problems.push(`Le traitement prévu dit ce qui sera fait : au moins ${MOTIF_MIN} caractères.`);
    return problems;
}
export const proposalBody = (form: ProposalForm): Record<string, unknown> => ({ intitule: form.intitule.trim(), typeTraitement: form.typeTraitement, diagnostic: form.diagnostic.trim(), traitementPrevu: form.traitementPrevu.trim() });

/** Passage d'un traitement, du point de vue de la personne qui agit. */
export function treatmentTransitionLabel(to: TreatmentStatus): string {
    switch (to) {
        case 'VALIDE': return 'Valider le traitement';
        case 'REFUSE': return 'Refuser le traitement';
        case 'EN_COURS': return 'Démarrer le traitement';
        case 'TERMINE': return 'Terminer le traitement';
        case 'ANNULE': return 'Annuler le traitement';
        default: return TREATMENT_STATUS_LABELS[to] ?? to;
    }
}

/** Ce qu'un passage demande en plus du simple clic. */
export interface TransitionNeeds { texte: boolean; texteLabel: string; intervenant: boolean; constat: boolean }
export function transitionNeeds(option: Pick<TreatmentTransitionOption, 'vers' | 'motifRequis' | 'intervenantRequis' | 'constatRequis'>): TransitionNeeds {
    return { texte: option.motifRequis, texteLabel: option.vers === 'TERMINE' ? 'Compte rendu du traitement' : 'Motif', intervenant: option.intervenantRequis, constat: option.constatRequis };
}
export const needsForm = (option: Pick<TreatmentTransitionOption, 'vers' | 'motifRequis' | 'intervenantRequis' | 'constatRequis'>): boolean => { const n = transitionNeeds(option); return n.texte || n.intervenant || n.constat; };

export interface TreatmentTransitionForm { texte: string; intervenant: string; constat: ReportForm }
export const emptyTransitionForm = (): TreatmentTransitionForm => ({ texte: '', intervenant: '', constat: emptyReportForm('') });

export function treatmentTransitionProblems(option: Pick<TreatmentTransitionOption, 'vers' | 'motifRequis' | 'intervenantRequis' | 'constatRequis'>, form: TreatmentTransitionForm, today: string): string[] {
    const needs = transitionNeeds(option);
    const problems: string[] = [];
    if (needs.texte && form.texte.trim().length < MOTIF_MIN) problems.push(`${needs.texteLabel} : un texte écrit d’au moins ${MOTIF_MIN} caractères est exigé.`);
    if (needs.intervenant && form.intervenant.trim().length < 2) problems.push('Indiquez qui réalise le traitement (atelier, restaurateur, agent).');
    if (needs.constat) problems.push(...reportProblems(form.constat, today, true));
    return problems;
}

/** Corps de la demande de passage : seuls les champs utiles et renseignés partent. */
export function treatmentBody(vers: TreatmentStatus, expectedVersion: number, form: TreatmentTransitionForm, option: Pick<TreatmentTransitionOption, 'motifRequis' | 'intervenantRequis' | 'constatRequis'>): Record<string, unknown> {
    const body: Record<string, unknown> = { vers, expectedVersion };
    if (option.motifRequis && form.texte.trim()) body.texte = form.texte.trim();
    if (option.intervenantRequis && form.intervenant.trim()) body.intervenant = form.intervenant.trim();
    if (option.constatRequis) body.constat = reportBody(form.constat, true);
    return body;
}

/** Durée d'un traitement en jours, ou null s'il n'est pas commencé. */
export function treatmentDays(t: Pick<Treatment, 'debutLe' | 'finLe'>, now = new Date()): number | null {
    if (!t.debutLe) return null;
    const end = t.finLe ? new Date(t.finLe) : now;
    return Math.max(0, Math.floor((end.valueOf() - new Date(t.debutLe).valueOf()) / 86_400_000));
}
