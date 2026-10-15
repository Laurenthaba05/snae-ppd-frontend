import { normalizeLoginEmail, signInError } from '../core/authErrors';
import { config, configIssue } from './config';
export interface AuthDriver {
    initialize(): Promise<boolean>;
    signIn(email?: string, password?: string): Promise<void>;
    signOut(): Promise<void>;
    accessToken(): Promise<string | null>;
    subscribe(listener: () => void): () => void;
}
export async function createAuthDriver(): Promise<AuthDriver> {
    const issue = configIssue();
    if (issue)
        throw new Error(issue);
    if (config.authMode === 'supabase') {
        const { createClient } = await import('@supabase/supabase-js');
        const client = createClient(config.supabaseUrl, config.supabaseKey, { auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce' } });
        return {
            async initialize() { return !!(await client.auth.getSession()).data.session; },
            async signIn(email, password) {
                const { error } = await client.auth.signInWithPassword({ email: normalizeLoginEmail(email ?? ''), password: password ?? '' });
                if (error)
                    throw signInError(error);
            },
            async signOut() {
                const { error } = await client.auth.signOut({ scope: 'local' });
                if (error)
                    throw new Error('Déconnexion distante non confirmée. Fermez cet onglet.');
            },
            async accessToken() {
                const { data, error } = await client.auth.getSession();
                if (error || !data.session || (data.session.expires_at ?? 0) * 1000 <= Date.now())
                    return null;
                return data.session.access_token;
            },
            subscribe(listener) { const { data } = client.auth.onAuthStateChange(() => { setTimeout(listener, 0); }); return () => data.subscription.unsubscribe(); }
        };
    }
    if (config.authMode === 'oidc') {
        const { UserManager, WebStorageStateStore, InMemoryWebStorage } = await import('oidc-client-ts');
        const manager = new UserManager({ authority: config.authority, client_id: config.clientId, redirect_uri: location.origin + '/auth/callback', post_logout_redirect_uri: location.origin + '/connexion', response_type: 'code', scope: config.oidcScope, loadUserInfo: false, automaticSilentRenew: false,
            userStore: new WebStorageStateStore({ store: new InMemoryWebStorage() }), stateStore: new WebStorageStateStore({ store: sessionStorage, prefix: 'snae.oidc.transaction.' }), staleStateAgeInSeconds: 600 });
        return {
            async initialize() {
                await manager.clearStaleState();
                if (location.pathname === '/auth/callback') {
                    const callback = location.href;
                    try {
                        await manager.signinRedirectCallback(callback);
                    }
                    finally {
                        history.replaceState(null, '', '/connexion');
                    }
                }
                const user = await manager.getUser();
                return !!user && !user.expired;
            },
            async signIn() { await manager.signinRedirect(); },
            async signOut() { await manager.removeUser(); },
            async accessToken() { const user = await manager.getUser(); return user && !user.expired ? user.access_token : null; },
            subscribe(listener) { manager.events.addUserLoaded(listener); manager.events.addUserUnloaded(listener); manager.events.addAccessTokenExpired(listener); return () => { manager.events.removeUserLoaded(listener); manager.events.removeUserUnloaded(listener); manager.events.removeAccessTokenExpired(listener); }; }
        };
    }
    throw new Error('Authentification non configurée.');
}
