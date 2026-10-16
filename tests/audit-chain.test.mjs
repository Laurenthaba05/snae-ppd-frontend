import test from 'node:test';
import assert from 'node:assert/strict';
import { anomalyLabel, CHAIN_MAX_ANOMALIES, emptyRun, mergeRun, progressPercent, runVerdict, verifyWholeChain } from '../.test-build/auditChain.js';

const part = (over = {}) => ({
    ok: true, fromSequence: 1, lastVerifiedSequence: 10, checked: 10, headSequence: 25, complete: false, nextSequence: 11, anomalyCount: 0, anomalies: [], legacy: null,
    verifiedAt: '2026-10-16T12:00:00Z', durationMillis: 100, ...over
});
const anomaly = (n) => ({ kind: 'HASH_MISMATCH', sequence: n, eventId: null, detail: `événement ${n}` });

test('les tranches se cumulent : événements relus, anomalies, temps, historique gardé une fois', () => {
    let run = mergeRun(emptyRun(), part({ legacy: { events: 3, chained: true, note: 'historique' } }));
    run = mergeRun(run, part({ fromSequence: 11, lastVerifiedSequence: 20, nextSequence: 21, anomalyCount: 1, anomalies: [anomaly(15)] }));
    run = mergeRun(run, part({ fromSequence: 21, lastVerifiedSequence: 26, checked: 6, headSequence: 26, complete: true, nextSequence: null, legacy: { events: 99, chained: false, note: 'autre' } }));
    assert.equal(run.windows, 3);
    assert.equal(run.checked, 26);
    assert.equal(run.anomalyCount, 1);
    assert.equal(run.lastVerifiedSequence, 26);
    assert.equal(run.headSequence, 26, 'la tête avance pendant la relecture : on garde la dernière');
    assert.equal(run.durationMillis, 300);
    assert.equal(run.legacy.note, 'historique', 'le rapport historique est celui de la première tranche');
    assert.equal(run.complete, true);
});

test('seules les cent premières anomalies sont gardées, le nombre total reste exact', () => {
    let run = emptyRun();
    for (let i = 0; i < 3; i++) run = mergeRun(run, part({ anomalyCount: 60, anomalies: Array.from({ length: 60 }, (_, k) => anomaly(i * 60 + k)) }));
    assert.equal(run.anomalyCount, 180);
    assert.equal(run.anomalies.length, CHAIN_MAX_ANOMALIES);
    assert.equal(run.anomalies[0].sequence, 0);
});

test('le verdict : intacte seulement si relue jusqu’à la tête sans anomalie', () => {
    const done = mergeRun(emptyRun(), part({ complete: true, nextSequence: null, lastVerifiedSequence: 25, checked: 25 }));
    assert.equal(runVerdict(done, false), 'INTACTE');
    assert.equal(runVerdict(done, true), 'EN_COURS');
    const stopped = mergeRun(emptyRun(), part());
    assert.equal(runVerdict(stopped, false), 'INCOMPLETE');
    const broken = mergeRun(emptyRun(), part({ complete: true, anomalyCount: 2, anomalies: [anomaly(3), anomaly(4)] }));
    assert.equal(runVerdict(broken, false), 'ANOMALIES');
    assert.equal(runVerdict(broken, true), 'ANOMALIES', 'une anomalie se dit tout de suite, même en cours');
});

test('la progression ne dépasse jamais 100 et sait qu’une chaîne vide est complète', () => {
    assert.equal(progressPercent(emptyRun()), 0);
    assert.equal(progressPercent(mergeRun(emptyRun(), part({ headSequence: 0, lastVerifiedSequence: null, checked: 0, complete: true, nextSequence: null }))), 100);
    assert.equal(progressPercent(mergeRun(emptyRun(), part())), 40);
    assert.equal(progressPercent(mergeRun(emptyRun(), part({ lastVerifiedSequence: 30, headSequence: 25 }))), 100);
});

test('les natures d’anomalie ont un libellé lisible, et une nature inconnue n’échoue pas', () => {
    for (const kind of ['GAP', 'HASH_MISMATCH', 'CHAIN_BREAK', 'COLUMN_MISMATCH', 'HEAD_MISMATCH', 'LEGACY_FORK']) assert.notEqual(anomalyLabel(kind), 'Anomalie', kind);
    assert.equal(anomalyLabel('NOUVELLE_NATURE'), 'Anomalie');
});

test('verifyWholeChain enchaîne les tranches jusqu’à la tête et signale la progression', async () => {
    const calls = [];
    const seen = [];
    const run = await verifyWholeChain(async (from, count) => {
        calls.push([from, count]);
        const last = Math.min(from + 9, 25);
        return part({ fromSequence: from, lastVerifiedSequence: last, checked: last - from + 1, complete: last >= 25, nextSequence: last >= 25 ? null : last + 1 });
    }, r => seen.push(r.checked), undefined, 10);
    assert.deepEqual(calls, [[1, 10], [11, 10], [21, 10]]);
    assert.deepEqual(seen, [10, 20, 25]);
    assert.equal(run.complete, true);
    assert.equal(run.checked, 25);
});

test('verifyWholeChain s’arrête à l’annulation, et si le serveur n’avance pas', async () => {
    const controller = new AbortController();
    let n = 0;
    const stopped = await verifyWholeChain(async (from) => {
        n++;
        if (n === 2) controller.abort();
        return part({ fromSequence: from, nextSequence: from + 10 });
    }, () => {}, controller.signal, 10);
    assert.equal(n, 2);
    assert.equal(stopped.complete, false);
    assert.equal(runVerdict(stopped, false), 'INCOMPLETE');

    let calls = 0;
    const stuck = await verifyWholeChain(async (from) => { calls++; return part({ fromSequence: from, nextSequence: from }); }, () => {}, undefined, 10);
    assert.equal(calls, 1, 'une reprise qui ne progresse pas n’est pas rejouée sans fin');
    assert.equal(stuck.complete, false);
});

test('une erreur du serveur remonte à l’appelant', async () => {
    await assert.rejects(verifyWholeChain(async () => { throw new Error('Une vérification est déjà en cours'); }, () => {}), /déjà en cours/);
});
