import test from 'node:test';
import assert from 'node:assert/strict';
import { STATUS_LABELS, STATUS_FILTERS, STAGE_LABELS, STAGE_NEXT_STEPS, ELEMENT_STAGE_LABELS, CONTROLLED_ELEMENT_STAGES, statusLabel, stageLabel, isOpen, stageTone, elementStageLabel, timeline,
    emptyOrderForm, orderProblems, orderBody, transitionLabel, emptyTakeForm, lotsOf, takeProblems, emptyTransitionForm, needsForm, transitionProblems, transitionBody, journalSummary, pagesText } from '../.test-build/digitizationOrders.js';
import { NUMERISATION_LABELS } from '../.test-build/heritageAssets.js';

const TODAY = '2026-10-05';
const order = (patch = {}) => ({ ...emptyOrderForm(), typeDocumentId: 'type-1', motif: 'Numérisation de l’atlas pour sa consultation', destination: 'Atelier de numérisation', destinataire: 'Atelier', retourPrevu: '2026-11-05', ...patch });
const projects = [
    { id: 'p1', nom: 'Projet cartes', code: 'CARTES', lots: [{ id: 'l300', code: 'L-300', nom: null, resolutionMinDpi: 300 }, { id: 'l400', code: 'L-400', nom: 'Cartes fines', resolutionMinDpi: 400 }] },
    { id: 'p2', nom: 'Projet registres', code: null, lots: [{ id: 'l600', code: 'L-600', nom: null, resolutionMinDpi: 600 }] }];
const view = (patch = {}) => ({ statut: 'EN_COURS', etape: 'NUMERISATION', mouvement: { statut: 'REMISE' }, element: { statut: 'NUMERISATION' }, priseEnCharge: { parId: 'u2' }, ...patch });

test('Les étapes d’une commande et de sa numérisation ont leurs libellés, et chacune dit ce qui est attendu', () => {
    assert.equal(STATUS_LABELS.EN_COURS, 'Prise en charge');
    assert.equal(statusLabel('RECEPTIONNEE'), 'Réceptionnée');
    assert.equal(statusLabel(null), '—');
    assert.equal(stageLabel('A_PRENDRE_EN_CHARGE'), 'À prendre en charge');
    assert.equal(stageLabel('INCONNUE'), 'INCONNUE');
    for (const stage of Object.keys(STAGE_LABELS)) assert.ok(STAGE_NEXT_STEPS[stage].length > 10, stage);
    assert.equal(elementStageLabel('CONTROLE_QUALITE'), 'Contrôle qualité');
    assert.equal(elementStageLabel(null), '—');
    assert.equal(NUMERISATION_LABELS.PROGRAMMEE, 'Programmée');
});

test('Les filtres proposent les commandes ouvertes et celles que l’atelier doit prendre en charge, puis chaque étape', () => {
    assert.deepEqual(STATUS_FILTERS.slice(0, 2), [['OUVERTES', 'Commandes ouvertes'], ['A_PRENDRE_EN_CHARGE', 'À prendre en charge']]);
    assert.equal(STATUS_FILTERS.length, 2 + Object.keys(STATUS_LABELS).length);
    assert.ok(isOpen('COMMANDEE')); assert.ok(isOpen('EN_COURS')); assert.ok(!isOpen('RECEPTIONNEE')); assert.ok(!isOpen('ANNULEE'));
});

test('Ce qui attend une autre personne est signalé, une sortie en retard est une alerte, une commande réceptionnée est conforme', () => {
    assert.equal(stageTone('A_PRENDRE_EN_CHARGE'), 'warn');
    assert.equal(stageTone('SORTIE_A_AUTORISER'), 'warn');
    assert.equal(stageTone('A_RECEPTIONNER'), 'warn');
    assert.equal(stageTone('NUMERISATION', true), 'bad');
    assert.equal(stageTone('RECEPTIONNEE'), 'ok');
    assert.equal(stageTone('NUMERISATION'), '');
    assert.equal(stageTone('ANNULEE'), '');
});

test('Le contrôle qualité conforme est ce qui libère l’original : les étapes contrôlées sont celles de l’élément après le contrôle', () => {
    assert.deepEqual([...CONTROLLED_ELEMENT_STAGES].sort(), ['ANNULE', 'METADONNEES', 'TERMINE', 'VALIDATION']);
    for (const stage of CONTROLLED_ELEMENT_STAGES) assert.ok(stage in ELEMENT_STAGE_LABELS);
});

const states = steps => steps.map(s => s.key + ':' + s.state).join(' ');
test('Le déroulé montre ce qui est fait, ce qui est en cours et ce qui reste', () => {
    const waiting = timeline(view({ statut: 'COMMANDEE', etape: 'SORTIE_A_AUTORISER', mouvement: { statut: 'DEMANDEE' }, element: null, priseEnCharge: null }));
    assert.equal(waiting.length, 8);
    assert.equal(states(waiting), 'commande:done autorisation:current prise:todo remise:todo controle:todo retour:todo validation:todo reception:todo');
    const toTake = timeline(view({ statut: 'COMMANDEE', etape: 'A_PRENDRE_EN_CHARGE', mouvement: { statut: 'AUTORISEE' }, element: null, priseEnCharge: null }));
    assert.equal(states(toTake), 'commande:done autorisation:done prise:current remise:todo controle:todo retour:todo validation:todo reception:todo');
    const scanning = timeline(view());
    assert.equal(states(scanning), 'commande:done autorisation:done prise:done remise:done controle:current retour:todo validation:todo reception:todo');
    const toReturn = timeline(view({ etape: 'ORIGINAL_A_RENDRE', mouvement: { statut: 'RECUE' }, element: { statut: 'METADONNEES' } }));
    assert.equal(states(toReturn), 'commande:done autorisation:done prise:done remise:done controle:done retour:current validation:todo reception:todo');
    const finishing = timeline(view({ etape: 'FINALISATION', mouvement: { statut: 'RETOURNEE' }, element: { statut: 'VALIDATION' } }));
    assert.equal(states(finishing), 'commande:done autorisation:done prise:done remise:done controle:done retour:done validation:current reception:todo');
    const toReceive = timeline(view({ etape: 'A_RECEPTIONNER', mouvement: { statut: 'RETOURNEE' }, element: { statut: 'TERMINE' } }));
    assert.equal(states(toReceive), 'commande:done autorisation:done prise:done remise:done controle:done retour:done validation:done reception:current');
    const done = timeline(view({ statut: 'RECEPTIONNEE', etape: 'RECEPTIONNEE', mouvement: { statut: 'RETOURNEE' }, element: { statut: 'TERMINE' } }));
    assert.ok(done.every(s => s.state === 'done'));
});

test('Une commande annulée barre ce qui n’a pas eu lieu', () => {
    const early = timeline(view({ statut: 'ANNULEE', etape: 'ANNULEE', mouvement: { statut: 'ANNULEE' }, element: null, priseEnCharge: null }));
    assert.equal(states(early), 'commande:done autorisation:cancelled prise:cancelled remise:cancelled controle:cancelled retour:cancelled validation:cancelled reception:cancelled');
    const late = timeline(view({ statut: 'ANNULEE', etape: 'ANNULEE', mouvement: { statut: 'AUTORISEE' }, element: { statut: 'ANNULE' } }));
    assert.equal(states(late), 'commande:done autorisation:done prise:done remise:cancelled controle:cancelled retour:cancelled validation:cancelled reception:cancelled');
});

test('Une commande dit pourquoi numériser, dans quel type de document, où va l’original et jusqu’à quand', () => {
    assert.deepEqual(orderProblems(order(), TODAY), []);
    assert.equal(orderProblems(emptyOrderForm(), TODAY).length, 5);
    assert.ok(orderProblems(order({ typeDocumentId: '' }), TODAY)[0].includes('type du document'));
    assert.ok(orderProblems(order({ motif: 'court' }), TODAY)[0].includes('au moins 10'));
    assert.ok(orderProblems(order({ destination: ' ' }), TODAY)[0].includes('où l’original ira'));
    assert.ok(orderProblems(order({ destinataire: '' }), TODAY)[0].includes('qui le reçoit'));
    assert.ok(orderProblems(order({ retourPrevu: '' }), TODAY)[0].includes('échéance'));
    assert.ok(orderProblems(order({ retourPrevu: '2026-10-04' }), TODAY)[0].includes('passé'));
    assert.ok(orderProblems(order({ retourPrevu: '2032-10-05' }), TODAY)[0].includes('cinq ans'));
});

test('La résolution et le nombre de pages, quand ils sont donnés, restent plausibles', () => {
    assert.deepEqual(orderProblems(order({ resolutionMinDpi: '400', pagesAttendues: '48' }), TODAY), []);
    assert.ok(orderProblems(order({ resolutionMinDpi: '10' }), TODAY)[0].includes('50 et 9600'));
    assert.ok(orderProblems(order({ resolutionMinDpi: '10000' }), TODAY)[0].includes('50 et 9600'));
    assert.ok(orderProblems(order({ resolutionMinDpi: 'beaucoup' }), TODAY)[0].includes('50 et 9600'));
    assert.ok(orderProblems(order({ pagesAttendues: '0' }), TODAY)[0].includes('1 et 100000'));
    assert.deepEqual(orderProblems(order({ resolutionMinDpi: '  ', pagesAttendues: '' }), TODAY), []);
});

test('Le corps d’une commande ne contient que ce qui est renseigné, avec les nombres en nombres', () => {
    assert.deepEqual(orderBody(order()), { typeDocumentId: 'type-1', motif: 'Numérisation de l’atlas pour sa consultation', destination: 'Atelier de numérisation', destinataire: 'Atelier', retourPrevu: '2026-11-05', rectoVerso: false });
    assert.deepEqual(orderBody(order({ motif: '  Numérisation de l’atlas pour sa consultation  ', consignes: ' Gants ', resolutionMinDpi: '400', pagesAttendues: '48', rectoVerso: true })),
        { typeDocumentId: 'type-1', motif: 'Numérisation de l’atlas pour sa consultation', destination: 'Atelier de numérisation', destinataire: 'Atelier', retourPrevu: '2026-11-05', rectoVerso: true, consignes: 'Gants', resolutionMinDpi: 400, pagesAttendues: 48 });
});

test('Chaque passage a son libellé, et tous ouvrent une fenêtre', () => {
    assert.equal(transitionLabel('EN_COURS'), 'Prendre en charge');
    assert.equal(transitionLabel('RECEPTIONNEE'), 'Réceptionner la représentation');
    assert.equal(transitionLabel('ANNULEE'), 'Annuler la commande');
    for (const vers of ['EN_COURS', 'RECEPTIONNEE', 'ANNULEE']) assert.ok(needsForm({ vers }));
});

test('L’atelier choisit un projet, et un lot dès que le patrimoine impose une résolution minimale', () => {
    assert.deepEqual(lotsOf(projects, 'p1').map(l => l.id), ['l300', 'l400']);
    assert.deepEqual(lotsOf(projects, 'inconnu'), []);
    assert.equal(takeProblems({ resolutionMinDpi: null }, projects, emptyTakeForm()).length, 1);
    assert.deepEqual(takeProblems({ resolutionMinDpi: null }, projects, { projetId: 'p1', lotId: '' }), []);
    assert.deepEqual(takeProblems({ resolutionMinDpi: null }, projects, { projetId: 'p1', lotId: 'l300' }), []);
    assert.ok(takeProblems({ resolutionMinDpi: 400 }, projects, { projetId: 'p1', lotId: '' })[0].includes('résolution minimale de 400 dpi'));
    assert.ok(takeProblems({ resolutionMinDpi: 400 }, projects, { projetId: 'p1', lotId: 'l300' })[0].includes('300 dpi'));
    assert.deepEqual(takeProblems({ resolutionMinDpi: 400 }, projects, { projetId: 'p1', lotId: 'l400' }), []);
    assert.deepEqual(takeProblems({ resolutionMinDpi: 400 }, projects, { projetId: 'p2', lotId: 'l600' }), []);
    assert.ok(takeProblems({ resolutionMinDpi: null }, projects, { projetId: 'p1', lotId: 'l600' })[0].includes('n’appartient pas au projet'));
});

test('Annuler exige un motif écrit, réceptionner une note facultative, prendre en charge un projet', () => {
    const cancel = { vers: 'ANNULEE', motifRequis: true };
    assert.ok(transitionProblems(cancel, { resolutionMinDpi: null }, projects, emptyTransitionForm())[0].startsWith('Motif'));
    assert.deepEqual(transitionProblems(cancel, { resolutionMinDpi: null }, projects, { ...emptyTransitionForm(), texte: 'La commande a été passée pour le mauvais bien' }), []);
    assert.deepEqual(transitionProblems({ vers: 'RECEPTIONNEE', motifRequis: false }, { resolutionMinDpi: null }, projects, emptyTransitionForm()), []);
    assert.equal(transitionProblems({ vers: 'EN_COURS', motifRequis: false }, { resolutionMinDpi: null }, projects, emptyTransitionForm()).length, 1);
    assert.deepEqual(transitionProblems({ vers: 'EN_COURS', motifRequis: false }, { resolutionMinDpi: 400 }, projects, { ...emptyTransitionForm(), projetId: 'p1', lotId: 'l400' }), []);
});

test('Le corps d’un passage n’envoie que ce qui est utile', () => {
    assert.deepEqual(transitionBody('RECEPTIONNEE', 5, emptyTransitionForm()), { vers: 'RECEPTIONNEE', expectedVersion: 5 });
    assert.deepEqual(transitionBody('RECEPTIONNEE', 5, { ...emptyTransitionForm(), texte: ' Pages contrôlées par sondage ' }), { vers: 'RECEPTIONNEE', expectedVersion: 5, texte: 'Pages contrôlées par sondage' });
    assert.deepEqual(transitionBody('ANNULEE', 2, { ...emptyTransitionForm(), texte: 'La commande a été passée pour le mauvais bien', projetId: 'p1' }), { vers: 'ANNULEE', expectedVersion: 2, texte: 'La commande a été passée pour le mauvais bien' });
    assert.deepEqual(transitionBody('EN_COURS', 1, { ...emptyTransitionForm(), projetId: 'p1' }), { vers: 'EN_COURS', expectedVersion: 1, projetId: 'p1' });
    assert.deepEqual(transitionBody('EN_COURS', 1, { ...emptyTransitionForm(), projetId: 'p1', lotId: 'l400' }), { vers: 'EN_COURS', expectedVersion: 1, projetId: 'p1', lotId: 'l400' });
});

test('L’historique se lit, et l’avancement des pages se dit au singulier comme au pluriel', () => {
    assert.equal(journalSummary('CREATION', null, {}), 'Commande déposée');
    assert.equal(journalSummary('TRANSITION', 'COMMANDEE', 'EN_COURS'), 'Commandée → Prise en charge');
    assert.equal(pagesText({ pagesAttendues: 48, pagesPresentes: 12 }), '12 pages sur 48');
    assert.equal(pagesText({ pagesAttendues: 48, pagesPresentes: 1 }), '1 page sur 48');
    assert.equal(pagesText({ pagesAttendues: null, pagesPresentes: 0 }), '0 page');
    assert.equal(pagesText({ pagesAttendues: null, pagesPresentes: 7 }), '7 pages');
});
