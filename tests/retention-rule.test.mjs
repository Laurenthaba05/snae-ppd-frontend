import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_RULE_TARGETS, effectiveScope, emptyRuleForm, phaseProblems, ruleBody, ruleProblems, toggled, versionBody } from '../.test-build/retentionRule.js';

const INST = '201f8298-f32b-4188-b804-c3d9b97c908f';
const valid = (extra = {}) => ({ ...emptyRuleForm(INST), code: ' conv-10 ', label: ' Conservation 10 ans ', duration: '10', typeDocumentIds: ['t1'], ...extra });

test('Une règle sans cible est refusée avant d’être créée : c’est ce que le serveur refuse à l’étape de la version', () => {
    const problems = ruleProblems(valid({ typeDocumentIds: [], classificationNodeIds: [] }), INST);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /au moins un type de document ou une rubrique/);
    assert.deepEqual(ruleProblems(valid(), INST), []);
    assert.deepEqual(ruleProblems(valid({ typeDocumentIds: [], classificationNodeIds: ['n1'] }), INST), []);
    const many = Array.from({ length: MAX_RULE_TARGETS + 1 }, (_, i) => 't' + i);
    assert.match(ruleProblems(valid({ typeDocumentIds: many }), INST)[0], /500 cibles au plus/);
});

test('Code, intitulé, durée et référence légale d’élimination', () => {
    assert.deepEqual(ruleProblems(valid({ code: ' ', label: '' }), INST).length, 2);
    for (const duration of ['', 'abc', '-1', '1.5', '100001']) assert.match(ruleProblems(valid({ duration }), INST)[0], /durée est un nombre entier/);
    assert.deepEqual(ruleProblems(valid({ duration: '0' }), INST), []);
    assert.match(ruleProblems(valid({ finalDisposition: 'ELIMINER' }), INST)[0], /référence légale/);
    assert.deepEqual(ruleProblems(valid({ finalDisposition: 'ELIMINER', legalReference: 'Décret D/2020/114' }), INST), []);
    assert.deepEqual(ruleProblems(valid({ finalDisposition: 'CONSERVER_DEFINITIVEMENT' }), INST), []);
});

test('La portée institution exige une institution choisie ; la portée nationale s’envoie sans institution', () => {
    assert.match(ruleProblems(valid({ scope: 'INSTITUTION' }), null)[0], /Choisissez d’abord une institution/);
    assert.equal(effectiveScope({ scope: 'INSTITUTION' }, null), 'NATIONAL');
    assert.deepEqual(ruleBody(valid(), INST), { code: 'conv-10', label: 'Conservation 10 ans', scope: 'INSTITUTION', institutionId: INST, priority: 100 });
    assert.deepEqual(ruleBody(valid({ scope: 'NATIONAL' }), INST), { code: 'conv-10', label: 'Conservation 10 ans', scope: 'NATIONAL', institutionId: null, priority: 100 });
    assert.equal(emptyRuleForm(null).scope, 'NATIONAL');
    assert.equal(emptyRuleForm(INST).scope, 'INSTITUTION');
});

test('Une règle déjà créée n’est plus recontrôlée sur son identité, seulement sur sa version', () => {
    assert.deepEqual(ruleProblems(valid({ code: '', label: '', scope: 'INSTITUTION' }), null, true), []);
    assert.match(ruleProblems(valid({ typeDocumentIds: [] }), INST, true)[0], /au moins un type de document/);
});

test('La version envoie ses cibles triées, la date du jour et une référence légale vide en null', () => {
    assert.deepEqual(versionBody(valid({ typeDocumentIds: ['t2', 't1'], classificationNodeIds: ['n9', 'n3'], legalReference: '  ' }), '2026-10-05'), {
        effectiveFrom: '2026-10-05', duration: 10, unit: 'ANNEES', trigger: 'DATE_CLOTURE_DOCUMENT', finalDisposition: 'REEXAMINER', legalReference: null, typeDocumentIds: ['t1', 't2'], classificationNodeIds: ['n3', 'n9'], currentPhaseDuration: null, currentPhaseUnit: null,
        triggerEventTypeId: null, samplingMethod: null, samplingStep: null, samplingRate: null, samplingModulo: null, samplingRemainder: null, samplingNote: null });
    assert.equal(versionBody(valid({ legalReference: ' Décret D/2020/114 ' }), '2026-10-05').legalReference, 'Décret D/2020/114');
});

test('Cocher et décocher ne duplique pas une sélection', () => {
    assert.deepEqual(toggled(['a'], 'b', true), ['a', 'b']);
    assert.deepEqual(toggled(['a', 'b'], 'b', true), ['a', 'b']);
    assert.deepEqual(toggled(['a', 'b'], 'a', false), ['b']);
    assert.deepEqual(toggled(['a'], 'z', false), ['a']);
});

test('La phase courante est facultative, va avec son unité et ne dépasse pas la conservation totale', () => {
    assert.deepEqual(phaseProblems(valid()), []);
    assert.deepEqual(phaseProblems(valid({ phaseDuration: '5', phaseUnit: 'ANNEES' })), []);
    assert.deepEqual(phaseProblems(valid({ phaseDuration: '120', phaseUnit: 'MOIS' })), []);                   // égale à la durée totale : pas d'erreur
    assert.match(phaseProblems(valid({ phaseDuration: '11', phaseUnit: 'ANNEES' }))[0], /plus que la conservation totale/);
    assert.match(phaseProblems(valid({ phaseDuration: '3700', phaseUnit: 'JOURS' }))[0], /plus que la conservation totale/);
    assert.match(phaseProblems(valid({ phaseDuration: 'cinq' }))[0], /nombre entier/);
    assert.match(phaseProblems(valid({ phaseDuration: '-1' }))[0], /nombre entier/);
    // le formulaire de la règle porte ces contrôles
    assert.match(ruleProblems(valid({ phaseDuration: '11', phaseUnit: 'ANNEES' }), INST).join(' '), /conservation totale/);
});

test('La version envoie la phase courante avec son unité, ou rien', () => {
    const body = versionBody(valid({ phaseDuration: '5', phaseUnit: 'MOIS' }), '2026-10-05');
    assert.equal(body.currentPhaseDuration, 5); assert.equal(body.currentPhaseUnit, 'MOIS');
    const none = versionBody(valid({ phaseDuration: ' ', phaseUnit: 'MOIS' }), '2026-10-05');
    assert.equal(none.currentPhaseDuration, null); assert.equal(none.currentPhaseUnit, null);
});
