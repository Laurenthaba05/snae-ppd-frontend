import test from 'node:test';
import assert from 'node:assert/strict';
import { latestVersion, ruleFormOf, ruleProblems, ruleState, targetNames, versionSentence } from '../.test-build/retentionRule.js';

const version = (extra = {}) => ({ id: 'v1', number: 1, status: 'ACTIVE', effectiveFrom: '2026-10-05', effectiveTo: null, duration: 10, unit: 'ANNEES', trigger: 'DATE_CLOTURE_DOCUMENT', finalDisposition: 'CONSERVER_DEFINITIVEMENT', legalReference: null,
    typeDocumentIds: ['t-rapport', 't-arrete'], classificationNodeIds: ['n-1'], ...extra });
const rule = (extra = {}) => ({ id: 'r1', code: 'CONS-10', label: 'Conservation 10 ans', scope: 'INSTITUTION', institutionId: 'inst1', priority: 100, status: 'ACTIF', versions: [version()], deletable: false, ...extra });

test('La version qui sert de modèle est celle en vigueur, sinon la plus récente', () => {
    assert.equal(latestVersion(rule({ versions: [version({ id: 'v2', number: 2, status: 'BROUILLON' }), version()] })).id, 'v1');
    assert.equal(latestVersion(rule({ versions: [version({ id: 'v2', number: 2, status: 'RETIRE' }), version({ id: 'v1', number: 1, status: 'RETIRE' })] })).id, 'v2');
    assert.equal(latestVersion(rule({ versions: [] })), null);
});

test('Une nouvelle version part des réglages de la dernière, l’identité de la règle étant figée', () => {
    const form = ruleFormOf(rule({ versions: [version({ legalReference: 'Décret D/2020/114', unit: 'MOIS', duration: 18, finalDisposition: 'ELIMINER' })] }));
    assert.deepEqual(form, { description: '', priority: '100', effectiveFrom: '', effectiveTo: '', legalDescription: '', code: 'CONS-10', label: 'Conservation 10 ans', scope: 'INSTITUTION', duration: '18', unit: 'MOIS', trigger: 'DATE_CLOTURE_DOCUMENT', finalDisposition: 'ELIMINER', legalReference: 'Décret D/2020/114',
        typeDocumentIds: ['t-rapport', 't-arrete'], classificationNodeIds: ['n-1'], phaseDuration: '', phaseUnit: 'ANNEES', triggerEventTypeId: '',
        sampling: { method: 'SYSTEMATIQUE', step: '', rate: '', modulo: '', remainder: '', note: '' } });
    const empty = ruleFormOf(rule({ scope: 'NATIONAL', versions: [] }));
    assert.equal(empty.scope, 'NATIONAL'); assert.equal(empty.duration, ''); assert.deepEqual(empty.typeDocumentIds, []);
    // le formulaire copié ne partage pas ses listes avec la règle
    form.typeDocumentIds.push('x'); assert.equal(rule().versions[0].typeDocumentIds.length, 2);
    // une version préremplie sans cible se refuse avant l'envoi, une règle existante n'est pas recontrôlée sur son identité
    assert.match(ruleProblems({ ...form, typeDocumentIds: [], classificationNodeIds: [] }, 'inst1', true)[0], /au moins un type de document/);
    assert.deepEqual(ruleProblems(form, 'inst1', true), []);
});

test('L’état d’une règle : en vigueur, sans version, sans version en vigueur, inactive', () => {
    assert.deepEqual(ruleState(rule()), { tone: 'ok', text: 'En vigueur : version 1 depuis le 5 octobre 2026' });
    assert.equal(ruleState(rule({ versions: [], deletable: true })).tone, 'bad'); assert.match(ruleState(rule({ versions: [] })).text, /Aucune version/);
    assert.equal(ruleState(rule({ versions: [version({ status: 'BROUILLON' })] })).tone, 'warn');
    assert.deepEqual(ruleState(rule({ status: 'INACTIF' })), { tone: '', text: 'Règle inactive' });
});

test('Une version se dit en une phrase et ses cibles par leurs noms, un nom absent n’étant jamais remplacé par un identifiant', () => {
    assert.equal(versionSentence(version()), '10 ans après la clôture du document, puis conserver définitivement');
    const types = new Map([['t-rapport', 'Rapport'], ['t-arrete', 'Arrêté']]);
    const nodes = new Map([['n-1', 'RH — Ressources humaines']]);
    assert.deepEqual(targetNames(version(), types, nodes), { types: ['Arrêté', 'Rapport'], nodes: ['RH — Ressources humaines'] });
    const partial = targetNames(version({ typeDocumentIds: ['t-rapport', 'inconnu-1', 'inconnu-2'], classificationNodeIds: ['n-9'] }), types, new Map());
    assert.deepEqual(partial, { types: ['Rapport', '2 éléments non disponibles'], nodes: ['1 élément non disponible'] });
    assert.ok(!JSON.stringify(partial).includes('inconnu'));
});

test('Une règle à phase courante se dit avec elle, et sa nouvelle version la reprend', () => {
    const v = version({ currentPhaseDuration: 5, currentPhaseUnit: 'ANNEES' });
    assert.equal(versionSentence(v), '10 ans après la clôture du document (dont 5 ans en phase courante, puis en archives intermédiaires), puis conserver définitivement');
    const form = ruleFormOf(rule({ versions: [v] }));
    assert.equal(form.phaseDuration, '5'); assert.equal(form.phaseUnit, 'ANNEES');
    // une règle sans phase se dit comme avant
    assert.equal(versionSentence(version({ currentPhaseDuration: null, currentPhaseUnit: null })), '10 ans après la clôture du document, puis conserver définitivement');
});
