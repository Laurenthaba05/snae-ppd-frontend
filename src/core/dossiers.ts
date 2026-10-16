import type { LoanDossier, DossierElement, DossierNature, DossierRow, DossierStage, DossierStatus, DossierTransitionOption } from './types.js';
import { MOTIF_MIN } from './heritageAssets.js';
import { MAX_DAYS_AHEAD, addDays, statusLabel as movementStatusLabel } from './movements.js';
import { dayText } from './placement.js';
import { formatAmount } from './portal.js';

/* Prêts sortants et expositions : un dossier réunit les originaux qui sortent, la convention, l'assurance, le transport, les constats d'état et les dates.
   Il est décidé par une autre personne que celle qui l'a monté, puis il crée la sortie de chaque original (module « Mouvements ») et contrôle ses passages. */

export const NATURE_LABELS: Record<DossierNature, string> = { PRET: 'Prêt sortant', EXPOSITION: 'Exposition' };
export const STATUS_LABELS: Record<DossierStatus, string> = { EN_INSTRUCTION: 'En instruction', ACCEPTE: 'Accepté', REFUSE: 'Refusé', ANNULE: 'Annulé', CLOS: 'Clos' };
export const STAGE_LABELS: Record<DossierStage, string> = {
    EN_INSTRUCTION: 'À décider', A_PREPARER: 'À préparer', EN_PREPARATION: 'En préparation', EN_COURS: 'Originaux sortis', A_CLORE: 'À clore', CLOS: 'Clos', REFUSE: 'Refusé', ANNULE: 'Annulé'
};
/** Ce qui se filtre dans la liste : des regroupements, puis chaque étape. */
export const STAGE_FILTERS: Array<[string, string]> = [['OUVERTS', 'Dossiers ouverts'], ['EN_RETARD', 'En retard'], ...(Object.keys(STAGE_LABELS) as DossierStage[]).map(s => [s, STAGE_LABELS[s]] as [string, string])];
/** Ce que chaque étape attend, et de qui. */
export const STAGE_NEXT_STEPS: Record<DossierStage, string> = {
    EN_INSTRUCTION: 'Une autre personne que celle qui a monté le dossier l’accepte ou le refuse. On peut encore modifier le dossier, ajouter ou retirer des originaux.',
    A_PREPARER: 'Le dossier est accepté : demandez la sortie de chaque original (« Demander les sorties »), puis complétez la convention, l’assurance, le transport et les constats d’état de départ.',
    EN_PREPARATION: 'Chaque sortie est autorisée par une autre personne, puis l’original est remis ; la remise exige la convention, l’assurance et un constat d’état de départ récent (onglet « Mouvements » ou « Ouvrir la sortie »).',
    EN_COURS: 'Des originaux sont sortis de réserve : chacun doit rentrer, avec un constat d’état au retour, avant le jour prévu.',
    A_CLORE: 'Tous les originaux sont rentrés avec leur constat d’état : le dossier peut être clos.',
    CLOS: 'Dossier clos : tous les originaux sont rentrés.',
    REFUSE: 'Dossier refusé.',
    ANNULE: 'Dossier annulé.'
};
export const natureLabel = (n: string | null | undefined): string => n ? (NATURE_LABELS[n as DossierNature] ?? n) : '—';
export const statusLabel = (s: string | null | undefined): string => s ? (STATUS_LABELS[s as DossierStatus] ?? s) : '—';
export const stageLabel = (s: string | null | undefined): string => s ? (STAGE_LABELS[s as DossierStage] ?? s) : '—';
export const isOpen = (s: DossierStatus): boolean => s === 'EN_INSTRUCTION' || s === 'ACCEPTE';
export const stageTone = (stage: DossierStage, late = false): 'ok' | 'warn' | 'bad' | '' =>
    late ? 'bad' : stage === 'EN_INSTRUCTION' || stage === 'A_PREPARER' || stage === 'A_CLORE' ? 'warn' : stage === 'CLOS' ? 'ok' : '';

/** « En retard de 3 jours » ; vide quand le dossier n'est pas en retard. */
export function lateText(d: Pick<DossierRow, 'enRetard' | 'joursRetard'>): string {
    if (!d.enRetard) return '';
    const days = d.joursRetard ?? 0;
    return days > 1 ? `En retard de ${days} jours` : days === 1 ? 'En retard d’un jour' : 'En retard';
}

/** La période d'un dossier, en toutes lettres : « du 10 octobre 2026 au 14 janvier 2027 », « le 5 octobre 2026 » quand elle tient en un jour. */
export function periodText(d: Pick<LoanDossier | DossierRow, 'dateDebut' | 'dateFin'>): string {
    return d.dateDebut === d.dateFin ? `le ${dayText(d.dateDebut)}` : `du ${dayText(d.dateDebut)} au ${dayText(d.dateFin)}`;
}

/** La valeur assurée du dossier, ou rien quand aucun original n'en porte. */
export function valueText(d: Pick<LoanDossier, 'valeurTotale' | 'assurance'>): string | null {
    return d.valeurTotale === null ? null : formatAmount(d.valeurTotale, d.assurance.devise ?? 'GNF');
}

// ---------- déroulé

export interface TimelineStep { key: string; label: string; state: 'done' | 'current' | 'todo' | 'cancelled' }
/** Le déroulé d'un dossier : ce qui est fait, ce qui est en cours, ce qui reste. Rien n'est stocké : tout se lit de la décision et des sorties des originaux. */
export function timeline(d: Pick<LoanDossier, 'statut' | 'decision' | 'elements'>): TimelineStep[] {
    const outs = d.elements.map(e => e.sortie?.statut ?? null);
    const all = (statuses: string[]) => d.elements.length > 0 && outs.every(s => s !== null && statuses.includes(s));
    const flags: Array<[string, string, boolean]> = [
        ['monte', 'Dossier monté', true],
        ['decision', 'Accepté par une autre personne', d.decision !== null && d.statut !== 'REFUSE'],
        ['sorties', 'Sorties demandées et autorisées', all(['AUTORISEE', 'REMISE', 'RECUE', 'RETOURNEE'])],
        ['depart', 'Originaux sortis de réserve', all(['REMISE', 'RECUE', 'RETOURNEE'])],
        ['retour', 'Originaux rentrés avec leur constat', all(['RETOURNEE'])],
        ['cloture', 'Dossier clos', d.statut === 'CLOS']
    ];
    const dead = d.statut === 'REFUSE' || d.statut === 'ANNULE';
    let currentFound = false;
    return flags.map(([key, label, done]) => {
        if (done) return { key, label, state: 'done' as const };
        if (dead) return { key, label, state: 'cancelled' as const };
        // L'étape en cours est la première qui n'est pas faite.
        const isCurrent = !currentFound;
        currentFound = true;
        return { key, label, state: isCurrent ? 'current' as const : 'todo' as const };
    });
}

/** Ce que l'on peut dire de la sortie d'un original : à demander, ou son étape (et à refaire quand elle a été refusée ou annulée). */
export function sortieText(e: Pick<DossierElement, 'sortie'>): string {
    if (!e.sortie) return 'Sortie à demander';
    const s = e.sortie.statut;
    return movementStatusLabel(s) + (s === 'REFUSEE' || s === 'ANNULEE' ? ' — à redemander' : '');
}

/** L'état d'un original dans le dossier, en une phrase. */
export function elementSummary(e: DossierElement): string {
    if (e.sortie && (e.sortie.statut === 'REMISE' || e.sortie.statut === 'RECUE')) return e.sortie.enRetard ? 'Sorti de réserve, en retard.' : 'Sorti de réserve.';
    if (e.sortie?.statut === 'RETOURNEE') return e.constatRetour ? 'Rentré avec son constat d’état.' : 'Rentré, sans constat d’état.';
    if (!e.constatDepart) return 'Pas encore de constat d’état de départ.';
    return 'Constat d’état de départ du ' + dayText(e.constatDepart.constateLe) + '.';
}

// ---------- saisie du dossier

export interface DossierForm {
    nature: DossierNature; intitule: string; objet: string; lieuNom: string; lieuAdresse: string; dateDebut: string; dateFin: string; retourPrevu: string; emprunteurNom: string; emprunteurContact: string; commissaire: string;
}
export const emptyDossierForm = (nature: DossierNature = 'PRET'): DossierForm =>
    ({ nature, intitule: '', objet: '', lieuNom: '', lieuAdresse: '', dateDebut: '', dateFin: '', retourPrevu: '', emprunteurNom: '', emprunteurContact: '', commissaire: '' });
export const dossierFormOf = (d: LoanDossier): DossierForm => ({ nature: d.nature, intitule: d.intitule, objet: d.objet, lieuNom: d.lieuNom, lieuAdresse: d.lieuAdresse ?? '', dateDebut: d.dateDebut, dateFin: d.dateFin,
    retourPrevu: d.retourPrevu, emprunteurNom: d.emprunteurNom ?? '', emprunteurContact: d.emprunteurContact ?? '', commissaire: d.commissaire ?? '' });

/** Contrôles avant l'envoi, pour guider : le serveur refait les mêmes contrôles et reste seul juge. À la création, le début n'est pas dans le passé. */
export function dossierProblems(form: DossierForm, today: string, creating = true): string[] {
    const problems: string[] = [];
    const pret = form.nature === 'PRET';
    if (form.intitule.trim().length < 3) problems.push('L’intitulé nomme le prêt ou l’exposition : 3 caractères au moins.');
    if (form.objet.trim().length < MOTIF_MIN) problems.push(`L’objet dit pourquoi les originaux sortent : au moins ${MOTIF_MIN} caractères.`);
    if (!form.lieuNom.trim()) problems.push(pret ? 'Indiquez où les originaux seront conservés et présentés chez l’emprunteur.' : 'Indiquez le lieu de l’exposition.');
    if (pret && !form.emprunteurNom.trim()) problems.push('Un prêt nomme son emprunteur (organisme ou personne).');
    if (!form.dateDebut) problems.push(pret ? 'Indiquez la date de début du prêt.' : 'Indiquez la date d’ouverture de l’exposition.');
    else if (creating && form.dateDebut < today) problems.push('Le début ne peut pas être dans le passé.');
    if (!pret && !form.dateFin) problems.push('Indiquez la date de fermeture de l’exposition.');
    if (!form.retourPrevu) problems.push(pret ? 'Indiquez la date de retour prévue : c’est la fin du prêt.' : 'Indiquez la date de retour prévue des originaux.');
    else {
        if (form.retourPrevu < today) problems.push('Le retour prévu ne peut pas être dans le passé.');
        else if (form.retourPrevu > addDays(today, MAX_DAYS_AHEAD)) problems.push('Le retour prévu ne peut pas dépasser cinq ans : au-delà, c’est un transfert à décider autrement.');
        if (form.dateDebut && form.retourPrevu < form.dateDebut) problems.push('Le retour prévu ne précède pas le début.');
        if (!pret && form.dateFin && form.retourPrevu < form.dateFin) problems.push('Les originaux ne rentrent pas avant la fermeture : le retour prévu suit la fin de l’exposition.');
    }
    if (!pret && form.dateFin && form.dateDebut && form.dateFin < form.dateDebut) problems.push('La fermeture ne précède pas l’ouverture.');
    return problems;
}

/** Corps de la demande : seuls les champs renseignés partent ; pour un prêt, la fin est le retour prévu (le serveur la fixe). */
export function dossierBody(form: DossierForm, creating = true): Record<string, unknown> {
    const pret = form.nature === 'PRET';
    const body: Record<string, unknown> = { intitule: form.intitule.trim(), objet: form.objet.trim(), lieuNom: form.lieuNom.trim(), dateDebut: form.dateDebut, retourPrevu: form.retourPrevu };
    if (creating) body.nature = form.nature;
    if (!pret && form.dateFin) body.dateFin = form.dateFin;
    if (form.lieuAdresse.trim()) body.lieuAdresse = form.lieuAdresse.trim();
    if (pret) {
        body.emprunteurNom = form.emprunteurNom.trim();
        if (form.emprunteurContact.trim()) body.emprunteurContact = form.emprunteurContact.trim();
    } else if (form.commissaire.trim()) body.commissaire = form.commissaire.trim();
    return body;
}

// ---------- convention, assurance, transport (prêt)

export interface TermsForm {
    conventionReference: string; conventionSigneeLe: string; conventionSignataire: string; assuranceMode: 'POLICE' | 'EXONERATION'; assureur: string; assurancePolice: string; assuranceDu: string; assuranceAu: string;
    exonerationMotif: string; devise: string; transportMode: string; transporteur: string; convoyeur: string; transportAllerLe: string; transportRetourLe: string; emballage: string;
}
export const emptyTermsForm = (): TermsForm => ({ conventionReference: '', conventionSigneeLe: '', conventionSignataire: '', assuranceMode: 'POLICE', assureur: '', assurancePolice: '', assuranceDu: '', assuranceAu: '', exonerationMotif: '',
    devise: '', transportMode: '', transporteur: '', convoyeur: '', transportAllerLe: '', transportRetourLe: '', emballage: '' });
export const termsFormOf = (d: Pick<LoanDossier, 'convention' | 'assurance' | 'transport'>): TermsForm => ({
    conventionReference: d.convention.reference ?? '', conventionSigneeLe: d.convention.signeeLe ?? '', conventionSignataire: d.convention.signataire ?? '', assuranceMode: d.assurance.exonerationMotif ? 'EXONERATION' : 'POLICE',
    assureur: d.assurance.assureur ?? '', assurancePolice: d.assurance.police ?? '', assuranceDu: d.assurance.du ?? '', assuranceAu: d.assurance.au ?? '', exonerationMotif: d.assurance.exonerationMotif ?? '', devise: d.assurance.devise ?? '',
    transportMode: d.transport.mode ?? '', transporteur: d.transport.transporteur ?? '', convoyeur: d.transport.convoyeur ?? '', transportAllerLe: d.transport.allerLe ?? '', transportRetourLe: d.transport.retourLe ?? '', emballage: d.transport.emballage ?? ''
});

/** Contrôles avant l'envoi (miroir du serveur) : une convention ne se date pas dans le futur ; l'assurance est une police ou une exonération motivée ; la devise a trois lettres. */
export function termsProblems(form: TermsForm, today: string): string[] {
    const problems: string[] = [];
    if (form.conventionSigneeLe && form.conventionSigneeLe > today) problems.push('La convention ne peut pas être signée dans le futur.');
    if (form.assuranceMode === 'POLICE') {
        if (form.assuranceDu && form.assuranceAu && form.assuranceAu < form.assuranceDu) problems.push('La couverture de l’assurance finit après son début.');
    } else if (form.exonerationMotif.trim().length < MOTIF_MIN) problems.push(`Le motif de l’absence d’assurance s’écrit en ${MOTIF_MIN} caractères au moins (garantie de l’État, décision, convention…).`);
    if (form.devise.trim() && !/^[A-Za-z]{3}$/.test(form.devise.trim())) problems.push('La devise s’écrit avec son code à trois lettres (ISO 4217).');
    if (form.transportAllerLe && form.transportRetourLe && form.transportRetourLe < form.transportAllerLe) problems.push('Le transport retour ne précède pas le transport aller.');
    return problems;
}

/** Corps de la demande : seuls les champs renseignés partent ; une assurance par police n'envoie pas de motif d'exonération, et inversement. */
export function termsBody(form: TermsForm): Record<string, unknown> {
    const t: Record<string, unknown> = {};
    const put = (key: string, value: string) => { if (value.trim()) t[key] = value.trim(); };
    put('conventionReference', form.conventionReference); put('conventionSigneeLe', form.conventionSigneeLe); put('conventionSignataire', form.conventionSignataire);
    if (form.assuranceMode === 'POLICE') { put('assureur', form.assureur); put('assurancePolice', form.assurancePolice); put('assuranceDu', form.assuranceDu); put('assuranceAu', form.assuranceAu); }
    else put('assuranceExonerationMotif', form.exonerationMotif);
    if (form.devise.trim()) t.devise = form.devise.trim().toUpperCase();
    put('transportMode', form.transportMode); put('transporteur', form.transporteur); put('convoyeur', form.convoyeur); put('transportAllerLe', form.transportAllerLe); put('transportRetourLe', form.transportRetourLe); put('emballage', form.emballage);
    return t;
}

// ---------- originaux du dossier

export interface ElementForm { valeur: string; conditions: string; emplacement: string }
export const emptyElementForm = (): ElementForm => ({ valeur: '', conditions: '', emplacement: '' });
export const elementFormOf = (e: Pick<DossierElement, 'valeurAssuree' | 'conditions' | 'emplacement'>): ElementForm => ({ valeur: e.valeurAssuree === null ? '' : String(e.valeurAssuree), conditions: e.conditions ?? '', emplacement: e.emplacement ?? '' });
const decimal = (text: string): number | null => { const t = text.trim().replace(/\s/g, '').replace(',', '.'); return /^\d+(\.\d{1,2})?$/.test(t) ? Number(t) : null; };
export function elementProblems(form: ElementForm): string[] {
    const problems: string[] = [];
    if (form.valeur.trim()) { const v = decimal(form.valeur); if (v === null || v > 1_000_000_000_000) problems.push('La valeur assurée est positive ou nulle, avec deux décimales au plus.'); }
    if (form.conditions.length > 4000) problems.push('Les conditions de présentation sont limitées à 4000 caractères.');
    if (form.emplacement.length > 255) problems.push('L’emplacement est limité à 255 caractères.');
    return problems;
}
/** Corps d'un ajout : seuls les champs renseignés partent. */
export function elementBody(form: ElementForm, bienId?: string, archiveId?: string): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    if (bienId) body.bienId = bienId;
    if (archiveId) body.archiveId = archiveId;
    const v = decimal(form.valeur); if (v !== null) body.valeurAssuree = v;
    if (form.conditions.trim()) body.conditions = form.conditions.trim();
    if (form.emplacement.trim()) body.emplacement = form.emplacement.trim();
    return body;
}
/** Corps d'une modification : tout est renvoyé, un champ vidé s'efface. */
export const elementUpdateBody = (form: ElementForm): Record<string, unknown> => ({ valeurAssuree: decimal(form.valeur), conditions: form.conditions.trim() || null, emplacement: form.emplacement.trim() || null });

// ---------- passages

export function transitionLabel(to: DossierStatus): string {
    switch (to) {
        case 'ACCEPTE': return 'Accepter le dossier';
        case 'REFUSE': return 'Refuser le dossier';
        case 'ANNULE': return 'Annuler le dossier';
        case 'CLOS': return 'Clore le dossier';
        default: return STATUS_LABELS[to] ?? to;
    }
}
/** Ce qu'un passage demande : un motif écrit pour refuser ou annuler, un bilan facultatif pour clore. */
export const transitionProblems = (option: Pick<DossierTransitionOption, 'motifRequis'>, texte: string): string[] =>
    option.motifRequis && texte.trim().length < MOTIF_MIN ? [`Motif : un texte écrit d’au moins ${MOTIF_MIN} caractères est exigé.`] : [];
export function transitionBody(vers: DossierStatus, expectedVersion: number, texte: string): Record<string, unknown> {
    const body: Record<string, unknown> = { vers, expectedVersion };
    if (texte.trim()) body.texte = texte.trim();
    return body;
}

export interface ProlongForm { nouvelleFin: string; motif: string }
export const emptyProlongForm = (): ProlongForm => ({ nouvelleFin: '', motif: '' });
/** Contrôles avant l'envoi : une nouvelle fin postérieure à la fin actuelle, dans les cinq ans, un motif écrit, et pour un prêt assuré une police qui couvre le nouveau retour. */
export function prolongProblems(form: ProlongForm, d: Pick<LoanDossier, 'dateFin' | 'nature' | 'assurance'>, today: string): string[] {
    const problems: string[] = [];
    if (!form.nouvelleFin) problems.push('Indiquez la nouvelle date de fin.');
    else {
        if (form.nouvelleFin <= d.dateFin) problems.push(`La nouvelle fin doit suivre la fin actuelle (${dayText(d.dateFin)}).`);
        if (form.nouvelleFin > addDays(today, MAX_DAYS_AHEAD)) problems.push('La fin ne peut pas dépasser cinq ans.');
        if (d.nature === 'PRET' && !d.assurance.exonerationMotif && d.assurance.au && d.assurance.au < form.nouvelleFin)
            problems.push(`L’assurance prend fin le ${dayText(d.assurance.au)}, avant la nouvelle date de retour : prolongez l’assurance d’abord.`);
    }
    if (form.motif.trim().length < MOTIF_MIN) problems.push(`Motif : un texte écrit d’au moins ${MOTIF_MIN} caractères est exigé.`);
    return problems;
}
export const prolongBody = (form: ProlongForm, expectedVersion: number): Record<string, unknown> => ({ expectedVersion, nouvelleFin: form.nouvelleFin, motif: form.motif.trim() });

/** Une ligne de l'historique d'un dossier. */
export function journalSummary(genre: string, champ: string | null, from: unknown, to: unknown): string {
    switch (genre) {
        case 'CREATION': return 'Dossier monté';
        case 'MODIFICATION': return champ === 'termes' ? 'Convention, assurance ou transport complétés' : 'Dossier modifié';
        case 'ELEMENT': return champ === 'ajout' ? 'Original ajouté' : champ === 'retrait' ? 'Original retiré' : 'Original modifié';
        case 'CONSTAT': return 'Constat d’état de départ enregistré';
        case 'PREPARATION': return 'Sorties demandées';
        case 'PROLONGATION': {
            const next = (to && typeof to === 'object' ? (to as Record<string, unknown>).retourPrevu : null) as string | null;
            return next ? 'Dossier prolongé : retour prévu le ' + dayText(next) : 'Dossier prolongé';
        }
        default: return statusLabel(String(from)) + ' → ' + statusLabel(String(to));
    }
}

// ---------- fiche de transport

const escape = (text: unknown): string => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]!));
const dash = (text: string | null | undefined): string => text && text.trim() ? escape(text) : '—';

/**
 * La fiche de transport d'un dossier, prête à imprimer : ce qui part, pour qui, avec quelle convention, quelle assurance, quel transport, dans quel état, et les lignes à signer à la remise et au retour.
 * Tout le texte est échappé.
 */
export function transportSheetHtml(d: LoanDossier, institution = 'SNAE-PPD'): string {
    const pret = d.nature === 'PRET';
    const rows = d.elements.map(e => `<tr><td>${escape(e.cote)}</td><td>${escape(e.bienIdentifiant)}<br>${escape(e.bienIntitule)}</td><td>${e.valeurAssuree === null ? '—' : escape(formatAmount(e.valeurAssuree, d.assurance.devise ?? 'GNF'))}</td>`
        + `<td>${dash(e.conditions)}</td><td>${dash(e.emplacement)}</td><td>${e.constatDepart ? escape(dayText(e.constatDepart.constateLe)) + '<br>' + escape(e.constatDepart.etat.toLowerCase().replace('_', ' ')) + ', manipulation ' + escape(e.constatDepart.manipulation.toLowerCase()) : '—'}</td></tr>`).join('');
    const total = valueText(d);
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escape(d.numero)}</title><style>
body{font:13px/1.45 Arial,sans-serif;color:#16251f;margin:28px}h1{font-size:19px;margin:0 0 2px}h2{font-size:14px;margin:18px 0 6px;border-bottom:1px solid #999}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #888;padding:5px 7px;text-align:left;vertical-align:top}th{background:#eef2ee}
dl{display:grid;grid-template-columns:200px 1fr;gap:3px 12px;margin:0}dt{color:#555}dd{margin:0}.sign{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:22px}.sign div{border-top:1px solid #444;padding-top:4px;min-height:56px}
</style></head><body>
<p>${escape(institution)}</p><h1>${pret ? 'Fiche de transport — prêt sortant' : 'Fiche de sortie — exposition'} ${escape(d.numero)}</h1><p>${escape(d.intitule)}</p>
<h2>Destination</h2><dl><dt>${pret ? 'Emprunteur' : 'Commissaire'}</dt><dd>${dash(pret ? d.emprunteurNom : d.commissaire)}</dd>${pret ? `<dt>Contact</dt><dd>${dash(d.emprunteurContact)}</dd>` : ''}
<dt>Lieu</dt><dd>${dash(d.lieuNom)}${d.lieuAdresse ? ', ' + escape(d.lieuAdresse) : ''}</dd><dt>${pret ? 'Période du prêt' : 'Exposition'}</dt><dd>${escape(periodText(d))}</dd><dt>Retour des originaux prévu le</dt><dd>${escape(dayText(d.retourPrevu))}</dd></dl>
${pret ? `<h2>Convention et assurance</h2><dl><dt>Convention</dt><dd>${dash(d.convention.reference)}${d.convention.signeeLe ? ', signée le ' + escape(dayText(d.convention.signeeLe)) : ''}${d.convention.signataire ? ' par ' + escape(d.convention.signataire) : ''}</dd>
<dt>Assurance</dt><dd>${d.assurance.exonerationMotif ? 'Sans police : ' + escape(d.assurance.exonerationMotif) : `${dash(d.assurance.assureur)}, police ${dash(d.assurance.police)}, du ${escape(dayText(d.assurance.du))} au ${escape(dayText(d.assurance.au))}`}</dd>
${total ? `<dt>Valeur assurée totale</dt><dd>${escape(total)}</dd>` : ''}</dl>
<h2>Transport</h2><dl><dt>Mode</dt><dd>${dash(d.transport.mode)}</dd><dt>Transporteur</dt><dd>${dash(d.transport.transporteur)}</dd><dt>Convoyeur</dt><dd>${dash(d.transport.convoyeur)}</dd>
<dt>Aller / retour</dt><dd>${escape(dayText(d.transport.allerLe))} / ${escape(dayText(d.transport.retourLe))}</dd><dt>Emballage</dt><dd>${dash(d.transport.emballage)}</dd></dl>` : ''}
<h2>Originaux (${d.elements.length})</h2><table><thead><tr><th>Cote</th><th>Bien</th><th>Valeur assurée</th><th>Conditions de présentation</th><th>Emplacement</th><th>Constat de départ</th></tr></thead><tbody>${rows}</tbody></table>
<div class="sign"><div>Remise des originaux — nom, date et signature<br>(institution)</div><div>Réception — nom, date et signature<br>(${pret ? 'emprunteur ou convoyeur' : 'responsable de l’exposition'})</div>
<div>Retour des originaux — nom, date et signature<br>(institution)</div><div>Constat d’état au retour — nom, date et signature</div></div>
</body></html>`;
}
