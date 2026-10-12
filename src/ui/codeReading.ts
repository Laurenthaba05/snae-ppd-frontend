import { grayFromRgba, type GrayImage } from '../core/barcodeImage';
import { readCodes, type CodeHit, type ExtraReader } from '../core/barcodeReader';
import type { ImageInfo } from '../core/scanImage';

/** Lecture des codes dans les fichiers du scanner : décodage de l'image, lecteur interne, puis lecteurs supplémentaires. */
const MAX_SIDE = 3600;

/**
 * Décode une image en niveaux de gris, réduite à `MAX_SIDE` pixels au plus.
 * Retourne 'FORMAT' si le navigateur ne sait pas décoder ce format (Edge et Chrome ne lisent pas le TIFF).
 */
export async function decodeToGray(file: Blob, info: ImageInfo): Promise<GrayImage | 'FORMAT'> {
    try {
        let options: ImageBitmapOptions | undefined;
        if (info.width && info.height && Math.max(info.width, info.height) > MAX_SIDE) {
            const factor = MAX_SIDE / Math.max(info.width, info.height);
            options = { resizeWidth: Math.round(info.width * factor), resizeHeight: Math.round(info.height * factor), resizeQuality: 'high' };
        }
        const bitmap = await createImageBitmap(file, options);
        try {
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width; canvas.height = bitmap.height;
            const context = canvas.getContext('2d', { willReadFrequently: true });
            if (!context) return 'FORMAT';
            context.drawImage(bitmap, 0, 0);
            const data = context.getImageData(0, 0, bitmap.width, bitmap.height);
            return grayFromRgba(bitmap.width, bitmap.height, data.data);
        } finally { bitmap.close(); }
    } catch { return 'FORMAT'; }
}

const grayToImageData = (gray: GrayImage): ImageData => {
    const rgba = new Uint8ClampedArray(gray.width * gray.height * 4);
    for (let i = 0, p = 0; i < gray.data.length; i++, p += 4) { const v = gray.data[i]!; rgba[p] = v; rgba[p + 1] = v; rgba[p + 2] = v; rgba[p + 3] = 255; }
    return new ImageData(rgba, gray.width, gray.height);
};

/** Détecteur de codes du navigateur (Mac, Android, ChromeOS) ; absent sous Windows. */
export async function nativeReader(): Promise<{ source: 'natif'; read: ExtraReader } | null> {
    const Detector = (globalThis as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => { detect(source: ImageData): Promise<Array<{ rawValue: string; format: string }>> } & object }).BarcodeDetector as unknown as (new (options: { formats: string[] }) => { detect(source: ImageData): Promise<Array<{ rawValue: string; format: string }>> }) & { getSupportedFormats(): Promise<string[]> } | undefined;
    if (!Detector) return null;
    try {
        const wanted = ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'itf', 'data_matrix'];
        const formats = (await Detector.getSupportedFormats()).filter(f => wanted.includes(f));
        if (!formats.length) return null;
        const detector = new Detector({ formats });
        return { source: 'natif', read: async gray => (await detector.detect(grayToImageData(gray))).map(f => ({ text: f.rawValue, format: f.format })) };
    } catch { return null; }
}

let zxing: Promise<typeof import('zxing-wasm/reader')> | null = null;

/**
 * ZXing (WebAssembly) : tous les formats usuels, plus tolérant que le lecteur interne. Le module est chargé à la demande,
 * depuis les fichiers du projet (jamais depuis un CDN, contrairement au comportement par défaut de la bibliothèque).
 */
export function zxingReader(): { source: 'bibliotheque'; read: ExtraReader } {
    return {
        source: 'bibliotheque',
        read: async gray => {
            zxing ??= (async () => {
                const [module, wasm] = await Promise.all([import('zxing-wasm/reader'), import('zxing-wasm/reader/zxing_reader.wasm?url')]);
                await module.prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => path.endsWith('.wasm') ? wasm.default : prefix + path }, fireImmediately: true });
                return module;
            })().catch(error => { zxing = null; throw error; });
            const module = await zxing;
            const results = await module.readBarcodes(grayToImageData(gray), { formats: ['QRCode', 'Code128', 'Code39', 'EAN13', 'EAN8', 'ITF', 'DataMatrix'], tryHarder: true, tryRotate: true, tryInvert: true, maxNumberOfSymbols: 4 });
            return results.filter(r => r.isValid).map(r => ({ text: r.text, format: r.format }));
        }
    };
}

/** Lit les codes d'un fichier image. `unreadable` : le navigateur ne décode pas ce format (TIFF), aucun code n'a pu être lu. */
export async function readFileCodes(file: Blob, info: ImageInfo, useLibrary = true): Promise<{ hits: CodeHit[]; unreadable: boolean }> {
    const gray = await decodeToGray(file, info);
    if (gray === 'FORMAT') return { hits: [], unreadable: true };
    const extra = [];
    const native = await nativeReader();
    if (native) extra.push(native);
    if (useLibrary) extra.push(zxingReader());
    return { hits: await readCodes(gray, extra), unreadable: false };
}
