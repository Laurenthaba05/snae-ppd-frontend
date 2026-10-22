import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// La fenêtre d'aide du personnel : invisible tant que le serveur ne l'a pas activée (et en démonstration), une réponse n'est jamais interprétée comme du HTML, les liens viennent du serveur
// et ne mènent qu'à des écrans de l'application, l'écran courant est transmis, une erreur rend la question à la personne, et tout se fait au clavier.
const fixture = vi.hoisted(() => ({
    assistant: { config: vi.fn(), history: vi.fn(), send: vi.fn(), forget: vi.fn() } as null | Record<string, ReturnType<typeof vi.fn>>,
    me: { user: { id: 'u1' } } as unknown, demo: false, epoch: 1, path: '/app/versements'
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/ui/navigation', () => ({ navigate: vi.fn(), usePath: () => fixture.path }));
import { navigate } from '../../src/ui/navigation';
import { ApiError } from '../../src/core/http';
import { StaffAssistant } from '../../src/ui/StaffAssistant';

const personas = [
    { code: 'MORIBA', nom: 'Moriba', presentation: 'Je suis Moriba, l’assistant virtuel.' },
    { code: 'HENY', nom: 'Heny', presentation: 'Je suis Heny, l’assistante virtuelle.' }
];
const config = (over: Record<string, unknown> = {}) => ({ actif: true, personaParDefaut: 'HENY', personas, accueil: { MORIBA: 'Bonjour, ici Moriba. Que puis-je faire ?', HENY: 'Bonjour, ici Heny. Que puis-je faire ?' }, ...over });
const reply = (over: Record<string, unknown> = {}) => ({ persona: 'HENY', personaNom: 'Heny', reponse: 'Ouvrez **Documents**.', degrade: false, liens: [], ...over });

const launcher = () => screen.getByRole('button', { name: /fenêtre d’aide/i });
const open = async () => { fireEvent.click(launcher()); return await screen.findByRole('dialog', { name: 'Assistant d’aide' }); };
const type = (text: string) => fireEvent.change(screen.getByLabelText('Votre question'), { target: { value: text } });
const send = () => fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
// le texte d'une réponse contient du gras : on le cherche par le texte entier du bloc
const answer = (text: string) => (_: string, node: Element | null) => !!node && node.classList.contains('sa-text') && node.textContent === text;

beforeEach(() => {
    fixture.demo = false; fixture.epoch += 1; fixture.path = '/app/versements'; fixture.me = { user: { id: 'u1' } };
    fixture.assistant = { config: vi.fn().mockResolvedValue(config()), history: vi.fn().mockResolvedValue({ persona: 'HENY', messages: [] }), send: vi.fn().mockResolvedValue(reply()), forget: vi.fn().mockResolvedValue(undefined) };
    vi.mocked(navigate).mockClear();
});
afterEach(cleanup);

it('rien ne s’affiche tant que le serveur n’a pas activé l’assistant, ni en démonstration, ni sans connexion', async () => {
    fixture.assistant!.config!.mockResolvedValue(config({ actif: false }));
    const { container, unmount } = render(<StaffAssistant />);
    await waitFor(() => expect(fixture.assistant!.config).toHaveBeenCalled());
    expect(container.querySelector('.sa-root')).toBeNull();
    unmount();
    fixture.epoch += 1; fixture.assistant!.config!.mockResolvedValue(config()); fixture.demo = true;
    const demo = render(<StaffAssistant />);
    expect(demo.container.querySelector('.sa-root')).toBeNull();
    expect(fixture.assistant!.config).toHaveBeenCalledTimes(1);          // en démonstration, aucun appel
    demo.unmount();
    fixture.demo = false; fixture.assistant = null;
    expect(render(<StaffAssistant />).container.querySelector('.sa-root')).toBeNull();
});

it('si la configuration ne peut pas être lue, l’application reste utilisable sans fenêtre d’aide', async () => {
    fixture.assistant!.config!.mockRejectedValue(new ApiError(503, 'ASSISTANT_UNAVAILABLE', 'indisponible'));
    const { container } = render(<StaffAssistant />);
    await waitFor(() => expect(fixture.assistant!.config).toHaveBeenCalled());
    expect(container.querySelector('.sa-root')).toBeNull();
});

it('le bouton ouvre la fenêtre sur le message d’accueil de l’assistant choisi par défaut, et relit le fil une seule fois', async () => {
    render(<StaffAssistant />);
    const button = await screen.findByRole('button', { name: 'Ouvrir la fenêtre d’aide' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    const dialog = await open();
    expect(within(dialog).getByText('Bonjour, ici Heny. Que puis-je faire ?')).toBeTruthy();
    expect(launcher().getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(screen.getByLabelText('Votre question'));
    await waitFor(() => expect(fixture.assistant!.history).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Fermer l’assistant' }));
    await open();
    expect(fixture.assistant!.history).toHaveBeenCalledTimes(1);
});

it('le fil déjà commencé est relu et l’assistant choisi retrouvé', async () => {
    fixture.assistant!.history!.mockResolvedValue({ persona: 'MORIBA', messages: [{ role: 'USER', contenu: 'Où sont les versements ?', creeLe: '2026-10-21T08:00:00Z' }, { role: 'ASSISTANT', contenu: 'Dans le menu **Collecte**.', creeLe: '2026-10-21T08:00:02Z' }] });
    render(<StaffAssistant />);
    await screen.findByRole('button', { name: 'Ouvrir la fenêtre d’aide' });
    const dialog = await open();
    expect(await within(dialog).findByText('Où sont les versements ?')).toBeTruthy();
    expect(within(dialog).getByText('Collecte').tagName).toBe('STRONG');
    expect((within(dialog).getByLabelText('Assistant') as HTMLSelectElement).value).toBe('MORIBA');
});

it('une question part avec l’assistant choisi et l’écran courant ; la réponse s’affiche avec ses liens, jamais en HTML', async () => {
    fixture.assistant!.send!.mockResolvedValue(reply({
        reponse: 'Voici :\n\n1. Ouvrez **Versements**\n2. Cliquez\n\n<img src=x onerror=alert(1)> et <b>pas du gras</b>',
        liens: [{ cle: 'versements', titre: 'Versements (entrées archivistiques)', route: '/app/versements' }, { cle: 'x', titre: 'Piégé', route: 'https://exemple.org' }]
    }));
    render(<StaffAssistant />);
    await screen.findByRole('button', { name: 'Ouvrir la fenêtre d’aide' });
    const dialog = await open();
    fireEvent.change(within(dialog).getByLabelText('Assistant'), { target: { value: 'MORIBA' } });
    type('Comment faire un versement ?'); send();
    expect(await within(dialog).findByText('Comment faire un versement ?')).toBeTruthy();
    const items = await within(dialog).findAllByRole('listitem');
    expect(items.map(li => li.textContent)).toEqual(['Ouvrez Versements', 'Cliquez']);
    expect(within(dialog).getByText('Versements', { selector: 'strong' })).toBeTruthy();
    expect(fixture.assistant!.send).toHaveBeenCalledWith({ message: 'Comment faire un versement ?', persona: 'MORIBA', page: 'versements' }, expect.any(String));
    // le HTML du modèle est du texte
    expect(dialog.querySelector('img')).toBeNull();
    expect(dialog.querySelector('b')).toBeNull();
    expect(dialog.textContent).toContain('<img src=x onerror=alert(1)>');
    // seul le lien qui mène à un écran de l'application est offert
    const links = within(dialog).getAllByRole('button', { name: /Versements \(entrées archivistiques\)/ });
    expect(links).toHaveLength(1);
    expect(within(dialog).queryByRole('button', { name: /Piégé/ })).toBeNull();
    fireEvent.click(links[0]!);
    expect(navigate).toHaveBeenCalledWith('/app/versements');
    // la zone de saisie est vidée et la fenêtre reste ouverte pour la suite
    expect((screen.getByLabelText('Votre question') as HTMLTextAreaElement).value).toBe('');
});

it('les liens ne valent que pour la dernière réponse ; Entrée envoie, Maj+Entrée va à la ligne', async () => {
    fixture.assistant!.send!.mockResolvedValueOnce(reply({ liens: [{ cle: 'documents', titre: 'Documents', route: '/app/documents' }] })).mockResolvedValueOnce(reply({ reponse: 'Autre réponse.' }));
    render(<StaffAssistant />);
    await screen.findByRole('button', { name: 'Ouvrir la fenêtre d’aide' });
    const dialog = await open();
    const field = screen.getByLabelText('Votre question');
    type('Première'); fireEvent.keyDown(field, { key: 'Enter', shiftKey: true });
    expect(fixture.assistant!.send).not.toHaveBeenCalled();
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(await within(dialog).findByRole('button', { name: /Documents/ })).toBeTruthy();
    type('Seconde'); fireEvent.keyDown(field, { key: 'Enter' });
    expect(await within(dialog).findByText('Autre réponse.')).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: /Documents/ })).toBeNull();
    expect(fixture.assistant!.send).toHaveBeenCalledTimes(2);
});

it('l’écran transmis est celui où se trouve la personne, et rien pour l’accueil', async () => {
    fixture.path = '/app';
    render(<StaffAssistant />);
    await screen.findByRole('button', { name: 'Ouvrir la fenêtre d’aide' });
    await open();
    type('Que faire ici ?'); send();
    await waitFor(() => expect(fixture.assistant!.send).toHaveBeenCalledWith(expect.objectContaining({ page: '' }), expect.any(String)));
});

it('une erreur rend la question à la personne, avec le message du serveur quand il y en a un, et la conversation reste intacte', async () => {
    fixture.assistant!.send!.mockRejectedValueOnce(new ApiError(429, 'ASSISTANT_RATE_LIMIT', 'Vous avez envoyé beaucoup de messages : réessayez dans un moment.'));
    render(<StaffAssistant />);
    await screen.findByRole('button', { name: 'Ouvrir la fenêtre d’aide' });
    const dialog = await open();
    type('Ma question'); send();
    expect((await within(dialog).findByRole('alert')).textContent).toContain('beaucoup de messages');
    expect((screen.getByLabelText('Votre question') as HTMLTextAreaElement).value).toBe('Ma question');   // rien n'est perdu
    expect(within(dialog).queryByText('Ma question', { selector: 'p' })).toBeNull();                       // et rien n'est affiché comme envoyé
    // une panne réseau n'expose pas de détail technique
    fixture.assistant!.send!.mockRejectedValueOnce(new ApiError(0, 'NETWORK_UNCERTAIN', 'La réponse n’est pas confirmée. Vérifiez la ressource ; un rejeu identique conservera la même clé.'));
    send();
    await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toContain('n’a pas pu répondre'));
    expect(within(dialog).getByRole('alert').textContent).not.toContain('rejeu');
});

it('une réponse de secours est signalée comme telle', async () => {
    fixture.assistant!.send!.mockResolvedValue(reply({ degrade: true, reponse: 'Heny est momentanément indisponible. Réessayez dans quelques minutes.' }));
    render(<StaffAssistant />);
    await screen.findByRole('button', { name: 'Ouvrir la fenêtre d’aide' });
    const dialog = await open();
    type('Bonjour'); send();
    expect(await within(dialog).findByText(/Réponse de secours/)).toBeTruthy();
});

it('« Effacer la conversation » vide le fil sans demander autre chose, et reste grisé quand il n’y a rien à effacer', async () => {
    render(<StaffAssistant />);
    await screen.findByRole('button', { name: 'Ouvrir la fenêtre d’aide' });
    const dialog = await open();
    const forget = within(dialog).getByRole('button', { name: 'Effacer la conversation' }) as HTMLButtonElement;
    expect(forget.disabled).toBe(true);
    type('Bonjour'); send();
    await within(dialog).findByText(answer('Ouvrez Documents.'));
    expect(forget.disabled).toBe(false);
    fireEvent.click(forget);
    await waitFor(() => expect(within(dialog).queryByText(answer('Ouvrez Documents.'))).toBeNull());
    expect(fixture.assistant!.forget).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByText('Bonjour, ici Heny. Que puis-je faire ?')).toBeTruthy();                // le message d'accueil revient
});

it('Échap ferme la fenêtre et rend le focus au bouton', async () => {
    render(<StaffAssistant />);
    await screen.findByRole('button', { name: 'Ouvrir la fenêtre d’aide' });
    const dialog = await open();
    fireEvent.keyDown(within(dialog).getByLabelText('Votre question'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Ouvrir la fenêtre d’aide' }));
});

it('les réponses et les questions ne sont pas traduites par l’interface, et la limite de longueur est celle du serveur', async () => {
    render(<StaffAssistant />);
    await screen.findByRole('button', { name: 'Ouvrir la fenêtre d’aide' });
    const dialog = await open();
    expect((screen.getByLabelText('Votre question') as HTMLTextAreaElement).maxLength).toBe(1000);
    type('Question'); send();
    await within(dialog).findByText(answer('Ouvrez Documents.'));
    expect([...dialog.querySelectorAll('.sa-text')].every(node => node.getAttribute('translate') === 'no')).toBe(true);
});

it('la fenêtre n’a aucune violation d’accessibilité détectée automatiquement', async () => {
    fixture.assistant!.send!.mockResolvedValue(reply({ liens: [{ cle: 'documents', titre: 'Documents', route: '/app/documents' }] }));
    const { container } = render(<main><StaffAssistant /></main>);
    await screen.findByRole('button', { name: 'Ouvrir la fenêtre d’aide' });
    await open();
    type('Comment créer un document ?'); send();
    await screen.findByRole('button', { name: /Documents/ });
    await act(async () => undefined);
    const result = await axe.run(container, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
        rules: { 'color-contrast': { enabled: false }, region: { enabled: false }, 'page-has-heading-one': { enabled: false } }
    });
    expect(result.violations.map(v => v.id + ' : ' + v.nodes.map(n => n.target.join(' ')).join(' ; '))).toEqual([]);
});
