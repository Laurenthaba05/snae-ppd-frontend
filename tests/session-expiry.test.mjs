import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { HttpTransport } from '../.test-build/http.js';

for (const operation of ['binary', 'json', 'upload']) test('Un vrai flux 401 annulé reste une expiration de session : ' + operation, async () => {
    const server = createServer((request, response) => {
        request.resume();
        response.writeHead(401, { 'Content-Type': 'application/json', 'X-Correlation-Id': 'expired-session-test' });
        response.write('{"code":"INVALID_TOKEN"'); // Intentionally unfinished, like a slow response body.
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    let expired = 0;
    let transport;
    transport = new HttpTransport('/api/v1', async () => 'test-token', () => { expired++; transport.abortAll(); },
        (path, init) => fetch(`http://127.0.0.1:${server.address().port}${path}`, init));
    try {
        const pending = operation === 'upload'
            ? transport.upload('/versions/id/content', new File(['test'], 'test.txt'), {}, 'test-expiry')
            : transport.request('/files/id/content', { responseType: operation === 'binary' ? 'blob' : 'json' });
        await assert.rejects(pending, error => {
            assert.equal(error.status, 401);
            assert.equal(error.code, 'SESSION_EXPIRED');
            assert.equal(error.correlationId, 'expired-session-test');
            assert.equal(error.uncertain, false);
            assert.match(error.message, /session a expiré/);
            return true;
        });
        assert.equal(expired, 1);
    } finally {
        transport.abortAll();
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
});
