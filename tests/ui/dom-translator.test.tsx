import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { registerCatalog, resetCatalogs } from '../../src/core/i18n';
import { DomTranslator } from '../../src/ui/domTranslator';
import { LanguageSwitch, LocaleProvider } from '../../src/ui/i18n';

beforeEach(() => {
    resetCatalogs();
    registerCatalog({
        'Nouvelle notice': 'New record', 'Enregistrer': 'Save', 'Titre de la notice': 'Record title', 'Rechercher un mot': 'Search a word', 'Aucune pièce.': 'No item.',
        'Sur {n} pièces : {n} validées': 'Out of {1} items: {2} validated', 'Fermer la fenêtre': 'Close the window'
    });
    window.localStorage.clear();
});
afterEach(() => { resetCatalogs(); window.localStorage.clear(); });

function mount(html: string) {
    const root = document.createElement('div');
    root.innerHTML = html;
    document.body.appendChild(root);
    return root;
}

it('traduit les textes et les attributs affichés, et restitue le français à l’arrêt', () => {
    const root = mount('<h2>Nouvelle notice</h2><button aria-label="Fermer la fenêtre">Enregistrer</button><input placeholder="Rechercher un mot" value="Nouvelle notice"><p>Texte libre sans catalogue</p>');
    const translator = new DomTranslator(root);
    translator.start();
    expect(root.querySelector('h2')!.textContent).toBe('New record');
    expect(root.querySelector('button')!.textContent).toBe('Save');
    expect(root.querySelector('button')!.getAttribute('aria-label')).toBe('Close the window');
    expect(root.querySelector('input')!.getAttribute('placeholder')).toBe('Search a word');
    expect((root.querySelector('input') as HTMLInputElement).value).toBe('Nouvelle notice'); // la saisie n'est jamais touchée
    expect(root.querySelector('p')!.textContent).toBe('Texte libre sans catalogue');
    translator.stop();
    expect(root.querySelector('h2')!.textContent).toBe('Nouvelle notice');
    expect(root.querySelector('button')!.textContent).toBe('Enregistrer');
    expect(root.querySelector('button')!.getAttribute('aria-label')).toBe('Fermer la fenêtre');
    root.remove();
});

it('traduit ce qui s’ajoute ensuite et ce que l’application réécrit', async () => {
    const root = mount('<div id="zone"></div>');
    const translator = new DomTranslator(root);
    translator.start();
    const zone = root.querySelector('#zone')!;
    zone.innerHTML = '<span>Aucune pièce.</span>';
    await waitFor(() => expect(zone.textContent).toBe('No item.'));
    // l'application remplace le texte par un autre texte français du catalogue
    (zone.firstChild!.firstChild as Text).data = 'Enregistrer';
    await waitFor(() => expect(zone.textContent).toBe('Save'));
    // un attribut ajouté après coup
    zone.firstElementChild!.setAttribute('title', 'Nouvelle notice');
    await waitFor(() => expect(zone.firstElementChild!.getAttribute('title')).toBe('New record'));
    translator.stop();
    expect(zone.textContent).toBe('Enregistrer');
    expect(zone.firstElementChild!.getAttribute('title')).toBe('Nouvelle notice');
    root.remove();
});

it('applique les modèles à valeurs et laisse intacts le code, les zones de saisie et les éléments exclus', () => {
    const root = mount('<p>Sur 12 pièces : 9 validées</p><code>Enregistrer</code><pre>Enregistrer</pre><textarea>Enregistrer</textarea><div translate="no">Enregistrer</div><div data-no-translate>Enregistrer</div>');
    const translator = new DomTranslator(root);
    translator.start();
    expect(root.querySelector('p')!.textContent).toBe('Out of 12 items: 9 validated');
    for (const selector of ['code', 'pre', 'textarea', '[translate="no"]', '[data-no-translate]']) expect(root.querySelector(selector)!.textContent).toBe('Enregistrer');
    translator.stop();
    root.remove();
});

it('un contenu qui déclare sa propre langue n’est pas traduit : le choix « Français » du sélecteur reste en français', () => {
    registerCatalog({ 'Français': 'French' });
    const root = mount('<p lang="en">Enregistrer</p><span lang="fr-GN">Enregistrer</span><div lang="fr"><b>Enregistrer</b></div><p>Enregistrer</p>');
    const translator = new DomTranslator(root);
    translator.start();
    expect([...root.children].map(child => child.textContent)).toEqual(['Save', 'Enregistrer', 'Enregistrer', 'Save']);
    translator.stop();
    root.remove();
    render(<LocaleProvider><LanguageSwitch /></LocaleProvider>);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'en' } });
    expect(screen.getByRole('option', { name: 'Français' })).toBeTruthy();
});

it('un nœud réécrit par React est retraduit sans boucle', async () => {
    function Counter() {
        const [n, setN] = React.useState(0);
        return <div><span>{n === 0 ? 'Aucune pièce.' : 'Enregistrer'}</span><button onClick={() => setN(1)}>Nouvelle notice</button></div>;
    }
    render(<LocaleProvider><LanguageSwitch /><Counter /></LocaleProvider>);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'en' } });
    await waitFor(() => expect(screen.getByText('No item.')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'New record' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'New record' }));
    await waitFor(() => expect(screen.getByText('Save')).toBeTruthy());
    // retour au français : tout est restitué
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'fr' } });
    await waitFor(() => expect(screen.getByText('Enregistrer')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Nouvelle notice' })).toBeTruthy();
});

it('la langue reste le français tant que l’anglais n’est pas choisi', () => {
    render(<LocaleProvider><p>Nouvelle notice</p></LocaleProvider>);
    expect(screen.getByText('Nouvelle notice')).toBeTruthy();
    act(() => undefined);
});
