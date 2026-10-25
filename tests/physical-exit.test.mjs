import test from 'node:test';
import assert from 'node:assert/strict';
import { NEXT_STEPS, STATUS_FILTERS, emptyRequestForm, emptyTransitionForm, eventSummary, exitNeeds, exitOptions, isOpen, lateText, listParams, needsForm, requestBody, requestProblems, statusLabel, transitionBody, transitionLabel, transitionProblems } from '../.test-build/physicalExit.js';

// La sortie d'une archive ordinaire se demande, une autre personne l'autorise, le magasin la remet puis la reprend.
const today = '2026-10-23';
const filled = (patch = {}) => ({ objet: 'Consultation', motif: 'Consultation par un chercheur accrédité', destination: 'Salle de lecture', destinataire: 'Équipe de recherche', retourPrevu: '2026-11-02', ...patch });

test('une demande dit pour quoi, pourquoi, où, pour qui et jusqu’à quand', () => {
    assert.deepEqual(requestProblems(filled(), today), []);
    assert.equal(requestProblems(emptyRequestForm(), today).length, 5, 'un formulaire vide a cinq choses à dire');
    assert.match(requestProblems(filled({ objet: '' }), today)[0], /pour quoi/);
    assert.match(requestProblems(filled({ objet: ' Rangement ' }), today)[0], /réservé/);
    assert.match(requestProblems(filled({ motif: 'court' }), today)[0], /au moins 10/);
    assert.match(requestProblems(filled({ destination: ' ' }), today)[0], /où l’archive ira/);
    assert.match(requestProblems(filled({ destinataire: '' }), today)[0], /Qui la reçoit|qui la reçoit/i);
    assert.match(requestProblems(filled({ retourPrevu: '' }), today)[0], /échéance/);
    assert.match(requestProblems(filled({ retourPrevu: '2026-10-22' }), today)[0], /passé/);
    assert.deepEqual(requestProblems(filled({ retourPrevu: today }), today), [], 'le jour même est permis');
    assert.match(requestProblems(filled({ retourPrevu: '2032-01-01' }), today)[0], /cinq ans/);
});

test('le corps de la demande est nettoyé', () => {
    assert.deepEqual(requestBody(filled({ objet: ' Prêt ', motif: '  Prêt à un service voisin  ' })), { objet: 'Prêt', motif: 'Prêt à un service voisin', destination: 'Salle de lecture', destinataire: 'Équipe de recherche', retourPrevu: '2026-11-02' });
});

const rights = (patch = {}) => ({ request: false, authorize: false, handle: false, ...patch });
const byVers = options => Object.fromEntries(options.map(o => [o.vers, o.allowed]));

test('on n’autorise pas sa propre demande et seul le demandeur annule la sienne', () => {
    const request = { statut: 'DEMANDEE', demandeParId: 'moi' };
    assert.deepEqual(byVers(exitOptions(request, rights({ request: true, authorize: true }), 'moi')), { AUTORISEE: false, REFUSEE: false, ANNULEE: true });
    assert.deepEqual(byVers(exitOptions(request, rights({ request: true, authorize: true }), 'autre')), { AUTORISEE: true, REFUSEE: true, ANNULEE: false });
    assert.deepEqual(byVers(exitOptions(request, rights(), 'autre')), { AUTORISEE: false, REFUSEE: false, ANNULEE: false });
    assert.match(exitOptions(request, rights({ authorize: true }), 'moi')[0].why, /autre personne/);
});

test('une sortie autorisée se remet par le magasin ; elle s’annule par le demandeur ou par celui qui autorise', () => {
    const request = { statut: 'AUTORISEE', demandeParId: 'moi' };
    assert.deepEqual(byVers(exitOptions(request, rights({ handle: true }), 'x')), { REMISE: true, ANNULEE: false });
    assert.deepEqual(byVers(exitOptions(request, rights({ request: true }), 'moi')), { REMISE: false, ANNULEE: true });
    assert.deepEqual(byVers(exitOptions(request, rights({ request: true }), 'autre')), { REMISE: false, ANNULEE: false }, 'un autre demandeur n’annule pas la demande d’autrui');
    assert.deepEqual(byVers(exitOptions(request, rights({ authorize: true }), 'x')), { REMISE: false, ANNULEE: true });
});

test('une archive dehors se rend ; une demande close n’a plus de passage', () => {
    assert.deepEqual(byVers(exitOptions({ statut: 'REMISE', demandeParId: 'moi' }, rights({ handle: true }), 'x')), { RETOURNEE: true });
    assert.deepEqual(byVers(exitOptions({ statut: 'REMISE', demandeParId: 'moi' }, rights({ request: true, authorize: true }), 'moi')), { RETOURNEE: false }, 'on n’annule pas une archive sortie : elle se rend');
    for (const statut of ['REFUSEE', 'ANNULEE', 'RETOURNEE']) assert.deepEqual(exitOptions({ statut, demandeParId: 'moi' }, rights({ request: true, authorize: true, handle: true }), 'moi'), []);
});

test('la remise se confirme d’un clic, les autres passages demandent un texte, des conditions ou un verdict', () => {
    assert.equal(needsForm('REMISE'), false);
    for (const vers of ['AUTORISEE', 'REFUSEE', 'ANNULEE', 'RETOURNEE']) assert.equal(needsForm(vers), true, vers);
    assert.equal(exitNeeds('REFUSEE').texteLabel, 'Motif du refus');
    assert.equal(exitNeeds('ANNULEE').texteLabel, 'Motif de l’annulation');
    assert.equal(exitNeeds('AUTORISEE').conditions, true);
    assert.equal(exitNeeds('RETOURNEE').conformite, true);
});

test('un refus et une annulation s’écrivent, un retour dit si l’archive est comme elle est partie', () => {
    const form = (patch = {}) => ({ ...emptyTransitionForm(), ...patch });
    assert.deepEqual(transitionProblems('AUTORISEE', form()), [], 'autoriser ne demande rien d’obligatoire');
    assert.equal(transitionProblems('REFUSEE', form({ texte: 'non' })).length, 1);
    assert.deepEqual(transitionProblems('REFUSEE', form({ texte: 'Archive réservée à un récolement' })), []);
    assert.equal(transitionProblems('ANNULEE', form()).length, 1);
    assert.match(transitionProblems('RETOURNEE', form())[0], /dans l’état où elle est partie/);
    assert.deepEqual(transitionProblems('RETOURNEE', form({ conforme: 'oui' })), []);
    assert.match(transitionProblems('RETOURNEE', form({ conforme: 'non', texte: 'abîmée' }))[0], /anomalie/);
    assert.deepEqual(transitionProblems('RETOURNEE', form({ conforme: 'non', texte: 'Déchirure en marge de la page douze' })), []);
    assert.deepEqual(transitionProblems('REMISE', form()), []);
});

test('le corps d’un passage n’envoie que ce qui sert', () => {
    const form = (patch = {}) => ({ ...emptyTransitionForm(), ...patch });
    assert.deepEqual(transitionBody('REMISE', 3, form({ texte: 'ignoré' })), { vers: 'REMISE', expectedVersion: 3 });
    assert.deepEqual(transitionBody('AUTORISEE', 1, form({ conditions: ' Gants exigés ', texte: 'ignoré' })), { vers: 'AUTORISEE', expectedVersion: 1, conditions: 'Gants exigés' });
    assert.deepEqual(transitionBody('AUTORISEE', 1, form()), { vers: 'AUTORISEE', expectedVersion: 1 });
    assert.deepEqual(transitionBody('REFUSEE', 2, form({ texte: ' Pas disponible ce mois-ci ' })), { vers: 'REFUSEE', expectedVersion: 2, texte: 'Pas disponible ce mois-ci' });
    assert.deepEqual(transitionBody('RETOURNEE', 4, form({ conforme: 'oui' })), { vers: 'RETOURNEE', expectedVersion: 4, conforme: true });
    assert.deepEqual(transitionBody('RETOURNEE', 4, form({ conforme: 'non', texte: ' Déchirure en marge ' })), { vers: 'RETOURNEE', expectedVersion: 4, conforme: false, texte: 'Déchirure en marge' });
    assert.deepEqual(transitionBody('RETOURNEE', 4, form()), { vers: 'RETOURNEE', expectedVersion: 4 });
});

test('la file se filtre par regroupement ou par étape, avec la recherche', () => {
    assert.deepEqual(listParams({ statut: 'OUVERTES', q: '' }), { ouvertes: 'true' });
    assert.deepEqual(listParams({ statut: 'EN_RETARD', q: ' DP-01 ' }), { enRetard: 'true', q: 'DP-01' });
    assert.deepEqual(listParams({ statut: 'REMISE', q: '' }), { statut: 'REMISE' });
    assert.deepEqual(listParams({ statut: '', q: '' }), {});
    assert.equal(STATUS_FILTERS.length, 8, 'deux regroupements et six étapes');
});

test('un retard se dit en jours, et le jour prévu n’en est pas un', () => {
    assert.equal(lateText({ enRetard: false, retourPrevu: '2026-10-01' }, today), '');
    assert.equal(lateText({ enRetard: true, retourPrevu: '2026-10-20' }, today), 'En retard de 3 jours');
    assert.equal(lateText({ enRetard: true, retourPrevu: '2026-10-22' }, today), 'En retard d’un jour');
});

test('les libellés sont en toutes lettres', () => {
    assert.equal(statusLabel('RETOURNEE'), 'Rendue');
    assert.equal(statusLabel(null), '—');
    assert.equal(transitionLabel('REMISE'), 'Remettre l’archive');
    assert.equal(eventSummary('AUTORISATION'), 'Sortie autorisée');
    assert.equal(eventSummary('INCONNU'), 'INCONNU');
    assert.equal(isOpen('REMISE'), true);
    assert.equal(isOpen('RETOURNEE'), false);
    for (const status of Object.keys(NEXT_STEPS)) assert.ok(NEXT_STEPS[status].length > 10, status);
});
