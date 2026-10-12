import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { ingestionMessage, isInterruptedIngestion } from '../core/ingestion';
import { Busy, CopyId, Empty, ErrorNotice, Field, Modal, Notice, formatDate, useResource } from './components';
import type { Ingestion } from '../core/types';

export function IngestionHistory({ versionId, onClose, onRefreshFiles }: { versionId: string; onClose: () => void; onRefreshFiles: () => void }) {
    const { records, epoch } = useSession();
    const [cursors, setCursors] = useState<(string | null)[]>([null]);
    const [selected, setSelected] = useState<Ingestion | null>(null);
    const [reason, setReason] = useState('');
    const [cancelling, setCancelling] = useState(false);
    const [bulk, setBulk] = useState(false);
    const [bulkReason, setBulkReason] = useState('');
    const [bulkResult, setBulkResult] = useState<string | null>(null);
    const [error, setError] = useState<unknown>(null);
    const before = cursors[cursors.length - 1];
    const q = useResource(signal => records!.ingestions(versionId, signal, before), JSON.stringify(['ingestions', versionId, before, epoch]));
    const labels = { PROCESSING: 'Analyse en cours', RETRYABLE: 'Traitement interrompu', REJECTED: 'Rejeté', COMPLETED: 'Dépôt terminé' };
    const refresh = () => { setCursors([null]); q.refresh(); onRefreshFiles(); };
    const cancel = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!selected || cancelling || !reason.trim()) return;
        setCancelling(true); setError(null);
        try { await records!.command('/ingestions/' + selected.id + '/cancel', { reason: reason.trim() }, crypto.randomUUID()); setSelected(null); setReason(''); refresh(); }
        catch (err) { setError(err); }
        finally { setCancelling(false); }
    };
    const interrupted = (q.data?.items ?? []).filter(isInterruptedIngestion);
    /** Abandonne d'un coup les dépôts interrompus de la page, avec un seul motif ; s'arrête au premier refus et dit où. */
    const cancelAll = async (event: React.FormEvent) => {
        event.preventDefault();
        if (cancelling || !bulkReason.trim() || !interrupted.length) return;
        setCancelling(true); setError(null); setBulkResult(null);
        let done = 0;
        try {
            for (const item of interrupted) { await records!.command('/ingestions/' + item.id + '/cancel', { reason: bulkReason.trim() }, crypto.randomUUID()); done += 1; }
            setBulk(false); setBulkReason(''); setBulkResult(`${done} dépôt${done > 1 ? 's' : ''} abandonné${done > 1 ? 's' : ''}.`); refresh();
        }
        catch (err) { setError(err); setBulkResult(done ? `${done} dépôt${done > 1 ? 's' : ''} abandonné${done > 1 ? 's' : ''} avant l’erreur.` : null); if (done) refresh(); }
        finally { setCancelling(false); }
    };
    return <Modal title="Suivi de mes dépôts" subtitle="Retrouvez les dépôts effectués pour cette version, y compris après la fermeture de la fenêtre de téléversement." onClose={onClose} wide locked={cancelling}>
        <div className="panel-padding"><Notice>Un dépôt terminé doit encore être validé dans la liste des fichiers avant de pouvoir être consulté ou téléchargé.</Notice>
            {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh}/> : !q.data?.items.length ? <Empty title="Aucun dépôt sur cette page"/> :
                <div className="table-scroll"><table><thead><tr><th>Fichier</th><th>État</th><th>Dernière mise à jour</th><th>Référence</th></tr></thead><tbody>
                    {q.data.items.map(item => <tr key={item.id}><td>{item.filename}</td><td><strong>{item.resultCode === 'INGESTION_CANCELLED' ? 'Annulé' : item.status === 'PROCESSING' && item.leaseExpired ? 'Traitement expiré' : labels[item.status]}</strong>{(isInterruptedIngestion(item) || item.status === 'REJECTED') && <p>{ingestionMessage(item)}</p>}{isInterruptedIngestion(item) && <button className="btn small secondary" disabled={cancelling} onClick={() => { setSelected(item); setReason(''); setError(null); }}>Abandonner ce dépôt</button>}</td><td>{formatDate(item.updatedAt)}</td><td><CopyId value={item.id}/></td></tr>)}
                </tbody></table></div>}
        </div>
        {!selected && interrupted.length > 1 && !bulk && <div className="panel-padding"><button className="btn small warning" disabled={cancelling} onClick={() => { setBulk(true); setBulkResult(null); setError(null); }}>Abandonner les {interrupted.length} dépôts interrompus de cette page</button></div>}
        {bulkResult && <div className="panel-padding"><Notice>{bulkResult}</Notice></div>}
        {bulk && <form className="panel-padding" onSubmit={cancelAll}><h3>Abandonner {interrupted.length} dépôts interrompus</h3><p>Ces dépôts seront annulés ; ils n’empêcheront plus de sceller la version. Un fichier déjà déposé et validé n’est pas touché.</p><Field label="Motif de l’abandon *"><textarea value={bulkReason} onChange={event => setBulkReason(event.target.value)} required maxLength={1000} disabled={cancelling}/></Field>
            {Boolean(error) && <ErrorNotice error={error}/>}
            <div className="table-actions"><button type="button" className="btn secondary" disabled={cancelling} onClick={() => setBulk(false)}>Ne pas abandonner</button><button type="submit" className="btn warning" disabled={cancelling || !bulkReason.trim()}>{cancelling ? 'Abandon en cours…' : `Abandonner ${interrupted.length} dépôts`}</button></div></form>}
        {selected && <form className="panel-padding" onSubmit={cancel}><h3>Abandonner le dépôt « {selected.filename} »</h3><p>Ce dépôt interrompu sera annulé. Pour déposer le fichier ensuite, il faudra effectuer un nouveau téléversement.</p><Field label="Motif de l’abandon *"><textarea value={reason} onChange={event => setReason(event.target.value)} required maxLength={1000} disabled={cancelling}/></Field>{Boolean(error) && <ErrorNotice error={error}/>}<div className="table-actions"><button type="button" className="btn secondary" disabled={cancelling} onClick={() => setSelected(null)}>Conserver le dépôt</button><button type="submit" className="btn danger-outline" disabled={cancelling || !reason.trim()}>{cancelling ? 'Annulation…' : 'Confirmer l’abandon'}</button></div></form>}
        <footer className="modal-footer"><button className="btn secondary" disabled={cancelling} onClick={onClose}>Fermer</button><button className="btn secondary" disabled={cancelling || q.loading || cursors.length === 1} onClick={() => setCursors(previous => previous.slice(0, -1))}>Plus récents</button><button className="btn secondary" disabled={cancelling || q.loading || !q.data?.nextCursor} onClick={() => { if (q.data?.nextCursor) setCursors(previous => [...previous, q.data!.nextCursor]); }}>Plus anciens</button><button className="btn primary" disabled={cancelling || q.loading} onClick={refresh}>Actualiser</button></footer>
    </Modal>;
}
