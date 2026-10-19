export type AuthMode = 'disabled' | 'supabase' | 'oidc';
/** Adresse d'assistance de l'écran de connexion. Une valeur qui n'a pas la forme d'une adresse est ignorée : elle n'est jamais placée telle quelle dans un lien. */
export function supportAddress(value: string | undefined): string {
    const address = (value ?? '').trim();
    return /^[^\s@<>"',;:\\()[\]]+@[^\s@<>"',;:\\()[\]]+\.[^\s@<>"',;:\\()[\]]+$/.test(address) ? address : '';
}
export const config = {
    supportEmail: supportAddress(import.meta.env.VITE_SUPPORT_EMAIL),
    demo: __DEMO_BUILD__ && import.meta.env.VITE_DATA_MODE === 'demo',
    authMode: (import.meta.env.VITE_AUTH_MODE || 'disabled') as AuthMode,
    apiBase: import.meta.env.VITE_API_BASE || '/api/v1',
    label: import.meta.env.VITE_APP_LABEL || 'Recette institutionnelle',
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
    supabaseKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
    authority: import.meta.env.VITE_OIDC_AUTHORITY || '',
    clientId: import.meta.env.VITE_OIDC_CLIENT_ID || '',
    oidcScope: import.meta.env.VITE_OIDC_SCOPE || 'openid profile email'
};
export function configIssue(): string | null {
    if (config.demo)
        return null;
    if (config.authMode === 'disabled')
        return 'Le fournisseur d’identité n’est pas encore configuré. Consultez le guide de connexion ou lancez la démonstration séparée.';
    if (!['oidc', 'supabase'].includes(config.authMode))
        return 'Mode d’authentification inconnu.';
    const url = config.authMode === 'oidc' ? config.authority : config.supabaseUrl;
    try {
        const u = new URL(url);
        if (u.protocol !== 'https:' || u.username || u.password)
            throw new Error();
    }
    catch {
        return 'L’adresse du fournisseur d’identité doit être une URL HTTPS sans identifiants.';
    }
    if (config.authMode === 'oidc' && !config.clientId)
        return 'Le client OIDC public doit être configuré.';
    if (config.authMode === 'supabase' && !config.supabaseKey)
        return 'La clé publique Supabase Auth est absente.';
    if (config.supabaseKey.startsWith('sb_secret_'))
        return 'Une clé secrète Supabase ne doit jamais être exposée dans le frontend.';
    if (config.authMode === 'supabase' && config.supabaseKey.split('.').length === 3) {
        try {
            const p = JSON.parse(atob(config.supabaseKey.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')));
            if (p.role !== 'anon')
                return 'Seule une clé publique anon/publishable est autorisée.';
        }
        catch {
            return 'Clé publique Supabase invalide.';
        }
    }
    return null;
}
