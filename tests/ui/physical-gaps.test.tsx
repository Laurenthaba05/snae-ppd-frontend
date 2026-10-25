import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// Les écarts d'emplacement des archives physiques : les plus graves d'abord, filtrés par écart ou par cote, par pages, et une fiche s'ouvre sur le constat de présence.
const fixture = vi.hoisted(() => ({ epoch: 1, physicalArchives: { placementGaps: vi.fn() } }));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/ui/HeritagePlacement', () => ({
    ArchivePlacementDialog: ({ archiveId, onClose, onChanged }: { archiveId: string; onClose: () => void; onChanged: () => void }) =>
        <div role="dialog" aria-label="Emplacement de l’archive"><span>Fiche de {archiveId}</span><button type="button" onClick={onChanged}>Constat enregistré</button><button type="button" onClick={onClose}>Fermer</button></div>
}));
import { PhysicalGapsSection } from '../../src/ui/PhysicalGaps';

const place = { unitId: 'u1', cote: 'BOITE-14', typeUnite: 'BOITE', localisation: ['Archives nationales', 'Salle 3'], actif: true };
const row = (over: Record<string, unknown> = {}) => ({ archiveId: 'a1', cote: 'DP-2015-001', support: 'PAPIER', etatPhysique: null, habituel: place,
    actuel: { source: 'HABITUEL', unite: place, destination: null, sortiLe: null, retourPrevu: null }, ecarts: ['NON_VERIFIEE'], verifieLe: null, ...over });

beforeEach(() => {
    fixture.epoch += 1;
    fixture.physicalArchives.placementGaps.mockReset().mockResolvedValue({ page: 0, size: 20, total: 2, hasMore: false, items: [
        row({ archiveId: 'a2', cote: 'MT-2019-044', ecarts: ['INTROUVABLE'], actuel: { source: 'INTROUVABLE', unite: null, destination: null, sortiLe: null, retourPrevu: null }, verifieLe: '2026-09-01T08:00:00Z' }),
        row()] });
});
afterEach(() => cleanup());

const lastCall = () => fixture.physicalArchives.placementGaps.mock.calls.at(-1) as [Record<string, unknown>];

it('liste les écarts avec le lieu, l’état actuel, les écarts et le dernier constat', async () => {
    render(<PhysicalGapsSection />);
    expect(await screen.findByText('MT-2019-044')).toBeTruthy();
    expect(lastCall()[0]).toMatchObject({ ecart: '', q: '', page: 0, size: 20 });
    expect(screen.getByRole('status').textContent).toBe('2 archives à régulariser');
    const lost = screen.getByText('MT-2019-044').closest('tr') as HTMLElement;
    expect(within(lost).getByText('Archives nationales › Salle 3 · BOITE-14')).toBeTruthy();
    expect(within(lost).getByText('Introuvable', { selector: '.badge' })).toBeTruthy();
    expect(within(lost).getByText(/1 septembre 2026/)).toBeTruthy();
    const never = screen.getByText('DP-2015-001').closest('tr') as HTMLElement;
    expect(within(never).getByText('Jamais')).toBeTruthy();
    expect(within(never).getByText('Présence non vérifiée', { selector: '.badge' })).toBeTruthy();
});

it('filtre par écart tout de suite et par cote à l’envoi, et revient à la première page', async () => {
    fixture.physicalArchives.placementGaps.mockResolvedValue({ page: 0, size: 20, total: 40, hasMore: true, items: [row()] });
    render(<PhysicalGapsSection />);
    await screen.findByText('DP-2015-001');
    fireEvent.click(screen.getByRole('button', { name: 'Suivante' }));
    await waitFor(() => expect(lastCall()[0]).toMatchObject({ page: 1 }));
    fireEvent.change(screen.getByLabelText('Écart'), { target: { value: 'INTROUVABLE' } });
    await waitFor(() => expect(lastCall()[0]).toMatchObject({ ecart: 'INTROUVABLE', page: 0 }));
    fireEvent.change(screen.getByLabelText('Cote'), { target: { value: 'DP-2015' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }));
    await waitFor(() => expect(lastCall()[0]).toMatchObject({ ecart: 'INTROUVABLE', q: 'DP-2015', page: 0 }));
});

it('ouvre la fiche d’une archive et relit la liste quand un constat est enregistré', async () => {
    render(<PhysicalGapsSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'DP-2015-001' }));
    const dialog = await screen.findByRole('dialog', { name: 'Emplacement de l’archive' });
    expect(within(dialog).getByText('Fiche de a1')).toBeTruthy();
    const calls = fixture.physicalArchives.placementGaps.mock.calls.length;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Constat enregistré' }));
    await waitFor(() => expect(fixture.physicalArchives.placementGaps.mock.calls.length).toBe(calls + 1));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fermer' }));
    expect(screen.queryByRole('dialog')).toBeNull();
});

it('dit quand tout est en ordre, quand rien ne correspond, et quand le serveur échoue', async () => {
    fixture.physicalArchives.placementGaps.mockResolvedValue({ page: 0, size: 20, total: 0, hasMore: false, items: [] });
    render(<PhysicalGapsSection />);
    expect(await screen.findByText('Toutes les archives sont à leur place connue et vérifiée.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Écart'), { target: { value: 'INTROUVABLE' } });
    expect(await screen.findByText('Aucune archive ne correspond à ces critères.')).toBeTruthy();
    fixture.physicalArchives.placementGaps.mockRejectedValue(new Error('Écarts indisponibles'));
    fireEvent.change(screen.getByLabelText('Écart'), { target: { value: '' } });
    expect(await screen.findByText('Écarts indisponibles')).toBeTruthy();
});

it('n’a aucune violation d’accessibilité', async () => {
    const { container } = render(<PhysicalGapsSection />);
    await screen.findByText('MT-2019-044');
    const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations.map(v => v.id + ': ' + v.nodes.map(n => n.html).join(' | '))).toEqual([]);
});
