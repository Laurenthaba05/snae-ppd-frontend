import { countryProblem, isilCountryProblem, isilProblem } from './archivalCodes.js';

/**
 * Fiche descriptive d'une institution en tant que service d'archives (ISDIAH) : identifiant, coordonnées, ouverture, accès, services, histoire, mandat,
 * politique d'acquisition et tutelle. L'identité (code, nom, sigle, type, statut) reste celle de la gestion des identités.
 */
export interface InstitutionFicheInput {
    institutionId: string; adresse: string | null; telephone: string | null; courriel: string | null; siteWeb: string | null; horaires: string | null; accessibilite: string | null;
    services: string | null; histoire: string | null; mandat: string | null; politiqueAcquisition: string | null; tutelleInstitutionId: string | null; version?: number;
    codePays?: string | null; identifiantService?: string | null;
}
export interface InstitutionFicheView { input: InstitutionFicheInput; code: string; nom: string; sigle: string | null; tutelleNom: string | null; version: number; updatedAt: string | null }

export type FicheForm = Record<'codePays' | 'identifiantService' | 'adresse' | 'telephone' | 'courriel' | 'siteWeb' | 'horaires' | 'accessibilite' | 'services' | 'histoire' | 'mandat' | 'politiqueAcquisition', string> & { tutelleInstitutionId: string };

export interface FicheField { key: keyof FicheForm; label: string; hint?: string; kind: 'text' | 'tel' | 'email' | 'url' | 'area' | 'code' }
/** Les zones de la norme ISDIAH, dans l'ordre de lecture. */
export const FICHE_GROUPS: ReadonlyArray<{ title: string; fields: ReadonlyArray<FicheField> }> = [
    { title: 'Identification', fields: [
        { key: 'identifiantService', label: 'Identifiant du service (ISIL)', kind: 'code', hint: 'Identifiant international des bibliothèques et services d’archives (ISO 15511), par exemple GN-ANG ; il désigne ce service seul' },
        { key: 'codePays', label: 'Pays', kind: 'code', hint: 'Code ISO 3166-1 de deux lettres : GN pour la Guinée' }] },
    { title: 'Contact', fields: [
        { key: 'adresse', label: 'Adresse', kind: 'area' },
        { key: 'telephone', label: 'Téléphone', kind: 'tel', hint: 'Chiffres, espaces et + ( ) . / -' },
        { key: 'courriel', label: 'Courriel', kind: 'email' },
        { key: 'siteWeb', label: 'Site web', kind: 'url', hint: 'Adresse complète en http:// ou https://' }] },
    { title: 'Accès et services', fields: [
        { key: 'horaires', label: 'Horaires d’ouverture', kind: 'area' },
        { key: 'accessibilite', label: 'Accessibilité', kind: 'area', hint: 'Accès des personnes à mobilité réduite, transports, conditions d’entrée' },
        { key: 'services', label: 'Services aux chercheurs', kind: 'area', hint: 'Salle de lecture, reprographie, aide à la recherche' }] },
    { title: 'Contexte', fields: [
        { key: 'histoire', label: 'Histoire du service', kind: 'area' },
        { key: 'mandat', label: 'Mandat et textes constitutifs', kind: 'area', hint: 'Décrets, lois et arrêtés qui fondent le service' },
        { key: 'politiqueAcquisition', label: 'Politique d’acquisition', kind: 'area', hint: 'Ce que le service collecte et auprès de qui' }] }
];
const FIELD_KEYS = FICHE_GROUPS.flatMap(g => g.fields.map(f => f.key));

export const emptyFicheForm = (): FicheForm => ({ codePays: '', identifiantService: '', adresse: '', telephone: '', courriel: '', siteWeb: '', horaires: '', accessibilite: '', services: '', histoire: '', mandat: '', politiqueAcquisition: '', tutelleInstitutionId: '' });
export function ficheFormOf(view: Pick<InstitutionFicheView, 'input'> | null): FicheForm {
    const form = emptyFicheForm();
    if (!view) return form;
    for (const key of FIELD_KEYS) form[key] = (view.input[key as keyof InstitutionFicheInput] as string | null) ?? '';
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
    for (const p of [countryProblem(form.codePays), isilProblem(form.identifiantService), isilCountryProblem(form.codePays, form.identifiantService)]) if (p) problems.push(p);
    return problems;
}
/** Le corps envoyé : une zone vide devient absente. */
export function ficheBody(institutionId: string, form: FicheForm, version: number): InstitutionFicheInput {
    const orNull = (v: string) => v.trim() ? v : null;
    return { institutionId, codePays: orNull(form.codePays)?.trim().toUpperCase() ?? null, identifiantService: orNull(form.identifiantService)?.trim() ?? null, adresse: orNull(form.adresse), telephone: orNull(form.telephone)?.trim() ?? null, courriel: orNull(form.courriel)?.trim() ?? null, siteWeb: orNull(form.siteWeb)?.trim() ?? null,
        horaires: orNull(form.horaires), accessibilite: orNull(form.accessibilite), services: orNull(form.services), histoire: orNull(form.histoire), mandat: orNull(form.mandat),
        politiqueAcquisition: orNull(form.politiqueAcquisition), tutelleInstitutionId: form.tutelleInstitutionId || null, version };
}
/** Combien de zones sont renseignées sur le total, pour dire où en est la fiche. */
export function ficheCompleteness(view: Pick<InstitutionFicheView, 'input'> | null): { done: number; total: number } {
    const form = ficheFormOf(view);
    return { done: FIELD_KEYS.filter(k => form[k].trim()).length + (form.tutelleInstitutionId ? 1 : 0), total: FIELD_KEYS.length + 1 };
}
