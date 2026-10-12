import test from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, stageName, stageIndex, isTerminalStage, isWorkingStage, isCaptureStage, transitionLabel, splitOptions, sinceText, canWith, canAdvance, SEAL_NOTICE, shortHash, sealingSummary, sealingContextText } from '../.test-build/workflow.js';

const option = (vers, extra = {}) => ({ vers, permission: 'DIGITIZATION_SCAN', peutAgir: true, autorise: true, motifRequis: false, renvoi: false, blockers: [], ...extra });
const grant = permission => ({ user: { status: 'ACTIF', accountType: 'USER', id: 'u', institutionId: null, departmentId: null }, grants: [{ permission, scope: 'NATIONAL', institutionId: null, departmentId: null, expiresAt: null, roleCode: 'R', delegationId: null }] });

test('Les sept étapes du parcours suivent la maquette, dans l’ordre', () => {
    assert.deepEqual(STAGES.map(s => s.label), ['Réception du lot', 'Numérisation', 'OCR et indexation', 'Contrôle qualité', 'Métadonnées', 'Circuit de validation', 'Prêt pour versement']);
    assert.deepEqual(STAGES.map(s => stageIndex(s.status)), [0, 1, 2, 3, 4, 5, 6]);
    assert.equal(stageIndex('SUSPENDU'), -1);
    assert.equal(stageName('TERMINE'), 'Prêt pour versement');
    assert.equal(stageName('ANNULE'), 'Annulé');
});

test('Étapes terminales, de travail et de capture', () => {
    assert.ok(isTerminalStage('TERMINE') && isTerminalStage('ANNULE') && !isTerminalStage('SUSPENDU'));
    assert.ok(isWorkingStage('VALIDATION') && !isWorkingStage('SUSPENDU') && !isWorkingStage('TERMINE'));
    assert.ok(isCaptureStage('RECEPTION') && isCaptureStage('NUMERISATION') && !isCaptureStage('OCR_INDEXATION'));
});

test('Libellés des boutons : avancer, sauter l’OCR, renvoyer, suspendre, annuler, reprendre', () => {
    assert.equal(transitionLabel('NUMERISATION', 'OCR_INDEXATION'), 'Terminer la numérisation');
    assert.equal(transitionLabel('NUMERISATION', 'CONTROLE_QUALITE'), 'Passer sans OCR');
    assert.equal(transitionLabel('VALIDATION', 'TERMINE'), 'Valider : prêt pour versement');
    assert.equal(transitionLabel('CONTROLE_QUALITE', 'NUMERISATION'), 'Renvoyer vers « numérisation »');
    assert.equal(transitionLabel('VALIDATION', 'METADONNEES'), 'Renvoyer vers « métadonnées »');
    assert.equal(transitionLabel('OCR_INDEXATION', 'SUSPENDU'), 'Suspendre l’élément');
    assert.equal(transitionLabel('METADONNEES', 'ANNULE'), 'Annuler l’élément');
    assert.equal(transitionLabel('SUSPENDU', 'OCR_INDEXATION'), 'Reprendre : ocr et indexation');
});

test('Classement des passages : suivant, saut, renvois, suspension et annulation', () => {
    const split = splitOptions('NUMERISATION', [option('CONTROLE_QUALITE', { motifRequis: true }), option('OCR_INDEXATION'), option('SUSPENDU', { motifRequis: true }), option('ANNULE', { motifRequis: true })]);
    assert.equal(split.next.vers, 'OCR_INDEXATION');
    assert.deepEqual(split.skips.map(o => o.vers), ['CONTROLE_QUALITE']);
    assert.deepEqual(split.others.map(o => o.vers), ['SUSPENDU', 'ANNULE']);
    assert.equal(split.resume, null);
    const qc = splitOptions('CONTROLE_QUALITE', [option('METADONNEES'), option('NUMERISATION', { renvoi: true }), option('OCR_INDEXATION', { renvoi: true })]);
    assert.equal(qc.next.vers, 'METADONNEES');
    assert.deepEqual(qc.renvois.map(o => o.vers), ['NUMERISATION', 'OCR_INDEXATION']);
});

test('Un élément suspendu ne propose que la reprise et l’annulation', () => {
    const split = splitOptions('SUSPENDU', [option('NUMERISATION'), option('ANNULE', { motifRequis: true })]);
    assert.equal(split.next, null);
    assert.equal(split.resume.vers, 'NUMERISATION');
    assert.deepEqual(split.others.map(o => o.vers), ['ANNULE']);
});

test('Ancienneté dans l’étape en français', () => {
    const now = Date.parse('2026-10-10T12:00:00Z');
    assert.equal(sinceText(null, now), '');
    assert.equal(sinceText('pas une date', now), '');
    assert.equal(sinceText('2026-10-10T11:30:00Z', now), 'depuis moins d’une heure');
    assert.equal(sinceText('2026-10-10T07:00:00Z', now), 'depuis 5 h');
    assert.equal(sinceText('2026-10-09T10:00:00Z', now), 'depuis 1 jour');
    assert.equal(sinceText('2026-10-05T12:00:00Z', now), 'depuis 5 jours');
});

test('Habilitations : saisie par étape, et passage d’étape qui ne se déduit pas de la gestion seule', () => {
    assert.equal(canWith(grant('DIGITIZATION_QC'), 'DIGITIZATION_QC'), true);
    assert.equal(canWith(grant('DIGITIZATION_QC'), 'DIGITIZATION_OCR'), false);
    assert.equal(canWith(grant('DIGITIZATION_MANAGE'), 'DIGITIZATION_OCR'), true);
    assert.equal(canWith(null, 'DIGITIZATION_SCAN'), false);
    assert.equal(canAdvance(grant('DIGITIZATION_VALIDATE')), true);
    assert.equal(canAdvance(grant('DIGITIZATION_MANAGE')), false);
    assert.equal(canAdvance(null), false);
});

test('Scellement : résumé de la version, empreinte raccourcie et texte du journal', () => {
    const base = { versionId: 'v', numeroVersion: 2, scellee: true, empreinte: 'a'.repeat(64), dateScellement: null, pages: 12, fichiers: 12, ecartes: 0 };
    assert.equal(sealingSummary(base), 'Version n° 2 scellée : 12 pages');
    assert.equal(sealingSummary({ ...base, pages: 1, fichiers: 1, ecartes: 1 }), 'Version n° 2 scellée : 1 page, 1 fichier écarté');
    assert.equal(sealingSummary({ ...base, scellee: false, pages: 0, fichiers: 1, ecartes: 2 }), 'Version n° 2 à sceller : 1 fichier, 2 fichiers écartés');
    assert.equal(shortHash('0123456789abcdef0123'), '0123456789ab…');
    assert.equal(shortHash(null), '');
    assert.match(SEAL_NOTICE, /scelle la version/);
});

test('Scellement : le journal décrit le passage qui a scellé, et ignore les autres contextes', () => {
    const context = { scellement: { versionId: 'v', numeroVersion: 1, empreinte: 'f'.repeat(64), pages: 3, fichiers: 3, ecartes: 1 } };
    assert.equal(sealingContextText(context), 'Version n° 1 scellée : 3 pages, 1 fichier écarté (empreinte ffffffffffff…)');
    assert.equal(sealingContextText({}), null);
    assert.equal(sealingContextText(null), null);
    assert.equal(sealingContextText({ scellement: 'x' }), null);
    assert.equal(sealingContextText({ scellement: { numeroVersion: 'un' } }), 'Version n° 0 scellée : 0 fichier');
});
