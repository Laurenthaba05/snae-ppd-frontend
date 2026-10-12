import React, { useEffect, useRef, useState } from 'react';
import { useSession } from '../auth/session';
import type { PreservationFileState } from '../core/types';
import { useWorkspace } from './workspace';
import { Busy, Empty, ErrorNotice, Notice, Pagination, formatDate, useResource } from './components';
import { navigate } from './navigation';

const labels: Record<PreservationFileState, string> = {
    BLOCKED: 'Intégrité compromise — bloqué', UNAVAILABLE: 'Stockage indisponible — nouvel essai prévu',
    UNSCHEDULED: 'Contrôle automatique non planifié', RUNNING: 'Contrôle en cours',
    DUE: 'Contrôle à effectuer', VERIFIED: 'Intégrité vérifiée',
};
export function PreservationMonitoring() {
    const { scope } = useWorkspace();
    const { epoch } = useSession();
    return <ScopedMonitoring key={JSON.stringify([scope, epoch])}/>;
}
function ScopedMonitoring() {
    const { records, demo } = useSession();
    const { scope } = useWorkspace();
    const [page, setPage] = useState(0);
    const [attentionOnly, setAttentionOnly] = useState(false);
    const q = useResource(signal => demo ? Promise.resolve(null) : records!.preservationMonitor(scope.institutionId, scope.departmentId, page, attentionOnly, signal),
        JSON.stringify([scope, page, attentionOnly, demo]));
    const refresh = useRef(q.refresh);
    refresh.current = q.refresh;
    useEffect(() => {
        if (demo) return;
        const timer = window.setInterval(() => { if (document.visibilityState === 'visible') refresh.current(); }, 60000);
        return () => window.clearInterval(timer);
    }, [demo]);
    if (demo) return <Notice>Le suivi automatique de conservation est disponible en mode connecté.</Notice>;
    const data = q.data;
    const lastActivity = data?.worker.lastHeartbeatAt;
    const late = !!(data?.enabled && lastActivity && Date.now() - Date.parse(lastActivity) > Math.max(data.pollMs * 5, 15 * 60000));
    return <section className="panel" aria-label="Contrôles automatiques d’intégrité">
        <div className="table-toolbar"><h3>Contrôles automatiques d’intégrité</h3><button className="btn secondary small" disabled={q.loading} onClick={q.refresh}>Actualiser les contrôles</button></div>
        {q.loading ? <Busy label="Chargement du suivi de conservation…"/> : q.error ? <div className="panel-padding"><ErrorNotice error={q.error} onRetry={q.refresh}/></div> : data && <>
            <div className="panel-padding">
                {!data.enabled ? <Notice tone="warning">Les contrôles périodiques sont désactivés. Leur activation doit être effectuée par l’administrateur du serveur.</Notice> :
                    <p>Contrôle prévu tous les {data.intervalDays} jours. Dernier passage du service : {formatDate(data.worker.lastFinishedAt)}.</p>}
                {data.enabled && !lastActivity && <Notice tone="warning">Le premier passage du service est en attente. Aucun contrôle automatique n’est encore confirmé.</Notice>}
                {data.worker.errorCode && <div role="alert"><Notice tone="warning">Le service de contrôle a rencontré une erreur. Une intervention technique est nécessaire.</Notice></div>}
                {late && <div role="alert"><Notice tone="warning">Le service de contrôle ne donne plus de nouvelles. Vérifiez son fonctionnement.</Notice></div>}
                <dl className="preservation-summary">
                    <div><dt>Fichiers suivis</dt><dd>{data.summary.total}</dd></div><div><dt>Bloqués</dt><dd>{data.summary.blocked}</dd></div>
                    <div><dt>Stockage indisponible</dt><dd>{data.summary.unavailable}</dd></div><div><dt>À contrôler</dt><dd>{data.summary.due}</dd></div><div><dt>Non planifiés</dt><dd>{data.summary.unscheduled}</dd></div>
                </dl>
                {data.summary.blocked > 0 && <div role="alert"><Notice tone="warning">Des fichiers présentent une anomalie d’intégrité et restent bloqués. Leur récupération doit être examinée à partir d’une copie saine.</Notice></div>}
                <label><input type="checkbox" checked={attentionOnly} onChange={event => { setAttentionOnly(event.target.checked); setPage(0); }}/> Afficher seulement les fichiers à examiner</label>
            </div>
            {data.items.length ? <div className="table-scroll"><table><thead><tr><th>Fichier / document</th><th>État</th><th>Dernière intégrité confirmée</th><th>Dernier contrôle automatique</th><th>Prochain contrôle</th><th/></tr></thead><tbody>
                {data.items.map(file => <tr key={file.fileId}><td>{file.filename}<small className="cell-sub">{file.documentReference}</small></td>
                    <td>{labels[file.status]}{file.consecutiveFailures > 0 && <small className="cell-sub">{file.consecutiveFailures} échec(s) consécutif(s)</small>}</td>
                    <td>{formatDate(file.lastVerifiedAt)}</td><td>{formatDate(file.lastCheckedAt)}</td><td>{file.status === 'BLOCKED' ? 'Intervention requise' : formatDate(file.nextCheckAt)}</td>
                    <td><button className="btn small secondary" onClick={() => navigate('/app/documents/' + file.documentId)}>Ouvrir le document</button></td></tr>)}
            </tbody></table></div> : <Empty title={attentionOnly ? 'Aucun fichier à examiner' : 'Aucun fichier suivi'} description="Résultat limité aux fichiers visibles dans votre périmètre."/>}
            <Pagination page={page} hasMore={data.hasMore} count={data.items.length} onChange={setPage}/>
        </>}
    </section>;
}
