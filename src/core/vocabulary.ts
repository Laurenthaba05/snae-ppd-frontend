/**
 * Vocabulaires contrôlés, mots-clés et forme du document. Un vocabulaire est constitué par l'institution (ou au niveau national) : rien n'est livré. Un terme a un libellé préféré qui
 * ne change plus, des libellés alternatifs, un terme générique et une définition ; il ne disparaît pas, il devient obsolète avec son remplaçant. Le serveur reste seul juge.
 */
export type VocabularyStatus = 'ACTIF' | 'RETIRE';
export type TermStatus = 'ACTIF' | 'OBSOLETE';
export type KeywordKind = 'DOCUMENT' | 'DOSSIER' | 'BIEN' | 'NOTICE';

export interface Vocabulary {
    id: string; institutionId: string | null; code: string; name: string; description: string | null; source: string | null; status: VocabularyStatus; terms: number; createdAt: string;
}
export interface VocabularyTerm {
    id: string; vocabularyId: string; label: string; definition: string | null; parentId: string | null; parentLabel: string | null; alternativeLabels: string[]; status: TermStatus;
    replacedById: string | null; replacedByLabel: string | null; obsolescenceReason: string | null;
    /** Le nombre d'objets indexés : donné seulement à qui gère le vocabulaire (sinon null : un total ne se donne pas à qui ne peut pas tout lire). */
    usage: number | null;
}
export interface TermPage { items: VocabularyTerm[]; page: number; size: number; total: number; hasMore: boolean }
/** Un document ou un dossier retrouvé par un terme : jamais de total, `hasMore` suffit à continuer. */
export interface KeywordHit { id: string; reference: string; title: string; confidentiality: string | null; archivalStatus: string | null; institutionId: string }
export interface KeywordHitPage { items: KeywordHit[]; page: number; size: number; hasMore: boolean }
export interface TermsImportResult { created: number; skipped: string[] }
/** Ce que le remplacement d'un terme obsolète a fait pour une sorte d'objet : posés avec le remplaçant, déjà porteurs du remplaçant, laissés en l'état. */
export interface KeywordReplaceCount { kind: KeywordKind; replaced: number; alreadyHeld: number; skipped: number }
export interface KeywordReplaceResult { termId: string; replacementId: string; replacementLabel: string; counts: KeywordReplaceCount[] }
export const KIND_LABELS: Record<KeywordKind, string> = { DOCUMENT: 'Documents', DOSSIER: 'Dossiers', BIEN: 'Biens patrimoniaux', NOTICE: 'Notices de description' };
export interface Keyword {
    termId: string; label: string; vocabularyId: string; vocabularyName: string; vocabularyCode: string; status: TermStatus; replacedByLabel: string | null; addedAt: string;
}
export interface DocumentForm { form: string | null; precision: string | null; version: number }

export const MAX_LABEL = 255;
export const MAX_ALTERNATIVES = 20;
export const MAX_IMPORT_ROWS = 2000;
export const MAX_KEYWORDS_PER_REQUEST = 50;

export const FORMS = ['ORIGINAL', 'COPIE', 'COPIE_CERTIFIEE', 'EXTRAIT', 'MINUTE', 'EXPEDITION', 'AUTRE'] as const;
export type DocumentFormCode = typeof FORMS[number];
export const FORM_LABELS: Record<DocumentFormCode, string> = {
    ORIGINAL: 'Original', COPIE: 'Copie', COPIE_CERTIFIEE: 'Copie certifiée conforme', EXTRAIT: 'Extrait', MINUTE: 'Minute', EXPEDITION: 'Expédition', AUTRE: 'Autre'
};
export const formLabel = (form: string | null | undefined): string => (form && (FORM_LABELS as Record<string, string>)[form]) || 'Non renseignée';

const CODE = /^[A-Z][A-Z0-9_]{1,59}$/;
export const normalizeCode = (value: string): string => value.trim().toUpperCase();

export function vocabularyProblems(code: string, name: string): string[] {
    const problems: string[] = [];
    if (!CODE.test(normalizeCode(code))) problems.push('Le code compte de 2 à 60 caractères : lettres majuscules, chiffres et souligné, la première étant une lettre.');
    if (name.trim().length === 0 || name.trim().length > 200) problems.push('Le nom est obligatoire (200 caractères au plus).');
    return problems;
}

export const cleanLabel = (value: string): string => value.trim().replace(/\s+/g, ' ');

export function termProblems(label: string, alternatives: string[]): string[] {
    const problems: string[] = [];
    const clean = cleanLabel(label);
    if (clean.length === 0 || clean.length > MAX_LABEL) problems.push(`Le libellé est obligatoire (${MAX_LABEL} caractères au plus).`);
    if (alternatives.length > MAX_ALTERNATIVES) problems.push(`Un terme compte ${MAX_ALTERNATIVES} libellés alternatifs au plus.`);
    if (alternatives.some(a => a.length > MAX_LABEL)) problems.push(`Un libellé alternatif dépasse ${MAX_LABEL} caractères.`);
    return problems;
}

/** Les libellés alternatifs saisis un par ligne (ou séparés par « | ») : nettoyés, sans doublon ni copie du libellé préféré. */
export function parseAlternatives(text: string, preferred = ''): string[] {
    const seen = new Set<string>([cleanLabel(preferred).toLowerCase()]);
    const out: string[] = [];
    for (const raw of text.split(/[\n|]/)) {
        const value = cleanLabel(raw);
        if (!value || seen.has(value.toLowerCase())) continue;
        seen.add(value.toLowerCase());
        out.push(value);
    }
    return out;
}
export const alternativesText = (values: string[]): string => values.join('\n');

export function formProblems(form: string, precision: string): string[] {
    const problems: string[] = [];
    if (!(FORMS as readonly string[]).includes(form)) problems.push('Choisissez la forme du document.');
    if (form === 'AUTRE' && precision.trim().length === 0) problems.push('Une forme « autre » se précise.');
    if (precision.trim().length > 500) problems.push('La précision est limitée à 500 caractères.');
    return problems;
}

/** Un fichier CSV : au moins une colonne « libelle » en en-tête (sans casse ni accent), au plus MAX_IMPORT_ROWS lignes. Le serveur relit tout. */
export function csvProblems(text: string): string[] {
    const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length === 0) return ['Le fichier est vide.'];
    const header = (lines[0] ?? '').split(/[;,]/).map(c => c.normalize('NFD').replace(/\p{M}/gu, '').trim().replace(/^"|"$/g, '').toLowerCase());
    const problems: string[] = [];
    if (!header.some(c => ['libelle', 'label', 'terme'].includes(c))) problems.push('La première ligne doit nommer une colonne « libelle ».');
    if (lines.length - 1 > MAX_IMPORT_ROWS) problems.push(`Un import compte ${MAX_IMPORT_ROWS} lignes au plus (${lines.length - 1} lues).`);
    return problems;
}
export const csvRowCount = (text: string): number => Math.max(0, text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim().length > 0).length - 1);

export const TEMPLATE_CSV = 'libelle;parent;definition;alternatifs\n';

export const MAX_SKOS_CHARS = 2_000_000;

/**
 * Un fichier SKOS : du JSON-LD (accolade ou crochet) ou du RDF/XML (balise ouvrante), 2 Mo au plus. Le Turtle n'est pas lu. Le serveur relit tout, et refuse avec le concept nommé
 * ce que le vocabulaire ne sait pas porter (plusieurs génériques, générique absent du fichier, boucle, libellé en double).
 */
export function skosProblems(text: string): string[] {
    const clean = text.replace(/^﻿/, '').trim();
    if (clean.length === 0) return ['Le fichier est vide.'];
    if (clean.length > MAX_SKOS_CHARS) return ['Un fichier SKOS fait 2 Mo au plus.'];
    if (/^@prefix|^PREFIX\s/i.test(clean)) return ['Le Turtle n’est pas lu : exportez le thésaurus en JSON-LD ou en RDF/XML.'];
    if (!/^[{[<]/.test(clean)) return ['Le fichier doit être du SKOS en JSON-LD ou en RDF/XML.'];
    return [];
}

export interface TermRow { term: VocabularyTerm; depth: number }
/** Les termes d'une page rangés en arbre : un terme suit son générique s'il est dans la page, sinon il est à la racine. Alphabétique à chaque niveau. */
export function termTree(items: VocabularyTerm[]): TermRow[] {
    const ids = new Set(items.map(t => t.id));
    const children = new Map<string, VocabularyTerm[]>();
    const roots: VocabularyTerm[] = [];
    for (const t of items) {
        if (t.parentId && ids.has(t.parentId) && t.parentId !== t.id) children.set(t.parentId, [...(children.get(t.parentId) ?? []), t]);
        else roots.push(t);
    }
    const byLabel = (a: VocabularyTerm, b: VocabularyTerm) => a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' });
    const rows: TermRow[] = [];
    const seen = new Set<string>();
    const visit = (t: VocabularyTerm, depth: number) => {
        if (seen.has(t.id)) return;
        seen.add(t.id);
        rows.push({ term: t, depth });
        (children.get(t.id) ?? []).sort(byLabel).forEach(c => visit(c, depth + 1));
    };
    roots.sort(byLabel).forEach(t => visit(t, 0));
    // une boucle (que le serveur interdit) ne doit pas faire disparaître des termes de l'affichage
    items.filter(t => !seen.has(t.id)).sort(byLabel).forEach(t => visit(t, 0));
    return rows;
}

/** La mention d'un mot-clé : obsolète, avec son remplaçant quand on le connaît. */
export function keywordNote(k: Pick<Keyword, 'status' | 'replacedByLabel'>): string | null {
    if (k.status !== 'OBSOLETE') return null;
    return k.replacedByLabel ? `Terme obsolète, remplacé par « ${k.replacedByLabel} ».` : 'Terme obsolète, sans remplaçant.';
}

/** Un terme se pose-t-il encore ? (actif, dans un vocabulaire actif) */
export const attachable = (t: Pick<VocabularyTerm, 'status'>, v: Pick<Vocabulary, 'status'> | undefined): boolean => t.status === 'ACTIF' && v?.status === 'ACTIF';

export const skosFileName = (code: string): string => `vocabulaire-${code.replace(/[^A-Za-z0-9._-]+/g, '-').toLowerCase()}.jsonld`;

export const VOCABULARY_ERRORS: Record<string, string> = {
    VOCABULARY_CODE_TAKEN: 'Un vocabulaire de ce périmètre porte déjà ce code.',
    VOCABULARY_TERM_EXISTS: 'Ce terme existe déjà dans le vocabulaire.',
    VOCABULARY_TERM_CYCLE: 'Ce terme générique formerait une boucle dans la hiérarchie.',
    VOCABULARY_RETIRED: 'Ce vocabulaire est retiré : il n’accepte plus de terme.',
    KEYWORD_TERM_NOT_ACTIVE: 'Ce terme est obsolète ou son vocabulaire est retiré : choisissez un terme actif.',
    KEYWORD_VOCABULARY_FOREIGN: 'Ce vocabulaire appartient à une autre institution.',
    DOCUMENT_FORM_VERSION_CONFLICT: 'La forme a été modifiée entre-temps : rechargez la fiche.',
    VOCABULARY_TERM_NOT_OBSOLETE: 'Seul un terme obsolète se remplace : rendez-le d’abord obsolète en nommant son remplaçant.',
    VOCABULARY_REPLACEMENT_MISSING: 'Ce terme obsolète n’a pas de remplaçant déclaré : on ne sait pas par quoi le remplacer.',
    VOCABULARY_REPLACEMENT_OBSOLETE: 'Le remplaçant est lui-même obsolète ou son vocabulaire est retiré : choisissez un autre remplaçant.'
};
