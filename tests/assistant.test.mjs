import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_QUESTION, blocksOf, inlineOf, pageOf, safeRoute } from '../.test-build/assistant.js';

// L'assistant d'aide du personnel : l'écran où se trouve la personne, les seuls liens que la fenêtre ouvre, et l'affichage d'un texte libre du modèle sans jamais l'interpréter.

test('L’écran de la personne est le premier segment après /app, ou rien', () => {
    assert.equal(pageOf('/app/versements'), 'versements');
    assert.equal(pageOf('/app/versements/4f0e?x=1#haut'), 'versements');
    assert.equal(pageOf('/app/tableau-de-bord?bien=abc'), 'tableau-de-bord');
    assert.equal(pageOf('/app'), '');
    assert.equal(pageOf('/app/'), '');
    assert.equal(pageOf('/'), '');
    assert.equal(pageOf('/app/Versements'), '', 'un nom d’écran est en minuscules');
    assert.equal(pageOf('/app/' + 'a'.repeat(41)), '', 'trop long : rien n’est transmis');
    assert.equal(pageOf('/app/%2e%2e'), '');
});

test('Seule une adresse d’écran de l’application s’ouvre', () => {
    assert.equal(safeRoute('/app'), '/app');
    assert.equal(safeRoute('/app/documents'), '/app/documents');
    assert.equal(safeRoute('/app/circuits-validation'), '/app/circuits-validation');
    for (const bad of ['https://exemple.org', '//exemple.org', '/portail', '/app/', '/app/../secret', '/app/doc/uments', '/app/Documents', 'javascript:alert(1)', '/app/documents?x=1', '', '/app/' + 'a'.repeat(41)])
        assert.equal(safeRoute(bad), null, bad);
});

test('Le gras est lu, tout le reste reste du texte', () => {
    assert.deepEqual(inlineOf('Ouvrez **Documents** puis **Nouveau**.'), [
        { text: 'Ouvrez ', bold: false }, { text: 'Documents', bold: true }, { text: ' puis ', bold: false }, { text: 'Nouveau', bold: true }, { text: '.', bold: false }]);
    assert.deepEqual(inlineOf('sans balisage'), [{ text: 'sans balisage', bold: false }]);
    assert.deepEqual(inlineOf('Un gras **jamais fermé'), [{ text: 'Un gras **jamais fermé', bold: false }], 'un ** seul n’ouvre rien');
    assert.deepEqual(inlineOf('<script>alert(1)</script> [lien](http://x.y)'), [{ text: '<script>alert(1)</script> [lien](http://x.y)', bold: false }], 'ni HTML ni lien : du texte');
    assert.deepEqual(inlineOf(''), []);
});

test('Un texte du modèle devient des paragraphes, des listes et des titres en gras', () => {
    const blocks = blocksOf('Voici comment faire :\n\n1. Ouvrez **Versements**\n2) Cliquez sur Nouveau\n\n- une puce\n* une autre\n\n### Attention\nSuite\nde la phrase\r\n\r\nFin.');
    assert.deepEqual(blocks.map(b => b.kind), ['p', 'ol', 'ul', 'p', 'p', 'p']);
    assert.equal(blocks[1].items.length, 2);
    assert.deepEqual(blocks[1].items[0], [{ text: 'Ouvrez ', bold: false }, { text: 'Versements', bold: true }]);
    assert.equal(blocks[2].items.length, 2);
    assert.deepEqual(blocks[3].inline, [{ text: 'Attention', bold: true }], 'un titre est montré en gras, sans les #');
    assert.deepEqual(blocks[4].inline, [{ text: 'Suite de la phrase', bold: false }], 'des lignes qui se suivent forment un paragraphe');
    assert.deepEqual(blocksOf(''), []);
    assert.deepEqual(blocksOf('   \n\n  '), []);
});

test('Une liste qui change de nature ouvre une autre liste', () => {
    assert.deepEqual(blocksOf('- a\n1. b').map(b => b.kind), ['ul', 'ol']);
    assert.deepEqual(blocksOf('- a\ntexte\n- b').map(b => b.kind), ['ul', 'p', 'ul']);
});

test('La question est bornée comme le serveur la garde', () => {
    assert.equal(MAX_QUESTION, 1000);
});
