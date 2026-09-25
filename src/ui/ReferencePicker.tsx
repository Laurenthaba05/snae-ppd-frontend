import React, { useEffect, useState } from 'react';
import { useSession } from '../auth/session';
import { useResource, Busy, ErrorNotice } from './components';
import { Icon } from './icons';
import type { Catalog, RecordEntity, ScopeTarget } from '../core/types';
export function ReferencePicker({ kind, value, onChange, scope = {}, label, disabled = false, nullable = false, excludeId }: {
    kind: Catalog;
    value: string;
    onChange: (id: string) => void;
    scope?: ScopeTarget;
    label: string;
    disabled?: boolean;
    nullable?: boolean;
    excludeId?: string;
}) {
    const { api, epoch } = useSession();
    const [open, setOpen] = useState(false);
    const [page, setPage] = useState(0);
    const [filter, setFilter] = useState('');
    const [chosen, setChosen] = useState<{
        id: string;
        label: string;
    } | null>(null);
    useEffect(() => { setPage(0); setFilter(''); setOpen(false); }, [scope.institutionId, scope.departmentId]);
    const key = JSON.stringify([kind, scope, page, open, epoch]);
    const q = useResource(signal => open && !(kind === 'departments' && !scope.institutionId) ? api!.list<RecordEntity>(kind, { ...scope, page, size: 20 }, signal) : Promise.resolve({ items: [] as RecordEntity[], page: 0, size: 20, hasMore: false }), key);
    const missing = kind === 'departments' && !scope.institutionId;
    return <div className="reference-picker"><button className="select-button" type="button" disabled={disabled || missing} aria-label={label} aria-expanded={open} onClick={() => setOpen(v => !v)}><span>{value ? (chosen?.id === value ? chosen.label : value) : missing ? 'Choisissez d’abord une institution' : label}</span><Icon name="chevron" size={15}/></button>{open && <div className="reference-panel"><input aria-label={'Filtrer ' + label} value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filtrer les 20 éléments de cette page"/>{q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error}/> : <><div className="reference-options">{nullable && <button type="button" onClick={() => { onChange(''); setChosen(null); setOpen(false); }}>Aucun</button>}{q.data?.items.filter(x => x.id !== excludeId && String(x.nom ?? '').toLowerCase().includes(filter.toLowerCase())).map(x => <button type="button" key={x.id} onClick={() => { onChange(x.id); setChosen({ id: x.id, label: x.nom ?? x.id }); setOpen(false); }}><span>{x.nom ?? x.id}</span><small>{'code' in x ? x.code : 'email' in x ? x.email : '—'}</small></button>)}</div><div className="picker-pagination"><button type="button" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Précédente</button><small>Page {page + 1}</small><button type="button" disabled={!q.data?.hasMore} onClick={() => setPage(p => p + 1)}>Suivante</button></div></>}</div>}</div>;
}
