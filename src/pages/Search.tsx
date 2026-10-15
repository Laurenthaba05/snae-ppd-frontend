import { PersistentDocumentLookup } from '../ui/PersistentDocumentLookup';
import React, { useEffect, useState } from 'react';
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

const reindexErrors: Record<string, string> = {
    SEARCH_UNAVAILABLE: 'le moteur de recherche ne répondait plus',
    REINDEX_FAILED: 'une erreur inattendue s’est produite (voir le journal du serveur)',
    WORKER_INTERRUPTED: 'le serveur s’est arrêté pendant le travail'
};
const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/** La réindexation : en cours (avancement), terminée (bilan) ou arrêtée (reprise possible). Un ancien serveur rend un bilan sans état : il est définitif. */
function ReindexNotice({ run, busy, onResume }: { run: SearchReindexReport; busy: boolean; onResume: () => void }) {
    const counts = `${plural(run.documents, 'document', 'documents')} et ${plural(run.dossiers, 'dossier', 'dossiers')}`;
    if (run.state === 'RUNNING') {
        return <Notice tone="info">Réindexation en cours ({run.phase === 'DOSSIERS' ? 'dossiers' : 'documents'}) : {counts} traités{run.failures ? ` ; ${run.failures} en échec` : ''}. Le travail continue sur le serveur, vous pouvez quitter cette page.</Notice>;
    }
    if (run.state === 'FAILED' || run.state === 'INTERRUPTED') {
        const cause = reindexErrors[run.errorCode ?? ''] ?? 'la cause est dans le journal du serveur';
        return <Notice tone="warning">La réindexation s’est arrêtée : {cause}. {counts} sont déjà traités ; la reprise continue là où elle s’est arrêtée.{' '}
            <button type="button" className="btn small secondary" onClick={onResume} disabled={busy}>Reprendre la réindexation</button></Notice>;
    }
    return <Notice tone={run.failures ? 'warning' : 'info'}>Réindexation terminée : {run.documents} document{run.documents > 1 ? 's' : ''} et {run.dossiers} dossier{run.dossiers > 1 ? 's' : ''} traités{run.failures ? ` ; ${run.failures} en échec (voir le journal du serveur), relancez la réindexation.` : '.'}</Notice>;
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
    // la dernière exécution : visible au retour sur la page tant qu'elle tourne ou qu'elle attend une reprise
    const latest = useResource<SearchReindexReport | null>(s => canReindex ? search!.reindexStatus(s).then(r => r.run).catch(() => null) : Promise.resolve(null), 'search-reindex-latest:' + epoch);
    const latestRun = latest.data && latest.data.state && latest.data.state !== 'DONE' ? latest.data : null;
    const current = report ?? latestRun;
    const running = current?.state === 'RUNNING';
    useEffect(() => {
        if (!running) return;
        let stopped = false;
        const timer = setInterval(() => {
            search!.reindexStatus().then(r => {
                if (stopped || !r.run) return;
                setReport(r.run);
                if (r.run.state !== 'RUNNING') { health.refresh(); if (query) q.refresh(); }
            }).catch(() => { /* la prochaine échéance réessaie */ });
        }, 2000);
        return () => { stopped = true; clearInterval(timer); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [running, search]);
    const submit = (e: React.FormEvent) => { e.preventDefault(); setPage(0); setQuery(input.trim()); };
    const reindex = (resume = false) => {
        setReindexing(true);
        setReindexError(null);
        setReport(null);
        search!.reindex(crypto.randomUUID(), resume).then(r => { setReport(r); if (!r.state && query) q.refresh(); }).catch(setReindexError)
            .finally(() => { setReindexing(false); health.refresh(); });
    };
    const hits = q.data?.hits ?? [];
    return <><PageHead eyebrow="MODULE · RECHERCHE" title="Recherche" description="Recherche plein texte sur les documents et dossiers, filtrée par vos habilitations et le niveau de confidentialité.">{canReindex && <button className="btn secondary" onClick={() => reindex(false)} disabled={reindexing || running}><Icon name="refresh" size={18}/>{reindexing || running ? 'Réindexation…' : 'Réindexer'}</button>}</PageHead><PersistentDocumentLookup />
        {Boolean(reindexError) && <ErrorNotice error={reindexError}/>}
        {current && <ReindexNotice run={current} busy={reindexing} onResume={() => reindex(true)}/>}
        {health.data && <SearchStatusNotice status={health.data}/>}
        <div className="panel"><form onSubmit={submit} className="table-toolbar"><div className="input-icon search-box"><Icon name="search"/><input aria-label="Rechercher" placeholder="Titre, référence, contenu…" value={input} onChange={e => setInput(e.target.value)}/></div><div className="toolbar-right"><select aria-label="Type" value={type} onChange={e => { setType(e.target.value as SearchTargetType); setPage(0); }}><option value="ALL">Tous types</option><option value="DOCUMENT">Documents</option><option value="DOSSIER">Dossiers</option></select><button type="submit" className="btn primary small">Rechercher</button></div></form>
        <div className="panel-padding"><KeywordFilter institutionId={scope.institutionId ?? null} selected={keywords} onChange={next => { setKeywords(next); setPage(0); }} /></div>
        {!query ? <Notice>Tapez une recherche pour explorer les documents et dossiers accessibles dans votre périmètre.</Notice> : q.loading ? <Busy /> : q.error ? <div className="panel-padding"><ErrorNotice error={q.error} onRetry={q.refresh}/></div> : hits.length ? <div className="table-scroll"><table><thead><tr><th>Résultat</th><th>Type</th><th>Pertinence</th></tr></thead><tbody>{hits.map(h => <tr key={h.type + h.id}><td><button className="record-name" onClick={() => navigate('/app/' + (h.type === 'DOCUMENT' ? 'documents' : 'dossiers') + '/' + h.id)}><span className={'table-avatar ' + (h.type === 'DOCUMENT' ? 'documents' : 'dossiers')}><Icon name={h.type === 'DOCUMENT' ? 'document' : 'archive'} size={19}/></span><span><strong>{h.titre ?? 'Sans titre'}</strong>{h.description && <small>{h.description}</small>}</span></button></td><td><span className="tag">{h.type === 'DOCUMENT' ? 'Document' : 'Dossier'}</span></td><td>{h.score.toFixed(2)}</td></tr>)}</tbody></table></div> : <Empty title="Aucun résultat" description="Essayez d’autres mots-clés, ou vérifiez que l’index a été alimenté (réindexation)."/>}
        {query && !q.loading && !q.error && <div className="pagination"><span>{hits.length} résultat{hits.length > 1 ? 's' : ''} sur cette page · page {page + 1}</span><div><button className="btn small secondary" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Précédente</button><button className="btn small secondary" disabled={!q.data?.hasMore} onClick={() => setPage(p => p + 1)}>Suivante</button></div></div>}
        </div>
        </>;
}
