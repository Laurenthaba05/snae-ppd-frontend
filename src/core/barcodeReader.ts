import { downscaleToArea, type GrayImage } from './barcodeImage.js';
import { readCode128 } from './code128.js';
import { readQr } from './qrcode.js';

export interface CodeHit { text: string; format: 'QR' | 'CODE128' | 'AUTRE'; source: 'interne' | 'natif' | 'bibliotheque' }
/** Lecteur supplémentaire (détecteur du navigateur, ZXing…) appelé quand le lecteur interne ne trouve rien. */
export type ExtraReader = (image: GrayImage) => Promise<Array<{ text: string; format: string }>>;

const MAX_PIXELS_1D = 6_000_000;

/** Lecteur interne : Code 128 et QR, sans dépendance. Rapide, vérifié contre ZXing sur nos propres feuilles. */
export function readInternal(image: GrayImage): CodeHit[] {
    const hits: CodeHit[] = [];
    const small = downscaleToArea(image, MAX_PIXELS_1D);
    for (const text of readCode128(small)) hits.push({ text, format: 'CODE128', source: 'interne' });
    for (const text of readQr(image)) hits.push({ text, format: 'QR', source: 'interne' });
    return hits;
}

const formatOf = (name: string): CodeHit['format'] => /qr/i.test(name) ? 'QR' : /code[ _-]?128/i.test(name) ? 'CODE128' : 'AUTRE';

/**
 * Lit les codes d'une image : lecteur interne d'abord, puis chaque lecteur supplémentaire dans l'ordre, jusqu'au premier
 * qui trouve quelque chose. Une erreur d'un lecteur supplémentaire (WASM indisponible, API absente) ne bloque pas la lecture.
 */
export async function readCodes(image: GrayImage, extra: ReadonlyArray<{ source: CodeHit['source']; read: ExtraReader }> = []): Promise<CodeHit[]> {
    const internal = readInternal(image);
    if (internal.length) return internal;
    for (const reader of extra) {
        try {
            const found = await reader.read(image);
            if (found.length) {
                const seen = new Set<string>();
                return found.filter(f => !seen.has(f.text) && seen.add(f.text)).map(f => ({ text: f.text, format: formatOf(f.format), source: reader.source }));
            }
        } catch { /* lecteur indisponible : on passe au suivant */ }
    }
    return [];
}
