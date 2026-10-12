import test from 'node:test';
import assert from 'node:assert/strict';
import {
    CARD_LABELS, MAX_CARD_YEARS, addDays, addYears, emptyRegistration, moneyText, occupancyText, orderActions, orderBlockedText, orderBody, orderProblems, orderTotal, pieceText,
    registrationBody, registrationProblems, reservationProblems, roomProblems, slipActions, slipProblems, slipProgressText, slotFull, statisticText, statisticsSections, statisticsYears,
    tariffProblems, todayIso
} from '../.test-build/readingRoom.js';

const now = new Date('2026-10-10T09:00:00Z');
const valid = () => ({
    ...emptyRegistration(now), lastName: 'Diallo', firstName: 'Mariama', researchTopic: 'Histoire des quartiers de Conakry', pieceType: 'PASSEPORT', pieceNumber: 'P 123 456 789',
    regulationVersion: 'RI-2026', regulationAccepted: true
});

test('Une inscription complète n’a aucun problème, et la carte vaut un an par défaut', () => {
    const form = valid();
    assert.deepEqual(registrationProblems(form, now), []);
    assert.equal(form.cardValidUntil, '2027-10-10');
    const body = registrationBody('inst-1', form);
    assert.equal(body.institutionId, 'inst-1');
    assert.equal(body.birthDate, null);
    assert.equal(body.regulationAccepted, true);
});

test('Chaque oubli d’inscription est nommé : règlement, pièce, objet, validité', () => {
    const problems = registrationProblems({ ...emptyRegistration(now), lastName: ' ', pieceNumber: '12', cardValidUntil: '2020-01-01', email: 'pas une adresse' }, now);
    for (const expected of [/nom est obligatoire/, /prénom est obligatoire/, /objet de la recherche/, /type de pièce/, /numéro de la pièce/, /version du règlement/, /accepter le règlement/, /adresse électronique/, /avant aujourd’hui/])
        assert.ok(problems.some(p => expected.test(p)), String(expected));
});

test('La carte ne dépasse pas dix ans et la date de naissance n’est pas dans le futur', () => {
    const tooLong = registrationProblems({ ...valid(), cardValidUntil: addYears(todayIso(now), MAX_CARD_YEARS + 1) }, now);
    assert.ok(tooLong.some(p => /limitée à 10 ans/.test(p)));
    assert.ok(registrationProblems({ ...valid(), birthDate: '2030-01-01' }, now).some(p => /futur/.test(p)));
    assert.deepEqual(registrationProblems({ ...valid(), cardValidUntil: addYears(todayIso(now), MAX_CARD_YEARS) }, now), []);
});

test('La pièce ne se montre jamais en entier', () => {
    assert.equal(pieceText('PASSEPORT', '6789'), 'Passeport se terminant par 6789');
    assert.equal(CARD_LABELS.EXPIREE, 'Carte expirée');
});

test('Une réservation exige salle, lecteur, créneau, et un jour entre aujourd’hui et six mois', () => {
    assert.deepEqual(reservationProblems('r', 'l', '2026-10-10', 'MATIN', now), []);
    assert.ok(reservationProblems('r', 'l', '2026-10-09', 'MATIN', now).some(p => /jour passé/.test(p)));
    assert.ok(reservationProblems('r', 'l', addDays('2026-10-10', 181), 'MATIN', now).some(p => /180 jours/.test(p)));
    assert.equal(reservationProblems('', '', '', '', now).length, 4);
});

test('L’occupation se lit en clair et un créneau complet se reconnaît, la journée entière comptant les deux', () => {
    const o = { roomId: 'r', day: '2026-10-10', capacity: 3, morning: 3, afternoon: 1, present: 2 };
    assert.equal(occupancyText(o), 'Matin 3/3 · Après-midi 1/3 · 2 présents');
    assert.equal(slotFull(o, 'MATIN'), true);
    assert.equal(slotFull(o, 'APRES_MIDI'), false);
    assert.equal(slotFull(o, 'JOURNEE'), true);
    assert.equal(slotFull(null, 'MATIN'), false);
});

const line = (over = {}) => ({ id: 'l1', rank: 1, archiveId: 'a1', cote: 'RC-1', title: null, documentId: null, restricted: false, derogationReference: null, status: 'DEMANDEE', refusalReason: null,
    handoverCondition: null, returnCondition: null, handedOverAt: null, returnedAt: null, ...over });
const slip = (status, items) => ({ summary: { id: 's', number: 'BC-2026-000001', status, lines: items.length, delivered: 0, returned: 0 }, items });

test('Les actions du bulletin suivent son état : préparer, refuser, remettre, restituer, annuler', () => {
    const asked = slipActions(slip('DEMANDE', [line(), line({ id: 'l2', status: 'PREPAREE' })]));
    assert.deepEqual(asked.prepare, ['l1']);
    assert.deepEqual(asked.refuse, ['l1', 'l2']);
    assert.equal(asked.deliver, false);
    assert.equal(asked.cancel, true);
    const prepared = slipActions(slip('PREPARE', [line({ status: 'PREPAREE' }), line({ id: 'l2', status: 'REFUSEE' })]));
    assert.equal(prepared.deliver, true);
    assert.deepEqual(prepared.prepare, []);
    const out = slipActions(slip('COMMUNIQUE', [line({ status: 'COMMUNIQUEE' }), line({ id: 'l2', status: 'RESTITUEE' })]));
    assert.deepEqual(out.returnLines, ['l1']);
    assert.equal(out.cancel, false);
    const done = slipActions(slip('RESTITUE', [line({ status: 'RESTITUEE' })]));
    assert.deepEqual(done, { prepare: [], refuse: [], deliver: false, returnLines: [], cancel: false });
});

test('Le bulletin exige salle, lecteur et de un à vingt documents ; l’avancement se dit en clair', () => {
    assert.deepEqual(slipProblems('r', 'l', ['a']), []);
    assert.equal(slipProblems('', '', []).length, 3);
    assert.ok(slipProblems('r', 'l', Array.from({ length: 21 }, (_, i) => String(i))).some(p => /20 documents/.test(p)));
    assert.equal(slipProgressText({ lines: 3, delivered: 0, returned: 0 }), '3 documents demandés');
    assert.equal(slipProgressText({ lines: 1, delivered: 0, returned: 0 }), '1 document demandé');
    assert.equal(slipProgressText({ lines: 3, delivered: 3, returned: 1 }), '1 restitué sur 3 communiqués');
});

const tariffs = [
    { id: 't1', label: 'Photocopie A4', unit: 'PAGE', unitPrice: '500.00', currency: 'GNF', status: 'ACTIF' },
    { id: 't2', label: 'Numérisation HD', unit: 'IMAGE', unitPrice: 2000, currency: 'GNF', status: 'ACTIF' },
    { id: 't3', label: 'Scan en euros', unit: 'IMAGE', unitPrice: '3.50', currency: 'EUR', status: 'ACTIF' }
];

test('Le total se calcule au centime et s’interrompt tant que la commande est incomplète ou mélange les devises', () => {
    assert.deepEqual(orderTotal([{ tariffId: 't1', quantity: '10', description: '' }, { tariffId: 't2', quantity: '3', description: '' }], tariffs), { amount: 11000, currency: 'GNF' });
    assert.deepEqual(orderTotal([{ tariffId: 't3', quantity: '3', description: '' }], tariffs), { amount: 10.5, currency: 'EUR' });
    assert.equal(orderTotal([{ tariffId: 't1', quantity: '2', description: '' }, { tariffId: 't3', quantity: '1', description: '' }], tariffs), null);
    assert.equal(orderTotal([{ tariffId: '', quantity: '2', description: '' }], tariffs), null);
    assert.equal(orderTotal([{ tariffId: 't1', quantity: '0', description: '' }], tariffs), null);
    assert.equal(orderTotal([], tariffs), null);
});

test('Une commande dit ce qui manque : lecteur, ligne, tarif, devise unique, quantité entière', () => {
    assert.deepEqual(orderProblems('l', [{ tariffId: 't1', quantity: '4', description: '' }], tariffs), []);
    assert.ok(orderProblems('', [], tariffs).some(p => /lecteur/.test(p)));
    assert.ok(orderProblems('l', [], tariffs).some(p => /au moins une ligne/.test(p)));
    assert.ok(orderProblems('l', [{ tariffId: '', quantity: '1', description: '' }], tariffs).some(p => /tarif pour chaque ligne/.test(p)));
    assert.ok(orderProblems('l', [{ tariffId: 't1', quantity: '1', description: '' }, { tariffId: 't3', quantity: '1', description: '' }], tariffs).some(p => /une seule devise/.test(p)));
    assert.ok(orderProblems('l', [{ tariffId: 't1', quantity: '1,5', description: '' }], tariffs).some(p => /entier/.test(p)));
    const body = orderBody('inst', 'l', null, [{ tariffId: 't1', quantity: '4', description: ' Pages 1 à 4 ', archiveId: 'a' }], ' ');
    assert.deepEqual(body.items, [{ tariffId: 't1', quantity: 4, archiveId: 'a', description: 'Pages 1 à 4' }]);
    assert.equal(body.observations, null);
});

const order = (status, over = {}) => ({ summary: { status, total: '5000.00', paid: false, currency: 'GNF', ...over } });

test('Les actions de la commande suivent son état et l’encaissement conditionne la remise', () => {
    assert.deepEqual(orderActions(order('DEMANDEE')), { accept: true, refuse: true, payment: true, complete: false, deliver: false, cancel: true });
    assert.deepEqual(orderActions(order('ACCEPTEE')), { accept: false, refuse: false, payment: true, complete: true, deliver: false, cancel: true });
    assert.equal(orderActions(order('REALISEE')).deliver, false);
    assert.equal(orderActions(order('REALISEE', { paid: true })).deliver, true);
    assert.equal(orderActions(order('REALISEE', { total: '0.00' })).deliver, true);
    assert.equal(orderActions(order('REALISEE', { total: '0.00' })).payment, false);
    assert.equal(orderActions(order('LIVREE', { paid: true })).cancel, false);
    assert.match(orderBlockedText(order('REALISEE')), /encaissement/);
    assert.equal(orderBlockedText(order('REALISEE', { paid: true })), null);
});

test('Les prix s’écrivent avec leur devise et un tarif exige code, libellé, unité, prix et devise', () => {
    assert.match(moneyText('5000', 'GNF'), /5\s?000,00 GNF/);
    assert.equal(moneyText(null, 'GNF'), '—');
    assert.deepEqual(tariffProblems('COPIE-A4', 'Photocopie', 'PAGE', '500', 'GNF'), []);
    assert.deepEqual(tariffProblems('COPIE', 'Copie', 'PAGE', '2,5', 'EUR'), []);
    assert.equal(tariffProblems('a', '', '', 'abc', 'GN').length, 5);
});

test('Une salle exige nom et capacité de 1 à 500 places, et un code seulement à la création', () => {
    assert.deepEqual(roomProblems('SALLE-1', 'Salle principale', '30'), []);
    assert.deepEqual(roomProblems('', 'Salle', '30', false), []);
    assert.ok(roomProblems('SALLE-1', 'Salle', '0').some(p => /capacité/.test(p)));
    assert.ok(roomProblems('SALLE-1', 'Salle', '501').some(p => /capacité/.test(p)));
    assert.ok(roomProblems('x', 'Salle', '3').some(p => /code/.test(p)));
});

test('Les statistiques se regroupent par section, dans l’ordre du serveur, avec des nombres lisibles', () => {
    const stats = { institutionId: 'i', year: 2026, generatedAt: '2026-10-10T00:00:00Z', lines: [
        { section: 'LECTEURS', indicator: 'REGISTERED', label: 'Lecteurs inscrits dans l’année', value: '1234' },
        { section: 'COMMUNICATIONS', indicator: 'DELIVERED', label: 'Documents communiqués', value: '8' },
        { section: 'LECTEURS', indicator: 'VALID_CARDS', label: 'Cartes valides', value: '5' },
        { section: 'FONDS', indicator: 'GIGABYTES', label: 'Volume conservé (Go)', value: '12.50' }
    ] };
    const sections = statisticsSections(stats);
    assert.deepEqual(sections.map(s => s.section), ['LECTEURS', 'COMMUNICATIONS', 'FONDS']);
    assert.equal(sections[0].title, 'Lecteurs');
    assert.deepEqual(sections[0].lines.map(l => l.indicator), ['REGISTERED', 'VALID_CARDS']);
    assert.match(sections[0].lines[0].text, /1\s?234/);
    assert.match(statisticText({ section: 'FONDS', indicator: 'X', label: '', value: '12.50' }), /^12,50$/);
    assert.deepEqual(statisticsSections(null), []);
    assert.deepEqual(statisticsYears(now, 3), [2026, 2025, 2024]);
});
