import { transpose, type GrayImage } from './barcodeImage.js';

/**
 * Code 128 : encodeur (jeu B) et décodeur (jeux A, B et C) sans dépendance.
 * Les motifs viennent de la norme ISO/IEC 15417 (valeurs 0 à 105, 11 modules chacune) ; l'arrêt compte 13 modules.
 */
const PATTERNS: readonly string[] = [
    '11011001100', '11001101100', '11001100110', '10010011000', '10010001100', '10001001100',
    '10011001000', '10011000100', '10001100100', '11001001000', '11001000100', '11000100100',
    '10110011100', '10011011100', '10011001110', '10111001100', '10011101100', '10011100110',
    '11001110010', '11001011100', '11001001110', '11011100100', '11001110100', '11101101110',
    '11101001100', '11100101100', '11100100110', '11101100100', '11100110100', '11100110010',
    '11011011000', '11011000110', '11000110110', '10100011000', '10001011000', '10001000110',
    '10110001000', '10001101000', '10001100010', '11010001000', '11000101000', '11000100010',
    '10110111000', '10110001110', '10001101110', '10111011000', '10111000110', '10001110110',
    '11101110110', '11010001110', '11000101110', '11011101000', '11011100010', '11011101110',
    '11101011000', '11101000110', '11100010110', '11101101000', '11101100010', '11100011010',
    '11101111010', '11001000010', '11110001010', '10100110000', '10100001100', '10010110000',
    '10010000110', '10000101100', '10000100110', '10110010000', '10110000100', '10011010000',
    '10011000010', '10000110100', '10000110010', '11000010010', '11001010000', '11110111010',
    '11000010100', '10001111010', '10100111100', '10010111100', '10010011110', '10111100100',
    '10011110100', '10011110010', '11110100100', '11110010100', '11110010010', '11011011110',
    '11011110110', '11110110110', '10101111000', '10100011110', '10001011110', '10111101000',
    '10111100010', '11110101000', '11110100010', '10111011110', '10111101110', '11101011110',
    '11110101110', '11010000100', '11010010000', '11010011100'
];
const STOP = '1100011101011';
/** Motifs 0 à 105 puis le motif d'arrêt (valeur 106), utilisés pour reconnaître chaque symbole. */
const SYMBOLS: readonly string[] = [...PATTERNS, STOP.slice(0, 11)];
const START_A = 103, START_B = 104, START_C = 105, STOP_VALUE = 106;

/** Modules (true = barre) d'un Code 128 jeu B, sans zone de silence. Caractères ASCII 32 à 126. */
export function encodeCode128(text: string): boolean[] {
    if (!text.length) throw new Error('Texte vide.');
    const values: number[] = [START_B];
    for (const ch of text) {
        const code = ch.codePointAt(0)!;
        if (code < 32 || code > 126) throw new Error('Code 128 : caractère non pris en charge (ASCII imprimable uniquement).');
        values.push(code - 32);
    }
    let check = START_B;
    for (let i = 1; i < values.length; i++) check += values[i]! * i;
    values.push(check % 103);
    return [...values.map(v => PATTERNS[v]!).join('') + STOP].map(c => c === '1');
}

// Largeurs (en modules) des 6 plages d'un motif : barre, espace, barre, espace, barre, espace.
const WIDTHS: number[][] = SYMBOLS.map(p => { const w: number[] = []; let run = 1; for (let i = 1; i < p.length; i++) { if (p[i] === p[i - 1]) run++; else { w.push(run); run = 1; } } w.push(run); return w; });

function bestSymbol(runs: number[], at: number, candidates: number[] | null): { value: number; error: number } | null {
    if (at + 6 > runs.length) return null;
    let total = 0;
    for (let i = 0; i < 6; i++) total += runs[at + i]!;
    const module = total / 11;
    if (module < 0.6) return null;
    let best = -1, bestError = Infinity;
    const list = candidates ?? SYMBOLS.keys();
    for (const value of list) {
        const widths = WIDTHS[value]!;
        let error = 0;
        for (let i = 0; i < 6; i++) error += Math.abs(runs[at + i]! / module - widths[i]!);
        if (error < bestError) { bestError = error; best = value; }
    }
    return best < 0 || bestError > 1.6 ? null : { value: best, error: bestError };
}

function interpret(values: number[]): string | null {
    let set: 'A' | 'B' | 'C' = values[0] === START_A ? 'A' : values[0] === START_B ? 'B' : 'C';
    let out = '', shift = false;
    for (let i = 1; i < values.length - 2; i++) {
        const v = values[i]!;
        const current = shift ? (set === 'A' ? 'B' : 'A') : set;
        shift = false;
        if (current === 'C') {
            if (v < 100) out += String(v).padStart(2, '0');
            else if (v === 100) set = 'B'; else if (v === 101) set = 'A'; else if (v !== 102) return null;
        } else if (v < 96) {
            out += String.fromCharCode(current === 'A' && v >= 64 ? v - 64 : v + 32);
        } else if (v === 98) shift = true;
        else if (v === 99) set = 'C';
        else if (v === 100 && current === 'A') set = 'B';
        else if (v === 101 && current === 'B') set = 'A';
        else if (v === 102) out += '\x1d';   // FNC1 : séparateur GS1
        // FNC2, FNC3, FNC4 : ignorés
    }
    return out;
}

/** Décode un Code 128 à partir de longueurs de plages alternées (barre en premier). */
export function decodeCode128Runs(runs: number[], from: number): string | null {
    const start = bestSymbol(runs, from, [START_A, START_B, START_C]);
    if (!start) return null;
    const values = [start.value];
    let at = from + 6;
    while (values.length < 80) {
        const symbol = bestSymbol(runs, at, null);
        if (!symbol) return null;
        values.push(symbol.value);
        at += 6;
        if (symbol.value === STOP_VALUE) {
            // L'arrêt se termine par une barre de 2 modules.
            if (at >= runs.length) return null;
            let total = 0;
            for (let i = 0; i < 6; i++) total += runs[at - 6 + i]!;
            const module = total / 11;
            if (Math.abs(runs[at]! / module - 2) > 0.9) return null;
            break;
        }
    }
    if (values.length < 4 || values[values.length - 1] !== STOP_VALUE) return null;
    let check = values[0]!;
    for (let i = 1; i < values.length - 2; i++) check += values[i]! * i;
    if (check % 103 !== values[values.length - 2]) return null;
    return interpret(values);
}

/** Longueurs de plages d'une ligne binarisée (1 = noir), en commençant par la première barre. */
function runsOf(row: ArrayLike<number>, from: number, to: number): number[] {
    const runs: number[] = [];
    let i = from;
    while (i < to && row[i] === 0) i++;
    while (i < to) {
        const color = row[i]!;
        let j = i;
        while (j < to && row[j] === color) j++;
        runs.push(j - i);
        i = j;
    }
    return runs;
}

function scanRows(image: GrayImage, votes: Map<string, number>, step: number) {
    const { width: w, height: h, data } = image;
    const row = new Uint8Array(w);
    for (let y = 0; y < h; y += step) {
        let min = 255, max = 0;
        for (let x = 0; x < w; x++) { const v = (data[y * w + Math.max(0, x - 1)]! + data[y * w + x]! * 2 + data[y * w + Math.min(w - 1, x + 1)]!) >> 2; row[x] = v; if (v < min) min = v; if (v > max) max = v; }
        if (max - min < 48) continue;
        // Seuil local : milieu entre le noir et le blanc de la ligne.
        const threshold = (min + max) / 2;
        const bits = new Uint8Array(w);
        for (let x = 0; x < w; x++) bits[x] = row[x]! < threshold ? 1 : 0;
        const runs = runsOf(bits, 0, w);
        if (runs.length < 20) continue;
        for (const direction of [false, true]) {
            // À l'envers : la liste doit encore commencer par une barre. Elle finit par un espace si le nombre de plages est pair.
            const list = direction ? (runs.length % 2 === 0 ? [...runs].reverse().slice(1) : [...runs].reverse()) : runs;
            for (let i = 0; i + 6 < list.length; i += 2) {
                const text = decodeCode128Runs(list, i);
                if (text) { votes.set(text, (votes.get(text) ?? 0) + 1); i += 40; }
            }
        }
    }
}

/**
 * Cherche des Code 128 dans une image : lignes horizontales, puis verticales (image tournée de 90°).
 * Un résultat n'est retenu que s'il est lu sur au moins `minVotes` lignes distinctes.
 */
export function readCode128(image: GrayImage, minVotes = 2): string[] {
    const found = new Map<string, number>();
    for (const candidate of [image, transpose(image)]) {
        const votes = new Map<string, number>();
        scanRows(candidate, votes, Math.max(1, Math.floor(candidate.height / 400)));
        for (const [text, count] of votes) if (count >= minVotes) found.set(text, Math.max(count, found.get(text) ?? 0));
    }
    return [...found.entries()].sort((a, b) => b[1] - a[1]).map(([text]) => text);
}
