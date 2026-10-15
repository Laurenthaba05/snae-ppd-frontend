import type { RetentionRuleListItem, RetentionRuleVersionSummary } from './types.js';
import { dayText } from './placement.js';
import { ruleSentence } from './retentionPlanning.js';
import { emptySamplingForm, samplingBody, samplingFormOf, samplingProblems, type SamplingForm } from './sampling.js';

/**
 * La règle de conservation créée depuis le formulaire : une règle, sa première version, puis son activation. Le serveur exige qu'une version vise au moins un type de document
 * ou une rubrique du plan de classement (500 au plus), et une référence légale pour toute règle qui élimine.
 */
export const MAX_RULE_TARGETS = 500;
export const MAX_RULE_DURATION = 100000;
export const RULE_PRIORITY = 100;

export type RuleScope = 'NATIONAL' | 'INSTITUTION';
export interface RuleForm {
    description?: string; priority?: string; effectiveFrom?: string; effectiveTo?: string; legalDescription?: string;
    code: string; label: string; scope: RuleScope; duration: string; unit: string; trigger: string; finalDisposition: string; legalReference: string;
    typeDocumentIds: string[]; classificationNodeIds: string[];
    /** Durée de la phase courante (avant les archives intermédiaires) : vide si la règle n'a pas de phase intermédiaire. */
    phaseDuration: string; phaseUnit: string;
    /** Le type d'événement attendu (déclencheur « événement » seulement). */
    triggerEventTypeId: string;
    /** La méthode de tri (sort final « trier » seulement). */
    sampling: SamplingForm;
}
export const emptyRuleForm = (institutionId: string | null | undefined): RuleForm => ({
    code: '', label: '', scope: institutionId ? 'INSTITUTION' : 'NATIONAL', duration: '', unit: 'ANNEES', trigger: 'DATE_CLOTURE_DOCUMENT', finalDisposition: 'REEXAMINER', legalReference: '',
    typeDocumentIds: [], classificationNodeIds: [], phaseDuration: '', phaseUnit: 'ANNEES', triggerEventTypeId: '', sampling: emptySamplingForm()
});

/** La portée réellement envoyée : une règle d'institution exige une institution choisie, sinon elle est nationale. */
export const effectiveScope = (form: Pick<RuleForm, 'scope'>, institutionId: string | null | undefined): RuleScope => form.scope === 'INSTITUTION' && institutionId ? 'INSTITUTION' : 'NATIONAL';

/** Les contrôles faits avant d'envoyer quoi que ce soit : ce que le serveur refuserait de toute façon, dit en clair et avant qu'une règle vide ne soit créée. */
export function ruleProblems(form: RuleForm, institutionId: string | null | undefined, ruleAlreadyCreated = false): string[] {
    const problems: string[] = [];
    if (form.priority !== undefined && (!/^\d+$/.test(form.priority) || Number(form.priority) > 1000000)) problems.push('La priorité est un entier compris entre 0 et 1000000.');
    for (const value of [form.effectiveFrom, form.effectiveTo]) if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) problems.push('Indiquez une date de validité correcte.');
    if (form.effectiveTo && form.effectiveTo < (form.effectiveFrom || new Date().toISOString().slice(0, 10))) problems.push('La fin de validité doit suivre le début.');
    if ((form.description?.length ?? 0) > 4000 || (form.legalDescription?.length ?? 0) > 4000) problems.push('Les descriptions sont limitées à 4000 caractères.');
    if (!ruleAlreadyCreated) {
        if (!form.code.trim()) problems.push('Le code de la règle est obligatoire.');
        if (!form.label.trim()) problems.push('L’intitulé de la règle est obligatoire.');
        if (form.scope === 'INSTITUTION' && !institutionId) problems.push('Choisissez d’abord une institution dans le contexte de travail, ou prenez la portée nationale.');
    }
    if (!/^\d+$/.test(form.duration.trim()) || Number(form.duration) > MAX_RULE_DURATION) problems.push(`La durée est un nombre entier, de 0 à ${MAX_RULE_DURATION}.`);
    const targets = form.typeDocumentIds.length + form.classificationNodeIds.length;
    if (targets < 1) problems.push('Choisissez au moins un type de document ou une rubrique du plan de classement : la règle s’applique à ce qui est choisi.');
    if (targets > MAX_RULE_TARGETS) problems.push(`Une règle vise ${MAX_RULE_TARGETS} cibles au plus.`);
    if (form.finalDisposition === 'ELIMINER' && !form.legalReference.trim()) problems.push('Une règle qui élimine exige sa référence légale : le texte qui autorise l’élimination.');
    problems.push(...phaseProblems(form));
    if (form.trigger === 'EVENEMENT' && !form.triggerEventTypeId) problems.push('Choisissez le type d’événement qui déclenche le délai.');
    if (form.finalDisposition === 'TRIER') {
        problems.push(...samplingProblems(form.sampling));
        if (!form.legalReference.trim()) problems.push('Une règle qui trie exige sa référence légale : le tableau de tri ou le texte qui autorise l’élimination du reste.');
    }
    return problems;
}

/** Les mois approximatifs d'une durée, pour comparer la phase courante à la durée totale (le serveur fait la comparaison exacte). */
const approxDays = (n: number, unit: string): number => unit === 'JOURS' ? n : unit === 'MOIS' ? n * 30.4375 : n * 365.25;

/** La phase courante va avec son unité, est un nombre entier, et ne dépasse pas la durée totale. Vide : pas de phase intermédiaire. */
export function phaseProblems(form: Pick<RuleForm, 'duration' | 'unit' | 'phaseDuration' | 'phaseUnit'>): string[] {
    const raw = form.phaseDuration.trim();
    if (raw === '') return [];
    if (!/^\d+$/.test(raw) || Number(raw) > MAX_RULE_DURATION) return [`La durée de la phase courante est un nombre entier, de 0 à ${MAX_RULE_DURATION}.`];
    if (/^\d+$/.test(form.duration.trim()) && Math.round(approxDays(Number(raw), form.phaseUnit)) > Math.round(approxDays(Number(form.duration), form.unit)))
        return ['La phase courante ne peut pas durer plus que la conservation totale.'];
    return [];
}

export function ruleBody(form: RuleForm, institutionId: string | null | undefined): Record<string, unknown> {
    const scope = effectiveScope(form, institutionId);
    return { code: form.code.trim(), label: form.label.trim(), scope, institutionId: scope === 'INSTITUTION' ? institutionId : null, priority: form.priority === undefined ? RULE_PRIORITY : Number(form.priority), ...(form.description?.trim() ? { description: form.description.trim() } : {}) };
}

export function versionBody(form: RuleForm, today: string): Record<string, unknown> {
    return {
        effectiveFrom: form.effectiveFrom || today, ...(form.effectiveTo ? { effectiveTo: form.effectiveTo } : {}), ...(form.legalDescription?.trim() ? { legalDescription: form.legalDescription.trim() } : {}), duration: Number(form.duration), unit: form.unit, trigger: form.trigger, finalDisposition: form.finalDisposition,
        legalReference: form.legalReference.trim() || null, typeDocumentIds: [...form.typeDocumentIds].sort(), classificationNodeIds: [...form.classificationNodeIds].sort(),
        currentPhaseDuration: form.phaseDuration.trim() === '' ? null : Number(form.phaseDuration), currentPhaseUnit: form.phaseDuration.trim() === '' ? null : form.phaseUnit,
        triggerEventTypeId: form.trigger === 'EVENEMENT' ? form.triggerEventTypeId : null,
        ...samplingBody(form.sampling, form.finalDisposition === 'TRIER')
    };
}

/** Ajoute ou retire un identifiant d'une sélection, sans doublon. */
export const toggled = (list: readonly string[], id: string, on: boolean): string[] => on ? (list.includes(id) ? [...list] : [...list, id]) : list.filter(x => x !== id);

/** La version qui compte pour préremplir une nouvelle version : celle en vigueur, sinon la plus récente. */
export const latestVersion = (rule: Pick<RetentionRuleListItem, 'versions'>): RetentionRuleVersionSummary | null =>
    rule.versions.find(v => v.status === 'ACTIVE') ?? rule.versions[0] ?? null;

/** Le formulaire d'une nouvelle version d'une règle existante : l'identité de la règle, et les réglages de sa dernière version. */
export function ruleFormOf(rule: RetentionRuleListItem): RuleForm {
    const v = latestVersion(rule);
    return {
        description: rule.description ?? '', priority: String(rule.priority), effectiveFrom: '', effectiveTo: '', legalDescription: v?.legalDescription ?? '',
        code: rule.code, label: rule.label, scope: rule.scope === 'INSTITUTION' ? 'INSTITUTION' : 'NATIONAL',
        duration: v ? String(v.duration) : '', unit: v?.unit ?? 'ANNEES', trigger: v?.trigger ?? 'DATE_CLOTURE_DOCUMENT', finalDisposition: v?.finalDisposition ?? 'REEXAMINER',
        legalReference: v?.legalReference ?? '', typeDocumentIds: v ? [...v.typeDocumentIds] : [], classificationNodeIds: v ? [...v.classificationNodeIds] : [],
        phaseDuration: v?.currentPhaseDuration != null ? String(v.currentPhaseDuration) : '', phaseUnit: v?.currentPhaseUnit ?? 'ANNEES', triggerEventTypeId: v?.triggerEventTypeId ?? '', sampling: samplingFormOf(v?.sampling)
    };
}

/** Où en est une règle : en vigueur (avec depuis quand et en quelle version), sans version, ou seulement en brouillon. */
export function ruleState(rule: RetentionRuleListItem): { tone: 'ok' | 'warn' | 'bad' | ''; text: string } {
    const active = rule.versions.find(v => v.status === 'ACTIVE');
    if (rule.status !== 'ACTIF') return { tone: '', text: 'Règle inactive' };
    if (active) return { tone: 'ok', text: `En vigueur : version ${active.number} depuis le ${dayText(active.effectiveFrom)}` };
    if (!rule.versions.length) return { tone: 'bad', text: 'Aucune version : la règle ne s’applique à rien' };
    return { tone: 'warn', text: 'Aucune version en vigueur (brouillon ou retirée)' };
}

/** La phrase d'une version : « 10 ans après la clôture du document, puis conserver définitivement ». */
export const versionSentence = (v: RetentionRuleVersionSummary): string => ruleSentence({ duration: v.duration, unit: v.unit, trigger: v.trigger, finalDisposition: v.finalDisposition, currentPhaseDuration: v.currentPhaseDuration, currentPhaseUnit: v.currentPhaseUnit, triggerEventTypeLabel: v.triggerEventTypeLabel });

/** Ce que vise une version, par les noms : les types de documents, puis les rubriques du plan de classement. Un identifiant sans nom est compté, jamais montré. */
export function targetNames(v: Pick<RetentionRuleVersionSummary, 'typeDocumentIds' | 'classificationNodeIds'>, typeNames: ReadonlyMap<string, string>, nodeNames: ReadonlyMap<string, string>): { types: string[]; nodes: string[] } {
    const named = (ids: readonly string[], names: ReadonlyMap<string, string>) => {
        const known = ids.map(id => names.get(id)).filter((n): n is string => Boolean(n)).sort((a, b) => a.localeCompare(b, 'fr'));
        const missing = ids.length - known.length;
        return missing > 0 ? [...known, missing === 1 ? '1 élément non disponible' : `${missing} éléments non disponibles`] : known;
    };
    return { types: named(v.typeDocumentIds, typeNames), nodes: named(v.classificationNodeIds, nodeNames) };
}
