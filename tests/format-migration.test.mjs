import test from 'node:test';
import assert from 'node:assert/strict';
import {
    canCancelMigration, canRetryMigration, candidateText, copyText, emptyMigrationForm, lineBadge, migratedCopyFileName, migrationBadge, migrationBody, migrationProblems,
    migrationSummary, policyNotice, validationState
} from '../.test-build/formatMigration.js';

const FILE = '11111111-1111-4111-8111-111111111111';
const INST = '97571d20-3f49-497e-a185-dac22208eb3f';
const summary = (over = {}) => ({ id: 'c1', reference: 'MG-2026-000001', institutionId: INST, title: 'BMP', converter: 'IMAGE_TO_TIFF', converterVersion: '1', sourceType: 'image/bmp',
    targetType: 'image/tiff', status: 'BROUILLON', lines: 6, pending: 0, migrated: 0, failed: 0, cancelled: 0, createdById: 'u1', createdAt: '2026-10-15T09:00:00Z',
    validatedById: null, validatedAt: null, completedAt: null, version: 0, ...over });

test('Le résumé d’une campagne dit ce qui est migré, en échec, en attente et abandonné', () => {
    assert.equal(migrationSummary(summary({ migrated: 3, failed: 1, pending: 2 })), '3 migrés, 1 en échec, 2 en attente sur 6 fichiers.');
    assert.equal(migrationSummary(summary({ lines: 1, migrated: 1 })), '1 migré sur 1 fichier.');
    assert.equal(migrationSummary(summary({ lines: 2, cancelled: 2 })), '2 abandonnés sur 2 fichiers.');
    assert.equal(migrationSummary(summary({ lines: 0 })), 'Rien à migrer sur 0 fichier.');
});

test('La politique du registre se lit : absent, sans format cible, autre format cible, conforme', () => {
    const base = { registered: true, name: 'BMP', scope: 'INSTITUTION', risk: 'ELEVE', perennity: 'A_SURVEILLER', registryTarget: 'image/tiff', converterTarget: 'image/tiff', matches: true };
    assert.equal(policyNotice({ ...base, registered: false, name: null, registryTarget: null, matches: false }, 'image/bmp').ok, false);
    assert.match(policyNotice({ ...base, registered: false, registryTarget: null, matches: false }, 'image/bmp').text, /ne figure pas au registre/);
    assert.match(policyNotice({ ...base, registryTarget: null, matches: false }, 'image/bmp').text, /aucun format cible/);
    const other = policyNotice({ ...base, registryTarget: 'image/png', converterTarget: 'image/tiff', matches: false }, 'image/bmp');
    assert.equal(other.ok, false);
    assert.match(other.text, /image\/png.*image\/tiff/);
    const fine = policyNotice(base, 'image/bmp');
    assert.equal(fine.ok, true);
    assert.match(fine.text, /Conforme au registre \(institution\)/);
});

test('Le formulaire exige convertisseur, format, intitulé, motif et au moins un fichier', () => {
    assert.equal(migrationProblems(emptyMigrationForm).length, 5);
    const ok = { converter: 'IMAGE_TO_TIFF', sourceType: 'image/bmp', title: 'Migration des BMP', motive: 'Le format sort de la liste recommandée', fileIds: [FILE] };
    assert.deepEqual(migrationProblems(ok), []);
    assert.ok(migrationProblems({ ...ok, motive: 'court' }).some(p => /motif/.test(p)));
    assert.ok(migrationProblems({ ...ok, fileIds: Array.from({ length: 501 }, (_, i) => String(i)) }).some(p => /500 fichiers au plus/.test(p)));
});

test('Le corps envoyé retire les doublons et nettoie les textes', () => {
    const body = migrationBody(INST, { converter: 'IMAGE_TO_TIFF', sourceType: 'image/bmp', title: ' Migration ', motive: ' Un motif suffisant ', fileIds: [FILE, FILE] });
    assert.deepEqual(body, { institutionId: INST, converter: 'IMAGE_TO_TIFF', sourceType: 'image/bmp', title: 'Migration', motive: 'Un motif suffisant', fileIds: [FILE] });
    assert.throws(() => migrationBody(INST, { converter: 'X', sourceType: 'image/bmp', title: 't', motive: 'm', fileIds: ['pas-un-uuid'] }));
});

test('La validation exige l’habilitation, une autre personne et un brouillon', () => {
    assert.deepEqual(validationState(summary(), 'u2', true), { allowed: true, reason: null });
    assert.equal(validationState(summary(), 'u1', true).allowed, false);
    assert.match(validationState(summary(), 'u1', true).reason, /une autre personne/);
    assert.equal(validationState(summary(), 'u2', false).allowed, false);
    assert.equal(validationState(summary({ status: 'VALIDEE' }), 'u2', true).allowed, false);
    assert.equal(validationState(summary({ status: 'VALIDEE' }), 'u2', true).reason, null);
});

test('L’annulation et la relance suivent l’état de la campagne', () => {
    assert.equal(canCancelMigration('BROUILLON'), true);
    assert.equal(canCancelMigration('VALIDEE'), true);
    assert.equal(canCancelMigration('TERMINEE'), false);
    assert.equal(canCancelMigration('ANNULEE'), false);
    assert.equal(canRetryMigration({ status: 'TERMINEE', failed: 1 }), true);
    assert.equal(canRetryMigration({ status: 'VALIDEE', failed: 0 }), false);
    assert.equal(canRetryMigration({ status: 'BROUILLON', failed: 1 }), false);
});

test('Les pastilles et les noms de copies migrées', () => {
    assert.equal(migrationBadge('TERMINEE'), 'ACTIF');
    assert.equal(migrationBadge('ANNULEE'), 'RETIRE');
    assert.equal(lineBadge('ECHEC'), 'ECHEC');
    assert.equal(lineBadge('MIGRE'), 'ACTIF');
    assert.equal(migratedCopyFileName({ fileName: 'Registre 1950.bmp', mediaType: 'image/tiff' }), 'Registre 1950.tif');
    assert.equal(migratedCopyFileName({ fileName: 'scan', mediaType: 'image/png' }), 'scan.png');
    assert.equal(candidateText({ fileId: FILE, documentId: 'd', documentReference: 'DOC-1', mediaType: 'image/bmp', size: 2048, version: 2, role: 'MAITRE_CONSERVATION' }), 'DOC-1 — version 2, 2 Ko');
    assert.match(copyText({ id: 'c', fileId: FILE, fileName: 'a.bmp', mediaType: 'image/tiff', size: 1200, sha256: 'a'.repeat(64), width: 24, height: 16, converter: 'IMAGE_TO_TIFF/1',
        campaignReference: null, eventId: null, createdAt: '2026-10-15T09:00:00Z' }), /image\/tiff — 24 × 16 px/);
});
