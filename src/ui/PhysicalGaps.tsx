import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { Badge, Busy, Empty, ErrorNotice, Field, Pagination, useResource } from './components';
import { ArchivePlacementDialog } from './HeritagePlacement';
import { CURRENT_LABELS, GAP_LABELS, dayText, gapLabel, placeText } from '../core/placement';
import { display } from '../core/format';
import type { PlacementGap, PlacementGapPage } from '../core/types';

const GAPS = Object.keys(GAP_LABELS) as PlacementGap[];

/**
 * Les archives qui s'écartent de ce que l'on attend, les plus graves d'abord : introuvables, trouvées ailleurs, sorties en retard, jamais ou plus vérifiées. Réduit à ce que la personne a
 * le droit de lire. Une fiche s'ouvre sur le constat de présence et le rangement ; une présence vérifiée ne vaut plus une fois l'archive déplacée.
 */
export function PhysicalGapsSection() {
    const { physicalArchives, epoch } = useSession();
    const [form, setForm] = useState({ ecart: '', q: '' });
    const [applied, setApplied] = useState(form);
    const [page, setPage] = useState(0);
    const [revision, setRevision] = useState(0);
    const [opened, setOpened] = useState<string | null>(null);
    const listQ = useResource<PlacementGapPage>(s => physicalArchives!.placementGaps({ ...applied, page, size: 20 }, s), JSON.stringify(['physical-gaps', applied, page, revision, epoch]));
    const apply = (next: typeof form) => { setForm(next); setApplied(next); setPage(0); };
    const items = listQ.data?.items ?? [];
    return <>
        <div className="panel">
            <div className="section-heading"><h3>Écarts d’emplacement</h3></div>
            <p className="wf-note">Les archives qui s’écartent de ce que l’on attend, les plus graves d’abord : introuvables, trouvées ailleurs, sorties en retard, jamais ou plus vérifiées. Une présence vérifiée ne vaut plus une fois l’archive déplacée.</p>
            <form className="asset-filters" onSubmit={e => { e.preventDefault(); apply(form); }} role="search" aria-label="Rechercher une archive à régulariser">
                <Field label="Cote"><input value={form.q} onChange={e => setForm({ ...form, q: e.target.value })} placeholder="Un morceau de cote" /></Field>
                <Field label="Écart"><select value={form.ecart} onChange={e => apply({ ...form, ecart: e.target.value })}><option value="">Tous les écarts</option>{GAPS.map(g => <option key={g} value={g}>{GAP_LABELS[g]}</option>)}</select></Field>
                <button type="submit" className="btn small secondary">Rechercher</button>
            </form>
            {listQ.loading && !listQ.data ? <Busy /> : listQ.error ? <ErrorNotice error={listQ.error} onRetry={listQ.refresh} /> : items.length ? <>
                <p className="wf-note" role="status">{listQ.data!.total} archive{listQ.data!.total > 1 ? 's' : ''} à régulariser</p>
                <div className="table-scroll"><table><thead><tr><th>Cote</th><th>Emplacement habituel</th><th>Emplacement actuel</th><th>Écart</th><th>Dernier constat</th></tr></thead>
                    <tbody>{items.map(r => <tr key={r.archiveId}>
                        <td className="nowrap"><button type="button" className="text-link" onClick={() => setOpened(r.archiveId)}>{r.cote}</button>{r.support && <small className="cell-sub">{display(r.support)}</small>}</td>
                        <td>{placeText(r.habituel)}</td>
                        <td>{CURRENT_LABELS[r.actuel.source]}{r.actuel.source === 'CONSTATE_AILLEURS' && <small className="cell-sub">{placeText(r.actuel.unite)}</small>}</td>
                        <td>{r.ecarts.map(g => <Badge key={g} value={g} label={gapLabel(g)} />)}</td>
                        <td>{r.verifieLe ? dayText(r.verifieLe) : 'Jamais'}</td>
                    </tr>)}</tbody></table></div>
                <Pagination page={page} hasMore={listQ.data?.hasMore ?? false} onChange={setPage} count={items.length} />
            </> : <Empty title="Aucun écart" description={applied.ecart || applied.q ? 'Aucune archive ne correspond à ces critères.' : 'Toutes les archives sont à leur place connue et vérifiée.'} />}
        </div>
        {opened && <ArchivePlacementDialog archiveId={opened} onClose={() => setOpened(null)} onChanged={() => setRevision(r => r + 1)} />}
    </>;
}
