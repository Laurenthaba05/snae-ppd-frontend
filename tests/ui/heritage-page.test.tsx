import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

// La page du patrimoine : les onglets (celui de la localisation exige de lire les archives physiques), les référentiels (lieux, événements, sujets) et le volet d'un document
// (associations et textes multilingues). Un refus du serveur reste dit dans la boîte de dialogue, qui ne se ferme pas.
const fixture = vi.hoisted(() => ({
    epoch: 1, me: { user: { id: 'u1' } } as unknown, allowed: new Set<string>(),
    heritage: {
        places: vi.fn(), historicalEvents: vi.fn(), subjects: vi.fn(), command: vi.fn(),
        documentPlaces: vi.fn(), documentHistoricalEvents: vi.fn(), documentSubjects: vi.fn(), documentTexts: vi.fn()
    }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: { institutionId: null, departmentId: null } }) }));
vi.mock('../../src/ui/ResourceDetails', () => ({ ResourceDetailsButton: () => null }));
vi.mock('../../src/ui/OptionalFields', () => ({ OptionalFields: () => null, useOptionalFields: () => ({ payload: () => ({}), values: {} }) }));
vi.mock('../../src/ui/HeritageReferenceCatalog', () => ({ HeritageReferenceCatalog: () => <div data-testid="reference-catalog" /> }));
vi.mock('../../src/ui/HeritageAssets', () => ({ HeritageAssetsPanel: ({ initialAssetId }: { initialAssetId?: string }) => <div data-testid="assets" data-asset={initialAssetId ?? ''} /> }));
vi.mock('../../src/ui/HeritageEntries', () => ({ HeritageEntriesPanel: () => <div data-testid="entries" /> }));
vi.mock('../../src/ui/HeritagePlacement', () => ({ PlacementsPanel: () => <div data-testid="placements" /> }));
vi.mock('../../src/ui/HeritageRecolement', () => ({ RecolementsPanel: () => <div data-testid="recolements" /> }));
vi.mock('../../src/ui/HeritageConservation', () => ({ ConservationQueuePanel: () => <div data-testid="conservation" /> }));
vi.mock('../../src/ui/HeritageMovements', () => ({ MovementsPanel: () => <div data-testid="movements" /> }));
vi.mock('../../src/ui/HeritageDigitization', () => ({ DigitizationOrdersPanel: () => <div data-testid="digitization" /> }));
vi.mock('../../src/ui/HeritageDossiers', () => ({ DossiersPanel: () => <div data-testid="dossiers" /> }));
vi.mock('../../src/ui/HeritageDeaccessions', () => ({ DeaccessionsPanel: () => <div data-testid="deaccessions" /> }));
import { HeritagePage, HeritagePanel } from '../../src/pages/Heritage';

const place = (id: string, nom: string, over: Record<string, unknown> = {}) => ({ id, nom, typeLieu: 'VILLE', latitude: null, longitude: null, ...over });
const event = (id: string, titre: string, over: Record<string, unknown> = {}) => ({ id, titre, dateDebut: '1958-10-02', dateFin: null, ...over });
const subject = (id: string, terme: string, over: Record<string, unknown> = {}) => ({ id, terme, vocabulaire: null, ...over });

beforeEach(() => {
    fixture.allowed = new Set(); fixture.epoch += 1;
    const h = fixture.heritage;
    h.places.mockReset().mockResolvedValue([place('p1', 'Conakry', { latitude: '9.64', longitude: '-13.57' }), place('p2', 'Kankan', { typeLieu: null })]);
    h.historicalEvents.mockReset().mockResolvedValue([event('e1', 'Indépendance')]);
    h.subjects.mockReset().mockResolvedValue([subject('s1', 'Administration coloniale', { vocabulaire: 'Rameau' })]);
    h.command.mockReset().mockResolvedValue({});
    h.documentPlaces.mockReset().mockResolvedValue([{ place: place('p1', 'Conakry'), roleLieu: 'LIEU_PRODUCTION' }]);
    h.documentHistoricalEvents.mockReset().mockResolvedValue([event('e1', 'Indépendance')]);
    h.documentSubjects.mockReset().mockResolvedValue([]);
    h.documentTexts.mockReset().mockResolvedValue([{ id: 't1', langue: 'fr', typeTexte: 'TRANSCRIPTION', estOriginal: true, createdAt: '2026-10-01T10:00:00Z' }]);
});

const tabNames = () => screen.getAllByRole('tab').map(t => t.textContent);

it('les onglets du patrimoine s’affichent, celui de la localisation seulement avec le droit de lire les archives physiques', () => {
    const first = render(<HeritagePage />);
    expect(tabNames()).toEqual(['Biens patrimoniaux', 'Entrées et provenance', 'Récolements', 'Conservation', 'Mouvements', 'Prêts et expositions', 'Numérisation', 'Sorties de collection', 'Lieux, événements et sujets']);
    first.unmount();
    fixture.allowed = new Set(['PHYSICALARCHIVES_READ']);
    render(<HeritagePage />);
    expect(tabNames()).toContain('Localisation et vérifications');
    expect(tabNames().indexOf('Localisation et vérifications')).toBe(2);
});

it('l’onglet des biens est ouvert d’abord, avec le bien d’un lien profond ; chaque onglet ouvre son volet', () => {
    render(<HeritagePage initialAssetId="bien-7" />);
    expect(screen.getByTestId('assets').getAttribute('data-asset')).toBe('bien-7');
    expect(screen.getByRole('tab', { name: 'Biens patrimoniaux' }).getAttribute('aria-selected')).toBe('true');
    const expected: Array<[string, string]> = [['Entrées et provenance', 'entries'], ['Récolements', 'recolements'], ['Conservation', 'conservation'], ['Mouvements', 'movements'],
        ['Prêts et expositions', 'dossiers'], ['Numérisation', 'digitization'], ['Sorties de collection', 'deaccessions']];
    for (const [name, id] of expected) {
        fireEvent.click(screen.getByRole('tab', { name }));
        expect(screen.getByTestId(id)).toBeTruthy();
        expect(screen.queryByTestId('assets')).toBeNull();
        expect(screen.getByRole('tab', { name }).getAttribute('aria-selected')).toBe('true');
    }
});

it('l’onglet de la localisation ouvre les emplacements des biens', () => {
    fixture.allowed = new Set(['PHYSICALARCHIVES_READ']);
    render(<HeritagePage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Localisation et vérifications' }));
    expect(screen.getByTestId('placements')).toBeTruthy();
});

it('les référentiels listent les lieux (avec coordonnées ou un tiret), les événements et les sujets', async () => {
    render(<HeritagePage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Lieux, événements et sujets' }));
    expect(await screen.findByText('Conakry')).toBeTruthy();
    expect(screen.getByText('9.64, -13.57')).toBeTruthy();
    expect(screen.getByText('Kankan')).toBeTruthy();
    expect(screen.getByText('Indépendance')).toBeTruthy();
    expect(screen.getByText('1958-10-02')).toBeTruthy();
    expect(screen.getByText('Administration coloniale')).toBeTruthy();
    expect(screen.getByText('Rameau')).toBeTruthy();
    expect(screen.getByTestId('reference-catalog')).toBeTruthy();
});

it('un référentiel vide ou en erreur le dit sans toucher aux deux autres', async () => {
    fixture.heritage.places.mockResolvedValue([]);
    fixture.heritage.historicalEvents.mockRejectedValue(new Error('Événements indisponibles'));
    render(<HeritagePage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Lieux, événements et sujets' }));
    expect(await screen.findByText('Aucun lieu')).toBeTruthy();
    expect(await screen.findByText('Événements indisponibles')).toBeTruthy();
    expect(screen.getByText('Administration coloniale')).toBeTruthy();
    expect(screen.queryByText('Aucun événement historique')).toBeNull();
});

it('sans le droit de gérer les référentiels, aucune création n’est proposée', async () => {
    render(<HeritagePage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Lieux, événements et sujets' }));
    await screen.findByText('Conakry');
    expect(screen.queryByRole('button', { name: 'Créer un lieu' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Créer un événement' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Créer un sujet' })).toBeNull();
});

it('créer un lieu envoie les champs nettoyés avec une clé, relit la liste et referme la fenêtre', async () => {
    fixture.allowed = new Set(['HERITAGE_CATALOG_MANAGE']);
    render(<HeritagePage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Lieux, événements et sujets' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Créer un lieu' }));
    const dialog = await screen.findByRole('dialog', { name: 'Créer un lieu' });
    fireEvent.change(within(dialog).getByLabelText(/^Nom/), { target: { value: '  Labé  ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer' }));
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledWith('/places', { nom: 'Labé', typeLieu: null, description: null }, expect.stringMatching(/^[0-9a-f-]{36}$/), 'POST'));
    await waitFor(() => expect(fixture.heritage.places).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

it('créer un événement et un sujet passent par leurs propres commandes', async () => {
    fixture.allowed = new Set(['HERITAGE_CATALOG_MANAGE']);
    render(<HeritagePage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Lieux, événements et sujets' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Créer un événement' }));
    let dialog = await screen.findByRole('dialog', { name: 'Créer un événement historique' });
    fireEvent.change(within(dialog).getByLabelText(/^Titre/), { target: { value: ' Accords de Kaporo ' } });
    fireEvent.change(within(dialog).getByLabelText(/^Date de début/), { target: { value: '1960-05-01' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer' }));
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledWith('/historical-events', { titre: 'Accords de Kaporo', dateDebut: '1960-05-01', dateFin: null, description: null }, expect.any(String), 'POST'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Créer un sujet' }));
    dialog = await screen.findByRole('dialog', { name: 'Créer un sujet' });
    fireEvent.change(within(dialog).getByLabelText(/^Terme/), { target: { value: 'Mines' } });
    fireEvent.change(within(dialog).getByLabelText(/^Vocabulaire/), { target: { value: ' Rameau ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer' }));
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledWith('/subjects', { terme: 'Mines', vocabulaire: 'Rameau', definition: null }, expect.any(String), 'POST'));
});

it('un refus du serveur à la création est dit dans la fenêtre, qui reste ouverte avec la saisie', async () => {
    fixture.allowed = new Set(['HERITAGE_CATALOG_MANAGE']);
    fixture.heritage.command.mockRejectedValue(new Error('Ce lieu existe déjà'));
    render(<HeritagePage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Lieux, événements et sujets' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Créer un lieu' }));
    const dialog = await screen.findByRole('dialog', { name: 'Créer un lieu' });
    fireEvent.change(within(dialog).getByLabelText(/^Nom/), { target: { value: 'Conakry' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer' }));
    expect(await within(dialog).findByText('Ce lieu existe déjà')).toBeTruthy();
    expect((within(dialog).getByLabelText(/^Nom/) as HTMLInputElement).value).toBe('Conakry');
    expect(fixture.heritage.places).toHaveBeenCalledTimes(1);
});

it('le volet d’un document liste ses lieux avec leur rôle, ses événements, ses sujets et ses textes', async () => {
    render(<HeritagePanel documentId="d1" />);
    expect(await screen.findByText('Conakry — LIEU_PRODUCTION')).toBeTruthy();
    expect(fixture.heritage.documentPlaces).toHaveBeenCalledWith('d1', expect.anything());
    expect(screen.getByText('Indépendance')).toBeTruthy();
    expect(screen.getByText('Aucun sujet associé')).toBeTruthy();
    expect(await screen.findByText('TRANSCRIPTION')).toBeTruthy();
    expect(screen.getByText('Oui')).toBeTruthy();
});

it('sans texte, le volet invite à ajouter une transcription ; une erreur de lecture propose de réessayer', async () => {
    fixture.heritage.documentTexts.mockResolvedValue([]);
    const first = render(<HeritagePanel documentId="d1" />);
    expect(await screen.findByText('Aucun texte multilingue')).toBeTruthy();
    first.unmount();
    fixture.epoch += 1;
    fixture.heritage.documentTexts.mockReset()
        .mockRejectedValueOnce(new Error('Textes indisponibles'))
        .mockResolvedValue([{ id: 't1', langue: 'fr', typeTexte: 'TRANSCRIPTION', estOriginal: true, createdAt: '2026-10-01T10:00:00Z' }]);
    render(<HeritagePanel documentId="d1" />);
    expect(await screen.findByText('Textes indisponibles')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer la lecture' }));
    expect(await screen.findByText('TRANSCRIPTION')).toBeTruthy();
});

it('sans le droit d’étiqueter, le volet du document est en lecture seule', async () => {
    render(<HeritagePanel documentId="d1" />);
    await screen.findByText('Conakry — LIEU_PRODUCTION');
    expect(screen.queryByRole('button', { name: 'Associer un lieu' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ajouter un texte' })).toBeNull();
});

it('associer un lieu envoie le rôle nettoyé sur le bon document, relit les lieux du document et ne s’active qu’avec un lieu choisi', async () => {
    fixture.allowed = new Set(['HERITAGE_TAG_MANAGE']);
    render(<HeritagePanel documentId="d1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Associer un lieu' }));
    const dialog = await screen.findByRole('dialog', { name: 'Associer un lieu' });
    const submit = within(dialog).getByRole('button', { name: 'Associer' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    await waitFor(() => expect(within(dialog).getByRole('option', { name: 'Kankan' })).toBeTruthy());
    fireEvent.change(within(dialog).getByLabelText(/^Lieu/), { target: { value: 'p2' } });
    fireEvent.change(within(dialog).getByLabelText(/^Rôle/), { target: { value: ' LIEU_EVENEMENT ' } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledWith('/documents/d1/places/p2', { roleLieu: 'LIEU_EVENEMENT' }, expect.any(String), 'POST'));
    await waitFor(() => expect(fixture.heritage.documentPlaces).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

it('associer un événement puis un sujet passe par les bonnes routes du document', async () => {
    fixture.allowed = new Set(['HERITAGE_TAG_MANAGE']);
    render(<HeritagePanel documentId="d1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Associer un événement' }));
    let dialog = await screen.findByRole('dialog', { name: 'Associer un événement historique' });
    await waitFor(() => expect(within(dialog).getByRole('option', { name: 'Indépendance' })).toBeTruthy());
    fireEvent.change(within(dialog).getByLabelText(/^Événement/), { target: { value: 'e1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Associer' }));
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledWith('/documents/d1/historical-events/e1', {}, expect.any(String), 'POST'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Associer un sujet' }));
    dialog = await screen.findByRole('dialog', { name: 'Associer un sujet' });
    await waitFor(() => expect(within(dialog).getByRole('option', { name: 'Administration coloniale' })).toBeTruthy());
    fireEvent.change(within(dialog).getByLabelText(/^Sujet/), { target: { value: 's1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Associer' }));
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledWith('/documents/d1/subjects/s1', {}, expect.any(String), 'POST'));
});

it('ajouter un texte envoie la langue, le type, le contenu tel quel et l’indication d’original', async () => {
    fixture.allowed = new Set(['HERITAGE_TAG_MANAGE']);
    render(<HeritagePanel documentId="d1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ajouter un texte' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ajouter un texte multilingue' });
    fireEvent.change(within(dialog).getByLabelText(/^Langue/), { target: { value: ' en ' } });
    fireEvent.change(within(dialog).getByLabelText(/^Type/), { target: { value: 'TRADUCTION' } });
    fireEvent.change(within(dialog).getByLabelText(/^Original/), { target: { value: 'oui' } });
    fireEvent.change(within(dialog).getByLabelText(/^Contenu/), { target: { value: '  Registre\nde 1953 ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ajouter' }));
    await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalledWith('/documents/d1/texts', { langue: 'en', typeTexte: 'TRADUCTION', contenu: '  Registre\nde 1953 ', estOriginal: true }, expect.any(String), 'POST'));
    await waitFor(() => expect(fixture.heritage.documentTexts).toHaveBeenCalledTimes(2));
});

it('un refus du serveur à l’association est dit dans la fenêtre, qui reste ouverte', async () => {
    fixture.allowed = new Set(['HERITAGE_TAG_MANAGE']);
    fixture.heritage.command.mockRejectedValue(new Error('Lieu déjà associé à ce document'));
    render(<HeritagePanel documentId="d1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Associer un lieu' }));
    const dialog = await screen.findByRole('dialog', { name: 'Associer un lieu' });
    await waitFor(() => expect(within(dialog).getByRole('option', { name: 'Conakry' })).toBeTruthy());
    fireEvent.change(within(dialog).getByLabelText(/^Lieu/), { target: { value: 'p1' } });
    fireEvent.change(within(dialog).getByLabelText(/^Rôle/), { target: { value: 'LIEU_PRODUCTION' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Associer' }));
    expect(await within(dialog).findByText('Lieu déjà associé à ce document')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Associer un lieu' })).toBeTruthy();
    expect(fixture.heritage.documentPlaces).toHaveBeenCalledTimes(1);
});
