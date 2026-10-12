import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Keyword } from '../../src/core/vocabulary';

const institution = '11111111-1111-4111-8111-111111111111';
const TERM = '00000000-0000-4000-8000-0000000000c1';
const session = vi.hoisted(() => ({
    epoch: 1, me: null, demo: false, records: { transport: { request: vi.fn() } },
    vocabulary: { keywords: vi.fn(), list: vi.fn(), terms: vi.fn(), addKeywords: vi.fn(), removeKeyword: vi.fn() },
    allowed: new Set<string>(['ARCHIVAL_DESCRIPTION_READ', 'ARCHIVAL_DESCRIPTION_MANAGE'])
}));
const workspace = vi.hoisted(() => ({ scope: { institutionId: '11111111-1111-4111-8111-111111111111' as string | null } }));
vi.mock('../../src/auth/session', () => ({ useSession: () => session }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => workspace }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => session.allowed.has(code) }));
import { ArchivalDescriptionPage } from '../../src/pages/ArchivalDescription';

const description = { id: '00000000-0000-4000-8000-000000000101', input: { institutionId: institution, code: 'GN/1', title: 'Fonds 1', level: 'FONDS', parentId: null, producerId: null,
    confidentiality: 'INTERNE', documentId: null, dossierId: null, details: { status: 'BROUILLON' }, version: 1 }, version: 1, updatedAt: '2026-10-08T09:00:00Z', createdAt: '2026-09-01T09:00:00Z' };
const keyword = (over: Partial<Keyword> = {}): Keyword => ({ termId: TERM, label: 'Cadastre', vocabularyId: 'v1', vocabularyName: 'Sources', vocabularyCode: 'SRC', status: 'ACTIF',
    replacedByLabel: null, addedAt: '2026-10-05T10:00:00Z', ...over });

beforeEach(() => {
    session.allowed = new Set(['ARCHIVAL_DESCRIPTION_READ', 'ARCHIVAL_DESCRIPTION_MANAGE']);
    session.records.transport.request.mockReset().mockImplementation(async (path: string) => {
        if (path.startsWith('/archives/descriptions?')) return [description];
        if (path.startsWith('/archives/authorities?') || path.startsWith('/archives/relations?')) return [];
        throw new Error('appel inattendu ' + path);
    });
    for (const fn of Object.values(session.vocabulary)) fn.mockReset();
    session.vocabulary.keywords.mockResolvedValue([keyword()]);
    session.vocabulary.list.mockResolvedValue([]);
    session.vocabulary.terms.mockResolvedValue({ items: [], page: 0, size: 50, total: 0, hasMore: false });
    session.vocabulary.removeKeyword.mockResolvedValue([]);
});

async function openEditor() {
    render(<ArchivalDescriptionPage />);
    fireEvent.click(await screen.findByRole('button', { name: /^Consulter/ }));
    return screen.findByRole('dialog');
}

it('la notice d’une description existante montre ses mots-clés avec leur vocabulaire, et propose d’en ajouter ou d’en retirer', async () => {
    const dialog = await openEditor();
    const panel = await within(dialog).findByRole('region', { name: 'Mots-clés' });
    expect(await within(panel).findByText('Cadastre')).toBeTruthy();
    expect(within(panel).getByText('Sources')).toBeTruthy();
    expect(within(panel).getByRole('button', { name: 'Ajouter des mots-clés' })).toBeTruthy();
    expect(session.vocabulary.keywords).toHaveBeenCalledWith('NOTICE', description.id, expect.anything());
    fireEvent.click(within(panel).getByRole('button', { name: 'Retirer le mot-clé Cadastre' }));
    await waitFor(() => expect(session.vocabulary.removeKeyword).toHaveBeenCalledWith('NOTICE', description.id, TERM, expect.any(String)));
});

it('sans l’habilitation de gestion, les mots-clés se lisent sans pouvoir être modifiés', async () => {
    session.allowed = new Set(['ARCHIVAL_DESCRIPTION_READ']);
    const dialog = await openEditor();
    const panel = await within(dialog).findByRole('region', { name: 'Mots-clés' });
    expect(await within(panel).findByText('Cadastre')).toBeTruthy();
    expect(within(panel).queryByRole('button', { name: 'Ajouter des mots-clés' })).toBeNull();
    expect(within(panel).queryByRole('button', { name: 'Retirer le mot-clé Cadastre' })).toBeNull();
});

it('une nouvelle description n’a pas encore de mots-clés à poser : le panneau n’apparaît qu’une fois la notice enregistrée', async () => {
    render(<ArchivalDescriptionPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Créer une description' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('region', { name: 'Mots-clés' })).toBeNull();
    expect(session.vocabulary.keywords).not.toHaveBeenCalled();
});

it('le bouton Enregistrer, placé sous le panneau, enregistre toujours la notice', async () => {
    session.records.transport.request.mockImplementation(async (path: string, options?: { method?: string }) => {
        if (path.startsWith('/archives/descriptions?')) return [description];
        if (path.startsWith('/archives/authorities?') || path.startsWith('/archives/relations?')) return [];
        if (options?.method === 'PUT') return description;
        throw new Error('appel inattendu ' + path);
    });
    const dialog = await openEditor();
    await within(dialog).findByRole('region', { name: 'Mots-clés' });
    fireEvent.change(within(dialog).getByLabelText('Intitulé'), { target: { value: 'Fonds 1 révisé' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(session.records.transport.request.mock.calls.some(c => (c[1] as { method?: string })?.method === 'PUT')).toBe(true));
    const put = session.records.transport.request.mock.calls.find(c => (c[1] as { method?: string })?.method === 'PUT')!;
    expect(put[0]).toBe('/archives/descriptions/' + description.id);
    expect((put[1] as { body: { title: string } }).body.title).toBe('Fonds 1 révisé');
});
