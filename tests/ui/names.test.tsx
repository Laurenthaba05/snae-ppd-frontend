import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const INSTITUTION = '201f8298-f32b-4188-b804-c3d9b97c908f';
const DEPARTMENT = '7a1c0e52-0d0c-4a55-9c2a-0f5d4c1f2b11';
const USER = '5b0f6d3e-3a47-4f6b-8b0a-4a4c2c1d9e77';
const ROLE = '9c4a1d70-6b2e-4d3b-9a51-2e8f7c3b4a10';
const DOC = '3d2f8a61-1b9c-4e7d-8a5f-6c0b2d4e9f12';
const fixture = vi.hoisted(() => ({
    epoch: 1, api: { get: vi.fn(), list: vi.fn() } as unknown, records: { document: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
import { DocumentName, EntityName, ScopeName } from '../../src/ui/names';
import { ReferencePicker } from '../../src/ui/ReferencePicker';

const api = fixture.api as { get: ReturnType<typeof vi.fn>; list: ReturnType<typeof vi.fn> };
const directory: Record<string, unknown> = {
    [INSTITUTION]: { id: INSTITUTION, nom: 'Archives nationales de Guinée', code: 'ANG', sigle: 'ANG' },
    [DEPARTMENT]: { id: DEPARTMENT, nom: 'Service des fonds anciens', code: 'SFA' },
    [USER]: { id: USER, prenom: 'Mamadou', nom: 'Bah', email: 'mamadou@exemple.gn' },
    [ROLE]: { id: ROLE, nom: 'Responsable des archives', code: 'RESP_ARCH' }
};

beforeEach(() => {
    fixture.epoch += 1; // le cache des noms est propre à chaque session : une nouvelle époque repart de zéro
    api.get.mockReset(); api.list.mockReset(); fixture.records.document.mockReset();
    api.get.mockImplementation(async (_kind: string, id: string) => { if (!(id in directory)) throw new Error('Introuvable'); return directory[id]; });
    api.list.mockResolvedValue({ items: [], page: 0, size: 20, hasMore: false });
});

it('une institution, un département, une personne et un rôle se lisent par leur nom, jamais par leur identifiant', async () => {
    const view = render(<ul>
        <li data-testid="institution"><EntityName kind="institutions" id={INSTITUTION} /></li>
        <li data-testid="department"><EntityName kind="departments" id={DEPARTMENT} /></li>
        <li data-testid="user"><EntityName kind="users" id={USER} /></li>
        <li data-testid="role"><EntityName kind="roles" id={ROLE} /></li>
    </ul>);
    await waitFor(() => expect(screen.getByTestId('institution').textContent).toBe('Archives nationales de Guinée'));
    expect(screen.getByTestId('department').textContent).toBe('Service des fonds anciens');
    expect(screen.getByTestId('user').textContent).toBe('Mamadou Bah');
    expect(screen.getByTestId('role').textContent).toBe('Responsable des archives');
    for (const id of [INSTITUTION, DEPARTMENT, USER, ROLE]) expect(view.container.textContent).not.toContain(id.slice(0, 8));
});

it('pendant le chargement et quand le nom est refusé, un texte neutre remplace l’identifiant', async () => {
    const view = render(<p data-testid="unknown"><EntityName kind="institutions" id="11111111-1111-4111-8111-111111111111" /></p>);
    expect(screen.getByTestId('unknown').textContent).toBe('…');
    await waitFor(() => expect(screen.getByTestId('unknown').textContent).toBe('Institution non disponible'));
    expect(view.container.textContent).not.toContain('11111111');
    view.unmount();
    render(<p data-testid="custom"><EntityName kind="users" id="22222222-2222-4222-8222-222222222222" fallback="Auteur inconnu" /></p>);
    await waitFor(() => expect(screen.getByTestId('custom').textContent).toBe('Auteur inconnu'));
});

it('sans identifiant, le texte de remplacement s’affiche et rien n’est demandé', () => {
    render(<p data-testid="none"><EntityName kind="institutions" id={null} fallback="National" /></p>);
    expect(screen.getByTestId('none').textContent).toBe('National');
    expect(api.get).not.toHaveBeenCalled();
});

it('un même nom n’est demandé qu’une fois, et un échec n’est pas mémorisé', async () => {
    render(<div>{[1, 2, 3].map(n => <span key={n}><EntityName kind="institutions" id={INSTITUTION} /></span>)}</div>);
    await waitFor(() => expect(screen.getAllByText('Archives nationales de Guinée').length).toBe(3));
    expect(api.get).toHaveBeenCalledTimes(1);
    const missing = '33333333-3333-4333-8333-333333333333';
    const first = render(<EntityName kind="roles" id={missing} />);
    await waitFor(() => expect(first.container.textContent).toBe('Rôle non disponible'));
    first.unmount();
    render(<EntityName kind="roles" id={missing} />);
    await waitFor(() => expect(api.get.mock.calls.filter(call => call[1] === missing).length).toBe(2));
});

it('le périmètre de travail se lit : National, l’institution, puis l’institution et le département', async () => {
    const national = render(<p data-testid="scope"><ScopeName scope={{ institutionId: null, departmentId: null }} /></p>);
    expect(screen.getByTestId('scope').textContent).toBe('National');
    national.unmount();
    const institution = render(<p data-testid="scope"><ScopeName scope={{ institutionId: INSTITUTION, departmentId: null }} /></p>);
    await waitFor(() => expect(screen.getByTestId('scope').textContent).toBe('Archives nationales de Guinée'));
    institution.unmount();
    const department = render(<p data-testid="scope"><ScopeName scope={{ institutionId: INSTITUTION, departmentId: DEPARTMENT }} /></p>);
    await waitFor(() => expect(screen.getByTestId('scope').textContent).toBe('Archives nationales de Guinée / Service des fonds anciens'));
    expect(department.container.textContent).not.toMatch(/[0-9a-f]{8}-/);
});

it('si le nom de l’institution n’est pas accessible, le périmètre reste lisible sans identifiant', async () => {
    api.get.mockRejectedValue(new Error('Accès refusé'));
    const view = render(<p data-testid="scope"><ScopeName scope={{ institutionId: INSTITUTION, departmentId: DEPARTMENT }} /></p>);
    await waitFor(() => expect(screen.getByTestId('scope').textContent).toBe('Institution sélectionnée / département sélectionné'));
    expect(view.container.textContent).not.toContain('201f8298');
});

it('un document se lit par sa référence et son titre', async () => {
    fixture.records.document.mockResolvedValue({ id: DOC, reference: 'DOC-000042', title: 'Registre des naissances de Kankan' });
    const view = render(<p data-testid="doc"><DocumentName id={DOC} /></p>);
    await waitFor(() => expect(screen.getByTestId('doc').textContent).toBe('DOC-000042 · Registre des naissances de Kankan'));
    expect(view.container.textContent).not.toContain('3d2f8a61');
});

it('un sélecteur qui reçoit une valeur déjà choisie affiche le nom, pas l’identifiant', async () => {
    const view = render(<ReferencePicker kind="institutions" label="Sélectionner une institution" value={INSTITUTION} onChange={() => { }} />);
    const button = screen.getByRole('button', { name: 'Sélectionner une institution' });
    await waitFor(() => expect(button.textContent).toContain('Archives nationales de Guinée'));
    expect(view.container.textContent).not.toContain(INSTITUTION);
    expect(view.container.textContent).not.toContain('201f8298');
});

it('un sélecteur dont le nom ne se charge pas ne montre jamais l’identifiant', async () => {
    api.get.mockRejectedValue(new Error('Accès refusé'));
    const view = render(<ReferencePicker kind="departments" label="Sélectionner un département" value={DEPARTMENT} scope={{ institutionId: INSTITUTION }} onChange={() => { }} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sélectionner un département' }).textContent).toContain('Élément sélectionné'));
    expect(view.container.textContent).not.toContain('7a1c0e52');
});
