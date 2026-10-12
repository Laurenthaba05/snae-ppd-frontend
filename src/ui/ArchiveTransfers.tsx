import React, { useMemo, useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { commandKey } from '../api/archives';
import { Badge, Busy, Empty, ErrorNotice, Field, Modal, Notice, formatDate, useResource } from './components';
import { EntityName, useEntityName } from './names';
import { ReasonDialog } from './Bordereaux';
import { ActSealPanel } from './ActSeal';
import { can } from '../core/policy';
import { formatBytes, formatDay } from '../core/format';
import {
    LINE_LABELS, STATUS_LABELS, availableActions, creationProblems, emptyReceipt, isSelectable, lineText, progressText, receiptBody, receiptProblems, receiptSummary,
    selectionText, transferBlockerText, transferHtml, volumeText,
    type DocumentTransferInfo, type Transfer, type TransferCandidate, type TransferDestination, type TransferStatus, type TransferSummary
} from '../core/transfers';

export const TransferStatusBadge = ({ status }: { status: TransferStatus }) => <Badge value={status} label={STATUS_LABELS[status]} />;

/** Sur la fiche d'un document remis à une institution d'archives : qui le détient, depuis quand, sous quel accusé de réception. Rien tant qu'il n'a pas été remis. */
export function DocumentTransferNotice({ documentId }: { documentId: string }) {
    const { retention, epoch } = useSession();
    const q = useResource<DocumentTransferInfo | null>(signal => retention!.documentTransfer(documentId, signal), `document-transfer:${documentId}:${epoch}`);
    const info = q.data;
    if (!info) return null;
    return <Notice><strong>Remis aux archives.</strong> Ce document est conservé définitivement par <EntityName kind="institutions" id={info.destinationId} /> depuis le {formatDate(info.transferredAt)}.{' '}
        <small>Versement {info.reference}{info.receiptReference ? `, accusé de réception ${info.receiptReference}` : ''}.</small></Notice>;
}

/** Les bordereaux de versement où l'institution est versante ou destinataire : constituer, soumettre, recevoir avec accusé, remettre. */
export function ArchiveTransfersPanel({ institutionId, departmentId = null }: { institutionId: string; departmentId?: string | null }) {
    const { me, retention, epoch } = useSession();
    const mayPropose = can(me, 'DISPOSITION_PROPOSE', { institutionId, departmentId });
    const q = useResource<TransferSummary[]>(signal => retention!.archiveTransfers(institutionId, signal), `archive-transfers:${institutionId}:${epoch}`);
    const [creating, setCreating] = useState(false);
    const [opened, setOpened] = useState<string | null>(null);
    const list = q.data ?? [];
    return <div className="panel transfers-panel" aria-label="Versements aux archives" role="region">
        <div className="section-heading"><h3>Versements aux archives</h3>{mayPropose && <button type="button" className="btn small primary" onClick={() => setCreating(true)}>Nouveau versement</button>}</div>
        <div className="panel-padding"><Notice>Un bordereau de versement réunit des documents dont l’échéance prévoit le transfert. Il est soumis à l’institution d’archives destinataire, qui accepte ou refuse chaque
            ligne et délivre son accusé de réception ; les documents acceptés sont ensuite remis par une troisième personne et conservés définitivement.</Notice></div>
        {q.loading && !q.data ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} />
            : list.length === 0 ? <Empty title="Aucun versement" description="Constituez un bordereau à partir des documents dont l’échéance prévoit le transfert aux archives." icon="archive" />
                : <div className="table-scroll"><table><thead><tr><th>Versement</th><th>État</th><th>Versant</th><th>Destinataire</th><th>Avancement</th><th><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>{list.map(t => <tr key={t.id}>
                        <td><strong>{t.reference}</strong><small className="cell-sub">{t.title}</small></td>
                        <td><TransferStatusBadge status={t.status} /></td>
                        <td><EntityName kind="institutions" id={t.institutionId} /></td>
                        <td><EntityName kind="institutions" id={t.destinationId} /></td>
                        <td>{progressText(t)}</td>
                        <td className="table-actions"><button type="button" className="btn small secondary" onClick={() => setOpened(t.id)}>Ouvrir</button></td>
                    </tr>)}</tbody></table></div>}
        {creating && <TransferCandidatesDialog institutionId={institutionId} departmentId={departmentId} onClose={() => setCreating(false)}
            onDone={t => { setCreating(false); q.refresh(); setOpened(t.summary.id); }} />}
        {opened && <TransferDialog id={opened} workspaceInstitutionId={institutionId} departmentId={departmentId} onClose={() => setOpened(null)} onChanged={q.refresh} />}
    </div>;
}

/** Le choix des documents à inscrire (et, pour un nouveau bordereau, de l'institution destinataire par son nom). */
function TransferCandidatesDialog({ institutionId, departmentId, transferId, onClose, onDone }: {
    institutionId: string; departmentId: string | null; transferId?: string; onClose: () => void; onDone: (t: Transfer) => void;
}) {
    const { retention, epoch } = useSession();
    const q = useResource<TransferCandidate[]>(signal => retention!.transferCandidates(institutionId, departmentId, signal), `transfer-candidates:${institutionId}:${departmentId ?? ''}:${epoch}`);
    const destinationsQ = useResource<TransferDestination[]>(signal => transferId ? Promise.resolve([]) : retention!.transferDestinations(institutionId, signal), `transfer-destinations:${institutionId}:${transferId ?? ''}:${epoch}`);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [title, setTitle] = useState('');
    const [observations, setObservations] = useState('');
    const [destination, setDestination] = useState('');
    const [busy, setBusy] = useState(false);
    const [attempted, setAttempted] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const intention = useRef<ReturnType<typeof commandKey> | null>(null);
    const candidates = q.data ?? [];
    const selectable = candidates.filter(isSelectable);
    const destinations = destinationsQ.data ?? [];
    const problems = creationProblems(transferId ? 'x' : title, transferId ? 'x' : destination, selected.size);
    const toggle = (id: string) => setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
    const allSelected = selectable.length > 0 && selectable.every(c => selected.has(c.eventId));
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (busy) return;
        if (problems.length) { setAttempted(true); return; }
        setBusy(true); setError(null);
        const ids = [...selected];
        intention.current = commandKey(intention.current, { transferId, destination, title, observations, ids });
        try {
            const result = transferId ? await retention!.addArchiveTransferLines(transferId, ids, intention.current.key)
                : await retention!.createArchiveTransfer(institutionId, destination, title.trim(), observations.trim() || null, ids, intention.current.key);
            onDone(result);
        } catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal wide title={transferId ? 'Ajouter des documents au versement' : 'Nouveau bordereau de versement'} subtitle="Documents dont l’échéance prévoit le transfert aux archives" onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            {!transferId && <div className="form-grid">
                <Field label="Institution d’archives destinataire *" wide hint="Celle qui accepte ou refuse chaque document et délivre l’accusé de réception.">
                    <select value={destination} onChange={e => setDestination(e.target.value)} disabled={busy || destinationsQ.loading}>
                        <option value="">Choisir une institution…</option>
                        {destinations.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select></Field>
                <Field label="Intitulé du bordereau *" wide hint="Ce qui sera versé : « Registres d’état civil de 1950 à 1960 »."><input value={title} onChange={e => setTitle(e.target.value)} maxLength={300} disabled={busy} /></Field>
                <Field label="Observations" wide><textarea value={observations} onChange={e => setObservations(e.target.value)} rows={2} maxLength={4000} disabled={busy} /></Field>
            </div>}
            {q.loading && !q.data ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} />
                : candidates.length === 0 ? <Empty title="Aucun document à verser" description="Aucune échéance de transfert n’est arrivée à terme pour ce périmètre." icon="check" />
                    : <div className="table-scroll"><table className="bordereau-candidates"><thead><tr>
                        <th><input type="checkbox" aria-label="Tout choisir" checked={allSelected} disabled={busy || selectable.length === 0}
                            onChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map(c => c.eventId)))} /></th>
                        <th>Document</th><th>Échéance</th><th>Règle</th><th>Contenu</th><th>État</th></tr></thead>
                        <tbody>{candidates.map(c => <tr key={c.eventId} className={isSelectable(c) ? '' : 'is-blocked'}>
                            <td><input type="checkbox" aria-label={`Choisir ${c.reference}`} checked={selected.has(c.eventId)} disabled={busy || !isSelectable(c)} onChange={() => toggle(c.eventId)} /></td>
                            <td><strong>{c.reference}</strong><small className="cell-sub">{c.title}</small></td>
                            <td>{formatDay(c.dueDate)}</td>
                            <td>{c.rule ?? '—'}</td>
                            <td>{c.fileCount} fichier{c.fileCount > 1 ? 's' : ''} · {formatBytes(c.totalBytes)}</td>
                            <td>{c.blockers.length === 0 ? <span className="finding">Prêt</span> : <ul className="relation-problems">{c.blockers.map(b => <li key={b}>
                                {b === 'ALREADY_IN_TRANSFER' && c.transferReference ? `Déjà inscrit au versement ${c.transferReference}.` : transferBlockerText(b)}</li>)}</ul>}</td>
                        </tr>)}</tbody></table></div>}
            <p role="status" className="bordereau-selection">{selectionText(candidates, selected)}</p>
            {attempted && problems.length > 0 && <ul className="relation-problems" role="alert">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button>
                <button type="submit" className="btn primary" disabled={busy}>{transferId ? 'Ajouter au versement' : 'Constituer le bordereau'}</button></footer>
        </form>
    </Modal>;
}

type Step = null | 'candidates' | 'receive' | 'execute' | 'cancel' | { retire: string };

/** Un bordereau de versement : ses lignes, où il en est, et ce que la personne peut faire maintenant selon ses droits côté versant ou côté destinataire. */
function TransferDialog({ id, workspaceInstitutionId, departmentId, onClose, onChanged }: {
    id: string; workspaceInstitutionId: string; departmentId: string | null; onClose: () => void; onChanged: () => void;
}) {
    const { me, retention, epoch } = useSession();
    const q = useResource<Transfer>(signal => retention!.archiveTransfer(id, signal), `archive-transfer:${id}:${epoch}`);
    const t = q.data ?? null;
    const [step, setStep] = useState<Step>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const intention = useRef<ReturnType<typeof commandKey> | null>(null);
    const producerId = t?.summary.institutionId ?? workspaceInstitutionId;
    const createdBy = useEntityName('users', t?.summary.createdById);
    const receivedBy = useEntityName('users', t?.receivedById);
    const producer = useEntityName('institutions', t?.summary.institutionId);
    const destination = useEntityName('institutions', t?.summary.destinationId);
    const caps = {
        propose: can(me, 'DISPOSITION_PROPOSE', { institutionId: producerId, departmentId: null }),
        validate: can(me, 'DISPOSITION_VALIDATE', { institutionId: producerId, departmentId: null }),
        execute: can(me, 'DISPOSITION_EXECUTE', { institutionId: producerId, departmentId: null })
    };
    const canReceive = t ? can(me, 'DISPOSITION_VALIDATE', { institutionId: t.summary.destinationId, departmentId: null }) : false;
    const changed = () => { q.refresh(); onChanged(); };
    const run = async (call: (key: string) => Promise<unknown>, payload: unknown) => {
        if (busy) return;
        setBusy(true); setError(null);
        intention.current = commandKey(intention.current, payload);
        try { await call(intention.current.key); intention.current = null; setStep(null); changed(); } catch (e) { setError(e); } finally { setBusy(false); }
    };
    const print = () => {
        if (!t) return;
        const html = transferHtml(t, {
            producer: producer.name ?? 'Service versant', destination: destination.name ?? 'Institution d’archives', createdBy: createdBy.name ?? 'Agent', receivedBy: receivedBy.name ?? 'Agent',
            date: formatDate, day: d => formatDay(d)
        });
        const w = window.open('', '_blank');
        if (!w) { setError(new Error('Autorisez les fenêtres de ce site pour afficher le bordereau.')); return; }
        w.document.write(html); w.document.close(); w.focus(); w.print();
    };
    const actions = t ? availableActions(t.summary, caps, canReceive) : [];
    return <Modal wide title="Bordereau de versement" subtitle={t ? t.summary.reference : ''} onClose={onClose} locked={busy}>
        <div className="panel-padding bordereau-detail">
            {q.loading && !t ? <Busy /> : q.error && !t ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : t && <>
                <div className="section-heading"><h3>{t.summary.title}</h3><TransferStatusBadge status={t.summary.status} /></div>
                <p>{progressText(t.summary, destination.name ?? 'l’institution destinataire')}</p>
                <dl className="detail-card">
                    <div><dt>Service versant</dt><dd><EntityName kind="institutions" id={t.summary.institutionId} /></dd></div>
                    <div><dt>Institution destinataire</dt><dd><EntityName kind="institutions" id={t.summary.destinationId} /></dd></div>
                    <div><dt>Volume</dt><dd>{volumeText(t.summary.lines - t.summary.cancelled - t.summary.refused, t.summary.totalBytes)}</dd></div>
                    <div><dt>Constitué par</dt><dd><EntityName kind="users" id={t.summary.createdById} /> le {formatDate(t.summary.createdAt)}</dd></div>
                    {t.submittedById && <div><dt>Soumis par</dt><dd><EntityName kind="users" id={t.submittedById} /> le {formatDate(t.summary.submittedAt)}</dd></div>}
                    {t.receivedById && <div><dt>Reçu par</dt><dd><EntityName kind="users" id={t.receivedById} /> le {formatDate(t.summary.receivedAt)}</dd></div>}
                    {t.summary.receiptReference && <div><dt>Accusé de réception</dt><dd>{t.summary.receiptReference}</dd></div>}
                    {t.actReference && <div><dt>Acte de versement</dt><dd>{t.actReference}</dd></div>}
                    {t.cancellationReason && <div><dt>Motif d’annulation</dt><dd>{t.cancellationReason}</dd></div>}
                    {t.observations && <div><dt>Observations</dt><dd>{t.observations}</dd></div>}
                </dl>
                {t.summary.receiptReference && <ActSealPanel type="ACCUSE_TRANSFERT" id={t.summary.id} />}
                <div className="table-scroll"><table><thead><tr><th>N°</th><th>Document</th><th>Échéance</th><th>Contenu</th><th>Décision</th><th><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>{t.lines.map(l => <tr key={l.id}>
                        <td>{l.rank}</td>
                        <td><strong>{l.reference}</strong><small className="cell-sub">{l.title}</small></td>
                        <td>{formatDay(l.dueDate)}</td>
                        <td>{l.fileCount} fichier{l.fileCount > 1 ? 's' : ''} · {formatBytes(l.totalBytes)}<small className="cell-sub" title={l.contentFingerprint}>Empreinte {l.contentFingerprint.slice(0, 12)}…</small></td>
                        <td><Badge value={l.status} label={LINE_LABELS[l.status]} /><small className="cell-sub">{lineText(l)}</small></td>
                        <td className="table-actions">
                            {t.summary.status === 'BROUILLON' && caps.propose && <button type="button" className="btn small danger-outline" disabled={busy} aria-label={`Ôter ${l.reference}`}
                                onClick={() => void run(key => retention!.removeArchiveTransferLine(id, l.id, key), { remove: l.id })}>Ôter</button>}
                            {(t.summary.status === 'SOUMIS' || t.summary.status === 'ACCEPTE') && caps.propose && (l.status === 'PROPOSEE' || l.status === 'ACCEPTEE')
                                && <button type="button" className="btn small danger-outline" disabled={busy} aria-label={`Retirer ${l.reference}`} onClick={() => setStep({ retire: l.id })}>Retirer</button>}
                        </td>
                    </tr>)}</tbody></table></div>
                {t.procesVerbal && <section aria-label="Procès-verbal de réception"><h4>Procès-verbal de réception</h4><p style={{ whiteSpace: 'pre-line' }}>{t.procesVerbal}</p></section>}
                {error ? <ErrorNotice error={error} /> : null}
            </>}
        </div>
        <footer className="modal-footer">
            <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Fermer</button>
            {t && <button type="button" className="btn secondary" onClick={print}>Afficher et imprimer</button>}
            {actions.includes('ADD') && <button type="button" className="btn secondary" disabled={busy} onClick={() => setStep('candidates')}>Ajouter des documents</button>}
            {actions.includes('CANCEL') && <button type="button" className="btn danger-outline" disabled={busy} onClick={() => setStep('cancel')}>Annuler le versement</button>}
            {actions.includes('SUBMIT') && t && <button type="button" className="btn primary" disabled={busy || t.summary.registered === 0}
                onClick={() => void run(key => retention!.submitArchiveTransfer(id, key), { submit: id, version: t.summary.version })}>Soumettre à l’institution d’archives</button>}
            {actions.includes('RECEIVE') && <button type="button" className="btn primary" disabled={busy} onClick={() => setStep('receive')}>Recevoir le versement</button>}
            {actions.includes('EXECUTE') && <button type="button" className="btn primary" disabled={busy} onClick={() => setStep('execute')}>Remettre les documents acceptés</button>}
        </footer>
        {t && step === 'candidates' && <TransferCandidatesDialog institutionId={t.summary.institutionId} departmentId={departmentId} transferId={id} onClose={() => setStep(null)} onDone={() => { setStep(null); changed(); }} />}
        {t && step === 'receive' && <ReceiveDialog transfer={t} onClose={() => setStep(null)} onDone={() => { setStep(null); changed(); }} />}
        {t && step === 'execute' && <HandoverDialog transfer={t} onClose={() => setStep(null)} onDone={() => { setStep(null); changed(); }} />}
        {t && step === 'cancel' && <ReasonDialog title="Annuler le versement" subtitle={t.summary.reference} confirm="Annuler le versement"
            hint="Les propositions et validations en cours sont annulées ; les échéances redeviennent disponibles. Le motif est conservé au journal."
            onClose={() => setStep(null)} onSubmit={(reason, key) => retention!.cancelArchiveTransfer(id, reason, key).then(changed)} />}
        {t && typeof step === 'object' && step !== null && <ReasonDialog title="Retirer ce document du versement" subtitle={t.lines.find(l => l.id === step.retire)?.reference ?? ''} confirm="Retirer du versement"
            hint="La proposition ou l’acceptation de ce document est annulée ; son échéance redevient disponible. Le motif est conservé au journal."
            onClose={() => setStep(null)} onSubmit={(reason, key) => retention!.retireArchiveTransferLine(id, step.retire, reason, key).then(changed)} />}
    </Modal>;
}

/** La réception par l'institution destinataire : une décision par ligne (motivée si elle refuse), l'acte de versement et le procès-verbal, puis l'accusé de réception est délivré. */
function ReceiveDialog({ transfer: t, onClose, onDone }: { transfer: Transfer; onClose: () => void; onDone: () => void }) {
    const { retention } = useSession();
    const pending = t.lines.filter(l => l.status === 'PROPOSEE');
    const ids = pending.map(l => l.id);
    const [form, setForm] = useState(() => emptyReceipt(ids));
    const [busy, setBusy] = useState(false);
    const [attempted, setAttempted] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const intention = useRef<ReturnType<typeof commandKey> | null>(null);
    const problems = useMemo(() => receiptProblems(form, ids), [form, ids.join(',')]);
    const decide = (lineId: string, accept: boolean) => setForm(f => ({ ...f, decisions: { ...f.decisions, [lineId]: accept } }));
    const anyAccepted = ids.some(lineId => form.decisions[lineId] === true);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (busy) return;
        if (problems.length) { setAttempted(true); return; }
        setBusy(true); setError(null);
        const body = receiptBody(form, ids);
        intention.current = commandKey(intention.current, body);
        try { await retention!.receiveArchiveTransfer(t.summary.id, body, intention.current.key); onDone(); } catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal wide title="Recevoir le versement" subtitle={t.summary.reference} onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <Notice tone="warning">Chaque ligne est acceptée ou refusée. L’accusé de réception est délivré à l’enregistrement ; une ligne acceptée sera remise par une troisième personne, une ligne refusée redevient
                disponible chez le service versant. La personne qui reçoit n’est pas celle qui a soumis.</Notice>
            <div className="form-grid">
                <Field label="Référence de l’acte de versement" hint="Facultatif : la décision ou le document qui fonde le versement."><input value={form.actReference} onChange={e => setForm(f => ({ ...f, actReference: e.target.value }))} maxLength={255} disabled={busy} /></Field>
                <Field label="Procès-verbal de réception" wide hint={anyAccepted ? 'Obligatoire pour accepter des lignes ; repris dans le dossier de preuve de chaque document.' : 'Repris dans le dossier de preuve de chaque document accepté.'}>
                    <textarea value={form.procesVerbal} onChange={e => setForm(f => ({ ...f, procesVerbal: e.target.value }))} rows={3} maxLength={15000} disabled={busy} /></Field>
            </div>
            <div className="table-scroll"><table><thead><tr><th>N°</th><th>Document</th><th>Contenu</th><th>Décision</th><th>Motif du refus</th></tr></thead>
                <tbody>{pending.map(l => <tr key={l.id}>
                    <td>{l.rank}</td>
                    <td><strong>{l.reference}</strong><small className="cell-sub">{l.title}</small></td>
                    <td>{l.fileCount} fichier{l.fileCount > 1 ? 's' : ''} · {formatBytes(l.totalBytes)}</td>
                    <td><fieldset className="inline-choice"><legend className="sr-only">Décision pour {l.reference}</legend>
                        <label><input type="radio" name={'decision-' + l.id} checked={form.decisions[l.id] === true} onChange={() => decide(l.id, true)} disabled={busy} /> Accepter</label>
                        <label><input type="radio" name={'decision-' + l.id} checked={form.decisions[l.id] === false} onChange={() => decide(l.id, false)} disabled={busy} /> Refuser</label></fieldset></td>
                    <td>{form.decisions[l.id] === false && <textarea aria-label={`Motif du refus de ${l.reference}`} value={form.reasons[l.id] ?? ''} rows={2} maxLength={4000} disabled={busy}
                        onChange={e => setForm(f => ({ ...f, reasons: { ...f.reasons, [l.id]: e.target.value } }))} />}</td>
                </tr>)}</tbody></table></div>
            <p role="status">{receiptSummary(form, ids)}</p>
            {attempted && problems.length > 0 && <ul className="relation-problems" role="alert">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button>
                <button type="submit" className="btn primary" disabled={busy}>Enregistrer la réception</button></footer>
        </form>
    </Modal>;
}

/** La remise : conservation définitive des documents acceptés et nouveau détenteur constaté. Confirmation explicite : elle ne se défait pas. */
function HandoverDialog({ transfer: t, onClose, onDone }: { transfer: Transfer; onClose: () => void; onDone: () => void }) {
    const { retention } = useSession();
    const todo = t.lines.filter(l => l.status === 'ACCEPTEE');
    const bytes = todo.reduce((s, l) => s + l.totalBytes, 0);
    const [confirmed, setConfirmed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const intention = useRef<ReturnType<typeof commandKey> | null>(null);
    const destination = useEntityName('institutions', t.summary.destinationId);
    const start = async () => {
        if (busy || !confirmed) return;
        setBusy(true); setError(null);
        intention.current = commandKey(intention.current, { execute: t.summary.id, version: t.summary.version });
        try { await retention!.executeArchiveTransfer(t.summary.id, intention.current.key); onDone(); } catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal title="Remettre les documents acceptés" subtitle={t.summary.reference} onClose={onClose} locked={busy}>
        <div className="panel-padding">
            <Notice tone="warning"><strong>Remise définitive :</strong> {volumeText(todo.length, bytes)} vont être remis à {destination.name ?? 'l’institution destinataire'} et conservés définitivement.
                Le détenteur de chaque document est constaté ; l’opération ne peut pas être annulée.</Notice>
            <label className="field check-field"><span><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={busy} />
                {' '}Je confirme la remise de {todo.length} document{todo.length > 1 ? 's' : ''} de ce versement.</span></label>
            {error ? <ErrorNotice error={error} /> : null}
        </div>
        <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button>
            <button type="button" className="btn primary" disabled={busy || !confirmed || todo.length === 0} onClick={() => void start()}>Remettre</button></footer>
    </Modal>;
}
