import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/core/http';
import type { AssistantConfig, PortalApi } from '../../src/api/portal';
import { PortalProvider } from '../../src/portal/context';
import { PortalAssistant } from '../../src/portal/Assistant';

const config = (extra: Partial<AssistantConfig> = {}): AssistantConfig => ({ actif: true, whatsapp: true, whatsappNumero: '224620000000', personaParDefaut: 'HENY',
    personas: [{ code: 'MORIBA', nom: 'Moriba', presentation: 'Je suis Moriba.' }, { code: 'HENY', nom: 'Heny', presentation: 'Je suis Heny.' }],
    accueil: { MORIBA: 'Bonjour, ici Moriba.', HENY: 'Bonjour, ici Heny.' }, ...extra });
const api = { me: vi.fn(), subscriptions: vi.fn(), accessRequests: vi.fn(), assistantConfig: vi.fn(), assistantMessage: vi.fn(), whatsappLink: vi.fn(), whatsappLinkCode: vi.fn(), whatsappUnlink: vi.fn() };
const show = () => render(<PortalProvider api={api as unknown as PortalApi}><PortalAssistant /></PortalProvider>);

beforeEach(() => {
    sessionStorage.clear();
    for (const fn of Object.values(api)) fn.mockReset();
    api.me.mockRejectedValue(new ApiError(401, 'PORTAL_AUTH_REQUIRED', 'Connectez-vous.'));
    api.subscriptions.mockResolvedValue([]); api.accessRequests.mockResolvedValue([]);
    api.assistantConfig.mockResolvedValue(config());
});

it('stays hidden when the institution has not enabled the assistant', async () => {
    api.assistantConfig.mockResolvedValue(config({ actif: false }));
    const { container } = show();
    await waitFor(() => expect(api.assistantConfig).toHaveBeenCalled());
    expect(container.querySelector('.assistant-launcher')).toBeNull();
});

it('greets with the default persona, sends questions and keeps the conversation token', async () => {
    api.assistantMessage.mockResolvedValueOnce({ conversation: 'jeton-1', persona: 'HENY', personaNom: 'Heny', reponse: 'Voici les **étapes**.', degrade: false, lecteurIdentifie: false })
        .mockResolvedValueOnce({ conversation: null, persona: 'MORIBA', personaNom: 'Moriba', reponse: 'Avec plaisir.', degrade: false, lecteurIdentifie: false });
    show();
    fireEvent.click(await screen.findByRole('button', { name: /Besoin d’aide \? Heny/ }));
    expect(screen.getByText('Bonjour, ici Heny.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Votre question'), { target: { value: 'Comment m’inscrire ?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    expect(await screen.findByText('étapes')).toBeTruthy();
    expect(screen.getByText('étapes').tagName).toBe('STRONG');
    expect(api.assistantMessage).toHaveBeenLastCalledWith({ conversation: null, persona: 'HENY', message: 'Comment m’inscrire ?' });
    expect(sessionStorage.getItem('snae-assistant-conversation')).toBe('jeton-1');

    fireEvent.click(screen.getByRole('button', { name: 'Moriba' }));
    expect(screen.getByText('Bonjour, ici Moriba.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Votre question'), { target: { value: 'Merci' } });
    fireEvent.keyDown(screen.getByLabelText('Votre question'), { key: 'Enter' });
    expect(await screen.findByText('Avec plaisir.')).toBeTruthy();
    expect(api.assistantMessage).toHaveBeenLastCalledWith({ conversation: 'jeton-1', persona: 'MORIBA', message: 'Merci' });
    expect(screen.getByRole('link', { name: 'Écrire à l’assistant sur WhatsApp' }).getAttribute('href')).toBe('https://wa.me/224620000000');
});

it('shows a readable notice when the assistant is busy or unavailable', async () => {
    api.assistantMessage.mockRejectedValueOnce(new ApiError(429, 'ASSISTANT_RATE_LIMIT', 'Vous avez envoyé beaucoup de messages : réessayez dans un moment.'))
        .mockRejectedValueOnce(new ApiError(503, 'ASSISTANT_UNAVAILABLE', 'x'));
    show();
    fireEvent.click(await screen.findByRole('button', { name: /Besoin d’aide/ }));
    const ask = (text: string) => {
        fireEvent.change(screen.getByLabelText('Votre question'), { target: { value: text } });
        fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    };
    ask('Un');
    expect(await screen.findByText(/beaucoup de messages/)).toBeTruthy();
    ask('Deux');
    expect(await screen.findByText(/ne répond pas pour le moment/)).toBeTruthy();
});

it('lets a signed-in reader get a WhatsApp link code', async () => {
    api.me.mockResolvedValue({ id: 'r1', numero: 'LEC-000001', email: 'awa@exemple.gn', prenom: 'Awa', nom: 'Camara', organisme: null, categorie: null, emailVerifie: true, conditionsVersion: '1', creeLe: '2026-10-01T09:00:00Z' });
    api.whatsappLink.mockResolvedValue({ lie: false });
    api.whatsappLinkCode.mockResolvedValue({ code: 'K7P2-9QXM', expireLe: '2026-10-16T10:10:00Z', commande: 'LIER K7P2-9QXM' });
    show();
    fireEvent.click(await screen.findByRole('button', { name: /Besoin d’aide/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Lier mon WhatsApp' }));
    expect(await screen.findByText('LIER K7P2-9QXM')).toBeTruthy();
    expect(screen.getByText(/Connecté : l’assistant peut lire vos demandes/)).toBeTruthy();
});
