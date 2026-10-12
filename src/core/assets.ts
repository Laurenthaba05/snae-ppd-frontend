import type { FileAssetItem, FileDerivative, FileFormat } from './types.js';

export interface AssetsSummary {
    /** Fichiers courants de l'élément. */
    total: number;
    identified: number;
    /** Fichiers dont l'identification porte au moins un constat (corrompu, type différent, format avec perte…). */
    withFindings: number;
    withCopies: number;
    /** Une tâche d'identification ou de copie est en file ou en cours : la liste doit être rafraîchie. */
    pending: number;
    failed: number;
    /** Fichiers à identifier ou à copier sans tâche active : le moteur peut les (re)lancer. */
    runnable: number;
}

const active = (state: string | null) => state === 'QUEUED' || state === 'RUNNING';
/** Les copies de consultation ne concernent que les images ; un PDF n'en attend pas. */
const wantsCopies = (item: FileAssetItem) => item.mediaType.startsWith('image/');

/** Résume l'état de l'identification et des copies. Un résultat existant compte comme fait, quelle que soit la dernière tâche. */
export function summarizeAssets(items: ReadonlyArray<FileAssetItem>): AssetsSummary {
    const summary: AssetsSummary = { total: items.length, identified: 0, withFindings: 0, withCopies: 0, pending: 0, failed: 0, runnable: 0 };
    for (const item of items) {
        if (item.format) { summary.identified++; if (item.format.findings.length) summary.withFindings++; }
        const hasCopies = item.derivatives.length > 0;
        if (hasCopies) summary.withCopies++;
        if (active(item.identifyState) || active(item.deriveState)) summary.pending++;
        if ((!item.format && item.identifyState === 'FAILED') || (wantsCopies(item) && !hasCopies && item.deriveState === 'FAILED')) summary.failed++;
        const identifyMissing = !item.format && !active(item.identifyState);
        const copiesMissing = wantsCopies(item) && !hasCopies && !active(item.deriveState);
        if (identifyMissing || copiesMissing) summary.runnable++;
    }
    return summary;
}

const COLOR: Record<string, string> = {
    RGB: 'couleur', RGBA: 'couleur avec transparence', L: 'niveaux de gris', LA: 'niveaux de gris avec transparence', '1': 'noir et blanc',
    P: 'palette', CMYK: 'CMJN', 'I;16': 'gris 16 bits', I: 'gris 32 bits'
};
const COMPRESSION: Record<string, string> = {
    raw: 'non compressé', tiff_lzw: 'LZW', tiff_adobe_deflate: 'Deflate', tiff_deflate: 'Deflate', packbits: 'PackBits', jpeg: 'JPEG avec perte',
    tiff_jpeg: 'JPEG avec perte', group4: 'CCITT G4', tiff_ccitt: 'CCITT', jpeg2000: 'JPEG 2000'
};

/** « TIFF », « JPEG 1.01 », « PDF 1.7 » : la famille et, quand elle est lisible, la version. */
export function formatText(format: Pick<FileFormat, 'name' | 'version'> | null): string {
    return format ? format.name + (format.version ? ' ' + format.version : '') : '';
}

/** Caractéristiques lisibles : « 300 dpi · LZW · couleur · 12 pages ». */
export function detailsText(format: Pick<FileFormat, 'details'> | null): string {
    if (!format) return '';
    const d = format.details;
    const parts: string[] = [];
    const dpi = d.dpi;
    if (Array.isArray(dpi) && typeof dpi[0] === 'number') parts.push(Math.round(dpi[0]) + ' dpi');
    if (typeof d.compression === 'string') parts.push(COMPRESSION[d.compression] ?? d.compression);
    if (typeof d.colorMode === 'string') parts.push(COLOR[d.colorMode] ?? d.colorMode);
    if (typeof d.pages === 'number') parts.push(d.pages + ' page' + (d.pages > 1 ? 's' : ''));
    if (typeof d.frames === 'number' && d.frames > 1 && typeof d.pages !== 'number') parts.push(d.frames + ' images');
    return parts.join(' · ');
}

/** Taille lisible d'une copie : « 23 Ko », « 1,2 Mo ». */
export function sizeText(bytes: number): string {
    if (bytes < 1024) return bytes + ' o';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' Ko';
    return (bytes / (1024 * 1024)).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' Mo';
}

export const derivativeLabel = (kind: FileDerivative['kind']) => kind === 'CONSULTATION' ? 'Consultation' : 'Vignette';

/** Nombre d'images d'un fichier (un TIFF peut en avoir plusieurs), d'après ses copies de consultation : 1 tant qu'il n'y en a pas. */
export function imageCount(item: Pick<FileAssetItem, 'derivatives'>): number {
    return Math.max(1, ...item.derivatives.filter(d => d.kind === 'CONSULTATION').map(d => d.frame));
}

/**
 * Une ligne par type de copie : « Consultation · 1800 × 1200 · 345 Ko » pour une image, « Consultation · 3 images · 2,4 Mo au total » pour un fichier de plusieurs
 * images (les dimensions diffèrent d'une image à l'autre). Les types absents ne donnent pas de ligne.
 */
export function copyLines(derivatives: ReadonlyArray<FileDerivative>): string[] {
    return (['CONSULTATION', 'THUMBNAIL'] as const).flatMap(kind => {
        const own = derivatives.filter(d => d.kind === kind);
        if (!own.length) return [];
        if (own.length === 1) return [`${derivativeLabel(kind)} · ${own[0]!.width} × ${own[0]!.height} · ${sizeText(own[0]!.sizeBytes)}`];
        return [`${derivativeLabel(kind)} · ${own.length} images · ${sizeText(own.reduce((sum, d) => sum + d.sizeBytes, 0))} au total`];
    });
}

const ERRORS: Record<string, string> = {
    IMAGE_PIXEL_LIMIT: 'image trop grande pour le moteur',
    IMAGE_TOTAL_PIXEL_LIMIT: 'toutes les images du fichier ensemble sont trop grandes pour le moteur (600 millions de pixels au plus)',
    IMAGE_FORMAT_NOT_ALLOWED: 'format d’image non pris en charge (JPEG, PNG ou TIFF)',
    PAGE_LIMIT: 'trop de pages dans le fichier',
    DERIVATIVE_SIZE_LIMIT: 'copie trop volumineuse',
    DERIVATIVE_OUTPUT_INVALID: 'copie produite illisible',
    DERIVE_RESULT_INVALID: 'résultat du moteur illisible',
    IDENTIFY_RESULT_INVALID: 'résultat du moteur illisible',
    PILLOW_NOT_INSTALLED: 'composant Python manquant sur le serveur',
    EXTRACTION_TIMEOUT: 'délai dépassé',
    FILE_TOO_LARGE: 'fichier plus grand que la limite de traitement du serveur (snae.storage.max-bytes)',
    STORAGE_UNAVAILABLE: 'stockage indisponible',
    STORAGE_NOT_CONFIGURED: 'stockage non configuré',
    SOURCE_NOT_READY: 'le fichier n’a pas été validé (analyse antivirus en attente ou échouée)',
    SOURCE_INTEGRITY_MISMATCH: 'intégrité du fichier non confirmée',
    EXTRACTION_SOURCE_INVALID: 'fichier trop volumineux ou modifié',
    REQUESTER_ACCESS_REVOKED: 'les droits de la personne qui a importé la page ont été retirés',
    WORKER_INTERRUPTED: 'moteur interrompu pendant le traitement'
};

/** Explication courte d'un échec ; le code technique est conservé tel quel quand il n'est pas connu. */
export function assetErrorText(code: string | null | undefined): string {
    if (!code) return 'échec sans précision';
    return ERRORS[code] ?? 'échec (' + code + ')';
}
