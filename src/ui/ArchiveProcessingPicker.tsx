import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { useResource, Busy, ErrorNotice } from './components';
import { uuid } from '../core/validation';

interface Agent { id: string; name: string }
interface Page { items: Agent[]; page: number; hasMore: boolean; selected?: Agent | null }
/** Names scoped to the archival workspace, without requiring access to account administration. */
export function ArchiveProcessingPicker({ institution, value, label, disabled, onChange }: {
    institution: string; value: string; label: string; disabled: boolean; onChange: (id: string) => void;
}) {
    const { records, epoch } = useSession();
    const [open, setOpen] = useState(false);
    const [page, setPage] = useState(0);
    const [query, setQuery] = useState('');
    const q = useResource(signal => open || value
        ? records!.transport.request<Page>('/archives/processing-agents?institutionId=' + uuid(institution) + '&page=' + page + '&query=' + encodeURIComponent(query) + (value ? '&selectedId=' + uuid(value) : ''), { signal })
        : Promise.resolve({ items: [], page: 0, hasMore: false } as Page),
    JSON.stringify([institution, value, open, page, query, epoch]));
    return <div className="reference-picker">
        <button className="select-button" type="button" aria-label={label} aria-expanded={open} disabled={disabled} onClick={() => setOpen(v => !v)}>
            {value ? q.data?.selected?.name ?? (q.loading ? 'Chargement…' : 'Intervenant indisponible') : label}
        </button>
        {open && <div className="reference-panel">
            <input aria-label={'Rechercher ' + label} maxLength={100} placeholder="Rechercher parmi les intervenants" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} />
            {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} /> : <>
                <div className="reference-options">{q.data?.items.map(agent => <button type="button" key={agent.id} onClick={() => { onChange(agent.id); setOpen(false); }}>{agent.name}</button>)}</div>
                {!q.data?.items.length && <p>Aucun intervenant actif trouvé.</p>}
                <div className="picker-pagination">
                    <button type="button" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Précédente</button>
                    <small>Page {page + 1}</small>
                    <button type="button" disabled={!q.data?.hasMore} onClick={() => setPage(p => p + 1)}>Suivante</button>
                </div>
            </>}
        </div>}
        {!open && q.error ? <ErrorNotice error={q.error} /> : null}
    </div>;
}
