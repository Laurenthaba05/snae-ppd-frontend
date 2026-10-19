/**
 * Import d'un fichier EAD3 : ce qu'on dit de la lecture avant d'enregistrer. Le serveur lit, contrôle (schéma officiel, références, niveaux, droits) et reste seul juge ;
 * l'écran montre l'arborescence lue, les erreurs qui bloquent et les éléments non repris.
 */
export const EAD_MAX_BYTES = 5_000_000;
export const EAD_LEVEL_LABELS: Readonly<Record<string, string>> = { FONDS: 'Fonds', SOUS_FONDS: 'Sous-fonds', SERIE: 'Série', SOUS_SERIE: 'Sous-série', DOSSIER: 'Dossier', PIECE: 'Pièce' };
/** Les niveaux de confidentialité que l'institution peut choisir pour les notices créées. */
export const EAD_CONFIDENTIALITY: ReadonlyArray<string> = ['PUBLIC', 'INTERNE', 'CONFIDENTIEL', 'SECRET'];

export interface EadIssueLike { unit: number; reference: string | null; message: string }
export interface EadOutlineLike { rank: number; depth: number; level: string | null; reference: string | null; title: string | null }

/** Une remarque sur le fichier avant même de l'envoyer. */
export function eadFileProblem(file: { name: string; size: number }): string | null {
    if (file.size > EAD_MAX_BYTES) return 'Le fichier dépasse 5 Mo.';
    if (file.size === 0) return 'Le fichier est vide.';
    return /\.(xml|ead)$/i.test(file.name) ? null : 'Choisissez un fichier EAD3 au format XML (.xml).';
}

/** Une erreur du contrôle en une phrase : « Fichier : … » pour tout le fichier, « Unité 3 (MIN-1/A) : … » pour une unité. */
export function eadIssueText(issue: EadIssueLike): string {
    return issue.unit === 0 ? `Fichier : ${issue.message}` : `Unité ${issue.unit}${issue.reference ? ` (${issue.reference})` : ''} : ${issue.message}`;
}

/** Une ligne de l'arborescence lue : « Série · MIN-1/A — Correspondance ». */
export function eadOutlineText(entry: EadOutlineLike): string {
    const level = entry.level ? EAD_LEVEL_LABELS[entry.level] ?? entry.level : 'Niveau inconnu';
    return `${level} · ${entry.reference ?? '(sans référence)'} — ${entry.title ?? '(sans intitulé)'}`;
}

/** Le bilan du contrôle : « 5 unité(s) lues, 0 erreur, 2 remarques. » */
export function eadSummary(preview: { units: number; issues: ReadonlyArray<unknown>; warnings: ReadonlyArray<unknown> }): string {
    const n = (count: number, one: string, many: string) => count === 0 ? `aucune ${one}` : count === 1 ? `1 ${one}` : `${count} ${many}`;
    return `${preview.units} unité${preview.units > 1 ? 's' : ''} lue${preview.units > 1 ? 's' : ''}, ${n(preview.issues.length, 'erreur', 'erreurs')}, ${n(preview.warnings.length, 'remarque', 'remarques')}.`;
}
