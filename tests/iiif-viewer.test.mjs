import test from 'node:test';
import assert from 'node:assert/strict';
import {
    MAX_ZOOM, baseRequest, baseSide, clampView, detailWidth, fitView, fitZoom, identifier, manifestFileName, matchWords, needsDetail, panBy, parseOcrPage, regionRequest, visibleRegion, zoomAt, zoomText
} from '../.test-build/iiifViewer.js';

const image = { width: 3000, height: 2000 };
const box = { width: 900, height: 600 };

test('L’ajustement fait tenir l’image entière et la centre', () => {
    assert.equal(fitZoom(image, box), 0.3);
    assert.deepEqual(fitView(image, box), { zoom: 0.3, cx: 1500, cy: 1000 });
    // une fenêtre plus étroite impose son côté
    assert.equal(fitZoom(image, { width: 300, height: 600 }), 0.1);
    assert.equal(fitZoom({ width: 0, height: 0 }, box), 1);
});

test('Le zoom reste entre l’ajustement et le maximum', () => {
    const fit = fitZoom(image, box);
    assert.equal(clampView({ zoom: 0.01, cx: 0, cy: 0 }, image, box).zoom, fit);
    assert.equal(clampView({ zoom: 50, cx: 1500, cy: 1000 }, image, box).zoom, MAX_ZOOM);
});

test('L’image entière reste centrée, une image agrandie ne sort pas de la fenêtre', () => {
    const fit = fitView(image, box);
    assert.deepEqual(clampView({ ...fit, cx: 10, cy: 10 }, image, box), fit, 'ajustée : centrée quoi qu’on demande');
    const zoomed = clampView({ zoom: 1, cx: 0, cy: 0 }, image, box);
    assert.equal(zoomed.cx, 450); assert.equal(zoomed.cy, 300, 'le coin haut-gauche de l’image touche le coin de la fenêtre');
    const far = clampView({ zoom: 1, cx: 99999, cy: 99999 }, image, box);
    assert.equal(far.cx, 3000 - 450); assert.equal(far.cy, 2000 - 300);
});

test('Déplacer l’image déplace le centre en sens inverse, à l’échelle du zoom', () => {
    const start = { zoom: 2, cx: 1500, cy: 1000 };
    const moved = panBy(start, 100, -50, image, box);
    assert.equal(moved.cx, 1450); assert.equal(moved.cy, 1025);
});

test('Le zoom autour d’un point garde le point de l’image sous le curseur', () => {
    const start = { zoom: 1, cx: 1500, cy: 1000 };
    const anchor = { x: 700, y: 150 };
    const before = { x: start.cx + (anchor.x - box.width / 2) / start.zoom, y: start.cy + (anchor.y - box.height / 2) / start.zoom };
    const next = zoomAt(start, 2, anchor, image, box);
    assert.equal(next.zoom, 2);
    const after = { x: next.cx + (anchor.x - box.width / 2) / next.zoom, y: next.cy + (anchor.y - box.height / 2) / next.zoom };
    assert.ok(Math.abs(after.x - before.x) < 0.001 && Math.abs(after.y - before.y) < 0.001, JSON.stringify({ before, after }));
    // on ne dépasse pas le maximum
    assert.equal(zoomAt({ zoom: 3.9, cx: 1500, cy: 1000 }, 10, anchor, image, box).zoom, MAX_ZOOM);
});

test('La zone visible est entière et bornée à l’image', () => {
    assert.deepEqual(visibleRegion({ zoom: 1, cx: 1500, cy: 1000 }, image, box), { x: 1050, y: 700, width: 901, height: 601 });
    const corner = visibleRegion({ zoom: 1, cx: 0, cy: 0 }, image, box);
    assert.equal(corner.x, 0); assert.equal(corner.y, 0);
    const edge = visibleRegion({ zoom: 1, cx: 3000, cy: 2000 }, image, box);
    assert.ok(edge.x + edge.width <= 3000 && edge.y + edge.height <= 2000, JSON.stringify(edge));
    assert.deepEqual(visibleRegion(fitView(image, box), image, box).x, 0);
});

test('Le détail n’est demandé que lorsque l’image de base manque de pixels', () => {
    // base : 1400 de côté sur 3000 → 0,4667 pixel de base par pixel d’image
    assert.equal(baseSide(image), 1400);
    assert.equal(needsDetail({ zoom: 0.3, cx: 0, cy: 0 }, image), false);
    assert.equal(needsDetail({ zoom: 0.46, cx: 0, cy: 0 }, image), false);
    assert.equal(needsDetail({ zoom: 0.8, cx: 0, cy: 0 }, image), true);
    // une petite image est déjà entière dans la base
    assert.equal(baseSide({ width: 800, height: 600 }), 800);
    assert.equal(needsDetail({ zoom: 1, cx: 0, cy: 0 }, { width: 800, height: 600 }), false);
    assert.equal(needsDetail({ zoom: 1.5, cx: 0, cy: 0 }, { width: 800, height: 600 }), true);
});

test('La largeur demandée suit l’affichage sans dépasser la région ni la limite', () => {
    assert.equal(detailWidth({ x: 0, y: 0, width: 900, height: 600 }, 1), 900);
    assert.equal(detailWidth({ x: 0, y: 0, width: 900, height: 600 }, 2), 900, 'jamais plus que la région : pas d’agrandissement');
    assert.equal(detailWidth({ x: 0, y: 0, width: 5000, height: 600 }, 1, 2), 2400);
    assert.equal(detailWidth({ x: 0, y: 0, width: 2000, height: 600 }, 0.5), 1000);
});

test('Les chemins suivent la syntaxe de l’API d’images', () => {
    const id = identifier('3f2c8b1e-0000-4000-8000-000000000001', 2);
    assert.equal(id, '3f2c8b1e-0000-4000-8000-000000000001-2');
    assert.equal(identifier('f', 0.4), 'f-1');
    assert.deepEqual(baseRequest(1400), { region: "full", size: "!1400,1400" });
    assert.deepEqual(regionRequest({ x: 10.7, y: 20, width: 300, height: 200 }, 600), { region: "10,20,300,200", size: "600," });
    assert.equal(manifestFileName("DOC 1/2"), "manifeste-iiif-DOC_1_2.json");
});

test('Le texte reconnu se lit dans une page d’annotations, les entrées illisibles sont ignorées', () => {
    const page = { items: [
        { body: { value: 'Bonjour' }, target: 'https://x/api/v1/iiif/id/canvas#xywh=20,40,100,24' },
        { body: { value: 'sans boîte' }, target: 'https://x/canvas' },
        { body: {}, target: 'https://x/canvas#xywh=1,2,3,4' },
        { body: { value: 'monde' }, target: 'https://x/canvas#xywh=140,40,80,24' }
    ] };
    assert.deepEqual(parseOcrPage(page), [{ text: 'Bonjour', x: 20, y: 40, width: 100, height: 24 }, { text: 'monde', x: 140, y: 40, width: 80, height: 24 }]);
    assert.deepEqual(parseOcrPage(null), []);
    assert.deepEqual(parseOcrPage({ items: 'x' }), []);
});

test('La recherche ignore la casse et les accents et borne le nombre de mots', () => {
    const words = [{ text: 'Décès', x: 0, y: 0, width: 1, height: 1 }, { text: 'naissance', x: 1, y: 0, width: 1, height: 1 }, { text: 'Registre', x: 2, y: 0, width: 1, height: 1 }];
    assert.deepEqual(matchWords(words, 'deces').map(w => w.text), ['Décès']);
    assert.deepEqual(matchWords(words, 'REGIS naiss').map(w => w.text), ['naissance', 'Registre']);
    assert.deepEqual(matchWords(words, 'a'), [], 'un terme d’une lettre ne cherche rien');
    assert.deepEqual(matchWords(words, '  '), []);
    const many = Array.from({ length: 50 }, (_, i) => ({ text: 'mot' + i, x: i, y: 0, width: 1, height: 1 }));
    assert.equal(matchWords(many, 'mot', 10).length, 10);
});

test('Le texte du zoom est relatif à l’ajustement', () => {
    assert.equal(zoomText({ zoom: 0.3, cx: 0, cy: 0 }, 0.3), '100 %');
    assert.equal(zoomText({ zoom: 0.6, cx: 0, cy: 0 }, 0.3), '200 %');
});
