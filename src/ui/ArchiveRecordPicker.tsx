import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { Busy, ErrorNotice, useResource } from './components';

/** Reuses existing catalogues; selecting a link never creates a duplicate document or actor. */
export function ArchiveRecordPicker({ kind, institution, department, value, disabled, required=false, onChange }: {
    kind: 'documents' | 'dossiers' | 'actors'; institution: string; department?:string|null; value: string | null; disabled: boolean; required?:boolean; onChange: (id: string | null) => void;
}) {
    const { records, epoch } = useSession(); const [open, setOpen] = useState(false); const [page, setPage] = useState(0); const [filter, setFilter] = useState(''); const [chosen, setChosen] = useState<{ id: string; label: string } | null>(null);
    const label = kind === 'documents' ? 'Document lié' : kind === 'dossiers' ? 'Dossier lié' : 'Acteur du référentiel';
    const q = useResource(async signal => {
        if (!open) return { items: [] as { id: string; label: string }[], hasMore: false };
        if (kind === 'actors') {
            const result = await records!.actors({ page, size: 20 }, signal);
            return { ...result, items: result.items.map(x => ({ id: x.id, label: x.legalName || [x.firstName, x.name].filter(Boolean).join(' ') || 'Acteur sans nom' })) };
        }
        const result = await records![kind]({ institutionId: institution, departmentId:department, q:filter||undefined, page, size: 20 }, signal);
        return { ...result, items: result.items.map(x => ({ id: x.id, label: `${x.reference} · ${x.title}` })) };
    }, JSON.stringify([kind, institution, department, epoch, open, page, filter]));
    return <div className="field span2"><span>{label}{required ? " (requis)" : " (facultatif)"}</span><div className="reference-picker">
        <button type="button" className="select-button" disabled={disabled} aria-label={label} aria-expanded={open} onClick={() => setOpen(v => !v)}>{value ? chosen?.id === value ? chosen.label : `${label} sélectionné` : `Choisir dans le catalogue`}</button>
        {value && <div><small className="mono">{value}</small><button type="button" className="text-link" disabled={disabled} onClick={() => { onChange(null); setChosen(null); }}>Retirer le lien</button></div>}
        {open && <div className="reference-panel"><input aria-label={`Filtrer ${label.toLowerCase()}`} placeholder={kind==='actors'?'Filtrer cette page':'Rechercher par titre ou référence'} value={filter} onChange={e => {setFilter(e.target.value);setPage(0);}} />
            {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : <><div className="reference-options">{q.data?.items.filter(x => kind!=='actors'||x.label.toLocaleLowerCase().includes(filter.toLocaleLowerCase())).map(x => <button type="button" key={x.id} onClick={() => { onChange(x.id); setChosen(x); setOpen(false); }}>{x.label}</button>)}</div><div className="picker-pagination"><button type="button" disabled={!page} onClick={() => { setPage(p => p - 1); }}>Précédente</button><span>Page {page + 1}</span><button type="button" disabled={!q.data?.hasMore} onClick={() => { setPage(p => p + 1); }}>Suivante</button></div></>}
        </div>}
    </div></div>;
}
