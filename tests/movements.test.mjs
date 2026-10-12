import test from 'node:test';
import assert from 'node:assert/strict';
import { PURPOSE_LABELS, PURPOSE_CHOICES, STATUS_LABELS, STATUS_FILTERS, OPEN_STATUSES, OUT_STATUSES, NEXT_STEPS, purposeLabel, statusLabel, isOpen, isOut, statusTone, lateText, addDays, MAX_DAYS_AHEAD,
    emptyRequestForm, requestOf, requestProblems, requestBody, transitionLabel, movementNeeds, needsForm, emptyTransitionForm, movementTransitionProblems, movementBody, journalSummary } from '../.test-build/movements.js';
import { emptyReportForm } from '../.test-build/conservation.js';

const TODAY = '2026-10-05';
const request = (patch = {}) => ({ ...emptyRequestForm(), objet: 'CONSULTATION', motif: 'Consultation par un chercheur accrédité', destination: 'Salle de lecture', destinataire: 'Équipe de recherche', retourPrevu: '2026-10-15', ...patch });
const option = (patch = {}) => ({ vers: 'AUTORISEE', motifRequis: false, conditionsRequises: false, conformiteRequise: false, ...patch });
const form = (patch = {}) => ({ ...emptyTransitionForm(), ...patch });
const finalReport = (patch = {}) => ({ ...emptyReportForm(''), etat: 'FRAGILE', manipulation: 'PRECAUTIONS', alterations: ['DECHIRURE'], observations: 'Déchirure apparue en marge', ...patch });

test('Objets et étapes ont leurs libellés, et chaque étape dit ce qui est attendu', () => {
    assert.equal(PURPOSE_LABELS.NUMERISATION, 'Numérisation');
    assert.equal(purposeLabel('PRET'), 'Prêt');
    assert.equal(purposeLabel('INCONNU'), 'INCONNU');
    assert.equal(purposeLabel(null), '—');
    assert.equal(STATUS_LABELS.RETOURNEE, 'Rendue');
    assert.equal(statusLabel('REMISE'), 'Remise');
    assert.equal(statusLabel(undefined), '—');
    for (const status of Object.keys(STATUS_LABELS)) assert.ok(NEXT_STEPS[status].length > 10, status);
});

test('Les filtres regroupent les demandes ouvertes et les originaux sortis, puis listent chaque étape', () => {
    assert.deepEqual(STATUS_FILTERS.slice(0, 2), [['OUVERTES', 'Demandes ouvertes'], ['DEHORS', 'Originaux sortis']]);
    assert.equal(STATUS_FILTERS.length, 2 + Object.keys(STATUS_LABELS).length);
    assert.deepEqual([...OPEN_STATUSES], ['DEMANDEE', 'AUTORISEE', 'REMISE', 'RECUE']);
    assert.deepEqual([...OUT_STATUSES], ['REMISE', 'RECUE']);
    assert.ok(isOpen('AUTORISEE')); assert.ok(!isOpen('REFUSEE')); assert.ok(isOut('RECUE')); assert.ok(!isOut('AUTORISEE'));
});

test('Une sortie en retard est une alerte, une demande en attente demande de l’attention', () => {
    assert.equal(statusTone('RECUE', true), 'bad');
    assert.equal(statusTone('DEMANDEE'), 'warn');
    assert.equal(statusTone('AUTORISEE'), 'warn');
    assert.equal(statusTone('RETOURNEE'), 'ok');
    assert.equal(statusTone('REFUSEE'), '');
    assert.equal(statusTone('REMISE'), '');
});

test('Le retard se dit en jours, et se tait quand la sortie n’est pas en retard', () => {
    assert.equal(lateText({ enRetard: false, joursRetard: null }), '');
    assert.equal(lateText({ enRetard: true, joursRetard: 3 }), 'En retard de 3 jours');
    assert.equal(lateText({ enRetard: true, joursRetard: 1 }), 'En retard d’un jour');
    assert.equal(lateText({ enRetard: true, joursRetard: null }), 'En retard');
});

test('Les dates se décalent en temps universel, d’un mois à l’autre et d’une année à l’autre', () => {
    assert.equal(addDays('2026-10-05', 10), '2026-10-15');
    assert.equal(addDays('2026-12-30', 3), '2027-01-02');
    assert.equal(addDays('2028-02-28', 1), '2028-02-29');
    assert.equal(addDays('2026-10-05', 0), '2026-10-05');
    assert.equal(MAX_DAYS_AHEAD, 1826);
});

test('Une demande dit pour quoi, pourquoi, où, pour qui et jusqu’à quand', () => {
    assert.deepEqual(requestProblems(request(), TODAY), []);
    assert.equal(requestProblems(emptyRequestForm(), TODAY).length, 5);
    assert.ok(requestProblems(request({ objet: '' }), TODAY)[0].includes('pour quoi'));
    assert.ok(requestProblems(request({ motif: 'court' }), TODAY)[0].includes('au moins 10'));
    assert.ok(requestProblems(request({ destination: '  ' }), TODAY)[0].includes('où'));
    assert.ok(requestProblems(request({ destinataire: '' }), TODAY)[0].includes('qui le reçoit'));
});

test('Le retour prévu est obligatoire, pas dans le passé et à moins de cinq ans', () => {
    assert.ok(requestProblems(request({ retourPrevu: '' }), TODAY)[0].includes('échéance'));
    assert.ok(requestProblems(request({ retourPrevu: '2026-10-04' }), TODAY)[0].includes('passé'));
    assert.deepEqual(requestProblems(request({ retourPrevu: TODAY }), TODAY), []);
    assert.deepEqual(requestProblems(request({ retourPrevu: addDays(TODAY, MAX_DAYS_AHEAD) }), TODAY), []);
    assert.ok(requestProblems(request({ retourPrevu: addDays(TODAY, MAX_DAYS_AHEAD + 1) }), TODAY)[0].includes('cinq ans'));
});

test('Le corps d’une demande envoie les textes nettoyés, et une demande se reprend pour être modifiée', () => {
    assert.deepEqual(requestBody(request({ motif: '  Consultation par un chercheur accrédité  ', destination: ' Salle de lecture ' })),
        { objet: 'CONSULTATION', motif: 'Consultation par un chercheur accrédité', destination: 'Salle de lecture', destinataire: 'Équipe de recherche', retourPrevu: '2026-10-15' });
    const m = { objet: 'EXPOSITION', motif: 'Exposition au musée régional', destination: 'Musée', destinataire: 'Mme Bah', retourPrevu: '2026-12-01', numero: 'MVT-2026-000001' };
    assert.deepEqual(requestOf(m), { objet: 'EXPOSITION', motif: 'Exposition au musée régional', destination: 'Musée', destinataire: 'Mme Bah', retourPrevu: '2026-12-01' });
});

test('Chaque passage a son libellé, du point de vue de la personne qui agit', () => {
    assert.equal(transitionLabel('AUTORISEE'), 'Autoriser la sortie');
    assert.equal(transitionLabel('REFUSEE'), 'Refuser la demande');
    assert.equal(transitionLabel('ANNULEE'), 'Annuler la demande');
    assert.equal(transitionLabel('REMISE'), 'Remettre l’original');
    assert.equal(transitionLabel('RECUE'), 'Confirmer la réception');
    assert.equal(transitionLabel('RETOURNEE'), 'Enregistrer le retour');
});

test('Autoriser, refuser, annuler et rendre ouvrent une fenêtre ; remettre et recevoir se confirment d’un clic', () => {
    assert.ok(needsForm(option({ vers: 'AUTORISEE' })));
    assert.ok(needsForm(option({ vers: 'REFUSEE', motifRequis: true })));
    assert.ok(needsForm(option({ vers: 'ANNULEE', motifRequis: true })));
    assert.ok(needsForm(option({ vers: 'RETOURNEE', conformiteRequise: true })));
    assert.ok(!needsForm(option({ vers: 'REMISE' })));
    assert.ok(!needsForm(option({ vers: 'RECUE' })));
    assert.equal(movementNeeds(option({ vers: 'REFUSEE', motifRequis: true })).texteLabel, 'Motif du refus');
    assert.equal(movementNeeds(option({ vers: 'ANNULEE', motifRequis: true })).texteLabel, 'Motif de l’annulation');
    assert.equal(movementNeeds(option({ vers: 'AUTORISEE', conditionsRequises: true })).conditionsRequises, true);
});

test('Autoriser une pièce à manipuler avec précautions exige des conditions écrites, sinon elles sont facultatives', () => {
    assert.deepEqual(movementTransitionProblems(option(), form(), TODAY), []);
    const careful = option({ conditionsRequises: true });
    assert.equal(movementTransitionProblems(careful, form(), TODAY).length, 1);
    assert.equal(movementTransitionProblems(careful, form({ conditions: 'court' }), TODAY).length, 1);
    assert.deepEqual(movementTransitionProblems(careful, form({ conditions: 'Gants de coton, support rigide, pas de photocopie' }), TODAY), []);
});

test('Refuser et annuler exigent un motif écrit', () => {
    const refuse = option({ vers: 'REFUSEE', motifRequis: true });
    assert.ok(movementTransitionProblems(refuse, form(), TODAY)[0].startsWith('Motif du refus'));
    assert.deepEqual(movementTransitionProblems(refuse, form({ texte: 'Le fonds est en cours de récolement, la pièce ne sort pas' }), TODAY), []);
    assert.ok(movementTransitionProblems(option({ vers: 'ANNULEE', motifRequis: true }), form({ texte: 'court' }), TODAY)[0].startsWith('Motif de l’annulation'));
});

test('Le retour dit si l’original est rendu dans l’état où il est parti, sinon il se constate', () => {
    const back = option({ vers: 'RETOURNEE', conformiteRequise: true });
    assert.equal(movementTransitionProblems(back, form(), TODAY).length, 1);
    assert.deepEqual(movementTransitionProblems(back, form({ conforme: 'oui' }), TODAY), []);
    const missing = movementTransitionProblems(back, form({ conforme: 'non' }), TODAY);
    assert.ok(missing.some(p => p.includes('anomalie')));
    assert.ok(missing.some(p => p.includes('état constaté')));
    assert.deepEqual(movementTransitionProblems(back, form({ conforme: 'non', texte: 'Déchirure en marge de la page 3', constat: finalReport() }), TODAY), []);
    // Le constat au retour garde les règles de tout constat : une altération pour un état fragile.
    assert.ok(movementTransitionProblems(back, form({ conforme: 'non', texte: 'Déchirure en marge de la page 3', constat: finalReport({ alterations: [] }) }), TODAY).some(p => p.includes('altération')));
});

test('Le corps d’un passage n’envoie que ce qui est utile, et le constat au retour sans circonstances', () => {
    assert.deepEqual(movementBody('REMISE', 3, form(), option({ vers: 'REMISE' })), { vers: 'REMISE', expectedVersion: 3 });
    assert.deepEqual(movementBody('AUTORISEE', 1, form({ conditions: '  Gants de coton, support rigide  ' }), option()), { vers: 'AUTORISEE', expectedVersion: 1, conditions: 'Gants de coton, support rigide' });
    assert.deepEqual(movementBody('AUTORISEE', 1, form(), option()), { vers: 'AUTORISEE', expectedVersion: 1 });
    assert.deepEqual(movementBody('REFUSEE', 2, form({ texte: ' Le fonds est en cours de récolement ' }), option({ vers: 'REFUSEE', motifRequis: true })), { vers: 'REFUSEE', expectedVersion: 2, texte: 'Le fonds est en cours de récolement' });
    const back = option({ vers: 'RETOURNEE', conformiteRequise: true });
    assert.deepEqual(movementBody('RETOURNEE', 4, form({ conforme: 'oui' }), back), { vers: 'RETOURNEE', expectedVersion: 4, conforme: true });
    const body = movementBody('RETOURNEE', 4, form({ conforme: 'non', texte: 'Déchirure en marge de la page 3', constat: finalReport() }), back);
    assert.equal(body.conforme, false);
    assert.equal(body.texte, 'Déchirure en marge de la page 3');
    assert.equal(body.constat.etat, 'FRAGILE');
    assert.ok(!('contexte' in body.constat));
});

test('L’historique se lit : dépôt, modification, passage d’une étape à l’autre', () => {
    assert.equal(journalSummary('CREATION', null, { numero: 'MVT-2026-000001' }), 'Demande déposée');
    assert.equal(journalSummary('MODIFICATION', null, ['motif']), 'Demande modifiée');
    assert.equal(journalSummary('TRANSITION', 'DEMANDEE', 'AUTORISEE'), 'Demandée → Autorisée');
    assert.equal(journalSummary('TRANSITION', 'RECUE', 'RETOURNEE'), 'Reçue → Rendue');
});

test('La numérisation se commande, un prêt et une exposition se préparent dans un dossier : ils ne sont pas offerts parmi les objets d’une demande de sortie, mais restent lisibles', () => {
    for (const p of ['NUMERISATION', 'PRET', 'EXPOSITION']) assert.ok(!PURPOSE_CHOICES.includes(p), p);
    assert.equal(PURPOSE_CHOICES.length, Object.keys(PURPOSE_LABELS).length - 3);
    assert.deepEqual([...PURPOSE_CHOICES].sort(), ['AUTRE', 'CONSULTATION', 'EXPERTISE', 'RESTAURATION', 'TRANSFERT']);
    assert.equal(purposeLabel('NUMERISATION'), 'Numérisation'); assert.equal(purposeLabel('PRET'), 'Prêt'); assert.equal(purposeLabel('EXPOSITION'), 'Exposition');
});

test('Un original d’un prêt ou d’une exposition se constate toujours au retour, même conforme', () => {
    const back = option({ vers: 'RETOURNEE', conformiteRequise: true, constatRequis: true });
    assert.equal(movementNeeds(back).constat, true);
    assert.equal(movementNeeds(option({ vers: 'RETOURNEE', conformiteRequise: true })).constat, false);
    assert.equal(movementNeeds(option({ vers: 'AUTORISEE', constatRequis: true })).constat, false);
    const problems = movementTransitionProblems(back, form({ conforme: 'oui' }), TODAY);
    assert.ok(problems.some(p => p.includes('l’état constaté')), problems.join(' | '));
    assert.deepEqual(movementTransitionProblems(back, form({ conforme: 'oui', constat: finalReport({ etat: 'STABLE', manipulation: 'LIBRE', alterations: [], observations: 'Constat au retour du prêt, sans changement' }) }), TODAY), []);
    const sent = movementBody('RETOURNEE', 3, form({ conforme: 'oui', constat: finalReport({ etat: 'STABLE', manipulation: 'LIBRE', alterations: [], observations: 'Constat au retour du prêt, sans changement' }) }), back);
    assert.equal(sent.conforme, true); assert.equal(sent.constat.etat, 'STABLE'); assert.ok(!('contexte' in sent.constat));
    // Sans dossier, un retour conforme n'envoie aucun constat.
    assert.ok(!('constat' in movementBody('RETOURNEE', 3, form({ conforme: 'oui' }), option({ vers: 'RETOURNEE', conformiteRequise: true }))));
});
