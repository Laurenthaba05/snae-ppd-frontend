import { useEffect, useState } from 'react';
/** Attendre une courte pause de saisie ; vider le filtre reste immédiat. */
export function useDebouncedValue(value: string, delay = 300): string {
    const [settled, setSettled] = useState(value);
    useEffect(() => { const timer = setTimeout(() => setSettled(value), delay); return () => clearTimeout(timer); }, [value, delay]);
    return value === '' ? '' : settled;
}
