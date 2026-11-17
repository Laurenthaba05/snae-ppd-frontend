import test from 'node:test';
import assert from 'node:assert/strict';
import { DISCARD_REASON_MAX, MODE_EXPLANATION, MODE_LABEL, canDiscard, canRestore, discardCommand, indexationLabel, modeLabel, policyCommand, sourceLabel } from '../.test-build/ocrIndexing.js';

// L'indexation du texte reconnu : ce qui est cherchable, signalé « non vérifié », selon la politique de l'institution.
const INSTITUTION = '20000000-0000-4000-8000-000000000001';

test('Chaque politique a un libellé et une explication ; une politique absente se dit héritée', () => {
    assert.deepEqual(Object.keys(MODE_LABEL), ['VALIDATION_SEULE', 'FIABLE_SIGNALE']);
    assert.deepEqual(Object.keys(MODE_EXPLANATION), ['VALIDATION_SEULE', 'FIABLE_SIGNALE']);
    assert.match(modeLabel('FIABLE_SIGNALE'), /non vérifié/);
    assert.equal(modeLabel(null), 'Aucune (héritée)');
    assert.equal(modeLabel('INCONNUE'), 'INCONNUE');
});

test('D’où vient la politique est dit en mots', () => {
    assert.equal(sourceLabel({ source: 'INSTITUTION' }), 'décidée par cette institution');
    assert.equal(sourceLabel({ source: 'NATIONAL' }), 'décidée au niveau national');
    assert.equal(sourceLabel({ source: 'DEFAUT' }), 'réglage par défaut du serveur');
});

test('La liste dit si un texte est dans l’index, et vide quand le serveur ne le dit pas', () => {
    assert.equal(indexationLabel({ indexation: 'VALIDE' }), 'Indexé (validé)');
    assert.equal(indexationLabel({ indexation: 'AUTOMATIQUE' }), 'Indexé · non vérifié');
    assert.equal(indexationLabel({ indexation: 'NON' }), 'Pas indexé');
    assert.equal(indexationLabel({}), '');
});

test('La décision de politique porte le mode, un motif obligatoire et la version lue', () => {
    assert.deepEqual(policyCommand(INSTITUTION, 'FIABLE_SIGNALE', ' Recette du 4 novembre ', 3),
        { institutionId: INSTITUTION, mode: 'FIABLE_SIGNALE', motif: 'Recette du 4 novembre', expectedVersion: 3 });
    assert.deepEqual(policyCommand(null, 'VALIDATION_SEULE', 'Retour à la validation', null),
        { institutionId: null, mode: 'VALIDATION_SEULE', motif: 'Retour à la validation', expectedVersion: null });
    assert.equal(policyCommand(INSTITUTION, 'HERITE', 'Suivre le national', 0).mode, 'HERITE');
});

test('Une décision invalide est refusée avant tout envoi', () => {
    assert.throws(() => policyCommand(INSTITUTION, 'TOUT', 'x', null), /Choisissez une politique/);
    assert.throws(() => policyCommand(null, 'HERITE', 'x', null), /n’hérite de rien/);
    assert.throws(() => policyCommand(INSTITUTION, 'FIABLE_SIGNALE', '   ', null), /Texte requis/);
    assert.throws(() => policyCommand('pas-un-uuid', 'FIABLE_SIGNALE', 'x', null), /UUID/);
    assert.throws(() => policyCommand(INSTITUTION, 'FIABLE_SIGNALE', 'x', -1), /Version/);
});

test('Un texte écarté de l’index se dit, et seul un texte non validé s’écarte ou se réintègre', () => {
    assert.equal(indexationLabel({ indexation: 'ECARTE' }), 'Écarté de l’index');
    assert.equal(canDiscard({ statutValidation: 'NON_VALIDE', ecarteLe: null }), true);
    assert.equal(canDiscard({ statutValidation: 'NON_VALIDE' }), true);
    assert.equal(canDiscard({ statutValidation: 'NON_VALIDE', ecarteLe: '2026-11-17T09:00:00Z' }), false);
    assert.equal(canDiscard({ statutValidation: 'VALIDE', ecarteLe: null }), false);
    assert.equal(canRestore({ statutValidation: 'NON_VALIDE', ecarteLe: '2026-11-17T09:00:00Z' }), true);
    assert.equal(canRestore({ statutValidation: 'NON_VALIDE', ecarteLe: null }), false);
    assert.equal(canRestore({ statutValidation: 'VALIDE', ecarteLe: '2026-11-17T09:00:00Z' }), false);
});

test('Le motif d’un texte écarté est nettoyé et refusé avant tout envoi s’il est trop court ou trop long', () => {
    assert.deepEqual(discardCommand('  Texte illisible : bruit de numérisation  '), { reason: 'Texte illisible : bruit de numérisation' });
    assert.deepEqual(discardCommand('x'.repeat(DISCARD_REASON_MAX)), { reason: 'x'.repeat(DISCARD_REASON_MAX) });
    assert.throws(() => discardCommand('trop bref'), /au moins 10 caractères/);
    assert.throws(() => discardCommand('         '), /Texte requis/);
    assert.throws(() => discardCommand('x'.repeat(DISCARD_REASON_MAX + 1)), /Texte requis/);
});
