import { beforeEach, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => ({ signInWithPassword: vi.fn(), getSession: vi.fn(), signOut: vi.fn(), onAuthStateChange: vi.fn() }));
vi.mock('../../src/auth/config', () => ({ configIssue: () => null, config: { authMode: 'supabase', supabaseUrl: 'https://auth.example.test', supabaseKey: 'public-test' } }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth }) }));
import { createAuthDriver } from '../../src/auth/driver';
import { signInError } from '../../src/core/authErrors';
beforeEach(() => { auth.signInWithPassword.mockReset().mockResolvedValue({ error: null }); });
it('normalise l’adresse et préserve exactement le mot de passe saisi', async () => {
    const driver = await createAuthDriver();
    await driver.signIn(' Agent@Example.Test ', ' password with spaces ');
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'agent@example.test', password: ' password with spaces ' });
});
it('distingue une erreur d’identifiants d’un service indisponible, sans divulguer le message brut', async () => {
    auth.signInWithPassword.mockResolvedValueOnce({ error: { status: 400, code: 'invalid_credentials', message: 'private provider detail' } });
    const driver = await createAuthDriver();
    await expect(driver.signIn('agent@example.test', 'wrong')).rejects.toThrow('Adresse e-mail ou mot de passe incorrect');
    expect(signInError({ status: 503, message: 'private provider detail' }).message).toContain('temporairement inaccessible');
    expect(signInError({ status: 429 }).message).toContain('Trop de tentatives');
    expect(signInError({ code: 'email_not_confirmed' }).message).toContain('confirmation');
    expect(signInError({ status: 401 }).message).toContain('configuration');
    expect(signInError({ message: 'private provider detail' }).message).not.toContain('private');
});
