import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

// Le profil : « Mon profil » montre les droits que le serveur a donnés (filtrables, avec leur origine), la synthèse d'une autre personne ne montre ni ses droits ni la fermeture de session.
const fixture = vi.hoisted(() => ({
    api: { summary: vi.fn() }, logout: vi.fn(), refresh: vi.fn(), epoch: 1,
    me: null as unknown
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/pages/Detail', () => ({ Associated: () => <div data-testid="associated" /> }));
import { ProfilePage } from '../../src/pages/Profile';

const ME = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
const summary = (over: Record<string, unknown> = {}) => ({
    user: { id: ME, prenom: 'Mariama', nom: 'Diallo', email: 'mariama@exemple.test', status: 'ACTIF', scope: 'NATIONAL' },
    effectiveAccountActive: true, effectiveDirectGrants: 7, effectiveDelegatedGrants: 2, scheduledAssignments: 0, distinctPermissions: 9, delegationsWithChangedRole: 1, observedAt: '2026-10-16T08:00:00Z', ...over
});
const grants = [
    { permission: 'DOCUMENT_READ', roleCode: 'ARCHIVISTE', scope: 'INSTITUTION', delegationId: null, expiresAt: null },
    { permission: 'AUDIT_READ', roleCode: 'AUDITEUR', scope: 'NATIONAL', delegationId: 'd-1', expiresAt: '2027-01-01T00:00:00Z' }
];

beforeEach(() => {
    fixture.epoch += 1; fixture.me = { user: { id: ME }, grants, truncated: false };
    fixture.api.summary.mockReset().mockResolvedValue(summary());
    fixture.logout.mockReset().mockResolvedValue(undefined); fixture.refresh.mockReset().mockResolvedValue(undefined);
});

it('mon profil montre ma synthèse et les compteurs du serveur', async () => {
    render(<ProfilePage />);
    expect(await screen.findByText('Mariama Diallo')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Mon profil et mes habilitations' })).toBeTruthy();
    expect(screen.getByText('mariama@exemple.test')).toBeTruthy();
    expect(screen.getByText('Droits directs effectifs').nextSibling!.textContent).toBe('7');
    expect(screen.getByText('Droits délégués effectifs').nextSibling!.textContent).toBe('2');
    expect(screen.getByText('Délégations à réinstruire').nextSibling!.textContent).toBe('1');
    expect(fixture.api.summary).toHaveBeenCalledWith(ME, expect.anything());
});

it('mes droits se listent avec leur origine et leur échéance, et se filtrent par permission ou par rôle', async () => {
    render(<ProfilePage />);
    await screen.findByText('Mariama Diallo');
    const table = screen.getByRole('table');
    expect(within(table).getByText('DOCUMENT_READ')).toBeTruthy();
    expect(within(table).getByText('Attribution directe')).toBeTruthy();
    expect(within(table).getByText('Délégation')).toBeTruthy();
    expect(within(table).getByText('Sans échéance')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Filtrer mes permissions'), { target: { value: 'auditeur' } });
    expect(within(table).queryByText('DOCUMENT_READ')).toBeNull();
    expect(within(table).getByText('AUDIT_READ')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Filtrer mes permissions'), { target: { value: 'document' } });
    expect(within(table).getByText('DOCUMENT_READ')).toBeTruthy();
    expect(within(table).queryByText('AUDIT_READ')).toBeNull();
});

it('une liste de droits tronquée par le serveur le dit', async () => {
    fixture.me = { user: { id: ME }, grants, truncated: true };
    render(<ProfilePage />);
    expect(await screen.findByText('Liste tronquée par le serveur à 500 droits.')).toBeTruthy();
});

it('revérifier les droits relit le profil auprès du serveur, et la fermeture de session passe par le contexte', async () => {
    render(<ProfilePage />);
    await screen.findByText('Mariama Diallo');
    fireEvent.click(screen.getByRole('button', { name: /Revérifier les droits/ }));
    expect(fixture.refresh).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Fermer ma session locale' }));
    expect(fixture.logout).toHaveBeenCalledTimes(1);
});

it('mes attributions et délégations s’ouvrent et se referment', async () => {
    render(<ProfilePage />);
    await screen.findByText('Mariama Diallo');
    expect(screen.queryByTestId('associated')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Mes attributions et délégations' }));
    expect(screen.getByTestId('associated')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mes attributions et délégations' }));
    expect(screen.queryByTestId('associated')).toBeNull();
});

it('la synthèse d’une autre personne ne montre ni mes droits, ni la fermeture de session, ni la revérification', async () => {
    fixture.api.summary.mockResolvedValue(summary({ user: { id: OTHER, prenom: 'Ousmane', nom: null, email: null, status: 'SUSPENDU', scope: 'INSTITUTION' } }));
    render(<ProfilePage userId={OTHER} />);
    expect(await screen.findByText(/Ousmane Compte sans nom/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Synthèse des accès' })).toBeTruthy();
    expect(screen.getByText('Adresse non renseignée')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Fermer ma session locale' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Revérifier les droits/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mes attributions et délégations' })).toBeNull();
    expect(fixture.api.summary).toHaveBeenCalledWith(OTHER, expect.anything());
});

it('une erreur du serveur est dite avec une relecture possible, sans afficher de compteurs', async () => {
    fixture.api.summary.mockRejectedValueOnce(new Error('Indisponible'));
    render(<ProfilePage />);
    expect(await screen.findByText('Indisponible')).toBeTruthy();
    expect(screen.queryByText('Droits directs effectifs')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Réessayer la lecture/ }));
    expect(await screen.findByText('Droits directs effectifs')).toBeTruthy();
});

it('le texte rappelle qu’aucun jeton ni mot de passe n’est gardé dans le navigateur', async () => {
    render(<ProfilePage />);
    await screen.findByText('Mariama Diallo');
    expect(screen.getByText(/Aucun token ni mot de passe n’est enregistré dans localStorage/)).toBeTruthy();
});
