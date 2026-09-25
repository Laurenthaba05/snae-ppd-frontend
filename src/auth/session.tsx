import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { IamApi } from '../api/iam';
import { HttpTransport, ApiError } from '../core/http';
import type { Me } from '../core/types';
import { canonical } from '../core/validation';
import { config, configIssue } from './config';
import { createAuthDriver, type AuthDriver } from './driver';
import type { DemoTransport } from '../demo/transport';
import { navigate } from '../ui/navigation';
interface SessionValue {
    me: Me | null;
    api: IamApi | null;
    busy: boolean;
    error: unknown;
    demo: boolean;
    epoch: number;
    signIn: (email?: string, password?: string) => Promise<void>;
    logout: () => Promise<void>;
    refresh: () => Promise<void>;
    switchPersona: (persona: 'a' | 'b' | 'agent') => Promise<void>;
    resetDemo: () => Promise<void>;
}
const Context = createContext<SessionValue | null>(null);
export function useSession(): SessionValue {
    const value = useContext(Context);
    if (!value)
        throw new Error('SessionProvider requis');
    return value;
}
export function SessionProvider({ children }: {
    children: React.ReactNode;
}) {
    const [me, setMe] = useState<Me | null>(null);
    const [api, setApi] = useState<IamApi | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const [epoch, setEpoch] = useState(0);
    const driver = useRef<AuthDriver | null>(null);
    const client = useRef<IamApi | null>(null);
    const http = useRef<HttpTransport | null>(null);
    const mock = useRef<DemoTransport | null>(null);
    const current = useRef<Me | null>(null);
    const generation = useRef(0);
    const initializing = useRef<Promise<void> | null>(null);
    const refreshInFlight = useRef<Promise<void> | null>(null);
    const setIdentity = (value: Me | null) => {
        if (canonical(current.current) !== canonical(value)) {
            setEpoch(x => x + 1);
            current.current = value;
            setMe(value);
        }
    };
    const expire = () => { generation.current++; http.current?.abortAll(); setIdentity(null); setError(new ApiError(401, 'SESSION_EXPIRED', 'Votre session a expiré. Reconnectez-vous.')); navigate('/connexion'); };
    const refresh = useCallback(async () => {
        if (refreshInFlight.current)
            return refreshInFlight.current;
        const gen = generation.current;
        const task = (async () => {
            if (!client.current)
                return;
            try {
                const identity = await client.current.me();
                if (gen !== generation.current)
                    return;
                setIdentity(identity);
                setError(null);
            }
            catch (e) {
                if (gen !== generation.current)
                    return;
                setIdentity(null);
                setError(e);
            }
        })();
        refreshInFlight.current = task;
        try {
            await task;
        }
        finally {
            refreshInFlight.current = null;
        }
    }, []);
    const initialize = async () => {
        if (initializing.current)
            return initializing.current;
        initializing.current = (async () => {
            const d = await createAuthDriver();
            driver.current = d;
            http.current = new HttpTransport(config.apiBase, () => d.accessToken(), expire);
            client.current = new IamApi(http.current);
            setApi(client.current);
            const active = await d.initialize();
            if (active)
                await refresh();
        })();
        try {
            await initializing.current;
        }
        catch (e) {
            initializing.current = null;
            throw e;
        }
    };
    useEffect(() => {
        if (config.demo || configIssue())
            return;
        let alive = true;
        setBusy(true);
        initialize().catch(e => {
            if (alive)
                setError(new Error('Connexion SSO non aboutie. Vérifiez la configuration et recommencez.'));
        }).finally(() => {
            if (alive)
                setBusy(false);
        });
        return () => { alive = false; };
    }, []);
    useEffect(() => {
        if (!me || config.demo)
            return;
        const t = setInterval(() => void refresh(), 60000);
        const focus = () => {
            if (document.visibilityState === 'visible')
                void refresh();
        };
        window.addEventListener('focus', focus);
        document.addEventListener('visibilitychange', focus);
        return () => { clearInterval(t); window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', focus); };
    }, [!!me, refresh]);
    const switchPersona = async (persona: 'a' | 'b' | 'agent') => {
        if (!config.demo)
            return;
        generation.current++;
        setIdentity(null);
        if (!mock.current) {
            const { DemoTransport } = await import('../demo/transport');
            mock.current = new DemoTransport();
        }
        mock.current.persona = persona;
        client.current = new IamApi(mock.current);
        setApi(client.current);
        await refresh();
        navigate('/app');
    };
    const signIn = async (email?: string, password?: string) => {
        setBusy(true);
        setError(null);
        try {
            if (config.demo) {
                await switchPersona('a');
                return;
            }
            await initialize();
            await driver.current!.signIn(email, password);
            if (config.authMode === 'supabase') {
                await refresh();
                if (current.current)
                    navigate('/app');
            }
        }
        catch (e) {
            setError(e);
            throw e;
        }
        finally {
            setBusy(false);
        }
    };
    const logout = async () => {
        generation.current++;
        http.current?.abortAll();
        setIdentity(null);
        setError(null);
        navigate('/connexion');
        try {
            await driver.current?.signOut();
        }
        catch (e) {
            setError(e);
        }
    };
    return <Context.Provider value={{ me, api, busy, error, demo: config.demo, epoch, signIn, logout, refresh, switchPersona, resetDemo: async () => { mock.current = null; await switchPersona('a'); } }}>{children}</Context.Provider>;
}
