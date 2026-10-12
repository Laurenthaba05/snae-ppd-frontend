import test from 'node:test';
import assert from 'node:assert/strict';
import {
    GAP_LABELS, RULE_TEXTS, addMonths, approvalReadiness, contactProblems, exerciseProblems, gapLabel, levelLabel, levelOf, measureProblems, planLabel, planSheetHtml, priorityProblems,
    reviewProblems, riskProblems, riskStatusLabel
} from '../.test-build/physicalRisk.js';

const today = '2026-10-12';

test('Le niveau suit le produit de la probabilité et de la gravité', () => {
    assert.equal(levelOf(1), 'FAIBLE');
    assert.equal(levelOf(4), 'FAIBLE');
    assert.equal(levelOf(5), 'MODERE');
    assert.equal(levelOf(9), 'MODERE');
    assert.equal(levelOf(10), 'ELEVE');
    assert.equal(levelOf(15), 'ELEVE');
    assert.equal(levelOf(16), 'CRITIQUE');
    assert.equal(levelOf(25), 'CRITIQUE');
});

test('Les états et les lacunes se disent en français, un inconnu ne se déguise pas', () => {
    assert.equal(levelLabel('CRITIQUE'), 'Critique');
    assert.equal(levelLabel('?'), 'État inconnu');
    assert.equal(riskStatusLabel('ACCEPTE'), 'Accepté');
    assert.equal(planLabel('APPROUVE'), 'En vigueur');
    assert.equal(planLabel('AUCUN'), 'Aucun plan');
    assert.equal(gapLabel('NO_PLAN'), GAP_LABELS.NO_PLAN);
    assert.equal(gapLabel('INCONNUE'), 'À examiner');
});

test('Une échéance par défaut tombe au jour près, février compris', () => {
    assert.equal(addMonths('2026-10-12', 12), '2027-10-12');
    assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
    assert.equal(addMonths('2028-01-31', 1), '2028-02-29');
    assert.equal(addMonths('2026-11-15', 3), '2027-02-15');
    assert.equal(addMonths('2026-12-31', 2), '2027-02-28');
});

test('Un risque se saisit avec son danger, sa description, son évaluation et sa revue à venir', () => {
    const ok = { hazard: 'INCENDIE', description: 'Câblage ancien sous les combles.', probability: 4, severity: 5, existingMeasures: '', owner: '', nextReview: '2027-10-12' };
    assert.deepEqual(riskProblems(ok, today), []);
    assert.equal(riskProblems({ ...ok, hazard: '' }, today).length, 1);
    assert.equal(riskProblems({ ...ok, description: 'court' }, today).length, 1);
    assert.equal(riskProblems({ ...ok, probability: null }, today).length, 1);
    assert.equal(riskProblems({ ...ok, severity: 6 }, today).length, 1);
    assert.equal(riskProblems({ ...ok, nextReview: today }, today).length, 1);
    assert.equal(riskProblems({ ...ok, nextReview: '' }, today).length, 1);
});

test('Une revue, une mesure et un exercice se contrôlent avant l’envoi', () => {
    assert.deepEqual(reviewProblems({ probability: 2, severity: 3, nextReview: '2027-01-01' }, today), []);
    assert.equal(reviewProblems({ probability: 0, severity: 3, nextReview: '2027-01-01' }, today).length, 1);
    assert.equal(reviewProblems({ probability: 2, severity: 3, nextReview: '2026-10-01' }, today).length, 1);
    assert.deepEqual(measureProblems({ label: 'Remplacer le câblage', dueDate: '' }, today), []);
    assert.equal(measureProblems({ label: 'ab', dueDate: '' }, today).length, 1);
    assert.equal(measureProblems({ label: 'Remplacer le câblage', dueDate: '2026-10-01' }, today).length, 1);
    assert.deepEqual(exerciseProblems({ occurredOn: today, title: 'Évacuation', description: 'Exercice inopiné de la salle.', findings: 'Évacuation en 4 minutes.' }, today), []);
    assert.equal(exerciseProblems({ occurredOn: '2026-10-13', title: 'Évacuation', description: 'Exercice inopiné de la salle.', findings: 'Évacuation en 4 minutes.' }, today).length, 1);
    assert.equal(exerciseProblems({ occurredOn: today, title: 'Év', description: 'court', findings: 'court' }, today).length, 3);
});

test('Un contact a une fonction, un nom et un moyen de le joindre ; une priorité dit ce qu’on sauve et pourquoi', () => {
    assert.deepEqual(contactProblems([{ role: 'Responsable', name: 'A. Camara', phone: '+224 600', email: '', note: '' }]), []);
    assert.deepEqual(contactProblems([{ role: 'Pompiers', name: 'Centre de secours', phone: '', email: 'secours@example.org', note: '' }]), []);
    const problems = contactProblems([{ role: 'R', name: '', phone: '', email: '', note: '' }]);
    assert.equal(problems.length, 3);
    assert.match(problems[2], /Contact 1 : un téléphone ou un courriel/);
    assert.deepEqual(priorityProblems([{ label: 'Registres d’état civil', storageUnitId: '', reason: 'Pièces uniques' }]), []);
    assert.equal(priorityProblems([{ label: 'R', storageUnitId: '', reason: 'non' }]).length, 2);
});

test('Ce qui manque à un brouillon pour être approuvé se dit en toutes lettres', () => {
    const complete = { alert: 'Alerter le responsable puis les pompiers.', evacuation: 'Sortir par l’issue nord.', rescue: 'Sauver d’abord la salle 1.', contacts: [{}], priorities: [{}] };
    assert.deepEqual(approvalReadiness(complete), []);
    assert.deepEqual(approvalReadiness({ ...complete, alert: null, contacts: [] }), ['la procédure d’alerte', 'au moins un contact à prévenir']);
    assert.equal(approvalReadiness({ alert: null, evacuation: null, rescue: null, contacts: [], priorities: [] }).length, 5);
});

test('La fiche imprimable du plan protège le texte saisi et porte la version et la revue', () => {
    const html = planSheetHtml({
        id: '1', locationId: '2', locationLabel: 'Bâtiment <A>', versionNumber: 3, title: 'Plan d’urgence', status: 'APPROUVE', scope: null, alert: 'Alerter <script>alert(1)</script>',
        evacuation: 'Issue nord', rescue: 'Sauver la salle 1', stabilisation: null, resources: null,
        contacts: [{ rank: 1, role: 'Responsable', name: 'A. Camara', phone: '+224 600', email: null, note: null }],
        priorities: [{ rank: 1, label: 'Registres', storageUnitId: null, storageUnitLabel: 'ETAG-1', archiveId: null, archiveLabel: null, reason: 'Pièces uniques' }],
        createdByName: null, createdAt: '2026-10-01T10:00:00Z', approvedByName: null, approvedAt: '2026-10-05T10:00:00Z', approvalReference: null, nextReview: '2027-10-05',
        reviewOverdue: false, reviewedByName: null, reviewedOn: null, abandonReason: null, version: 4
    });
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(html.includes('Bâtiment &lt;A&gt;'));
    assert.ok(html.includes('version 3'));
    assert.ok(html.includes('approuvée le 05/10/2026'));
    assert.ok(html.includes('à revoir avant le 05/10/2027'));
    assert.ok(html.includes('ETAG-1'));
});

test('Les règles du serveur ont leur texte', () => {
    for (const code of ['ck_risque_acceptation', 'EMERGENCY_PLAN_APPROVED_FROZEN', 'ck_plan_approuve', 'RISK_JOURNAL_APPEND_ONLY']) assert.ok(RULE_TEXTS[code], code);
});
