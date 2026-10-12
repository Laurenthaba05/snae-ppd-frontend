import { binarize, downscaleToArea, type GrayImage } from './barcodeImage.js';

/**
 * Code QR (ISO/IEC 18004), versions 1 à 10, sans dépendance : encodeur (numérique, alphanumérique, octets) et
 * décodeur (recherche des trois motifs de repérage, échantillonnage affine, correction Reed-Solomon).
 */
export type QrLevel = 'L' | 'M' | 'Q' | 'H';
const LEVELS: QrLevel[] = ['L', 'M', 'Q', 'H'];
const FORMAT_BITS: Record<QrLevel, number> = { L: 1, M: 0, Q: 3, H: 2 };
const MAX_VERSION = 10;

/** Groupes de blocs [nombre, mots de code par bloc, mots de données par bloc] par version (1 à 10) et niveau (L, M, Q, H) : tableau 9 de la norme ISO/IEC 18004. */
const EC_BLOCKS: number[][][][] = [
    [[[1,26,19]],[[1,26,16]],[[1,26,13]],[[1,26,9]]],
    [[[1,44,34]],[[1,44,28]],[[1,44,22]],[[1,44,16]]],
    [[[1,70,55]],[[1,70,44]],[[2,35,17]],[[2,35,13]]],
    [[[1,100,80]],[[2,50,32]],[[2,50,24]],[[4,25,9]]],
    [[[1,134,108]],[[2,67,43]],[[2,33,15],[2,34,16]],[[2,33,11],[2,34,12]]],
    [[[2,86,68]],[[4,43,27]],[[4,43,19]],[[4,43,15]]],
    [[[2,98,78]],[[4,49,31]],[[2,32,14],[4,33,15]],[[4,39,13],[1,40,14]]],
    [[[2,121,97]],[[2,60,38],[2,61,39]],[[4,40,18],[2,41,19]],[[4,40,14],[2,41,15]]],
    [[[2,146,116]],[[3,58,36],[2,59,37]],[[4,36,16],[4,37,17]],[[4,36,12],[4,37,13]]],
    [[[2,86,68],[2,87,69]],[[4,69,43],[1,70,44]],[[6,43,19],[2,44,20]],[[6,43,15],[2,44,16]]]
];
/** Positions des motifs d'alignement par version (1 à 10). */
const ALIGNMENT: number[][] = [
    [],
    [6,18],
    [6,22],
    [6,26],
    [6,30],
    [6,34],
    [6,22,38],
    [6,24,42],
    [6,26,46],
    [6,28,50]
];

/* ---------- Corps de Galois GF(256), polynôme 0x11D ---------- */
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]!; })();
const mul = (a: number, b: number) => a === 0 || b === 0 ? 0 : EXP[LOG[a]! + LOG[b]!]!;
const inv = (a: number) => EXP[255 - LOG[a]!]!;

function generator(degree: number): number[] {
    let poly = [1];
    for (let i = 0; i < degree; i++) {
        const next = new Array<number>(poly.length + 1).fill(0);
        for (let j = 0; j < poly.length; j++) { next[j] = next[j]! ^ mul(poly[j]!, 1); next[j + 1] = next[j + 1]! ^ mul(poly[j]!, EXP[i]!); }
        poly = next;
    }
    return poly;
}
export function rsEncode(data: number[], ecCount: number): number[] {
    const gen = generator(ecCount);
    const rem = new Array<number>(ecCount).fill(0);
    for (const byte of data) {
        const factor = byte ^ rem.shift()!;
        rem.push(0);
        for (let i = 0; i < ecCount; i++) rem[i] = rem[i]! ^ mul(gen[i + 1]!, factor);
    }
    return rem;
}
/** Corrige les erreurs d'un bloc (données + contrôle) ; renvoie false s'il y en a trop. */
export function rsCorrect(block: number[], ecCount: number): boolean {
    const n = block.length;
    const syndromes = new Array<number>(ecCount).fill(0);
    let clean = true;
    for (let i = 0; i < ecCount; i++) {
        let s = 0;
        for (let j = 0; j < n; j++) s = mul(s, EXP[i]!) ^ block[j]!;
        syndromes[i] = s;
        if (s !== 0) clean = false;
    }
    if (clean) return true;
    // Berlekamp-Massey
    let sigma = [1], previous = [1], l = 0, m = 1, b = 1;
    for (let i = 0; i < ecCount; i++) {
        let d = syndromes[i]!;
        for (let j = 1; j <= l; j++) d ^= mul(sigma[j] ?? 0, syndromes[i - j]!);
        if (d === 0) { m++; continue; }
        const t = [...sigma];
        const factor = mul(d, inv(b));
        while (sigma.length < previous.length + m) sigma.push(0);
        for (let j = 0; j < previous.length; j++) sigma[j + m] = sigma[j + m]! ^ mul(factor, previous[j]!);
        if (2 * l <= i) { l = i + 1 - l; previous = t; b = d; m = 1; } else m++;
    }
    if (l * 2 > ecCount) return false;
    const positions: number[] = [];
    for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let j = 0; j < sigma.length; j++) sum ^= mul(sigma[j]!, EXP[(255 - i) * j % 255]!);
        if (sum === 0) positions.push(n - 1 - i);
    }
    if (positions.length !== l) return false;
    // Forney : évaluateur Omega = S(x) * sigma(x) mod x^ecCount
    const omega = new Array<number>(ecCount).fill(0);
    for (let i = 0; i < ecCount; i++) for (let j = 0; j < sigma.length && j <= i; j++) omega[i] = omega[i]! ^ mul(sigma[j]!, syndromes[i - j]!);
    for (const position of positions) {
        const xInv = EXP[(255 - (n - 1 - position)) % 255]!;
        let num = 0, den = 0;
        for (let j = 0; j < omega.length; j++) num ^= mul(omega[j]!, EXP[(LOG[xInv]! * j) % 255]!);
        for (let j = 1; j < sigma.length; j += 2) den ^= mul(sigma[j]!, EXP[(LOG[xInv]! * (j - 1)) % 255]!);
        if (den === 0) return false;
        // Premier zéro α^0 : valeur d'erreur = X · Ω(X⁻¹) / σ'(X⁻¹), avec X = α^(n-1-position).
        block[position] = block[position]! ^ mul(EXP[n - 1 - position]!, mul(num, inv(den)));
    }
    // Contrôle final : plus aucune erreur.
    for (let i = 0; i < ecCount; i++) { let s = 0; for (let j = 0; j < n; j++) s = mul(s, EXP[i]!) ^ block[j]!; if (s !== 0) return false; }
    return true;
}

/* ---------- Structure d'un symbole ---------- */
const sizeOf = (version: number) => 17 + 4 * version;
const groups = (version: number, level: QrLevel) => EC_BLOCKS[version - 1]![LEVELS.indexOf(level)]!;
const dataCodewords = (version: number, level: QrLevel) => groups(version, level).reduce((n, [count, , data]) => n + count! * data!, 0);

/** Modules fonctionnels (repérage, synchronisation, alignement, formats, version) : true = réservé. */
function functionMask(version: number): boolean[][] {
    const size = sizeOf(version);
    const mask = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
    const rect = (r0: number, c0: number, h: number, w: number) => { for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) if (r >= 0 && c >= 0 && r < size && c < size) mask[r]![c] = true; };
    rect(0, 0, 9, 9); rect(0, size - 8, 9, 8); rect(size - 8, 0, 8, 9);   // repérages, séparateurs et formats
    for (let i = 0; i < size; i++) { mask[6]![i] = true; mask[i]![6] = true; }
    const positions = ALIGNMENT[version - 1]!;
    for (const r of positions) for (const c of positions) {
        if ((r === positions[0] && c === positions[0]) || (r === positions[0] && c === positions[positions.length - 1]) || (r === positions[positions.length - 1] && c === positions[0])) continue;
        rect(r - 2, c - 2, 5, 5);
    }
    if (version >= 7) { rect(0, size - 11, 6, 3); rect(size - 11, 0, 3, 6); }
    return mask;
}

const MASKS: Array<(r: number, c: number) => boolean> = [
    (r, c) => (r + c) % 2 === 0, r => r % 2 === 0, (_, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => (r * c) % 2 + (r * c) % 3 === 0,
    (r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0, (r, c) => ((r + c) % 2 + (r * c) % 3) % 2 === 0
];

function formatBits(level: QrLevel, mask: number): number {
    const data = (FORMAT_BITS[level] << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    return ((data << 10) | rem) ^ 0x5412;
}
function versionBits(version: number): number {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    return (version << 12) | rem;
}

/** Positions (ligne, colonne) des 15 bits du format dans chacune des deux copies, du bit 0 au bit 14. */
function formatCells(size: number): Array<Array<[number, number]>> {
    const first: Array<[number, number]> = [];
    for (let i = 0; i <= 5; i++) first.push([i, 8]);
    first.push([7, 8], [8, 8], [8, 7]);
    for (let i = 9; i < 15; i++) first.push([8, 14 - i]);
    const second: Array<[number, number]> = [];
    for (let i = 0; i < 8; i++) second.push([8, size - 1 - i]);
    for (let i = 8; i < 15; i++) second.push([size - 15 + i, 8]);
    return [first, second];
}

/* ---------- Encodeur ---------- */
const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
type Mode = 'numeric' | 'alphanumeric' | 'byte';
const lengthBits = (mode: Mode, version: number) => ({ numeric: version < 10 ? 10 : 12, alphanumeric: version < 10 ? 9 : 11, byte: version < 10 ? 8 : 16 })[mode];

class BitBuffer {
    readonly bits: number[] = [];
    put(value: number, length: number) { for (let i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1); }
}

function encodeData(text: string): { mode: Mode; bytes: number[]; count: number } {
    const mode: Mode = /^[0-9]*$/.test(text) ? 'numeric' : [...text].every(c => ALNUM.includes(c)) ? 'alphanumeric' : 'byte';
    const bytes = mode === 'byte' ? [...new TextEncoder().encode(text)] : [];
    return { mode, bytes, count: mode === 'byte' ? bytes.length : text.length };
}

/** Matrice (true = module noir) d'un code QR contenant `text` ; la plus petite version qui convient. */
export function encodeQr(text: string, level: QrLevel = 'M'): boolean[][] {
    if (!text.length) throw new Error('Texte vide.');
    const { mode, bytes, count } = encodeData(text);
    let version = 1;
    const dataBits = mode === 'numeric' ? Math.floor(count / 3) * 10 + [0, 4, 7][count % 3]! : mode === 'alphanumeric' ? Math.floor(count / 2) * 11 + (count % 2) * 6 : count * 8;
    for (; version <= MAX_VERSION; version++) if (4 + lengthBits(mode, version) + dataBits <= dataCodewords(version, level) * 8) break;
    if (version > MAX_VERSION) throw new Error('Texte trop long pour un code QR de version 10.');
    const buffer = new BitBuffer();
    buffer.put({ numeric: 1, alphanumeric: 2, byte: 4 }[mode], 4);
    buffer.put(count, lengthBits(mode, version));
    if (mode === 'numeric') for (let i = 0; i < text.length; i += 3) { const chunk = text.slice(i, i + 3); buffer.put(Number(chunk), chunk.length * 3 + 1); }
    else if (mode === 'alphanumeric') for (let i = 0; i < text.length; i += 2) { if (i + 1 < text.length) buffer.put(ALNUM.indexOf(text[i]!) * 45 + ALNUM.indexOf(text[i + 1]!), 11); else buffer.put(ALNUM.indexOf(text[i]!), 6); }
    else for (const byte of bytes) buffer.put(byte, 8);
    const capacity = dataCodewords(version, level) * 8;
    buffer.put(0, Math.min(4, capacity - buffer.bits.length));
    while (buffer.bits.length % 8) buffer.bits.push(0);
    const data: number[] = [];
    for (let i = 0; i < buffer.bits.length; i += 8) data.push(parseInt(buffer.bits.slice(i, i + 8).join(''), 2));
    for (let pad = 0xec; data.length < capacity / 8; pad ^= 0xec ^ 0x11) data.push(pad);
    // Blocs, contrôle Reed-Solomon et entrelacement.
    const blocks: Array<{ data: number[]; ec: number[] }> = [];
    let at = 0;
    for (const [n, total, dataPer] of groups(version, level)) for (let i = 0; i < n!; i++) {
        const part = data.slice(at, at + dataPer!); at += dataPer!;
        blocks.push({ data: part, ec: rsEncode(part, total! - dataPer!) });
    }
    const codewords: number[] = [];
    const longest = Math.max(...blocks.map(b => b.data.length));
    for (let i = 0; i < longest; i++) for (const b of blocks) if (i < b.data.length) codewords.push(b.data[i]!);
    for (let i = 0; i < blocks[0]!.ec.length; i++) for (const b of blocks) codewords.push(b.ec[i]!);

    const size = sizeOf(version);
    const reserved = functionMask(version);
    const base = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
    const finder = (r0: number, c0: number) => { for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) { const r = r0 + dr, c = c0 + dc; if (r < 0 || c < 0 || r >= size || c >= size) continue; const dist = Math.max(Math.abs(dr - 3), Math.abs(dc - 3)); base[r]![c] = dist !== 2 && dist !== 4; } };
    finder(0, 0); finder(0, size - 7); finder(size - 7, 0);
    for (let i = 8; i < size - 8; i++) { base[6]![i] = i % 2 === 0; base[i]![6] = i % 2 === 0; }
    const positions = ALIGNMENT[version - 1]!;
    for (const r of positions) for (const c of positions) {
        if ((r === positions[0] && c === positions[0]) || (r === positions[0] && c === positions[positions.length - 1]) || (r === positions[positions.length - 1] && c === positions[0])) continue;
        for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) base[r + dr]![c + dc] = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
    }
    base[size - 8]![8] = true;
    if (version >= 7) { const bits = versionBits(version); for (let i = 0; i < 18; i++) { const dark = ((bits >>> i) & 1) === 1, a = size - 11 + (i % 3), b = Math.floor(i / 3); base[a]![b] = dark; base[b]![a] = dark; } }
    // Placement des données en zigzag.
    const placed = base.map(row => [...row]);
    let bit = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
        if (right === 6) right = 5;
        for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
            const c = right - j, r = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
            if (!reserved[r]![c] && bit < codewords.length * 8) { placed[r]![c] = ((codewords[bit >>> 3]! >>> (7 - (bit & 7))) & 1) === 1; bit++; }
        }
    }
    // Choix du masque : pénalité minimale.
    let best: boolean[][] | null = null, bestScore = Infinity;
    for (let mask = 0; mask < 8; mask++) {
        const candidate = placed.map(row => [...row]);
        for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (!reserved[r]![c] && MASKS[mask]!(r, c)) candidate[r]![c] = !candidate[r]![c];
        const bits = formatBits(level, mask);
        for (const cells of formatCells(size)) cells.forEach(([r, c], i) => { candidate[r]![c] = ((bits >>> i) & 1) === 1; });
        candidate[size - 8]![8] = true;
        const score = penalty(candidate);
        if (score < bestScore) { bestScore = score; best = candidate; }
    }
    return best!;
}

function penalty(m: boolean[][]): number {
    const size = m.length;
    let score = 0;
    for (const vertical of [false, true]) for (let a = 0; a < size; a++) {
        let run = 1, window = 0;
        for (let b = 0; b < size; b++) {
            const dark = vertical ? m[b]![a]! : m[a]![b]!;
            if (b > 0) { const prev = vertical ? m[b - 1]![a]! : m[a]![b - 1]!; if (dark === prev) { run++; if (run === 5) score += 3; else if (run > 5) score++; } else run = 1; }
            window = ((window << 1) | (dark ? 1 : 0)) & 0x7ff;
            if (b >= 10 && (window === 0b10111010000 || window === 0b00001011101)) score += 40;
        }
    }
    let dark = 0;
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
        if (m[r]![c]) dark++;
        if (r + 1 < size && c + 1 < size && m[r]![c] === m[r + 1]![c] && m[r]![c] === m[r]![c + 1] && m[r]![c] === m[r + 1]![c + 1]) score += 3;
    }
    const total = size * size;
    return score + (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
}

/* ---------- Décodeur ---------- */
const VALID_FORMATS = (() => { const list: Array<{ bits: number; level: QrLevel; mask: number }> = []; for (const level of LEVELS) for (let mask = 0; mask < 8; mask++) list.push({ bits: formatBits(level, mask), level, mask }); return list; })();
const popcount = (n: number) => { let c = 0; while (n) { c += n & 1; n >>>= 1; } return c; };

/** Lit les modules d'une matrice déjà échantillonnée (true = noir). */
export function decodeQrMatrix(m: boolean[][]): string | null {
    const size = m.length;
    if ((size - 17) % 4 !== 0) return null;
    const version = (size - 17) / 4;
    if (version < 1 || version > MAX_VERSION) return null;
    // Format : les deux copies, corrigées par distance de Hamming (jusqu'à 3 erreurs).
    let best: { level: QrLevel; mask: number } | null = null, bestDistance = 4;
    for (const cells of formatCells(size)) {
        let read = 0;
        cells.forEach(([r, c], i) => { if (m[r]![c]) read |= 1 << i; });
        for (const f of VALID_FORMATS) { const d = popcount(read ^ f.bits); if (d < bestDistance) { bestDistance = d; best = f; } }
    }
    if (!best) return null;
    const reserved = functionMask(version);
    const bits: number[] = [];
    for (let right = size - 1; right >= 1; right -= 2) {
        if (right === 6) right = 5;
        for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
            const c = right - j, r = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
            if (reserved[r]![c]) continue;
            bits.push(m[r]![c]! !== MASKS[best.mask]!(r, c) ? 1 : 0);
        }
    }
    const codewords: number[] = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) { let v = 0; for (let k = 0; k < 8; k++) v = (v << 1) | bits[i + k]!; codewords.push(v); }
    const layout = groups(version, best.level);
    const blocks: number[][] = [];
    for (const [n, total] of layout) for (let i = 0; i < n!; i++) blocks.push(new Array<number>(total!));
    const dataLengths = layout.flatMap(([n, , data]) => new Array<number>(n!).fill(data!));
    const ecLength = layout[0]![1]! - layout[0]![2]!;
    let at = 0;
    const longest = Math.max(...dataLengths);
    for (let i = 0; i < longest; i++) blocks.forEach((block, bi) => { if (i < dataLengths[bi]!) block[i] = codewords[at++]!; });
    for (let i = 0; i < ecLength; i++) blocks.forEach((block, bi) => { block[dataLengths[bi]! + i] = codewords[at++]!; });
    const data: number[] = [];
    for (let bi = 0; bi < blocks.length; bi++) {
        if (blocks[bi]!.some(v => v === undefined) || !rsCorrect(blocks[bi]!, ecLength)) return null;
        data.push(...blocks[bi]!.slice(0, dataLengths[bi]!));
    }
    return parseSegments(data, version);
}

function parseSegments(data: number[], version: number): string | null {
    let pos = 0;
    const total = data.length * 8;
    const take = (n: number): number => { let v = 0; for (let i = 0; i < n; i++, pos++) v = (v << 1) | ((data[pos >>> 3]! >>> (7 - (pos & 7))) & 1); return v; };
    let out = '';
    while (pos + 4 <= total) {
        const mode = take(4);
        if (mode === 0) break;
        if (mode === 1) { let n = take(lengthBits('numeric', version)); while (n >= 3) { out += String(take(10)).padStart(3, '0'); n -= 3; } if (n === 2) out += String(take(7)).padStart(2, '0'); else if (n === 1) out += String(take(4)); }
        else if (mode === 2) { let n = take(lengthBits('alphanumeric', version)); while (n >= 2) { const v = take(11); out += ALNUM[Math.floor(v / 45)]! + ALNUM[v % 45]!; n -= 2; } if (n === 1) out += ALNUM[take(6)] ?? ''; }
        else if (mode === 4) { const n = take(lengthBits('byte', version)); const bytes = new Uint8Array(n); for (let i = 0; i < n; i++) bytes[i] = take(8); out += new TextDecoder().decode(bytes); }
        else if (mode === 7) { const first = take(8); take(first & 0x80 ? ((first & 0x40) ? 16 : 8) : 0); }
        else return null;   // kanji, structured append, FNC1 : non pris en charge
    }
    return out;
}

export interface Finder { x: number; y: number; size: number; hits: number }

export function findFinders(bin: Uint8Array, w: number, h: number): Finder[] {
    const found: Finder[] = [];
    const matches = (runs: number[]) => {
        const total = runs[0]! + runs[1]! + runs[2]! + runs[3]! + runs[4]!;
        if (total < 7) return 0;
        const unit = total / 7, tolerance = unit * 0.6;
        return Math.abs(runs[0]! - unit) < tolerance && Math.abs(runs[1]! - unit) < tolerance && Math.abs(runs[2]! - 3 * unit) < 3 * tolerance && Math.abs(runs[3]! - unit) < tolerance && Math.abs(runs[4]! - unit) < tolerance ? unit : 0;
    };
    const crossCheck = (cx: number, cy: number, vertical: boolean, unit: number): number => {
        // Compte le motif 1:1:3:1:1 de part et d'autre du centre dans l'autre direction.
        const length = vertical ? h : w;
        const at = (i: number) => vertical ? bin[i * w + cx]! : bin[cy * w + i]!;
        const center = vertical ? cy : cx;
        if (!at(center)) return 0;
        const runs = [0, 0, 0, 0, 0];
        let i = center;
        while (i >= 0 && at(i)) { runs[2]!++; i--; }
        while (i >= 0 && !at(i)) { runs[1]!++; i--; }
        while (i >= 0 && at(i)) { runs[0]!++; i--; }
        i = center + 1;
        while (i < length && at(i)) { runs[2]!++; i++; }
        while (i < length && !at(i)) { runs[3]!++; i++; }
        while (i < length && at(i)) { runs[4]!++; i++; }
        const u = matches(runs);
        return u && Math.abs(u - unit) < unit * 0.8 ? u : 0;
    };
    // Recherche par fenêtre glissante sur les longueurs de plages de chaque ligne.
    for (let y = 0; y < h; y++) {
        const lengths: number[] = [], starts: number[] = [];
        let x = 0;
        while (x < w) { const color = bin[y * w + x]!; let j = x; while (j < w && bin[y * w + j] === color) j++; lengths.push(j - x); starts.push(x); x = j; }
        const firstDark = bin[y * w]! === 1 ? 0 : 1;
        for (let i = firstDark; i + 4 < lengths.length; i += 2) {
            const unit = matches(lengths.slice(i, i + 5));
            if (!unit) continue;
            const cx = Math.round(starts[i + 2]! + lengths[i + 2]! / 2);
            const verticalUnit = crossCheck(cx, y, true, unit);
            if (!verticalUnit) continue;
            // Centre vertical précis : remonter jusqu'au milieu du motif central.
            let top = y, bottom = y;
            while (top > 0 && bin[(top - 1) * w + cx]) top--;
            while (bottom < h - 1 && bin[(bottom + 1) * w + cx]) bottom++;
            const cy = Math.round((top + bottom) / 2);
            const horizontalUnit = crossCheck(cx, cy, false, unit);
            if (!horizontalUnit) continue;
            const size = (unit + verticalUnit) / 2;
            const near = found.find(f => Math.abs(f.x - cx) < size * 2.5 && Math.abs(f.y - cy) < size * 2.5 && Math.abs(f.size - size) < size);
            if (near) { near.x = (near.x * near.hits + cx) / (near.hits + 1); near.y = (near.y * near.hits + cy) / (near.hits + 1); near.size = (near.size * near.hits + size) / (near.hits + 1); near.hits++; }
            else found.push({ x: cx, y: cy, size, hits: 1 });
        }
    }
    return found.filter(f => f.hits >= 2);
}

/** Cherche un code QR dans l'image et renvoie son contenu. */
export function readQrOnce(image: GrayImage): string[] {
    const { width: w, height: h } = image;
    const bin = binarize(image);
    const finders = findFinders(bin, w, h);
    const results = new Set<string>();
    if (finders.length < 3) return [];
    const triples: Array<{ score: number; tl: Finder; tr: Finder; bl: Finder }> = [];
    for (let i = 0; i < finders.length; i++) for (let j = i + 1; j < finders.length; j++) for (let k = j + 1; k < finders.length; k++) {
        const set = [finders[i]!, finders[j]!, finders[k]!];
        const d = (a: Finder, b: Finder) => Math.hypot(a.x - b.x, a.y - b.y);
        // Le sommet de l'angle droit est le point opposé au côté le plus long.
        const sides = [d(set[1]!, set[2]!), d(set[0]!, set[2]!), d(set[0]!, set[1]!)];
        const apex = sides.indexOf(Math.max(...sides));
        const tl = set[apex]!, others = set.filter((_, n) => n !== apex) as [Finder, Finder];
        const a = d(tl, others[0]), b = d(tl, others[1]), hyp = d(others[0], others[1]);
        if (Math.abs(a - b) > 0.25 * Math.max(a, b) || Math.abs(hyp - Math.SQRT2 * (a + b) / 2) > 0.2 * hyp) continue;
        const sizes = set.map(f => f.size);
        if (Math.max(...sizes) > Math.min(...sizes) * 1.5) continue;
        let [tr, bl] = others;
        const cross = (tr.x - tl.x) * (bl.y - tl.y) - (tr.y - tl.y) * (bl.x - tl.x);
        if (cross < 0) [tr, bl] = [bl, tr];
        triples.push({ score: Math.abs(a - b) + Math.abs(hyp - Math.SQRT2 * (a + b) / 2), tl, tr, bl });
    }
    triples.sort((p, q) => p.score - q.score);
    for (const { tl, tr, bl } of triples.slice(0, 4)) {
        const unit = (tl.size + tr.size + bl.size) / 3;
        const span = (Math.hypot(tr.x - tl.x, tr.y - tl.y) + Math.hypot(bl.x - tl.x, bl.y - tl.y)) / 2;
        const estimate = span / unit + 7;
        for (const dimension of [Math.round((estimate - 17) / 4) * 4 + 17, Math.floor((estimate - 17) / 4) * 4 + 17, Math.ceil((estimate - 17) / 4) * 4 + 17]) {
            if (dimension < 21 || dimension > sizeOf(MAX_VERSION)) continue;
            const matrix = sample(bin, w, h, tl, tr, bl, dimension, unit);
            const text = decodeQrMatrix(matrix);
            if (text) { results.add(text); break; }
        }
    }
    return [...results];
}

export function sample(bin: Uint8Array, w: number, h: number, tl: Finder, tr: Finder, bl: Finder, dimension: number, unit: number): boolean[][] {
    const step = dimension - 7;
    const matrix: boolean[][] = [];
    const px = (x: number, y: number) => { const ix = Math.round(x), iy = Math.round(y); return ix >= 0 && iy >= 0 && ix < w && iy < h ? bin[iy * w + ix]! : 0; };
    const offsets = unit >= 3 ? [-0.25, 0, 0.25] : [0];
    for (let r = 0; r < dimension; r++) {
        const row: boolean[] = [];
        for (let c = 0; c < dimension; c++) {
            const u = (c - 3) / step, v = (r - 3) / step;
            const x = tl.x + u * (tr.x - tl.x) + v * (bl.x - tl.x), y = tl.y + u * (tr.y - tl.y) + v * (bl.y - tl.y);
            let dark = 0, total = 0;
            for (const dy of offsets) for (const dx of offsets) {
                const ex = (tr.x - tl.x) / step, ey = (tr.y - tl.y) / step, fx = (bl.x - tl.x) / step, fy = (bl.y - tl.y) / step;
                dark += px(x + dx * ex + dy * fx, y + dx * ey + dy * fy); total++;
            }
            row.push(dark * 2 > total);
        }
        matrix.push(row);
    }
    return matrix;
}

/** Lit les codes QR d'une image, d'abord à taille réduite (rapide), puis à pleine taille si rien n'est trouvé. */
export function readQr(image: GrayImage): string[] {
    for (const maxPixels of [2_000_000, 8_000_000, 16_000_000]) {
        const scaled = downscaleToArea(image, maxPixels);
        const found = readQrOnce(scaled);
        if (found.length || scaled === image) return found;
    }
    return [];
}
