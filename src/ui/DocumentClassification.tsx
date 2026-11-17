import React, { useState } from 'react';
import { useSession } from '../auth/session';
import type { ClassificationNode } from '../core/types';
import { Busy, ErrorNotice, Field, Modal, Notice, useResource } from './components';

export function usableClassification(node: ClassificationNode, institutionId: string, today = new Date().toISOString().slice(0, 10)) {
    return node.statut === 'ACTIF' && (!node.institutionId || node.institutionId === institutionId)
        && (!node.dateDebutValidite || node.dateDebutValidite <= today) && (!node.dateFinValidite || node.dateFinValidite >= today);
}
/** Mêmes états que DocumentService.classify ; une archive semi-active encore ouverte reste classable. */
export const classificationEditable = (record: { businessStatus: string; archivalStatus: string; destroyed?: boolean }) =>
    !record.destroyed && record.businessStatus !== 'CLOS' && !['ARCHIVE_DEFINITIVE', 'ELIMINATION_APPROUVEE', 'DETRUIT'].includes(record.archivalStatus);
export const classificationLabel = (node: ClassificationNode) => [node.code, node.libelle].filter(Boolean).join(' · ');

export function ReclassifyDialog({ documentId, institutionId, currentNodeId, onClose, onSuccess }: {
    documentId: string; institutionId: string; currentNodeId: string | null; onClose: () => void; onSuccess: () => void;
}) {
    const { records, classification } = useSession();
    const nodesQ = useResource(s => classification!.nodes(institutionId, s), 'reclassify-nodes:' + institutionId);
    const [nodeId, setNodeId] = useState(currentNodeId ?? '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const nodes = (nodesQ.data ?? []).filter(n => usableClassification(n, institutionId));
    const valid = !nodeId || nodes.some(n => n.id === nodeId);
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy || nodesQ.loading || nodesQ.error || !valid) return;
        setBusy(true); setError(null);
        try { await records!.classify(documentId, nodeId || null, crypto.randomUUID()); onSuccess(); onClose(); }
        catch (err) { setError(err); } finally { setBusy(false); }
    };
    return <Modal title="Reclasser le document" onClose={onClose} locked={busy}><form onSubmit={submit}>
        <Notice>Choisissez une rubrique active et valable aujourd’hui. Ce choix est journalisé et ne déplace pas le document dans un autre dossier. Sans rubrique, la validation finale du traitement sera bloquée.</Notice>
        {nodesQ.loading ? <Busy /> : nodesQ.error ? <ErrorNotice error={nodesQ.error} onRetry={nodesQ.refresh} /> : <Field label="Nœud de classement" hint="Vide pour retirer le classement.">
            <select value={nodeId} onChange={e => setNodeId(e.target.value)} disabled={busy}>
                <option value="">Aucun</option>
                {nodeId && !valid && <option value={nodeId} disabled>Rubrique actuelle non utilisable — choisir une autre rubrique</option>}
                {nodes.map(n => <option key={n.id} value={n.id}>{classificationLabel(n)}</option>)}
            </select></Field>}
        {error ? <ErrorNotice error={error} /> : null}
        <footer className="modal-footer"><button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Annuler</button><button className="btn primary" disabled={busy || nodesQ.loading || !!nodesQ.error || !valid}>Enregistrer</button></footer>
    </form></Modal>;
}
