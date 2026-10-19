import { countryProblem, isilCountryProblem, isilProblem, languageCodesProblem, scriptCodesProblem } from './archivalCodes.js';

/**
 * Fiche descriptive d'une institution en tant que service d'archives (ISDIAH), zone par zone : identification, contact, description, accès et services, contrôle de la fiche.
 * L'identité (code, nom, sigle, type, statut) reste celle de la gestion des identités.
 */
export interface InstitutionFicheInput {
    institutionId: string; adresse: string | null; telephone: string | null; courriel: string | null; siteWeb: string | null; horaires: string | null; accessibilite: string | null;
    services: string | null; histoire: string | null; mandat: string | null; politiqueAcquisition: string | null; tutelleInstitutionId: string | null; version?: number;
    codePays?: string | null; identifiantService?: string | null; formesParalleles?: string | null; autresFormes?: string | null; contexteGeoculturel?: string | null; structure?: string | null;
    batiments?: string | null; fondsDetenus?: string | null; instrumentsRecherche?: string | null; conditionsAcces?: string | null; reproduction?: string | null; espacesPublics?: string | null;
    statut?: string | null; niveauDetail?: string | null; regles?: string | null; langues?: string | null; ecritures?: string | null; sources?: string | null; notesMaintenance?: string | null;
}
/** `createdAt` : la date de première saisie (ISDIAH 5.6.6) ; la date de révision est `updatedAt`. */
export interface InstitutionFicheView { input: InstitutionFicheInput; code: string; nom: string; sigle: string | null; tutelleNom: string | null; version: number; updatedAt: string | null; createdAt?: string | null }

export const FICHE_STATUS_LABELS: Readonly<Record<string, string>> = { BROUILLON: 'Brouillon', A_RELIRE: 'À relire', VALIDEE: 'Validée' };
export const FICHE_DETAIL_LABELS: Readonly<Record<string, string>> = { MINIMAL: 'Minimal', PARTIEL: 'Partiel', COMPLET: 'Complet' };

type TextKey = 'codePays' | 'identifiantService' | 'formesParalleles' | 'autresFormes' | 'adresse' | 'telephone' | 'courriel' | 'siteWeb' | 'histoire' | 'contexteGeoculturel' | 'mandat' | 'structure'
    | 'politiqueAcquisition' | 'batiments' | 'fondsDetenus' | 'instrumentsRecherche' | 'horaires' | 'conditionsAcces' | 'accessibilite' | 'services' | 'reproduction' | 'espacesPublics'
    | 'statut' | 'niveauDetail' | 'regles' | 'langues' | 'ecritures' | 'sources' | 'notesMaintenance';
export type FicheForm = Record<TextKey, string> & { tutelleInstitutionId: string };

export interface FicheField { key: keyof FicheForm; label: string; hint?: string; kind: 'text' | 'tel' | 'email' | 'url' | 'area' | 'code' | 'status' | 'detail' }
/** Les zones de la norme ISDIAH, dans l'ordre de lecture. */
export const FICHE_GROUPS: ReadonlyArray<{ title: string; fields: ReadonlyArray<FicheField> }> = [
    { title: 'Identification', fields: [
        { key: 'identifiantService', label: 'Identifiant du service (ISIL)', kind: 'code', hint: 'Identifiant international des bibliothèques et services d’archives (ISO 15511), par exemple GN-ANG ; il désigne ce service seul' },
        { key: 'codePays', label: 'Pays', kind: 'code', hint: 'Code ISO 3166-1 de deux lettres : GN pour la Guinée' },
        { key: 'formesParalleles', label: 'Formes parallèles du nom', kind: 'area', hint: 'Le nom du service dans une autre langue, une par ligne' },
        { key: 'autresFormes', label: 'Autres formes du nom', kind: 'area', hint: 'Sigles, anciennes appellations, une par ligne' }] },
    { title: 'Contact', fields: [
        { key: 'adresse', label: 'Adresse', kind: 'area' },
        { key: 'telephone', label: 'Téléphone', kind: 'tel', hint: 'Chiffres, espaces et + ( ) . / -' },
        { key: 'courriel', label: 'Courriel', kind: 'email' },
        { key: 'siteWeb', label: 'Site web', kind: 'url', hint: 'Adresse complète en http:// ou https://' }] },
    { title: 'Description du service', fields: [
        { key: 'histoire', label: 'Histoire du service', kind: 'area' },
        { key: 'contexteGeoculturel', label: 'Contexte géographique et culturel', kind: 'area' },
        { key: 'mandat', label: 'Mandat et textes constitutifs', kind: 'area', hint: 'Décrets, lois et arrêtés qui fondent le service' },
        { key: 'structure', label: 'Structure administrative', kind: 'area', hint: 'Directions, services, organigramme' },
        { key: 'politiqueAcquisition', label: 'Politique d’acquisition', kind: 'area', hint: 'Ce que le service collecte et auprès de qui' },
        { key: 'batiments', label: 'Bâtiments', kind: 'area', hint: 'Locaux, magasins, capacité' },
        { key: 'fondsDetenus', label: 'Fonds détenus', kind: 'area', hint: 'Les grands ensembles conservés' },
        { key: 'instrumentsRecherche', label: 'Instruments de recherche, guides et publications', kind: 'area' }] },
    { title: 'Accès et services', fields: [
        { key: 'horaires', label: 'Horaires d’ouverture', kind: 'area' },
        { key: 'conditionsAcces', label: 'Conditions d’accès et d’utilisation', kind: 'area', hint: 'Carte de lecteur, pièces à fournir, règlement' },
        { key: 'accessibilite', label: 'Accessibilité', kind: 'area', hint: 'Accès des personnes à mobilité réduite, transports, conditions d’entrée' },
        { key: 'services', label: 'Services aux chercheurs', kind: 'area', hint: 'Salle de lecture, aide à la recherche' },
        { key: 'reproduction', label: 'Reproduction', kind: 'area', hint: 'Photocopie, numérisation, tarifs' },
        { key: 'espacesPublics', label: 'Espaces publics', kind: 'area', hint: 'Salle de lecture, salle d’exposition, auditorium' }] },
    { title: 'Contrôle de la fiche', fields: [
        { key: 'statut', label: 'État de rédaction', kind: 'status', hint: 'Une fiche validée exige l’identifiant du service, l’adresse et les horaires' },
        { key: 'niveauDetail', label: 'Niveau de détail', kind: 'detail' },
        { key: 'regles', label: 'Règles ou conventions appliquées', kind: 'area' },
        { key: 'langues', label: 'Langues de la fiche', kind: 'code', hint: 'Codes ISO 639 séparés par + : fr, en' },
        { key: 'ecritures', label: 'Écritures de la fiche', kind: 'code', hint: 'Codes ISO 15924 séparés par + : Latn' },
        { key: 'sources', label: 'Sources', kind: 'area' },
        { key: 'notesMaintenance', label: 'Notes de mise à jour', kind: 'area' }] }
];
const FIELD_KEYS = FICHE_GROUPS.flatMap(g => g.fields.map(f => f.key)) as ReadonlyArray<TextKey>;
const MAX_LENGTH: Partial<Record<TextKey, number>> = { codePays: 2, identifiantService: 16, langues: 60, ecritures: 60 };
/** La longueur maximale d'une saisie courte (zones de code, téléphone, courriel, adresse web) ; les zones de texte ont leur propre limite. */
export function ficheMaxLength(field: FicheField): number { return MAX_LENGTH[field.key as TextKey] ?? (field.kind === 'url' ? 300 : field.kind === 'email' ? 200 : 60); }

export const emptyFicheForm = (): FicheForm => ({ ...(Object.fromEntries(FIELD_KEYS.map(k => [k, ''])) as Record<TextKey, string>), tutelleInstitutionId: '' });
export function ficheFormOf(view: Pick<InstitutionFicheView, 'input'> | null): FicheForm {
    const form = emptyFicheForm();
    if (!view) return form;
    for (const key of FIELD_KEYS) form[key] = (view.input[key as keyof InstitutionFicheInput] as string | null | undefined) ?? '';
    form.tutelleInstitutionId = view.input.tutelleInstitutionId ?? '';
    return form;
}

const PHONE = /^[0-9+() ./-]{3,60}$/, MAIL = /^[^\s@]{1,100}@[^\s@]{1,100}\.[^\s@]{2,40}$/, URL_ = /^https?:\/\/[^\s<>"]{3,290}$/;
/** Contrôles avant l'envoi : mêmes règles que le serveur, qui reste seul juge. */
export function ficheProblems(form: FicheForm): string[] {
    const problems: string[] = [];
    for (const f of FICHE_GROUPS.flatMap(g => g.fields)) if (f.kind === 'area' && form[f.key].length > 10000) problems.push(`${f.label} : 10 000 caractères au plus.`);
    const phone = form.telephone.trim(), mail = form.courriel.trim(), site = form.siteWeb.trim();
    if (phone && !PHONE.test(phone)) problems.push('Téléphone : chiffres, espaces et + ( ) . / - seulement (3 à 60 caractères).');
    if (mail && (mail.length > 200 || !MAIL.test(mail))) problems.push('Courriel : adresse invalide.');
    if (site && !URL_.test(site)) problems.push('Site web : adresse en http:// ou https:// attendue.');
    for (const p of [countryProblem(form.codePays), isilProblem(form.identifiantService), isilCountryProblem(form.codePays, form.identifiantService),
        languageCodesProblem('Langues de la fiche', form.langues), scriptCodesProblem('Écritures de la fiche', form.ecritures)]) if (p) problems.push(p);
    if (form.statut === 'VALIDEE') {
        const missing = [!form.identifiantService.trim() && 'identifiant du service', !form.adresse.trim() && 'adresse', !form.horaires.trim() && 'horaires d’ouverture'].filter(Boolean);
        if (missing.length) problems.push(`Une fiche validée exige : ${missing.join(', ')}.`);
    }
    return problems;
}
/** Le corps envoyé : une zone vide devient absente, les codes sont mis en forme. */
export function ficheBody(institutionId: string, form: FicheForm, version: number): InstitutionFicheInput {
    const orNull = (v: string) => v.trim() ? v : null;
    const short = (v: string) => orNull(v)?.trim() ?? null;
    return { institutionId, codePays: short(form.codePays)?.toUpperCase() ?? null, identifiantService: short(form.identifiantService), formesParalleles: orNull(form.formesParalleles), autresFormes: orNull(form.autresFormes),
        adresse: orNull(form.adresse), telephone: short(form.telephone), courriel: short(form.courriel), siteWeb: short(form.siteWeb),
        histoire: orNull(form.histoire), contexteGeoculturel: orNull(form.contexteGeoculturel), mandat: orNull(form.mandat), structure: orNull(form.structure), politiqueAcquisition: orNull(form.politiqueAcquisition),
        batiments: orNull(form.batiments), fondsDetenus: orNull(form.fondsDetenus), instrumentsRecherche: orNull(form.instrumentsRecherche),
        horaires: orNull(form.horaires), conditionsAcces: orNull(form.conditionsAcces), accessibilite: orNull(form.accessibilite), services: orNull(form.services), reproduction: orNull(form.reproduction), espacesPublics: orNull(form.espacesPublics),
        statut: short(form.statut), niveauDetail: short(form.niveauDetail), regles: orNull(form.regles), langues: short(form.langues), ecritures: short(form.ecritures), sources: orNull(form.sources), notesMaintenance: orNull(form.notesMaintenance),
        tutelleInstitutionId: form.tutelleInstitutionId || null, version };
}
/** Combien de zones sont renseignées sur le total, pour dire où en est la fiche. */
export function ficheCompleteness(view: Pick<InstitutionFicheView, 'input'> | null): { done: number; total: number } {
    const form = ficheFormOf(view);
    return { done: FIELD_KEYS.filter(k => form[k].trim()).length + (form.tutelleInstitutionId ? 1 : 0), total: FIELD_KEYS.length + 1 };
}
/** La valeur d'une zone à l'affichage : l'état et le niveau de détail en toutes lettres, le reste tel quel. */
export function ficheDisplay(field: FicheField, value: string): string {
    return field.kind === 'status' ? FICHE_STATUS_LABELS[value] ?? value : field.kind === 'detail' ? FICHE_DETAIL_LABELS[value] ?? value : value;
}
