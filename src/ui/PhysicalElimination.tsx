import React, { useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { ApiError } from '../core/http';
import { can } from '../core/policy';
import { Badge, Busy, Empty, ErrorNotice, Field, Modal, Notice, Pagination, formatDate, useResource } from './components';
import { ReasonPrompt, useAction } from './ReadingRoomParts';
import {
    RULE_TEXTS, approvalProblems, createProblems, executionProblems, lineCounts, lineLabel, quantityText, statusLabel,
    type Elimination, type EliminationCandidatePage, type EliminationLine, type EliminationSummary
} from '../core/physicalElimination';

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Une règle connue du serveur se dit en toutes lettres ; le reste reste l'erreur d'origine. */
function ruleError(error: unknown): unknown {
    if (error instanceof ApiError && error.code && RULE_TEXTS[error.code]) return new Error(RULE_TEXTS[error.code]);
    return error;
}

/** Les procès-verbaux d'élimination des archives physiques : pour qui peut proposer, viser ou exécuter une élimination (portée nationale, comme les archives physiques). */
export function PhysicalEliminationSection() {
    const { me, physicalArchives, epoch, demo } = useSession();
    const canPropose = can(me, 'DISPOSITION_PROPOSE', {});
    const canValidate = can(me, 'DISPOSITION_VALIDATE', {});
    const canExecute = can(me, 'DISPOSITION_EXECUTE', {});
    const [revision, setRevision] = useState(0);
    const [creating, setCreating] = useState(false);
    const [openId, setOpenId] = useState<string | null>(null);
    const allowed = !demo && !!physicalArchives && (canPropose || canValidate || canExecute);
    const list = useResource<EliminationSummary[]>(s => allowed ? physicalArchives!.eliminations(null, s) : Promise.resolve([]), `physical-eliminations:${allowed}:${revision}:${epoch}`);
    if (!allowed) return null;
    const items = list.data ?? [];
    const reload = () => setRevision(n => n + 1);
    return <section className="panel" aria-label="Élimination des archives physiques">
        <div className="section-heading"><h3>Élimination des archives physiques</h3>
            {canPropose && <button type="button" className="btn small primary" onClick={() => setCreating(true)}>Nouveau procès-verbal d’élimination</button>}</div>
        <div className="panel-padding"><p><small>Une élimination se constate par un procès-verbal : proposé, <strong>visé ligne par ligne par une autre personne</strong>, puis exécuté avec la destruction constatée par deux personnes. L’archive détruite n’est pas supprimée : elle est marquée et figée.</small></p></div>
        {list.loading && !list.data ? <Busy /> : list.error ? <ErrorNotice error={list.error} onRetry={list.refresh} />
            : items.length === 0 ? <Empty title="Aucun procès-verbal d’élimination" description="Aucune élimination d’archives physiques n’a été proposée." icon="trash" />
                : <div className="table-scroll"><table><thead><tr><th>Procès-verbal</th><th>État</th><th>Archives</th><th>Créé le</th><th /></tr></thead>
                    <tbody>{items.map(e => <tr key={e.id}>
                        <td><strong>{e.title}</strong><small className="cell-sub">{e.reference}</small></td>
                        <td><Badge value={e.status} label={statusLabel(e.status)} /></td>
                        <td>{e.lines}{e.accepted > 0 && e.status === 'SOUMIS' ? ` (${e.accepted} acceptée${e.accepted > 1 ? 's' : ''})` : ''}{e.destroyed > 0 ? ` (${e.destroyed} détruite${e.destroyed > 1 ? 's' : ''})` : ''}</td>
                        <td>{formatDate(e.createdAt)}</td>
                        <td><button type="button" className="btn small secondary" onClick={() => setOpenId(e.id)}>Ouvrir</button></td>
                    </tr>)}</tbody></table></div>}
        {creating && <CreateDialog onClose={() => setCreating(false)} onDone={id => { setCreating(false); reload(); setOpenId(id); }} />}
        {openId && <DetailDialog id={openId} canPropose={canPropose} canValidate={canValidate} canExecute={canExecute} onClose={() => setOpenId(null)} onChanged={reload} />}
    </section>;
}

function CandidatePicker({ chosen, onToggle, disabled }: { chosen: Set<string>; onToggle: (id: string) => void; disabled?: boolean }) {
    const { physicalArchives, epoch } = useSession();
    const [text, setText] = useState('');
    const [page, setPage] = useState(0);
    const q = useResource<EliminationCandidatePage>(s => physicalArchives!.eliminationCandidates(text.trim() || null, page, s), `elimination-candidates:${text.trim()}:${page}:${epoch}`);
    const items = q.data?.items ?? [];
    return <div>
        <Field label="Chercher une archive" wide hint="Par cote ou description. Ne sont proposées que les archives éliminables : ni dehors, ni patrimoniales, ni essentielles, ni sous gel."><input value={text}
            onChange={e => { setText(e.target.value); setPage(0); }} disabled={disabled} /></Field>
        {q.loading && !q.data ? <Busy label="Recherche…" /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} />
            : items.length === 0 ? <p><small>Aucune archive éliminable ne correspond.</small></p>
                : <div className="term-picker-list" role="group" aria-label="Archives éliminables">
                    {items.map(c => <label key={c.archiveId}><input type="checkbox" checked={chosen.has(c.archiveId)} onChange={() => onToggle(c.archiveId)} disabled={disabled} />
                        <span><strong>{c.reference}</strong>{c.description ? ` — ${c.description}` : ''}<small> {[c.support, quantityText(c.quantity, c.unit), c.storageUnit].filter(Boolean).join(' · ')}</small></span></label>)}
                </div>}
        {q.data && (page > 0 || q.data.hasMore) && <Pagination page={page} hasMore={q.data.hasMore} onChange={setPage} count={items.length} />}
    </div>;
}

function useChosen() {
    const [chosen, setChosen] = useState<Set<string>>(new Set());
    const toggle = (id: string) => setChosen(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
    return { chosen, toggle };
}

function CreateDialog({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
    const { physicalArchives } = useSession();
    const [title, setTitle] = useState('');
    const [remarks, setRemarks] = useState('');
    const { chosen, toggle } = useChosen();
    const [attempted, setAttempted] = useState(false);
    const action = useAction();
    const problems = createProblems(title, chosen.size);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) { setAttempted(true); return; }
        const ids = [...chosen];
        const created = await action.run({ title: title.trim(), ids }, key => physicalArchives!.createElimination(title.trim(), remarks.trim() || null, ids, key));
        if (created) onDone(created.id);
    };
    return <Modal title="Nouveau procès-verbal d’élimination" subtitle="Choisissez les archives physiques à éliminer" onClose={onClose} locked={action.busy} wide>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Intitulé *" wide><input value={title} onChange={e => setTitle(e.target.value)} maxLength={300} disabled={action.busy} /></Field>
                <Field label="Observations" wide><textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={2} maxLength={4000} disabled={action.busy} /></Field>
            </div>
            <CandidatePicker chosen={chosen} onToggle={toggle} disabled={action.busy} />
            {attempted && problems.length > 0 && <Notice tone="warning"><ul>{problems.map(p => <li key={p}>{p}</li>)}</ul></Notice>}
            {action.error ? <ErrorNotice error={ruleError(action.error)} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Renoncer</button>
                <button type="submit" className="btn primary" disabled={action.busy}>Constituer ({chosen.size})</button></footer>
        </form>
    </Modal>;
}

type Panel = null | 'add' | 'approve' | 'reject' | 'execute' | 'cancel' | { refuse: EliminationLine };

function DetailDialog({ id, canPropose, canValidate, canExecute, onClose, onChanged }: {
    id: string; canPropose: boolean; canValidate: boolean; canExecute: boolean; onClose: () => void; onChanged: () => void;
}) {
    const { physicalArchives, epoch } = useSession();
    const [revision, setRevision] = useState(0);
    const [panel, setPanel] = useState<Panel>(null);
    const action = useAction();
    const q = useResource<Elimination>(s => physicalArchives!.elimination(id, s), `elimination:${id}:${revision}:${epoch}`);
    // pendant une relecture, le dernier état reste affiché : la fenêtre ne clignote pas à chaque action
    const last = useRef<Elimination | null>(null);
    if (q.data) last.current = q.data;
    const e = q.data ?? last.current;
    const refresh = () => { setRevision(n => n + 1); onChanged(); };
    const run = async (payload: unknown, call: (key: string) => Promise<unknown>) => { if (await action.run(payload, call)) refresh(); };
    if (!e) return <Modal title="Procès-verbal d’élimination" onClose={onClose} wide>{q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : <Busy />}</Modal>;
    const counts = lineCounts(e.lines);
    const editable = e.status === 'BROUILLON';
    return <Modal title={e.title} subtitle={`${e.reference} · ${statusLabel(e.status)}`} onClose={onClose} locked={action.busy} wide>
        {action.error ? <ErrorNotice error={ruleError(action.error)} /> : null}
        <dl className="preservation-summary">
            <div><dt>Constitué par</dt><dd>{e.createdByName ?? '—'} · {formatDate(e.createdAt)}</dd></div>
            {e.submittedAt && <div><dt>Soumis par</dt><dd>{e.submittedByName ?? '—'} · {formatDate(e.submittedAt)}</dd></div>}
            {e.visaAt && <div><dt>Visa</dt><dd>{e.authority} — réf. {e.visaReference ?? '—'} du {formatDate(e.visaDate)} · par {e.visaByName ?? '—'}</dd></div>}
            {e.status === 'REFUSE' && <div><dt>Refus</dt><dd>{e.authority} · par {e.visaByName ?? '—'}</dd></div>}
            {e.executedAt && <div><dt>Destruction</dt><dd>{formatDate(e.destructionDate)} — {e.method}, {e.place}. Opérateur : {e.operator}. Témoin : {e.witness}.</dd></div>}
            {e.fingerprint && <div><dt>Empreinte du procès-verbal</dt><dd><code>{e.fingerprint}</code></dd></div>}
            {e.status === 'ANNULE' && <div><dt>Annulation</dt><dd>{e.cancelReason} · par {e.cancelledByName ?? '—'}</dd></div>}
            {e.remarks && <div><dt>Observations</dt><dd>{e.remarks}</dd></div>}
        </dl>
        {e.minutes && <details><summary>Procès-verbal du visa</summary><p style={{ whiteSpace: 'pre-wrap' }}>{e.minutes}</p></details>}
        <div className="table-scroll"><table><thead><tr><th>Cote</th><th>Archive</th><th>Quantité</th><th>État</th><th /></tr></thead>
            <tbody>{e.lines.map(l => <tr key={l.id}>
                <td><strong>{l.reference}</strong><small className="cell-sub">{l.storageUnit}</small></td>
                <td>{l.description ?? '—'}{l.support && <small className="cell-sub">{l.support}</small>}</td>
                <td>{quantityText(l.quantity, l.unit) ?? '—'}</td>
                <td><Badge value={l.status} label={lineLabel(l.status)} />{l.refusalReason && <small className="cell-sub">{l.refusalReason}</small>}{l.decidedByName && <small className="cell-sub">par {l.decidedByName}</small>}</td>
                <td>
                    {editable && canPropose && <button type="button" className="btn small secondary" disabled={action.busy} onClick={() => run({ remove: l.id }, key => physicalArchives!.removeEliminationLine(e.id, l.id, key))}>Retirer</button>}
                    {e.status === 'SOUMIS' && canValidate && l.status === 'INSCRITE' && <>
                        <button type="button" className="btn small primary" disabled={action.busy} onClick={() => run({ accept: l.id }, key => physicalArchives!.decideEliminationLine(e.id, l.id, true, null, key))}>Accepter</button>{' '}
                        <button type="button" className="btn small secondary" disabled={action.busy} onClick={() => setPanel({ refuse: l })}>Refuser</button></>}
                </td>
            </tr>)}</tbody></table></div>
        <footer className="modal-footer">
            {editable && canPropose && <>
                <button type="button" className="btn secondary" disabled={action.busy} onClick={() => setPanel('add')}>Ajouter des archives</button>
                <button type="button" className="btn primary" disabled={action.busy || counts.total === 0} onClick={() => run({ submit: e.id }, key => physicalArchives!.submitElimination(e.id, key))}>Soumettre à l’autorité</button></>}
            {e.status === 'SOUMIS' && canValidate && <>
                <button type="button" className="btn secondary" disabled={action.busy || counts.accepted > 0} onClick={() => setPanel('reject')}>Refuser le procès-verbal</button>
                <button type="button" className="btn primary" disabled={action.busy || counts.waiting > 0 || counts.accepted === 0} onClick={() => setPanel('approve')}>Viser</button></>}
            {e.status === 'VISE' && canExecute && <button type="button" className="btn primary" disabled={action.busy} onClick={() => setPanel('execute')}>Constater la destruction</button>}
            {['BROUILLON', 'SOUMIS', 'VISE'].includes(e.status) && canPropose && <button type="button" className="btn danger" disabled={action.busy} onClick={() => setPanel('cancel')}>Annuler le procès-verbal</button>}
            <button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Fermer</button>
        </footer>
        {e.status === 'SOUMIS' && counts.waiting > 0 && canValidate && <p><small>{counts.waiting} ligne{counts.waiting > 1 ? 's' : ''} en attente de décision : acceptez ou refusez chaque archive avant de viser.</small></p>}
        {panel === 'add' && <AddDialog id={e.id} onClose={() => setPanel(null)} onDone={() => { setPanel(null); refresh(); }} />}
        {panel === 'approve' && <ApproveDialog id={e.id} onClose={() => setPanel(null)} onDone={() => { setPanel(null); refresh(); }} />}
        {panel === 'reject' && <RejectDialog id={e.id} onClose={() => setPanel(null)} onDone={() => { setPanel(null); refresh(); }} />}
        {panel === 'execute' && <ExecuteDialog elimination={e} onClose={() => setPanel(null)} onDone={() => { setPanel(null); refresh(); }} />}
        {panel === 'cancel' && <ReasonPrompt title="Annuler le procès-verbal" subtitle="Les archives redeviennent disponibles" confirm="Annuler le procès-verbal"
            onClose={() => setPanel(null)} onSubmit={async (reason, key) => { await physicalArchives!.cancelElimination(e.id, reason, key); refresh(); }} />}
        {panel !== null && typeof panel === 'object' && 'refuse' in panel && <ReasonPrompt title={`Refuser « ${panel.refuse.reference} »`} subtitle="L’archive est conservée" hint="Dites pourquoi cette archive ne doit pas être détruite."
            confirm="Refuser l’élimination" onClose={() => setPanel(null)}
            onSubmit={async (reason, key) => { await physicalArchives!.decideEliminationLine(e.id, panel.refuse.id, false, reason, key); refresh(); }} />}
    </Modal>;
}

function AddDialog({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
    const { physicalArchives } = useSession();
    const { chosen, toggle } = useChosen();
    const action = useAction();
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (chosen.size === 0) return;
        const ids = [...chosen];
        if (await action.run({ add: id, ids }, key => physicalArchives!.addEliminationLines(id, ids, key))) onDone();
    };
    return <Modal title="Ajouter des archives" onClose={onClose} locked={action.busy} wide>
        <form onSubmit={submit}>
            <CandidatePicker chosen={chosen} onToggle={toggle} disabled={action.busy} />
            {action.error ? <ErrorNotice error={ruleError(action.error)} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Renoncer</button>
                <button type="submit" className="btn primary" disabled={action.busy || chosen.size === 0}>Ajouter ({chosen.size})</button></footer>
        </form>
    </Modal>;
}

function ApproveDialog({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
    const { physicalArchives } = useSession();
    const [authority, setAuthority] = useState('');
    const [visaReference, setVisaReference] = useState('');
    const [visaDate, setVisaDate] = useState(todayIso());
    const [minutes, setMinutes] = useState('');
    const [attempted, setAttempted] = useState(false);
    const action = useAction();
    const input = { authority: authority.trim(), visaReference: visaReference.trim(), visaDate, minutes: minutes.trim() };
    const problems = approvalProblems(input, todayIso());
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) { setAttempted(true); return; }
        if (await action.run({ approve: id, ...input }, key => physicalArchives!.approveElimination(id, input, key))) onDone();
    };
    return <Modal title="Viser le procès-verbal" subtitle="Seules les lignes acceptées seront détruites" onClose={onClose} locked={action.busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Autorité *" wide><input value={authority} onChange={e => setAuthority(e.target.value)} maxLength={300} disabled={action.busy} /></Field>
                <Field label="Référence du visa *"><input value={visaReference} onChange={e => setVisaReference(e.target.value)} maxLength={255} disabled={action.busy} /></Field>
                <Field label="Date du visa *"><input type="date" value={visaDate} max={todayIso()} onChange={e => setVisaDate(e.target.value)} disabled={action.busy} /></Field>
                <Field label="Procès-verbal du visa *" wide hint="Ce que l’autorité a décidé et sur quel fondement."><textarea value={minutes} onChange={e => setMinutes(e.target.value)} rows={4} maxLength={20000} disabled={action.busy} /></Field>
            </div>
            {attempted && problems.length > 0 && <Notice tone="warning"><ul>{problems.map(p => <li key={p}>{p}</li>)}</ul></Notice>}
            {action.error ? <ErrorNotice error={ruleError(action.error)} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Renoncer</button>
                <button type="submit" className="btn primary" disabled={action.busy}>Viser</button></footer>
        </form>
    </Modal>;
}

function RejectDialog({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
    const { physicalArchives } = useSession();
    const [authority, setAuthority] = useState('');
    const [minutes, setMinutes] = useState('');
    const action = useAction();
    const valid = authority.trim().length >= 3 && minutes.trim().length >= 10;
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!valid) return;
        if (await action.run({ reject: id, authority: authority.trim(), minutes: minutes.trim() }, key => physicalArchives!.rejectElimination(id, authority.trim(), minutes.trim(), key))) onDone();
    };
    return <Modal title="Refuser le procès-verbal" subtitle="Toutes les lignes en attente sont refusées" onClose={onClose} locked={action.busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Autorité *" wide><input value={authority} onChange={e => setAuthority(e.target.value)} maxLength={300} disabled={action.busy} /></Field>
                <Field label="Procès-verbal du refus *" wide hint="10 caractères au moins."><textarea value={minutes} onChange={e => setMinutes(e.target.value)} rows={4} maxLength={20000} disabled={action.busy} /></Field>
            </div>
            {action.error ? <ErrorNotice error={ruleError(action.error)} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Renoncer</button>
                <button type="submit" className="btn danger" disabled={action.busy || !valid}>Refuser le procès-verbal</button></footer>
        </form>
    </Modal>;
}

function ExecuteDialog({ elimination: e, onClose, onDone }: { elimination: Elimination; onClose: () => void; onDone: () => void }) {
    const { physicalArchives } = useSession();
    const [destructionDate, setDestructionDate] = useState(todayIso());
    const [method, setMethod] = useState('');
    const [place, setPlace] = useState('');
    const [operator, setOperator] = useState('');
    const [witness, setWitness] = useState('');
    const [attempted, setAttempted] = useState(false);
    const action = useAction();
    const input = { destructionDate, method: method.trim(), place: place.trim(), operator: operator.trim(), witness: witness.trim() };
    const problems = executionProblems(input, todayIso(), e.visaDate);
    const count = lineCounts(e.lines).accepted;
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) { setAttempted(true); return; }
        if (await action.run({ execute: e.id, ...input }, key => physicalArchives!.executeElimination(e.id, input, key))) onDone();
    };
    return <Modal title="Constater la destruction" subtitle={`${count} archive${count > 1 ? 's' : ''} sera${count > 1 ? 'ont' : ''} marquée${count > 1 ? 's' : ''} détruite${count > 1 ? 's' : ''} : l’opération est définitive`} onClose={onClose} locked={action.busy}>
        <form onSubmit={submit}>
            <Notice tone="warning">Ne constatez la destruction qu’une fois les archives réellement détruites, en présence d’un témoin. Une archive marquée détruite ne se modifie plus.</Notice>
            <div className="form-grid">
                <Field label="Date de la destruction *"><input type="date" value={destructionDate} min={e.visaDate ?? undefined} max={todayIso()} onChange={ev => setDestructionDate(ev.target.value)} disabled={action.busy} /></Field>
                <Field label="Méthode *" hint="Par exemple : broyage, incinération."><input value={method} onChange={ev => setMethod(ev.target.value)} maxLength={200} disabled={action.busy} /></Field>
                <Field label="Lieu *" wide><input value={place} onChange={ev => setPlace(ev.target.value)} maxLength={200} disabled={action.busy} /></Field>
                <Field label="Opérateur *" hint="La personne qui détruit."><input value={operator} onChange={ev => setOperator(ev.target.value)} maxLength={200} disabled={action.busy} /></Field>
                <Field label="Témoin *" hint="Une autre personne, présente."><input value={witness} onChange={ev => setWitness(ev.target.value)} maxLength={200} disabled={action.busy} /></Field>
            </div>
            {attempted && problems.length > 0 && <Notice tone="warning"><ul>{problems.map(p => <li key={p}>{p}</li>)}</ul></Notice>}
            {action.error ? <ErrorNotice error={ruleError(action.error)} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Renoncer</button>
                <button type="submit" className="btn danger" disabled={action.busy}>Constater la destruction</button></footer>
        </form>
    </Modal>;
}
