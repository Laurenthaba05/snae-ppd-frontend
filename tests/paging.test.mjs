import test from 'node:test';
import assert from 'node:assert/strict';
import { allPages, LIST_MAX_ITEMS, LIST_PAGE_SIZE } from '../.test-build/paging.js';
import { ApiError } from '../.test-build/http.js';

const pageOf = (items, page, hasMore) => ({ items, page, size: LIST_PAGE_SIZE, hasMore });

test('allPages réunit les pages dans l’ordre et s’arrête quand il n’y a plus de suite', async () => {
    const calls = [];
    const items = await allPages(async (page, size) => {
        calls.push([page, size]);
        return pageOf([`a${page}`, `b${page}`], page, page < 2);
    });
    assert.deepEqual(items, ['a0', 'b0', 'a1', 'b1', 'a2', 'b2']);
    assert.deepEqual(calls, [[0, 200], [1, 200], [2, 200]]);
});

test('allPages renvoie une liste vide quand le serveur n’a rien', async () => {
    assert.deepEqual(await allPages(async page => pageOf([], page, false)), []);
});

test('allPages refuse une liste qui dépasse la limite : une erreur claire, jamais une liste tronquée en silence', async () => {
    let fetched = 0;
    await assert.rejects(allPages(async page => { fetched++; return pageOf(Array.from({ length: LIST_PAGE_SIZE }, (_, i) => `p${page}-${i}`), page, true); }, 450),
        error => error instanceof ApiError && error.status === 413 && error.code === 'LIST_TOO_LARGE' && /450/.test(error.message));
    assert.equal(fetched, 3, 'trois pages de 200 suffisent à dépasser 450 : on s’arrête là');
    assert.equal(LIST_MAX_ITEMS, 5000);
});

test('allPages ne boucle pas quand le serveur annonce une suite sans rien envoyer', async () => {
    let fetched = 0;
    const items = await allPages(async page => { fetched++; return pageOf(page === 0 ? ['x'] : [], page, true); });
    assert.deepEqual(items, ['x']);
    assert.equal(fetched, 2);
});

test('allPages transmet l’erreur d’une page sans rien rendre de partiel', async () => {
    await assert.rejects(allPages(async page => { if (page === 1) throw new ApiError(503, 'STORAGE_UNAVAILABLE', 'Stockage indisponible.'); return pageOf(['a'], page, true); }),
        error => error instanceof ApiError && error.status === 503);
});
