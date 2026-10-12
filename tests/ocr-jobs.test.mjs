import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeOcrJobs, ocrErrorText } from '../.test-build/ocrJobs.js';

const item = (state, extra = {}) => ({ fichierId: 'f' + Math.random(), numeroPage: 1, state, attempts: 0, errorCode: null, hasText: false, updatedAt: null, ...extra });

test('Résumé : un fichier avec texte est traité quelle que soit sa dernière tâche', () => {
    const s = summarizeOcrJobs([item('DONE', { hasText: true }), item('FAILED', { hasText: true }), item(null, { hasText: true })]);
    assert.deepEqual({ total: s.total, withText: s.withText, failed: s.failed, noText: s.noText, runnable: s.runnable, active: s.active }, { total: 3, withText: 3, failed: 0, noText: 0, runnable: 0, active: false });
});

test('Résumé : en attente, en cours, échec et « sans texte » ; seuls les fichiers sans tâche active peuvent être relancés', () => {
    const s = summarizeOcrJobs([item('QUEUED'), item('RUNNING'), item('FAILED', { errorCode: 'EXTRACTION_TIMEOUT' }), item('DONE'), item(null), item('CANCELLED')]);
    assert.equal(s.queued, 1);
    assert.equal(s.running, 1);
    assert.equal(s.failed, 1);
    assert.equal(s.noText, 1);
    assert.equal(s.runnable, 4);      // échec, terminé sans texte, jamais lancé, annulé
    assert.equal(s.active, true);
});

test('Résumé : liste vide', () => {
    assert.deepEqual(summarizeOcrJobs([]), { total: 0, queued: 0, running: 0, withText: 0, failed: 0, noText: 0, runnable: 0, active: false });
});

test('Explications d’échec : connues en français, inconnues avec leur code, absentes sans précision', () => {
    assert.match(ocrErrorText('TESSERACT_LANGUAGE_NOT_INSTALLED'), /modèle de langue/);
    assert.match(ocrErrorText('IMAGE_PIXEL_LIMIT'), /trop grande/);
    assert.match(ocrErrorText('SOURCE_NOT_READY'), /antivirus/);
    assert.equal(ocrErrorText('QUELQUE_CHOSE_DE_NEUF'), 'échec (QUELQUE_CHOSE_DE_NEUF)');
    assert.equal(ocrErrorText(null), 'échec sans précision');
});
