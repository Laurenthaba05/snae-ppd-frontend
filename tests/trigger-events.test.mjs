import test from 'node:test';
import assert from 'node:assert/strict';
import {
    DOCUMENT_STATUS_TEXT, declareBody, declareProblems, emptyDeclareForm, emptyTypeForm, eventSentence, schedulingText, typeBody, typeProblems
} from '../.test-build/triggerEvents.js';
import { blockerText, ruleSentence, triggerText } from '../.test-build/retentionPlanning.js';
import { emptyRuleForm, ruleProblems, versionBody } from '../.test-build/retentionRule.js';

const today = '2026-10-10';

test('Constater un événement exige un type, une date passée et une justification', () => {
    const form = { ...emptyDeclareForm('t1', false), date: '2026-09-01', justification: 'Procès-verbal de réception n° 12' };
    assert.deepEqual(declareProblems(form, today), []);
    assert.match(declareProblems({ ...form, typeId: '' }, today)[0], /type d’événement/);
    assert.match(declareProblems({ ...form, date: '' }, today)[0], /date de l’événement est obligatoire/);
    assert.match(declareProblems({ ...form, date: '2026-10-11' }, today)[0], /futur/);
    assert.match(declareProblems({ ...form, date: '1700-01-01' }, today)[0], /invalide/);
    assert.match(declareProblems({ ...form, justification: ' ab ' }, today)[0], /justification/);
    assert.match(declareProblems({ ...form, justification: 'x'.repeat(501) }, today)[0], /500/);
});

test('Le corps du constat vise le dossier ou le document selon le choix, jamais les deux', () => {
    const form = { ...emptyDeclareForm('t1', true), date: '2026-09-01', justification: ' PV n° 12 ', observations: ' ' };
    assert.deepEqual(declareBody(form, 'd1', 'dos1'), { typeId: 't1', documentId: null, dossierId: 'dos1', eventDate: '2026-09-01', justification: 'PV n° 12', observations: null });
    assert.deepEqual(declareBody({ ...form, scope: 'DOCUMENT' }, 'd1', 'dos1').documentId, 'd1');
    assert.equal(declareBody({ ...form, scope: 'DOCUMENT' }, 'd1', 'dos1').dossierId, null);
    // sans dossier, le constat porte sur le document
    assert.equal(declareBody(emptyDeclareForm('t1', false), 'd1', null).documentId, 'd1');
    assert.equal(emptyDeclareForm('t1', true).scope, 'DOSSIER');
});

test('Un type d’événement exige un code et un libellé', () => {
    assert.deepEqual(typeProblems({ ...emptyTypeForm(), code: 'fin de marche', label: 'Fin du marché' }), []);
    assert.match(typeProblems({ ...emptyTypeForm(), code: 'a/b', label: 'x' })[0], /code/);
    assert.match(typeProblems({ ...emptyTypeForm(), code: 'DECES', label: ' ' })[0], /libellé/);
    assert.deepEqual(typeBody({ ...emptyTypeForm(), code: ' DECES ', label: ' Décès ', scope: 'INSTITUTION' }, 'i1'), { code: 'DECES', label: 'Décès', description: null, institutionId: 'i1' });
    assert.equal(typeBody({ ...emptyTypeForm(), code: 'DECES', label: 'Décès', scope: 'NATIONAL' }, 'i1').institutionId, null);
});

test('Un événement et la planification se disent en une phrase', () => {
    const day = iso => iso.split('-').reverse().join('/');
    assert.equal(eventSentence({ typeLabel: 'Réception du marché', eventDate: '2026-05-05', justification: 'PV n° 12', documentReference: null, dossierReference: 'DOS-1' }, day),
        'Réception du marché, le 05/05/2026 — PV n° 12 (dossier DOS-1)');
    assert.equal(schedulingText({ scheduled: 0, failures: [] }), 'Aucune échéance n’a été planifiée.');
    assert.equal(schedulingText({ scheduled: 1, failures: [] }), '1 échéance a été planifiée.');
    assert.match(schedulingText({ scheduled: 3, failures: ['A : X', 'B : Y'] }), /3 échéances ont été planifiées\. 2 documents n’ont pas pu l’être/);
    for (const text of Object.values(DOCUMENT_STATUS_TEXT)) assert.ok(!/^[A-Z_]+$/.test(text));
});

test('La règle qui attend un événement se lit avec le nom de l’événement', () => {
    assert.equal(triggerText('EVENEMENT'), 'l’événement déclencheur');
    assert.equal(ruleSentence({ duration: 10, unit: 'ANNEES', trigger: 'EVENEMENT', finalDisposition: 'CONSERVER_DEFINITIVEMENT', triggerEventTypeLabel: 'Réception définitive du marché' }),
        '10 ans après l’événement « Réception définitive du marché », puis conserver définitivement');
    assert.match(blockerText('EVENT_NOT_DECLARED', { trigger: 'EVENEMENT', triggerEventTypeLabel: 'Fin du marché' }), /« Fin du marché », qui n’a pas encore été constaté/);
    assert.match(blockerText('EVENT_NOT_DECLARED'), /n’a pas encore été constaté/);
});

test('Le formulaire de règle exige le type d’événement pour le déclencheur événement, et ne l’envoie que dans ce cas', () => {
    const form = { ...emptyRuleForm('i1'), code: 'R1', label: 'Règle', duration: '10', typeDocumentIds: ['t'], trigger: 'EVENEMENT' };
    assert.ok(ruleProblems(form, 'i1').some(p => /type d’événement/.test(p)));
    assert.deepEqual(ruleProblems({ ...form, triggerEventTypeId: 'e1' }, 'i1'), []);
    assert.equal(versionBody({ ...form, triggerEventTypeId: 'e1' }, '2026-10-10').triggerEventTypeId, 'e1');
    assert.equal(versionBody({ ...form, trigger: 'DATE_DOCUMENT', triggerEventTypeId: 'e1' }, '2026-10-10').triggerEventTypeId, null);
});
