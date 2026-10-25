import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// Retrouver une archive physique : on tape ce que l'on sait, la recherche part après une courte pause, un filtre s'applique tout de suite, et chaque résultat dit où aller et ce qui cloche.
const fixture = vi.hoisted(() => ({ epoch: 1, physicalArchives: { findArchives: vi.fn(), archive: vi.fn() } }));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/ui/Origin', () => ({
    OriginFields: ({ onChange }: { onChange: (i: string, d: string) => void }) => <button type="button" onClick={() => onChange('inst-1', '')}>Choisir l’institution productrice</button>,
    OriginText: ({ institutionId }: { institutionId?: string | null }) => <span>{institutionId ? 'Institution ' + institutionId : '—'}</span>
}));
import { PhysicalArchiveFinder } from '../../src/ui/PhysicalArchiveFinder';

const place = { unitId: 'u1', cote: 'BOITE-14', typeUnite: 'BOITE', localisation: ['Archives nationales', 'Bâtiment Kaloum', 'Salle 3', 'Rayonnage B'], actif: true };
const found = (over: Record<string, unknown> = {}) => ({ id: 'a1', cote: 'DP-2015-001', intitule: 'Dossier personnel Camara', description: null, support: 'Papier', etatPhysique: null,
    dateExtremeDebut: '2015-01-01', dateExtremeFin: '2015-12-31', quantite: null, uniteQuantite: null, documentId: null, institutionId: 'inst-9', departmentId: null, detruite: false, habituel: place,
    actuel: { source: 'HABITUEL', unite: place, destination: null, sortiLe: null, retourPrevu: null }, ecarts: ['NON_VERIFIEE'], ...over });
const locations = [
    { id: 'l1', parentId: null, typeLocalisation: 'SITE', code: null, libelle: 'Archives nationales', adresse: null, description: null, statut: 'ACTIVE', versionLock: 0 },
    { id: 'l2', parentId: 'l1', typeLocalisation: 'SALLE', code: null, libelle: 'Salle 3', adresse: null, description: null, statut: 'ACTIVE', versionLock: 0 }
];

beforeEach(() => {
    fixture.epoch += 1;
    fixture.physicalArchives.findArchives.mockReset().mockResolvedValue({ items: [found(), found({ id: 'a2', cote: 'MT-2019-044', intitule: null, support: null, dateExtremeFin: null, institutionId: null,
        actuel: { source: 'EN_SORTIE', unite: null, destination: null, sortiLe: '2026-10-03T08:00:00Z', retourPrevu: '2026-10-10T08:00:00Z' }, ecarts: [] })], page: 0, size: 20, hasMore: false });
});
afterEach(() => cleanup());

const lastCall = () => fixture.physicalArchives.findArchives.mock.calls.at(-1) as [Record<string, unknown>, number];

it('montre chaque archive avec son chemin complet, son titre, ses dates et ce qui cloche', async () => {
    render(<PhysicalArchiveFinder locations={locations} onOpen={() => {}} />);
    expect(await screen.findByText('DP-2015-001')).toBeTruthy();
    const row = screen.getByText('DP-2015-001').closest('tr') as HTMLElement;
    expect(within(row).getByText('Dossier personnel Camara')).toBeTruthy();
    expect(within(row).getByText(/Archives nationales › Bâtiment Kaloum › Salle 3 › Rayonnage B · BOITE-14/)).toBeTruthy();
    expect(within(row).getByText('2015')).toBeTruthy();
    const out = screen.getByText('MT-2019-044').closest('tr') as HTMLElement;
    expect(within(out).getByText('Sans intitulé')).toBeTruthy();
    expect(within(out).getByText('Sortie de réserve')).toBeTruthy();
    expect(within(out).getByText(/retour prévu le/)).toBeTruthy();
    expect(within(row).queryByText('Sortie de réserve')).toBeNull();
});

it('lance la recherche après une pause dans la saisie, pas à chaque touche', async () => {
    render(<PhysicalArchiveFinder locations={locations} onOpen={() => {}} />);
    await screen.findByText('DP-2015-001');
    const before = fixture.physicalArchives.findArchives.mock.calls.length;
    const input = screen.getByPlaceholderText(/Cote, titre, lieu/);
    fireEvent.change(input, { target: { value: 'cam' } });
    fireEvent.change(input, { target: { value: 'camara' } });
    expect(fixture.physicalArchives.findArchives.mock.calls.length).toBe(before);
    await waitFor(() => expect(lastCall()[0].q).toBe('camara'), { timeout: 3000 });
    expect(fixture.physicalArchives.findArchives.mock.calls.length).toBe(before + 1);
    expect(lastCall()[1]).toBe(0);
});

it('applique un filtre tout de suite et le garde visible sur le bouton', async () => {
    render(<PhysicalArchiveFinder locations={locations} onOpen={() => {}} />);
    await screen.findByText('DP-2015-001');
    fireEvent.click(screen.getByRole('button', { name: 'Affiner' }));
    fireEvent.change(screen.getByLabelText(/^Lieu/), { target: { value: 'l2' } });
    await waitFor(() => expect(lastCall()[0].locationId).toBe('l2'));
    fireEvent.change(screen.getByLabelText('Sortie de réserve'), { target: { value: 'oui' } });
    await waitFor(() => expect(lastCall()[0].out).toBe('oui'));
    fireEvent.click(screen.getByRole('button', { name: 'Choisir l’institution productrice' }));
    await waitFor(() => expect(lastCall()[0].institutionId).toBe('inst-1'));
    expect(screen.getByRole('button', { name: 'Masquer les filtres' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Masquer les filtres' }));
    expect(screen.getByRole('button', { name: 'Affiner (3)' })).toBeTruthy();
});

it('attend qu’une période inversée soit corrigée avant de chercher', async () => {
    render(<PhysicalArchiveFinder locations={locations} onOpen={() => {}} />);
    await screen.findByText('DP-2015-001');
    fireEvent.click(screen.getByRole('button', { name: 'Affiner' }));
    fireEvent.change(screen.getByLabelText('Dates extrêmes : à partir du'), { target: { value: '2019-01-01' } });
    await waitFor(() => expect(lastCall()[0].from).toBe('2019-01-01'));
    const calls = fixture.physicalArchives.findArchives.mock.calls.length;
    fireEvent.change(screen.getByLabelText(/Dates extrêmes : jusqu’au/), { target: { value: '2018-01-01' } });
    expect(await screen.findByText('La date de fin de la période doit suivre sa date de début.')).toBeTruthy();
    await new Promise(r => setTimeout(r, 50));
    expect(fixture.physicalArchives.findArchives.mock.calls.length).toBe(calls);
    fireEvent.change(screen.getByLabelText(/Dates extrêmes : jusqu’au/), { target: { value: '2019-12-31' } });
    await waitFor(() => expect(lastCall()[0].to).toBe('2019-12-31'));
});

it('ouvre l’archive choisie, tourne les pages et efface tout', async () => {
    fixture.physicalArchives.findArchives.mockResolvedValue({ items: [found()], page: 0, size: 20, hasMore: true });
    const onOpen = vi.fn();
    render(<PhysicalArchiveFinder locations={locations} onOpen={onOpen} />);
    fireEvent.click(await screen.findByRole('button', { name: 'DP-2015-001' }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1', cote: 'DP-2015-001' }));
    fireEvent.click(screen.getByRole('button', { name: 'Suivante' }));
    await waitFor(() => expect(lastCall()[1]).toBe(1));
    fireEvent.change(screen.getByPlaceholderText(/Cote, titre, lieu/), { target: { value: 'camara' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Tout effacer' }));
    await waitFor(() => expect(lastCall()[0]).toMatchObject({ q: '', locationId: '' }));
    expect(lastCall()[1]).toBe(0);
    expect((screen.getByPlaceholderText(/Cote, titre, lieu/) as HTMLInputElement).value).toBe('');
});

it('dit comment élargir quand rien n’est trouvé, et signale une erreur du serveur', async () => {
    fixture.physicalArchives.findArchives.mockResolvedValue({ items: [], page: 0, size: 20, hasMore: false });
    render(<PhysicalArchiveFinder locations={locations} onOpen={() => {}} />);
    expect(await screen.findByText('Aucune archive physique n’est encore enregistrée.')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/Cote, titre, lieu/), { target: { value: 'introuvable' } });
    expect(await screen.findByText(/Essayez avec moins de mots/, undefined, { timeout: 3000 })).toBeTruthy();
    fixture.physicalArchives.findArchives.mockRejectedValue(new Error('boom'));
    fireEvent.change(screen.getByPlaceholderText(/Cote, titre, lieu/), { target: { value: 'autre' } });
    expect(await screen.findByRole('alert', undefined, { timeout: 3000 })).toBeTruthy();
});

it('n’a aucune violation d’accessibilité, filtres ouverts', async () => {
    const { container } = render(<PhysicalArchiveFinder locations={locations} onOpen={() => {}} />);
    await screen.findByText('DP-2015-001');
    fireEvent.click(screen.getByRole('button', { name: 'Affiner' }));
    const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations.map(v => v.id + ': ' + v.nodes.map(n => n.html).join(' | '))).toEqual([]);
});

it('le code d’une étiquette lue par une douchette ouvre l’archive sans lancer de recherche', async () => {
    const id = '8b1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
    fixture.physicalArchives.archive.mockResolvedValue({ id, uniteStockageId: 'u9', cote: 'DP-2015-001' });
    const onOpen = vi.fn();
    render(<PhysicalArchiveFinder locations={locations} onOpen={onOpen} />);
    await screen.findByText('DP-2015-001');
    const searches = fixture.physicalArchives.findArchives.mock.calls.length;
    const input = screen.getByPlaceholderText(/Cote, titre, lieu/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'SNAE:A:' + id.toUpperCase() } });
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith({ id, habituel: { unitId: 'u9' } }));
    expect(fixture.physicalArchives.archive).toHaveBeenCalledWith(id);
    await waitFor(() => expect(input.value).toBe(''));
    expect(lastCall()[0].q).not.toContain('SNAE');
    expect(fixture.physicalArchives.findArchives.mock.calls.length).toBeLessThanOrEqual(searches + 1);
});

it('un code d’archive inconnu du serveur est dit et n’ouvre rien', async () => {
    fixture.physicalArchives.archive.mockRejectedValue(new Error('Archive physique introuvable.'));
    const onOpen = vi.fn();
    render(<PhysicalArchiveFinder locations={locations} onOpen={onOpen} />);
    await screen.findByText('DP-2015-001');
    const input = screen.getByPlaceholderText(/Cote, titre, lieu/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'SNAE:A:8B1F2C3D-4E5F-4A6B-8C7D-9E0F1A2B3C4D' } });
    fireEvent.submit(input.closest('form')!);
    expect(await screen.findByText('Archive physique introuvable.')).toBeTruthy();
    expect(onOpen).not.toHaveBeenCalled();
});
