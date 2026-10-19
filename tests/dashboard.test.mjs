import test from 'node:test';
import assert from 'node:assert/strict';
import { ARCHIVAL_LABELS, PALETTE, monthLabel, monthlySeries, share, slices, sum, unitTree } from '../.test-build/dashboard.js';

const unit = (id, code, parentId = null, over = {}) => ({ id, parentId, code, name: 'Unité ' + code, type: 'DIRECTION', documents: 0, dossiers: 0, directDocuments: 0, directDossiers: 0, ...over });

test('Les parts d’un tout suivent l’ordre des libellés connus, puis les autres par ordre alphabétique', () => {
    const parts = slices({ SEMI_ACTIF: 3, BROUILLON: 5, Z_NOUVEAU: 1, A_NOUVEAU: 2 }, ARCHIVAL_LABELS);
    assert.deepEqual(parts.map(p => p.key), ['BROUILLON', 'SEMI_ACTIF', 'A_NOUVEAU', 'Z_NOUVEAU']);
    assert.deepEqual(parts.map(p => p.label), ['Brouillon', 'Semi-actif', 'A_NOUVEAU', 'Z_NOUVEAU']);
    assert.deepEqual(parts.map(p => p.value), [5, 3, 2, 1]);
});

test('Une clé inconnue garde son code et jamais un nom inventé ; une clé absente n’apparaît pas', () => {
    const parts = slices({ NOUVEAU: 4 }, ARCHIVAL_LABELS);
    assert.deepEqual(parts, [{ key: 'NOUVEAU', label: 'NOUVEAU', value: 4, color: PALETTE[0] }]);
    assert.deepEqual(slices({}, ARCHIVAL_LABELS), []);
});

test('La palette recommence quand les parts dépassent ses couleurs, sans jamais manquer', () => {
    const many = Object.fromEntries(Array.from({ length: PALETTE.length + 3 }, (_, i) => ['K' + String(i).padStart(2, '0'), i + 1]));
    const parts = slices(many, {});
    assert.equal(parts.length, PALETTE.length + 3);
    assert.ok(parts.every(p => typeof p.color === 'string' && p.color.startsWith('#')));
    assert.equal(parts[PALETTE.length].color, PALETTE[0]);
});

test('L’arbre des unités : le parent d’abord, ses sous-unités ensuite par code, avec leur profondeur', () => {
    const rows = unitTree([unit('c', 'C', 'a'), unit('a', 'A'), unit('b', 'B', 'a'), unit('d', 'D', 'b'), unit('z', 'Z')]);
    assert.deepEqual(rows.map(r => [r.unit.code, r.depth]), [['A', 0], ['B', 1], ['D', 2], ['C', 1], ['Z', 0]]);
});

test('Une unité dont le parent est hors du périmètre devient une racine', () => {
    const rows = unitTree([unit('b', 'B', 'absent'), unit('c', 'C', 'b')]);
    assert.deepEqual(rows.map(r => [r.unit.code, r.depth]), [['B', 0], ['C', 1]]);
});

test('Une boucle dans l’arbre ne fait jamais tourner la lecture, et rien n’est perdu', () => {
    const rows = unitTree([unit('a', 'A', 'b'), unit('b', 'B', 'a'), unit('s', 'S', 's')]);
    assert.equal(rows.length, 3);
    assert.deepEqual(rows.map(r => r.unit.code).sort(), ['A', 'B', 'S']);
});

test('Le mois « 2026-10 » se lit « Oct. » et un texte mal formé reste tel quel', () => {
    assert.equal(monthLabel('2026-01'), 'Janv.');
    assert.equal(monthLabel('2026-10'), 'Oct.');
    assert.equal(monthLabel('2026-12'), 'Déc.');
    assert.equal(monthLabel('2026-13'), '2026-13');
    assert.equal(monthLabel('octobre'), 'octobre');
    assert.deepEqual(monthlySeries([{ month: '2026-09', count: 4 }, { month: '2026-10', count: 0 }]), [{ key: '2026-09', label: 'Sept.', value: 4 }, { key: '2026-10', label: 'Oct.', value: 0 }]);
});

test('Une part d’un total vide vaut zéro, jamais une division par zéro', () => {
    assert.equal(share(1, 0), 0);
    assert.equal(share(1, 3), 33);
    assert.equal(share(2, 3), 67);
    assert.equal(sum({ A: 2, B: 5 }), 7);
    assert.equal(sum({}), 0);
});
