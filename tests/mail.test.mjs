import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORY_LABELS, ERROR_TEXT, categoryLabel, errorText, failureTitle, summaryText } from '../.test-build/mail.js';

const status = (over = {}) => ({
    enabled: true, configured: true, security: 'STARTTLS', pending: 0, sent: 12, failed: 0, oldestPendingAt: null, lastSentAt: '2026-10-10T08:00:00Z', lastCycleFinishedAt: '2026-10-10T08:01:00Z',
    lastCycleCode: null, pausedUntil: null, failures: [], ...over
});
const now = Date.parse('2026-10-10T12:00:00Z');

test('Chaque code d’erreur connu a un texte français, un code inconnu reste générique et sans code brut', () => {
    for (const code of Object.keys(ERROR_TEXT)) assert.ok(!/^[A-Z_]+$/.test(errorText(code)), code);
    assert.match(errorText('MAIL_AUTH_REJECTED'), /identifiant ou le mot de passe/);
    assert.equal(errorText(null), '');
    assert.ok(!errorText('UN_CODE_NOUVEAU').includes('UN_CODE_NOUVEAU'));
});

test('Une origine inconnue reste lisible', () => {
    assert.equal(categoryLabel('PORTAIL'), CATEGORY_LABELS.PORTAIL);
    assert.equal(categoryLabel('AUTRE'), 'Notification');
});

test('L’état de l’envoi se dit en une phrase : pas configuré, désactivé, en pause, en échec, en attente, à jour', () => {
    assert.match(summaryText(status({ configured: false, enabled: false }), now).text, /Aucun serveur de courrier n’est configuré/);
    assert.equal(summaryText(status({ configured: false, enabled: false }), now).problem, true);
    assert.match(summaryText(status({ enabled: false }), now).text, /l’envoi est désactivé/);
    const paused = summaryText(status({ pausedUntil: '2026-10-10T12:10:00Z', lastCycleCode: 'MAIL_AUTH_REJECTED' }), now);
    assert.match(paused.text, /identifiant ou le mot de passe/); assert.equal(paused.problem, true);
    assert.match(summaryText(status({ lastCycleCode: 'MAIL_CYCLE_FAILED' }), now).text, /a échoué/);
    // une pause échue ne se signale plus
    assert.equal(summaryText(status({ pausedUntil: '2026-10-10T11:00:00Z' }), now).problem, false);
    assert.equal(summaryText(status({ pending: 1 }), now).text, '1 courrier attend son envoi.');
    assert.equal(summaryText(status({ pending: 4 }), now).text, '4 courriers attendent son envoi.');
    assert.deepEqual(summaryText(status(), now), { text: 'Tous les courriers déposés ont été traités.', problem: false });
});

test('Un courrier en échec se lit par son sujet et son destinataire masqué', () => {
    assert.equal(failureTitle({ category: 'PORTAIL', subject: 'Confirmez votre adresse', recipient: 'l***@exemple.gn' }), 'Confirmez votre adresse — l***@exemple.gn');
});
