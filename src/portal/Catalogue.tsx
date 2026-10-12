import React, { useEffect, useState } from 'react';
import { navigate, usePath } from '../ui/navigation';
import { Icon } from '../ui/icons';
import { Busy, Empty, ErrorNotice, Field, Modal, Notice } from '../ui/components';
import { ACCESS_MOTIVE_MIN, accessMotiveProblems, documentAction, documentsText, noticeDateText, portalPath } from '../core/portal';
import type { PortalNotice, PortalNoticeDocument, PortalNoticeFilters, PortalNoticeSummary, PortalPage, PortalCategory } from '../core/types';
import { useAction, usePortal } from './context';
import { PLink } from './Shell';

const PAGE_SIZE = 12;

type Loaded<T> = { state: 'loading' } | { state: 'error'; error: unknown } | { state: 'ready'; data: T };
function useLoaded<T>(load: (signal: AbortSignal) => Promise<T>, key: string): Loaded<T> & { retry: () => void } {
    const [value, setValue] = useState<Loaded<T>>({ state: 'loading' });
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        setValue({ state: 'loading' });
        load(controller.signal).then(data => { if (!controller.signal.aborted) setValue({ state: 'ready', data }); }).catch(error => { if (!controller.signal.aborted) setValue({ state: 'error', error }); });
        return () => controller.abort();
    }, [key, attempt]);
    return { ...value, retry: () => setAttempt(n => n + 1) };
}

export function CataloguePage() {
    const { api } = usePortal();
    const path = usePath();
    const params = new URL(path, location.origin).searchParams;
    const q = params.get('q') ?? '';
    const categorie = params.get('categorie') ?? '';
    const page = Math.max(0, Number(params.get('page')) || 0);
    const [term, setTerm] = useState(q);
    useEffect(() => setTerm(q), [q]);
    const filters: PortalNoticeFilters = { q: q || undefined, categorie: categorie || undefined, page, size: PAGE_SIZE };
    const results = useLoaded<PortalPage<PortalNoticeSummary>>(signal => api.notices(filters, signal), JSON.stringify(filters));
    const categories = useLoaded<PortalCategory[]>(signal => api.categories(signal), 'categories');
    const go = (next: Record<string, string | number | null>) => { const merged = { q, categorie, page: null as string | number | null, ...next }; navigate(portalPath('', { ...merged, page: merged.page || null })); };
    const submit = (event: React.FormEvent) => { event.preventDefault(); go({ q: term.trim() }); };
    return <div className="portal-page">
        <section className="portal-hero" aria-labelledby="catalogue-title">
            <h1 id="catalogue-title">Parcourir le patrimoine documentaire</h1>
            <p>Les notices sont ouvertes à tous. La lecture des pages d’un document demande un compte et un abonnement.</p>
            <form className="portal-search" role="search" onSubmit={submit}>
                <label className="sr-only" htmlFor="portal-q">Rechercher dans le catalogue</label>
                <Icon name="search" size={20} />
                <input id="portal-q" type="search" value={term} maxLength={200} placeholder="Un titre, un lieu, un sujet…" onChange={event => setTerm(event.target.value)} />
                <button className="btn primary">Rechercher</button>
            </form>
        </section>
        {categories.state === 'ready' && categories.data.length > 0 && <div className="portal-chips" role="group" aria-label="Catégories">
            <button className={'portal-chip' + (!categorie ? ' active' : '')} aria-pressed={!categorie} onClick={() => go({ categorie: null })}>Toutes</button>
            {categories.data.map(c => <button key={c.code} className={'portal-chip' + (categorie === c.code ? ' active' : '')} aria-pressed={categorie === c.code} onClick={() => go({ categorie: c.code })}>{c.libelle}</button>)}
        </div>}
        {results.state === 'loading' && <Busy label="Recherche en cours…" />}
        {results.state === 'error' && <ErrorNotice error={results.error} onRetry={results.retry} />}
        {results.state === 'ready' && (results.data.items.length === 0
            ? <Empty title="Aucune notice trouvée" description={q || categorie ? 'Essayez d’autres mots ou une autre catégorie.' : 'Aucun bien n’est encore publié dans le catalogue.'} icon="search" />
            : <>
                <p className="portal-count" aria-live="polite">{results.data.total} notice{results.data.total > 1 ? 's' : ''}</p>
                <ul className="portal-results">{results.data.items.map(n => <li key={n.id}><article>
                    <h2><PLink to={'/notices/' + n.id}>{n.intitule}</PLink></h2>
                    <p className="portal-meta">{[n.categorieLibelle, n.dateTexte].filter(Boolean).join(' · ') || 'Notice'}</p>
                    {n.extrait && <p>{n.extrait}</p>}
                    <p className="portal-docs"><Icon name="document" size={15} />{documentsText(n)}</p>
                </article></li>)}</ul>
                <nav className="portal-pager" aria-label="Pagination">
                    <button className="btn small secondary" disabled={page === 0} onClick={() => go({ page: page - 1 })}>Précédente</button>
                    <span>Page {page + 1}</span>
                    <button className="btn small secondary" disabled={!results.data.hasMore} onClick={() => go({ page: page + 1 })}>Suivante</button>
                </nav>
            </>)}
    </div>;
}

const row = (label: string, value: React.ReactNode) => value ? <div><dt>{label}</dt><dd>{value}</dd></div> : null;

/** La demande d'accès à un document que le public ne lit pas librement : le lecteur dit, par écrit, pourquoi il en a besoin. */
function RequestDialog({ doc, onClose }: { doc: PortalNoticeDocument; onClose: () => void }) {
    const { api, reload } = usePortal();
    const [motif, setMotif] = useState('');
    const [sent, setSent] = useState(false);
    const action = useAction();
    const problems = accessMotiveProblems(motif);
    return <Modal title="Demander l’accès" subtitle={doc.titre} onClose={onClose} locked={action.busy}>
        {sent
            ? <div className="portal-receipt"><Notice>Votre demande est déposée. L’institution qui conserve ce document vous répondra par courriel ; vous suivez l’avancement dans <PLink to="/compte">votre compte</PLink>.</Notice>
                <div className="portal-actions"><button className="btn primary" onClick={onClose}>Fermer</button></div></div>
            : <form className="portal-form portal-dialog" noValidate onSubmit={event => {
                event.preventDefault();
                if (problems.length > 0) return;
                void action.run(async () => { await api.requestAccess(doc.id, motif.trim()); await reload(); setSent(true); });
            }}>
                <p className="portal-muted">Ce document n’est pas en lecture libre. L’institution examine chaque demande ; l’accès accordé est limité dans le temps.</p>
                <Field label="Pourquoi avez-vous besoin de ce document ?" hint={`Au moins ${ACCESS_MOTIVE_MIN} caractères.`}><textarea rows={4} value={motif} maxLength={2000} required onChange={event => setMotif(event.target.value)} /></Field>
                {motif.length > 0 && problems.length > 0 && <ul className="portal-issues" aria-live="polite">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
                {action.error !== null && <ErrorNotice error={action.error} />}
                <div className="portal-actions"><button className="btn primary" disabled={action.busy || problems.length > 0}>{action.busy ? 'Envoi…' : 'Envoyer la demande'}</button><button type="button" className="btn secondary" disabled={action.busy} onClick={onClose}>Annuler</button></div>
            </form>}
    </Modal>;
}

function DocumentRow({ doc, noticeId, onRequest }: { doc: PortalNoticeDocument; noticeId: string; onRequest: (doc: PortalNoticeDocument) => void }) {
    const { access, accessRequests } = usePortal();
    const action = documentAction(doc, access, accessRequests);
    return <li>
        <span><Icon name="document" size={18} /><strong>{doc.titre}</strong><small>{doc.pages} page{doc.pages > 1 ? 's' : ''}</small>{doc.acces === 'SUR_DEMANDE' && <small className="portal-tag">Sur demande</small>}</span>
        {action.kind === 'LIRE' && <PLink to={'/lecture/' + doc.id} className="btn primary small">Lire</PLink>}
        {action.kind === 'CONNEXION' && <PLink to="/connexion" params={{ retour: portalPath(doc.acces === 'LIBRE' ? '/lecture/' + doc.id : '/notices/' + noticeId) }} className="btn secondary small">{doc.acces === 'LIBRE' ? 'Se connecter pour lire' : 'Se connecter pour demander l’accès'}</PLink>}
        {action.kind === 'ABONNEMENT' && <PLink to="/formules" className="btn secondary small">{doc.acces === 'LIBRE' ? 'S’abonner pour lire' : 'S’abonner pour demander l’accès'}</PLink>}
        {action.kind === 'VOIR_DEMANDE' && <PLink to="/compte" className="btn secondary small">Voir ma demande</PLink>}
        {action.kind === 'DEMANDER' && <button className="btn primary small" onClick={() => onRequest(doc)}>Demander l’accès</button>}
        {action.kind === 'EN_COURS' && <PLink to="/compte" className="btn secondary small">Suivre ma demande</PLink>}
        {action.note && <p className="portal-doc-note" role="status">{action.note}</p>}
    </li>;
}

export function NoticePage({ id }: { id: string }) {
    const { api } = usePortal();
    const notice = useLoaded<PortalNotice>(signal => api.notice(id, signal), id);
    const [requesting, setRequesting] = useState<PortalNoticeDocument | null>(null);
    if (notice.state === 'loading') return <div className="portal-page"><Busy label="Chargement de la notice…" /></div>;
    if (notice.state === 'error') return <div className="portal-page"><ErrorNotice error={notice.error} onRetry={notice.retry} /><p><PLink to="">Retour au catalogue</PLink></p></div>;
    const n = notice.data;
    const date = noticeDateText(n);
    return <div className="portal-page">
        <p className="portal-back"><PLink to="">← Retour au catalogue</PLink></p>
        <article className="portal-notice">
            <header><p className="portal-meta">{[n.categorieLibelle, date].filter(Boolean).join(' · ')}</p><h1>{n.intitule}</h1></header>
            {n.resume && <p className="portal-summary">{n.resume}</p>}
            <dl className="portal-fields">
                {row('Langues', n.langues.join(', '))}{row('Écritures', n.ecritures.join(', '))}{row('Support', n.support)}{row('Matériaux', n.materiaux)}{row('Dimensions', n.dimensions)}
                {row('Pagination / durée', n.paginationDuree)}{row('Date', date)}{row('Attribution', n.attributionIncertaine ? 'Attribution incertaine' : null)}{row('Bibliographie', n.bibliographie)}
            </dl>
            <section className="portal-documents" aria-labelledby="documents-title">
                <h2 id="documents-title">Documents</h2>
                {n.documents.length === 0 ? <p className="portal-muted">Aucun document numérisé n’est communicable pour le moment.</p> : <ul>{n.documents.map(d => <DocumentRow key={d.id} doc={d} noticeId={n.id} onRequest={setRequesting} />)}</ul>}
            </section>
        </article>
        {requesting && <RequestDialog doc={requesting} onClose={() => setRequesting(null)} />}
    </div>;
}
