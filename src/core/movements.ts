import type { MovementPurpose, MovementRequest, MovementRequestStatus, MovementTransitionOption } from './types.js';
import { MOTIF_MIN } from './heritageAssets.js';
import { emptyReportForm, reportBody, reportProblems } from './conservation.js';
import type { ReportForm } from './conservation.js';

/* Mouvements : on ne sort pas un original de réserve parce que l'on a le droit de gérer les archives.
   La sortie est demandée, autorisée par une autre personne, remise, confirmée par celle qui la reçoit, puis rendue ; un original rendu dans un autre état se constate. */

export const PURPOSE_LABELS: Record<MovementPurpose, string> = {
    CONSULTATION: 'Consultation', NUMERISATION: 'Numérisation', EXPOSITION: 'Exposition', PRET: 'Prêt', RESTAURATION: 'Restauration', EXPERTISE: 'Expertise', TRANSFERT: 'Transfert', AUTRE: 'Autre'
};
/** Les objets que l'on choisit en demandant un mouvement : la numérisation se commande (onglet « Numérisation » du bien), un prêt ou une exposition se prépare dans un dossier (onglet « Prêts et expositions »). */
export const PURPOSE_CHOICES = (Object.keys(PURPOSE_LABELS) as MovementPurpose[]).filter(p => p !== 'NUMERISATION' && p !== 'PRET' && p !== 'EXPOSITION');
export const STATUS_LABELS: Record<MovementRequestStatus, string> = { DEMANDEE: 'Demandée', AUTORISEE: 'Autorisée', REFUSEE: 'Refusée', ANNULEE: 'Annulée', REMISE: 'Remise', RECUE: 'Reçue', RETOURNEE: 'Rendue' };
/** Ce qui se filtre dans la liste : des regroupements, puis chaque étape. */
export const STATUS_FILTERS: Array<[string, string]> = [['OUVERTES', 'Demandes ouvertes'], ['DEHORS', 'Originaux sortis'], ...(Object.keys(STATUS_LABELS) as MovementRequestStatus[]).map(s => [s, STATUS_LABELS[s]] as [string, string])];
export const OPEN_STATUSES: readonly MovementRequestStatus[] = ['DEMANDEE', 'AUTORISEE', 'REMISE', 'RECUE'];
export const OUT_STATUSES: readonly MovementRequestStatus[] = ['REMISE', 'RECUE'];
/** Ce que chaque étape attend : qui fait quoi ensuite. */
export const NEXT_STEPS: Record<MovementRequestStatus, string> = {
    DEMANDEE: 'Une autre personne que le demandeur autorise ou refuse la sortie.',
    AUTORISEE: 'L’original est remis : la sortie s’inscrit alors à l’historique des mouvements.',
    REMISE: 'Le demandeur confirme qu’il a bien reçu l’original ; le retour s’enregistre quand l’original rentre.',
    RECUE: 'L’original est chez son destinataire : il doit rentrer avant le jour prévu.',
    REFUSEE: 'Demande close : la sortie a été refusée.',
    ANNULEE: 'Demande close : elle a été annulée.',
    RETOURNEE: 'L’original est rentré : le mouvement est clos.'
};

export const purposeLabel = (p: string | null | undefined): string => p ? (PURPOSE_LABELS[p as MovementPurpose] ?? p) : '—';
export const statusLabel = (s: string | null | undefined): string => s ? (STATUS_LABELS[s as MovementRequestStatus] ?? s) : '—';
export const isOpen = (s: MovementRequestStatus): boolean => OPEN_STATUSES.includes(s);
export const isOut = (s: MovementRequestStatus): boolean => OUT_STATUSES.includes(s);
export const statusTone = (s: MovementRequestStatus, late = false): 'ok' | 'warn' | 'bad' | '' =>
    late ? 'bad' : s === 'DEMANDEE' || s === 'AUTORISEE' ? 'warn' : s === 'RETOURNEE' ? 'ok' : s === 'REFUSEE' || s === 'ANNULEE' ? '' : '';

/** « En retard de 3 jours » ; vide quand la sortie n'est pas en retard. */
export function lateText(m: Pick<MovementRequest, 'enRetard' | 'joursRetard'>): string {
    if (!m.enRetard) return '';
    const days = m.joursRetard ?? 0;
    return days > 1 ? `En retard de ${days} jours` : days === 1 ? 'En retard d’un jour' : 'En retard';
}

/** Une date AAAA-MM-JJ décalée d'un nombre de jours, en temps universel (la base compte les jours de la même façon). */
export function addDays(iso: string, days: number): string {
    const d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}
/** Le retour prévu ne dépasse pas cinq ans (1826 jours) : au-delà, c'est un transfert à décider autrement. */
export const MAX_DAYS_AHEAD = 1826;

// ---------- demande

export interface RequestForm { objet: MovementPurpose | ''; motif: string; destination: string; destinataire: string; retourPrevu: string }
export const emptyRequestForm = (): RequestForm => ({ objet: '', motif: '', destination: '', destinataire: '', retourPrevu: '' });
export const requestOf = (m: Pick<MovementRequest, 'objet' | 'motif' | 'destination' | 'destinataire' | 'retourPrevu'>): RequestForm =>
    ({ objet: m.objet, motif: m.motif, destination: m.destination, destinataire: m.destinataire, retourPrevu: m.retourPrevu });

/** Contrôles avant l'envoi, pour guider : le serveur refait les mêmes contrôles et reste seul juge. */
export function requestProblems(form: RequestForm, today: string): string[] {
    const problems: string[] = [];
    if (!form.objet) problems.push('Indiquez pour quoi l’original sort : consultation, restauration, expertise, transfert.');
    if (form.motif.trim().length < MOTIF_MIN) problems.push(`Le motif dit pourquoi l’original sort : au moins ${MOTIF_MIN} caractères.`);
    if (!form.destination.trim()) problems.push('Indiquez où l’original ira (salle de lecture, atelier, musée…).');
    if (!form.destinataire.trim()) problems.push('Indiquez qui le reçoit (personne ou organisme).');
    if (!form.retourPrevu) problems.push('Indiquez la date de retour prévue : une sortie a toujours une échéance.');
    else if (form.retourPrevu < today) problems.push('Le retour prévu ne peut pas être dans le passé.');
    else if (form.retourPrevu > addDays(today, MAX_DAYS_AHEAD)) problems.push('Le retour prévu ne peut pas dépasser cinq ans : au-delà, c’est un transfert à décider autrement.');
    return problems;
}
export const requestBody = (form: RequestForm): Record<string, unknown> =>
    ({ objet: form.objet, motif: form.motif.trim(), destination: form.destination.trim(), destinataire: form.destinataire.trim(), retourPrevu: form.retourPrevu });

// ---------- passages

export function transitionLabel(to: MovementRequestStatus): string {
    switch (to) {
        case 'AUTORISEE': return 'Autoriser la sortie';
        case 'REFUSEE': return 'Refuser la demande';
        case 'ANNULEE': return 'Annuler la demande';
        case 'REMISE': return 'Remettre l’original';
        case 'RECUE': return 'Confirmer la réception';
        case 'RETOURNEE': return 'Enregistrer le retour';
        default: return STATUS_LABELS[to] ?? to;
    }
}

type OptionFields = Pick<MovementTransitionOption, 'vers' | 'motifRequis' | 'conditionsRequises' | 'conformiteRequise'> & { constatRequis?: boolean };
/** Ce qu'un passage demande en plus du simple clic. */
export interface MovementNeeds { texte: boolean; texteLabel: string; conditions: boolean; conditionsRequises: boolean; conformite: boolean; /** Un original d'un prêt ou d'une exposition se constate toujours au retour, même conforme. */ constat: boolean }
export function movementNeeds(option: OptionFields): MovementNeeds {
    return {
        texte: option.motifRequis, texteLabel: option.vers === 'REFUSEE' ? 'Motif du refus' : option.vers === 'ANNULEE' ? 'Motif de l’annulation' : 'Motif',
        // Autoriser engage l'institution : les conditions de manipulation s'écrivent toujours, elles sont exigées quand le dernier constat demande des précautions.
        conditions: option.vers === 'AUTORISEE', conditionsRequises: option.conditionsRequises, conformite: option.conformiteRequise, constat: option.conformiteRequise && option.constatRequis === true
    };
}
/** Un passage qui demande plus qu'un clic ouvre une fenêtre ; les autres (remise, réception) se confirment d'un clic. */
export const needsForm = (option: OptionFields): boolean => { const n = movementNeeds(option); return n.texte || n.conditions || n.conformite; };

export interface MovementTransitionForm { texte: string; conditions: string; conforme: '' | 'oui' | 'non'; constat: ReportForm }
export const emptyTransitionForm = (): MovementTransitionForm => ({ texte: '', conditions: '', conforme: '', constat: emptyReportForm('') });

export function movementTransitionProblems(option: OptionFields, form: MovementTransitionForm, today: string): string[] {
    const needs = movementNeeds(option);
    const problems: string[] = [];
    if (needs.texte && form.texte.trim().length < MOTIF_MIN) problems.push(`${needs.texteLabel} : un texte écrit d’au moins ${MOTIF_MIN} caractères est exigé.`);
    if (needs.conditionsRequises && form.conditions.trim().length < MOTIF_MIN)
        problems.push(`Le dernier constat d’état demande des précautions : écrivez les conditions de manipulation à respecter (au moins ${MOTIF_MIN} caractères).`);
    if (needs.conformite) {
        if (!form.conforme) problems.push('Indiquez si l’original est rendu dans l’état où il est parti.');
        else if (form.conforme === 'non') {
            if (form.texte.trim().length < MOTIF_MIN) problems.push(`Décrivez l’anomalie constatée au retour (au moins ${MOTIF_MIN} caractères).`);
            problems.push(...reportProblems(form.constat, today, true));
        } else if (needs.constat) problems.push(...reportProblems(form.constat, today, true));
    }
    return problems;
}

/** Corps de la demande de passage : seuls les champs utiles et renseignés partent ; le constat au retour n'envoie pas de circonstances (elles sont imposées). */
export function movementBody(vers: MovementRequestStatus, expectedVersion: number, form: MovementTransitionForm, option: OptionFields): Record<string, unknown> {
    const body: Record<string, unknown> = { vers, expectedVersion };
    if (option.motifRequis && form.texte.trim()) body.texte = form.texte.trim();
    if (option.vers === 'AUTORISEE' && form.conditions.trim()) body.conditions = form.conditions.trim();
    if (option.conformiteRequise && form.conforme) {
        body.conforme = form.conforme === 'oui';
        if (form.texte.trim()) body.texte = form.texte.trim();
        if (form.conforme === 'non' || option.constatRequis) body.constat = reportBody(form.constat, true);
    }
    return body;
}

/** Une ligne de l'historique d'une demande : ce qui s'est passé, du point de vue de la lecture. */
export function journalSummary(genre: string, from: unknown, to: unknown): string {
    if (genre === 'CREATION') return 'Demande déposée';
    if (genre === 'MODIFICATION') return 'Demande modifiée';
    return statusLabel(String(from)) + ' → ' + statusLabel(String(to));
}
