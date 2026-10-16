import test from 'node:test';
import assert from 'node:assert/strict';
import { concordanceBadge, failureText, identificationSummaryText, mismatchText, rowFormatName, runText, stateBadge } from '../.test-build/formatIdentification.js';

test('Le bilan dit combien de fichiers sont identifiés, ambigus, inconnus, restants et différents du type déclaré', () => {
    assert.equal(identificationSummaryText({ eligible: 0, identified: 0, ambiguous: 0, unknown: 0, pending: 0, mismatched: 0 }), 'Aucun fichier validé à identifier dans ce périmètre.');
    assert.equal(identificationSummaryText({ eligible: 12, identified: 9, ambiguous: 1, unknown: 1, pending: 1, mismatched: 2 }),
        'Sur 12 fichiers : 9 identifiés, 1 ambigu, 1 inconnu. 1 reste à identifier. 2 ont un type déclaré différent du format reconnu.');
    assert.equal(identificationSummaryText({ eligible: 1, identified: 1, ambiguous: 0, unknown: 0, pending: 0, mismatched: 1 }),
        'Sur 1 fichier : 1 identifié. 1 a un type déclaré différent du format reconnu.');
    assert.equal(identificationSummaryText({ eligible: 3, identified: 0, ambiguous: 0, unknown: 0, pending: 3, mismatched: 0 }), 'Sur 3 fichiers. 3 restent à identifier.');
});

test('Le bilan d’un passage dit ce qui reste et pourquoi des fichiers ont échoué', () => {
    assert.equal(runText({ processed: 0, identified: 0, ambiguous: 0, unknown: 0, failed: 0, failures: [], remaining: 0 }), 'Rien à identifier : tous les fichiers l’ont été.');
    assert.equal(runText({ processed: 0, identified: 0, ambiguous: 0, unknown: 0, failed: 0, failures: [], remaining: 4 }), 'Aucun fichier n’a pu être traité.');
    const text = runText({ processed: 4, identified: 2, ambiguous: 0, unknown: 1, failed: 1, failures: ['IDENTIFICATION_TIMEOUT'], remaining: 6 });
    assert.match(text, /4 fichiers traités : 2 identifiés, 0 ambigu, 1 inconnu/);
    assert.match(text, /1 en échec \(l’outil d’identification n’a pas répondu à temps\)/);
    assert.match(text, /6 restent à identifier : relancez un passage\./);
    assert.match(runText({ processed: 1, identified: 1, ambiguous: 0, unknown: 0, failed: 0, failures: [], remaining: 0 }), /Plus aucun fichier à identifier\./);
});

test('Les codes d’échec se lisent, un code inconnu reste tel quel', () => {
    assert.equal(failureText('STORAGE_UNAVAILABLE'), 'le stockage est indisponible');
    assert.equal(failureText('AUTRE_CODE'), 'AUTRE_CODE');
});

test('Les noms de format, écarts et pastilles', () => {
    assert.equal(rowFormatName({ name: 'Acrobat PDF 1.4', version: '1.4', puid: 'fmt/18' }), 'Acrobat PDF 1.4');
    assert.equal(rowFormatName({ name: 'Windows Bitmap', version: '3.0', puid: 'fmt/116' }), 'Windows Bitmap 3.0');
    assert.equal(rowFormatName({ name: null, version: null, puid: 'x-fmt/111' }), 'x-fmt/111');
    assert.equal(rowFormatName({ name: null, version: null, puid: null }), 'Format inconnu');
    assert.equal(mismatchText({ fileId: 'f', documentId: 'd', documentReference: 'DOC-1', declaredMediaType: 'text/plain', puid: 'fmt/18', name: 'PDF', mediaType: 'application/pdf' }),
        'DOC-1 : déclaré text/plain, reconnu application/pdf (fmt/18)');
    assert.equal(concordanceBadge('CONCORDE'), 'ACTIF');
    assert.equal(concordanceBadge('DIFFERE'), 'ECHEC');
    assert.equal(stateBadge('INCONNU'), 'BROUILLON');
});
