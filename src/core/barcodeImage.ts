/** Image en niveaux de gris (luminance 0 = noir, 255 = blanc) et utilitaires de binarisation pour la lecture de codes. */
export interface GrayImage { width: number; height: number; data: Uint8Array | Uint8ClampedArray }

/** Convertit des pixels RGBA (ImageData, canvas) en luminance. */
export function grayFromRgba(width: number, height: number, rgba: Uint8Array | Uint8ClampedArray): GrayImage {
    const data = new Uint8Array(width * height);
    for (let i = 0, p = 0; i < data.length; i++, p += 4) data[i] = (rgba[p]! * 77 + rgba[p + 1]! * 150 + rgba[p + 2]! * 29) >> 8;
    return { width, height, data };
}

export function transpose(image: GrayImage): GrayImage {
    const { width: w, height: h } = image;
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[x * h + y] = image.data[y * w + x]!;
    return { width: h, height: w, data: out };
}

/** Réduit l'image (moyenne par blocs) pour que son plus grand côté ne dépasse pas `maxSide` : borne le coût de lecture. */
export function downscale(image: GrayImage, maxSide: number): GrayImage {
    const factor = Math.ceil(Math.max(image.width, image.height) / maxSide);
    if (factor <= 1) return image;
    const w = Math.floor(image.width / factor), h = Math.floor(image.height / factor);
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let sum = 0;
        for (let dy = 0; dy < factor; dy++) { const row = (y * factor + dy) * image.width + x * factor; for (let dx = 0; dx < factor; dx++) sum += image.data[row + dx]!; }
        out[y * w + x] = Math.round(sum / (factor * factor));
    }
    return { width: w, height: h, data: out };
}

/** Réduit l'image jusqu'à ce que sa surface ne dépasse pas `maxPixels` (renvoie la même image si elle est déjà assez petite). */
export function downscaleToArea(image: GrayImage, maxPixels: number): GrayImage {
    const area = image.width * image.height;
    if (area <= maxPixels) return image;
    return downscale(image, Math.floor(Math.max(image.width, image.height) / Math.ceil(Math.sqrt(area / maxPixels))));
}

/** Seuil de binarisation d'Otsu sur un histogramme de 256 niveaux. */
export function otsuThreshold(data: ArrayLike<number>): number {
    const histogram = new Array<number>(256).fill(0);
    for (let i = 0; i < data.length; i++) histogram[data[i]!]!++;
    const total = data.length;
    let sum = 0;
    for (let t = 0; t < 256; t++) sum += t * histogram[t]!;
    let background = 0, weightB = 0, best = 0, threshold = 127;
    for (let t = 0; t < 256; t++) {
        weightB += histogram[t]!;
        if (weightB === 0) continue;
        const weightF = total - weightB;
        if (weightF === 0) break;
        background += t * histogram[t]!;
        const between = weightB * weightF * Math.pow(background / weightB - (sum - background) / weightF, 2);
        if (between > best) { best = between; threshold = t; }
    }
    return threshold;
}

/** Binarisation locale (moyenne glissante par image intégrale) : tolère les éclairages et les fonds inégaux d'un scan. */
export function binarize(image: GrayImage, window = 0): Uint8Array {
    const { width: w, height: h, data } = image;
    const radius = Math.max(8, window || Math.floor(Math.min(w, h) / 16));
    const integral = new Uint32Array((w + 1) * (h + 1));   // somme max 255 × 16 M de pixels < 2^32
    for (let y = 0; y < h; y++) {
        let row = 0;
        for (let x = 0; x < w; x++) { row += data[y * w + x]!; integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1]! + row; }
    }
    const global = otsuThreshold(data);
    const out = new Uint8Array(w * h);   // 1 = noir
    for (let y = 0; y < h; y++) {
        const y0 = Math.max(0, y - radius), y1 = Math.min(h, y + radius + 1);
        for (let x = 0; x < w; x++) {
            const x0 = Math.max(0, x - radius), x1 = Math.min(w, x + radius + 1);
            const area = (x1 - x0) * (y1 - y0);
            const mean = (integral[y1 * (w + 1) + x1]! - integral[y0 * (w + 1) + x1]! - integral[y1 * (w + 1) + x0]! + integral[y0 * (w + 1) + x0]!) / area;
            const value = data[y * w + x]!;
            // Zones uniformes : on retombe sur le seuil global plutôt que de fabriquer du bruit.
            out[y * w + x] = value < Math.min(mean * 0.92, mean - 6) || (Math.abs(value - mean) < 6 && value < global * 0.85) ? 1 : 0;
        }
    }
    return out;
}
