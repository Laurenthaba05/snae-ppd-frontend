import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORY_LABELS, bellLabel, categoryLabel, notificationPath, relativeTime, unreadBadge } from '../.test-build/notifications.js';

const NOW = Date.parse('2026-10-10T12:00:00Z');
const ago = seconds => new Date(NOW - seconds * 1000).toISOString();

test('Le temps écoulé se dit en français, de l’instant à la date', () => {
    assert.equal(relativeTime(ago(5), NOW), 'à l’instant');
    assert.equal(relativeTime(ago(-30), NOW), 'à l’instant');
    assert.equal(relativeTime(ago(5 * 60), NOW), 'il y a 5 min');
    assert.equal(relativeTime(ago(3 * 3600), NOW), 'il y a 3 h');
    assert.equal(relativeTime(ago(30 * 3600), NOW), 'hier');
    assert.equal(relativeTime(ago(4 * 86400), NOW), 'il y a 4 j');
    assert.match(relativeTime(ago(40 * 86400), NOW), /2026/);
    assert.equal(relativeTime('pas une date', NOW), 'date inconnue');
});

test('Le badge de la cloche : rien à zéro, plafonné à 99+', () => {
    assert.equal(unreadBadge(0), '');
    assert.equal(unreadBadge(-2), '');
    assert.equal(unreadBadge(7), '7');
    assert.equal(unreadBadge(99), '99');
    assert.equal(unreadBadge(100), '99+');
    assert.equal(bellLabel(0), 'Notifications, aucune non lue');
    assert.equal(bellLabel(1), 'Notifications, 1 non lue');
    assert.equal(bellLabel(5), 'Notifications, 5 non lues');
});

test('Une notification mène à l’objet qu’elle désigne, ou nulle part quand on l’ignore', () => {
    const id = '80f0f431-a8f1-4da0-b0b2-bbca91b9a739';
    assert.equal(notificationPath('DOCUMENT', id), `/app/documents/${id}`);
    assert.equal(notificationPath('DOSSIER', id), `/app/dossiers/${id}`);
    assert.equal(notificationPath('ENTREE_ARCHIVISTIQUE', id), '/app/versements');
    assert.equal(notificationPath('BORDEREAU_ELIMINATION', id), '/app/eliminations');
    assert.equal(notificationPath('TRANSFERT_ARCHIVES', id), '/app/eliminations');
    assert.equal(notificationPath('DEMANDE_ACCES_PORTAIL', id), '/app/portail');
    assert.equal(notificationPath('INCONNU', id), null);
    assert.equal(notificationPath(null, null), null);
    assert.equal(notificationPath('DOCUMENT', null), null);
});

test('Chaque catégorie a un libellé, une inconnue reste générique', () => {
    // les mêmes catégories que celles que le serveur émet (NotificationCategories.ALL) : une catégorie sans libellé s'afficherait « Notification »
    for (const code of ['WORKFLOW_TASK', 'INTAKE_SUBMITTED', 'INTAKE_DECISION', 'ELIMINATION_SUBMITTED', 'ELIMINATION_DECIDED', 'ELIMINATION_TO_EXECUTE', 'TRANSFER_SUBMITTED',
        'TRANSFER_RECEIVED', 'TRANSFER_TO_EXECUTE', 'ACCESS_REQUESTED', 'DEADLINE_APPROACHING', 'RISK_FOLLOW_UP', 'EXIT_TO_EXAMINE', 'EXIT_TO_DECIDE', 'EXIT_TO_EXECUTE']) assert.ok(CATEGORY_LABELS[code] && !/^[A-Z_]+$/.test(CATEGORY_LABELS[code]), code);
    assert.equal(categoryLabel('NOUVELLE'), 'Notification');
});

test('La sortie d’un bien se traite depuis sa fiche : la notification y mène', () => {
    assert.equal(notificationPath('BIEN_PATRIMONIAL', '00000000-0000-4000-8000-000000000001'), '/app/patrimoine?bien=00000000-0000-4000-8000-000000000001');
    assert.equal(notificationPath('BIEN_PATRIMONIAL', null), null);
});
