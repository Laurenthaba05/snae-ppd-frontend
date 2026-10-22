import React, { useEffect, useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { ApiError } from '../core/http';
import { MAX_QUESTION, blocksOf, pageOf, safeRoute } from '../core/assistant';
import type { AssistantConfig, AssistantPersona, ChatMessage, Inline } from '../core/assistant';
import type { AssistantApi } from '../api/assistant';
import { Icon } from './icons';
import { navigate, usePath } from './navigation';

const uid = () => crypto.randomUUID();

const inline = (parts: Inline[]) => parts.map((part, index) => part.bold ? <strong key={index}>{part.text}</strong> : <React.Fragment key={index}>{part.text}</React.Fragment>);

/** Le texte d'une réponse, jamais interprété comme du HTML : paragraphes, listes et gras seulement. `translate="no"` : une réponse du modèle n'est pas traduite par l'interface. */
function Answer({ text }: { text: string }) {
    return <div className="sa-text" translate="no">{blocksOf(text).map((block, index) => block.kind === 'p'
        ? <p key={index}>{inline(block.inline)}</p>
        : block.kind === 'ul'
            ? <ul key={index}>{block.items.map((item, i) => <li key={i}>{inline(item)}</li>)}</ul>
            : <ol key={index}>{block.items.map((item, i) => <li key={i}>{inline(item)}</li>)}</ol>)}</div>;
}

const messageOf = (error: unknown) => error instanceof ApiError && error.status !== 0 && error.status !== 401 ? error.message : 'L’assistant n’a pas pu répondre. Réessayez dans un instant.';

/**
 * La fenêtre d'aide du personnel : Moriba ou Heny explique comment utiliser l'application. Elle n'apparaît que si le serveur l'a activée, jamais en démonstration, et chaque personne a
 * sa conversation. L'assistant ne voit aucune donnée de l'archive et ne fait rien à sa place : il explique et propose le lien vers l'écran concerné (pris dans le guide du serveur).
 */
export function StaffAssistant() {
    const { assistant, me, demo, epoch } = useSession();
    const path = usePath();
    return <AssistantWindow client={assistant && me && !demo ? assistant : null} resetKey={epoch + ':' + (me?.user.id ?? '')} path={path} />;
}

/** La fenêtre elle-même, sans session : le client d'API (absent : rien ne s'affiche), la clé qui la remet à zéro (une autre session) et l'adresse courante. */
export function AssistantWindow({ client: assistant, resetKey, path, initialOpen = false, initialMessages }: { client: AssistantApi | null; resetKey: string; path: string; initialOpen?: boolean; initialMessages?: ChatMessage[] }) {
    const [config, setConfig] = useState<AssistantConfig | null>(null);
    // l'état de départ (aperçu, essais) ne sert qu'à la première ouverture et à chaque remise à zéro de la session
    const start = useRef({ open: initialOpen, messages: initialMessages ?? [] });
    const [open, setOpen] = useState(initialOpen);
    const [persona, setPersona] = useState<AssistantPersona>('HENY');
    const [messages, setMessages] = useState<ChatMessage[]>(initialMessages ?? []);
    const [draft, setDraft] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const loaded = useRef(false);
    const launcher = useRef<HTMLButtonElement>(null);
    const field = useRef<HTMLTextAreaElement>(null);
    const log = useRef<HTMLDivElement>(null);
    const active = !!assistant;

    // la configuration se lit une fois par session : sans assistant activé, rien n'est affiché
    useEffect(() => {
        loaded.current = false; setConfig(null); setMessages(start.current.messages); setOpen(start.current.open); setError('');
        if (!assistant) return;
        const controller = new AbortController();
        assistant.config(controller.signal).then(value => { setConfig(value); setPersona(value.personaParDefaut); }).catch(() => undefined);
        return () => controller.abort();
    }, [assistant, resetKey]);

    // le fil se relit à la première ouverture, pour retrouver ce qui a été dit
    useEffect(() => {
        if (!open || !assistant || !config?.actif || loaded.current) return;
        loaded.current = true;
        const controller = new AbortController();
        assistant.history(controller.signal).then(history => {
            setPersona(history.persona);
            setMessages(current => current.length ? current : history.messages.map(message => ({ id: uid(), role: message.role, text: message.contenu })));
        }).catch(() => { loaded.current = false; });
        return () => controller.abort();
    }, [open, assistant, config?.actif]);

    useEffect(() => { if (open) field.current?.focus(); }, [open]);
    useEffect(() => { const node = log.current; if (node) node.scrollTop = node.scrollHeight; }, [messages, busy, open]);

    if (!active || !config?.actif) return null;
    const personas = config.personas;
    const current = personas.find(item => item.code === persona) ?? personas[0];
    const name = current?.nom ?? 'Assistant';

    const close = () => { setOpen(false); launcher.current?.focus(); };
    const send = async () => {
        const text = draft.trim();
        if (!text || busy || !assistant) return;
        setBusy(true); setError(''); setDraft('');
        const mine: ChatMessage = { id: uid(), role: 'USER', text };
        setMessages(list => [...list, mine]);
        try {
            const reply = await assistant.send({ message: text, persona, page: pageOf(path) }, uid());
            setPersona(reply.persona);
            // les liens et l'avis « réponse de secours » ne valent que pour la dernière réponse
            setMessages(list => [...list.map(item => ({ ...item, links: undefined, degraded: undefined })),
                { id: uid(), role: 'ASSISTANT', text: reply.reponse, degraded: reply.degrade, links: reply.liens.filter(link => safeRoute(link.route)) }]);
        } catch (failure) {
            setMessages(list => list.filter(item => item.id !== mine.id));
            setDraft(text);
            setError(messageOf(failure));
        } finally { setBusy(false); field.current?.focus(); }
    };
    const forget = async () => {
        if (!assistant || busy) return;
        setBusy(true); setError('');
        try { await assistant.forget(uid()); setMessages([]); }
        catch (failure) { setError(messageOf(failure)); }
        finally { setBusy(false); field.current?.focus(); }
    };
    const onKey = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); }
    };

    return <div className="sa-root">
        {open && <section id="staff-assistant-panel" className="sa-panel" role="dialog" aria-label="Assistant d’aide" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } }}>
            <header className="sa-head">
                <span className={'sa-avatar ' + persona.toLowerCase()} aria-hidden="true">{name.charAt(0)}</span>
                <div className="sa-title"><strong translate="no">{name}</strong><span>Aide à l’utilisation du SNAE-PPD</span></div>
                <button type="button" className="sa-icon" aria-label="Fermer l’assistant" onClick={close}><Icon name="close" size={18} /></button>
            </header>
            <div className="sa-bar">
                <label>Assistant
                    <select value={persona} disabled={busy} onChange={event => setPersona(event.target.value as AssistantPersona)}>
                        {personas.map(item => <option key={item.code} value={item.code} translate="no">{item.nom}</option>)}
                    </select>
                </label>
                <button type="button" className="sa-forget" disabled={busy || messages.length === 0} onClick={() => void forget()}>Effacer la conversation</button>
            </div>
            <div className="sa-log" ref={log} role="log" aria-live="polite" aria-relevant="additions" aria-label="Conversation" tabIndex={0}>
                <article className="sa-msg bot"><Answer text={config.accueil[persona] ?? current?.presentation ?? ''} /></article>
                {messages.map(message => <article key={message.id} className={'sa-msg ' + (message.role === 'USER' ? 'me' : 'bot')}>
                    <span className="sr-only">{message.role === 'USER' ? 'Vous :' : name + ' :'}</span>
                    {message.role === 'USER' ? <div className="sa-text" translate="no"><p>{message.text}</p></div> : <Answer text={message.text} />}
                    {message.degraded && <p className="sa-note">Réponse de secours : l’assistant est momentanément indisponible.</p>}
                    {!!message.links?.length && <div className="sa-links" aria-label="Écrans concernés">{message.links.map(link => <button key={link.cle} type="button" className="sa-link" onClick={() => navigate(safeRoute(link.route)!)}>
                        <span translate="no">{link.titre}</span><Icon name="arrow" size={14} /></button>)}</div>}
                </article>)}
                {busy && <p className="sa-typing" role="status">{name} écrit…</p>}
            </div>
            {error && <div className="sa-error" role="alert">{error}</div>}
            <form className="sa-form" onSubmit={event => { event.preventDefault(); void send(); }}>
                <label className="sr-only" htmlFor="staff-assistant-question">Votre question</label>
                <textarea id="staff-assistant-question" ref={field} rows={2} maxLength={MAX_QUESTION} value={draft} placeholder="Posez votre question…" disabled={busy} onChange={event => setDraft(event.target.value)} onKeyDown={onKey} />
                <button type="submit" className="sa-send" disabled={busy || !draft.trim()} aria-label="Envoyer"><Icon name="send" size={18} /></button>
            </form>
            <p className="sa-privacy">L’assistant explique, vous agissez : il ne voit aucune donnée des archives. N’y écrivez rien de confidentiel ; la conversation s’efface après un délai fixé par l’institution.</p>
        </section>}
        <button ref={launcher} type="button" className={'sa-launcher' + (open ? ' on' : '')} aria-label={open ? 'Fermer la fenêtre d’aide' : 'Ouvrir la fenêtre d’aide'} aria-expanded={open} aria-controls="staff-assistant-panel" onClick={() => open ? close() : setOpen(true)}>
            <Icon name={open ? 'close' : 'help'} size={22} /><span>Aide</span>
        </button>
    </div>;
}
