/**
 * Dates à précision variable (ISO 8601), codes de langue (ISO 639), d'écriture (ISO 15924), de pays (ISO 3166-1) et identifiant de service d'archives (ISIL, ISO 15511).
 * Ces règles guident la saisie : elles reprennent la FORME que le serveur contrôle, qui reste seul juge (il vérifie en plus l'appartenance d'un code de deux lettres à la liste ISO).
 */
import { lower, upper } from './authorityRelations.js';

const DATE = /^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/;
const SEPARATOR = /\s*[+,;]\s*/;

/** Une date de description ou d'existence : AAAA, AAAA-MM ou AAAA-MM-JJ. Vide : pas de remarque. */
export function partialDateProblem(label: string, value: string | null | undefined): string | null {
    const text = value?.trim() ?? '';
    if (!text) return null;
    if (!DATE.test(text) || text.startsWith('0000')) return `${label} : date attendue au format AAAA, AAAA-MM ou AAAA-MM-JJ.`;
    if (text.length === 10) { const d = new Date(text + 'T00:00:00Z'); if (Number.isNaN(d.valueOf()) || d.toISOString().slice(0, 10) !== text) return `${label} : ce jour n’existe pas.`; }
    return null;
}

/** Le début ne dépasse pas la fin, jugé sur ce que couvre chaque date (« 1950 » couvre toute l'année). */
export function partialDateOrderProblem(start: string | null | undefined, end: string | null | undefined): string | null {
    const a = start?.trim(), b = end?.trim();
    return a && b && DATE.test(a) && DATE.test(b) && lower(a) > upper(b) ? 'La date de début dépasse la date de fin.' : null;
}

const codesProblem = (label: string, value: string | null | undefined, shape: RegExp, help: string): string | null => {
    const text = value?.trim() ?? '';
    if (!text) return null;
    return text.split(SEPARATOR).every(code => shape.test(code)) ? null : `${label} : ${help}`;
};
/** Une langue ou plusieurs, en codes de deux ou trois lettres séparés par « + » (« fr+man »). */
export const languageCodesProblem = (label: string, value: string | null | undefined) =>
    codesProblem(label, value, /^[A-Za-z]{2,3}$/, 'codes de langue ISO 639 attendus, séparés par « + » (fr, en, ff, man ; deux ou trois lettres).');
/** Une écriture ou plusieurs, en codes de quatre lettres (« Latn+Arab »). */
export const scriptCodesProblem = (label: string, value: string | null | undefined) =>
    codesProblem(label, value, /^[A-Za-z]{4}$/, 'codes d’écriture ISO 15924 attendus, séparés par « + » (Latn, Arab, Nkoo, Adlm).');

/** Des suggestions de saisie, pas une liste fermée : le serveur accepte tout code ISO. */
export const LANGUAGE_SUGGESTIONS: ReadonlyArray<{ code: string; label: string }> = [
    { code: 'fr', label: 'français' }, { code: 'en', label: 'anglais' }, { code: 'ar', label: 'arabe' }, { code: 'pt', label: 'portugais' },
    { code: 'ff', label: 'peul (pular)' }, { code: 'man', label: 'mandingue (maninka)' }, { code: 'sus', label: 'soussou' }, { code: 'kss', label: 'kissi' }, { code: 'kpe', label: 'kpellé' }];
export const SCRIPT_SUGGESTIONS: ReadonlyArray<{ code: string; label: string }> = [
    { code: 'Latn', label: 'latin' }, { code: 'Arab', label: 'arabe' }, { code: 'Nkoo', label: 'n’ko' }, { code: 'Adlm', label: 'adlam' }];

/** Pays (ISO 3166-1 alpha-2) : la forme seulement ; le serveur vérifie la liste. */
export function countryProblem(value: string | null | undefined): string | null {
    const text = value?.trim() ?? '';
    return !text || /^[A-Za-z]{2}$/.test(text) ? null : 'Pays : code ISO 3166-1 de deux lettres attendu (GN pour la Guinée).';
}
const ISIL = /^[A-Za-z]{1,4}-[A-Za-z0-9:/-]{1,11}$/;
/** Identifiant du service d'archives, de la forme d'un ISIL : « GN-ANG ». */
export function isilProblem(value: string | null | undefined): string | null {
    const text = value?.trim() ?? '';
    return !text || (text.length <= 16 && ISIL.test(text)) ? null
        : 'Identifiant du service : forme ISIL attendue (préfixe de 1 à 4 lettres, tiret, 1 à 11 caractères parmi lettres, chiffres, « : », « / » et « - » ; 16 au plus).';
}
/** Le préfixe de deux lettres d'un ISIL est le code du pays : les deux ne doivent pas se contredire. */
export function isilCountryProblem(country: string | null | undefined, isil: string | null | undefined): string | null {
    const c = country?.trim().toUpperCase(), prefix = isil?.trim().split('-')[0] ?? '';
    return c && prefix.length === 2 && prefix.toUpperCase() !== c ? `Le préfixe de l’identifiant (${prefix.toUpperCase()}) ne correspond pas au pays choisi (${c}).` : null;
}
