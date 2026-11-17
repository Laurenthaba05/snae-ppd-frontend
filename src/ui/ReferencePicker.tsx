import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { useResource, Busy, Empty, ErrorNotice } from './components';
import { Icon } from './icons';
import { entityLabel, useEntityName } from './names';
import type { Catalog, RecordEntity, ScopeTarget } from '../core/types';

type Props = { kind: Catalog; value: string; onChange: (id: string) => void; scope?: ScopeTarget; label: string;
    disabled?: boolean; nullable?: boolean; excludeId?: string };
export function ReferencePicker(props: Props) {
    const { epoch } = useSession();
    return <Picker key={JSON.stringify([props.kind, props.scope?.institutionId, props.scope?.departmentId, props.excludeId, epoch])} {...props}/>;
}
function Picker({ kind, value, onChange, scope = {}, label, disabled = false, nullable = false, excludeId }: Props) {
    const { api, epoch } = useSession();
    const [open, setOpen] = useState(false), [page, setPage] = useState(0), [filter, setFilter] = useState('');
    const [chosen, setChosen] = useState<{id: string; label: string} | null>(null);
    const missing = kind === 'departments' && !scope.institutionId;
    const params = {...scope, page, size: 20, ...(filter.trim() ? {q: filter.trim()} : {}), ...(excludeId ? {excludeId} : {})};
    const q = useResource(signal => open && !missing ? api!.list<RecordEntity>(kind, params, signal)
        : Promise.resolve({ items: [] as RecordEntity[], page: 0, size: 20, hasMore: false }), JSON.stringify([kind, params, open, epoch]));
    const known = useEntityName(kind, value && chosen?.id !== value ? value : null);
    const shown = !value ? (missing ? 'Choisissez d’abord une institution' : label)
        : chosen?.id === value ? chosen.label : known.name ?? (known.loading ? '…' : 'Élément sélectionné');
    return <div className="reference-picker">
        <button className="select-button" type="button" disabled={disabled || missing} aria-label={label} aria-expanded={open} onClick={() => setOpen(v => !v)}><span>{shown}</span><Icon name="chevron" size={15}/></button>
        {open && <div className="reference-panel">
            <input aria-label={'Filtrer ' + label} maxLength={200} disabled={disabled} value={filter} onChange={e => {setFilter(e.target.value);setPage(0);}} placeholder="Rechercher par nom, code ou contact"/>
            <p className="subtle">Recherche sur toutes les pages du périmètre autorisé.</p>
            {q.loading ? <Busy/> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh}/> : <>
                <div className="reference-options">{nullable && <button type="button" disabled={disabled} onClick={() => {onChange('');setChosen(null);setOpen(false);}}>Aucun</button>}
                    {q.data?.items.map(x => {const name=entityLabel(kind,x)??'Élément sans nom';return <button type="button" disabled={disabled} key={x.id}
                        onClick={() => {onChange(x.id);setChosen({id:x.id,label:name});setOpen(false);}}><span>{name}</span><small>{'code' in x ? x.code : 'email' in x ? x.email : '—'}</small></button>;})}
                </div>
                {!q.data?.items.length && <Empty title="Aucun résultat" description="Modifiez la recherche ou le périmètre."/>}
                <div className="picker-pagination"><button type="button" disabled={disabled || page === 0} onClick={() => setPage(p => p - 1)}>Précédente</button><small>Page {page + 1}</small><button type="button" disabled={disabled || !q.data?.hasMore} onClick={() => setPage(p => p + 1)}>Suivante</button></div>
            </>}
        </div>}
    </div>;
}

