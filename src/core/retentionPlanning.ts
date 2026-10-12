import type { RetentionPlanning, RetentionPlanningRule } from './types.js';

/** Les mots que l'écran emploie pour dire une règle de conservation et ce qui empêche de planifier. */
const TRIGGER_TEXT: Record<string, string> = {
    DATE_DOCUMENT: 'la date du document', DATE_CLOTURE_DOCUMENT: 'la clôture du document', DATE_ARCHIVAGE: 'la date d’archivage', DATE_CLOTURE_DOSSIER: 'la clôture du dossier', EVENEMENT: 'l’événement déclencheur'
};
const DISPOSITION_TEXT: Record<string, string> = {
    CONSERVER_DEFINITIVEMENT: 'conserver définitivement', ELIMINER: 'éliminer', TRANSFERER: 'transférer', REEXAMINER: 'réexaminer', TRIER: 'trier (échantillon conservé, reste éliminé)'
};
export const triggerText = (trigger: string): string => TRIGGER_TEXT[trigger] ?? trigger;
export const dispositionText = (disposition: string): string => DISPOSITION_TEXT[disposition] ?? disposition;

export function durationText(duration: number, unit: string): string {
    const noun = unit === 'JOURS' ? (duration > 1 ? 'jours' : 'jour') : unit === 'MOIS' ? 'mois' : unit === 'ANNEES' ? (duration > 1 ? 'ans' : 'an') : unit;
    return `${duration} ${noun}`;
}

/**
 * « 10 ans après la clôture du document, puis conserver définitivement » ; avec une phase courante : « 10 ans après la clôture du document (dont 5 ans en phase courante, puis en
 * archives intermédiaires), puis conserver définitivement ».
 */
export function ruleSentence(rule: Pick<RetentionPlanningRule, 'duration' | 'unit' | 'trigger' | 'finalDisposition'> & { currentPhaseDuration?: number | null; currentPhaseUnit?: string | null; triggerEventTypeLabel?: string | null }): string {
    const from = rule.trigger === 'EVENEMENT' && rule.triggerEventTypeLabel ? `l’événement « ${rule.triggerEventTypeLabel} »` : triggerText(rule.trigger);
    const delay = rule.duration === 0 ? `dès ${from}` : `${durationText(rule.duration, rule.unit)} après ${from}`;
    const phase = rule.currentPhaseDuration != null && rule.currentPhaseUnit ? ` (dont ${durationText(rule.currentPhaseDuration, rule.currentPhaseUnit)} en phase courante, puis en archives intermédiaires)` : '';
    return `${delay}${phase}, puis ${dispositionText(rule.finalDisposition)}`;
}

const BLOCKERS: Record<string, string> = {
    DOCUMENT_NOT_CLOSED: 'Le document n’est pas encore clos : clôturez-le pour planifier sa conservation.',
    DOCUMENT_PERMANENTLY_PRESERVED: 'Le document est déjà conservé définitivement : sa conservation ne se replanifie pas.',
    ALREADY_SCHEDULED: 'Une échéance est déjà planifiée pour ce document.',
    NO_APPLICABLE_RULE: 'Aucune règle active ne s’applique à ce document. Une règle s’applique quand le type du document fait partie de ses types visés et, si elle vise aussi des rubriques du plan de classement, quand le document est classé dans l’une d’elles : les deux conditions à la fois quand les deux sont cochées.',
    RULES_AMBIGUOUS: 'Plusieurs règles s’appliquent avec la même précision et la même priorité : il faut en préciser ou en désactiver une.',
    BASE_DATE_FUTURE: 'La date de départ du délai est dans le futur : la conservation se planifie une fois cette date atteinte.',
    DOSSIER_REQUIRED: 'La règle part de la clôture du dossier : le document doit être rangé dans un dossier.',
    DOSSIER_NOT_CLOSED: 'Le dossier du document n’est pas encore clos.',
    EVENT_NOT_DECLARED: 'L’événement qui déclenche le délai n’a pas encore été constaté pour ce document ni pour son dossier.'
};

/** La phrase qui explique un obstacle ; `rule` précise celui de la date de départ manquante. */
export function blockerText(code: string, rule?: Pick<RetentionPlanningRule, 'trigger'> & { triggerEventTypeLabel?: string | null } | null): string {
    if (code === 'EVENT_NOT_DECLARED' && rule?.triggerEventTypeLabel) return `Le délai part de l’événement « ${rule.triggerEventTypeLabel} », qui n’a pas encore été constaté pour ce document ni pour son dossier.`;
    if (code === 'BASE_DATE_MISSING') return rule ? `Le délai part de ${triggerText(rule.trigger)}, et cette date n’existe pas encore pour ce document.` : 'La date de départ du délai n’existe pas encore pour ce document.';
    return BLOCKERS[code] ?? code;
}

/** Les obstacles qui ne tiennent ni au document clos, ni à la règle, ni à sa date de départ : ils se disent à part. */
export const OTHER_BLOCKERS = ['DOCUMENT_PERMANENTLY_PRESERVED', 'ALREADY_SCHEDULED', 'DOSSIER_REQUIRED', 'DOSSIER_NOT_CLOSED'] as const;

export const canSchedule = (planning: Pick<RetentionPlanning, 'blockers'> | null | undefined): boolean => !planning || planning.blockers.length === 0;
