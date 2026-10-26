import test from 'node:test';
import assert from 'node:assert/strict';
import { BY_LABELS, canOpen, level, meters, notes, params, rateText } from '../.test-build/physicalOccupation.js';

// Le métrage linéaire et le remplissage : ce que l'écran en dit.
test('un métrage s’affiche à la française, avec son unité, ou un tiret', () => {
    assert.equal(meters('11.5'), '11,5 ml');
    assert.equal(meters(0), '0 ml');
    assert.equal(meters(2.125), '2,125 ml');
    assert.equal(meters(null), '—');
    assert.equal(meters('pas un nombre'), '—');
});

test('le taux est un pourcentage entier, ou un tiret sans capacité mesurée', () => {
    assert.equal(rateText(0.35), '35 %');
    assert.equal(rateText(1.5), '150 %');
    assert.equal(rateText(0), '0 %');
    assert.equal(rateText(null), '—');
    assert.equal(rateText(undefined), '—');
});

test('le lieu a de la place, est presque plein, plein ou dépassé, avec les seuils de l’unité', () => {
    assert.equal(level(0.3), 'LIBRE');
    assert.equal(level(0.89), 'LIBRE');
    assert.equal(level(0.9), 'PRESQUE_PLEINE');
    assert.equal(level(1), 'PLEINE');
    assert.equal(level(1.2), 'DEPASSEE');
    assert.equal(level(null), 'SANS_CAPACITE');
});

test('ce que le métrage ne dit pas est dit, au pluriel quand il le faut', () => {
    assert.deepEqual(notes({ sansMetrage: 0, unitesAutreCapacite: 0 }), []);
    assert.deepEqual(notes({ sansMetrage: 1, unitesAutreCapacite: 0 }), ['1 archive hors métrage (autre unité ou sans quantité)']);
    assert.deepEqual(notes({ sansMetrage: 3, unitesAutreCapacite: 2 }), ['3 archives hors métrage (autre unité ou sans quantité)', '2 unités sans capacité en mètres linéaires']);
    assert.deepEqual(notes({ sansMetrage: 0, unitesAutreCapacite: 1 }), ['1 unité sans capacité en mètres linéaires']);
});

test('le lieu ouvert n’a de sens que par lieu, et seul un lieu qui a des sous-lieux s’ouvre', () => {
    assert.deepEqual(params('location', 'abc'), { by: 'location', parentId: 'abc' });
    assert.deepEqual(params('location', null), { by: 'location', parentId: null });
    assert.deepEqual(params('institution', 'abc'), { by: 'institution' });
    const row = { key: 'k', self: false, hasChildren: true };
    assert.equal(canOpen(row, 'location'), true);
    assert.equal(canOpen(row, 'institution'), false);
    assert.equal(canOpen({ ...row, hasChildren: false }, 'location'), false);
    assert.equal(canOpen({ ...row, self: true }, 'location'), false, 'la ligne « directement dans ce lieu » ne s’ouvre pas');
    assert.equal(canOpen({ ...row, key: null }, 'location'), false);
    assert.deepEqual(Object.keys(BY_LABELS), ['location', 'institution']);
});
