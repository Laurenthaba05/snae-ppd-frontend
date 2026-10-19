import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

// Les référentiels (institutions, départements, identités, rôles) : les départements ne se consultent que dans une institution choisie, la création est réservée à qui en a le droit
// (la plateforme pour les institutions et les rôles), le filtre ne porte que sur la page chargée et le dit, et la pagination suit le serveur.
const fixture = vi.hoisted(() => ({
    api: { list: vi.fn() }, me: { user: { id: 'u1' } } as unknown, epoch: 1,
    scope: { institutionId: null as string | null, departmentId: null as string | null }, setScope: vi.fn(),
    allowed: new Set<string>(), platform: false, navigate: vi.fn()
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: fixture.scope, setScope: fixture.setScope }) }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code), platform: () => fixture.platform }));
vi.mock('../../src/ui/navigation', () => ({ navigate: fixture.navigate }));
vi.mock('../../src/ui/names', () => ({ EntityName: ({ id, fallback }: { id: string | null; fallback?: string }) => <span>{id ? 'Institution ' + id : fallback ?? '—'}</span> }));
vi.mock('../../src/ui/ReferencePicker', () => ({ ReferencePicker: ({ onChange }: { onChange: (v: string) => void }) => <button onClick={() => onChange('inst-9')}>Choisir inst-9</button> }));
vi.mock('../../src/pages/EntityForm', () => ({ EntityForm: ({ kind, onSuccess, onClose }: { kind: string; onSuccess: () => void; onClose: () => void }) => <div role="dialog" aria-label={'Formulaire ' + kind}><button onClick={() => { onSuccess(); onClose(); }}>Enregistrer le formulaire</button></div> }));
vi.mock('../../src/ui/InstitutionImport', () => ({ InstitutionImport: ({ onClose }: { onClose: () => void }) => <div role="dialog" aria-label="Import des institutions"><button onClick={onClose}>Fermer l’import</button></div> }));
vi.mock('../../src/ui/DepartmentImport', () => ({ DepartmentImport: ({ initialInstitutionId }: { initialInstitutionId: string | null }) => <div role="dialog" aria-label="Import des départements">{initialInstitutionId}</div> }));
import { CatalogPage } from '../../src/pages/Catalog';

const page = (items: unknown[], hasMore = false, p = 0) => ({ items, page: p, size: 20, hasMore });
const institution = (n: number, over: Record<string, unknown> = {}) => ({ id: 'i' + n, nom: 'Institution ' + n, sigle: 'I' + n, code: 'INS-' + n, typeInstitution: 'MINISTERE', status: 'ACTIF', version: n, ...over });
const person = (n: number, over: Record<string, unknown> = {}) => ({ id: 'u' + n, prenom: 'Aïssatou', nom: 'Barry ' + n, email: n + '@exemple.test', institutionId: 'i1', status: 'SUSPENDU', version: 2, ...over });

beforeEach(() => {
    fixture.allowed = new Set(); fixture.platform = false; fixture.epoch += 1; fixture.navigate.mockReset(); fixture.setScope.mockReset();
    fixture.scope = { institutionId: null, departmentId: null };
    fixture.api.list.mockReset().mockResolvedValue(page([institution(1), institution(2, { status: 'ARCHIVE', typeInstitution: 'COLLECTIVITE' })]));
});

it('les institutions s’affichent avec leur sigle, leur code, leur type en clair, leur statut et leur version', async () => {
    render(<CatalogPage kind="institutions" />);
    expect(await screen.findByText('Institution 1')).toBeTruthy();
    expect(fixture.api.list).toHaveBeenCalledWith('institutions', { page: 0, size: 20, institutionId: null }, expect.anything());
    expect(screen.getByText('INS-1')).toBeTruthy();
    expect(screen.getByText('Ministère')).toBeTruthy();
    expect(screen.getByText('Collectivité')).toBeTruthy();
    expect(screen.getByText('v2')).toBeTruthy();
    expect(screen.getByText('Archivé')).toBeTruthy();
});

it('ouvrir une ligne (par le nom ou par la flèche) va à la fiche de la ressource', async () => {
    render(<CatalogPage kind="institutions" />);
    fireEvent.click(await screen.findByRole('button', { name: /^Institution 1/ }));
    expect(fixture.navigate).toHaveBeenCalledWith('/app/institutions/i1');
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir Institution 2' }));
    expect(fixture.navigate).toHaveBeenCalledWith('/app/institutions/i2');
});

it('les départements exigent une institution : rien n’est lu tant qu’elle n’est pas choisie, puis le choix fixe le périmètre', async () => {
    render(<CatalogPage kind="departments" />);
    expect(await screen.findByText('Choisissez une institution')).toBeTruthy();
    expect(fixture.api.list).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Filtrer Départements')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Choisir inst-9' }));
    expect(fixture.setScope).toHaveBeenCalledWith({ institutionId: 'inst-9', departmentId: null });
});

it('les départements d’une institution se lisent dans son périmètre, avec leur type d’unité et leur rattachement', async () => {
    fixture.scope = { institutionId: 'i1', departmentId: null };
    fixture.api.list.mockResolvedValue(page([{ id: 'd1', nom: 'Direction des archives', code: 'DA', typeUnite: 'DIRECTION', institutionId: 'i1', status: 'ACTIF', version: 1 }]));
    render(<CatalogPage kind="departments" />);
    expect(await screen.findByText('Direction des archives')).toBeTruthy();
    expect(fixture.api.list).toHaveBeenCalledWith('departments', { page: 0, size: 20, institutionId: 'i1', departmentId: null }, expect.anything());
    expect(screen.getByText('DIRECTION')).toBeTruthy();
    expect(screen.getByText('Institution i1')).toBeTruthy();
    expect(screen.getByText('DA')).toBeTruthy();
});

it('les identités montrent le prénom, le nom, le contact et une institution nommée, jamais un identifiant seul', async () => {
    fixture.api.list.mockResolvedValue(page([person(1), person(2, { prenom: null, nom: null, email: null, institutionId: null })]));
    render(<CatalogPage kind="users" />);
    expect(await screen.findByText('Aïssatou Barry 1')).toBeTruthy();
    expect(screen.getByText('1@exemple.test')).toBeTruthy();
    expect(screen.getAllByText('Identité SSO liée')).toHaveLength(2);
    expect(screen.getByText('Identité sans nom')).toBeTruthy();
    expect(screen.getByText('National')).toBeTruthy();
    expect(screen.getAllByText('Suspendu')).toHaveLength(2);
});

it('le filtre de texte et le filtre de statut ne portent que sur la page chargée, et l’écran le dit quand rien ne correspond', async () => {
    render(<CatalogPage kind="institutions" />);
    await screen.findByText('Institution 1');
    fireEvent.change(screen.getByLabelText('Filtrer Institutions'), { target: { value: 'ins-2' } });
    expect(screen.queryByText('Institution 1')).toBeNull();
    expect(screen.getByText('Institution 2')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Statut sur la page'), { target: { value: 'ACTIF' } });
    expect(screen.queryByText('Institution 2')).toBeNull();
    expect(screen.getByText('Aucun résultat sur cette page')).toBeTruthy();
    expect(screen.getByText(/Les filtres portent uniquement sur les éléments chargés/)).toBeTruthy();
    expect(fixture.api.list).toHaveBeenCalledTimes(1);
});

it('un périmètre sans ressource le dit autrement qu’un filtre sans résultat', async () => {
    fixture.api.list.mockResolvedValue(page([]));
    render(<CatalogPage kind="roles" />);
    expect(await screen.findByText('Aucune ressource dans ce périmètre')).toBeTruthy();
    expect(fixture.api.list).toHaveBeenCalledWith('roles', { page: 0, size: 20 }, expect.anything());
});

it('une erreur du serveur est dite avec une relecture, et Actualiser relit la liste', async () => {
    fixture.api.list.mockRejectedValueOnce(new Error('Annuaire indisponible'));
    render(<CatalogPage kind="institutions" />);
    expect(await screen.findByText('Annuaire indisponible')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer la lecture' }));
    expect(await screen.findByText('Institution 1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Actualiser la liste' }));
    await waitFor(() => expect(fixture.api.list).toHaveBeenCalledTimes(3));
});

it('la pagination suit le serveur : suivante demande la page d’après, précédente est inactive sur la première', async () => {
    fixture.api.list.mockImplementation(async (_k: string, params: { page: number }) => params.page === 0 ? page([institution(1)], true, 0) : page([institution(3)], false, 1));
    render(<CatalogPage kind="institutions" />);
    await screen.findByText('Institution 1');
    expect((screen.getByRole('button', { name: 'Précédente' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Suivante' }));
    expect(await screen.findByText('Institution 3')).toBeTruthy();
    expect(fixture.api.list).toHaveBeenLastCalledWith('institutions', expect.objectContaining({ page: 1 }), expect.anything());
    expect((screen.getByRole('button', { name: 'Suivante' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Précédente' }));
    expect(await screen.findByText('Institution 1')).toBeTruthy();
});

it('changer de périmètre revient à la première page et efface les filtres', async () => {
    fixture.scope = { institutionId: 'i1', departmentId: null };
    fixture.api.list.mockImplementation(async (_k: string, params: { page: number }) => params.page === 0 ? page([person(1)], true, 0) : page([person(2)], false, 1));
    const view = render(<CatalogPage kind="users" />);
    await screen.findByText('Aïssatou Barry 1');
    fireEvent.change(screen.getByLabelText('Filtrer Utilisateurs'), { target: { value: 'barry' } });
    fireEvent.click(screen.getByRole('button', { name: 'Suivante' }));
    await screen.findByText('Aïssatou Barry 2');
    fixture.scope = { institutionId: 'i2', departmentId: null };
    fixture.epoch += 1;
    view.rerender(<CatalogPage kind="users" />);
    await waitFor(() => expect(fixture.api.list).toHaveBeenLastCalledWith('users', expect.objectContaining({ page: 0, institutionId: 'i2' }), expect.anything()));
    expect((screen.getByLabelText('Filtrer Utilisateurs') as HTMLInputElement).value).toBe('');
});

it('sans droit de gestion, aucune création n’est proposée ; avec, le bouton porte l’accord du genre', async () => {
    const first = render(<CatalogPage kind="users" />);
    await screen.findByText('Aïssatou Barry 1').catch(() => null);
    expect(screen.queryByRole('button', { name: /Ajouter/ })).toBeNull();
    first.unmount();
    fixture.epoch += 1; fixture.allowed = new Set(['IAM_USER_MANAGE']);
    render(<CatalogPage kind="users" />);
    expect(await screen.findByRole('button', { name: 'Ajouter une identité' })).toBeTruthy();
});

it('les institutions et les rôles ne se créent que par la plateforme ; l’import n’existe que pour les institutions et les départements', async () => {
    fixture.allowed = new Set(['IAM_INSTITUTION_MANAGE', 'IAM_ROLE_MANAGE']);
    const first = render(<CatalogPage kind="institutions" />);
    await screen.findByText('Institution 1');
    expect(screen.queryByRole('button', { name: /Ajouter/ })).toBeNull();
    first.unmount();
    fixture.epoch += 1; fixture.platform = true;
    const second = render(<CatalogPage kind="institutions" />);
    expect(await screen.findByRole('button', { name: 'Ajouter une institution' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Importer depuis Excel' })).toBeTruthy();
    second.unmount();
    fixture.epoch += 1; fixture.api.list.mockResolvedValue(page([]));
    render(<CatalogPage kind="roles" />);
    expect(await screen.findByRole('button', { name: 'Ajouter un rôle' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Importer depuis Excel' })).toBeNull();
});

it('créer une ressource ouvre le formulaire de son type, et l’enregistrer relit la liste', async () => {
    fixture.platform = true;
    render(<CatalogPage kind="institutions" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ajouter une institution' }));
    const dialog = await screen.findByRole('dialog', { name: 'Formulaire institutions' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer le formulaire' }));
    await waitFor(() => expect(fixture.api.list).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

it('l’import des départements reçoit l’institution du périmètre ; celui des institutions se referme', async () => {
    fixture.scope = { institutionId: 'i1', departmentId: null };
    fixture.allowed = new Set(['IAM_DEPARTMENT_MANAGE']);
    fixture.api.list.mockResolvedValue(page([]));
    const first = render(<CatalogPage kind="departments" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Importer depuis Excel' }));
    expect((await screen.findByRole('dialog', { name: 'Import des départements' })).textContent).toBe('i1');
    first.unmount();
    fixture.epoch += 1; fixture.platform = true; fixture.scope = { institutionId: null, departmentId: null };
    render(<CatalogPage kind="institutions" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Importer depuis Excel' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Fermer l’import' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});
