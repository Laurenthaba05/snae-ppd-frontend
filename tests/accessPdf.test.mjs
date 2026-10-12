import test from 'node:test';
import assert from 'node:assert/strict';
import { accessPdfState, canGenerate, generateLabel, volumeLabel, volumeFileName, accessPdfErrorText, missingText, isRunning } from '../.test-build/accessPdf.js';

const part = (extra = {}) => ({ partNo: 1, partCount: 1, firstPage: 1, lastPage: 12, pageCount: 12, sizeBytes: 5_000_000, ...extra });
const view = (extra = {}) => ({ enabled: true, pages: 12, copiesManquantes: [], genereLe: null, aJour: false, volumes: [], tache: null, ...extra });
const job = (state, errorCode = null) => ({ state, errorCode, updatedAt: '2026-10-04T10:00:00Z' });

test('État du PDF d’accès : désactivé, sans page, en attente des copies, à générer, en cours, en échec, à jour, à régénérer', () => {
    assert.equal(accessPdfState(view({ enabled: false })), 'DISABLED');
    assert.equal(accessPdfState(view({ pages: 0 })), 'NO_PAGES');
    assert.equal(accessPdfState(view({ copiesManquantes: [3, 4] })), 'WAITING_COPIES');
    assert.equal(accessPdfState(view()), 'NOT_GENERATED');
    assert.equal(accessPdfState(view({ tache: job('QUEUED') })), 'RUNNING');
    assert.equal(accessPdfState(view({ tache: job('RUNNING') })), 'RUNNING');
    assert.equal(accessPdfState(view({ tache: job('FAILED', 'ACCESS_PDF_COPY_INVALID') })), 'FAILED');
    assert.equal(accessPdfState(view({ volumes: [part()], aJour: true, tache: job('DONE') })), 'UP_TO_DATE');
    assert.equal(accessPdfState(view({ volumes: [part()], aJour: false, tache: job('DONE') })), 'STALE');
    // Désactivé mais déjà généré : le résultat reste présenté.
    assert.equal(accessPdfState(view({ enabled: false, volumes: [part()], aJour: true })), 'UP_TO_DATE');
    assert.equal(isRunning(view({ tache: job('DONE') })), false);
});

test('On peut générer quand toutes les copies existent, sans tâche en cours et si le PDF n’est pas déjà à jour', () => {
    assert.equal(canGenerate(view()), true);
    assert.equal(canGenerate(view({ enabled: false })), false);
    assert.equal(canGenerate(view({ pages: 0 })), false);
    assert.equal(canGenerate(view({ copiesManquantes: [2] })), false);
    assert.equal(canGenerate(view({ tache: job('QUEUED') })), false);
    assert.equal(canGenerate(view({ volumes: [part()], aJour: true })), false);
    assert.equal(canGenerate(view({ volumes: [part()], aJour: false })), true);
    assert.equal(generateLabel(view()), 'Générer le PDF d’accès');
    assert.equal(generateLabel(view({ volumes: [part()] })), 'Régénérer le PDF d’accès');
    assert.equal(generateLabel(view({ tache: job('FAILED') })), 'Relancer le PDF d’accès');
});

test('Volumes : libellé, nom de fichier, pages sans copie et erreurs', () => {
    assert.equal(volumeLabel(part()), 'PDF d’accès · pages 1 à 12 · 4,8 Mo');
    assert.equal(volumeLabel(part({ partNo: 2, partCount: 3, firstPage: 121, lastPage: 121, pageCount: 1, sizeBytes: 800_000 })), 'Volume 2 sur 3 · page 121 · 781 Ko');
    // un fichier de plusieurs images donne plus de pages de PDF que de numéros de page
    assert.equal(volumeLabel(part({ firstPage: 1, lastPage: 4, pageCount: 9 })), 'PDF d’accès · pages 1 à 4 · 9 pages de PDF · 4,8 Mo');
    assert.equal(volumeLabel(part({ firstPage: 7, lastPage: 7, pageCount: 3 })), 'PDF d’accès · page 7 · 3 pages de PDF · 4,8 Mo');
    assert.equal(volumeLabel(part({ firstPage: 1, lastPage: 12, pageCount: 10 })), 'PDF d’accès · pages 1 à 12 · 4,8 Mo');   // des pages manquantes (trous) ne s’affichent pas
    assert.equal(volumeFileName(part()), 'acces.pdf');
    assert.equal(volumeFileName(part({ partNo: 2, partCount: 3 })), 'acces-volume-2-sur-3.pdf');
    assert.equal(missingText([]), '');
    assert.equal(missingText([4]), 'page 4');
    assert.equal(missingText([1, 2, 3]), 'pages 1, 2, 3');
    assert.equal(missingText([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 'pages 1, 2, 3, 4, 5, 6, 7, 8 et 2 autres');
    assert.match(accessPdfErrorText('ACCESS_PDF_SOURCE_INTEGRITY'), /empreinte/);
    assert.match(accessPdfErrorText('REQUESTER_ACCESS_REVOKED'), /droits/);
    assert.equal(accessPdfErrorText('QUELQUE_CHOSE'), 'échec (QUELQUE_CHOSE)');
    assert.equal(accessPdfErrorText(null), 'échec sans précision');
});
