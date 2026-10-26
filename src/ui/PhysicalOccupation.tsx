import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { Badge, Busy, Empty, ErrorNotice, useResource } from './components';
import { FILLING_LABELS } from '../core/physicalConditions';
import { FILLING_BADGE } from './PhysicalConditions';
import { BY_LABELS, canOpen, level, meters, notes, rateText } from '../core/physicalOccupation';
import type { OccupationBy, OccupationReport, OccupationRow } from '../core/physicalOccupation';

const MODES: OccupationBy[] = ['location', 'institution'];

/**
 * Le métrage linéaire et le remplissage : par lieu (on descend de la racine vers un sous-lieu) ou par institution. Le serveur calcule tout sur ce que la personne peut lire ; seul ce qui
 * est écrit en mètres linéaires s'additionne, le reste (boîtes, liasses, quantité absente) est dit à part, sans conversion.
 */
export function PhysicalOccupationSection() {
    const { physicalArchives, epoch } = useSession();
    const [by, setBy] = useState<OccupationBy>('location');
    const [parentId, setParentId] = useState<string | null>(null);
    const q = useResource<OccupationReport>(s => physicalArchives!.occupation(by, parentId, s), JSON.stringify(['physical-occupation', by, parentId, epoch]));
    const report = q.data;
    const choose = (next: OccupationBy) => { setBy(next); setParentId(null); };
    return <div className="panel">
        <div className="section-heading"><h3>Métrage et occupation</h3>
            <span className="table-actions" role="group" aria-label="Regroupement du métrage">
                {MODES.map(mode => <button key={mode} type="button" className={'btn small ' + (by === mode ? 'primary' : 'secondary')} aria-pressed={by === mode} onClick={() => choose(mode)}>{BY_LABELS[mode]}</button>)}
            </span></div>
        <p className="wf-note">Les mètres linéaires rangés dans chaque lieu (ou chez chaque institution) et le remplissage des unités dont la capacité est en mètres linéaires. Ce qui est compté en autre chose (boîtes, liasses) ou sans quantité n’est jamais converti : il est signalé à part.</p>
        {by === 'location' && <nav aria-label="Chemin du lieu ouvert" className="table-actions">
            <button type="button" className="btn small secondary" disabled={parentId === null} onClick={() => setParentId(null)}>Tous les lieux</button>
            {(report?.trail ?? []).map((step, i, all) => i === all.length - 1
                ? <strong key={step.id} aria-current="location">{step.label}</strong>
                : <button key={step.id} type="button" className="btn small secondary" onClick={() => setParentId(step.id)}>{step.label}</button>)}
        </nav>}
        {q.loading && !report ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : report && (report.rows.length
            ? <>
                <div className="table-scroll"><table>
                    <thead><tr><th>{by === 'location' ? 'Lieu' : 'Institution'}</th><th>Unités</th><th>Archives</th><th>Métrage rangé</th><th>Capacité</th><th>Remplissage</th><th>Ce que le métrage ne dit pas</th></tr></thead>
                    <tbody>
                        {report.rows.map(row => <Row key={(row.self ? 'self:' : '') + (row.key ?? row.institutionId ?? 'national')} row={row} by={by} onOpen={setParentId} />)}
                    </tbody>
                    <tfoot><Row row={report.total} by={by} total /></tfoot>
                </table></div>
                {report.truncated && <p className="wf-note" role="status">La liste est limitée aux 200 premières lignes : ouvrez un lieu pour voir le reste.</p>}
            </>
            : <Empty title="Rien à mesurer" description="Aucune unité de rangement ni aucune archive dans ce périmètre." />)}
    </div>;
}

function Row({ row, by, onOpen, total = false }: { row: OccupationRow; by: OccupationBy; onOpen?: (id: string) => void; total?: boolean }) {
    const state = level(row.taux);
    const remarks = notes(row);
    return <tr>
        <td>{total ? <strong>{row.label}</strong> : <>
            {row.self ? <em>{row.label}</em> : row.label}
            {canOpen(row, by) && onOpen && <> <button type="button" className="btn small secondary" aria-label={'Ouvrir ' + row.label} onClick={() => onOpen(row.key!)}>Ouvrir</button></>}</>}</td>
        <td>{row.units}</td>
        <td>{row.archives}</td>
        <td>{meters(row.metrageLineaire)}</td>
        <td>{row.unitesMesurees > 0 ? meters(row.capaciteLineaire) : '—'}</td>
        <td>{row.unitesMesurees > 0
            ? <>{meters(row.rempliMesure)} · {rateText(row.taux)}{FILLING_BADGE[state] && <> <Badge value={FILLING_BADGE[state]!} label={FILLING_LABELS[state]} /></>}</>
            : '—'}</td>
        <td>{remarks.length ? remarks.map(text => <small key={text} className="cell-sub">{text}</small>) : '—'}</td>
    </tr>;
}
