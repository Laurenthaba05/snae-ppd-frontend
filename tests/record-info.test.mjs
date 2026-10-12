import test from 'node:test';
import assert from 'node:assert/strict';
import {
    LANGUAGE_SUGGESTIONS, MAX_LEVEL, PID_ALPHABET, RELATION_TYPES, dossierBody, dossierProblems, extentText, extremeDates, formOfDossier, formOfInfo, groupRelations, infoBody, infoGaps, infoProblems,
    isValidPid, languageLabel, levelLabel, normalizePid, parseQuantity, pidCheckChar, relationLabel, relationProblems, volumetrySummary
} from '../.test-build/recordInfo.js';
import { formatDay } from '../.test-build/format.js';

test('L’identifiant pérenne : le caractère de contrôle est celui du serveur et de la base, et détecte une faute', () => {
    // mêmes valeurs que snae.pid_check_char et RecordInfoPolicy.pidCheckChar
    assert.equal(pidCheckChar('000000000000'), '0');
    assert.equal(pidCheckChar('000000000001'), 'd');
    assert.ok(isValidPid('snae-000000000001d'));
    const body = '4bhz9w0kqt3v', pid = 'snae-' + body + pidCheckChar(body);
    assert.ok(isValidPid(pid));
    for (let i = 5; i < 17; i++) {
        const other = [...PID_ALPHABET].find(c => c !== pid[i]);
        assert.ok(!isValidPid(pid.slice(0, i) + other + pid.slice(i + 1)), `caractère ${i} modifié`);
    }
    assert.ok(!isValidPid(pid.slice(0, 5) + pid[6] + pid[5] + pid.slice(7)), 'deux caractères permutés');
    assert.equal(normalizePid('  SNAE-000000000001D \n'), 'snae-000000000001d');
    for (const bad of [null, undefined, '', 'snae-', 'snae-000000000001', 'snae-000000000001e', 'snae-00000000000ad', 'ark:/12345/x']) assert.equal(normalizePid(bad), null, String(bad));
});

test('Les langues se nomment, et un code libre reste lisible', () => {
    assert.equal(languageLabel('fra'), 'Français');
    assert.equal(languageLabel('FUF'), 'Pular (peul)');
    assert.equal(languageLabel('xyz'), 'xyz');
    assert.equal(languageLabel(null), '');
    assert.ok(LANGUAGE_SUGGESTIONS.some(l => l.code === 'emk'));
});

const form = (over = {}) => ({ ...formOfInfo({}), reason: 'Inventaire', ...over });

test('Les informations d’archivage : chaque incohérence est nommée avant l’envoi', () => {
    assert.deepEqual(infoProblems(form()), []);
    assert.deepEqual(infoProblems(form({ language: 'fr-GN', extentQuantity: '12', extentUnit: 'PAGES', personalData: 'PRESENTES', sensitiveData: true, personalDataNature: 'Noms', essential: true, essentialReason: 'Titre' })), []);
    for (const bad of ['Français', 'f', 'fra eng', '1234']) assert.match(infoProblems(form({ language: bad }))[0], /^Langue/, bad);
    assert.match(infoProblems(form({ extentQuantity: '3' }))[0], /ET l’unité/);
    assert.match(infoProblems(form({ extentUnit: 'PAGES' }))[0], /ET l’unité/);
    assert.match(infoProblems(form({ extentQuantity: 'douze', extentUnit: 'PAGES' }))[0], /est un nombre/);
    assert.match(infoProblems(form({ extentQuantity: '-1', extentUnit: 'PAGES' }))[0], /négative/);
    assert.match(infoProblems(form({ extentQuantity: '1,2345', extentUnit: 'PAGES' }))[0], /trois décimales/);
    assert.match(infoProblems(form({ formerReferenceOrigin: 'Plan de 1985' }))[0], /suppose une ancienne cote/);
    assert.match(infoProblems(form({ sensitiveData: true }))[0], /données personnelles soient présentes/);
    assert.match(infoProblems(form({ personalData: 'AUCUNE', personalDataNature: 'Noms' }))[0], /que si elles sont présentes/);
    assert.match(infoProblems(form({ essential: true }))[0], /exige son motif/);
    assert.match(infoProblems(form({ essential: true, essentialReason: '  ' }))[0], /exige son motif/);
});

test('Le corps de la requête vide ce qui n’a pas de sens et normalise la saisie', () => {
    const body = infoBody(form({ language: ' FRA ', extentQuantity: '12,5', extentUnit: 'PAGES', formerReference: ' B/12 ', personalData: 'AUCUNE', sensitiveData: true, personalDataNature: 'Noms', essential: false, essentialReason: 'ancien' }), 4);
    assert.deepEqual(body, { expectedVersion: 4, language: 'fra', extentQuantity: 12.5, extentUnit: 'PAGES', formerReference: 'B/12', formerReferenceOrigin: null, personalData: 'AUCUNE',
        sensitiveData: false, personalDataNature: null, essential: false, essentialReason: null, reason: 'Inventaire' });
    const present = infoBody(form({ personalData: 'PRESENTES', sensitiveData: true, personalDataNature: ' Noms ', essential: true, essentialReason: ' Titre ' }), 0);
    assert.equal(present.sensitiveData, true); assert.equal(present.personalDataNature, 'Noms'); assert.equal(present.essentialReason, 'Titre');
    assert.ok(Number.isNaN(infoBody(form({ extentQuantity: 'x', extentUnit: 'PAGES' }), 0).extentQuantity));
    assert.equal(parseQuantity(' 12,5 '), 12.5); assert.equal(parseQuantity(''), null); assert.equal(parseQuantity('douze'), 'invalid');
});

test('Le formulaire reprend les informations du document, et dit ce qui reste à compléter', () => {
    const f = formOfInfo({ language: 'fra', extentQuantity: 12.5, extentUnit: 'PAGES', formerReference: 'B/12', personalData: 'PRESENTES', sensitiveData: true, essential: true, essentialReason: 'Titre' });
    assert.equal(f.extentQuantity, '12,5'); assert.equal(f.language, 'fra'); assert.equal(f.reason, '');
    assert.equal(extentText(12.5, 'PAGES'), '12,5 pages'); assert.equal(extentText(null, null), '');
    assert.deepEqual(infoGaps({}), ['la langue', 'l’étendue', 'les données personnelles']);
    assert.deepEqual(infoGaps({ language: 'fra', extentQuantity: 3, personalData: 'AUCUNE' }), []);
    assert.deepEqual(infoGaps({ language: 'fra', extentQuantity: 3, personalData: 'A_EVALUER' }), ['les données personnelles']);
});

test('Les relations se lisent dans les deux sens, rangées par nature', () => {
    assert.equal(relationLabel('REMPLACE', true), 'remplace'); assert.equal(relationLabel('REMPLACE', false), 'est remplacé par');
    for (const r of RELATION_TYPES) assert.notEqual(r.label, r.inverse, r.type);
    const rel = (id, label, type = 'RENVOI', outgoing = true) => ({ id, type, outgoing, label, other: { id: 'o' + id, reference: 'D-' + id, title: 't', persistentId: null, archivalStatus: 'ACTIF', destroyed: false }, comment: null, version: 0, createdAt: '' });
    const groups = groupRelations([rel('1', 'est cité par', 'RENVOI', false), rel('2', 'remplace', 'REMPLACE'), rel('3', 'remplace', 'REMPLACE'), rel('4', 'comprend', 'FAIT_PARTIE', false)]);
    assert.deepEqual(groups.map(g => [g.label, g.items.length]), [['remplace', 2], ['comprend', 1], ['est cité par', 1]]);
    assert.deepEqual(relationProblems('a', 'b', ''), []);
    assert.match(relationProblems('a', null, '')[0], /Choisissez/);
    assert.match(relationProblems('a', 'a', '')[0], /lui-même/);
    assert.match(relationProblems('a', 'b', 'x'.repeat(2001))[0], /limité/);
});

test('La structure d’un dossier : niveaux, dates extrêmes, étendue, volumétrie', () => {
    assert.deepEqual([1, 2, 3, 4, 8].map(levelLabel), ['Dossier', 'Sous-dossier', 'Sous-sous-dossier', 'Niveau 4', 'Niveau 8']);
    assert.equal(MAX_LEVEL, 8);
    const f = (over = {}) => ({ ...formOfDossier({}), reason: 'Inventaire', ...over });
    assert.deepEqual(dossierProblems(f()), []);
    assert.deepEqual(dossierProblems(f({ contentStartDate: '1960-01-01', contentEndDate: '1960-01-01' })), []);
    assert.match(dossierProblems(f({ contentStartDate: '2000-01-01', contentEndDate: '1999-12-31' }))[0], /précède/);
    assert.match(dossierProblems(f({ extentUnit: 'ML' }))[0], /ET l’unité/);
    assert.deepEqual(dossierBody(f({ producerId: ' p1 ', contentStartDate: '1960-01-01', extentQuantity: '2,5', extentUnit: 'ML' }), 3),
        { expectedVersion: 3, producerId: 'p1', contentStartDate: '1960-01-01', contentEndDate: null, extentQuantity: 2.5, extentUnit: 'ML', reason: 'Inventaire' });
    // les dates fixées par l'archiviste l'emportent ; sinon celles des documents, indiquées comme calculées
    const v = { computedStartDate: '1961-05-01', computedEndDate: '1972-03-09' };
    assert.deepEqual(extremeDates({ contentStartDate: '1950-01-01', contentEndDate: '1980-01-01' }, v), { start: '1950-01-01', end: '1980-01-01', computed: false });
    assert.deepEqual(extremeDates({ contentStartDate: null, contentEndDate: null }, v), { start: '1961-05-01', end: '1972-03-09', computed: true });
    assert.deepEqual(extremeDates({ contentStartDate: '1950-01-01', contentEndDate: null }, v), { start: '1950-01-01', end: '1972-03-09', computed: true });
    assert.deepEqual(extremeDates({ contentStartDate: null, contentEndDate: null }, null), { start: null, end: null, computed: false });
});

test('La volumétrie se résume en une phrase', () => {
    const v = (over = {}) => ({ subDossiers: 0, directSubDossiers: 0, documents: 0, directDocuments: 0, destroyedDocuments: 0, computedStartDate: null, computedEndDate: null, totalBytes: 0, ...over });
    assert.equal(volumetrySummary(v()), 'Ce dossier est vide.');
    assert.equal(volumetrySummary(v({ documents: 1 })), '1 document');
    assert.equal(volumetrySummary(v({ documents: 3, destroyedDocuments: 1, subDossiers: 2 })), '3 documents (dont 1 détruit) dans 2 sous-dossiers');
    assert.equal(volumetrySummary(v({ subDossiers: 1 })), 'aucun document dans 1 sous-dossier');
});

test('Les dates se lisent sans heure, partielles comprises', () => {
    assert.equal(formatDay('1960'), '1960');
    assert.match(formatDay('1960-05'), /mai 1960/);
    assert.match(formatDay('2026-10-09'), /9 oct\.? 2026/);
    assert.match(formatDay('2026-10-09T23:00:00Z'), /9 oct\.? 2026/);
    assert.equal(formatDay(null), '—'); assert.equal(formatDay(''), '—'); assert.equal(formatDay(undefined, 'inconnue'), 'inconnue');
    assert.equal(formatDay('pas une date'), 'Date invalide');
});
