import React, { useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { useWorkspace } from '../ui/workspace';
import { moduleVisible } from '../design/navigation';
import { IntentKey } from '../core/validation';
import type { Page, ScopeTarget, WorkflowInboxBucket, WorkflowInboxItem } from '../core/types';
import { Badge, Busy, Empty, ErrorNotice, Notice, PageHead, Pagination, formatDate, useResource } from '../ui/components';
import { navigate } from '../ui/navigation';
import { CompleteTaskDialog } from './Workflow';

export function TaskInboxPage() {
    const { me } = useSession();
    const { scope } = useWorkspace();
    if (!moduleVisible(me, 'taches', scope)) return <Notice tone="warning">Votre compte ne dispose pas d’une habilitation de traitement des tâches.</Notice>;
    // A changed workspace must not retain a task dialog or page from the previous scope.
    return <Inbox key={(scope.institutionId ?? '') + ':' + (scope.departmentId ?? '')} scope={scope} />;
}
function Inbox({ scope }: { scope: ScopeTarget }) {
    const { workflow, epoch } = useSession();
    const [bucket, setBucket] = useState<WorkflowInboxBucket>('MINE');
    const [allScopes, setAllScopes] = useState(true);
    const [page, setPage] = useState(0);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<unknown>(null);
    const [message, setMessage] = useState('');
    const [completing, setCompleting] = useState<WorkflowInboxItem | null>(null);
    const claimIntent = useRef(new IntentKey());
    const claimPending = useRef(false);
    const target = allScopes ? {} : scope;
    const q = useResource<Page<WorkflowInboxItem>>(s => workflow!.inbox(bucket, target, page, s),
        'task-inbox:' + JSON.stringify([epoch, bucket, target, page]));
    const rows = q.data?.items ?? [];
    const reset = () => { setPage(0); setError(null); setMessage(''); };
    const refresh = () => { setPage(0); q.refresh(); };
    const claim = async (task: WorkflowInboxItem) => {
        if (claimPending.current) return;
        claimPending.current = true;
        setBusy(task.id); setError(null); setMessage('');
        const path = '/workflow-tasks/' + task.id + '/claim';
        try {
            await workflow!.command(path, {}, claimIntent.current.forRequest('POST', path, {}), 'POST');
            claimIntent.current.clear();
            setBucket('MINE'); setPage(0);
            setMessage('La tâche « ' + task.stepLabel + ' » a été prise en charge. Elle apparaît dans « Mes tâches ».');
            q.refresh();
        } catch (e) { setError(e); q.refresh(); }
        finally { claimPending.current = false; setBusy(null); }
    };
    return <>
        <PageHead eyebrow="MODULE · TRAITEMENTS" title="Boîte des tâches" description="Retrouvez les tâches de validation de vos documents, prenez-les en charge et choisissez la suite à donner." />
        <section className="panel">
            <div className="table-toolbar">
                <div className="table-actions" role="group" aria-label="Boîte des tâches">
                    <button className={'btn ' + (bucket === 'MINE' ? 'primary' : 'secondary')} aria-pressed={bucket === 'MINE'} disabled={!!busy} onClick={() => { setBucket('MINE'); reset(); }}>Mes tâches</button>
                    <button className={'btn ' + (bucket === 'AVAILABLE' ? 'primary' : 'secondary')} aria-pressed={bucket === 'AVAILABLE'} disabled={!!busy} onClick={() => { setBucket('AVAILABLE'); reset(); }}>À prendre en charge</button>
                </div>
                <div className="toolbar-right">
                    <label className="scan-toggle"><input type="checkbox" checked={allScopes} disabled={!!busy} onChange={e => { setAllScopes(e.target.checked); reset(); }} />Tous mes périmètres</label>
                    <button className="btn small secondary" disabled={!!busy} onClick={refresh}>Actualiser</button>
                </div>
            </div>
            <p className="page-note">{allScopes ? 'Tous les périmètres auxquels vous avez accès.' : 'Périmètre sélectionné dans l’en-tête.'} Les tâches sont classées par échéance, puis par ancienneté.</p>
            {message && <div role="status"><Notice tone="success">{message}</Notice></div>}
            {error ? <ErrorNotice error={error} /> : null}
            {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : <>
                {rows.length ? <div className="table-scroll"><table>
                    <thead><tr><th>Document</th><th>Étape</th><th>État</th><th>Échéance</th><th>Actions</th></tr></thead>
                    <tbody>{rows.map(task => <tr key={task.id}>
                        <td><strong>{task.documentTitle}</strong><small className="cell-sub">{task.documentReference}</small></td>
                        <td>{task.stepLabel}</td><td><Badge value={task.status} /></td>
                        <td>{formatDate(task.dueAt)}{task.dueAt && Date.parse(task.dueAt) < Date.now() && <small className="cell-sub">Échéance dépassée</small>}</td>
                        <td><div className="table-actions">
                            <button className="btn small secondary" onClick={() => navigate('/app/documents/' + task.documentId)}>Ouvrir le document</button>
                            {/* The server filters each row by scope, role, confidentiality and the bucket's action permission. */}
                            {bucket === 'AVAILABLE' && task.status === 'OUVERTE' && <button className="btn small primary" disabled={!!busy} onClick={() => void claim(task)}>Prendre en charge</button>}
                            {bucket === 'MINE' && task.status === 'EN_COURS' && <button className="btn small primary" disabled={!!busy} onClick={() => setCompleting(task)}>Terminer</button>}
                        </div></td>
                    </tr>)}</tbody>
                </table></div> : <Empty title={bucket === 'MINE' ? 'Aucune tâche en cours' : 'Aucune tâche à prendre en charge'} description={bucket === 'MINE' ? 'Consultez « À prendre en charge » pour commencer une tâche disponible.' : 'Aucune tâche disponible pour vos habilitations et ce périmètre.'} />}
                <Pagination page={page} hasMore={q.data?.hasMore ?? false} count={rows.length} onChange={setPage} />
            </>}
        </section>
        {completing && <CompleteTaskDialog task={{ taskId: completing.id, stepLabel: completing.stepLabel }} requireActions onClose={() => setCompleting(null)} onDone={() => { setMessage('La tâche a été terminée. La boîte a été actualisée.'); refresh(); }} />}
    </>;
}
