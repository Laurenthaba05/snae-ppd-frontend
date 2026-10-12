import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { SearchStatus } from '../../src/core/types';

const fixture = vi.hoisted(() => ({
    epoch: 1, me: null as unknown, allowed: new Set<string>(['SEARCH_READ']),
    search: { search: vi.fn(), reindex: vi.fn(), status: vi.fn() },
    vocabulary: null
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: { institutionId: null, departmentId: null } }) }));
import { SearchPage } from '../../src/pages/Search';

const status = (over: Partial<SearchStatus> = {}): SearchStatus => ({ status: 'OK', code: null, indexes: [], checkedAt: '2026-10-12T10:00:00Z', ...over });

beforeEach(() => {
    fixture.allowed = new Set(['SEARCH_READ']);
    fixture.search.search.mockReset().mockResolvedValue({ hits: [], page: 0, size: 20, hasMore: false });
    fixture.search.reindex.mockReset();
    fixture.search.status.mockReset().mockResolvedValue(status());
    window.history.replaceState({}, '', '/app/recherche');
});

it('un moteur en bon état ne produit aucun avertissement', async () => {
    render(<SearchPage />);
    await waitFor(() => expect(fixture.search.status).toHaveBeenCalled());
    expect(screen.queryByText(/moteur de recherche/i)).toBeNull();
    expect(screen.queryByText(/index/i)).toBeNull();
});

it('un index en retard sur la base est signalé, avec les volumes quand le serveur les fournit', async () => {
    fixture.search.status.mockResolvedValue(status({ status: 'DEGRADED', code: 'SEARCH_INDEX_OUT_OF_SYNC', indexes: [
        { name: 'snae-documents', health: 'green', indexed: 1, expected: 12 },
        { name: 'snae-dossiers', health: 'green', indexed: 1, expected: 3 }] }));
    render(<SearchPage />);
    expect(await screen.findByText(/n’est pas aligné sur la base/)).toBeTruthy();
    expect(screen.getByText(/Documents : 1 indexé sur 12 · Dossiers : 1 indexé sur 3/)).toBeTruthy();
});

it('un moteur désactivé est signalé sans volumes', async () => {
    fixture.search.status.mockResolvedValue(status({ status: 'DISABLED', code: 'SEARCH_NOT_CONFIGURED' }));
    render(<SearchPage />);
    expect(await screen.findByText(/n’est pas activé sur ce serveur/)).toBeTruthy();
    expect(screen.queryByText(/indexé/)).toBeNull();
});

it('une sonde d’état en échec ne bloque pas la page', async () => {
    fixture.search.status.mockRejectedValue(new Error('réseau'));
    render(<SearchPage />);
    await waitFor(() => expect(fixture.search.status).toHaveBeenCalled());
    expect(screen.getByLabelText('Rechercher')).toBeTruthy();
});

it('la réindexation rend son bilan, signale les échecs et relit l’état du moteur', async () => {
    fixture.allowed = new Set(['SEARCH_READ', 'SEARCH_REINDEX']);
    fixture.search.reindex.mockResolvedValue({ documents: 12, dossiers: 3, failures: 1 });
    render(<SearchPage />);
    await waitFor(() => expect(fixture.search.status).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /Réindexer/ }));
    expect(await screen.findByText(/12 documents et 3 dossiers traités ; 1 en échec/)).toBeTruthy();
    await waitFor(() => expect(fixture.search.status).toHaveBeenCalledTimes(2));
});
