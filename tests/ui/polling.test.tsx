import React from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { usePolling } from '../../src/ui/polling';

function Probe({ refresh, ms = 1000, active = true }: { refresh: () => void; ms?: number; active?: boolean }) {
    usePolling(refresh, ms, active);
    return null;
}
const visibility = (state: 'visible' | 'hidden') => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
    document.dispatchEvent(new Event('visibilitychange'));
};

beforeEach(() => { vi.useFakeTimers(); visibility('visible'); });
afterEach(() => { vi.useRealTimers(); visibility('visible'); });

it('relit à chaque intervalle tant que l’onglet est visible', () => {
    const refresh = vi.fn();
    render(<Probe refresh={refresh} />);
    act(() => { vi.advanceTimersByTime(3500); });
    expect(refresh).toHaveBeenCalledTimes(3);
});

it('ne relit pas onglet caché, puis rattrape d’un seul coup au retour', () => {
    const refresh = vi.fn();
    render(<Probe refresh={refresh} />);
    visibility('hidden');
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(refresh).not.toHaveBeenCalled();
    visibility('visible');
    expect(refresh).toHaveBeenCalledTimes(1);
    visibility('visible');
    expect(refresh).toHaveBeenCalledTimes(1);
});

it('ne fait rien tant qu’elle n’est pas active et s’arrête au démontage', () => {
    const refresh = vi.fn();
    const view = render(<Probe refresh={refresh} active={false} />);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(refresh).not.toHaveBeenCalled();
    view.rerender(<Probe refresh={refresh} active />);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(refresh).toHaveBeenCalledTimes(1);
    view.unmount();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(refresh).toHaveBeenCalledTimes(1);
});

it('appelle toujours la version la plus récente de la fonction', () => {
    const first = vi.fn(); const second = vi.fn();
    const view = render(<Probe refresh={first} />);
    view.rerender(<Probe refresh={second} />);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
});
