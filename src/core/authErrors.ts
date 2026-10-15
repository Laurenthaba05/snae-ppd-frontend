/** Never display provider internals, tokens or account-enumeration details. */
export function signInError(error: unknown): Error {
    const value = error && typeof error === 'object' ? error as { code?: unknown; status?: unknown; name?: unknown } : {};
    const code = typeof value.code === 'string' ? value.code : '';
    const status = typeof value.status === 'number' ? value.status : 0;
    if (code === 'invalid_credentials' || status === 400 && !code) return new Error('Adresse e-mail ou mot de passe incorrect. Saisissez le mot de passe de ce compte SNAE-PPD, puis réessayez.');
    if (code === 'email_not_confirmed') return new Error('La confirmation de votre adresse e-mail est nécessaire avant la connexion.');
    if (status === 429 || code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit') return new Error('Trop de tentatives de connexion. Patientez quelques minutes avant de réessayer.');
    if (status >= 500 || value.name === 'AuthRetryableFetchError' || error instanceof TypeError) return new Error('Le service d’authentification est temporairement inaccessible. Vérifiez votre connexion réseau, puis réessayez.');
    if (code === 'user_banned') return new Error('La connexion à ce compte est suspendue. Contactez votre administrateur.');
    if (status === 401 || code === 'bad_jwt') return new Error('La configuration du fournisseur d’identité a été refusée. Contactez votre administrateur.');
    return new Error('Connexion non aboutie. Réessayez ou utilisez l’assistance de connexion.');
}
export function normalizeLoginEmail(email: string): string { return email.trim().toLowerCase(); }
