import test from 'node:test';
import assert from 'node:assert/strict';
import { candidates, choiceOf, choicesFor, emptyRelationForm, formOf, lineage, linesOf, partialDateText, periodText, relationBody, relationProblems, tutelleChain, typeAllowed } from '../.test-build/authorityRelations.js';

const INST = 'inst-1';
const auth = (id, name, kind = 'COLLECTIVITE') => ({ id, code: id.toUpperCase(), name, kind });
const A = auth('a', 'Ministère de l’Énergie'), B = auth('b', 'Ministère des Mines'), C = auth('c', 'Présidence'), D = auth('d', 'Ministère de l’Énergie et de l’Hydraulique');
const P = auth('p', 'Mariam Keita', 'PERSONNE'), F = auth('f', 'Famille Keita', 'FAMILLE');
const all = [A, B, C, D, P, F];
let n = 0;
const rel = (sourceId, targetId, type, dateStart = null, dateEnd = null, description = null) => ({ id: 'r' + (++n), version: 0, updatedAt: '2026-10-09T00:00:00Z', input: { institutionId: INST, sourceId, targetId, type, dateStart, dateEnd, description } });

test('Les dates partielles se lisent en toutes lettres et les périodes se disent simplement', () => {
    assert.equal(partialDateText('2018'), '2018');
    assert.equal(partialDateText('2018-03'), 'mars 2018');
    assert.equal(partialDateText('2018-02-14'), '14 février 2018');
    assert.equal(partialDateText('2018-02-01'), '1er février 2018');
    assert.equal(partialDateText(''), ''); assert.equal(partialDateText(null), ''); assert.equal(partialDateText('18'), ''); assert.equal(partialDateText('2018-13'), '');
    assert.equal(periodText('2018', null), 'depuis 2018');
    assert.equal(periodText(null, '2021'), 'jusqu’en 2021');
    assert.equal(periodText(null, '2021-09-05'), 'jusqu’au 5 septembre 2021');
    assert.equal(periodText('2018', '2021'), 'de 2018 à 2021');
    assert.equal(periodText('2020', '2020'), '2020');
    assert.equal(periodText(null, null), '');
});

test('Une relation se dit depuis la notice regardée, avec le nom de l’autre, jamais son identifiant', () => {
    const relations = [rel('a', 'c', 'TUTELLE', '2018'), rel('d', 'a', 'SUCCESSION', '2021-09-06'), rel('a', 'b', 'SUCCESSION', '2018', '2018-02', 'Fusion')];
    const { lines, unreadable } = linesOf('a', relations, all, '2026-10-09');
    assert.equal(unreadable, 0);
    assert.deepEqual(lines.map(l => [l.type, l.label, l.otherName, l.period]), [
        ['TUTELLE', 'Sous la tutelle de', 'Présidence', 'depuis 2018'],
        ['SUCCESSION', 'Succède à', 'Ministère des Mines', 'de 2018 à février 2018'],
        ['SUCCESSION', 'Remplacée par', 'Ministère de l’Énergie et de l’Hydraulique', 'depuis 6 septembre 2021']]);
    assert.equal(lines[1].description, 'Fusion'); assert.equal(lines[1].ended, true); assert.equal(lines[0].ended, false);
    // vue depuis la présidence : elle exerce la tutelle
    assert.deepEqual(linesOf('c', relations, all).lines.map(l => [l.label, l.otherName]), [['Exerce la tutelle sur', 'Ministère de l’Énergie']]);
});

test('Une notice liée qui n’est plus lisible est comptée sans être nommée', () => {
    const { lines, unreadable } = linesOf('a', [rel('a', 'zz', 'ASSOCIATIVE'), rel('a', 'b', 'ASSOCIATIVE')], all);
    assert.equal(lines.length, 1); assert.equal(unreadable, 1);
});

test('La filiation suit les successions de proche en proche, dans l’ordre où elles se suivent', () => {
    const relations = [rel('a', 'b', 'SUCCESSION', '2012', '2017'), rel('d', 'a', 'SUCCESSION', '2021'), rel('b', 'c', 'SUCCESSION', '2000', '2011')];
    const l = lineage('a', relations, all);
    assert.deepEqual(l.earlier.map(s => s.name), ['Présidence', 'Ministère des Mines']);          // C puis B avant A
    assert.deepEqual(l.later.map(s => s.name), ['Ministère de l’Énergie et de l’Hydraulique']);
    assert.equal(l.later[0].period, 'depuis 2021');
    assert.deepEqual(lineage('c', [], all), { earlier: [], later: [] });
});

test('La filiation s’arrête sur une boucle datée au lieu de tourner sans fin', () => {
    const relations = [rel('a', 'b', 'SUCCESSION', '2010', '2015'), rel('b', 'a', 'SUCCESSION', '2018')];
    const l = lineage('a', relations, all);
    assert.deepEqual(l.earlier.map(s => s.name), ['Ministère des Mines']);
    assert.deepEqual(l.later.map(s => s.name), ['Ministère des Mines']);
});

test('Une fusion ou une scission donne plusieurs étapes à la même distance', () => {
    const relations = [rel('d', 'a', 'SUCCESSION', '2021'), rel('d', 'b', 'SUCCESSION', '2021')];
    assert.deepEqual(lineage('d', relations, all).earlier.map(s => s.name).sort(), ['Ministère de l’Énergie', 'Ministère des Mines']);
});

test('La tutelle actuelle se lit de proche en proche, la relation terminée est ignorée', () => {
    const relations = [rel('a', 'b', 'TUTELLE', '2010', '2015'), rel('a', 'c', 'TUTELLE', '2016'), rel('c', 'd', 'TUTELLE', '2000')];
    assert.deepEqual(tutelleChain('a', relations, all, '2026-10-09'), ['Présidence', 'Ministère de l’Énergie et de l’Hydraulique']);
    assert.deepEqual(tutelleChain('a', relations, all, '2012-05-01'), ['Ministère des Mines']);
    assert.deepEqual(tutelleChain('d', relations, all, '2026-10-09'), []);
    // une boucle n’est parcourue qu’une fois
    assert.deepEqual(tutelleChain('a', [rel('a', 'b', 'TUTELLE'), rel('b', 'a', 'TUTELLE')], all), ['Ministère des Mines']);
});

test('Les types permis dépendent du genre des notices, et les choix proposés aussi', () => {
    assert.equal(typeAllowed('TUTELLE', 'COLLECTIVITE', 'COLLECTIVITE'), true);
    assert.equal(typeAllowed('TUTELLE', 'PERSONNE', 'COLLECTIVITE'), false);
    assert.equal(typeAllowed('FAMILIALE', 'PERSONNE', 'FAMILLE'), true);
    assert.equal(typeAllowed('FAMILIALE', 'COLLECTIVITE', 'FAMILLE'), false);
    assert.equal(typeAllowed('ASSOCIATIVE', 'COLLECTIVITE', 'PERSONNE'), true);
    assert.deepEqual(choicesFor('COLLECTIVITE').map(c => c.key), ['TUTELLE_SOURCE', 'TUTELLE_TARGET', 'SUCCESSION_SOURCE', 'SUCCESSION_TARGET', 'ASSOCIATIVE']);
    assert.deepEqual(choicesFor('PERSONNE').map(c => c.key), ['FAMILIALE', 'ASSOCIATIVE']);
    assert.deepEqual(candidates(choiceOf('TUTELLE', true), A, all).map(x => x.name), ['Ministère de l’Énergie et de l’Hydraulique', 'Ministère des Mines', 'Présidence']);   // ni elle-même, ni une personne
    assert.deepEqual(candidates(choiceOf('FAMILIALE', true), P, all).map(x => x.name), ['Famille Keita']);
});

test('Avant l’envoi : nature, autre notice, genres, dates partielles et ordre sont contrôlés', () => {
    const ok = { ...emptyRelationForm(), choiceKey: 'SUCCESSION_SOURCE', otherId: 'b', dateStart: '2018', dateEnd: '2021-09' };
    assert.deepEqual(relationProblems(ok, A, all), []);
    assert.deepEqual(relationProblems(emptyRelationForm(), A, all), ['Choisissez l’autre notice.']);
    assert.match(relationProblems({ ...ok, otherId: 'p' }, A, all)[0], /ne s’applique pas à ces deux types/);
    assert.match(relationProblems({ ...ok, dateStart: '2018-13' }, A, all)[0], /Date de début/);
    assert.match(relationProblems({ ...ok, dateEnd: '2019-02-30' }, A, all)[0], /ce jour n’existe pas/);
    assert.match(relationProblems({ ...ok, dateStart: '2022', dateEnd: '2021' }, A, all)[0], /début dépasse/);
    assert.deepEqual(relationProblems({ ...ok, dateStart: '2020', dateEnd: '2020-12' }, A, all), []);
    assert.match(relationProblems({ ...ok, description: 'x'.repeat(10001) }, A, all)[0], /10 000/);
    assert.match(relationProblems({ ...ok, choiceKey: 'INCONNU' }, A, all)[0], /nature/);
});

test('Le corps envoyé respecte le sens d’enregistrement, quel que soit le côté d’où l’on regarde', () => {
    const form = { choiceKey: 'TUTELLE_SOURCE', otherId: 'c', dateStart: ' 2018 ', dateEnd: '', description: '  Tutelle administrative ' };
    assert.deepEqual(relationBody(form, A, INST), { institutionId: INST, sourceId: 'a', targetId: 'c', type: 'TUTELLE', dateStart: '2018', dateEnd: null, description: 'Tutelle administrative' });
    // « Exerce la tutelle sur » : la notice regardée devient la cible
    const reverse = relationBody({ ...form, choiceKey: 'TUTELLE_TARGET', otherId: 'b' }, A, INST, 3);
    assert.deepEqual([reverse.sourceId, reverse.targetId, reverse.version], ['b', 'a', 3]);
    assert.equal('version' in relationBody(form, A, INST), false);
});

test('Le formulaire d’une relation existante redonne le choix vu depuis la notice regardée', () => {
    const view = rel('d', 'a', 'SUCCESSION', '2021', null, 'Reprise');
    assert.deepEqual(formOf(view, A), { choiceKey: 'SUCCESSION_TARGET', otherId: 'd', dateStart: '2021', dateEnd: '', description: 'Reprise' });
    assert.equal(formOf(view, D).choiceKey, 'SUCCESSION_SOURCE');
    assert.equal(formOf(rel('p', 'f', 'FAMILIALE'), F).choiceKey, 'FAMILIALE');
});
