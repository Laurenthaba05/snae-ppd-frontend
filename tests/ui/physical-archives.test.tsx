import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

// Les archives physiques : l'arbre des emplacements, puis leurs unités, puis les archives d'une unité ; les actions de gestion ne se proposent qu'avec l'habilitation, activer ou
// désactiver passe par une commande avec sa clé, et un refus du serveur est dit à l'écran (jamais avalé en silence).
const fixture = vi.hoisted(() => ({
    physicalArchives: {
        locations: vi.fn(), storageUnits: vi.fn(), storageUnitsByLocation: vi.fn(), archivesByStorageUnit: vi.fn(), archive: vi.fn(), command: vi.fn(), restorations: vi.fn(),
        movementsByArchive: vi.fn(), restorationsByArchive: vi.fn(), placement: vi.fn(), findArchives: vi.fn(), vocabulary: vi.fn(), readings: vi.fn(), conditionAlerts: vi.fn(), exitRequestsByArchive: vi.fn()
    },
    me: { user: { id: 'u1' } } as unknown, epoch: 1, allowed: new Set<string>(), navigate: vi.fn(), print: vi.fn()
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
// un droit est donné « partout » (code seul) ou pour un propriétaire précis (code@institution) ; sans propriétaire (dépôt national), seul le code seul le couvre
vi.mock('../../src/core/policy', () => ({
    can: (_me: unknown, code: string, target?: { institutionId?: string | null }) => target?.institutionId ? fixture.allowed.has(code + '@' + target.institutionId) || fixture.allowed.has(code + '@*') : fixture.allowed.has(code),
    canAnywhere: (_me: unknown, code: string) => [...fixture.allowed].some(a => a === code || a.startsWith(code + '@'))
}));
vi.mock('../../src/ui/InstitutionChoice', () => ({
    InstitutionChoice: ({ value, onChange }: { value: string; onChange: (id: string) => void }) => <select aria-label="Institution propriétaire" value={value} onChange={e => onChange(e.target.value)}><option value="">Dépôt national</option><option value="inst-a">Institution A</option></select>
}));
vi.mock('../../src/ui/navigation', () => ({ navigate: fixture.navigate }));
vi.mock('../../src/ui/ResourceDetails', () => ({ ResourceDetailsButton: () => null }));
vi.mock('../../src/ui/OptionalFields', () => ({ OptionalFields: () => null, useOptionalFields: () => ({ payload: () => ({}), values: {} }) }));
vi.mock('../../src/ui/PhysicalElimination', () => ({ PhysicalEliminationSection: () => <div data-testid="elimination" /> }));
vi.mock('../../src/ui/PhysicalRisk', () => ({ PhysicalRiskSection: () => <div data-testid="risk" /> }));
vi.mock('../../src/ui/printHtml', () => ({ printHtml: fixture.print }));
vi.mock('../../src/ui/PhysicalInventory', () => ({ PhysicalInventoryDialog: ({ unit, archives, onClose }: { unit: { cote: string }; archives: unknown[]; onClose: () => void }) => <div role="dialog" aria-label="Récolement"><span>Récolement de {unit.cote} : {archives.length} archives</span><button type="button" onClick={onClose}>Fermer le récolement</button></div> }));
vi.mock('../../src/ui/PhysicalGaps', () => ({ PhysicalGapsSection: () => <div data-testid="gaps" /> }));
vi.mock('../../src/ui/PhysicalOccupation', () => ({ PhysicalOccupationSection: () => <div data-testid="occupation" /> }));
// La file et les demandes de sortie ont leurs propres tests (physical-exit) : ici, on vérifie seulement la place qu'elles prennent dans la page et dans la fiche.
vi.mock('../../src/ui/PhysicalExit', () => ({ ExitQueueSection: () => <div data-testid="exit-queue" />, ArchiveExits: ({ canRequest }: { canRequest: boolean }) => <div data-testid="archive-exits">{canRequest ? 'Demander la sortie' : 'Lecture seule'}</div> }));
// La recherche et la fiche d'emplacement ont leurs propres tests : ici, on vérifie seulement comment la page les accueille.
vi.mock('../../src/ui/PhysicalArchiveFinder', () => ({
    PhysicalArchiveFinder: ({ onOpen }: { onOpen: (found: unknown) => void }) => <button type="button" onClick={() => onOpen({ id: 'a1', cote: 'ARCH-1950-001', habituel: { unitId: 'u1' } })}>Archive trouvée</button>
}));
vi.mock('../../src/ui/HeritagePlacement', () => ({ PlacementCard: ({ titre }: { titre?: string }) => <div data-testid="placement-card">{titre}</div> }));
vi.mock('../../src/ui/names', () => ({
    DocumentName: ({ id }: { id: string }) => <span>{id === 'doc-1' ? 'Registre des naissances' : 'Document'}</span>,
    EntityName: ({ id }: { id: string }) => <span>{'Institution ' + id}</span>
}));
import { PhysicalArchivesPage, RestorationListPage } from '../../src/pages/PhysicalArchives';

const location = (id: string, libelle: string, over: Record<string, unknown> = {}) => ({ id, libelle, typeLocalisation: 'MAGASIN', code: null, statut: 'ACTIVE', parentId: null, ...over });
const unit = (id: string, cote: string, over: Record<string, unknown> = {}) => ({ id, cote, typeUnite: 'BOITE', capacite: 40, statut: 'ACTIVE', localisationId: 'l1', ...over });
const archive = (id: string, cote: string, over: Record<string, unknown> = {}) => ({ id, cote, support: 'PAPIER', etatPhysique: 'BON', documentId: null, uniteStockageId: 'u1', versionLock: 3, intitule: null, ...over });

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
    api.placement.mockReset().mockResolvedValue({ archiveId: 'a1', cote: 'ARCH-1950-001', ecarts: [] });
    api.findArchives.mockReset().mockResolvedValue({ items: [], page: 0, size: 20, hasMore: false });
    api.vocabulary.mockReset().mockResolvedValue([]);
    api.readings.mockReset().mockResolvedValue({ items: [], page: 0, size: 20, hasMore: false });
    api.conditionAlerts.mockReset().mockResolvedValue({ items: [], page: 0, size: 20, hasMore: false });
    api.exitRequestsByArchive.mockReset().mockResolvedValue([]);
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
    expect(screen.getByTestId('occupation')).toBeTruthy();
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

it('ouvrir une archive trouvée place l’arbre sur son lieu et ouvre sa fiche, avec « Où la trouver »', async () => {
    render(<PhysicalArchivesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Archive trouvée' }));
    const dialog = await screen.findByRole('dialog', { name: /Archive ARCH-1950-001/ });
    expect(fixture.physicalArchives.storageUnitsByLocation).toHaveBeenCalledWith('l1', expect.anything());
    expect(fixture.physicalArchives.archivesByStorageUnit).toHaveBeenCalledWith('u1', expect.anything());
    expect(await within(dialog).findByTestId('placement-card')).toBeTruthy();
    expect(within(dialog).getByText('Où la trouver')).toBeTruthy();
    expect(fixture.physicalArchives.placement).toHaveBeenCalledWith('a1', expect.anything());
});

it('décrire une archive envoie la version lue et les champs nettoyés, puis recharge ; sans habilitation, rien n’est proposé', async () => {
    fixture.physicalArchives.archivesByStorageUnit.mockResolvedValue([archive('a1', 'ARCH-1950-001', { quantite: '12.000', uniteQuantite: 'boîtes' })]);
    const first = render(<PhysicalArchivesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Archive trouvée' }));
    await screen.findByRole('dialog', { name: /Archive ARCH-1950-001/ });
    expect(screen.queryByRole('button', { name: 'Décrire' })).toBeNull();
    first.unmount();
    fixture.epoch += 1;
    fixture.allowed = new Set(['PHYSICALARCHIVES_MANAGE']);
    render(<PhysicalArchivesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Archive trouvée' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Décrire' }));
    const form = await screen.findByRole('dialog', { name: 'Décrire l’archive' });
    expect((within(form).getByLabelText(/^Quantité/) as HTMLInputElement).value).toBe('12');
    fireEvent.change(within(form).getByLabelText(/^Intitulé/), { target: { value: '  Registre des naissances 1950  ' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(fixture.physicalArchives.command).toHaveBeenCalledWith('/archives/a1/describe', expect.objectContaining({
        versionLock: 3, intitule: 'Registre des naissances 1950', support: 'PAPIER', quantite: 12, uniteQuantite: 'boîtes', dateExtremeDebut: null }), expect.any(String), 'POST'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Décrire l’archive' })).toBeNull());
    await waitFor(() => expect(fixture.physicalArchives.archivesByStorageUnit.mock.calls.length).toBeGreaterThan(1));
});

it('un refus de la correction (archive modifiée entre-temps) est dit et laisse le formulaire ouvert', async () => {
    fixture.allowed = new Set(['PHYSICALARCHIVES_MANAGE']);
    fixture.physicalArchives.command.mockRejectedValue(new Error('Cette archive a été modifiée par quelqu’un d’autre'));
    render(<PhysicalArchivesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Archive trouvée' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Décrire' }));
    const form = await screen.findByRole('dialog', { name: 'Décrire l’archive' });
    fireEvent.click(within(form).getByRole('button', { name: 'Enregistrer' }));
    expect(await within(form).findByText('Cette archive a été modifiée par quelqu’un d’autre')).toBeTruthy();
    expect((within(form).getByRole('button', { name: 'Enregistrer' }) as HTMLButtonElement).disabled).toBe(false);
});

// Les droits suivent le propriétaire : une institution gère ses lieux, ses unités et ses archives sans toucher à ceux des autres ni au dépôt national.
const owned = (id: string, libelle: string, institutionId: string | null, over: Record<string, unknown> = {}) => ({ ...location(id, libelle), institutionId, ...over });

it('le propriétaire de chaque lieu est dit, et chaque lieu ne se gère que par ceux qui couvrent son propriétaire', async () => {
    fixture.allowed = new Set(['PHYSICALARCHIVES_READ', 'PHYSICALARCHIVES_LOCATION_MANAGE@inst-a']);
    fixture.physicalArchives.locations.mockResolvedValue([owned('l1', 'Salle de A', 'inst-a'), owned('l2', 'Dépôt central', null), owned('l3', 'Salle de B', 'inst-b')]);
    render(<PhysicalArchivesPage />);
    const mine = (await screen.findByText('Salle de A')).closest('tr')!;
    const depot = screen.getByText('Dépôt central').closest('tr')!;
    const theirs = screen.getByText('Salle de B').closest('tr')!;
    expect(within(mine).getByText('Institution inst-a')).toBeTruthy();
    expect(within(depot).getByText('Dépôt national')).toBeTruthy();
    expect(within(mine).getByRole('button', { name: 'Désactiver' })).toBeTruthy();
    expect(within(depot).queryByRole('button', { name: 'Désactiver' })).toBeNull();
    expect(within(theirs).queryByRole('button', { name: 'Désactiver' })).toBeNull();
    // créer un emplacement est proposé à qui gère des lieux quelque part
    expect(screen.getByRole('button', { name: 'Créer un emplacement' })).toBeTruthy();
});

it('un rôle national gère tous les lieux, le dépôt national compris', async () => {
    fixture.allowed = new Set(['PHYSICALARCHIVES_LOCATION_MANAGE', 'PHYSICALARCHIVES_LOCATION_MANAGE@*']);
    fixture.physicalArchives.locations.mockResolvedValue([owned('l1', 'Salle de A', 'inst-a'), owned('l2', 'Dépôt central', null)]);
    render(<PhysicalArchivesPage />);
    await screen.findByText('Salle de A');
    expect(screen.getAllByRole('button', { name: 'Désactiver' })).toHaveLength(2);
});

it('sans droit de gestion nulle part, rien ne se crée ni ne se désactive', async () => {
    fixture.allowed = new Set(['PHYSICALARCHIVES_READ']);
    fixture.physicalArchives.locations.mockResolvedValue([owned('l1', 'Salle de A', 'inst-a')]);
    render(<PhysicalArchivesPage />);
    await screen.findByText('Salle de A');
    expect(screen.queryByRole('button', { name: 'Créer un emplacement' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Désactiver' })).toBeNull();
});

it('créer un emplacement envoie le propriétaire choisi ; un sous-emplacement prend celui de son parent', async () => {
    fixture.allowed = new Set(['PHYSICALARCHIVES_LOCATION_MANAGE', 'PHYSICALARCHIVES_LOCATION_MANAGE@*']);
    fixture.physicalArchives.locations.mockResolvedValue([owned('l1', 'Salle de A', 'inst-a')]);
    render(<PhysicalArchivesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Créer un emplacement' }));
    const dialog = await screen.findByRole('dialog', { name: 'Créer un emplacement' });
    fireEvent.change(within(dialog).getByLabelText(/^Libellé/), { target: { value: 'Rayonnage A1' } });
    fireEvent.change(within(dialog).getByLabelText(/^Type/), { target: { value: 'RAYONNAGE' } });
    fireEvent.change(within(dialog).getByLabelText('Institution propriétaire'), { target: { value: 'inst-a' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer' }));
    await waitFor(() => expect(fixture.physicalArchives.command).toHaveBeenCalledWith('/locations', expect.objectContaining({ institutionId: 'inst-a', parentId: null, libelle: 'Rayonnage A1' }), expect.any(String), 'POST'));
    // avec un parent, le propriétaire n'est plus demandé : le serveur reprend celui du parent
    fixture.physicalArchives.command.mockClear();
    fireEvent.click(await screen.findByRole('button', { name: 'Créer un emplacement' }));
    const second = await screen.findByRole('dialog', { name: 'Créer un emplacement' });
    fireEvent.change(within(second).getByLabelText(/^Libellé/), { target: { value: 'Travée 1' } });
    fireEvent.change(within(second).getByLabelText(/^Type/), { target: { value: 'TRAVEE' } });
    fireEvent.change(within(second).getByLabelText(/^Emplacement parent/), { target: { value: 'l1' } });
    expect(within(second).queryByLabelText('Institution propriétaire')).toBeNull();
    expect(within(second).getByText(/même institution que son emplacement parent/)).toBeTruthy();
    fireEvent.click(within(second).getByRole('button', { name: 'Créer' }));
    await waitFor(() => expect(fixture.physicalArchives.command).toHaveBeenCalledWith('/locations', expect.objectContaining({ institutionId: null, parentId: 'l1' }), expect.any(String), 'POST'));
});

it('la fiche d’une archive ne propose de la décrire qu’à qui gère son propriétaire', async () => {
    fixture.physicalArchives.archivesByStorageUnit.mockResolvedValue([archive('a1', 'ARCH-1950-001', { institutionId: 'inst-b' })]);
    fixture.allowed = new Set(['PHYSICALARCHIVES_MANAGE@inst-a']);
    const first = render(<PhysicalArchivesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Archive trouvée' }));
    await screen.findByRole('dialog', { name: /Archive ARCH-1950-001/ });
    expect(screen.queryByRole('button', { name: 'Décrire' })).toBeNull();
    first.unmount();
    fixture.epoch += 1;
    fixture.allowed = new Set(['PHYSICALARCHIVES_MANAGE@inst-b']);
    render(<PhysicalArchivesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Archive trouvée' }));
    expect(await screen.findByRole('button', { name: 'Décrire' })).toBeTruthy();
});

it('la file des demandes de sortie est sur la page, et la fiche d’une archive propose la demande selon le propriétaire', async () => {
    fixture.physicalArchives.archivesByStorageUnit.mockResolvedValue([archive('a1', 'ARCH-1950-001', { institutionId: 'inst-b' })]);
    fixture.allowed = new Set(['PHYSICALARCHIVES_EXIT_REQUEST@inst-a']);
    const first = render(<PhysicalArchivesPage />);
    expect(await screen.findByTestId('exit-queue')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Archive trouvée' }));
    await screen.findByRole('dialog', { name: /Archive ARCH-1950-001/ });
    expect(screen.getByTestId('archive-exits').textContent).toBe('Lecture seule');
    first.unmount();
    fixture.epoch += 1;
    fixture.allowed = new Set(['PHYSICALARCHIVES_EXIT_REQUEST@inst-b']);
    render(<PhysicalArchivesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Archive trouvée' }));
    await waitFor(() => expect(screen.getByTestId('archive-exits').textContent).toBe('Demander la sortie'));
    expect(fixture.physicalArchives.exitRequestsByArchive).toHaveBeenCalledWith('a1', expect.anything());
});

it('une sortie née d’une demande ne se réintègre pas par le mouvement : elle se rend par la demande', async () => {
    fixture.physicalArchives.archivesByStorageUnit.mockResolvedValue([archive('a1', 'ARCH-1950-001', { institutionId: 'inst-b' })]);
    fixture.allowed = new Set(['PHYSICALARCHIVES_MANAGE@inst-b']);
    fixture.physicalArchives.movementsByArchive.mockResolvedValue([
        { id: 'm1', typeMouvement: 'CONSULTATION', motif: 'Sortie demandée', statut: 'EN_COURS', dateSortie: '2026-10-03T09:00:00Z' },
        { id: 'm2', typeMouvement: 'TRANSFERT', motif: 'Ancienne sortie directe', statut: 'EN_COURS', dateSortie: '2026-09-03T09:00:00Z' }]);
    fixture.physicalArchives.exitRequestsByArchive.mockResolvedValue([{ id: 'r1', statut: 'REMISE', mouvementId: 'm1' }]);
    render(<PhysicalArchivesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Archive trouvée' }));
    await screen.findByText('Ancienne sortie directe');
    await screen.findByText('Se rend par la demande de sortie');
    expect(screen.getAllByRole('button', { name: 'Réintégrer' })).toHaveLength(1);
});

// Les étiquettes (QR + Code 128) s'impriment pour les unités d'un lieu, les archives d'une unité et une archive seule ; rien ne s'imprime sans identifiant valide.
const UNIT_ID = '8b1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const ARCHIVE_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

it('imprime les étiquettes des unités du lieu et des archives de l’unité, avec le chemin du lieu', async () => {
    fixture.print.mockReset();
    fixture.physicalArchives.storageUnitsByLocation.mockResolvedValue([unit(UNIT_ID, 'BOITE-001', { localisationId: 'l2' })]);
    fixture.physicalArchives.storageUnits.mockResolvedValue([unit(UNIT_ID, 'BOITE-001', { localisationId: 'l2' })]);
    fixture.physicalArchives.archivesByStorageUnit.mockResolvedValue([archive(ARCHIVE_ID, 'ARCH-1950-001', { uniteStockageId: UNIT_ID, intitule: 'Registre des naissances 1950' })]);
    render(<PhysicalArchivesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Rayonnage B' }));
    await screen.findByText('BOITE-001');
    fireEvent.click(screen.getByRole('button', { name: 'Étiquettes des unités' }));
    expect(fixture.print).toHaveBeenCalledTimes(1);
    const unitsDoc = fixture.print.mock.calls[0]![0] as string;
    expect(unitsDoc).toContain('SNAE:U:' + UNIT_ID.toUpperCase());
    expect(unitsDoc).toContain('Magasin central › Rayonnage B');
    fireEvent.click(screen.getByRole('button', { name: 'BOITE-001' }));
    await screen.findByText('ARCH-1950-001');
    fireEvent.click(screen.getByRole('button', { name: 'Étiquettes des archives' }));
    expect(fixture.print).toHaveBeenCalledTimes(2);
    const archivesDoc = fixture.print.mock.calls[1]![0] as string;
    expect(archivesDoc).toContain('SNAE:A:' + ARCHIVE_ID.toUpperCase());
    expect(archivesDoc).toContain('Registre des naissances 1950');
    expect(archivesDoc).toContain('Magasin central › Rayonnage B · BOITE-001');
});

it('l’étiquette d’une archive se prépare depuis sa fiche, quand son emplacement est connu', async () => {
    fixture.print.mockReset();
    fixture.physicalArchives.archivesByStorageUnit.mockResolvedValue([archive(ARCHIVE_ID, 'ARCH-1950-001')]);
    fixture.physicalArchives.placement.mockResolvedValue({ archiveId: ARCHIVE_ID, cote: 'ARCH-1950-001', ecarts: [],
        habituel: { unitId: 'u1', cote: 'BOITE-001', typeUnite: 'BOITE', localisation: ['Magasin central'], actif: true } });
    fixture.physicalArchives.archive.mockResolvedValue(archive(ARCHIVE_ID, 'ARCH-1950-001'));
    render(<PhysicalArchivesPage initialArchiveId={ARCHIVE_ID} />);
    const dialog = await screen.findByRole('dialog', { name: /Archive ARCH-1950-001/ });
    await waitFor(() => expect((within(dialog).getByRole('button', { name: 'Imprimer l’étiquette' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Imprimer l’étiquette' }));
    expect(fixture.print).toHaveBeenCalledTimes(1);
    expect(fixture.print.mock.calls[0]![0]).toContain('Magasin central · BOITE-001');
});

it('un identifiant invalide ne produit aucune impression et le dit', async () => {
    fixture.print.mockReset();
    fixture.physicalArchives.storageUnitsByLocation.mockResolvedValue([unit('pas-un-uuid', 'BOITE-001')]);
    render(<PhysicalArchivesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Magasin central' }));
    await screen.findByText('BOITE-001');
    fireEvent.click(screen.getByRole('button', { name: 'Étiquettes des unités' }));
    expect(fixture.print).not.toHaveBeenCalled();
    expect((await screen.findByRole('alert')).textContent).toMatch(/UUID/);
});

it('le récolement par lecture n’est proposé qu’à qui peut constater la présence dans l’unité, et s’ouvre sur ses archives', async () => {
    fixture.allowed = new Set(['PHYSICALARCHIVES_VERIFY@inst-a']);
    fixture.physicalArchives.storageUnitsByLocation.mockResolvedValue([unit('u1', 'BOITE-001', { institutionId: 'inst-b' })]);
    const first = render(<PhysicalArchivesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Magasin central' }));
    fireEvent.click(await screen.findByRole('button', { name: 'BOITE-001' }));
    await screen.findByText('ARCH-1950-001');
    expect(screen.queryByRole('button', { name: 'Récolement par lecture' })).toBeNull();
    first.unmount();
    fixture.epoch += 1;
    fixture.allowed = new Set(['PHYSICALARCHIVES_VERIFY@inst-b']);
    render(<PhysicalArchivesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Magasin central' }));
    fireEvent.click(await screen.findByRole('button', { name: 'BOITE-001' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Récolement par lecture' }));
    expect(await screen.findByText('Récolement de BOITE-001 : 2 archives')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Fermer le récolement' }));
    expect(screen.queryByRole('dialog', { name: 'Récolement' })).toBeNull();
});

// Capacité et conditions d'une unité : ce qui est rangé se compare à la capacité, le dernier relevé se montre, et les réglages comme les relevés suivent les droits du propriétaire.
it('montre la capacité comparée à ce qui est rangé et le dernier relevé de chaque unité', async () => {
    fixture.physicalArchives.storageUnitsByLocation.mockResolvedValue([unit('u1', 'BOITE-001', { capacite: '10.000', uniteCapacite: 'boîtes',
        occupation: { utilise: 9, unite: 'boîtes', taux: 0.9, nonCompte: 0 }, releves: [{ mesure: 'TEMPERATURE', valeur: '24.50', releveLe: '2026-10-22T08:00:00Z', etat: 'TROP_HAUT' }] })]);
    render(<PhysicalArchivesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Magasin central' }));
    const row = (await screen.findByText('BOITE-001')).closest('tr') as HTMLElement;
    expect(within(row).getByText(/9 \/ 10 boîtes \(90 %\)/)).toBeTruthy();
    expect(within(row).getByText('Presque pleine')).toBeTruthy();
    expect(within(row).getByText(/Température : 24,5 °C/)).toBeTruthy();
    expect(within(row).getByText('Trop haut')).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'Relevés' })).toBeTruthy();
    expect(within(row).queryByRole('button', { name: 'Réglages' })).toBeNull();
});

it('les réglages d’une unité ne sont proposés qu’à qui gère son propriétaire, et ouvrent le formulaire de capacité et de seuils', async () => {
    fixture.allowed = new Set(['PHYSICALARCHIVES_LOCATION_MANAGE@inst-a']);
    fixture.physicalArchives.storageUnitsByLocation.mockResolvedValue([unit('u1', 'BOITE-A', { institutionId: 'inst-a' }), unit('u2', 'BOITE-B', { institutionId: 'inst-b' })]);
    render(<PhysicalArchivesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Magasin central' }));
    const mine = (await screen.findByText('BOITE-A')).closest('tr') as HTMLElement;
    const theirs = screen.getByText('BOITE-B').closest('tr') as HTMLElement;
    expect(within(theirs).queryByRole('button', { name: 'Réglages' })).toBeNull();
    fireEvent.click(within(mine).getByRole('button', { name: 'Réglages' }));
    expect(await screen.findByRole('dialog', { name: 'Capacité et conditions de conservation' })).toBeTruthy();
});
