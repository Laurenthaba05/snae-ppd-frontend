import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_LOCALE, LOCALES, LOCALE_STORAGE_KEY, parseLocale, registerCatalog, translate, type Locale } from '../core/i18n';
import { DomTranslator } from './domTranslator';

interface LocaleContext { locale: Locale; setLocale: (locale: Locale) => void; tr: (text: string) => string }

/** Sans fournisseur (écrans isolés, tests), la langue est le français et `tr` rend le texte tel quel. */
const Context = createContext<LocaleContext>({ locale: DEFAULT_LOCALE, setLocale: () => undefined, tr: text => text });

let screensLoaded: Promise<void> | null = null;

/** Charge à la demande le catalogue anglais des écrans métier (volumineux : jamais chargé tant que l'interface reste en français). */
export function loadScreenCatalog(): Promise<void> {
    screensLoaded ??= import('../core/i18nScreens').then(module => registerCatalog(module.EN_SCREENS)).catch(() => { screensLoaded = null; });
    return screensLoaded;
}

function readStored(): Locale {
    try { return parseLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY)); } catch { return DEFAULT_LOCALE; }
}

/** La langue de l'interface : mémorisée dans ce navigateur seulement (une préférence de confort), appliquée à l'attribut `lang` du document. */
export function LocaleProvider({ children }: { children: React.ReactNode }) {
    const [locale, setState] = useState<Locale>(readStored);
    const setLocale = useCallback((next: Locale) => {
        setState(next);
        try { window.localStorage.setItem(LOCALE_STORAGE_KEY, next); } catch { /* le stockage peut être refusé : la langue reste celle de la session */ }
    }, []);
    useEffect(() => { document.documentElement.lang = LOCALES.find(l => l.code === locale)?.tag ?? 'fr'; }, [locale]);
    // En anglais, le texte affiché par les écrans (écrits en français) est traduit à la volée ; revenir au français le restitue.
    useEffect(() => {
        if (locale !== 'en' || typeof document === 'undefined') return;
        const translator = new DomTranslator(document.body, () => 'en');
        translator.start();
        let cancelled = false;
        void loadScreenCatalog().then(() => { if (!cancelled) translator.refresh(); });
        return () => { cancelled = true; translator.stop(); };
    }, [locale]);
    const value = useMemo<LocaleContext>(() => ({ locale, setLocale, tr: text => translate(locale, text) }), [locale, setLocale]);
    return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useLocale = (): LocaleContext => useContext(Context);

/** Le sélecteur de langue : la langue en cours est annoncée, le texte de chaque choix est écrit dans sa propre langue. */
export function LanguageSwitch({ className }: { className?: string }) {
    const { locale, setLocale, tr } = useLocale();
    return <label className={className ?? 'language-switch'}>
        <span className="sr-only">{tr('Langue')}</span>
        <select aria-label={tr('Langue')} value={locale} onChange={e => setLocale(parseLocale(e.target.value))}>
            {LOCALES.map(l => <option key={l.code} value={l.code} lang={l.tag}>{l.label}</option>)}
        </select>
    </label>;
}
