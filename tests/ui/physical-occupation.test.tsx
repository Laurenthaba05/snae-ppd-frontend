import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// Le métrage linéaire et le remplissage par lieu ou par institution : on descend de la racine vers un sous-lieu, et ce que le métrage ne dit pas est dit.
const fixture = vi.hoisted(() => ({ epoch: 1, physicalArchives: { occupation: vi.fn() } }));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
import { PhysicalOccupationSection } from '../../src/ui/PhysicalOccupation';

const row = (over: Record<string, unknown> = {}) => ({ key: 'site', self: false, label: 'Site nord', type: 'SITE', institutionId: 'i1', hasChildren: true, units: 3, archives: 5,
    metrageLineaire: '11.5', sansMetrage: 2, capaciteLineaire: '30', unitesMesurees: 2, rempliMesure: '10.5', taux: 0.35, unitesAutreCapacite: 1, ...over });
const total = (over: Record<string, unknown> = {}) => row({ key: null, label: 'Total', type: null, institutionId: null, hasChildren: false, ...over });
const roots = { by: 'location', parentId: null, trail: [], rows: [row()], total: total(), truncated: false };
const opened = { by: 'location', parentId: 'site', trail: [{ id: 'site', label: 'Site nord' }], truncated: false,
    rows: [
        row({ key: 'own', self: true, label: 'Directement dans ce lieu', hasChildren: false, units: 1, archives: 1, metrageLineaire: '1', sansMetrage: 0, capaciteLineaire: '0', unitesMesurees: 0, rempliMesure: '0', taux: null, unitesAutreCapacite: 1 }),
        row({ key: 'b2', label: 'Bâtiment 2', hasChildren: false, units: 1, archives: 2, metrageLineaire: '19', sansMetrage: 0, capaciteLineaire: '20', unitesMesurees: 1, rempliMesure: '19', taux: 0.95, unitesAutreCapacite: 0 })],
    total: total({ archives: 3 }) };
const byInstitution = { by: 'institution', parentId: null, trail: [], truncated: false, rows: [
    row({ key: 'i1', label: 'Archives nationales', type: 'INSTITUTION', hasChildren: false, taux: 1.2 }),
    row({ key: null, institutionId: null, label: 'Dépôt national', type: 'DEPOT_NATIONAL', hasChildren: false, units: 0, archives: 0, metrageLineaire: '0', sansMetrage: 0, capaciteLineaire: '0', unitesMesurees: 0, rempliMesure: '0', taux: null, unitesAutreCapacite: 0 })],
    total: total() };

beforeEach(() => {
    fixture.epoch += 1;
    fixture.physicalArchives.occupation.mockReset().mockImplementation(async (by: string, parentId: string | null) => by === 'institution' ? byInstitution : parentId === 'site' ? opened : roots);
});
afterEach(() => cleanup());

it('montre le métrage, le remplissage et ce que le métrage ne dit pas pour chaque lieu racine', async () => {
    render(<PhysicalOccupationSection />);
    const line = (await screen.findByText('Site nord')).closest('tr') as HTMLElement;
    expect(fixture.physicalArchives.occupation).toHaveBeenCalledWith('location', null, expect.anything());
    expect(within(line).getByText('11,5 ml')).toBeTruthy();
    expect(within(line).getByText('30 ml')).toBeTruthy();
    expect(within(line).getByText(/10,5 ml · 35 %/)).toBeTruthy();
    expect(within(line).getByText('2 archives hors métrage (autre unité ou sans quantité)')).toBeTruthy();
    expect(within(line).getByText('1 unité sans capacité en mètres linéaires')).toBeTruthy();
    expect(within(line).queryByText('Presque pleine')).toBeNull();
    expect(screen.getByText('Total')).toBeTruthy();
});

it('ouvre un lieu pour voir ses sous-lieux, puis revient à la racine', async () => {
    render(<PhysicalOccupationSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir Site nord' }));
    expect(await screen.findByText('Bâtiment 2')).toBeTruthy();
    await waitFor(() => expect(fixture.physicalArchives.occupation).toHaveBeenLastCalledWith('location', 'site', expect.anything()));
    const own = screen.getByText('Directement dans ce lieu').closest('tr') as HTMLElement;
    expect(within(own).queryByRole('button', { name: /Ouvrir/ })).toBeNull();
    const building = screen.getByText('Bâtiment 2').closest('tr') as HTMLElement;
    expect(within(building).getByText('Presque pleine', { selector: '.badge' })).toBeTruthy();
    expect(within(building).getByText(/19 ml · 95 %/)).toBeTruthy();
    expect(within(building).queryByRole('button', { name: /Ouvrir/ })).toBeNull();
    expect(screen.getByText('Site nord', { selector: 'strong' }).getAttribute('aria-current')).toBe('location');
    fireEvent.click(screen.getByRole('button', { name: 'Tous les lieux' }));
    await waitFor(() => expect(fixture.physicalArchives.occupation).toHaveBeenLastCalledWith('location', null, expect.anything()));
    expect(await screen.findByRole('button', { name: 'Ouvrir Site nord' })).toBeTruthy();
});

it('regroupe par institution, avec le dépôt national et un badge quand la capacité est dépassée', async () => {
    render(<PhysicalOccupationSection />);
    await screen.findByText('Site nord');
    fireEvent.click(screen.getByRole('button', { name: 'Par institution' }));
    const line = (await screen.findByText('Archives nationales')).closest('tr') as HTMLElement;
    expect(fixture.physicalArchives.occupation).toHaveBeenLastCalledWith('institution', null, expect.anything());
    expect(within(line).getByText('Capacité dépassée', { selector: '.badge' })).toBeTruthy();
    expect(within(line).queryByRole('button', { name: /Ouvrir/ })).toBeNull();
    const national = screen.getByText('Dépôt national').closest('tr') as HTMLElement;
    expect(within(national).getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.queryByRole('navigation', { name: 'Chemin du lieu ouvert' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Par institution' }).getAttribute('aria-pressed')).toBe('true');
});

it('dit quand il n’y a rien à mesurer, quand la liste est tronquée et quand le serveur échoue', async () => {
    fixture.physicalArchives.occupation.mockResolvedValueOnce({ ...roots, rows: [] });
    const { unmount } = render(<PhysicalOccupationSection />);
    expect(await screen.findByText('Rien à mesurer')).toBeTruthy();
    unmount();
    fixture.physicalArchives.occupation.mockResolvedValueOnce({ ...roots, truncated: true });
    const second = render(<PhysicalOccupationSection />);
    expect(await screen.findByText(/200 premières lignes/)).toBeTruthy();
    second.unmount();
    fixture.physicalArchives.occupation.mockRejectedValueOnce(new Error('Panne du serveur'));
    render(<PhysicalOccupationSection />);
    expect(await screen.findByText(/Panne du serveur/)).toBeTruthy();
});

it('n’a pas de violation d’accessibilité', async () => {
    const { container } = render(<PhysicalOccupationSection />);
    await screen.findByText('Site nord');
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.map(v => v.id)).toEqual([]);
});
