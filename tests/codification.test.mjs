import test from 'node:test';
import assert from 'node:assert/strict';
import { KIND_LABELS, MODE_LABELS, PARENT_LABELS, STARTERS, patternOf, segmentLabel, segmentTypesFor, startersFor } from '../.test-build/codification.js';

// L'aperçu du modèle se lit comme celui du serveur : le texte fixe en majuscules, AAAA pour l'année, un numéro d'exemple pour le compteur.
test('Le modèle se lit en toutes lettres, comme le serveur le décrit', () => {
    assert.equal(patternOf([{ type: 'TEXTE', value: 'arc' }, { type: 'TEXTE', value: '-' }, { type: 'ANNEE' }, { type: 'TEXTE', value: '-' }, { type: 'COMPTEUR', digits: 4 }]), 'ARC-AAAA-0001');
    assert.equal(patternOf([{ type: 'PARENT' }, { type: 'TEXTE', value: '/' }, { type: 'COMPTEUR', digits: 3 }]), '{contenant}/001');
    assert.equal(patternOf([{ type: 'CLASSEMENT' }, { type: 'COMPTEUR', digits: 2 }]), '{classement}01');
    assert.equal(patternOf([]), '');
});

test('Un texte fixe vide ou entouré d’espaces ne laisse que son contenu utile', () => {
    assert.equal(patternOf([{ type: 'TEXTE', value: '  x ' }, { type: 'TEXTE', value: null }, { type: 'TEXTE' }, { type: 'COMPTEUR', digits: 1 }]), 'X1');
});

test('Le compteur est borné entre un et neuf chiffres, quatre par défaut', () => {
    assert.equal(patternOf([{ type: 'COMPTEUR' }]), '0001');
    assert.equal(patternOf([{ type: 'COMPTEUR', digits: 0 }]), '1');
    assert.equal(patternOf([{ type: 'COMPTEUR', digits: -3 }]), '1');
    assert.equal(patternOf([{ type: 'COMPTEUR', digits: 12 }]), '000000001');
    assert.equal(patternOf([{ type: 'COMPTEUR', digits: null }]), '0001');
});

test('La pièce « contenant » porte le nom de ce qu’elle désigne selon l’objet', () => {
    assert.equal(segmentLabel('PARENT', 'DOCUMENT'), 'Dossier du document');
    assert.equal(segmentLabel('PARENT', 'DOSSIER'), 'Dossier parent');
    assert.equal(segmentLabel('PARENT', 'NOTICE'), 'Notice parente');
    assert.equal(segmentLabel('TEXTE', 'NOTICE'), 'Texte fixe');
    assert.equal(segmentLabel('ANNEE', 'DOCUMENT'), 'Année');
    assert.equal(segmentLabel('CLASSEMENT', 'DOSSIER'), 'Code du classement');
    assert.equal(segmentLabel('COMPTEUR', 'DOCUMENT'), 'Compteur');
    assert.deepEqual(Object.keys(PARENT_LABELS).sort(), ['ARCHIVE_PHYSIQUE', 'DOCUMENT', 'DOSSIER', 'NOTICE']);
});

test('Les libellés couvrent chaque objet et chaque mode', () => {
    assert.deepEqual(Object.keys(KIND_LABELS).sort(), ['ARCHIVE_PHYSIQUE', 'DOCUMENT', 'DOSSIER', 'NOTICE']);
    assert.deepEqual(MODE_LABELS, { INDICATIF: 'Indicatif', OBLIGATOIRE: 'Obligatoire' });
});

test('Chaque modèle de départ a un compteur, au plus huit pièces, et annonce son aperçu réel', () => {
    assert.ok(STARTERS.length >= 3);
    for (const kind of ['DOCUMENT', 'DOSSIER', 'NOTICE']) {
        for (const starter of STARTERS) {
            const segments = starter.segments(kind);
            assert.ok(segments.length >= 1 && segments.length <= 8, starter.id);
            assert.ok(segments.some(s => s.type === 'COMPTEUR'), starter.id + ' : un compteur est nécessaire pour proposer la suite');
            assert.ok(starter.label.endsWith('(' + patternOf(segments) + ')'), starter.id + ' : le libellé annonce l’aperçu réel');
        }
    }
    assert.equal(new Set(STARTERS.map(s => s.id)).size, STARTERS.length);
});

test('Un modèle de départ ne partage pas ses pièces avec un autre appel', () => {
    const first = STARTERS[0].segments('DOCUMENT');
    first[0].value = 'MUTE';
    assert.equal(STARTERS[0].segments('DOCUMENT')[0].value, 'ARC');
});

// Une cote d'archive physique n'a ni contenant ni classement : le modèle ne contient que du texte, l'année et un compteur, et seuls les exemples qui ont un sens sont proposés.
test('la cote d’une archive physique ne propose ni contenant ni classement', () => {
    assert.deepEqual(segmentTypesFor('ARCHIVE_PHYSIQUE'), ['TEXTE', 'ANNEE', 'COMPTEUR']);
    assert.deepEqual(segmentTypesFor('DOCUMENT'), ['TEXTE', 'ANNEE', 'CLASSEMENT', 'PARENT', 'COMPTEUR']);
    assert.equal(KIND_LABELS.ARCHIVE_PHYSIQUE, 'Cotes des archives physiques');
    assert.deepEqual(startersFor('ARCHIVE_PHYSIQUE').map(s => s.id), ['annuel', 'simple']);
    assert.equal(startersFor('DOSSIER').length, STARTERS.length);
    for (const starter of startersFor('ARCHIVE_PHYSIQUE'))
        for (const segment of starter.segments('ARCHIVE_PHYSIQUE')) assert.ok(segmentTypesFor('ARCHIVE_PHYSIQUE').includes(segment.type), starter.id + ' : ' + segment.type);
});
