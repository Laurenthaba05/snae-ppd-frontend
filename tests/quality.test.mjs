import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeQuality, suggestedRescan, sampleToView, metricsText, qualityErrorText } from '../.test-build/quality.js';

const page = (numeroPage, extra = {}) => ({ numeroPage, fichierId: 'f' + numeroPage, jobState: null, errorCode: null, analyzed: false, metrics: null, issues: [], flagged: false, ...extra });
const metrics = { width: 2480, height: 3508, sharpness: 126.4, contrast: 29.9, brightness: 231.9, inkRatio: 0.14, skewDegrees: -2.5 };

test('Résumé : analysées, signalées, en attente, en échec et relançables', () => {
    const s = summarizeQuality({ pages: [
        page(1, { analyzed: true, metrics }), page(2, { analyzed: true, metrics, flagged: true, issues: [{ code: 'BLUR', message: 'flou' }] }),
        page(3, { jobState: 'QUEUED' }), page(4, { jobState: 'RUNNING' }), page(5, { jobState: 'FAILED', errorCode: 'IMAGE_PIXEL_LIMIT' }), page(6)] });
    assert.deepEqual(s, { total: 6, analyzed: 2, flagged: 1, pending: 2, failed: 1, runnable: 2 });
});

test('Résumé : une page mesurée est analysée même si sa dernière tâche a échoué', () => {
    const s = summarizeQuality({ pages: [page(1, { analyzed: true, metrics, jobState: 'FAILED' })] });
    assert.deepEqual({ analyzed: s.analyzed, failed: s.failed, runnable: s.runnable }, { analyzed: 1, failed: 0, runnable: 0 });
});

test('Pages proposées au renvoi : tout signalement sauf « page presque blanche » seule', () => {
    const pages = [
        page(3, { flagged: true, issues: [{ code: 'BLUR', message: '' }] }), page(1, { flagged: true, issues: [{ code: 'SKEW', message: '' }, { code: 'TOO_DARK', message: '' }] }),
        page(7, { flagged: true, issues: [{ code: 'BLANK_PAGE', message: '' }] }), page(9), page(null, { flagged: true, issues: [{ code: 'BLUR', message: '' }] })];
    assert.deepEqual(suggestedRescan(pages), [1, 3]);
});

test('Échantillon : les pages déjà signalées ne sont pas à regarder en plus', () => {
    assert.deepEqual(sampleToView({ sample: [1, 7, 12, 40], flagged: [12] }), [1, 7, 40]);
    assert.deepEqual(sampleToView({ sample: [], flagged: [] }), []);
});

test('Mesures lisibles, sans inclinaison quand elle est inconnue', () => {
    assert.equal(metricsText({ metrics }), 'netteté 126 · inclinaison −2,5° · luminosité 232 · contraste 30'.replace('−', '-'));
    assert.equal(metricsText({ metrics: { ...metrics, skewDegrees: null } }), 'netteté 126 · luminosité 232 · contraste 30');
    assert.equal(metricsText({ metrics: null }), '');
});

test('Explications d’échec de l’analyse', () => {
    assert.match(qualityErrorText('IMAGE_PIXEL_LIMIT'), /trop grande/);
    assert.match(qualityErrorText('QUALITY_RESULT_INVALID'), /illisible/);
    assert.equal(qualityErrorText('NOUVEAU_CODE'), 'échec (NOUVEAU_CODE)');
    assert.equal(qualityErrorText(undefined), 'échec sans précision');
});
