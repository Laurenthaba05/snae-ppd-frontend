import test from 'node:test';
import assert from 'node:assert/strict';
import { ACCESS_STATE_LABELS, ACCESS_FILTERS, accessStateLabel, accessTone, isPendingRequest, accessMotiveProblems, documentAction, documentsText, emptyGrantForm, grantProblems, grantBody, messageProblems, messageBody, accessJournalText } from '../.test-build/portal.js';

const req = (patch = {}) => ({ id: 'q1', numero: 'ACC-2026-000001', documentId: 'doc1', documentTitre: 'Registre sous réserve', noticeId: 'n1', noticeIntitule: 'Registre', motif: 'Recherche sur l’état civil colonial', statut: 'DEPOSEE', etat: 'DEPOSEE',
    deposeLe: '2026-10-05T09:00:00Z', decideLe: null, message: null, accordeJusquAu: null, annuleLe: null, peutAnnuler: true, ...patch });
const free = { id: 'doc1', acces: 'LIBRE' };
const onRequest = { id: 'doc1', acces: 'SUR_DEMANDE' };

test('Les états d’une demande d’accès, leurs tons et leurs filtres', () => {
    assert.equal(accessStateLabel('EXPIREE'), 'Expirée'); assert.equal(accessStateLabel(null), '—'); assert.equal(accessStateLabel('AUTRE'), 'AUTRE');
    assert.equal(Object.keys(ACCESS_STATE_LABELS).length, 7);
    assert.equal(accessTone('ACCORDEE'), 'ok'); assert.equal(accessTone('DEPOSEE'), 'warn'); assert.equal(accessTone('EN_INSTRUCTION'), 'warn'); assert.equal(accessTone('REFUSEE'), 'bad'); assert.equal(accessTone('EXPIREE'), 'bad'); assert.equal(accessTone('ANNULEE'), '');
    assert.deepEqual(ACCESS_FILTERS.slice(0, 2), [['OUVERTES', 'À traiter'], ['ACTIFS', 'Accès en cours']]);
    assert.ok(!ACCESS_FILTERS.some(([k]) => k === 'EXPIREE')); assert.equal(ACCESS_FILTERS.length, 2 + 6);
    assert.equal(isPendingRequest({ statut: 'DEPOSEE' }), true); assert.equal(isPendingRequest({ statut: 'EN_INSTRUCTION' }), true); assert.equal(isPendingRequest({ statut: 'ACCORDEE' }), false);
    assert.equal(accessJournalText('DEPOT'), 'Demande déposée'); assert.equal(accessJournalText('REVOCATION'), 'Accès révoqué'); assert.equal(accessJournalText('AUTRE'), 'AUTRE');
});

test('Le motif d’une demande d’accès se dit par écrit', () => {
    assert.equal(accessMotiveProblems('court').length, 1);
    assert.deepEqual(accessMotiveProblems('Recherche sur l’état civil colonial de Kankan'), []);
    assert.deepEqual(accessMotiveProblems('x'.repeat(20)), []); assert.equal(accessMotiveProblems(' '.repeat(30)).length, 1);
});

test('Un document libre se lit abonné, sinon on se connecte ou on s’abonne', () => {
    assert.equal(documentAction(free, 'ABONNE', []).kind, 'LIRE'); assert.equal(documentAction(free, 'ANONYME', []).kind, 'CONNEXION');
    assert.equal(documentAction(free, 'SANS_ABONNEMENT', []).kind, 'ABONNEMENT'); assert.equal(documentAction(free, 'EN_ATTENTE', []).kind, 'VOIR_DEMANDE');
    assert.equal(documentAction(free, 'ABONNE', [req()]).note, null);
    assert.equal(documentAction({ id: 'doc1' }, 'ABONNE', []).kind, 'LIRE'); // un serveur plus ancien ne dit pas l’accès : lecture libre
});

test('Un document sur demande se demande abonné, attend la réponse, et se lit une fois l’accès accordé', () => {
    assert.deepEqual(documentAction(onRequest, 'ABONNE', []), { kind: 'DEMANDER', request: null, note: null });
    assert.equal(documentAction(onRequest, 'ANONYME', []).kind, 'CONNEXION'); assert.equal(documentAction(onRequest, 'SANS_ABONNEMENT', []).kind, 'ABONNEMENT'); assert.equal(documentAction(onRequest, 'EN_ATTENTE', []).kind, 'VOIR_DEMANDE');
    const waiting = documentAction(onRequest, 'ABONNE', [req()]);
    assert.equal(waiting.kind, 'EN_COURS'); assert.match(waiting.note, /attend d’être prise en charge/);
    assert.match(documentAction(onRequest, 'ABONNE', [req({ statut: 'EN_INSTRUCTION', etat: 'EN_INSTRUCTION' })]).note, /l’institution l’instruit/);
    const granted = req({ statut: 'ACCORDEE', etat: 'ACCORDEE', accordeJusquAu: '2026-11-06T00:00:00Z' });
    const reading = documentAction(onRequest, 'ABONNE', [granted]);
    assert.equal(reading.kind, 'LIRE'); assert.equal(reading.note, 'Accès accordé jusqu’au 5 novembre 2026.');
    // Un accès accordé ne remplace pas l’abonnement.
    assert.equal(documentAction(onRequest, 'SANS_ABONNEMENT', [granted]).kind, 'ABONNEMENT'); assert.equal(documentAction(onRequest, 'ANONYME', [granted]).kind, 'CONNEXION');
});

test('Après un refus, une révocation ou une expiration, on peut redemander, avec ce qui s’est passé', () => {
    const refused = documentAction(onRequest, 'ABONNE', [req({ statut: 'REFUSEE', etat: 'REFUSEE', message: 'Le document est encore sous réserve' })]);
    assert.equal(refused.kind, 'DEMANDER'); assert.equal(refused.note, 'Votre dernière demande a été refusée : Le document est encore sous réserve');
    assert.equal(documentAction(onRequest, 'ABONNE', [req({ statut: 'REFUSEE', etat: 'REFUSEE' })]).note, 'Votre dernière demande a été refusée.');
    assert.equal(documentAction(onRequest, 'ABONNE', [req({ statut: 'REVOQUEE', etat: 'REVOQUEE', message: 'Usage non conforme' })]).note, 'Votre accès a été révoqué : Usage non conforme');
    const expired = documentAction(onRequest, 'ABONNE', [req({ statut: 'ACCORDEE', etat: 'EXPIREE', accordeJusquAu: '2026-09-01T00:00:00Z' })]);
    assert.equal(expired.kind, 'DEMANDER'); assert.equal(expired.note, 'Votre accès a expiré le 31 août 2026.');
    assert.equal(documentAction(onRequest, 'ABONNE', [req({ statut: 'ANNULEE', etat: 'ANNULEE' })]).note, null);
    // Seule la demande du document concerné compte.
    assert.equal(documentAction(onRequest, 'ABONNE', [req({ documentId: 'autre' })]).kind, 'DEMANDER');
});

test('Le catalogue dit combien de documents se lisent, et combien se demandent', () => {
    assert.equal(documentsText({ documents: 2, surDemande: 1 }), '2 documents à lire, 1 sur demande'); assert.equal(documentsText({ documents: 1, surDemande: 0 }), '1 document à lire');
    assert.equal(documentsText({ documents: 0, surDemande: 2 }), '2 sur demande'); assert.equal(documentsText({ documents: 0, surDemande: 0 }), 'Notice seule');
});

test('Un accès s’accorde jusqu’à un jour à venir, pour un an au plus, avec un message facultatif', () => {
    assert.equal(emptyGrantForm('2026-10-05').jusquAu, '2026-11-04');
    assert.deepEqual(grantProblems({ jusquAu: '2026-11-04', message: '' }, '2026-10-05'), []);
    assert.deepEqual(grantProblems({ jusquAu: '', message: '' }, '2026-10-05'), ['Indiquez jusqu’à quand l’accès est accordé.']);
    assert.deepEqual(grantProblems({ jusquAu: '2026-10-05', message: '' }, '2026-10-05'), ['L’accès est accordé jusqu’à un jour à venir.']);
    assert.deepEqual(grantProblems({ jusquAu: '2027-10-05', message: '' }, '2026-10-05'), []);
    assert.deepEqual(grantProblems({ jusquAu: '2027-10-06', message: '' }, '2026-10-05'), ['Un accès s’accorde pour un an au plus.']);
    assert.deepEqual(grantBody({ jusquAu: '2026-11-04', message: '  Accès accordé pour votre thèse ' }), { jusquAu: '2026-11-04', message: 'Accès accordé pour votre thèse' });
    assert.deepEqual(grantBody({ jusquAu: '2026-11-04', message: ' ' }), { jusquAu: '2026-11-04' });
});

test('Refuser ou révoquer exige un message pour le lecteur', () => {
    assert.equal(messageProblems('court').length, 1); assert.deepEqual(messageProblems('Le document est encore sous réserve'), []);
    assert.deepEqual(messageBody('  Le document est encore sous réserve '), { message: 'Le document est encore sous réserve' });
});
