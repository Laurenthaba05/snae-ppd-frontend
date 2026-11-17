import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { Busy, Empty, ErrorNotice, useResource } from './components';
import type { Actor } from '../core/types';

export const actorLabel = (a: Actor): string => a.legalName || [a.firstName, a.name].filter(Boolean).join(' ') || a.externalId || 'Acteur sans nom';
type Props = { kind: 'documents' | 'dossiers' | 'actors'; institution: string; department?: string | null; value: string | null;
    disabled: boolean; required?: boolean; onChange: (id: string | null) => void };
export function ArchiveRecordPicker(props: Props) {
    return <CataloguePicker key={JSON.stringify([props.kind, props.institution, props.department])} {...props} />;
}
function CataloguePicker({ kind, institution, department, value, disabled, required = false, onChange }: Props) {
    const { records, epoch } = useSession();
    const [open, setOpen] = useState(false); const [page, setPage] = useState(0); const [filter, setFilter] = useState('');
    const [chosen, setChosen] = useState<{ id: string; label: string } | null>(null);
    const label = kind === 'documents' ? 'Document lié' : kind === 'dossiers' ? 'Dossier lié' : 'Acteur du référentiel';
    const selected = useResource(async signal => {
        if (!value || chosen?.id === value) return null;
        if (kind === 'actors') return actorLabel(await records!.actor(value, signal));
        const item = await records![kind === 'documents' ? 'document' : 'dossier'](value, signal);
        return `${item.reference} · ${item.title}`;
    }, JSON.stringify(['catalogue-selected', kind, value, chosen?.id, epoch]));
    const q = useResource(async signal => {
        if (!open) return { items: [] as { id: string; label: string }[], hasMore: false };
        if (kind === 'actors') {
            const result = await records!.actors({ q: filter.trim() || undefined, page, size: 20 }, signal);
            return { ...result, items: result.items.map(x => ({ id: x.id, label: actorLabel(x) })) };
        }
        const result = await records![kind]({ institutionId: institution || undefined, departmentId: department, q: filter.trim() || undefined, page, size: 20 }, signal);
        return { ...result, items: result.items.map(x => ({ id: x.id, label: `${x.reference} · ${x.title}` })) };
    }, JSON.stringify(['catalogue-picker', kind, institution, department, epoch, open, page, filter.trim()]));
    return <div className="field span2"><span>{label}{required ? ' (requis)' : ' (facultatif)'}</span><div className="reference-picker">
        <button type="button" className="select-button" disabled={disabled} aria-label={label} aria-expanded={open} onClick={() => setOpen(v => !v)}>{value ? chosen?.id === value ? chosen.label : selected.data || (selected.loading ? 'Chargement…' : 'Ressource sélectionnée indisponible') : 'Choisir dans le catalogue'}</button>
        {Boolean(selected.error) && <ErrorNotice error={selected.error} onRetry={selected.refresh} />}
        {value && <button type="button" className="text-link" disabled={disabled} onClick={() => { onChange(null); setChosen(null); }}>Retirer le lien</button>}
        {open && <div className="reference-panel"><input aria-label={`Filtrer ${label.toLowerCase()}`} placeholder="Rechercher dans le catalogue" maxLength={200} disabled={disabled} value={filter} onChange={e => { setFilter(e.target.value); setPage(0); }} />
            {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : <>
                <div className="reference-options">{q.data?.items.map(x => <button type="button" disabled={disabled} key={x.id} onClick={() => { onChange(x.id); setChosen(x); setOpen(false); }}>{x.label}</button>)}</div>
                {!q.data?.items.length && <Empty title="Aucun résultat" />}
                <div className="picker-pagination"><button type="button" disabled={disabled || !page} onClick={() => setPage(p => p - 1)}>Précédente</button><span>Page {page + 1}</span><button type="button" disabled={disabled || !q.data?.hasMore} onClick={() => setPage(p => p + 1)}>Suivante</button></div>
            </>}
        </div>}
    </div></div>;
}
