import test from 'node:test';
import assert from 'node:assert/strict';
import { ARCHIVAL_COLORS, ARCHIVAL_LABELS, CONFIDENTIALITY_COLORS, CONFIDENTIALITY_LABELS, OTHER_COLOR, PALETTE, RAMP_BLUE, RAMP_GREEN, RETENTION_COLORS, RETENTION_LABELS, STATUS_COLORS, slices } from '../.test-build/dashboard.js';

// Les couleurs des diagrammes : mêmes contrôles que le validateur de palettes de données (teintes catégorielles : clarté et chroma dans la bande, écart entre voisines pour les daltoniens et
// pour la vision normale, contraste d'au moins 3:1 sur fond blanc ; rampes ordonnées : clarté monotone, pas visibles, extrémité claire à 2:1 au moins). Une retouche de couleur qui dégrade
// l'un de ces points fait échouer ce test.
const SURFACE = '#ffffff';
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
const toLinear = c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const linear = hex => rgb(hex).map(toLinear);
const luminance = hex => { const [r, g, b] = linear(hex); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const oklab = ([r, g, b]) => {
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
};
const MACHADO = {
    protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
    deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]]
};
const simulate = (hex, kind) => { const v = linear(hex), M = MACHADO[kind]; return M.map(row => Math.max(0, Math.min(1, row[0] * v[0] + row[1] * v[1] + row[2] * v[2]))); };
const delta = (a, b, kind) => {
    const x = oklab(kind ? simulate(a, kind) : linear(a)), y = oklab(kind ? simulate(b, kind) : linear(b));
    return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};
const lightness = hex => oklab(linear(hex))[0];
const chroma = hex => Math.hypot(oklab(linear(hex))[1], oklab(linear(hex))[2]);

test('Les teintes des séries sont à la bonne clarté, assez colorées et contrastées sur fond blanc', () => {
    assert.equal(PALETTE.length, 6, 'six teintes au plus, jamais cyclées');
    for (const hex of PALETTE) {
        const L = lightness(hex);
        assert.ok(L >= 0.43 && L <= 0.77, `${hex} : clarté ${L.toFixed(3)} hors de la bande 0,43 à 0,77`);
        assert.ok(chroma(hex) >= 0.1, `${hex} : trop peu coloré (${chroma(hex).toFixed(3)}), il se lirait gris`);
        assert.ok(contrast(hex, SURFACE) >= 3, `${hex} : contraste ${contrast(hex, SURFACE).toFixed(2)}:1 sur fond blanc, moins de 3:1`);
    }
});

test('Deux teintes voisines se distinguent, en vision normale et pour les daltoniens', () => {
    for (let i = 0; i < PALETTE.length - 1; i++) {
        const [a, b] = [PALETTE[i], PALETTE[i + 1]];
        assert.ok(delta(a, b) >= 15, `${a} / ${b} : écart ${delta(a, b).toFixed(1)} en vision normale, moins de 15`);
        for (const kind of ['protan', 'deutan']) assert.ok(delta(a, b, kind) >= 8, `${a} / ${b} : écart ${delta(a, b, kind).toFixed(1)} (${kind}), moins de 8`);
    }
});

test('Les rampes ordonnées vont du clair au foncé, par pas visibles, et la plus claire se voit sur le fond', () => {
    for (const [name, ramp] of [['verte', RAMP_GREEN], ['bleue', RAMP_BLUE]]) {
        const L = ramp.map(lightness);
        for (let i = 1; i < L.length; i++) assert.ok(L[i - 1] - L[i] >= 0.06, `rampe ${name} : pas ${i} trop petit (${(L[i - 1] - L[i]).toFixed(3)})`);
        assert.ok(contrast(ramp[0], SURFACE) >= 2, `rampe ${name} : extrémité claire à ${contrast(ramp[0], SURFACE).toFixed(2)}:1, moins de 2:1`);
    }
});

test('Le cycle de vie et la confidentialité se lisent dans l’ordre de leurs étapes ; l’échéance dépassée est critique', () => {
    assert.deepEqual(['BROUILLON', 'ACTIF', 'SEMI_ACTIF', 'ARCHIVE_DEFINITIVE'].map(k => ARCHIVAL_COLORS[k]), RAMP_GREEN);
    assert.deepEqual(['PUBLIC', 'INTERNE', 'CONFIDENTIEL', 'SECRET'].map(k => CONFIDENTIALITY_COLORS[k]), RAMP_BLUE);
    assert.equal(ARCHIVAL_COLORS.ELIMINATION_APPROUVEE, STATUS_COLORS.warning);
    assert.equal(ARCHIVAL_COLORS.DETRUIT, OTHER_COLOR);
    assert.equal(RETENTION_COLORS.ECHEANCE, STATUS_COLORS.critical);
    assert.equal(RETENTION_COLORS.EN_DECISION, STATUS_COLORS.warning);
    for (const key of Object.keys(ARCHIVAL_LABELS)) assert.ok(ARCHIVAL_COLORS[key], `couleur manquante pour ${key}`);
    for (const key of Object.keys(CONFIDENTIALITY_LABELS)) assert.ok(CONFIDENTIALITY_COLORS[key], `couleur manquante pour ${key}`);
    for (const key of Object.keys(RETENTION_LABELS)) assert.ok(RETENTION_COLORS[key], `couleur manquante pour ${key}`);
});

test('Les parts reprennent la couleur de leur clé ; une clé sans couleur prend la teinte neutre, jamais une teinte de série', () => {
    const parts = slices({ SECRET: 2, PUBLIC: 5, INCONNU: 1 }, CONFIDENTIALITY_LABELS, undefined, CONFIDENTIALITY_COLORS);
    assert.deepEqual(parts.map(p => [p.key, p.color]), [['PUBLIC', RAMP_BLUE[0]], ['SECRET', RAMP_BLUE[3]], ['INCONNU', OTHER_COLOR]]);
    // sans table de couleurs : l'ordre des teintes catégorielles, comme avant
    assert.deepEqual(slices({ A: 1, B: 1 }, { A: 'a', B: 'b' }).map(p => p.color), [PALETTE[0], PALETTE[1]]);
});
