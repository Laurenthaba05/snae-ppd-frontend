import test from 'node:test';
import assert from 'node:assert/strict';
import {
    METHOD_LABELS, OUTCOME_LABELS, STATUS_LABELS, availableActions, blockerText, creationProblems, describeSampling, emptySamplingForm, isSelectable, progressText, reasonProblem,
    retainedShare, runText, samplingBody, samplingFormOf, samplingProblems, selectionText, validationProblems
} from '../.test-build/sampling.js';
import { emptyRuleForm, ruleProblems, versionBody } from '../.test-build/retentionRule.js';

const all = { propose: true, validate: true, execute: true };
const campaign = (status, outcomes) => ({ status, lines: outcomes.map(outcome => ({ outcome, retained: true })) });

test('Chaque méthode exige ses paramètres, et eux seuls', () => {
    const form = (patch) => ({ ...emptySamplingForm(), ...patch });
    assert.deepEqual(samplingProblems(form({ method: 'SYSTEMATIQUE', step: '5' })), []);
    assert.match(samplingProblems(form({ method: 'SYSTEMATIQUE', step: '1' }))[0], /un document sur N/);
    assert.deepEqual(samplingProblems(form({ method: 'ALEATOIRE', rate: '20' })), []);
    assert.match(samplingProblems(form({ method: 'ALEATOIRE', rate: '100' }))[0], /1 et 99/);
    assert.deepEqual(samplingProblems(form({ method: 'CHRONOLOGIQUE', modulo: '5', remainder: '0' })), []);
    assert.match(samplingProblems(form({ method: 'CHRONOLOGIQUE', modulo: '5', remainder: '5' }))[0], /reste/);
    assert.deepEqual(samplingProblems(form({ method: 'QUALITATIF', note: 'Dossiers des chefs de service' })), []);
    assert.match(samplingProblems(form({ method: 'QUALITATIF', note: ' ' }))[0], /note est obligatoire/);
});

test('Le corps d’une version ne porte la méthode que pour le sort « trier »', () => {
    const form = { ...emptySamplingForm(), method: 'CHRONOLOGIQUE', modulo: '5', remainder: '0', step: '9', note: ' années en 0 et 5 ' };
    assert.deepEqual(samplingBody(form, true), { samplingMethod: 'CHRONOLOGIQUE', samplingStep: null, samplingRate: null, samplingModulo: 5, samplingRemainder: 0, samplingNote: 'années en 0 et 5' });
    assert.deepEqual(samplingBody(form, false), { samplingMethod: null, samplingStep: null, samplingRate: null, samplingModulo: null, samplingRemainder: null, samplingNote: null });
    assert.deepEqual(samplingFormOf({ method: 'SYSTEMATIQUE', step: 3, rate: null, modulo: null, remainder: null, note: null }).step, '3');
});

test('Le formulaire de règle exige la méthode et la référence légale pour le sort « trier »', () => {
    const base = { ...emptyRuleForm('i1'), code: 'R1', label: 'Règle', duration: '10', typeDocumentIds: ['t'], finalDisposition: 'TRIER' };
    assert.ok(ruleProblems(base, 'i1').some(p => /un document sur N/.test(p)));
    assert.ok(ruleProblems({ ...base, sampling: { ...base.sampling, step: '5' } }, 'i1').some(p => /référence légale/.test(p)));
    const ok = { ...base, legalReference: 'Tableau de tri n° 7', sampling: { ...base.sampling, step: '5' } };
    assert.deepEqual(ruleProblems(ok, 'i1'), []);
    assert.equal(versionBody(ok, '2026-10-10').samplingStep, 5);
    assert.equal(versionBody({ ...ok, finalDisposition: 'ELIMINER' }, '2026-10-10').samplingMethod, null);
});

test('La constitution exige un intitulé, une règle et au moins un document', () => {
    assert.deepEqual(creationProblems('Registres de 1980', 'v1', 3), []);
    assert.match(creationProblems(' ', 'v1', 3)[0], /intitulé/);
    assert.match(creationProblems('Registres', '', 3)[0], /règle/);
    assert.match(creationProblems('Registres', 'v1', 0)[0], /au moins un document/);
    assert.match(creationProblems('Registres', 'v1', 1001)[0], /1000 documents au plus/);
    assert.equal(selectionText([], new Set()), 'Aucun document choisi.');
    assert.equal(selectionText([], new Set(['a'])), '1 document choisi.');
    assert.equal(selectionText([], new Set(['a', 'b'])), '2 documents choisis.');
});

test('Un motif d’ajustement et une validation ont leurs minimums', () => {
    assert.match(reasonProblem('court'), /10 caractères/);
    assert.equal(reasonProblem('Registre de la période de l’indépendance'), null);
    assert.match(reasonProblem('x'.repeat(501)), /500/);
    assert.deepEqual(validationProblems({ visaReference: 'DEC-1', procesVerbal: 'PV' }), []);
    assert.equal(validationProblems({ visaReference: ' ', procesVerbal: ' ' }).length, 2);
});

test('Ce que la personne peut faire dépend de l’état de la campagne et de ses droits', () => {
    assert.deepEqual(availableActions(campaign('BROUILLON', ['RETENU']), all), ['ADD', 'STOP', 'CANCEL']);
    assert.deepEqual(availableActions(campaign('BROUILLON', ['RETENU']), { ...all, propose: false }), []);
    assert.deepEqual(availableActions(campaign('ARRETEE', ['CONSERVATION_PROPOSEE', 'A_ELIMINER']), all), ['VALIDATE', 'CANCEL']);
    assert.deepEqual(availableActions(campaign('ARRETEE', ['CONSERVATION_VALIDEE']), all), ['EXECUTE', 'CANCEL']);
    assert.deepEqual(availableActions(campaign('ARRETEE', ['CONSERVE', 'A_ELIMINER']), all), ['CANCEL']);
    assert.deepEqual(availableActions(campaign('ARRETEE', ['CONSERVATION_VALIDEE']), { propose: false, validate: false, execute: true }), ['EXECUTE']);
    assert.deepEqual(availableActions(campaign('ANNULEE', []), all), []);
});

test('Les phrases de méthode, d’avancement et d’exécution sont dites en français', () => {
    assert.equal(describeSampling({ method: 'SYSTEMATIQUE', step: 3, rate: null, modulo: null, remainder: null, note: null }), 'Un document sur 3, dans l’ordre chronologique.');
    assert.match(describeSampling({ method: 'ALEATOIRE', step: null, rate: 20, modulo: null, remainder: null, note: null }), /^20 % des documents/);
    assert.match(progressText({ status: 'BROUILLON', lines: 10, retained: 3, eliminated: 7, manual: 1 }), /3 retenus dans l’échantillon, 7 à éliminer \(dont 1 ajusté à la main\)\. La campagne n’est pas encore arrêtée/);
    assert.match(progressText({ status: 'ARRETEE', lines: 10, retained: 1, eliminated: 9, manual: 0 }), /^1 retenu dans l’échantillon, 9 à éliminer\. La décision est figée\.$/);
    assert.equal(retainedShare({ lines: 10, retained: 3 }), '30 %');
    assert.equal(retainedShare({ lines: 0, retained: 0 }), '—');
    assert.equal(runText({ done: 3, failures: [] }), '3 documents ont été conservés définitivement.');
    assert.match(runText({ done: 1, failures: ['Ligne 2 : X'] }), /1 document a été conservé définitivement\. 1 ligne a échoué/);
    for (const text of [...Object.values(OUTCOME_LABELS), ...Object.values(STATUS_LABELS), ...Object.values(METHOD_LABELS)]) assert.ok(!/^[A-Z_]+$/.test(text), text);
    assert.ok(isSelectable({ blockers: [] }) && !isSelectable({ blockers: ['ACTIVE_LEGAL_HOLD'] }));
    assert.match(blockerText('ALREADY_IN_CAMPAIGN'), /autre campagne de tri/);
});
