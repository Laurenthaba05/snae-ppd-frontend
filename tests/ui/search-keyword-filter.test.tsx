import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { TermPage, Vocabulary, VocabularyTerm } from '../../src/core/vocabulary';

const INST = '00000000-0000-4000-8000-0000000000a1';
const fixture = vi.hoisted(() => ({
    epoch: 1, me: null as unknown, allowed: new Set<string>(['SEARCH_READ']),
    search: { search: vi.fn(), reindex: vi.fn(), status: vi.fn() },
    vocabulary: { list: vi.fn(), terms: vi.fn() } as { list: ReturnType<typeof vi.fn>; terms: ReturnType<typeof vi.fn> } | null
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: { institutionId: INST, departmentId: null } }) }));
import { SearchPage } from '../../src/pages/Search';

const vocabulary = (over: Partial<Vocabulary> = {}): Vocabulary => ({ id: 'v1', institutionId: INST, code: 'MAT', name: 'Matériaux', description: null, source: null, status: 'ACTIF', terms: 2, createdAt: '2026-10-01T10:00:00Z', ...over });
const term = (id: string, label: string, over: Partial<VocabularyTerm> = {}): VocabularyTerm => ({ id, vocabularyId: 'v1', label, definition: null, parentId: null, parentLabel: null,
    alternativeLabels: [], status: 'ACTIF', replacedById: null, replacedByLabel: null, obsolescenceReason: null, usage: null, ...over });
const termPage = (...items: VocabularyTerm[]): TermPage => ({ items, page: 0, size: 50, total: items.length, hasMore: false });
const INK = '00000000-0000-4000-8000-0000000000c1';
const PAPER = '00000000-0000-4000-8000-0000000000c2';

async function runSearch() {
    fireEvent.change(screen.getByLabelText('Rechercher'), { target: { value: 'registre' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }));
    await waitFor(() => expect(fixture.search.search).toHaveBeenCalled());
}

async function chooseTerm(label: string) {
    fireEvent.click(screen.getByRole('button', { name: 'Filtrer par mot-clé' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(await within(dialog).findByLabelText('Vocabulaire'), { target: { value: 'v1' } });
    fireEvent.click(await within(dialog).findByRole('button', { name: label }));
}

beforeEach(() => {
    fixture.allowed = new Set(['SEARCH_READ']);
    fixture.search.search.mockReset().mockResolvedValue({ hits: [], page: 0, size: 20, hasMore: false });
    fixture.search.reindex.mockReset();
    fixture.search.status.mockReset().mockResolvedValue({ status: 'OK', code: null, indexes: [], checkedAt: '2026-10-12T10:00:00Z' });
    fixture.vocabulary = { list: vi.fn().mockResolvedValue([vocabulary()]), terms: vi.fn().mockResolvedValue(termPage(term(INK, 'Encre'), term(PAPER, 'Papier vergé'))) };
    window.history.replaceState({}, '', '/app/recherche');
});

it('sans filtre, la recherche part comme avant, sans liste de mots-clés', async () => {
    render(<SearchPage />);
    expect(screen.getByText('aucun filtre')).toBeTruthy();
    await runSearch();
    const call = fixture.search.search.mock.calls[0]!;
    expect(call[0]).toBe('registre');
    expect(call[5]).toEqual([]);
});

it('un terme choisi devient un filtre visible, envoyé avec la recherche, et la page repart de la première', async () => {
    render(<SearchPage />);
    await runSearch();
    await chooseTerm('Encre');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retirer le filtre Encre' })).toBeTruthy());
    await waitFor(() => expect(fixture.search.search).toHaveBeenLastCalledWith('registre', 'ALL', 0, 20, expect.anything(), [INK]));
    // un second terme s'ajoute : les deux sont exigés
    await chooseTerm('Papier vergé');
    await waitFor(() => expect(fixture.search.search).toHaveBeenLastCalledWith('registre', 'ALL', 0, 20, expect.anything(), [INK, PAPER]));
});

it('retirer un filtre relance la recherche sans lui, et un terme déjà choisi ne s’ajoute pas deux fois', async () => {
    render(<SearchPage />);
    await runSearch();
    await chooseTerm('Encre');
    await chooseTerm('Encre');
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Retirer le filtre/ })).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Retirer le filtre Encre' }));
    await waitFor(() => expect(fixture.search.search).toHaveBeenLastCalledWith('registre', 'ALL', 0, 20, expect.anything(), []));
    expect(screen.getByText('aucun filtre')).toBeTruthy();
});

it('un terme obsolète est signalé comme tel dans le sélecteur', async () => {
    fixture.vocabulary!.terms.mockResolvedValue(termPage(term(INK, 'Encre', { status: 'OBSOLETE', replacedById: PAPER, replacedByLabel: 'Papier vergé' })));
    render(<SearchPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Filtrer par mot-clé' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(await within(dialog).findByLabelText('Vocabulaire'), { target: { value: 'v1' } });
    expect(await within(dialog).findByRole('button', { name: 'Encre (obsolète)' })).toBeTruthy();
});

it('sans client des vocabulaires, aucun filtre n’est proposé et la recherche reste utilisable', async () => {
    fixture.vocabulary = null;
    render(<SearchPage />);
    expect(screen.queryByRole('group', { name: 'Filtre par mot-clé' })).toBeNull();
    await runSearch();
    expect(fixture.search.search.mock.calls[0]![5]).toEqual([]);
});
