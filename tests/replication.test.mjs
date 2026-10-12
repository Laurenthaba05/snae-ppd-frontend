import test from 'node:test';
import assert from 'node:assert/strict';
import {
    ERROR_TEXT, HEALTH_LABELS, KIND_LABELS, OBJECT_STATUS_LABELS, cycleText, errorText, postureText, problemTitle, providerLabel, replicaHealth, replicaSummary
} from '../.test-build/replication.js';

const replica = (over = {}) => ({
    name: 'copie-nationale', provider: 'LOCAL_PRIVATE', offsite: true, jurisdiction: 'Centre de données national', copied: 12, pending: 0, mismatched: 0, failed: 0, toDelete: 0,
    copiedBytes: 3 * 1024 * 1024, oldestPendingAt: null, lastVerifiedAt: '2026-10-10T08:00:00Z', ...over
});

test('Chaque code d’erreur connu a un texte français, un code inconnu reste générique et sans code brut', () => {
    for (const code of Object.keys(ERROR_TEXT)) assert.ok(!/^[A-Z_]+$/.test(errorText(code)), code);
    assert.match(errorText('REPLICA_SOURCE_MISMATCH'), /ne correspond plus à son empreinte/);
    assert.equal(errorText(null), '');
    assert.match(errorText('UN_CODE_NOUVEAU'), /intervention technique/);
    assert.ok(!errorText('UN_CODE_NOUVEAU').includes('UN_CODE_NOUVEAU'));
});

test('Les états des objets et les genres ont un libellé', () => {
    assert.deepEqual(Object.keys(OBJECT_STATUS_LABELS).sort(), ['A_COPIER', 'A_SUPPRIMER', 'COPIE', 'ECART', 'ERREUR']);
    assert.equal(KIND_LABELS.PDF_ACCES, 'PDF d’accès');
    assert.equal(providerLabel('SUPABASE_PRIVATE'), 'Stockage distant privé');
    assert.equal(providerLabel('AUTRE'), 'Stockage');
});

test('La posture dit ce qui manque à la règle 3-2-1 sans promettre plus que la configuration', () => {
    assert.match(postureText({ copies: 1, distinctStores: 1, offsiteCopies: 0, meetsThreeTwoOne: false }), /Une seule copie/);
    assert.equal(postureText({ copies: 2, distinctStores: 2, offsiteCopies: 1, meetsThreeTwoOne: false }),
        '2 copies sur 2 supports distincts, dont 1 hors site : la règle 3-2-1 (trois copies, deux supports, une hors site) n’est pas atteinte.');
    assert.equal(postureText({ copies: 3, distinctStores: 3, offsiteCopies: 1, meetsThreeTwoOne: true }), 'Règle 3-2-1 respectée : 3 copies sur 3 supports distincts, dont 1 hors site.');
});

test('La santé d’un réplica : alerte, rattrapage ou à jour', () => {
    assert.equal(replicaHealth(replica()), 'OK');
    assert.equal(replicaHealth(replica({ pending: 3 })), 'ATTENTION');
    assert.equal(replicaHealth(replica({ toDelete: 1 })), 'ATTENTION');
    assert.equal(replicaHealth(replica({ mismatched: 1 })), 'ALERTE');
    assert.equal(replicaHealth(replica({ failed: 1, pending: 5 })), 'ALERTE');
    assert.deepEqual(Object.keys(HEALTH_LABELS).sort(), ['ALERTE', 'ATTENTION', 'OK']);
});

test('Le résumé d’un réplica ne cite que ce qui existe', () => {
    assert.match(replicaSummary(replica()), /^12 copies vérifiées \(.*Mo\)$/);
    assert.match(replicaSummary(replica({ copied: 1, pending: 2, mismatched: 1, failed: 3, toDelete: 4 })), /^1 copie vérifiée \(.*\) · 2 à copier · 1 à refaire · 3 impossibles · 4 à supprimer$/);
    assert.match(replicaSummary(replica({ failed: 1 })), /1 impossible$/);
});

test('Le dernier cycle est dit, et un cycle ancien ou en échec est signalé', () => {
    const now = Date.parse('2026-10-10T12:00:00Z');
    assert.deepEqual(cycleText({ enabled: false, configured: false, lastCycleFinishedAt: null, lastCycleCode: null }, now), { text: 'Aucun réplica n’est configuré.', late: false });
    assert.equal(cycleText({ enabled: false, configured: true, lastCycleFinishedAt: null, lastCycleCode: null }, now).late, true);
    assert.match(cycleText({ enabled: true, configured: true, lastCycleFinishedAt: null, lastCycleCode: null }, now).text, /Aucun cycle/);
    assert.match(cycleText({ enabled: true, configured: true, lastCycleFinishedAt: '2026-10-10T11:00:00Z', lastCycleCode: null }, now).text, /normalement/);
    assert.equal(cycleText({ enabled: true, configured: true, lastCycleFinishedAt: '2026-10-10T11:00:00Z', lastCycleCode: null }, now).late, false);
    assert.equal(cycleText({ enabled: true, configured: true, lastCycleFinishedAt: '2026-10-09T11:00:00Z', lastCycleCode: null }, now).late, true);
    assert.match(cycleText({ enabled: true, configured: true, lastCycleFinishedAt: '2026-10-10T11:00:00Z', lastCycleCode: 'REPLICATION_CYCLE_FAILED' }, now).text, /a échoué/);
});

test('Un objet à examiner est nommé par son fichier et son document, jamais par un identifiant', () => {
    assert.equal(problemTitle({ kind: 'FICHIER', documentReference: 'DOC-2026-001', fileName: 'Registre.pdf' }), 'Registre.pdf du document DOC-2026-001');
    assert.equal(problemTitle({ kind: 'COPIE', documentReference: 'DOC-2026-001', fileName: null }), 'Copie de consultation du document DOC-2026-001');
    assert.equal(problemTitle({ kind: null, documentReference: null, fileName: null }), 'Objet');
});
