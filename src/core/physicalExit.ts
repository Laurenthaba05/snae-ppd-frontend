import { code128Svg } from './codeSheets.js';
import { display } from './format.js';
import { MAX_DAYS_AHEAD, addDays } from './movements.js';
import type { PageResult } from './paging.js';
import { dayText } from './placement.js';

/* Sortie d'une archive physique ordinaire : on ne sort pas une archive de réserve parce que l'on a le droit de gérer les archives.
   La sortie est demandée, autorisée par une autre personne, remise par le magasin, puis rendue ; une archive rendue dans un autre état que celui de départ se dit. */

export type ExitStatus = 'DEMANDEE' | 'AUTORISEE' | 'REFUSEE' | 'ANNULEE' | 'REMISE' | 'RETOURNEE';

export interface ExitEvent { genre: string; le: string; par: string | null; texte: string | null }

export interface ExitRequest {
    id: string; numero: string; archiveId: string; archiveCote: string; archiveIntitule: string | null;
    institutionId: string | null; departmentId: string | null;
    objet: string; motif: string; destination: string; destinataire: string; retourPrevu: string; statut: ExitStatus; enRetard: boolean;
    demandeParId: string; demandePar: string | null; demandeLe: string; decidePar: string | null; decideLe: string | null; decisionMotif: string | null; conditions: string | null;
    remisPar: string | null; remisLe: string | null; mouvementId: string | null; retourPar: string | null; retourLe: string | null; retourConforme: boolean | null; retourNote: string | null;
    fermePar: string | null; fermeLe: string | null; fermeMotif: string | null; version: number; evenements: ExitEvent[];
}
export type ExitPage = PageResult<ExitRequest>;

export const EXIT_REQUEST = 'PHYSICALARCHIVES_EXIT_REQUEST';
export const EXIT_AUTHORIZE = 'PHYSICALARCHIVES_EXIT_AUTHORIZE';
export const EXIT_HANDLE = 'PHYSICALARCHIVES_EXIT_HANDLE';
export const TEXT_MIN = 10;

export const STATUS_LABELS: Record<ExitStatus, string> = { DEMANDEE: 'Demandée', AUTORISEE: 'Autorisée', REFUSEE: 'Refusée', ANNULEE: 'Annulée', REMISE: 'Remise', RETOURNEE: 'Rendue' };
export const OPEN_STATUSES: readonly ExitStatus[] = ['DEMANDEE', 'AUTORISEE', 'REMISE'];
/** Ce qui se filtre dans la file : des regroupements, puis chaque étape. */
export const STATUS_FILTERS: Array<[string, string]> = [['OUVERTES', 'Demandes ouvertes'], ['EN_RETARD', 'Sorties en retard'], ...(Object.keys(STATUS_LABELS) as ExitStatus[]).map(s => [s, STATUS_LABELS[s]] as [string, string])];
/** Ce que chaque étape attend : qui fait quoi ensuite. */
export const NEXT_STEPS: Record<ExitStatus, string> = {
    DEMANDEE: 'Une autre personne que le demandeur autorise ou refuse la sortie.',
    AUTORISEE: 'Le magasin remet l’archive : la sortie s’inscrit alors à l’historique des mouvements.',
    REMISE: 'L’archive est chez son destinataire : elle doit rentrer avant le jour prévu.',
    REFUSEE: 'Demande close : la sortie a été refusée.',
    ANNULEE: 'Demande close : elle a été annulée.',
    RETOURNEE: 'L’archive est rentrée : le mouvement est clos.'
};

export const statusLabel = (s: string | null | undefined): string => s ? (STATUS_LABELS[s as ExitStatus] ?? s) : '—';
export const isOpen = (s: ExitStatus): boolean => OPEN_STATUSES.includes(s);

/** Les paramètres de la file, d'après le menu « Étape » : un regroupement devient un indicateur, une étape un filtre. */
export function listParams(form: { statut: string; q: string }): Record<string, string> {
    const params: Record<string, string> = {};
    if (form.statut === 'OUVERTES') params.ouvertes = 'true';
    else if (form.statut === 'EN_RETARD') params.enRetard = 'true';
    else if (form.statut) params.statut = form.statut;
    if (form.q.trim()) params.q = form.q.trim();
    return params;
}

/** « En retard de 3 jours » ; vide quand la sortie n'est pas en retard (le jour prévu, ce n'est pas un retard). */
export function lateText(r: Pick<ExitRequest, 'enRetard' | 'retourPrevu'>, today: string): string {
    if (!r.enRetard) return '';
    const days = Math.round((Date.parse(today + 'T00:00:00Z') - Date.parse(r.retourPrevu + 'T00:00:00Z')) / 86_400_000);
    return days > 1 ? `En retard de ${days} jours` : days === 1 ? 'En retard d’un jour' : 'En retard';
}

// ---------- demande

export interface RequestForm { objet: string; motif: string; destination: string; destinataire: string; retourPrevu: string }
export const emptyRequestForm = (): RequestForm => ({ objet: '', motif: '', destination: '', destinataire: '', retourPrevu: '' });

/** Contrôles avant l'envoi, pour guider : le serveur refait les mêmes contrôles et reste seul juge. */
export function requestProblems(form: RequestForm, today: string): string[] {
    const problems: string[] = [];
    const purpose = form.objet.trim();
    if (!purpose) problems.push('Indiquez pour quoi l’archive sort : consultation, prêt, numérisation, restauration…');
    else if (/^rangement$/i.test(purpose)) problems.push('« Rangement » est réservé au changement d’emplacement : une sortie a un autre objet.');
    if (form.motif.trim().length < TEXT_MIN) problems.push(`Le motif dit pourquoi l’archive sort : au moins ${TEXT_MIN} caractères.`);
    if (!form.destination.trim()) problems.push('Indiquez où l’archive ira (salle de lecture, atelier, bureau…).');
    if (!form.destinataire.trim()) problems.push('Indiquez qui la reçoit (personne ou service).');
    if (!form.retourPrevu) problems.push('Indiquez la date de retour prévue : une sortie a toujours une échéance.');
    else if (form.retourPrevu < today) problems.push('Le retour prévu ne peut pas être dans le passé.');
    else if (form.retourPrevu > addDays(today, MAX_DAYS_AHEAD)) problems.push('Le retour prévu ne peut pas dépasser cinq ans : au-delà, c’est un transfert à décider autrement.');
    return problems;
}
export const requestBody = (form: RequestForm): Record<string, unknown> =>
    ({ objet: form.objet.trim(), motif: form.motif.trim(), destination: form.destination.trim(), destinataire: form.destinataire.trim(), retourPrevu: form.retourPrevu });

// ---------- passages

export interface ExitRights { request: boolean; authorize: boolean; handle: boolean }
export interface ExitOption { vers: ExitStatus; /** Vrai quand la personne peut le faire maintenant ; sinon `why` dit pourquoi. */ allowed: boolean; why?: string }

/**
 * Les passages possibles depuis l'étape de la demande, avec ce que la personne peut en faire. Mêmes règles que le serveur, qui reste seul juge : seul le demandeur annule sa demande,
 * personne n'autorise la sienne, la remise et le retour sont au magasin.
 */
export function exitOptions(r: Pick<ExitRequest, 'statut' | 'demandeParId'>, rights: ExitRights, userId: string | null): ExitOption[] {
    const mine = userId !== null && userId === r.demandeParId;
    const authorizing = (vers: ExitStatus): ExitOption => ({ vers, allowed: rights.authorize && !mine, why: !rights.authorize ? 'Habilitation requise pour autoriser une sortie.' : mine ? 'Une autre personne que le demandeur autorise ou refuse la sortie.' : undefined });
    const handling = (vers: ExitStatus): ExitOption => ({ vers, allowed: rights.handle, why: rights.handle ? undefined : 'Habilitation requise pour remettre et reprendre les archives.' });
    switch (r.statut) {
        case 'DEMANDEE': return [authorizing('AUTORISEE'), authorizing('REFUSEE'),
            { vers: 'ANNULEE', allowed: rights.request && mine, why: !rights.request ? 'Habilitation requise.' : !mine ? 'Seul le demandeur annule sa demande.' : undefined }];
        case 'AUTORISEE': return [handling('REMISE'),
            { vers: 'ANNULEE', allowed: (rights.request && mine) || rights.authorize, why: (rights.request && mine) || rights.authorize ? undefined : 'Seuls le demandeur et celui qui autorise annulent une sortie autorisée.' }];
        case 'REMISE': return [handling('RETOURNEE')];
        default: return [];
    }
}

export function transitionLabel(to: ExitStatus): string {
    switch (to) {
        case 'AUTORISEE': return 'Autoriser la sortie';
        case 'REFUSEE': return 'Refuser la demande';
        case 'ANNULEE': return 'Annuler la demande';
        case 'REMISE': return 'Remettre l’archive';
        case 'RETOURNEE': return 'Enregistrer le retour';
        default: return STATUS_LABELS[to] ?? to;
    }
}

/** Ce qu'un passage demande en plus du simple clic : la remise se confirme d'un clic, les autres ouvrent une fenêtre. */
export interface ExitNeeds { texte: boolean; texteLabel: string; conditions: boolean; conformite: boolean }
export function exitNeeds(vers: ExitStatus): ExitNeeds {
    return {
        texte: vers === 'REFUSEE' || vers === 'ANNULEE', texteLabel: vers === 'REFUSEE' ? 'Motif du refus' : 'Motif de l’annulation',
        // autoriser engage l'institution : les conditions de manipulation peuvent s'écrire
        conditions: vers === 'AUTORISEE', conformite: vers === 'RETOURNEE'
    };
}
export const needsForm = (vers: ExitStatus): boolean => { const n = exitNeeds(vers); return n.texte || n.conditions || n.conformite; };

export interface TransitionForm { texte: string; conditions: string; conforme: '' | 'oui' | 'non' }
export const emptyTransitionForm = (): TransitionForm => ({ texte: '', conditions: '', conforme: '' });

export function transitionProblems(vers: ExitStatus, form: TransitionForm): string[] {
    const needs = exitNeeds(vers);
    const problems: string[] = [];
    if (needs.texte && form.texte.trim().length < TEXT_MIN) problems.push(`${needs.texteLabel} : un texte écrit d’au moins ${TEXT_MIN} caractères est exigé.`);
    if (needs.conformite) {
        if (!form.conforme) problems.push('Indiquez si l’archive est rendue dans l’état où elle est partie.');
        else if (form.conforme === 'non' && form.texte.trim().length < TEXT_MIN) problems.push(`Décrivez l’anomalie constatée au retour (au moins ${TEXT_MIN} caractères).`);
    }
    return problems;
}

/** Corps de la demande de passage : seuls les champs utiles et renseignés partent. */
export function transitionBody(vers: ExitStatus, expectedVersion: number, form: TransitionForm): Record<string, unknown> {
    const needs = exitNeeds(vers);
    const body: Record<string, unknown> = { vers, expectedVersion };
    if (needs.texte && form.texte.trim()) body.texte = form.texte.trim();
    if (needs.conditions && form.conditions.trim()) body.conditions = form.conditions.trim();
    if (needs.conformite && form.conforme) {
        body.conforme = form.conforme === 'oui';
        if (form.texte.trim()) body.texte = form.texte.trim();
    }
    return body;
}

// ---------- bon de sortie imprimé

/** Un bon de sortie accompagne une archive qui sort : il n'existe qu'une fois la sortie autorisée (et reste lisible après la remise et le retour). */
export const canPrintSlip = (r: Pick<ExitRequest, 'statut'>): boolean => r.statut === 'AUTORISEE' || r.statut === 'REMISE' || r.statut === 'RETOURNEE';

export interface ExitSlipNames { institution: string }

const escapeHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Le bon de sortie : la feuille qui suit l'archive hors du magasin et qui garde la trace de qui l'a demandée, autorisée, remise et reprise, avec les conditions de manipulation, le
 * retour prévu et des cases de signature à la remise, à la réception et au retour. Page HTML autonome, tout est échappé ; le code-barres de la demande permet de la retrouver au comptoir.
 */
export function exitSlipHtml(r: ExitRequest, names: ExitSlipNames, today: string): string {
    const row = (label: string, value: string | null | undefined): string => value ? `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>` : '';
    const late = lateText(r, today);
    const people = [
        row('Demandée par', r.demandePar ? `${r.demandePar}, le ${dayText(r.demandeLe)}` : dayText(r.demandeLe)),
        row('Autorisée par', r.decidePar ? `${r.decidePar}, le ${r.decideLe ? dayText(r.decideLe) : '—'}` : null),
        row('Remise par', r.remisPar ? `${r.remisPar}, le ${r.remisLe ? dayText(r.remisLe) : '—'}` : null),
        row('Reprise par', r.retourPar ? `${r.retourPar}, le ${r.retourLe ? dayText(r.retourLe) : '—'}` : null),
        r.retourConforme === null ? '' : row('État au retour', r.retourConforme ? 'Rendue dans l’état où elle est partie' : 'Rendue dans un autre état' + (r.retourNote ? ' : ' + r.retourNote : ''))
    ].join('');
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Bon de sortie ${escapeHtml(r.numero)}</title><style>
body{font:14px/1.5 Georgia,serif;color:#111;margin:32px auto;max-width:820px;padding:0 16px}h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:22px 0 6px}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #888;padding:6px 9px;text-align:left;vertical-align:top;font-size:13px}th{background:#eee;width:30%}
.head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}.barcode svg{max-width:240px;height:auto}.late{color:#a00;font-weight:bold}
.sign{display:flex;justify-content:space-between;gap:24px;margin-top:64px}.sign div{flex:1;border-top:1px solid #111;padding-top:4px;font-size:12px}
</style></head><body>
<div class="head"><div><h1>Bon de sortie d’archive</h1><p>Demande <strong>${escapeHtml(r.numero)}</strong> · ${escapeHtml(names.institution)}</p></div><div class="barcode">${code128Svg(r.numero)}</div></div>
<h2>Archive</h2><table>${row('Cote', r.archiveCote)}${row('Intitulé', r.archiveIntitule)}${row('Propriétaire', names.institution)}</table>
<h2>Sortie</h2><table>${row('Pour quoi', display(r.objet))}${row('Où l’archive ira', r.destination)}${row('Qui la reçoit', r.destinataire)}${row('Retour prévu', dayText(r.retourPrevu))}${late ? `<tr><th>Retard</th><td class="late">${escapeHtml(late)}</td></tr>` : ''}${row('Motif', r.motif)}${row('Conditions de manipulation', r.conditions)}</table>
<h2>Suivi</h2><table>${people}</table>
<div class="sign"><div>Remise de l’archive (magasin)</div><div>Réception (destinataire)</div><div>Retour de l’archive (magasin)</div></div>
<p><small>Imprimé le ${escapeHtml(dayText(today))}. Une archive qui sort est rendue à la date prévue ; toute anomalie constatée au retour se déclare au magasin.</small></p>
</body></html>`;
}

/** Une ligne de l'historique d'une demande : ce qui s'est passé. */
export function eventSummary(genre: string): string {
    switch (genre) {
        case 'DEMANDE': return 'Demande déposée';
        case 'AUTORISATION': return 'Sortie autorisée';
        case 'REFUS': return 'Demande refusée';
        case 'ANNULATION': return 'Demande annulée';
        case 'REMISE': return 'Archive remise';
        case 'RETOUR': return 'Archive rendue';
        default: return genre;
    }
}
