import test from 'node:test';
import assert from 'node:assert/strict';
import { NATURE_LABELS, STATUS_LABELS, STAGE_LABELS, STAGE_FILTERS, STAGE_NEXT_STEPS, natureLabel, statusLabel, stageLabel, isOpen, stageTone, lateText, periodText, valueText, timeline, sortieText, elementSummary,
    emptyDossierForm, dossierFormOf, dossierProblems, dossierBody, emptyTermsForm, termsFormOf, termsProblems, termsBody, emptyElementForm, elementFormOf, elementProblems, elementBody, elementUpdateBody,
    transitionLabel, transitionProblems, transitionBody, emptyProlongForm, prolongProblems, prolongBody, journalSummary, transportSheetHtml } from '../.test-build/dossiers.js';

const TODAY = '2026-10-05';
const flat = text => text.replace(/[  ]/g, ' ');
const element = (patch = {}) => ({ id: 'e1', bienId: 'b1', bienIdentifiant: 'PAT-000001', bienIntitule: 'Registre des naissances', archiveId: 'a1', cote: 'ARCH-001', valeurAssuree: 1500000, conditions: 'Vitrine climatisée', emplacement: 'Salle 2',
    sortie: null, constatDepart: null, constatRetour: null, obstacles: [], ...patch });
const sortie = (statut, patch = {}) => ({ id: 'm1', numero: 'MVT-2026-000001', statut, retourPrevu: '2027-01-14', enRetard: false, joursRetard: null, ...patch });
const report = { id: 'c1', contexte: 'AVANT_MOUVEMENT', constateLe: '2026-10-04', etat: 'STABLE', manipulation: 'LIBRE' };
const dossier = (patch = {}) => ({ id: 'd1', numero: 'PRE-2026-000001', nature: 'PRET', institutionId: 'i1', intitule: 'Prêt à l’université de Kankan', objet: 'Prêt pour une exposition de recherche', lieuNom: 'Université de Kankan', lieuAdresse: 'Campus',
    dateDebut: '2026-10-15', dateFin: '2027-01-14', retourPrevu: '2027-01-14', emprunteurNom: 'Université de Kankan', emprunteurContact: 'recteur@exemple.gn', commissaire: null,
    convention: { reference: 'CONV-2026-01', signeeLe: '2026-10-03', signataire: 'Le recteur' }, assurance: { assureur: 'Assurance Nationale', police: 'POL-77', du: '2026-10-04', au: '2027-02-01', exonerationMotif: null, devise: 'GNF' },
    transport: { mode: 'Camion climatisé', transporteur: 'Transports Kankan', convoyeur: 'Mamadou Bah', allerLe: '2026-10-14', retourLe: '2027-01-15', emballage: 'Caisse en bois' },
    statut: 'ACCEPTE', etape: 'A_PREPARER', creation: { parId: 'u1', par: 'Awa Camara', le: '2026-10-01T09:00:00Z' }, decision: { parId: 'u2', par: 'Mamadou Bah', le: '2026-10-02T09:00:00Z' }, decisionMotif: null, fermeture: null, fermeMotif: null,
    enRetard: false, joursRetard: null, prolongations: 0, valeurTotale: 1500000, elements: [element()], preparation: [], passages: [], peutModifier: false, peutCompleter: true, peutPreparer: true, peutProlonger: true, peutConstater: true,
    sortiesADemander: 1, version: 3, createdAt: '2026-10-01T09:00:00Z', ...patch });
const pretForm = (patch = {}) => ({ ...emptyDossierForm('PRET'), intitule: 'Prêt à l’université de Kankan', objet: 'Prêt pour une exposition de recherche', lieuNom: 'Université de Kankan', emprunteurNom: 'Université de Kankan',
    dateDebut: '2026-10-15', retourPrevu: '2027-01-14', ...patch });
const expoForm = (patch = {}) => ({ ...emptyDossierForm('EXPOSITION'), intitule: 'Mémoire de Kankan', objet: 'Exposition sur l’état civil colonial', lieuNom: 'Salle des fêtes', commissaire: 'Awa Camara',
    dateDebut: '2026-11-04', dateFin: '2027-01-03', retourPrevu: '2027-01-10', ...patch });

test('Les natures, les décisions et les étapes ont leurs libellés', () => {
    assert.equal(NATURE_LABELS.PRET, 'Prêt sortant'); assert.equal(natureLabel('EXPOSITION'), 'Exposition'); assert.equal(natureLabel(null), '—'); assert.equal(natureLabel('AUTRE'), 'AUTRE');
    assert.equal(STATUS_LABELS.EN_INSTRUCTION, 'En instruction'); assert.equal(statusLabel('CLOS'), 'Clos');
    assert.equal(STAGE_LABELS.EN_COURS, 'Originaux sortis'); assert.equal(stageLabel('A_CLORE'), 'À clore'); assert.equal(stageLabel(undefined), '—');
    assert.deepEqual(STAGE_FILTERS.slice(0, 2), [['OUVERTS', 'Dossiers ouverts'], ['EN_RETARD', 'En retard']]);
    assert.equal(STAGE_FILTERS.length, 2 + Object.keys(STAGE_LABELS).length);
    for (const stage of Object.keys(STAGE_LABELS)) assert.ok(STAGE_NEXT_STEPS[stage].length > 10, stage);
    assert.equal(isOpen('EN_INSTRUCTION'), true); assert.equal(isOpen('ACCEPTE'), true); assert.equal(isOpen('CLOS'), false); assert.equal(isOpen('ANNULE'), false);
    assert.equal(stageTone('EN_COURS', true), 'bad'); assert.equal(stageTone('EN_INSTRUCTION'), 'warn'); assert.equal(stageTone('A_PREPARER'), 'warn'); assert.equal(stageTone('A_CLORE'), 'warn'); assert.equal(stageTone('CLOS'), 'ok'); assert.equal(stageTone('EN_COURS'), '');
});

test('Le retard, la période et la valeur se disent en toutes lettres', () => {
    assert.equal(lateText({ enRetard: false, joursRetard: null }), ''); assert.equal(lateText({ enRetard: true, joursRetard: 3 }), 'En retard de 3 jours');
    assert.equal(lateText({ enRetard: true, joursRetard: 1 }), 'En retard d’un jour'); assert.equal(lateText({ enRetard: true, joursRetard: null }), 'En retard');
    assert.equal(periodText({ dateDebut: '2026-10-15', dateFin: '2027-01-14' }), 'du 15 octobre 2026 au 14 janvier 2027');
    assert.equal(periodText({ dateDebut: '2026-10-15', dateFin: '2026-10-15' }), 'le 15 octobre 2026');
    assert.match(flat(valueText(dossier())), /1 500 000\s?GNF/);
    assert.equal(valueText(dossier({ valeurTotale: null })), null);
});

test('Le déroulé suit la décision puis la sortie de chaque original', () => {
    const state = steps => steps.map(s => s.key + ':' + s.state).join(' ');
    assert.equal(state(timeline(dossier({ statut: 'EN_INSTRUCTION', etape: 'EN_INSTRUCTION', decision: null }))), 'monte:done decision:current sorties:todo depart:todo retour:todo cloture:todo');
    assert.equal(state(timeline(dossier())), 'monte:done decision:done sorties:current depart:todo retour:todo cloture:todo');
    const prepared = dossier({ etape: 'EN_PREPARATION', elements: [element({ sortie: sortie('AUTORISEE') }), element({ id: 'e2', sortie: sortie('DEMANDEE') })] });
    assert.equal(state(timeline(prepared)), 'monte:done decision:done sorties:current depart:todo retour:todo cloture:todo');
    const authorized = dossier({ etape: 'EN_PREPARATION', elements: [element({ sortie: sortie('AUTORISEE') })] });
    assert.equal(state(timeline(authorized)), 'monte:done decision:done sorties:done depart:current retour:todo cloture:todo');
    const out = dossier({ etape: 'EN_COURS', elements: [element({ sortie: sortie('RECUE') })] });
    assert.equal(state(timeline(out)), 'monte:done decision:done sorties:done depart:done retour:current cloture:todo');
    const back = dossier({ etape: 'A_CLORE', elements: [element({ sortie: sortie('RETOURNEE'), constatRetour: report })] });
    assert.equal(state(timeline(back)), 'monte:done decision:done sorties:done depart:done retour:done cloture:current');
    assert.equal(state(timeline(dossier({ statut: 'CLOS', etape: 'CLOS', elements: [element({ sortie: sortie('RETOURNEE') })] }))), 'monte:done decision:done sorties:done depart:done retour:done cloture:done');
    assert.equal(state(timeline(dossier({ statut: 'REFUSE', etape: 'REFUSE', decision: { parId: 'u2', par: null, le: 'x' } }))), 'monte:done decision:cancelled sorties:cancelled depart:cancelled retour:cancelled cloture:cancelled');
    assert.equal(state(timeline(dossier({ statut: 'ANNULE', etape: 'ANNULE', elements: [element({ sortie: sortie('ANNULEE') })] }))), 'monte:done decision:done sorties:cancelled depart:cancelled retour:cancelled cloture:cancelled');
});

test('La sortie et l’état d’un original se disent clairement', () => {
    assert.equal(sortieText(element()), 'Sortie à demander'); assert.equal(sortieText(element({ sortie: sortie('AUTORISEE') })), 'Autorisée');
    assert.equal(sortieText(element({ sortie: sortie('REFUSEE') })), 'Refusée — à redemander'); assert.equal(sortieText(element({ sortie: sortie('ANNULEE') })), 'Annulée — à redemander');
    assert.equal(elementSummary(element()), 'Pas encore de constat d’état de départ.');
    assert.equal(elementSummary(element({ constatDepart: report })), 'Constat d’état de départ du 4 octobre 2026.');
    assert.equal(elementSummary(element({ sortie: sortie('RECUE') })), 'Sorti de réserve.');
    assert.equal(elementSummary(element({ sortie: sortie('REMISE', { enRetard: true }) })), 'Sorti de réserve, en retard.');
    assert.equal(elementSummary(element({ sortie: sortie('RETOURNEE'), constatRetour: report })), 'Rentré avec son constat d’état.');
    assert.equal(elementSummary(element({ sortie: sortie('RETOURNEE') })), 'Rentré, sans constat d’état.');
});

test('Un prêt se contrôle : emprunteur, début à venir, retour dans les cinq ans', () => {
    assert.deepEqual(dossierProblems(pretForm(), TODAY), []);
    assert.equal(dossierProblems(emptyDossierForm('PRET'), TODAY).length >= 6, true);
    assert.ok(dossierProblems(pretForm({ emprunteurNom: ' ' }), TODAY).includes('Un prêt nomme son emprunteur (organisme ou personne).'));
    assert.ok(dossierProblems(pretForm({ dateDebut: '2026-10-01' }), TODAY).includes('Le début ne peut pas être dans le passé.'));
    assert.deepEqual(dossierProblems(pretForm({ dateDebut: '2026-10-01' }), TODAY, false), []);
    assert.ok(dossierProblems(pretForm({ retourPrevu: '2026-10-04' }), TODAY).includes('Le retour prévu ne peut pas être dans le passé.'));
    assert.ok(dossierProblems(pretForm({ retourPrevu: '2032-01-01' }), TODAY).some(p => p.includes('cinq ans')));
    assert.ok(dossierProblems(pretForm({ dateDebut: '2026-12-01', retourPrevu: '2026-11-01' }), TODAY).includes('Le retour prévu ne précède pas le début.'));
    assert.ok(dossierProblems(pretForm({ objet: 'court' }), TODAY).some(p => p.includes('L’objet')));
    assert.ok(dossierProblems(pretForm({ intitule: 'ab' }), TODAY).some(p => p.includes('L’intitulé')));
});

test('Une exposition se contrôle : fermeture après l’ouverture, retour après la fermeture', () => {
    assert.deepEqual(dossierProblems(expoForm(), TODAY), []);
    assert.ok(dossierProblems(expoForm({ dateFin: '' }), TODAY).includes('Indiquez la date de fermeture de l’exposition.'));
    assert.ok(dossierProblems(expoForm({ dateFin: '2026-11-01' }), TODAY).includes('La fermeture ne précède pas l’ouverture.'));
    assert.ok(dossierProblems(expoForm({ retourPrevu: '2027-01-02' }), TODAY).some(p => p.includes('suit la fin de l’exposition')));
    assert.deepEqual(dossierProblems(expoForm({ commissaire: '' }), TODAY), []);
});

test('Le corps d’un dossier n’envoie que ce qui est renseigné, et pour un prêt la fin est le retour', () => {
    assert.deepEqual(dossierBody(pretForm({ lieuAdresse: ' Campus ', emprunteurContact: ' ' })), { nature: 'PRET', intitule: 'Prêt à l’université de Kankan', objet: 'Prêt pour une exposition de recherche', lieuNom: 'Université de Kankan',
        dateDebut: '2026-10-15', retourPrevu: '2027-01-14', lieuAdresse: 'Campus', emprunteurNom: 'Université de Kankan' });
    assert.deepEqual(dossierBody(expoForm()), { nature: 'EXPOSITION', intitule: 'Mémoire de Kankan', objet: 'Exposition sur l’état civil colonial', lieuNom: 'Salle des fêtes', dateDebut: '2026-11-04', retourPrevu: '2027-01-10',
        dateFin: '2027-01-03', commissaire: 'Awa Camara' });
    assert.ok(!('nature' in dossierBody(pretForm(), false)));
    const back = dossierFormOf(dossier());
    assert.equal(back.emprunteurNom, 'Université de Kankan'); assert.equal(back.lieuAdresse, 'Campus'); assert.equal(back.commissaire, '');
});

test('La convention, l’assurance et le transport se contrôlent, une police ou une exonération motivée', () => {
    const ok = { ...termsFormOf(dossier()) };
    assert.deepEqual(termsProblems(ok, TODAY), []);
    assert.ok(termsProblems({ ...ok, conventionSigneeLe: '2026-10-06' }, TODAY).includes('La convention ne peut pas être signée dans le futur.'));
    assert.ok(termsProblems({ ...ok, assuranceDu: '2026-12-01', assuranceAu: '2026-11-01' }, TODAY).includes('La couverture de l’assurance finit après son début.'));
    assert.ok(termsProblems({ ...ok, assuranceMode: 'EXONERATION', exonerationMotif: 'court' }, TODAY)[0].includes('absence d’assurance'));
    assert.deepEqual(termsProblems({ ...ok, assuranceMode: 'EXONERATION', exonerationMotif: 'Garantie de l’État accordée pour ce prêt' }, TODAY), []);
    assert.ok(termsProblems({ ...ok, devise: 'franc' }, TODAY).some(p => p.includes('trois lettres')));
    assert.ok(termsProblems({ ...ok, transportAllerLe: '2026-10-20', transportRetourLe: '2026-10-10' }, TODAY).some(p => p.includes('transport retour')));
    assert.deepEqual(termsProblems(emptyTermsForm(), TODAY), []);
});

test('Le corps des conditions n’envoie que ce qui est renseigné, sans mêler police et exonération', () => {
    assert.deepEqual(termsBody(emptyTermsForm()), {});
    const body = termsBody({ ...termsFormOf(dossier()), devise: 'gnf' });
    assert.deepEqual(body, { conventionReference: 'CONV-2026-01', conventionSigneeLe: '2026-10-03', conventionSignataire: 'Le recteur', assureur: 'Assurance Nationale', assurancePolice: 'POL-77', assuranceDu: '2026-10-04',
        assuranceAu: '2027-02-01', devise: 'GNF', transportMode: 'Camion climatisé', transporteur: 'Transports Kankan', convoyeur: 'Mamadou Bah', transportAllerLe: '2026-10-14', transportRetourLe: '2027-01-15', emballage: 'Caisse en bois' });
    const exempt = termsBody({ ...termsFormOf(dossier()), assuranceMode: 'EXONERATION', exonerationMotif: ' Garantie de l’État accordée pour ce prêt ' });
    assert.equal(exempt.assuranceExonerationMotif, 'Garantie de l’État accordée pour ce prêt');
    for (const key of ['assureur', 'assurancePolice', 'assuranceDu', 'assuranceAu']) assert.ok(!(key in exempt), key);
    assert.equal(termsFormOf(dossier({ assurance: { ...dossier().assurance, exonerationMotif: 'Garantie de l’État accordée pour ce prêt' } })).assuranceMode, 'EXONERATION');
});

test('Un original du dossier : valeur assurée, conditions et emplacement', () => {
    assert.deepEqual(elementProblems(emptyElementForm()), []);
    assert.deepEqual(elementProblems({ ...emptyElementForm(), valeur: '1 500 000,50' }), []);
    assert.ok(elementProblems({ ...emptyElementForm(), valeur: '-1' })[0].includes('valeur assurée'));
    assert.ok(elementProblems({ ...emptyElementForm(), valeur: '10,123' })[0].includes('valeur assurée'));
    assert.ok(elementProblems({ ...emptyElementForm(), valeur: '2000000000000' })[0].includes('valeur assurée'));
    assert.ok(elementProblems({ ...emptyElementForm(), emplacement: 'x'.repeat(256) })[0].includes('emplacement'));
    assert.deepEqual(elementBody({ valeur: '1 500 000', conditions: ' Vitrine ', emplacement: '' }, 'b1', 'a1'), { bienId: 'b1', archiveId: 'a1', valeurAssuree: 1500000, conditions: 'Vitrine' });
    assert.deepEqual(elementBody(emptyElementForm(), 'b1', 'a1'), { bienId: 'b1', archiveId: 'a1' });
    assert.deepEqual(elementUpdateBody({ valeur: '', conditions: '', emplacement: ' Salle 3 ' }), { valeurAssuree: null, conditions: null, emplacement: 'Salle 3' });
    assert.deepEqual(elementFormOf(element({ valeurAssuree: null, conditions: null, emplacement: null })), { valeur: '', conditions: '', emplacement: '' });
});

test('Les passages se nomment, se motivent et envoient leur version', () => {
    assert.equal(transitionLabel('ACCEPTE'), 'Accepter le dossier'); assert.equal(transitionLabel('REFUSE'), 'Refuser le dossier'); assert.equal(transitionLabel('ANNULE'), 'Annuler le dossier'); assert.equal(transitionLabel('CLOS'), 'Clore le dossier');
    assert.deepEqual(transitionProblems({ motifRequis: true }, 'court'), ['Motif : un texte écrit d’au moins 10 caractères est exigé.']);
    assert.deepEqual(transitionProblems({ motifRequis: true }, 'Les originaux sont trop fragiles'), []);
    assert.deepEqual(transitionProblems({ motifRequis: false }, ''), []);
    assert.deepEqual(transitionBody('CLOS', 4, ' Le prêt s’est bien passé '), { vers: 'CLOS', expectedVersion: 4, texte: 'Le prêt s’est bien passé' });
    assert.deepEqual(transitionBody('ACCEPTE', 4, ''), { vers: 'ACCEPTE', expectedVersion: 4 });
});

test('Une prolongation repousse la fin, avec un motif, et une police qui couvre le nouveau retour', () => {
    const d = dossier();
    assert.deepEqual(prolongProblems({ nouvelleFin: '2027-01-30', motif: 'Le prêt est prolongé de seize jours' }, d, TODAY), []);
    assert.ok(prolongProblems(emptyProlongForm(), d, TODAY).includes('Indiquez la nouvelle date de fin.'));
    assert.ok(prolongProblems({ nouvelleFin: '2027-01-14', motif: 'Le prêt est prolongé de seize jours' }, d, TODAY)[0].includes('doit suivre la fin actuelle'));
    assert.ok(prolongProblems({ nouvelleFin: '2027-02-15', motif: 'Le prêt est prolongé de trente jours' }, d, TODAY)[0].includes('assurance prend fin le 1 février 2027'));
    assert.deepEqual(prolongProblems({ nouvelleFin: '2027-02-15', motif: 'Le prêt est prolongé de trente jours' }, dossier({ assurance: { ...d.assurance, exonerationMotif: 'Garantie de l’État accordée pour ce prêt' } }), TODAY), []);
    assert.deepEqual(prolongProblems({ nouvelleFin: '2027-02-15', motif: 'Le prêt est prolongé de trente jours' }, dossier({ nature: 'EXPOSITION' }), TODAY), []);
    assert.ok(prolongProblems({ nouvelleFin: '2027-01-30', motif: 'court' }, d, TODAY).some(p => p.startsWith('Motif')));
    assert.ok(prolongProblems({ nouvelleFin: '2032-01-01', motif: 'Le prêt est prolongé de longtemps' }, d, TODAY).some(p => p.includes('cinq ans')));
    assert.deepEqual(prolongBody({ nouvelleFin: '2027-01-30', motif: ' Le prêt est prolongé ' }, 5), { expectedVersion: 5, nouvelleFin: '2027-01-30', motif: 'Le prêt est prolongé' });
});

test('Chaque ligne de l’historique se lit', () => {
    assert.equal(journalSummary('CREATION', null, null, null), 'Dossier monté');
    assert.equal(journalSummary('MODIFICATION', 'termes', null, ['convention']), 'Convention, assurance ou transport complétés');
    assert.equal(journalSummary('MODIFICATION', null, null, null), 'Dossier modifié');
    assert.equal(journalSummary('ELEMENT', 'ajout', null, {}), 'Original ajouté'); assert.equal(journalSummary('ELEMENT', 'retrait', {}, null), 'Original retiré'); assert.equal(journalSummary('ELEMENT', 'modification', null, {}), 'Original modifié');
    assert.equal(journalSummary('CONSTAT', 'depart', null, {}), 'Constat d’état de départ enregistré'); assert.equal(journalSummary('PREPARATION', 'sorties', null, ['MVT-1']), 'Sorties demandées');
    assert.equal(journalSummary('PROLONGATION', 'dateFin', {}, { retourPrevu: '2027-02-15' }), 'Dossier prolongé : retour prévu le 15 février 2027');
    assert.equal(journalSummary('TRANSITION', 'statut', 'EN_INSTRUCTION', 'ACCEPTE'), 'En instruction → Accepté');
});

test('La fiche de transport dit ce qui part, avec tout son texte échappé', () => {
    const d = dossier({ intitule: 'Prêt <b>à</b> l’université', emprunteurNom: 'Université & Cie', elements: [element({ bienIntitule: 'Registre <script>', conditions: null, constatDepart: report })] });
    const html = transportSheetHtml(d, 'Archives <nationales>');
    assert.ok(html.includes('PRE-2026-000001')); assert.ok(html.includes('Fiche de transport — prêt sortant'));
    assert.ok(html.includes('Prêt &lt;b&gt;à&lt;/b&gt; l’université')); assert.ok(html.includes('Université &amp; Cie')); assert.ok(html.includes('Registre &lt;script&gt;')); assert.ok(html.includes('Archives &lt;nationales&gt;'));
    assert.ok(!html.includes('<script>') && !html.includes('<b>à'));
    assert.ok(html.includes('CONV-2026-01')); assert.ok(html.includes('POL-77')); assert.ok(html.includes('Camion climatisé')); assert.ok(html.includes('ARCH-001'));
    assert.ok(html.includes('4 octobre 2026')); assert.match(flat(html), /1 500 000\s?GNF/);
    const expo = transportSheetHtml(dossier({ nature: 'EXPOSITION', numero: 'EXP-2026-000001', emprunteurNom: null, emprunteurContact: null, commissaire: 'Awa Camara', convention: { reference: null, signeeLe: null, signataire: null },
        assurance: { assureur: null, police: null, du: null, au: null, exonerationMotif: null, devise: null }, transport: { mode: null, transporteur: null, convoyeur: null, allerLe: null, retourLe: null, emballage: null }, valeurTotale: null }));
    assert.ok(expo.includes('Fiche de sortie — exposition')); assert.ok(expo.includes('Awa Camara')); assert.ok(!expo.includes('Convention et assurance')); assert.ok(!expo.includes('<h2>Transport</h2>'));
    const sheet = transportSheetHtml(dossier({ assurance: { ...dossier().assurance, exonerationMotif: 'Garantie de l’État accordée pour ce prêt', assureur: null, police: null, du: null, au: null } }));
    assert.ok(sheet.includes('Sans police : Garantie de l’État'));
});
