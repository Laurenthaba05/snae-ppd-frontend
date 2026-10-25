import type { CurrentPlace, PlacementGap, StoragePlace } from './types.js';
import { placeText, dayText } from './placement.js';

/* Retrouver une archive physique : ce que l'on en sait (un mot du titre, un bout de cote, le lieu, le service) plutôt que l'endroit où l'on pense qu'elle est.
   Les mots sont cherchés par le serveur sans tenir compte des accents ni des majuscules ; chacun doit se retrouver quelque part. */

/** Les critères d'une recherche, tels qu'ils sont saisis. Tout est facultatif. */
export interface ArchiveSearchCriteria {
    q: string;
    locationId: string;
    support: string;
    etatPhysique: string;
    institutionId: string;
    departmentId: string;
    from: string;
    to: string;
    /** « oui » : seulement les archives sorties ; « non » : seulement les autres ; vide : toutes. */
    out: '' | 'oui' | 'non';
    /** « oui » : seulement celles qui ont un document numérique relié ; « non » : seulement les autres. */
    linked: '' | 'oui' | 'non';
    includeDestroyed: boolean;
}

export const emptyCriteria = (): ArchiveSearchCriteria => ({ q: '', locationId: '', support: '', etatPhysique: '', institutionId: '', departmentId: '', from: '', to: '', out: '', linked: '', includeDestroyed: false });

/** Une archive trouvée : sa description, son lieu habituel (chemin complet), où elle est maintenant et ce qui cloche. */
export interface ArchiveFound {
    id: string;
    cote: string;
    intitule: string | null;
    description: string | null;
    support: string | null;
    etatPhysique: string | null;
    dateExtremeDebut: string | null;
    dateExtremeFin: string | null;
    quantite: string | null;
    uniteQuantite: string | null;
    documentId: string | null;
    institutionId: string | null;
    departmentId: string | null;
    detruite: boolean;
    habituel: StoragePlace;
    actuel: CurrentPlace;
    ecarts: PlacementGap[];
}

const yesNo = (value: '' | 'oui' | 'non'): string | undefined => value === 'oui' ? 'true' : value === 'non' ? 'false' : undefined;

/** Les paramètres de la requête : les critères vides n'y sont pas, les espaces autour d'un texte non plus. */
export function searchParams(c: ArchiveSearchCriteria, page: number, size: number): Record<string, string | number | undefined> {
    const text = (value: string): string | undefined => value.trim() || undefined;
    return {
        q: text(c.q), locationId: text(c.locationId), support: text(c.support), etatPhysique: text(c.etatPhysique),
        institutionId: text(c.institutionId), departmentId: text(c.departmentId), from: text(c.from), to: text(c.to),
        out: yesNo(c.out), linked: yesNo(c.linked), includeDestroyed: c.includeDestroyed ? 'true' : undefined,
        page: page || undefined, size,
    };
}

/** Combien de filtres, hors le texte, sont posés : le bouton « Affiner » le dit pour qu'on n'oublie pas un filtre caché. */
export function filterCount(c: ArchiveSearchCriteria): number {
    return [c.locationId, c.support, c.etatPhysique, c.institutionId, c.departmentId, c.from, c.to, c.out, c.linked].filter(v => v.trim() !== '').length + (c.includeDestroyed ? 1 : 0);
}

/** Vrai si rien n'est posé : la liste est alors celle de toutes les archives, par cote. */
export const isBlank = (c: ArchiveSearchCriteria): boolean => c.q.trim() === '' && filterCount(c) === 0;

/** Une période doit se suivre ; sinon le serveur la refuserait. */
export function periodProblem(c: Pick<ArchiveSearchCriteria, 'from' | 'to'>): string | null {
    return c.from && c.to && c.to < c.from ? 'La date de fin de la période doit suivre sa date de début.' : null;
}

/** « 1954 – 1958 », « 1954 », ou rien : les années seulement, comme on les lit sur une étiquette. */
export function extremeYears(a: Pick<ArchiveFound, 'dateExtremeDebut' | 'dateExtremeFin'>): string {
    const year = (iso: string | null): string => iso ? iso.slice(0, 4) : '';
    const from = year(a.dateExtremeDebut), to = year(a.dateExtremeFin);
    if (from && to) return from === to ? from : from + ' – ' + to;
    return from || to || '—';
}

/** Le chemin complet de l'emplacement habituel : « Site › Bâtiment › Salle 3 › Rayonnage B · BOITE-14 ». */
export const foundPlace = (a: Pick<ArchiveFound, 'habituel'>): string => placeText(a.habituel);

/** `badge` est la valeur du badge de l'écran (il a une couleur pour chacune) ; `tone` sert aux lignes et aux tests. */
export interface FoundState { tone: 'bad' | 'warn' | ''; badge: 'DETRUITE' | 'SORTIE' | 'SORTIE_EN_RETARD' | 'INTROUVABLE' | 'AUTRE_EMPLACEMENT'; label: string; detail: string }

/**
 * Ce qu'il faut savoir avant d'aller chercher l'archive : détruite, sortie, introuvable, trouvée ailleurs. Une archive à sa place ne dit rien de plus
 * (le détail de la dernière vérification est sur sa fiche).
 */
export function foundState(a: Pick<ArchiveFound, 'detruite' | 'actuel' | 'ecarts'>): FoundState | null {
    if (a.detruite) return { tone: 'bad', badge: 'DETRUITE', label: 'Détruite', detail: 'Cette archive a été détruite : elle ne se trouve plus en rayon.' };
    switch (a.actuel.source) {
        case 'EN_SORTIE': {
            const back = a.actuel.retourPrevu ? ', retour prévu le ' + dayText(a.actuel.retourPrevu) : '';
            const late = a.ecarts.includes('SORTIE_EN_RETARD');
            return { tone: late ? 'warn' : '', badge: late ? 'SORTIE_EN_RETARD' : 'SORTIE', label: late ? 'Sortie en retard' : 'Sortie de réserve', detail: (a.actuel.sortiLe ? 'Sortie le ' + dayText(a.actuel.sortiLe) : 'Sortie') + back };
        }
        case 'INTROUVABLE': return { tone: 'bad', badge: 'INTROUVABLE', label: 'Introuvable', detail: 'Son absence a été constatée à son emplacement habituel.' };
        case 'CONSTATE_AILLEURS': return { tone: 'warn', badge: 'AUTRE_EMPLACEMENT', label: 'Trouvée ailleurs', detail: 'Constatée : ' + placeText(a.actuel.unite) };
        default: return null;
    }
}
