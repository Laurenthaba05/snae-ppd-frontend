import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_LINES, RULE_TEXTS, approvalProblems, createProblems, destroyedText, executionProblems, lineCounts, lineLabel, quantityText, statusLabel } from '../.test-build/physicalElimination.js';

test('Les états du procès-verbal et de ses lignes se disent en français', () => {
    assert.equal(statusLabel('BROUILLON'), 'En préparation');
    assert.equal(statusLabel('SOUMIS'), 'Soumis à l’autorité');
    assert.equal(statusLabel('EXECUTE'), 'Exécuté');
    assert.equal(statusLabel('AUTRE'), 'État inconnu');
    assert.equal(lineLabel('INSCRITE'), 'En attente');
    assert.equal(lineLabel('DETRUITE'), 'Détruite');
    assert.equal(lineLabel('?'), 'État inconnu');
});

test('Le décompte ignore les lignes annulées', () => {
    const lines = ['INSCRITE', 'ACCEPTEE', 'ACCEPTEE', 'REFUSEE', 'DETRUITE', 'ANNULEE'].map(status => ({ status }));
    assert.deepEqual(lineCounts(lines), { total: 5, waiting: 1, accepted: 2, refused: 1, destroyed: 1 });
    assert.deepEqual(lineCounts([]), { total: 0, waiting: 0, accepted: 0, refused: 0, destroyed: 0 });
});

test('La constitution exige un intitulé et des archives, dans la limite', () => {
    assert.deepEqual(createProblems('Registres 1950', 2), []);
    assert.equal(createProblems('  ', 2).length, 1);
    assert.equal(createProblems('Registres', 0).length, 1);
    assert.equal(createProblems('Registres', MAX_LINES + 1).length, 1);
    assert.equal(createProblems('', 0).length, 2);
});

test('Le visa exige l’autorité, la référence, une date passée et le procès-verbal', () => {
    const ok = { authority: 'Direction nationale des archives', visaReference: 'V-2026-1', visaDate: '2026-10-05', minutes: 'Les registres sont éliminables.' };
    assert.deepEqual(approvalProblems(ok, '2026-10-10'), []);
    assert.equal(approvalProblems({ ...ok, authority: ' ' }, '2026-10-10').length, 1);
    assert.equal(approvalProblems({ ...ok, visaReference: '' }, '2026-10-10').length, 1);
    assert.equal(approvalProblems({ ...ok, visaDate: '2026-10-11' }, '2026-10-10').length, 1);
    assert.equal(approvalProblems({ ...ok, visaDate: '' }, '2026-10-10').length, 1);
    assert.equal(approvalProblems({ ...ok, minutes: 'court' }, '2026-10-10').length, 1);
});

test('La destruction se constate avec deux personnes, après le visa et pas dans le futur', () => {
    const ok = { destructionDate: '2026-10-08', method: 'Broyage', place: 'Magasin 2', operator: 'A. Camara', witness: 'B. Diallo' };
    assert.deepEqual(executionProblems(ok, '2026-10-10', '2026-10-05'), []);
    assert.equal(executionProblems({ ...ok, destructionDate: '2026-10-04' }, '2026-10-10', '2026-10-05').length, 1);
    assert.equal(executionProblems({ ...ok, destructionDate: '2026-10-11' }, '2026-10-10', '2026-10-05').length, 1);
    assert.equal(executionProblems({ ...ok, witness: ' a. camara ' }, '2026-10-10', '2026-10-05').length, 1);
    assert.equal(executionProblems({ ...ok, method: '', place: '' }, '2026-10-10', null).length, 2);
});

test('La quantité se lit à la française, et les règles du serveur ont un texte', () => {
    assert.equal(quantityText(2.5, 'ML')?.replace(/\s/g, ' '), '2,5 ML');
    assert.equal(quantityText(1200, null)?.replace(/\s/g, ' '), '1 200');
    assert.equal(quantityText(null, 'ML'), null);
    assert.equal(destroyedText('2026-10-08'), 'Détruite le 08/10/2026');
    assert.equal(destroyedText(null), 'Détruite');
    for (const code of ['PHYSICAL_ELIMINATION_ARCHIVE_BLOCKED', 'PHYSICAL_ELIMINATION_DUAL_CONTROL', 'PHYSICALARCHIVES_ELIMINATED']) assert.ok(RULE_TEXTS[code] && !/^[A-Z_]+$/.test(RULE_TEXTS[code]), code);
});
