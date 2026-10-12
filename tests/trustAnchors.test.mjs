import test from 'node:test';
import assert from 'node:assert/strict';
import { anchorProblems, expiryNote, scopeLabel } from '../.test-build/trustAnchors.js';

const PEM = '-----BEGIN CERTIFICATE-----\nMIIBkTCB+wIJAKHBfpeg\n-----END CERTIFICATE-----';

test('Une ancre exige un libellé et un certificat PEM, jamais une clé privée', () => {
    assert.deepEqual(anchorProblems('Autorité racine', PEM), []);
    assert.equal(anchorProblems('', PEM).length, 1);
    assert.equal(anchorProblems('x'.repeat(201), PEM).length, 1);
    assert.equal(anchorProblems('Autorité', '').length, 1);
    assert.match(anchorProblems('Autorité', '-----BEGIN PRIVATE KEY-----\nMIIB\n-----END PRIVATE KEY-----')[0], /clé privée/);
    assert.match(anchorProblems('Autorité', 'pas un certificat')[0], /PEM/);
    assert.match(anchorProblems('Autorité', PEM + '\n' + PEM)[0], /un seul certificat/);
    assert.match(anchorProblems('Autorité', PEM + 'A'.repeat(20_001))[0], /volumineux/);
});

test('Le périmètre et l’expiration d’une ancre se disent en clair', () => {
    assert.equal(scopeLabel({ institutionId: null }), 'Nationale');
    assert.equal(scopeLabel({ institutionId: 'x' }), 'Institution');
    assert.equal(expiryNote({ expired: false, selfSigned: true, status: 'ACTIF' }), null);
    assert.match(expiryNote({ expired: true, selfSigned: true, status: 'ACTIF' }), /expiré/);
    assert.equal(expiryNote({ expired: true, selfSigned: true, status: 'RETIRE' }), null);
});
