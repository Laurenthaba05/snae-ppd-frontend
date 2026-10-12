import { encodeCode128 } from './code128.js';
import { encodeQr } from './qrcode.js';
import { buildCode, type CodeKind } from './scanCodes.js';

/** Feuilles imprimables (A4) portant les codes : feuilles séparatrices d'éléments et feuilles de lot. */
export interface SheetSpec {
    kind: CodeKind;
    id: string;
    /** Intitulé principal (description de l'élément, nom du lot). */
    title: string;
    /** Lignes d'information imprimées sous le titre (projet, lot, pages attendues…). */
    details: string[];
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** QR en SVG (millimètres) : un tracé par suite horizontale de modules noirs. */
export function qrSvg(text: string, moduleMm = 1.4, quiet = 4): string {
    const matrix = encodeQr(text, 'M');
    const n = matrix.length, size = n + quiet * 2;
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        if (!matrix[r]![c]) continue;
        let end = c;
        while (end + 1 < n && matrix[r]![end + 1]) end++;
        d += `M${c + quiet} ${r + quiet}h${end - c + 1}v1h-${end - c + 1}z`;
        c = end;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size * moduleMm}mm" height="${size * moduleMm}mm" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="Code QR ${escapeHtml(text)}"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

/** Code 128 en SVG (millimètres), avec zones de silence de 10 modules. */
export function code128Svg(text: string, moduleMm = 0.5, heightMm = 18): string {
    const modules = encodeCode128(text), quiet = 10, width = modules.length + quiet * 2;
    let d = '';
    for (let i = 0; i < modules.length; i++) {
        if (!modules[i]) continue;
        let end = i;
        while (end + 1 < modules.length && modules[end + 1]) end++;
        d += `M${i + quiet} 0h${end - i + 1}v1h-${end - i + 1}z`;
        i = end;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width * moduleMm}mm" height="${heightMm}mm" viewBox="0 0 ${width} 1" preserveAspectRatio="none" shape-rendering="crispEdges" role="img" aria-label="Code 128 ${escapeHtml(text)}"><rect width="${width}" height="1" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

const LABELS: Record<CodeKind, { heading: string; instruction: string }> = {
    ELEMENT: { heading: 'FEUILLE SÉPARATRICE — ÉLÉMENT', instruction: 'Placez cette feuille juste avant le premier document de l’élément, puis numérisez le tout d’un seul passage. Cette feuille ne sera pas conservée comme page.' },
    LOT: { heading: 'FEUILLE DE LOT', instruction: 'Placez cette feuille en tête du lot : elle permet de vérifier que les fichiers importés appartiennent bien à ce lot. Elle ne sera pas conservée comme page.' }
};

export function sheetHtml(sheet: SheetSpec): string {
    const long = buildCode(sheet.kind, sheet.id, 'long'), short = buildCode(sheet.kind, sheet.id, 'short');
    const label = LABELS[sheet.kind];
    return `<section class="sheet"><p class="heading">${label.heading}</p><h1>${escapeHtml(sheet.title)}</h1>${sheet.details.map(l => `<p class="detail">${escapeHtml(l)}</p>`).join('')}
<div class="qr">${qrSvg(long, 1.5)}</div><p class="code">${escapeHtml(long)}</p>
<div class="linear">${code128Svg(short, 0.5, 18)}</div><p class="code">${escapeHtml(short)}</p>
<p class="instruction">${escapeHtml(label.instruction)}</p></section>`;
}

/** Document HTML complet (une feuille A4 par élément) prêt à imprimer. */
export function sheetsDocument(title: string, sheets: SheetSpec[]): string {
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
@page{size:A4;margin:14mm}*{box-sizing:border-box}body{margin:0;font-family:Segoe UI,Arial,sans-serif;color:#000}
.sheet{page-break-after:always;break-after:page;min-height:260mm;display:flex;flex-direction:column;align-items:center;text-align:center;gap:4mm}
.sheet:last-child{page-break-after:auto;break-after:auto}.heading{margin:6mm 0 0;font-size:11pt;letter-spacing:.12em;font-weight:700}
h1{margin:0;font-size:22pt;line-height:1.2}.detail{margin:0;font-size:11pt}.qr{margin-top:8mm}.code{margin:0;font:600 10pt Consolas,monospace;letter-spacing:.03em}
.linear{margin-top:6mm}.instruction{margin-top:auto;font-size:10pt;max-width:150mm}svg{display:block}
</style></head><body>${sheets.map(sheetHtml).join('\n')}</body></html>`;
}
