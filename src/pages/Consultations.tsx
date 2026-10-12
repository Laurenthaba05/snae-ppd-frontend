import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { useWorkspace } from '../ui/workspace';
import { can } from '../core/policy';
import { Badge, Busy, Empty, ErrorNotice, Field, Modal, Notice, PageHead, formatDate, useResource } from '../ui/components';
import { ReferencePicker } from '../ui/ReferencePicker';
import { AccessRequestsPanel } from '../ui/PortalAdminAccess';
import type { Communication, ConsultationRequest, Page, RecordDocument } from '../core/types';

function useDocumentOptions() {
    const { records } = useSession();
    const { scope } = useWorkspace();
    const q = useResource<Page<RecordDocument>>(s => records!.documents({ ...scope, page: 0, size: 100 }, s),
        JSON.stringify(['consultation-documents', scope]));
    return q;
}

function CreateConsultationRequestDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
    const { consultation } = useSession();
    const docs = useDocumentOptions();
    const [documentId, setDocumentId] = useState('');
    const [motif, setMotif] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy) return;
        if (!documentId) { setError(new Error('Choisissez un document.')); return; }
        setBusy(true); setError(null);
        try {
            await consultation!.createRequest(documentId, null, motif, crypto.randomUUID());
            onSuccess(); onClose();
        } catch (err) { setError(err); } finally { setBusy(false); }
    };
    return <Modal title="Déposer une demande de dérogation" subtitle="Uniquement nécessaire pour un document sous restriction d’accès active." onClose={onClose} locked={busy}>
        <form onSubmit={submit}><div className="form-grid">
            <Field label="Document *" wide>{docs.loading ? <Busy /> : docs.error ? <ErrorNotice error={docs.error} /> :
                <select value={documentId} onChange={e => setDocumentId(e.target.value)} required>
                    <option value="">Choisir un document</option>
                    {docs.data?.items.map(d => <option key={d.id} value={d.id}>{d.reference} · {d.title}</option>)}
                </select>}</Field>
            <Field label="Motif *" wide hint="Justification de la demande de dérogation."><textarea value={motif} onChange={e => setMotif(e.target.value)} required maxLength={4000} /></Field>
        </div>{Boolean(error) && <ErrorNotice error={error} />}
        <footer className="modal-footer"><button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>{busy ? <span className="spinner" /> : null} Déposer</button></footer></form>
    </Modal>;
}

function RefuseDialog({ onClose, onConfirm }: { onClose: () => void; onConfirm: (motif: string) => Promise<void> }) {
    const [motif, setMotif] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true); setError(null);
        try { await onConfirm(motif); onClose(); } catch (err) { setError(err); } finally { setBusy(false); }
    };
    return <Modal title="Refuser la demande" onClose={onClose} locked={busy}>
        <form onSubmit={submit}><div className="form-grid">
            <Field label="Motif du refus *" wide><textarea value={motif} onChange={e => setMotif(e.target.value)} required maxLength={4000} /></Field>
        </div>{Boolean(error) && <ErrorNotice error={error} />}
        <footer className="modal-footer"><button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Annuler</button><button type="submit" className="btn warning" disabled={busy}>{busy ? <span className="spinner" /> : null} Refuser</button></footer></form>
    </Modal>;
}

/** Les demandes de dérogation du personnel, et celles des lecteurs du portail pour les documents qu'il n'ouvre pas librement. */
export function ConsultationsPage() {
    const [tab, setTab] = useState<'derogations' | 'portail'>('derogations');
    const tabs: Array<['derogations' | 'portail', string]> = [['derogations', 'Demandes de dérogation'], ['portail', 'Demandes des lecteurs du portail']];
    return <>
        <div role="tablist" className="asset-tabs page-tabs" aria-label="Types de demandes">
            {tabs.map(([key, text]) => <button key={key} role="tab" type="button" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{text}</button>)}
        </div>
        {tab === 'derogations' ? <DerogationsPanel /> : <>
            <PageHead eyebrow="ACCÈS" title="Consultations" description="Accès des lecteurs du portail public aux documents que l'institution ne met pas en lecture libre." />
            <AccessRequestsPanel />
        </>}
    </>;
}

function DerogationsPanel() {
    const { me, consultation, epoch } = useSession();
    const { scope } = useWorkspace();
    const canReview = can(me, 'CONSULTATION_REVIEW', scope);
    const canCreate = can(me, 'CONSULTATION_REQUEST_CREATE', scope);
    const [creating, setCreating] = useState(false);
    const [refusing, setRefusing] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [actionError, setActionError] = useState<unknown>(null);
    const key = JSON.stringify(['consultation-requests', scope.institutionId, epoch]);
    const q = useResource<ConsultationRequest[]>(s => scope.institutionId
        ? consultation!.requestsByInstitution(scope.institutionId, s)
        : consultation!.myRequests(s), key);
    const claim = async (id: string) => {
        setBusyId(id); setActionError(null);
        try { await consultation!.claim(id, crypto.randomUUID()); q.refresh(); } catch (e) { setActionError(e); } finally { setBusyId(null); }
    };
    const authorize = async (id: string) => {
        setBusyId(id); setActionError(null);
        try { await consultation!.authorize(id, null, crypto.randomUUID()); q.refresh(); } catch (e) { setActionError(e); } finally { setBusyId(null); }
    };
    const refuse = async (motif: string) => {
        if (!refusing) return;
        await consultation!.refuse(refusing, motif, crypto.randomUUID());
        q.refresh();
    };
    return <>
        <PageHead eyebrow="ACCÈS" title="Consultations" description="Demandes de dérogation pour les documents sous restriction d’accès active.">
            {canCreate && <button className="btn primary" onClick={() => setCreating(true)}>Déposer une demande</button>}
        </PageHead>
        {!scope.institutionId && <Notice>Périmètre national : cette liste affiche uniquement vos propres demandes. Choisissez une institution pour instruire les demandes déposées auprès d'elle.</Notice>}
        {Boolean(actionError) && <ErrorNotice error={actionError} />}
        {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : q.data?.length ?
            <div className="table-scroll"><table><thead><tr><th>Motif</th><th>Statut</th><th>Déposée le</th><th /></tr></thead><tbody>
                {q.data.map(r => <tr key={r.id}>
                    <td>{r.motif}</td>
                    <td><Badge value={r.statut} /></td>
                    <td>{formatDate(r.dateDepot)}</td>
                    <td className="table-actions">
                        {canReview && r.statut === 'DEPOSEE' && <button className="btn small secondary" disabled={busyId === r.id} onClick={() => claim(r.id)}>Prendre en charge</button>}
                        {canReview && r.statut === 'EN_INSTRUCTION' && <><button className="btn small primary" disabled={busyId === r.id} onClick={() => authorize(r.id)}>Autoriser</button><button className="btn small warning" disabled={busyId === r.id} onClick={() => setRefusing(r.id)}>Refuser</button></>}
                    </td>
                </tr>)}
            </tbody></table></div> : <Empty title="Aucune demande" description="Aucune demande de dérogation dans ce périmètre." />}
        {creating && <CreateConsultationRequestDialog onClose={() => setCreating(false)} onSuccess={q.refresh} />}
        {refusing && <RefuseDialog onClose={() => setRefusing(null)} onConfirm={refuse} />}
    </>;
}

function CreateCommunicationDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
    const { consultation } = useSession();
    const docs = useDocumentOptions();
    const [documentId, setDocumentId] = useState('');
    const [beneficiaireId, setBeneficiaireId] = useState('');
    const [demandeConsultationId, setDemandeConsultationId] = useState('');
    const [lieu, setLieu] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy) return;
        if (!documentId || !beneficiaireId) { setError(new Error('Document et bénéficiaire requis.')); return; }
        setBusy(true); setError(null);
        try {
            await consultation!.createCommunication(documentId, null, beneficiaireId, demandeConsultationId || null, lieu.trim() || null, crypto.randomUUID());
            onSuccess(); onClose();
        } catch (err) { setError(err); } finally { setBusy(false); }
    };
    return <Modal title="Enregistrer une communication" subtitle="Registre de remise et de restitution. Si le document est restreint, la dérogation autorisée correspondante est requise." onClose={onClose} locked={busy}>
        <form onSubmit={submit}><div className="form-grid">
            <Field label="Document *" wide>{docs.loading ? <Busy /> : docs.error ? <ErrorNotice error={docs.error} /> :
                <select value={documentId} onChange={e => setDocumentId(e.target.value)} required>
                    <option value="">Choisir un document</option>
                    {docs.data?.items.map(d => <option key={d.id} value={d.id}>{d.reference} · {d.title}</option>)}
                </select>}</Field>
            <Field label="Bénéficiaire *" wide><ReferencePicker kind="users" value={beneficiaireId} onChange={setBeneficiaireId} label="Sélectionner : bénéficiaire" /></Field>
            <Field label="Dérogation associée" hint="Requise uniquement si le document est restreint. Renseignez l'identifiant de la demande autorisée."><input value={demandeConsultationId} onChange={e => setDemandeConsultationId(e.target.value)} placeholder="UUID de la demande autorisée" /></Field>
            <Field label="Lieu" hint="Optionnel."><input value={lieu} onChange={e => setLieu(e.target.value)} maxLength={255} /></Field>
        </div>{Boolean(error) && <ErrorNotice error={error} />}
        <footer className="modal-footer"><button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>{busy ? <span className="spinner" /> : null} Enregistrer</button></footer></form>
    </Modal>;
}

export function CommunicationsPage() {
    const { me, consultation, epoch } = useSession();
    const { scope } = useWorkspace();
    const canManage = can(me, 'COMMUNICATION_MANAGE', scope);
    const [creating, setCreating] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [actionError, setActionError] = useState<unknown>(null);
    const key = JSON.stringify(['communications', scope.institutionId, epoch]);
    const q = useResource<Communication[]>(s => scope.institutionId
        ? consultation!.communicationsByInstitution(scope.institutionId, s)
        : Promise.resolve([]), key);
    const deliver = async (id: string) => {
        setBusyId(id); setActionError(null);
        try { await consultation!.deliver(id, crypto.randomUUID()); q.refresh(); } catch (e) { setActionError(e); } finally { setBusyId(null); }
    };
    const returnItem = async (id: string) => {
        setBusyId(id); setActionError(null);
        try { await consultation!.returnItem(id, crypto.randomUUID()); q.refresh(); } catch (e) { setActionError(e); } finally { setBusyId(null); }
    };
    return <>
        <PageHead eyebrow="ACCÈS" title="Communications" description="Registre de remise et de restitution des documents consultés.">
            {canManage && scope.institutionId && <button className="btn primary" onClick={() => setCreating(true)}>Enregistrer une communication</button>}
        </PageHead>
        {!scope.institutionId && <Notice>Choisissez une institution dans le contexte de travail pour consulter et gérer son registre de communications.</Notice>}
        {Boolean(actionError) && <ErrorNotice error={actionError} />}
        {scope.institutionId && (q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : q.data?.length ?
            <div className="table-scroll"><table><thead><tr><th>Statut</th><th>Lieu</th><th>Demandée le</th><th /></tr></thead><tbody>
                {q.data.map(c => <tr key={c.id}>
                    <td><Badge value={c.statut} /></td>
                    <td>{c.lieu ?? '—'}</td>
                    <td>{formatDate(c.dateDemande)}</td>
                    <td className="table-actions">
                        {canManage && c.statut === 'DEMANDEE' && <button className="btn small primary" disabled={busyId === c.id} onClick={() => deliver(c.id)}>Marquer remise</button>}
                        {canManage && c.statut === 'REMISE' && <button className="btn small secondary" disabled={busyId === c.id} onClick={() => returnItem(c.id)}>Marquer restituée</button>}
                    </td>
                </tr>)}
            </tbody></table></div> : <Empty title="Aucune communication" description="Aucune communication enregistrée dans ce périmètre." />)}
        {creating && <CreateCommunicationDialog onClose={() => setCreating(false)} onSuccess={q.refresh} />}
    </>;
}
