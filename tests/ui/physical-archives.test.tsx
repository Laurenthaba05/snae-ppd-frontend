import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

// Les archives physiques : l'arbre des emplacements, puis leurs unités, puis les archives d'une unité ; les actions de gestion ne se proposent qu'avec l'habilitation, activer ou
// désactiver passe par une commande avec sa clé, et un refus du serveur est dit à l'écran (jamais avalé en silence).
const fixture = vi.hoisted(() => ({
    physicalArchives: {
        locations: vi.fn(), storageUnits: vi.fn(), storageUnitsByLocation: vi.fn(), archivesByStorageUnit: vi.fn(), archive: vi.fn(), command: vi.fn(), restorations: vi.fn(),
        movementsByArchive: vi.fn(), restorationsByArchive: vi.fn()
    },
    me: { user: { id: 'u1' } } as unknown, epoch: 1, allowed: new Set<string>(), navigate: vi.fn()
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
vi.mock('../../src/ui/navigation', () => ({ navigate: fixture.navigate }));
vi.mock('../../src/ui/ResourceDetails', () => ({ ResourceDetailsButton: () => null }));
vi.mock('../../src/ui/OptionalFields', () => ({ OptionalFields: () => null, useOptionalFields: () => ({ payload: () => ({}), values: {} }) }));
vi.mock('../../src/ui/PhysicalElimination', () => ({ PhysicalEliminationSection: () => <div data-testid="elimination" /> }));
vi.mock('../../src/ui/PhysicalRisk', () => ({ PhysicalRiskSection: () => <div data-testid="risk" /> }));
vi.mock('../../src/ui/names', () => ({ DocumentName: ({ id }: { id: string }) => <span>{id === 'doc-1' ? 'Registre des naissances' : 'Document'}</span> }));
import { PhysicalArchivesPage, RestorationListPage } from '../../src/pages/PhysicalArchives';

const location = (id: string, libelle: string, over: Record<string, unknown> = {}) => ({ id, libelle, typeLocalisation: 'MAGASIN', code: null, statut: 'ACTIVE', parentId: null, ...over });
const unit = (id: string, cote: string, over: Record<string, unknown> = {}) => ({ id, cote, typeUnite: 'BOITE', capacite: 40, statut: 'ACTIVE', localisationId: 'l1', ...over });
const archive = (id: string, cote: string, over: Record<string, unknown> = {}) => ({ id, cote, support: 'PAPIER', etatPhysique: 'BON', documentId: null, uniteStockageId: 'u1', ...over });

beforeEach(() => {
    fixture.allowed = new Set(); fixture.epoch += 1; fixture.navigate.mockReset();
    const api = fixture.physicalArchives;
    api.locations.mockReset().mockResolvedValue([location('l2', 'Rayonnage B', { parentId: 'l1', code: 'R-B' }), location('l1', 'Magasin central', { typeLocalisation: 'BATIMENT' }), location('l3', 'Annexe', { statut: 'INACTIVE' })]);
    api.storageUnits.mockReset().mockResolvedValue([unit('u1', 'BOITE-001')]);
    api.storageUnitsByLocation.mockReset().mockResolvedValue([unit('u1', 'BOITE-001'), unit('u2', 'BOITE-002', { statut: 'INACTIVE', capacite: null })]);
    api.archivesByStorageUnit.mockReset().mockResolvedValue([archive('a1', 'ARCH-1950-001', { documentId: 'doc-1' }), archive('a2', 'ARCH-1950-002', { support: null, etatPhysique: 'DEGRADE' })]);
    api.archive.mockReset().mockResolvedValue(archive('a1', 'ARCH-1950-001', { uniteStockageId: 'u1' }));
    api.command.mockReset().mockResolvedValue({});
    api.restorations.mockReset().mockResolvedValue([]);
    api.movementsByArchive.mockReset().mockResolvedValue([]); api.restorationsByArchive.mockReset().mockResolvedValue([]);
});

it('les emplacements s’affichent en arbre : le parent d’abord, ses enfants en retrait, le reste trié par libellé', async () => {
    render(<PhysicalArchivesPage />);
    expect(await screen.findByText('Magasin central')).toBeTruthy();
    const names = screen.getAllByRole('row').slice(1).map(r => within(r).getAllByRole('cell')[0]!.textContent);
    expect(names).toEqual(['Annexe', 'Magasin central', 'Rayonnage B']);
    const child = screen.getByText('Rayonnage B').closest('td')!;
    const parent = screen.getByText('Magasin central').closest('td')!;
    expect(parseInt(child.style.paddingLeft)).toBeGreaterThan(parseInt(parent.style.paddingLeft));
    expect(screen.getByText('R-B')).toBeTruthy();
    expect(screen.getByTestId('elimination')).toBeTruthy();
    expect(screen.getByTestId('risk')).toBeTruthy();
});

it('sans habilitation, aucune action de gestion n’est proposée', async () => {
    render(<PhysicalArchivesPage />);
    await screen.findByText('Magasin central');
    expect(screen.queryByRole('button', { name: 'Créer un emplacement' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Désactiver' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Activer' })).toBeNull();
});

it('aucun emplacement, ou une erreur du serveur : l’écran le dit sans confondre les deux', async () => {
    fixture.physicalArchives.locations.mockResolvedValue([]);
    const first = render(<PhysicalArchivesPage />);
    expect(await screen.findByText('Aucun emplacement')).toBeTruthy();
    first.unmount();
    fixture.epoch += 1;
    fixture.physicalArchives.locations.mockRejectedValue(new Error('Magasin indisponible'));
    render(<PhysicalArchivesPage />);
    expect(await screen.findByText('Magasin indisponible')).toBeTruthy();
    expect(screen.queryByText('Aucun emplacement')).toBeNull();
});

it('choisir un emplacement liste ses unités, choisir une unité liste ses archives avec le nom du document', async () => {
    render(<PhysicalArchivesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Magasin central' }));
    expect(await screen.findByText('BOITE-001')).toBeTruthy();
    expect(fixture.physicalArchives.storageUnitsByLocation).toHaveBeenCalledWith('l1', expect.anything());
    expect(screen.getByText('BOITE-002')).toBeTruthy();
    expect(screen.queryByText('ARCH-1950-001')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'BOITE-001' }));
    expect(await screen.findByText('ARCH-1950-001')).toBeTruthy();
    expect(screen.getByText('Registre des naissances')).toBeTruthy();
    expect(screen.queryByText('doc-1')).toBeNull();
    expect(fixture.physicalArchives.archivesByStorageUnit).toHaveBeenCalledWith('u1', expect.anything());
});

it('changer d’emplacement referme la liste des archives de l’unité précédente', async () => {
    render(<PhysicalArchivesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Magasin central' }));
    fireEvent.click(await screen.findByRole('button', { name: 'BOITE-001' }));
    await screen.findByText('ARCH-1950-001');
    fireEvent.click(screen.getByRole('button', { name: 'Rayonnage B' }));
    await waitFor(() => expect(screen.queryByText('ARCH-1950-001')).toBeNull());
});

it('une unité sans archive, et un emplacement sans unité, le disent', async () => {
    fixture.physicalArchives.storageUnitsByLocation.mockResolvedValue([]);
    const first = render(<PhysicalArchivesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Magasin central' }));
    expect(await screen.findByText('Aucune unité de stockage')).toBeTruthy();
    first.unmount();
    fixture.epoch += 1;
    fixture.physicalArchives.storageUnitsByLocation.mockResolvedValue([unit('u1', 'BOITE-001')]);
    fixture.physicalArchives.archivesByStorageUnit.mockResolvedValue([]);
    render(<PhysicalArchivesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Magasin central' }));
    fireEvent.click(await screen.findByRole('button', { name: 'BOITE-001' }));
    expect(await screen.findByText('Aucune archive physique')).toBeTruthy();
});

it('désactiver un emplacement actif envoie la commande avec une clé, puis relit la liste ; activer un inactif envoie l’autre', async () => {
    fixture.allowed = new Set(['PHYSICALARCHIVES_LOCATION_MANAGE']);
    render(<PhysicalArchivesPage />);
    const row = (await screen.findByText('Magasin central')).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Désactiver' }));
    await waitFor(() => expect(fixture.physicalArchives.command).toHaveBeenCalledWith('/locations/l1/deactivate', {}, expect.stringMatching(/^[0-9a-f-]{36}$/), 'POST'));
    await waitFor(() => expect(fixture.physicalArchives.locations).toHaveBeenCalledTimes(2));
    fireEvent.click(within(screen.getByText('Annexe').closest('tr')!).getByRole('button', { name: 'Activer' }));
    await waitFor(() => expect(fixture.physicalArchives.command).toHaveBeenCalledWith('/locations/l3/activate', {}, expect.any(String), 'POST'));
});

it('un refus du serveur à la désactivation est dit à l’écran et ne laisse pas le bouton bloqué', async () => {
    fixture.allowed = new Set(['PHYSICALARCHIVES_LOCATION_MANAGE']);
    fixture.physicalArchives.command.mockRejectedValue(new Error('Cet emplacement contient des unités actives'));
    render(<PhysicalArchivesPage />);
    const row = (await screen.findByText('Magasin central')).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Désactiver' }));
    expect(await screen.findByText('Cet emplacement contient des unités actives')).toBeTruthy();
    expect((within(row).getByRole('button', { name: 'Désactiver' }) as HTMLButtonElement).disabled).toBe(false);
    expect(fixture.physicalArchives.locations).toHaveBeenCalledTimes(1);
});

it('un refus à la désactivation d’une unité est dit de la même façon', async () => {
    fixture.allowed = new Set(['PHYSICALARCHIVES_LOCATION_MANAGE']);
    fixture.physicalArchives.command.mockRejectedValue(new Error('Cette unité contient des archives'));
    render(<PhysicalArchivesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Magasin central' }));
    const row = (await screen.findByText('BOITE-001')).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Désactiver' }));
    expect(await screen.findByText('Cette unité contient des archives')).toBeTruthy();
    expect(fixture.physicalArchives.command).toHaveBeenCalledWith('/storage-units/u1/deactivate', {}, expect.any(String), 'POST');
});

it('créer un emplacement envoie les champs nettoyés, le parent choisi et une clé, puis recharge la liste', async () => {
    fixture.allowed = new Set(['PHYSICALARCHIVES_LOCATION_MANAGE']);
    render(<PhysicalArchivesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Créer un emplacement' }));
    const dialog = await screen.findByRole('dialog', { name: 'Créer un emplacement' });
    fireEvent.change(within(dialog).getByLabelText(/^Libellé/), { target: { value: '  Salle des plans  ' } });
    fireEvent.change(within(dialog).getByLabelText(/^Type/), { target: { value: ' SALLE ' } });
    fireEvent.change(within(dialog).getByLabelText(/^Emplacement parent/), { target: { value: 'l1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer' }));
    await waitFor(() => expect(fixture.physicalArchives.command).toHaveBeenCalledWith('/locations', expect.objectContaining({ parentId: 'l1', typeLocalisation: 'SALLE', libelle: 'Salle des plans', code: null, adresse: null }), expect.any(String), 'POST'));
    await waitFor(() => expect(fixture.physicalArchives.locations).toHaveBeenCalledTimes(2));
});

it('un lien profond vers une archive ouvre son unité', async () => {
    fixture.physicalArchives.locations.mockResolvedValue([location('l1', 'Magasin central')]);
    render(<PhysicalArchivesPage initialArchiveId="a1" />);
    await waitFor(() => expect(fixture.physicalArchives.archive).toHaveBeenCalledWith('a1'));
    await waitFor(() => expect(fixture.physicalArchives.archivesByStorageUnit).toHaveBeenCalledWith('u1', expect.anything()));
});

it('la liste des restaurations ouvre l’archive concernée, et dit quand il n’y en a aucune', async () => {
    fixture.physicalArchives.restorations.mockResolvedValue([{ id: 'x1', archiveCote: 'ARCH-1950-001', archivePhysiqueId: 'a 1', intitule: 'Désacidification', statut: 'EN_COURS', dateDiagnostic: '2026-09-01T00:00:00Z' }]);
    const first = render(<RestorationListPage />);
    expect(await screen.findByText('Désacidification')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));
    expect(fixture.navigate).toHaveBeenCalledWith('/app/archives-physiques?archive=a%201');
    first.unmount();
    fixture.epoch += 1;
    fixture.physicalArchives.restorations.mockResolvedValue([]);
    render(<RestorationListPage />);
    expect(await screen.findByText('Aucune intervention')).toBeTruthy();
});
