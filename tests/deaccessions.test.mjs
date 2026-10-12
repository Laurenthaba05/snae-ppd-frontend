import test from 'node:test';
import assert from 'node:assert/strict';
import {
    RULE_TEXTS, approvalProblems, examinationProblems, executionProblems, natureLabel, proposableNatures, proposalProblems, statusLabel, valueText, waitingFor
} from '../.test-build/deaccessions.js';

const today = '2026-10-12';
const ok = { nature: 'TRANSFERT', motif: 'ECHANGE', justification: 'Le registre est cédé en échange d’une série complète détenue par le musée partenaire.', destinataire: 'Musée partenaire', valeurVenale: '', devise: '', valeurSource: '' };

test('Les natures et les états se disent en français, un inconnu ne se déguise pas', () => {
    assert.equal(natureLabel('RESTITUTION'), 'Restitution');
    assert.equal(natureLabel('TRANSFERT'), 'Transfert à un autre détenteur');
    assert.equal(natureLabel('?'), 'Nature inconnue');
    assert.equal(statusLabel('EXECUTEE'), 'Exécutée');
    assert.equal(statusLabel('?'), 'État inconnu');
    assert.match(waitingFor('PROPOSEE'), /autre personne que celle qui a proposé/);
    assert.match(waitingFor('APPROUVEE'), /autre que celle qui a décidé/);
});

test('Une proposition nomme sa nature, son motif, sa justification et son destinataire', () => {
    assert.deepEqual(proposalProblems(ok), []);
    assert.equal(proposalProblems({ ...ok, nature: '' }).length, 1);
    assert.equal(proposalProblems({ ...ok, motif: '' }).length, 1);
    assert.equal(proposalProblems({ ...ok, justification: 'court' }).length, 1);
    assert.equal(proposalProblems({ ...ok, destinataire: '' }).length, 1);
    // une disparition n'a pas de destinataire
    assert.deepEqual(proposalProblems({ ...ok, nature: 'DISPARITION', destinataire: '' }), []);
});

test('La valeur vénale se donne avec sa devise et sa source, ou pas du tout', () => {
    assert.deepEqual(proposalProblems({ ...ok, valeurVenale: '2500000,50', devise: 'GNF', valeurSource: 'Expertise du 3 février 2026' }), []);
    assert.equal(proposalProblems({ ...ok, valeurVenale: '2500000', devise: '', valeurSource: 'Expertise du 3 février 2026' }).length, 1);
    assert.equal(proposalProblems({ ...ok, valeurVenale: '', devise: 'GNF', valeurSource: 'Expertise du 3 février 2026' }).length, 1);
    assert.equal(proposalProblems({ ...ok, valeurVenale: '2500000', devise: 'GNF', valeurSource: '' }).length, 1);
    assert.equal(proposalProblems({ ...ok, valeurVenale: '-3', devise: 'GNF', valeurSource: 'Expertise du 3 février 2026' }).length, 1);
    assert.equal(proposalProblems({ ...ok, valeurVenale: '1.234', devise: 'GNF', valeurSource: 'Expertise du 3 février 2026' }).length, 1);
});

test('L’examen, l’approbation et l’exécution se contrôlent avant l’envoi', () => {
    assert.deepEqual(examinationProblems('Titre de propriété vérifié, aucune clause de dépôt, accord écrit obtenu.'), []);
    assert.equal(examinationProblems('court').length, 1);
    assert.deepEqual(approvalProblems({ reference: 'Décision 2026/14', date: '2026-10-01' }, today), []);
    assert.equal(approvalProblems({ reference: '', date: '2026-10-01' }, today).length, 1);
    assert.equal(approvalProblems({ reference: 'Décision 2026/14', date: '2026-10-13' }, today).length, 1);
    assert.deepEqual(executionProblems({ dateSortie: '2026-10-05', acteReference: 'PV de remise 7' }, today, '2026-10-01'), []);
    assert.equal(executionProblems({ dateSortie: '2026-09-30', acteReference: 'PV de remise 7' }, today, '2026-10-01').length, 1);
    assert.equal(executionProblems({ dateSortie: '2026-10-20', acteReference: 'PV de remise 7' }, today, '2026-10-01').length, 1);
    assert.equal(executionProblems({ dateSortie: '2026-10-05', acteReference: '' }, today, null).length, 1);
});

test('Les natures proposables sont celles sans obstacle', () => {
    const obstacles = { RESTITUTION: [], TRANSFERT: [{ code: 'NOT_OWNED', message: 'x' }], DISPARITION: [] };
    assert.deepEqual(proposableNatures(obstacles), ['RESTITUTION', 'DISPARITION']);
    assert.deepEqual(proposableNatures({ RESTITUTION: [{ code: 'A', message: 'x' }], TRANSFERT: [{ code: 'A', message: 'x' }], DISPARITION: [{ code: 'A', message: 'x' }] }), []);
});

test('Le montant et sa devise se lisent ensemble', () => {
    assert.equal(valueText(null, null), null);
    assert.match(valueText(2500000, 'GNF'), /2\s?500\s?000 GNF/);
    assert.match(valueText(10.5, null), /^10,5$/);
});

test('Les règles du serveur ont leur texte', () => {
    for (const code of ['HERITAGE_DEACCESSION_NOT_OWNED', 'HERITAGE_DEACCESSION_BLOCKED', 'HERITAGE_ASSET_EXITED', 'ck_sortie_execution', 'uq_sortie_collection_ouverte']) assert.ok(RULE_TEXTS[code], code);
});
