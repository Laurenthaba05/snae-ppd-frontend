import test from 'node:test';
import assert from 'node:assert/strict';
import { timestampFailure } from '../.test-build/timestamp.js';

test('Horodatage non mis en service : le code du serveur est expliqué, sans panne générale ni nouvelle tentative utile', () => {
    const f = timestampFailure('TIMESTAMPING_NOT_CONFIGURED');
    assert.equal(f.notConfigured, true);
    assert.match(f.text, /n’est pas activé sur ce serveur/);
    assert.match(f.text, /Ce n’est pas nécessaire pour clore le document/);
});

test('Autorité injoignable, refus, format inattendu ou preuve non vérifiable : chacun a son explication', () => {
    for (const code of ['TIMESTAMPING_UNAVAILABLE', 'TSA_REJECTED', 'TSA_CONTENT_TYPE_INVALID', 'TSA_CRYPTOGRAPHIC_VALIDATION_FAILED']) {
        const f = timestampFailure(code);
        assert.equal(f.notConfigured, false, code);
        assert.ok(f.text.length > 20, code);
    }
    assert.match(timestampFailure('TSA_CRYPTOGRAPHIC_VALIDATION_FAILED').text, /n’est pas enregistrée/);
});

test('Un autre code, ou aucun, n’est pas expliqué ici : l’erreur s’affiche telle quelle', () => {
    assert.equal(timestampFailure('VERSION_NOT_SEALED'), null);
    assert.equal(timestampFailure(null), null);
    assert.equal(timestampFailure(undefined), null);
    assert.equal(timestampFailure(''), null);
});
