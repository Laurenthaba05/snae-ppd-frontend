import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/core/http';
const DOC = '80f0f431-a8f1-4da0-b0b2-bbca91b9a739';
const VERSION = '2ac1113f-4d8b-4558-9bee-b445c8365b51';
const fixture = vi.hoisted(() => ({
    epoch: 1, me: null as unknown, allowed: new Set<string>(),
    records: { versions: vi.fn(), command: vi.fn(), ingestions: vi.fn(), lifecycle: vi.fn(), timestamp: vi.fn(), createTimestamp: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: { institutionId: 'inst1', departmentId: null } }), RecordWorkspaceProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
import { VersionsPanel } from '../../src/pages/Records';

const version = { id: VERSION, documentId: DOC, number: 1, state: 'BROUILLON', sealed: false, sealedHash: null, createdAt: '2026-09-29T10:00:00Z', sealedAt: null };
const lifecycle = (extra: Record<string, unknown> = {}) => ({ businessStatus: 'BROUILLON', archivalStatus: 'BROUILLON', destroyed: false, version: { id: VERSION, number: 1, sealed: false }, files: 1, validatedFiles: 1, validatedMasters: 0,
    sealBlockers: ['WORKFLOW_PENDING', 'VALIDATED_CONTENT_REQUIRED'], closeBlockers: ['DOCUMENT_UNSEALED'], ...extra });
beforeEach(() => {
    fixture.epoch += 1;
    fixture.allowed = new Set(['FILE_INGEST', 'VERSION_SEAL', 'DOCUMENT_VERSION_CREATE']);
    for (const fn of Object.values(fixture.records)) fn.mockReset();
    fixture.records.versions.mockResolvedValue([version]);
    fixture.records.ingestions.mockResolvedValue({ items: [], nextCursor: null });
    fixture.records.lifecycle.mockResolvedValue(lifecycle());
});

it('le chemin du document dit ce qui manque, étape par étape, et mène au bon endroit', async () => {
    const goTo = vi.fn();
    render(<VersionsPanel documentId={DOC} goTo={goTo} />);
    const box = await screen.findByRole('region', { name: 'Du brouillon à la conservation' });
    expect(within(box).getByText(/Prochaine étape :/)).toBeTruthy();
    expect(within(box).getByText(/1 fichier mais aucun maître validé/)).toBeTruthy();
    expect(within(box).getByText(/circuit de validation est en cours/)).toBeTruthy();
    fireEvent.click(within(box).getByRole('button', { name: 'Voir le circuit' }));
    expect(goTo).toHaveBeenCalledWith('workflow');
    fireEvent.click(within(box).getByRole('button', { name: 'Téléverser le maître' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
});

it('quand tout est prêt, le chemin propose de sceller et le scellement se fait depuis l’encart', async () => {
    fixture.records.lifecycle.mockResolvedValue(lifecycle({ validatedMasters: 1, sealBlockers: [] }));
    fixture.records.command.mockResolvedValue({});
    render(<VersionsPanel documentId={DOC} goTo={vi.fn()} />);
    const box = await screen.findByRole('region', { name: 'Du brouillon à la conservation' });
    fireEvent.click(within(box).getByRole('button', { name: 'Sceller la version' }));
    await waitFor(() => expect(fixture.records.command).toHaveBeenCalledWith('/versions/' + VERSION + '/seal', {}, expect.any(String)));
    await waitFor(() => expect(fixture.records.lifecycle.mock.calls.length).toBeGreaterThan(1)); // le chemin est relu après le scellement
});

it('les dépôts interrompus mènent au suivi des dépôts', async () => {
    fixture.records.lifecycle.mockResolvedValue(lifecycle({ validatedMasters: 1, sealBlockers: ['INGESTION_PENDING'] }));
    render(<VersionsPanel documentId={DOC} goTo={vi.fn()} />);
    const box = await screen.findByRole('region', { name: 'Du brouillon à la conservation' });
    fireEvent.click(within(box).getByRole('button', { name: 'Ouvrir le suivi des dépôts' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Suivi de mes dépôts')).toBeTruthy();
    expect(fixture.records.ingestions).toHaveBeenCalledWith(VERSION, expect.anything(), null);
});

it('sans le droit de sceller, l’encart n’offre pas le bouton', async () => {
    fixture.allowed = new Set(['FILE_INGEST']);
    fixture.records.lifecycle.mockResolvedValue(lifecycle({ validatedMasters: 1, sealBlockers: [] }));
    render(<VersionsPanel documentId={DOC} goTo={vi.fn()} />);
    const box = await screen.findByRole('region', { name: 'Du brouillon à la conservation' });
    expect(within(box).queryByRole('button', { name: 'Sceller la version' })).toBeNull();
});

it('tant que le serveur dit qu’il manque un maître, « Sceller » est grisé et le dépôt propose d’abord le rôle « Maître de conservation »', async () => {
    fixture.records.lifecycle.mockResolvedValue(lifecycle({ validatedMasters: 0, sealBlockers: ['VALIDATED_CONTENT_REQUIRED'] }));
    render(<VersionsPanel documentId={DOC} goTo={vi.fn()} />);
    await screen.findByRole('region', { name: 'Du brouillon à la conservation' });
    const seal = await screen.findByRole('button', { name: 'Sceller' }) as HTMLButtonElement;
    expect(seal.disabled).toBe(true);
    expect(seal.title).toMatch(/Du brouillon à la conservation/);
    fireEvent.click(screen.getByRole('button', { name: 'Téléverser un fichier' }));
    const dialog = await screen.findByRole('dialog');
    expect((within(dialog).getByLabelText('Rôle') as HTMLSelectElement).value).toBe('MAITRE_CONSERVATION');
});

it('quand la version a déjà son maître validé, « Sceller » est actif et le dépôt propose « Pièce jointe »', async () => {
    fixture.records.lifecycle.mockResolvedValue(lifecycle({ validatedMasters: 1, sealBlockers: [] }));
    render(<VersionsPanel documentId={DOC} goTo={vi.fn()} />);
    await screen.findByRole('region', { name: 'Du brouillon à la conservation' });
    expect((await screen.findByRole('button', { name: 'Sceller' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Téléverser un fichier' }));
    const dialog = await screen.findByRole('dialog');
    expect((within(dialog).getByLabelText('Rôle') as HTMLSelectElement).value).toBe('PIECE_JOINTE');
});

it('l’horodatage qualifié désactivé sur le serveur est expliqué, sans bloquer la suite', async () => {
    fixture.allowed = new Set(['FILE_INGEST', 'VERSION_SEAL', 'VERSION_TIMESTAMP', 'DOCUMENT_VERSION_CREATE']);
    fixture.records.versions.mockResolvedValue([{ ...version, state: 'SCELLEE', sealed: true, sealedHash: 'a'.repeat(64), sealedAt: '2026-10-07T20:00:00Z' }]);
    fixture.records.lifecycle.mockResolvedValue(lifecycle({ validatedMasters: 1, sealBlockers: [], version: { id: VERSION, number: 1, sealed: true } }));
    fixture.records.timestamp.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Ressource indisponible ou non autorisée.'));
    fixture.records.createTimestamp.mockRejectedValue(new ApiError(503, 'TIMESTAMPING_NOT_CONFIGURED', 'Le service est momentanément indisponible.'));
    render(<VersionsPanel documentId={DOC} goTo={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Horodater' }));
    expect(await screen.findByText(/L’horodatage qualifié n’est pas activé sur ce serveur/)).toBeTruthy();
    expect(screen.getByText(/Ce n’est pas nécessaire pour clore le document/)).toBeTruthy();
    expect(screen.queryByText('Le service est momentanément indisponible.')).toBeNull();
    expect((screen.getByRole('button', { name: 'Horodater' }) as HTMLButtonElement).disabled).toBe(false);   // on peut réessayer
});

it('face à un serveur plus ancien, aucun encart n’apparaît et le panneau reste utilisable', async () => {
    fixture.records.lifecycle.mockRejectedValue(new ApiError(404, 'ROUTE_NOT_FOUND', 'Cette opération n’existe pas sur ce serveur.'));
    render(<VersionsPanel documentId={DOC} goTo={vi.fn()} />);
    expect(await screen.findByRole('button', { name: 'Sceller' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Du brouillon à la conservation' })).toBeNull();
});
