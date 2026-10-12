/**
 * Lecture des dimensions et de la résolution (dpi) d'une image numérisée à partir de son en-tête, sans la décoder.
 * PNG (pHYs), JPEG (JFIF / EXIF) et TIFF (IFD) ; un PDF est reconnu mais ne donne ni dimensions ni résolution.
 * Les valeurs viennent du fichier de l'utilisateur : elles sont indicatives et le serveur les borne à nouveau.
 */
export interface ImageInfo { format: 'PNG' | 'JPEG' | 'TIFF' | 'PDF' | 'INCONNU'; width: number | null; height: number | null; dpi: number | null }
interface Sliceable { size: number; slice(start?: number, end?: number): { arrayBuffer(): Promise<ArrayBuffer> } }

const unknown: ImageInfo = { format: 'INCONNU', width: null, height: null, dpi: null };
const HEAD_BYTES = 256 * 1024;

/** Une résolution plausible (10 à 20 000 dpi) ; les densités « rapport d'aspect » (1:1) ne sont pas des dpi. */
const plausible = (value: number) => Number.isFinite(value) && value >= 10 && value <= 20000 ? Math.round(value) : null;
const bytes = async (file: Sliceable, start: number, end: number) => new Uint8Array(await file.slice(start, Math.min(end, file.size)).arrayBuffer());

export async function readImageInfo(file: Sliceable): Promise<ImageInfo> {
    if (file.size < 8) return unknown;
    const head = await bytes(file, 0, HEAD_BYTES);
    if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return png(head);
    if (head[0] === 0xff && head[1] === 0xd8) return jpeg(head);
    if ((head[0] === 0x49 && head[1] === 0x49 && head[2] === 0x2a && head[3] === 0) || (head[0] === 0x4d && head[1] === 0x4d && head[2] === 0 && head[3] === 0x2a)) return tiff(file, head);
    if (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46) return { format: 'PDF', width: null, height: null, dpi: null };
    return unknown;
}

function png(b: Uint8Array): ImageInfo {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const info: ImageInfo = { format: 'PNG', width: null, height: null, dpi: null };
    let at = 8;
    while (at + 12 <= b.length) {
        const length = v.getUint32(at), type = String.fromCharCode(b[at + 4]!, b[at + 5]!, b[at + 6]!, b[at + 7]!);
        if (type === 'IHDR' && at + 16 <= b.length) { info.width = v.getUint32(at + 8); info.height = v.getUint32(at + 12); }
        else if (type === 'pHYs' && at + 17 <= b.length && b[at + 16] === 1) info.dpi = plausible(v.getUint32(at + 8) * 0.0254);
        else if (type === 'IDAT' || type === 'IEND') break;
        at += 12 + length;
    }
    return info;
}

function jpeg(b: Uint8Array): ImageInfo {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const info: ImageInfo = { format: 'JPEG', width: null, height: null, dpi: null };
    let at = 2;
    while (at + 4 <= b.length && b[at] === 0xff) {
        const marker = b[at + 1]!;
        if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { at += 2; continue; }
        if (marker === 0xff) { at += 1; continue; }
        const length = v.getUint16(at + 2);
        const body = at + 4;
        if (marker === 0xe0 && length >= 16 && b[body] === 0x4a && b[body + 1] === 0x46 && b[body + 2] === 0x49 && b[body + 3] === 0x46) {
            const units = b[body + 7], x = v.getUint16(body + 8);
            if (info.dpi === null) info.dpi = units === 1 ? plausible(x) : units === 2 ? plausible(x * 2.54) : null;
        } else if (marker === 0xe1 && b[body] === 0x45 && b[body + 1] === 0x78 && b[body + 2] === 0x69 && b[body + 3] === 0x66) {
            const exif = exifResolution(b.subarray(body + 6, at + 2 + length));
            if (exif !== null) info.dpi = exif;   // l'EXIF prévaut sur un JFIF par défaut (72 dpi)
        } else if ((marker >= 0xc0 && marker <= 0xcf) && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
            info.height = v.getUint16(body + 1); info.width = v.getUint16(body + 3);
            break;
        }
        at += 2 + length;
    }
    return info;
}

/** Résolution horizontale de l'IFD0 d'un bloc TIFF/EXIF entièrement en mémoire. */
function exifResolution(t: Uint8Array): number | null {
    if (t.length < 14) return null;
    const little = t[0] === 0x49;
    const v = new DataView(t.buffer, t.byteOffset, t.byteLength);
    const u16 = (o: number) => v.getUint16(o, little), u32 = (o: number) => v.getUint32(o, little);
    const ifd = u32(4);
    if (ifd + 2 > t.length) return null;
    let x: number | null = null, unit = 2;
    for (let i = 0, n = u16(ifd); i < n && ifd + 2 + i * 12 + 12 <= t.length; i++) {
        const e = ifd + 2 + i * 12, tag = u16(e);
        if (tag === 282) { const o = u32(e + 8); if (o + 8 <= t.length && u32(o + 4) !== 0) x = u32(o) / u32(o + 4); }
        else if (tag === 296) unit = u16(e + 8);
    }
    return x === null ? null : plausible(unit === 3 ? x * 2.54 : unit === 2 ? x : NaN);
}

async function tiff(file: Sliceable, head: Uint8Array): Promise<ImageInfo> {
    const little = head[0] === 0x49;
    const info: ImageInfo = { format: 'TIFF', width: null, height: null, dpi: null };
    const hv = new DataView(head.buffer, head.byteOffset, head.byteLength);
    const ifd = hv.getUint32(4, little);
    if (ifd < 8 || ifd + 2 > file.size) return info;
    const dir = await bytes(file, ifd, ifd + 2 + 12 * 256 + 4);
    const v = new DataView(dir.buffer, dir.byteOffset, dir.byteLength);
    const count = Math.min(v.getUint16(0, little), 256);
    let xOffset = -1, unit = 2;
    for (let i = 0; i < count && 2 + i * 12 + 12 <= dir.length; i++) {
        const e = 2 + i * 12, tag = v.getUint16(e, little), type = v.getUint16(e + 2, little);
        const value = type === 3 ? v.getUint16(e + 8, little) : v.getUint32(e + 8, little);
        if (tag === 256) info.width = value;
        else if (tag === 257) info.height = value;
        else if (tag === 282) xOffset = v.getUint32(e + 8, little);
        else if (tag === 296) unit = value;
    }
    if (xOffset >= 0 && xOffset + 8 <= file.size) {
        const r = await bytes(file, xOffset, xOffset + 8);
        const rv = new DataView(r.buffer, r.byteOffset, r.byteLength);
        const den = rv.getUint32(4, little);
        if (den !== 0) { const x = rv.getUint32(0, little) / den; info.dpi = plausible(unit === 3 ? x * 2.54 : unit === 2 ? x : NaN); }
    }
    return info;
}
