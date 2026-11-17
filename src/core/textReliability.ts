import type { OcrListItem, ReliabilityLevel } from './types.js';

/**
 * La fiabilité d'un texte reconnu, telle que le serveur la calcule : elle croise la confiance du moteur, la sûreté des mots, la préparation éventuelle de l'image et la qualité de la page.
 * La confiance seule ne dit pas si le texte est juste (une page à l'encre pâle est lue à 91 % de confiance et fausse à 27 %).
 */
export const RELIABILITY_LABEL: Record<ReliabilityLevel, string> = {
    FIABLE: 'Fiable',
    A_VERIFIER: 'À vérifier',
    NON_FIABLE: 'Non fiable'
};

export function reliabilityLabel(level: ReliabilityLevel | null | undefined): string {
    return level ? RELIABILITY_LABEL[level] ?? 'À vérifier' : 'Non évaluée';
}

/** Ce que la fiabilité veut dire en une phrase, pour l'aide de l'écran et la bulle de chaque pastille. */
export const RELIABILITY_MEANING: Record<ReliabilityLevel, string> = {
    FIABLE: 'Lecture directe, confiance élevée, mots sûrs, page saine : rien ne l’inquiète.',
    A_VERIFIER: 'Au moins une raison de relire ce texte avant de s’y fier.',
    NON_FIABLE: 'Presque rien lu, ou lecture très incertaine : ne pas s’y fier.'
};

const PREPARATION: Record<string, string> = {
    median3: 'Lu après préparation de l’image (filtre médian léger)',
    median5: 'Lu après préparation de l’image (filtre médian fort)',
    blur_threshold: 'Lu après préparation de l’image (noir et blanc)'
};

/** La préparation d'image qui a permis la lecture, en toutes lettres ; chaîne vide pour une lecture directe. */
export function preparationLabel(preparation: string | null | undefined): string {
    if (!preparation) return '';
    return PREPARATION[preparation] ?? 'Lu après préparation de l’image';
}

export interface ReliabilityCounts { fiable: number; aVerifier: number; nonFiable: number; nonEvalue: number }

/** Combien de textes de la liste dans chaque niveau : les chiffres de l'en-tête de l'écran. */
export function reliabilityCounts(items: ReadonlyArray<Pick<OcrListItem, 'fiabilite'>>): ReliabilityCounts {
    const counts: ReliabilityCounts = { fiable: 0, aVerifier: 0, nonFiable: 0, nonEvalue: 0 };
    for (const item of items) {
        const level = item.fiabilite?.level;
        if (level === 'FIABLE') counts.fiable++;
        else if (level === 'A_VERIFIER') counts.aVerifier++;
        else if (level === 'NON_FIABLE') counts.nonFiable++;
        else counts.nonEvalue++;
    }
    return counts;
}

/** Les raisons à montrer sous la pastille : toutes, dans l'ordre du serveur, sans doublon ; vide pour un texte fiable. */
export function reliabilityReasons(item: Pick<OcrListItem, 'fiabilite'>): string[] {
    const level = item.fiabilite?.level;
    if (!level || level === 'FIABLE') return [];
    return [...new Set((item.fiabilite?.reasons ?? []).map(reason => reason.message))];
}
