import test from 'node:test';
import assert from 'node:assert/strict';
import { OBJECT_LABELS, authorityProblems, oaiProblemText, oaiSummary } from '../.test-build/dissemination.js';

test('L’autorité ARK exige un NAAN de 5 à 9 chiffres et un préfixe sans voyelle', () => {
    assert.deepEqual(authorityProblems('12345', ''), []);
    assert.deepEqual(authorityProblems('123456789', 'gn'), []);
    assert.equal(authorityProblems('1234', '').length, 1);
    assert.equal(authorityProblems('12a45', '').length, 1);
    assert.equal(authorityProblems('1234567890', '').length, 1);
    assert.equal(authorityProblems('12345', 'aeiou').length, 1);
    assert.equal(authorityProblems('12345', 'GNBCDFGHJ').length, 1);
    assert.deepEqual(authorityProblems('12345', ' GN '), []);
});

test('L’état du dépôt se dit en une phrase : fermé par l’exploitant, incomplet, ouvert', () => {
    assert.equal(oaiSummary({ enabled: false, configured: false, problems: [] }).problem, false);
    assert.match(oaiSummary({ enabled: false, configured: false, problems: [] }).text, /pas ouvert/);
    const incomplete = oaiSummary({ enabled: true, configured: false, problems: ['OAI_ADMIN_EMAIL_INVALID'] });
    assert.equal(incomplete.problem, true);
    assert.match(incomplete.text, /configuration est incomplète/);
    const open = oaiSummary({ enabled: true, configured: true, problems: [] });
    assert.equal(open.problem, false);
    assert.match(open.text, /Dublin Core/);
});

test('Chaque problème de configuration connu a un texte français, un code inconnu reste générique', () => {
    for (const code of ['OAI_REPOSITORY_IDENTIFIER_INVALID', 'OAI_REPOSITORY_NAME_REQUIRED', 'OAI_ADMIN_EMAIL_INVALID', 'OAI_PUBLIC_URL_INVALID'])
        assert.ok(!/^[A-Z_]+$/.test(oaiProblemText(code)), code);
    assert.ok(!oaiProblemText('CODE_NOUVEAU').includes('CODE_NOUVEAU'));
    assert.equal(OBJECT_LABELS.BIEN, 'Bien patrimonial');
});
