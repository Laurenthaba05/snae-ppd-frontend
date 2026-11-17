import test from 'node:test';
import assert from 'node:assert/strict';
import { RELIABILITY_LABEL, preparationLabel, reliabilityCounts, reliabilityLabel, reliabilityReasons } from '../.test-build/textReliability.js';

// La fiabilité d'un texte reconnu vient du serveur ; l'écran la nomme, la compte et en donne les raisons.
const item = (level, reasons = []) => ({ fiabilite: level ? { level, reasons: reasons.map((message, i) => ({ code: 'R' + i, message })) } : null });

test('Chaque niveau a un libellé en toutes lettres, jamais une couleur seule', () => {
    assert.deepEqual(Object.keys(RELIABILITY_LABEL), ['FIABLE', 'A_VERIFIER', 'NON_FIABLE']);
    assert.equal(reliabilityLabel('FIABLE'), 'Fiable');
    assert.equal(reliabilityLabel('A_VERIFIER'), 'À vérifier');
    assert.equal(reliabilityLabel('NON_FIABLE'), 'Non fiable');
    assert.equal(reliabilityLabel(null), 'Non évaluée');
    assert.equal(reliabilityLabel(undefined), 'Non évaluée');
    assert.equal(reliabilityLabel('NOUVEAU'), 'À vérifier');   // un niveau inconnu du serveur n'est jamais présenté comme fiable
});

test('Les textes de la liste sont comptés par niveau, ceux sans évaluation à part', () => {
    const counts = reliabilityCounts([item('FIABLE'), item('FIABLE'), item('A_VERIFIER', ['x']), item('NON_FIABLE', ['y']), item(null), {}]);
    assert.deepEqual(counts, { fiable: 2, aVerifier: 1, nonFiable: 1, nonEvalue: 2 });
});

test('Les raisons ne s’affichent que pour un texte à vérifier ou non fiable, sans doublon', () => {
    assert.deepEqual(reliabilityReasons(item('FIABLE', ['Texte natif'])), []);
    assert.deepEqual(reliabilityReasons(item(null)), []);
    assert.deepEqual(reliabilityReasons(item('A_VERIFIER', ['Confiance de 85 %', 'Confiance de 85 %', 'Page floue'])), ['Confiance de 85 %', 'Page floue']);
});

test('La préparation de l’image est dite en toutes lettres', () => {
    assert.equal(preparationLabel(null), '');
    assert.equal(preparationLabel(undefined), '');
    assert.match(preparationLabel('median3'), /Lu après préparation de l’image \(filtre médian léger\)/);
    assert.match(preparationLabel('blur_threshold'), /noir et blanc/);
    assert.equal(preparationLabel('inconnue'), 'Lu après préparation de l’image');
});
