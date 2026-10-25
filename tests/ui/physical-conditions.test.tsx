import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// Capacité, relevés et alertes de conservation d'une unité de rangement : la capacité signale sans bloquer, un relevé se consigne sans se corriger, une alerte vient d'un seuil fixé.
const fixture = vi.hoisted(() => ({ epoch: 1, physicalArchives: { command: vi.fn(), readings: vi.fn(), conditionAlerts: vi.fn() } }));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
import { ConditionAlertsSection, OccupationCell, ReadingsCell, ReadingsDialog, UnitSettingsDialog } from '../../src/ui/PhysicalConditions';

const unit = (over: Record<string, unknown> = {}) => ({ id: 'u1', localisationId: 'l1', typeUnite: 'BOITE', cote: 'BOITE-14', capacite: '40.000', uniteCapacite: 'boîtes', conditionsConservation: { temperature: { min: 14, max: 20 }, eclairage: 'faible' },
    statut: 'ACTIVE', versionLock: 5, occupation: { utilise: 12, unite: 'boîtes', taux: 0.3, nonCompte: 0 }, releves: [], ...over }) as never;

beforeEach(() => {
    fixture.epoch += 1;
    fixture.physicalArchives.command.mockReset().mockResolvedValue({});
    fixture.physicalArchives.readings.mockReset().mockResolvedValue({ items: [], page: 0, size: 20, hasMore: false });
    fixture.physicalArchives.conditionAlerts.mockReset().mockResolvedValue({ items: [], page: 0, size: 20, hasMore: false });
});
afterEach(() => cleanup());

it('dit ce qui est rangé par rapport à la capacité, et prévient quand l’unité est pleine ou dépassée', () => {
    render(<table><tbody><tr><td data-testid="a"><OccupationCell unit={unit()} /></td><td data-testid="b"><OccupationCell unit={unit({ occupation: { utilise: 3, unite: 'archives', taux: 1.5, nonCompte: 2 }, capacite: '2', uniteCapacite: null })} /></td>
        <td data-testid="c"><OccupationCell unit={unit({ capacite: null, occupation: { utilise: 7, unite: 'archives', taux: null, nonCompte: 0 } })} /></td></tr></tbody></table>);
    expect(screen.getByTestId('a').textContent).toBe('12 / 40 boîtes (30 %)');
    expect(within(screen.getByTestId('b')).getByText('Capacité dépassée')).toBeTruthy();
    expect(screen.getByTestId('b').textContent).toContain('2 archives sans quantité dans cette unité : non comptées.');
    expect(screen.getByTestId('c').textContent).toBe('7 archives');
});

it('montre le dernier relevé de chaque mesure et signale celui qui sort des seuils', () => {
    const releves = [{ mesure: 'HUMIDITE', valeur: '50.00', releveLe: '2026-10-20T08:00:00Z', etat: 'CONFORME' }, { mesure: 'TEMPERATURE', valeur: '24.50', releveLe: '2026-10-22T08:00:00Z', etat: 'TROP_HAUT' }];
    render(<div data-testid="r"><ReadingsCell unit={unit({ releves })} /></div>);
    expect(screen.getByText(/Température : 24,5 °C/)).toBeTruthy();
    expect(screen.getByText('Trop haut')).toBeTruthy();
    expect(screen.getByText(/Humidité relative : 50 %/)).toBeTruthy();
    expect(screen.queryByText('Dans les seuils')).toBeNull();
    cleanup();
    render(<div data-testid="none"><ReadingsCell unit={unit()} /></div>);
    expect(screen.getByTestId('none').textContent).toBe('—');
});

it('les réglages partent avec la version lue, les seuils saisis et les clés libres conservées', async () => {
    const onSaved = vi.fn(), onClose = vi.fn();
    render(<UnitSettingsDialog unit={unit()} onClose={onClose} onSaved={onSaved} />);
    expect((screen.getByRole('textbox', { name: /^Capacité(?!s+et)/ }) as HTMLInputElement).value).toBe('40');
    expect((screen.getByLabelText('Température maximale (°C)') as HTMLInputElement).value).toBe('20');
    fireEvent.change(screen.getByLabelText('Température maximale (°C)'), { target: { value: '22' } });
    fireEvent.change(screen.getByLabelText('Humidité maximale (%)'), { target: { value: '55' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(fixture.physicalArchives.command).toHaveBeenCalledWith('/storage-units/u1/settings', {
        versionLock: 5, capacite: 40, uniteCapacite: 'boîtes', conditionsConservation: { eclairage: 'faible', temperature: { min: 14, max: 22 }, humidite: { max: 55 } } }, expect.any(String), 'POST'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSaved).toHaveBeenCalled();
});

it('des seuils incohérents bloquent l’enregistrement et sont dits ; un refus du serveur est dit aussi', async () => {
    fixture.physicalArchives.command.mockRejectedValue(new Error('Cette unité a été modifiée par quelqu’un d’autre'));
    render(<UnitSettingsDialog unit={unit()} onClose={() => {}} onSaved={() => {}} />);
    fireEvent.change(screen.getByLabelText('Température minimale (°C)'), { target: { value: '25' } });
    expect(await screen.findByText('Le minimum de température ne dépasse pas son maximum.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Enregistrer' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Température minimale (°C)'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Cette unité a été modifiée par quelqu’un d’autre')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Enregistrer' }) as HTMLButtonElement).disabled).toBe(false);
});

it('consigne un relevé, relit la liste, et ne propose pas de saisie sans le droit de constater', async () => {
    fixture.physicalArchives.readings.mockResolvedValue({ page: 0, size: 20, hasMore: false, items: [
        { id: 'r2', uniteStockageId: 'u1', mesure: 'TEMPERATURE', valeur: '24.50', releveLe: '2026-10-22T08:00:00Z', relevePar: 'A. Camara', note: 'Climatiseur en panne', etat: 'TROP_HAUT' },
        { id: 'r1', uniteStockageId: 'u1', mesure: 'HUMIDITE', valeur: '50.00', releveLe: '2026-10-21T08:00:00Z', relevePar: null, note: null, etat: 'CONFORME' }] });
    const onChanged = vi.fn();
    render(<ReadingsDialog unit={unit()} canRecord onClose={() => {}} onChanged={onChanged} />);
    expect(await screen.findByText('Climatiseur en panne')).toBeTruthy();
    expect(screen.getByText('Trop haut')).toBeTruthy();
    expect(screen.getByText('A. Camara')).toBeTruthy();
    const submit = screen.getByRole('button', { name: 'Consigner' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/^Valeur relevée/), { target: { value: '140' } });
    fireEvent.change(screen.getByLabelText('Mesure'), { target: { value: 'HUMIDITE' } });
    expect(await screen.findByText(/entre 0 et 100 %/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^Valeur relevée/), { target: { value: '48,5' } });
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: '  hygromètre salle 3 ' } });
    const calls = fixture.physicalArchives.readings.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Consigner' }));
    await waitFor(() => expect(fixture.physicalArchives.command).toHaveBeenCalledWith('/storage-units/u1/readings', { mesure: 'HUMIDITE', valeur: 48.5, note: 'hygromètre salle 3' }, expect.any(String), 'POST'));
    await waitFor(() => expect(fixture.physicalArchives.readings.mock.calls.length).toBeGreaterThan(calls));
    expect(onChanged).toHaveBeenCalled();
    expect((screen.getByLabelText(/^Valeur relevée/) as HTMLInputElement).value).toBe('');
    cleanup();
    render(<ReadingsDialog unit={unit()} canRecord={false} onClose={() => {}} onChanged={() => {}} />);
    await screen.findByText('Climatiseur en panne');
    expect(screen.queryByRole('button', { name: 'Consigner' })).toBeNull();
});

it('dit quand aucun relevé n’existe et quand le serveur échoue', async () => {
    render(<ReadingsDialog unit={unit()} canRecord onClose={() => {}} onChanged={() => {}} />);
    expect(await screen.findByText('Aucun relevé')).toBeTruthy();
    cleanup();
    fixture.physicalArchives.readings.mockRejectedValue(new Error('Relevés indisponibles'));
    render(<ReadingsDialog unit={unit()} canRecord onClose={() => {}} onChanged={() => {}} />);
    expect(await screen.findByText('Relevés indisponibles')).toBeTruthy();
});

it('les alertes de conservation ne s’affichent que s’il y en a, avec le lieu, le dernier relevé et le seuil franchi', async () => {
    const { container } = render(<ConditionAlertsSection />);
    await waitFor(() => expect(fixture.physicalArchives.conditionAlerts).toHaveBeenCalledWith(0, expect.anything()));
    await waitFor(() => expect(container.textContent).toBe(''));
    cleanup();
    fixture.physicalArchives.conditionAlerts.mockResolvedValue({ page: 0, size: 20, hasMore: true, items: [
        { unite: { unitId: 'u1', cote: 'BOITE-14', typeUnite: 'BOITE', localisation: ['Archives nationales', 'Salle 3'], actif: true }, mesure: 'TEMPERATURE', valeur: '26.00', releveLe: '2026-10-22T08:00:00Z', etat: 'TROP_HAUT', min: '14', max: '20' }] });
    const view = render(<ConditionAlertsSection />);
    expect(await screen.findByText('Archives nationales › Salle 3 · BOITE-14')).toBeTruthy();
    expect(screen.getByText('26 °C · 22 octobre 2026')).toBeTruthy();
    expect(screen.getByText('min 14 · max 20 °C')).toBeTruthy();
    expect(screen.getByText('Trop haut')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Suivante' }));
    await waitFor(() => expect(fixture.physicalArchives.conditionAlerts).toHaveBeenCalledWith(1, expect.anything()));
    const result = await axe.run(view.container, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations.map(v => v.id + ': ' + v.nodes.map(n => n.html).join(' | '))).toEqual([]);
});
