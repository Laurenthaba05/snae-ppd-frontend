import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { can } from '../core/policy';
import { Modal, useResource, Busy, ErrorNotice, Field, Badge, formatDate } from './components';

export function ProjectClosureDialog({ projectId, onClose, onChanged }: { projectId: string; onClose: () => void; onChanged: () => void }) {
    const { digitization, me } = useSession();
    const closure = useResource(signal => digitization!.projectClosure(projectId, signal), 'project-closure:' + projectId);
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const [saved, setSaved] = useState(false);
    const data = closure.data;
    const eligible = data?.project.statut === 'TERMINE' && data.pendingElements > 0 && can(me, 'DIGITIZATION_MANAGE', data.project);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!data || !eligible || saving || reason.trim().length < 10) return;
        setSaving(true); setError(null);
        try {
            await digitization!.reopenProject(projectId, data.project.versionLock, reason.trim());
            setSaved(true); setReason(''); closure.refresh(); onChanged();
        } catch (failure) { setError(failure); }
        finally { setSaving(false); }
    };
    return <Modal title="Clôture et historique du projet" subtitle={data?.project.nom} onClose={onClose} locked={saving}>
        {closure.loading ? <Busy /> : closure.error ? <ErrorNotice error={closure.error} onRetry={closure.refresh} /> : data && <>
            <p>État actuel : <Badge value={data.project.statut} /></p>
            <p>Éléments encore en attente : <strong>{data.pendingElements}</strong></p>
            {data.project.dateFinReelle && <p>Date de clôture : {formatDate(data.project.dateFinReelle)}</p>}
            {saved && <p role="status">Le projet est remis en cours. Les éléments et l’historique sont conservés.</p>}
            {data.lastCorrection && <section aria-label="Dernière correction de clôture">
                <h3>Dernière correction de clôture</h3>
                <p>{formatDate(data.lastCorrection.correctedAt)} · clôture précédente : {formatDate(data.lastCorrection.previousEndDate)}</p>
                <p>{data.lastCorrection.reason}</p>
                <small>Cette correction et la clôture initiale restent dans le journal d’audit.</small>
            </section>}
            {eligible && <form onSubmit={submit}>
                <p>La remise en cours permet de reprendre les éléments à leur étape actuelle. La clôture initiale reste dans l’historique.</p>
                <Field label="Motif de correction" hint="Expliquez pourquoi la clôture était prématurée (10 à 1 000 caractères).">
                    <textarea value={reason} onChange={e => setReason(e.target.value)} required minLength={10} maxLength={1000} disabled={saving} />
                </Field>
                {error != null && <ErrorNotice error={error} onRetry={closure.refresh} />}
                <button className="btn primary" type="submit" disabled={saving || reason.trim().length < 10}>{saving ? 'Enregistrement…' : 'Remettre le projet en cours'}</button>
            </form>}
            {!eligible && data.project.statut === 'TERMINE' && data.pendingElements === 0 && <p>Tous les éléments sont terminés ou annulés. Cette clôture ne nécessite pas de correction.</p>}
            {data.project.statut === 'ANNULE' && <p>Un projet annulé ne peut pas être rouvert par cette correction.</p>}
        </>}
    </Modal>;
}
