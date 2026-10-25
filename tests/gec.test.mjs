import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIDENTIALITIES, CONFIDENTIALITY_LABELS, DIRECTION_LABELS, EMPTY_FILTERS, PIECE_STATUS_LABELS, ROLE_LABELS, STATUS_LABELS, STEP_LABELS, countByStatus, errorText, needsAttention, sourceProblems } from '../.test-build/gec.js';

// Ce que l'écran dit des courriers de la GEC : chaque état, sens, rôle et étape du serveur a son libellé ; un code d'erreur se lit en une phrase qui dit quoi faire.
test('chaque valeur que le serveur peut rendre a un libellé', () => {
    assert.deepEqual(Object.keys(STATUS_LABELS).sort(), ['ARCHIVE', 'ECHEC', 'RECU']);
    assert.deepEqual(Object.keys(DIRECTION_LABELS).sort(), ['ARRIVEE', 'DEPART', 'INTERNE']);
    assert.deepEqual(Object.keys(ROLE_LABELS).sort(), ['ACCUSE', 'ANNEXE', 'AUTRE', 'PARAPHEUR', 'PRINCIPAL']);
    assert.deepEqual(Object.keys(PIECE_STATUS_LABELS).sort(), ['DEPOSE', 'ECHEC', 'EN_ATTENTE', 'VALIDE']);
    assert.deepEqual(Object.keys(STEP_LABELS).sort(), ['CLOS', 'DOCUMENT_CREE', 'PIECES_DEPOSEES', 'RECU', 'SCELLE']);
    assert.deepEqual([...CONFIDENTIALITIES].sort(), Object.keys(CONFIDENTIALITY_LABELS).sort());
    assert.deepEqual(EMPTY_FILTERS, { source: '', statut: '', q: '' });
});

test('un code d’erreur du serveur se lit en une phrase, un code inconnu se montre tel quel', () => {
    assert.match(errorText('SCAN_INFECTED'), /antivirus/);
    assert.match(errorText('GEC_PIECE_REJETEE'), /nouvelle référence/);
    assert.match(errorText('MANDATORY_WORKFLOW_INCOMPLETE'), /circuit/);
    assert.match(errorText('STORAGE_UNAVAILABLE'), /reprend/);
    assert.equal(errorText('CODE_QUI_N_EXISTE_PAS'), 'Arrêt avec le code CODE_QUI_N_EXISTE_PAS.');
    assert.equal(errorText(null), null);
    assert.equal(errorText(''), null);
});

test('le formulaire d’une source refuse ce que le serveur refuserait', () => {
    const ok = { code: 'GEC-MIN-1', nom: 'GEC du ministère', typeDocumentId: 'type-1' };
    assert.deepEqual(sourceProblems(ok, true), []);
    assert.equal(sourceProblems({ ...ok, code: 'a' }, true).length, 1, 'un code trop court');
    assert.equal(sourceProblems({ ...ok, code: '-DEBUT' }, true).length, 1, 'un code qui commence par un tiret');
    assert.equal(sourceProblems({ ...ok, code: 'avec espace' }, true).length, 1);
    assert.deepEqual(sourceProblems({ ...ok, code: 'a' }, false), [], 'le code ne se saisit qu’à la création');
    assert.equal(sourceProblems({ ...ok, code: ' gec-min ' }, true).length, 0, 'le code se compare en majuscules, sans espaces autour');
    assert.equal(sourceProblems({ ...ok, nom: '  ' }, true).length, 1);
    assert.equal(sourceProblems({ ...ok, nom: 'x'.repeat(201) }, true).length, 1);
    assert.equal(sourceProblems({ ...ok, typeDocumentId: '' }, true).length, 1);
});

test('le journal compte les courriers par état et signale ceux qui sont en échec', () => {
    const rows = [{ statut: 'ARCHIVE' }, { statut: 'ARCHIVE' }, { statut: 'ECHEC' }, { statut: 'RECU' }];
    assert.deepEqual(countByStatus(rows), { RECU: 1, ARCHIVE: 2, ECHEC: 1 });
    assert.deepEqual(countByStatus([]), { RECU: 0, ARCHIVE: 0, ECHEC: 0 });
    assert.deepEqual(rows.map(needsAttention), [false, false, true, false]);
});
