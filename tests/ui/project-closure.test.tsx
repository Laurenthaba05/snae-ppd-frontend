import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ epoch: 1, me: null, allowed: true, digitization: { projectClosure: vi.fn(), reopenProject: vi.fn() } }));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: () => fixture.allowed }));
import { ProjectClosureDialog } from '../../src/ui/ProjectClosureDialog';
const onChanged = vi.fn(), onClose = vi.fn();
const initial = { project: { id: 'p1', nom: 'Recette OCR', statut: 'TERMINE', versionLock: 1, dateFinReelle: '2026-10-22' }, pendingElements: 2, lastCorrection: null };
const reason = 'Correction de la clôture prématurée avec deux éléments en attente.';
beforeEach(() => { fixture.allowed = true; onChanged.mockReset(); onClose.mockReset(); fixture.digitization.projectClosure.mockReset().mockResolvedValue(initial); fixture.digitization.reopenProject.mockReset().mockResolvedValue({}); });
const show = () => render(<ProjectClosureDialog projectId="p1" onClose={onClose} onChanged={onChanged} />);
it('requiert un motif et la version attendue, puis affiche la correction et la clôture précédente', async () => {
    show();
    const submit = await screen.findByRole('button', { name: 'Remettre le projet en cours' });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Motif de correction/), { target: { value: 'court' } });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fixture.digitization.projectClosure.mockResolvedValue({ ...initial, project: { ...initial.project, statut: 'EN_COURS', versionLock: 2, dateFinReelle: null }, lastCorrection: { auditId: 'a1', correctedAt: '2026-11-11T12:00:00Z', previousEndDate: '2026-10-22', reason } });
    fireEvent.change(screen.getByLabelText(/Motif de correction/), { target: { value: '  ' + reason + '  ' } }); fireEvent.click(submit);
    await screen.findByText('Le projet est remis en cours. Les éléments et l’historique sont conservés.');
    expect(fixture.digitization.reopenProject).toHaveBeenCalledExactlyOnceWith('p1', 1, reason);
    await screen.findByRole('region', { name: 'Dernière correction de clôture' });
    expect(screen.getByText(reason)).toBeTruthy(); expect(screen.getByText(/clôture précédente/).textContent).toContain('22 oct. 2026');
    expect(onChanged).toHaveBeenCalledOnce(); expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Remettre le projet en cours' })).toBeNull();
});
it('permet une consultation sans exposer la réouverture à un lecteur sans droit de gestion', async () => {
    fixture.allowed = false; show(); await screen.findByText('Éléments encore en attente :');
    expect(screen.queryByRole('textbox')).toBeNull(); expect(fixture.digitization.reopenProject).not.toHaveBeenCalled();
});
it.each(['TERMINE', 'ANNULE'])('ne propose pas la correction si le projet %s est terminé sans attente ou annulé', async statut => {
    fixture.digitization.projectClosure.mockResolvedValue({ ...initial, project: { ...initial.project, statut }, pendingElements: statut === 'TERMINE' ? 0 : 2 });
    show(); await screen.findByText(statut === 'TERMINE' ? /Cette clôture ne nécessite pas de correction/ : /Un projet annulé ne peut pas être rouvert/);
    expect(screen.queryByRole('textbox')).toBeNull();
});
it('garde le motif et le dialogue lors d’un conflit de version sans annoncer de correction', async () => {
    fixture.digitization.reopenProject.mockRejectedValue(new Error('Le projet a changé. Rechargez son état.'));
    show(); fireEvent.change(await screen.findByLabelText(/Motif de correction/), { target: { value: reason } });
    fireEvent.click(screen.getByRole('button', { name: 'Remettre le projet en cours' }));
    await screen.findByText('Le projet a changé. Rechargez son état.');
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(reason);
    expect(onChanged).not.toHaveBeenCalled(); expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => expect((screen.getByRole('button', { name: 'Remettre le projet en cours' }) as HTMLButtonElement).disabled).toBe(false));
});
