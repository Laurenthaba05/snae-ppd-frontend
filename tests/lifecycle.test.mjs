import test from 'node:test';
import assert from 'node:assert/strict';
import { currentStep, lifecycleSteps } from '../.test-build/lifecycle.js';

const base = (extra = {}) => ({ businessStatus: 'BROUILLON', archivalStatus: 'BROUILLON', destroyed: false, version: { id: 'v1', number: 1, sealed: false }, files: 1, validatedFiles: 1, validatedMasters: 0,
    sealBlockers: ['VALIDATED_CONTENT_REQUIRED'], closeBlockers: ['DOCUMENT_UNSEALED'], ...extra });
const by = (steps, key) => steps.find(s => s.key === key);

test('Le document de test : un fichier validé mais pas maître, un circuit en cours, version non scellée', () => {
    const steps = lifecycleSteps(base({ sealBlockers: ['WORKFLOW_PENDING', 'VALIDATED_CONTENT_REQUIRED'] }));
    assert.deepEqual(steps.map(s => s.key), ['CONTENT', 'PENDING', 'SEAL', 'CLOSE', 'RETENTION']);
    assert.equal(by(steps, 'CONTENT').state, 'TODO'); assert.match(by(steps, 'CONTENT').text, /1 fichier mais aucun maître validé/); assert.equal(by(steps, 'CONTENT').actions[0].kind, 'UPLOAD');
    assert.equal(by(steps, 'PENDING').state, 'BLOCKED'); assert.match(by(steps, 'PENDING').text, /circuit de validation est en cours/); assert.equal(by(steps, 'PENDING').actions[0].kind, 'WORKFLOW');
    assert.equal(by(steps, 'SEAL').state, 'WAITING'); assert.equal(by(steps, 'CLOSE').state, 'WAITING'); assert.equal(by(steps, 'RETENTION').state, 'WAITING');
    assert.equal(currentStep(steps).key, 'CONTENT');
});

test('Sans fichier, on dit de déposer le maître ; sans version, de créer la version', () => {
    assert.match(by(lifecycleSteps(base({ files: 0, validatedFiles: 0 })), 'CONTENT').text, /Aucun fichier : déposez-le avec le rôle « Maître de conservation »/);
    const none = lifecycleSteps(base({ version: null, files: 0, validatedFiles: 0, sealBlockers: [], closeBlockers: ['DOCUMENT_VERSION_MISSING'] }));
    assert.equal(by(none, 'CONTENT').actions[0].kind, 'NEW_VERSION'); assert.equal(by(none, 'SEAL').state, 'WAITING');
});

test('Des dépôts interrompus bloquent, avec le suivi des dépôts comme action', () => {
    const steps = lifecycleSteps(base({ sealBlockers: ['INGESTION_PENDING'], validatedMasters: 1 }));
    assert.equal(by(steps, 'CONTENT').state, 'DONE');
    assert.equal(by(steps, 'PENDING').state, 'BLOCKED'); assert.deepEqual(by(steps, 'PENDING').actions.map(a => a.kind), ['INGESTIONS']);
    const both = lifecycleSteps(base({ sealBlockers: ['INGESTION_PENDING', 'MANDATORY_WORKFLOW_INCOMPLETE'], validatedMasters: 1 }));
    assert.deepEqual(by(both, 'PENDING').actions.map(a => a.kind), ['INGESTIONS', 'WORKFLOW']);
});

test('Maître validé et rien en cours : la version est prête à sceller', () => {
    const steps = lifecycleSteps(base({ validatedMasters: 1, validatedFiles: 2, sealBlockers: [], closeBlockers: ['DOCUMENT_UNSEALED'] }));
    assert.equal(by(steps, 'CONTENT').state, 'DONE'); assert.match(by(steps, 'CONTENT').text, /2 fichiers validés, dont 1 maître de conservation/);
    assert.equal(by(steps, 'PENDING').state, 'DONE');
    assert.equal(by(steps, 'SEAL').state, 'TODO'); assert.equal(by(steps, 'SEAL').actions[0].kind, 'SEAL');
    assert.equal(currentStep(steps).key, 'SEAL');
});

test('Version scellée : clore le document est la suite, puis l’échéance', () => {
    const sealed = lifecycleSteps(base({ version: { id: 'v1', number: 2, sealed: true }, validatedMasters: 1, sealBlockers: [], closeBlockers: [] }));
    assert.equal(by(sealed, 'SEAL').state, 'DONE'); assert.match(by(sealed, 'SEAL').text, /version 2 est scellée/);
    assert.equal(by(sealed, 'CLOSE').state, 'TODO'); assert.equal(by(sealed, 'CLOSE').actions[0].kind, 'CONSERVATION');
    assert.equal(by(sealed, 'RETENTION').state, 'WAITING');
    const closed = lifecycleSteps(base({ businessStatus: 'CLOS', archivalStatus: 'ACTIF', version: { id: 'v1', number: 1, sealed: true }, validatedMasters: 1, sealBlockers: [], closeBlockers: [] }));
    assert.equal(by(closed, 'CLOSE').state, 'DONE'); assert.equal(by(closed, 'RETENTION').state, 'TODO'); assert.equal(by(closed, 'RETENTION').actions[0].label, 'Planifier la conservation');
    assert.equal(currentStep(closed).key, 'RETENTION');
});

test('Conservation définitive : tout est fait ; un document détruit est signalé', () => {
    const done = lifecycleSteps(base({ businessStatus: 'CLOS', archivalStatus: 'ARCHIVE_DEFINITIVE', version: { id: 'v1', number: 1, sealed: true }, validatedMasters: 1, sealBlockers: [], closeBlockers: [] }));
    assert.ok(done.every(s => s.state === 'DONE')); assert.equal(currentStep(done), null);
    const gone = lifecycleSteps(base({ destroyed: true, closeBlockers: ['DOCUMENT_DESTROYED'], sealBlockers: [] }));
    assert.equal(by(gone, 'CLOSE').state, 'BLOCKED');
});

test('Des maîtres mêlés (avec et sans pages) sont expliqués', () => {
    const steps = lifecycleSteps(base({ sealBlockers: ['MASTER_KIND_CONFLICT'] }));
    assert.equal(by(steps, 'CONTENT').state, 'BLOCKED'); assert.match(by(steps, 'CONTENT').text, /ne mélange pas/);
});
