import React, { act } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

// Le catalogue des permissions est rangé par domaine ; chaque permission montre les rôles qui la détiennent et mène à leur fiche.
const fixture = vi.hoisted(() => ({ epoch: 1, me: null, api: { allPermissionAttributions: vi.fn() } }));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/ui/navigation', () => ({ navigate: vi.fn() }));
import { navigate } from '../../src/ui/navigation';
import { PermissionsPage } from '../../src/pages/Permissions';

const role = (code: string, name: string, status = 'ACTIF') => ({ id: 'id-' + code, code, name, scope: 'NATIONAL', status });
const perm = (code: string, domain: string, roles: ReturnType<typeof role>[] = [], description: string | null = null) => ({ id: 'p-' + code, code, description, domain, roles });
const catalog = [
    perm('DOCUMENT_READ', 'RECORDS', [role('LECTEUR', 'Lecteur'), role('ARCHIVISTE', 'Archiviste', 'INACTIF')], 'Lire un document'),
    perm('DOCUMENT_CREATE', 'RECORDS', [role('ARCHIVISTE', 'Archiviste')]),
    perm('HERITAGE_READ', 'HERITAGE'),
    perm('AUDIT_READ', 'AUDIT', [role('CONTROLEUR', 'Contrôleur')])
];

beforeEach(() => {
    fixture.epoch += 1;
    fixture.api.allPermissionAttributions.mockReset().mockResolvedValue(catalog);
    vi.mocked(navigate).mockReset();
});

it('les permissions sont rangées en groupes repliés par domaine, avec leurs chiffres', async () => {
    render(<PermissionsPage />);
    const records = await screen.findByRole('button', { name: /Documents et dossiers/ });
    expect(records.getAttribute('aria-expanded')).toBe('false');
    expect(within(records).getByText('2 permissions')).toBeTruthy();
    const heritage = screen.getByRole('button', { name: /Patrimoine/ });
    expect(within(heritage).getByText('1 sans rôle')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('4 permissions');
    expect(screen.getByRole('status').textContent).toContain('3 domaines');
    expect(screen.getByRole('status').textContent).toContain('1 sans aucun rôle');
});

it('un groupe se déplie, montre l’attribution de chaque permission, et un rôle ouvre sa fiche', async () => {
    render(<PermissionsPage />);
    const head = await screen.findByRole('button', { name: /Documents et dossiers/ });
    fireEvent.click(head);
    expect(head.getAttribute('aria-expanded')).toBe('true');
    const row = screen.getByText('DOCUMENT_READ').closest('tr')!;
    expect(within(row).getByText('Lire un document')).toBeTruthy();
    expect(within(row).getByRole('button', { name: /Lecteur/ })).toBeTruthy();
    expect(within(row).getByText('(inactif)')).toBeTruthy();
    fireEvent.click(within(row).getByRole('button', { name: /Lecteur/ }));
    expect(navigate).toHaveBeenCalledWith('/app/roles/id-LECTEUR');
    expect(screen.queryByText('id-LECTEUR')).toBeNull();
});

it('une permission sans rôle le dit', async () => {
    render(<PermissionsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Patrimoine/ }));
    const row = screen.getByText('HERITAGE_READ').closest('tr')!;
    expect(within(row).getByText('Aucun rôle')).toBeTruthy();
});

it('tout déplier, tout replier, et le filtre « sans aucun rôle » ne garde que ce qui n’est détenu par personne', async () => {
    render(<PermissionsPage />);
    await screen.findByRole('button', { name: /Journal d’audit/ });
    fireEvent.click(screen.getByRole('button', { name: 'Tout déplier' }));
    for (const name of [/Journal d’audit/, /Patrimoine/, /Documents et dossiers/]) expect(screen.getByRole('button', { name }).getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Tout replier' }));
    expect(screen.getByRole('button', { name: /Journal d’audit/ }).getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(screen.getByLabelText('Sans aucun rôle'));
    await waitFor(() => expect(screen.queryByRole('button', { name: /Journal d’audit/ })).toBeNull());
    expect(screen.getByRole('button', { name: /Patrimoine/ }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('HERITAGE_READ')).toBeTruthy();
});

it('la recherche part au serveur et déplie ce qu’elle trouve', async () => {
    render(<PermissionsPage />);
    await screen.findByRole('button', { name: /Journal d’audit/ });
    fixture.api.allPermissionAttributions.mockResolvedValue([catalog[3]!]);
    fireEvent.change(screen.getByLabelText('Rechercher une permission'), { target: { value: 'audit' } });
    await waitFor(() => expect(fixture.api.allPermissionAttributions).toHaveBeenLastCalledWith(expect.anything(), 'audit'));
    await waitFor(() => expect(screen.getByRole('button', { name: /Journal d’audit/ }).getAttribute('aria-expanded')).toBe('true'));
    expect(screen.queryByRole('button', { name: /Patrimoine/ })).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Recherche : « audit »');
});

it('une erreur du serveur est dite, et un catalogue vide ne montre aucun groupe', async () => {
    fixture.api.allPermissionAttributions.mockRejectedValue(new Error('Serveur indisponible'));
    const first = render(<PermissionsPage />);
    expect(await screen.findByText('Serveur indisponible')).toBeTruthy();
    first.unmount();
    fixture.epoch += 1;
    fixture.api.allPermissionAttributions.mockReset().mockResolvedValue([]);
    render(<PermissionsPage />);
    expect(await screen.findByText('Aucune permission trouvée')).toBeTruthy();
});

it('conserve le groupe ouvert après une actualisation du catalogue', async () => {
    const view = render(<PermissionsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Documents et dossiers/ }));
    let deliver!: (rows: typeof catalog) => void;
    fixture.api.allPermissionAttributions.mockImplementationOnce(() => new Promise<typeof catalog>(resolve => { deliver = resolve; }));
    await act(async () => { fixture.epoch += 1; view.rerender(<PermissionsPage />); });
    await act(async () => { deliver(catalog.map(p => ({ ...p, description: p.code === 'DOCUMENT_READ' ? 'Description actualisée' : p.description }))); });
    expect(screen.getByText('Description actualisée')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Documents et dossiers/ }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: /Journal d’audit/ }).getAttribute('aria-expanded')).toBe('false');
});
