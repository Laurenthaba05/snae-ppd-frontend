import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESENCE_LABELS, PRESENCE_SHORT, CURRENT_LABELS, GAP_LABELS, GAP_NEXT_STEPS, EVENT_LABELS, gapLabel, worstGap, gapTone, placeText, dayText, ageText, placementSummary, eventSummary,
    emptyVerifyForm, verifyProblems, verifyBody, emptyRelocateForm, relocateProblems, relocateBody, locationPath, unitOptions } from '../.test-build/placement.js';
import { DISPONIBILITE_LABELS } from '../.test-build/heritageAssets.js';

const place = (cote, localisation = ['Magasin 1']) => ({ unitId: 'u-' + cote, cote, typeUnite: 'RAYONNAGE', localisation, actif: true });

test('Chaque écart a son libellé et ce qu’il demande de faire', () => {
    for (const gap of ['INTROUVABLE', 'AUTRE_EMPLACEMENT', 'SORTIE_EN_RETARD', 'NON_VERIFIEE', 'VERIFICATION_ANCIENNE']) {
        assert.ok(GAP_LABELS[gap], gap); assert.ok(GAP_NEXT_STEPS[gap], gap); assert.equal(gapLabel(gap), GAP_LABELS[gap]);
    }
    assert.equal(gapLabel('INCONNU'), 'INCONNU');
    assert.equal(PRESENCE_LABELS.PRESENTE, 'Présente à son emplacement habituel');
    assert.equal(PRESENCE_SHORT.ABSENTE, 'Introuvable');
    assert.equal(CURRENT_LABELS.CONSTATE_AILLEURS, 'Constatée à un autre emplacement');
    assert.equal(EVENT_LABELS.RANGEMENT, 'Rangement');
    assert.equal(DISPONIBILITE_LABELS.INTROUVABLE, 'Introuvable');
});

test('L’écart le plus grave passe en premier, et seuls les écarts qui exigent une action sont colorés', () => {
    assert.equal(worstGap([]), null);
    assert.equal(worstGap(['NON_VERIFIEE', 'SORTIE_EN_RETARD']), 'SORTIE_EN_RETARD');
    assert.equal(worstGap(['VERIFICATION_ANCIENNE', 'AUTRE_EMPLACEMENT', 'INTROUVABLE']), 'INTROUVABLE');
    assert.equal(gapTone('INTROUVABLE'), 'bad');
    assert.equal(gapTone('AUTRE_EMPLACEMENT'), 'warn');
    assert.equal(gapTone('SORTIE_EN_RETARD'), 'warn');
    assert.equal(gapTone('NON_VERIFIEE'), '');
    assert.equal(gapTone(null), '');
});

test('Un emplacement se lit par son chemin puis sa cote', () => {
    assert.equal(placeText(place('R-12', ['Archives nationales', 'Magasin 2', 'Travée 4'])), 'Archives nationales › Magasin 2 › Travée 4 · R-12');
    assert.equal(placeText(place('B-3', [])), 'B-3');
    assert.equal(placeText(null), '—');
});

test('Dates et ancienneté en toutes lettres', () => {
    assert.equal(dayText('2026-03-12T10:00:00Z'), '12 mars 2026');
    assert.equal(dayText(null), '—');
    assert.equal(dayText('pas une date'), '—');
    assert.equal(ageText(0), 'aujourd’hui');
    assert.equal(ageText(1), 'hier');
    assert.equal(ageText(12), 'il y a 12 jours');
    assert.equal(ageText(90), 'il y a 3 mois');
    assert.equal(ageText(400), 'il y a 13 mois');
    assert.equal(ageText(800), 'il y a 2 ans');
    assert.equal(ageText(null), '—');
    assert.equal(ageText(-3), '—');
});

const base = (extra = {}) => ({ actuel: { source: 'HABITUEL', unite: place('R-1'), destination: null, sortiLe: null, retourPrevu: null }, derniereVerification: null, ageVerificationJours: null, ecarts: [], ...extra });

test('La phrase d’emplacement dit où est l’archive et sur quoi on le fonde', () => {
    assert.match(placementSummary(base({ ecarts: ['NON_VERIFIEE'] })), /jamais été vérifiée/);
    assert.match(placementSummary(base({ ecarts: ['NON_VERIFIEE'], derniereVerification: { valide: false } })), /depuis son dernier déplacement/);
    assert.equal(placementSummary(base({ ageVerificationJours: 12, derniereVerification: { valide: true } })), 'À son emplacement habituel, présence vérifiée il y a 12 jours.');
    assert.equal(placementSummary(base({ actuel: { source: 'EN_SORTIE', unite: null, destination: null, sortiLe: '2026-10-01T10:00:00Z', retourPrevu: '2026-10-10T10:00:00Z' } })), 'Sortie de réserve, retour prévu le 10 octobre 2026.');
    assert.equal(placementSummary(base({ actuel: { source: 'EN_SORTIE', unite: null, destination: place('SALLE-1', ['Salle de lecture']), sortiLe: null, retourPrevu: null } })), 'Sortie de réserve vers Salle de lecture · SALLE-1.');
    assert.equal(placementSummary(base({ actuel: { source: 'CONSTATE_AILLEURS', unite: place('R-2') }, ageVerificationJours: 2 })), 'Constatée il y a 2 jours à un autre emplacement : Magasin 1 · R-2.');
    assert.equal(placementSummary(base({ actuel: { source: 'INTROUVABLE', unite: null }, ageVerificationJours: 0 })), 'Déclarée introuvable aujourd’hui.');
});

test('Un événement de l’historique tient en une ligne', () => {
    const event = (genre, extra = {}) => ({ id: 'e', genre, at: '2026-10-01T10:00:00Z', parId: null, par: null, de: null, vers: null, resultat: null, texte: null, retourPrevu: null, ...extra });
    assert.equal(eventSummary(event('VERIFICATION', { resultat: 'PRESENTE' })), 'Présente');
    assert.equal(eventSummary(event('VERIFICATION', { resultat: 'AUTRE_EMPLACEMENT', vers: place('R-2') })), 'Trouvée ailleurs : Magasin 1 · R-2');
    assert.equal(eventSummary(event('VERIFICATION', { resultat: 'ABSENTE' })), 'Introuvable');
    assert.equal(eventSummary(event('RANGEMENT', { de: place('R-1'), vers: place('R-2') })), 'De Magasin 1 · R-1 vers Magasin 1 · R-2');
    assert.equal(eventSummary(event('SORTIE')), 'Sortie de réserve');
    assert.equal(eventSummary(event('SORTIE', { vers: place('SALLE-1', ['Salle de lecture']) })), 'Sortie vers Salle de lecture · SALLE-1');
    assert.equal(eventSummary(event('RETOUR')), 'Retour en réserve');
    assert.equal(eventSummary(event('RETOUR', { vers: place('R-3') })), 'Retour, rangée à Magasin 1 · R-3');
});

test('Constat de présence : ce qui est constaté, où, et une note quand l’archive est introuvable', () => {
    const form = (patch) => ({ ...emptyVerifyForm(), ...patch });
    assert.equal(verifyProblems(form({}), 'u-1').length, 1);
    assert.deepEqual(verifyProblems(form({ resultat: 'PRESENTE' }), 'u-1'), []);
    assert.match(verifyProblems(form({ resultat: 'AUTRE_EMPLACEMENT' }), 'u-1')[0], /où l’archive a été trouvée/);
    assert.match(verifyProblems(form({ resultat: 'AUTRE_EMPLACEMENT', uniteConstateeId: 'u-1' }), 'u-1')[0], /choisissez « présente »/);
    assert.deepEqual(verifyProblems(form({ resultat: 'AUTRE_EMPLACEMENT', uniteConstateeId: 'u-2' }), 'u-1'), []);
    assert.match(verifyProblems(form({ resultat: 'ABSENTE', note: 'court' }), 'u-1')[0], /engage/);
    assert.match(verifyProblems(form({ resultat: 'ABSENTE', note: '         ' }), 'u-1')[0], /engage/);
    assert.deepEqual(verifyProblems(form({ resultat: 'ABSENTE', note: 'Cherchée sur toute la travée et en salle de tri' }), 'u-1'), []);
});

test('Le constat envoyé ne contient que ce qui a un sens', () => {
    const form = (patch) => ({ ...emptyVerifyForm(), ...patch });
    assert.deepEqual(verifyBody(form({ resultat: 'PRESENTE', uniteConstateeId: 'u-9', note: '  ' })), { resultat: 'PRESENTE' });
    assert.deepEqual(verifyBody(form({ resultat: 'PRESENTE', note: ' Vérifiée au récolement ' })), { resultat: 'PRESENTE', note: 'Vérifiée au récolement' });
    assert.deepEqual(verifyBody(form({ resultat: 'AUTRE_EMPLACEMENT', uniteConstateeId: 'u-2' })), { resultat: 'AUTRE_EMPLACEMENT', uniteConstateeId: 'u-2' });
    assert.deepEqual(verifyBody(form({ resultat: 'ABSENTE', uniteConstateeId: 'u-2', note: 'Cherchée partout dans le magasin' })), { resultat: 'ABSENTE', note: 'Cherchée partout dans le magasin' });
});

test('Rangement : un autre emplacement et un motif écrit', () => {
    const form = (patch) => ({ ...emptyRelocateForm(), ...patch });
    assert.equal(relocateProblems(form({}), 'u-1').length, 2);
    assert.match(relocateProblems(form({ uniteStockageId: 'u-1', motif: 'Réorganisation du magasin' }), 'u-1')[0], /déjà rangé/);
    assert.match(relocateProblems(form({ uniteStockageId: 'u-2', motif: 'court' }), 'u-1')[0], /au moins 10 caractères/);
    assert.deepEqual(relocateProblems(form({ uniteStockageId: 'u-2', motif: 'Réorganisation du magasin' }), 'u-1'), []);
    assert.equal(emptyRelocateForm('u-5').uniteStockageId, 'u-5');
    assert.deepEqual(relocateBody(form({ uniteStockageId: 'u-2', motif: '  Réorganisation du magasin  ', constaterPresence: false })), { uniteStockageId: 'u-2', motif: 'Réorganisation du magasin', constaterPresence: false });
});

test('Chemin d’une localisation : de la plus large à la plus fine, et protégé contre une boucle', () => {
    const locs = [{ id: 'a', parentId: null, libelle: 'Archives nationales' }, { id: 'b', parentId: 'a', libelle: 'Magasin 2' }, { id: 'c', parentId: 'b', libelle: 'Travée 4' }];
    const byId = new Map(locs.map(l => [l.id, l]));
    assert.deepEqual(locationPath('c', byId), ['Archives nationales', 'Magasin 2', 'Travée 4']);
    assert.deepEqual(locationPath('inconnue', byId), []);
    const loop = new Map([['x', { id: 'x', parentId: 'y', libelle: 'X' }], ['y', { id: 'y', parentId: 'x', libelle: 'Y' }]]);
    assert.equal(locationPath('x', loop).length, 20);
});

test('Les emplacements proposés sont actifs, étiquetés par leur chemin et triés', () => {
    const locations = [{ id: 'a', parentId: null, libelle: 'Magasin 2' }, { id: 'b', parentId: 'a', libelle: 'Travée 4' }];
    const unit = (id, cote, localisationId, statut = 'ACTIVE') => ({ id, cote, localisationId, statut, typeUnite: 'RAYONNAGE' });
    const options = unitOptions([unit('1', 'R-9', 'b'), unit('2', 'R-10', 'b'), unit('3', 'R-1', 'a'), unit('4', 'R-0', 'a', 'INACTIVE'), unit('5', 'R-5', 'b')], locations, ['5']);
    assert.deepEqual(options.map(o => o.label), ['Magasin 2 · R-1', 'Magasin 2 › Travée 4 · R-10', 'Magasin 2 › Travée 4 · R-9']);
    assert.deepEqual(options.map(o => o.id), ['3', '2', '1']);
});
