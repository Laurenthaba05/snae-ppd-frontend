import test from 'node:test';
import assert from 'node:assert/strict';
import { ACT_LABELS, CHAIN_LABELS, sealFileName, sealHeadline, shortHash, verifyCommand } from '../.test-build/actSeals.js';

const sealed = (over = {}) => ({
    status: 'SEALED', signingEnabled: true,
    verification: { integrity: 'INTEGRITE_VALIDE', message: '', chain: 'NON_EVALUEE', chainMessage: null, chainAnchor: null, matchesCurrentFacts: true, ...over }
});

test('L’état d’un acte scellé se dit en clair : valide, modifié depuis, ou signature rompue', () => {
    assert.equal(sealHeadline(sealed()).tone, 'ok');
    assert.match(sealHeadline(sealed({ matchesCurrentFacts: false })).text, /ne sont plus ceux qui ont été scellés/);
    assert.equal(sealHeadline(sealed({ matchesCurrentFacts: false })).tone, 'warning');
    assert.match(sealHeadline(sealed({ integrity: 'INTEGRITE_INVALIDE' })).text, /ne correspond plus/);
    assert.equal(sealHeadline({ status: 'SEALED', signingEnabled: true, verification: null }).tone, 'warning');
});

test('Sans sceau, on dit pourquoi : pas achevé, scellement non activé, ou à sceller maintenant', () => {
    assert.match(sealHeadline({ status: 'NOT_SEALABLE', signingEnabled: true, verification: null }).text, /pas encore achevé/);
    assert.match(sealHeadline({ status: 'UNSEALED', signingEnabled: false, verification: null }).text, /n’est pas activé/);
    const pending = sealHeadline({ status: 'UNSEALED', signingEnabled: true, verification: null });
    assert.equal(pending.tone, 'warning');
    assert.match(pending.text, /scellé maintenant/);
});

test('Les fichiers à télécharger portent la référence de l’acte, sans caractère interdit', () => {
    assert.equal(sealFileName('CD-2026-000001', 'content'), 'acte-CD-2026-000001.txt');
    assert.equal(sealFileName('CD-2026-000001', 'signature'), 'acte-CD-2026-000001.txt.p7s');
    assert.equal(sealFileName('ART/2026 n°1', 'content'), 'acte-ART-2026-n-1.txt');
    assert.equal(sealFileName(null, 'signature'), 'acte-sans-reference.txt.p7s');
    assert.match(verifyCommand('AR-2026-000003'), /^openssl cms -verify -inform DER -in acte-AR-2026-000003\.txt\.p7s -content acte-AR-2026-000003\.txt -binary -noverify/);
});

test('Les libellés couvrent les trois actes et les verdicts de chaîne, et l’empreinte se raccourcit', () => {
    for (const type of ['CERTIFICAT_DESTRUCTION', 'ACCUSE_VERSEMENT', 'ACCUSE_TRANSFERT']) assert.ok(ACT_LABELS[type], type);
    for (const chain of ['NON_EVALUEE', 'VALIDE', 'NON_ANCREE', 'INVALIDE']) assert.ok(CHAIN_LABELS[chain] && !/^[A-Z_]+$/.test(CHAIN_LABELS[chain]), chain);
    assert.equal(shortHash('a'.repeat(64)), 'aaaaaaaa…aaaaaaaa');
    assert.equal(shortHash(null), '—');
});
