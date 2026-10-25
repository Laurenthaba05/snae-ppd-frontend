import { code128Svg, qrSvg } from './codeSheets.js';

/* Étiquettes des archives physiques et de leurs unités de rangement : un QR qui porte l'identifiant, un Code 128 qui porte la cote.
   Le QR désigne sans ambiguïté (les cotes ne sont uniques que chez leur propriétaire) ; le Code 128 se lit avec n'importe quelle douchette, qui « tape » la cote dans la recherche. */

export type LabelKind = 'ARCHIVE' | 'UNIT';

const LETTER: Record<LabelKind, string> = { ARCHIVE: 'A', UNIT: 'U' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Le texte du QR : `SNAE:A:<identifiant>` pour une archive, `SNAE:U:<identifiant>` pour une unité de rangement (UUID en majuscules). */
export function physicalCode(kind: LabelKind, id: string): string {
    if (!UUID.test(id)) throw new Error('Identifiant invalide : un UUID est attendu.');
    return `SNAE:${LETTER[kind]}:${id.toUpperCase()}`;
}

/** Interprète ce que lit une douchette ou un téléphone : un code d'archive ou d'unité, sinon rien (c'est alors une cote, à chercher comme telle). */
export function parsePhysicalCode(text: string): { kind: LabelKind; id: string } | null {
    const match = /^SNAE:([AU]):([0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12})$/i.exec(text.trim());
    return match ? { kind: match[1]!.toUpperCase() === 'A' ? 'ARCHIVE' : 'UNIT', id: match[2]!.toLowerCase() } : null;
}

/** Au-delà, le Code 128 ne tiendrait plus sur une étiquette de 70 mm avec des barres assez larges pour une douchette : l'étiquette n'a alors que son QR et sa cote. */
export const BARCODE_MAX = 22;

/**
 * Ce que le Code 128 porte : la cote, sans accents (le Code 128 ne code que l'ASCII imprimable, et la recherche ne tient pas compte des accents). Rien si la cote contient autre chose
 * (alors l'étiquette n'a que son QR et sa cote en toutes lettres).
 */
export function barcodeText(cote: string): string | null {
    const folded = cote.normalize('NFD').replace(/\p{M}+/gu, '').replace(/œ/g, 'oe').replace(/Œ/g, 'OE').replace(/æ/g, 'ae').replace(/Æ/g, 'AE').trim();
    return folded.length > 0 && folded.length <= BARCODE_MAX && /^[\x20-\x7e]+$/.test(folded) ? folded : null;
}

/** Ce qu'une étiquette imprime. */
export interface LabelSpec {
    kind: LabelKind;
    id: string;
    cote: string;
    /** L'intitulé d'une archive, le type d'une unité (« Boîte »…). */
    title: string | null;
    /** Le chemin du lieu, du plus large au plus fin. */
    place: string;
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function labelHtml(label: LabelSpec): string {
    const bar = barcodeText(label.cote);
    return `<div class="label${label.kind === 'UNIT' ? ' unit' : ''}"><div class="top"><div class="qr">${qrSvg(physicalCode(label.kind, label.id), 0.9, 1)}</div><div class="text">`
        + `<p class="cote">${escapeHtml(label.cote)}</p>${label.title ? `<p class="title">${escapeHtml(label.title)}</p>` : ''}<p class="place">${escapeHtml(label.place)}</p></div></div>`
        + `${bar ? `<div class="linear">${code128Svg(bar, 0.24, 7)}</div>` : ''}</div>`;
}

/** Une planche A4 d'étiquettes (3 colonnes × 8 lignes de 70 × 36 mm), prête à imprimer ; chaque étiquette reste d'un seul tenant. */
export function labelsDocument(title: string, labels: readonly LabelSpec[]): string {
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
@page{size:A4;margin:10mm 0}*{box-sizing:border-box}body{margin:0;font-family:Segoe UI,Arial,sans-serif;color:#000}
.grid{display:grid;grid-template-columns:repeat(3,70mm);grid-auto-rows:36mm;justify-content:center}
.label{display:flex;flex-direction:column;justify-content:space-between;padding:2mm;border:.2mm dashed #bbb;overflow:hidden;break-inside:avoid;page-break-inside:avoid}
.label .top{display:flex;align-items:center;gap:2mm}.label .qr svg{display:block;width:20mm;height:20mm}.label .text{min-width:0;flex:1}
.label p{margin:0}.label .cote{font:700 11pt Consolas,monospace;word-break:break-all}.label .title{font-size:8pt;line-height:1.15;max-height:9mm;overflow:hidden}
.label .place{font-size:6.5pt;color:#333;line-height:1.15;max-height:8mm;overflow:hidden}.label .linear{margin-top:1mm;text-align:center}.label .linear svg{display:inline-block;max-width:100%}
.label.unit .cote{font-size:13pt}
</style></head><body><div class="grid">${labels.map(labelHtml).join('')}</div></body></html>`;
}
