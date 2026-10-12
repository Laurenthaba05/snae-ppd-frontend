import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EN, LOCALE_STORAGE_KEY } from '../../src/core/i18n';
// la page des modules lit la session : seule la liste de ses modules sert ici
vi.mock('../../src/auth/session', () => ({ useSession: () => ({}) }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: {} }) }));
import { LanguageSwitch, LocaleProvider, useLocale } from '../../src/ui/i18n';
import { Badge, Busy, Empty, Pagination } from '../../src/ui/components';
import { archiveModules } from '../../src/pages/ArchiveModules';
import { navGroups } from '../../src/design/navigation';

function Sample() {
    const { tr } = useLocale();
    return <div>
        <LanguageSwitch />
        <h1>{tr('Tableau de bord')}</h1>
        <Busy />
        <Empty />
        <Badge value="ACTIF" />
        <Badge value="ACTIF" label="Atelier de Conakry" />
        <Pagination page={0} hasMore count={2} onChange={() => undefined} />
    </div>;
}

beforeEach(() => { try { window.localStorage.removeItem(LOCALE_STORAGE_KEY); } catch { /* sans stockage */ } document.documentElement.lang = ''; });
afterEach(() => { try { window.localStorage.removeItem(LOCALE_STORAGE_KEY); } catch { /* sans stockage */ } });

it('sans fournisseur, tout reste en français', () => {
    render(<Busy />);
    expect(screen.getByText('Chargement des données…')).toBeTruthy();
});

it('en français par défaut, le sélecteur propose les deux langues dans leur propre langue', () => {
    render(<LocaleProvider><Sample /></LocaleProvider>);
    expect(screen.getByRole('heading', { name: 'Tableau de bord' })).toBeTruthy();
    expect(screen.getByText('Chargement des données…')).toBeTruthy();
    const select = screen.getByRole('combobox', { name: 'Langue' }) as HTMLSelectElement;
    expect(select.value).toBe('fr');
    expect([...select.options].map(o => o.textContent)).toEqual(['Français', 'English']);
    expect(document.documentElement.lang).toBe('fr');
});

it('passer en anglais traduit la coque et les composants, laisse en français ce qui ne l’est pas, et se mémorise', () => {
    render(<LocaleProvider><Sample /></LocaleProvider>);
    fireEvent.change(screen.getByRole('combobox', { name: 'Langue' }), { target: { value: 'en' } });
    // le sélecteur lui-même s'annonce maintenant dans la langue choisie
    expect(screen.getByRole('combobox', { name: 'Language' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy();
    expect(screen.getByText('Loading data…')).toBeTruthy();
    expect(screen.getByText('No results')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    // un nom propre ou une donnée métier passe tel quel : on ne traduit que ce que le catalogue connaît
    expect(screen.getByText('Atelier de Conakry')).toBeTruthy();
    expect(screen.getByText('2 items on this page · page 1')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy();
    expect(document.documentElement.lang).toBe('en');
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
});

it('la langue mémorisée est reprise, une valeur inconnue ramène au français', () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
    const first = render(<LocaleProvider><Sample /></LocaleProvider>);
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy();
    first.unmount();
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'klingon');
    render(<LocaleProvider><Sample /></LocaleProvider>);
    expect(screen.getByRole('heading', { name: 'Tableau de bord' })).toBeTruthy();
});

it('le menu est couvert : chaque groupe et chaque module a sa traduction', () => {
    const missing = [
        ...navGroups.map(g => g.label),
        ...archiveModules.map(m => m.title)
    ].filter(text => !EN[text]);
    expect(missing).toEqual([]);
});
