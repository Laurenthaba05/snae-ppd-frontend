import test from 'node:test';
import assert from 'node:assert/strict';
import {
    emptyProfileForm, isImageFile, isPdfFile, mixFileName, normalizeCode, pdfaRows, profilePayload, profileProblems, requirementLines, resolutionText, technicalRows
} from '../.test-build/scanProfiles.js';

const valid = () => ({ ...emptyProfileForm(), code: 'num_400', name: 'Numérisation des registres', ppiMin: '400' });

test('Un profil exige un code, un nom, une résolution et une profondeur valides', () => {
    assert.deepEqual(profileProblems(valid()), []);
    assert.equal(profileProblems({ ...valid(), code: '1abc' }).length, 1);
    assert.equal(profileProblems({ ...valid(), code: 'a-b' }).length, 1);
    assert.equal(profileProblems({ ...valid(), name: '  ' }).length, 1);
    assert.equal(profileProblems({ ...valid(), ppiMin: '10' }).length, 1);
    assert.equal(profileProblems({ ...valid(), ppiMin: '300,5' }).length, 1);
    assert.equal(profileProblems({ ...valid(), ppiMin: '10000' }).length, 1);
    assert.equal(profileProblems({ ...valid(), bitsMin: 12 }).length, 1);
    assert.equal(profileProblems({ ...valid(), description: 'x'.repeat(2001) }).length, 1);
});

test('Le code est envoyé en majuscules, comme le serveur le garde', () => {
    assert.equal(normalizeCode(' num_400 '), 'NUM_400');
    const body = profilePayload({ ...valid(), colorModes: ['RGB'], formats: ['image/tiff'], lossless: true, description: ' ', source: ' Directive 2026 ' }, 'inst-1');
    assert.equal(body.code, 'NUM_400');
    assert.equal(body.ppiMin, 400);
    assert.equal(body.description, null);
    assert.equal(body.source, 'Directive 2026');
    assert.equal(body.institutionId, 'inst-1');
    assert.deepEqual(body.colorModes, ['RGB']);
    assert.equal(profilePayload(valid(), null).institutionId, null);
});

test('Les exigences se lisent en phrases, dans l’ordre où on les juge', () => {
    assert.deepEqual(requirementLines({ ppiMin: 300, bitsMin: 8, colorModes: [], formats: [], lossless: false, iccRequired: false }),
        ['Résolution d’au moins 300 ppp', 'Au moins 8 bits par composante']);
    const lines = requirementLines({ ppiMin: 600, bitsMin: 16, colorModes: ['RGB', 'GRAY'], formats: ['image/tiff', 'image/x-autre'], lossless: true, iccRequired: true });
    assert.deepEqual(lines, ['Résolution d’au moins 600 ppp', 'Au moins 16 bits par composante', 'Mode : Couleur (RVB), Niveaux de gris', 'Format : TIFF, image/x-autre',
        'Compression sans perte', 'Profil colorimétrique ICC embarqué']);
    assert.match(requirementLines({ ppiMin: 100, bitsMin: 1, colorModes: [], formats: [], lossless: false, iccRequired: false })[1], /1 bit par/);
});

test('La résolution et les caractéristiques disent ce qui manque au lieu de le supposer', () => {
    assert.equal(resolutionText({ ppiX: null, ppiY: null }), 'Non renseignée dans le fichier');
    assert.equal(resolutionText({ ppiX: 300, ppiY: 300 }), '300 ppp');
    assert.equal(resolutionText({ ppiX: 299.7, ppiY: 299.7 }), '299,7 ppp');
    assert.equal(resolutionText({ ppiX: 300, ppiY: 600 }), '300 × 600 ppp');
    const rows = Object.fromEntries(technicalRows({ format: 'TIFF', width: 4000, height: 3000, bitsPerSample: null, samples: 3, colorMode: 'RGB', compression: null, lossless: null,
        ppiX: null, ppiY: null, iccProfile: false }).map(r => [r.label, r.value]));
    assert.equal(rows['Dimensions'], '4000 × 3000 pixels');
    assert.equal(rows['Profondeur'], 'Non déterminée');
    assert.equal(rows['Résolution'], 'Non renseignée dans le fichier');
    assert.equal(rows['Profil ICC'], 'Aucun');
    assert.match(rows['Compression'], /Non compressé/);
    const lossy = Object.fromEntries(technicalRows({ format: 'JPEG', width: 10, height: 10, bitsPerSample: 8, samples: 3, colorMode: 'RGB', compression: 'JPEG', lossless: false,
        ppiX: 200, ppiY: 200, iccProfile: true }).map(r => [r.label, r.value]));
    assert.equal(lossy['Compression'], 'JPEG (avec perte)');
    assert.equal(lossy['Profil ICC'], 'Embarqué');
});

test('Seules les images ont des caractéristiques, et l’export MIX porte le nom du fichier', () => {
    assert.equal(isImageFile('image/tiff'), true);
    assert.equal(isImageFile('IMAGE/PNG'), true);
    assert.equal(isImageFile('application/pdf'), false);
    assert.equal(isImageFile(null), false);
    assert.equal(mixFileName('registre 1920 page 3.tif'), 'mix-registre 1920 page 3.xml');
    assert.equal(mixFileName('a/b:c.png'), 'mix-a-b-c.xml');
    assert.equal(mixFileName('.tif'), 'mix-image.xml');
});

test('Un PDF se reconnaît à son type, et sa déclaration PDF/A se lit sans rien supposer', () => {
    assert.equal(isPdfFile('application/pdf'), true);
    assert.equal(isPdfFile('Application/PDF; charset=binary'), true);
    assert.equal(isPdfFile('image/tiff'), false);
    assert.equal(isPdfFile(null), false);
    const declared = pdfaRows({ fileId: 'f', fileName: 'a.pdf', mediaType: 'application/pdf', size: 1, pdfVersion: '1.7', declared: true, label: 'PDF/A-1b', part: 1, conformance: 'B', encrypted: false,
        xmpFound: true, validated: false, extractedAt: '2026-10-12T00:00:00Z', notice: '' });
    const byLabel = Object.fromEntries(declared.map(r => [r.label, r.value]));
    assert.equal(byLabel['Déclaration PDF/A'], 'PDF/A-1b');
    assert.match(byLabel['Niveau'], /^B — /);
    assert.equal(byLabel['Métadonnées XMP'], 'présentes');
    assert.match(byLabel['Validation'], /non validée/);
    const none = Object.fromEntries(pdfaRows({ fileId: 'f', fileName: 'a.pdf', mediaType: 'application/pdf', size: 1, pdfVersion: null, declared: false, label: null, part: null, conformance: null,
        encrypted: true, xmpFound: false, validated: false, extractedAt: '2026-10-12T00:00:00Z', notice: '' }).map(r => [r.label, r.value]));
    assert.equal(none['Version du PDF'], 'non renseignée');
    assert.equal(none['Déclaration PDF/A'], 'aucune déclaration');
    assert.equal(none['Niveau'], '—');
    assert.match(none['Chiffrement'], /signalé/);
});
