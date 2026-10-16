import React from 'react';
import { useSession } from '../auth/session';
import { can } from '../core/policy';
import { formatBytes } from '../core/format';
import { Badge, Busy, Empty, ErrorNotice, Notice, formatDate, useResource } from './components';
import {
    HEALTH_LABELS, OBJECT_STATUS_LABELS, cycleText, errorText, postureText, problemTitle, providerLabel, replicaHealth, replicaSummary, type ReplicationStatus
} from '../core/replication';
import { usePolling } from './polling';

/** Hébergement et réplicas : où sont les copies, ce qui manque, ce qui est en erreur. Visible avec le droit de surveiller les sauvegardes. */
export function ReplicationMonitoring() {
    const { me, demo, epoch } = useSession();
    if (demo || !can(me, 'PRESERVATION_BACKUP_READ')) return null;
    return <ReplicationDetails key={epoch} />;
}

function ReplicationDetails() {
    const { records } = useSession();
    const q = useResource<ReplicationStatus>(signal => records!.replicationStatus(signal), 'global-replication');
    usePolling(q.refresh, 60000);
    const data = q.data;
    const cycle = data ? cycleText(data, Date.now()) : null;
    return <section className="panel" aria-label="Hébergement et réplicas">
        <div className="table-toolbar"><h3>Hébergement et réplicas</h3><button className="btn secondary small" disabled={q.loading} onClick={q.refresh}>Actualiser l’hébergement</button></div>
        {q.loading && !data ? <Busy label="Chargement de l’hébergement…" /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : data && <>
            <div className="panel-padding">
                <p>Chaque fichier du stockage principal ({providerLabel(data.primaryProvider)}) peut être copié vers un ou plusieurs stockages de réplication, par exemple un volume hébergé en Guinée ou
                    un autre site. Chaque copie est relue et comparée à l’empreinte du fichier ; une copie altérée ou perdue est refaite.</p>
                <Notice tone={data.posture.meetsThreeTwoOne ? 'info' : 'warning'}>{postureText(data.posture)}</Notice>
                {cycle && <p className={cycle.late ? 'finding' : undefined}>{cycle.text}{data.lastCycleFinishedAt && <small className="cell-sub">Dernier cycle terminé le {formatDate(data.lastCycleFinishedAt)}.</small>}</p>}
                {data.fallbackReads > 0 && <Notice tone="warning">{data.fallbackReads} lecture{data.fallbackReads > 1 ? 's ont' : ' a'} été servie{data.fallbackReads > 1 ? 's' : ''} par un réplica depuis le démarrage du serveur : le stockage principal était indisponible pour {data.fallbackReads > 1 ? 'ces fichiers' : 'ce fichier'}.</Notice>}
                <p><small>La posture est déclarée par la configuration : le serveur ne peut pas constater l’emplacement physique d’un stockage. Elle ne remplace pas un plan de reprise testé.</small></p>
            </div>
            {data.replicas.length === 0 ? <Empty title="Aucun réplica configuré" description="Les fichiers n’existent que dans le stockage principal." icon="archive" />
                : <div className="table-scroll"><table><thead><tr><th>Réplica</th><th>Support</th><th>État</th><th>Copies</th><th>Dernière vérification</th></tr></thead>
                    <tbody>{data.replicas.map(r => {
                        const health = replicaHealth(r);
                        return <tr key={r.name}>
                            <td><strong>{r.name}</strong>{r.jurisdiction && <small className="cell-sub">{r.jurisdiction}</small>}</td>
                            <td>{providerLabel(r.provider)}<small className="cell-sub">{r.offsite ? 'Hors site' : 'Sur site'}</small></td>
                            <td><Badge value={health} label={HEALTH_LABELS[health]} /></td>
                            <td>{replicaSummary(r)}{r.oldestPendingAt && <small className="cell-sub">Plus ancien manque depuis le {formatDate(r.oldestPendingAt)}</small>}</td>
                            <td>{formatDate(r.lastVerifiedAt)}</td>
                        </tr>;
                    })}</tbody></table></div>}
            {data.problems.length > 0 && <>
                <div className="panel-padding"><h4>À examiner</h4></div>
                <div className="table-scroll"><table><thead><tr><th>Objet</th><th>Réplica</th><th>État</th><th>Cause</th><th>Taille</th></tr></thead>
                    <tbody>{data.problems.map((p, i) => <tr key={i}>
                        <td>{problemTitle(p)}</td>
                        <td>{p.replica}</td>
                        <td><Badge value={p.status} label={OBJECT_STATUS_LABELS[p.status]} /><small className="cell-sub">{p.attempts} essai{p.attempts > 1 ? 's' : ''}</small></td>
                        <td>{errorText(p.errorCode)}</td>
                        <td>{formatBytes(p.size)}</td>
                    </tr>)}</tbody></table></div>
            </>}
        </>}
    </section>;
}
