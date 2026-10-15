import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { commandKey } from '../api/archives';
import { Badge, Busy, Empty, ErrorNotice, Field, Modal, Notice, formatDate, useResource } from './components';
import { EntityName, useEntityName } from './names';
import { can } from '../core/policy';
import { formatBytes, formatDay } from '../core/format';
import {
    EXECUTION_BATCH, LINE_LABELS, STATUS_LABELS, availableActions, bordereauBlockerText, bordereauHtml, creationProblems, emptyVisa, executionText, isSelectable, lineText, progressText,
    selectionText, visaBody, visaProblems, visaSummary, volumeText, dossierPlanText,
    type DossierEliminationPlan, type Bordereau, type BordereauCandidate, type BordereauExecution, type BordereauLineFailure, type BordereauReadiness, type BordereauStatus, type BordereauSummary
} from '../core/bordereaux';

const today = () => new Date().toISOString().slice(0, 10);
export const StatusBadge = ({ status }: { status: BordereauStatus }) => <Badge value={status} label={STATUS_LABELS[status]} />;

function useCapabilities(institutionId: string, departmentId: string | null) {
    const { me } = useSession();
    const scope = { institutionId, departmentId };
    return { propose: can(me, 'DISPOSITION_PROPOSE', scope), validate: can(me, 'DISPOSITION_VALIDATE', scope), execute: can(me, 'DISPOSITION_EXECUTE', scope) };
}

/** Les bordereaux d'élimination de l'institution : constituer, soumettre à l'autorité, viser, détruire. */
export function BordereauxPanel({ institutionId, departmentId = null }: { institutionId: string; departmentId?: string | null }) {
    const { retention, epoch } = useSession();
    const caps = useCapabilities(institutionId, departmentId);
    const q = useResource<BordereauSummary[]>(signal => retention!.bordereaux(institutionId, signal), `elimination-bordereaux:${institutionId}:${epoch}`);
    const [creating, setCreating] = useState(false);
    const [creatingFromDossier, setCreatingFromDossier] = useState(false);
    const [opened, setOpened] = useState<string | null>(null);
    const list = q.data ?? [];
    return <div className="panel bordereaux-panel" aria-label="Bordereaux d’élimination" role="region">
        <div className="section-heading"><h3>Bordereaux d’élimination</h3>{caps.propose && <span><button type="button" className="btn small secondary" onClick={() => setCreatingFromDossier(true)}>Éliminer un dossier entier</button>{' '}<button type="button" className="btn small primary" onClick={() => setCreating(true)}>Nouveau bordereau</button></span>}</div>
        <div className="panel-padding"><Notice>Un bordereau réunit des documents dont l’échéance d’élimination est arrivée. Il est soumis à l’autorité, qui vise chaque ligne ; seuls les documents visés sont détruits, par une troisième personne,
            chacun avec son certificat de destruction.</Notice></div>
        {q.loading && !q.data ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} />
            : list.length === 0 ? <Empty title="Aucun bordereau" description="Constituez un bordereau à partir des documents dont l’échéance d’élimination est arrivée." icon="archive" />
                : <div className="table-scroll"><table><thead><tr><th>Bordereau</th><th>État</th><th>Avancement</th><th>Constitué</th><th><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>{list.map(b => <tr key={b.id}>
                        <td><strong>{b.reference}</strong><small className="cell-sub">{b.title}</small></td>
                        <td><StatusBadge status={b.status} /></td>
                        <td>{progressText(b)}</td>
                        <td>{formatDate(b.createdAt)}<small className="cell-sub"><EntityName kind="users" id={b.createdById} /></small></td>
                        <td className="table-actions"><button type="button" className="btn small secondary" onClick={() => setOpened(b.id)}>Ouvrir</button></td>
                    </tr>)}</tbody></table></div>}
        {creating && <CandidatesDialog institutionId={institutionId} departmentId={departmentId} onClose={() => setCreating(false)}
            onDone={b => { setCreating(false); q.refresh(); setOpened(b.summary.id); }} />}
        {creatingFromDossier && <DossierDialog institutionId={institutionId} onClose={() => setCreatingFromDossier(false)}
            onDone={b => { setCreatingFromDossier(false); q.refresh(); setOpened(b.summary.id); }} />}
        {opened && <BordereauDialog id={opened} institutionId={institutionId} departmentId={departmentId} onClose={() => setOpened(null)} onChanged={q.refresh} />}
    </div>;
}

/**
 * Le choix des documents à inscrire : les échéances d'élimination arrivées à terme, chacune avec ce qui la bloque. Sert à constituer un bordereau (`existing` absent) ou à
 * compléter un brouillon (`bordereauId`).
 */
function CandidatesDialog({ institutionId, departmentId, bordereauId, onClose, onDone }: {
    institutionId: string; departmentId: string | null; bordereauId?: string; onClose: () => void; onDone: (b: Bordereau) => void;
}) {
    const { retention, epoch } = useSession();
    const q = useResource<BordereauCandidate[]>(signal => retention!.eliminationCandidates(institutionId, departmentId, signal), `elimination-candidates:${institutionId}:${departmentId ?? ''}:${epoch}`);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [title, setTitle] = useState('');
    const [observations, setObservations] = useState('');
    const [busy, setBusy] = useState(false);
    const [attempted, setAttempted] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const intention = useRef<ReturnType<typeof commandKey> | null>(null);
    const candidates = q.data ?? [];
    const selectable = candidates.filter(isSelectable);
    const problems = creationProblems(bordereauId ? 'x' : title, selected.size);
    const toggle = (id: string) => setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
    const allSelected = selectable.length > 0 && selectable.every(c => selected.has(c.eventId));
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (busy) return;
        if (problems.length) { setAttempted(true); return; }
        setBusy(true); setError(null);
        const ids = [...selected];
        intention.current = commandKey(intention.current, { bordereauId, title, observations, ids });
        try {
            const result = bordereauId ? await retention!.addBordereauLines(bordereauId, ids, intention.current.key)
                : await retention!.createBordereau(institutionId, title.trim(), observations.trim() || null, ids, intention.current.key);
            onDone(result);
        } catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal wide title={bordereauId ? 'Ajouter des documents au bordereau' : 'Nouveau bordereau d’élimination'} subtitle="Documents dont l’échéance d’élimination est arrivée" onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            {!bordereauId && <div className="form-grid">
                <Field label="Intitulé du bordereau *" wide hint="Ce qui sera visé : « Registres de paie de 1985 à 1990 »."><input value={title} onChange={e => setTitle(e.target.value)} maxLength={300} disabled={busy} /></Field>
                <Field label="Observations" wide><textarea value={observations} onChange={e => setObservations(e.target.value)} rows={2} maxLength={4000} disabled={busy} /></Field>
            </div>}
            {q.loading && !q.data ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} />
                : candidates.length === 0 ? <Empty title="Aucun document à éliminer" description="Aucune échéance d’élimination n’est arrivée à terme pour ce périmètre." icon="check" />
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
                            <td>{c.blockers.length === 0 ? <span className="finding">Prêt</span> : <ul className="relation-problems">{c.blockers.map(b => <li key={b}>{b === 'ALREADY_IN_BORDEREAU' && c.bordereauReference ? `Déjà inscrit au bordereau ${c.bordereauReference}.` : bordereauBlockerText(b)}</li>)}</ul>}</td>
                        </tr>)}</tbody></table></div>}
            <p role="status" className="bordereau-selection">{selectionText(candidates, selected)}</p>
            {attempted && problems.length > 0 && <ul className="relation-problems" role="alert">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button>
                <button type="submit" className="btn primary" disabled={busy}>{bordereauId ? 'Ajouter au bordereau' : 'Constituer le bordereau'}</button></footer>
        </form>
    </Modal>;
}

/** Le choix d'un dossier de l'institution par sa référence ou son intitulé : recherche, puis liste. Jamais par un identifiant. */
function DossierChoice({ institutionId, value, onChange, disabled }: { institutionId: string; value: string; onChange: (id: string) => void; disabled: boolean }) {
    const { records, epoch } = useSession();
    const [text, setText] = useState('');
    const q = useResource(signal => records!.dossiers({ institutionId, q: text.trim() || undefined, size: 20 }, signal), `dossier-choice:${institutionId}:${text.trim()}:${epoch}`);
    const items = q.data?.items ?? [];
    return <Field label="Dossier *" wide hint="Cherchez par référence ou par intitulé ; un dossier clos s'élimine en entier avec ses sous-dossiers.">
        <div className="reference-picker">
            <input aria-label="Chercher un dossier" placeholder="Référence ou intitulé…" value={text} onChange={e => setText(e.target.value)} disabled={disabled} />
            {q.loading && !q.data ? <Busy label="Recherche…" /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} />
                : <select aria-label="Dossier" value={value} onChange={e => onChange(e.target.value)} disabled={disabled}>
                    <option value="">Choisir un dossier…</option>
                    {items.map(d => <option key={d.id} value={d.id}>{d.reference} — {d.title}</option>)}
                </select>}
        </div>
    </Field>;
}

/** Éliminer un dossier entier : on choisit le dossier, on voit chacun de ses documents et ce qui le bloque ; le bordereau n'est possible que si tous sont prêts. */
function DossierDialog({ institutionId, bordereauId, onClose, onDone }: { institutionId: string; bordereauId?: string; onClose: () => void; onDone: (b: Bordereau) => void }) {
    const { retention, epoch } = useSession();
    const [dossierId, setDossierId] = useState('');
    const [title, setTitle] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const intention = useRef<ReturnType<typeof commandKey> | null>(null);
    const inFlight = useRef(false);
    const plan = useResource<DossierEliminationPlan | null>(signal => dossierId ? retention!.dossierEliminationPlan(institutionId, dossierId, signal) : Promise.resolve(null), `dossier-plan:${institutionId}:${dossierId}:${epoch}`);
    const p = plan.data;
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (inFlight.current || !p?.complete || p.dossierId !== dossierId) return;
        inFlight.current = true;
        setBusy(true); setError(null);
        intention.current = commandKey(intention.current, { bordereauId, dossierId, title });
        try { onDone(bordereauId ? await retention!.addDossierToBordereau(bordereauId, dossierId, intention.current.key)
            : await retention!.createBordereauFromDossier(institutionId, dossierId, title.trim() || null, null, intention.current.key)); }
        catch (e) { setError(e); } finally { inFlight.current = false; setBusy(false); }
    };
    return <Modal wide title={bordereauId ? "Ajouter un dossier au bordereau" : "Éliminer un dossier entier"} subtitle="Tous les documents du dossier, sous-dossiers compris, ou aucun" onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                <DossierChoice institutionId={institutionId} value={dossierId} onChange={setDossierId} disabled={busy} />
                {!bordereauId && <Field label="Intitulé du bordereau" wide hint="Facultatif : par défaut « Élimination du dossier » suivi de sa référence."><input value={title} onChange={e => setTitle(e.target.value)} maxLength={300} disabled={busy} /></Field>}
            </div>
            {dossierId && (plan.loading && !p ? <Busy label="Analyse du dossier…" /> : plan.error ? <ErrorNotice error={plan.error} onRetry={plan.refresh} />
                : p && <>
                    <Notice tone={p.complete ? 'info' : 'warning'}>{dossierPlanText(p)}</Notice>
                    {p.documents.length > 0 && <div className="table-scroll"><table><thead><tr><th>Document</th><th>Échéance</th><th>État</th></tr></thead>
                        <tbody>{p.documents.map(d => <tr key={d.documentId} className={d.blockers.length ? 'is-blocked' : ''}>
                            <td><strong>{d.reference}</strong><small className="cell-sub">{d.title}</small></td>
                            <td>{d.dueDate ? formatDay(d.dueDate) : '—'}</td>
                            <td>{d.blockers.length === 0 ? <span className="finding">Prêt</span> : <ul className="relation-problems">{d.blockerMessages.map(m => <li key={m}>{m}</li>)}</ul>}</td>
                        </tr>)}</tbody></table></div>}
                </>)}
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button>
                <button type="submit" className="btn primary" disabled={busy || !p?.complete}>{bordereauId ? 'Ajouter le dossier au bordereau' : 'Constituer le bordereau du dossier'}</button></footer>
        </form>
    </Modal>;
}

type Step = null | 'dossier' | 'candidates' | 'visa' | 'cancel' | 'execute' | { retire: string };

/** Un bordereau : ses lignes, où il en est, et ce que la personne peut faire maintenant selon ses droits. */
function BordereauDialog({ id, institutionId, departmentId, onClose, onChanged }: { id: string; institutionId: string; departmentId: string | null; onClose: () => void; onChanged: () => void }) {
    const { retention, epoch } = useSession();
    const caps = useCapabilities(institutionId, departmentId);
    const q = useResource<Bordereau>(signal => retention!.bordereau(id, signal), `elimination-bordereau:${id}:${epoch}`);
    const b = q.data ?? null;
    const readyQ = useResource<BordereauReadiness | null>(async signal => b?.summary.status === 'VISE' ? await retention!.bordereauReadiness(id, signal) : null, `elimination-readiness:${id}:${b?.summary.status}:${b?.summary.accepted}:${epoch}`);
    const [step, setStep] = useState<Step>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const [lastRun, setLastRun] = useState<BordereauExecution | null>(null);
    const intention = useRef<ReturnType<typeof commandKey> | null>(null);
    const createdBy = useEntityName('users', b?.summary.createdById);
    const submittedBy = useEntityName('users', b?.submittedById);
    const visaBy = useEntityName('users', b?.visaById);
    const institution = useEntityName('institutions', institutionId);
    const blockersOf = useMemo(() => new Map((readyQ.data?.lines ?? []).map(l => [l.lineId, l.blockers])), [readyQ.data]);
    const changed = () => { q.refresh(); readyQ.refresh(); onChanged(); };
    const run = async (call: (key: string) => Promise<unknown>, payload: unknown) => {
        if (busy) return;
        setBusy(true); setError(null);
        intention.current = commandKey(intention.current, payload);
        try { await call(intention.current.key); intention.current = null; setStep(null); changed(); } catch (e) { setError(e); } finally { setBusy(false); }
    };
    const print = () => {
        if (!b) return;
        const html = bordereauHtml(b, { institution: institution.name ?? 'Institution', createdBy: createdBy.name ?? 'Agent', submittedBy: submittedBy.name ?? 'Agent', visaBy: visaBy.name ?? 'Agent', date: formatDate, day: d => formatDay(d) });
        const w = window.open('', '_blank');
        if (!w) { setError(new Error('Autorisez les fenêtres de ce site pour afficher le bordereau.')); return; }
        w.document.write(html); w.document.close(); w.focus(); w.print();
    };
    const actions = b ? availableActions(b.summary, caps) : [];
    const title = b ? b.summary.reference : 'Bordereau d’élimination';
    return <Modal wide title="Bordereau d’élimination" subtitle={title} onClose={onClose} locked={busy}>
        <div className="panel-padding bordereau-detail">
            {q.loading && !b ? <Busy /> : q.error && !b ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : b && <>
                <div className="section-heading"><h3>{b.summary.title}</h3><StatusBadge status={b.summary.status} /></div>
                <p>{progressText(b.summary)}</p>
                <dl className="detail-card">
                    <div><dt>Volume</dt><dd>{volumeText(b.summary.lines - b.summary.cancelled - b.summary.refused, b.summary.totalBytes)}</dd></div>
                    <div><dt>Constitué par</dt><dd><EntityName kind="users" id={b.summary.createdById} /> le {formatDate(b.summary.createdAt)}</dd></div>
                    {b.submittedById && <div><dt>Soumis par</dt><dd><EntityName kind="users" id={b.submittedById} /> le {formatDate(b.summary.submittedAt)}</dd></div>}
                    {b.authority && <div><dt>Autorité</dt><dd>{b.authority}</dd></div>}
                    {b.visaReference && <div><dt>Visa</dt><dd>{b.visaReference}, du {formatDay(b.visaDate)}{b.visaById && <> · <EntityName kind="users" id={b.visaById} /></>}</dd></div>}
                    {b.cancellationReason && <div><dt>Motif d’annulation</dt><dd>{b.cancellationReason}</dd></div>}
                    {b.observations && <div><dt>Observations</dt><dd>{b.observations}</dd></div>}
                </dl>
                <div className="table-scroll"><table><thead><tr><th>N°</th><th>Document</th><th>Échéance</th><th>Contenu</th><th>Décision</th><th><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>{b.lines.map(l => <tr key={l.id}>
                        <td>{l.rank}</td>
                        <td><strong>{l.reference}</strong><small className="cell-sub">{l.title}</small></td>
                        <td>{formatDay(l.dueDate)}</td>
                        <td>{l.fileCount} fichier{l.fileCount > 1 ? 's' : ''} · {formatBytes(l.totalBytes)}</td>
                        <td><Badge value={l.status} label={LINE_LABELS[l.status]} /><small className="cell-sub">{lineText(l, blockersOf.get(l.id) ?? [])}</small></td>
                        <td className="table-actions">
                            {b.summary.status === 'BROUILLON' && caps.propose && <button type="button" className="btn small danger-outline" disabled={busy} aria-label={`Ôter ${l.reference}`}
                                onClick={() => void run(key => retention!.removeBordereauLine(id, l.id, key), { remove: l.id })}>Ôter</button>}
                            {(b.summary.status === 'SOUMIS' || b.summary.status === 'VISE') && caps.propose && (l.status === 'PROPOSEE' || l.status === 'ACCEPTEE')
                                && <button type="button" className="btn small danger-outline" disabled={busy} aria-label={`Retirer ${l.reference}`} onClick={() => setStep({ retire: l.id })}>Retirer</button>}
                        </td>
                    </tr>)}</tbody></table></div>
                {b.fingerprint && <p><small>Empreinte des certificats de destruction : <code title={b.fingerprint}>{b.fingerprint.slice(0, 16)}…</code></small></p>}
                {lastRun && <ExecutionReport run={lastRun} />}
                {error ? <ErrorNotice error={error} /> : null}
            </>}
        </div>
        <footer className="modal-footer">
            <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Fermer</button>
            {b && <button type="button" className="btn secondary" onClick={print}>Afficher et imprimer</button>}
            {actions.includes('ADD') && <button type="button" className="btn secondary" disabled={busy} onClick={() => setStep('candidates')}>Ajouter des documents</button>}
            {actions.includes('ADD') && <button type="button" className="btn secondary" disabled={busy} onClick={() => setStep('dossier')}>Ajouter un dossier</button>}
            {actions.includes('CANCEL') && <button type="button" className="btn danger-outline" disabled={busy} onClick={() => setStep('cancel')}>Annuler le bordereau</button>}
            {actions.includes('SUBMIT') && b && <button type="button" className="btn primary" disabled={busy || b.summary.registered === 0}
                onClick={() => void run(key => retention!.submitBordereau(id, key), { submit: id, version: b.summary.version })}>Soumettre à l’autorité</button>}
            {actions.includes('VISA') && <button type="button" className="btn primary" disabled={busy} onClick={() => setStep('visa')}>Viser le bordereau</button>}
            {actions.includes('EXECUTE') && <button type="button" className="btn danger" disabled={busy} onClick={() => setStep('execute')}>Détruire les documents visés</button>}
        </footer>
        {b && step === 'candidates' && <CandidatesDialog institutionId={institutionId} departmentId={departmentId} bordereauId={id} onClose={() => setStep(null)} onDone={() => { setStep(null); changed(); }} />}
        {b && step === 'dossier' && <DossierDialog institutionId={institutionId} bordereauId={id} onClose={() => setStep(null)} onDone={() => { setStep(null); changed(); }} />}
        {b && step === 'visa' && <VisaDialog bordereau={b} onClose={() => setStep(null)} onDone={() => { setStep(null); changed(); }} />}
        {b && step === 'cancel' && <ReasonDialog title="Annuler le bordereau" subtitle={b.summary.reference} confirm="Annuler le bordereau" hint="Les propositions et validations en cours sont annulées ; les échéances redeviennent disponibles. Le motif est conservé au journal."
            onClose={() => setStep(null)} onSubmit={(reason, key) => retention!.cancelBordereau(id, reason, key).then(changed)} />}
        {b && typeof step === 'object' && step !== null && <ReasonDialog title="Retirer ce document du bordereau" subtitle={b.lines.find(l => l.id === step.retire)?.reference ?? ''} confirm="Retirer du bordereau"
            hint="La proposition ou la validation de ce document est annulée ; son échéance redevient disponible. Le motif est conservé au journal."
            onClose={() => setStep(null)} onSubmit={(reason, key) => retention!.retireBordereauLine(id, step.retire, reason, key).then(changed)} />}
        {b && step === 'execute' && <ExecuteDialog bordereau={b} onClose={() => setStep(null)} onProgress={run => { setLastRun(run); changed(); }} />}
    </Modal>;
}

function ExecutionReport({ run }: { run: BordereauExecution }) {
    return <section aria-label="Dernière destruction" className="bordereau-run">
        <Notice tone={run.failures.length > 0 ? 'warning' : 'info'}>{executionText(run)}</Notice>
        {run.failures.length > 0 && <ul className="relation-problems" role="alert">{run.failures.map((f: BordereauLineFailure) => <li key={f.lineId}>Ligne {f.rank} ({f.reference}) : {f.message}</li>)}</ul>}
    </section>;
}

/** Une raison obligatoire : annulation d'un bordereau, retrait d'une ligne. */
export function ReasonDialog({ title, subtitle, hint, confirm, onClose, onSubmit }: {
    title: string; subtitle: string; hint: string; confirm: string; onClose: () => void; onSubmit: (reason: string, key: string) => Promise<unknown>;
}) {
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const intention = useRef<ReturnType<typeof commandKey> | null>(null);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (busy || !reason.trim()) return;
        setBusy(true); setError(null);
        intention.current = commandKey(intention.current, { reason });
        try { await onSubmit(reason.trim(), intention.current.key); onClose(); } catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal title={title} subtitle={subtitle} onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <Field label="Motif *" hint={hint} wide><textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} maxLength={4000} disabled={busy} required /></Field>
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Garder</button>
                <button type="submit" className="btn danger" disabled={busy || !reason.trim()}>{confirm}</button></footer>
        </form>
    </Modal>;
}

/** Le visa de l'autorité : une décision par ligne, motivée si elle refuse, puis la référence, la date et le procès-verbal. */
function VisaDialog({ bordereau: b, onClose, onDone }: { bordereau: Bordereau; onClose: () => void; onDone: () => void }) {
    const { retention } = useSession();
    const pending = b.lines.filter(l => l.status === 'PROPOSEE');
    const ids = pending.map(l => l.id);
    const [form, setForm] = useState(() => emptyVisa(ids, today()));
    const [busy, setBusy] = useState(false);
    const [attempted, setAttempted] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const intention = useRef<ReturnType<typeof commandKey> | null>(null);
    const problems = useMemo(() => visaProblems(form, ids, today()), [form, ids.join(',')]);
    const decide = (lineId: string, accept: boolean) => setForm(f => ({ ...f, decisions: { ...f.decisions, [lineId]: accept } }));
    const anyAccepted = ids.some(id => form.decisions[id] === true);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (busy) return;
        if (problems.length) { setAttempted(true); return; }
        setBusy(true); setError(null);
        const body = visaBody(form, ids);
        intention.current = commandKey(intention.current, body);
        try { await retention!.visaBordereau(b.summary.id, body, intention.current.key); onDone(); } catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal wide title="Viser le bordereau" subtitle={b.summary.reference} onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <Notice tone="warning">Chaque ligne est acceptée ou refusée. Une ligne acceptée sera détruite par une troisième personne ; une ligne refusée redevient disponible. La personne qui vise n’est pas celle qui a soumis.</Notice>
            <div className="form-grid">
                <Field label="Autorité qui vise *" wide hint="Le service d’archives ou la commission qui donne le visa."><input value={form.authority} onChange={e => setForm(f => ({ ...f, authority: e.target.value }))} maxLength={300} disabled={busy} /></Field>
                <Field label="Référence du visa" hint={anyAccepted ? 'Obligatoire pour accepter des lignes.' : undefined}><input value={form.visaReference} onChange={e => setForm(f => ({ ...f, visaReference: e.target.value }))} maxLength={255} disabled={busy} /></Field>
                <Field label="Date du visa" hint={anyAccepted ? 'Obligatoire pour accepter des lignes.' : undefined}><input type="date" value={form.visaDate} max={today()} onChange={e => setForm(f => ({ ...f, visaDate: e.target.value }))} disabled={busy} /></Field>
                <Field label="Procès-verbal de la décision" wide hint="Repris dans le dossier de preuve de chaque document accepté."><textarea value={form.procesVerbal} onChange={e => setForm(f => ({ ...f, procesVerbal: e.target.value }))} rows={3} maxLength={15000} disabled={busy} /></Field>
            </div>
            <div className="table-scroll"><table><thead><tr><th>N°</th><th>Document</th><th>Décision</th><th>Motif du refus</th></tr></thead>
                <tbody>{pending.map(l => <tr key={l.id}>
                    <td>{l.rank}</td>
                    <td><strong>{l.reference}</strong><small className="cell-sub">{l.title}</small></td>
                    <td><fieldset className="inline-choice"><legend className="sr-only">Décision pour {l.reference}</legend>
                        <label><input type="radio" name={'decision-' + l.id} checked={form.decisions[l.id] === true} onChange={() => decide(l.id, true)} disabled={busy} /> Accepter</label>
                        <label><input type="radio" name={'decision-' + l.id} checked={form.decisions[l.id] === false} onChange={() => decide(l.id, false)} disabled={busy} /> Refuser</label></fieldset></td>
                    <td>{form.decisions[l.id] === false && <textarea aria-label={`Motif du refus de ${l.reference}`} value={form.reasons[l.id] ?? ''} rows={2} maxLength={4000} disabled={busy}
                        onChange={e => setForm(f => ({ ...f, reasons: { ...f.reasons, [l.id]: e.target.value } }))} />}</td>
                </tr>)}</tbody></table></div>
            <p role="status">{visaSummary(form, ids)}</p>
            {attempted && problems.length > 0 && <ul className="relation-problems" role="alert">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button>
                <button type="submit" className="btn primary" disabled={busy}>Enregistrer le visa</button></footer>
        </form>
    </Modal>;
}

/**
 * La destruction des documents visés : confirmation explicite, puis lots successifs. Elle s'arrête quand tout est détruit, ou dès qu'un lot a des échecs (pour qu'on les lise).
 */
function ExecuteDialog({ bordereau: b, onClose, onProgress }: { bordereau: Bordereau; onClose: () => void; onProgress: (run: BordereauExecution) => void }) {
    const { retention } = useSession();
    const todo = b.lines.filter(l => l.status === 'ACCEPTEE');
    const bytes = todo.reduce((s, l) => s + l.totalBytes, 0);
    const [confirmed, setConfirmed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(0);
    const [error, setError] = useState<unknown>(null);
    const [report, setReport] = useState<BordereauExecution | null>(null);
    const stopped = useRef(false);
    useEffect(() => () => { stopped.current = true; }, []);
    const start = async () => {
        if (busy || !confirmed) return;
        setBusy(true); setError(null); setReport(null); setDone(0);
        let destroyed = 0;
        try {
            for (let guard = 0; guard < 100 && !stopped.current; guard++) {
                const run = await retention!.executeBordereau(b.summary.id, EXECUTION_BATCH, crypto.randomUUID());
                destroyed += run.destroyedNow; setDone(destroyed); setReport(run); onProgress(run);
                if (run.remaining === 0 || run.failures.length > 0 || run.destroyedNow === 0) break;
            }
        } catch (e) { setError(e); } finally { setBusy(false); }
    };
    const finished = report !== null && report.remaining === 0 && report.failures.length === 0;
    return <Modal title="Détruire les documents visés" subtitle={b.summary.reference} onClose={onClose} locked={busy}>
        <div className="panel-padding">
            <Notice tone="warning"><strong>Destruction définitive :</strong> {volumeText(todo.length, bytes)} vont être détruits, un par un, chacun avec son certificat de destruction. Cette opération ne peut pas être annulée.</Notice>
            {!finished && <label className="field check-field"><span><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={busy} />
                {' '}Je confirme la destruction définitive de {todo.length} document{todo.length > 1 ? 's' : ''} de ce bordereau.</span></label>}
            {busy && <p role="status"><span className="spinner" /> Destruction en cours : {done} document{done > 1 ? 's' : ''} détruit{done > 1 ? 's' : ''}…</p>}
            {report && <ExecutionReport run={report} />}
            {finished && <Notice>Tous les documents visés ont été détruits : le bordereau est exécuté.</Notice>}
            {error ? <ErrorNotice error={error} /> : null}
        </div>
        <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>{finished ? 'Fermer' : 'Annuler'}</button>
            {!finished && <button type="button" className="btn danger" disabled={busy || !confirmed || todo.length === 0} onClick={() => void start()}>{report ? 'Reprendre la destruction' : 'Détruire'}</button>}</footer>
    </Modal>;
}
