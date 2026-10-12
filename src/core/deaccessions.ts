/**
 * Sortie définitive d'un bien de la collection : proposée, examinée, décidée puis exécutée par des personnes distinctes. Une fois exécutée, le bien est « sorti » et ses originaux ne
 * bougent plus ; rien n'est supprimé. Le serveur reste seul juge ; ici, l'affichage et les contrôles de saisie.
 */
export type ExitNature = 'RESTITUTION' | 'TRANSFERT' | 'DISPARITION';
export type ExitStatus = 'PROPOSEE' | 'EXAMINEE' | 'APPROUVEE' | 'EXECUTEE' | 'REFUSEE' | 'ANNULEE';
export type ExitAction = 'EXAMINE' | 'APPROVE' | 'REFUSE' | 'EXECUTE' | 'CANCEL';

export interface ExitSummary {
    id: string; numero: string; bienId: string; bienIdentifiant: string; bienIntitule: string; institutionId: string; nature: ExitNature; motifLabel: string; statut: ExitStatus;
    destinataire: string | null; proposeLe: string;
}
export interface ExitPage { items: ExitSummary[]; page: number; size: number; hasMore: boolean }
export interface ExitOriginal { archiveId: string; reference: string; label: string | null }
export interface ExitBlocker { code: string; message: string }
export interface Exit {
    id: string; numero: string; bienId: string; bienIdentifiant: string; bienIntitule: string; institutionId: string; nature: ExitNature; motifCode: string; motifLabel: string;
    justification: string; destinataire: string | null; valeurVenale: number | null; devise: string | null; valeurSource: string | null; statut: ExitStatus; proposeParNom: string | null;
    proposeLe: string; examen: string | null; examineParNom: string | null; examineLe: string | null; decideParNom: string | null; decideLe: string | null; decisionReference: string | null;
    decisionDate: string | null; decisionMotif: string | null; executeParNom: string | null; executeLe: string | null; dateSortie: string | null; acteReference: string | null;
    observations: string | null; annuleParNom: string | null; annuleLe: string | null; annulationMotif: string | null; version: number; originaux: ExitOriginal[];
    obstacles: ExitBlocker[]; actions: ExitAction[];
}
export interface AssetExits {
    items: ExitSummary[]; priseEnCharge: string; situationJuridique: string; obstacles: Record<ExitNature, ExitBlocker[]>; peutProposer: boolean; ouverte: string | null;
}

export const NATURE_LABELS: Record<ExitNature, string> = { RESTITUTION: 'Restitution', TRANSFERT: 'Transfert à un autre détenteur', DISPARITION: 'Disparition constatée' };
export const NATURE_HINTS: Record<ExitNature, string> = {
    RESTITUTION: 'Le bien retourne à son propriétaire ou à celui qui l’avait déposé.',
    TRANSFERT: 'Un autre détenteur reçoit le bien : transfert, échange ou cession.',
    DISPARITION: 'Le bien n’est plus entre les mains de l’institution : perte, vol ou destruction constatée.'
};
export const STATUS_LABELS: Record<ExitStatus, string> = {
    PROPOSEE: 'Proposée', EXAMINEE: 'Examinée', APPROUVEE: 'Approuvée', EXECUTEE: 'Exécutée', REFUSEE: 'Refusée', ANNULEE: 'Annulée'
};
export const natureLabel = (v: string): string => (NATURE_LABELS as Record<string, string>)[v] ?? 'Nature inconnue';
export const statusLabel = (v: string): string => (STATUS_LABELS as Record<string, string>)[v] ?? 'État inconnu';

/** L'étape où en est le dossier, en une phrase : ce qu'il attend et de qui. */
export function waitingFor(status: ExitStatus): string {
    switch (status) {
        case 'PROPOSEE': return 'En attente d’un examen juridique et de provenance, par une autre personne que celle qui a proposé la sortie.';
        case 'EXAMINEE': return 'En attente de la décision de l’autorité, qui n’a ni proposé ni examiné la sortie.';
        case 'APPROUVEE': return 'Décidée : en attente de son exécution, par une personne autre que celle qui a décidé.';
        case 'EXECUTEE': return 'Exécutée : le bien est sorti de la collection.';
        case 'REFUSEE': return 'Refusée : le bien reste dans la collection.';
        case 'ANNULEE': return 'Annulée : le bien reste dans la collection.';
    }
}

export const ACTION_LABELS: Record<ExitAction, string> = {
    EXAMINE: 'Examiner la sortie', APPROVE: 'Approuver la sortie', REFUSE: 'Refuser la sortie', EXECUTE: 'Exécuter la sortie', CANCEL: 'Annuler le dossier'
};

/** Le texte de chaque règle gardée par le serveur, pour que l'écran dise pourquoi sans montrer un code. */
export const RULE_TEXTS: Record<string, string> = {
    HERITAGE_DEACCESSION_ASSET_NOT_ELIGIBLE: 'Ce bien n’est pas dans un état qui permette sa sortie : il doit être pris en charge, de l’institution.',
    HERITAGE_DEACCESSION_NOT_TAKEN_IN_CHARGE: 'Le bien n’est pas pris en charge : sa sortie ne se propose que pour un bien dont l’entrée est décidée.',
    HERITAGE_DEACCESSION_NOT_OWNED: 'Un bien déposé ou prêté n’appartient pas à l’institution : il ne peut que retourner à celui qui l’a confié.',
    HERITAGE_DEACCESSION_LEGAL_UNCLEAR: 'La situation juridique du bien est à clarifier : on ne propose pas sa sortie avant de savoir à qui il appartient.',
    HERITAGE_DEACCESSION_ALREADY_EXITED: 'Ce bien est déjà sorti de la collection.',
    HERITAGE_DEACCESSION_MOTIF_UNKNOWN: 'Ce motif est inconnu ou retiré du référentiel.',
    HERITAGE_DEACCESSION_STALE_VERSION: 'Ce dossier a été modifié entre-temps : rechargez-le avant d’agir.',
    HERITAGE_DEACCESSION_BLOCKED: 'Le bien ne peut pas sortir tant que des opérations le concernant sont en cours.',
    HERITAGE_DEACCESSION_TRANSITION_INVALID: 'Cette opération n’est pas possible dans l’état actuel du dossier.',
    HERITAGE_DEACCESSION_DATE_FUTURE: 'La date ne peut pas être dans le futur.',
    HERITAGE_DEACCESSION_DATE_BEFORE_DECISION: 'La sortie ne peut pas précéder la date de l’acte de décision.',
    HERITAGE_DEACCESSION_IMMUTABLE: 'Ce dossier est clos : il ne se modifie plus.',
    HERITAGE_ASSET_EXITED: 'Ce bien est sorti de la collection : lui et ses originaux ne se modifient plus et ne bougent plus.',
    uq_sortie_collection_ouverte: 'Une sortie est déjà ouverte pour ce bien : terminez-la ou annulez-la d’abord.',
    ck_sortie_examen: 'L’examen est écrit (30 caractères au moins) et fait par une autre personne que celle qui a proposé la sortie.',
    ck_sortie_decision: 'La décision est prise par une personne qui n’a ni proposé ni examiné la sortie, avec la référence et la date de l’acte.',
    ck_sortie_refus: 'Un refus est motivé (10 caractères au moins) et décidé par une autre personne que celle qui a proposé la sortie.',
    ck_sortie_execution: 'La sortie est exécutée par une autre personne que celle qui a décidé, avec la date de sortie et la référence de l’acte de sortie.'
};

const clean = (v: string): string => v.trim().replace(/\s+/g, ' ');
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export interface ProposalInput { nature: ExitNature | ''; motif: string; justification: string; destinataire: string; valeurVenale: string; devise: string; valeurSource: string }

export function proposalProblems(input: ProposalInput): string[] {
    const problems: string[] = [];
    if (!input.nature) problems.push('Choisissez la nature de la sortie.');
    if (!input.motif) problems.push('Choisissez le motif dans le référentiel.');
    if (clean(input.justification).length < 30) problems.push('Justifiez la sortie en 30 caractères au moins.');
    if (input.nature && input.nature !== 'DISPARITION' && clean(input.destinataire).length < 2) problems.push('Nommez le destinataire du bien.');
    const value = input.valeurVenale.trim();
    if (value || input.devise.trim()) {
        if (!/^\d{1,14}([.,]\d{1,2})?$/.test(value)) problems.push('La valeur vénale est un montant positif, à deux décimales au plus.');
        if (!/^[A-Za-z]{3}$/.test(input.devise.trim())) problems.push('La devise est un code de trois lettres.');
        if (clean(input.valeurSource).length < 5) problems.push('Dites comment la valeur vénale a été établie.');
    }
    return problems;
}

export const examinationProblems = (text: string): string[] => (clean(text).length < 30 ? ['L’examen juridique et de provenance se rédige en 30 caractères au moins.'] : []);

export function approvalProblems(input: { reference: string; date: string }, today: string): string[] {
    const problems: string[] = [];
    if (clean(input.reference).length < 2) problems.push('Indiquez la référence de l’acte qui fonde la décision.');
    if (!isoDate.test(input.date)) problems.push('Indiquez la date de l’acte.');
    else if (input.date > today) problems.push('La date de l’acte ne peut pas être dans le futur.');
    return problems;
}

export function executionProblems(input: { dateSortie: string; acteReference: string }, today: string, decisionDate: string | null): string[] {
    const problems: string[] = [];
    if (!isoDate.test(input.dateSortie)) problems.push('Indiquez la date de la sortie.');
    else {
        if (input.dateSortie > today) problems.push('La date de sortie ne peut pas être dans le futur.');
        if (decisionDate && input.dateSortie < decisionDate) problems.push('La sortie ne peut pas précéder la date de l’acte de décision.');
    }
    if (clean(input.acteReference).length < 2) problems.push('Indiquez la référence de l’acte de sortie (procès-verbal de remise, acte de cession…).');
    return problems;
}

/** Les natures que l'on peut proposer pour ce bien aujourd'hui (celles sans obstacle). */
export function proposableNatures(obstacles: Record<ExitNature, ExitBlocker[]>): ExitNature[] {
    return (Object.keys(NATURE_LABELS) as ExitNature[]).filter(n => (obstacles[n] ?? []).length === 0);
}

/** « 2 500 000 GNF » : le montant et sa devise, ou rien. */
export function valueText(value: number | null, currency: string | null): string | null {
    if (value === null || value === undefined) return null;
    const text = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value);
    return currency ? `${text} ${currency}` : text;
}
