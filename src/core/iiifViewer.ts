/**
 * Le calcul du visualiseur d'images (API d'images IIIF) : ce qui est visible, quelle région demander au serveur et à quelle taille, comment zoomer autour d'un point, et quels mots
 * du texte reconnu surligner. Fonctions pures, sans navigateur : le serveur reste seul juge des droits et des dimensions.
 */
export interface Size { width: number; height: number }
export interface Rect { x: number; y: number; width: number; height: number }
/** `zoom` : pixels d'écran par pixel d'image ; `cx`, `cy` : le point de l'image au centre de la fenêtre. */
export interface View { zoom: number; cx: number; cy: number }
export interface OcrWord { text: string; x: number; y: number; width: number; height: number }

/** Au plus 4 pixels d'écran par pixel d'image : au-delà, on n'apprendrait rien de plus. */
export const MAX_ZOOM = 4;
/** Côté le plus long de l'image de base, toujours demandée entière. */
export const BASE_SIDE = 1400;
/** Largeur maximale d'une région détaillée demandée. */
export const MAX_DETAIL_WIDTH = 2400;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Le zoom qui fait tenir l'image entière dans la fenêtre. */
export function fitZoom(image: Size, box: Size): number {
    if (image.width <= 0 || image.height <= 0 || box.width <= 0 || box.height <= 0) return 1;
    return Math.min(box.width / image.width, box.height / image.height);
}

export function clampZoom(zoom: number, fit: number): number { return clamp(zoom, fit, Math.max(MAX_ZOOM, fit)); }

/** Garde l'image dans la fenêtre : si elle est plus petite que la fenêtre dans un sens, elle y reste centrée. */
export function clampView(view: View, image: Size, box: Size): View {
    const fit = fitZoom(image, box);
    const zoom = clampZoom(view.zoom, fit);
    const halfW = box.width / (2 * zoom);
    const halfH = box.height / (2 * zoom);
    const cx = image.width <= 2 * halfW ? image.width / 2 : clamp(view.cx, halfW, image.width - halfW);
    const cy = image.height <= 2 * halfH ? image.height / 2 : clamp(view.cy, halfH, image.height - halfH);
    return { zoom, cx, cy };
}

export function fitView(image: Size, box: Size): View { return { zoom: fitZoom(image, box), cx: image.width / 2, cy: image.height / 2 }; }

/** Déplacement du doigt ou de la souris en pixels d'écran : l'image suit, donc le centre va dans l'autre sens. */
export function panBy(view: View, dx: number, dy: number, image: Size, box: Size): View {
    return clampView({ zoom: view.zoom, cx: view.cx - dx / view.zoom, cy: view.cy - dy / view.zoom }, image, box);
}

/** Zoom par un facteur, autour d'un point de la fenêtre (le point de l'image sous le curseur ne bouge pas). */
export function zoomAt(view: View, factor: number, anchor: { x: number; y: number }, image: Size, box: Size): View {
    const fit = fitZoom(image, box);
    const zoom = clampZoom(view.zoom * factor, fit);
    // point de l'image sous l'ancre avant le zoom
    const px = view.cx + (anchor.x - box.width / 2) / view.zoom;
    const py = view.cy + (anchor.y - box.height / 2) / view.zoom;
    return clampView({ zoom, cx: px - (anchor.x - box.width / 2) / zoom, cy: py - (anchor.y - box.height / 2) / zoom }, image, box);
}

/** La zone de l'image visible dans la fenêtre, en pixels d'image entiers et bornée à l'image. */
export function visibleRegion(view: View, image: Size, box: Size): Rect {
    const w = box.width / view.zoom;
    const h = box.height / view.zoom;
    const x = clamp(Math.floor(view.cx - w / 2), 0, Math.max(0, image.width - 1));
    const y = clamp(Math.floor(view.cy - h / 2), 0, Math.max(0, image.height - 1));
    return { x, y, width: clamp(Math.ceil(w) + 1, 1, image.width - x), height: clamp(Math.ceil(h) + 1, 1, image.height - y) };
}

/** Le côté le plus long de l'image de base, sans agrandir l'image. */
export function baseSide(image: Size): number { return Math.min(BASE_SIDE, Math.max(image.width, image.height)); }

/** Vrai quand l'image de base, étirée à ce zoom, manquerait de pixels : il faut demander la région en détail. */
export function needsDetail(view: View, image: Size): boolean {
    const baseScale = baseSide(image) / Math.max(image.width, image.height);
    // l'image de base couvre `baseScale` pixel par pixel d'image : à l'écran elle suffit tant que zoom <= baseScale
    return view.zoom > baseScale * 1.05;
}

/** Largeur à demander pour une région affichée à ce zoom (jamais plus que la région elle-même, ni que la limite). */
export function detailWidth(region: Rect, zoom: number, pixelRatio = 1): number {
    return clamp(Math.ceil(region.width * zoom * Math.max(1, pixelRatio)), 1, Math.min(region.width, MAX_DETAIL_WIDTH));
}

export const identifier = (fileId: string, frame: number) => `${fileId}-${Math.max(1, Math.trunc(frame))}`;
export const baseRequest = (side: number) => ({ region: "full", size: `!${Math.trunc(side)},${Math.trunc(side)}` });
export const regionRequest = (region: Rect, width: number) =>
    ({ region: `${Math.trunc(region.x)},${Math.trunc(region.y)},${Math.trunc(region.width)},${Math.trunc(region.height)}`, size: `${Math.trunc(width)},` });

/** Les mots d'une page d'annotations IIIF : le texte et la boîte `#xywh=x,y,w,h` de la cible. */
export function parseOcrPage(page: unknown): OcrWord[] {
    const items = (page as { items?: unknown } | null)?.items;
    if (!Array.isArray(items)) return [];
    const words: OcrWord[] = [];
    for (const item of items) {
        const record = item as { body?: { value?: unknown }; target?: unknown };
        const text = typeof record.body?.value === 'string' ? record.body.value : '';
        const target = typeof record.target === 'string' ? record.target : '';
        const m = /#xywh=(\d+),(\d+),(\d+),(\d+)$/.exec(target);
        if (!text || !m) continue;
        words.push({ text, x: Number(m[1]), y: Number(m[2]), width: Number(m[3]), height: Number(m[4]) });
    }
    return words;
}

const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Les mots qui contiennent l'un des termes cherchés (sans tenir compte de la casse ni des accents). */
export function matchWords(words: ReadonlyArray<OcrWord>, queryText: string, limit = 300): OcrWord[] {
    const terms = fold(queryText).split(/\s+/).filter(t => t.length >= 2);
    if (!terms.length) return [];
    const found: OcrWord[] = [];
    for (const word of words) {
        const text = fold(word.text);
        if (terms.some(t => text.includes(t))) { found.push(word); if (found.length >= limit) break; }
    }
    return found;
}

export function zoomText(view: View, fit: number): string {
    return fit > 0 ? `${Math.round((view.zoom / fit) * 100)} %` : '100 %';
}

/** Nom du fichier du manifeste téléchargé : `manifeste-iiif-<référence>.json`. */
export const manifestFileName = (reference: string): string => `manifeste-iiif-${reference.replace(/[^A-Za-z0-9._-]+/g, '_')}.json`;
