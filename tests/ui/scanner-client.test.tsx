import { afterEach, expect, it, vi } from 'vitest';
import { ScannerClient } from '../../src/api/acquisition';
const token = 'test-only-'.padEnd(43, 'x');
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it('refuse une adresse distante, les identifiants URL et les chemins arbitraires', async () => {
    for (const url of ['https://example.com:8765', 'https://user:pass@127.0.0.1:8765', 'https://127.0.0.1:8765/path', 'https://127.0.0.1:8765/?x=1']) expect(() => new ScannerClient(url, token)).toThrow();
    const client = new ScannerClient('https://127.0.0.1:8765', token);
    await expect(client.request('/files')).rejects.toThrow('Chemin');
    expect(() => new ScannerClient('https://127.0.0.1:8765', 'JWT')).toThrow('jumelage');
});
it('envoie uniquement le code de jumelage sans cookies ni référent', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [] }) }); vi.stubGlobal('fetch', fetcher);
    await new ScannerClient('https://127.0.0.1:8765', token).request('/scans');
    expect(fetcher).toHaveBeenCalledWith('https://127.0.0.1:8765/scans', expect.objectContaining({ credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer', headers: { Authorization: 'Bearer ' + token } }));
});
it('traduit les erreurs de jumelage et de pilote', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'SCANNER_DRIVER_ERROR' }) }));
    await expect(new ScannerClient('https://127.0.0.1:8765', token).request('/health')).rejects.toThrow('papier');
});
it('rejette un faux PDF et accepte le contenu PDF', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, blob: async () => new Blob(['html'], { type: 'application/pdf' }) }).mockResolvedValueOnce({ ok: true, blob: async () => new Blob(['%PDF-1.7\n'], { type: 'application/pdf' }) }); vi.stubGlobal('fetch', fetcher);
    const client = new ScannerClient('https://127.0.0.1:8765', token);
    const path = '/scans/00000000-0000-4000-8000-000000000001/content';
    await expect(client.request(path, undefined, 'GET', true)).rejects.toThrow('PDF valide');
    expect((await client.request<Blob>(path, undefined, 'GET', true)).size).toBe(9);
});
it('interrompt une requête et traduit un délai dépassé sans relancer le POST', async () => {
    vi.useFakeTimers(); const fetcher = vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => { init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))); })); vi.stubGlobal('fetch', fetcher);
    const request = new ScannerClient('https://127.0.0.1:8765', token).request('/scans', {}, 'POST');
    const assertion = expect(request).rejects.toThrow('Actualisez les scans'); await vi.advanceTimersByTimeAsync(20001); await assertion; expect(fetcher).toHaveBeenCalledTimes(1);
});
