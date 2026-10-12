import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { PortalApi } from '../api/portal';
import { ApiError } from '../core/http';
import { accessState, type AccessState } from '../core/portal';
import type { PortalAccessRequest, PortalReader, PortalSubscription } from '../core/types';

interface PortalState {
    api: PortalApi;
    reader: PortalReader | null;
    subscriptions: PortalSubscription[];
    /** Les demandes d'accès du lecteur, les plus récentes d'abord. */
    accessRequests: PortalAccessRequest[];
    /** Vrai tant que l'on ne sait pas encore si le lecteur est connecté. */
    loading: boolean;
    access: AccessState;
    /** Relit le compte, les abonnements et les demandes d'accès (après une demande, une annulation, un changement de profil). */
    reload: () => Promise<void>;
    signedIn: (reader: PortalReader) => Promise<void>;
    signOut: () => Promise<void>;
    /** À appeler quand une requête répond 401 : la session est terminée, le portail s'en souvient. */
    expired: (error: unknown) => boolean;
}

const Context = createContext<PortalState | null>(null);
export function usePortal(): PortalState { return useContext(Context)!; }

/** Les demandes d'accès complètent le compte : si elles ne se chargent pas, le reste du portail reste utilisable. */
async function readRequests(api: PortalApi): Promise<PortalAccessRequest[]> { try { return await api.accessRequests(); } catch { return []; } }

export function PortalProvider({ children, api: given }: { children: React.ReactNode; api?: PortalApi }) {
    const api = useMemo(() => given ?? new PortalApi(), [given]);
    const [reader, setReader] = useState<PortalReader | null>(null);
    const [subscriptions, setSubscriptions] = useState<PortalSubscription[]>([]);
    const [accessRequests, setAccessRequests] = useState<PortalAccessRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const alive = useRef(true);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

    const load = useCallback(async () => {
        try {
            const me = await api.me();
            const subs = await api.subscriptions();
            const requests = await readRequests(api);
            if (!alive.current) return;
            setReader(me); setSubscriptions(subs); setAccessRequests(requests);
        } catch (error) {
            if (!alive.current) return;
            // Sans session (401) ou si le service ne répond pas : le catalogue public reste utilisable.
            setReader(null); setSubscriptions([]); setAccessRequests([]);
            if (!(error instanceof ApiError)) throw error;
        } finally { if (alive.current) setLoading(false); }
    }, [api]);
    useEffect(() => { void load().catch(() => setLoading(false)); }, [load]);

    const value = useMemo<PortalState>(() => ({
        api, reader, subscriptions, accessRequests, loading, access: accessState(reader, subscriptions),
        reload: load,
        signedIn: async next => { setReader(next); try { setSubscriptions(await api.subscriptions()); } catch { setSubscriptions([]); } setAccessRequests(await readRequests(api)); },
        signOut: async () => { try { await api.logout(); } finally { setReader(null); setSubscriptions([]); setAccessRequests([]); } },
        expired: error => { if (error instanceof ApiError && error.status === 401) { setReader(null); setSubscriptions([]); setAccessRequests([]); return true; } return false; }
    }), [api, reader, subscriptions, accessRequests, loading, load]);
    return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** Une action du lecteur : un envoi à la fois, et la fin de session est reconnue. */
export function useAction() {
    const { expired } = usePortal();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const running = useRef(false);
    const run = async (action: () => Promise<void>): Promise<boolean> => {
        if (running.current) return false;
        running.current = true; setBusy(true); setError(null);
        try { await action(); return true; }
        catch (e) { if (!expired(e)) setError(e); return false; }
        finally { running.current = false; setBusy(false); }
    };
    return { busy, error, run, clear: () => setError(null) };
}
