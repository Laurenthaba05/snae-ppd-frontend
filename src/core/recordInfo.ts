import { EXTENT_UNITS } from './archivalDescription.js';

/**
 * Documents et dossiers : identifiant pérenne, informations d'archivage (langue, étendue, ancienne cote, données personnelles, document essentiel), relations entre documents,
 * structure d'un dossier (sous-dossiers, service producteur, dates extrêmes, étendue, volumétrie). Les règles reprennent celles du serveur pour guider la saisie ; le serveur
 * reste seul juge.
 */

// ---------- identifiant pérenne : « snae- » + 12 caractères + 1 caractère de contrôle (même algorithme que la base et le serveur)
export const PID_ALPHABET = '0123456789bcdfghjkmnpqrstvwxz';
const PID = /^snae-[0-9bcdfghjkmnpqrstvwxz]{13}$/;
export function pidCheckChar(body: string): string {
    let total = 0;
    for (let i = 0; i < body.length; i++) total += (i + 1) * Math.max(PID_ALPHABET.indexOf(body[i]!), 0);
    return PID_ALPHABET[total % PID_ALPHABET.length]!;
}
export const isValidPid = (pid: string | null | undefined): boolean => !!pid && PID.test(pid) && pid[17] === pidCheckChar(pid.slice(5, 17));
/** L'identifiant tel qu'on le recopie, ramené à sa forme canonique ; null s'il n'est pas valide (faute de frappe comprise). */
export const normalizePid = (raw: string | null | undefined): string | null => { const v = (raw ?? '').trim().toLowerCase(); return isValidPid(v) ? v : null; };

// ---------- langue
export const LANGUAGE_SUGGESTIONS: ReadonlyArray<{ code: string; label: string }> = [
    { code: 'fra', label: 'Français' }, { code: 'eng', label: 'Anglais' }, { code: 'ara', label: 'Arabe' }, { code: 'por', label: 'Portugais' },
    { code: 'fuf', label: 'Pular (peul)' }, { code: 'emk', label: 'Maninka' }, { code: 'sus', label: 'Soussou' }, { code: 'gkp', label: 'Kpèllè' }, { code: 'kss', label: 'Kissi' }, { code: 'tod', label: 'Toma' }
];
export const languageLabel = (code: string | null | undefined): string => !code ? '' : LANGUAGE_SUGGESTIONS.find(l => l.code === code.toLowerCase())?.label ?? code;
const LANGUAGE = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/;

// ---------- données personnelles
export type PersonalData = 'A_EVALUER' | 'AUCUNE' | 'PRESENTES';
export const PERSONAL_LABELS: Record<PersonalData, string> = { A_EVALUER: 'À évaluer', AUCUNE: 'Aucune', PRESENTES: 'Présentes' };

// ---------- document : informations d'archivage
export interface DocumentInfo {
    language: string | null; extentQuantity: number | null; extentUnit: string | null; formerReference: string | null; formerReferenceOrigin: string | null;
    personalData: PersonalData; sensitiveData: boolean; personalDataNature: string | null; essential: boolean; essentialReason: string | null;
}
export interface InfoForm {
    language: string; extentQuantity: string; extentUnit: string; formerReference: string; formerReferenceOrigin: string;
    personalData: PersonalData; sensitiveData: boolean; personalDataNature: string; essential: boolean; essentialReason: string; reason: string;
}
const plain = (n: number) => String(Math.round(n * 1000) / 1000).replace('.', ',');
export function parseQuantity(text: string): number | null | 'invalid' {
    const t = text.trim().replace(',', '.');
    if (!t) return null;
    return /^-?[0-9]{1,11}(\.[0-9]+)?$/.test(t) ? Number(t) : 'invalid';
}
export const formOfInfo = (d: Partial<DocumentInfo>): InfoForm => ({
    language: d.language ?? '', extentQuantity: d.extentQuantity === null || d.extentQuantity === undefined ? '' : plain(d.extentQuantity), extentUnit: d.extentUnit ?? '', formerReference: d.formerReference ?? '',
    formerReferenceOrigin: d.formerReferenceOrigin ?? '', personalData: d.personalData ?? 'A_EVALUER', sensitiveData: d.sensitiveData ?? false, personalDataNature: d.personalDataNature ?? '',
    essential: d.essential ?? false, essentialReason: d.essentialReason ?? '', reason: ''
});

export function extentProblem(quantity: number | null | 'invalid', unit: string): string | null {
    if (quantity === 'invalid') return 'Étendue : la quantité est un nombre (12 ou 12,5).';
    if ((quantity === null) !== !unit) return 'Étendue : indiquez la quantité ET l’unité, ou aucune des deux.';
    if (unit && !EXTENT_UNITS.some(u => u.code === unit)) return 'Étendue : unité inconnue.';
    if (quantity !== null && quantity < 0) return 'Étendue : la quantité ne peut pas être négative.';
    if (quantity !== null && Math.abs(Math.round(quantity * 1000) / 1000 - quantity) > 1e-9) return 'Étendue : trois décimales au plus.';
    return null;
}

/** Tout ce que le serveur refuserait, dans l'ordre où l'on corrige. Le motif est exigé pour enregistrer, pas pour corriger le reste. */
export function infoProblems(f: InfoForm): string[] {
    const problems: string[] = [];
    const language = f.language.trim();
    if (language && (!LANGUAGE.test(language.toLowerCase()) || language.length > 35)) problems.push('Langue : code attendu (fra, eng, fr-GN…), sans espace ni accent.');
    const extent = extentProblem(parseQuantity(f.extentQuantity), f.extentUnit);
    if (extent) problems.push(extent);
    if (f.formerReferenceOrigin.trim() && !f.formerReference.trim()) problems.push('L’origine de l’ancienne cote suppose une ancienne cote.');
    if (f.personalData !== 'PRESENTES') {
        if (f.sensitiveData) problems.push('Des données sensibles supposent que des données personnelles soient présentes.');
        if (f.personalDataNature.trim()) problems.push('La nature des données personnelles n’a de sens que si elles sont présentes.');
    }
    if (f.essential && !f.essentialReason.trim()) problems.push('Un document essentiel exige son motif.');
    return problems;
}
const blank = (s: string) => s.trim() === '' ? null : s.trim();
/** Le corps de la requête : les valeurs sans objet (motif d'un document non essentiel, nature sans données personnelles) sont vidées. */
export function infoBody(f: InfoForm, expectedVersion: number) {
    const quantity = parseQuantity(f.extentQuantity);
    return { expectedVersion, language: blank(f.language)?.toLowerCase() ?? null, extentQuantity: quantity === 'invalid' ? Number.NaN : quantity, extentUnit: blank(f.extentUnit),
        formerReference: blank(f.formerReference), formerReferenceOrigin: blank(f.formerReferenceOrigin), personalData: f.personalData,
        sensitiveData: f.personalData === 'PRESENTES' && f.sensitiveData, personalDataNature: f.personalData === 'PRESENTES' ? blank(f.personalDataNature) : null,
        essential: f.essential, essentialReason: f.essential ? blank(f.essentialReason) : null, reason: f.reason.trim() };
}

/** « 12 pages » ; '' sans étendue. */
export const extentText = (quantity: number | null | undefined, unit: string | null | undefined): string => quantity === null || quantity === undefined || !unit ? '' : `${plain(quantity)} ${EXTENT_UNITS.find(u => u.code === unit)?.label ?? unit}`;

/** Ce qu'il reste à renseigner sur un document : de quoi dire « 3 informations d'archivage à compléter » sans rien exiger. */
export function infoGaps(d: Partial<DocumentInfo>): string[] {
    const gaps: string[] = [];
    if (!d.language) gaps.push('la langue');
    if (d.extentQuantity === null || d.extentQuantity === undefined) gaps.push('l’étendue');
    if (d.personalData === 'A_EVALUER' || !d.personalData) gaps.push('les données personnelles');
    return gaps;
}

// ---------- relations entre documents
export type RelationType = 'REMPLACE' | 'ANNEXE' | 'REPONSE' | 'FAIT_PARTIE' | 'TRADUCTION' | 'COPIE' | 'RENVOI';
export const RELATION_TYPES: ReadonlyArray<{ type: RelationType; label: string; inverse: string; hint: string }> = [
    { type: 'REMPLACE', label: 'remplace', inverse: 'est remplacé par', hint: 'Ce document en remplace un autre (nouvelle version d’un texte, abrogation).' },
    { type: 'ANNEXE', label: 'est une annexe de', inverse: 'a pour annexe', hint: 'Ce document est une annexe d’un autre.' },
    { type: 'REPONSE', label: 'répond à', inverse: 'a pour réponse', hint: 'Une lettre qui répond à une autre.' },
    { type: 'FAIT_PARTIE', label: 'fait partie de', inverse: 'comprend', hint: 'Une pièce d’un ensemble documentaire.' },
    { type: 'TRADUCTION', label: 'est une traduction de', inverse: 'a pour traduction', hint: 'Une traduction d’un autre document.' },
    { type: 'COPIE', label: 'est une copie de', inverse: 'a pour copie', hint: 'Une copie d’un autre document.' },
    { type: 'RENVOI', label: 'renvoie à', inverse: 'est cité par', hint: 'Une référence à un autre document.' }
];
export interface RelatedDocument { id: string; reference: string; title: string; persistentId: string | null; archivalStatus: string; destroyed: boolean }
export interface DocumentRelation { id: string; type: RelationType; outgoing: boolean; label: string; other: RelatedDocument; comment: string | null; version: number; createdAt: string }
export interface DocumentRelations { items: DocumentRelation[]; unreadable: number }
export const relationLabel = (type: RelationType, outgoing: boolean): string => { const t = RELATION_TYPES.find(r => r.type === type); return !t ? type : outgoing ? t.label : t.inverse; };

/** Les relations rangées par nature, pour les lire : « remplace… », « est remplacé par… », « comprend… ». */
export function groupRelations(items: ReadonlyArray<DocumentRelation>): Array<{ label: string; items: DocumentRelation[] }> {
    const order = RELATION_TYPES.flatMap(r => [r.label, r.inverse]);
    const groups = new Map<string, DocumentRelation[]>();
    for (const r of items) groups.set(r.label, [...(groups.get(r.label) ?? []), r]);
    return [...groups.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([label, list]) => ({ label, items: list }));
}
export function relationProblems(sourceId: string, targetId: string | null, comment: string): string[] {
    const problems: string[] = [];
    if (!targetId) problems.push('Choisissez le document en relation.');
    else if (targetId === sourceId) problems.push('Un document ne peut pas être en relation avec lui-même.');
    if (comment.trim().length > 2000) problems.push('Le commentaire est limité à 2000 caractères.');
    return problems;
}

// ---------- dossier : structure
export const MAX_LEVEL = 8;
export const levelLabel = (level: number): string => level === 1 ? 'Dossier' : level === 2 ? 'Sous-dossier' : level === 3 ? 'Sous-sous-dossier' : `Niveau ${level}`;
export interface DossierInfo { producerId: string | null; contentStartDate: string | null; contentEndDate: string | null; extentQuantity: number | null; extentUnit: string | null }
export interface DossierForm { producerId: string; contentStartDate: string; contentEndDate: string; extentQuantity: string; extentUnit: string; reason: string }
export const formOfDossier = (d: Partial<DossierInfo>): DossierForm => ({ producerId: d.producerId ?? '', contentStartDate: d.contentStartDate ?? '', contentEndDate: d.contentEndDate ?? '',
    extentQuantity: d.extentQuantity === null || d.extentQuantity === undefined ? '' : plain(d.extentQuantity), extentUnit: d.extentUnit ?? '', reason: '' });
export function dossierProblems(f: DossierForm): string[] {
    const problems: string[] = [];
    if (f.contentStartDate && f.contentEndDate && f.contentEndDate < f.contentStartDate) problems.push('La date de fin du contenu précède sa date de début.');
    const extent = extentProblem(parseQuantity(f.extentQuantity), f.extentUnit);
    if (extent) problems.push(extent);
    return problems;
}
export function dossierBody(f: DossierForm, expectedVersion: number) {
    const quantity = parseQuantity(f.extentQuantity);
    return { expectedVersion, producerId: blank(f.producerId), contentStartDate: blank(f.contentStartDate), contentEndDate: blank(f.contentEndDate), extentQuantity: quantity === 'invalid' ? Number.NaN : quantity, extentUnit: blank(f.extentUnit), reason: f.reason.trim() };
}

export interface Volumetry { subDossiers: number; directSubDossiers: number; documents: number; directDocuments: number; destroyedDocuments: number; computedStartDate: string | null; computedEndDate: string | null; totalBytes: number }
/** Les dates extrêmes à afficher : celles que l'archiviste a fixées, sinon celles qui se déduisent des documents (indiquées comme calculées). */
export function extremeDates(info: Pick<DossierInfo, 'contentStartDate' | 'contentEndDate'>, v: Pick<Volumetry, 'computedStartDate' | 'computedEndDate'> | null): { start: string | null; end: string | null; computed: boolean } {
    const start = info.contentStartDate ?? v?.computedStartDate ?? null, end = info.contentEndDate ?? v?.computedEndDate ?? null;
    return { start, end, computed: (!info.contentStartDate && !!v?.computedStartDate) || (!info.contentEndDate && !!v?.computedEndDate) };
}
const count = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;
/** « 3 documents (dont 1 détruit) dans 2 sous-dossiers » ; « vide » sans rien. */
export function volumetrySummary(v: Volumetry): string {
    if (v.documents === 0 && v.subDossiers === 0) return 'Ce dossier est vide.';
    const documents = v.documents === 0 ? 'aucun document' : count(v.documents, 'document', 'documents') + (v.destroyedDocuments > 0 ? ` (dont ${v.destroyedDocuments} détruit${v.destroyedDocuments > 1 ? 's' : ''})` : '');
    return v.subDossiers > 0 ? `${documents} dans ${count(v.subDossiers, 'sous-dossier', 'sous-dossiers')}` : documents;
}
