import test from 'node:test';
import assert from 'node:assert/strict';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';
import { fileURLToPath } from 'node:url';
import { examplePdf } from './fixtures/multipage-pdf.mjs';

test('PDF.js extrait et rend trois vraies pages, avec zoom et ressources locales', async () => {
    const root = new URL('../node_modules/pdfjs-dist/', import.meta.url);
    const task = getDocument({ data: examplePdf(), enableXfa: false, stopAtErrors: true,
        standardFontDataUrl: fileURLToPath(new URL('standard_fonts/', root)).replaceAll('\\', '/'),
        cMapUrl: fileURLToPath(new URL('cmaps/', root)).replaceAll('\\', '/'), wasmUrl: fileURLToPath(new URL('wasm/', root)).replaceAll('\\', '/'),
        iccUrl: fileURLToPath(new URL('iccs/', root)).replaceAll('\\', '/') });
    try {
        const pdf = await task.promise;
        assert.equal(pdf.numPages, 3);
        const labels = ['Archive nationale - page 1', 'Patrimoine culturel - page 2', 'Fin du document - page 3'];
        for (const number of [1, 2, 3, 2]) {
            const page = await pdf.getPage(number);
            const text = await page.getTextContent();
            assert.ok(text.items.some(item => item.str === labels[number - 1]));
            for (const scale of [0.75, 1, 2]) {
                const viewport = page.getViewport({ scale });
                assert.equal(viewport.width, (400 + (number - 1) * 50) * scale);
                const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
                await page.render({ canvas, viewport }).promise;
                const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
                assert.ok(pixels.some((value, i) => i % 4 !== 3 && value < 100), `Visible content required on page ${number}, zoom ${scale}`);
            }
        }
    } finally { await task.destroy(); }
});

test('Un PDF corrompu est rejeté au lieu de produire un aperçu vide', async () => {
    const task = getDocument({ data: new TextEncoder().encode('not a PDF'), stopAtErrors: true });
    try { await assert.rejects(task.promise); } finally { await task.destroy(); }
});
