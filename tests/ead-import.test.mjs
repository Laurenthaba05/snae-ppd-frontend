import test from 'node:test';
import assert from 'node:assert/strict';
import { EAD_CONFIDENTIALITY, EAD_LEVEL_LABELS, EAD_MAX_BYTES, eadFileProblem, eadIssueText, eadOutlineText, eadSummary } from '../.test-build/eadImport.js';

test('Le fichier est contrôlé avant l’envoi : taille, vide, extension', () => {
    assert.equal(eadFileProblem({ name: 'fonds.xml', size: 1000 }), null);
    assert.equal(eadFileProblem({ name: 'FONDS.EAD', size: 1000 }), null);
    assert.equal(eadFileProblem({ name: 'fonds.xml', size: EAD_MAX_BYTES }), null);
    assert.equal(eadFileProblem({ name: 'fonds.xml', size: EAD_MAX_BYTES + 1 }), 'Le fichier dépasse 5 Mo.');
    assert.equal(eadFileProblem({ name: 'fonds.xml', size: 0 }), 'Le fichier est vide.');
    assert.equal(eadFileProblem({ name: 'fonds.csv', size: 10 }), 'Choisissez un fichier EAD (EAD3 ou EAD 2002) au format XML (.xml).');
});

test('Une erreur du contrôle dit où elle est : le fichier entier, ou une unité avec sa référence', () => {
    assert.equal(eadIssueText({ unit: 0, reference: null, message: 'EAD3 non valide : ligne 4 : élément inattendu' }), 'Fichier : EAD3 non valide : ligne 4 : élément inattendu');
    assert.equal(eadIssueText({ unit: 3, reference: 'MIN-1/A', message: 'Référence répétée dans le fichier.' }), 'Unité 3 (MIN-1/A) : Référence répétée dans le fichier.');
    assert.equal(eadIssueText({ unit: 2, reference: null, message: 'Référence (unitid) absente.' }), 'Unité 2 : Référence (unitid) absente.');
});

test('L’arborescence lue se dit niveau, référence et intitulé', () => {
    assert.equal(eadOutlineText({ rank: 2, depth: 1, level: 'SERIE', reference: 'MIN-1/A', title: 'Correspondance' }), 'Série · MIN-1/A — Correspondance');
    assert.equal(eadOutlineText({ rank: 1, depth: 0, level: null, reference: null, title: null }), 'Niveau inconnu · (sans référence) — (sans intitulé)');
    assert.equal(eadOutlineText({ rank: 1, depth: 0, level: 'AUTRE', reference: 'X', title: 'Y' }), 'AUTRE · X — Y');
    assert.deepEqual(Object.keys(EAD_LEVEL_LABELS), ['FONDS', 'SOUS_FONDS', 'SERIE', 'SOUS_SERIE', 'DOSSIER', 'PIECE']);
});

test('Le bilan du contrôle accorde les nombres', () => {
    assert.equal(eadSummary({ units: 5, issues: [], warnings: [] }), '5 unités lues, aucune erreur, aucune remarque.');
    assert.equal(eadSummary({ units: 1, issues: [{}], warnings: [{}] }), '1 unité lue, 1 erreur, 1 remarque.');
    assert.equal(eadSummary({ units: 2, issues: [{}, {}], warnings: [{}, {}, {}] }), '2 unités lues, 2 erreurs, 3 remarques.');
});

test('La confidentialité se choisit parmi les quatre niveaux, jamais dans le fichier', () => {
    assert.deepEqual([...EAD_CONFIDENTIALITY], ['PUBLIC', 'INTERNE', 'CONFIDENTIEL', 'SECRET']);
});
