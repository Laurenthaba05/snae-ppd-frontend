import { canonicalStaffPath } from '../core/staffRoutes';
import { useSyncExternalStore } from 'react';
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(fn => fn());
window.addEventListener('popstate', notify);
export function navigate(path: string, options?: { replace?: boolean }): void {
    if (!path.startsWith('/') || path.startsWith('//') || /[\\\r\n]/.test(path))
        return;
    history[options?.replace ? 'replaceState' : 'pushState'](null, '', canonicalStaffPath(path));
    notify();
    window.scrollTo(0, 0);
}
export function usePath(): string { return useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => location.pathname + location.search); }
