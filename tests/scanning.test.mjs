import test from 'node:test';
import assert from 'node:assert/strict';
import { readImageInfo } from '../.test-build/scanImage.js';
import { faceFor, formatRanges, naturalCompare, planPages, remainingGaps } from '../.test-build/pageNumbering.js';

const file = bytes => new Blob([Buffer.from(bytes)]);

function pngWith(width, height, pixelsPerMeter) {
    const chunk = (type, data) => { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(type, 4, 'ascii'); data.copy(b, 8); return b; };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
    const parts = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr)];
    if (pixelsPerMeter !== null) { const p = Buffer.alloc(9); p.writeUInt32BE(pixelsPerMeter, 0); p.writeUInt32BE(pixelsPerMeter, 4); p[8] = 1; parts.push(chunk('pHYs', p)); }
    parts.push(chunk('IDAT', Buffer.alloc(4)), chunk('IEND', Buffer.alloc(0)));
    return Buffer.concat(parts);
}
function jpegWith(width, height, { jfif, exifDpi }) {
    const parts = [Buffer.from([0xff, 0xd8])];
    if (jfif) { const b = Buffer.alloc(16); b.writeUInt16BE(16, 0); b.write('JFIF\0', 2, 'ascii'); b[7] = 1; b[8] = 1; b[9] = jfif.units; b.writeUInt16BE(jfif.density, 10); b.writeUInt16BE(jfif.density, 12); parts.push(Buffer.from([0xff, 0xe0]), b); }
    if (exifDpi) {
        const tiff = Buffer.alloc(8 + 2 + 12 * 2 + 4 + 8); tiff.write('MM', 0); tiff.writeUInt16BE(42, 2); tiff.writeUInt32BE(8, 4);
        tiff.writeUInt16BE(2, 8);
        tiff.writeUInt16BE(282, 10); tiff.writeUInt16BE(5, 12); tiff.writeUInt32BE(1, 14); tiff.writeUInt32BE(8 + 2 + 24 + 4, 18);
        tiff.writeUInt16BE(296, 22); tiff.writeUInt16BE(3, 24); tiff.writeUInt32BE(1, 26); tiff.writeUInt16BE(2, 30);
        tiff.writeUInt32BE(0, 34); tiff.writeUInt32BE(exifDpi, 38); tiff.writeUInt32BE(1, 42);
        const app1 = Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), tiff.subarray(0, 46)]);
        const len = Buffer.alloc(2); len.writeUInt16BE(app1.length + 2, 0);
        parts.push(Buffer.from([0xff, 0xe1]), len, app1);
    }
    const sof = Buffer.alloc(17); sof.writeUInt16BE(15, 0); sof[2] = 8; sof.writeUInt16BE(height, 3); sof.writeUInt16BE(width, 5); sof[7] = 1;
    parts.push(Buffer.from([0xff, 0xc0]), sof, Buffer.from([0xff, 0xd9]));
    return Buffer.concat(parts);
}
/** TIFF little-endian dont l'IFD et la résolution sont écrits en fin de fichier, comme le font de nombreux scanners. */
function tiffWith(width, height, dpi, unit = 2) {
    const data = Buffer.alloc(4096);
    data.write('II', 0); data.writeUInt16LE(42, 2); data.writeUInt32LE(2000, 4);
    data.writeUInt16LE(4, 2000);
    const entry = (i, tag, type, value) => { const o = 2002 + i * 12; data.writeUInt16LE(tag, o); data.writeUInt16LE(type, o + 2); data.writeUInt32LE(1, o + 4); if (type === 3) data.writeUInt16LE(value, o + 8); else data.writeUInt32LE(value, o + 8); };
    entry(0, 256, 4, width); entry(1, 257, 4, height); entry(2, 282, 5, 3000); entry(3, 296, 3, unit);
    data.writeUInt32LE(dpi, 3000); data.writeUInt32LE(1, 3004);
    return data;
}

test('PNG : dimensions et résolution (pixels par mètre convertis en dpi), absence de pHYs', async () => {
    assert.deepEqual(await readImageInfo(file(pngWith(2480, 3508, 11811))), { format: 'PNG', width: 2480, height: 3508, dpi: 300 });
    assert.equal((await readImageInfo(file(pngWith(100, 50, null)))).dpi, null);
});

test('JPEG : JFIF en dpi ou en points par cm, densité « aspect » ignorée, EXIF prioritaire', async () => {
    assert.deepEqual(await readImageInfo(file(jpegWith(1200, 1600, { jfif: { units: 1, density: 200 } }))), { format: 'JPEG', width: 1200, height: 1600, dpi: 200 });
    assert.equal((await readImageInfo(file(jpegWith(10, 10, { jfif: { units: 2, density: 118 } })))).dpi, 300);
    assert.equal((await readImageInfo(file(jpegWith(10, 10, { jfif: { units: 0, density: 1 } })))).dpi, null);
    assert.equal((await readImageInfo(file(jpegWith(10, 10, { jfif: { units: 1, density: 72 }, exifDpi: 400 })))).dpi, 400);
});

test('TIFF : IFD en fin de fichier, résolution en pouces ou en centimètres', async () => {
    assert.deepEqual(await readImageInfo(file(tiffWith(4960, 7016, 600))), { format: 'TIFF', width: 4960, height: 7016, dpi: 600 });
    assert.equal((await readImageInfo(file(tiffWith(10, 10, 118, 3)))).dpi, 300);
});

test('PDF reconnu sans dimensions ; contenu inconnu ou trop court', async () => {
    assert.deepEqual(await readImageInfo(file(Buffer.from('%PDF-1.7 ...'))), { format: 'PDF', width: null, height: null, dpi: null });
    assert.equal((await readImageInfo(file(Buffer.from('hello world')))).format, 'INCONNU');
    assert.equal((await readImageInfo(file(Buffer.from([1, 2])))).format, 'INCONNU');
});

test('Faces : impair = recto, pair = verso uniquement en recto-verso', () => {
    assert.equal(faceFor(1, true), 'RECTO'); assert.equal(faceFor(2, true), 'VERSO'); assert.equal(faceFor(2, false), 'RECTO');
});

test('Tri naturel des noms de fichiers', () => {
    const names = ['scan10.tif', 'scan2.tif', 'scan1.tif', 'Scan3.tif'];
    assert.deepEqual(names.sort(naturalCompare), ['scan1.tif', 'scan2.tif', 'Scan3.tif', 'scan10.tif']);
});

const png = (name, dpi) => ({ name, size: 10 + name.length, info: { format: 'PNG', width: 100, height: 100, dpi } });
test('Plan de pages : numérotation, faces recto-verso, résolution, pages déjà prises et bornes', () => {
    const rows = planPages([png('p10.png', 300), png('p2.png', 150), png('p1.png', null)], { start: 4, rectoVerso: true, resolutionMin: 300, attendues: 6, taken: new Set([5]) });
    assert.deepEqual(rows.map(r => [r.name, r.numero, r.face]), [['p1.png', 4, 'VERSO'], ['p2.png', 5, 'RECTO'], ['p10.png', 6, 'VERSO']]);
    assert.match(rows[0].warnings[0], /non lisible/);
    assert.match(rows[1].warnings[0], /150 dpi/);
    assert.match(rows[1].errors[0], /existe déjà/);
    assert.deepEqual(rows[2].errors, []);
    const beyond = planPages([png('a.png', 300), png('b.png', 300)], { start: 5, rectoVerso: false, resolutionMin: null, attendues: 5, taken: new Set() });
    assert.match(beyond[1].errors[0], /Au-delà des 5 pages/);
});

test('Plan de pages : doublons de sélection, PDF et formats inconnus bloquants', () => {
    const dup = planPages([png('a.png', 300), png('a.png', 300)], { start: 1, rectoVerso: false, resolutionMin: null, attendues: null, taken: new Set() });
    assert.match(dup[1].errors[0], /double/);
    const other = planPages([{ name: 'x.pdf', size: 5, info: { format: 'PDF', width: null, height: null, dpi: null } }, { name: 'y.bin', size: 5, info: { format: 'INCONNU', width: null, height: null, dpi: null } }],
        { start: 1, rectoVerso: false, resolutionMin: null, attendues: null, taken: new Set() });
    assert.match(other[0].errors[0], /PDF/); assert.match(other[1].errors[0], /Format non reconnu/);
    assert.deepEqual(other.map(r => r.numero), [0, 0]);
    // un fichier inutilisable ne décale pas la numérotation des suivants
    const mixed = planPages([{ name: 'a.pdf', size: 5, info: { format: 'PDF', width: null, height: null, dpi: null } }, png('b.png', 300), png('b.png', 300), png('c.png', 300)], { start: 7, rectoVerso: false, resolutionMin: null, attendues: null, taken: new Set() });
    assert.deepEqual(mixed.map(r => [r.name, r.numero]), [['a.pdf', 0], ['b.png', 7], ['b.png', 0], ['c.png', 8]]);
});

test('Pages encore manquantes et affichage des plages', () => {
    assert.deepEqual(remainingGaps(8, [1, 2], [3, 4, 6]), [5, 7, 8]);
    assert.deepEqual(remainingGaps(null, [1], [3]), []);
    assert.equal(formatRanges([12, 3, 4, 7, 8, 9, 5, 3]), '3-5, 7-9, 12');
    assert.equal(formatRanges([1, 2]), '1, 2');
});
