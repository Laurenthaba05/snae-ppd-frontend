import React from 'react';
import { useSession } from '../auth/session';
import { Busy, ErrorNotice, useResource } from './components';
export function IntakeLinkPicker({ value, onChange, disabled = false }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
    const { archivalIntake, epoch } = useSession();
    const q = useResource(s => archivalIntake ? archivalIntake.entries(s) : Promise.resolve([]), 'intake-link:' + epoch);
    return <>
        {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : <select aria-label="Entrée archivistique associée" value={value} onChange={e => onChange(e.target.value)} disabled={disabled}>
            <option value="">Aucune</option>{value && !q.data?.some(x => x.id === value) && <option value={value}>Entrée associée non disponible</option>}
            {q.data?.map(x => <option key={x.id} value={x.id}>{x.numero}{x.description ? ' · ' + x.description : ''}</option>)}
        </select>}
    </>;
}
