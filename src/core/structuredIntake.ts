import { buildXlsx, type Table } from './spreadsheet.js';
import { fold } from './institutionImport.js';
import { EXTENT_UNITS } from './archivalDescription.js';

/**
 * Versement structuré : étapes du circuit, bordereau ligne à ligne, volumétrie, conformité à l'accord, constat à la réception. Ces règles reprennent celles
 * du serveur (IntakeCyclePolicy) pour guider la saisie et expliquer pourquoi un bouton est inactif ; le serveur reste seul juge.
 */
export type IntakeStage = 'PREPARATION' | 'SOUMIS' | 'EN_CONTROLE' | 'A_CORRIGER' | 'ACCEPTE' | 'REJETE' | 'RECU';
export const STAGES: ReadonlyArray<IntakeStage> = ['PREPARATION', 'SOUMIS', 'EN_CONTROLE', 'A_CORRIGER', 'ACCEPTE', 'REJETE', 'RECU'];
export const STAGE_LABELS: Record<IntakeStage, string> = {
    PREPARATION: 'En préparation', SOUMIS: 'Soumis', EN_CONTROLE: 'En contrôle', A_CORRIGER: 'À corriger', ACCEPTE: 'Accepté', REJETE: 'Rejeté', RECU: 'Reçu'
};
/** Ce que chaque étape signifie, pour la personne qui lit le circuit. */
export const STAGE_HELP: Record<IntakeStage, string> = {
    PREPARATION: 'Le bordereau est en cours de saisie ; il peut être modifié librement.',
    SOUMIS: 'Le bordereau est soumis ; le service d’archives n’a pas encore commencé son contrôle.',
    EN_CONTROLE: 'Le service d’archives contrôle le bordereau : il peut l’accepter, demander une correction ou le rejeter.',
    A_CORRIGER: 'Une correction est demandée ; le bordereau peut de nouveau être modifié puis soumis.',
    ACCEPTE: 'Le bordereau est accepté. À l’arrivée des archives, contrôlez chaque ligne puis constatez la réception.',
    REJETE: 'Le versement est rejeté ; le circuit est terminé.',
    RECU: 'Le versement est reçu et l’accusé de réception est délivré ; le circuit est terminé.'
};
export const isFinal = (stage: IntakeStage): boolean => stage === 'REJETE' || stage === 'RECU';
export const linesEditable = (stage: IntakeStage): boolean => stage === 'PREPARATION' || stage === 'A_CORRIGER';
export const controlEditable = (stage: IntakeStage): boolean => stage === 'ACCEPTE';

export const MAX_LINES = 5000;
export const SORTS_FINAUX: Record<string, string> = { CONSERVER: 'Conserver', ELIMINER: 'Éliminer', TRIER: 'Trier' };
export type Finding = 'CONFORME' | 'ECART' | 'ABSENT';
export const FINDING_LABELS: Record<Finding, string> = { CONFORME: 'Conforme', ECART: 'Écart', ABSENT: 'Absent' };

export interface LineInput {
    reference: string; intitule: string; dateDebut: string | null; dateFin: string | null; quantite: number | null; unite: string | null;
    support: string | null; duaAnnees: number | null; sortFinal: string | null; observations: string | null;
}
export interface BordereauLine { id: string; rang: number; input: LineInput; constat: Finding | null; quantiteConstatee: number | null; motifEcart: string | null; version: number }
export interface UnitTotal { unite: string; quantite: number; lignes: number }
export interface Outcome { conformes: number; ecarts: number; absents: number; annonce: UnitTotal[]; constate: UnitTotal[] }
export interface BordereauView { etape: IntakeStage; lignes: BordereauLine[]; totaux: UnitTotal[]; bilan: Outcome | null; avertissements: string[]; modifiable: boolean; controlable: boolean }
export interface StageEvent { id: string; de: IntakeStage | null; vers: IntakeStage; acteurId: string | null; date: string; motif: string | null }

export const unitLabel = (code: string | null | undefined): string => EXTENT_UNITS.find(u => u.code === code)?.label ?? code ?? '';
const round3 = (n: number) => Math.round(n * 1000) / 1000;
/** « 12,5 » : la virgule française, sans séparateur de milliers (ce nombre se recopie dans un tableur). */
export const plain = (n: number): string => String(round3(n)).replace('.', ',');
/** « 12,5 mètres linéaires » ; '' si la ligne n'a pas de quantité. */
export const quantityText = (quantite: number | null, unite: string | null): string => quantite === null || !unite ? '' : `${plain(quantite)} ${unitLabel(unite)}`;

// ---------- les actions du circuit

export type CycleAction = 'submit' | 'take' | 'accept' | 'request-correction' | 'reject' | 'receive';
export interface ActionSpec { action: CycleAction; label: string; needsMotif: boolean; tone: 'primary' | 'secondary' | 'danger'; confirm: string }
const ACTIONS: Record<CycleAction, ActionSpec> = {
    submit: { action: 'submit', label: 'Soumettre le bordereau', needsMotif: false, tone: 'primary', confirm: 'Le bordereau ne pourra plus être modifié tant qu’une correction n’est pas demandée.' },
    take: { action: 'take', label: 'Prendre en charge le contrôle', needsMotif: false, tone: 'primary', confirm: 'Le versement passe en contrôle.' },
    accept: { action: 'accept', label: 'Accepter le bordereau', needsMotif: false, tone: 'primary', confirm: 'Le bordereau devient définitif ; il restera à contrôler les archives à leur arrivée.' },
    'request-correction': { action: 'request-correction', label: 'Demander une correction', needsMotif: true, tone: 'secondary', confirm: 'Le bordereau est rendu pour correction.' },
    reject: { action: 'reject', label: 'Rejeter le versement', needsMotif: true, tone: 'danger', confirm: 'Le rejet est définitif : le versement ne pourra pas être repris.' },
    receive: { action: 'receive', label: 'Constater la réception', needsMotif: false, tone: 'primary', confirm: 'L’accusé de réception sera délivré ; le constat de chaque ligne devient définitif.' }
};
const NEXT: Record<IntakeStage, ReadonlyArray<CycleAction>> = {
    PREPARATION: ['submit', 'reject'], SOUMIS: ['take', 'reject'], EN_CONTROLE: ['accept', 'request-correction', 'reject'],
    A_CORRIGER: ['submit', 'reject'], ACCEPTE: ['receive', 'reject'], REJETE: [], RECU: []
};
/** Les actions possibles à une étape, la principale d'abord. Après une correction demandée, soumettre se dit « soumettre à nouveau ». */
export function actionsFor(stage: IntakeStage): ActionSpec[] {
    return NEXT[stage].map(a => a === 'submit' && stage === 'A_CORRIGER' ? { ...ACTIONS.submit, label: 'Soumettre à nouveau' } : ACTIONS[a]);
}

// ---------- contrôles d'une ligne

const DATE = /^[0-9]{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12][0-9]|3[01]))?)?$/;
/** Null si la date (AAAA, AAAA-MM ou AAAA-MM-JJ) est correcte ; sinon ce qui ne va pas. */
export function dateIssue(value: string | null): string | null {
    if (!value) return null;
    if (!DATE.test(value) || value.startsWith('0000')) return 'date attendue au format AAAA, AAAA-MM ou AAAA-MM-JJ.';
    if (value.length === 10) { const d = new Date(value + 'T00:00:00Z'); if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return 'ce jour n’existe pas.'; }
    return null;
}
const lower = (d: string) => d.length === 4 ? `${d}-01-01` : d.length === 7 ? `${d}-01` : d;
const upper = (d: string) => d.length === 4 ? `${d}-12-31` : d.length === 7 ? `${d}-31` : d;
const SCALE_OK = (n: number) => Math.abs(round3(n) - n) < 1e-9;
const MAX_QUANTITY = 99999999999.999;
const capital = (s: string) => s.charAt(0).toLocaleUpperCase('fr-FR') + s.slice(1);

/**
 * Les problèmes d'une ligne prise seule : un brouillon de bordereau peut être incomplet, mais jamais faux. `label` (« Ligne 3 ») préfixe chaque phrase ;
 * vide, la phrase se lit seule (au-dessus d'une ligne d'un fichier importé, dont le numéro est déjà affiché).
 */
export function lineProblems(line: LineInput, label = 'La ligne'): string[] {
    const problems: string[] = [];
    const say = (message: string, field?: string) => label ? `${label}${field ? `, ${field}` : ''} : ${message}` : field ? `${capital(field)} : ${message}` : capital(message);
    if (!line.reference.trim()) problems.push(say('la référence est obligatoire.'));
    else if (line.reference.trim().length > 150) problems.push(say('la référence est limitée à 150 caractères.'));
    if (!line.intitule.trim()) problems.push(say('l’intitulé est obligatoire.'));
    else if (line.intitule.trim().length > 500) problems.push(say('l’intitulé est limité à 500 caractères.'));
    const start = dateIssue(line.dateDebut), end = dateIssue(line.dateFin);
    if (start) problems.push(say(start, 'date de début'));
    if (end) problems.push(say(end, 'date de fin'));
    if (!start && !end && line.dateDebut && line.dateFin && lower(line.dateDebut) > upper(line.dateFin)) problems.push(say('la date de début dépasse la date de fin.'));
    let quantityIssue: string | null = null;
    if (line.quantite !== null) {
        if (!Number.isFinite(line.quantite)) quantityIssue = 'la quantité est un nombre (12 ou 12,5).';
        else if (line.quantite < 0) quantityIssue = 'la quantité ne peut pas être négative.';
        else if (!SCALE_OK(line.quantite)) quantityIssue = 'trois décimales au plus.';
        else if (line.quantite > MAX_QUANTITY) quantityIssue = 'quantité trop grande.';
    }
    if (quantityIssue) problems.push(say(quantityIssue));
    else if ((line.quantite === null) !== !line.unite) problems.push(say('indiquez la quantité ET l’unité, ou aucune des deux.'));
    if (line.unite && !EXTENT_UNITS.some(u => u.code === line.unite)) problems.push(say('unité inconnue.'));
    if ((line.support?.trim().length ?? 0) > 100) problems.push(say('le support est limité à 100 caractères.'));
    if (line.duaAnnees !== null && !(Number.isInteger(line.duaAnnees) && line.duaAnnees >= 0 && line.duaAnnees <= 150)) problems.push(say('la durée d’utilité administrative va de 0 à 150 ans.'));
    if (line.sortFinal && !(line.sortFinal in SORTS_FINAUX)) problems.push(say('sort final inconnu (conserver, éliminer ou trier).'));
    if ((line.observations?.trim().length ?? 0) > 5000) problems.push(say('les observations sont limitées à 5000 caractères.'));
    return problems;
}

export function duplicateReferences(lines: ReadonlyArray<LineInput>): string[] {
    const groups = new Map<string, string[]>();
    for (const l of lines) { const key = l.reference.trim().toLowerCase(); if (key) groups.set(key, [...(groups.get(key) ?? []), l.reference.trim()]); }
    return [...groups.values()].filter(g => g.length > 1).map(g => g[0]!);
}

/** Volumétrie annoncée par unité, dans l'ordre des unités de la norme. */
export function totals(lines: ReadonlyArray<LineInput>): UnitTotal[] {
    const by = new Map<string, UnitTotal>();
    for (const l of lines) {
        if (l.quantite === null || !l.unite) continue;
        const current = by.get(l.unite) ?? { unite: l.unite, quantite: 0, lignes: 0 };
        by.set(l.unite, { unite: l.unite, quantite: round3(current.quantite + l.quantite), lignes: current.lignes + 1 });
    }
    const rank = (u: string) => { const i = EXTENT_UNITS.findIndex(x => x.code === u); return i < 0 ? Number.MAX_SAFE_INTEGER : i; };
    return [...by.values()].sort((a, b) => rank(a.unite) - rank(b.unite));
}

// ---------- accord de versement

export interface AgreementFacts { statut: string; producteurId: string; institutionArchivesId: string; dateDebut: string; dateFin: string | null; volumePrevu: number | null; uniteVolume: string | null; reference: string }
const STATUS_WORD: Record<string, string> = { PROJET: 'en projet', ACTIF: 'actif', SUSPENDU: 'suspendu', CLOS: 'clos' };
/** `today` : AAAA-MM-JJ. Un accord ne couvre un versement que s'il est actif, en vigueur, et conclu entre les mêmes parties. */
export function agreementProblems(agreement: AgreementFacts, producteurId: string | null, institutionArchivesId: string | null, today: string): string[] {
    const problems: string[] = [];
    const name = `L’accord ${agreement.reference}`;
    if (agreement.statut !== 'ACTIF') problems.push(`${name} n’est pas actif (${STATUS_WORD[agreement.statut] ?? agreement.statut.toLowerCase()}).`);
    if (today < agreement.dateDebut) problems.push(`${name} ne commence que le ${agreement.dateDebut}.`);
    if (agreement.dateFin && today > agreement.dateFin) problems.push(`${name} a expiré le ${agreement.dateFin}.`);
    if (producteurId && producteurId !== agreement.producteurId) problems.push(`${name} concerne un autre producteur.`);
    if (institutionArchivesId && institutionArchivesId !== agreement.institutionArchivesId) problems.push(`${name} concerne un autre service d’archives.`);
    return problems;
}
/** Avertissement jamais bloquant : le volume annoncé dépasse celui que l'accord prévoit. */
export function volumeWarnings(agreement: AgreementFacts | null, totalsOf: ReadonlyArray<UnitTotal>): string[] {
    if (!agreement || agreement.volumePrevu === null || !agreement.uniteVolume) return [];
    const same = totalsOf.find(t => t.unite === agreement.uniteVolume);
    if (!same || same.quantite <= agreement.volumePrevu) return [];
    return [`Le volume annoncé (${plain(same.quantite)} ${unitLabel(agreement.uniteVolume)}) dépasse le volume prévu par l’accord (${plain(agreement.volumePrevu)} ${unitLabel(agreement.uniteVolume)}).`];
}

/** Ce qui empêche de soumettre, dans l'ordre où l'on corrige. */
export function submitProblems(args: { producteurId: string | null; institutionArchivesId: string | null; lines: ReadonlyArray<LineInput>; agreement: AgreementFacts | null; today: string }): string[] {
    const { producteurId, institutionArchivesId, lines, agreement, today } = args;
    const problems: string[] = [];
    if (!producteurId) problems.push('Désignez le producteur du versement.');
    if (!institutionArchivesId) problems.push('Désignez le service d’archives destinataire.');
    if (!lines.length) problems.push('Le bordereau est vide : ajoutez au moins une ligne.');
    if (lines.length > MAX_LINES) problems.push(`Le bordereau dépasse ${MAX_LINES} lignes.`);
    lines.forEach((line, i) => {
        const label = `Ligne ${i + 1}`;
        problems.push(...lineProblems(line, label));
        if (!line.dateDebut && !line.dateFin) problems.push(`${label} : indiquez au moins une date.`);
        if (line.quantite === null) problems.push(`${label} : la quantité et l’unité sont obligatoires pour soumettre.`);
    });
    for (const ref of duplicateReferences(lines)) problems.push(`La référence « ${ref} » apparaît plusieurs fois dans le bordereau.`);
    if (agreement) problems.push(...agreementProblems(agreement, producteurId, institutionArchivesId, today));
    return problems;
}

// ---------- constat à la réception

export interface ControlForm { constat: Finding; quantiteConstatee: string; motifEcart: string }
export const parseQuantity = (text: string): number | null | 'invalid' => {
    const t = text.trim().replace(',', '.');
    if (!t) return null;
    return /^-?[0-9]{1,11}(\.[0-9]{1,})?$/.test(t) ? Number(t) : 'invalid';
};
export function controlProblem(line: LineInput, form: ControlForm): string | null {
    const found = parseQuantity(form.quantiteConstatee);
    if (found === 'invalid') return 'La quantité constatée est un nombre.';
    if (found !== null && found < 0) return 'La quantité constatée ne peut pas être négative.';
    if (found !== null && !SCALE_OK(found)) return 'La quantité constatée : trois décimales au plus.';
    if (form.constat !== 'CONFORME' && !form.motifEcart.trim()) return 'Expliquez l’écart ou l’absence constaté.';
    if (form.motifEcart.trim().length > 5000) return 'Le motif est limité à 5000 caractères.';
    if (form.constat === 'ABSENT' && found !== null && found !== 0) return 'Une unité absente n’a pas de quantité constatée.';
    if (form.constat === 'CONFORME' && found !== null && line.quantite !== null && found !== line.quantite) return 'Un constat conforme porte la quantité annoncée ; sinon, déclarez un écart.';
    if (found !== null && !line.unite) return 'Cette ligne n’a pas d’unité : la quantité constatée n’a pas de sens.';
    return null;
}
export function receiveProblems(lines: ReadonlyArray<BordereauLine>): string[] {
    if (!lines.length) return ['Le bordereau est vide.'];
    const open = lines.filter(l => l.constat === null).length;
    return open === 0 ? [] : [open === 1 ? 'Une ligne n’a pas encore été contrôlée.' : `${open} lignes n’ont pas encore été contrôlées.`];
}
/** Bilan du contrôle : lignes par constat, volumétrie annoncée et constatée (une ligne conforme vaut sa quantité annoncée). */
export function outcome(lines: ReadonlyArray<BordereauLine>): Outcome {
    const found: LineInput[] = [];
    for (const l of lines) {
        if (l.input.quantite === null || !l.input.unite) continue;
        const quantite = l.constat === 'CONFORME' ? (l.quantiteConstatee ?? l.input.quantite) : l.constat === 'ECART' ? l.quantiteConstatee : l.constat === 'ABSENT' ? 0 : null;
        if (quantite !== null) found.push({ ...l.input, quantite });
    }
    return { conformes: lines.filter(l => l.constat === 'CONFORME').length, ecarts: lines.filter(l => l.constat === 'ECART').length, absents: lines.filter(l => l.constat === 'ABSENT').length,
        annonce: totals(lines.map(l => l.input)), constate: totals(found) };
}

// ---------- formulaire d'une ligne

export interface LineForm { reference: string; intitule: string; dateDebut: string; dateFin: string; quantite: string; unite: string; support: string; duaAnnees: string; sortFinal: string; observations: string }
export const emptyLineForm = (): LineForm => ({ reference: '', intitule: '', dateDebut: '', dateFin: '', quantite: '', unite: '', support: '', duaAnnees: '', sortFinal: '', observations: '' });
export const formOfLine = (l: LineInput): LineForm => ({ reference: l.reference, intitule: l.intitule, dateDebut: l.dateDebut ?? '', dateFin: l.dateFin ?? '',
    quantite: l.quantite === null ? '' : plain(l.quantite), unite: l.unite ?? '', support: l.support ?? '', duaAnnees: l.duaAnnees === null ? '' : String(l.duaAnnees), sortFinal: l.sortFinal ?? '', observations: l.observations ?? '' });
const blank = (s: string) => s.trim() === '' ? null : s.trim();
/** Ce que le serveur reçoit ; une quantité illisible devient NaN pour que le contrôle la signale. */
export function lineBody(form: LineForm): LineInput {
    const quantity = parseQuantity(form.quantite);
    const dua = form.duaAnnees.trim() === '' ? null : Number(form.duaAnnees.trim());
    return { reference: form.reference.trim(), intitule: form.intitule.trim(), dateDebut: blank(form.dateDebut), dateFin: blank(form.dateFin),
        quantite: quantity === 'invalid' ? Number.NaN : quantity, unite: blank(form.unite), support: blank(form.support), duaAnnees: dua, sortFinal: blank(form.sortFinal), observations: blank(form.observations) };
}
export const formProblems = (form: LineForm): string[] => lineProblems(lineBody(form));

// ---------- import d'un fichier

export const BORDEREAU_HEADERS = ['Référence', 'Intitulé', 'Date de début', 'Date de fin', 'Quantité', 'Unité', 'Support', 'DUA (années)', 'Sort final', 'Observations'] as const;
const ALIASES: Record<'reference' | 'intitule' | 'debut' | 'fin' | 'quantite' | 'unite' | 'support' | 'dua' | 'sort' | 'observations', string[]> = {
    reference: ['reference', 'cote', 'numero', 'n', 'n d ordre', 'numero d ordre'],
    intitule: ['intitule', 'titre', 'designation', 'analyse', 'description', 'libelle', 'contenu'],
    debut: ['date de debut', 'date debut', 'debut', 'date extreme debut', 'dates extremes debut', 'annee de debut'],
    fin: ['date de fin', 'date fin', 'fin', 'date extreme fin', 'dates extremes fin', 'annee de fin'],
    quantite: ['quantite', 'volume', 'metrage', 'nombre', 'importance materielle'],
    unite: ['unite', 'unite de mesure', 'unite de quantite'],
    support: ['support', 'type de support'],
    dua: ['dua annees', 'dua', 'duree d utilite administrative', 'duree d utilite administrative annees'],
    sort: ['sort final', 'sort', 'sort proposé', 'sort propose'],
    observations: ['observations', 'observation', 'remarques', 'commentaire', 'commentaires', 'notes']
};
const UNIT_BY_FOLD = new Map<string, string>(EXTENT_UNITS.flatMap(u => [[fold(u.code), u.code] as [string, string], [fold(u.label), u.code] as [string, string]]));
UNIT_BY_FOLD.set('m l', 'ML'); UNIT_BY_FOLD.set('metre lineaire', 'ML'); UNIT_BY_FOLD.set('ml', 'ML'); UNIT_BY_FOLD.set('go', 'GO'); UNIT_BY_FOLD.set('boite', 'BOITES');
UNIT_BY_FOLD.set('registre', 'REGISTRES'); UNIT_BY_FOLD.set('article', 'ARTICLES'); UNIT_BY_FOLD.set('piece', 'PIECES'); UNIT_BY_FOLD.set('feuillet', 'FEUILLETS'); UNIT_BY_FOLD.set('page', 'PAGES');
UNIT_BY_FOLD.set('plan', 'PLANS'); UNIT_BY_FOLD.set('photographie', 'PHOTOGRAPHIES'); UNIT_BY_FOLD.set('photo', 'PHOTOGRAPHIES'); UNIT_BY_FOLD.set('photos', 'PHOTOGRAPHIES'); UNIT_BY_FOLD.set('fichier', 'FICHIERS');
const SORT_BY_FOLD = new Map<string, string>([['conserver', 'CONSERVER'], ['conservation', 'CONSERVER'], ['eliminer', 'ELIMINER'], ['elimination', 'ELIMINER'], ['detruire', 'ELIMINER'], ['destruction', 'ELIMINER'], ['trier', 'TRIER'], ['tri', 'TRIER']]);

/** Une date saisie à la française, ou un numéro de série Excel, devient AAAA, AAAA-MM ou AAAA-MM-JJ ; le reste est laissé tel quel pour que le contrôle le signale. */
export function normalizeDate(raw: string): string | null {
    const t = raw.trim();
    if (!t) return null;
    let m = /^([0-9]{1,2})\/([0-9]{1,2})\/([0-9]{4})$/.exec(t);
    if (m) return `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
    m = /^([0-9]{1,2})\/([0-9]{4})$/.exec(t);
    if (m) return `${m[2]}-${m[1]!.padStart(2, '0')}`;
    if (/^[0-9]{5}$/.test(t)) {                                   // numéro de série Excel : jours depuis le 30 décembre 1899
        const serial = Number(t);
        if (serial >= 10000 && serial <= 80000) return new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000).toISOString().slice(0, 10);
    }
    return t;
}

export interface ParsedLine { line: number; input: LineInput | null; errors: string[] }
export interface ParsedBordereau { rows: ParsedLine[]; fatal: string | null }

export function parseBordereauTable(table: Table): ParsedBordereau {
    const header = table[0] ?? [];
    const column = (key: keyof typeof ALIASES) => header.findIndex(h => ALIASES[key].includes(fold(h)));
    const at = { reference: column('reference'), intitule: column('intitule'), debut: column('debut'), fin: column('fin'), quantite: column('quantite'), unite: column('unite'),
        support: column('support'), dua: column('dua'), sort: column('sort'), observations: column('observations') };
    const missing = ([['reference', 'Référence'], ['intitule', 'Intitulé']] as const).filter(([key]) => at[key] < 0).map(([, label]) => label);
    if (missing.length) return { rows: [], fatal: `Colonnes obligatoires introuvables en première ligne : ${missing.join(', ')}. Utilisez le modèle Excel fourni.` };
    const data = table.slice(1).map((cells, i) => ({ cells, line: i + 2 })).filter(r => r.cells.some(c => c.trim() !== ''));
    if (!data.length) return { rows: [], fatal: 'Le fichier ne contient aucune ligne (seulement la ligne d’en-têtes).' };
    if (data.length > MAX_LINES) return { rows: [], fatal: `Le fichier contient ${data.length} lignes : un bordereau en compte ${MAX_LINES} au plus.` };

    const firstLine = new Map<string, number>();
    const rows = data.map(({ cells, line }): ParsedLine => {
        const get = (i: number) => (i >= 0 ? cells[i] ?? '' : '').trim();
        const errors: string[] = [];
        const quantity = parseQuantity(get(at.quantite));
        const unitText = get(at.unite);
        const unit = unitText ? UNIT_BY_FOLD.get(fold(unitText)) ?? null : null;
        if (unitText && !unit) errors.push(`Unité « ${unitText} » inconnue.`);
        const sortText = get(at.sort);
        const sort = sortText ? SORT_BY_FOLD.get(fold(sortText)) ?? null : null;
        if (sortText && !sort) errors.push(`Sort final « ${sortText} » inconnu (conserver, éliminer ou trier).`);
        const duaText = get(at.dua);
        const dua = duaText === '' ? null : Number(duaText.replace(',', '.'));
        const input: LineInput = { reference: get(at.reference), intitule: get(at.intitule), dateDebut: normalizeDate(get(at.debut)), dateFin: normalizeDate(get(at.fin)),
            quantite: quantity === 'invalid' ? Number.NaN : quantity, unite: unit, support: blank(get(at.support)), duaAnnees: dua, sortFinal: sort, observations: blank(get(at.observations)) };
        // une unité qu'on n'a pas reconnue est déjà signalée : on n'ajoute pas « quantité sans unité »
        errors.push(...lineProblems(input, '').filter(p => !(unitText && !unit && p.includes('ET l’unité'))));
        const key = input.reference.toLowerCase();
        if (key) { const first = firstLine.get(key); if (first !== undefined) errors.push(`Référence déjà utilisée à la ligne ${first}.`); else firstLine.set(key, line); }
        return { line, input: errors.length ? null : input, errors };
    });
    return { rows, fatal: null };
}

/** Modèle Excel : feuille « Bordereau » vide avec liste des unités, et feuille d'instructions. */
export function bordereauTemplate(): Uint8Array {
    return buildXlsx([
        { name: 'Bordereau', rows: [[...BORDEREAU_HEADERS]], widths: [18, 60, 14, 14, 12, 20, 20, 14, 14, 40], list: { column: 5, values: EXTENT_UNITS.map(u => u.label), rows: MAX_LINES } },
        { name: 'Instructions', header: false, widths: [28, 90], rows: [
            ['Bordereau de versement', 'Une ligne par unité à verser (boîte, registre, dossier, lot de fichiers…). Enregistrez au format .xlsx puis importez le fichier dans la fiche du versement.'],
            ['Référence *', 'Obligatoire, unique dans le bordereau : la cote ou le numéro d’ordre du producteur. Exemple : DAF/1960/001'],
            ['Intitulé *', 'Obligatoire (500 caractères max) : ce que contient l’unité. Exemple : Registres de paie 1960-1965'],
            ['Dates', 'AAAA, AAAA-MM ou AAAA-MM-JJ (le format JJ/MM/AAAA est aussi accepté). Pour soumettre le bordereau, au moins une des deux dates est exigée.'],
            ['Quantité et unité', 'Ensemble ou aucune des deux ; exigées pour soumettre, car la volumétrie du versement s’en déduit. Choisissez l’unité dans la liste (mètres linéaires, boîtes, gigaoctets…). Trois décimales au plus.'],
            ['Support', 'Facultatif : papier, photographie, microfilm, fichiers numériques…'],
            ['DUA (années)', 'Facultatif : durée d’utilité administrative proposée par le producteur, de 0 à 150 ans.'],
            ['Sort final', 'Facultatif : conserver, éliminer ou trier.'],
            ['Limites', `${MAX_LINES} lignes par fichier, 2 Mo maximum. Supprimez les lignes d’exemple : toute ligne remplie sera importée. L’import remplace tout le bordereau actuel.`],
            ['Contrôles', 'Les lignes invalides sont signalées avant l’import et l’import est refusé tant qu’il en reste : un bordereau ne se charge qu’entier.']
        ] }
    ]);
}

/** Le bordereau, avec le constat s'il y en a un, pour l'envoyer ou l'imprimer. */
export function bordereauSheet(lines: ReadonlyArray<BordereauLine>, withControl: boolean): Uint8Array {
    const head = [...BORDEREAU_HEADERS, ...(withControl ? ['Constat', 'Quantité constatée', 'Motif de l’écart'] : [])];
    const rows: Table = [head, ...lines.map(l => [l.input.reference, l.input.intitule, l.input.dateDebut ?? '', l.input.dateFin ?? '', l.input.quantite === null ? '' : plain(l.input.quantite), l.input.unite ? unitLabel(l.input.unite) : '',
        l.input.support ?? '', l.input.duaAnnees === null ? '' : String(l.input.duaAnnees), l.input.sortFinal ? SORTS_FINAUX[l.input.sortFinal] ?? l.input.sortFinal : '', l.input.observations ?? '',
        ...(withControl ? [l.constat ? FINDING_LABELS[l.constat] : '', l.quantiteConstatee === null ? '' : plain(l.quantiteConstatee), l.motifEcart ?? ''] : [])])];
    return buildXlsx([{ name: 'Bordereau', rows, widths: [18, 60, 14, 14, 12, 20, 20, 14, 14, 40, 14, 16, 40] }]);
}

// ---------- accusé de réception

export interface AcknowledgementData { reference: string; date: string; numero: string; producteur: string; serviceArchives: string; accord: string | null; lines: ReadonlyArray<BordereauLine> }
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** L'accusé de réception d'un versement, en page HTML autonome à imprimer ou enregistrer : volumétrie annoncée et constatée, écarts et absences expliqués. */
export function acknowledgementHtml(d: AcknowledgementData): string {
    const bilan = outcome(d.lines);
    const units = [...new Set([...bilan.annonce, ...bilan.constate].map(t => t.unite))];
    const rank = (u: string) => EXTENT_UNITS.findIndex(x => x.code === u);
    units.sort((a, b) => rank(a) - rank(b));
    const amount = (list: UnitTotal[], unit: string) => { const t = list.find(x => x.unite === unit); return t ? `${plain(t.quantite)} ${unitLabel(unit)}` : '—'; };
    const gaps = d.lines.filter(l => l.constat === 'ECART' || l.constat === 'ABSENT');
    const row = (cells: string[]) => `<tr>${cells.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`;
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Accusé de réception ${esc(d.reference)}</title><style>
body{font:14px/1.5 Georgia,serif;color:#111;margin:32px auto;max-width:780px;padding:0 16px}h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:24px 0 6px}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #888;padding:5px 8px;text-align:left;vertical-align:top}th{background:#eee}.sign{display:flex;justify-content:space-between;margin-top:56px}.sign div{width:45%;border-top:1px solid #111;padding-top:4px}
</style></head><body>
<h1>Accusé de réception d’un versement d’archives</h1><p>Référence : <strong>${esc(d.reference)}</strong> · reçu le ${esc(d.date)}</p>
<table>${row(['Entrée archivistique', d.numero])}${row(['Producteur', d.producteur])}${row(['Service d’archives destinataire', d.serviceArchives])}${row(['Accord de versement', d.accord ?? 'Aucun'])}</table>
<h2>Volumétrie</h2><table><tr><th>Unité</th><th>Annoncé au bordereau</th><th>Constaté à la réception</th></tr>${units.map(u => row([unitLabel(u), amount(bilan.annonce, u), amount(bilan.constate, u)])).join('') || row(['—', '—', '—'])}</table>
<h2>Contrôle</h2><p>${d.lines.length} ligne${d.lines.length > 1 ? 's' : ''} : ${bilan.conformes} conforme${bilan.conformes > 1 ? 's' : ''}, ${bilan.ecarts} écart${bilan.ecarts > 1 ? 's' : ''}, ${bilan.absents} absente${bilan.absents > 1 ? 's' : ''}.</p>
${gaps.length ? `<h2>Écarts et absences constatés</h2><table><tr><th>Référence</th><th>Intitulé</th><th>Constat</th><th>Annoncé</th><th>Constaté</th><th>Motif</th></tr>${gaps.map(l => row([l.input.reference, l.input.intitule, l.constat ? FINDING_LABELS[l.constat] : '', quantityText(l.input.quantite, l.input.unite) || '—', l.constat === 'ABSENT' ? '0' : l.quantiteConstatee === null ? '—' : plain(l.quantiteConstatee), l.motifEcart ?? ''])).join('')}</table>` : ''}
<div class="sign"><div>Pour le service d’archives</div><div>Pour le service versant</div></div></body></html>`;
}
