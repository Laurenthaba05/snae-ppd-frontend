import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { encodeCode128, decodeCode128Runs, readCode128 } from '../.test-build/code128.js';
import { encodeQr, decodeQrMatrix, readQr, rsEncode, rsCorrect } from '../.test-build/qrcode.js';
import { readCodes, readInternal } from '../.test-build/barcodeReader.js';
import { buildCode, parseCode, resolveAmong, matchesId } from '../.test-build/scanCodes.js';
import { qrSvg, code128Svg, sheetsDocument } from '../.test-build/codeSheets.js';

const vectors = JSON.parse(readFileSync(new URL('./fixtures/barcode-vectors.json', import.meta.url), 'utf8'));
const toMatrix = rows => rows.map(r => [...r].map(c => c === '1'));

/* ---- Rastérisation de test : page grise bruitée, rotation légère, flou ---- */
let seed = 20260901;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
function page(w, h) { return { width: w, height: h, data: new Uint8Array(w * h).fill(250) }; }
/** Dessine une grille de modules (true = noir) à l'échelle `scale`, tournée de `angle` degrés, centrée en (cx, cy). */
function paint(img, grid, cx, cy, scale, angle = 0) {
    const rows = grid.length, cols = grid[0].length, cos = Math.cos(angle * Math.PI / 180), sin = Math.sin(angle * Math.PI / 180);
    const half = Math.ceil(Math.hypot(cols, rows) * scale / 2) + 2;
    for (let y = Math.max(0, Math.floor(cy - half)); y < Math.min(img.height, cy + half); y++) for (let x = Math.max(0, Math.floor(cx - half)); x < Math.min(img.width, cx + half); x++) {
        const dx = x - cx, dy = y - cy;
        const u = (dx * cos + dy * sin) / scale + cols / 2, v = (-dx * sin + dy * cos) / scale + rows / 2;
        if (u >= 0 && v >= 0 && u < cols && v < rows) img.data[y * img.width + x] = grid[Math.floor(v)][Math.floor(u)] ? 15 : 250;
    }
}
function degrade(img, { noise = 0, blur = false } = {}) {
    const { width: w, height: h, data } = img;
    let out = data;
    if (blur) { out = new Uint8Array(data); for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { let s = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += data[(y + dy) * w + x + dx]; out[y * w + x] = s / 9; } }
    if (noise) { out = new Uint8Array(out); for (let i = 0; i < out.length; i++) out[i] = Math.max(0, Math.min(255, out[i] + (rnd() - 0.5) * 2 * noise)); }
    return { width: w, height: h, data: out };
}
const withQuiet = (matrix, quiet = 4) => { const n = matrix.length + quiet * 2; return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => matrix[r - quiet]?.[c - quiet] ?? false)); };
const barGrid = (modules, height, quiet = 10) => Array.from({ length: height }, () => [...Array(quiet).fill(false), ...modules, ...Array(quiet).fill(false)]);
/** Fausse page de texte : lignes de petits blocs noirs, pour vérifier qu'on ne confond pas du texte avec un code. */
function addText(img) { for (let y = 40; y < img.height - 40; y += 26) for (let x = 40; x < img.width - 40; x += 14) if (rnd() > 0.25) for (let dy = 0; dy < 8; dy++) for (let dx = 0; dx < 8; dx++) if (rnd() > 0.35) img.data[(y + dy) * img.width + x + dx] = 20; }

/* ---- Code 128 ---- */
test('Code 128 : motifs identiques à python-barcode (jeu B) et lecture de tous les motifs de référence', () => {
    let compared = 0;
    for (const v of vectors.code128) {
        const mine = encodeCode128(v.text).map(b => b ? '1' : '0').join('');
        if (mine === v.modules) compared++;
        const runs = []; let i = 0; while (i < v.modules.length) { let j = i; while (j < v.modules.length && v.modules[j] === v.modules[i]) j++; runs.push(j - i); i = j; }
        assert.equal(decodeCode128Runs(runs, 0), v.text, v.text);
    }
    assert.ok(compared >= 4, 'au moins les textes sans suite de chiffres (jeu C) doivent être identiques octet pour octet');
});

test('Code 128 : lecture dans une page bruitée, floue, à l’endroit, à l’envers et à 90°', () => {
    for (const text of ['SNAE:E:2F6A1C3E', 'LOT-2026-001', 'Hello, World!']) {
        const grid = barGrid(encodeCode128(text), 70);
        for (const angle of [0, 180, 90, 270, 2]) {
            const img = page(1200, 900); addText(img);
            paint(img, grid, 600, 450, 3, angle);
            assert.deepEqual(readCode128(degrade(img, { noise: 40, blur: true })), [text], `${text} @${angle}°`);
        }
    }
});

test('Code 128 : une page de texte sans code ne produit aucune lecture', () => {
    for (let n = 0; n < 5; n++) { const img = page(1000, 800); addText(img); assert.deepEqual(readCode128(degrade(img, { noise: 30 })), []); }
});

/* ---- QR ---- */
test('QR : les matrices de qrcode (bibliothèque indépendante) sont décodées, versions 1 à 10, niveaux L à H', () => {
    for (const v of vectors.qr) assert.equal(decodeQrMatrix(toMatrix(v.matrix)), v.text, `${v.text.slice(0, 20)} ${v.level} v${v.version}`);
});

test('QR : mon encodeur choisit la même version que qrcode et se relit lui-même', () => {
    for (const v of vectors.qr) {
        const m = encodeQr(v.text, v.level);
        assert.equal((m.length - 17) / 4, v.version, `${v.text.slice(0, 20)} ${v.level}`);
        assert.equal(decodeQrMatrix(m), v.text);
    }
});

test('QR : corrections Reed-Solomon (modules inversés, dans la capacité de correction du niveau)', () => {
    const text = 'SNAE:E:2F6A1C3E-8B7D-4C2A-9E51-0A7B3C9D4E12';
    for (const [level, flips] of [['L', 6], ['M', 12], ['Q', 14], ['H', 11]]) {
        const m = encodeQr(text, level).map(r => [...r]);
        const n = m.length;
        // Inverse des modules de données répartis dans la zone de données (hors repérages et formats : lignes 9 et plus).
        for (let k = 0; k < flips; k++) { const r = 9 + Math.floor(rnd() * (n - 9)), c = 9 + Math.floor(rnd() * (n - 9)); m[r][c] = !m[r][c]; }
        assert.equal(decodeQrMatrix(m), text, level);
    }
});

test('Reed-Solomon : 2000 blocs aléatoires, aucune fausse correction silencieuse', () => {
    let corrected = 0;
    for (let t = 0; t < 2000; t++) {
        const ec = [7, 10, 13, 16, 22, 30][Math.floor(rnd() * 6)], len = 5 + Math.floor(rnd() * 90);
        const data = Array.from({ length: len }, () => Math.floor(rnd() * 256));
        const block = [...data, ...rsEncode(data, ec)], damaged = [...block];
        const errors = Math.floor(rnd() * (Math.floor(ec / 2) + 3)), positions = new Set();
        while (positions.size < errors) positions.add(Math.floor(rnd() * block.length));
        for (const p of positions) damaged[p] ^= 1 + Math.floor(rnd() * 255);
        const ok = rsCorrect(damaged, ec);
        if (errors <= Math.floor(ec / 2)) { assert.ok(ok && damaged.every((v, i) => v === block[i])); corrected++; }
        else if (ok) assert.deepEqual(damaged, block);
    }
    assert.ok(corrected > 500);
});

test('QR : lecture dans une page bruitée, floue, tournée de quelques degrés ou de 90°/180°', () => {
    const text = 'SNAE:E:2F6A1C3E-8B7D-4C2A-9E51-0A7B3C9D4E12';
    const grid = withQuiet(encodeQr(text, 'M'));
    for (const [scale, angle] of [[5, 0], [5, 90], [5, 180], [6, 3], [6, -5], [4, 8], [8, 0]]) {
        const img = page(1240, 1000); addText(img);
        paint(img, grid, 620, 500, scale, angle);
        assert.deepEqual(readQr(degrade(img, { noise: 36, blur: true })), [text], `échelle ${scale}, angle ${angle}`);
    }
});

test('QR : un QR de petite taille sur une grande page (A4 à 300 dpi) est trouvé', () => {
    const text = 'SNAE:L:00000000-0000-4000-8000-000000000071';
    const img = page(2480, 3508);
    paint(img, withQuiet(encodeQr(text, 'M')), 2000, 700, 6, 1);   // environ 2,3 cm
    assert.deepEqual(readQr(img), [text]);
});

test('Une page de texte sans code ne produit aucune lecture QR', () => {
    for (let n = 0; n < 3; n++) { const img = page(1200, 900); addText(img); assert.deepEqual(readQr(degrade(img, { noise: 30 })), []); }
});

/* ---- Codes SNAE ---- */
const E1 = '2f6a1c3e-8b7d-4c2a-9e51-0a7b3c9d4e12', E2 = '2f6a1c3e-0000-4c2a-9e51-0a7b3c9d4e99', L1 = '9a8b7c6d-1111-4222-8333-444455556666';
test('Codes SNAE : forme longue et courte, casse indifférente, refus des textes étrangers', () => {
    assert.equal(buildCode('ELEMENT', E1), 'SNAE:E:2F6A1C3E-8B7D-4C2A-9E51-0A7B3C9D4E12');
    assert.equal(buildCode('LOT', L1, 'short'), 'SNAE:L:9A8B7C6D');
    assert.deepEqual(parseCode('snae:e:2F6A1C3E-8B7D-4C2A-9E51-0A7B3C9D4E12'), { kind: 'ELEMENT', ref: E1.replace(/-/g, ''), full: true });
    assert.deepEqual(parseCode(' SNAE:L:9A8B7C6D \n'), { kind: 'LOT', ref: '9a8b7c6d', full: false });
    for (const bad of ['SNAE:X:9A8B7C6D', 'SNAE:E:9A8B', 'SNAE:E:ZZZZZZZZ', 'LOT-2026-001', '', 'SNAE:E:9A8B7C6D-1111']) assert.equal(parseCode(bad), null, bad);
    assert.throws(() => buildCode('ELEMENT', 'pas-un-uuid'));
});

test('Codes SNAE : un code court ambigu n’est jamais attribué', () => {
    const items = [{ id: E1 }, { id: E2 }, { id: L1 }];
    assert.deepEqual(resolveAmong(parseCode('SNAE:E:2F6A1C3E'), items), { match: null, ambiguous: true });
    assert.equal(resolveAmong(parseCode('SNAE:E:9A8B7C6D'), items).match?.id, L1);
    assert.equal(resolveAmong(parseCode(buildCode('ELEMENT', E2)), items).match?.id, E2);
    assert.equal(resolveAmong(parseCode('SNAE:E:FFFFFFFF'), items).match, null);
    assert.ok(matchesId(parseCode('SNAE:E:2F6A1C3E'), E1));
});

/* ---- Chaîne de lecture ---- */
test('Chaîne de lecture : le lecteur interne passe en premier, les autres seulement s’il ne trouve rien', async () => {
    const img = page(900, 700);
    paint(img, withQuiet(encodeQr('SNAE:E:2F6A1C3E-8B7D-4C2A-9E51-0A7B3C9D4E12', 'M')), 450, 350, 5);
    let called = 0;
    const hits = await readCodes(img, [{ source: 'natif', read: async () => { called++; return []; } }]);
    assert.deepEqual(hits.map(h => [h.format, h.source]), [['QR', 'interne']]);
    assert.equal(called, 0);
    const blank = page(900, 700);
    const viaExtra = await readCodes(blank, [
        { source: 'natif', read: async () => { throw new Error('API absente'); } },
        { source: 'bibliotheque', read: async () => [{ text: 'EAN-1', format: 'EAN-13' }, { text: 'EAN-1', format: 'EAN-13' }] }
    ]);
    assert.deepEqual(viaExtra, [{ text: 'EAN-1', format: 'AUTRE', source: 'bibliotheque' }]);
    assert.deepEqual(await readCodes(blank, []), []);
    assert.deepEqual(readInternal(blank), []);
});

/* ---- Feuilles imprimables ---- */
test('Feuilles : QR et Code 128 en SVG, texte échappé, une feuille par élément', () => {
    const qr = qrSvg('SNAE:E:2F6A1C3E-8B7D-4C2A-9E51-0A7B3C9D4E12');
    assert.match(qr, /^<svg[^>]+width="[\d.]+mm"/);
    assert.match(code128Svg('SNAE:E:2F6A1C3E'), /^<svg[^>]+height="18mm"/);
    const html = sheetsDocument('Lot <1>', [
        { kind: 'ELEMENT', id: E1, title: 'Registre <script>alert(1)</script>', details: ['Projet "A" & B'] },
        { kind: 'LOT', id: L1, title: 'LOT-1', details: [] }
    ]);
    assert.equal((html.match(/class="sheet"/g) ?? []).length, 2);
    assert.ok(!html.includes('<script>alert'));
    assert.match(html, /Registre &lt;script&gt;/);
    assert.match(html, /SNAE:E:2F6A1C3E-8B7D-4C2A-9E51-0A7B3C9D4E12/);
    assert.match(html, /SNAE:L:9A8B7C6D/);
});

test('Feuille imprimée : le QR et le Code 128 de la feuille sont relus par le lecteur interne (aller-retour complet)', () => {
    // Reconstitue la grille des modules à partir de l'encodeur utilisé par la feuille, comme le ferait un scanner.
    const long = buildCode('ELEMENT', E1, 'long'), short = buildCode('ELEMENT', E1, 'short');
    const img = page(1500, 1100);
    paint(img, withQuiet(encodeQr(long, 'M')), 400, 400, 6, 0);
    paint(img, barGrid(encodeCode128(short), 80), 900, 800, 4, 0);
    const found = readInternal(degrade(img, { noise: 30, blur: true })).map(h => h.text).sort();
    assert.deepEqual(found, [long, short].sort());
});
