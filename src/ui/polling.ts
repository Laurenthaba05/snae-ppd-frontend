import { useEffect, useRef } from 'react';

/**
 * Relit une ressource à intervalle régulier tant que `active`, **seulement onglet visible** : un onglet caché n'interroge plus le serveur. Un tour manqué pendant que l'onglet était
 * caché est rattrapé dès son retour (un seul rafraîchissement, pas une rafale). L'appel le plus récent est toujours celui qui s'exécute : `refresh` peut changer à chaque rendu.
 */
export function usePolling(refresh: () => void, intervalMs: number, active = true): void {
    const latest = useRef(refresh);
    latest.current = refresh;
    useEffect(() => {
        if (!active) return;
        let missed = false;
        const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';
        const timer = setInterval(() => { if (hidden()) missed = true; else latest.current(); }, intervalMs);
        const onVisible = () => { if (missed && !hidden()) { missed = false; latest.current(); } };
        document.addEventListener('visibilitychange', onVisible);
        return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
    }, [active, intervalMs]);
}
