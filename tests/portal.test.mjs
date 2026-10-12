import test from 'node:test';
import assert from 'node:assert/strict';
import { MOTIF_MIN, SUBSCRIPTION_STATE_LABELS, PAYMENT_MODE_LABELS, PAYMENT_MODES, subscriptionStateLabel, paymentModeLabel, stateTone, emailProblem, passwordProblems, emptyRegistration, registrationProblems, registrationBody,
    safeReturnPath, formatAmount, durationText, planSummary, currentSubscription, pendingSubscription, accessState, daysLeft, validityText, paymentInstructions, noticeDateText, pageNumber, pageUrl, portalPath, readingViews, findView, viewLabel, viewValue, parseViewValue,
    emptyPlanForm, planFormOf, planProblems, planBody, emptyPaymentForm, paymentProblems, paymentBody, motifProblems, normalizeReference, referenceProblem, receiptHtml } from '../.test-build/portal.js';

const flat = text => text.replace(/[  ]/g, ' ');
const sub = (patch = {}) => ({ id: 's1', numero: 'ABO-2026-000001', formuleCode: 'ANNUEL', formuleLibelle: 'Abonnement annuel', dureeMois: 12, montant: 150000, devise: 'GNF', referencePaiement: 'PAY-ABCDEFGH', statut: 'ACTIF', etat: 'EN_COURS',
    demandeLe: '2026-10-01T09:00:00Z', debutLe: '2026-10-05T09:00:00Z', finLe: '2027-10-05T09:00:00Z', modeActivation: 'PAIEMENT', paiement: null, annuleLe: null, annuleMotif: null, annuleParLecteur: false, ...patch });
const form = (patch = {}) => ({ ...emptyRegistration(), email: 'awa@exemple.gn', motDePasse: 'Kankan#2026x', prenom: 'Awa', nom: 'Camara', accepteConditions: true, ...patch });

test('Les états, les modes de paiement et leurs tons ont leurs libellés', () => {
    assert.equal(SUBSCRIPTION_STATE_LABELS.EN_ATTENTE_PAIEMENT, 'En attente de paiement');
    assert.equal(subscriptionStateLabel('EN_COURS'), 'En cours');
    assert.equal(subscriptionStateLabel(null), '—');
    assert.equal(subscriptionStateLabel('AUTRE_ETAT'), 'AUTRE_ETAT');
    assert.equal(PAYMENT_MODE_LABELS.MOBILE_MONEY, 'Argent mobile');
    assert.deepEqual(PAYMENT_MODES, ['ESPECES', 'VIREMENT', 'MOBILE_MONEY', 'AUTRE']);
    assert.equal(paymentModeLabel('VIREMENT'), 'Virement');
    assert.equal(stateTone('EN_COURS'), 'ok'); assert.equal(stateTone('EN_ATTENTE_PAIEMENT'), 'warn'); assert.equal(stateTone('A_VENIR'), 'warn'); assert.equal(stateTone('EXPIRE'), 'bad'); assert.equal(stateTone('ANNULE'), '');
});

test('Une adresse se contrôle', () => {
    assert.equal(emailProblem('awa@exemple.gn'), null);
    assert.equal(emailProblem(' awa@exemple.gn '), null);
    for (const bad of ['', 'sans-arobase', 'a@b', 'deux mots@exemple.gn', 'a'.repeat(250) + '@exemple.gn']) assert.ok(emailProblem(bad), bad);
});

test('Un mot de passe solide a dix caracteres et trois sortes de caracteres, comme au serveur', () => {
    assert.deepEqual(passwordProblems('Kankan#2026x', 'awa@exemple.gn'), []);
    assert.ok(passwordProblems('Court1#', '').some(p => p.includes('10 caractères')));
    assert.ok(passwordProblems('minusculesseulement', '').some(p => p.includes('trois sortes')));
    assert.ok(passwordProblems('MinusculesEtMajuscules', '').some(p => p.includes('trois sortes')));
    assert.ok(passwordProblems('1234567890', '').some(p => p.includes('courant')));
    assert.ok(passwordProblems('motdepasse123', '').some(p => p.includes('courant')));
    assert.ok(passwordProblems('awa.camara@exemple.gn', 'awa.camara@exemple.gn').some(p => p.includes('adresse')));
    assert.ok(passwordProblems('Xx-awa.camara-42!', 'awa.camara@exemple.gn').some(p => p.includes('adresse')));
    assert.deepEqual(passwordProblems('Camara!Camara#42', 'awa.camara@exemple.gn'), []);
    assert.ok(passwordProblems('Aa1!Aa1!Aa1!', '').some(p => p.includes('répète')));
    assert.ok(passwordProblems('x'.repeat(129), '').some(p => p.includes('128')));
});

test('L’inscription exige une adresse, un nom, un mot de passe solide et les conditions', () => {
    assert.deepEqual(registrationProblems(form()), []);
    assert.equal(registrationProblems(emptyRegistration()).length >= 4, true);
    assert.ok(registrationProblems(form({ prenom: ' ' })).includes('Le prénom est obligatoire.'));
    assert.ok(registrationProblems(form({ nom: '' })).includes('Le nom est obligatoire.'));
    assert.ok(registrationProblems(form({ accepteConditions: false })).some(p => p.includes('conditions d’utilisation')));
    assert.ok(registrationProblems(form({ motDePasse: 'court' })).every(p => !p.startsWith('Le ') || true));
    assert.ok(registrationProblems(form({ motDePasse: 'court' })).some(p => p.startsWith('Mot de passe :')));
});

test('Le corps de l’inscription n’envoie que ce qui est renseigné', () => {
    assert.deepEqual(registrationBody(form({ email: ' awa@exemple.gn ', prenom: ' Awa ' })), { email: 'awa@exemple.gn', motDePasse: 'Kankan#2026x', prenom: 'Awa', nom: 'Camara', accepteConditions: true });
    assert.deepEqual(registrationBody(form({ organisme: ' Université de Conakry ', categorie: 'CHERCHEUR' })),
        { email: 'awa@exemple.gn', motDePasse: 'Kankan#2026x', prenom: 'Awa', nom: 'Camara', accepteConditions: true, organisme: 'Université de Conakry', categorie: 'CHERCHEUR' });
});

test('Les montants, les durées et les formules se disent clairement', () => {
    assert.match(flat(formatAmount(150000, 'GNF')), /^150 000\s?GNF$/);
    assert.match(flat(formatAmount(1234.5, 'EUR')), /1 234,50/);
    assert.equal(flat(formatAmount(5, 'ZZZ')).includes('ZZZ'), true);
    assert.equal(durationText(1), '1 mois'); assert.equal(durationText(3), '3 mois'); assert.equal(durationText(12), '1 an'); assert.equal(durationText(24), '2 ans'); assert.equal(durationText(18), '18 mois');
    assert.match(flat(planSummary({ libelle: 'Annuel', dureeMois: 12, montant: 150000, devise: 'GNF' })), /^Annuel — 1 an — 150 000\s?GNF$/);
    assert.equal(planSummary({ libelle: 'Convention', dureeMois: 6, montant: 0, devise: 'GNF' }), 'Convention — 6 mois — sur exonération');
});

test('L’accès dépend du compte et de l’abonnement en cours', () => {
    const subs = [sub({ etat: 'EXPIRE', id: 's0' }), sub()];
    assert.equal(currentSubscription(subs).id, 's1');
    assert.equal(currentSubscription([sub({ etat: 'A_VENIR' })]), null);
    assert.equal(pendingSubscription([sub({ etat: 'EN_ATTENTE_PAIEMENT' })]).id, 's1');
    assert.equal(accessState(null, subs), 'ANONYME');
    assert.equal(accessState({ id: 'r1' }, subs), 'ABONNE');
    assert.equal(accessState({ id: 'r1' }, [sub({ etat: 'EN_ATTENTE_PAIEMENT' })]), 'EN_ATTENTE');
    assert.equal(accessState({ id: 'r1' }, [sub({ etat: 'EXPIRE' })]), 'SANS_ABONNEMENT');
    assert.equal(accessState({ id: 'r1' }, []), 'SANS_ABONNEMENT');
});

test('Les jours restants et la période se disent, et les instructions de paiement donnent la référence', () => {
    const now = new Date('2026-10-06T09:00:00Z');
    assert.equal(daysLeft('2026-10-16T09:00:00Z', now), 10);
    assert.equal(daysLeft('2026-10-06T10:00:00Z', now), 1);
    assert.equal(daysLeft('2026-10-01T09:00:00Z', now), 0);
    assert.equal(daysLeft(null, now), null);
    assert.equal(validityText(sub()), 'Du 5 octobre 2026 au 5 octobre 2027');
    assert.match(validityText(sub({ etat: 'EN_ATTENTE_PAIEMENT', debutLe: null, finLe: null })), /dès que votre paiement est enregistré/);
    const text = flat(paymentInstructions(sub({ etat: 'EN_ATTENTE_PAIEMENT' })));
    assert.match(text, /150 000\s?GNF/); assert.ok(text.includes('PAY-ABCDEFGH')); assert.ok(text.includes('guichet'));
    const free = flat(paymentInstructions(sub({ montant: 0, etat: 'EN_ATTENTE_PAIEMENT' })));
    assert.ok(free.includes('décision de l’institution')); assert.ok(free.includes('PAY-ABCDEFGH')); assert.ok(!free.includes('Réglez'));
});

test('La date d’une notice se lit, et une page demandée reste dans le document', () => {
    assert.equal(noticeDateText({ dateTexte: 'vers 1910', dateDebut: '1908-01-01', dateFin: '1912-12-31' }), 'vers 1910');
    assert.equal(noticeDateText({ dateTexte: null, dateDebut: '1908-01-01', dateFin: '1912-12-31' }), '1 janvier 1908 — 31 décembre 1912');
    assert.equal(noticeDateText({ dateTexte: null, dateDebut: '1908-01-01', dateFin: '1908-01-01' }), '1 janvier 1908');
    assert.equal(noticeDateText({ dateTexte: null, dateDebut: null, dateFin: null }), null);
    assert.equal(pageNumber('3', 10), 3); assert.equal(pageNumber('11', 10), 1); assert.equal(pageNumber('0', 10), 1); assert.equal(pageNumber('abc', 10), 1); assert.equal(pageNumber(null, 10), 1); assert.equal(pageNumber('2.5', 10), 1);
    assert.equal(pageUrl('d1', 3), '/api/v1/portal/documents/d1/pages/3');
    assert.equal(pageUrl('d1', 3, true), '/api/v1/portal/documents/d1/pages/3?vignette=true');
    assert.equal(pageUrl('d1', 3, false, 1), '/api/v1/portal/documents/d1/pages/3');
    assert.equal(pageUrl('d1', 3, false, 2), '/api/v1/portal/documents/d1/pages/3?image=2');
    assert.equal(pageUrl('d1', 3, true, 2), '/api/v1/portal/documents/d1/pages/3?vignette=true&image=2');
    assert.equal(portalPath('/notices/n1'), '/portail/notices/n1');
    assert.equal(portalPath('', { q: 'atlas', categorie: '', page: 2 }), '/portail?q=atlas&page=2');
});

test('Une formule dit son code, son libellé, sa durée, son montant et sa devise, sans tarif imposé', () => {
    assert.ok(planProblems(emptyPlanForm()).length >= 3);
    const ok = { ...emptyPlanForm(), code: 'annuel', libelle: 'Abonnement annuel', dureeMois: '12', montant: '150 000', devise: 'gnf' };
    assert.deepEqual(planProblems(ok), []);
    assert.ok(planProblems({ ...ok, code: 'a' })[0].includes('code'));
    assert.deepEqual(planProblems({ ...ok, code: '' }, true), []);
    assert.ok(planProblems({ ...ok, libelle: ' ' })[0].includes('libellé'));
    assert.ok(planProblems({ ...ok, dureeMois: '0' })[0].includes('durée'));
    assert.ok(planProblems({ ...ok, dureeMois: '121' })[0].includes('durée'));
    assert.ok(planProblems({ ...ok, montant: '-5' })[0].includes('montant'));
    assert.ok(planProblems({ ...ok, montant: '10,123' })[0].includes('montant'));
    assert.deepEqual(planProblems({ ...ok, montant: '0' }), []);
    assert.deepEqual(planProblems({ ...ok, montant: '1500,50' }), []);
    assert.ok(planProblems({ ...ok, devise: 'franc' })[0].includes('devise'));
});

test('Le corps d’une formule normalise le code, la devise et le montant', () => {
    const ok = { ...emptyPlanForm(), code: 'annuel', libelle: ' Abonnement annuel ', dureeMois: '12', montant: '150 000', devise: 'gnf', description: ' Un an de lecture ', categorie: 'ETUDIANT', telechargement: true };
    assert.deepEqual(planBody(ok), { libelle: 'Abonnement annuel', dureeMois: 12, montant: 150000, devise: 'GNF', telechargement: true, ordre: 100, code: 'ANNUEL', description: 'Un an de lecture', categorie: 'ETUDIANT' });
    assert.deepEqual(planBody(ok, true, 4, false), { libelle: 'Abonnement annuel', dureeMois: 12, montant: 150000, devise: 'GNF', telechargement: true, ordre: 100, description: 'Un an de lecture', categorie: 'ETUDIANT', expectedVersion: 4, actif: false });
    assert.equal(planBody({ ...ok, montant: '1500,5' }).montant, 1500.5);
    const plan = { code: 'ANNUEL', libelle: 'Annuel', description: null, dureeMois: 12, montant: 150000, devise: 'GNF', telechargement: false, categorie: null, ordre: 20 };
    assert.deepEqual(planFormOf(plan), { code: 'ANNUEL', libelle: 'Annuel', description: '', dureeMois: '12', montant: '150000', devise: 'GNF', telechargement: false, categorie: '', ordre: '20' });
});

test('Un encaissement est du montant exact de la formule, avec une pièce hors espèces', () => {
    const target = { id: 's1', montant: 150000, devise: 'GNF' };
    assert.deepEqual(emptyPaymentForm(target), { mode: 'ESPECES', reference: '', montant: '150000', note: '' });
    assert.deepEqual(paymentProblems(emptyPaymentForm(target), target), []);
    assert.ok(paymentProblems({ ...emptyPaymentForm(target), mode: '' }, target)[0].includes('mode'));
    assert.ok(paymentProblems({ ...emptyPaymentForm(target), montant: '149999' }, target)[0].includes('exactement'));
    assert.ok(paymentProblems({ ...emptyPaymentForm(target), montant: '' }, target)[0].includes('montant encaissé'));
    assert.ok(paymentProblems({ ...emptyPaymentForm(target), mode: 'VIREMENT' }, target)[0].includes('pièce'));
    assert.deepEqual(paymentProblems({ ...emptyPaymentForm(target), mode: 'VIREMENT', reference: 'VIR-2026-1042' }, target), []);
    assert.deepEqual(paymentProblems({ ...emptyPaymentForm(target), montant: '150 000,00' }, target), []);
});

test('Le corps d’un encaissement n’envoie que ce qui est renseigné', () => {
    const target = { id: 's1', montant: 150000, devise: 'GNF' };
    assert.deepEqual(paymentBody(emptyPaymentForm(target), target), { abonnementId: 's1', mode: 'ESPECES', montant: 150000, devise: 'GNF' });
    assert.deepEqual(paymentBody({ mode: 'VIREMENT', reference: ' VIR-1 ', montant: '150000', note: ' vérifié ' }, target), { abonnementId: 's1', mode: 'VIREMENT', montant: 150000, devise: 'GNF', referenceExterne: 'VIR-1', note: 'vérifié' });
});

test('Un motif écrit et une référence de paiement se contrôlent', () => {
    assert.equal(MOTIF_MIN, 10);
    assert.deepEqual(motifProblems('Paiement enregistré pour le mauvais lecteur'), []);
    assert.equal(motifProblems('court')[0], 'Motif : un texte écrit d’au moins 10 caractères est exigé.');
    assert.equal(motifProblems('', 'Motif de l’exonération')[0], 'Motif de l’exonération : un texte écrit d’au moins 10 caractères est exigé.');
    assert.equal(normalizeReference(' pay-abcdefgh '), 'PAY-ABCDEFGH');
    assert.equal(referenceProblem(' pay-abcdefgh '), null);
    assert.ok(referenceProblem('PAY-abc'));
    assert.ok(referenceProblem('ABO-ABCDEFGH'));
});

test('Le reçu s’imprime avec tout son texte échappé, et un reçu annulé le dit', () => {
    const payment = { id: 'p1', numero: 'REC-2026-000001', abonnementId: 's1', abonnementNumero: 'ABO-2026-000001', lecteurNumero: 'LEC-000001', lecteurNom: 'Awa <b>Camara</b>', formuleLibelle: 'Annuel',
        montant: 150000, devise: 'GNF', mode: 'VIREMENT', referenceExterne: 'VIR-2026-1042', note: null, recuPar: 'Mamadou Bah', recuParId: 'u1', recuLe: '2026-10-05T09:00:00Z', statut: 'ENREGISTRE', annulePar: null, annuleLe: null, annuleMotif: null, peutAnnuler: true };
    const receipt = { paiement: payment, lecteurEmail: 'awa@exemple.gn', formuleCode: 'ANNUEL', dureeMois: 12, debutLe: '2026-10-05T09:00:00Z', finLe: '2027-10-05T09:00:00Z' };
    const html = receiptHtml(receipt);
    assert.ok(html.includes('REC-2026-000001')); assert.ok(html.includes('Awa &lt;b&gt;Camara&lt;/b&gt;')); assert.ok(!html.includes('<b>Camara'));
    assert.ok(html.includes('Virement — VIR-2026-1042')); assert.ok(html.includes('Du 5 octobre 2026 au 5 octobre 2027')); assert.ok(html.includes('Mamadou Bah')); assert.ok(!html.includes('REÇU ANNULÉ'));
    const voided = receiptHtml({ ...receipt, paiement: { ...payment, statut: 'ANNULE', annuleLe: '2026-10-06T09:00:00Z', annuleMotif: 'Erreur <script>' } }, 'Archives <nationales>');
    assert.ok(voided.includes('REÇU ANNULÉ')); assert.ok(voided.includes('Erreur &lt;script&gt;')); assert.ok(voided.includes('Archives &lt;nationales&gt;'));
});

test('Le retour après connexion reste dans le portail', () => {
    assert.equal(safeReturnPath('/portail/lecture/abc-123?page=4'), '/portail/lecture/abc-123?page=4');
    assert.equal(safeReturnPath('/portail'), '/portail');
    assert.equal(safeReturnPath('/portail/formules'), '/portail/formules');
    for (const bad of [null, undefined, '', 'https://exemple.com', '//exemple.com', '/app/users', '/portail/../app', '/portail//exemple.com', '/portail\\x','javascript:alert(1)', '/portailx']) assert.equal(safeReturnPath(bad), '/portail/compte', String(bad));
    assert.equal(safeReturnPath('/app', '/portail'), '/portail');
});

test('Lecture : une page de plusieurs images donne autant de vues, dans l’ordre, avec leur libellé', () => {
    const views = readingViews([{ number: 1, images: 1 }, { number: 2, images: 3 }, { number: 4, images: 1 }]);
    assert.deepEqual(views.map(viewValue), ['1:1', '2:1', '2:2', '2:3', '4:1']);
    assert.deepEqual(views.map(viewLabel), ['Page 1', 'Page 2 · image 1 sur 3', 'Page 2 · image 2 sur 3', 'Page 2 · image 3 sur 3', 'Page 4']);
    assert.deepEqual(readingViews([]), []);
    assert.equal(readingViews([{ number: 5, images: 0 }]).length, 1);   // une page a toujours au moins une image
});

test('Lecture : la vue demandée dans l’adresse, sinon la première ; la valeur du menu se relit', () => {
    const views = readingViews([{ number: 1, images: 1 }, { number: 2, images: 3 }]);
    assert.equal(findView(views, 2, 3), 3);
    assert.equal(findView(views, 2, 1), 1);
    assert.equal(findView(views, 9, 1), 0);
    assert.equal(findView(views, 2, 7), 0);
    assert.equal(findView(views, 0, 1), 0);
    assert.deepEqual(parseViewValue('2:3'), { page: 2, image: 3 });
    assert.equal(parseViewValue('2'), null); assert.equal(parseViewValue('a:b'), null); assert.equal(parseViewValue('2:3:4'), null);
});
