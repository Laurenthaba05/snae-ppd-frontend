import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKER_TEXT, KIND_LABELS, blockerText, certificateHtml, confirmationText, destroyedSummary, kindCounts, previewSummary } from '../.test-build/destruction.js';

const certificate = (over = {}) => ({
    id: 'c1', reference: 'CD-2026-000001', actionId: 'a1', documentId: 'd1', institutionId: 'i1', identifiantMetier: 'DOC-2026-001', title: 'Registre de paie <1960> & "annexes"', status: 'COMPLET', method: 'SUPPRESSION_STOCKAGE',
    operatorId: 'u3', proposedById: 'u1', validatedById: 'u2', visaReference: 'VISA-2026-01', startedAt: '2026-10-09T10:00:00Z', finishedAt: '2026-10-09T10:00:05Z', objectCount: 2, totalSize: 2048, purgedTexts: 1,
    fingerprint: 'f'.repeat(64), objects: [
        { kind: 'FICHIER', name: 'Décision <finale>.pdf', mediaType: 'application/pdf', sha256: 'a'.repeat(64), size: 1024, provider: 'LOCAL_PRIVATE', deletedAt: '2026-10-09T10:00:02Z', alreadyAbsent: false, absenceVerified: true },
        { kind: 'COPIE', name: 'consultation-1', mediaType: 'image/jpeg', sha256: null, size: 1024, provider: 'LOCAL_PRIVATE', deletedAt: '2026-10-09T10:00:03Z', alreadyAbsent: true, absenceVerified: true }], ...over });
const names = { operator: 'Aïcha Camara', proposer: 'Moussa <Sylla>', validator: 'Fanta Bah', institution: 'Archives nationales', date: iso => iso.slice(0, 10) };

test('Les obstacles se disent en français, et un code inconnu reste lisible', () => {
    for (const code of ['DESTRUCTION_STORAGE_NOT_CONFIGURED', 'ACTIVE_LEGAL_HOLD', 'DISPOSITION_DUAL_CONTROL', 'DESTRUCTION_INVENTORY_CHANGED', 'DESTRUCTION_PROVIDER_MISMATCH']) {
        assert.ok(BLOCKER_TEXT[code], code);
        assert.ok(!/^[A-Z_]+$/.test(blockerText(code)), code);
    }
    assert.match(blockerText('DESTRUCTION_STORAGE_NOT_CONFIGURED'), /Le stockage ne permet pas de supprimer/);
    assert.equal(blockerText('UN_CODE_NOUVEAU'), 'Un code nouveau.');
});

test('L’aperçu et le certificat se résument en une phrase, sans pluriel fautif', () => {
    assert.equal(previewSummary({ objectCount: 0, totalSize: 0, texts: 0 }), 'Ce document n’a aucun contenu stocké : seule sa notice demeure.');
    assert.match(previewSummary({ objectCount: 1, totalSize: 1024, texts: 0 }), /^1 objet \(1( | | )?Ko\)$/);
    assert.match(previewSummary({ objectCount: 3, totalSize: 3 * 1024 * 1024, texts: 2 }), /^3 objets \(.*Mo\) et 2 textes dérivés à vider$/);
    assert.equal(previewSummary({ objectCount: 0, totalSize: 0, texts: 1 }), '1 texte dérivé à vider');
    assert.equal(destroyedSummary({ objectCount: 0, totalSize: 0, purgedTexts: 0 }), 'Aucun contenu stocké : seule la notice demeure.');
    assert.match(destroyedSummary({ objectCount: 2, totalSize: 2048, purgedTexts: 1 }), /^2 objets \(.*Ko\) et 1 texte dérivé vidé$/);
    assert.match(destroyedSummary({ objectCount: 1, totalSize: 10, purgedTexts: 3 }), /3 textes dérivés vidés$/);
});

test('La confirmation nomme le nombre d’objets, les natures se comptent', () => {
    assert.equal(confirmationText({ objectCount: 1 }), 'Je confirme la destruction définitive de 1 objet de ce document.');
    assert.equal(confirmationText({ objectCount: 12 }), 'Je confirme la destruction définitive de 12 objets de ce document.');
    assert.equal(confirmationText({ objectCount: 0 }), 'Je confirme la destruction définitive de ce document.');
    assert.deepEqual(kindCounts([{ kind: 'FICHIER' }, { kind: 'COPIE' }, { kind: 'COPIE' }]), [{ kind: 'FICHIER', count: 1 }, { kind: 'COPIE', count: 2 }]);
    assert.deepEqual(kindCounts([]), []);
    assert.deepEqual(Object.keys(KIND_LABELS), ['FICHIER', 'COPIE', 'PDF_ACCES']);
});

test('Le certificat imprimable reprend le tombeau, les trois personnes et chaque objet, sans laisser passer de balise', () => {
    const html = certificateHtml(certificate(), names);
    assert.ok(html.includes('CD-2026-000001') && html.includes('DOC-2026-001') && html.includes('VISA-2026-01') && html.includes('Archives nationales'));
    assert.ok(html.includes('Registre de paie &lt;1960&gt; &amp; &quot;annexes&quot;'));
    assert.ok(html.includes('Moussa &lt;Sylla&gt;') && html.includes('Aïcha Camara') && html.includes('Fanta Bah'));
    assert.ok(html.includes('Décision &lt;finale&gt;.pdf') && html.includes('a'.repeat(64)) && html.includes('f'.repeat(64)));
    assert.ok(html.includes('Déjà absent') && html.includes('Supprimé'));
    assert.ok(html.includes('2026-10-09'));
    assert.ok(html.includes('Les sauvegardes et réplicas éventuels'));
    assert.ok(!html.includes('<script') && !html.includes('<finale>') && !html.includes('<Sylla>'));
    const empty = certificateHtml(certificate({ objects: [], objectCount: 0, totalSize: 0, purgedTexts: 0, fingerprint: null }), names);
    assert.ok(empty.includes('Aucun objet stocké') && empty.includes('Aucun contenu stocké'));
});
