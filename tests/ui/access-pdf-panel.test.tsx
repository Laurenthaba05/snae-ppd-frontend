import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AccessPdf, DigitizationElement } from '../../src/core/types';
const fixture = vi.hoisted(() => ({
    epoch: 1, me: null as unknown, allowed: new Set<string>(['DIGITIZATION_READ', 'DIGITIZATION_QC']),
    digitization: { accessPdf: vi.fn(), accessPdfPart: vi.fn(), command: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
import { AccessPdfPanel } from '../../src/ui/AccessPdfPanel';

const ID = '00000000-0000-4000-8000-0000000000';
const element: DigitizationElement = { id: ID + '01', projetNumerisationId: ID + '02', archivePhysiqueId: null, documentId: ID + '03', ordre: null, descriptionSource: 'Registre', statut: 'CONTROLE_QUALITE', dateDebut: null, dateFin: null, versionLock: 3 };
const part = (extra = {}) => ({ partNo: 1, partCount: 1, firstPage: 1, lastPage: 12, pageCount: 12, sizeBytes: 5_000_000, ...extra });
const view = (extra: Partial<AccessPdf> = {}): AccessPdf => ({ enabled: true, pages: 12, copiesManquantes: [], genereLe: null, aJour: false, volumes: [], tache: null, ...extra });

beforeEach(() => {
    fixture.allowed = new Set(['DIGITIZATION_READ', 'DIGITIZATION_QC']);
    fixture.digitization.accessPdf.mockReset();
    fixture.digitization.accessPdfPart.mockReset();
    fixture.digitization.command.mockReset().mockResolvedValue({});
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:pdf');
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it('désactivé et rien de généré, ou sans page : le panneau n’apparaît pas', async () => {
    fixture.digitization.accessPdf.mockResolvedValue(view({ enabled: false }));
    const first = render(<AccessPdfPanel element={element} />);
    await waitFor(() => expect(fixture.digitization.accessPdf).toHaveBeenCalled());
    await waitFor(() => expect(first.container.textContent).toBe(''));
    first.unmount();
    fixture.digitization.accessPdf.mockResolvedValue(view({ pages: 0 }));
    const second = render(<AccessPdfPanel element={element} />);
    await waitFor(() => expect(second.container.textContent).toBe(''));
});

it('tant que des pages n’ont pas de copie de consultation, il l’explique et ne propose pas de générer', async () => {
    fixture.digitization.accessPdf.mockResolvedValue(view({ copiesManquantes: [3, 4] }));
    render(<AccessPdfPanel element={element} />);
    expect(await screen.findByText('2 sans copie de consultation')).toBeTruthy();
    expect(screen.getByText(/il manque celles des pages 3, 4/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /PDF d’accès/ })).toBeNull();
});

it('demande la génération avec une clé, puis affiche la génération en cours', async () => {
    fixture.digitization.accessPdf.mockResolvedValueOnce(view());
    render(<AccessPdfPanel element={element} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Générer le PDF d’accès' }));
    fixture.digitization.accessPdf.mockResolvedValue(view({ tache: { state: 'QUEUED', errorCode: null, updatedAt: '2026-10-04T10:00:00Z' } }));
    await waitFor(() => expect(fixture.digitization.command).toHaveBeenCalledTimes(1));
    const [path, body, key, method] = fixture.digitization.command.mock.calls[0]!;
    expect(path).toBe(`/elements/${element.id}/access-pdf`);
    expect(body).toEqual({});
    expect(typeof key).toBe('string');
    expect(method).toBe('POST');
    expect(await screen.findByText('génération en cours…')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Générer|Régénérer|Relancer/ })).toBeNull();
});

it('sans habilitation de numérisation ou de contrôle, le bouton de génération n’est pas proposé', async () => {
    fixture.allowed = new Set(['DIGITIZATION_READ']);
    fixture.digitization.accessPdf.mockResolvedValue(view());
    render(<AccessPdfPanel element={element} />);
    expect(await screen.findByText('pas encore généré')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /PDF d’accès/ })).toBeNull();
});

it('un PDF à jour liste ses volumes et s’ouvre dans un nouvel onglet', async () => {
    fixture.digitization.accessPdf.mockResolvedValue(view({ aJour: true, genereLe: '2026-10-04T10:00:00Z', tache: { state: 'DONE', errorCode: null, updatedAt: '2026-10-04T10:00:00Z' },
        volumes: [part({ partNo: 1, partCount: 2, firstPage: 1, lastPage: 8, pageCount: 8 }), part({ partNo: 2, partCount: 2, firstPage: 9, lastPage: 12, pageCount: 4, sizeBytes: 2_000_000 })] }));
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    fixture.digitization.accessPdfPart.mockResolvedValue(blob);
    const open = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    render(<AccessPdfPanel element={element} />);
    expect(await screen.findByText('à jour')).toBeTruthy();
    expect(screen.getByText('Volume 1 sur 2 · pages 1 à 8 · 4,8 Mo')).toBeTruthy();
    expect(screen.getByText('Volume 2 sur 2 · pages 9 à 12 · 1,9 Mo')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Générer|Régénérer/ })).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Ouvrir' })[1]!);
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    expect(fixture.digitization.accessPdfPart).toHaveBeenCalledWith(element.id, 2);
    expect(open.mock.calls[0]![0]).toBe('blob:pdf');
});

it('après une page rescannée, le PDF existant reste ouvrable et propose de se régénérer ; si le navigateur bloque la fenêtre, il est téléchargé', async () => {
    fixture.digitization.accessPdf.mockResolvedValue(view({ aJour: false, genereLe: '2026-10-03T10:00:00Z', volumes: [part()], tache: { state: 'DONE', errorCode: null, updatedAt: '2026-10-03T10:00:00Z' } }));
    fixture.digitization.accessPdfPart.mockResolvedValue(new Blob(['%PDF-1.4'], { type: 'application/pdf' }));
    vi.spyOn(window, 'open').mockReturnValue(null);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(<AccessPdfPanel element={element} />);
    expect(await screen.findByText('à régénérer : les pages ont changé')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Régénérer le PDF d’accès' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
});

it('une génération en échec en donne la raison et propose de relancer', async () => {
    fixture.digitization.accessPdf.mockResolvedValue(view({ tache: { state: 'FAILED', errorCode: 'ACCESS_PDF_SOURCE_INTEGRITY', updatedAt: '2026-10-04T10:00:00Z' } }));
    render(<AccessPdfPanel element={element} />);
    expect(await screen.findByText(/Dernière génération en échec : une copie de consultation a changé dans le stockage/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Relancer le PDF d’accès' })).toBeTruthy();
});

it('pendant une génération, l’état est relu toutes les 8 secondes', async () => {
    vi.useFakeTimers();
    fixture.digitization.accessPdf.mockResolvedValue(view({ tache: { state: 'RUNNING', errorCode: null, updatedAt: '2026-10-04T10:00:00Z' } }));
    render(<AccessPdfPanel element={element} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(fixture.digitization.accessPdf).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(8100); });
    expect(fixture.digitization.accessPdf.mock.calls.length).toBeGreaterThanOrEqual(2);
});
