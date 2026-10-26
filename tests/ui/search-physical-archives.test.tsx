import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

// Les archives physiques dans la recherche plein texte : un type à part pour qui peut les lire, leur cote, un lien vers leur fiche, pas de filtre de mot-clé, et leur place dans la réindexation.
const fixture = vi.hoisted(() => ({
    epoch: 1, me: null as unknown, allowed: new Set<string>(['SEARCH_READ', 'PHYSICALARCHIVES_READ']), navigate: vi.fn(),
    search: { search: vi.fn(), reindex: vi.fn(), reindexStatus: vi.fn(), status: vi.fn() },
    vocabulary: null
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code), canAnywhere: (_me: unknown, code: string) => fixture.allowed.has(code) }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: { institutionId: null, departmentId: null } }) }));
vi.mock('../../src/ui/navigation', () => ({ navigate: (path: string) => fixture.navigate(path) }));
vi.mock('../../src/ui/Vocabularies', () => ({ KeywordFilter: ({ onChange }: { onChange: (next: Array<{ id: string; label: string }>) => void }) =>
    <button type="button" onClick={() => onChange([{ id: 'k1', label: 'Encre' }])}>Choisir un mot-clé</button> }));
import { SearchPage } from '../../src/pages/Search';

const hits = [
    { id: 'a1', type: 'ARCHIVE_PHYSIQUE', titre: 'Dossier personnel de Camara', description: 'Registre des élèves — Site › Salle 3', score: 2.5, reference: 'DP-2015-001' },
    { id: 'd1', type: 'DOCUMENT', titre: 'Rapport annuel', description: null, score: 1.1 }];

beforeEach(() => {
    fixture.allowed = new Set(['SEARCH_READ', 'PHYSICALARCHIVES_READ']);
    fixture.navigate.mockReset();
    fixture.search.search.mockReset().mockResolvedValue({ hits, page: 0, size: 20, hasMore: false });
    fixture.search.reindex.mockReset();
    fixture.search.reindexStatus.mockReset().mockResolvedValue({ run: null });
    fixture.search.status.mockReset().mockResolvedValue({ status: 'OK', code: null, indexes: [], checkedAt: '2026-10-25T10:00:00Z' });
    window.history.replaceState({}, '', '/app/recherche?q=camara');
});

const lastType = () => fixture.search.search.mock.calls.at(-1)![1];

it('propose le type « Archives physiques » à qui peut les lire, et à lui seul', async () => {
    const { unmount } = render(<SearchPage />);
    await screen.findByText('Rapport annuel');
    expect(within(screen.getByLabelText('Type')).getByRole('option', { name: 'Archives physiques' })).toBeTruthy();
    unmount();
    fixture.allowed = new Set(['SEARCH_READ']);
    render(<SearchPage />);
    await screen.findByText('Rapport annuel');
    expect(within(screen.getByLabelText('Type')).queryByRole('option', { name: 'Archives physiques' })).toBeNull();
});

it('montre la cote, le type et ouvre la fiche de l’archive physique', async () => {
    render(<SearchPage />);
    const line = (await screen.findByText('Dossier personnel de Camara')).closest('tr') as HTMLElement;
    expect(within(line).getByText('Cote : DP-2015-001')).toBeTruthy();
    expect(within(line).getByText('Registre des élèves — Site › Salle 3')).toBeTruthy();
    expect(within(line).getByText('Archive physique')).toBeTruthy();
    expect(within(line).queryByRole('button', { name: 'Voir le mot dans le PDF' })).toBeNull();
    fireEvent.click(within(line).getByRole('button', { name: /Dossier personnel de Camara/ }));
    expect(fixture.navigate).toHaveBeenCalledWith('/app/archives-physiques?archive=a1');
    const doc = screen.getByText('Rapport annuel').closest('tr') as HTMLElement;
    fireEvent.click(within(doc).getByRole('button', { name: /Rapport annuel/ }));
    expect(fixture.navigate).toHaveBeenLastCalledWith('/app/documents/d1');
});

it('cherche les archives physiques seules, sans filtre de mot-clé', async () => {
    render(<SearchPage />);
    await screen.findByText('Rapport annuel');
    expect(screen.getByRole('button', { name: 'Choisir un mot-clé' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'ARCHIVE_PHYSIQUE' } });
    await waitFor(() => expect(lastType()).toBe('ARCHIVE_PHYSIQUE'));
    expect(screen.queryByRole('button', { name: 'Choisir un mot-clé' })).toBeNull();
    expect(fixture.search.search.mock.calls.at(-1)![5]).toEqual([]);
    expect(fixture.search.search.mock.calls.at(-1)![6]).toEqual([]);
});

it('dit que les archives physiques n’ont pas de mots-clés quand un filtre est choisi dans une recherche générale', async () => {
    render(<SearchPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Choisir un mot-clé' }));
    expect(await screen.findByText(/Les archives physiques n’ont ni mots-clés ni métadonnées/)).toBeTruthy();
});

it('n’affiche pas cette remarque à qui ne peut pas lire les archives physiques', async () => {
    fixture.allowed = new Set(['SEARCH_READ']);
    render(<SearchPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Choisir un mot-clé' }));
    await waitFor(() => expect(fixture.search.search.mock.calls.at(-1)![5]).toEqual(['k1']));
    expect(screen.queryByText(/Les archives physiques n’ont ni mots-clés/)).toBeNull();
});

it('la réindexation dit aussi les archives physiques, en cours et en bilan', async () => {
    fixture.allowed = new Set(['SEARCH_READ', 'SEARCH_REINDEX', 'PHYSICALARCHIVES_READ']);
    fixture.search.reindexStatus.mockResolvedValue({ run: { id: 'r1', state: 'RUNNING', phase: 'ARCHIVES', documents: 12, dossiers: 3, archives: 40, failures: 0 } });
    const { unmount } = render(<SearchPage />);
    expect(await screen.findByText(/Réindexation en cours \(archives physiques\)/)).toBeTruthy();
    expect(screen.getByText(/12 documents, 3 dossiers et 40 archives physiques traités/)).toBeTruthy();
    unmount();
    fixture.search.reindexStatus.mockResolvedValue({ run: null });
    fixture.search.reindex.mockResolvedValue({ documents: 12, dossiers: 3, archives: 1, failures: 0 });
    render(<SearchPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Réindexer' }));
    expect(await screen.findByText(/Réindexation terminée : 12 documents, 3 dossiers et 1 archive physique traités\./)).toBeTruthy();
});

it('un index en retard cite les archives physiques parmi ce qui n’est pas trouvable', async () => {
    fixture.search.status.mockResolvedValue({ status: 'DEGRADED', code: 'SEARCH_INDEX_OUT_OF_SYNC', checkedAt: '2026-10-25T10:00:00Z', indexes: [
        { name: 'snae-archives-physiques', health: 'green', indexed: 4, expected: 9 }] });
    render(<SearchPage />);
    expect(await screen.findByText(/documents, dossiers ou archives physiques ne sont pas trouvables/)).toBeTruthy();
    expect(screen.getByText(/Archives physiques : 4 indexés sur 9/)).toBeTruthy();
});
