import { expect, it, vi } from 'vitest';
import { WorkflowApi } from '../../src/api/workflow';
import { DigitizationApi } from '../../src/api/digitization';
const ID = '00000000-0000-4000-8000-000000000001';
it('appelle la boîte avec bucket, périmètre, pagination et signal', async () => {
    const request = vi.fn().mockResolvedValue({ items: [], page: 2, size: 20, hasMore: false });
    const signal = new AbortController().signal;
    await new WorkflowApi({ request }).inbox('AVAILABLE', { institutionId: ID, departmentId: ID }, 2, signal);
    const [path, options] = request.mock.calls[0];
    const url = new URL(path, 'https://example.test');
    expect(url.pathname).toBe('/workflow-tasks/inbox');
    expect(Object.fromEntries(url.searchParams)).toEqual({ bucket: 'AVAILABLE', institutionId: ID, departmentId: ID, page: '2', size: '20' });
    expect(options).toEqual({ signal });
    await new WorkflowApi({ request }).inbox('MINE');
    expect(request.mock.calls[1][0]).not.toMatch(/institutionId|departmentId/);
});
it('appelle le layout OCR authentifié avec validation de l’identifiant et annulation', async () => {
    const request = vi.fn().mockResolvedValue({});
    const api = new DigitizationApi({ request });
    const signal = new AbortController().signal;
    await api.ocrLayout(ID, signal);
    expect(request).toHaveBeenCalledWith('/digitization/ocr-results/' + ID + '/layout', { signal });
    expect(() => api.ocrLayout('../escape')).toThrow();
    expect(request).toHaveBeenCalledTimes(1);
});

it('demande un seul XML pour toutes les pages ou explicitement une page ALTO', async () => {
    const blob = new Blob(['<alto/>'], { type: 'application/xml' });
    const request = vi.fn().mockResolvedValue(blob);
    const api = new DigitizationApi({ request });
    const signal = new AbortController().signal;
    expect(await api.ocrAlto(ID, signal)).toBe(blob);
    expect(request).toHaveBeenLastCalledWith('/digitization/ocr-results/' + ID + '/alto', { signal, responseType: 'blob' });
    await api.ocrAlto(ID, signal, 2);
    expect(request).toHaveBeenLastCalledWith('/digitization/ocr-results/' + ID + '/alto?page=2', { signal, responseType: 'blob' });
    expect(() => api.ocrAlto('../escape')).toThrow();
    expect(request).toHaveBeenCalledTimes(2);
});
