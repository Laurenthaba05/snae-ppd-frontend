import test from 'node:test';
import assert from 'node:assert/strict';
import { failureLine, nonCompliantText, pdfaBadge, pdfaFailureText, pdfaRunText, pdfaSummaryText, profileLabel, profileModeText } from '../.test-build/pdfaValidation.js';

test('Le bilan dit combien de PDF sont conformes, non conformes, non analysables et restants', () => {
    assert.equal(pdfaSummaryText({ eligible: 0, validated: 0, compliant: 0, nonCompliant: 0, unreadable: 0, pending: 0 }), 'Aucun PDF validé à contrôler dans ce périmètre.');
    assert.equal(pdfaSummaryText({ eligible: 12, validated: 11, compliant: 8, nonCompliant: 2, unreadable: 1, pending: 1 }),
        'Sur 12 PDF : 8 conformes, 2 non conformes, 1 non analysable. 1 reste à valider.');
    assert.equal(pdfaSummaryText({ eligible: 1, validated: 1, compliant: 1, nonCompliant: 0, unreadable: 0, pending: 0 }), 'Sur 1 PDF : 1 conforme.');
    assert.equal(pdfaSummaryText({ eligible: 3, validated: 0, compliant: 0, nonCompliant: 0, unreadable: 0, pending: 3 }), 'Sur 3 PDF. 3 restent à valider.');
});

test('Le bilan d’un passage dit ce qui reste et pourquoi des fichiers ont échoué', () => {
    assert.equal(pdfaRunText({ processed: 0, compliant: 0, nonCompliant: 0, unreadable: 0, failed: 0, failures: [], remaining: 0 }), 'Rien à valider : tous les PDF l’ont été.');
    assert.equal(pdfaRunText({ processed: 0, compliant: 0, nonCompliant: 0, unreadable: 0, failed: 0, failures: [], remaining: 4 }), 'Aucun fichier n’a pu être traité.');
    const text = pdfaRunText({ processed: 4, compliant: 2, nonCompliant: 1, unreadable: 0, failed: 1, failures: ['PDFA_TIMEOUT'], remaining: 6 });
    assert.match(text, /4 fichiers traités : 2 conformes, 1 non conforme, 0 non analysable/);
    assert.match(text, /1 en échec \(le validateur n’a pas répondu à temps\)/);
    assert.match(text, /6 restent à valider : relancez un passage\./);
    assert.match(pdfaRunText({ processed: 1, compliant: 1, nonCompliant: 0, unreadable: 0, failed: 0, failures: [], remaining: 0 }), /Plus aucun PDF à valider\./);
});

test('Les codes d’échec se lisent, un code inconnu reste tel quel', () => {
    assert.equal(pdfaFailureText('PDFA_TOOL_FAILED'), 'le validateur a échoué');
    assert.equal(pdfaFailureText('AUTRE_CODE'), 'AUTRE_CODE');
});

test('Les profils, règles échouées et pastilles', () => {
    assert.equal(profileLabel('2b', 'PDF/A-2b validation profile'), 'PDF/A-2b');
    assert.equal(profileLabel('ua1', 'PDF/UA-1 validation profile'), 'PDF/UA-1');
    assert.equal(profileLabel('aucun', null), 'Aucun profil (fichier illisible)');
    assert.equal(profileLabel('2b', null), '2b');
    assert.equal(failureLine({ specification: 'ISO 19005-2:2011', clause: '6.6.2.1', testNumber: 1, description: 'd', failedChecks: 1, message: null }), '6.6.2.1 (ISO 19005-2:2011) — 1 contrôle');
    assert.equal(failureLine({ specification: null, clause: '6.1.2', testNumber: 1, description: 'd', failedChecks: 3, message: null }), '6.1.2 — 3 contrôles');
    assert.equal(pdfaBadge('CONFORME'), 'ACTIF');
    assert.equal(pdfaBadge('NON_CONFORME'), 'ECHEC');
    assert.equal(pdfaBadge('NON_ANALYSABLE'), 'BROUILLON');
});

test('Le mode de profil dit contre quoi chaque PDF est jugé', () => {
    assert.match(profileModeText({ flavour: '0', defaultFlavour: '2b' }), /qu’il déclare .* PDF\/A-2b/);
    assert.match(profileModeText({ flavour: '1b', defaultFlavour: '2b' }), /même profil, imposé par la configuration : 1b/);
});

test('Un PDF non conforme se décrit par son document, son profil et ce qu’il déclare', () => {
    const base = { fileId: 'f', documentId: 'd', documentReference: 'DOC-1', profileCode: '2b', profileName: 'PDF/A-2b validation profile', declaration: null, failedRules: 2, verifiedAt: '2026-10-15T09:00:00Z' };
    assert.match(nonCompliantText(base), /^DOC-1 : PDF\/A-2b, ne déclare aucun profil — 2 règles échouées \(/);
    assert.match(nonCompliantText({ ...base, declaration: 'PDF/A-1b', failedRules: 1 }), /^DOC-1 : PDF\/A-2b, déclare PDF\/A-1b — 1 règle échouée \(/);
});
