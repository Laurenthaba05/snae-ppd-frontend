/**
 * Notice de description archivistique (ISAD(G) 2e éd.) : les sept zones, leurs éléments, l'importance matérielle structurée, l'état de rédaction et le contrôle
 * « description validée ». Les règles reprennent celles du serveur pour guider la saisie ; le serveur reste seul juge.
 */
export type FieldKind = 'area' | 'date' | 'text' | 'select' | 'quantity';
export interface DescriptionField { key: string; label: string; kind: FieldKind; hint?: string; isad?: string }
export interface DescriptionGroup { title: string; fields: ReadonlyArray<DescriptionField> }

export const STATUS_LABELS: Record<string, string> = { BROUILLON: 'Brouillon', A_RELIRE: 'À relire', VALIDEE: 'Validée' };
export const DATE_KIND_LABELS: Record<string, string> = { CREATION: 'Création', ACCUMULATION: 'Accumulation' };
export const EXTENT_UNITS: ReadonlyArray<{ code: string; label: string }> = [
    { code: 'ML', label: 'mètres linéaires' }, { code: 'GO', label: 'gigaoctets' }, { code: 'BOITES', label: 'boîtes' }, { code: 'REGISTRES', label: 'registres' }, { code: 'ARTICLES', label: 'articles' },
    { code: 'PIECES', label: 'pièces' }, { code: 'FEUILLETS', label: 'feuillets' }, { code: 'PAGES', label: 'pages' }, { code: 'PLANS', label: 'plans' }, { code: 'PHOTOGRAPHIES', label: 'photographies' }, { code: 'FICHIERS', label: 'fichiers numériques' }
];

/** Les zones de la norme dans l'ordre de lecture ; `isad` donne le numéro de l'élément pour l'archiviste qui connaît la norme. */
export const DESCRIPTION_GROUPS: ReadonlyArray<DescriptionGroup> = [
    { title: 'Identification', fields: [
        { key: 'dateStart', label: 'Date de début', kind: 'date', isad: '3.1.3' },
        { key: 'dateEnd', label: 'Date de fin', kind: 'date', isad: '3.1.3' },
        { key: 'dateKind', label: 'Nature des dates', kind: 'select', hint: 'Dates de création des documents, ou dates d’accumulation par le producteur', isad: '3.1.3' },
        { key: 'dateLabel', label: 'Dates telles que décrites (si approximatives)', kind: 'area', hint: 'Par exemple « vers 1960 » ou « 1958-1984 (lacunes) »', isad: '3.1.3' },
        { key: 'extentQuantity', label: 'Importance matérielle : quantité', kind: 'quantity', hint: 'Un nombre, au plus trois décimales', isad: '3.1.5' },
        { key: 'extentUnit', label: 'Importance matérielle : unité', kind: 'select', isad: '3.1.5' },
        { key: 'medium', label: 'Support', kind: 'text', hint: 'Papier, photographie, microfilm, fichiers numériques…', isad: '3.1.5' },
        { key: 'extent', label: 'Importance matérielle : précisions', kind: 'area', hint: 'Ce que la quantité ne dit pas : dont 3 boîtes de plans, registres reliés…', isad: '3.1.5' }] },
    { title: 'Contexte', fields: [
        { key: 'custodialHistory', label: 'Historique de conservation', kind: 'area', isad: '3.2.3' },
        { key: 'acquisition', label: 'Modalités d’entrée', kind: 'area', isad: '3.2.4' }] },
    { title: 'Contenu et structure', fields: [
        { key: 'scopeContent', label: 'Présentation du contenu', kind: 'area', isad: '3.3.1' },
        { key: 'appraisal', label: 'Évaluation et éliminations', kind: 'area', isad: '3.3.2' },
        { key: 'accruals', label: 'Accroissements', kind: 'area', hint: 'Versements complémentaires attendus ou non', isad: '3.3.3' },
        { key: 'arrangement', label: 'Mode de classement', kind: 'area', isad: '3.3.4' }] },
    { title: 'Conditions d’accès et d’utilisation', fields: [
        { key: 'accessConditions', label: 'Conditions d’accès', kind: 'area', isad: '3.4.1' },
        { key: 'reproductionConditions', label: 'Conditions de reproduction', kind: 'area', isad: '3.4.2' },
        { key: 'language', label: 'Langue des documents', kind: 'area', isad: '3.4.3' },
        { key: 'scripts', label: 'Écritures des documents', kind: 'area', hint: 'Latin, arabe, N’ko…', isad: '3.4.3' },
        { key: 'physicalCharacteristics', label: 'Caractéristiques matérielles et contraintes techniques', kind: 'area', hint: 'État physique, formats qui demandent un équipement', isad: '3.4.4' },
        { key: 'findingAids', label: 'Instruments de recherche', kind: 'area', isad: '3.4.5' }] },
    { title: 'Sources complémentaires', fields: [
        { key: 'originalsLocation', label: 'Existence et lieu de conservation des originaux', kind: 'area', isad: '3.5.1' },
        { key: 'copiesLocation', label: 'Existence et lieu de conservation des copies', kind: 'area', isad: '3.5.2' },
        { key: 'relatedUnits', label: 'Unités de description associées', kind: 'area', hint: 'Autres fonds ou séries liés par la provenance ou le sujet', isad: '3.5.3' },
        { key: 'publicationNote', label: 'Note de publication', kind: 'area', hint: 'Publications fondées sur ces documents', isad: '3.5.4' }] },
    { title: 'Notes et contrôle de la description', fields: [
        { key: 'note', label: 'Note générale', kind: 'area', isad: '3.6.1' },
        { key: 'status', label: 'État de rédaction', kind: 'select', hint: 'Une description validée exige dates, importance matérielle et producteur' },
        { key: 'archivistNote', label: 'Note de l’archiviste', kind: 'area', hint: 'Sources consultées, personnes qui ont décrit', isad: '3.7.1' },
        { key: 'rules', label: 'Règles ou conventions appliquées', kind: 'area', isad: '3.7.2' },
        { key: 'sources', label: 'Sources de la notice', kind: 'area' }] }
];

const QUANTITY = /^[0-9]{1,9}([.,][0-9]{1,3})?$/;
const unitLabel = (code: string | undefined) => EXTENT_UNITS.find(u => u.code === code)?.label;
const filled = (v: string | undefined) => !!v && v.trim().length > 0;

/** L'importance matérielle en une ligne : « 12,5 mètres linéaires — papier — dont 3 boîtes de plans » ; '' si rien n'est renseigné. */
export function extentText(details: Readonly<Record<string, string>>): string {
    const quantity = details.extentQuantity?.trim() ?? '';
    const unit = unitLabel(details.extentUnit);
    const structured = unit && QUANTITY.test(quantity) ? `${quantity.replace('.', ',')} ${unit}` : '';
    return [structured, details.medium?.trim(), details.extent?.trim()].filter(Boolean).join(' — ');
}

/** Les éléments qui manquent pour valider une description : dates, importance matérielle, producteur (propre ou hérité). */
export function missingForValidation(details: Readonly<Record<string, string>>, producerKnown: boolean): string[] {
    const missing: string[] = [];
    if (!filled(details.dateStart) && !filled(details.dateEnd) && !filled(details.dateLabel)) missing.push('dates');
    if (!extentText(details)) missing.push('importance matérielle');
    if (!producerKnown) missing.push('producteur');
    return missing;
}

export interface NodeRef { id: string; parentId: string | null; producerId: string | null }
/** Vrai si la description, ou l'un de ses parents, a un producteur. */
export function producerKnown(own: string | null, parentId: string | null, all: ReadonlyArray<NodeRef>): boolean {
    if (own) return true;
    const byId = new Map(all.map(n => [n.id, n] as const));
    const seen = new Set<string>();
    for (let current = parentId; current && !seen.has(current);) {
        seen.add(current);
        const node = byId.get(current);
        if (!node) return false;
        if (node.producerId) return true;
        current = node.parentId;
    }
    return false;
}

/** Contrôles avant l'envoi de ce que le serveur refuserait de toute façon, dans l'ordre où l'archiviste les corrige. */
export function descriptionProblems(details: Readonly<Record<string, string>>, producerIsKnown: boolean): string[] {
    const problems: string[] = [];
    const quantity = details.extentQuantity?.trim() ?? '', unit = details.extentUnit?.trim() ?? '';
    if (quantity && !QUANTITY.test(quantity)) problems.push('Importance matérielle : la quantité est un nombre, avec au plus trois décimales.');
    else if (!!quantity !== !!unit) problems.push('Importance matérielle : indiquez la quantité ET l’unité, ou aucune des deux.');
    if (details.status === 'VALIDEE') {
        const missing = missingForValidation(details, producerIsKnown);
        if (missing.length) problems.push(`Une description validée exige : ${missing.join(', ')}.`);
    }
    return problems;
}

/** Les 26 éléments de la norme et ce qui les renseigne : de quoi dire « 14 éléments sur 26 » sans prétendre que tout niveau doit tout contenir. */
const ELEMENTS: ReadonlyArray<(d: Readonly<Record<string, string>>, producer: boolean) => boolean> = [
    () => true, () => true,                                                                   // 3.1.1 référence, 3.1.2 intitulé : toujours exigés
    d => filled(d.dateStart) || filled(d.dateEnd) || filled(d.dateLabel), () => true,         // 3.1.3 dates, 3.1.4 niveau
    d => extentText(d) !== '',                                                                // 3.1.5 importance matérielle
    (_d, producer) => producer, (_d, producer) => producer,                                   // 3.2.1 producteur, 3.2.2 histoire du producteur (sa notice d'autorité)
    d => filled(d.custodialHistory), d => filled(d.acquisition),                              // 3.2.3, 3.2.4
    d => filled(d.scopeContent), d => filled(d.appraisal), d => filled(d.accruals), d => filled(d.arrangement),   // 3.3.1 à 3.3.4
    d => filled(d.accessConditions), d => filled(d.reproductionConditions), d => filled(d.language) || filled(d.scripts),
    d => filled(d.physicalCharacteristics), d => filled(d.findingAids),                       // 3.4.1 à 3.4.5
    d => filled(d.originalsLocation), d => filled(d.copiesLocation), d => filled(d.relatedUnits), d => filled(d.publicationNote),   // 3.5.1 à 3.5.4
    d => filled(d.note), d => filled(d.archivistNote), d => filled(d.rules), () => true       // 3.6.1, 3.7.1, 3.7.2, 3.7.3 (dates de la description : celles du système)
];
export const ISAD_ELEMENT_COUNT = ELEMENTS.length;
export function isadCompleteness(details: Readonly<Record<string, string>>, producerIsKnown: boolean): { done: number; total: number } {
    return { done: ELEMENTS.filter(test => test(details, producerIsKnown)).length, total: ELEMENTS.length };
}
