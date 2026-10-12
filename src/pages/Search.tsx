import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { navigate } from '../ui/navigation';
import { PageHead, Busy, ErrorNotice, Empty, useResource, Notice } from '../ui/components';
import { Icon } from '../ui/icons';
import { can } from '../core/policy';
import { useWorkspace } from '../ui/workspace';
import { KeywordFilter } from '../ui/Vocabularies';
import type { SearchReindexReport, SearchStatus, SearchTargetType } from '../core/types';

const statusMessages: Record<string, string> = {
    SEARCH_NOT_CONFIGURED: 'Le moteur de recherche n’est pas activé sur ce serveur : aucune recherche ne peut aboutir.',
    SEARCH_UNAVAILABLE: 'Le moteur de recherche est injoignable : les recherches échoueront tant qu’il ne répond pas.',
    SEARCH_INDEX_MISSING: 'Un index de recherche est absent : redémarrez le serveur pour le recréer, puis réindexez.',
    SEARCH_INDEX_RED: 'Un index de recherche est endommagé : une partie des résultats peut manquer.',
    SEARCH_INDEX_OUT_OF_SYNC: 'L’index n’est pas aligné sur la base : certains documents ou dossiers ne sont pas trouvables. Une réindexation le remet à jour.',
    SEARCH_REPLICAS_UNASSIGNED: 'Les copies de sécurité de l’index ne sont pas placées : la recherche fonctionne, mais sans redondance.'
};
const indexLabel = (name: string) => name.endsWith('snae-documents') ? 'Documents' : name.endsWith('snae-dossiers') ? 'Dossiers' : name;

/** L'état du moteur, affiché seulement quand il appelle une action ; les volumes ne viennent que pour un détenteur de SEARCH_REINDEX. */
function SearchStatusNotice({ status }: { status: SearchStatus }) {
    if (status.status === 'OK') return null;
    const volumes = status.indexes.filter(i => i.indexed !== null || i.expected !== null);
    return <Notice tone="warning">{statusMessages[status.code ?? ''] ?? 'Le moteur de recherche est à vérifier.'}
        {volumes.length > 0 && <> {volumes.map(i => `${indexLabel(i.name)} : ${i.indexed ?? 0} indexé${(i.indexed ?? 0) > 1 ? 's' : ''} sur ${i.expected ?? '—'}`).join(' · ')}.</>}</Notice>;
}

export function SearchPage() {
    const { me, search, epoch } = useSession();
    const { scope } = useWorkspace();
    const [keywords, setKeywords] = useState<Array<{ id: string; label: string }>>([]);
    const initialQuery = new URLSearchParams(location.search).get('q')?.trim().slice(0, 200) ?? '';
    const [input, setInput] = useState(initialQuery);
    const [query, setQuery] = useState(initialQuery);
    const [type, setType] = useState<SearchTargetType>('ALL');
    const [page, setPage] = useState(0);
    const [reindexing, setReindexing] = useState(false);
    const [reindexError, setReindexError] = useState<unknown>(null);
    const [report, setReport] = useState<SearchReindexReport | null>(null);
    const size = 20;
    const canReindex = can(me, 'SEARCH_REINDEX', {});
    const keywordIds = keywords.map(k => k.id);
    const q = useResource(s => query ? search!.search(query, type, page, size, s, keywordIds) : Promise.resolve({ hits: [], page: 0, size, hasMore: false }), JSON.stringify(['search', query, type, page, keywordIds, epoch]));
    // l'état ne bloque jamais la page : en cas d'échec de la sonde, la recherche elle-même dira ce qui ne va pas
    const health = useResource(s => search!.status(s).catch(() => null), 'search-status:' + epoch);
    const submit = (e: React.FormEvent) => { e.preventDefault(); setPage(0); setQuery(input.trim()); };
    const reindex = () => {
        setReindexing(true);
        setReindexError(null);
        setReport(null);
        search!.reindex(crypto.randomUUID()).then(r => { setReport(r); if (query) q.refresh(); }).catch(setReindexError)
            .finally(() => { setReindexing(false); health.refresh(); });
    };
    const hits = q.data?.hits ?? [];
    return <><PageHead eyebrow="MODULE · RECHERCHE" title="Recherche" description="Recherche plein texte sur les documents et dossiers, filtrée par vos habilitations et le niveau de confidentialité.">{canReindex && <button className="btn secondary" onClick={reindex} disabled={reindexing}><Icon name="refresh" size={18}/>{reindexing ? 'Réindexation…' : 'Réindexer'}</button>}</PageHead>
        {Boolean(reindexError) && <ErrorNotice error={reindexError}/>}
        {report && <Notice tone={report.failures ? 'warning' : 'info'}>Réindexation terminée : {report.documents} document{report.documents > 1 ? 's' : ''} et {report.dossiers} dossier{report.dossiers > 1 ? 's' : ''} traités{report.failures ? ` ; ${report.failures} en échec (voir le journal du serveur), relancez la réindexation.` : '.'}</Notice>}
        {health.data && <SearchStatusNotice status={health.data}/>}
        <div className="panel"><form onSubmit={submit} className="table-toolbar"><div className="input-icon search-box"><Icon name="search"/><input aria-label="Rechercher" placeholder="Titre, référence, contenu…" value={input} onChange={e => setInput(e.target.value)}/></div><div className="toolbar-right"><select aria-label="Type" value={type} onChange={e => { setType(e.target.value as SearchTargetType); setPage(0); }}><option value="ALL">Tous types</option><option value="DOCUMENT">Documents</option><option value="DOSSIER">Dossiers</option></select><button type="submit" className="btn primary small">Rechercher</button></div></form>
        <div className="panel-padding"><KeywordFilter institutionId={scope.institutionId ?? null} selected={keywords} onChange={next => { setKeywords(next); setPage(0); }} /></div>
        {!query ? <Notice>Tapez une recherche pour explorer les documents et dossiers accessibles dans votre périmètre.</Notice> : q.loading ? <Busy /> : q.error ? <div className="panel-padding"><ErrorNotice error={q.error} onRetry={q.refresh}/></div> : hits.length ? <div className="table-scroll"><table><thead><tr><th>Résultat</th><th>Type</th><th>Pertinence</th></tr></thead><tbody>{hits.map(h => <tr key={h.type + h.id}><td><button className="record-name" onClick={() => navigate('/app/' + (h.type === 'DOCUMENT' ? 'documents' : 'dossiers') + '/' + h.id)}><span className={'table-avatar ' + (h.type === 'DOCUMENT' ? 'documents' : 'dossiers')}><Icon name={h.type === 'DOCUMENT' ? 'document' : 'archive'} size={19}/></span><span><strong>{h.titre ?? 'Sans titre'}</strong>{h.description && <small>{h.description}</small>}</span></button></td><td><span className="tag">{h.type === 'DOCUMENT' ? 'Document' : 'Dossier'}</span></td><td>{h.score.toFixed(2)}</td></tr>)}</tbody></table></div> : <Empty title="Aucun résultat" description="Essayez d’autres mots-clés, ou vérifiez que l’index a été alimenté (réindexation)."/>}
        {query && !q.loading && !q.error && <div className="pagination"><span>{hits.length} résultat{hits.length > 1 ? 's' : ''} sur cette page · page {page + 1}</span><div><button className="btn small secondary" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Précédente</button><button className="btn small secondary" disabled={!q.data?.hasMore} onClick={() => setPage(p => p + 1)}>Suivante</button></div></div>}
        </div>
        </>;
}
