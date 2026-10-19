import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

// Changer le statut d'une ressource ou révoquer les anciens tokens : deux temps (saisie, puis vérification avant confirmation), la version attendue part avec la commande,
// le statut actuel n'est jamais proposé comme cible, et un refus du serveur ne ferme pas la fenêtre.
const fixture = vi.hoisted(() => ({ api: { command: vi.fn() }, refresh: vi.fn(), epoch: 1 }));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/ui/ReferencePicker', () => ({ ReferencePicker: () => null }));
import { StatusDialog } from '../../src/pages/Actions';

const entity = (over: Record<string, unknown> = {}) => ({ id: 'e1', nom: 'Archives nationales', status: 'ACTIF', version: 7, ...over }) as never;
const onClose = vi.fn(), onSuccess = vi.fn();

beforeEach(() => {
    onClose.mockReset(); onSuccess.mockReset(); fixture.refresh.mockReset().mockResolvedValue(undefined);
    fixture.api.command.mockReset().mockResolvedValue({ ok: true });
});

const options = (dialog: HTMLElement) => within(dialog).getAllByRole('option').map(o => o.textContent);

it('le statut actuel n’est pas proposé : une ressource active se suspend par défaut, une autre se réactive par défaut', () => {
    const first = render(<StatusDialog kind="institutions" entity={entity()} onClose={onClose} onSuccess={onSuccess} />);
    let dialog = screen.getByRole('dialog', { name: 'Modifier le statut' });
    expect(options(dialog)).toEqual(['INACTIF', 'SUSPENDU', 'ARCHIVE']);
    expect((within(dialog).getByLabelText(/^Nouveau statut/) as HTMLSelectElement).value).toBe('SUSPENDU');
    first.unmount();
    render(<StatusDialog kind="institutions" entity={entity({ status: 'SUSPENDU' })} onClose={onClose} onSuccess={onSuccess} />);
    dialog = screen.getByRole('dialog', { name: 'Modifier le statut' });
    expect(options(dialog)).toEqual(['ACTIF', 'INACTIF', 'ARCHIVE']);
    expect((within(dialog).getByLabelText(/^Nouveau statut/) as HTMLSelectElement).value).toBe('ACTIF');
});

it('la décision passe par une vérification : la commande ne part qu’à la confirmation, avec la version attendue, le statut choisi et le motif nettoyé', async () => {
    render(<StatusDialog kind="users" entity={entity()} onClose={onClose} onSuccess={onSuccess} />);
    const dialog = screen.getByRole('dialog', { name: 'Modifier le statut' });
    fireEvent.change(within(dialog).getByLabelText(/^Nouveau statut/), { target: { value: 'SUSPENDU' } });
    fireEvent.change(within(dialog).getByLabelText(/^Motif/), { target: { value: '  Enquête en cours  ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Continuer/ }));
    expect(fixture.api.command).not.toHaveBeenCalled();
    expect(await within(dialog).findByText('Vérifiez les informations et les conséquences de cette action avant de confirmer.')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: /Confirmer la décision/ }));
    await waitFor(() => expect(fixture.api.command).toHaveBeenCalledWith('/users/e1/status', { expectedVersion: 7, status: 'SUSPENDU', reason: 'Enquête en cours' }, expect.any(String), 'POST'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(fixture.refresh).toHaveBeenCalledTimes(1);
});

it('revenir au formulaire depuis la vérification ne lance rien et garde la saisie', async () => {
    render(<StatusDialog kind="departments" entity={entity()} onClose={onClose} onSuccess={onSuccess} />);
    const dialog = screen.getByRole('dialog', { name: 'Modifier le statut' });
    fireEvent.change(within(dialog).getByLabelText(/^Motif/), { target: { value: 'Réorganisation' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Continuer/ }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Revenir au formulaire' }));
    expect((within(dialog).getByLabelText(/^Motif/) as HTMLTextAreaElement).value).toBe('Réorganisation');
    expect(fixture.api.command).not.toHaveBeenCalled();
});

it('révoquer les anciens tokens vise sa propre route, sans statut dans la commande, et n’affiche aucun choix de statut', async () => {
    render(<StatusDialog kind="users" entity={entity()} tokens onClose={onClose} onSuccess={onSuccess} />);
    const dialog = screen.getByRole('dialog', { name: 'Révoquer les anciens tokens' });
    expect(within(dialog).queryByLabelText(/^Nouveau statut/)).toBeNull();
    fireEvent.change(within(dialog).getByLabelText(/^Motif/), { target: { value: 'Poste perdu' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Continuer/ }));
    fireEvent.click(await within(dialog).findByRole('button', { name: /Confirmer la décision/ }));
    await waitFor(() => expect(fixture.api.command).toHaveBeenCalledWith('/users/e1/revoke-tokens', { expectedVersion: 7, reason: 'Poste perdu' }, expect.any(String), 'POST'));
});

it('un refus du serveur est dit dans la fenêtre, qui reste ouverte sans signaler de succès', async () => {
    fixture.api.command.mockRejectedValue(new Error('Cette ressource est archivée'));
    render(<StatusDialog kind="institutions" entity={entity()} onClose={onClose} onSuccess={onSuccess} />);
    const dialog = screen.getByRole('dialog', { name: 'Modifier le statut' });
    fireEvent.change(within(dialog).getByLabelText(/^Motif/), { target: { value: 'Fusion' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Continuer/ }));
    fireEvent.click(await within(dialog).findByRole('button', { name: /Confirmer la décision/ }));
    expect(await within(dialog).findByText('Cette ressource est archivée')).toBeTruthy();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(fixture.refresh).not.toHaveBeenCalled();
});
