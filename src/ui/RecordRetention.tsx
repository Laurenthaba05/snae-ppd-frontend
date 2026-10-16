import { OptionalFields, useOptionalFields } from './OptionalFields';
import { LegalHoldDialog } from './LegalHoldDialog';
import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { useWorkspace } from './workspace';
import { Badge, Busy, ErrorNotice, Empty, useResource, formatDate, Modal, Field, Notice } from './components';
import { Icon } from './icons';
import { can } from '../core/policy';
import { ConfigureRetentionRuleDialog } from './RetentionRuleDialog';
import { RetentionPlanningBox } from './RetentionPlanningBox';
import { canSchedule as planningAllows } from '../core/retentionPlanning';
import type { RetentionPlanning, RetentionEvent, Disposition, LegalHold } from '../core/types';
import { CertificateButton, CertificateDialog, DestructionPreviewBox } from './Destruction';
import { DeclareTriggerEventDialog, DocumentTriggerEvents } from './TriggerEvents';
import { blockerText, confirmationText, type DestructionCertificate, type DestructionPreview } from '../core/destruction';

function ProposeDispositionDialog({ eventId, onClose, onSuccess }: {
    eventId: string;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const { retention } = useSession();
    const [decision, setDecision] = useState('REEXAMINER');
    const [comment, setComment] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy)
            return;
        setBusy(true);
        setError(null);
        try {
            await retention!.command('/events/' + eventId + '/dispositions', { decision, comment: comment.trim() || null }, crypto.randomUUID(), 'POST');
            onSuccess();
            onClose();
        }
        catch (err) {
            setError(err);
        }
        finally {
            setBusy(false);
        }
    };
    return <Modal title="Proposer une décision" subtitle="La validation devra être faite par une autre personne avant toute exécution." onClose={onClose} locked={busy}><form onSubmit={submit}><div className="form-grid">
        <Field label="Décision *"><select value={decision} onChange={e => setDecision(e.target.value)}><option value="CONSERVER_DEFINITIVEMENT">Conserver définitivement</option><option value="ELIMINER">Éliminer</option><option value="TRANSFERER">Transférer</option><option value="REEXAMINER">Réexaminer</option></select></Field>
        <Field label="Commentaire" wide hint="Optionnel."><textarea value={comment} onChange={e => setComment(e.target.value)} maxLength={4000}/></Field>
        </div>{Boolean(error) && <ErrorNotice error={error}/>}<footer className="modal-footer"><button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>{busy ? <span className="spinner"/> : <Icon name="arrow" size={17}/>} Proposer</button></footer></form></Modal>;
}

export function ValidateDispositionDialog({ dispositionId, decision, onClose, onSuccess }: {
    dispositionId: string;
    decision?: string;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const extra = useOptionalFields('dispositionEvidence');
    const { retention } = useSession();
    const [approve, setApprove] = useState(true);
    const [visaReference, setVisaReference] = useState('');
    const [procesVerbal, setProcesVerbal] = useState('');
    const [comment, setComment] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const elimination = decision === 'ELIMINER';
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy)
            return;
        setBusy(true);
        setError(null);
        try {
            const details = extra.payload();
            if (details.evidenceJson) details.evidenceJson = JSON.stringify(details.evidenceJson);
            await retention!.command('/dispositions/' + dispositionId + '/validate', { ...details, approve, visaReference: visaReference.trim() || null, procesVerbal: procesVerbal.trim() || null, comment: comment.trim() || null }, crypto.randomUUID(), 'POST');
            onSuccess();
            onClose();
        }
        catch (err) {
            setError(err);
        }
        finally {
            setBusy(false);
        }
    };
    return <Modal title="Valider la disposition" subtitle="La validation doit être faite par une personne différente de celle qui a proposé la décision." onClose={onClose} locked={busy}><form onSubmit={submit}><div className="form-grid">
        <OptionalFields form={extra} disabled={busy} />
        <Field label="Décision *"><select value={approve ? '1' : '0'} onChange={e => setApprove(e.target.value === '1')}><option value="1">Approuver</option><option value="0">Rejeter</option></select></Field>
        {elimination && approve && <div className="span2"><DestructionPreviewBox dispositionId={dispositionId}/></div>}
        <Field label={elimination && approve ? 'Référence de visa *' : 'Référence de visa'} hint={elimination && approve ? 'Obligatoire pour une élimination : la référence du visa de l’autorité.' : 'Optionnelle.'}><input value={visaReference} onChange={e => setVisaReference(e.target.value)} maxLength={255} required={elimination && approve}/></Field>
        <Field label={elimination && approve ? 'Procès-verbal *' : 'Procès-verbal'} wide hint={elimination && approve ? 'Obligatoire pour une élimination. L’inventaire exact des fichiers est joint à la preuve : l’exécution refusera s’ils changent.' : 'Optionnel.'}><textarea value={procesVerbal} onChange={e => setProcesVerbal(e.target.value)} maxLength={4000} required={elimination && approve}/></Field>
        <Field label="Commentaire" wide hint="Optionnel."><textarea value={comment} onChange={e => setComment(e.target.value)} maxLength={4000}/></Field>
        </div>{Boolean(error) && <ErrorNotice error={error}/>}<footer className="modal-footer"><button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Annuler</button><button type="submit" className={'btn ' + (approve ? 'primary' : 'danger')} disabled={busy}>{busy ? <span className="spinner"/> : <Icon name="check" size={17}/>} {approve ? 'Valider' : 'Rejeter'}</button></footer></form></Modal>;
}

function ExecuteDispositionDialog({ dispositionId, decision, onClose, onSuccess }: {
    dispositionId: string;
    decision?: string;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const { retention } = useSession();
    const readiness = useResource(s => retention!.readiness(dispositionId, s), 'disposition-readiness:' + dispositionId);
    const [executionReference, setExecutionReference] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const elimination = decision === 'ELIMINER';
    const [preview, setPreview] = useState<DestructionPreview | null>(null);
    const [confirmed, setConfirmed] = useState(false);
    const [certificate, setCertificate] = useState<DestructionCertificate | null>(null);
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy)
            return;
        setBusy(true);
        setError(null);
        try {
            await retention!.command('/dispositions/' + dispositionId + '/execute', { executionReference: executionReference.trim() || null }, crypto.randomUUID(), 'POST');
            onSuccess();
            if (elimination) { setCertificate(await retention!.certificateOfAction(dispositionId)); return; }
            onClose();
        }
        catch (err) {
            setError(err);
        }
        finally {
            setBusy(false);
        }
    };
    const blocked = !!readiness.data && !readiness.data.executable;
    // l'élimination se confirme en connaissance du contenu : l'aperçu doit être chargé, et la case cochée
    const mustConfirm = elimination && !confirmed;
    if (certificate) return <CertificateDialog certificate={certificate} onClose={onClose}/>;
    return <Modal title={elimination ? 'Exécuter l’élimination' : 'Exécuter la disposition'} subtitle={elimination ? 'Destruction définitive du contenu : le certificat en sera la preuve.' : 'Action définitive, conforme à la décision validée.'} onClose={onClose} locked={busy}><form onSubmit={submit}><div className="form-grid">
        {readiness.loading ? <Busy /> : readiness.data && <Notice tone={blocked ? 'warning' : 'info'}>{blocked ? <>Non exécutable :<ul>{readiness.data.blockers.map(b => <li key={b}>{blockerText(b)}</li>)}</ul></> : 'Prête à être exécutée.'}</Notice>}
        {elimination && <div className="span2"><DestructionPreviewBox dispositionId={dispositionId} onLoaded={setPreview}/></div>}
        <Field label="Référence d’exécution" wide hint="Optionnelle. À défaut, la référence du certificat de destruction."><input value={executionReference} onChange={e => setExecutionReference(e.target.value)} maxLength={255}/></Field>
        {elimination && preview && <label className="field span2 check-field"><span><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={busy}/> {confirmationText(preview)}</span><small>Cette opération est irréversible.</small></label>}
        </div>{Boolean(error) && <ErrorNotice error={error}/>}<footer className="modal-footer"><button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Annuler</button><button type="submit" className="btn danger" disabled={busy || blocked || mustConfirm || (elimination && !preview)}>{busy ? <span className="spinner"/> : <Icon name="check" size={17}/>} Exécuter</button></footer></form></Modal>;
}

function CancelDispositionDialog({ dispositionId, onClose, onSuccess }: {
    dispositionId: string;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const { retention } = useSession();
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy)
            return;
        setBusy(true);
        setError(null);
        try {
            await retention!.command('/dispositions/' + dispositionId + '/cancel', { reason: reason.trim() }, crypto.randomUUID(), 'POST');
            onSuccess();
            onClose();
        }
        catch (err) {
            setError(err);
        }
        finally {
            setBusy(false);
        }
    };
    return <Modal title="Annuler la disposition" onClose={onClose} locked={busy}><form onSubmit={submit}><div className="form-grid">
        <Field label="Motif *" wide><textarea value={reason} onChange={e => setReason(e.target.value)} required maxLength={4000}/></Field>
        </div>{Boolean(error) && <ErrorNotice error={error}/>}<footer className="modal-footer"><button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Retour</button><button type="submit" className="btn danger" disabled={busy}>{busy ? <span className="spinner"/> : <Icon name="close" size={17}/>} Annuler la disposition</button></footer></form></Modal>;
}

function ReexamineDispositionDialog({ dispositionId, onClose, onSuccess }: {
    dispositionId: string;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const { retention } = useSession();
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const [nextReviewDate, setNextReviewDate] = useState('');
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy || !nextReviewDate || reason.trim().length < 4)
            return;
        setBusy(true);
        setError(null);
        try {
            await retention!.command('/dispositions/' + dispositionId + '/reexamine', { nextReviewDate, reason: reason.trim() }, crypto.randomUUID(), 'POST');
            onSuccess();
            onClose();
        }
        catch (err) {
            setError(err);
        }
        finally {
            setBusy(false);
        }
    };
    return <Modal title="Réexaminer le document" subtitle="Le document n’est ni conservé ni éliminé : son échéance est repoussée à la date de la prochaine revue." onClose={onClose} locked={busy}><form onSubmit={submit}><div className="form-grid">
        <Field label="Prochaine date de revue *" hint="Postérieure à aujourd’hui."><input type="date" min={tomorrow} value={nextReviewDate} onChange={e => setNextReviewDate(e.target.value)} required disabled={busy}/></Field>
        <Field label="Motif *" wide hint="Pourquoi la décision est reportée (4 caractères au moins)."><textarea value={reason} onChange={e => setReason(e.target.value)} required maxLength={4000} disabled={busy}/></Field>
        </div>{Boolean(error) && <ErrorNotice error={error}/>}<footer className="modal-footer"><button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Annuler</button><button type="submit" className="btn primary" disabled={busy || !nextReviewDate || reason.trim().length < 4}>{busy ? 'Enregistrement…' : 'Réexaminer'}</button></footer></form></Modal>;
}

export function EventDispositions({ eventId, eventStatus }: {
    eventId: string;
    eventStatus: string;
}) {
    const { me, retention, epoch } = useSession();
    const { scope } = useWorkspace();
    const q = useResource<Disposition[]>(s => retention!.eventDispositions(eventId, s), 'event-dispositions:' + eventId + epoch);
    const [propose, setPropose] = useState(false);
    const [validateId, setValidateId] = useState<string | null>(null);
    const [executeId, setExecuteId] = useState<string | null>(null);
    const [cancelId, setCancelId] = useState<string | null>(null);
    const [reexamineId, setReexamineId] = useState<string | null>(null);
    const canPropose = can(me, 'DISPOSITION_PROPOSE', scope);
    const canValidate = can(me, 'DISPOSITION_VALIDATE', scope);
    const canExecute = can(me, 'DISPOSITION_EXECUTE', scope);
    const canCancel = can(me, 'DISPOSITION_CANCEL', scope);
    const dispositions = q.data ?? [];
    const latest = dispositions[0];
    const showPropose = canPropose && ['ECHEANCE', 'EN_DECISION'].includes(eventStatus) && (!latest || ['REJETEE', 'ANNULEE', 'EXECUTEE'].includes(latest.status));
    return <tr><td colSpan={4}>
        {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh}/> : dispositions.length ? <div className="table-scroll"><table><thead><tr><th>Décision</th><th>Statut</th><th>Proposée le</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{dispositions.map(d => <tr key={d.id}><td><Badge value={d.decision}/></td><td><Badge value={d.status}/></td><td>{formatDate(d.proposedAt)}</td><td className="table-actions">{d.status === 'PROPOSEE' && canValidate && <button className="btn small secondary" onClick={() => setValidateId(d.id)}>Valider</button>}{d.status === 'VALIDEE' && canExecute && (d.decision === 'REEXAMINER'
            ? <button className="btn small primary" onClick={() => setReexamineId(d.id)}>Réexaminer</button>
            : <button className="btn small primary" onClick={() => setExecuteId(d.id)}>Exécuter</button>)}{d.status === 'EXECUTEE' && d.decision === 'ELIMINER' && <CertificateButton label="Certificat de destruction" load={signal => retention!.certificateOfAction(d.id, signal)}/>}{['PROPOSEE', 'VALIDEE'].includes(d.status) && canCancel && <button className="btn small danger-outline" onClick={() => setCancelId(d.id)}>Annuler</button>}</td></tr>)}</tbody></table></div> : <Empty title="Aucune disposition proposée" icon="check"/>}
        {showPropose && <button className="btn small secondary" style={{ marginTop: 8 }} onClick={() => setPropose(true)}>Proposer une décision</button>}
        {propose && <ProposeDispositionDialog eventId={eventId} onClose={() => setPropose(false)} onSuccess={q.refresh}/>}
        {validateId && <ValidateDispositionDialog dispositionId={validateId} decision={dispositions.find(d => d.id === validateId)?.decision} onClose={() => setValidateId(null)} onSuccess={q.refresh}/>}
        {executeId && <ExecuteDispositionDialog dispositionId={executeId} decision={dispositions.find(d => d.id === executeId)?.decision} onClose={() => setExecuteId(null)} onSuccess={q.refresh}/>}
        {cancelId && <CancelDispositionDialog dispositionId={cancelId} onClose={() => setCancelId(null)} onSuccess={q.refresh}/>}
        {reexamineId && <ReexamineDispositionDialog dispositionId={reexamineId} onClose={() => setReexamineId(null)} onSuccess={q.refresh}/>}
    </td></tr>;
}

export function ReleaseHoldDialog({ holdId, onClose, onSuccess }: {
    holdId: string;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const { retention } = useSession();
    const [releaseReference, setReleaseReference] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy)
            return;
        setBusy(true);
        setError(null);
        try {
            await retention!.command('/legal-holds/' + holdId + '/release', { releaseReference }, crypto.randomUUID(), 'POST');
            onSuccess();
            onClose();
        }
        catch (err) {
            setError(err);
        }
        finally {
            setBusy(false);
        }
    };
    return <Modal title="Lever le gel légal" onClose={onClose} locked={busy}><form onSubmit={submit}><div className="form-grid">
        <Field label="Référence de levée *" wide><input value={releaseReference} onChange={e => setReleaseReference(e.target.value)} required maxLength={255}/></Field>
        </div>{Boolean(error) && <ErrorNotice error={error}/>}<footer className="modal-footer"><button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>{busy ? <span className="spinner"/> : <Icon name="check" size={17}/>} Lever</button></footer></form></Modal>;
}

export function LegalHoldsPanel({ documentId, institutionId, departmentId }: {
    departmentId?: string | null;
    documentId: string;
    institutionId: string;
}) {
    const { me, retention, epoch } = useSession();
    const { scope } = useWorkspace();
    const q = useResource<LegalHold[]>(s => retention!.documentHolds(documentId, s), 'document-holds:' + documentId + epoch);
    const [open, setOpen] = useState(false);
    const [release, setRelease] = useState<string | null>(null);
    const canManage = can(me, 'LEGAL_HOLD_MANAGE', scope);
    const holds = q.data ?? [];
    return <section className="panel"><div className="section-heading"><h3>Gels légaux</h3>{canManage && <button className="btn small secondary" onClick={() => setOpen(true)}>Ouvrir un gel</button>}</div>
        {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh}/> : holds.length ? <div className="table-scroll"><table><thead><tr><th>Référence</th><th>Statut</th><th>Motif</th><th>Ouvert le</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{holds.map(h => <tr key={h.id}><td><code>{h.reference}</code></td><td><Badge value={h.status}/></td><td>{h.reason}{h.description && <small className="cell-sub">{h.description}</small>}{h.authority && <small className="cell-sub">Autorité : {h.authority}</small>}</td><td>{formatDate(h.openedAt)}</td><td>{h.status === 'ACTIF' && canManage && <button className="btn small danger-outline" onClick={() => setRelease(h.id)}>Lever</button>}</td></tr>)}</tbody></table></div> : <Empty title="Aucun gel légal sur ce document" icon="shield"/>}
        {open && <LegalHoldDialog documentId={documentId} institutionId={institutionId} departmentId={departmentId} onClose={() => setOpen(false)} onSuccess={q.refresh}/>}
        {release && <ReleaseHoldDialog holdId={release} onClose={() => setRelease(null)} onSuccess={q.refresh}/>}
    </section>;
}

export function RetentionPanel({ documentId, dossierId = null, businessStatus, onDocumentChanged }: {
    documentId: string;
    dossierId?: string | null;
    businessStatus: string;
    onDocumentChanged: () => void;
}) {
    const { me, records, retention, epoch } = useSession();
    const { scope } = useWorkspace();
    const q = useResource<RetentionEvent[]>(s => retention!.documentEvents(documentId, s), 'retention-events:' + documentId + epoch);
    const planningQ = useResource<RetentionPlanning>(s => retention!.planning(documentId, s), 'retention-planning:' + documentId + ':' + businessStatus + epoch);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const [configureRule, setConfigureRule] = useState(false);
    const [declaring, setDeclaring] = useState(false);
    const [ruleNotice, setRuleNotice] = useState<string | null>(null);
    const canClose = can(me, 'DOCUMENT_CLOSE', scope);
    const canSchedule = can(me, 'RETENTION_SCHEDULE', scope);
    const canManageRules = can(me, 'RETENTION_RULE_MANAGE', scope);
    const closeDocument = async () => {
        setBusy(true);
        setError(null);
        try {
            await records!.command('/documents/' + documentId + '/close', {}, crypto.randomUUID(), 'POST');
            onDocumentChanged();
        }
        catch (err) {
            setError(err);
        }
        finally {
            setBusy(false);
        }
    };
    const schedule = async () => {
        setBusy(true);
        setError(null);
        try {
            await retention!.schedule(documentId, crypto.randomUUID());
            q.refresh();
            planningQ.refresh();
        }
        catch (err) {
            setError(err);
        }
        finally {
            setBusy(false);
        }
    };
    const [expanded, setExpanded] = useState<string | null>(null);
    const events = q.data ?? [];
    return <section className="panel"><div className="section-heading"><h3>Conservation</h3>{canManageRules && <button className="btn small secondary" onClick={() => setConfigureRule(true)}>Configurer une règle</button>}</div>
        {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh}/> : events.length ? <div className="table-scroll"><table><thead><tr><th>Statut</th><th>Date de base</th><th>Échéance</th><th>Révisions</th></tr></thead><tbody>{events.map(ev => <React.Fragment key={ev.id}><tr><td><Badge value={ev.status}/></td><td>{formatDate(ev.baseDate)}</td><td>{formatDate(ev.dueDate)}</td><td><button className="btn small secondary" onClick={() => setExpanded(x => x === ev.id ? null : ev.id)}>{ev.reviewCount} · {expanded === ev.id ? 'Masquer' : 'Dispositions'}</button></td></tr>{expanded === ev.id && <EventDispositions eventId={ev.id} eventStatus={ev.status}/>}</React.Fragment>)}</tbody></table></div> : (planningQ.data ? <RetentionPlanningBox planning={planningQ.data} onDeclareEvent={canSchedule && planningQ.data.rule?.triggerEventTypeId ? () => setDeclaring(true) : undefined}/> : <Empty title="Aucune échéance planifiée" description="Le document doit être clos et une règle de conservation applicable doit exister." icon="clock"/>)}
        {ruleNotice && <Notice>{ruleNotice}</Notice>}
        <DocumentTriggerEvents documentId={documentId} onChanged={() => { q.refresh(); planningQ.refresh(); }}/>
        {declaring && planningQ.data?.rule?.triggerEventTypeId && <DeclareTriggerEventDialog documentId={documentId} dossierId={dossierId} typeId={planningQ.data.rule.triggerEventTypeId}
            typeLabel={planningQ.data.rule.triggerEventTypeLabel ?? 'Événement déclencheur'} onClose={() => setDeclaring(false)} onDone={() => { setDeclaring(false); q.refresh(); planningQ.refresh(); }}/>}
        {Boolean(error) && <ErrorNotice error={error}/>}
        <div className="table-actions" style={{ marginTop: 12 }}>
            {businessStatus !== 'CLOS' && canClose && <button className="btn small warning" onClick={closeDocument} disabled={busy}>Clore le document</button>}
            {businessStatus === 'CLOS' && !events.length && canSchedule && <button className="btn small primary" onClick={schedule} disabled={busy || !planningAllows(planningQ.data)} title={planningAllows(planningQ.data) ? undefined : 'Voir ce qui manque ci-dessus.'}>Planifier la conservation</button>}
        </div>
        {configureRule && <ConfigureRetentionRuleDialog onClose={() => setConfigureRule(false)} onSuccess={code => { setRuleNotice(`La règle ${code} est active. Elle s’applique aux documents qui correspondent à ses types et rubriques ; la situation de ce document est mise à jour ci-dessus.`); planningQ.refresh(); }}/>}
    </section>;
}
