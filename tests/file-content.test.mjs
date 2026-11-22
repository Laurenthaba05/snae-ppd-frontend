import test from 'node:test';
import assert from 'node:assert/strict';
import { HttpTransport, ApiError } from '../.test-build/http.js';
import { MEMORY_LIMIT_BYTES, checkFileContent, downloadFilename, fileIsReadable, previewKind, streamKind, usesStreaming } from '../.test-build/file-content.js';

test('Lecture binaire authentifiée sans URL publique, cookies, cache ni redirection', async () => {
    const bytes = new Uint8Array([0, 255, 3, 128]);
    const transport = new HttpTransport('/api/v1', async () => 'private-token', () => assert.fail('unexpected logout'), async (url, init) => {
        assert.equal(url, '/api/v1/files/id/content');
        assert.equal(init.headers.Authorization, 'Bearer private-token');
        assert.equal(init.headers.Accept, '*/*');
        for (const [key, value] of Object.entries({ method: 'GET', cache: 'no-store', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' })) assert.equal(init[key], value);
        return new Response(bytes, { headers: { 'Content-Type': 'application/pdf' } });
    });
    const blob = await transport.request('/files/id/content', { responseType: 'blob' });
    assert.equal(blob.type, 'application/pdf');
    assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes);
});

for (const status of [401, 403, 404, 409, 500]) test('Erreur de téléchargement HTTP ' + status + ' conservée comme erreur, jamais comme fichier', async () => {
    let logout = 0;
    const transport = new HttpTransport('/api/v1', async () => 'token', () => logout++, async () => new Response(JSON.stringify({ code: 'FILE_REFUSED', message: 'Refus de lecture', correlationId: 'reference' }), { status, headers: { 'X-Correlation-Id': 'reference' } }));
    await assert.rejects(transport.request('/files/id/content', { responseType: 'blob' }), error => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, status);
        assert.equal(error.code, status === 401 ? 'SESSION_EXPIRED' : 'FILE_REFUSED');
        assert.equal(error.correlationId, 'reference');
        assert.equal(error.uncertain, false);
        if (status === 500) assert.doesNotMatch(error.message, /Refus de lecture/);
        return true;
    });
    assert.equal(logout, status === 401 ? 1 : 0);
});

test('Session absente : aucun téléchargement réseau', async () => {
    let logout = false;
    const transport = new HttpTransport('/api/v1', async () => null, () => { logout = true; }, async () => assert.fail('network must not be called'));
    await assert.rejects(transport.request('/files/id/content', { responseType: 'blob' }), error => error.status === 401);
    assert.ok(logout);
});

test('Une annulation pendant le transfert interrompt la lecture', async () => {
    const external = new AbortController();
    let fetching;
    const started = new Promise(resolve => { fetching = resolve; });
    const transport = new HttpTransport('/api/v1', async () => 'token', () => {}, async (_, init) => {
        fetching();
        return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
    });
    const promise = transport.request('/files/id/content', { responseType: 'blob', signal: external.signal });
    await started;
    external.abort();
    await assert.rejects(promise, error => error.name === 'AbortError');
});

test('La déconnexion interrompt aussi les téléchargements en cours', async () => {
    let fetching;
    const started = new Promise(resolve => { fetching = resolve; });
    const transport = new HttpTransport('/api/v1', async () => 'token', () => {}, async (_, init) => {
        fetching();
        return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
    });
    const promise = transport.request('/files/id/content', { responseType: 'blob' });
    await started;
    transport.abortAll();
    await assert.rejects(promise);
});

test('Une réponse partielle ou vide sans contenu complet n’est pas enregistrable', async () => {
    for (const status of [204, 206]) {
        const transport = new HttpTransport('/api/v1', async () => 'token', () => {}, async () => new Response(status === 204 ? null : 'partial', { status }));
        await assert.rejects(transport.request('/files/id/content', { responseType: 'blob' }), error => error.code === 'INVALID_CONTENT_RESPONSE');
    }
});

test('Taille et type de fichier reçus doivent correspondre à la fiche', () => {
    const blob = new Blob(['test'], { type: 'application/pdf' });
    assert.equal(checkFileContent(blob, { size: 4, mediaType: 'application/pdf' }), blob);
    assert.throws(() => checkFileContent(blob, { size: 10, mediaType: 'application/pdf' }), error => error.code === 'CONTENT_MISMATCH');
    assert.throws(() => checkFileContent(new Blob(['test'], { type: 'text/html' }), { size: 4, mediaType: 'application/pdf' }), error => error.code === 'CONTENT_MISMATCH');
});

test('La consultation attend la validation, y compris après une analyse antivirus saine', () => {
    for (const state of ['QUARANTINED', 'REJETE', 'PENDING_SCAN']) assert.equal(fileIsReadable({ state, validatedAt: '2026-09-30' }), false);
    assert.equal(fileIsReadable({ state: 'VALIDE', validatedAt: null }), false);
    for (const state of ['VALIDE', 'ARCHIVE']) assert.equal(fileIsReadable({ state, validatedAt: '2026-09-30' }), true);
});

test('Aperçus limités aux formats pris en charge et aux tailles prévues', () => {
    for (const mime of ['text/html', 'image/svg+xml', 'application/javascript', 'application/zip', 'application/msword']) assert.equal(previewKind(mime, 100), null);
    assert.equal(previewKind('application/pdf', 100), 'pdf');
    assert.equal(previewKind('image/png', 100), 'image');
    assert.equal(previewKind('text/plain; charset=utf-8', 100), 'text');
    assert.equal(previewKind('video/mp4', 100), 'video');
    assert.equal(previewKind('audio/mpeg', 100), 'audio');
    for (const mime of ['audio/flac', 'audio/aac', 'audio/webm', 'audio/opus']) assert.equal(previewKind(mime, 100), 'audio');
    assert.equal(previewKind('application/pdf', 50 * 1024 * 1024 + 1), null);
    assert.equal(previewKind('text/plain', 1024 * 1024 + 1), null);
    for (const size of [-1, NaN, Infinity]) assert.equal(previewKind('application/pdf', size), null);
});

test('Les noms enregistrés ne conservent ni chemin ni caractères de contrôle', () => {
    assert.equal(downloadFilename('Arrêté 2026.pdf'), 'Arrêté 2026.pdf');
    assert.doesNotMatch(downloadFilename('../dossier\\nom\u202e\r\n.pdf'), /[\\/\r\n\u202e]/);
    assert.equal(downloadFilename('...'), 'document');
});

test('L’audio et la vidéo se lisent en continu quelle que soit leur taille, le reste seulement au-delà de la limite de mémoire', () => {
    assert.equal(streamKind('video/mp4'), 'video');
    assert.equal(streamKind('Video/WebM; codecs=vp9'), 'video');
    assert.equal(streamKind('audio/flac'), 'audio');
    for (const mime of ['application/pdf', 'image/png', 'video/x-matroska', 'application/octet-stream', 'text/html']) assert.equal(streamKind(mime), null, mime);
    // consulter une vidéo ou un son : toujours en continu, même un petit fichier
    assert.equal(usesStreaming({ mediaType: 'video/mp4', size: 1000 }, true), true);
    assert.equal(usesStreaming({ mediaType: 'audio/mpeg', size: 5 * 1024 * 1024 }, true), true);
    // le télécharger : en mémoire tant qu'il est petit, en continu au-delà
    assert.equal(usesStreaming({ mediaType: 'video/mp4', size: 1000 }, false), false);
    assert.equal(usesStreaming({ mediaType: 'video/mp4', size: MEMORY_LIMIT_BYTES + 1 }, false), true);
    assert.equal(usesStreaming({ mediaType: 'video/mp4', size: MEMORY_LIMIT_BYTES }, false), false);
    // un PDF ou un texte ordinaire reste chargé et vérifié ; un gros fichier de tout type passe en continu
    assert.equal(usesStreaming({ mediaType: 'application/pdf', size: 2_000_000 }, true), false);
    assert.equal(usesStreaming({ mediaType: 'application/pdf', size: 80 * 1024 * 1024 }, true), true);
    assert.equal(usesStreaming({ mediaType: 'application/zip', size: 7 * 1024 * 1024 * 1024 }, false), true);
    for (const size of [NaN, Infinity, -1.5]) assert.equal(usesStreaming({ mediaType: 'text/plain', size }, false), true, String(size));   // taille inexploitable : le serveur sait, pas le navigateur
});
