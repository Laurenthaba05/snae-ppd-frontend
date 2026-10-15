import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { SearchStatus } from '../../src/core/types';

const fixture = vi.hoisted(() => ({
    epoch: 1, me: null as unknown, allowed: new Set<string>(['SEARCH_READ']),
    search: { search: vi.fn(), reindex: vi.fn(), reindexStatus: vi.fn(), status: vi.fn() },
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
    fixture.search.reindexStatus.mockReset().mockResolvedValue({ run: null });
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

const run = (over: Record<string, unknown> = {}) => ({ id: 'run-1', state: 'RUNNING', phase: 'DOCUMENTS', documents: 0, dossiers: 0, failures: 0, errorCode: null,
    startedAt: '2026-10-12T10:00:00Z', finishedAt: null, resumedFrom: null, ...over });

it('la réindexation tourne en arrière-plan : l’avancement se lit, puis le bilan final apparaît', async () => {
    fixture.allowed = new Set(['SEARCH_READ', 'SEARCH_REINDEX']);
    fixture.search.reindex.mockResolvedValue(run());
    fixture.search.reindexStatus
        .mockResolvedValueOnce({ run: null })                                                   // lecture au chargement de la page
        .mockResolvedValueOnce({ run: run({ documents: 5, dossiers: 0 }) })
        .mockResolvedValue({ run: run({ state: 'DONE', phase: 'DOSSIERS', documents: 12, dossiers: 3, finishedAt: '2026-10-12T10:00:09Z' }) });
    render(<SearchPage />);
    await waitFor(() => expect(fixture.search.reindexStatus).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /Réindexer/ }));
    expect(await screen.findByText(/Réindexation en cours/)).toBeTruthy();
    expect(fixture.search.reindex).toHaveBeenCalledWith(expect.any(String), false);
    expect(await screen.findByText(/12 documents et 3 dossiers traités\./, {}, { timeout: 8000 })).toBeTruthy();
    expect(screen.queryByText(/Réindexation en cours/)).toBeNull();
}, 15000);

it('une réindexation arrêtée est signalée au retour sur la page et la reprise continue la même exécution', async () => {
    fixture.allowed = new Set(['SEARCH_READ', 'SEARCH_REINDEX']);
    fixture.search.reindexStatus.mockResolvedValue({ run: run({ state: 'FAILED', errorCode: 'SEARCH_UNAVAILABLE', documents: 40, dossiers: 0, finishedAt: '2026-10-12T10:00:05Z' }) });
    fixture.search.reindex.mockResolvedValue(run({ id: 'run-2', resumedFrom: 'run-1', documents: 40 }));
    render(<SearchPage />);
    expect(await screen.findByText(/La réindexation s’est arrêtée : le moteur de recherche ne répondait plus/)).toBeTruthy();
    expect(screen.getByText(/40 documents et 0 dossier sont déjà traités/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reprendre la réindexation' }));
    await waitFor(() => expect(fixture.search.reindex).toHaveBeenCalledWith(expect.any(String), true));
    expect(await screen.findByText(/Réindexation en cours/)).toBeTruthy();
});

it('sans l’habilitation de réindexation, la dernière exécution n’est pas demandée', async () => {
    render(<SearchPage />);
    await waitFor(() => expect(fixture.search.status).toHaveBeenCalled());
    expect(fixture.search.reindexStatus).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Réindexer/ })).toBeNull();
});
