import test from 'node:test';
import assert from 'node:assert/strict';
import { NOTE_MIN, foldCote, lostNoteProblem, readScan } from '../.test-build/physicalInventory.js';

// Le récolement par lecture : une lecture désigne une archive attendue, une archive d'ailleurs, une cote inconnue ici ou rien du tout.
const A = '8b1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', B = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', OTHER = '99999999-aaaa-4bbb-8ccc-dddddddddddd';
const expected = [{ id: A, cote: 'DP-2015-001' }, { id: B, cote: 'DP-2016-002' }, { id: 'c', cote: 'Élève-7' }, { id: 'd', cote: 'ÉLÈVE-7' }];

test('la cote lue se retrouve sans tenir compte de la casse ni des accents', () => {
    assert.equal(foldCote('  Élève-7 '), 'eleve-7');
    assert.deepEqual(readScan('dp-2015-001', expected), { kind: 'EXPECTED', id: A });
    assert.deepEqual(readScan(' DP-2016-002\n', expected), { kind: 'EXPECTED', id: B });
});

test('le code du QR désigne l’archive sans ambiguïté, qu’elle soit de cette unité ou d’une autre', () => {
    assert.deepEqual(readScan('SNAE:A:' + A.toUpperCase(), expected), { kind: 'EXPECTED', id: A });
    assert.deepEqual(readScan('SNAE:A:' + OTHER.toUpperCase(), expected), { kind: 'OTHER_CODE', id: OTHER });
    assert.deepEqual(readScan('SNAE:U:' + A.toUpperCase(), expected), { kind: 'UNIT', id: A });
});

test('une cote inconnue ici, ou qui désigne deux archives de l’unité, n’est pas reconnue d’office', () => {
    assert.deepEqual(readScan('XX-999', expected), { kind: 'COTE', cote: 'XX-999' });
    assert.deepEqual(readScan('eleve-7', expected), { kind: 'COTE', cote: 'eleve-7' }, 'deux archives portent cette cote une fois repliée : on relit le QR');
    assert.deepEqual(readScan('   ', expected), { kind: 'EMPTY' });
});

test('déclarer une archive introuvable exige une note qui dit où l’on a cherché', () => {
    assert.equal(NOTE_MIN, 10);
    assert.match(lostNoteProblem('court'), /au moins 10 caractères/);
    assert.equal(lostNoteProblem('Cherchée en salle 3 et au bureau'), null);
    assert.match(lostNoteProblem('         '), /au moins 10/);
});
