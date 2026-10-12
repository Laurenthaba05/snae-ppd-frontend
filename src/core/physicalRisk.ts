/**
 * Risques et plan d'urgence des emplacements de conservation : un registre des risques par emplacement, un plan d'urgence versionné approuvé par une autre personne que son auteur,
 * des exercices et des incidents. Le serveur reste seul juge ; ici, l'affichage et les contrôles de saisie.
 */
export type RiskLevel = 'FAIBLE' | 'MODERE' | 'ELEVE' | 'CRITIQUE';
export type RiskStatus = 'OUVERT' | 'MAITRISE' | 'ACCEPTE';
export type MeasureStatus = 'A_FAIRE' | 'EN_COURS' | 'FAITE' | 'ABANDONNEE';
export type PlanStatus = 'BROUILLON' | 'APPROUVE' | 'REMPLACE' | 'ABANDONNE';
export type ExerciseType = 'EXERCICE' | 'INCIDENT';
export type SiteGap = 'NO_PLAN' | 'PLAN_REVIEW_OVERDUE' | 'NO_EXERCISE' | 'EXERCISE_OLD' | 'RISK_WITHOUT_MEASURE' | 'MEASURE_OVERDUE' | 'RISK_REVIEW_OVERDUE';

export interface Hazard { code: string; label: string; order: number; active: boolean }
export interface RiskMeasure {
    id: string; label: string; description: string | null; owner: string | null; dueDate: string | null; status: MeasureStatus; overdue: boolean; completedOn: string | null;
    note: string | null; version: number;
}
export interface RiskEvaluation { probability: number; severity: number; score: number; level: RiskLevel; evaluatedOn: string; note: string | null; authorName: string | null }
export interface Risk {
    id: string; reference: string; locationId: string; locationLabel: string; hazardCode: string; hazardLabel: string; description: string; probability: number; severity: number;
    score: number; level: RiskLevel; existingMeasures: string | null; owner: string | null; status: RiskStatus; statusReason: string | null; decidedByName: string | null;
    decidedAt: string | null; lastReview: string; nextReview: string; reviewOverdue: boolean; createdByName: string | null; createdAt: string; version: number;
    measures: RiskMeasure[]; evaluations: RiskEvaluation[];
}
export interface RiskSummary {
    id: string; reference: string; locationId: string; locationLabel: string; hazardCode: string; hazardLabel: string; description: string; score: number; level: RiskLevel;
    status: RiskStatus; nextReview: string; reviewOverdue: boolean; openMeasures: number; overdueMeasures: number;
}
export interface PlanContact { rank: number; role: string; name: string; phone: string | null; email: string | null; note: string | null }
export interface PlanPriority { rank: number; label: string; storageUnitId: string | null; storageUnitLabel: string | null; archiveId: string | null; archiveLabel: string | null; reason: string }
export interface EmergencyPlan {
    id: string; locationId: string; locationLabel: string; versionNumber: number; title: string; status: PlanStatus; scope: string | null; alert: string | null; evacuation: string | null;
    rescue: string | null; stabilisation: string | null; resources: string | null; contacts: PlanContact[]; priorities: PlanPriority[]; createdByName: string | null; createdAt: string;
    approvedByName: string | null; approvedAt: string | null; approvalReference: string | null; nextReview: string | null; reviewOverdue: boolean; reviewedByName: string | null;
    reviewedOn: string | null; abandonReason: string | null; version: number;
}
export interface PlanSummary {
    id: string; locationId: string; locationLabel: string; versionNumber: number; title: string; status: PlanStatus; createdAt: string; approvedAt: string | null;
    nextReview: string | null; reviewOverdue: boolean;
}
export interface Exercise {
    id: string; reference: string; locationId: string; locationLabel: string; planId: string | null; planVersion: number | null; riskId: string | null; riskReference: string | null;
    type: ExerciseType; occurredOn: string; title: string; description: string; participants: number | null; findings: string; actions: string | null; recordedByName: string | null;
    recordedAt: string;
}
export interface SiteRiskSummary {
    locationId: string; locationLabel: string; openRisks: number; critical: number; high: number; moderate: number; low: number; overdueMeasures: number;
    planStatus: PlanStatus | 'AUCUN'; planVersion: number | null; planNextReview: string | null; lastExerciseOn: string | null; gaps: SiteGap[];
}

export const LEVEL_LABELS: Record<RiskLevel, string> = { FAIBLE: 'Faible', MODERE: 'Modéré', ELEVE: 'Élevé', CRITIQUE: 'Critique' };
export const RISK_STATUS_LABELS: Record<RiskStatus, string> = { OUVERT: 'Ouvert', MAITRISE: 'Maîtrisé', ACCEPTE: 'Accepté' };
export const MEASURE_LABELS: Record<MeasureStatus, string> = { A_FAIRE: 'À faire', EN_COURS: 'En cours', FAITE: 'Faite', ABANDONNEE: 'Abandonnée' };
export const PLAN_LABELS: Record<PlanStatus | 'AUCUN', string> = { AUCUN: 'Aucun plan', BROUILLON: 'Brouillon', APPROUVE: 'En vigueur', REMPLACE: 'Remplacé', ABANDONNE: 'Abandonné' };
export const EXERCISE_LABELS: Record<ExerciseType, string> = { EXERCICE: 'Exercice', INCIDENT: 'Incident' };
export const PROBABILITY_LABELS: Record<number, string> = { 1: 'Très improbable', 2: 'Improbable', 3: 'Possible', 4: 'Probable', 5: 'Quasi certain' };
export const SEVERITY_LABELS: Record<number, string> = { 1: 'Négligeable', 2: 'Limitée', 3: 'Importante', 4: 'Grave', 5: 'Catastrophique' };

export const GAP_LABELS: Record<SiteGap, string> = {
    NO_PLAN: 'Aucun plan d’urgence en vigueur',
    PLAN_REVIEW_OVERDUE: 'Revue du plan dépassée',
    NO_EXERCISE: 'Plan jamais éprouvé par un exercice',
    EXERCISE_OLD: 'Dernier exercice trop ancien',
    RISK_WITHOUT_MEASURE: 'Risque élevé sans mesure',
    MEASURE_OVERDUE: 'Mesure en retard',
    RISK_REVIEW_OVERDUE: 'Revue de risque dépassée'
};

const knownLabel = (labels: Record<string, string>, key: string): string => labels[key] ?? 'État inconnu';
export const levelLabel = (v: string): string => knownLabel(LEVEL_LABELS, v);
export const riskStatusLabel = (v: string): string => knownLabel(RISK_STATUS_LABELS, v);
export const measureLabel = (v: string): string => knownLabel(MEASURE_LABELS, v);
export const planLabel = (v: string): string => knownLabel(PLAN_LABELS, v);
export const gapLabel = (v: string): string => (GAP_LABELS as Record<string, string>)[v] ?? 'À examiner';

/** Probabilité × gravité : faible jusqu'à 4, modéré jusqu'à 9, élevé jusqu'à 15, critique au-delà. Une convention de lecture, pas une norme. */
export function levelOf(score: number): RiskLevel {
    return score >= 16 ? 'CRITIQUE' : score >= 10 ? 'ELEVE' : score >= 5 ? 'MODERE' : 'FAIBLE';
}

/** Le texte de chaque règle gardée par le serveur, pour que l'écran dise pourquoi sans montrer un code. */
export const RULE_TEXTS: Record<string, string> = {
    RISK_HAZARD_RETIRED: 'Ce danger est retiré du référentiel : choisissez-en un autre.',
    RISK_ACCEPTED_FROZEN: 'Un risque accepté ne se réévalue pas : rouvrez-le d’abord.',
    ck_risque_acceptation: 'Un risque résiduel est accepté par une autre personne que celle qui l’a enregistré.',
    ck_risque_decision: 'Maîtriser ou accepter un risque exige un motif d’au moins 10 caractères.',
    RISK_VERSION_CONFLICT: 'Ce risque a été modifié entre-temps : rechargez-le avant de l’enregistrer.',
    RISK_STATUS_UNCHANGED: 'Le risque est déjà dans cet état.',
    RISK_MEASURE_IMMUTABLE: 'Cette mesure est close : elle ne se modifie plus.',
    RISK_MEASURE_NOTE_REQUIRED: 'Une mesure faite ou abandonnée porte un compte rendu d’au moins 5 caractères.',
    RISK_LOCATION_INACTIVE: 'Cet emplacement est désactivé : on n’y enregistre plus de risque, de plan ni d’exercice.',
    EMERGENCY_PLAN_VERSION_CONFLICT: 'Ce plan a été modifié entre-temps : rechargez-le avant de l’enregistrer.',
    EMERGENCY_PLAN_APPROVED_FROZEN: 'Un plan approuvé ne se modifie plus : créez une nouvelle version.',
    EMERGENCY_PLAN_CONTACTS_REQUIRED: 'Un plan approuvé comporte au moins un contact à prévenir.',
    EMERGENCY_PLAN_PRIORITIES_REQUIRED: 'Un plan approuvé comporte au moins une priorité de sauvetage.',
    EMERGENCY_PLAN_PRIORITY_OUTSIDE_SITE: 'Une priorité de sauvetage désigne un lieu ou une archive du site du plan.',
    EMERGENCY_PLAN_TRANSITION_INVALID: 'Cette opération n’est pas possible dans l’état actuel du plan.',
    ck_plan_approuve: 'Un plan approuvé décrit l’alerte, l’évacuation et le sauvetage (10 caractères au moins chacun), et il est approuvé par une autre personne que son auteur.',
    uq_plan_urgence_brouillon: 'Un brouillon de plan est déjà ouvert pour cet emplacement : terminez-le ou abandonnez-le.',
    EMERGENCY_EXERCISE_DATE_FUTURE: 'La date de l’exercice ou de l’incident ne peut pas être dans le futur.',
    RISK_JOURNAL_APPEND_ONLY: 'Cet enregistrement ne se modifie pas : un constat plus récent le complète.'
};

const clean = (v: string): string => v.trim().replace(/\s+/g, ' ');
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

/** Une date d'échéance proposée par défaut : dans `months` mois, au jour près (le 31 janvier + 1 mois = le 28 ou 29 février). */
export function addMonths(iso: string, months: number): string {
    const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
    const total = (m - 1) + months;
    const year = y + Math.floor(total / 12);
    const month = ((total % 12) + 12) % 12;
    const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

export interface RiskInput { locationId?: string; hazard: string; description: string; probability: number | null; severity: number | null; existingMeasures: string; owner: string; nextReview: string }

export function riskProblems(input: RiskInput, today: string): string[] {
    const problems: string[] = [];
    if (!input.hazard) problems.push('Choisissez le danger.');
    if (clean(input.description).length < 10) problems.push('Décrivez le risque en 10 caractères au moins.');
    if (!input.probability || input.probability < 1 || input.probability > 5) problems.push('Évaluez la probabilité de 1 à 5.');
    if (!input.severity || input.severity < 1 || input.severity > 5) problems.push('Évaluez la gravité de 1 à 5.');
    if (!isoDate.test(input.nextReview) || input.nextReview <= today) problems.push('Indiquez la date de la prochaine revue, à venir.');
    return problems;
}

export function reviewProblems(input: { probability: number | null; severity: number | null; nextReview: string }, today: string): string[] {
    const problems: string[] = [];
    if (!input.probability || input.probability < 1 || input.probability > 5) problems.push('Évaluez la probabilité de 1 à 5.');
    if (!input.severity || input.severity < 1 || input.severity > 5) problems.push('Évaluez la gravité de 1 à 5.');
    if (!isoDate.test(input.nextReview) || input.nextReview <= today) problems.push('Indiquez la date de la prochaine revue, à venir.');
    return problems;
}

export function measureProblems(input: { label: string; dueDate: string }, today: string): string[] {
    const problems: string[] = [];
    if (clean(input.label).length < 3) problems.push('Donnez un intitulé de 3 caractères au moins.');
    if (input.dueDate && (!isoDate.test(input.dueDate) || input.dueDate < today)) problems.push('L’échéance n’est pas dans le passé.');
    return problems;
}

export function exerciseProblems(input: { occurredOn: string; title: string; description: string; findings: string }, today: string): string[] {
    const problems: string[] = [];
    if (!isoDate.test(input.occurredOn)) problems.push('Indiquez la date.');
    else if (input.occurredOn > today) problems.push('La date ne peut pas être dans le futur.');
    if (clean(input.title).length < 3) problems.push('Donnez un intitulé de 3 caractères au moins.');
    if (clean(input.description).length < 10) problems.push('Décrivez ce qui s’est passé (10 caractères au moins).');
    if (clean(input.findings).length < 10) problems.push('Notez les constats (10 caractères au moins).');
    return problems;
}

export interface ContactDraft { role: string; name: string; phone: string; email: string; note: string }
export interface PriorityDraft { label: string; storageUnitId: string; reason: string }

export function contactProblems(contacts: ContactDraft[]): string[] {
    const problems: string[] = [];
    contacts.forEach((c, index) => {
        const n = index + 1;
        if (clean(c.role).length < 2) problems.push(`Contact ${n} : indiquez la fonction.`);
        if (clean(c.name).length < 2) problems.push(`Contact ${n} : indiquez le nom.`);
        if (!clean(c.phone) && !clean(c.email)) problems.push(`Contact ${n} : un téléphone ou un courriel est nécessaire.`);
    });
    return problems;
}

export function priorityProblems(priorities: PriorityDraft[]): string[] {
    const problems: string[] = [];
    priorities.forEach((p, index) => {
        const n = index + 1;
        if (clean(p.label).length < 2) problems.push(`Priorité ${n} : indiquez ce qu’il faut sauver.`);
        if (clean(p.reason).length < 5) problems.push(`Priorité ${n} : dites pourquoi (5 caractères au moins).`);
    });
    return problems;
}

/** Ce qui manque à un brouillon pour être approuvé : le serveur et la base l'exigent aussi. */
export function approvalReadiness(plan: Pick<EmergencyPlan, 'alert' | 'evacuation' | 'rescue' | 'contacts' | 'priorities'>): string[] {
    const missing: string[] = [];
    if (clean(plan.alert ?? '').length < 10) missing.push('la procédure d’alerte');
    if (clean(plan.evacuation ?? '').length < 10) missing.push('la procédure d’évacuation');
    if (clean(plan.rescue ?? '').length < 10) missing.push('la procédure de sauvetage');
    if (plan.contacts.length === 0) missing.push('au moins un contact à prévenir');
    if (plan.priorities.length === 0) missing.push('au moins une priorité de sauvetage');
    return missing;
}

const escapeHtml = (v: string): string => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const paragraphs = (v: string | null): string => v ? v.split(/\n+/).map(line => `<p>${escapeHtml(line)}</p>`).join('') : '<p><em>Non renseigné.</em></p>';
const frDate = (iso: string | null): string => iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—';

/** La fiche du plan, à afficher sur le site : l'alerte, l'évacuation, le sauvetage, les contacts et les priorités, avec la version et la date de revue. */
export function planSheetHtml(plan: EmergencyPlan): string {
    const contacts = plan.contacts.map(c => `<tr><td>${escapeHtml(c.role)}</td><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.phone ?? '')}</td><td>${escapeHtml(c.email ?? '')}</td></tr>`).join('');
    const priorities = plan.priorities.map(p => `<tr><td>${p.rank}</td><td>${escapeHtml(p.label)}${p.storageUnitLabel ? ` <small>(${escapeHtml(p.storageUnitLabel)})</small>` : ''}${p.archiveLabel ? ` <small>(${escapeHtml(p.archiveLabel)})</small>` : ''}</td><td>${escapeHtml(p.reason)}</td></tr>`).join('');
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(plan.title)}</title><style>
body{font:14px/1.5 system-ui,sans-serif;margin:24px;color:#111}h1{font-size:22px;margin:0}h2{font-size:16px;margin:20px 0 6px;border-bottom:1px solid #999}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:4px 8px;text-align:left;vertical-align:top}.meta{color:#444}
</style></head><body><h1>${escapeHtml(plan.title)}</h1>
<p class="meta">${escapeHtml(plan.locationLabel)} — version ${plan.versionNumber} (${escapeHtml(planLabel(plan.status).toLowerCase())})${plan.approvedAt ? ` — approuvée le ${frDate(plan.approvedAt)}` : ''}${plan.nextReview ? ` — à revoir avant le ${frDate(plan.nextReview)}` : ''}</p>
<h2>Portée</h2>${paragraphs(plan.scope)}<h2>Alerte</h2>${paragraphs(plan.alert)}<h2>Évacuation</h2>${paragraphs(plan.evacuation)}
<h2>Sauvetage</h2>${paragraphs(plan.rescue)}<h2>Stabilisation et suites</h2>${paragraphs(plan.stabilisation)}<h2>Ressources et matériels</h2>${paragraphs(plan.resources)}
<h2>Personnes à prévenir</h2><table><thead><tr><th>Fonction</th><th>Nom</th><th>Téléphone</th><th>Courriel</th></tr></thead><tbody>${contacts}</tbody></table>
<h2>Priorités de sauvetage, dans l’ordre</h2><table><thead><tr><th>#</th><th>À sauver</th><th>Pourquoi</th></tr></thead><tbody>${priorities}</tbody></table>
</body></html>`;
}
