import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { ArchivePlacement, AssetLocation, HeritageAsset, HeritagePlacementPage, Localisation, PlacementEvent, StoragePlace, StorageUnit } from '../../src/core/types';
const fixture = vi.hoisted(() => ({
    epoch: 1, me: null as unknown, allowed: new Set<string>(['HERITAGE_READ', 'PHYSICALARCHIVES_READ', 'PHYSICALARCHIVES_MANAGE', 'PHYSICALARCHIVES_VERIFY']),
    heritage: { assetLocation: vi.fn(), placements: vi.fn() },
    physicalArchives: { placement: vi.fn(), placementHistory: vi.fn(), storageUnits: vi.fn(), locations: vi.fn(), command: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
import { ArchivePlacementDialog, PlacementTab, PlacementsPanel } from '../../src/ui/HeritagePlacement';

const ID = '00000000-0000-4000-8000-0000000000';
const place = (n: number, extra: Partial<StoragePlace> = {}): StoragePlace => ({ unitId: ID + '1' + n, cote: 'R-' + n, typeUnite: 'RAYONNAGE', localisation: ['Magasin 1'], actif: true, ...extra });
const placement = (extra: Partial<ArchivePlacement> = {}): ArchivePlacement => ({ archiveId: ID + '0a', cote: 'ARCH-001', support: 'Papier', etatPhysique: null, habituel: place(1),
    actuel: { source: 'HABITUEL', unite: place(1), destination: null, sortiLe: null, retourPrevu: null },
    derniereVerification: { id: ID + 'c1', resultat: 'PRESENTE', verifieLe: '2026-09-20T10:00:00Z', verifieParId: ID + 'u1', verifiePar: 'Awa Camara', uniteAttendue: place(1), uniteConstatee: place(1), note: null, valide: true },
    ageVerificationJours: 14, ecarts: [], seuilVerificationJours: 365, ...extra });
const asset = (extra: Partial<HeritageAsset> = {}) => ({ id: ID + 'b1', version: 4, champs: { natureOriginale: 'PHYSIQUE' }, ...extra }) as unknown as HeritageAsset;
const location = (originaux: AssetLocation['originaux'], visible = true): AssetLocation => ({ emplacementVisible: visible, originaux });
const original = (p: ArchivePlacement | null, cote = 'ARCH-001') => ({ archivePhysiqueId: ID + '0a', cote, libelle: 'Registre des naissances', emplacement: p });
const units: StorageUnit[] = [1, 2, 3].map(n => ({ id: ID + '1' + n, localisationId: ID + 'l1', typeUnite: 'RAYONNAGE', cote: 'R-' + n, capacite: null, conditionsConservation: null, statut: 'ACTIVE', versionLock: 0 }));
const locations: Localisation[] = [{ id: ID + 'l1', parentId: null, typeLocalisation: 'MAGASIN', code: null, libelle: 'Magasin 1', adresse: null, description: null, statut: 'ACTIVE', versionLock: 0 }];

beforeEach(() => {
    fixture.allowed = new Set(['HERITAGE_READ', 'PHYSICALARCHIVES_READ', 'PHYSICALARCHIVES_MANAGE', 'PHYSICALARCHIVES_VERIFY']);
    fixture.heritage.assetLocation.mockReset().mockResolvedValue(location([original(placement())]));
    fixture.heritage.placements.mockReset();
    fixture.physicalArchives.placement.mockReset().mockResolvedValue(placement());
    fixture.physicalArchives.placementHistory.mockReset().mockResolvedValue([]);
    fixture.physicalArchives.storageUnits.mockReset().mockResolvedValue(units);
    fixture.physicalArchives.locations.mockReset().mockResolvedValue(locations);
    fixture.physicalArchives.command.mockReset().mockResolvedValue(placement());
});

const top = () => { const all = screen.getAllByRole('dialog'); return all[all.length - 1]!; };

it('l’onglet montre l’emplacement habituel, l’emplacement actuel et la dernière présence vérifiée de chaque original', async () => {
    render(<PlacementTab asset={asset()} onChanged={vi.fn()} />);
    const card = await screen.findByRole('region', { name: 'Emplacement de ARCH-001' });
    expect(within(card).getByText('ARCH-001 — Registre des naissances')).toBeTruthy();
    expect(within(card).getByText('Emplacement habituel')).toBeTruthy();
    expect(within(card).getAllByText(/Magasin 1 · R-1/).length).toBeGreaterThan(0);
    expect(within(card).getByText('À son emplacement habituel', { selector: 'dd' })).toBeTruthy();
    expect(within(card).getByText(/Présente le 20 septembre 2026 \(il y a 14 jours\) par Awa Camara/)).toBeTruthy();
    expect(within(card).getByText('À son emplacement habituel, présence vérifiée il y a 14 jours.')).toBeTruthy();
    expect(within(card).getByText('Sans écart')).toBeTruthy();
});

it('une sortie demandée ou en cours se signale en tête de l’original, même sans le droit de lire l’emplacement', async () => {
    const mouvement = { id: ID + 'm1', numero: 'MVT-2026-000001', statut: 'RECUE' as const, objet: 'CONSULTATION' as const, destination: 'Salle de lecture', retourPrevu: '2026-10-01', enRetard: true };
    fixture.heritage.assetLocation.mockResolvedValue(location([{ ...original(null), mouvement }], false));
    render(<PlacementTab asset={asset()} onChanged={vi.fn()} />);
    const note = await screen.findByText(/sortie MVT-2026-000001/);
    expect(note.textContent).toMatch(/ARCH-001 : sortie MVT-2026-000001 — reçue, retour prévu le 1 octobre 2026 \(en retard\)\. Voir l’onglet « Mouvements »\./);
    expect(screen.getByText('Emplacement non visible avec vos habilitations.')).toBeTruthy();
});

it('un écart est nommé avec ce qu’il demande de faire, et un constat périmé le dit', async () => {
    fixture.heritage.assetLocation.mockResolvedValue(location([original(placement({ ecarts: ['NON_VERIFIEE'], derniereVerification: { ...placement().derniereVerification!, valide: false } }))]));
    render(<PlacementTab asset={asset()} onChanged={vi.fn()} />);
    const card = await screen.findByRole('region', { name: 'Emplacement de ARCH-001' });
    expect(within(card).getAllByText('Présence non vérifiée').length).toBeGreaterThan(0);
    expect(within(card).getByText(/Aller voir l’archive et constater sa présence/)).toBeTruthy();
    expect(within(card).getByText(/ne vaut plus : l’archive a été déplacée depuis/)).toBeTruthy();
});

it('sans le droit de lire les archives physiques, l’emplacement reste masqué', async () => {
    fixture.heritage.assetLocation.mockResolvedValue(location([original(null)], false));
    render(<PlacementTab asset={asset()} onChanged={vi.fn()} />);
    expect(await screen.findByText(/information sensible/)).toBeTruthy();
    expect(screen.getByText('Emplacement non visible avec vos habilitations.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Vérifier la présence' })).toBeNull();
});

it('un bien sans original est dit sans original, et un bien numérique natif n’a rien à localiser', async () => {
    fixture.heritage.assetLocation.mockResolvedValue(location([]));
    const { unmount } = render(<PlacementTab asset={asset()} onChanged={vi.fn()} />);
    expect(await screen.findByText('Aucun original relié')).toBeTruthy();
    unmount();
    render(<PlacementTab asset={asset({ champs: { natureOriginale: 'NUMERIQUE_NATIF' } })} onChanged={vi.fn()} />);
    expect(await screen.findByText('Bien numérique natif')).toBeTruthy();
});

it('les boutons suivent les habilitations : vérifier exige sa propre permission, ranger celle de gestion', async () => {
    fixture.allowed = new Set(['HERITAGE_READ', 'PHYSICALARCHIVES_READ', 'PHYSICALARCHIVES_MANAGE']);
    const { unmount } = render(<PlacementTab asset={asset()} onChanged={vi.fn()} />);
    await screen.findByRole('region', { name: 'Emplacement de ARCH-001' });
    expect(screen.queryByRole('button', { name: 'Vérifier la présence' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Changer l’emplacement habituel' })).toBeTruthy();
    unmount();
    fixture.allowed = new Set(['HERITAGE_READ', 'PHYSICALARCHIVES_READ', 'PHYSICALARCHIVES_VERIFY']);
    render(<PlacementTab asset={asset()} onChanged={vi.fn()} />);
    await screen.findByRole('region', { name: 'Emplacement de ARCH-001' });
    expect(screen.getByRole('button', { name: 'Vérifier la présence' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Changer l’emplacement habituel' })).toBeNull();
});

it('une archive sortie ne se vérifie pas et ne se range pas : les boutons sont grisés et disent pourquoi', async () => {
    fixture.heritage.assetLocation.mockResolvedValue(location([original(placement({ actuel: { source: 'EN_SORTIE', unite: null, destination: null, sortiLe: '2026-10-01T10:00:00Z', retourPrevu: '2026-10-02T10:00:00Z' }, ecarts: ['SORTIE_EN_RETARD'] }))]));
    render(<PlacementTab asset={asset()} onChanged={vi.fn()} />);
    const verify = await screen.findByRole('button', { name: 'Vérifier la présence' }) as HTMLButtonElement;
    expect(verify.disabled).toBe(true);
    expect(verify.title).toMatch(/enregistrez son retour/);
    expect((screen.getByRole('button', { name: 'Changer l’emplacement habituel' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText('Sortie en retard').length).toBeGreaterThan(0);
    expect(screen.getByText('Sortie de réserve, retour prévu le 2 octobre 2026.')).toBeTruthy();
});

it('un constat « présente » part avec une clé stable puis recharge l’onglet et le bien', async () => {
    const onChanged = vi.fn();
    render(<PlacementTab asset={asset()} onChanged={onChanged} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Vérifier la présence' }));
    const dialog = top();
    const confirm = within(dialog).getByRole('button', { name: 'Enregistrer le constat' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(within(dialog).getByRole('radio', { name: /Présente à son emplacement habituel/ }));
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(fixture.physicalArchives.command).toHaveBeenCalledTimes(1));
    const [path, body, key, method] = fixture.physicalArchives.command.mock.calls[0]!;
    expect(path).toBe('/archives/' + ID + '0a/verifications');
    expect(body).toEqual({ resultat: 'PRESENTE' });
    expect(typeof key).toBe('string'); expect(method).toBe('POST');
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    await waitFor(() => expect(fixture.heritage.assetLocation).toHaveBeenCalledTimes(2));
});

it('« trouvée ailleurs » exige un autre emplacement que l’habituel', async () => {
    render(<PlacementTab asset={asset()} onChanged={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Vérifier la présence' }));
    const dialog = top();
    fireEvent.click(within(dialog).getByRole('radio', { name: /Trouvée à un autre emplacement/ }));
    const select = await within(dialog).findByLabelText(/Emplacement où elle a été trouvée/) as HTMLSelectElement;
    // L'emplacement habituel n'est pas proposé.
    await waitFor(() => expect([...select.options].map(o => o.textContent)).toEqual(['Choisir…', 'Magasin 1 · R-2', 'Magasin 1 · R-3']));
    const confirm = within(dialog).getByRole('button', { name: 'Enregistrer le constat' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(within(dialog).getByText(/où l’archive a été trouvée/)).toBeTruthy();
    fireEvent.change(select, { target: { value: ID + '12' } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(fixture.physicalArchives.command).toHaveBeenCalledTimes(1));
    expect(fixture.physicalArchives.command.mock.calls[0]![1]).toEqual({ resultat: 'AUTRE_EMPLACEMENT', uniteConstateeId: ID + '12' });
});

it('« introuvable » exige une note qui dit où l’archive a été cherchée', async () => {
    render(<PlacementTab asset={asset()} onChanged={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Vérifier la présence' }));
    const dialog = top();
    fireEvent.click(within(dialog).getByRole('radio', { name: /Introuvable/ }));
    const confirm = within(dialog).getByRole('button', { name: 'Enregistrer le constat' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(within(dialog).getByText(/engage/, { selector: 'span' })).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText(/Où elle a été cherchée/), { target: { value: 'court' } });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/Où elle a été cherchée/), { target: { value: 'Cherchée sur toute la travée et en salle de tri' } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(fixture.physicalArchives.command).toHaveBeenCalledTimes(1));
    expect(fixture.physicalArchives.command.mock.calls[0]![1]).toEqual({ resultat: 'ABSENTE', note: 'Cherchée sur toute la travée et en salle de tri' });
});

it('trouvée ailleurs : le rangement propose cet emplacement, exige un motif et, avec le droit de vérifier, constate la présence', async () => {
    const found = placement({ actuel: { source: 'CONSTATE_AILLEURS', unite: place(2), destination: null, sortiLe: null, retourPrevu: null }, ecarts: ['AUTRE_EMPLACEMENT'],
        derniereVerification: { ...placement().derniereVerification!, resultat: 'AUTRE_EMPLACEMENT', uniteConstatee: place(2) } });
    fixture.heritage.assetLocation.mockResolvedValue(location([original(found)]));
    render(<PlacementTab asset={asset()} onChanged={vi.fn()} />);
    expect(await screen.findByText(/La ranger à son emplacement habituel puis constater sa présence/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Changer l’emplacement habituel' }));
    const dialog = top();
    const select = await within(dialog).findByLabelText(/Nouvel emplacement habituel/) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe(ID + '12'));
    const confirm = within(dialog).getByRole('button', { name: 'Changer l’emplacement' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect((within(dialog).getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/Motif/), { target: { value: 'Régularisation du constat du récolement' } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(fixture.physicalArchives.command).toHaveBeenCalledTimes(1));
    const [path, body, , method] = fixture.physicalArchives.command.mock.calls[0]!;
    expect(path).toBe('/archives/' + ID + '0a/relocate');
    expect(body).toEqual({ uniteStockageId: ID + '12', motif: 'Régularisation du constat du récolement', constaterPresence: true });
    expect(method).toBe('POST');
});

it('sans le droit de vérifier, le rangement ne propose pas de constater la présence', async () => {
    fixture.allowed = new Set(['HERITAGE_READ', 'PHYSICALARCHIVES_READ', 'PHYSICALARCHIVES_MANAGE']);
    render(<PlacementTab asset={asset()} onChanged={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Changer l’emplacement habituel' }));
    const dialog = top();
    expect(within(dialog).queryByRole('checkbox')).toBeNull();
    fireEvent.change(await within(dialog).findByLabelText(/Nouvel emplacement habituel/), { target: { value: ID + '13' } });
    fireEvent.change(within(dialog).getByLabelText(/Motif/), { target: { value: 'Réorganisation du magasin' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Changer l’emplacement' }));
    await waitFor(() => expect(fixture.physicalArchives.command).toHaveBeenCalledTimes(1));
    expect(fixture.physicalArchives.command.mock.calls[0]![1]).toEqual({ uniteStockageId: ID + '13', motif: 'Réorganisation du magasin', constaterPresence: false });
});

it('l’historique nomme les constats, les rangements et les retours, le plus récent en premier', async () => {
    const events: PlacementEvent[] = [
        { id: 'V:1', genre: 'VERIFICATION', at: '2026-10-03T10:00:00Z', parId: ID + 'u1', par: 'Awa Camara', de: place(1), vers: place(1), resultat: 'PRESENTE', texte: null, retourPrevu: null },
        { id: 'S:1', genre: 'RANGEMENT', at: '2026-10-02T10:00:00Z', parId: ID + 'u1', par: null, de: place(2), vers: place(1), resultat: null, texte: 'Réorganisation du magasin', retourPrevu: null },
        { id: 'V:0', genre: 'VERIFICATION', at: '2026-10-01T10:00:00Z', parId: ID + 'u1', par: null, de: place(2), vers: place(3), resultat: 'AUTRE_EMPLACEMENT', texte: 'Trouvée sur le chariot', retourPrevu: null }];
    fixture.physicalArchives.placementHistory.mockResolvedValue(events);
    render(<PlacementTab asset={asset()} onChanged={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Historique des constats et mouvements' }));
    await screen.findByText(/De Magasin 1 · R-2 vers Magasin 1 · R-1/);
    const items = [...document.querySelectorAll('.placement-history > li')].map(li => li.textContent ?? '');
    expect(items).toHaveLength(3);
    expect(items[0]).toMatch(/Constat de présence.*Présente.*par Awa Camara/);
    expect(items[1]).toMatch(/Rangement.*Motif : Réorganisation du magasin/);
    expect(items[2]).toMatch(/Trouvée ailleurs : Magasin 1 · R-3.*Note : Trouvée sur le chariot/);
    expect(screen.getByRole('button', { name: 'Masquer l’historique' })).toBeTruthy();
});

const row = (n: number, extra: Partial<HeritagePlacementPage['items'][number]['emplacement']> = {}, bien: HeritagePlacementPage['items'][number]['bien'] = null) => ({
    emplacement: { archiveId: ID + '0' + n, cote: 'ARCH-00' + n, support: 'Papier', etatPhysique: null, habituel: place(1), actuel: { source: 'HABITUEL' as const, unite: place(1), destination: null, sortiLe: null, retourPrevu: null },
        ecarts: ['NON_VERIFIEE' as const], verifieLe: null, ...extra }, bien });
const page = (items: HeritagePlacementPage['items'], total = items.length): HeritagePlacementPage => ({ items, page: 0, size: 20, total, hasMore: false });

it('la liste des écarts montre le bien rattaché, l’emplacement, l’écart et le dernier constat, et filtre par écart', async () => {
    fixture.heritage.placements.mockResolvedValue(page([
        row(1, { ecarts: ['INTROUVABLE'], actuel: { source: 'INTROUVABLE', unite: null, destination: null, sortiLe: null, retourPrevu: null }, verifieLe: '2026-10-02T10:00:00Z' }, { id: ID + 'b1', identifiant: 'PAT-000001', intitule: 'Registre des naissances' }),
        row(2)], 2));
    render(<PlacementsPanel />);
    expect(await screen.findByRole('button', { name: 'ARCH-001' })).toBeTruthy();
    expect(screen.getByText('PAT-000001')).toBeTruthy();
    expect(screen.getByText('Registre des naissances')).toBeTruthy();
    const table = within(screen.getByRole('table'));
    expect(table.getByText('Introuvable', { selector: '.badge' })).toBeTruthy();
    expect(table.getByText('Présence non vérifiée', { selector: '.badge' })).toBeTruthy();
    expect(table.getByText('2 octobre 2026')).toBeTruthy();
    expect(table.getByText('Jamais')).toBeTruthy();
    expect(screen.getByText('2 archives à régulariser')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Écart'), { target: { value: 'INTROUVABLE' } });
    await waitFor(() => expect(fixture.heritage.placements).toHaveBeenLastCalledWith(expect.objectContaining({ ecart: 'INTROUVABLE', page: 0 }), expect.anything()));
});

it('sans écart, la liste le dit ; une recherche vide le dit autrement', async () => {
    fixture.heritage.placements.mockResolvedValue(page([]));
    render(<PlacementsPanel />);
    expect(await screen.findByText('Aucun écart')).toBeTruthy();
    expect(screen.getByText(/Toutes les archives sont à leur place connue et vérifiée/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Écart'), { target: { value: 'AUTRE_EMPLACEMENT' } });
    expect(await screen.findByText(/Aucune archive ne correspond à ces critères/)).toBeTruthy();
});

it('ouvrir une archive de la liste montre son emplacement et permet de vérifier sa présence', async () => {
    fixture.heritage.placements.mockResolvedValue(page([row(1)]));
    fixture.physicalArchives.placement.mockResolvedValue(placement({ ecarts: ['NON_VERIFIEE'], derniereVerification: null, ageVerificationJours: null }));
    render(<PlacementsPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'ARCH-001' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/Présumée à son emplacement habituel : sa présence n’a jamais été vérifiée/)).toBeTruthy();
    expect(within(dialog).getByText('Jamais vérifiée')).toBeTruthy();
    expect(fixture.physicalArchives.placement).toHaveBeenCalledWith(ID + '01', expect.anything());
    expect(within(dialog).getByRole('button', { name: 'Vérifier la présence' })).toBeTruthy();
});

it('la fenêtre d’une archive affiche l’erreur de lecture avec la possibilité de réessayer', async () => {
    fixture.physicalArchives.placement.mockRejectedValueOnce(new Error('Archive physique introuvable.'));
    render(<ArchivePlacementDialog archiveId={ID + '0a'} onClose={vi.fn()} onChanged={vi.fn()} />);
    expect(await screen.findByText('Archive physique introuvable.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer la lecture' }));
    expect(await screen.findByText(/À son emplacement habituel, présence vérifiée/)).toBeTruthy();
});
