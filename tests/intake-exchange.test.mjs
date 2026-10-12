import test from 'node:test';
import assert from 'node:assert/strict';
import { blockerText, exchangeFileKind, integrationProblems, levelsAfter, reportText } from '../.test-build/intakeExchange.js';

test('Les niveaux qu’on peut créer suivent celui de la notice, jamais un fonds', () => {
    assert.deepEqual(levelsAfter('FONDS'), ['SOUS_FONDS', 'SERIE', 'SOUS_SERIE', 'DOSSIER', 'PIECE']);
    assert.deepEqual(levelsAfter('SERIE'), ['SOUS_SERIE', 'DOSSIER', 'PIECE']);
    assert.deepEqual(levelsAfter('PIECE'), []);
    assert.deepEqual(levelsAfter(null), []);
    assert.ok(!levelsAfter('SERIE').includes('FONDS'));
});

test('L’intégration exige une notice de rattachement et un niveau qui la suit', () => {
    assert.deepEqual(integrationProblems('p', 'SERIE', 'FONDS'), []);
    assert.equal(integrationProblems('', '', null).length, 2);
    assert.ok(integrationProblems('p', 'FONDS', 'SERIE').some(m => /doit suivre/.test(m)));
    assert.ok(integrationProblems('p', 'SERIE', 'SERIE').some(m => /doit suivre/.test(m)));
});

test('Le fichier d’échange est reconnu à son nom et chaque blocage a son texte', () => {
    assert.equal(exchangeFileKind('manifeste.XML'), 'xml');
    assert.equal(exchangeFileKind('paquet.zip'), 'zip');
    assert.equal(exchangeFileKind('bordereau.xlsx'), null);
    for (const code of ['INTEGRATION_NOT_RECEIVED', 'INTEGRATION_NO_ARCHIVES_SERVICE', 'INTEGRATION_PARENT_UNAVAILABLE', 'INTEGRATION_LEVEL_INVALID'])
        assert.ok(!/^[A-Z_]+$/.test(blockerText(code)), code);
    assert.ok(!blockerText('CODE_NOUVEAU').includes('CODE_NOUVEAU'));
});

test('Le compte rendu d’un paquet se dit en une phrase', () => {
    assert.equal(reportText({ units: 1, objects: 1, verified: 1 }), '1 unité reprise dans le bordereau ; 1 objet déclaré, dont 1 vérifié par empreinte.');
    assert.equal(reportText({ units: 12, objects: 30, verified: 28 }), '12 unités reprises dans le bordereau ; 30 objets déclarés, dont 28 vérifiés par empreinte.');
});
