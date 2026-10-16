import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { navigate } from './navigation';
import { Busy, Empty, ErrorNotice, formatDate, useResource } from './components';
import { STAGES, sinceText, stageName } from '../core/workflow';
import type { DigitizationElementStatus, PipelineStage, QueueItem } from '../core/types';
import { elementName } from '../core/format';

const nf = new Intl.NumberFormat('fr-FR');

function Queue({ status }: { status: DigitizationElementStatus }) {
    const { digitization, epoch } = useSession();
    const q = useResource<QueueItem[]>(s => digitization!.queue(status, undefined, s), 'pipeline-queue:' + status + ':' + epoch);
    if (q.loading) return <Busy />;
    if (q.error) return <ErrorNotice error={q.error} onRetry={q.refresh} />;
    const items = q.data ?? [];
    if (!items.length) return <Empty title="Aucun élément à cette étape" description="Rien n’attend à cette étape pour le moment." />;
    return <div className="table-scroll"><table className="pl-queue"><thead><tr><th>Élément</th><th>Projet</th><th>Lot</th><th>Arrivé</th><th><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{items.map(item => <tr key={item.elementId}>
            <td><strong>{elementName(item.description)}</strong></td><td>{item.projetNom}</td><td>{item.lotCode ?? '—'}</td>
            <td>{item.depuis ? <>{formatDate(item.depuis)}<small className="cell-sub">{sinceText(item.depuis)}</small></> : '—'}</td>
            <td><button className="btn small secondary" onClick={() => navigate('/app/numerisation?project=' + encodeURIComponent(item.projetId) + '&element=' + encodeURIComponent(item.elementId))}>Ouvrir</button></td></tr>)}</tbody></table></div>;
}

/** Les éléments par étape du parcours, avec l'ancienneté de la plus ancienne arrivée ; un clic ouvre la file de l'étape. */
export function PipelineBoard({ pipeline }: { pipeline: PipelineStage[] }) {
    const [selected, setSelected] = useState<DigitizationElementStatus | null>(null);
    const by = new Map(pipeline.map(stage => [stage.statut, stage]));
    const side = (['SUSPENDU', 'ANNULE'] as const).map(status => ({ status, count: by.get(status)?.elements ?? 0 }));
    const total = STAGES.reduce((sum, stage) => sum + (by.get(stage.status)?.elements ?? 0), 0);
    return <section className="db-card pl" aria-label="Avancement des éléments par étape">
        <div className="db-matrix-head"><div><h2>Avancement par étape</h2><p>{total ? nf.format(total) + ' élément' + (total > 1 ? 's' : '') + ' dans le parcours. Choisissez une étape pour voir ce qui l’attend.' : 'Aucun élément dans le parcours de traitement pour le moment.'}</p></div></div>
        <ol className="pl-stages">{STAGES.map((stage, index) => {
            const row = by.get(stage.status);
            const count = row?.elements ?? 0;
            return <li key={stage.status}><button type="button" className={'pl-stage' + (selected === stage.status ? ' on' : '') + (count ? '' : ' empty')} aria-pressed={selected === stage.status} onClick={() => setSelected(selected === stage.status ? null : stage.status)}>
                <i>{index + 1}</i><strong>{nf.format(count)}</strong><span>{stage.label}</span>
                <small>{count && row?.plusAncienJours ? 'Le plus ancien : ' + row.plusAncienJours + ' j' : stage.role}</small></button></li>;
        })}</ol>
        <p className="pl-side">{side.map(s => <button key={s.status} type="button" className={'text-link' + (selected === s.status ? ' on' : '')} onClick={() => setSelected(selected === s.status ? null : s.status)}>{stageName(s.status)} : {nf.format(s.count)}</button>)}</p>
        {selected && <div className="pl-list"><h3>{stageName(selected)}</h3><Queue status={selected} /></div>}
    </section>;
}
