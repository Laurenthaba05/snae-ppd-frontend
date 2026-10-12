import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMPAIGN_LABELS, ELEMENT_LABELS, RECOLEMENT_JOURNAL_LABELS, campaignLabel, campaignTone, isTerminal, recolementTransitionLabel, transitionTextLabel, transitionTextHint, transitionTextProblems, transitionBody,
    progressSegments, outcomeText, elementTone, postponeProblems, dateRangeText, emptyRecolementForm, formOf, recolementProblems, recolementBody, reportHtml } from '../.test-build/recolement.js';

const progress = (extra = {}) => ({ total: 8, verifies: 4, conformes: 2, autresEmplacements: 1, introuvables: 1, reportes: 1, restants: 3, traitesPourcent: 62, verifiesPourcent: 50, ...extra });

test('Étapes d’une campagne : libellés, tons et caractère terminal', () => {
    assert.equal(CAMPAIGN_LABELS.EN_COURS, 'En cours');
    assert.equal(ELEMENT_LABELS.REPORTE, 'Reporté');
    assert.equal(RECOLEMENT_JOURNAL_LABELS.TRANSITION, 'Passage');
    assert.equal(campaignLabel('CLOTUREE'), 'Clôturée');
    assert.equal(campaignLabel(null), '—');
    assert.equal(campaignTone('CLOTUREE'), 'ok');
    assert.equal(campaignTone('EN_COURS'), 'warn');
    assert.equal(campaignTone('ANNULEE'), 'bad');
    assert.equal(campaignTone('PLANIFIEE'), '');
    assert.equal(isTerminal('CLOTUREE'), true);
    assert.equal(isTerminal('ANNULEE'), true);
    assert.equal(isTerminal('EN_COURS'), false);
});

test('Passages : libellé vu de la personne qui agit, texte demandé, et corps envoyé', () => {
    assert.equal(recolementTransitionLabel('EN_COURS'), 'Lancer le récolement');
    assert.equal(recolementTransitionLabel('CLOTUREE'), 'Clôturer la campagne');
    assert.equal(recolementTransitionLabel('ANNULEE'), 'Annuler la campagne');
    assert.equal(transitionTextLabel('CLOTUREE'), 'Conclusion de la campagne');
    assert.equal(transitionTextLabel('ANNULEE'), 'Motif');
    assert.match(transitionTextHint('CLOTUREE'), /procès-verbal/);
    assert.deepEqual(transitionTextProblems({ vers: 'EN_COURS', motifRequis: false }, ''), []);
    assert.match(transitionTextProblems({ vers: 'CLOTUREE', motifRequis: true }, 'court')[0], /Conclusion de la campagne : un texte écrit d’au moins 10 caractères/);
    assert.equal(transitionTextProblems({ vers: 'ANNULEE', motifRequis: true }, '          ').length, 1);
    assert.deepEqual(transitionTextProblems({ vers: 'ANNULEE', motifRequis: true }, 'Périmètre mal défini, à reprendre'), []);
    assert.deepEqual(transitionBody('EN_COURS', 3, ''), { vers: 'EN_COURS', expectedVersion: 3 });
    assert.deepEqual(transitionBody('CLOTUREE', 4, '  Campagne terminée, un écart  '), { vers: 'CLOTUREE', expectedVersion: 4, texte: 'Campagne terminée, un écart' });
});

test('La barre d’avancement répartit chaque élément une fois, un report n’est pas une vérification', () => {
    const segments = progressSegments(progress());
    assert.deepEqual(segments.map(s => s.key), ['conformes', 'autres', 'introuvables', 'reportes', 'restants']);
    assert.deepEqual(segments.map(s => s.count), [2, 1, 1, 1, 3]);
    assert.deepEqual(segments.map(s => s.percent), [25, 12.5, 12.5, 12.5, 37.5]);
    assert.equal(segments.reduce((n, s) => n + s.count, 0), 8);
    assert.equal(segments.find(s => s.key === 'reportes').label, 'Reportées');
    assert.deepEqual(progressSegments(progress({ total: 0, verifies: 0, conformes: 0, autresEmplacements: 0, introuvables: 0, reportes: 0, restants: 0 })), []);
    assert.deepEqual(progressSegments(progress({ total: 3, conformes: 1, autresEmplacements: 0, introuvables: 0, reportes: 0, restants: 2 })).map(s => s.percent), [33.3, 0, 0, 0, 66.7]);
});

const place = cote => ({ unitId: 'u-' + cote, cote, typeUnite: 'RAYONNAGE', localisation: ['Magasin 1'], actif: true });
const element = (extra = {}) => ({ statut: 'A_VERIFIER', resultat: null, uniteConstatee: null, motifReport: null, enSortie: false, ...extra });

test('Ce qui a été fait d’un élément tient en une ligne', () => {
    assert.equal(outcomeText(element()), 'À vérifier');
    assert.match(outcomeText(element({ enSortie: true })), /Archive sortie : à reporter/);
    assert.equal(outcomeText(element({ statut: 'VERIFIE', resultat: 'PRESENTE' })), 'Présente');
    assert.equal(outcomeText(element({ statut: 'VERIFIE', resultat: 'ABSENTE' })), 'Introuvable');
    assert.equal(outcomeText(element({ statut: 'VERIFIE', resultat: 'AUTRE_EMPLACEMENT', uniteConstatee: place('R-2') })), 'Trouvée ailleurs : Magasin 1 · R-2');
    assert.equal(outcomeText(element({ statut: 'REPORTE', motifReport: 'Local inaccessible' })), 'Reporté : Local inaccessible');
});

test('Un constat conforme est en vert, un écart en alerte, un report en attente', () => {
    assert.equal(elementTone(element({ statut: 'VERIFIE', resultat: 'PRESENTE' })), 'ok');
    assert.equal(elementTone(element({ statut: 'VERIFIE', resultat: 'AUTRE_EMPLACEMENT' })), 'warn');
    assert.equal(elementTone(element({ statut: 'VERIFIE', resultat: 'ABSENTE' })), 'bad');
    assert.equal(elementTone(element({ statut: 'REPORTE' })), 'warn');
    assert.equal(elementTone(element()), '');
});

test('Un report exige un motif écrit', () => {
    assert.equal(postponeProblems('court').length, 1);
    assert.equal(postponeProblems('         ').length, 1);
    assert.deepEqual(postponeProblems('Archive sortie en consultation'), []);
});

test('Dates prévues en toutes lettres', () => {
    assert.equal(dateRangeText('2026-10-01', '2026-10-30'), 'Du 1 octobre 2026 au 30 octobre 2026');
    assert.equal(dateRangeText('2026-10-01', null), 'À partir du 1 octobre 2026');
    assert.equal(dateRangeText(null, '2026-10-30'), 'Jusqu’au 30 octobre 2026');
    assert.equal(dateRangeText(null, null), 'Dates non fixées');
});

test('Formulaire de campagne : libellé obligatoire, dates cohérentes, champs vides omis', () => {
    const form = patch => ({ ...emptyRecolementForm(), ...patch });
    assert.equal(recolementProblems(form({})).length, 1);
    assert.equal(recolementProblems(form({ libelle: '   ' })).length, 1);
    assert.deepEqual(recolementProblems(form({ libelle: 'Récolement 2026' })), []);
    assert.match(recolementProblems(form({ libelle: 'R', dateDebutPrevue: '2026-10-10', dateFinPrevue: '2026-10-01' }))[0], /doit suivre/);
    assert.deepEqual(recolementBody(form({ libelle: '  Récolement 2026  ', objet: '  ', localisationId: '' })), { libelle: 'Récolement 2026' });
    assert.deepEqual(recolementBody(form({ libelle: 'R', objet: 'Annuel', localisationId: 'l-1', dateDebutPrevue: '2026-10-01', dateFinPrevue: '2026-10-30' })),
        { libelle: 'R', objet: 'Annuel', localisationId: 'l-1', dateDebutPrevue: '2026-10-01', dateFinPrevue: '2026-10-30' });
    assert.deepEqual(formOf({ libelle: 'R', objet: null, localisationId: null, dateDebutPrevue: '2026-10-01', dateFinPrevue: null }), { libelle: 'R', objet: '', localisationId: '', dateDebutPrevue: '2026-10-01', dateFinPrevue: '' });
});

const campaign = { numero: 'REC-2026-000001', libelle: 'Récolement <annuel> & suites', objet: null, localisation: ['Archives', 'Magasin 2'], statut: 'CLOTUREE', lanceLe: '2026-10-01T09:00:00Z', clotureLe: '2026-10-20T16:00:00Z',
    clotureResume: 'Deux écarts constatés.\nÀ régulariser avant fin novembre.', dateDebutPrevue: '2026-10-01', dateFinPrevue: '2026-10-30' };
const withBien = (extra = {}) => ({ id: 'e', archiveId: 'a', cote: 'ARCH-001', support: null, etatPhysique: null, bienId: 'b', bienIdentifiant: 'PAT-000001', bienIntitule: 'Registre <1952>', habituel: place('R-1'), statut: 'VERIFIE',
    resultat: 'ABSENTE', verifieLe: '2026-10-05T10:00:00Z', verifiePar: null, uniteConstatee: null, note: 'Cherchée & fouillée', motifReport: null, traiteLe: null, enSortie: false, version: 1, ...extra });

test('Le procès-verbal imprimable échappe tout le texte et dit ce que sont devenus les écarts', () => {
    const html = reportHtml(campaign, { progres: progress(), ecarts: [{ element: withBien(), ouvert: true, ecartsActuels: ['INTROUVABLE'] }, { element: withBien({ id: 'f', cote: 'ARCH-002', resultat: 'AUTRE_EMPLACEMENT', uniteConstatee: place('R-2'), note: null }), ouvert: false, ecartsActuels: [] }],
        ecartsTotal: 3, ecartsOuverts: 1, reportes: [withBien({ id: 'g', cote: 'ARCH-003', statut: 'REPORTE', resultat: null, motifReport: 'Local <inaccessible>' })], reportesTotal: 1 });
    assert.match(html, /Procès-verbal de récolement REC-2026-000001/);
    assert.ok(html.includes('Récolement &lt;annuel&gt; &amp; suites'));
    assert.ok(!html.includes('<annuel>') && !html.includes('<1952>') && !html.includes('<inaccessible>'));
    assert.ok(html.includes('Archives › Magasin 2'));
    assert.ok(html.includes('Du 1 octobre 2026 au 30 octobre 2026'));
    assert.ok(html.includes('Écart encore ouvert'));
    assert.ok(html.includes('Régularisé depuis'));
    assert.ok(html.includes('Trouvée ailleurs : Magasin 1 · R-2'));
    assert.ok(html.includes('1 autre(s) écart(s) non listé(s).'));
    assert.ok(html.includes('Reporté : Local &lt;inaccessible&gt;') || html.includes('Local &lt;inaccessible&gt;'));
    assert.ok(html.includes('Deux écarts constatés.'));
    assert.ok(html.includes('Éléments vérifiés</th><td>50 %'));
    assert.ok(html.includes('Responsable du lancement') && html.includes('Responsable de la clôture'));
});

test('Procès-verbal sans écart ni report : il le dit, et une campagne sur toute l’institution aussi', () => {
    const html = reportHtml({ ...campaign, localisation: [], clotureResume: null }, { progres: progress({ introuvables: 0, autresEmplacements: 0 }), ecarts: [], ecartsTotal: 0, ecartsOuverts: 0, reportes: [], reportesTotal: 0 });
    assert.ok(html.includes('Aucun écart constaté.'));
    assert.ok(html.includes('Aucun élément reporté.'));
    assert.ok(html.includes('Toute l’institution'));
    assert.ok(!html.includes('<h2>Conclusion</h2>'));
});
