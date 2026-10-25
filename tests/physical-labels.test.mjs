import test from 'node:test';
import assert from 'node:assert/strict';
import { BARCODE_MAX, barcodeText, labelHtml, labelsDocument, parsePhysicalCode, physicalCode } from '../.test-build/physicalLabels.js';

// Les étiquettes : un QR qui désigne l'archive ou l'unité sans ambiguïté, un Code 128 qui porte la cote pour la douchette.
const ID = '8b1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

test('le code d’une archive ou d’une unité se construit et se relit, en majuscules ou non', () => {
    assert.equal(physicalCode('ARCHIVE', ID), 'SNAE:A:8B1F2C3D-4E5F-4A6B-8C7D-9E0F1A2B3C4D');
    assert.equal(physicalCode('UNIT', ID), 'SNAE:U:8B1F2C3D-4E5F-4A6B-8C7D-9E0F1A2B3C4D');
    assert.deepEqual(parsePhysicalCode('SNAE:A:8B1F2C3D-4E5F-4A6B-8C7D-9E0F1A2B3C4D'), { kind: 'ARCHIVE', id: ID });
    assert.deepEqual(parsePhysicalCode('  snae:u:' + ID + ' \n'), { kind: 'UNIT', id: ID });
    assert.throws(() => physicalCode('ARCHIVE', 'pas-un-uuid'), /UUID/);
});

test('ce qui n’est pas un code d’archive ou d’unité est une cote ordinaire', () => {
    assert.equal(parsePhysicalCode('DP-2015-001'), null);
    assert.equal(parsePhysicalCode('SNAE:E:' + ID), null, 'un code de numérisation n’est pas un code d’archive');
    assert.equal(parsePhysicalCode('SNAE:A:8B1F2C3D'), null, 'un identifiant tronqué ne désigne rien');
    assert.equal(parsePhysicalCode(''), null);
});

test('le Code 128 porte la cote sans accents, et rien quand elle ne s’y prête pas', () => {
    assert.equal(barcodeText('DP-2015-001'), 'DP-2015-001');
    assert.equal(barcodeText('  Élève/Œuvre 7 '), 'Eleve/OEuvre 7');
    assert.equal(barcodeText('日本語'), null);
    assert.equal(barcodeText(''), null);
    assert.equal(barcodeText('x'.repeat(BARCODE_MAX)), 'x'.repeat(BARCODE_MAX));
    assert.equal(barcodeText('x'.repeat(BARCODE_MAX + 1)), null, 'trop long pour des barres lisibles sur 70 mm');
});

test('une étiquette porte le QR, la cote, l’intitulé, le lieu et le Code 128', () => {
    const html = labelHtml({ kind: 'ARCHIVE', id: ID, cote: 'DP-2015-001', title: 'Dossier <Camara> & fils', place: 'Archives nationales › Salle 3 · BOITE-14' });
    assert.match(html, /<svg[^>]*aria-label="Code QR SNAE:A:8B1F2C3D/);
    assert.match(html, /<svg[^>]*aria-label="Code 128 DP-2015-001/);
    assert.match(html, /<p class="cote">DP-2015-001<\/p>/);
    assert.match(html, /Dossier &lt;Camara&gt; &amp; fils/, 'le texte saisi est échappé');
    assert.match(html, /Archives nationales › Salle 3 · BOITE-14/);
    assert.ok(!html.includes('<Camara>'));
});

test('sans Code 128 possible ou sans intitulé, l’étiquette reste complète', () => {
    const noBar = labelHtml({ kind: 'UNIT', id: ID, cote: 'BOÎTE-ÉTRANGÈRE-D-UNE-LONGUEUR-IMPOSSIBLE-1', title: null, place: 'Salle 3' });
    assert.match(noBar, /class="label unit"/);
    assert.ok(!noBar.includes('Code 128'), 'pas de Code 128 pour une cote trop longue');
    assert.match(noBar, /Code QR SNAE:U:/);
    assert.ok(!noBar.includes('class="title"'));
});

test('la planche regroupe les étiquettes en grille et échappe son titre', () => {
    const labels = [1, 2, 3].map(n => ({ kind: 'ARCHIVE', id: ID, cote: 'DP-' + n, title: null, place: 'Salle ' + n }));
    const doc = labelsDocument('Étiquettes <test>', labels);
    assert.match(doc, /^<!doctype html>/);
    assert.match(doc, /<title>Étiquettes &lt;test&gt;<\/title>/);
    assert.equal(doc.match(/<div class="label"/g).length, 3);
    assert.match(doc, /grid-template-columns:repeat\(3,70mm\)/);
});
