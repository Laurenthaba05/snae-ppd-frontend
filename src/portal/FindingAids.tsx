import { DATE_TYPES, CERTAINTIES, CALENDARS } from '../core/archiveEnrichment';
import { EXTENT_UNITS } from '../core/archivalDescription';
import React, { useEffect, useState } from 'react';
import { navigate, usePath } from '../ui/navigation';
import { Busy, Empty, ErrorNotice } from '../ui/components';
import { portalPath } from '../core/portal';
import { datesText, exportLinks, filledSections, levelLabel, type PublicFindingAid, type PublicNode } from '../core/findingAids';
import { usePortal } from './context';
import { PLink } from './Shell';

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

const noticePath = (rootId: string, id: string) => `/inventaires/${rootId}/notices/${id}`;

/** Les instruments de recherche publiés : la liste des fonds dont l'inventaire est ouvert au public. */
export function FindingAidsPage() {
    const { api } = usePortal();
    const list = useLoaded<PublicFindingAid[]>(signal => api.findingAids(signal), 'finding-aids');
    return <div className="portal-page">
        <section className="portal-hero" aria-labelledby="inventaires-title">
            <h1 id="inventaires-title">Instruments de recherche</h1>
            <p>Les inventaires des fonds d’archives publiés par les institutions : on y parcourt chaque fonds, ses séries et ses dossiers. Seules les notices validées et ouvertes au public sont présentées.</p>
        </section>
        {list.state === 'loading' && <Busy label="Chargement des inventaires…" />}
        {list.state === 'error' && <ErrorNotice error={list.error} onRetry={list.retry} />}
        {list.state === 'ready' && (list.data.length === 0
            ? <Empty title="Aucun inventaire publié" description="Aucun instrument de recherche n’est encore ouvert au public." icon="archive" />
            : <ul className="portal-results">{list.data.map(f => <li key={f.id}><article>
                <h2><PLink to={noticePath(f.id, f.id)}>{f.title}</PLink></h2>
                <p className="portal-meta">{[levelLabel(f.level), f.institutionName, f.dateLabel, f.extent].filter(Boolean).join(' · ')}</p>
                {f.producerName && <p className="portal-meta">Producteur : {f.producerName}</p>}
                {f.summary && <p>{f.summary}</p>}
            </article></li>)}</ul>)}
    </div>;
}

/** Une notice d'un instrument de recherche : sa description, son chemin depuis le fonds, ses sous-niveaux et ses exports. */
export function FindingAidNodePage({ id }: { id: string }) {
    const { api } = usePortal();
    const path = usePath();
    const page = Math.max(0, Number(new URL(path, location.origin).searchParams.get('page')) || 0);
    const node = useLoaded<PublicNode>(signal => api.findingAidNode(id, page, signal), `${id}:${page}`);
    if (node.state === 'loading') return <div className="portal-page"><Busy label="Chargement de la notice…" /></div>;
    if (node.state === 'error') return <div className="portal-page"><ErrorNotice error={node.error} onRetry={node.retry} /></div>;
    const n = node.data;
    const links = exportLinks(n.id);
    const sections = filledSections(n.fields);
    const dates = datesText(n.fields);
    const go = (next: number) => navigate(portalPath(noticePath(n.rootId, n.id), { page: next || null }));
    return <div className="portal-page">
        <nav className="portal-breadcrumb" aria-label="Fil d’Ariane">
            <PLink to="/inventaires">Instruments de recherche</PLink>
            {n.path.map(step => <React.Fragment key={step.id}> › <PLink to={noticePath(n.rootId, step.id)}>{step.title}</PLink></React.Fragment>)}
            {' › '}<span aria-current="page">{n.title}</span>
        </nav>
        <article className="portal-notice">
            <header>
                <p className="portal-meta">{levelLabel(n.level)} · {n.code}</p>
                <h1>{n.title}</h1>
            </header>
            <dl className="portal-facts">
                <div><dt>Institution</dt><dd>{n.institutionName}</dd></div>
                {n.producerName && <div><dt>Producteur</dt><dd>{n.producerName}</dd></div>}
                {dates && <div><dt>Dates</dt><dd>{dates}</dd></div>}
                {n.fields.medium && <div><dt>Support</dt><dd>{n.fields.medium}</dd></div>}
                {n.fields.extent && <div><dt>Importance matérielle</dt><dd>{n.fields.extent}</dd></div>}
                {n.fields.extentQuantity && <div><dt>Quantité</dt><dd>{n.fields.extentQuantity} {n.fields.extentUnit ?? ''}</dd></div>}
            </dl>
            {n.enrichment && [n.enrichment.identifiers,n.enrichment.dates,n.enrichment.producers,n.enrichment.extents].some(x=>x.length>0) && <section aria-label="Description complémentaire"><h2>Description complémentaire</h2><dl className="portal-facts">
                {n.enrichment.identifiers.map((x,i)=><div key={'id'+i}><dt>{x.label||x.type}</dt><dd>{x.value}{x.source?' · '+x.source:''}{x.uri?<p>{x.uri}</p>:null}</dd></div>)}
                {n.enrichment.dates.map((x,i)=><div key={'date'+i}><dt>{DATE_TYPES[x.type]||x.type}</dt><dd>{x.expression||[x.start,x.end].filter(Boolean).join(' / ')}{x.expression&&(x.start||x.end)?' · '+[x.start,x.end].filter(Boolean).join(' / '):''} · {CERTAINTIES[x.certainty]||x.certainty} · {CALENDARS[x.calendar]||x.calendar}</dd></div>)}
                {n.enrichment.producers.map((x,i)=><div key={'producer'+i}><dt>{x.role}</dt><dd>{n.producers?.find(p=>p.id===x.authorityId)?.name||'Producteur'}{x.start||x.end?' · '+[x.start,x.end].filter(Boolean).join(' / '):''}</dd></div>)}
                {n.enrichment.extents.map((x,i)=><div key={'extent'+i}><dt>Volume {i+1}</dt><dd>{x.quantity} {EXTENT_UNITS.find(u=>u.code===x.unit)?.label||x.unit} · {x.portion==='PART'?'Partie':'Ensemble'}{x.medium?' · '+x.medium:''}{x.dimensions?' · '+x.dimensions:''}</dd></div>)}
            </dl></section>}
            {sections.map(section => <section key={section.title} aria-label={section.title}>
                <h2>{section.title}</h2>
                <dl className="portal-facts">{section.rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
            </section>)}
            {n.children.length > 0 && <section aria-label="Contenu">
                <h2>Contenu</h2>
                <ul className="portal-results">{n.children.map(child => <li key={child.id}><article>
                    <h3><PLink to={noticePath(n.rootId, child.id)}>{child.title}</PLink></h3>
                    <p className="portal-meta">{[levelLabel(child.level), child.code, child.dateLabel, child.extent].filter(Boolean).join(' · ')}{child.childCount > 0 ? ` · ${child.childCount} sous-niveau${child.childCount > 1 ? 'x' : ''}` : ''}</p>
                </article></li>)}</ul>
                {(page > 0 || n.hasMoreChildren) && <nav className="portal-pager" aria-label="Pagination">
                    <button className="btn small secondary" disabled={page === 0} onClick={() => go(page - 1)}>Précédente</button>
                    <span>Page {page + 1}</span>
                    <button className="btn small secondary" disabled={!n.hasMoreChildren} onClick={() => go(page + 1)}>Suivante</button>
                </nav>}
            </section>}
            <footer className="portal-exports">
                <p>Exporter cette notice et ses sous-niveaux publics :</p>
                <a href={links.rico} download>RiC-O (JSON-LD)</a>{' · '}<a href={links.dublinCore} download>Dublin Core (XML)</a>
            </footer>
        </article>
    </div>;
}
