import test from 'node:test';
import assert from 'node:assert/strict';
import {
    CHECK_LABELS, FORMAT_LABELS, LEVEL_HINTS, LEVEL_LABELS, commonName, declarationBody, declarationProblems, emptyDeclaration, groupByFile, isDetachedSignature, isSelfSigned, isVerifiable, overview, overviewText, shortHash, verdictOf
} from '../.test-build/signatures.js';

const certificate = (over = {}) => ({ subject: 'CN=Mamadou Diallo,O=Ministère,C=GN', issuer: 'CN=Autorité de test,O=Ministère,C=GN', serial: '1a2b', sha256: 'ab'.repeat(32), validFrom: '2026-01-01T00:00:00Z', validTo: '2027-01-01T00:00:00Z', ...over });
const verified = (over = {}) => ({ source: 'VERIFIEE', status: 'INTEGRITE_VALIDE', coversWholeFile: true, signedWithinCertificateValidity: true, certificate: certificate(), message: null, ...over });

test('Les libellés couvrent tous les codes du serveur', () => {
    assert.deepEqual(Object.keys(FORMAT_LABELS).sort(), ['AUTRE', 'CADES', 'PADES', 'XADES']);
    assert.deepEqual(Object.keys(LEVEL_LABELS).sort(), ['AVANCEE', 'INCONNU', 'QUALIFIEE', 'SIMPLE']);
    assert.deepEqual(Object.keys(LEVEL_HINTS).sort(), Object.keys(LEVEL_LABELS).sort());
    assert.deepEqual(Object.keys(CHECK_LABELS).sort(), ['INDETERMINEE', 'INTEGRITE_INVALIDE', 'INTEGRITE_VALIDE', 'NON_VERIFIEE']);
});

test('Seuls les PDF se vérifient', () => {
    assert.ok(isVerifiable('application/pdf')); assert.ok(isVerifiable('Application/PDF'));
    for (const other of ['image/tiff', 'text/plain', '', null, undefined]) assert.ok(!isVerifiable(other), String(other));
});

test('Le nom du signataire se lit dans le certificat, sans le détail technique', () => {
    assert.equal(commonName('CN=Mamadou Diallo,O=Ministère,C=GN'), 'Mamadou Diallo');
    assert.equal(commonName('C=GN, O=Ministère, CN=Aïssatou Barry'), 'Aïssatou Barry');
    assert.equal(commonName('CN=Diallo\\, Mamadou,O=Ministère'), 'Diallo, Mamadou');
    assert.equal(commonName('O=Ministère,C=GN'), 'O=Ministère,C=GN');
    assert.equal(commonName(null), '');
    assert.ok(isSelfSigned(certificate({ issuer: 'CN=Mamadou Diallo,O=Ministère,C=GN' })));
    assert.ok(!isSelfSigned(certificate())); assert.ok(!isSelfSigned(null));
});

test('L’empreinte se lit en forme courte', () => {
    assert.equal(shortHash('ab12cd34'.repeat(8)), 'ab12cd34…ab12cd34');
    assert.equal(shortHash('abc'), 'abc'); assert.equal(shortHash(null), '');
});

test('Le verdict dit ce qui est établi et ce qui ne l’est pas, sans jamais promettre la confiance', () => {
    const declared = verdictOf({ source: 'DECLAREE', status: 'NON_VERIFIEE', coversWholeFile: null, signedWithinCertificateValidity: null, certificate: null, message: null });
    assert.equal(declared.tone, 'neutral'); assert.match(declared.title, /non vérifiée/);
    const intact = verdictOf(verified());
    assert.equal(intact.tone, 'success'); assert.match(intact.title, /n’a pas été modifié/);
    assert.ok(intact.notes.some(n => /chaîne de confiance .* n’est pas évaluée/.test(n)), 'toute signature intacte rappelle la limite');
    const altered = verdictOf(verified({ status: 'INTEGRITE_INVALIDE' }));
    assert.equal(altered.tone, 'danger'); assert.match(altered.title, /modifié depuis la signature/);
    const unknown = verdictOf(verified({ status: 'INDETERMINEE', message: 'Le certificat du signataire est absent.' }));
    assert.equal(unknown.tone, 'warning'); assert.deepEqual(unknown.notes, ['Le certificat du signataire est absent.']);
    // des réserves font passer une signature intacte à l'avertissement
    const later = verdictOf(verified({ coversWholeFile: false }));
    assert.equal(later.tone, 'warning'); assert.ok(later.notes.some(n => /octets ont été ajoutés/.test(n)));
    const expired = verdictOf(verified({ signedWithinCertificateValidity: false }));
    assert.equal(expired.tone, 'warning'); assert.ok(expired.notes.some(n => /pas valide à la date de signature/.test(n)));
    const selfSigned = verdictOf(verified({ certificate: certificate({ issuer: 'CN=Mamadou Diallo,O=Ministère,C=GN' }) }));
    assert.equal(selfSigned.tone, 'warning'); assert.ok(selfSigned.notes.some(n => /auto-signé/.test(n)));
});

test('Le décompte et sa phrase', () => {
    const list = [verified(), verified(), verified({ status: 'INTEGRITE_INVALIDE' }), verified({ status: 'INDETERMINEE' }), { source: 'DECLAREE', status: 'NON_VERIFIEE' }];
    assert.deepEqual(overview(list), { total: 5, intact: 2, altered: 1, undetermined: 1, declared: 1 });
    assert.equal(overviewText(overview(list)), '5 signatures : 2 intactes, 1 sur un contenu modifié, 1 indéterminée, 1 déclarée.');
    assert.equal(overviewText(overview([])), 'Aucune signature enregistrée.');
    assert.equal(overviewText(overview([verified()])), '1 signature : 1 intacte.');
    assert.equal(overviewText(overview([{ source: 'DECLAREE', status: 'NON_VERIFIEE' }])), '1 signature : 1 déclarée.');
});

test('Les signatures se rangent par fichier, dans l’ordre d’apparition', () => {
    const s = (id, fileId, fileName) => ({ id, fileId, fileName });
    const groups = groupByFile([s('1', 'f1', 'contrat.pdf'), s('2', 'f2', 'annexe.pdf'), s('3', 'f1', 'contrat.pdf')]);
    assert.deepEqual(groups.map(g => [g.fileName, g.items.map(i => i.id)]), [['contrat.pdf', ['1', '3']], ['annexe.pdf', ['2']]]);
    assert.deepEqual(groupByFile([]), []);
});

test('La déclaration : chaque incohérence est nommée avant l’envoi', () => {
    const now = new Date('2026-10-10T10:00:00Z');
    const ok = { ...emptyDeclaration('f1'), signer: 'Directeur général' };
    assert.deepEqual(declarationProblems(ok, now), []);
    assert.match(declarationProblems(emptyDeclaration(''), now)[0], /Choisissez le fichier/);
    assert.match(declarationProblems({ ...ok, signer: '  ' }, now)[0], /obligatoire/);
    assert.match(declarationProblems({ ...ok, signer: 'x'.repeat(501) }, now)[0], /500/);
    assert.match(declarationProblems({ ...ok, quality: 'x'.repeat(301) }, now)[0], /qualité/);
    assert.match(declarationProblems({ ...ok, organization: 'x'.repeat(301) }, now)[0], /organisme/);
    assert.match(declarationProblems({ ...ok, comment: 'x'.repeat(2001) }, now)[0], /2000/);
    assert.match(declarationProblems({ ...ok, signedAt: 'pas une date' }, now)[0], /date valide/);
    assert.match(declarationProblems({ ...ok, signedAt: '2026-12-31' }, now)[0], /futur/);
    assert.deepEqual(declarationProblems({ ...ok, signedAt: '2026-10-10' }, now), []);
    assert.equal(declarationProblems({ ...emptyDeclaration(''), signer: '' }, now).length, 2);
});

test('Le corps de la requête vide ce qui n’est pas saisi et date en UTC', () => {
    const body = declarationBody({ fileId: 'f1', format: 'AUTRE', level: 'AVANCEE', signer: ' Directeur général ', quality: ' Ordonnateur ', organization: '', signedAt: '2026-09-01', comment: '  ' });
    assert.deepEqual(body, { fileId: 'f1', format: 'AUTRE', level: 'AVANCEE', signer: 'Directeur général', quality: 'Ordonnateur', organization: null, signedAt: '2026-09-01T00:00:00.000Z', comment: null });
    assert.equal(declarationBody({ ...emptyDeclaration('f1'), signer: 'X' }).signedAt, null);
    assert.equal(declarationBody({ ...emptyDeclaration('f1'), signer: 'X', signedAt: '2026-09-01T09:30:00Z' }).signedAt, '2026-09-01T09:30:00.000Z');
});

test('Un fichier se vérifie s’il est un PDF, un .p7m ou un XML ; un .p7s se vérifie avec son fichier', () => {
    assert.ok(isVerifiable('application/pdf', 'acte.pdf'));
    assert.ok(isVerifiable('application/pkcs7-mime', 'decision.p7m')); assert.ok(isVerifiable('application/octet-stream', 'decision.P7M'));
    assert.ok(isVerifiable('application/xml', 'acte.xml')); assert.ok(isVerifiable('text/xml', 'acte')); assert.ok(isVerifiable('', 'acte.XML'));
    assert.ok(!isVerifiable('application/pkcs7-signature', 'acte.p7s'), 'une signature détachée ne se vérifie pas seule');
    assert.ok(!isVerifiable('image/tiff', 'scan.tif'));
    assert.ok(isDetachedSignature('application/pkcs7-signature', 'acte.p7s')); assert.ok(isDetachedSignature('', 'ACTE.P7S'));
    assert.ok(!isDetachedSignature('application/pdf', 'acte.pdf'));
});

test('La chaîne de confiance change le verdict : établie, non ancrée, invalide, non évaluée', () => {
    const base = verified();
    const trusted = verdictOf({ ...base, chainStatus: 'VALIDE', chainAnchor: 'CN=Autorité nationale,O=Archives,C=GN' });
    assert.equal(trusted.tone, 'success');
    assert.ok(trusted.notes.some(n => /remonte à une autorité de confiance déclarée \(Autorité nationale\)/.test(n)));
    assert.ok(trusted.notes.some(n => /révocation .* n’est pas vérifiée/.test(n)), 'même établie, la révocation reste à dire');
    assert.ok(!trusted.notes.some(n => /n’est pas évaluée/.test(n)));
    const stranger = verdictOf({ ...base, chainStatus: 'NON_ANCREE' });
    assert.equal(stranger.tone, 'warning'); assert.ok(stranger.notes.some(n => /aucune autorité de confiance déclarée/.test(n)));
    const invalid = verdictOf({ ...base, chainStatus: 'INVALIDE' });
    assert.equal(invalid.tone, 'warning'); assert.ok(invalid.notes.some(n => /n’était pas valide à la date de la signature/.test(n)));
    const none = verdictOf({ ...base, chainStatus: 'NON_EVALUEE' });
    assert.equal(none.tone, 'success'); assert.ok(none.notes.some(n => /n’est pas évaluée/.test(n)));
});

test('Un certificat auto-signé déclaré de confiance n’est plus une réserve', () => {
    const selfSigned = { subject: 'CN=Autorité,O=X', issuer: 'CN=Autorité,O=X', serial: '1', sha256: 'ab'.repeat(32), validFrom: '2026-01-01T00:00:00Z', validTo: '2027-01-01T00:00:00Z' };
    const unknown = verdictOf({ ...verified({ certificate: selfSigned }) });
    assert.ok(unknown.notes.some(n => /auto-signé/.test(n)));
    const trusted = verdictOf({ ...verified({ certificate: selfSigned }), chainStatus: 'VALIDE', chainAnchor: 'CN=Autorité,O=X' });
    assert.ok(!trusted.notes.some(n => /auto-signé/.test(n)));
    assert.equal(trusted.tone, 'success');
});
