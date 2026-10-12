import test from 'node:test';
import assert from 'node:assert/strict';
import {
    FORMS, FORM_LABELS, MAX_IMPORT_ROWS, alternativesText, attachable, cleanLabel, csvProblems, csvRowCount, formLabel, formProblems, keywordNote, normalizeCode, parseAlternatives,
    MAX_SKOS_CHARS, skosFileName, skosProblems, termProblems, termTree, vocabularyProblems
} from '../.test-build/vocabulary.js';

const term = (id, label, parentId = null, over = {}) => ({
    id, vocabularyId: 'v1', label, definition: null, parentId, parentLabel: null, alternativeLabels: [], status: 'ACTIF', replacedById: null, replacedByLabel: null, obsolescenceReason: null, usage: 0, ...over
});

test('Un vocabulaire a un code en majuscules et un nom', () => {
    assert.deepEqual(vocabularyProblems('themes_etat_civil', 'Thèmes'), []);
    assert.equal(normalizeCode('  themes '), 'THEMES');
    assert.equal(vocabularyProblems('1THEMES', 'Thèmes').length, 1);
    assert.equal(vocabularyProblems('A', 'Thèmes').length, 1);
    assert.equal(vocabularyProblems('avec espace', 'Thèmes').length, 1);
    assert.equal(vocabularyProblems('THEMES', '   ').length, 1);
    assert.equal(vocabularyProblems('THEMES', 'x'.repeat(201)).length, 1);
});

test('Un terme a un libellé non vide, jusqu’à vingt synonymes', () => {
    assert.deepEqual(termProblems('Mariage', ['Union']), []);
    assert.equal(termProblems('   ', []).length, 1);
    assert.equal(termProblems('x'.repeat(256), []).length, 1);
    assert.equal(termProblems('Mariage', Array.from({ length: 21 }, (_, i) => `S${i}`)).length, 1);
    assert.equal(cleanLabel('  Acte   de\tnaissance '), 'Acte de naissance');
});

test('Les synonymes saisis se nettoient : sans doublon, sans copie du libellé préféré', () => {
    assert.deepEqual(parseAlternatives(' Union \nunion\nMariage\n\nNoces | Hymen', 'mariage'), ['Union', 'Noces', 'Hymen']);
    assert.equal(alternativesText(['Union', 'Noces']), 'Union\nNoces');
    assert.deepEqual(parseAlternatives('', ''), []);
});

test('La forme du document est une des formes connues et « autre » se précise', () => {
    assert.deepEqual(formProblems('COPIE_CERTIFIEE', ''), []);
    assert.equal(formProblems('', '').length, 1);
    assert.equal(formProblems('PHOTOCOPIE', '').length, 1);
    assert.equal(formProblems('AUTRE', '  ').length, 1);
    assert.deepEqual(formProblems('AUTRE', 'Fac-similé'), []);
    assert.equal(formProblems('COPIE', 'x'.repeat(501)).length, 1);
    for (const code of FORMS) assert.ok(FORM_LABELS[code], code);
    assert.equal(formLabel('EXTRAIT'), 'Extrait');
    assert.equal(formLabel(null), 'Non renseignée');
    assert.equal(formLabel('INCONNUE'), 'Non renseignée');
});

test('Un fichier CSV nomme une colonne libellé et reste sous la limite', () => {
    assert.deepEqual(csvProblems('libelle;parent\nRoutes;\nPistes;Routes'), []);
    assert.deepEqual(csvProblems('﻿Libellé,Générique\nRoutes,'), []);
    assert.equal(csvProblems('').length, 1);
    assert.equal(csvProblems('parent;definition\nx;y').length, 1);
    const tooLong = 'libelle\n' + Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `T${i}`).join('\n');
    assert.equal(csvProblems(tooLong).length, 1);
    assert.equal(csvRowCount('libelle\nA\n\nB\n'), 2);
    assert.equal(csvRowCount(''), 0);
});

test('Les termes se rangent en arbre : un terme suit son générique, alphabétique à chaque niveau', () => {
    const rows = termTree([
        term('c', 'Contrat de mariage', 'm'), term('z', 'Zoologie'), term('m', 'Mariage'), term('d', 'Divorce', 'm'), term('o', 'Orphelin', 'absent'), term('a', 'Agriculture')
    ]);
    assert.deepEqual(rows.map(r => [r.term.label, r.depth]), [
        ['Agriculture', 0], ['Mariage', 0], ['Contrat de mariage', 1], ['Divorce', 1], ['Orphelin', 0], ['Zoologie', 0]
    ]);
});

test('Une boucle dans une page n’enferme pas l’affichage et ne cache aucun terme', () => {
    const rows = termTree([term('a', 'A', 'b'), term('b', 'B', 'a')]);
    assert.deepEqual(rows.map(r => [r.term.label, r.depth]), [['A', 0], ['B', 1]]);
    const own = termTree([term('a', 'Seul', 'a')]);
    assert.deepEqual(own.map(r => r.term.label), ['Seul']);
});

test('Un mot-clé obsolète dit son remplaçant, un terme se pose s’il est actif dans un vocabulaire actif', () => {
    assert.equal(keywordNote({ status: 'ACTIF', replacedByLabel: null }), null);
    assert.match(keywordNote({ status: 'OBSOLETE', replacedByLabel: 'Registre du commerce' }), /remplacé par « Registre du commerce »/);
    assert.match(keywordNote({ status: 'OBSOLETE', replacedByLabel: null }), /sans remplaçant/);
    assert.equal(attachable({ status: 'ACTIF' }, { status: 'ACTIF' }), true);
    assert.equal(attachable({ status: 'OBSOLETE' }, { status: 'ACTIF' }), false);
    assert.equal(attachable({ status: 'ACTIF' }, { status: 'RETIRE' }), false);
    assert.equal(attachable({ status: 'ACTIF' }, undefined), false);
    assert.equal(skosFileName('THEMES_2026'), 'vocabulaire-themes_2026.jsonld');
    assert.equal(skosFileName('A B/C'), 'vocabulaire-a-b-c.jsonld');
});

test('Un fichier SKOS est du JSON-LD ou du RDF/XML de 2 Mo au plus, jamais du Turtle', () => {
    assert.deepEqual(skosProblems('{"@graph":[]}'), []);
    assert.deepEqual(skosProblems('[{"@id":"a"}]'), []);
    assert.deepEqual(skosProblems('﻿<?xml version="1.0"?><rdf:RDF/>'), []);
    assert.equal(skosProblems('   ').length, 1);
    assert.match(skosProblems('@prefix skos: <http://www.w3.org/2004/02/skos/core#> .')[0], /Turtle/);
    assert.match(skosProblems('PREFIX skos: <http://www.w3.org/2004/02/skos/core#>')[0], /Turtle/);
    assert.match(skosProblems('libelle;parent')[0], /JSON-LD ou en RDF\/XML/);
    assert.match(skosProblems('{' + ' '.repeat(MAX_SKOS_CHARS) + '}')[0], /2 Mo/);
});
