import React, { useEffect, useRef, useState } from 'react';
import { ApiError } from '../core/http';
import { Icon } from '../ui/icons';
import type { AssistantConfig, AssistantPersona, WhatsAppLinkCode } from '../api/portal';
import { usePortal } from './context';

interface Line { role: 'user' | 'assistant' | 'notice'; text: string; persona?: string }

const STORE = 'snae-assistant-conversation';
const read = (): string | null => { try { return sessionStorage.getItem(STORE); } catch { return null; } };
const write = (token: string | null) => { try { if (token) sessionStorage.setItem(STORE, token); else sessionStorage.removeItem(STORE); } catch { /* stockage indisponible : la conversation repart à zéro */ } };

/** Le gras Markdown (**…**) des réponses, sans jamais injecter de HTML. */
function Rich({ text }: { text: string }) {
    return <>{text.split('\n').map((line, i) => <React.Fragment key={i}>{i > 0 && <br />}
        {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <strong key={j}>{part.slice(2, -2)}</strong> : part)}
    </React.Fragment>)}</>;
}

function failure(error: unknown): string {
    if (error instanceof ApiError) {
        if (error.status === 429) return error.message || 'Trop de messages : réessayez dans un moment.';
        if (error.status === 503 || error.status === 0) return 'L’assistant ne répond pas pour le moment. Réessayez dans quelques minutes.';
        return error.message;
    }
    return 'L’assistant ne répond pas pour le moment.';
}

/**
 * L'assistant virtuel Moriba / Heny : une fenêtre de discussion flottante sur tout le portail. Il guide dans les démarches et, pour un lecteur connecté, lit ses demandes
 * et abonnements (le serveur reconnaît la session). Invisible si l'institution ne l'a pas activé.
 */
export function PortalAssistant() {
    const { api, reader } = usePortal();
    const [config, setConfig] = useState<AssistantConfig | null>(null);
    const [open, setOpen] = useState(false);
    const [persona, setPersona] = useState<AssistantPersona>('HENY');
    const [lines, setLines] = useState<Line[]>([]);
    const [draft, setDraft] = useState('');
    const [busy, setBusy] = useState(false);
    const token = useRef<string | null>(read());
    const log = useRef<HTMLDivElement>(null);
    const input = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        const controller = new AbortController();
        void (async () => {
            try {
                const c = await api.assistantConfig(controller.signal);
                if (!c?.actif) return;
                setConfig(c); setPersona(c.personaParDefaut);
                setLines([{ role: 'assistant', text: c.accueil[c.personaParDefaut] ?? '', persona: c.personas.find(p => p.code === c.personaParDefaut)?.nom }]);
            } catch { /* assistant absent ou désactivé : rien à afficher */ }
        })();
        return () => controller.abort();
    }, [api]);
    useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [lines, busy]);
    useEffect(() => { if (open) input.current?.focus(); }, [open]);

    if (!config) return null;
    const name = (code: AssistantPersona) => config.personas.find(p => p.code === code)?.nom ?? code;

    const choose = (code: AssistantPersona) => {
        if (code === persona) return;
        setPersona(code);
        setLines(current => [...current, { role: 'assistant', text: config.accueil[code] ?? '', persona: name(code) }]);
    };

    const send = async () => {
        const message = draft.trim();
        if (!message || busy) return;
        setDraft(''); setBusy(true);
        setLines(current => [...current, { role: 'user', text: message }]);
        try {
            const answer = await api.assistantMessage({ conversation: token.current, persona, message });
            if (answer.conversation) { token.current = answer.conversation; write(answer.conversation); }
            setLines(current => [...current, { role: answer.degrade ? 'notice' : 'assistant', text: answer.reponse, persona: answer.personaNom }]);
        } catch (error) {
            setLines(current => [...current, { role: 'notice', text: failure(error) }]);
        } finally { setBusy(false); }
    };

    const restart = () => { token.current = null; write(null); setLines([{ role: 'assistant', text: config.accueil[persona] ?? '', persona: name(persona) }]); };

    return <div className="assistant-dock">
        {open && <section className="assistant-panel" role="dialog" aria-label={'Assistant virtuel ' + name(persona)}>
            <header className="assistant-head">
                <div><strong>{name(persona)}</strong><small>Assistant virtuel des Archives · 24 h/24</small></div>
                <button type="button" className="assistant-icon" onClick={() => setOpen(false)} aria-label="Fermer l’assistant"><Icon name="close" size={18} /></button>
            </header>
            <div className="assistant-personas" role="group" aria-label="Choisir votre assistant">
                {config.personas.map(p => <button key={p.code} type="button" aria-pressed={persona === p.code} onClick={() => choose(p.code)}>{p.nom}</button>)}
                <button type="button" className="assistant-restart" onClick={restart}>Nouvelle conversation</button>
            </div>
            <div className="assistant-log" ref={log} role="log" aria-live="polite">
                {lines.map((line, i) => <div key={i} className={'assistant-line ' + line.role}>
                    {line.role === 'assistant' && line.persona && <span className="assistant-who">{line.persona}</span>}
                    <p><Rich text={line.text} /></p>
                </div>)}
                {busy && <div className="assistant-line assistant typing" aria-label={name(persona) + ' écrit…'}><p><span /><span /><span /></p></div>}
            </div>
            <form className="assistant-form" onSubmit={event => { event.preventDefault(); void send(); }}>
                <label className="sr-only" htmlFor="assistant-input">Votre question</label>
                <textarea id="assistant-input" ref={input} rows={2} maxLength={1000} value={draft} placeholder="Posez votre question…" onChange={event => setDraft(event.target.value)}
                    onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} />
                <button type="submit" className="btn primary small" disabled={busy || !draft.trim()} aria-label="Envoyer"><Icon name="send" size={16} /></button>
            </form>
            <p className="assistant-note">{reader ? 'Connecté : l’assistant peut lire vos demandes et abonnements.' : 'Connectez-vous pour que l’assistant suive vos demandes.'} Ne donnez jamais votre mot de passe.</p>
            {config.whatsapp && <WhatsAppCorner number={config.whatsappNumero} />}
        </section>}
        <button type="button" className="assistant-launcher" aria-expanded={open} onClick={() => setOpen(value => !value)}>
            <Icon name={open ? 'close' : 'help'} size={20} /><span>{open ? 'Fermer' : 'Besoin d’aide ? ' + name(persona)}</span>
        </button>
    </div>;
}

/** Le canal WhatsApp : le lien pour écrire à l'assistant et, pour un lecteur connecté, la liaison de son numéro (code à usage unique). */
function WhatsAppCorner({ number }: { number: string | null }) {
    const { api, reader, expired } = usePortal();
    const [linked, setLinked] = useState<boolean | null>(null);
    const [code, setCode] = useState<WhatsAppLinkCode | null>(null);
    const [error, setError] = useState<string | null>(null);
    const readerId = reader?.id;
    useEffect(() => {
        if (!readerId) { setLinked(null); setCode(null); return; }
        const controller = new AbortController();
        api.whatsappLink(controller.signal).then(r => setLinked(r.lie), () => setLinked(null));
        return () => controller.abort();
    }, [api, readerId]);
    const act = async (action: () => Promise<void>) => { setError(null); try { await action(); } catch (e) { if (!expired(e)) setError(failure(e)); } };
    return <div className="assistant-whatsapp">
        {number && <a href={'https://wa.me/' + number} target="_blank" rel="noopener noreferrer">Écrire à l’assistant sur WhatsApp</a>}
        {reader && linked === false && !code && <button type="button" className="portal-link-button" onClick={() => void act(async () => setCode(await api.whatsappLinkCode()))}>Lier mon WhatsApp</button>}
        {reader && code && <p role="status">Envoyez <strong>{code.commande}</strong> sur WhatsApp avant {new Date(code.expireLe).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.</p>}
        {reader && linked && <button type="button" className="portal-link-button" onClick={() => void act(async () => { await api.whatsappUnlink(); setLinked(false); setCode(null); })}>Délier mon WhatsApp</button>}
        {error && <p className="assistant-error" role="alert">{error}</p>}
    </div>;
}
