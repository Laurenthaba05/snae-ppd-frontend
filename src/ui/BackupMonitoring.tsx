import React, { useEffect, useRef } from 'react';
import { useSession } from '../auth/session';
import { can } from '../core/policy';
import { Busy, Empty, ErrorNotice, Notice, formatDate, useResource } from './components';

const errors: Record<string, string> = {
    BACKUP_FAILED: 'La copie a échoué. La prochaine tentative est prévue dans une heure.',
    RESTORE_FAILED: 'La copie existe, mais sa restauration de contrôle a échoué. Une intervention est nécessaire.',
    RETENTION_FAILED: 'La copie et sa restauration ont réussi, mais le rangement des anciennes copies a échoué.',
    BACKUP_INTERRUPTED: 'La sauvegarde a été interrompue. Une nouvelle tentative a été planifiée.',
    BACKUP_TIMEOUT: 'La sauvegarde a dépassé le délai autorisé.',
};
export function BackupMonitoring() {
    const { me, demo, epoch } = useSession();
    if (demo || !can(me, 'PRESERVATION_BACKUP_READ')) return null;
    return <BackupDetails key={epoch}/>;
}
function BackupDetails() {
    const { records } = useSession();
    const q = useResource(signal => records!.backupMonitor(signal), 'global-backups');
    const refresh = useRef(q.refresh); refresh.current = q.refresh;
    useEffect(() => {
        const timer = window.setInterval(() => { if (document.visibilityState === 'visible') refresh.current(); }, 60000);
        return () => window.clearInterval(timer);
    }, []);
    const data = q.data;
    const late = !!(data?.enabled && !data.running && Date.parse(data.nextRunAt) < Date.now() - 5 * 60000);
    return <section className="panel" aria-label="Sauvegardes et restaurations">
        <div className="table-toolbar"><h3>Sauvegardes et restaurations</h3><button className="btn secondary small" disabled={q.loading} onClick={q.refresh}>Actualiser les sauvegardes</button></div>
        {q.loading ? <Busy label="Chargement des sauvegardes…"/> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh}/> : data && <>
            <div className="panel-padding">
                <p>Sauvegarde des données applicatives et des fichiers stockés localement. Fréquence : toutes les {data.intervalHours} heures. Conservation : {data.retentionCopies} dernières copies restaurées avec succès.</p>
                <p>Les comptes de connexion, les secrets et la configuration des services nécessitent une procédure de reprise séparée. Le contrôle de restauration vérifie les données et les fichiers ; il ne confirme pas le redémarrage complet de la plateforme.</p>
                {!data.enabled && <Notice tone="warning">Les sauvegardes automatiques sont désactivées.</Notice>}
                {data.running && <Notice>Une sauvegarde et son contrôle de restauration sont en cours.</Notice>}
                {data.errorCode && <div role="alert"><Notice tone="warning">{errors[data.errorCode] ?? 'Le cycle de sauvegarde a échoué. Une intervention technique est nécessaire.'}</Notice></div>}
                {late && <div role="alert"><Notice tone="warning">La sauvegarde prévue est en retard. Vérifiez que le service fonctionne.</Notice></div>}
                <dl className="preservation-summary"><div><dt>Dernière copie restaurée avec succès</dt><dd>{formatDate(data.lastSuccessAt)}</dd></div><div><dt>Prochaine tentative</dt><dd>{formatDate(data.nextRunAt)}</dd></div></dl>
                <p>Les copies s’exécutent quand le backend fonctionne ; une échéance manquée est reprise à son redémarrage. Une copie sur le disque des originaux ne protège pas contre la panne de ce disque.</p>
            </div>
            {data.runs.length ? <div className="table-scroll"><table><thead><tr><th>Début</th><th>Résultat</th><th>Fichiers copiés</th><th>Copie vérifiée</th><th>Restauration</th></tr></thead><tbody>{data.runs.map(run => <tr key={run.id}>
                <td>{formatDate(run.startedAt)}</td><td>{run.status === 'RUNNING' ? 'En cours' : run.status === 'SUCCEEDED' ? 'Terminé' : run.status === 'INTERRUPTED' ? 'Interrompu' : 'Échec'}{run.errorCode && <small className="cell-sub">{errors[run.errorCode] ?? 'Intervention nécessaire'}</small>}</td>
                <td>{run.objectCount ?? '—'}</td><td>{run.manifestVerified ? 'Oui' : 'Non confirmée'}</td><td>{run.restoreVerified ? 'Réussie' : 'Non confirmée'}</td>
            </tr>)}</tbody></table></div> : <Empty title="Aucun cycle terminé" description="La première sauvegarde est en attente."/>}
        </>}
    </section>;
}
