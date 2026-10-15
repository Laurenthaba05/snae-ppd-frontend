import { uuid } from './validation.js';
import type { AssetFields, EntryDecisionType, EntryStatus, EntryTransitionOption, HeritageEntry, HeritageReference } from './types.js';
import { buildXlsx, type Table } from './spreadsheet.js';
import { JURIDIQUE_LABELS, MOTIF_MIN, motifValide, type FieldDef } from './heritageAssets.js';

/* Entrées patrimoniales : réception → constat d'état → examen → décision → formalisation ou restitution.
   Recevoir matériellement ne vaut pas devenir propriétaire : l'acquisition, le dépôt et le prêt entrant sont des décisions distinctes. */

export const ENTRY_MODE_LABELS: Record<string, string> = { DON: 'Don', DEPOT: 'Dépôt proposé', PRET_ENTRANT: 'Prêt entrant', TRANSFERT: 'Transfert', AUTRE: 'Autre' };
export const ENTRY_STATUS_LABELS: Record<EntryStatus, string> = {
    RECUE: 'Reçue', EN_EXAMEN: 'En examen', COMPLEMENT_REQUIS: 'Complément requis', SITUATION_A_CLARIFIER: 'Situation à clarifier', ACCEPTEE: 'Acceptée', REFUSEE: 'Refusée', FORMALISEE: 'Formalisée', RETOURNEE: 'Restituée'
};
export const DECISION_LABELS: Record<EntryDecisionType, string> = { ACQUISITION: 'Acquisition', DEPOT: 'Dépôt', PRET_ENTRANT: 'Prêt entrant' };
export const ENTRY_ROLE_LABELS: Record<string, string> = { JUSTIFICATIF: 'Justificatif', CONSTAT: 'Constat d’état', PHOTO: 'Photographie', CONVENTION: 'Convention', AUTRE: 'Autre' };
export const ENTRY_JOURNAL_LABELS: Record<string, string> = { CREATION: 'Réception enregistrée', MODIFICATION: 'Modification', TRANSITION: 'Passage', LIEN: 'Lien' };
export const ENTRY_FIELD_LABELS: Record<string, string> = {
    deposantActeurId: 'Déposant du référentiel', entreeArchivistiqueId: 'Entrée archivistique associée', modeReception: 'Type de réception', deposantNom: 'Déposant', dateReception: 'Date de réception', motifReception: 'Motif de la remise', nombrePieces: 'Nombre de pièces', descriptionLot: 'Description du lot',
    constatEtat: 'Constat d’état', moyensConservation: 'Moyens de conservation', examenProvenance: 'Examen de la provenance', situationJuridique: 'Situation juridique',
    situationJuridiqueNote: 'Note sur la situation juridique', conditionsProposees: 'Conditions proposées', conditionsRetenues: 'Conditions retenues', statut: 'Étape', bien: 'Bien', ressource: 'Document'
};

export const entryLabel = (status: string | null | undefined): string => status ? (ENTRY_STATUS_LABELS[status as EntryStatus] ?? status) : '—';
export const TERMINAL: ReadonlySet<EntryStatus> = new Set<EntryStatus>(['FORMALISEE', 'RETOURNEE']);
export const entryTone = (status: EntryStatus): 'ok' | 'warn' | 'bad' | '' =>
    status === 'ACCEPTEE' || status === 'FORMALISEE' ? 'ok' : status === 'COMPLEMENT_REQUIS' || status === 'SITUATION_A_CLARIFIER' ? 'warn' : status === 'REFUSEE' || status === 'RETOURNEE' ? 'bad' : '';

/** Champs de la fiche d'entrée, par groupe. Les mêmes noms que ceux du serveur. */
export interface EntryFieldGroup { id: 'reception' | 'constat' | 'examen'; label: string; fields: FieldDef[] }
export const ENTRY_FIELD_GROUPS: EntryFieldGroup[] = [
    { id: 'reception', label: 'Réception', fields: [
        { name: 'modeReception', label: 'Type de réception', type: 'select', options: ENTRY_MODE_LABELS, hint: 'La façon dont le bien arrive limite les décisions possibles : un prêt entrant reste un prêt.' },
        { name: 'dateReception', label: 'Date de réception', type: 'date' },
        { name: 'deposantNom', label: 'Déposant ou source', type: 'text', hint: 'Personne, famille ou organisme qui remet le bien' },
        { name: 'deposantActeurId', label: 'Déposant du référentiel', type: 'actor' },
        { name: 'entreeArchivistiqueId', label: 'Entrée archivistique associée', type: 'intake' },
        { name: 'nombrePieces', label: 'Nombre de pièces', type: 'number' },
        { name: 'motifReception', label: 'Motif de la remise', type: 'textarea', wide: true },
        { name: 'descriptionLot', label: 'Description du lot', type: 'textarea', wide: true }] },
    { id: 'constat', label: 'Constat d’état et conservation', fields: [
        { name: 'constatEtat', label: 'Constat d’état à la réception', type: 'textarea', wide: true, hint: 'Obligatoire avant l’examen : il fixe l’état dans lequel le bien est arrivé.' },
        { name: 'moyensConservation', label: 'Moyens de conservation nécessaires', type: 'textarea', wide: true }] },
    { id: 'examen', label: 'Examen de la provenance et des conditions', fields: [
        { name: 'examenProvenance', label: 'Examen de la provenance', type: 'textarea', wide: true, hint: 'Obligatoire avant la décision.' },
        { name: 'situationJuridique', label: 'Situation juridique', type: 'select', options: JURIDIQUE_LABELS, hint: 'Une acquisition exige une situation juridique claire.' },
        { name: 'situationJuridiqueNote', label: 'Note sur la situation juridique', type: 'textarea', wide: true },
        { name: 'conditionsProposees', label: 'Conditions proposées par le déposant', type: 'textarea', wide: true },
        { name: 'conditionsRetenues', label: 'Conditions retenues par l’institution', type: 'textarea', wide: true }] }
];

/** Étapes d'un parcours d'entrée, pour la bande de progression. */
export type StepState = 'done' | 'current' | 'todo';
export function entrySteps(status: EntryStatus): Array<{ key: string; label: string; state: StepState }> {
    const refused = status === 'REFUSEE' || status === 'RETOURNEE';
    const at = status === 'RECUE' ? 0 : status === 'EN_EXAMEN' || status === 'COMPLEMENT_REQUIS' || status === 'SITUATION_A_CLARIFIER' ? 1 : status === 'ACCEPTEE' || status === 'REFUSEE' ? 2 : 3;
    const labels = ['Réception', 'Examen', 'Décision', refused ? 'Restitution' : 'Formalisation'];
    // L'étape finale d'une entrée terminée est accomplie ; sinon l'étape courante est celle où elle se trouve.
    const done = TERMINAL.has(status) ? 4 : status === 'ACCEPTEE' || status === 'REFUSEE' ? 3 : at;
    return labels.map((label, index) => ({ key: ['reception', 'examen', 'decision', 'suite'][index]!, label, state: index < done ? 'done' : index === done ? 'current' : 'todo' }));
}

/** Décisions possibles selon la façon dont le bien arrive (reflète le serveur, qui reste seul juge). */
export function decisionChoices(mode: string | null | undefined): EntryDecisionType[] {
    if (mode === 'PRET_ENTRANT') return ['PRET_ENTRANT'];
    if (mode === 'AUTRE') return ['ACQUISITION', 'DEPOT', 'PRET_ENTRANT'];
    return ['ACQUISITION', 'DEPOT'];
}

/** Passage de l'entrée, du point de vue de la personne qui agit. */
export function entryTransitionLabel(from: EntryStatus, to: EntryStatus): string {
    if (to === 'EN_EXAMEN') return from === 'RECUE' ? 'Commencer l’examen' : 'Reprendre l’examen';
    if (to === 'COMPLEMENT_REQUIS') return 'Demander un complément';
    if (to === 'SITUATION_A_CLARIFIER') return 'Signaler une situation à clarifier';
    if (to === 'ACCEPTEE') return 'Accepter la prise en charge';
    if (to === 'REFUSEE') return 'Refuser la prise en charge';
    if (to === 'FORMALISEE') return 'Formaliser par un acte';
    if (to === 'RETOURNEE') return 'Enregistrer la restitution';
    return ENTRY_STATUS_LABELS[to] ?? to;
}

/** Ce qu'un passage demande en plus du simple clic. */
export interface TransitionNeeds { motif: boolean; motifRequired: boolean; decision: boolean; convention: boolean; retour: boolean }
export function transitionNeeds(option: Pick<EntryTransitionOption, 'vers' | 'motifRequis' | 'decision'>): TransitionNeeds {
    return {
        motif: option.motifRequis || option.vers === 'ACCEPTEE', motifRequired: option.motifRequis, decision: option.vers === 'ACCEPTEE',
        convention: option.vers === 'FORMALISEE', retour: option.vers === 'RETOURNEE'
    };
}
export const needsForm = (option: Pick<EntryTransitionOption, 'vers' | 'motifRequis' | 'decision'>): boolean => {
    const needs = transitionNeeds(option);
    return needs.motif || needs.decision || needs.convention || needs.retour;
};

export interface TransitionForm { motif: string; decisionType: EntryDecisionType | ''; conventionReference: string; conventionDateDebut: string; conventionDateFin: string; retourLe: string; retourDestinataire: string; retourNote: string }
export const emptyTransitionForm = (): TransitionForm => ({ motif: '', decisionType: '', conventionReference: '', conventionDateDebut: '', conventionDateFin: '', retourLe: '', retourDestinataire: '', retourNote: '' });

/**
 * Contrôles côté écran avant l'envoi, pour guider la personne : le serveur refait tous les contrôles et reste seul juge.
 * `today` est la date du jour au format AAAA-MM-JJ.
 */
export function transitionProblems(option: Pick<EntryTransitionOption, 'vers' | 'motifRequis' | 'decision'>, form: TransitionForm, entry: Pick<HeritageEntry, 'champs' | 'decisionType' | 'conventionReference'>, today: string): string[] {
    const needs = transitionNeeds(option);
    const problems: string[] = [];
    if (needs.motifRequired && !motifValide(form.motif)) problems.push(`Un motif écrit d’au moins ${MOTIF_MIN} caractères est exigé.`);
    if (needs.decision) {
        const mode = entry.champs.modeReception as string | undefined;
        if (!form.decisionType) problems.push('Indiquez la nature de la prise en charge : acquisition, dépôt ou prêt entrant.');
        else if (!decisionChoices(mode).includes(form.decisionType)) problems.push(`Une entrée de type « ${(ENTRY_MODE_LABELS[mode ?? ''] ?? mode ?? '').toLowerCase()} » ne peut pas être acceptée comme ${DECISION_LABELS[form.decisionType].toLowerCase()}.`);
        else if (form.decisionType === 'ACQUISITION' && entry.champs.situationJuridique !== 'CLAIRE') problems.push('Une acquisition exige une situation juridique claire : choisissez le dépôt, ou laissez la situation à clarifier.');
    }
    if (needs.convention) {
        if (!form.conventionReference.trim() && !entry.conventionReference) problems.push('Indiquez la référence de l’acte ou de la convention qui formalise la prise en charge.');
        const open = entry.decisionType === 'DEPOT' || entry.decisionType === 'PRET_ENTRANT';
        if (open && !form.conventionDateFin) problems.push('Un dépôt ou un prêt entrant a une échéance : indiquez la date de fin de la convention.');
        if (form.conventionDateDebut && form.conventionDateFin && form.conventionDateFin < form.conventionDateDebut) problems.push('La date de fin de la convention doit suivre sa date de début.');
    }
    if (needs.retour) {
        if (!form.retourLe) problems.push('Indiquez la date de la restitution.');
        else if (form.retourLe > today) problems.push('La date de la restitution ne peut pas être dans le futur.');
        if (!form.retourDestinataire.trim()) problems.push('Indiquez qui a repris les biens.');
    }
    return problems;
}

/** Corps de la demande de passage : seuls les champs renseignés partent. */
export function transitionBody(vers: EntryStatus, expectedVersion: number, form: TransitionForm): Record<string, unknown> {
    const body: Record<string, unknown> = { vers, expectedVersion };
    const set = (name: string, value: string) => { const text = value.trim(); if (text) body[name] = text; };
    set('motif', form.motif); set('decisionType', form.decisionType);
    if (vers === 'FORMALISEE') { set('conventionReference', form.conventionReference); set('conventionDateDebut', form.conventionDateDebut); set('conventionDateFin', form.conventionDateFin); }
    if (vers === 'RETOURNEE') { set('retourLe', form.retourLe); set('retourDestinataire', form.retourDestinataire); set('retourNote', form.retourNote); }
    return body;
}

/** Une ligne du journal d'une entrée : valeur lisible selon le champ. */
export function entryJournalValue(champ: string | null, value: unknown): string {
    if (value === null || value === undefined || value === '') return '—';
    if (champ === 'statut') return entryLabel(String(value));
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

/** Corps de la création d'une réception : les champs vides sont omis, le nombre de pièces reste un nombre. */
export function receptionFields(form: { deposantActeurId?: string; entreeArchivistiqueId?: string; modeReception: string; dateReception: string; deposantNom: string; nombrePieces: string; motifReception: string; descriptionLot: string }): AssetFields {
    const champs: AssetFields = { modeReception: form.modeReception };
    if (form.deposantActeurId) champs.deposantActeurId = uuid(form.deposantActeurId);
    if (form.entreeArchivistiqueId) champs.entreeArchivistiqueId = uuid(form.entreeArchivistiqueId);
    if (form.dateReception) champs.dateReception = form.dateReception;
    if (form.deposantNom.trim()) champs.deposantNom = form.deposantNom.trim();
    if (form.nombrePieces.trim()) champs.nombrePieces = form.nombrePieces.trim();
    if (form.motifReception.trim()) champs.motifReception = form.motifReception.trim();
    if (form.descriptionLot.trim()) champs.descriptionLot = form.descriptionLot.trim();
    return champs;
}

/** Texte brut du reçu de réception, pour l'impression ou la copie. La mention dit clairement ce que la remise n'est pas. */
export function receiptLines(receipt: { numero: string; institution: string; dateReception: string; modeReception: string; deposant: string | null; nombrePieces: number | null; motifReception: string | null; mention: { texte: string }; biens: Array<{ identifiant: string; intitule: string }> }): string[] {
    const lines = [`Reçu de réception ${receipt.numero}`, receipt.institution, `Date de réception : ${receipt.dateReception}`, `Type de réception : ${ENTRY_MODE_LABELS[receipt.modeReception] ?? receipt.modeReception}`];
    if (receipt.deposant) lines.push(`Remis par : ${receipt.deposant}`);
    if (receipt.nombrePieces !== null) lines.push(`Nombre de pièces : ${receipt.nombrePieces}`);
    if (receipt.motifReception) lines.push(`Motif : ${receipt.motifReception}`);
    lines.push('', ...(receipt.biens.length ? receipt.biens.map(b => `${b.identifiant} — ${b.intitule}`) : ['Aucun bien encore enregistré.']), '', receipt.mention.texte);
    return lines;
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
type ReceiptSource = Parameters<typeof receiptLines>[0];
/** Document HTML autonome du reçu, prêt à imprimer. Tout le texte est échappé ; la mention reste en évidence. */
export function receiptHtml(receipt: ReceiptSource & { genereLe?: string }): string {
    const row = (name: string, value: string | null) => value ? `<tr><th scope="row">${escapeHtml(name)}</th><td>${escapeHtml(value)}</td></tr>` : '';
    const goods = receipt.biens.length ? `<ul>${receipt.biens.map(b => `<li><strong>${escapeHtml(b.identifiant)}</strong> — ${escapeHtml(b.intitule)}</li>`).join('')}</ul>` : '<p>Aucun bien encore enregistré.</p>';
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Reçu ${escapeHtml(receipt.numero)}</title><style>
body{font:14px/1.5 system-ui,sans-serif;margin:32px;color:#16251f}h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:22px 0 6px}p.inst{margin:0 0 18px;color:#46605a}
table{border-collapse:collapse;width:100%}th{text-align:left;width:200px;font-weight:600;padding:4px 8px 4px 0;vertical-align:top}td{padding:4px 0}ul{margin:0;padding-left:20px}
.mention{margin-top:24px;padding:12px 14px;border:2px solid #16251f;font-weight:600}.sign{display:flex;gap:40px;margin-top:48px}.sign div{flex:1;border-top:1px solid #16251f;padding-top:6px;font-size:12px}
</style></head><body><h1>Reçu de réception ${escapeHtml(receipt.numero)}</h1><p class="inst">${escapeHtml(receipt.institution)}</p><table>
${row('Date de réception', receipt.dateReception)}${row('Type de réception', ENTRY_MODE_LABELS[receipt.modeReception] ?? receipt.modeReception)}${row('Remis par', receipt.deposant)}${row('Nombre de pièces', receipt.nombrePieces === null ? null : String(receipt.nombrePieces))}${row('Motif', receipt.motifReception)}</table>
<h2>Biens reçus</h2>${goods}<p class="mention">${escapeHtml(receipt.mention.texte)}</p>
<div class="sign"><div>Pour l’institution</div><div>Remis par</div></div></body></html>`;
}

// ---------- reprise d'inventaire : lecture d'un registre existant (Excel ou CSV)

export const MAX_REPRISE_ROWS = 500;
export const REPRISE_HEADERS = ['Numéro d’inventaire', 'Intitulé', 'Catégorie', 'Date', 'Résumé', 'Support', 'Dimensions', 'Cote ou ancienne référence', 'Provenance connue'] as const;

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
type Column = 'numero' | 'intitule' | 'categorie' | 'date' | 'resume' | 'support' | 'dimensions' | 'reference' | 'provenance';
const ALIASES: Record<Column, string[]> = {
    numero: ['numero d inventaire', 'n d inventaire', 'no d inventaire', 'numero inventaire', 'inventaire', 'numero', 'n inventaire'],
    intitule: ['intitule', 'titre', 'designation', 'libelle', 'nom'],
    categorie: ['categorie', 'type', 'nature', 'type de document'],
    date: ['date', 'datation', 'date de creation', 'periode'],
    resume: ['resume', 'description', 'notice', 'contenu'],
    support: ['support'],
    dimensions: ['dimensions', 'dimension', 'format'],
    reference: ['cote ou ancienne reference', 'cote', 'ancienne reference', 'ancienne cote', 'cote d origine', 'reference'],
    provenance: ['provenance connue', 'provenance', 'historique', 'observations', 'origine']
};

export interface DateParse { champs: AssetFields; warning: string | null; error: string | null }
const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };
function romanToInt(text: string): number | null {
    let total = 0;
    for (let i = 0; i < text.length; i++) {
        const value = ROMAN[text[i]!]; const next = ROMAN[text[i + 1] ?? ''] ?? 0;
        if (!value) return null;
        total += value < next ? -value : value;
    }
    return total;
}
const isoValid = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(Date.parse(iso + 'T00:00:00Z')) && new Date(iso + 'T00:00:00Z').toISOString().slice(0, 10) === iso;

/**
 * Lit une date de registre sans lui prêter plus de précision qu'elle n'en a : « 1930 » est une année, « vers 1930 » une estimation, « XIXe siècle » un siècle.
 * Une date vide reste « non renseignée » ; une date illisible est conservée en toutes lettres et à qualifier, jamais devinée.
 */
export function parseRepriseDate(raw: string): DateParse {
    const text = raw.trim();
    if (!text) return { champs: {}, warning: null, error: null };
    const flat = fold(text);
    if (/^(inconnue|date inconnue|sans date|s d|non datee?|ni date)$/.test(flat)) return { champs: { precisionDate: 'INCONNUE' }, warning: null, error: null };
    let match = /^(\d{4})$/.exec(text);
    if (match) return { champs: { precisionDate: 'ANNEE', dateDebut: `${match[1]}-01-01`, dateFin: `${match[1]}-12-31` }, warning: null, error: null };
    match = /^(\d{4})\s*[-–/]\s*(\d{4})$/.exec(text);
    if (match) return Number(match[2]) < Number(match[1]) ? { champs: {}, warning: null, error: 'La seconde année précède la première.' }
        : { champs: { precisionDate: 'ANNEE', dateDebut: `${match[1]}-01-01`, dateFin: `${match[2]}-12-31` }, warning: null, error: null };
    match = /^(?:vers|ca\.?|circa|environ)\s*(\d{4})$/i.exec(text);
    if (match) return { champs: { precisionDate: 'ESTIMEE', dateDebut: `${match[1]}-01-01`, dateFin: `${match[1]}-12-31`, dateTexte: text }, warning: 'Date estimée : citez la source de l’appréciation avant la validation.', error: null };
    match = /^(?:annees? )?(\d{3})0s?$/.exec(flat);
    if (match && (flat.endsWith('s') || flat.startsWith('annee'))) return { champs: { precisionDate: 'DECENNIE', dateDebut: `${match[1]}0-01-01`, dateFin: `${match[1]}9-12-31` }, warning: null, error: null };
    match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (match) return isoValid(text) ? { champs: { precisionDate: 'EXACTE', dateDebut: text, dateFin: text }, warning: null, error: null } : { champs: {}, warning: null, error: 'Date inexistante.' };
    match = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(text);
    if (match) {
        const iso = `${match[3]}-${match[2]!.padStart(2, '0')}-${match[1]!.padStart(2, '0')}`;
        return isoValid(iso) ? { champs: { precisionDate: 'EXACTE', dateDebut: iso, dateFin: iso }, warning: null, error: null } : { champs: {}, warning: null, error: 'Date inexistante.' };
    }
    match = /^([IVXLC]+|\d{1,2})\s*(?:e|ème|eme|er|ier|ᵉ)?\s*siecle$/i.exec(text.normalize('NFD').replace(/[̀-ͯ]/g, ''));
    if (match) {
        const n = /^\d+$/.test(match[1]!) ? Number(match[1]) : romanToInt(match[1]!.toUpperCase());
        if (n && n >= 1 && n <= 21) return { champs: { precisionDate: 'SIECLE', dateDebut: `${(n - 1) * 100 + 1}-01-01`.padStart(10, '0'), dateFin: `${n * 100}-12-31`.padStart(10, '0') }, warning: null, error: null };
    }
    if (text.length > 255) return { champs: {}, warning: null, error: 'Date trop longue (255 caractères au plus).' };
    return { champs: { dateTexte: text }, warning: 'Date non interprétée : elle est conservée telle quelle et reste à qualifier.', error: null };
}

export interface RepriseRow {
    /** Numéro de ligne dans le fichier (1 = en-têtes). */
    line: number;
    numero: string; intitule: string; categorie: string;
    champs: AssetFields | null;
    errors: string[];
    warnings: string[];
}

/**
 * Lit un registre d'inventaire. `systeme` est le nom du registre d'origine (le libellé du lot) : il qualifie l'ancienne référence conservée.
 * Aucune information n'est inventée : date, résumé, provenance absents restent absents et seront comptés comme à compléter.
 */
export function parseRepriseTable(table: Table, categories: Pick<HeritageReference, 'code' | 'libelle' | 'actif'>[], systeme: string): { rows: RepriseRow[]; fatal: string | null } {
    const header = table[0] ?? [];
    const at = {} as Record<Column, number>;
    for (const key of Object.keys(ALIASES) as Column[]) at[key] = header.findIndex(h => ALIASES[key].includes(fold(h)));
    const missing: string[] = ([['intitule', 'Intitulé'], ['categorie', 'Catégorie']] as const).filter(([key]) => at[key] < 0).map(([, label]) => label);
    if (at.numero < 0 && at.reference < 0) missing.unshift('Numéro d’inventaire (ou Cote ou ancienne référence)');
    if (missing.length) return { rows: [], fatal: `Colonnes obligatoires introuvables en première ligne : ${missing.join(', ')}. Utilisez le modèle Excel fourni.` };
    const data = table.slice(1).map((cells, i) => ({ cells, line: i + 2 })).filter(r => r.cells.some(c => c !== ''));
    if (!data.length) return { rows: [], fatal: 'Le fichier ne contient aucun bien (seulement la ligne d’en-têtes).' };
    if (data.length > MAX_REPRISE_ROWS) return { rows: [], fatal: `Le fichier contient ${data.length} lignes : la reprise est limitée à ${MAX_REPRISE_ROWS} biens à la fois.` };
    const byKey = new Map<string, string>(categories.filter(c => c.actif).flatMap(c => [[fold(c.code), c.code], [fold(c.libelle), c.code]] as Array<[string, string]>));
    const seen = new Map<string, number>();
    const source = systeme.trim().slice(0, 100) || 'Inventaire d’origine';
    const rows = data.map(({ cells, line }): RepriseRow => {
        const get = (key: Column) => (at[key] >= 0 ? cells[at[key]] ?? '' : '').trim();
        const row: RepriseRow = { line, numero: get('numero'), intitule: get('intitule'), categorie: get('categorie'), champs: null, errors: [], warnings: [] };
        if (!row.intitule) row.errors.push('Intitulé manquant.');
        else if (row.intitule.length > 500) row.errors.push('Intitulé trop long (500 caractères au plus).');
        const category = byKey.get(fold(row.categorie));
        if (!category) row.errors.push(row.categorie ? `Catégorie inconnue « ${row.categorie.slice(0, 40)} » : utilisez une catégorie de la liste du modèle.` : 'Catégorie manquante.');
        const reference = get('reference');
        if (!row.numero && !reference) row.errors.push('Une reprise conserve les anciennes références : indiquez le numéro d’inventaire ou la cote.');
        if (row.numero.length > 150) row.errors.push('Numéro d’inventaire trop long (150 caractères au plus).');
        if (reference.length > 150) row.errors.push('Cote trop longue (150 caractères au plus).');
        if (row.numero) {
            const key = row.numero.toLowerCase();
            const first = seen.get(key);
            if (first !== undefined) row.errors.push(`Numéro d’inventaire déjà utilisé à la ligne ${first}.`);
            else seen.set(key, line);
        }
        const date = parseRepriseDate(get('date'));
        if (date.error) row.errors.push(date.error);
        if (date.warning) row.warnings.push(date.warning);
        for (const [key, max, label] of [['resume', 10_000, 'Résumé'], ['support', 2000, 'Support'], ['dimensions', 1000, 'Dimensions'], ['provenance', 20_000, 'Provenance']] as const)
            if (get(key).length > max) row.errors.push(`${label} trop long (${max} caractères au plus).`);
        if (!row.errors.length && category) {
            const champs: AssetFields = { intitule: row.intitule, categorie: category, natureOriginale: 'PHYSIQUE', ...date.champs };
            if (row.numero) champs.numeroInventaire = row.numero;
            if (reference) champs.anciennesReferences = [{ systeme: source, valeur: reference }];
            if (get('resume')) champs.resume = get('resume');
            if (get('support')) champs.support = get('support');
            if (get('dimensions')) champs.dimensions = get('dimensions');
            if (get('provenance')) { champs.historiqueProvenance = get('provenance'); champs.provenanceStatut = 'PARTIELLE'; }
            row.champs = champs;
        }
        return row;
    });
    return { rows, fatal: null };
}

/** Modèle Excel : une feuille « Biens » vide avec liste déroulante pour la catégorie, et une feuille d'instructions. */
export function repriseTemplate(categories: Pick<HeritageReference, 'libelle' | 'actif'>[]): Uint8Array {
    const labels = categories.filter(c => c.actif).map(c => c.libelle);
    return buildXlsx([
        { name: 'Biens', rows: [[...REPRISE_HEADERS]], widths: [22, 50, 24, 20, 50, 24, 20, 26, 40], list: labels.length ? { column: 2, values: labels, rows: MAX_REPRISE_ROWS } : undefined },
        { name: 'Instructions', header: false, widths: [28, 100], rows: [
            ['Reprise d’inventaire', 'Recopiez le registre existant, une ligne par bien. Rien n’est deviné : une information absente reste absente et sera signalée comme à compléter.'],
            ['Numéro d’inventaire *', 'Le numéro porté au registre (150 caractères au plus), unique dans l’institution. À défaut, renseignez la cote.'],
            ['Intitulé *', 'Obligatoire (500 caractères au plus).'],
            ['Catégorie *', 'Obligatoire : une valeur de la liste déroulante.'],
            ['Date', 'Laissez vide si elle n’est pas connue. Formes lues : 1930 · 1925-1935 · vers 1930 · années 1930 · XIXe siècle · 12/03/1952 · inconnue. Tout autre texte est conservé tel quel et reste à qualifier.'],
            ['Résumé, Support, Dimensions', 'Facultatifs.'],
            ['Cote ou ancienne référence', 'Facultatif si le numéro d’inventaire est renseigné. Conservée comme ancienne référence du registre d’origine.'],
            ['Provenance connue', 'Ce que le registre dit de l’origine du bien. La provenance reste « partiellement connue » : elle est à établir, jamais présumée complète.'],
            ['Limites', `${MAX_REPRISE_ROWS} biens par fichier, 2 Mo maximum. Les lignes invalides sont signalées avant l’import et ignorées.`]
        ] }
    ]);
}
