import test from 'node:test';
import assert from 'node:assert/strict';
import {
    agentBody, agentProblems, emptyAgentForm, emptyFormatForm, emptyRightForm, formatBody, formatProblems, isAtRisk, isMediaType, normalizeMediaType, premisFileName, relationProblems,
    requiresMotive, riskBadge, riskSummary, riskText, rightBody, rightProblems, evaluationProblems, oaisBadge, oaisGroups, oaisSummary, packageFileName, packageText
} from '../.test-build/preservationPlanning.js';

test('Le type de média se réduit à sa forme comparable et se contrôle', () => {
    assert.equal(normalizeMediaType(' Text/HTML; charset=utf-8 '), 'text/html');
    assert.equal(isMediaType('Application/PDF'), true);
    assert.equal(isMediaType('image/svg+xml'), true);
    for (const bad of ['pdf', 'application/', '/pdf', 'application pdf', '']) assert.equal(isMediaType(bad), false, bad);
});

test('Un format sans risque marqué, recommandé ou accepté n’exige pas de justification', () => {
    assert.equal(requiresMotive('FAIBLE', 'RECOMMANDE'), false);
    assert.equal(requiresMotive('MOYEN', 'ACCEPTE'), false);
    assert.equal(requiresMotive('FAIBLE', 'A_SURVEILLER'), true);
    assert.equal(requiresMotive('ELEVE', 'ACCEPTE'), true);
    assert.equal(isAtRisk('CRITIQUE', 'ACCEPTE'), true);
    assert.equal(isAtRisk('FAIBLE', 'OBSOLETE'), true);
    assert.equal(isAtRisk('MOYEN', 'A_SURVEILLER'), false);
    assert.equal(isAtRisk(null, null), false);
});

test('Un format se décrit complètement avant l’envoi, et le corps normalise le type de média', () => {
    const form = { ...emptyFormatForm(), mediaType: 'Image/TIFF; v=6', name: 'TIFF 6.0' };
    assert.deepEqual(formatProblems(form), []);
    const body = formatBody('inst-1', { ...form, extension: '.tif', target: 'image/jp2' });
    assert.equal(body.institutionId, 'inst-1');
    assert.equal(body.mediaType, 'image/tiff');
    assert.equal(body.extension, 'tif');
    assert.equal(body.targetMediaType, 'image/jp2');
    assert.equal(body.motive, null);
    assert.equal(formatBody('inst-1', { ...form, national: true }).institutionId, null);
    const risky = formatProblems({ ...form, risk: 'ELEVE', perennity: 'OBSOLETE', motive: 'court', target: 'image/tiff' });
    assert.ok(risky.some(p => /se justifie/.test(p)));
    assert.ok(risky.some(p => /doit différer/.test(p)));
    assert.ok(formatProblems({ ...form, mediaType: 'pdf', name: '' }).length === 2);
});

test('Le diagnostic se dit en une phrase : à migrer, non évalué, ou tout évalué', () => {
    assert.equal(riskSummary({ totalFiles: 0, evaluatedFiles: 0, unevaluatedFiles: 0, atRiskFiles: 0, atRiskBytes: 0 }).problem, false);
    const risky = riskSummary({ totalFiles: 10, evaluatedFiles: 7, unevaluatedFiles: 3, atRiskFiles: 2, atRiskBytes: 2048 });
    assert.equal(risky.problem, true);
    assert.match(risky.text, /2 fichiers \(2 Ko\) dans un format à risque ou obsolète : à migrer/);
    assert.match(risky.text, /3 fichiers dans un format non évalué/);
    const clean = riskSummary({ totalFiles: 4, evaluatedFiles: 4, unevaluatedFiles: 0, atRiskFiles: 0, atRiskBytes: 0 });
    assert.equal(clean.problem, false);
    assert.match(clean.text, /Les 4 fichiers conservés/);
});

test('Un format non inscrit est « non évalué », jamais présenté comme sans risque', () => {
    assert.equal(riskText(null, false), 'Non évalué');
    assert.equal(riskText('FAIBLE', true), 'Risque faible');
    assert.equal(riskBadge(null, false), 'NON_VALIDE');
    assert.equal(riskBadge('CRITIQUE', true), 'ECHEC');
    assert.equal(riskBadge('FAIBLE', true), 'ACTIF');
});

test('Un agent exige un nom et un type, le corps garde les champs vides en null', () => {
    assert.deepEqual(agentProblems(emptyAgentForm()), ['Le nom de l’agent est obligatoire.']);
    const body = agentBody('inst-1', { ...emptyAgentForm(), name: ' Convertisseur ', version: '2.1' });
    assert.deepEqual(body, { institutionId: 'inst-1', type: 'LOGICIEL', name: 'Convertisseur', version: '2.1', identifier: null, description: null });
});

test('Un droit exige base, acte et début, une période cohérente, et un motif s’il interdit', () => {
    const form = { ...emptyRightForm('2026-10-10'), basis: 'LICENCE', act: 'REPRODUIRE' };
    assert.deepEqual(rightProblems(form), []);
    assert.ok(rightProblems({ ...form, basis: '', act: '' }).length === 2);
    assert.ok(rightProblems({ ...form, endDate: '2026-01-01' }).some(p => /précède/.test(p)));
    assert.ok(rightProblems({ ...form, granted: false }).some(p => /motive|interdit/.test(p)));
    assert.deepEqual(rightProblems({ ...form, granted: false, restriction: 'Accord des ayants droit en attente' }), []);
    assert.equal(rightBody(form).endDate, null);
});

test('Une relation relie deux fichiers distincts avec un type, et l’export a un nom de fichier sûr', () => {
    assert.deepEqual(relationProblems('b', 'MIGRATION', 'a'), []);
    assert.ok(relationProblems('a', 'COPIE', 'a').some(p => /lui-même/.test(p)));
    assert.equal(relationProblems('', '', '').length, 3);
    assert.equal(premisFileName('DOC/2026 n°1'), 'premis-DOC_2026_n_1.xml');
});

const indicator = (code, domain, status, kind = 'AUTOMATIQUE') => ({ code, domain, title: code, description: '', kind, status, measure: null, justification: null, evaluatedById: null, evaluatedAt: null });

test('Les indicateurs se regroupent par fonction dans l’ordre du serveur et se résument en une phrase', () => {
    const d = {
        institutionId: 'i', generatedAt: '2026-10-10T00:00:00Z', total: 4, evaluated: 3, counts: { CONFORME: 1, PARTIEL: 1, NON_CONFORME: 1, A_EVALUER: 1 },
        indicators: [indicator('A', 'STOCKAGE', 'CONFORME'), indicator('B', 'ENTREE', 'PARTIEL'), indicator('C', 'STOCKAGE', 'NON_CONFORME'), indicator('D', 'ADMINISTRATION', 'A_EVALUER', 'DECLARATIF')]
    };
    const groups = oaisGroups(d);
    assert.deepEqual(groups.map(g => g.domain), ['STOCKAGE', 'ENTREE', 'ADMINISTRATION']);
    assert.equal(groups[0].title, 'Stockage archivistique');
    assert.deepEqual(groups[0].indicators.map(i => i.code), ['A', 'C']);
    assert.equal(oaisSummary(d), '3 indicateurs évalués sur 4 : 1 conforme, 1 partiel, 1 non conforme, 1 à évaluer.');
    assert.deepEqual(oaisGroups(null), []);
});

test('Une évaluation exige une valeur reconnue et une justification', () => {
    assert.deepEqual(evaluationProblems('CONFORME', 'Plan approuvé le 12 septembre'), []);
    assert.equal(evaluationProblems('', 'court').length, 2);
    assert.ok(evaluationProblems('EXCELLENT', 'Plan approuvé le 12 septembre').some(p => /évaluation/.test(p)));
    assert.equal(oaisBadge('A_EVALUER'), 'NON_VALIDE');
    assert.equal(oaisBadge('NON_CONFORME'), 'ECHEC');
});

test('Un paquet se nomme par son profil, sa référence et son jour, et se résume en clair', () => {
    assert.equal(packageFileName('DOC/2026 n°1', 'AIP', new Date('2026-10-10T12:00:00Z')), 'AIP-DOC_2026_n_1-20261010.zip');
    assert.equal(packageText({ files: 3, versions: 2, size: 2048 }), '3 fichiers, 2 versions, 2 Ko');
    assert.equal(packageText({ files: 1, versions: 1, size: 1024 }), '1 fichier, 1 version, 1 Ko');
});
