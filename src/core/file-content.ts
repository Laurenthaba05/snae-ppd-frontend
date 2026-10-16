import type { DocumentFile } from './types.js';
import { ApiError } from './http.js';

export type PreviewKind = 'pdf' | 'image' | 'text' | 'audio' | 'video';
const mediaType = (value: string) => value.split(';')[0]!.trim().toLowerCase();

export function previewKind(type: string, size: number): PreviewKind | null {
    if (!Number.isSafeInteger(size) || size < 0 || size > 50 * 1024 * 1024) return null;
    const mime = mediaType(type);
    if (mime === 'application/pdf') return 'pdf';
    if (['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'].includes(mime)) return 'image';
    if (mime === 'text/plain' && size <= 1024 * 1024) return 'text';
    if (['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/mp4'].includes(mime)) return 'audio';
    if (['video/mp4', 'video/webm', 'video/ogg'].includes(mime)) return 'video';
    return null;
}

export function fileIsReadable(file: Pick<DocumentFile, 'state' | 'validatedAt'>): boolean {
    return !!file.validatedAt && (file.state === 'VALIDE' || file.state === 'ARCHIVE');
}

export function checkFileContent(blob: Blob, file: Pick<DocumentFile, 'size' | 'mediaType'>): Blob {
    if (blob.size !== file.size || mediaType(blob.type) !== mediaType(file.mediaType))
        throw new ApiError(0, 'CONTENT_MISMATCH', 'Le fichier reçu ne correspond pas aux informations affichées. Actualisez la liste avant de recommencer.');
    return blob;
}

export function downloadFilename(name: string): string {
    // Remove paths, control characters and bidirectional overrides from untrusted names.
    // eslint-disable-next-line no-control-regex -- un nom de fichier ne garde aucun caractère de contrôle
    return name.replace(/[\\/]/g, '_').replace(/[\u0000-\u001f\u007f<>:"|?*\u202a-\u202e\u2066-\u2069]/g, '_')
        .replace(/^[. ]+|[. ]+$/g, '').slice(0, 200) || 'document';
}
