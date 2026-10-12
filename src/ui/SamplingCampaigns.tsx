import React, { useMemo, useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { commandKey } from '../api/archives';
import { Badge, Busy, Empty, ErrorNotice, Field, Modal, Notice, formatDate, useResource } from './components';
import { EntityName } from './names';
import { ReasonDialog } from './Bordereaux';
import { can } from '../core/policy';
import { formatDay } from '../core/format';
import {
    METHOD_LABELS, OUTCOME_LABELS, STATUS_LABELS, availableActions, blockerText, creationProblems, describeSampling, isSelectable, progressText, reasonProblem, retainedShare, runText,
    selectionText, validationProblems,
    type Campaign, type CampaignLine, type CampaignStatus, type CampaignSummary, type DocumentSampling, type SamplingCandidate, type SamplingRun
} from '../core/sampling';

export const CampaignStatusBadge = ({ status }: { status: CampaignStatus }) => <Badge value={status} label={STATUS_LABELS[status]} />;

/** Sur la fiche d'un document soumis à un tri : ce que la campagne a décidé pour lui, et pourquoi. Rien sinon. */
export function DocumentSamplingNotice({ documentId }: { documentId: string }) {
    const { retention, epoch } = useSession();
    const q = useResource<DocumentSampling | null>(signal => retention!.documentSampling(documentId, signal), `document-sampling:${documentId}:${epoch}`);
    const info = q.data;
    if (!info) return null;
    return <Notice><strong>Soumis à un tri.</strong> Campagne {info.campaignReference} : {info.retained ? 'retenu dans l’échantillon (conservation définitive)' : 'non retenu (élimination)'}
        {info.essential ? ' — document essentiel, toujours retenu' : info.origin === 'MANUEL' ? ' — ajusté à la main' : ' — par la méthode'}. {OUTCOME_LABELS[info.outcome]}.
        {info.origin === 'MANUEL' && info.reason ? <small className="cell-sub">Motif : {info.reason}</small> : null}</Notice>;
}

/** Les campagnes de tri de l'institution : constituer, ajuster, arrêter, conserver l'échantillon. L'élimination du reste passe par les bordereaux d'élimination. */
export function SamplingCampaignsPanel({ institutionId, departmentId = null }: { institutionId: string; departmentId?: string | null }) {
    const { retention, epoch } = useSession();
    const q = useResource<CampaignSummary[]>(signal => retention!.samplingCampaigns(institutionId, signal), `sampling-campaigns:${institutionId}:${epoch}`);
    const { me } = useSession();
    const mayPropose = can(me, 'DISPOSITION_PROPOSE', { institutionId, departmentId });
    const [creating, setCreating] = useState(false);
    const [opened, setOpened] = useState<string | null>(null);
    const list = q.data ?? [];
    return <div className="panel sampling-panel" role="region" aria-label="Campagnes de tri">
        <div className="section-heading"><h3>Tri par échantillonnage</h3>{mayPropose && <button type="button" className="btn small primary" onClick={() => setCreating(true)}>Nouvelle campagne de tri</button>}</div>
        <div className="panel-padding"><Notice>Quand la règle d’une série prévoit un <strong>tri</strong>, une campagne applique sa méthode (un document sur N, pourcentage tiré au hasard, années choisies…) aux échéances arrivées,
            de façon reproductible. Les documents retenus sont conservés définitivement ; les autres sont éliminés par un bordereau d’élimination, avec le visa de l’autorité.</Notice></div>
        {q.loading && !q.data ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} />
            : list.length === 0 ? <Empty title="Aucune campagne de tri" description="Constituez une campagne à partir des échéances dont la règle prévoit un tri." icon="clock" />
                : <div className="table-scroll"><table><thead><tr><th>Campagne</th><th>État</th><th>Méthode</th><th>Échantillon</th><th>Constituée</th><th><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>{list.map(c => <tr key={c.id}>
                        <td><strong>{c.reference}</strong><small className="cell-sub">{c.title}</small></td>
                        <td><CampaignStatusBadge status={c.status} /></td>
                        <td>{METHOD_LABELS[c.sampling.method] ?? c.sampling.method}<small className="cell-sub">{c.ruleLabel ?? ''}</small></td>
                        <td>{c.retained} sur {c.lines} ({retainedShare(c)})</td>
                        <td>{formatDate(c.createdAt)}<small className="cell-sub"><EntityName kind="users" id={c.createdById} /></small></td>
                        <td className="table-actions"><button type="button" className="btn small secondary" onClick={() => setOpened(c.id)}>Ouvrir</button></td>
                    </tr>)}</tbody></table></div>}
        {creating && <CreateCampaignDialog institutionId={institutionId} departmentId={departmentId} onClose={() => setCreating(false)}
            onDone={c => { setCreating(false); q.refresh(); setOpened(c.summary.id); }} />}
        {opened && <CampaignDialog id={opened} institutionId={institutionId} onClose={() => setOpened(null)} onChanged={q.refresh} />}
    </div>;
}

function CreateCampaignDialog({ institutionId, departmentId, onClose, onDone }: { institutionId: string; departmentId: string | null; onClose: () => void; onDone: (c: Campaign) => void }) {
    const { retention, epoch } = useSession();
    const q = useResource<SamplingCandidate[]>(signal => retention!.samplingCandidates(institutionId, departmentId, signal), `sampling-candidates:${institutionId}:${departmentId ?? ''}:${epoch}`);
    const [version, setVersion] = useState('');
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [title, setTitle] = useState('');
    const [observations, setObservations] = useState('');
    const [busy, setBusy] = useState(false);
    const [attempted, setAttempted] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const intention = useRef<ReturnType<typeof commandKey> | null>(null);
    const candidates = q.data ?? [];
    const versions = useMemo(() => {
        const seen = new Map<string, SamplingCandidate>();
        candidates.forEach(c => { if (!seen.has(c.ruleVersionId)) seen.set(c.ruleVersionId, c); });
        return [...seen.values()];
    }, [candidates]);
    const chosen = versions.find(v => v.ruleVersionId === version) ?? null;
    const visible = candidates.filter(c => c.ruleVersionId === version);
    const selectable = visible.filter(isSelectable);
    const problems = creationProblems(title, version, selected.size);
    const toggle = (id: string) => setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
    const allSelected = selectable.length > 0 && selectable.every(c => selected.has(c.eventId));
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (busy) return;
        if (problems.length) { setAttempted(true); return; }
        setBusy(true); setError(null);
        const ids = [...selected];
        intention.current = commandKey(intention.current, { version, title, observations, ids });
        try { onDone(await retention!.createSamplingCampaign(institutionId, version, title.trim(), observations.trim() || null, ids, intention.current.key)); }
        catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal wide title="Nouvelle campagne de tri" subtitle="Échéances dont la règle prévoit un tri" onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            {q.loading && !q.data ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} />
                : candidates.length === 0 ? <Empty title="Aucune échéance à trier" description="Aucune échéance dont la règle prévoit un tri n’est arrivée à terme pour ce périmètre." icon="check" />
                    : <>
                        <div className="form-grid">
                            <Field label="Règle appliquée *" wide hint="Une campagne applique la méthode d’une seule version de règle.">
                                <select value={version} onChange={e => { setVersion(e.target.value); setSelected(new Set()); }} disabled={busy}>
                                    <option value="">Choisir une règle…</option>
                                    {versions.map(v => <option key={v.ruleVersionId} value={v.ruleVersionId}>{v.rule ?? 'Règle'} — version {v.ruleVersionNumber}</option>)}
                                </select></Field>
                            {chosen && <div className="span2"><Notice><strong>Méthode :</strong> {METHOD_LABELS[chosen.sampling.method] ?? chosen.sampling.method}. {describeSampling(chosen.sampling)}
                                {chosen.sampling.note ? <small className="cell-sub">{chosen.sampling.note}</small> : null}</Notice></div>}
                            <Field label="Intitulé de la campagne *" wide hint="Ce qui est trié : « Registres d’état civil de 1980 à 1989 »."><input value={title} onChange={e => setTitle(e.target.value)} maxLength={300} disabled={busy} /></Field>
                            <Field label="Observations" wide><textarea value={observations} onChange={e => setObservations(e.target.value)} rows={2} maxLength={4000} disabled={busy} /></Field>
                        </div>
                        {version && <div className="table-scroll"><table className="bordereau-candidates"><thead><tr>
                            <th><input type="checkbox" aria-label="Tout choisir" checked={allSelected} disabled={busy || selectable.length === 0}
                                onChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map(c => c.eventId)))} /></th>
                            <th>Document</th><th>Échéance</th><th>État</th></tr></thead>
                            <tbody>{visible.map(c => <tr key={c.eventId} className={isSelectable(c) ? '' : 'is-blocked'}>
                                <td><input type="checkbox" aria-label={`Choisir ${c.reference}`} checked={selected.has(c.eventId)} disabled={busy || !isSelectable(c)} onChange={() => toggle(c.eventId)} /></td>
                                <td><strong>{c.reference}</strong><small className="cell-sub">{c.title}</small></td>
                                <td>{formatDay(c.dueDate)}</td>
                                <td>{c.blockers.length === 0 ? <span className="finding">{c.essential ? 'Prêt — document essentiel, toujours retenu' : 'Prêt'}</span>
                                    : <ul className="relation-problems">{c.blockers.map(b => <li key={b}>{b === 'ALREADY_IN_CAMPAIGN' && c.campaignReference ? `Déjà dans la campagne ${c.campaignReference}.` : blockerText(b)}</li>)}</ul>}</td>
                            </tr>)}</tbody></table></div>}
                        <p role="status" className="bordereau-selection">{selectionText(visible, selected)}</p>
                    </>}
            {attempted && problems.length > 0 && <ul className="relation-problems" role="alert">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button>
                <button type="submit" className="btn primary" disabled={busy || candidates.length === 0}>Constituer la campagne</button></footer>
        </form>
    </Modal>;
}

type Step = null | 'validate' | 'cancel' | 'stop' | { adjust: string };

function CampaignDialog({ id, institutionId, onClose, onChanged }: { id: string; institutionId: string; onClose: () => void; onChanged: () => void }) {
    const { me, retention, epoch } = useSession();
    const q = useResource<Campaign>(signal => retention!.samplingCampaign(id, signal), `sampling-campaign:${id}:${epoch}`);
    const c = q.data ?? null;
    const [step, setStep] = useState<Step>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const [run, setRun] = useState<SamplingRun | null>(null);
    const intention = useRef<ReturnType<typeof commandKey> | null>(null);
    const scope = { institutionId, departmentId: null };
    const caps = { propose: can(me, 'DISPOSITION_PROPOSE', scope), validate: can(me, 'DISPOSITION_VALIDATE', scope), execute: can(me, 'DISPOSITION_EXECUTE', scope) };
    const changed = () => { q.refresh(); onChanged(); };
    const call = async (fn: (key: string) => Promise<unknown>, payload: unknown) => {
        if (busy) return;
        setBusy(true); setError(null);
        intention.current = commandKey(intention.current, payload);
        try { await fn(intention.current.key); intention.current = null; setStep(null); changed(); } catch (e) { setError(e); } finally { setBusy(false); }
    };
    const actions = c ? availableActions({ status: c.summary.status, lines: c.lines }, caps) : [];
    const editable = c?.summary.status === 'BROUILLON' && caps.propose;
    const adjusting = c && typeof step === 'object' && step !== null ? c.lines.find(l => l.id === step.adjust) ?? null : null;
    const executeNow = async () => {
        if (busy) return;
        setBusy(true); setError(null);
        try { setRun(await retention!.executeSamplingRetained(id, crypto.randomUUID())); changed(); } catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal wide title="Campagne de tri" subtitle={c ? c.summary.reference : ''} onClose={onClose} locked={busy}>
        <div className="panel-padding bordereau-detail">
            {q.loading && !c ? <Busy /> : q.error && !c ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : c && <>
                <div className="section-heading"><h3>{c.summary.title}</h3><CampaignStatusBadge status={c.summary.status} /></div>
                <p>{progressText(c.summary)}</p>
                <dl className="detail-card">
                    <div><dt>Méthode</dt><dd>{METHOD_LABELS[c.summary.sampling.method] ?? c.summary.sampling.method} — {describeSampling(c.summary.sampling)}</dd></div>
                    {c.summary.ruleLabel && <div><dt>Règle</dt><dd>{c.summary.ruleLabel}</dd></div>}
                    <div><dt>Graine du tirage</dt><dd><code title={c.seed}>{c.seed.slice(0, 12)}…</code> <small>(le même lot et la même graine redonnent le même échantillon)</small></dd></div>
                    <div><dt>Constituée par</dt><dd><EntityName kind="users" id={c.summary.createdById} /> le {formatDate(c.summary.createdAt)}</dd></div>
                    {c.stoppedById && <div><dt>Arrêtée par</dt><dd><EntityName kind="users" id={c.stoppedById} /> le {formatDate(c.summary.stoppedAt)}</dd></div>}
                    {c.fingerprint && <div><dt>Empreinte de la décision</dt><dd><code title={c.fingerprint}>{c.fingerprint.slice(0, 16)}…</code></dd></div>}
                    {c.conservationValidatedById && <div><dt>Conservation validée par</dt><dd><EntityName kind="users" id={c.conservationValidatedById} /> le {formatDate(c.conservationValidatedAt)}</dd></div>}
                    {c.conservationExecutedById && <div><dt>Conservation exécutée par</dt><dd><EntityName kind="users" id={c.conservationExecutedById} /> le {formatDate(c.conservationExecutedAt)}</dd></div>}
                    {c.cancellationReason && <div><dt>Motif d’annulation</dt><dd>{c.cancellationReason}</dd></div>}
                    {c.observations && <div><dt>Observations</dt><dd>{c.observations}</dd></div>}
                </dl>
                {c.summary.sampling.note && <Notice>{c.summary.sampling.note}</Notice>}
                <div className="table-scroll"><table><thead><tr><th>N°</th><th>Document</th><th>Date</th><th>Décision</th><th>Où en est-il</th><th><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>{c.lines.map((l: CampaignLine) => <tr key={l.id}>
                        <td>{l.rank}</td>
                        <td><strong>{l.reference}</strong><small className="cell-sub">{l.title}</small></td>
                        <td>{formatDay(l.documentDate ?? l.baseDate)}</td>
                        <td><Badge value={l.retained ? 'RETENU' : 'ELIMINE'} label={l.retained ? 'Retenu' : 'Éliminé'} />
                            <small className="cell-sub">{l.essential ? 'Document essentiel' : l.origin === 'MANUEL' ? `Ajusté : ${l.reason ?? ''}` : 'Par la méthode'}</small></td>
                        <td>{OUTCOME_LABELS[l.outcome]}</td>
                        <td className="table-actions">{editable && !l.essential && <button type="button" className="btn small secondary" disabled={busy}
                            aria-label={`${l.retained ? 'Écarter' : 'Retenir'} ${l.reference}`} onClick={() => setStep({ adjust: l.id })}>{l.retained ? 'Écarter' : 'Retenir'}</button>}
                            {editable && l.origin === 'MANUEL' && <button type="button" className="btn small secondary" disabled={busy} aria-label={`Rendre ${l.reference} à la méthode`}
                                onClick={() => void call(key => retention!.resetSamplingLine(id, l.id, key), { reset: l.id })}>Rendre à la méthode</button>}
                            {editable && <button type="button" className="btn small danger-outline" disabled={busy} aria-label={`Ôter ${l.reference}`}
                                onClick={() => void call(key => retention!.removeSamplingLine(id, l.id, key), { remove: l.id })}>Ôter</button>}</td>
                    </tr>)}</tbody></table></div>
                {run && <section aria-label="Dernière exécution"><Notice tone={run.failures.length ? 'warning' : 'info'}>{runText(run)}</Notice>
                    {run.failures.length > 0 && <ul className="relation-problems" role="alert">{run.failures.map(f => <li key={f}>{f}</li>)}</ul>}</section>}
                {error ? <ErrorNotice error={error} /> : null}
            </>}
        </div>
        <footer className="modal-footer">
            <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Fermer</button>
            {actions.includes('CANCEL') && <button type="button" className="btn danger-outline" disabled={busy} onClick={() => setStep('cancel')}>Annuler la campagne</button>}
            {actions.includes('STOP') && <button type="button" className="btn primary" disabled={busy} onClick={() => setStep('stop')}>Arrêter la campagne</button>}
            {actions.includes('VALIDATE') && <button type="button" className="btn primary" disabled={busy} onClick={() => setStep('validate')}>Valider la conservation de l’échantillon</button>}
            {actions.includes('EXECUTE') && <button type="button" className="btn primary" disabled={busy} onClick={() => void executeNow()}>Conserver définitivement l’échantillon</button>}
        </footer>
        {c && step === 'stop' && <StopDialog campaign={c} busy={busy} onClose={() => setStep(null)} onConfirm={() => void call(key => retention!.stopSamplingCampaign(id, key), { stop: id, version: c.summary.version })} />}
        {c && step === 'validate' && <ValidateDialog campaign={c} onClose={() => setStep(null)} onDone={() => { setStep(null); changed(); }} />}
        {c && step === 'cancel' && <ReasonDialog title="Annuler la campagne de tri" subtitle={c.summary.reference} confirm="Annuler la campagne" hint="Les propositions de conservation en attente sont annulées ; les échéances redeviennent disponibles. Le motif est conservé au journal."
            onClose={() => setStep(null)} onSubmit={(reason, key) => retention!.cancelSamplingCampaign(id, reason, key).then(changed)} />}
        {adjusting && <AdjustDialog line={adjusting} onClose={() => setStep(null)} onDone={() => { setStep(null); changed(); }} campaignId={id} />}
    </Modal>;
}

function StopDialog({ campaign, busy, onClose, onConfirm }: { campaign: Campaign; busy: boolean; onClose: () => void; onConfirm: () => void }) {
    return <Modal title="Arrêter la campagne" subtitle={campaign.summary.reference} onClose={onClose} locked={busy}>
        <div className="panel-padding">
            <Notice tone="warning"><strong>La décision est figée :</strong> {campaign.summary.retained} document{campaign.summary.retained > 1 ? 's' : ''} retenu{campaign.summary.retained > 1 ? 's' : ''} (conservation définitive),
                {' '}{campaign.summary.eliminated} à éliminer. Les propositions de conservation sont créées ; les éliminations passent ensuite par un bordereau d’élimination.</Notice>
        </div>
        <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Revenir</button>
            <button type="button" className="btn primary" disabled={busy} onClick={onConfirm}>Arrêter la campagne</button></footer>
    </Modal>;
}

function AdjustDialog({ campaignId, line, onClose, onDone }: { campaignId: string; line: CampaignLine; onClose: () => void; onDone: () => void }) {
    const { retention } = useSession();
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [attempted, setAttempted] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const intention = useRef<ReturnType<typeof commandKey> | null>(null);
    const target = !line.retained;
    const problem = reasonProblem(reason);
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy) return;
        if (problem) { setAttempted(true); return; }
        setBusy(true); setError(null);
        intention.current = commandKey(intention.current, { adjust: line.id, target, reason });
        try { await retention!.adjustSamplingLine(campaignId, line.id, target, reason.trim(), intention.current.key); onDone(); } catch (err) { setError(err); } finally { setBusy(false); }
    };
    return <Modal title={target ? 'Retenir dans l’échantillon' : 'Écarter de l’échantillon'} subtitle={`${line.reference} — ${line.title}`} onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <Field label="Motif *" hint="Pourquoi vous décidez autrement que la méthode ; conservé au journal." wide><textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} maxLength={500} disabled={busy} /></Field>
            {attempted && problem && <ul className="relation-problems" role="alert"><li>{problem}</li></ul>}
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button>
                <button type="submit" className="btn primary" disabled={busy}>{target ? 'Retenir' : 'Écarter'}</button></footer>
        </form>
    </Modal>;
}

function ValidateDialog({ campaign, onClose, onDone }: { campaign: Campaign; onClose: () => void; onDone: () => void }) {
    const { retention } = useSession();
    const [form, setForm] = useState({ visaReference: '', procesVerbal: '' });
    const [busy, setBusy] = useState(false);
    const [attempted, setAttempted] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const intention = useRef<ReturnType<typeof commandKey> | null>(null);
    const problems = validationProblems(form);
    const waiting = campaign.lines.filter(l => l.outcome === 'CONSERVATION_PROPOSEE').length;
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy) return;
        if (problems.length) { setAttempted(true); return; }
        setBusy(true); setError(null);
        intention.current = commandKey(intention.current, { validate: campaign.summary.id, ...form });
        try { await retention!.validateSamplingRetained(campaign.summary.id, form.visaReference.trim(), form.procesVerbal.trim(), intention.current.key); onDone(); } catch (err) { setError(err); } finally { setBusy(false); }
    };
    return <Modal wide title="Valider la conservation de l’échantillon" subtitle={campaign.summary.reference} onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <Notice tone="warning">Vous validez la conservation définitive de <strong>{waiting}</strong> document{waiting > 1 ? 's' : ''}. La personne qui valide n’est pas celle qui a arrêté la campagne ; une troisième personne exécutera.</Notice>
            <div className="form-grid">
                <Field label="Référence de la décision *" hint="La décision de la commission ou de l’autorité qui approuve l’échantillon."><input value={form.visaReference} onChange={e => setForm(f => ({ ...f, visaReference: e.target.value }))} maxLength={255} disabled={busy} /></Field>
                <Field label="Procès-verbal *" wide hint="Repris dans le dossier de preuve de chaque document conservé."><textarea value={form.procesVerbal} onChange={e => setForm(f => ({ ...f, procesVerbal: e.target.value }))} rows={4} maxLength={15000} disabled={busy} /></Field>
            </div>
            {attempted && problems.length > 0 && <ul className="relation-problems" role="alert">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button>
                <button type="submit" className="btn primary" disabled={busy}>Valider la conservation</button></footer>
        </form>
    </Modal>;
}
