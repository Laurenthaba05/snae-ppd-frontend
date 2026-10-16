import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { saveBlob } from '../../src/core/download';
import { saveBlob as uiSaveBlob } from '../../src/ui/download';
import { downloadBytes } from '../../src/core/spreadsheet';

// Un seul enregistrement de fichier pour tout le frontend : une adresse temporaire, un lien invisible, puis l'adresse est libérée.
let clicked: { href: string; download: string; rel: string }[] = [];
let created: Blob[] = [];
let revoked: string[] = [];

beforeEach(() => {
    vi.useFakeTimers(); clicked = []; created = []; revoked = [];
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: (blob: Blob) => { created.push(blob); return 'blob:test-' + created.length; } });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: (url: string) => { revoked.push(url); } });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { clicked.push({ href: this.href, download: this.download, rel: this.rel }); });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it('enregistre le fichier sous son nom, laisse le DOM propre et libère l’adresse après un délai', () => {
    saveBlob(new Blob(['abc']), 'rapport.csv');
    expect(clicked).toEqual([{ href: 'blob:test-1', download: 'rapport.csv', rel: 'noopener' }]);
    expect(document.querySelectorAll('a[download]').length).toBe(0);
    expect(revoked).toEqual([]);
    vi.advanceTimersByTime(999); expect(revoked).toEqual([]);
    vi.advanceTimersByTime(2); expect(revoked).toEqual(['blob:test-1']);
});

it('le chemin historique de l’interface est le même enregistrement', () => {
    expect(uiSaveBlob).toBe(saveBlob);
});

it('un tableur fabriqué dans le navigateur passe par le même enregistrement, avec son type et un délai plus long', () => {
    downloadBytes(new Uint8Array([1, 2, 3]), 'classeur.xlsx');
    expect(clicked).toEqual([{ href: 'blob:test-1', download: 'classeur.xlsx', rel: 'noopener' }]);
    expect(created[0]!.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(created[0]!.size).toBe(3);
    vi.advanceTimersByTime(9_999); expect(revoked).toEqual([]);
    vi.advanceTimersByTime(2); expect(revoked).toEqual(['blob:test-1']);
    downloadBytes(new Uint8Array([9]), 'a.csv', 'text/csv');
    expect(created[1]!.type).toBe('text/csv');
});
