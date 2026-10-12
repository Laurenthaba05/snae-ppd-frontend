import test from 'node:test';
import assert from 'node:assert/strict';
import { blockerText, canSchedule, dispositionText, durationText, ruleSentence, triggerText } from '../.test-build/retentionPlanning.js';

test('Une règle se dit en une phrase : durée, point de départ, sort final', () => {
    assert.equal(ruleSentence({ duration: 10, unit: 'ANNEES', trigger: 'DATE_CLOTURE_DOCUMENT', finalDisposition: 'CONSERVER_DEFINITIVEMENT' }), '10 ans après la clôture du document, puis conserver définitivement');
    assert.equal(ruleSentence({ duration: 1, unit: 'ANNEES', trigger: 'DATE_ARCHIVAGE', finalDisposition: 'ELIMINER' }), '1 an après la date d’archivage, puis éliminer');
    assert.equal(ruleSentence({ duration: 18, unit: 'MOIS', trigger: 'DATE_DOCUMENT', finalDisposition: 'TRANSFERER' }), '18 mois après la date du document, puis transférer');
    assert.equal(ruleSentence({ duration: 0, unit: 'JOURS', trigger: 'DATE_CLOTURE_DOSSIER', finalDisposition: 'REEXAMINER' }), 'dès la clôture du dossier, puis réexaminer');
    assert.equal(durationText(1, 'JOURS'), '1 jour'); assert.equal(durationText(30, 'JOURS'), '30 jours');
    assert.equal(triggerText('AUTRE'), 'AUTRE'); assert.equal(dispositionText('AUTRE'), 'AUTRE');
});

test('Chaque obstacle à la planification a sa phrase, jamais un code brut', () => {
    for (const code of ['DOCUMENT_NOT_CLOSED', 'DOCUMENT_PERMANENTLY_PRESERVED', 'ALREADY_SCHEDULED', 'NO_APPLICABLE_RULE', 'RULES_AMBIGUOUS', 'BASE_DATE_MISSING', 'BASE_DATE_FUTURE', 'DOSSIER_REQUIRED', 'DOSSIER_NOT_CLOSED'])
        assert.ok(!/^[A-Z_]+$/.test(blockerText(code)), code);
    assert.match(blockerText('NO_APPLICABLE_RULE'), /types visés.*rubriques.*les deux conditions/);
    assert.equal(blockerText('BASE_DATE_MISSING', { trigger: 'DATE_ARCHIVAGE' }), 'Le délai part de la date d’archivage, et cette date n’existe pas encore pour ce document.');
    assert.match(blockerText('BASE_DATE_MISSING'), /date de départ du délai/);
    assert.equal(blockerText('INCONNU'), 'INCONNU');
});

test('On planifie quand aucun obstacle n’est signalé, ou quand la situation est inconnue', () => {
    assert.equal(canSchedule({ blockers: [] }), true);
    assert.equal(canSchedule({ blockers: ['NO_APPLICABLE_RULE'] }), false);
    assert.equal(canSchedule(null), true);
    assert.equal(canSchedule(undefined), true);
});
