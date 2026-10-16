/**
 * Lecture et écriture minimales de classeurs Excel (.xlsx) et CSV, sans dépendance.
 * Un .xlsx est une archive ZIP de fichiers XML ; seules les cellules de texte/nombres de la première feuille sont lues.
 * Le fichier vient de l'utilisateur : tailles, nombre d'entrées et taille décompressée sont bornés.
 */
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_ENTRY_BYTES = 8 * 1024 * 1024;
const MAX_ENTRIES = 2000;
export const MAX_SHEET_ROWS = 5000;
const MAX_COLUMNS = 50;

export type Table = string[][];

const u16 = (v: DataView, o: number) => v.getUint16(o, true);
const u32 = (v: DataView, o: number) => v.getUint32(o, true);
const utf8 = new TextDecoder('utf-8');

/* ---------- ZIP (lecture) ---------- */
interface ZipEntry { name: string; method: number; compressed: number; size: number; offset: number; flags: number }

async function inflateRaw(data: Uint8Array, limit: number): Promise<Uint8Array> {
    if (typeof DecompressionStream === 'undefined') throw new Error('Ce navigateur ne sait pas décompresser les fichiers Excel. Utilisez un navigateur récent ou le format CSV.');
    const reader = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > limit) { await reader.cancel(); throw new Error('Le fichier est trop volumineux une fois décompressé.'); }
        chunks.push(value);
    }
    const out = new Uint8Array(total);
    let at = 0;
    for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; }
    return out;
}

export function openZip(bytes: Uint8Array) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (u32(view, i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Ce fichier n’est pas un classeur Excel (.xlsx) valide.');
    const count = u16(view, eocd + 10);
    const dirSize = u32(view, eocd + 12);
    const dirOffset = u32(view, eocd + 16);
    if (count === 0xffff || dirOffset === 0xffffffff || count > MAX_ENTRIES || dirOffset + dirSize > bytes.length) throw new Error('Archive Excel non prise en charge.');
    const entries = new Map<string, ZipEntry>();
    let at = dirOffset;
    for (let i = 0; i < count; i++) {
        if (at + 46 > bytes.length || u32(view, at) !== 0x02014b50) throw new Error('Archive Excel corrompue.');
        const nameLength = u16(view, at + 28), extraLength = u16(view, at + 30), commentLength = u16(view, at + 32);
        const name = utf8.decode(bytes.subarray(at + 46, at + 46 + nameLength));
        entries.set(name, { name, flags: u16(view, at + 8), method: u16(view, at + 10), compressed: u32(view, at + 20), size: u32(view, at + 24), offset: u32(view, at + 42) });
        at += 46 + nameLength + extraLength + commentLength;
    }
    return {
        names: [...entries.keys()],
        async read(name: string): Promise<Uint8Array | null> {
            const entry = entries.get(name);
            if (!entry) return null;
            if (entry.flags & 1) throw new Error('Le classeur est protégé par un mot de passe : enregistrez-en une copie sans protection.');
            if (entry.size > MAX_ENTRY_BYTES) throw new Error('Le fichier est trop volumineux une fois décompressé.');
            if (entry.offset + 30 > bytes.length || u32(view, entry.offset) !== 0x04034b50) throw new Error('Archive Excel corrompue.');
            const start = entry.offset + 30 + u16(view, entry.offset + 26) + u16(view, entry.offset + 28);
            if (start + entry.compressed > bytes.length) throw new Error('Archive Excel corrompue.');
            const data = bytes.subarray(start, start + entry.compressed);
            if (entry.method === 0) return data.slice();
            if (entry.method === 8) return inflateRaw(data, MAX_ENTRY_BYTES);
            throw new Error('Méthode de compression non prise en charge.');
        }
    };
}

/* ---------- XML (lecture, sans DOM) ---------- */
const entityMap: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'' };
function decodeXml(value: string): string {
    return value
        .replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (whole, body: string) => {
            if (body[0] === '#') {
                const code = body[1] === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
                return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
            }
            return entityMap[body] ?? whole;
        })
        .replace(/_x([0-9A-Fa-f]{4})_/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}
const attribute = (tag: string, name: string) => new RegExp('\\s' + name.replace(':', '\\:') + '="([^"]*)"').exec(tag)?.[1];
function textOf(xml: string): string {
    const clean = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
    let out = '';
    for (const match of clean.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) out += match[1] ?? '';
    return decodeXml(out);
}
const columnIndex = (ref: string) => { let n = 0; for (const ch of ref.replace(/[^A-Za-z]/g, '').toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };

function assertSafeXml(xml: string) {
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Classeur Excel refusé : contenu XML non autorisé.');
}

async function readXlsx(bytes: Uint8Array): Promise<Table> {
    const zip = openZip(bytes);
    const read = async (name: string) => { const data = await zip.read(name); return data ? utf8.decode(data) : null; };
    let sheetPath = 'xl/worksheets/sheet1.xml';
    const workbook = await read('xl/workbook.xml');
    const rels = await read('xl/_rels/workbook.xml.rels');
    if (workbook && rels) {
        assertSafeXml(workbook); assertSafeXml(rels);
        const first = /<sheet\b[^>]*>/.exec(workbook)?.[0];
        const rid = first ? attribute(first, 'r:id') : undefined;
        for (const rel of rels.matchAll(/<Relationship\b[^>]*>/g)) {
            if (rid && attribute(rel[0], 'Id') === rid) {
                const target = attribute(rel[0], 'Target');
                if (target) sheetPath = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
            }
        }
    }
    const sheet = await read(sheetPath);
    if (!sheet) throw new Error('Aucune feuille de calcul trouvée dans ce classeur.');
    assertSafeXml(sheet);
    const sharedXml = await read('xl/sharedStrings.xml');
    const shared: string[] = [];
    if (sharedXml) { assertSafeXml(sharedXml); for (const si of sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) shared.push(textOf(si[1] ?? '')); }
    const rows: Table = [];
    for (const row of sheet.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
        if (rows.length >= MAX_SHEET_ROWS) throw new Error(`Le fichier contient plus de ${MAX_SHEET_ROWS} lignes.`);
        const rowTag = /<row\b[^>]*>/.exec(row[0])?.[0] ?? '';
        const rowNumber = Number(attribute(rowTag, 'r') ?? rows.length + 1);
        const cells: string[] = [];
        let next = 0;
        for (const cell of (row[1] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
            const attrs = cell[1] ?? '';
            const ref = /\sr="([A-Za-z]+)\d*"/.exec(' ' + attrs)?.[1];
            const index = ref ? columnIndex(ref) : next;
            next = index + 1;
            if (index < 0 || index >= MAX_COLUMNS) continue;
            const type = /\st="([^"]*)"/.exec(' ' + attrs)?.[1] ?? 'n';
            const inner = cell[2] ?? '';
            const raw = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner)?.[1];
            let value: string;
            if (type === 's') value = raw === undefined ? '' : shared[Number(raw)] ?? '';
            else if (type === 'inlineStr') value = textOf(inner);
            else if (type === 'b') value = raw === '1' ? 'VRAI' : 'FAUX';
            else if (type === 'e') value = '';
            else value = raw === undefined ? '' : decodeXml(raw);
            while (cells.length <= index) cells.push('');
            cells[index] = value;
        }
        while (rows.length < rowNumber - 1) rows.push([]);
        rows.push(cells);
    }
    return trimTable(rows);
}

/* ---------- CSV ---------- */
function decodeCsv(bytes: Uint8Array): string {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, ''); }
    catch { return new TextDecoder('windows-1252').decode(bytes); }   // CSV Excel « ANSI » (France)
}
export function parseCsv(content: string): Table {
    const firstLine = content.split(/\r?\n/, 1)[0] ?? '';
    const delimiter = ([';', '\t', ','] as const).map(d => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
    const rows: Table = [];
    let row: string[] = [], field = '', quoted = false;
    for (let i = 0; i < content.length; i++) {
        const ch = content[i]!;
        if (quoted) {
            if (ch === '"') { if (content[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
            else field += ch;
        } else if (ch === '"' && field === '') quoted = true;
        else if (ch === delimiter) { row.push(field); field = ''; }
        else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && content[i + 1] === '\n') i++;
            row.push(field); field = '';
            rows.push(row); row = [];
            if (rows.length > MAX_SHEET_ROWS) throw new Error(`Le fichier contient plus de ${MAX_SHEET_ROWS} lignes.`);
        } else field += ch;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return trimTable(rows.map(r => r.slice(0, MAX_COLUMNS)));
}

function trimTable(rows: Table): Table {
    const cleaned = rows.map(r => r.map(c => c.replace(/ /g, ' ').trim()));
    while (cleaned.length && cleaned[cleaned.length - 1]!.every(c => c === '')) cleaned.pop();
    return cleaned;
}

/** Lit la première feuille d'un .xlsx ou un .csv. Les anciens .xls ne sont pas pris en charge. */
export async function readSpreadsheet(file: { name: string; size: number; arrayBuffer(): Promise<ArrayBuffer> }): Promise<Table> {
    if (file.size === 0) throw new Error('Le fichier est vide.');
    if (file.size > MAX_FILE_BYTES) throw new Error('Le fichier dépasse 2 Mo.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
    if (isZip) return readXlsx(bytes);
    if (bytes[0] === 0xd0 && bytes[1] === 0xcf) throw new Error('Format Excel ancien (.xls) non pris en charge : enregistrez le fichier au format .xlsx.');
    if (/\.xlsx?$/i.test(file.name)) throw new Error('Ce fichier n’est pas un classeur Excel (.xlsx) valide.');
    return parseCsv(decodeCsv(bytes));
}

/* ---------- ZIP + XLSX (écriture) ---------- */
const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(data: Uint8Array): number { let c = 0xffffffff; for (const byte of data) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

export function zipStore(files: Array<{ name: string; data: Uint8Array }>, now = new Date()): Uint8Array {
    const enc = new TextEncoder();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = (Math.max(now.getFullYear() - 1980, 0) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const locals: Uint8Array[] = [], centrals: Uint8Array[] = [];
    let offset = 0;
    for (const file of files) {
        const name = enc.encode(file.name);
        const crc = crc32(file.data);
        const local = new Uint8Array(30 + name.length);
        const lv = new DataView(local.buffer);
        lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, 0, true);
        lv.setUint16(10, dosTime, true); lv.setUint16(12, dosDate, true); lv.setUint32(14, crc, true);
        lv.setUint32(18, file.data.length, true); lv.setUint32(22, file.data.length, true); lv.setUint16(26, name.length, true);
        local.set(name, 30);
        const central = new Uint8Array(46 + name.length);
        const cv = new DataView(central.buffer);
        cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true);
        cv.setUint16(12, dosTime, true); cv.setUint16(14, dosDate, true); cv.setUint32(16, crc, true);
        cv.setUint32(20, file.data.length, true); cv.setUint32(24, file.data.length, true); cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true);
        central.set(name, 46);
        locals.push(local, file.data); centrals.push(central);
        offset += local.length + file.data.length;
    }
    const dirSize = centrals.reduce((n, c) => n + c.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true); ev.setUint32(12, dirSize, true); ev.setUint32(16, offset, true);
    const out = new Uint8Array(offset + dirSize + 22);
    let at = 0;
    for (const part of [...locals, ...centrals, end]) { out.set(part, at); at += part.length; }
    return out;
}

// eslint-disable-next-line no-control-regex -- on retire exactement les caractères de contrôle que XML 1.0 interdit
const xmlEscape = (s: string) => s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const columnName = (i: number) => { let n = i + 1, s = ''; while (n > 0) { s = String.fromCharCode(65 + ((n - 1) % 26)) + s; n = Math.floor((n - 1) / 26); } return s; };

export interface SheetSpec {
    name: string;
    rows: Table;
    widths?: number[];
    /** Liste déroulante appliquée à une colonne (index 0) sur les lignes 2 à `listRows + 1`. */
    list?: { column: number; values: string[]; rows: number };
    /** Première ligne mise en forme comme en-tête. */
    header?: boolean;
}

export function buildXlsx(sheets: SheetSpec[]): Uint8Array {
    const enc = new TextEncoder();
    const xml = (body: string) => enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + body);
    const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const files: Array<{ name: string; data: Uint8Array }> = [];
    files.push({ name: '[Content_Types].xml', data: xml('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>') });
    files.push({ name: '_rels/.rels', data: xml(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`) });
    files.push({ name: 'xl/workbook.xml', data: xml(`<workbook xmlns="${NS}" xmlns:r="${REL}"><sheets>` + sheets.map((s, i) => `<sheet name="${xmlEscape(s.name).slice(0, 31)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>') });
    files.push({ name: 'xl/_rels/workbook.xml.rels', data: xml('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') + `<Relationship Id="rId${sheets.length + 1}" Type="${REL}/styles" Target="styles.xml"/></Relationships>`) });
    files.push({ name: 'xl/styles.xml', data: xml(`<styleSheet xmlns="${NS}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1D5C43"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`) });
    sheets.forEach((sheet, index) => {
        const rows = sheet.rows.map((row, r) => `<row r="${r + 1}">` + row.map((value, c) => value === '' ? '' : `<c r="${columnName(c)}${r + 1}" t="inlineStr"${sheet.header !== false && r === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`).join('') + '</row>').join('');
        const cols = sheet.widths ? '<cols>' + sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>' : '';
        const frozen = sheet.header !== false ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
        const list = sheet.list ? `<dataValidations count="1"><dataValidation type="list" allowBlank="1" showErrorMessage="1" errorTitle="Valeur non autorisée" error="Choisissez une valeur de la liste." sqref="${columnName(sheet.list.column)}2:${columnName(sheet.list.column)}${sheet.list.rows + 1}"><formula1>"${xmlEscape(sheet.list.values.join(','))}"</formula1></dataValidation></dataValidations>` : '';
        files.push({ name: `xl/worksheets/sheet${index + 1}.xml`, data: xml(`<worksheet xmlns="${NS}">${frozen}${cols}<sheetData>${rows}</sheetData>${list}</worksheet>`) });
    });
    return zipStore(files);
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Déclenche le téléchargement d'un fichier généré localement (aucune donnée ne quitte le navigateur). */
export function downloadBytes(bytes: Uint8Array, filename: string, mime = XLSX_MIME) {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
    const link = document.createElement('a');
    link.href = url; link.download = filename; link.rel = 'noopener';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
