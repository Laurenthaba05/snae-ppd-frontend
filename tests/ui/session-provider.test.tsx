import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

// Le fournisseur de session : tous les clients d'API sont créés une fois la connexion initialisée (jamais avant), partagent le même transport, et la démonstration n'en crée qu'un.
const settings = vi.hoisted(() => ({ demo: false, authMode: 'oidc', apiBase: '/api/v1' }));
const driver = vi.hoisted(() => ({ initialize: vi.fn(), accessToken: vi.fn(), signIn: vi.fn(), signOut: vi.fn(), subscribe: vi.fn() }));
vi.mock('../../src/auth/config', () => ({ configIssue: () => null, config: settings }));
vi.mock('../../src/auth/driver', () => ({ createAuthDriver: async () => driver }));
vi.mock('../../src/ui/navigation', () => ({ navigate: vi.fn() }));
import { SessionProvider, useSession } from '../../src/auth/session';

const CLIENTS = ['api', 'records', 'retention', 'search', 'publication', 'audit', 'classification', 'physicalArchives', 'heritage', 'digitization', 'rights', 'metadata', 'archivalIntake',
    'workflow', 'consultation', 'portalAdmin', 'readingRoom', 'preservationPlanning', 'dissemination', 'vocabulary', 'notifications'] as const;

let captured: ReturnType<typeof useSession> | null = null;
function Probe() {
    const session = useSession();
    captured = session;
    const present = CLIENTS.filter(name => session[name] !== null);
    return <p data-testid="clients">{present.length === 0 ? 'aucun' : present.join(',')}</p>;
}

beforeEach(() => {
    captured = null; settings.demo = false;
    driver.initialize.mockReset().mockResolvedValue(false); driver.accessToken.mockReset().mockResolvedValue(null); driver.signIn.mockReset().mockResolvedValue(undefined);
    driver.signOut.mockReset().mockResolvedValue(undefined); driver.subscribe.mockReset().mockReturnValue(() => {});
});

it('crée les vingt et un clients d’API une fois la connexion initialisée, sans identité tant qu’il n’y a pas de session', async () => {
    render(<SessionProvider><Probe /></SessionProvider>);
    await waitFor(() => expect(screen.getByTestId('clients').textContent).toBe(CLIENTS.join(',')));
    expect(driver.initialize).toHaveBeenCalledTimes(1);
    expect(captured!.me).toBeNull();
    expect(captured!.demo).toBe(false);
    expect(captured!.busy).toBe(false);
});

it('chaque client reste le même objet d’un rendu à l’autre (aucun client recréé)', async () => {
    const { rerender } = render(<SessionProvider><Probe /></SessionProvider>);
    await waitFor(() => expect(screen.getByTestId('clients').textContent).toBe(CLIENTS.join(',')));
    const first = CLIENTS.map(name => captured![name]);
    rerender(<SessionProvider><Probe /></SessionProvider>);
    expect(CLIENTS.map(name => captured![name])).toEqual(first);
    expect(CLIENTS.map(name => captured![name]).every((client, i) => client === first[i])).toBe(true);
    expect(new Set(first).size).toBe(CLIENTS.length);
});

it('en démonstration, seul le client des identités existe, après le choix d’un profil', async () => {
    settings.demo = true;
    render(<SessionProvider><Probe /></SessionProvider>);
    expect(screen.getByTestId('clients').textContent).toBe('aucun');
    expect(driver.initialize).not.toHaveBeenCalled();
    await act(async () => { await captured!.signIn(); });
    await waitFor(() => expect(screen.getByTestId('clients').textContent).toBe('api'));
    expect(captured!.demo).toBe(true);
});

it('hors du fournisseur, useSession le dit', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow('SessionProvider requis');
    spy.mockRestore();
});
