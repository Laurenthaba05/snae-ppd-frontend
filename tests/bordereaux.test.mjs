import test from 'node:test';
import assert from 'node:assert/strict';
import {
    CANDIDATE_BLOCKERS, LINE_LABELS, MAX_LINES, STATUS_LABELS, availableActions, bordereauBlockerText, bordereauHtml, creationProblems, emptyVisa, executionText, isSelectable, lineText,
    progressText, selectionText, visaBody, visaProblems, visaSummary, volumeText
} from '../.test-build/bordereaux.js';

const summary = (over = {}) => ({
    id: 'b1', reference: 'BE-2026-000001', institutionId: 'i1', title: 'Registres de 1990', status: 'BROUILLON', lines: 3, registered: 3, proposed: 0, accepted: 0, refused: 0, destroyed: 0, cancelled: 0,
    totalBytes: 3072, createdById: 'u1', createdAt: '2026-10-10T08:00:00Z', submittedAt: null, visaAt: null, completedAt: null, version: 0, ...over
});
const line = (over = {}) => ({
    id: 'l1', rank: 1, status: 'INSCRITE', eventId: 'e1', documentId: 'd1', reference: 'DOC-2026-001', title: 'Registre de paie <1990> & "annexes"', baseDate: '1990-01-01', dueDate: '2020-01-01', rule: 'Élimination des registres',
    fileCount: 2, totalBytes: 2048, actionId: null, refusalReason: null, certificateId: null, certificateReference: null, attempts: 0, lastError: null, ...over
});
const bordereau = (over = {}) => ({
    summary: summary(), observations: 'Lot <annuel>', authority: null, visaReference: null, visaDate: null, procesVerbal: null, submittedById: null, visaById: null, cancelledById: null, cancelledAt: null,
    cancellationReason: null, fingerprint: null, lines: [line()], ...over
});
const names = { institution: 'Ministère de test', createdBy: 'Aïcha <Camara>', submittedBy: 'Moussa Sylla', visaBy: 'Fanta Bah', date: iso => iso.slice(0, 10), day: iso => iso ?? '—' };

test('Les états et les lignes ont chacun un libellé français', () => {
    assert.deepEqual(Object.keys(STATUS_LABELS).sort(), ['ANNULE', 'BROUILLON', 'EXECUTE', 'REFUSE', 'SOUMIS', 'VISE']);
    assert.deepEqual(Object.keys(LINE_LABELS).sort(), ['ACCEPTEE', 'ANNULEE', 'DETRUITE', 'INSCRITE', 'PROPOSEE', 'REFUSEE']);
    assert.equal(STATUS_LABELS.EXECUTE, 'Détruit');
});

test('Les obstacles d’inscription sont dits en français, ceux de la destruction aussi, un code inconnu reste lisible', () => {
    for (const code of Object.keys(CANDIDATE_BLOCKERS)) assert.ok(!/^[A-Z_]+$/.test(bordereauBlockerText(code)), code);
    assert.match(bordereauBlockerText('DOCUMENT_ESSENTIAL'), /Document essentiel/);
    assert.match(bordereauBlockerText('DESTRUCTION_STORAGE_NOT_CONFIGURED'), /Le stockage ne permet pas/);
    assert.equal(bordereauBlockerText('UN_CODE_NOUVEAU'), 'Un code nouveau.');
    assert.ok(isSelectable({ blockers: [] })); assert.ok(!isSelectable({ blockers: ['DOCUMENT_ESSENTIAL'] }));
});

test('Le volume et la sélection se disent sans pluriel fautif', () => {
    assert.equal(volumeText(0, 0), 'aucun document');
    assert.match(volumeText(1, 1024), /^1 document \(1.*Ko\)$/);
    assert.match(volumeText(3, 3 * 1024 * 1024), /^3 documents \(.*Mo\)$/);
    const candidates = [{ eventId: 'a', totalBytes: 1024 }, { eventId: 'b', totalBytes: 2048 }];
    assert.equal(selectionText(candidates, new Set()), 'Aucun document choisi.');
    assert.match(selectionText(candidates, new Set(['a'])), /^1 document \(.*\) choisi\.$/);
    assert.match(selectionText(candidates, new Set(['a', 'b'])), /^2 documents \(.*\) choisis\.$/);
});

test('La constitution exige un intitulé et au moins un document, dans la limite du serveur', () => {
    assert.deepEqual(creationProblems('Registres de 1990', 3), []);
    assert.match(creationProblems('  ', 3)[0], /intitulé/);
    assert.match(creationProblems('x'.repeat(301), 3)[0], /300/);
    assert.match(creationProblems('Registres', 0)[0], /au moins un document/);
    assert.match(creationProblems('Registres', MAX_LINES + 1)[0], /500 documents au plus/);
});

const ids = ['l1', 'l2'];
const filled = (over = {}) => ({ ...emptyVisa(ids, '2026-10-10'), authority: 'Archives nationales', visaReference: 'VISA-2026-014', procesVerbal: 'Décision de la commission.', ...over });

test('Le visa : chaque manque est nommé avant l’envoi', () => {
    assert.deepEqual(visaProblems(filled(), ids, '2026-10-10'), []);
    assert.match(visaProblems(filled({ authority: ' ' }), ids, '2026-10-10')[0], /autorité/);
    assert.match(visaProblems(filled({ visaReference: '' }), ids, '2026-10-10')[0], /référence du visa/);
    assert.match(visaProblems(filled({ visaDate: '' }), ids, '2026-10-10')[0], /date du visa est obligatoire/);
    assert.match(visaProblems(filled({ visaDate: '2026-10-11' }), ids, '2026-10-10')[0], /futur/);
    assert.match(visaProblems(filled({ procesVerbal: '' }), ids, '2026-10-10')[0], /procès-verbal/);
    assert.match(visaProblems(filled({ decisions: { l1: true } }), ids, '2026-10-10')[0], /1 ligne n’est pas décidée/);
    assert.match(visaProblems(filled({ decisions: {} }), ids, '2026-10-10')[0], /2 lignes ne sont pas décidées/);
    // un refus se motive ; refuser tout dispense de référence, de date et de procès-verbal
    assert.match(visaProblems(filled({ decisions: { l1: true, l2: false } }), ids, '2026-10-10')[0], /1 refus doit être motivé/);
    assert.deepEqual(visaProblems(filled({ decisions: { l1: true, l2: false }, reasons: { l2: 'Valeur historique' } }), ids, '2026-10-10'), []);
    assert.deepEqual(visaProblems({ ...emptyVisa(ids, ''), authority: 'Archives', decisions: { l1: false, l2: false }, reasons: { l1: 'a', l2: 'b' } }, ids, '2026-10-10'), []);
});

test('Le corps du visa ne porte la référence que si une ligne est acceptée, et nomme chaque décision', () => {
    const mixed = filled({ decisions: { l1: true, l2: false }, reasons: { l2: ' Valeur historique ' } });
    assert.deepEqual(visaBody(mixed, ids), {
        authority: 'Archives nationales', visaReference: 'VISA-2026-014', visaDate: '2026-10-10', procesVerbal: 'Décision de la commission.',
        decisions: [{ lineId: 'l1', accept: true, reason: null }, { lineId: 'l2', accept: false, reason: 'Valeur historique' }]
    });
    const refusedAll = visaBody(filled({ decisions: { l1: false, l2: false }, reasons: { l1: 'a', l2: 'b' } }), ids);
    assert.equal(refusedAll.visaReference, null); assert.equal(refusedAll.visaDate, null); assert.equal(refusedAll.procesVerbal, null);
    assert.equal(visaSummary(mixed, ids), '1 document accepté, 1 refusé.');
    assert.equal(visaSummary(filled(), ids), '2 documents acceptés, 0 refusé.');
});

test('Ce que la personne peut faire dépend de l’état du bordereau et de ses droits', () => {
    const all = { propose: true, validate: true, execute: true };
    assert.deepEqual(availableActions(summary({ status: 'BROUILLON' }), all), ['ADD', 'SUBMIT', 'CANCEL']);
    assert.deepEqual(availableActions(summary({ status: 'BROUILLON' }), { ...all, propose: false }), []);
    assert.deepEqual(availableActions(summary({ status: 'SOUMIS', proposed: 3 }), all), ['VISA', 'RETIRE', 'CANCEL']);
    assert.deepEqual(availableActions(summary({ status: 'SOUMIS', proposed: 3 }), { propose: false, validate: true, execute: false }), ['VISA']);
    assert.deepEqual(availableActions(summary({ status: 'VISE', accepted: 2 }), all), ['EXECUTE', 'RETIRE', 'CANCEL']);
    assert.deepEqual(availableActions(summary({ status: 'VISE', accepted: 0 }), all), ['RETIRE', 'CANCEL']);
    for (const status of ['REFUSE', 'EXECUTE', 'ANNULE']) assert.deepEqual(availableActions(summary({ status }), all), [], status);
});

test('L’avancement se dit en une phrase, et chaque état a la sienne', () => {
    assert.match(progressText(summary({ status: 'BROUILLON', registered: 2, totalBytes: 2048 })), /^Brouillon de 2 documents \(.*\)\. Il n’est pas encore soumis/);
    assert.match(progressText(summary({ status: 'SOUMIS', proposed: 1 })), /^1 ligne attend le visa de l’autorité/);
    assert.match(progressText(summary({ status: 'SOUMIS', proposed: 3 })), /^3 lignes attendent le visa/);
    assert.equal(progressText(summary({ status: 'VISE', destroyed: 1, accepted: 2 })), '1 document détruit sur 3 visés : 2 restent à détruire.');
    assert.equal(progressText(summary({ status: 'VISE', destroyed: 2, accepted: 1 })), '2 documents détruits sur 3 visés : 1 reste à détruire.');
    assert.match(progressText(summary({ status: 'REFUSE' })), /refusé toutes les lignes/);
    assert.match(progressText(summary({ status: 'EXECUTE', destroyed: 3 })), /^3 documents détruits, chacun avec son certificat/);
    assert.match(progressText(summary({ status: 'ANNULE' })), /aucune destruction n’a eu lieu/);
});

test('Le résumé d’un lot de destruction nomme les échecs et ce qui reste', () => {
    assert.equal(executionText({ destroyedNow: 3, failures: [], remaining: 0 }), '3 documents détruits.');
    assert.equal(executionText({ destroyedNow: 1, failures: [{}], remaining: 2 }), '1 document détruit ; 1 échec (voir ci-dessous) ; 2 restent à détruire.');
    assert.equal(executionText({ destroyedNow: 0, failures: [{}, {}], remaining: 1 }), '0 document détruit ; 2 échecs (voir ci-dessous) ; 1 reste à détruire.');
});

test('Chaque ligne se dit selon son état, avec ce qui la bloque', () => {
    assert.equal(lineText(line({ status: 'INSCRITE' })), 'Inscrit');
    assert.equal(lineText(line({ status: 'PROPOSEE' })), 'En attente de visa');
    assert.equal(lineText(line({ status: 'REFUSEE', refusalReason: 'Valeur historique' })), 'Refusé : Valeur historique');
    assert.equal(lineText(line({ status: 'DETRUITE', certificateReference: 'CD-2026-000004' })), 'Détruit · certificat CD-2026-000004');
    assert.equal(lineText(line({ status: 'ACCEPTEE' })), 'Visé, à détruire');
    assert.match(lineText(line({ status: 'ACCEPTEE' }), ['DOCUMENT_ESSENTIAL']), /^Bloqué : Document essentiel/);
    assert.match(lineText(line({ status: 'ACCEPTEE', attempts: 2, lastError: 'STORAGE_PROVIDER_REJECTED' })), /Échec à la dernière tentative \(2 essais\)/);
});

test('Le bordereau imprimable reprend l’en-tête, chaque ligne et le visa, sans laisser passer de balise', () => {
    const b = bordereau({
        summary: summary({ status: 'EXECUTE', destroyed: 1, submittedAt: '2026-10-10T09:00:00Z', visaAt: '2026-10-10T10:00:00Z' }), authority: 'Archives nationales', visaReference: 'VISA-2026-014', visaDate: '2026-10-09',
        procesVerbal: 'Décision <du> 9 octobre.\nSignée.', fingerprint: 'f'.repeat(64), lines: [line({ status: 'DETRUITE', certificateReference: 'CD-2026-000004' })]
    });
    const html = bordereauHtml(b, names);
    assert.ok(html.includes('BE-2026-000001') && html.includes('Ministère de test') && html.includes('Archives nationales') && html.includes('VISA-2026-014'));
    assert.ok(html.includes('Registre de paie &lt;1990&gt; &amp; &quot;annexes&quot;') && html.includes('Aïcha &lt;Camara&gt;') && html.includes('Lot &lt;annuel&gt;'));
    assert.ok(html.includes('CD-2026-000004') && html.includes('f'.repeat(64)) && html.includes('Décision &lt;du&gt; 9 octobre.<br>Signée.'));
    assert.ok(html.includes('Le service versant') && html.includes('L’autorité qui vise'));
    assert.ok(!html.includes('<script') && !html.includes('<1990>') && !html.includes('<annuel>') && !html.includes('<Camara>'));
});

test('Le plan d’élimination d’un dossier se dit en une phrase', async () => {
    const { dossierPlanText } = await import('../.test-build/bordereaux.js');
    const doc = (blockers = []) => ({ documentId: 'd', reference: 'R', title: 'T', dossierReference: 'D', eventId: 'e', dueDate: '2020-01-01', blockers, blockerMessages: [] });
    assert.match(dossierPlanText({ closed: false, complete: false, documents: [], destroyedDocuments: 0 }), /n’est pas clos/);
    assert.match(dossierPlanText({ closed: true, complete: false, documents: [], destroyedDocuments: 0 }), /aucun document à éliminer/);
    assert.match(dossierPlanText({ closed: true, complete: false, documents: [], destroyedDocuments: 3 }), /déjà détruits/);
    assert.match(dossierPlanText({ closed: true, complete: true, documents: [doc(), doc()], destroyedDocuments: 0 }), /Les 2 documents du dossier/);
    assert.match(dossierPlanText({ closed: true, complete: true, documents: [doc()], destroyedDocuments: 0 }), /Les 1 document du dossier/);
    assert.match(dossierPlanText({ closed: true, complete: false, documents: [doc(), doc(['ACTIVE_LEGAL_HOLD'])], destroyedDocuments: 0 }), /1 document sur 2 prêt/);
});
