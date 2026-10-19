import test from 'node:test';
import assert from 'node:assert/strict';
import { countryProblem, isilCountryProblem, isilProblem, languageCodesProblem, partialDateOrderProblem, partialDateProblem, scriptCodesProblem } from '../.test-build/archivalCodes.js';
import { descriptionProblems, DESCRIPTION_GROUPS } from '../.test-build/archivalDescription.js';

test('Une date se donne à l’année, au mois ou au jour', () => {
    for (const ok of ['1923', '1923-05', '1923-05-14', '2024-02-29', '', '  ', null, undefined]) assert.equal(partialDateProblem('Date', ok), null, String(ok));
    for (const bad of ['19', '1923-5', '1923-13', '1923-00', '1923-05-32', '23-05-14', '1923/05', 'vers 1950', '0000']) assert.notEqual(partialDateProblem('Date', bad), null, bad);
    assert.equal(partialDateProblem('Date de début', '1923-02-30'), 'Date de début : ce jour n’existe pas.');
    assert.notEqual(partialDateProblem('Date', '2023-02-29'), null);
});

test('L’ordre de deux dates à précision différente se juge sur ce qu’elles couvrent', () => {
    assert.equal(partialDateOrderProblem('1923', '1923'), null);
    assert.equal(partialDateOrderProblem('1923', '1923-05'), null);
    assert.equal(partialDateOrderProblem('1950', null), null);
    assert.equal(partialDateOrderProblem('1950', '1949-12'), 'La date de début dépasse la date de fin.');
    assert.equal(partialDateOrderProblem('1950-06-01', '1950-05'), 'La date de début dépasse la date de fin.');
    assert.equal(partialDateOrderProblem('vers', '1950'), null);   // une forme invalide est signalée ailleurs
});

test('La langue et l’écriture se donnent en codes séparés par « + »', () => {
    for (const ok of ['fr', 'fr+man', 'FR , ff', 'fr;en', 'sus', '', null]) assert.equal(languageCodesProblem('Langue', ok), null, String(ok));
    for (const bad of ['français', 'f', 'fr+', 'fr man', 'fr-FR', '1a']) assert.notEqual(languageCodesProblem('Langue', bad), null, bad);
    for (const ok of ['Latn', 'latn+Nkoo', 'Arab, Adlm', '']) assert.equal(scriptCodesProblem('Écritures', ok), null, ok);
    for (const bad of ['latin', 'Lat', 'Latn1', 'Latn Arab']) assert.notEqual(scriptCodesProblem('Écritures', bad), null, bad);
});

test('Le pays et l’identifiant du service ont la forme ISO 3166-1 et ISIL', () => {
    for (const ok of ['GN', 'gn', '', null]) assert.equal(countryProblem(ok), null, String(ok));
    for (const bad of ['GIN', 'G', 'G1']) assert.notEqual(countryProblem(bad), null, bad);
    for (const ok of ['GN-ANG', 'FR-751131010', 'ABCD-x:y/z-1', '']) assert.equal(isilProblem(ok), null, ok);
    for (const bad of ['GN', 'GN-', 'GN_ANG', 'GN ANG', 'GNABC-1', 'GN-ABCDEFGHIJKL']) assert.notEqual(isilProblem(bad), null, bad);
    assert.equal(isilCountryProblem('GN', 'GN-ANG'), null);
    assert.equal(isilCountryProblem('gn', 'GN-ANG'), null);
    assert.equal(isilCountryProblem('GN', 'ANG-1'), null);
    assert.match(isilCountryProblem('GN', 'FR-ANG'), /ne correspond pas au pays/);
});

test('La notice de description signale une date, une langue ou une écriture mal formées avant l’envoi', () => {
    assert.deepEqual(descriptionProblems({ dateStart: '1923', dateEnd: '1950-05', language: 'fr+man', scripts: 'Latn' }, true), []);
    const problems = descriptionProblems({ dateStart: '1950', dateEnd: '1949', language: 'français', scripts: 'latin' }, true);
    assert.equal(problems.length, 3);
    assert.ok(problems.some(p => p.startsWith('La date de début dépasse')));
    assert.ok(problems.some(p => p.startsWith('Langue')));
    assert.ok(problems.some(p => p.startsWith('Écritures')));
});

test('Les dates, la langue et les écritures d’une notice se saisissent par des champs adaptés', () => {
    const kinds = Object.fromEntries(DESCRIPTION_GROUPS.flatMap(g => g.fields).map(f => [f.key, f.kind]));
    assert.equal(kinds.dateStart, 'partialDate'); assert.equal(kinds.dateEnd, 'partialDate'); assert.equal(kinds.language, 'languages'); assert.equal(kinds.scripts, 'scripts');
});
