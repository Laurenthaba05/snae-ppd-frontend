import type { AssetFields, DescriptionStatus, HeritageAsset } from './types.js';

/* Libellés des états et des champs d'un bien patrimonial. Plusieurs états indépendants, jamais une succession unique. */

export const DESCRIPTION_LABELS: Record<DescriptionStatus, string> = { MINIMALE: 'Notice minimale', EN_REDACTION: 'En rédaction', A_RELIRE: 'À relire', VALIDEE: 'Validée' };
export const PRISE_EN_CHARGE_LABELS: Record<string, string> = {
    A_EXAMINER: 'À examiner', ACQUISITION_VALIDEE: 'Acquisition validée', DEPOT: 'Dépôt', PRET_ENTRANT: 'Prêt entrant', SITUATION_A_CLARIFIER: 'Situation à clarifier', REFUSE: 'Refusé', SORTI: 'Sorti de la collection'
};
export const ETAT_LABELS: Record<string, string> = { NON_EVALUE: 'Non évalué', STABLE: 'Stable', FRAGILE: 'Fragile', INTERVENTION_REQUISE: 'Intervention requise' };
export const DISPONIBILITE_LABELS: Record<string, string> = { EN_RESERVE: 'En réserve', EN_SORTIE: 'Sorti de réserve', NON_LOCALISE: 'Non localisé', INTROUVABLE: 'Introuvable', EN_RESTAURATION: 'En restauration', NON_APPLICABLE: 'Sans original physique' };
export const NUMERISATION_LABELS: Record<string, string> = { NON_PROGRAMMEE: 'Non numérisé', PROGRAMMEE: 'Programmée', EN_COURS: 'En cours', VALIDEE: 'Numérisé' };
export const DIFFUSION_LABELS: Record<string, string> = { NON_EXAMINEE: 'Non examinée', RESTREINTE: 'Restreinte', AUTORISEE: 'Autorisée', PUBLIEE: 'Publiée', RETIREE: 'Retirée' };
export const PRECISION_LABELS: Record<string, string> = {
    NON_RENSEIGNEE: 'Non renseignée', EXACTE: 'Date exacte', ANNEE: 'Année', DECENNIE: 'Décennie', SIECLE: 'Siècle', ESTIMEE: 'Estimée (« vers »)', INCONNUE: 'Inconnue (déclarée)'
};
export const PROVENANCE_LABELS: Record<string, string> = { CONNUE: 'Connue', PARTIELLE: 'Partiellement connue', A_ETABLIR: 'À établir', INCONNUE_DECLAREE: 'Inconnue (déclarée)' };
export const PROPRIETAIRE_LABELS: Record<string, string> = { IDENTIFIE: 'Identifié', ETAT: 'L’État', A_ETABLIR: 'À établir', INCONNU_DECLARE: 'Inconnu (déclaré)' };
export const JURIDIQUE_LABELS: Record<string, string> = { CLAIRE: 'Claire', A_CLARIFIER: 'À clarifier' };
export const NATURE_LABELS: Record<string, string> = { PHYSIQUE: 'Original physique', NUMERIQUE_NATIF: 'Numérique natif' };
export const ORIGINE_LABELS: Record<string, string> = { CREATION: 'Création', RECEPTION: 'Réception', REPRISE_INVENTAIRE: 'Reprise d’inventaire' };
export const ROLE_RESSOURCE_LABELS: Record<string, string> = {
    REPRESENTATION: 'Représentation numérique', JUSTIFICATIF: 'Justificatif', TRANSCRIPTION: 'Transcription', TRADUCTION: 'Traduction', RAPPORT: 'Rapport', AUTRE: 'Autre'
};
export const JOURNAL_LABELS: Record<string, string> = { CREATION: 'Création', MODIFICATION: 'Modification', CORRECTION: 'Correction', TRANSITION: 'Passage', LIEN: 'Lien' };

export const label = (map: Record<string, string>, key: string | null | undefined): string => key ? (map[key] ?? key) : '—';

export const FIELD_LABELS: Record<string, string> = {
    intitule: 'Intitulé', numeroInventaire: 'Numéro d’inventaire', anciennesReferences: 'Anciennes références', categorie: 'Catégorie', natureOriginale: 'Nature de l’original',
    resume: 'Résumé', langues: 'Langues', ecritures: 'Écritures', support: 'Support', materiaux: 'Matériaux', dimensions: 'Dimensions', quantite: 'Quantité',
    uniteQuantite: 'Unité', paginationDuree: 'Pagination ou durée', producteurId: 'Producteur', archivalDescriptionId: 'Description archivistique', dateDebut: 'Date de début',
    dateFin: 'Date de fin', precisionDate: 'Précision de la date', dateTexte: 'Date en toutes lettres', dateSource: 'Source de la date', attributionIncertaine: 'Attribution incertaine',
    attributionSource: 'Source de l’attribution', bibliographie: 'Bibliographie', historiqueProvenance: 'Historique de provenance', provenanceStatut: 'Provenance',
    proprietaireStatut: 'Propriétaire', proprietaireActeurId: 'Propriétaire identifié', deposantActeurId: 'Déposant', situationJuridique: 'Situation juridique',
    situationJuridiqueNote: 'Note sur la situation juridique', entreeArchivistiqueId: 'Entrée', valeurCriteres: 'Motifs de sélection', valeurAppreciation: 'Appréciation',
    valeurSources: 'Sources de l’appréciation', valeurDateEvaluation: 'Date de l’évaluation', etatMateriel: 'État matériel', statutDescription: 'Description', statutPriseEnCharge: 'Prise en charge',
    original: 'Original', ressource: 'Ressource', place: 'Lieu', event: 'Événement', subject: 'Sujet',
    titresAlternatifs: 'Titres alternatifs', technique: 'Technique de fabrication', periodeCulture: 'Période ou culture', inscriptions: 'Inscriptions et marques',
    valeurAssurance: 'Valeur d’assurance', valeurAssuranceDevise: 'Devise de la valeur d’assurance', valeurAssuranceDate: 'Date de l’évaluation d’assurance',
    droitsImage: 'Droits d’image et de reproduction', droitsImageNote: 'Note sur les droits d’image'
};

/** Droits d'image et de reproduction : « non renseignés » n'est pas une réponse, « à clarifier » dit qu'on sait ne pas savoir. */
export const DROITS_IMAGE_LABELS: Record<string, string> = {
    NON_RENSEIGNES: 'Non renseignés', DOMAINE_PUBLIC: 'Domaine public', DROITS_DETENUS: 'Droits détenus par l’institution', DROITS_TIERS: 'Droits détenus par un tiers', A_CLARIFIER: 'À clarifier'
};

export type FieldType = 'actor' | 'intake' | 'text' | 'textarea' | 'select' | 'list' | 'refs' | 'titles' | 'date' | 'number' | 'flag' | 'categorie' | 'criteres';
export interface FieldDef { name: string; label: string; type: FieldType; options?: Record<string, string>; hint?: string; wide?: boolean }
export interface FieldGroup { id: 'identification' | 'description' | 'contexte' | 'provenance' | 'valeur'; label: string; fields: FieldDef[] }

/** Groupes de la fiche : identification, description, contexte historique, provenance et responsabilité, valeur patrimoniale. */
export const FIELD_GROUPS: FieldGroup[] = [
    { id: 'identification', label: 'Identification', fields: [
        { name: 'intitule', label: 'Intitulé', type: 'text', wide: true },
        { name: 'categorie', label: 'Catégorie', type: 'categorie' },
        { name: 'natureOriginale', label: 'Nature de l’original', type: 'select', options: NATURE_LABELS },
        { name: 'numeroInventaire', label: 'Numéro d’inventaire', type: 'text' },
        { name: 'anciennesReferences', label: 'Anciennes références', type: 'refs', wide: true, hint: 'Une par ligne : système : valeur (ex. Inventaire 1978 : A-12)' }] },
    { id: 'description', label: 'Description', fields: [
        { name: 'resume', label: 'Résumé', type: 'textarea', wide: true },
        { name: 'langues', label: 'Langues', type: 'list', hint: 'Séparées par des virgules' },
        { name: 'ecritures', label: 'Écritures', type: 'list', hint: 'Séparées par des virgules' },
        { name: 'support', label: 'Support', type: 'text' },
        { name: 'materiaux', label: 'Matériaux', type: 'text' },
        { name: 'dimensions', label: 'Dimensions', type: 'text' },
        { name: 'quantite', label: 'Quantité', type: 'number' },
        { name: 'uniteQuantite', label: 'Unité de la quantité', type: 'text', hint: 'pièces, volumes, mètres linéaires…' },
        { name: 'paginationDuree', label: 'Pagination ou durée', type: 'text' },
        { name: 'technique', label: 'Technique de fabrication', type: 'text', wide: true, hint: 'Encre ferro-gallique, gravure sur bois, tissage…' },
        { name: 'periodeCulture', label: 'Période ou culture', type: 'text', wide: true },
        { name: 'inscriptions', label: 'Inscriptions et marques', type: 'textarea', wide: true, hint: 'Signatures, cachets, filigranes, marques de propriété, légendes.' },
        { name: 'titresAlternatifs', label: 'Titres alternatifs', type: 'titles', wide: true, hint: 'Un par ligne : type : titre (ex. Titre ancien : Registre des déclarations de naissance)' }] },
    { id: 'contexte', label: 'Contexte historique', fields: [
        { name: 'precisionDate', label: 'Précision de la date', type: 'select', options: PRECISION_LABELS, hint: '« Inconnue » est une réponse valable ; « non renseignée » n’en est pas une.' },
        { name: 'dateDebut', label: 'Date de début', type: 'date' },
        { name: 'dateFin', label: 'Date de fin', type: 'date' },
        { name: 'dateTexte', label: 'Date en toutes lettres', type: 'text', hint: '« vers 1930 », « entre 1925 et 1935 »' },
        { name: 'dateSource', label: 'Source de la date', type: 'textarea', wide: true, hint: 'Obligatoire pour une date estimée' },
        { name: 'attributionIncertaine', label: 'Attribution incertaine', type: 'flag' },
        { name: 'attributionSource', label: 'Source de l’attribution', type: 'textarea', wide: true },
        { name: 'bibliographie', label: 'Bibliographie', type: 'textarea', wide: true }] },
    { id: 'provenance', label: 'Provenance et responsabilité', fields: [
        { name: 'provenanceStatut', label: 'Provenance', type: 'select', options: PROVENANCE_LABELS },
        { name: 'historiqueProvenance', label: 'Historique de provenance', type: 'textarea', wide: true },
        { name: 'proprietaireStatut', label: 'Propriétaire', type: 'select', options: PROPRIETAIRE_LABELS },
        { name: 'situationJuridique', label: 'Situation juridique', type: 'select', options: JURIDIQUE_LABELS, hint: 'Un bien à situation juridique à clarifier n’est jamais diffusé.' },
        { name: 'situationJuridiqueNote', label: 'Note sur la situation juridique', type: 'textarea', wide: true },
        { name: 'droitsImage', label: 'Droits d’image et de reproduction', type: 'select', options: DROITS_IMAGE_LABELS, hint: 'À renseigner avant de diffuser une reproduction ; « non renseignés » n’est pas une réponse.' },
        { name: 'droitsImageNote', label: 'Note sur les droits d’image', type: 'textarea', wide: true }] },
    { id: 'valeur', label: 'Valeur patrimoniale', fields: [
        { name: 'valeurCriteres', label: 'Motifs de sélection', type: 'criteres', wide: true },
        { name: 'valeurAppreciation', label: 'Appréciation scientifique', type: 'textarea', wide: true },
        { name: 'valeurSources', label: 'Sources de l’appréciation', type: 'textarea', wide: true },
        { name: 'valeurAssurance', label: 'Valeur d’assurance', type: 'number', hint: 'Montant déclaré à l’assureur : distinct de l’appréciation scientifique ci-dessus.' },
        { name: 'valeurAssuranceDevise', label: 'Devise', type: 'text', hint: 'Code à trois lettres : GNF, EUR, USD…' },
        { name: 'valeurAssuranceDate', label: 'Date de l’évaluation d’assurance', type: 'date' }] }
];

export const EDITABLE_FIELDS: ReadonlyArray<FieldDef> = FIELD_GROUPS.flatMap(g => g.fields);

/** Transition de la description, du point de vue de la personne qui agit. */
export function transitionLabel(from: DescriptionStatus, to: DescriptionStatus): string {
    if (from === 'MINIMALE' && to === 'EN_REDACTION') return 'Commencer la rédaction';
    if (from === 'EN_REDACTION' && to === 'A_RELIRE') return 'Soumettre à la relecture';
    if (from === 'A_RELIRE' && to === 'VALIDEE') return 'Valider scientifiquement';
    if (from === 'A_RELIRE' && to === 'EN_REDACTION') return 'Renvoyer en rédaction';
    if (from === 'VALIDEE' && to === 'EN_REDACTION') return 'Rouvrir la description';
    return DESCRIPTION_LABELS[to] ?? to;
}

const ROMAN: Record<number, string> = { 1: 'Ier', 2: 'IIe', 3: 'IIIe', 4: 'IVe', 5: 'Ve', 6: 'VIe', 7: 'VIIe', 8: 'VIIIe', 9: 'IXe', 10: 'Xe', 11: 'XIe', 12: 'XIIe', 13: 'XIIIe', 14: 'XIVe', 15: 'XVe', 16: 'XVIe', 17: 'XVIIe', 18: 'XVIIIe', 19: 'XIXe', 20: 'XXe', 21: 'XXIe' };
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function year(iso: string | null | undefined): number | null { const y = iso ? Number(iso.slice(0, 4)) : NaN; return Number.isFinite(y) ? y : null; }

/**
 * Date d'un bien en français, sans fausse précision : la précision déclarée décide de ce qui s'affiche, et une date inconnue reste « inconnue ».
 * Le texte libre (« vers 1930 ») prime quand il existe.
 */
export function dateText(precision: string, debut: string | null | undefined, fin: string | null | undefined, texte?: string | null): string {
    if (texte && texte.trim()) return texte.trim();
    const from = year(debut); const to = year(fin);
    switch (precision) {
        case 'INCONNUE': return 'Date inconnue';
        case 'NON_RENSEIGNEE': return 'Date non renseignée';
        case 'EXACTE': {
            if (!debut) return 'Date non renseignée';
            const [y, m, d] = debut.split('-').map(Number);
            const start = (d ? d + ' ' : '') + (m ? MONTHS[m - 1] + ' ' : '') + y;
            return fin && fin !== debut ? start + ' – ' + (() => { const [y2, m2, d2] = fin.split('-').map(Number); return (d2 ? d2 + ' ' : '') + (m2 ? MONTHS[m2 - 1] + ' ' : '') + y2; })() : start;
        }
        case 'ANNEE': return from === null ? 'Année non précisée' : to !== null && to !== from ? from + ' – ' + to : String(from);
        case 'DECENNIE': return from === null ? 'Décennie non précisée' : 'années ' + Math.floor(from / 10) * 10;
        case 'SIECLE': return from === null ? 'Siècle non précisé' : (ROMAN[Math.floor((from - 1) / 100) + 1] ?? '') + ' siècle';
        case 'ESTIMEE': return from === null ? 'Date estimée' : to !== null && to !== from ? 'entre ' + from + ' et ' + to : 'vers ' + from;
        default: return '—';
    }
}

/** Valeur d'un champ comparable : texte rogné (vide = absent), listes telles quelles. */
function comparable(value: unknown): unknown {
    if (typeof value === 'string') { const t = value.trim(); return t === '' ? null : t; }
    if (Array.isArray(value)) return value;
    return value ?? null;
}

/** Champs réellement modifiés entre l'état d'origine et le brouillon (ce qui part dans la modification). */
export function changedFields(original: AssetFields, draft: AssetFields): AssetFields {
    const changes: AssetFields = {};
    // « rien », liste vide et texte vide disent la même chose : un champ absent de la fiche (serveur plus ancien) n'est pas modifié par un brouillon vide
    const empty = (v: unknown) => v === null || v === undefined || (Array.isArray(v) && v.length === 0) || (typeof v === 'string' && v.trim() === '');
    for (const [name, value] of Object.entries(draft)) {
        if (empty(original[name]) && empty(value)) continue;
        if (JSON.stringify(comparable(original[name] ?? null)) !== JSON.stringify(comparable(value))) changes[name] = comparable(value) ?? (Array.isArray(original[name]) ? [] : null);
    }
    return changes;
}

/** Liste saisie en une ligne (virgules ou retours à la ligne) : éléments rognés, sans doublon ni vide. */
export function parseList(text: string): string[] {
    return [...new Set(text.split(/[,\n;]/).map(s => s.trim()).filter(Boolean))];
}
export const listText = (value: unknown): string => Array.isArray(value) ? value.join(', ') : '';

/** Anciennes références, une par ligne « système : valeur » ; null si une ligne est mal formée. */
export function parseRefs(text: string): Array<{ systeme: string; valeur: string }> | null {
    const out: Array<{ systeme: string; valeur: string }> = [];
    for (const line of text.split('\n').map(l => l.trim()).filter(Boolean)) {
        const at = line.indexOf(':');
        if (at <= 0) return null;
        const systeme = line.slice(0, at).trim(); const valeur = line.slice(at + 1).trim();
        if (!systeme || !valeur) return null;
        out.push({ systeme, valeur });
    }
    return out;
}
export const refsText = (value: unknown): string => Array.isArray(value) ? value.map(r => { const o = r as { systeme?: string; valeur?: string }; return (o.systeme ?? '') + ' : ' + (o.valeur ?? ''); }).join('\n') : '';

/** Titres alternatifs, un par ligne « type : titre » ; null si une ligne est mal formée. Le type est libre (l'institution écrit « titre ancien », « titre usuel »…). */
export function parseTitles(text: string): Array<{ type: string; valeur: string }> | null {
    const out: Array<{ type: string; valeur: string }> = [];
    for (const line of text.split('\n').map(l => l.trim()).filter(Boolean)) {
        const at = line.indexOf(':');
        if (at <= 0) return null;
        const type = line.slice(0, at).trim(); const valeur = line.slice(at + 1).trim();
        if (!type || !valeur || type.length > 100 || valeur.length > 500) return null;
        out.push({ type, valeur });
    }
    return out;
}
export const titlesText = (value: unknown): string => Array.isArray(value) ? value.map(r => { const o = r as { type?: string; valeur?: string }; return (o.type ?? '') + ' : ' + (o.valeur ?? ''); }).join('\n') : '';

/** Une correction sur une description validée exige un motif écrit ; avant, la modification est libre. */
export const needsCorrectionMotif = (asset: Pick<HeritageAsset, 'statutDescription'>): boolean => asset.statutDescription === 'VALIDEE';

export const MOTIF_MIN = 10;
export const motifValide = (motif: string | null | undefined): boolean => (motif?.trim().length ?? 0) >= MOTIF_MIN;

/** Résumé de ce qui bloque encore, par étape. */
export function gapSummary(asset: Pick<HeritageAsset, 'lacunes'>): { relecture: number; validation: number; informations: number } {
    return {
        relecture: asset.lacunes.filter(g => g.bloque === 'RELECTURE').length,
        validation: asset.lacunes.filter(g => g.bloque === 'VALIDATION' || g.bloque === 'RELECTURE').length,
        informations: asset.lacunes.filter(g => g.bloque === null).length
    };
}

/** Texte d'une valeur de journal : liste, texte, booléen ou vide. */
export function journalValue(value: unknown): string {
    if (value === null || value === undefined || value === '') return '—';
    if (Array.isArray(value)) return value.length ? value.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(', ') : '—';
    if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}
