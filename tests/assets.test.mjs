import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeAssets, formatText, detailsText, sizeText, derivativeLabel, assetErrorText, imageCount, copyLines } from '../.test-build/assets.js';

const format = (extra = {}) => ({ family: 'TIFF', name: 'TIFF', version: null, puid: 'fmt/353', mediaType: 'image/tiff', wellFormed: true, lossy: false, details: {}, findings: [], ...extra });
const item = (extra = {}) => ({ numeroPage: 1, fichierId: 'f' + Math.random(), mediaType: 'image/tiff', role: 'MAITRE_CONSERVATION', format: null, identifyState: null, identifyError: null, derivatives: [], deriveState: null, deriveError: null, ...extra });
const copy = (kind, frame = 1, extra = {}) => ({ kind, frame, width: 100, height: 80, sizeBytes: 1000, mediaType: 'image/jpeg', ...extra });

test('Résumé : formats identifiés, constats, copies, en cours, échecs et fichiers relançables', () => {
    const s = summarizeAssets([
        item({ format: format(), derivatives: [copy('CONSULTATION'), copy('THUMBNAIL')] }),
        item({ format: format({ findings: [{ code: 'NOT_WELL_FORMED', message: 'corrompu' }] }), derivatives: [copy('CONSULTATION')] }),
        item({ identifyState: 'RUNNING', deriveState: 'QUEUED' }),
        item({ identifyState: 'FAILED', identifyError: 'IMAGE_PIXEL_LIMIT', deriveState: 'FAILED' }),
        item()]);
    assert.deepEqual(s, { total: 5, identified: 2, withFindings: 1, withCopies: 2, pending: 1, failed: 1, runnable: 2 });
});

test('Résumé : un PDF n’attend pas de copie, un résultat existant compte comme fait même si la dernière tâche a échoué', () => {
    const pdf = item({ mediaType: 'application/pdf', format: format({ family: 'PDF', name: 'PDF' }) });
    const failedAfter = item({ format: format(), derivatives: [copy('THUMBNAIL')], identifyState: 'FAILED', deriveState: 'FAILED' });
    const s = summarizeAssets([pdf, failedAfter]);
    assert.deepEqual({ failed: s.failed, runnable: s.runnable, withCopies: s.withCopies }, { failed: 0, runnable: 0, withCopies: 1 });
});

test('Format et caractéristiques lisibles', () => {
    assert.equal(formatText({ name: 'PDF', version: '1.7' }), 'PDF 1.7');
    assert.equal(formatText({ name: 'TIFF', version: null }), 'TIFF');
    assert.equal(formatText(null), '');
    assert.equal(detailsText(format({ details: { dpi: [300.0, 300.0], compression: 'tiff_lzw', colorMode: 'RGB' } })), '300 dpi · LZW · couleur');
    assert.equal(detailsText(format({ details: { compression: 'raw', colorMode: 'L', frames: 4 } })), 'non compressé · niveaux de gris · 4 images');
    assert.equal(detailsText(format({ family: 'PDF', details: { pages: 12, frames: 12 } })), '12 pages');
    assert.equal(detailsText(format({ details: { compression: 'inconnue', colorMode: 'XYZ' } })), 'inconnue · XYZ');
    assert.equal(detailsText(null), '');
});

test('Tailles et libellés des copies', () => {
    assert.equal(sizeText(512), '512 o');
    assert.equal(sizeText(23456), '23 Ko');
    assert.equal(sizeText(1_234_567), '1,2 Mo');
    assert.equal(derivativeLabel('CONSULTATION'), 'Consultation');
    assert.equal(derivativeLabel('THUMBNAIL'), 'Vignette');
});

test('Explications d’échec : connues en français, inconnues avec leur code', () => {
    assert.match(assetErrorText('FILE_TOO_LARGE'), /limite de traitement/);
    assert.match(assetErrorText('DERIVATIVE_SIZE_LIMIT'), /volumineuse/);
    assert.equal(assetErrorText('NOUVEAU'), 'échec (NOUVEAU)');
    assert.equal(assetErrorText(null), 'échec sans précision');
});

test('Fichier de plusieurs images : le nombre d’images vient des copies de consultation, une seule image par défaut', () => {
    assert.equal(imageCount(item()), 1);
    assert.equal(imageCount(item({ derivatives: [copy('CONSULTATION'), copy('THUMBNAIL')] })), 1);
    assert.equal(imageCount(item({ derivatives: [1, 2, 3].flatMap(f => [copy('CONSULTATION', f), copy('THUMBNAIL', f)]) })), 3);
    assert.equal(imageCount(item({ derivatives: [copy('THUMBNAIL', 5)] })), 1);   // seule la consultation compte
});

test('Une ligne par type de copie : détaillée pour une image, totalisée pour plusieurs', () => {
    assert.deepEqual(copyLines([]), []);
    assert.deepEqual(copyLines([copy('THUMBNAIL', 1, { width: 360, height: 240, sizeBytes: 23_456 }), copy('CONSULTATION', 1, { width: 2400, height: 1600, sizeBytes: 1_234_567 })]),
        ['Consultation · 2400 × 1600 · 1,2 Mo', 'Vignette · 360 × 240 · 23 Ko']);
    assert.deepEqual(copyLines([1, 2, 3].flatMap(f => [copy('CONSULTATION', f, { sizeBytes: 1_000_000 }), copy('THUMBNAIL', f, { sizeBytes: 20_000 })])),
        ['Consultation · 3 images · 2,9 Mo au total', 'Vignette · 3 images · 59 Ko au total']);
    assert.match(assetErrorText('IMAGE_TOTAL_PIXEL_LIMIT'), /toutes les images du fichier/);
});
