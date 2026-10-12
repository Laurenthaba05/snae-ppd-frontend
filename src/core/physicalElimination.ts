/**
 * Élimination des archives physiques : un procès-verbal constitué et soumis, visé ligne par ligne par une autre personne, puis exécuté avec la destruction constatée par deux personnes.
 * L'archive détruite n'est pas supprimée : elle est marquée et figée. Le serveur reste seul juge ; ici, l'affichage et les contrôles de saisie.
 */
export type EliminationStatus = 'BROUILLON' | 'SOUMIS' | 'VISE' | 'REFUSE' | 'EXECUTE' | 'ANNULE';
export type EliminationLineStatus = 'INSCRITE' | 'ACCEPTEE' | 'REFUSEE' | 'DETRUITE' | 'ANNULEE';

export interface EliminationLine {
    id: string; rank: number; archiveId: string; status: EliminationLineStatus; reference: string; description: string | null; support: string | null;
    quantity: number | null; unit: string | null; storageUnit: string | null; refusalReason: string | null; decidedByName: string | null; decidedAt: string | null;
}
export interface Elimination {
    id: string; reference: string; title: string; remarks: string | null; status: EliminationStatus; createdByName: string | null; createdAt: string; submittedByName: string | null;
    submittedAt: string | null; authority: string | null; visaReference: string | null; visaDate: string | null; minutes: string | null; visaByName: string | null; visaAt: string | null;
    destructionDate: string | null; method: string | null; place: string | null; operator: string | null; witness: string | null; executedByName: string | null; executedAt: string | null;
    fingerprint: string | null; cancelledByName: string | null; cancelledAt: string | null; cancelReason: string | null; version: number; lines: EliminationLine[];
}
export interface EliminationSummary { id: string; reference: string; title: string; status: EliminationStatus; createdAt: string; lines: number; accepted: number; refused: number; destroyed: number }
export interface EliminationCandidate { archiveId: string; reference: string; description: string | null; support: string | null; quantity: number | null; unit: string | null; storageUnit: string | null }
export interface EliminationCandidatePage { items: EliminationCandidate[]; page: number; size: number; hasMore: boolean }

export const STATUS_LABELS: Record<EliminationStatus, string> = {
    BROUILLON: 'En préparation', SOUMIS: 'Soumis à l’autorité', VISE: 'Visé', REFUSE: 'Refusé', EXECUTE: 'Exécuté', ANNULE: 'Annulé'
};
export const LINE_LABELS: Record<EliminationLineStatus, string> = { INSCRITE: 'En attente', ACCEPTEE: 'Acceptée', REFUSEE: 'Refusée', DETRUITE: 'Détruite', ANNULEE: 'Annulée' };
export const statusLabel = (s: string): string => (STATUS_LABELS as Record<string, string>)[s] ?? 'État inconnu';
export const lineLabel = (s: string): string => (LINE_LABELS as Record<string, string>)[s] ?? 'État inconnu';

export const MAX_LINES = 500;

/** Le texte de chaque règle gardée par le serveur, pour que l'écran dise pourquoi sans montrer un code. */
export const RULE_TEXTS: Record<string, string> = {
    PHYSICAL_ELIMINATION_ARCHIVE_BLOCKED: 'Cette archive ne peut pas être éliminée : elle est dehors, rattachée à un bien patrimonial, ou son document est essentiel ou sous gel juridique.',
    PHYSICAL_ELIMINATION_ARCHIVE_ALREADY_LISTED: 'Une de ces archives est déjà inscrite sur un procès-verbal en cours, ou déjà détruite.',
    PHYSICAL_ELIMINATION_DUAL_CONTROL: 'Celui qui vise ne peut pas être celui qui a soumis.',
    PHYSICAL_ELIMINATION_VISA_INCOMPLETE: 'Le visa exige que chaque ligne soit décidée, au moins une acceptée, avec l’autorité, la référence, la date et le procès-verbal du visa.',
    PHYSICAL_ELIMINATION_WITNESS_REQUIRED: 'L’opérateur et le témoin doivent être deux personnes.',
    PHYSICAL_ELIMINATION_BEFORE_VISA: 'La destruction ne peut pas précéder le visa.',
    PHYSICAL_ELIMINATION_TRANSITION_INVALID: 'Cette opération n’est pas possible dans l’état actuel du procès-verbal.',
    PHYSICAL_ELIMINATION_IMMUTABLE: 'Ce procès-verbal est clos : il ne se modifie plus.',
    PHYSICALARCHIVES_ELIMINATED: 'Cette archive physique est détruite : elle ne se modifie ni ne bouge plus.'
};

export interface LineCounts { total: number; waiting: number; accepted: number; refused: number; destroyed: number }
export function lineCounts(lines: Array<Pick<EliminationLine, 'status'>>): LineCounts {
    const live = lines.filter(l => l.status !== 'ANNULEE');
    const count = (s: EliminationLineStatus) => live.filter(l => l.status === s).length;
    return { total: live.length, waiting: count('INSCRITE'), accepted: count('ACCEPTEE'), refused: count('REFUSEE'), destroyed: count('DETRUITE') };
}

const clean = (v: string): string => v.trim().replace(/\s+/g, ' ');

export function createProblems(title: string, selected: number): string[] {
    const problems: string[] = [];
    if (clean(title).length < 3) problems.push('Donnez un intitulé de 3 caractères au moins.');
    if (selected < 1) problems.push('Choisissez au moins une archive.');
    if (selected > MAX_LINES) problems.push(`Un procès-verbal compte ${MAX_LINES} archives au plus.`);
    return problems;
}

export function approvalProblems(input: { authority: string; visaReference: string; visaDate: string; minutes: string }, today: string): string[] {
    const problems: string[] = [];
    if (clean(input.authority).length < 3) problems.push('Indiquez l’autorité qui vise.');
    if (clean(input.visaReference).length < 1) problems.push('Indiquez la référence du visa.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.visaDate)) problems.push('Indiquez la date du visa.');
    else if (input.visaDate > today) problems.push('La date du visa ne peut pas être dans le futur.');
    if (clean(input.minutes).length < 10) problems.push('Le procès-verbal du visa est obligatoire (10 caractères au moins).');
    return problems;
}

export function executionProblems(input: { destructionDate: string; method: string; place: string; operator: string; witness: string }, today: string, visaDate: string | null): string[] {
    const problems: string[] = [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.destructionDate)) problems.push('Indiquez la date de la destruction.');
    else {
        if (input.destructionDate > today) problems.push('La date de destruction ne peut pas être dans le futur.');
        if (visaDate && input.destructionDate < visaDate) problems.push('La destruction ne peut pas précéder le visa.');
    }
    for (const [label, value] of [['la méthode de destruction', input.method], ['le lieu', input.place], ['l’opérateur', input.operator], ['le témoin', input.witness]] as const)
        if (clean(value).length < 2) problems.push(`Indiquez ${label}.`);
    if (clean(input.operator).length >= 2 && clean(input.operator).toLowerCase() === clean(input.witness).toLowerCase()) problems.push('L’opérateur et le témoin doivent être deux personnes.');
    return problems;
}

/** « 2,5 ML » : la quantité et son unité, ou rien. */
export function quantityText(quantity: number | null, unit: string | null): string | null {
    if (quantity === null || quantity === undefined) return null;
    const text = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 }).format(quantity);
    return unit ? `${text} ${unit}` : text;
}

/** L'état de l'archive pour la liste des archives d'une unité : détruite ou non. */
export const destroyedText = (destructionDate: string | null): string => (destructionDate ? `Détruite le ${destructionDate.split('-').reverse().join('/')}` : 'Détruite');
