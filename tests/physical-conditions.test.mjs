import test from 'node:test';
import assert from 'node:assert/strict';
import { conditionsBody, decimal, emptyReading, filling, occupationText, readingBody, readingProblem, readingText, settingsBody, settingsForm, settingsProblems, thresholdsOf } from '../.test-build/physicalConditions.js';

// La capacité d'une unité se mesure et se compare à ce qui est rangé ; les seuils de conservation se vérifient par des relevés.
test('un nombre s’affiche à la française, sans zéros inutiles', () => {
    assert.equal(decimal('3.50'), '3,5');
    assert.equal(decimal(12), '12');
    assert.equal(decimal(null), '—');
    assert.equal(decimal('pas un nombre'), '—');
});

test('l’occupation se dit avec la capacité, l’unité et le taux, ou seule quand aucune capacité n’est fixée', () => {
    assert.equal(occupationText({ utilise: '12', unite: 'boîtes', taux: 0.3, nonCompte: 0 }, '40'), '12 / 40 boîtes (30 %)');
    assert.equal(occupationText({ utilise: 3.5, unite: 'mètres linéaires', taux: 0.35, nonCompte: 2 }, 10), '3,5 / 10 mètres linéaires (35 %)');
    assert.equal(occupationText({ utilise: 7, unite: 'archives', taux: null, nonCompte: 0 }, null), '7 archives');
    assert.equal(occupationText(null, 10), '—');
});

test('l’unité est libre, presque pleine, pleine ou dépassée', () => {
    const at = taux => ({ utilise: 1, unite: 'archives', taux, nonCompte: 0 });
    assert.equal(filling(at(0.3)), 'LIBRE');
    assert.equal(filling(at(0.89)), 'LIBRE');
    assert.equal(filling(at(0.9)), 'PRESQUE_PLEINE');
    assert.equal(filling(at(1)), 'PLEINE');
    assert.equal(filling(at(1.5)), 'DEPASSEE');
    assert.equal(filling(at(null)), 'SANS_CAPACITE');
    assert.equal(filling(null), 'SANS_CAPACITE');
});

test('les seuils se lisent dans le champ libre, sans toucher au reste', () => {
    const conditions = { temperature: { min: 14, max: 20 }, humidite: { max: '55' }, eclairage: 'faible' };
    assert.deepEqual(thresholdsOf(conditions), { TEMPERATURE: { min: 14, max: 20 }, HUMIDITE: { min: null, max: 55 } });
    assert.deepEqual(thresholdsOf(null), { TEMPERATURE: { min: null, max: null }, HUMIDITE: { min: null, max: null } });
    assert.deepEqual(thresholdsOf([1, 2]), { TEMPERATURE: { min: null, max: null }, HUMIDITE: { min: null, max: null } });
    const form = settingsForm({ capacite: '40.000', uniteCapacite: 'boîtes', conditionsConservation: conditions });
    assert.deepEqual(form, { capacite: '40', uniteCapacite: 'boîtes', temperatureMin: '14', temperatureMax: '20', humiditeMin: '', humiditeMax: '55' });
    assert.deepEqual(conditionsBody(form, conditions), { eclairage: 'faible', temperature: { min: 14, max: 20 }, humidite: { max: 55 } });
});

test('retirer les seuils d’une mesure la retire, et il ne reste rien quand rien n’est saisi', () => {
    const form = { capacite: '', uniteCapacite: '', temperatureMin: '', temperatureMax: '', humiditeMin: '', humiditeMax: '40,5' };
    assert.deepEqual(conditionsBody(form, { temperature: { max: 20 }, humidite: { max: 55 } }), { humidite: { max: 40.5 } });
    assert.equal(conditionsBody({ ...form, humiditeMax: '' }, { temperature: { max: 20 } }), null);
    assert.deepEqual(settingsBody({ ...form, capacite: '12,5', uniteCapacite: ' ml ' }, 4, null), { versionLock: 4, capacite: 12.5, uniteCapacite: 'ml', conditionsConservation: { humidite: { max: 40.5 } } });
});

test('ce qui empêche d’enregistrer des réglages est dit en phrases', () => {
    const ok = { capacite: '', uniteCapacite: '', temperatureMin: '', temperatureMax: '', humiditeMin: '', humiditeMax: '' };
    assert.deepEqual(settingsProblems(ok), []);
    assert.deepEqual(settingsProblems({ ...ok, capacite: '-3' }), ['La capacité est un nombre positif.']);
    assert.deepEqual(settingsProblems({ ...ok, uniteCapacite: 'boîtes' }), ['Indiquez la capacité, ou retirez son unité.']);
    assert.deepEqual(settingsProblems({ ...ok, temperatureMin: '20', temperatureMax: '14' }), ['Le minimum de température ne dépasse pas son maximum.']);
    assert.deepEqual(settingsProblems({ ...ok, humiditeMax: '140' }), ['Un seuil d’humidité relative est entre 0 et 100 %.']);
    assert.deepEqual(settingsProblems({ ...ok, temperatureMin: 'froid' }), ['Les seuils de température sont des nombres.']);
});

test('un relevé se contrôle avant d’être envoyé, et part sans espaces superflus', () => {
    assert.equal(readingProblem({ ...emptyReading(), valeur: '' }), 'Indiquez la valeur relevée.');
    assert.equal(readingProblem({ ...emptyReading(), valeur: 'chaud' }), 'La valeur relevée est un nombre.');
    assert.match(readingProblem({ ...emptyReading(), mesure: 'HUMIDITE', valeur: '140' }), /entre 0 et 100 %/);
    assert.equal(readingProblem({ ...emptyReading(), valeur: '22,5' }), null);
    assert.deepEqual(readingBody({ mesure: 'TEMPERATURE', valeur: '22,5', note: '  hygromètre  ' }), { mesure: 'TEMPERATURE', valeur: 22.5, note: 'hygromètre' });
    assert.equal(readingText({ mesure: 'TEMPERATURE', valeur: '24.50', releveLe: '2026-10-22T08:00:00Z' }, iso => iso.slice(0, 10)), '24,5 °C · 2026-10-22');
});
