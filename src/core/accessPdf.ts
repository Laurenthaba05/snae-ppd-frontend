import type { AccessPdf, AccessPdfPart } from './types.js';
import { assetErrorText, sizeText } from './assets.js';

/**
 * Où en est le PDF d'accès d'un élément (copie de lecture : les copies de consultation des pages, assemblées dans l'ordre).
 * DISABLED : fonction désactivée sur le serveur et rien de généré ; WAITING_COPIES : des pages n'ont pas encore leur copie de consultation.
 */
export type AccessPdfState = 'DISABLED' | 'NO_PAGES' | 'WAITING_COPIES' | 'NOT_GENERATED' | 'RUNNING' | 'FAILED' | 'STALE' | 'UP_TO_DATE';

export const isRunning = (view: AccessPdf): boolean => view.tache?.state === 'QUEUED' || view.tache?.state === 'RUNNING';

export function accessPdfState(view: AccessPdf): AccessPdfState {
    if (isRunning(view)) return 'RUNNING';
    if (view.volumes.length) return view.aJour ? 'UP_TO_DATE' : 'STALE';
    if (!view.enabled) return 'DISABLED';
    if (view.pages === 0) return 'NO_PAGES';
    if (view.copiesManquantes.length) return 'WAITING_COPIES';
    return view.tache?.state === 'FAILED' ? 'FAILED' : 'NOT_GENERATED';
}

/** On peut demander la génération quand la fonction est active, que toutes les pages ont leur copie, qu'aucune tâche n'est en cours et que le PDF n'est pas déjà à jour. */
export const canGenerate = (view: AccessPdf): boolean => view.enabled && view.pages > 0 && view.copiesManquantes.length === 0 && !isRunning(view) && !(view.aJour && view.volumes.length > 0);

export function generateLabel(view: AccessPdf): string {
    if (view.tache?.state === 'FAILED') return 'Relancer le PDF d’accès';
    return view.volumes.length ? 'Régénérer le PDF d’accès' : 'Générer le PDF d’accès';
}

/**
 * « Volume 1 sur 2 · pages 1 à 120 · 45,3 Mo ». Quand le volume compte plus de pages de PDF que de numéros de page (un fichier de plusieurs images donne
 * une page de PDF par image), le nombre de pages du PDF est ajouté : « pages 1 à 4 · 9 pages de PDF ».
 */
export function volumeLabel(part: AccessPdfPart): string {
    const span = part.lastPage - part.firstPage + 1;
    const pages = part.firstPage === part.lastPage ? 'page ' + part.firstPage : 'pages ' + part.firstPage + ' à ' + part.lastPage;
    const images = part.pageCount > span ? ' · ' + part.pageCount + ' pages de PDF' : '';
    return (part.partCount > 1 ? 'Volume ' + part.partNo + ' sur ' + part.partCount + ' · ' : 'PDF d’accès · ') + pages + images + ' · ' + sizeText(part.sizeBytes);
}

/** Nom du fichier proposé au téléchargement. */
export const volumeFileName = (part: AccessPdfPart): string => part.partCount > 1 ? 'acces-volume-' + part.partNo + '-sur-' + part.partCount + '.pdf' : 'acces.pdf';

const ERRORS: Record<string, string> = {
    ACCESS_PDF_COPY_INVALID: 'une copie de consultation est illisible ou ne correspond pas à son enregistrement',
    ACCESS_PDF_SOURCE_INTEGRITY: 'une copie de consultation a changé dans le stockage : son empreinte ne correspond plus',
    ACCESS_PDF_SOURCE_CHANGED: 'les pages ont changé pendant l’assemblage : relancez la génération',
    ACCESS_PDF_COPIES_MISSING: 'des pages n’ont pas de copie de consultation',
    ACCESS_PDF_NO_PAGES: 'aucune page numérisée',
    ACCESS_PDF_VERSIONS_MIXED: 'les pages sont réparties sur plusieurs versions du document',
    ACCESS_PDF_PAGE_TOO_LARGE: 'une page est trop volumineuse pour un volume (réglage access-pdf-max-part-bytes)',
    ACCESS_PDF_TOO_MANY_PAGES: 'trop de pages pour un PDF d’accès',
    ACCESS_PDF_TOO_MANY_PARTS: 'trop de volumes',
    ACCESS_PDF_PART_TOO_LARGE: 'un volume dépasse la limite du stockage (snae.storage.max-bytes)',
    ACCESS_PDF_OUTPUT_INVALID: 'le PDF écrit est incomplet',
    ACCESS_PDF_FAILED: 'échec de l’assemblage'
};

/** Explication courte d'un échec de génération ; les codes du stockage et des droits sont expliqués comme pour les autres traitements. */
export function accessPdfErrorText(code: string | null | undefined): string {
    return code && ERRORS[code] ? ERRORS[code]! : assetErrorText(code);
}

/** Pages sans copie de consultation, en texte court (« pages 3, 4 et 7 »). */
export function missingText(pages: ReadonlyArray<number>): string {
    if (!pages.length) return '';
    const shown = pages.slice(0, 8).join(', ');
    return (pages.length > 1 ? 'pages ' : 'page ') + shown + (pages.length > 8 ? ' et ' + (pages.length - 8) + ' autres' : '');
}
