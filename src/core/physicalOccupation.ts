import { decimal } from './physicalConditions.js';
import type { Filling } from './physicalConditions.js';

/* Le métrage linéaire et le remplissage, par lieu ou par institution. Le serveur calcule tout à la lecture ; ici, seulement ce que l'écran en dit. Rien n'est converti : ce qui n'est pas
   écrit en mètres linéaires (boîtes, liasses) ou n'a pas de quantité est compté à part. */

export type OccupationBy = 'location' | 'institution';

export interface OccupationRow {
    key: string | null; self: boolean; label: string; type: string | null; institutionId: string | null; hasChildren: boolean;
    units: number; archives: number; metrageLineaire: number | string; sansMetrage: number;
    capaciteLineaire: number | string; unitesMesurees: number; rempliMesure: number | string; taux: number | null; unitesAutreCapacite: number;
}
export interface OccupationStep { id: string; label: string }
export interface OccupationReport { by: OccupationBy; parentId: string | null; trail: OccupationStep[]; rows: OccupationRow[]; total: OccupationRow; truncated: boolean }

export const BY_LABELS: Record<OccupationBy, string> = { location: 'Par lieu', institution: 'Par institution' };

/** « 11,5 ml » : un métrage à l'affichage, sans zéros inutiles. */
export const meters = (value: number | string | null | undefined): string => {
    const text = decimal(value, 3);
    return text === '—' ? text : text + ' ml';
};

/** Le taux de remplissage en pourcentage entier, ou un tiret quand aucune capacité n'est mesurée en mètres linéaires. */
export const rateText = (taux: number | null | undefined): string => taux === null || taux === undefined ? '—' : `${Math.round(taux * 100)} %`;

/** Où en est le lieu : sous 90 % il reste de la place, de 90 % à moins de 100 % il est presque plein, à 100 % plein, au-delà dépassé (mêmes seuils que l'unité). */
export function level(taux: number | null | undefined): Filling {
    if (taux === null || taux === undefined) return 'SANS_CAPACITE';
    if (taux > 1) return 'DEPASSEE';
    if (taux === 1) return 'PLEINE';
    return taux >= 0.9 ? 'PRESQUE_PLEINE' : 'LIBRE';
}

const plural = (n: number, one: string, many: string): string => `${n} ${n > 1 ? many : one}`;

/** Ce que le métrage ne dit pas : les archives comptées en autre chose ou sans quantité, et les unités dont la capacité n'est pas en mètres linéaires. */
export function notes(row: Pick<OccupationRow, 'sansMetrage' | 'unitesAutreCapacite'>): string[] {
    const out: string[] = [];
    if (row.sansMetrage > 0) out.push(`${plural(row.sansMetrage, 'archive', 'archives')} hors métrage (autre unité ou sans quantité)`);
    if (row.unitesAutreCapacite > 0) out.push(`${plural(row.unitesAutreCapacite, 'unité', 'unités')} sans capacité en mètres linéaires`);
    return out;
}

/** Les paramètres de la requête : le lieu ouvert n'a de sens que par lieu. */
export function params(by: OccupationBy, parentId: string | null): Record<string, string | null> {
    return by === 'institution' ? { by } : { by, parentId };
}

/** Seule la ligne d'un lieu qui a des sous-lieux peut être ouverte pour descendre d'un niveau. */
export const canOpen = (row: OccupationRow, by: OccupationBy): boolean => by === 'location' && !row.self && row.key !== null && row.hasChildren;
