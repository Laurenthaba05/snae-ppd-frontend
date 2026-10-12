import test from 'node:test';
import assert from 'node:assert/strict';
import { splitByCodes, resolveGroups } from '../.test-build/batchPlan.js';
import { buildCode } from '../.test-build/scanCodes.js';

const E1 = '2f6a1c3e-8b7d-4c2a-9e51-0a7b3c9d4e12', E2 = '7c1d9b20-5e44-4a1f-8d36-9a0b1c2d3e4f', E3 = '2f6a1c3e-0000-4c2a-9e51-0a7b3c9d4e99', L1 = '9a8b7c6d-1111-4222-8333-444455556666';
const f = (name, ...codes) => ({ name, size: name.length, codes, unreadable: false });

test('Découpage : une feuille séparatrice ouvre un groupe, les pages suivantes lui appartiennent, ordre naturel des noms', () => {
    const split = splitByCodes([
        f('scan10.png'), f('scan02.png'), f('scan01.png', buildCode('ELEMENT', E1)), f('scan03.png'),
        f('scan04.png', buildCode('ELEMENT', E2, 'short')), f('scan05.png'), f('scan06.png'), f('scan07.png', 'texte sans rapport', 'LOT-2026-001')
    ]);
    assert.equal(split.groups.length, 2);
    assert.deepEqual(split.groups[0].pages.map(p => p.name), ['scan02.png', 'scan03.png']);
    assert.equal(split.groups[0].separator.name, 'scan01.png');
    assert.deepEqual(split.groups[1].pages.map(p => p.name), ['scan05.png', 'scan06.png', 'scan07.png', 'scan10.png']);
    assert.deepEqual(split.orphans, []);
});

test('Découpage : les fichiers avant la première feuille sont orphelins ; une feuille de lot ne sépare rien', () => {
    const split = splitByCodes([f('a.png'), f('b.png', buildCode('LOT', L1)), f('c.png', buildCode('ELEMENT', E1)), f('d.png')]);
    assert.deepEqual(split.orphans.map(o => o.name), ['a.png']);
    assert.deepEqual(split.lotSheets.map(l => [l.file.name, l.code.kind]), [['b.png', 'LOT']]);
    assert.deepEqual(split.groups[0].pages.map(p => p.name), ['d.png']);
});

test('Découpage : un fichier illisible (TIFF) est isolé au lieu d’être pris pour une page', () => {
    const split = splitByCodes([f('a.png', buildCode('ELEMENT', E1)), { name: 'b.tif', size: 1, codes: [], unreadable: true }, f('c.png')]);
    assert.deepEqual(split.unreadable.map(u => u.name), ['b.tif']);
    assert.deepEqual(split.groups[0].pages.map(p => p.name), ['c.png']);
});

test('Rattachement : élément introuvable, code court ambigu, doublon et groupe vide sont signalés', () => {
    const elements = [{ id: E1 }, { id: E2 }, { id: E3 }];
    const split = splitByCodes([
        f('a1.png', buildCode('ELEMENT', E2)), f('a2.png'),
        f('b1.png', buildCode('ELEMENT', E1, 'short')), f('b2.png'),            // 2F6A1C3E : E1 et E3 → ambigu
        f('c1.png', buildCode('ELEMENT', '00000000-0000-4000-8000-000000000000')), f('c2.png'),
        f('d1.png', buildCode('ELEMENT', E2)), f('d2.png'),                     // E2 une seconde fois
        f('e1.png', buildCode('ELEMENT', E1)),                                  // aucune page
    ]);
    const resolved = resolveGroups(split.groups, elements);
    assert.deepEqual(resolved.map(r => [r.element?.id ?? null, r.problem]), [[E2, null], [null, 'AMBIGU'], [null, 'INTROUVABLE'], [E2, 'DOUBLON'], [E1, 'VIDE']]);
});
