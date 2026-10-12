import test from 'node:test';
import assert from 'node:assert/strict';
import {
    BORDEREAU_HEADERS, MAX_LINES, STAGES, actionsFor, agreementProblems, bordereauSheet, bordereauTemplate, controlEditable, controlProblem, dateIssue, duplicateReferences, emptyLineForm, formOfLine,
    formProblems, isFinal, lineBody, lineProblems, linesEditable, normalizeDate, outcome, parseBordereauTable, parseQuantity, plain, quantityText, receiveProblems, submitProblems, totals, volumeWarnings
} from '../.test-build/structuredIntake.js';

const line = (over = {}) => ({ reference: 'B-1', intitule: 'Registres', dateDebut: '1960', dateFin: '1970', quantite: 3.5, unite: 'ML', support: null, duaAnnees: null, sortFinal: null, observations: null, ...over });
const stored = (input, constat = null, quantiteConstatee = null, motifEcart = null) => ({ id: crypto.randomUUID(), rang: 1, input, constat, quantiteConstatee, motifEcart, version: 0 });
const agreement = (over = {}) => ({ statut: 'ACTIF', producteurId: 'p', institutionArchivesId: 'i', dateDebut: '2026-01-01', dateFin: '2026-12-31', volumePrevu: 10, uniteVolume: 'ML', reference: 'ACC-1', ...over });
const TODAY = '2026-10-09';

test('Le circuit : chaque étape propose ses actions, les étapes finales aucune', () => {
    assert.deepEqual(actionsFor('PREPARATION').map(a => a.action), ['submit', 'reject']);
    assert.deepEqual(actionsFor('SOUMIS').map(a => a.action), ['take', 'reject']);
    assert.deepEqual(actionsFor('EN_CONTROLE').map(a => a.action), ['accept', 'request-correction', 'reject']);
    assert.deepEqual(actionsFor('A_CORRIGER').map(a => a.action), ['submit', 'reject']);
    assert.deepEqual(actionsFor('ACCEPTE').map(a => a.action), ['receive', 'reject']);
    for (const stage of ['REJETE', 'RECU']) { assert.deepEqual(actionsFor(stage), []); assert.equal(isFinal(stage), true); }
    assert.equal(actionsFor('A_CORRIGER')[0].label, 'Soumettre à nouveau');
    assert.equal(actionsFor('PREPARATION')[0].label, 'Soumettre le bordereau');
    // un motif est exigé pour corriger et rejeter, jamais pour avancer
    for (const stage of STAGES) for (const a of actionsFor(stage)) assert.equal(a.needsMotif, a.action === 'reject' || a.action === 'request-correction', `${stage} ${a.action}`);
    assert.deepEqual(STAGES.filter(linesEditable), ['PREPARATION', 'A_CORRIGER']);
    assert.deepEqual(STAGES.filter(controlEditable), ['ACCEPTE']);
});

test('Une ligne : chaque défaut est nommé, un brouillon incomplet reste permis', () => {
    assert.deepEqual(lineProblems(line()), []);
    assert.deepEqual(lineProblems({ ...line(), dateDebut: null, dateFin: null, quantite: null, unite: null }), []);
    assert.deepEqual(lineProblems(line({ reference: ' ' })), ['La ligne : la référence est obligatoire.']);
    assert.deepEqual(lineProblems(line({ intitule: '' })), ['La ligne : l’intitulé est obligatoire.']);
    assert.match(lineProblems(line({ dateDebut: '1960-13' }), 'Ligne 4')[0], /^Ligne 4, date de début : date attendue/);
    assert.match(lineProblems(line({ dateFin: '1970-02-30' }))[0], /n’existe pas/);
    assert.match(lineProblems(line({ dateDebut: '1980', dateFin: '1970' }))[0], /dépasse/);
    assert.deepEqual(lineProblems(line({ dateDebut: '1970', dateFin: '1970-06' })), []);
    assert.match(lineProblems(line({ quantite: 3, unite: null }))[0], /ET l’unité/);
    assert.match(lineProblems(line({ quantite: null, unite: 'ML' }))[0], /ET l’unité/);
    assert.match(lineProblems(line({ unite: 'TONNES' }))[0], /unité inconnue/);
    assert.match(lineProblems(line({ quantite: -1 }))[0], /négative/);
    assert.match(lineProblems(line({ quantite: 1.2345 }))[0], /trois décimales/);
    assert.match(lineProblems(line({ quantite: 1e12 }))[0], /trop grande/);
    assert.match(lineProblems(line({ quantite: Number.NaN }))[0], /est un nombre/);
    assert.equal(lineProblems(line({ quantite: Number.NaN, unite: null })).length, 1);           // pas de bruit « quantité ET unité » en plus
    assert.match(lineProblems(line({ duaAnnees: 151 }))[0], /0 à 150/);
    assert.match(lineProblems(line({ sortFinal: 'DETRUIRE' }))[0], /sort final/);
    assert.deepEqual(lineProblems(line({ sortFinal: 'TRIER', duaAnnees: 10 })), []);
    // sans préfixe : la phrase se lit seule
    assert.deepEqual(lineProblems(line({ reference: '' }), ''), ['La référence est obligatoire.']);
    assert.match(lineProblems(line({ dateDebut: 'x' }), '')[0], /^Date de début : date attendue/);
});

test('Les dates partielles et réelles', () => {
    for (const ok of [null, '1960', '1960-05', '1960-05-12', '2024-02-29']) assert.equal(dateIssue(ok), null, String(ok));
    for (const bad of ['60', '1960-5', '1960-13', '1960-05-32', '2023-02-29', '0000', 'abcd']) assert.notEqual(dateIssue(bad), null, bad);
    assert.equal(normalizeDate('12/05/1960'), '1960-05-12');
    assert.equal(normalizeDate('5/1960'), '1960-05');
    assert.equal(normalizeDate('22048'), '1960-05-12');               // numéro de série Excel
    assert.equal(normalizeDate('1960'), '1960');                      // une année de 4 chiffres n'est jamais un numéro de série
    assert.equal(normalizeDate('  '), null);
    assert.equal(normalizeDate('vers 1960'), 'vers 1960');           // laissé tel quel : le contrôle le signalera
});

test('La volumétrie se totalise par unité, dans l’ordre de la norme, à trois décimales', () => {
    const t = totals([line({ reference: '1', quantite: 3.5 }), line({ reference: '2', quantite: 2, unite: 'BOITES' }), line({ reference: '3', quantite: 1.25 }), line({ reference: '4', quantite: 40, unite: 'GO' }), line({ reference: '5', quantite: null, unite: null })]);
    assert.deepEqual(t.map(x => [x.unite, x.quantite, x.lignes]), [['ML', 4.75, 2], ['GO', 40, 1], ['BOITES', 2, 1]]);
    assert.equal(totals([line({ quantite: 0.1 }), line({ reference: '2', quantite: 0.2 })])[0].quantite, 0.3);           // pas de 0.30000000000000004
    assert.deepEqual(totals([]), []);
    assert.equal(plain(12.5), '12,5'); assert.equal(plain(3), '3');
    assert.equal(quantityText(12.5, 'ML'), '12,5 mètres linéaires'); assert.equal(quantityText(null, null), '');
});

test('Les références en double se détectent sans tenir compte de la casse', () => {
    assert.deepEqual(duplicateReferences([line({ reference: 'A' }), line({ reference: 'B' })]), []);
    assert.deepEqual(duplicateReferences([line({ reference: 'A' }), line({ reference: ' a ' }), line({ reference: 'B' })]), ['A']);
});

test('La soumission exige les parties, des lignes datées et chiffrées, uniques', () => {
    const base = { producteurId: 'p', institutionArchivesId: 'i', lines: [line()], agreement: null, today: TODAY };
    assert.deepEqual(submitProblems(base), []);
    assert.deepEqual(submitProblems({ ...base, producteurId: null, institutionArchivesId: null, lines: [] }), ['Désignez le producteur du versement.', 'Désignez le service d’archives destinataire.', 'Le bordereau est vide : ajoutez au moins une ligne.']);
    const problems = submitProblems({ ...base, lines: [line(), { ...line({ reference: 'B-2' }), dateDebut: null, dateFin: null, quantite: null, unite: null }, line({ reference: 'b-1' })] });
    assert.ok(problems.includes('Ligne 2 : indiquez au moins une date.'));
    assert.ok(problems.includes('Ligne 2 : la quantité et l’unité sont obligatoires pour soumettre.'));
    assert.ok(problems.some(p => p.includes('« B-1 » apparaît plusieurs fois')));
    assert.ok(submitProblems({ ...base, lines: Array.from({ length: MAX_LINES + 1 }, (_, i) => line({ reference: 'R' + i })) }).some(p => p.includes('dépasse')));
});

test('L’accord doit être actif, en vigueur et conclu entre les mêmes parties', () => {
    assert.deepEqual(agreementProblems(agreement(), 'p', 'i', TODAY), []);
    assert.deepEqual(agreementProblems(agreement({ dateFin: null }), 'p', 'i', TODAY), []);
    assert.match(agreementProblems(agreement({ statut: 'PROJET' }), 'p', 'i', TODAY)[0], /en projet/);
    assert.match(agreementProblems(agreement({ statut: 'SUSPENDU' }), 'p', 'i', TODAY)[0], /suspendu/);
    assert.match(agreementProblems(agreement({ statut: 'CLOS' }), 'p', 'i', TODAY)[0], /clos/);
    assert.match(agreementProblems(agreement({ dateDebut: '2026-10-10' }), 'p', 'i', TODAY)[0], /ne commence que le 2026-10-10/);
    assert.match(agreementProblems(agreement({ dateFin: '2026-10-08' }), 'p', 'i', TODAY)[0], /a expiré/);
    assert.deepEqual(agreementProblems(agreement({ dateFin: TODAY }), 'p', 'i', TODAY), []);       // dernier jour inclus
    assert.match(agreementProblems(agreement(), 'autre', 'i', TODAY)[0], /autre producteur/);
    assert.match(agreementProblems(agreement(), 'p', 'autre', TODAY)[0], /autre service d’archives/);
    assert.ok(submitProblems({ producteurId: 'p', institutionArchivesId: 'i', lines: [line()], agreement: agreement({ statut: 'SUSPENDU' }), today: TODAY }).some(p => p.includes('suspendu')));
});

test('Dépasser le volume prévu avertit sans bloquer', () => {
    const t = totals([line({ quantite: 12 })]);
    assert.match(volumeWarnings(agreement(), t)[0], /12 mètres linéaires.*10 mètres linéaires/);
    assert.deepEqual(volumeWarnings(agreement({ volumePrevu: 12 }), t), []);
    assert.deepEqual(volumeWarnings(agreement({ uniteVolume: 'GO' }), t), []);
    assert.deepEqual(volumeWarnings(agreement({ volumePrevu: null, uniteVolume: null }), t), []);
    assert.deepEqual(volumeWarnings(null, t), []);
});

test('Le constat : un écart ou une absence s’explique, un conforme porte la quantité annoncée', () => {
    const declared = line({ quantite: 10 });
    const form = (constat, quantiteConstatee = '', motifEcart = '') => ({ constat, quantiteConstatee, motifEcart });
    assert.equal(controlProblem(declared, form('CONFORME')), null);
    assert.equal(controlProblem(declared, form('CONFORME', '10,000')), null);
    assert.match(controlProblem(declared, form('CONFORME', '9')), /déclarez un écart/);
    assert.match(controlProblem(declared, form('ECART', '9')), /Expliquez/);
    assert.equal(controlProblem(declared, form('ECART', '9', 'Une boîte manquante')), null);
    assert.match(controlProblem(declared, form('ABSENT')), /Expliquez/);
    assert.equal(controlProblem(declared, form('ABSENT', '', 'Introuvable')), null);
    assert.match(controlProblem(declared, form('ABSENT', '2', 'Introuvable')), /pas de quantité/);
    assert.equal(controlProblem(declared, form('ABSENT', '0', 'Introuvable')), null);
    assert.match(controlProblem(declared, form('ECART', 'abc', 'x')), /est un nombre/);
    assert.match(controlProblem(declared, form('ECART', '-1', 'x')), /négative/);
    assert.match(controlProblem(line({ quantite: null, unite: null }), form('ECART', '1', 'x')), /pas d’unité/);
});

test('On ne reçoit qu’un bordereau entièrement contrôlé, et le bilan compare l’annoncé au constaté', () => {
    assert.deepEqual(receiveProblems([]), ['Le bordereau est vide.']);
    assert.deepEqual(receiveProblems([stored(line(), 'CONFORME'), stored(line({ reference: '2' }))]), ['Une ligne n’a pas encore été contrôlée.']);
    assert.deepEqual(receiveProblems([stored(line()), stored(line({ reference: '2' }))]), ['2 lignes n’ont pas encore été contrôlées.']);
    assert.deepEqual(receiveProblems([stored(line(), 'CONFORME')]), []);
    const bilan = outcome([
        stored(line({ reference: '1', quantite: 10 }), 'CONFORME'),
        stored(line({ reference: '2', quantite: 5 }), 'ECART', 3, 'Deux registres abîmés'),
        stored(line({ reference: '3', quantite: 4 }), 'ABSENT', null, 'Introuvable'),
        stored(line({ reference: '4', quantite: 2, unite: 'BOITES' }), 'CONFORME'),
        stored(line({ reference: '5', quantite: 1, unite: 'GO' }))]);
    assert.deepEqual([bilan.conformes, bilan.ecarts, bilan.absents], [2, 1, 1]);
    assert.deepEqual(bilan.annonce.map(t => [t.unite, t.quantite]), [['ML', 19], ['GO', 1], ['BOITES', 2]]);
    assert.deepEqual(bilan.constate.map(t => [t.unite, t.quantite]), [['ML', 13], ['BOITES', 2]]);
});

test('Le formulaire d’une ligne se convertit sans perte et signale une quantité illisible', () => {
    const original = line({ support: 'papier', duaAnnees: 10, sortFinal: 'CONSERVER', observations: 'RAS' });
    assert.deepEqual(lineBody(formOfLine(original)), original);
    assert.deepEqual(formOfLine(line()).quantite, '3,5');
    assert.deepEqual(lineBody(emptyLineForm()), { reference: '', intitule: '', dateDebut: null, dateFin: null, quantite: null, unite: null, support: null, duaAnnees: null, sortFinal: null, observations: null });
    assert.equal(parseQuantity(' 12,5 '), 12.5); assert.equal(parseQuantity(''), null); assert.equal(parseQuantity('douze'), 'invalid');
    assert.ok(formProblems({ ...emptyLineForm(), reference: 'R', intitule: 'T', quantite: 'douze', unite: 'ML' }).some(p => /est un nombre/.test(p)));
    assert.deepEqual(formProblems({ ...emptyLineForm(), reference: 'R', intitule: 'T' }), []);
});

test('L’import d’un fichier : en-têtes reconnus, unités et dates normalisées, erreurs par ligne', () => {
    const table = [
        [...BORDEREAU_HEADERS],
        ['DAF/001', 'Registres de paie', '1960', '1965', '12,5', 'mètres linéaires', 'papier', '10', 'Conserver', 'RAS'],
        ['DAF/002', 'Photographies', '12/05/1970', '', '40', 'photos', '', '', 'éliminer', ''],
        ['', 'Sans référence', '', '', '', '', '', '', '', ''],
        ['DAF/004', 'Mauvaise unité', '1980', '', '3', 'tonnes', '', '', '', ''],
        ['daf/001', 'Doublon', '1990', '', '', '', '', '', '', ''],
        ['DAF/006', 'Quantité illisible', '1990', '', 'douze', 'ML', '', '', '', ''],
        ['DAF/007', 'Sort inconnu', '1990', '', '', '', '', '', 'détruire tout', '']
    ];
    const { rows, fatal } = parseBordereauTable(table);
    assert.equal(fatal, null);
    assert.equal(rows.length, 7);
    assert.deepEqual(rows[0].input, { reference: 'DAF/001', intitule: 'Registres de paie', dateDebut: '1960', dateFin: '1965', quantite: 12.5, unite: 'ML', support: 'papier', duaAnnees: 10, sortFinal: 'CONSERVER', observations: 'RAS' });
    assert.equal(rows[1].input.dateDebut, '1970-05-12'); assert.equal(rows[1].input.unite, 'PHOTOGRAPHIES'); assert.equal(rows[1].input.sortFinal, 'ELIMINER'); assert.equal(rows[1].input.quantite, 40);
    assert.deepEqual(rows[2].errors, ['La référence est obligatoire.']); assert.equal(rows[2].input, null);
    assert.deepEqual(rows[3].errors, ['Unité « tonnes » inconnue.']);                 // pas de « quantité ET unité » en plus
    assert.deepEqual(rows[4].errors, ['Référence déjà utilisée à la ligne 2.']);
    assert.ok(rows[5].errors.some(e => /est un nombre/.test(e)));
    assert.ok(rows[6].errors.some(e => /Sort final « détruire tout » inconnu/.test(e)));
    assert.deepEqual(rows.map(r => r.line), [2, 3, 4, 5, 6, 7, 8]);
});

test('L’import refuse un fichier sans colonnes obligatoires, vide, ou trop long', () => {
    assert.match(parseBordereauTable([['Nom', 'Autre'], ['a', 'b']]).fatal, /Référence, Intitulé/);
    assert.match(parseBordereauTable([[...BORDEREAU_HEADERS]]).fatal, /aucune ligne/);
    assert.match(parseBordereauTable([[...BORDEREAU_HEADERS], ...Array.from({ length: MAX_LINES + 1 }, (_, i) => ['R' + i, 'T'])]).fatal, /5000 au plus/);
    // des en-têtes d'un autre outil sont reconnus
    const { rows } = parseBordereauTable([['Cote', 'Titre', 'Dates extrêmes début', 'Dates extrêmes fin', 'Métrage', 'Unité de mesure'], ['C1', 'Titre', '1950', '1960', '2', 'ml']]);
    assert.deepEqual(rows[0].input && [rows[0].input.reference, rows[0].input.quantite, rows[0].input.unite], ['C1', 2, 'ML']);
});

test('Le modèle et l’export se génèrent', () => {
    for (const bytes of [bordereauTemplate(), bordereauSheet([stored(line(), 'ECART', 3, 'Manque')], true), bordereauSheet([], false)]) {
        assert.ok(bytes instanceof Uint8Array && bytes.length > 500);
        assert.equal(String.fromCharCode(bytes[0], bytes[1]), 'PK');
    }
});

test('L’accusé de réception reprend la volumétrie, les écarts expliqués, et protège les textes saisis', async () => {
    const { acknowledgementHtml } = await import('../.test-build/structuredIntake.js');
    const html = acknowledgementHtml({ reference: 'AR-2026-000001', date: '9 octobre 2026', numero: 'ENT-1', producteur: 'Ministère <des Finances>', serviceArchives: 'Archives nationales', accord: null,
        lines: [stored(line({ reference: 'R1', quantite: 10 }), 'CONFORME'), stored(line({ reference: 'R2', intitule: 'Registres & plans', quantite: 5 }), 'ECART', 3, 'Deux "registres" abîmés'), stored(line({ reference: 'R3', quantite: 4 }), 'ABSENT', null, 'Introuvable')] });
    assert.ok(html.includes('AR-2026-000001') && html.includes('ENT-1') && html.includes('Aucun'));
    assert.ok(html.includes('Ministère &lt;des Finances&gt;'));                         // jamais de balise injectée
    assert.ok(html.includes('Registres &amp; plans') && html.includes('Deux &quot;registres&quot; abîmés'));
    assert.ok(html.includes('19 mètres linéaires') && html.includes('13 mètres linéaires'));       // annoncé 10+5+4, constaté 10+3+0
    assert.ok(html.includes('3 lignes : 1 conforme, 1 écart, 1 absente'));
    assert.ok(!html.includes('<script'));
    const clean = acknowledgementHtml({ reference: 'AR-1', date: 'd', numero: 'E', producteur: 'P', serviceArchives: 'S', accord: 'ACC-1 · Accord', lines: [stored(line(), 'CONFORME')] });
    assert.ok(!clean.includes('Écarts et absences constatés') && clean.includes('ACC-1 · Accord') && clean.includes('1 ligne : 1 conforme, 0 écart, 0 absente'));
});
