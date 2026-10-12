/**
 * Le tri par échantillonnage : la règle « trier » choisit une méthode ; la campagne l'applique à un lot d'échéances, de façon reproductible, avec des ajustements motivés. Arrêtée,
 * elle décide : les documents retenus suivent la conservation définitive (trois personnes), le reste s'élimine par le bordereau d'élimination ordinaire.
 */
export type SamplingMethod = 'SYSTEMATIQUE' | 'ALEATOIRE' | 'CHRONOLOGIQUE' | 'QUALITATIF';
export interface Sampling { method: SamplingMethod | string; step: number | null; rate: number | null; modulo: number | null; remainder: number | null; note: string | null }
export type CampaignStatus = 'BROUILLON' | 'ARRETEE' | 'ANNULEE';
export type LineOutcome = 'RETENU' | 'A_ELIMINER' | 'CONSERVATION_PROPOSEE' | 'CONSERVATION_VALIDEE' | 'CONSERVE' | 'EN_BORDEREAU' | 'ELIMINATION_VISEE' | 'ELIMINATION_REFUSEE' | 'DETRUIT' | 'ANNULEE';

export interface CampaignSummary {
    id: string; reference: string; institutionId: string; title: string; status: CampaignStatus; sampling: Sampling; ruleLabel: string | null; lines: number; retained: number;
    eliminated: number; manual: number; createdById: string; createdAt: string; stoppedAt: string | null; version: number;
}
export interface CampaignLine {
    id: string; rank: number; eventId: string; documentId: string; reference: string; title: string; baseDate: string; documentDate: string | null; retained: boolean;
    origin: 'METHODE' | 'MANUEL'; reason: string | null; essential: boolean; actionId: string | null; outcome: LineOutcome;
}
export interface Campaign {
    summary: CampaignSummary; observations: string | null; seed: string; fingerprint: string | null; stoppedById: string | null; conservationValidatedById: string | null;
    conservationValidatedAt: string | null; conservationExecutedById: string | null; conservationExecutedAt: string | null; cancelledById: string | null; cancelledAt: string | null;
    cancellationReason: string | null; description: string; lines: CampaignLine[];
}
export interface SamplingCandidate {
    eventId: string; documentId: string; reference: string; title: string; departmentId: string | null; baseDate: string; dueDate: string; rule: string | null; ruleVersionId: string;
    ruleVersionNumber: number; sampling: Sampling; essential: boolean; blockers: string[]; campaignId: string | null; campaignReference: string | null;
}
export interface SamplingRun { campaign: Campaign; done: number; failures: string[] }
export interface DocumentSampling {
    campaignId: string; campaignReference: string; campaignStatus: CampaignStatus; method: string; retained: boolean; origin: 'METHODE' | 'MANUEL'; reason: string | null;
    essential: boolean; outcome: LineOutcome;
}

export const STATUS_LABELS: Record<CampaignStatus, string> = { BROUILLON: 'Brouillon', ARRETEE: 'Arrêtée', ANNULEE: 'Annulée' };
export const OUTCOME_LABELS: Record<LineOutcome, string> = {
    RETENU: 'Retenu dans l’échantillon', A_ELIMINER: 'À éliminer', CONSERVATION_PROPOSEE: 'Conservation proposée', CONSERVATION_VALIDEE: 'Conservation validée', CONSERVE: 'Conservé définitivement',
    EN_BORDEREAU: 'Au bordereau d’élimination', ELIMINATION_VISEE: 'Élimination visée', ELIMINATION_REFUSEE: 'Élimination refusée', DETRUIT: 'Détruit', ANNULEE: 'Annulé'
};
export const METHOD_LABELS: Record<string, string> = {
    SYSTEMATIQUE: 'Systématique (un sur N)', ALEATOIRE: 'Aléatoire (pourcentage)', CHRONOLOGIQUE: 'Chronologique (certaines années)', QUALITATIF: 'Qualitatif (critères décrits)'
};
export const MAX_LINES = 1000;

export const CANDIDATE_BLOCKERS: Record<string, string> = {
    RETENTION_EVENT_NOT_DUE: 'L’échéance n’est pas arrivée, ou une décision est déjà en cours.',
    DOCUMENT_NOT_CLOSED: 'Le document n’est pas clos.', DOCUMENT_DESTROYED: 'Le document est détruit.', ACTIVE_LEGAL_HOLD: 'Un gel juridique actif bloque le document.',
    DOCUMENT_WORKFLOW_ACTIVE: 'Un circuit de traitement est toujours actif sur le document.', ALREADY_IN_CAMPAIGN: 'Le document figure déjà dans une autre campagne de tri en cours.',
    NOT_A_SAMPLING_RULE: 'Le sort final de la règle n’est pas le tri.', OTHER_RULE_VERSION: 'L’échéance relève d’une autre version de règle.'
};
export const blockerText = (code: string): string => CANDIDATE_BLOCKERS[code] ?? code;
export const isSelectable = (c: Pick<SamplingCandidate, 'blockers'>): boolean => c.blockers.length === 0;
/** « Aucun document choisi. », « 1 document choisi. », « 12 documents choisis. » */
export function selectionText(_candidates: ReadonlyArray<unknown>, selected: ReadonlySet<string>): string {
    const n = selected.size;
    return n === 0 ? 'Aucun document choisi.' : n === 1 ? '1 document choisi.' : `${n} documents choisis.`;
}

/** « un document sur 3 », « 20 % tirés au hasard », « années dont le reste de la division par 5 est 0 », « critères décrits ». */
export function describeSampling(s: Sampling): string {
    switch (s.method) {
        case 'SYSTEMATIQUE': return `Un document sur ${s.step}, dans l’ordre chronologique.`;
        case 'ALEATOIRE': return `${s.rate} % des documents, tirés au hasard (tirage reproductible).`;
        case 'CHRONOLOGIQUE': return `Les documents des années dont le reste de la division par ${s.modulo} est ${s.remainder}.`;
        case 'QUALITATIF': return 'Les documents qui répondent aux critères de la note, retenus un à un.';
        default: return s.method;
    }
}

export interface SamplingForm { method: string; step: string; rate: string; modulo: string; remainder: string; note: string }
export const emptySamplingForm = (): SamplingForm => ({ method: 'SYSTEMATIQUE', step: '', rate: '', modulo: '', remainder: '', note: '' });
export function samplingFormOf(s: Sampling | null | undefined): SamplingForm {
    return s ? { method: s.method, step: s.step != null ? String(s.step) : '', rate: s.rate != null ? String(s.rate) : '', modulo: s.modulo != null ? String(s.modulo) : '',
        remainder: s.remainder != null ? String(s.remainder) : '', note: s.note ?? '' } : emptySamplingForm();
}

const int = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v) : NaN);

/** Ce que le serveur refuserait d'une méthode de tri, dit avant l'envoi. */
export function samplingProblems(f: SamplingForm): string[] {
    switch (f.method) {
        case 'SYSTEMATIQUE': { const n = int(f.step); return n >= 2 && n <= 1000 ? [] : ['Le tri systématique garde un document sur N, avec N de 2 à 1000.']; }
        case 'ALEATOIRE': { const n = int(f.rate); return n >= 1 && n <= 99 ? [] : ['Le tri aléatoire garde un pourcentage compris entre 1 et 99.']; }
        case 'CHRONOLOGIQUE': {
            const m = int(f.modulo); const r = int(f.remainder);
            return m >= 2 && m <= 100 && r >= 0 && r < m ? [] : ['Le tri chronologique garde les années dont le reste de la division par un nombre de 2 à 100 est celui indiqué.'];
        }
        case 'QUALITATIF': return f.note.trim() ? [] : ['Le tri qualitatif décrit ses critères : la note est obligatoire.'];
        default: return ['Choisissez la méthode de tri.'];
    }
}

/** Les champs de méthode envoyés avec la version de règle (nuls hors du sort « trier »). */
export function samplingBody(f: SamplingForm, active: boolean): Record<string, unknown> {
    if (!active) return { samplingMethod: null, samplingStep: null, samplingRate: null, samplingModulo: null, samplingRemainder: null, samplingNote: null };
    return {
        samplingMethod: f.method, samplingStep: f.method === 'SYSTEMATIQUE' ? Number(f.step) : null, samplingRate: f.method === 'ALEATOIRE' ? Number(f.rate) : null,
        samplingModulo: f.method === 'CHRONOLOGIQUE' ? Number(f.modulo) : null, samplingRemainder: f.method === 'CHRONOLOGIQUE' ? Number(f.remainder) : null,
        samplingNote: f.method === 'QUALITATIF' || f.note.trim() ? f.note.trim() || null : null
    };
}

export function creationProblems(title: string, ruleVersionId: string, selectedCount: number): string[] {
    const problems: string[] = [];
    if (!title.trim()) problems.push('L’intitulé de la campagne est obligatoire.');
    else if (title.trim().length > 300) problems.push('L’intitulé est limité à 300 caractères.');
    if (!ruleVersionId) problems.push('Choisissez la règle dont la méthode de tri s’applique.');
    if (selectedCount === 0) problems.push('Choisissez au moins un document.');
    if (selectedCount > MAX_LINES) problems.push(`Une campagne compte ${MAX_LINES} documents au plus.`);
    return problems;
}

export const MIN_REASON = 10;
export function reasonProblem(reason: string): string | null {
    const length = reason.trim().length;
    return length < MIN_REASON ? `Le motif est obligatoire : ${MIN_REASON} caractères au moins.` : length > 500 ? 'Le motif est limité à 500 caractères.' : null;
}

export interface ValidationForm { visaReference: string; procesVerbal: string }
export function validationProblems(f: ValidationForm): string[] {
    const problems: string[] = [];
    if (!f.visaReference.trim()) problems.push('La référence de la décision est obligatoire.');
    if (!f.procesVerbal.trim()) problems.push('Le procès-verbal est obligatoire.');
    else if (f.procesVerbal.trim().length > 15000) problems.push('Le procès-verbal est limité à 15000 caractères.');
    return problems;
}

export type CampaignAction = 'ADD' | 'STOP' | 'VALIDATE' | 'EXECUTE' | 'CANCEL';
export interface Capabilities { propose: boolean; validate: boolean; execute: boolean }

/** Ce que la personne peut faire maintenant, selon l'état de la campagne, ce qui reste à valider ou exécuter, et ses droits. */
export function availableActions(c: Pick<CampaignSummary, 'status'> & { lines: Array<Pick<CampaignLine, 'outcome' | 'retained'>> }, can: Capabilities): CampaignAction[] {
    const actions: CampaignAction[] = [];
    if (c.status === 'BROUILLON' && can.propose) actions.push('ADD', 'STOP', 'CANCEL');
    if (c.status === 'ARRETEE') {
        if (can.validate && c.lines.some(l => l.outcome === 'CONSERVATION_PROPOSEE')) actions.push('VALIDATE');
        if (can.execute && c.lines.some(l => l.outcome === 'CONSERVATION_VALIDEE')) actions.push('EXECUTE');
        if (can.propose) actions.push('CANCEL');
    }
    return actions;
}

export function progressText(c: Pick<CampaignSummary, 'status' | 'lines' | 'retained' | 'eliminated' | 'manual'>): string {
    const base = `${c.retained} retenu${c.retained > 1 ? 's' : ''} dans l’échantillon, ${c.eliminated} à éliminer${c.manual > 0 ? ` (dont ${c.manual} ajusté${c.manual > 1 ? 's' : ''} à la main)` : ''}`;
    switch (c.status) {
        case 'BROUILLON': return `${base}. La campagne n’est pas encore arrêtée : la décision peut encore changer.`;
        case 'ARRETEE': return `${base}. La décision est figée.`;
        case 'ANNULEE': return 'Campagne annulée : rien n’a été décidé.';
    }
}

/** La part conservée, en pourcentage lisible. */
export function retainedShare(c: Pick<CampaignSummary, 'lines' | 'retained'>): string {
    return c.lines === 0 ? '—' : `${Math.round((c.retained / c.lines) * 100)} %`;
}

export function runText(r: Pick<SamplingRun, 'done' | 'failures'>): string {
    const done = r.done === 0 ? 'Aucun document n’a été conservé.' : r.done === 1 ? '1 document a été conservé définitivement.' : `${r.done} documents ont été conservés définitivement.`;
    return r.failures.length > 0 ? `${done} ${r.failures.length === 1 ? '1 ligne a échoué' : `${r.failures.length} lignes ont échoué`} (voir ci-dessous).` : done;
}
