import type { Json } from './types.js';

/* Capacité et conditions de conservation d'une unité de rangement. La capacité se mesure dans une unité (archives, mètres linéaires, boîtes…) et se compare à ce qui est rangé : elle signale,
   elle ne bloque pas. Les seuils de température et d'humidité se vérifient par des relevés ; sans seuil, un relevé se consigne mais ne déclenche aucune alerte. */

export type Measure = 'TEMPERATURE' | 'HUMIDITE';
export type ConditionState = 'CONFORME' | 'TROP_BAS' | 'TROP_HAUT';

export const MEASURE_LABELS: Record<Measure, string> = { TEMPERATURE: 'Température', HUMIDITE: 'Humidité relative' };
export const MEASURE_UNITS: Record<Measure, string> = { TEMPERATURE: '°C', HUMIDITE: '%' };
export const STATE_LABELS: Record<ConditionState, string> = { CONFORME: 'Dans les seuils', TROP_BAS: 'Trop bas', TROP_HAUT: 'Trop haut' };
/** Les bornes qu'un seuil ou un relevé peut prendre, comme le serveur les contrôle. */
export const MEASURE_RANGE: Record<Measure, [number, number]> = { TEMPERATURE: [-60, 100], HUMIDITE: [0, 100] };

export interface UnitOccupation { utilise: number | string; unite: string; taux: number | null; nonCompte: number }
export interface LastReading { mesure: Measure; valeur: number | string; releveLe: string; etat: ConditionState }
export interface Reading { id: string; uniteStockageId: string; mesure: Measure; valeur: number | string; releveLe: string; relevePar: string | null; note: string | null; etat: ConditionState }
export interface ConditionAlert {
    unite: { unitId: string; cote: string; typeUnite: string; localisation: string[]; actif: boolean };
    mesure: Measure; valeur: number | string; releveLe: string; etat: ConditionState; min: number | string | null; max: number | string | null;
}

const num = (value: number | string | null | undefined): number | null => {
    if (value === null || value === undefined || value === '') return null;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : null;
};

/** Un nombre à l'affichage : sans zéros inutiles, avec la virgule française (« 3,5 »). */
export const decimal = (value: number | string | null | undefined, digits = 2): string => {
    const n = num(value);
    return n === null ? '—' : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits }).format(n);
};

/** « 12 / 40 boîtes (30 %) », ou « 12 archives » quand aucune capacité n'est fixée. */
export function occupationText(o: UnitOccupation | null | undefined, capacite: number | string | null | undefined): string {
    if (!o) return '—';
    const cap = num(capacite);
    if (cap === null) return `${decimal(o.utilise)} ${o.unite}`;
    return `${decimal(o.utilise)} / ${decimal(cap)} ${o.unite}` + (o.taux === null ? '' : ` (${Math.round(o.taux * 100)} %)`);
}

export type Filling = 'LIBRE' | 'PRESQUE_PLEINE' | 'PLEINE' | 'DEPASSEE' | 'SANS_CAPACITE';
/** Où en est l'unité : sous 90 % elle est libre, de 90 % à moins de 100 % presque pleine, à 100 % pleine, au-delà dépassée. */
export function filling(o: UnitOccupation | null | undefined): Filling {
    if (!o || o.taux === null) return 'SANS_CAPACITE';
    if (o.taux > 1) return 'DEPASSEE';
    if (o.taux === 1) return 'PLEINE';
    return o.taux >= 0.9 ? 'PRESQUE_PLEINE' : 'LIBRE';
}
export const FILLING_LABELS: Record<Filling, string> = { LIBRE: 'Place disponible', PRESQUE_PLEINE: 'Presque pleine', PLEINE: 'Pleine', DEPASSEE: 'Capacité dépassée', SANS_CAPACITE: 'Capacité non fixée' };

// ---------------------------------------------------------------------------------------------------- les réglages d'une unité

export interface SettingsForm {
    capacite: string; uniteCapacite: string;
    temperatureMin: string; temperatureMax: string; humiditeMin: string; humiditeMax: string;
}

/** Les seuils lisibles d'un champ de conditions (le reste du champ libre n'est pas touché par l'écran). */
export function thresholdsOf(conditions: Json | null | undefined): Record<Measure, { min: number | null; max: number | null }> {
    const read = (key: string) => {
        const node = conditions && typeof conditions === 'object' && !Array.isArray(conditions) ? (conditions as Record<string, Json>)[key] : null;
        const obj = node && typeof node === 'object' && !Array.isArray(node) ? node as Record<string, Json> : {};
        return { min: num(obj.min as number | string | null | undefined), max: num(obj.max as number | string | null | undefined) };
    };
    return { TEMPERATURE: read('temperature'), HUMIDITE: read('humidite') };
}

export function settingsForm(unit: { capacite: number | string | null; uniteCapacite?: string | null; conditionsConservation: Json | null }): SettingsForm {
    const t = thresholdsOf(unit.conditionsConservation);
    const text = (n: number | null) => n === null ? '' : String(n);
    return { capacite: text(num(unit.capacite)), uniteCapacite: unit.uniteCapacite ?? '', temperatureMin: text(t.TEMPERATURE.min), temperatureMax: text(t.TEMPERATURE.max), humiditeMin: text(t.HUMIDITE.min), humiditeMax: text(t.HUMIDITE.max) };
}

/** « de température », « d’humidité relative » : l'élision que le français demande. */
const of = (label: string): string => /^[aeiouyéèêh]/i.test(label) ? 'd’' + label : 'de ' + label;

const parse = (text: string): number | null | 'BAD' => {
    const clean = text.trim().replace(',', '.');
    if (clean === '') return null;
    return /^-?\d+(\.\d+)?$/.test(clean) ? Number(clean) : 'BAD';
};

/** Ce qui empêche d'enregistrer les réglages, en phrases ; liste vide quand tout va bien. */
export function settingsProblems(f: SettingsForm): string[] {
    const problems: string[] = [];
    const cap = parse(f.capacite);
    if (cap === 'BAD' || (typeof cap === 'number' && cap < 0)) problems.push('La capacité est un nombre positif.');
    if (f.uniteCapacite.trim() && (cap === null || cap === 'BAD')) problems.push('Indiquez la capacité, ou retirez son unité.');
    for (const [measure, min, max] of [['TEMPERATURE', f.temperatureMin, f.temperatureMax], ['HUMIDITE', f.humiditeMin, f.humiditeMax]] as const) {
        const a = parse(min), b = parse(max);
        const label = MEASURE_LABELS[measure].toLowerCase();
        if (a === 'BAD' || b === 'BAD') { problems.push(`Les seuils ${of(label)} sont des nombres.`); continue; }
        const [low, high] = MEASURE_RANGE[measure];
        for (const bound of [a, b]) if (bound !== null && (bound < low || bound > high)) { problems.push(`Un seuil ${of(label)} est entre ${low} et ${high} ${MEASURE_UNITS[measure]}.`); break; }
        if (a !== null && b !== null && a > b) problems.push(`Le minimum ${of(label)} ne dépasse pas son maximum.`);
    }
    return problems;
}

/**
 * Le champ de conditions à envoyer : les clés libres déjà là sont conservées, les seuils de température et d'humidité sont remplacés par ce qui est saisi (une mesure sans seuil est retirée).
 * Rien du tout : null.
 */
export function conditionsBody(f: SettingsForm, current: Json | null | undefined): Json | null {
    const base: Record<string, Json> = current && typeof current === 'object' && !Array.isArray(current) ? { ...(current as Record<string, Json>) } : {};
    delete base.temperature; delete base.humidite;
    const bounds = (min: string, max: string): Record<string, Json> | null => {
        const a = parse(min), b = parse(max);
        const out: Record<string, Json> = {};
        if (typeof a === 'number') out.min = a;
        if (typeof b === 'number') out.max = b;
        return Object.keys(out).length ? out : null;
    };
    const t = bounds(f.temperatureMin, f.temperatureMax), h = bounds(f.humiditeMin, f.humiditeMax);
    if (t) base.temperature = t;
    if (h) base.humidite = h;
    return Object.keys(base).length ? base : null;
}

export function settingsBody(f: SettingsForm, versionLock: number, current: Json | null | undefined): Record<string, unknown> {
    const cap = parse(f.capacite);
    return { versionLock, capacite: typeof cap === 'number' ? cap : null, uniteCapacite: f.uniteCapacite.trim() || null, conditionsConservation: conditionsBody(f, current) };
}

// ---------------------------------------------------------------------------------------------------- les relevés

export interface ReadingForm { mesure: Measure; valeur: string; note: string }
export const emptyReading = (): ReadingForm => ({ mesure: 'TEMPERATURE', valeur: '', note: '' });

export function readingProblem(f: ReadingForm): string | null {
    const value = parse(f.valeur);
    if (value === null) return 'Indiquez la valeur relevée.';
    if (value === 'BAD') return 'La valeur relevée est un nombre.';
    const [low, high] = MEASURE_RANGE[f.mesure];
    return value < low || value > high ? `${MEASURE_LABELS[f.mesure]} : une valeur entre ${low} et ${high} ${MEASURE_UNITS[f.mesure]} est attendue.` : null;
}

export function readingBody(f: ReadingForm): Record<string, unknown> {
    return { mesure: f.mesure, valeur: parse(f.valeur), note: f.note.trim() || null };
}

/** « 24,5 °C · 22 octobre 2026 » */
export function readingText(r: Pick<LastReading, 'mesure' | 'valeur' | 'releveLe'>, formatDay: (iso: string) => string): string {
    return `${decimal(r.valeur)} ${MEASURE_UNITS[r.mesure]} · ${formatDay(r.releveLe)}`;
}
