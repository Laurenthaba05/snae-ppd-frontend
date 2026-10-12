import test from 'node:test';
import assert from 'node:assert/strict';
import { buildXlsx, openZip, parseCsv, readSpreadsheet, zipStore } from '../.test-build/spreadsheet.js';
import { institutionTemplate, parseInstitutionTable, MAX_IMPORT_ROWS } from '../.test-build/institutionImport.js';

const file = (name, bytes) => ({ name, size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
const enc = new TextEncoder();

/** Zip « comme Excel » : entrées compressées (deflate-raw), chaînes partagées, ordre de fichiers réel. */
async function deflated(entries) {
    const out = [];
    for (const [name, text] of entries) {
        const raw = enc.encode(text);
        const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'));
        out.push({ name, raw, packed: new Uint8Array(await new Response(stream).arrayBuffer()) });
    }
    const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
    const crc = d => { let c = 0xffffffff; for (const b of d) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
    const parts = [], central = []; let offset = 0;
    for (const e of out) {
        const name = enc.encode(e.name);
        const local = Buffer.alloc(30 + name.length);
        local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8); local.writeUInt32LE(crc(e.raw), 14);
        local.writeUInt32LE(e.packed.length, 18); local.writeUInt32LE(e.raw.length, 22); local.writeUInt16LE(name.length, 26); name.forEach((b, i) => { local[30 + i] = b; });
        const head = Buffer.alloc(46 + name.length);
        head.writeUInt32LE(0x02014b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(20, 6); head.writeUInt16LE(8, 10); head.writeUInt32LE(crc(e.raw), 16);
        head.writeUInt32LE(e.packed.length, 20); head.writeUInt32LE(e.raw.length, 24); head.writeUInt16LE(name.length, 28); head.writeUInt32LE(offset, 42); name.forEach((b, i) => { head[46 + i] = b; });
        parts.push(local, Buffer.from(e.packed)); central.push(head); offset += local.length + e.packed.length;
    }
    const dir = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(out.length, 8); end.writeUInt16LE(out.length, 10); end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
    return new Uint8Array(Buffer.concat([...parts, dir, end]));
}

test('Aller-retour : un classeur généré est relu à l’identique (accents, &, guillemets, lignes vides)', async () => {
    const rows = [['Code', 'Intitulé', 'Sigle', 'Type'], ['MEF', 'Ministère de l’Économie & des « Finances »', 'MEF', 'Ministère'], ['', '', '', ''], ['X1', '<b>"gras"</b>', '', 'Autre']];
    const bytes = buildXlsx([{ name: 'Institutions', rows }]);
    const table = await readSpreadsheet(file('t.xlsx', bytes));
    assert.deepEqual(table, [rows[0], rows[1], [], rows[3]]);
});

test('Le modèle fourni est un classeur lisible : en-têtes attendus, aucune institution pré-remplie', async () => {
    const table = await readSpreadsheet(file('modele.xlsx', institutionTemplate()));
    assert.deepEqual(table, [['Code', 'Intitulé', 'Sigle', 'Type']]);
    assert.match(parseInstitutionTable(table).fatal, /aucune institution/);
    const zip = openZip(institutionTemplate());
    assert.ok(zip.names.includes('xl/worksheets/sheet2.xml'));
});

test('Lecture d’un classeur compressé avec chaînes partagées, cellules vides et références de colonnes', async () => {
    const sheet = '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="s"><v>2</v></c></row>'
        + '<row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2" t="inlineStr"><is><t>Direction &amp; Cie</t></is></c><c r="D2" t="s"><v>4</v></c></row>'
        + '<row r="4"><c r="A4"><v>1001</v></c><c r="B4" t="s"><v>5</v></c><c r="D4" t="s"><v>4</v></c></row></sheetData></worksheet>';
    const shared = '<sst><si><t>Code</t></si><si><t>Intitulé</t></si><si><t>Type</t></si><si><t>MIN</t></si><si><r><t>Mini</t></r><r><t>stère</t></r></si><si><t>Mairie</t></si></sst>';
    const wb = '<workbook xmlns:r="x"><sheets><sheet name="A" sheetId="1" r:id="rId7"/></sheets></workbook>';
    const rels = '<Relationships><Relationship Id="rId7" Type="t" Target="worksheets/sheet9.xml"/></Relationships>';
    const bytes = await deflated([['xl/workbook.xml', wb], ['xl/_rels/workbook.xml.rels', rels], ['xl/sharedStrings.xml', shared], ['xl/worksheets/sheet9.xml', sheet]]);
    const table = await readSpreadsheet(file('excel.xlsx', bytes));
    assert.deepEqual(table, [['Code', 'Intitulé', '', 'Type'], ['MIN', 'Direction & Cie', '', 'Ministère'], [], ['1001', 'Mairie', '', 'Ministère']]);
});

test('Fichiers non fiables : refus clair (vide, trop gros, .xls, faux .xlsx, XML avec DOCTYPE)', async () => {
    await assert.rejects(readSpreadsheet(file('a.xlsx', new Uint8Array(0))), /vide/);
    await assert.rejects(readSpreadsheet({ name: 'big.xlsx', size: 3 * 1024 * 1024, arrayBuffer: async () => new ArrayBuffer(0) }), /2 Mo/);
    await assert.rejects(readSpreadsheet(file('old.xls', new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]))), /\.xls/);
    await assert.rejects(readSpreadsheet(file('fake.xlsx', enc.encode('pas un zip'))), /valide/);
    const evil = zipStore([{ name: 'xl/worksheets/sheet1.xml', data: enc.encode('<!DOCTYPE x [<!ENTITY a "b">]><worksheet/>') }]);
    await assert.rejects(readSpreadsheet(file('evil.xlsx', evil)), /non autorisé/);
});

test('CSV : séparateur ; ou ,, guillemets, UTF-8 avec BOM et ANSI Windows-1252', async () => {
    assert.deepEqual(parseCsv('Code;Intitulé;Sigle;Type\r\nMEF;"Finances; budget";MEF;Autre\r\n'), [['Code', 'Intitulé', 'Sigle', 'Type'], ['MEF', 'Finances; budget', 'MEF', 'Autre']]);
    assert.deepEqual(parseCsv('a,b\n"x ""y""",z'), [['a', 'b'], ['x "y"', 'z']]);
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...enc.encode('Code;Intitulé\nA;Éducation')]);
    assert.deepEqual(await readSpreadsheet(file('u.csv', bom)), [['Code', 'Intitulé'], ['A', 'Éducation']]);
    const ansi = new Uint8Array([...enc.encode('Code;Intitul'), 0xe9, ...enc.encode('\nA;'), 0xc9, ...enc.encode('ducation')]);
    assert.deepEqual(await readSpreadsheet(file('a.csv', ansi)), [['Code', 'Intitulé'], ['A', 'Éducation']]);
});

test('Institutions : validation ligne par ligne, types en clair ou en code, doublons, lignes vides ignorées', () => {
    const { rows, fatal } = parseInstitutionTable([
        ['code', 'INTITULÉ', 'Sigle', 'Type d’institution'],
        ['mef', 'Ministère de l’Économie', 'MEF', 'Ministère'],
        ['', '', '', ''],
        ['DGI', 'Direction générale des impôts', '', 'direction generale'],
        ['1BAD', 'Code invalide', '', 'AUTRE'],
        ['MEF', 'Doublon', '', 'MINISTERE'],
        ['X', '', '', 'Autre'],
        ['Y', 'Type inconnu', '', 'Entreprise'],
        ['Z'.repeat(51), 'Trop long', '', 'AUTRE']
    ]);
    assert.equal(fatal, null);
    assert.deepEqual(rows.map(r => r.line), [2, 4, 5, 6, 7, 8, 9]);
    assert.deepEqual(rows[0].body, { code: 'MEF', nom: 'Ministère de l’Économie', sigle: 'MEF', typeInstitution: 'MINISTERE' });
    assert.deepEqual(rows[1].body, { code: 'DGI', nom: 'Direction générale des impôts', sigle: null, typeInstitution: 'DIRECTION_GENERALE' });
    assert.match(rows[2].errors[0], /Code invalide/);
    assert.match(rows[3].errors[0], /ligne 2/);
    assert.match(rows[4].errors[0], /Intitulé manquant/);
    assert.match(rows[5].errors[0], /Type inconnu/);
    assert.match(rows[6].errors[0], /Code invalide/);
    assert.ok(rows.slice(2).every(r => r.body === null));
});

test('Institutions : colonnes obligatoires et plafond de lignes', () => {
    assert.match(parseInstitutionTable([['Nom', 'Sigle'], ['x', 'y']]).fatal, /Code, Type/);
    const many = [['Code', 'Intitulé', 'Sigle', 'Type'], ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => ['C' + i, 'Nom ' + i, '', 'Autre'])];
    assert.match(parseInstitutionTable(many).fatal, /limité/);
    assert.equal(parseInstitutionTable(many.slice(0, MAX_IMPORT_ROWS + 1)).rows.filter(r => r.body).length, MAX_IMPORT_ROWS);
});
