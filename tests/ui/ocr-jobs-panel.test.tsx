import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DigitizationElement, DigitizationElementStatus, OcrJobItem, OcrJobs } from '../../src/core/types';
const fixture = vi.hoisted(() => ({
    epoch: 1, me: null as unknown, allowed: new Set<string>(['DIGITIZATION_READ', 'DIGITIZATION_OCR']),
    digitization: { ocrJobs: vi.fn(), command: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
import { OcrJobsPanel } from '../../src/ui/OcrJobsPanel';

const ID = '00000000-0000-4000-8000-0000000000';
const element = (statut: DigitizationElementStatus = 'OCR_INDEXATION'): DigitizationElement => ({ id: ID + '01', projetNumerisationId: ID + '02', archivePhysiqueId: null, documentId: ID + '03', ordre: null, descriptionSource: 'Registre', statut, dateDebut: null, dateFin: null, versionLock: 1 });
const job = (n: number, extra: Partial<OcrJobItem> = {}): OcrJobItem => ({ fichierId: ID + '1' + n, numeroPage: n, state: null, attempts: 0, errorCode: null, hasText: false, updatedAt: null, ...extra });
const jobs = (items: OcrJobItem[], enabled = true): OcrJobs => ({ enabled, language: 'fra', items });

beforeEach(() => {
    fixture.allowed = new Set(['DIGITIZATION_READ', 'DIGITIZATION_OCR']);
    fixture.digitization.command.mockReset().mockResolvedValue({ files: 3, queued: 2 });
    fixture.digitization.ocrJobs.mockReset();
});
afterEach(() => { vi.useRealTimers(); });

it('résume l’état de l’OCR, explique les échecs et propose de relancer', async () => {
    fixture.digitization.ocrJobs.mockResolvedValue(jobs([job(1, { hasText: true, state: 'DONE' }), job(2, { state: 'FAILED', errorCode: 'IMAGE_PIXEL_LIMIT' }), job(3, { state: 'DONE' })]));
    render(<OcrJobsPanel element={element()} />);
    expect(await screen.findByText('1 / 3 texte reconnu')).toBeTruthy();
    expect(screen.getByText('1 en échec')).toBeTruthy();
    expect(screen.getByText('1 sans texte')).toBeTruthy();
    expect(screen.getByText(/Page 2 : image trop grande pour le moteur/)).toBeTruthy();
    expect(screen.getByText(/Aucun texte reconnu : page 3/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Relancer l’OCR' }));
    await waitFor(() => expect(fixture.digitization.command).toHaveBeenCalledTimes(1));
    expect(fixture.digitization.command.mock.calls[0]![0]).toBe(`/elements/${ID}01/ocr/run`);
    await waitFor(() => expect(fixture.digitization.ocrJobs).toHaveBeenCalledTimes(2));
});

it('sans habilitation « OCR et indexation », ou quand tout est déjà traité, aucun bouton n’est proposé', async () => {
    fixture.allowed = new Set(['DIGITIZATION_READ']);
    fixture.digitization.ocrJobs.mockResolvedValue(jobs([job(1, { state: 'FAILED', errorCode: 'EXTRACTION_TIMEOUT' })]));
    const view = render(<OcrJobsPanel element={element()} />);
    await screen.findByText(/délai dépassé/);
    expect(screen.queryByRole('button', { name: /OCR/ })).toBeNull();
    view.unmount();
    fixture.allowed = new Set(['DIGITIZATION_READ', 'DIGITIZATION_OCR']);
    fixture.digitization.ocrJobs.mockResolvedValue(jobs([job(1, { hasText: true, state: 'DONE' })]));
    render(<OcrJobsPanel element={element()} />);
    await screen.findByText('1 / 1 texte reconnu');
    expect(screen.queryByRole('button', { name: /OCR/ })).toBeNull();
});

it('désactivé sur le serveur et sans historique : rien n’est affiché ; avec historique : l’état sans bouton', async () => {
    fixture.digitization.ocrJobs.mockResolvedValue(jobs([job(1)], false));
    const view = render(<OcrJobsPanel element={element()} />);
    await waitFor(() => expect(fixture.digitization.ocrJobs).toHaveBeenCalled());
    await waitFor(() => expect(view.container.querySelector('.ocr-jobs')).toBeNull());
    view.unmount();
    fixture.digitization.ocrJobs.mockResolvedValue(jobs([job(1, { hasText: true })], false));
    render(<OcrJobsPanel element={element()} />);
    expect(await screen.findByText(/désactivé sur ce serveur/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /OCR/ })).toBeNull();
});

it('une tâche active rafraîchit l’état toutes les huit secondes, puis s’arrête quand tout est terminé', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fixture.digitization.ocrJobs.mockResolvedValueOnce(jobs([job(1, { state: 'RUNNING' }), job(2, { state: 'QUEUED' })]));
    render(<OcrJobsPanel element={element()} />);
    expect(await screen.findByText('1 en cours')).toBeTruthy();
    expect(screen.getByText('1 en attente')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /OCR/ })).toBeNull();   // rien à lancer tant que tout est pris en charge
    fixture.digitization.ocrJobs.mockResolvedValue(jobs([job(1, { state: 'DONE', hasText: true }), job(2, { state: 'DONE', hasText: true })]));
    await act(async () => { await vi.advanceTimersByTimeAsync(8100); });
    expect(await screen.findByText('2 / 2 textes reconnus')).toBeTruthy();
    const calls = fixture.digitization.ocrJobs.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(20000); });
    expect(fixture.digitization.ocrJobs.mock.calls.length).toBe(calls);   // plus de rafraîchissement : plus rien d'actif
});
