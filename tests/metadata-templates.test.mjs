import test from 'node:test';
import assert from 'node:assert/strict';
import { instantiateBody, schemaCodeProblem, templateGroups, templateSummary } from '../.test-build/metadataTemplates.js';

const field = (code, over = {}) => ({ code, name: code, description: '', type: 'TEXTE', required: false, repeatable: true, maxLength: 100, group: null, ...over });

test('Le résumé d’un gabarit dit le nombre de champs, les obligatoires et les répétables', () => {
    assert.equal(templateSummary({ fields: [field('A'), field('B')] }), '2 champs : tous facultatifs, tous répétables');
    assert.equal(templateSummary({ fields: [field('A', { required: true }), field('B', { repeatable: false })] }), '2 champs : 1 obligatoire, 1 répétable');
    assert.equal(templateSummary({ fields: [field('A', { repeatable: false })] }), '1 champ : tous facultatifs');
});

test('Les champs se regroupent dans l’ordre du gabarit, les gabarits sans groupe forment un seul ensemble', () => {
    const groups = templateGroups({ fields: [field('A', { group: 'USAGE' }), field('B', { group: 'IDENTITE' }), field('C', { group: 'USAGE' })] });
    assert.deepEqual(groups.map(g => [g.group, g.label, g.fields.map(f => f.code)]), [['USAGE', 'Usage', ['A', 'C']], ['IDENTITE', 'Identité', ['B']]]);
    const flat = templateGroups({ fields: [field('A'), field('B')] });
    assert.equal(flat.length, 1);
    assert.equal(flat[0].label, 'Éléments');
});

test('Le code du schéma est facultatif et limité, le corps ne porte que ce qui est renseigné', () => {
    assert.equal(schemaCodeProblem(''), null);
    assert.equal(schemaCodeProblem('DC-PILOTE'), null);
    assert.match(schemaCodeProblem('x'.repeat(101)), /100 caractères/);
    assert.deepEqual(instantiateBody(null, '  '), {});
    assert.deepEqual(instantiateBody('97571d20-3f49-497e-a185-dac22208eb3f', ' DC-PILOTE '), { institutionId: '97571d20-3f49-497e-a185-dac22208eb3f', schemaCode: 'DC-PILOTE' });
    assert.throws(() => instantiateBody('pas-un-uuid', ''));
});
