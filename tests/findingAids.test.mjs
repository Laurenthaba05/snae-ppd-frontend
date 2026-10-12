import test from 'node:test';
import assert from 'node:assert/strict';
import { FIELD_SECTIONS, datesText, exportLinks, filledSections, levelLabel, visibilityText } from '../.test-build/findingAids.js';

test('Ce que le public voit d’un instrument se dit en une phrase', () => {
    assert.equal(visibilityText(0, 0), 'Aucune notice');
    assert.equal(visibilityText(1, 1), 'La notice est visible');
    assert.equal(visibilityText(6, 6), 'Les 6 notices sont visibles');
    assert.equal(visibilityText(1, 6), '1 notice visible sur 6');
    assert.equal(visibilityText(3, 6), '3 notices visibles sur 6');
});

test('Les niveaux ont un libellé, un niveau inconnu reste générique', () => {
    assert.equal(levelLabel('FONDS'), 'Fonds');
    assert.equal(levelLabel('SOUS_SERIE'), 'Sous-série');
    assert.equal(levelLabel('AUTRE'), 'Notice');
});

test('Les dates d’une notice : l’étiquette, sinon l’intervalle des années', () => {
    assert.equal(datesText({ dateLabel: ' vers 1910 ', dateStart: '1908-01-01' }), 'vers 1910');
    assert.equal(datesText({ dateStart: '1950-01-01', dateEnd: '1960-12-31' }), '1950–1960');
    assert.equal(datesText({ dateStart: '1950-01-01', dateEnd: '1950-12-31' }), '1950');
    assert.equal(datesText({}), null);
});

test('Seules les sections renseignées sont montrées, dans l’ordre de lecture', () => {
    const sections = filledSections({ scopeContent: 'Registres', language: 'Français', accessConditions: ' ', custodialHistory: 'Versé en 1960' });
    assert.deepEqual(sections.map(s => s.title), ['Contenu et structure', 'Conditions d’accès et d’utilisation', 'Contexte']);
    assert.deepEqual(sections[1]?.rows, [['Langue', 'Français']]);
    assert.deepEqual(filledSections({}), []);
});

test('Aucun élément interne n’est prévu à l’affichage public', () => {
    const shown = FIELD_SECTIONS.flatMap(s => s.fields.map(f => f[0]));
    for (const secret of ['appraisal', 'archivistNote', 'note', 'rules', 'sources', 'status']) assert.ok(!shown.includes(secret), secret);
});

test('Les exports publics d’une notice pointent vers les routes du portail', () => {
    const links = exportLinks('abc');
    assert.equal(links.rico, '/api/v1/portal/inventaires/notices/abc/ric-o');
    assert.equal(links.dublinCore, '/api/v1/portal/inventaires/notices/abc/dc');
});
