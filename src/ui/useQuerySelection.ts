import { navigate, usePath } from './navigation';
export function useQuerySelection(parameter: string): [string | null, (id: string | null) => void] {
    const path = usePath(); const params = new URLSearchParams(path.split('?')[1]);
    const candidate = params.get(parameter);
    const id = candidate && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate) ? candidate : null;
    return [id, value => {
        const next = new URLSearchParams(location.search);
        if (value) next.set(parameter, value); else next.delete(parameter);
        navigate(location.pathname + (next.size ? '?' + next.toString() : ''));
    }];
}
