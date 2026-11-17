import React, { useEffect, useState } from 'react';
import { PublicDocumentsApi, type PublicFile } from '../api/publicDocuments';
import { Busy, ErrorNotice, Field, Notice, Pagination, useResource } from '../ui/components';
import { DocumentPaymentPanel } from './DocumentPaymentPanel';
import { usePath } from '../ui/navigation';
import { usePortal } from './context';
import { PLink } from './Shell';
const api = new PublicDocumentsApi();

export function PublicDocumentsPage({ client = api }: { client?: PublicDocumentsApi }) {
    const [input, setInput] = useState('');
    const [term, setTerm] = useState('');
    const [page, setPage] = useState(0);
    const q = useResource(s => client.list(term, page, s), `public-documents:${term}:${page}`);
    return <div className="portal-page">
        <h1>Documents publiés</h1><p>Les premières 20 % des pages sont lisibles gratuitement, arrondies à la page supérieure. La lecture intégrale nécessite un compte et un paiement validé. Le téléchargement est désactivé.</p>
        <p>Recherchez dans les titres, les références et le contenu des documents publiés.</p>
        <form onSubmit={e => { e.preventDefault(); setPage(0); setTerm(input.trim()); }}>
            <Field label="Rechercher un document"><input type="search" value={input} onChange={e => setInput(e.target.value)} minLength={2} maxLength={100} /></Field>
            <button className="btn primary" disabled={q.loading}>Rechercher</button>
        </form>
        {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : q.data && <>
            {!q.data.items.length && <Notice>Aucun document public ne correspond à cette recherche.</Notice>}
            <ul className="public-document-results">{q.data.items.map(d => <li key={d.id}>
                <h2><PLink to={'/documents/' + d.id}>{d.title}</PLink></h2><p>{d.reference}{d.date ? ` · ${d.date}` : ''}</p>
                {!!d.matches?.length && <ul aria-label="Pages trouvées">{d.matches.map(m => <li key={m.fileId + ':' + m.page}>
                    <PLink to={'/documents/' + d.id} params={{ file: m.fileId, page: m.page, q: term }}>Voir « {term} » — page {m.page}</PLink>
                </li>)}</ul>}
                {d.matchesTruncated && <p>Les 20 premières correspondances sont affichées. Précisez votre recherche.</p>}
            </li>)}</ul>
            <Pagination page={page} hasMore={q.data.hasMore} count={q.data.items.length} onChange={setPage} />
        </>}
    </div>;
}

export function PublicDocumentPage({ id, client = api }: { id: string; client?: PublicDocumentsApi }) {
    const q = useResource(s => client.document(id, s), `public-document:${id}`);
    const path = usePath();
    const params = new URL(path, location.origin).searchParams;
    const requestedFile = params.get('file');
    const number = Number(params.get('page') ?? '1');
    const page = Number.isSafeInteger(number) && number >= 1 ? number : 1;
    const term = (params.get('q') ?? '').slice(0, 100);
    const file = q.data?.files.find(f => f.id === requestedFile) ?? q.data?.files[0];
    const portal = usePortal();
    const reader = !!portal?.reader;
    return <div className="portal-page">
        <PLink to="/documents">← Documents publiés</PLink>
        {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : q.data && <>
            <h1>{q.data.document.title}</h1><p>{q.data.document.reference}</p>
            {q.data.files.length > 1 && <ul>{q.data.files.map(f => <li key={f.id}><PLink to={'/documents/' + id} params={{ file: f.id, page: 1, q: term }}>{f.filename}</PLink></li>)}</ul>}
            {file && <PublicPreview key={file.id + ':' + reader} client={client} documentId={id} file={file} page={page} term={term} reader={reader} />}
        </>}
    </div>;
}
function PublicPreview({ client, documentId, file, page, term, reader }: { client: PublicDocumentsApi; documentId: string; file: PublicFile; page: number; term: string; reader: boolean }) {
    const q = useResource(s => client.reading(documentId, file.id, reader, s), `public-reading:${documentId}:${file.id}:${reader}`);
    const path = usePath();
    const portal = usePortal();
    useEffect(() => { if (q.error && portal?.reader) portal.expired(q.error); }, [q.error, portal]);
    if (q.loading) return <Busy label="Ouverture de l’aperçu…" />;
    if (q.error) return <ErrorNotice error={q.error} onRetry={q.refresh} />;
    if (!q.data) return null;
    const access = q.data;
    const locked = page > access.freePageCount && !access.fullAccess;
    const validPage = page <= access.pageCount;
    return <section aria-label={'Lecture de ' + file.filename}>
        <p>{access.documentFreePageCount ?? access.freePageCount} page(s) gratuite(s) sur {access.documentPageCount ?? access.pageCount} pour le document · Aperçu de {access.previewPercent} % · Lecture à l’écran uniquement</p>
        <nav className="toolbar" style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }} aria-label="Pages du document">
            {page > 1 && <PLink to={'/documents/' + documentId} params={{ file: file.id, page: page - 1, q: term }}>Page précédente</PLink>}
            <strong>Page {page} sur {access.pageCount}</strong>
            {page < access.pageCount && <PLink to={'/documents/' + documentId} params={{ file: file.id, page: page + 1, q: term }}>Page suivante</PLink>}
        </nav>
        {term && <p>Mot recherché : <strong translate="no">{term}</strong></p>}
        {!validPage ? <Notice tone="warning">Cette page n’existe pas.</Notice> : locked ? <div className="portal-access" role="region" aria-label="Lecture intégrale réservée">
            <h2>Cette page est réservée à la lecture intégrale</h2>
            <p>Créez un compte lecteur et payez votre accès pour lire la suite. Votre recherche sera conservée pour revenir à la page {page}.</p>
            {!reader && <p><PLink className="btn primary" to="/inscription" params={{ retour: path }}>Créer un compte</PLink>{' '}<PLink className="btn secondary" to="/connexion" params={{ retour: path }}>Se connecter</PLink></p>}
            <DocumentPaymentPanel client={client} id={documentId} reader={reader} onConfirmed={q.refresh} />
            <button className="btn secondary" onClick={q.refresh}>Vérifier mon accès après paiement</button>
        </div> : <PageImage key={page + ':' + reader} client={client} documentId={documentId} fileId={file.id} page={page} reader={reader} />}
    </section>;
}
function PageImage({ client, documentId, fileId, page, reader }: { client: PublicDocumentsApi; documentId: string; fileId: string; page: number; reader: boolean }) {
    const q = useResource(s => client.image(documentId, fileId, page, reader, s), `public-page:${documentId}:${fileId}:${page}:${reader}`);
    const [url, setUrl] = useState('');
    const portal = usePortal();
    useEffect(() => { if (q.error && portal?.reader) portal.expired(q.error); }, [q.error, portal]);
    useEffect(() => { if (!q.data) return; const next = URL.createObjectURL(q.data); setUrl(next); return () => URL.revokeObjectURL(next); }, [q.data]);
    if (q.loading) return <Busy label={'Chargement de la page ' + page + '…'} />;
    if (q.error) return <ErrorNotice error={q.error} onRetry={q.refresh} />;
    return url && <div className="public-page-image" style={{ maxWidth: 1000, width: '100%', margin: '1rem auto' }} translate="no">
        <img src={url} alt={'Aperçu du document, page ' + page} style={{ display: 'block', width: '100%', height: 'auto' }} draggable={false} />
    </div>;
}
