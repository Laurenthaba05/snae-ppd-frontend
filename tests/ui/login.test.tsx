import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

// L'écran de connexion : trois modes (démonstration, mot de passe, connexion institutionnelle), l'erreur du contexte de session et celle de la configuration sont dites, un mot de passe
// n'est jamais gardé après l'envoi, et un envoi refusé ne laisse pas l'écran dans un état incohérent.
const settings = vi.hoisted(() => ({ authMode: 'oidc' as 'oidc' | 'supabase' | 'disabled', issue: null as string | null, supportEmail: '' }));
const session = vi.hoisted(() => ({ signIn: vi.fn(), busy: false, error: null as unknown, demo: false }));
vi.mock('../../src/auth/session', () => ({ useSession: () => session }));
vi.mock('../../src/auth/config', () => ({ config: settings, configIssue: () => settings.issue }));
import { Login } from '../../src/pages/Login';

beforeEach(() => {
    settings.authMode = 'oidc'; settings.issue = null; settings.supportEmail = '';
    session.signIn.mockReset().mockResolvedValue(undefined); session.busy = false; session.error = null; session.demo = false;
});

it('en démonstration, une seule action : ouvrir la démonstration', async () => {
    session.demo = true;
    render(<Login />);
    expect(screen.getByText('Environnement de démonstration')).toBeTruthy();
    expect(screen.queryByLabelText(/Mot de passe/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Ouvrir la démonstration/ }));
    expect(session.signIn).toHaveBeenCalledWith();
});

it('avec une connexion institutionnelle, le bouton lance la connexion sans identifiant', () => {
    render(<Login />);
    expect(screen.queryByLabelText(/Mot de passe/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Connexion institutionnelle/ }));
    expect(session.signIn).toHaveBeenCalledWith();
});

it('avec un mot de passe, l’adresse et le mot de passe partent tels quels puis le mot de passe est effacé', async () => {
    settings.authMode = 'supabase';
    render(<Login />);
    const email = screen.getByLabelText(/Adresse e-mail/) as HTMLInputElement;
    const password = screen.getByLabelText(/^Mot de passe/) as HTMLInputElement;
    fireEvent.change(email, { target: { value: 'agent@exemple.test' } });
    fireEvent.change(password, { target: { value: ' un mot de passe ' } });
    fireEvent.click(screen.getByRole('button', { name: /Se connecter/ }));
    await waitFor(() => expect(session.signIn).toHaveBeenCalledWith('agent@exemple.test', ' un mot de passe '));
    await waitFor(() => expect(password.value).toBe(''));
    expect(email.value).toBe('agent@exemple.test');
});

it('un envoi refusé efface quand même le mot de passe et ne casse pas l’écran', async () => {
    settings.authMode = 'supabase';
    session.signIn.mockRejectedValue(new Error('refusé'));
    render(<Login />);
    const password = screen.getByLabelText(/^Mot de passe/) as HTMLInputElement;
    fireEvent.change(screen.getByLabelText(/Adresse e-mail/), { target: { value: 'agent@exemple.test' } });
    fireEvent.change(password, { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: /Se connecter/ }));
    await waitFor(() => expect(password.value).toBe(''));
    expect(screen.getByRole('button', { name: /Se connecter/ })).toBeTruthy();
});

it('le mot de passe peut être montré, et se masque de nouveau', () => {
    settings.authMode = 'supabase';
    render(<Login />);
    const password = screen.getByLabelText(/^Mot de passe/) as HTMLInputElement;
    expect(password.type).toBe('password');
    const toggle = screen.getAllByRole('button').find(b => /afficher|montrer/i.test(b.getAttribute('aria-label') ?? b.textContent ?? ''));
    expect(toggle).toBeTruthy();
    fireEvent.click(toggle!);
    expect(password.type).toBe('text');
    fireEvent.click(toggle!);
    expect(password.type).toBe('password');
});

it('un problème de configuration est dit et bloque la connexion', () => {
    settings.issue = 'Le fournisseur d’identité n’est pas encore configuré.';
    render(<Login />);
    expect(screen.getByText('Le fournisseur d’identité n’est pas encore configuré.')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Connexion institutionnelle/ }) as HTMLButtonElement).disabled).toBe(true);
});

it('une session en cours bloque le bouton et l’erreur du contexte de session s’affiche', () => {
    session.busy = true; session.error = new Error('Connexion SSO non aboutie.');
    render(<Login />);
    expect((screen.getByRole('button', { name: /Redirection/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('alert')).toBeTruthy();
});

it('l’assistance se déplie et se replie, avec son état annoncé', () => {
    render(<Login />);
    const toggle = screen.getAllByRole('button', { name: /Assistance/ })[0]!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('region', { name: 'Assistance à la connexion' })).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(within(screen.getByRole('region', { name: 'Assistance à la connexion' })).getByText('Votre administrateur vous accompagne')).toBeTruthy();
    fireEvent.click(toggle);
    expect(screen.queryByRole('region', { name: 'Assistance à la connexion' })).toBeNull();
});

it('le lien d’évitement mène au contenu', () => {
    render(<Login />);
    const skip = screen.getByRole('link', { name: 'Aller à la connexion' });
    expect(skip.getAttribute('href')).toBe('#login-content');
    expect(document.getElementById('login-content')).toBeTruthy();
});

// ---------- l'adresse d'assistance (VITE_SUPPORT_EMAIL)
it('sans adresse d’assistance, « En savoir plus » ouvre l’aide intégrée et aucun lien de courrier n’existe', () => {
    render(<Login />);
    expect(document.querySelector('a[href^="mailto:"]')).toBeNull();
    const more = screen.getByRole('button', { name: /En savoir plus/ });
    fireEvent.click(more);
    expect(within(screen.getByRole('region', { name: 'Assistance à la connexion' })).getByText('Votre administrateur vous accompagne')).toBeTruthy();
    expect(screen.queryByText(/écrivez à l’adresse suivante/)).toBeNull();
});

it('avec une adresse d’assistance, le bandeau devient un lien de courrier qui montre l’adresse et prépare l’objet', () => {
    settings.supportEmail = 'assistance@exemple.test';
    render(<Login />);
    const link = screen.getByRole('link', { name: 'assistance@exemple.test' });
    expect(link.getAttribute('href')).toBe('mailto:assistance@exemple.test?subject=' + encodeURIComponent('Demande d’accès SNAE-PPD'));
    expect(screen.queryByRole('button', { name: /En savoir plus/ })).toBeNull();
});

it('l’aide de l’en-tête garde son texte et ajoute l’adresse d’assistance quand elle existe', () => {
    settings.supportEmail = 'assistance@exemple.test';
    render(<Login />);
    fireEvent.click(screen.getAllByRole('button', { name: /Assistance/ })[0]!);
    const region = screen.getByRole('region', { name: 'Assistance à la connexion' });
    expect(within(region).getByText('Votre administrateur vous accompagne')).toBeTruthy();
    expect(within(region).getByText(/écrivez à l’adresse suivante/)).toBeTruthy();
    expect((within(region).getByRole('link', { name: 'assistance@exemple.test' }) as HTMLAnchorElement).href).toContain('mailto:assistance@exemple.test');
});

it('la valeur de configuration n’est acceptée que si elle a la forme d’une adresse, jamais telle quelle dans un lien', async () => {
    vi.stubGlobal('__DEMO_BUILD__', false);
    vi.resetModules();
    vi.doUnmock('../../src/auth/config');
    const { supportAddress } = await import('../../src/auth/config');
    expect(supportAddress(' assistance@exemple.test ')).toBe('assistance@exemple.test');
    expect(supportAddress('prenom.nom+archives@institution.gn')).toBe('prenom.nom+archives@institution.gn');
    for (const bad of [undefined, '', '   ', 'pas une adresse', 'a@b', 'a@b@c.test', 'x@exemple.test?bcc=autre@exemple.test', 'x@exemple.test,y@exemple.test', 'x@exemple.test;y@exemple.test',
        '<x@exemple.test>', '"x"@exemple.test', 'javascript:alert(1)//x@exemple.test', 'x y@exemple.test', 'x@exemple.test\nBcc: y@exemple.test'])
        expect(supportAddress(bad), String(bad)).toBe('');
    vi.unstubAllGlobals();
});
