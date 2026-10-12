import test from 'node:test';
import assert from 'node:assert/strict';
import {
    MAX_ZONES, MIN_ZONE, applyBody, applyProblems, categoryBody, categoryProblems, delayText, emptyApply, emptyCategory, estimateFreeDate, pendingBlockerText, rectFromPoints, redactionSummary,
    remainingText, restrictionText, stateText, zoneBody, zoneProblems, zonesOf
} from '../.test-build/communicability.js';

const day = iso => iso.slice(0, 10);
const category = (over = {}) => ({ perpetual: false, duration: 50, unit: 'ANNEES', trigger: 'DATE_DOCUMENT', eventLabel: null, ...over });

test('Un délai se dit en une phrase, perpétuel et sur événement compris', () => {
    assert.equal(delayText(category()), '50 ans après la date du document');
    assert.equal(delayText(category({ duration: 1, unit: 'ANNEES', trigger: 'DATE_CLOTURE_DOSSIER' })), '1 an après la clôture du dossier');
    assert.equal(delayText(category({ duration: 30, unit: 'JOURS', trigger: 'DATE_CLOTURE_DOCUMENT' })), '30 jours après la clôture du document');
    assert.equal(delayText(category({ duration: 120, unit: 'MOIS', trigger: 'DATE_EVENEMENT', eventLabel: 'Date de naissance de la personne' })), '120 mois après date de naissance de la personne');
    assert.equal(delayText(category({ duration: 0 })), 'Dès la date du document');
    assert.equal(delayText(category({ perpetual: true, duration: null, unit: null })), 'Perpétuelle : jamais librement communicable');
});

test('Le temps restant se lit sans fausse précision', () => {
    assert.equal(remainingText(null), '');
    assert.equal(remainingText(0), 'aujourd’hui');
    assert.equal(remainingText(1), 'dans 1 jour');
    assert.equal(remainingText(40), 'dans 40 jours');
    assert.equal(remainingText(200), 'dans environ 7 mois');
    assert.equal(remainingText(14610), 'dans environ 40 ans');
});

test('L’état d’une application se dit selon qu’elle est libre, en attente ou perpétuelle', () => {
    assert.equal(stateText({ state: 'LIBRE', freeDate: '2000-01-01', daysRemaining: null }, day), 'Librement communicable depuis le 2000-01-01.');
    assert.equal(stateText({ state: 'EN_ATTENTE', freeDate: '2060-05-01', daysRemaining: 14610 }, day), 'Communicable le 2060-05-01, dans environ 40 ans.');
    assert.equal(stateText({ state: 'INCOMMUNICABLE', freeDate: null, daysRemaining: null }, day), 'Incommunicable : le délai est perpétuel.');
    assert.match(restrictionText({ state: 'LIBRE', restrictionId: null }), /délai est écoulé/);
    assert.match(restrictionText({ state: 'EN_ATTENTE', restrictionId: 'r1' }), /s’éteint d’elle-même/);
    assert.equal(restrictionText({ state: 'EN_ATTENTE', restrictionId: null }), '');
});

test('La catégorie : chaque manque est nommé avant l’envoi', () => {
    const ok = { ...emptyCategory(), code: 'vie-privee-50', label: 'Vie privée', legalBasis: 'Loi, article 12', duration: '50' };
    assert.deepEqual(categoryProblems(ok), []);
    assert.deepEqual(categoryProblems({ ...ok, perpetual: true, duration: '' }), []);
    assert.match(categoryProblems({ ...ok, code: 'vie privée' })[0], /code/);
    assert.match(categoryProblems({ ...ok, label: ' ' })[0], /intitulé/);
    assert.match(categoryProblems({ ...ok, legalBasis: '' })[0], /base légale/);
    assert.match(categoryProblems({ ...ok, duration: '' })[0], /durée/);
    assert.match(categoryProblems({ ...ok, duration: '1001' })[0], /durée/);
    assert.match(categoryProblems({ ...ok, trigger: 'DATE_EVENEMENT' })[0], /événement/);
    assert.deepEqual(categoryProblems({ ...ok, trigger: 'DATE_EVENEMENT', eventLabel: 'Décès' }), []);
});

test('Le corps de la catégorie met le code en majuscules et vide ce qui ne sert pas', () => {
    const f = { ...emptyCategory(), code: ' vie-privee-50 ', label: ' Vie privée ', legalBasis: ' Loi ', duration: '50', unit: 'ANNEES', typeDocumentIds: ['t2', 't1'], eventLabel: 'ignoré', personalData: true };
    assert.deepEqual(categoryBody(f, 'inst1'), { code: 'VIE-PRIVEE-50', label: 'Vie privée', description: null, institutionId: 'inst1', trigger: 'DATE_DOCUMENT', eventLabel: null, duration: 50, unit: 'ANNEES',
        perpetual: false, level: 'RESTREINT', legalBasis: 'Loi', personalData: true, typeDocumentIds: ['t1', 't2'] });
    const forever = categoryBody({ ...f, perpetual: true, trigger: 'DATE_EVENEMENT', eventLabel: ' Décès ' }, null);
    assert.equal(forever.duration, null); assert.equal(forever.unit, null); assert.equal(forever.eventLabel, 'Décès'); assert.equal(forever.institutionId, null);
});

test('L’application exige une catégorie, et une date quand le délai court d’un événement', () => {
    assert.match(applyProblems(emptyApply(), null)[0], /Choisissez la catégorie/);
    assert.deepEqual(applyProblems(emptyApply('c1'), { trigger: 'DATE_DOCUMENT' }), []);
    assert.match(applyProblems(emptyApply('c1'), { trigger: 'DATE_EVENEMENT' })[0], /date d’événement/);
    assert.deepEqual(applyProblems({ ...emptyApply('c1'), eventDate: '1960-03-04' }, { trigger: 'DATE_EVENEMENT' }), []);
    assert.deepEqual(applyBody({ ...emptyApply('c1'), eventDate: '1960-03-04', reason: ' Dossier du personnel ' }, { trigger: 'DATE_EVENEMENT' }), { categoryId: 'c1', eventDate: '1960-03-04', reason: 'Dossier du personnel' });
    assert.deepEqual(applyBody({ ...emptyApply('c1'), eventDate: '1960-03-04' }, { trigger: 'DATE_DOCUMENT' }), { categoryId: 'c1', eventDate: null, reason: null });
});

test('La date libre estimée suit le calcul du serveur, fin de mois comprise', () => {
    assert.equal(estimateFreeDate({ perpetual: false, duration: 50, unit: 'ANNEES' }, '2010-05-01'), '2060-05-01');
    assert.equal(estimateFreeDate({ perpetual: false, duration: 1, unit: 'MOIS' }, '2026-01-31'), '2026-02-28');
    assert.equal(estimateFreeDate({ perpetual: false, duration: 1, unit: 'ANNEES' }, '2024-02-29'), '2025-02-28');
    assert.equal(estimateFreeDate({ perpetual: false, duration: 30, unit: 'JOURS' }, '2026-01-01'), '2026-01-31');
    assert.equal(estimateFreeDate({ perpetual: true, duration: null, unit: null }, '2026-01-01'), null);
    assert.equal(estimateFreeDate({ perpetual: false, duration: 5, unit: 'ANNEES' }, null), null);
});

test('Les obstacles du classement en lot sont dits en français', () => {
    assert.match(pendingBlockerText('COMMUNICABILITY_BASE_DATE_MISSING'), /date d’où court le délai/);
    assert.match(pendingBlockerText('COMMUNICABILITY_EVENT_DATE_REQUIRED'), /document par document/);
    assert.equal(pendingBlockerText('UN_CODE_NOUVEAU'), 'Un code nouveau.');
});

// ---------- occultation
test('Un rectangle se tire dans n’importe quel sens, borné à la page', () => {
    const size = { width: 400, height: 600 };
    assert.deepEqual(rectFromPoints({ x: 40, y: 60 }, { x: 360, y: 120 }, size), { x: 0.1, y: 0.1, width: 0.8, height: 0.1 });
    assert.deepEqual(rectFromPoints({ x: 360, y: 120 }, { x: 40, y: 60 }, size), { x: 0.1, y: 0.1, width: 0.8, height: 0.1 });
    const bounded = rectFromPoints({ x: -50, y: 500 }, { x: 900, y: 900 }, size);
    assert.equal(bounded.x, 0); assert.equal(bounded.width, 1); assert.ok(Math.abs(bounded.y - 500 / 600) < 1e-9); assert.ok(bounded.y + bounded.height <= 1 + 1e-12);
    assert.equal(rectFromPoints({ x: 1, y: 1 }, { x: 2, y: 2 }, { width: 0, height: 0 }), null);
});

test('Une zone exige un rectangle utile et un motif', () => {
    const rect = { x: 0.1, y: 0.1, width: 0.5, height: 0.2 };
    assert.deepEqual(zoneProblems(rect, 'Adresse', 0), []);
    assert.match(zoneProblems(null, 'Adresse')[0], /Dessinez la zone/);
    assert.match(zoneProblems({ ...rect, width: MIN_ZONE / 2 }, 'Adresse')[0], /Dessinez la zone/);
    assert.match(zoneProblems(rect, '  ')[0], /motif/);
    assert.match(zoneProblems(rect, 'x'.repeat(501))[0], /500/);
    assert.match(zoneProblems(rect, 'Adresse', MAX_ZONES)[0], /200 zones/);
});

test('Le corps de la zone arrondit la position et réduit la taille pour ne jamais déborder', () => {
    const body = zoneBody(2, 1, { x: 0.3333333333, y: 0.1, width: 0.6666666667, height: 0.25 }, ' Adresse d’un agent ');
    assert.equal(body.page, 2); assert.equal(body.image, 1); assert.equal(body.x, 0.333333); assert.equal(body.reason, 'Adresse d’un agent');
    assert.ok(body.x + body.width <= 1, `x + width = ${body.x + body.width}`);
    assert.ok(body.y + body.height <= 1);
});

test('Les zones se rangent par page et image, et se résument', () => {
    const z = (id, page, image, status = 'ACTIVE') => ({ id, page, image, status });
    const zones = [z('a', 1, 1), z('b', 1, 2), z('c', 2, 1), z('d', 1, 1, 'RETIREE')];
    assert.deepEqual(zonesOf(zones, 1, 1).map(x => x.id), ['a']);
    assert.deepEqual(zonesOf(zones, 1, 2).map(x => x.id), ['b']);
    assert.equal(redactionSummary([]), 'Aucune zone occultée : la lecture publique montre les pages en entier.');
    assert.equal(redactionSummary(zones), '3 zones occultées sur 2 pages : le lecteur du portail ne les voit jamais.');
    assert.equal(redactionSummary([z('a', 1, 1)]), '1 zone occultée sur 1 page : le lecteur du portail ne les voit jamais.');
});
