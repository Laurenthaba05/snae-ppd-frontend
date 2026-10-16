import { translate, type Locale } from '../core/i18n';

/**
 * Traduit le texte affiché d'une page déjà rendue : les nœuds texte et les attributs qui portent du texte (`aria-label`, `title`, `placeholder`, `alt`…) dont le contenu
 * est un texte français du catalogue. Les écrans restent écrits en français ; aucun composant n'a à appeler `tr`. Un texte absent du catalogue reste en français.
 *
 * Ce qui n'est jamais touché : le contenu des champs de saisie, des zones de code (`code`, `pre`, `textarea`), les éléments marqués `translate="no"` ou qui déclarent une autre
 * langue que la page (`lang="fr"`), les scripts et styles.
 * Le français d'origine est mémorisé pour chaque nœud : revenir au français le restitue exactement, et un texte que l'application réécrit est retraduit.
 */
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE', 'PRE', 'KBD', 'SAMP', 'TEMPLATE', 'IFRAME', 'CANVAS', 'SVG']);
const ATTRIBUTES = ['aria-label', 'title', 'placeholder', 'alt', 'aria-description', 'aria-placeholder', 'aria-roledescription'];

interface Tracked { fr: string; en: string }

export class DomTranslator {
    private readonly texts = new WeakMap<Node, Tracked>();
    private readonly attributes = new WeakMap<Element, Map<string, Tracked>>();
    private observer: MutationObserver | null = null;
    private active = false;

    constructor(private readonly root: Node, private readonly locale: () => Locale = () => 'en') { }

    /** Un élément qui déclare sa propre langue (`lang="fr"`, comme le choix « Français » du sélecteur) n'est pas dans la langue de la page : son texte reste tel qu'il est écrit. */
    private foreign(element: Element): boolean {
        const lang = element.getAttribute('lang')?.trim().toLowerCase();
        return !!lang && lang.split('-')[0] !== this.locale();
    }

    private skipped(node: Node | null): boolean {
        for (let current: Node | null = node; current; current = current.parentNode) {
            if (current.nodeType !== Node.ELEMENT_NODE) continue;
            const element = current as Element;
            if (SKIP_TAGS.has(element.tagName.toUpperCase())) return true;
            if (element.getAttribute('translate') === 'no' || element.hasAttribute('data-no-translate') || element.getAttribute('contenteditable') === 'true' || this.foreign(element)) return true;
            if (element === this.root) break; // ce qui entoure la zone suivie (la page elle-même) n'en décide pas
        }
        return false;
    }

    private translateText(node: Text): void {
        const known = this.texts.get(node);
        const data = node.data;
        if (known && data === known.en) return; // notre propre écriture
        if (this.skipped(node.parentNode)) return;
        const english = translate(this.locale(), data);
        if (english === data) { if (known) this.texts.delete(node); return; }
        this.texts.set(node, { fr: data, en: english });
        node.data = english;
    }

    private translateAttributes(element: Element): void {
        if (!element.hasAttributes() || this.skipped(element)) return;
        let tracked = this.attributes.get(element);
        for (const name of ATTRIBUTES) {
            const value = element.getAttribute(name);
            if (value === null) continue;
            const known = tracked?.get(name);
            if (known && value === known.en) continue;
            const english = translate(this.locale(), value);
            if (english === value) { tracked?.delete(name); continue; }
            if (!tracked) { tracked = new Map(); this.attributes.set(element, tracked); }
            tracked.set(name, { fr: value, en: english });
            element.setAttribute(name, english);
        }
    }

    private walk(node: Node): void {
        if (node.nodeType === Node.TEXT_NODE) { this.translateText(node as Text); return; }
        if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE && node.nodeType !== Node.DOCUMENT_NODE) return;
        if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            if (SKIP_TAGS.has(element.tagName.toUpperCase()) || element.getAttribute('translate') === 'no' || element.hasAttribute('data-no-translate') || this.foreign(element)) return;
            this.translateAttributes(element);
        }
        for (let child = node.firstChild; child; child = child.nextSibling) this.walk(child);
    }

    private restore(node: Node): void {
        if (node.nodeType === Node.TEXT_NODE) {
            const known = this.texts.get(node);
            if (known && (node as Text).data === known.en) (node as Text).data = known.fr;
            this.texts.delete(node);
            return;
        }
        if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            const tracked = this.attributes.get(element);
            if (tracked) {
                for (const [name, entry] of tracked) if (element.getAttribute(name) === entry.en) element.setAttribute(name, entry.fr);
                this.attributes.delete(element);
            }
        }
        for (let child = node.firstChild; child; child = child.nextSibling) this.restore(child);
    }

    private handle(records: MutationRecord[]): void {
        const observer = this.observer;
        observer?.disconnect(); // nos propres écritures ne se retraitent pas
        try {
            for (const record of records) {
                if (record.type === 'childList') record.addedNodes.forEach(added => this.walk(added));
                else if (record.type === 'characterData') this.translateText(record.target as Text);
                else if (record.type === 'attributes') this.translateAttributes(record.target as Element);
            }
        } finally {
            if (this.active) this.observe();
        }
    }

    private observe(): void {
        this.observer?.observe(this.root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTES });
    }

    /** Traduit ce qui est déjà affiché, puis suit les changements de la page. */
    start(): void {
        if (this.active) return;
        this.active = true;
        this.walk(this.root);
        if (typeof MutationObserver === 'undefined') return;
        this.observer = new MutationObserver(records => this.handle(records));
        this.observe();
    }

    /** Cesse de suivre la page et restitue le français d'origine de ce qui a été traduit. */
    stop(): void {
        this.active = false;
        this.observer?.disconnect();
        this.observer = null;
        this.restore(this.root);
    }

    /** Retraduit toute la page (un catalogue complémentaire vient d'être chargé). */
    refresh(): void {
        if (!this.active) return;
        this.observer?.disconnect();
        try { this.walk(this.root); } finally { if (this.active) this.observe(); }
    }
}

