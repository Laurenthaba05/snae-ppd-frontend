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
    if (['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/mp4', 'audio/flac', 'audio/aac', 'audio/webm', 'audio/opus'].includes(mime)) return 'audio';
    if (['video/mp4', 'video/webm', 'video/ogg'].includes(mime)) return 'video';
    return null;
}

/** Au-delà de cette taille, un fichier n'est plus chargé en mémoire du navigateur : il se lit et se télécharge en continu depuis le serveur. */
export const MEMORY_LIMIT_BYTES = 50 * 1024 * 1024;

const STREAMABLE: Record<string, 'audio' | 'video'> = {
    'audio/mpeg': 'audio', 'audio/ogg': 'audio', 'audio/wav': 'audio', 'audio/mp4': 'audio', 'audio/flac': 'audio', 'audio/aac': 'audio', 'audio/webm': 'audio', 'audio/opus': 'audio',
    'video/mp4': 'video', 'video/webm': 'video', 'video/ogg': 'video'
};

/** Ce type se lit directement dans la page (balise audio ou vidéo), quelle que soit la taille du fichier. */
export function streamKind(type: string): 'audio' | 'video' | null { return STREAMABLE[mediaType(type)] ?? null; }

/**
 * Ce fichier passe-t-il par la lecture en continu (jeton de lecture, plages d'octets, rien en mémoire) ? Toujours pour l'audio et la vidéo qu'on consulte, quelle que soit leur taille ; pour tout
 * fichier plus gros que la limite de mémoire, qu'on le consulte ou le télécharge. Sinon, il est chargé en entier et vérifié (taille et type) avant d'être proposé.
 */
export function usesStreaming(file: Pick<DocumentFile, 'mediaType' | 'size'>, preview: boolean): boolean {
    return (preview && streamKind(file.mediaType) !== null) || !Number.isSafeInteger(file.size) || file.size > MEMORY_LIMIT_BYTES;
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
