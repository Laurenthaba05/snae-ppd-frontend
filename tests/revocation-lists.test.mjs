import test from 'node:test';
import assert from 'node:assert/strict';
import { freshnessNote, listContent, listProblems, listScopeLabel } from '../.test-build/revocationLists.js';

const PEM = '-----BEGIN X509 CRL-----\nMIIB\n-----END X509 CRL-----';

test('La saisie d’une liste exige un libellé et une liste, refuse une clé privée et autre chose qu’une CRL', () => {
    assert.equal(listProblems('', '').length, 2);
    assert.deepEqual(listProblems('Autorité X, 15 octobre', PEM), []);
    assert.match(listProblems('X', '-----BEGIN PRIVATE KEY-----\nAA\n-----END PRIVATE KEY-----')[0], /clé privée/);
    assert.match(listProblems('X', '-----BEGIN CERTIFICATE-----\nAA\n-----END CERTIFICATE-----')[0], /n’est pas une liste de révocation/);
    assert.match(listProblems('X', PEM + '\n' + PEM)[0], /une seule liste/);
    assert.deepEqual(listProblems('X', 'MIIBabc+/=='), [], 'du base64 se dépose tel quel');
    assert.match(listProblems('x'.repeat(201), PEM)[0], /libellé/);
});

test('Une liste dont la prochaine mise à jour est passée le dit, une liste retirée n’a pas de note', () => {
    const now = new Date('2026-10-15T12:00:00Z');
    assert.equal(freshnessNote({ nextUpdate: '2026-10-20T00:00:00Z', status: 'ACTIF' }, now), null);
    assert.match(freshnessNote({ nextUpdate: '2026-10-01T00:00:00Z', status: 'ACTIF' }, now), /prochaine mise à jour est passée/);
    assert.match(freshnessNote({ nextUpdate: null, status: 'ACTIF' }, now), /n’indique pas de prochaine mise à jour/);
    assert.equal(freshnessNote({ nextUpdate: '2026-10-01T00:00:00Z', status: 'RETIRE' }, now), null);
    assert.equal(listScopeLabel({ institutionId: null }), 'Nationale');
    assert.equal(listScopeLabel({ institutionId: 'x' }), 'Institution');
});

test('Un fichier PEM reste du texte, un fichier DER binaire part en base64', () => {
    const pem = new TextEncoder().encode(PEM);
    assert.equal(listContent(pem), PEM);
    const der = new Uint8Array([0x30, 0x82, 0x01, 0x0a, 0xff, 0x00, 0x7f]);
    assert.equal(listContent(der), Buffer.from(der).toString('base64'));
});
