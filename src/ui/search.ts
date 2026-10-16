import { useEffect, useState } from 'react';

/** Le délai entre la dernière frappe et la recherche faite par le serveur. */
export const SEARCH_DELAY_MS = 300;

/** La valeur d'une saisie, retardée : une recherche côté serveur ne part pas à chaque frappe, seulement quand la personne s'arrête d'écrire. */
export function useDebounced<T>(value: T, delayMs = SEARCH_DELAY_MS): T {
    const [settled, setSettled] = useState(value);
    useEffect(() => {
        const timer = setTimeout(() => setSettled(value), delayMs);
        return () => clearTimeout(timer);
    }, [value, delayMs]);
    return settled;
}
