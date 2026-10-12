import test from 'node:test';
import assert from 'node:assert/strict';
import { LABELS, display, elementName, fileName, formatBytes, formatNumber, humanize, isCodeLike, label, typo } from '../.test-build/format.js';

const nbsp = text => text.replace(/[  ]/g, ' ');

test('Un code technique se lit en toutes lettres, avec ses accents courants', () => {
    assert.equal(humanize('EN_COURS'), 'En cours');
    assert.equal(humanize('ETABLISSEMENT_PUBLIC'), 'Établissement public');
    assert.equal(humanize('DIRECTION_GENERALE'), 'Direction générale');
    assert.equal(humanize('A_VERIFIER'), 'À vérifier');
    assert.equal(humanize('A_PRENDRE_EN_CHARGE'), 'À prendre en charge');
    assert.equal(humanize('SITUATION_A_CLARIFIER'), 'Situation à clarifier');
    assert.equal(humanize('CONSERVER_DEFINITIVEMENT'), 'Conserver définitivement');
    assert.equal(humanize('PAPIER'), 'Papier');
    assert.equal(humanize('MOT_INCONNU'), 'Mot inconnu');
});

test('Un texte saisi par une personne reste tel quel ; seul un code est transformé', () => {
    assert.equal(isCodeLike('EN_COURS'), true); assert.equal(isCodeLike('PAPIER'), true); assert.equal(isCodeLike('Papier ancien'), false); assert.equal(isCodeLike('papier'), false); assert.equal(isCodeLike('A1'), true);
    assert.equal(display('Parchemin très abîmé'), 'Parchemin très abîmé');
    assert.equal(display('BON_ETAT'), 'Bon état');
    assert.equal(display(null), '—'); assert.equal(display(undefined), '—'); assert.equal(display(''), '—'); assert.equal(display(null, 'Non renseigné'), 'Non renseigné');
});

test('Les libellés d’un domaine connu priment ; hors domaine, le code est rendu lisible', () => {
    assert.equal(label('institutionType', 'ETABLISSEMENT_PUBLIC'), 'Établissement public');
    assert.equal(label('institutionType', 'MINISTERE'), 'Ministère');
    assert.equal(label('metadataType', 'TEXTE_LONG'), 'Texte long'); assert.equal(label('metadataType', 'BOOLEEN'), 'Oui / non');
    assert.equal(label('confidentiality', 'CONFIDENTIEL'), 'Confidentiel');
    assert.equal(label('workflowDomain', 'DOSSIER'), 'Dossier');
    assert.equal(label('outcome', 'SUCCES'), 'Succès'); assert.equal(label('outcome', 'ECHEC'), 'Échec');
    assert.equal(label('institutionType', 'NOUVEAU_TYPE'), 'Nouveau type');
    assert.equal(label('institutionType', null), '—');
    for (const domain of Object.keys(LABELS)) for (const text of Object.values(LABELS[domain])) assert.ok(!isCodeLike(text), text);
});

test('Une taille de fichier s’écrit à la française', () => {
    assert.equal(nbsp(formatBytes(0)), '0 o'); assert.equal(nbsp(formatBytes(842)), '842 o'); assert.equal(nbsp(formatBytes(1024)), '1 Ko');
    assert.equal(nbsp(formatBytes(1637226)), '1,6 Mo'); assert.equal(nbsp(formatBytes(1638400)), '1,6 Mo');
    assert.equal(nbsp(formatBytes(12.4 * 1024 * 1024)), '12,4 Mo'); assert.equal(nbsp(formatBytes(250 * 1024 * 1024)), '250 Mo');
    assert.equal(nbsp(formatBytes(3 * 1024 ** 3)), '3 Go');
    assert.equal(formatBytes(null), '—'); assert.equal(formatBytes(-1), '—'); assert.equal(formatBytes(NaN), '—');
    assert.ok(!formatBytes(1637226).includes('.'));
    assert.equal(nbsp(formatNumber(1234567)), '1 234 567'); assert.equal(formatNumber(NaN), '—');
});

test('Les apostrophes droites des messages du serveur deviennent typographiques', () => {
    assert.equal(typo("Aucun workflow actif n'est applicable à ce document."), 'Aucun workflow actif n’est applicable à ce document.');
    assert.equal(typo("L'opération a échoué : l'institution d'accueil"), 'L’opération a échoué : l’institution d’accueil');
    assert.equal(typo("Chargement..."), 'Chargement…');
    assert.equal(typo("'entre guillemets'"), "'entre guillemets'");
    assert.equal(typo('déjà ’bon’'), 'déjà ’bon’');
});

test('Un élément ou un fichier sans nom se désigne par son numéro, jamais par un bout d’identifiant', () => {
    assert.equal(elementName('Registre de 1908', 3), 'Registre de 1908');
    assert.equal(elementName('  ', 3), 'Élément n° 3'); assert.equal(elementName(null, 0), 'Élément n° 0'); assert.equal(elementName(null), 'Élément sans description'); assert.equal(elementName(undefined, null), 'Élément sans description');
    assert.equal(fileName(4), 'Page 4'); assert.equal(fileName(null), 'Fichier sans numéro de page'); assert.equal(fileName(0), 'Fichier sans numéro de page');
});
