import type { ArchivePlacement, CurrentSource, Localisation, PlacementEvent, PlacementGap, PresenceResult, StoragePlace, StorageUnit } from './types.js';
import { MOTIF_MIN, motifValide } from './heritageAssets.js';

/* Emplacement d'une archive physique : habituel (là où elle est rangée), actuel (là où elle est vraiment) et dernière présence vérifiée.
   On constate, on ne devine pas : sans constat depuis le dernier déplacement, l'emplacement habituel est présumé et l'écart « non vérifiée » le dit. */

export const PRESENCE_LABELS: Record<PresenceResult, string> = { PRESENTE: 'Présente à son emplacement habituel', AUTRE_EMPLACEMENT: 'Trouvée à un autre emplacement', ABSENTE: 'Introuvable' };
export const PRESENCE_SHORT: Record<PresenceResult, string> = { PRESENTE: 'Présente', AUTRE_EMPLACEMENT: 'Trouvée ailleurs', ABSENTE: 'Introuvable' };
export const PRESENCE_HINTS: Record<PresenceResult, string> = {
    PRESENTE: 'L’archive est là où elle doit être.',
    AUTRE_EMPLACEMENT: 'L’archive existe mais n’est pas à son emplacement habituel : indiquez où elle a été trouvée.',
    ABSENTE: 'L’archive n’a été trouvée nulle part : indiquez où elle a été cherchée.'
};
export const CURRENT_LABELS: Record<CurrentSource, string> = { HABITUEL: 'À son emplacement habituel', EN_SORTIE: 'Sortie de réserve', CONSTATE_AILLEURS: 'Constatée à un autre emplacement', INTROUVABLE: 'Introuvable' };
export const GAP_LABELS: Record<PlacementGap, string> = {
    INTROUVABLE: 'Introuvable', AUTRE_EMPLACEMENT: 'Trouvée ailleurs', SORTIE_EN_RETARD: 'Sortie en retard', NON_VERIFIEE: 'Présence non vérifiée', VERIFICATION_ANCIENNE: 'Vérification ancienne'
};
/** Ce que chaque écart demande de faire. */
export const GAP_NEXT_STEPS: Record<PlacementGap, string> = {
    INTROUVABLE: 'Poursuivre les recherches ; si elle est retrouvée, constater sa présence.',
    AUTRE_EMPLACEMENT: 'La ranger à son emplacement habituel puis constater sa présence, ou faire de cet emplacement son emplacement habituel.',
    SORTIE_EN_RETARD: 'Relancer la personne qui l’a sortie, puis enregistrer son retour.',
    NON_VERIFIEE: 'Aller voir l’archive et constater sa présence.',
    VERIFICATION_ANCIENNE: 'Revérifier sa présence.'
};
export const EVENT_LABELS: Record<PlacementEvent['genre'], string> = { VERIFICATION: 'Constat de présence', SORTIE: 'Sortie', RETOUR: 'Retour', RANGEMENT: 'Rangement' };

export const gapLabel = (gap: string): string => GAP_LABELS[gap as PlacementGap] ?? gap;
const SEVERITY: PlacementGap[] = ['INTROUVABLE', 'AUTRE_EMPLACEMENT', 'SORTIE_EN_RETARD', 'NON_VERIFIEE', 'VERIFICATION_ANCIENNE'];
/** L'écart le plus grave d'une liste, ou null. */
export const worstGap = (gaps: readonly PlacementGap[]): PlacementGap | null => SEVERITY.find(g => gaps.includes(g)) ?? null;
export const gapTone = (gap: PlacementGap | null): 'bad' | 'warn' | '' => gap === 'INTROUVABLE' ? 'bad' : gap === 'AUTRE_EMPLACEMENT' || gap === 'SORTIE_EN_RETARD' ? 'warn' : '';

/** « Magasin 1 › Travée 4 · B-3 » : le chemin des localisations puis la cote de l'unité. */
export function placeText(place: Pick<StoragePlace, 'cote' | 'localisation'> | null | undefined): string {
    if (!place) return '—';
    return (place.localisation.length ? place.localisation.join(' › ') + ' · ' : '') + place.cote;
}

const DAY = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
export function dayText(iso: string | null | undefined): string {
    if (!iso) return '—';
    const date = new Date(iso);
    return Number.isNaN(date.valueOf()) ? '—' : DAY.format(date);
}

/** Ancienneté d'un constat, en toutes lettres : « aujourd'hui », « il y a 3 jours », « il y a 14 mois ». */
export function ageText(days: number | null | undefined): string {
    if (days === null || days === undefined || days < 0) return '—';
    if (days === 0) return 'aujourd’hui';
    if (days === 1) return 'hier';
    if (days < 60) return `il y a ${days} jours`;
    if (days < 730) return `il y a ${Math.floor(days / 30)} mois`;
    return `il y a ${Math.floor(days / 365)} ans`;
}

/** Une phrase qui dit où est l'archive et sur quoi on le fonde. */
export function placementSummary(p: Pick<ArchivePlacement, 'actuel' | 'derniereVerification' | 'ageVerificationJours' | 'ecarts'>): string {
    const current = p.actuel;
    switch (current.source) {
        case 'EN_SORTIE':
            return 'Sortie de réserve' + (current.destination ? ' vers ' + placeText(current.destination) : '') + (current.retourPrevu ? ', retour prévu le ' + dayText(current.retourPrevu) : '') + '.';
        case 'CONSTATE_AILLEURS':
            return 'Constatée ' + ageText(p.ageVerificationJours) + ' à un autre emplacement : ' + placeText(current.unite) + '.';
        case 'INTROUVABLE':
            return 'Déclarée introuvable ' + ageText(p.ageVerificationJours) + '.';
        default: {
            if (p.ecarts.includes('NON_VERIFIEE'))
                return p.derniereVerification ? 'Présumée à son emplacement habituel : sa présence n’a pas été vérifiée depuis son dernier déplacement.' : 'Présumée à son emplacement habituel : sa présence n’a jamais été vérifiée.';
            return 'À son emplacement habituel, présence vérifiée ' + ageText(p.ageVerificationJours) + '.';
        }
    }
}

/** Un événement de l'historique, en une ligne. */
export function eventSummary(e: PlacementEvent): string {
    switch (e.genre) {
        case 'VERIFICATION': return (e.resultat ? PRESENCE_SHORT[e.resultat] : 'Constat') + (e.resultat === 'AUTRE_EMPLACEMENT' && e.vers ? ' : ' + placeText(e.vers) : '');
        case 'RANGEMENT': return 'De ' + placeText(e.de) + ' vers ' + placeText(e.vers);
        case 'SORTIE': return e.vers ? 'Sortie vers ' + placeText(e.vers) : 'Sortie de réserve';
        default: return e.vers ? 'Retour, rangée à ' + placeText(e.vers) : 'Retour en réserve';
    }
}

// ---------- constat de présence

export interface VerifyForm { resultat: PresenceResult | ''; uniteConstateeId: string; note: string }
export const emptyVerifyForm = (): VerifyForm => ({ resultat: '', uniteConstateeId: '', note: '' });

/** Contrôles avant l'envoi, pour guider : le serveur refait les mêmes contrôles et reste seul juge. */
export function verifyProblems(form: VerifyForm, habitualUnitId: string): string[] {
    const problems: string[] = [];
    if (!form.resultat) return ['Indiquez ce que vous avez constaté : présente, trouvée ailleurs ou introuvable.'];
    if (form.resultat === 'AUTRE_EMPLACEMENT') {
        if (!form.uniteConstateeId) problems.push('Indiquez l’emplacement où l’archive a été trouvée.');
        else if (form.uniteConstateeId === habitualUnitId) problems.push('C’est l’emplacement habituel : choisissez « présente ».');
    }
    if (form.resultat === 'ABSENTE' && form.note.trim().length < MOTIF_MIN) problems.push(`Dire qu’une archive est introuvable engage : indiquez où elle a été cherchée (au moins ${MOTIF_MIN} caractères).`);
    return problems;
}

export function verifyBody(form: VerifyForm): Record<string, unknown> {
    const body: Record<string, unknown> = { resultat: form.resultat };
    if (form.resultat === 'AUTRE_EMPLACEMENT') body.uniteConstateeId = form.uniteConstateeId;
    if (form.note.trim()) body.note = form.note.trim();
    return body;
}

// ---------- rangement : changement de l'emplacement habituel

export interface RelocateForm { uniteStockageId: string; motif: string; constaterPresence: boolean }
export const emptyRelocateForm = (suggestedUnitId = ''): RelocateForm => ({ uniteStockageId: suggestedUnitId, motif: '', constaterPresence: true });

export function relocateProblems(form: RelocateForm, habitualUnitId: string): string[] {
    const problems: string[] = [];
    if (!form.uniteStockageId) problems.push('Indiquez le nouvel emplacement habituel.');
    else if (form.uniteStockageId === habitualUnitId) problems.push('Ce bien est déjà rangé à cet emplacement.');
    if (!motifValide(form.motif)) problems.push(`Un motif écrit d’au moins ${MOTIF_MIN} caractères est exigé (réorganisation, régularisation d’un constat…).`);
    return problems;
}

export const relocateBody = (form: RelocateForm): Record<string, unknown> => ({ uniteStockageId: form.uniteStockageId, motif: form.motif.trim(), constaterPresence: form.constaterPresence });

// ---------- choix d'un emplacement

export interface UnitOption { id: string; label: string }

/** Chemin d'une localisation, de la plus large à la plus fine (protégé contre une boucle). */
export function locationPath(locationId: string, byId: ReadonlyMap<string, Pick<Localisation, 'id' | 'parentId' | 'libelle'>>): string[] {
    const path: string[] = [];
    let current = byId.get(locationId);
    for (let depth = 0; current && depth < 20; depth++) { path.unshift(current.libelle); current = current.parentId ? byId.get(current.parentId) : undefined; }
    return path;
}

/** Les unités de stockage proposables, étiquetées par leur chemin ; les unités inactives et celles à exclure sont écartées. */
export function unitOptions(units: readonly StorageUnit[], locations: readonly Localisation[], exclude: readonly string[] = []): UnitOption[] {
    const byId = new Map(locations.map(l => [l.id, l] as const));
    return units.filter(u => u.statut === 'ACTIVE' && !exclude.includes(u.id))
        .map(u => ({ id: u.id, label: placeText({ cote: u.cote, localisation: locationPath(u.localisationId, byId) }) }))
        .sort((a, b) => a.label.localeCompare(b.label, 'fr'));
}
