import test from 'node:test';
import assert from 'node:assert/strict';
import {
    LINE_LABELS, MAX_LINES, STATUS_LABELS, TRANSFER_BLOCKERS, availableActions, creationProblems, emptyReceipt, isSelectable, lineText, progressText, receiptBody, receiptProblems,
    receiptSummary, selectionText, transferBlockerText, transferHtml, volumeText
} from '../.test-build/transfers.js';

const summary = (over = {}) => ({
    id: 't1', reference: 'TV-2026-000001', institutionId: 'i1', destinationId: 'i2', title: 'Registres de 1950', status: 'BROUILLON', lines: 3, registered: 3, proposed: 0, accepted: 0, refused: 0,
    transferred: 0, cancelled: 0, totalBytes: 3072, createdById: 'u1', createdAt: '2026-10-10T08:00:00Z', submittedAt: null, receivedAt: null, completedAt: null, receiptReference: null, version: 0, ...over
});
const line = (over = {}) => ({
    id: 'l1', rank: 1, status: 'INSCRITE', eventId: 'e1', documentId: 'd1', reference: 'DOC-2026-001', title: 'Registre <1950> & "annexes"', baseDate: '1950-01-01', dueDate: '2020-01-01',
    rule: 'Versement aux archives', fileCount: 2, totalBytes: 2048, contentFingerprint: 'a'.repeat(64), actionId: null, refusalReason: null, ...over
});
const transfer = (over = {}) => ({
    summary: summary(), observations: 'Lot <annuel>', submittedById: null, receivedById: null, actReference: null, procesVerbal: null, completedById: null, cancelledById: null,
    cancelledAt: null, cancellationReason: null, lines: [line()], ...over
});
const names = { producer: 'Ministère <de test>', destination: 'Archives nationales', createdBy: 'Aïcha <Camara>', receivedBy: 'Fanta Bah', date: iso => iso.slice(0, 10), day: iso => iso ?? '—' };

test('Les états et les lignes ont chacun un libellé français', () => {
    assert.deepEqual(Object.keys(STATUS_LABELS).sort(), ['ACCEPTE', 'ANNULE', 'BROUILLON', 'EXECUTE', 'REFUSE', 'SOUMIS']);
    assert.deepEqual(Object.keys(LINE_LABELS).sort(), ['ACCEPTEE', 'ANNULEE', 'INSCRITE', 'PROPOSEE', 'REFUSEE', 'TRANSFEREE']);
    assert.equal(STATUS_LABELS.EXECUTE, 'Remis');
});

test('Les obstacles du transfert sont dits en français, ceux de la destruction aussi, un code inconnu reste lisible', () => {
    for (const code of Object.keys(TRANSFER_BLOCKERS)) assert.ok(!/^[A-Z_]+$/.test(transferBlockerText(code)), code);
    assert.match(transferBlockerText('ALREADY_TRANSFERRED'), /déjà été remis/);
    assert.match(transferBlockerText('DOCUMENT_ESSENTIAL'), /Document essentiel/);
    assert.equal(transferBlockerText('UN_CODE_NOUVEAU'), 'Un code nouveau.');
    assert.ok(isSelectable({ blockers: [] })); assert.ok(!isSelectable({ blockers: ['NOT_A_TRANSFER'] }));
});

test('Le volume et la sélection se disent sans pluriel fautif', () => {
    assert.equal(volumeText(0, 0), 'aucun document');
    assert.match(volumeText(2, 2048), /^2 documents \(/);
    assert.equal(selectionText([{ eventId: 'a', totalBytes: 10 }], new Set()), 'Aucun document choisi.');
});

test('La constitution exige un intitulé, une institution destinataire et au moins un document, dans la limite du serveur', () => {
    assert.deepEqual(creationProblems('Registres de 1950', 'i2', 3), []);
    assert.match(creationProblems('  ', 'i2', 3)[0], /intitulé/);
    assert.match(creationProblems('x'.repeat(301), 'i2', 3)[0], /300/);
    assert.match(creationProblems('Registres', '', 3)[0], /institution d’archives destinataire/);
    assert.match(creationProblems('Registres', 'i2', 0)[0], /au moins un document/);
    assert.match(creationProblems('Registres', 'i2', MAX_LINES + 1)[0], /500 documents au plus/);
});

const ids = ['l1', 'l2'];

test('La réception : chaque manque est nommé avant l’envoi', () => {
    const ok = { ...emptyReceipt(ids), procesVerbal: 'Réception du 5 octobre.' };
    assert.deepEqual(receiptProblems(ok, ids), []);
    assert.match(receiptProblems({ ...ok, procesVerbal: ' ' }, ids)[0], /procès-verbal de réception est obligatoire/);
    assert.match(receiptProblems({ ...ok, decisions: { l1: true } }, ids)[0], /1 ligne n’est pas décidée/);
    assert.match(receiptProblems({ ...ok, decisions: {} }, ids)[0], /2 lignes ne sont pas décidées/);
    assert.match(receiptProblems({ ...ok, decisions: { l1: true, l2: false } }, ids)[0], /1 refus doit être motivé/);
    assert.deepEqual(receiptProblems({ ...ok, decisions: { l1: true, l2: false }, reasons: { l2: 'Document déjà versé' } }, ids), []);
    assert.match(receiptProblems({ ...ok, actReference: 'x'.repeat(256) }, ids)[0], /255 caractères/);
    // tout refuser dispense de procès-verbal
    assert.deepEqual(receiptProblems({ ...emptyReceipt(ids), decisions: { l1: false, l2: false }, reasons: { l1: 'a', l2: 'b' } }, ids), []);
});

test('Le corps de la réception ne porte le procès-verbal que si une ligne est acceptée, et nomme chaque décision', () => {
    const mixed = { ...emptyReceipt(ids), actReference: ' Acte n° 12 ', procesVerbal: ' Réception. ', decisions: { l1: true, l2: false }, reasons: { l2: ' Déjà versé ' } };
    assert.deepEqual(receiptBody(mixed, ids), {
        actReference: 'Acte n° 12', procesVerbal: 'Réception.',
        decisions: [{ lineId: 'l1', accept: true, reason: null }, { lineId: 'l2', accept: false, reason: 'Déjà versé' }]
    });
    const refusedAll = receiptBody({ ...emptyReceipt(ids), procesVerbal: 'ignoré', decisions: { l1: false, l2: false }, reasons: { l1: 'a', l2: 'b' } }, ids);
    assert.equal(refusedAll.procesVerbal, null); assert.equal(refusedAll.actReference, null);
    assert.equal(receiptSummary(mixed, ids), '1 document accepté, 1 refusé.');
    assert.equal(receiptSummary(emptyReceipt(ids), ids), '2 documents acceptés, 0 refusé.');
});

test('Ce que la personne peut faire dépend de l’état du versement et de ses droits, côté versant ou côté destinataire', () => {
    const all = { propose: true, validate: true, execute: true };
    assert.deepEqual(availableActions(summary({ status: 'BROUILLON' }), all), ['ADD', 'SUBMIT', 'CANCEL']);
    assert.deepEqual(availableActions(summary({ status: 'BROUILLON' }), { ...all, propose: false }), []);
    assert.deepEqual(availableActions(summary({ status: 'SOUMIS', proposed: 3 }), all), ['RECEIVE', 'RETIRE', 'CANCEL']);
    // côté destinataire : seule la réception, selon le droit sur l'institution destinataire
    const none = { propose: false, validate: false, execute: false };
    assert.deepEqual(availableActions(summary({ status: 'SOUMIS', proposed: 3 }), none, true), ['RECEIVE']);
    assert.deepEqual(availableActions(summary({ status: 'SOUMIS', proposed: 3 }), all, false), ['RETIRE', 'CANCEL']);
    assert.deepEqual(availableActions(summary({ status: 'ACCEPTE', accepted: 2 }), all), ['EXECUTE', 'RETIRE', 'CANCEL']);
    assert.deepEqual(availableActions(summary({ status: 'ACCEPTE', accepted: 0 }), all), ['RETIRE', 'CANCEL']);
    for (const status of ['REFUSE', 'EXECUTE', 'ANNULE']) assert.deepEqual(availableActions(summary({ status }), all), [], status);
});

test('L’avancement se dit en une phrase, et chaque état a la sienne', () => {
    assert.match(progressText(summary({ status: 'BROUILLON', registered: 2, totalBytes: 2048 }), 'Archives nationales'), /^Brouillon de 2 documents \(.*\) à verser à Archives nationales\. Il n’est pas encore soumis/);
    assert.equal(progressText(summary({ status: 'SOUMIS', proposed: 1 }), 'Archives nationales'), '1 ligne attend la réception de Archives nationales.');
    assert.match(progressText(summary({ status: 'SOUMIS', proposed: 3 })), /^3 lignes attendent la réception de l’institution destinataire\./);
    assert.match(progressText(summary({ status: 'ACCEPTE', accepted: 2, receiptReference: 'ART-2026-000001' }), 'les Archives'), /^2 documents acceptés restent à remettre à les Archives \(accusé ART-2026-000001\)\./);
    assert.match(progressText(summary({ status: 'REFUSE' })), /^L’institution destinataire a refusé toutes les lignes/);
    assert.match(progressText(summary({ status: 'EXECUTE', transferred: 3 }), 'Archives nationales'), /^3 documents remis à Archives nationales, conservés définitivement\./);
    assert.match(progressText(summary({ status: 'ANNULE' })), /rien n’a été remis/);
});

test('Chaque ligne se dit selon son état', () => {
    assert.equal(lineText(line({ status: 'INSCRITE' })), 'Inscrit');
    assert.equal(lineText(line({ status: 'REFUSEE', refusalReason: 'Déjà versé' })), 'Refusé : Déjà versé');
    assert.equal(lineText(line({ status: 'TRANSFEREE' })), 'Remis');
});

test('Le bordereau de versement imprimable reprend l’en-tête, l’accusé, chaque ligne et son empreinte, sans laisser passer de balise', () => {
    const t = transfer({
        summary: summary({ status: 'EXECUTE', transferred: 1, receivedAt: '2026-10-11T09:00:00Z', receiptReference: 'ART-2026-000001' }), actReference: 'Acte <12>', procesVerbal: 'Réception <du> 11 octobre.\nSignée.',
        lines: [line({ status: 'TRANSFEREE' })]
    });
    const html = transferHtml(t, names);
    assert.ok(html.includes('TV-2026-000001') && html.includes('Archives nationales') && html.includes('ART-2026-000001') && html.includes('a'.repeat(64)));
    assert.ok(html.includes('Registre &lt;1950&gt; &amp; &quot;annexes&quot;') && html.includes('Aïcha &lt;Camara&gt;') && html.includes('Lot &lt;annuel&gt;') && html.includes('Acte &lt;12&gt;'));
    assert.ok(html.includes('Réception &lt;du&gt; 11 octobre.<br>Signée.'));
    assert.ok(html.includes('Le service versant') && html.includes('L’institution destinataire'));
    assert.ok(!html.includes('<script') && !html.includes('<1950>') && !html.includes('<annuel>') && !html.includes('<Camara>') && !html.includes('<de test>'));
});
