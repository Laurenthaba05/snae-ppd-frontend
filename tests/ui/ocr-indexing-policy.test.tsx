import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { OcrIndexingPolicy } from '../../src/core/types';

// La politique d'indexation du texte reconnu sur l'écran « OCR et indexation ».
const fixture = vi.hoisted(() => ({ epoch: 1, me: null as unknown, scope: {} as { institutionId?: string }, allowed: new Set<string>(),
    search: { ocrIndexingPolicy: vi.fn(), command: vi.fn() } as Record<string, ReturnType<typeof vi.fn>> | null, refresh: vi.fn() }));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: fixture.scope }) }));
import { OcrIndexingPolicyPanel } from '../../src/ui/OcrIndexingPolicyPanel';

const INSTITUTION = '20000000-0000-4000-8000-000000000001';
const policy = (extra: Partial<OcrIndexingPolicy> = {}): OcrIndexingPolicy => ({ institutionId: INSTITUTION, effective: 'VALIDATION_SEULE', source: 'DEFAUT', explicit: null, version: null, updatedAt: null,
    nationalMode: null, serverDefault: 'VALIDATION_SEULE', reprojection: null, ...extra });

beforeEach(() => {
    fixture.epoch += 1; fixture.scope = { institutionId: INSTITUTION }; fixture.allowed = new Set(['SEARCH_OCR_POLICY_MANAGE', 'DIGITIZATION_READ']);
    fixture.search = { ocrIndexingPolicy: vi.fn().mockResolvedValue(policy()), command: vi.fn().mockResolvedValue({}) };
});

it('dit ce que décide la portée de travail, d’où cela vient, et ce que cela change pour un scan', async () => {
    render(<OcrIndexingPolicyPanel />);
    expect(await screen.findByText('Texte validé seulement')).toBeTruthy();
    expect(screen.getByText('(réglage par défaut du serveur)')).toBeTruthy();
    expect(screen.getByText(/cherchable qu’après la validation de chaque page/)).toBeTruthy();
    expect(fixture.search!.ocrIndexingPolicy).toHaveBeenCalledWith(INSTITUTION, expect.anything());
});

it('au niveau national (aucune institution choisie), lit la politique nationale', async () => {
    fixture.scope = {};
    fixture.search!.ocrIndexingPolicy.mockResolvedValue(policy({ institutionId: null, effective: 'FIABLE_SIGNALE', source: 'NATIONAL', explicit: 'FIABLE_SIGNALE', version: 2 }));
    render(<OcrIndexingPolicyPanel />);
    expect(await screen.findByText(/signalé « non vérifié »/, { selector: 'strong' })).toBeTruthy();
    expect(fixture.search!.ocrIndexingPolicy).toHaveBeenCalledWith(null, expect.anything());
});

it('modifier la politique demande un motif, envoie la version lue et recharge', async () => {
    fixture.search!.ocrIndexingPolicy.mockResolvedValue(policy({ effective: 'VALIDATION_SEULE', source: 'INSTITUTION', explicit: 'VALIDATION_SEULE', version: 4 }));
    render(<OcrIndexingPolicyPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier la politique' }));
    fireEvent.change(await screen.findByLabelText(/Politique \*/), { target: { value: 'FIABLE_SIGNALE' } });
    expect(screen.getByText(/étalonnés que sur des pages de test/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Motif/), { target: { value: 'Recette de l’indexation automatique' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    expect(fixture.search!.command).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmer' }));
    await waitFor(() => expect(fixture.search!.command).toHaveBeenCalledWith('/ocr-indexing-policy',
        { institutionId: INSTITUTION, mode: 'FIABLE_SIGNALE', motif: 'Recette de l’indexation automatique', expectedVersion: 4 }, expect.any(String), 'PUT'));
});

it('une institution peut revenir à la politique du niveau national', async () => {
    render(<OcrIndexingPolicyPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier la politique' }));
    expect(await screen.findByRole('option', { name: 'Hériter du niveau national' })).toBeTruthy();
});

it('le niveau national ne propose pas d’hériter', async () => {
    fixture.scope = {};
    fixture.search!.ocrIndexingPolicy.mockResolvedValue(policy({ institutionId: null }));
    render(<OcrIndexingPolicyPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier la politique' }));
    await screen.findByLabelText(/Politique \*/);
    expect(screen.queryByRole('option', { name: 'Hériter du niveau national' })).toBeNull();
});

it('sans droit de décision, la politique se lit mais ne se modifie pas', async () => {
    fixture.allowed = new Set(['DIGITIZATION_READ']);
    render(<OcrIndexingPolicyPanel />);
    await screen.findByText('Texte validé seulement');
    expect(screen.queryByRole('button', { name: 'Modifier la politique' })).toBeNull();
});

it('sans aucun droit, ou sans module de recherche, rien n’est montré et rien n’est demandé', () => {
    fixture.allowed = new Set();
    const first = render(<OcrIndexingPolicyPanel />);
    expect(first.container.textContent).toBe('');
    first.unmount();
    expect(fixture.search!.ocrIndexingPolicy).not.toHaveBeenCalled();
    fixture.allowed = new Set(['SEARCH_OCR_POLICY_MANAGE']);
    fixture.search = null;
    expect(render(<OcrIndexingPolicyPanel />).container.textContent).toBe('');
});

it('dit où en est la réindexation lancée par le dernier changement, et quand elle s’est interrompue', async () => {
    fixture.search!.ocrIndexingPolicy.mockResolvedValue(policy({ reprojection: { state: 'DONE', total: 12, done: 11, failures: 1, startedAt: '2026-11-04T10:00:00Z', finishedAt: '2026-11-04T10:01:00Z' } }));
    const first = render(<OcrIndexingPolicyPanel />);
    const done = await screen.findByText(/Réindexation terminée : 11/);
    expect(done.textContent).toContain('en échec : 1');
    first.unmount();
    fixture.search!.ocrIndexingPolicy.mockResolvedValue(policy({ reprojection: { state: 'FAILED', total: 40, done: 12, failures: 0, startedAt: '2026-11-04T10:00:00Z', finishedAt: '2026-11-04T10:01:00Z' } }));
    render(<OcrIndexingPolicyPanel />);
    expect(await screen.findByText(/Réindexation interrompue après 12 sur 40/)).toBeTruthy();
});
