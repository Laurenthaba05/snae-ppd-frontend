import test from 'node:test';
import assert from 'node:assert/strict';
import { readSpreadsheet } from '../.test-build/spreadsheet.js';
import { departmentTemplate, parseDepartmentTable } from '../.test-build/departmentImport.js';
import { MAX_IMPORT_ROWS } from '../.test-build/institutionImport.js';

const file = (name, bytes) => ({ name, size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
const HEAD = ['Code', 'Intitulé', 'Code du parent', 'Type d’unité'];
const none = new Map();

test('Le modèle est un classeur lisible : en-têtes attendus, aucun département pré-rempli', async () => {
    const table = await readSpreadsheet(file('modele.xlsx', departmentTemplate()));
    assert.deepEqual(table, [HEAD]);
    assert.match(parseDepartmentTable(table, none).fatal, /aucun département/);
});

test('Colonnes obligatoires, alias d’en-têtes et plafond de lignes', () => {
    assert.match(parseDepartmentTable([['Nom', 'Type'], ['x', 'y']], none).fatal, /Code/);
    const aliased = parseDepartmentTable([['code département', 'Nom', 'Parent', 'Type'], ['daf', 'Direction administrative', '', 'Direction']], none);
    assert.equal(aliased.fatal, null);
    assert.deepEqual(aliased.rows[0].body, { code: 'DAF', nom: 'Direction administrative', typeUnite: 'Direction' });
    const many = [HEAD, ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => ['C' + i, 'Nom ' + i, '', ''])];
    assert.match(parseDepartmentTable(many, none).fatal, /limité/);
    assert.equal(parseDepartmentTable(many.slice(0, MAX_IMPORT_ROWS + 1), none).rows.filter(r => r.body).length, MAX_IMPORT_ROWS);
});

test('Validation ligne par ligne : code, intitulé, type d’unité, doublons dans le fichier, lignes vides ignorées', () => {
    const { rows, fatal, order } = parseDepartmentTable([HEAD,
        ['daf', 'Direction administrative et financière', '', 'Direction'],
        ['', '', '', ''],
        ['1BAD', 'Code invalide', '', ''],
        ['DAF', 'Doublon', '', ''],
        ['DRH', '', '', ''],
        ['DSI', 'Trop long', '', 'T'.repeat(51)],
        ['SC', 'Service du courrier', '', '']], none);
    assert.equal(fatal, null);
    assert.deepEqual(rows.map(r => r.line), [2, 4, 5, 6, 7, 8]);
    assert.deepEqual(rows[0].body, { code: 'DAF', nom: 'Direction administrative et financière', typeUnite: 'Direction' });
    assert.match(rows[1].errors[0], /Code invalide/);
    assert.match(rows[2].errors[0], /ligne 2/);
    assert.match(rows[3].errors[0], /Intitulé manquant/);
    assert.match(rows[4].errors[0], /Type d’unité trop long/);
    assert.equal(rows[5].body.typeUnite, null);
    assert.deepEqual(order, [2, 8]);
});

test('Un code déjà utilisé dans l’institution est refusé avant l’envoi', () => {
    const existing = new Map([['DAF', 'id-daf']]);
    const { rows, order } = parseDepartmentTable([HEAD, ['daf', 'Déjà là', '', ''], ['DRH', 'Ressources humaines', '', '']], existing);
    assert.match(rows[0].errors[0], /existe déjà dans l’institution/);
    assert.equal(rows[0].body, null);
    assert.deepEqual(order, [3]);
});

test('Le parent est un département existant ou une autre ligne du fichier, quel que soit l’ordre des lignes', () => {
    const existing = new Map([['DG', 'id-dg']]);
    const { rows, order, fatal } = parseDepartmentTable([HEAD,
        ['SC', 'Service du courrier', 'daf', 'Service'],
        ['DAF', 'Direction administrative', 'DG', 'Direction'],
        ['BC', 'Bureau du courrier arrivé', 'SC', ''],
        ['DRH', 'Ressources humaines', 'dg', '']], existing);
    assert.equal(fatal, null);
    assert.deepEqual(rows[0].parent, { kind: 'file', line: 3, code: 'DAF' });
    assert.deepEqual(rows[1].parent, { kind: 'existing', id: 'id-dg', code: 'DG' });
    assert.deepEqual(rows[2].parent, { kind: 'file', line: 2, code: 'SC' });
    assert.deepEqual(rows[3].parent, { kind: 'existing', id: 'id-dg', code: 'DG' });
    // Chaque parent du fichier se crée avant ses enfants : DAF (3) avant SC (2) avant BC (4).
    assert.ok(order.indexOf(3) < order.indexOf(2) && order.indexOf(2) < order.indexOf(4));
    assert.deepEqual([...order].sort(), [2, 3, 4, 5]);
});

test('Parent introuvable, invalide ou identique au département : la ligne est ignorée', () => {
    const { rows } = parseDepartmentTable([HEAD,
        ['A1', 'Premier', 'INCONNU', ''],
        ['A2', 'Second', '9bad', ''],
        ['A3', 'Troisième', 'a3', '']], none);
    assert.match(rows[0].errors[0], /Parent introuvable : « INCONNU »/);
    assert.match(rows[1].errors[0], /Code du parent invalide/);
    assert.match(rows[2].errors[0], /propre parent/);
    assert.ok(rows.every(r => r.body === null));
});

test('Une boucle dans le fichier est signalée, et ses dépendants sont ignorés avec la raison', () => {
    const { rows, order } = parseDepartmentTable([HEAD,
        ['A', 'Un', 'B', ''], ['B', 'Deux', 'A', ''], ['C', 'Enfant de la boucle', 'A', ''], ['D', 'Indépendant', '', '']], none);
    assert.match(rows[0].errors[0], /Boucle hiérarchique/);
    assert.match(rows[1].errors[0], /Boucle hiérarchique/);
    assert.match(rows[2].errors[0], /Le parent « A » \(ligne 2\) est ignoré/);
    assert.deepEqual(order, [5]);
});

test('Un parent ignoré rend ses descendants impossibles à créer, de proche en proche', () => {
    const { rows, order } = parseDepartmentTable([HEAD,
        ['P', '', '', ''], ['Q', 'Fils', 'P', ''], ['R', 'Petit-fils', 'Q', ''], ['S', 'Autre', '', '']], none);
    assert.match(rows[0].errors[0], /Intitulé manquant/);
    assert.match(rows[1].errors[0], /Le parent « P » \(ligne 2\) est ignoré/);
    assert.match(rows[2].errors[0], /Le parent « Q » \(ligne 3\) est ignoré/);
    assert.deepEqual(order, [5]);
});
