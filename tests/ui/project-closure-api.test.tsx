import { expect, it, vi } from 'vitest';
import { DigitizationApi } from '../../src/api/digitization';
import { HttpTransport } from '../../src/core/http';
const id = '5a96884d-7de9-4a09-abb7-92a652da2f57';
const reason = 'Deux éléments sont encore en attente.';
it('envoie réellement la commande avec authentification, version, motif et en-tête obligatoire', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ id, statut: 'EN_COURS', versionLock: 2 }), { status: 200 }));
    const api = new DigitizationApi(new HttpTransport('/api/v1', async () => 'token-de-test', vi.fn(), fetcher));
    const response = await api.reopenProject(id, 1, reason);
    expect(response.statut).toBe('EN_COURS'); expect(fetcher).toHaveBeenCalledOnce();
    const [url, options] = fetcher.mock.calls[0]!;
    expect(url).toBe(`/api/v1/digitization/projects/${id}/reopen`); expect(options!.method).toBe('POST');
    const headers = new Headers(options!.headers);
    expect(headers.get('Authorization')).toBe('Bearer token-de-test');
    expect(headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.parse(options!.body as string)).toEqual({ expectedVersion: 1, reason });
});
it('conserve une clé explicite pour la reprise de la même commande et remonte un conflit sans retenter', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ code: 'DIGITIZATION_PROJECT_VERSION_CONFLICT', message: 'Le projet a changé.' }), { status: 409 }));
    const api = new DigitizationApi(new HttpTransport('/api/v1', async () => 'token-de-test', vi.fn(), fetcher));
    await expect(api.reopenProject(id, 1, reason, 'recette-reopen-1')).rejects.toMatchObject({ status: 409, code: 'DIGITIZATION_PROJECT_VERSION_CONFLICT' });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(new Headers(fetcher.mock.calls[0]![1]!.headers).get('Idempotency-Key')).toBe('recette-reopen-1');
});
