import assert from 'node:assert/strict';
import test from 'node:test';
import {
    KIND_ORDER, emptyFunction, flattenFunctions, functionProblems, kindsUnder, naturesFor, parentCandidates
} from '../.test-build/archivalFunctions.js';

const INST = '11111111-1111-4111-8111-111111111111';
const view = (id, code, kind, parentId = null) => ({ id, version: 0, createdAt: '', updatedAt: '', input: { ...emptyFunction(INST), code, name: 'Fonction ' + code, kind, parentId } });

test('un niveau ne se place que sous un niveau plus haut, processus et autre se placent partout', () => {
    assert.deepEqual(kindsUnder(null), [...KIND_ORDER]);
    assert.deepEqual(kindsUnder('FONCTION'), ['SOUS_FONCTION', 'ACTIVITE', 'TACHE', 'PROCESSUS', 'AUTRE']);
    assert.deepEqual(kindsUnder('ACTIVITE'), ['TACHE', 'PROCESSUS', 'AUTRE']);
    assert.deepEqual(kindsUnder('TACHE'), ['PROCESSUS', 'AUTRE']);
    assert.deepEqual(kindsUnder('PROCESSUS'), [...KIND_ORDER]);
});

test('les mères possibles écartent la fonction elle-même, ses descendantes et les niveaux plus bas', () => {
    const rows = [view('a', 'A', 'FONCTION'), view('b', 'B', 'SOUS_FONCTION', 'a'), view('c', 'C', 'ACTIVITE', 'b'), view('d', 'D', 'FONCTION')];
    assert.deepEqual(parentCandidates(rows, 'ACTIVITE', null).map(r => r.id), ['a', 'b', 'd']);
    // B ne se range ni sous B, ni sous sa fille C
    assert.deepEqual(parentCandidates(rows, 'SOUS_FONCTION', 'b').map(r => r.id), ['a', 'd']);
    assert.deepEqual(parentCandidates(rows, 'FONCTION', null).map(r => r.id), []);
    assert.deepEqual(parentCandidates(rows, 'PROCESSUS', null).map(r => r.id), ['a', 'b', 'c', 'd']);
});

test('l’arbre à plat range chaque fonction sous sa mère, par code, avec sa profondeur', () => {
    const rows = [view('c', 'A.1.1', 'ACTIVITE', 'b'), view('d', 'B', 'FONCTION'), view('a', 'A', 'FONCTION'), view('b', 'A.1', 'SOUS_FONCTION', 'a'), view('o', 'O', 'ACTIVITE', 'absente')];
    assert.deepEqual(flattenFunctions(rows).map(x => [x.row.input.code, x.depth]), [['A', 0], ['A.1', 1], ['A.1.1', 2], ['B', 0], ['O', 0]]);
});

test('une boucle dans les données n’empêche pas l’affichage', () => {
    const rows = [view('a', 'A', 'FONCTION', 'b'), view('b', 'B', 'FONCTION', 'a')];
    assert.deepEqual(flattenFunctions(rows).length, 0, 'sans racine, une boucle n’est pas affichée mais ne bloque pas');
});

test('la nature d’un lien dépend de sa cible', () => {
    assert.deepEqual(naturesFor('FUNCTION'), ['ASSOCIEE', 'SUCCEDE']);
    assert.deepEqual(naturesFor('AUTHORITY'), ['EXERCEE_PAR', 'ASSOCIEE']);
    assert.deepEqual(naturesFor('DESCRIPTION'), ['DOCUMENTEE_PAR', 'ASSOCIEE']);
});

test('les problèmes de saisie : code, nom, dates, état de rédaction', () => {
    const ok = { ...emptyFunction(INST), code: 'RH.PAIE', name: 'Paie' };
    assert.deepEqual(functionProblems(ok), []);
    assert.ok(functionProblems({ ...ok, code: '' }).some(p => /code est obligatoire/.test(p)));
    assert.ok(functionProblems({ ...ok, code: 'a b' }).some(p => /ne contient que/.test(p)));
    assert.ok(functionProblems({ ...ok, name: '  ' }).some(p => /nom est obligatoire/.test(p)));
    assert.ok(functionProblems({ ...ok, dateStart: '15/02/1990' }).some(p => /date de début s’écrit/.test(p)));
    assert.ok(functionProblems({ ...ok, dateStart: '1995', dateEnd: '1990-06' }).some(p => /dépasse/.test(p)));
    assert.deepEqual(functionProblems({ ...ok, dateStart: '1990', dateEnd: '1990-06' }), []);
    assert.ok(functionProblems({ ...ok, status: 'REVISEE' }).some(p => /description/.test(p)));
    assert.ok(functionProblems({ ...ok, status: 'VALIDEE', description: 'Payer les agents' }).some(p => /sources/.test(p)));
    assert.deepEqual(functionProblems({ ...ok, status: 'VALIDEE', description: 'Payer les agents', sources: 'Décret 2020/12' }), []);
});
