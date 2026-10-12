import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/core/http';
const DOC = '80f0f431-a8f1-4da0-b0b2-bbca91b9a739';
const VERSION = '2ac1113f-4d8b-4558-9bee-b445c8365b51';
const fixture = vi.hoisted(() => ({
    epoch: 1, me: null as unknown, allowed: new Set<string>(),
    records: { versions: vi.fn(), command: vi.fn(), ingestions: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: { institutionId: 'inst1', departmentId: null } }), RecordWorkspaceProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
import { VersionsPanel } from '../../src/pages/Records';

const version = { id: VERSION, documentId: DOC, number: 1, state: 'BROUILLON', sealed: false, sealedHash: null, createdAt: '2026-09-29T10:00:00Z', sealedAt: null };
beforeEach(() => {
    fixture.epoch += 1;
    fixture.allowed = new Set(['FILE_INGEST', 'VERSION_SEAL', 'DOCUMENT_VERSION_CREATE']);
    for (const fn of Object.values(fixture.records)) fn.mockReset();
    fixture.records.versions.mockResolvedValue([version]);
    fixture.records.ingestions.mockResolvedValue({ items: [], nextCursor: null });
});

it('un scellement refusé pour dépôts interrompus l’explique et ouvre le suivi des dépôts de cette version', async () => {
    fixture.records.command.mockRejectedValue(new ApiError(409, 'INGESTION_PENDING', 'Une ingestion en cours ou à reprendre empêche le scellement.'));
    render(<VersionsPanel documentId={DOC} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sceller' }));
    expect(await screen.findByText('Une ingestion en cours ou à reprendre empêche le scellement.')).toBeTruthy();
    expect(screen.getByText(/Ouvrez le suivi des dépôts : terminez-les ou abandonnez ceux qui ne servent plus/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le suivi des dépôts' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Suivi de mes dépôts')).toBeTruthy();
    expect(fixture.records.ingestions).toHaveBeenCalledWith(VERSION, expect.anything(), null);
});

it('sans maître validé, le refus dit comment en déposer un', async () => {
    fixture.records.command.mockRejectedValue(new ApiError(422, 'VALIDATED_CONTENT_REQUIRED', 'Un maître de conservation validé est requis.'));
    render(<VersionsPanel documentId={DOC} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sceller' }));
    expect(await screen.findByText(/fichier « Maître de conservation » validé/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ouvrir le suivi des dépôts' })).toBeNull();
});

it('une erreur sans explication particulière reste affichée telle quelle', async () => {
    fixture.records.command.mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'Le service est momentanément indisponible.'));
    render(<VersionsPanel documentId={DOC} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sceller' }));
    expect(await screen.findByText('Le service est momentanément indisponible.')).toBeTruthy();
    expect(screen.queryByText(/Ouvrez le suivi des dépôts/)).toBeNull();
});
