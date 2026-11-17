import { text, uuid } from './validation.js';
import type { OcrIndexingMode, OcrIndexingPolicy, OcrListItem } from './types.js';

/**
 * L'indexation du texte reconnu par le moteur. Jusqu'ici seul le texte validé par une personne était cherchable. Une institution peut décider que le texte jugé fiable (voir la fiabilité du texte)
 * entre aussitôt dans l'index, signalé « non vérifié » dans les résultats ; la validation humaine reste possible et prioritaire.
 */
export const MODE_LABEL: Record<OcrIndexingMode, string> = {
    VALIDATION_SEULE: 'Texte validé seulement',
    FIABLE_SIGNALE: 'Texte validé, et texte jugé fiable signalé « non vérifié »'
};

export const MODE_EXPLANATION: Record<OcrIndexingMode, string> = {
    VALIDATION_SEULE: 'Un scan n’est cherchable qu’après la validation de chaque page par une personne.',
    FIABLE_SIGNALE: 'Le texte reconnu jugé fiable est cherchable tout de suite ; les résultats qui ne répondent que par lui sont signalés « non vérifié ». Les textes à vérifier ou non fiables restent hors de l’index.'
};

export function modeLabel(mode: OcrIndexingMode | null | undefined): string {
    return mode ? MODE_LABEL[mode] ?? mode : 'Aucune (héritée)';
}

const SOURCE_LABEL: Record<string, string> = {
    INSTITUTION: 'décidée par cette institution',
    NATIONAL: 'décidée au niveau national',
    DEFAUT: 'réglage par défaut du serveur'
};

/** D'où vient la politique en vigueur, en mots. */
export function sourceLabel(policy: Pick<OcrIndexingPolicy, 'source'>): string {
    return SOURCE_LABEL[policy.source] ?? policy.source;
}

/** Ce texte est-il dans l'index ? Une phrase courte pour la liste ; vide quand le serveur ne le dit pas (ancien serveur). */
export function indexationLabel(item: Pick<OcrListItem, 'indexation'>): string {
    if (item.indexation === 'VALIDE') return 'Indexé (validé)';
    if (item.indexation === 'AUTOMATIQUE') return 'Indexé · non vérifié';
    if (item.indexation === 'NON') return 'Pas indexé';
    if (item.indexation === 'ECARTE') return 'Écarté de l’index';
    return '';
}

/** Le motif d'un texte écarté de l'index : de 10 à 1 000 caractères, comme l'impose le serveur. */
export const DISCARD_REASON_MIN = 10;
export const DISCARD_REASON_MAX = 1000;

/** Le corps de la demande « écarter ce texte de l'index » : le motif, nettoyé, refusé avant tout envoi s'il est trop court ou trop long. */
export function discardCommand(reason: string): { reason: string } {
    const motif = text(reason, DISCARD_REASON_MAX) as string;
    if (motif.length < DISCARD_REASON_MIN) throw new Error(`Le motif doit faire au moins ${DISCARD_REASON_MIN} caractères.`);
    return { reason: motif };
}

/** Un texte peut-il être écarté (non validé, pas déjà écarté) ou réintégré (écarté) ? Un texte validé se remplace en en validant un autre. */
export function canDiscard(item: Pick<OcrListItem, 'statutValidation' | 'ecarteLe'>): boolean { return item.statutValidation === 'NON_VALIDE' && !item.ecarteLe; }
export function canRestore(item: Pick<OcrListItem, 'statutValidation' | 'ecarteLe'>): boolean { return item.statutValidation === 'NON_VALIDE' && !!item.ecarteLe; }

/** Le corps de la décision de politique : le mode (ou `HERITE` pour une institution), le motif obligatoire, et la version lue pour ne pas écraser un changement concurrent. */
export function policyCommand(institutionId: string | null, mode: string, motif: string, expectedVersion: number | null): Record<string, unknown> {
    if (!['VALIDATION_SEULE', 'FIABLE_SIGNALE', 'HERITE'].includes(mode)) throw new Error('Choisissez une politique.');
    if (mode === 'HERITE' && !institutionId) throw new Error('Le niveau national n’hérite de rien : choisissez une politique.');
    if (expectedVersion !== null && (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0)) throw new Error('Version serveur invalide.');
    return { institutionId: institutionId ? uuid(institutionId) : null, mode, motif: text(motif, 2000), expectedVersion };
}
