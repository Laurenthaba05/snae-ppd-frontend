import React, { useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { can } from '../core/policy';
import { Badge, Busy, Empty, ErrorNotice, Field, Modal, Notice, Pagination, formatDate, useResource } from './components';
import { Suggestions } from './PhysicalSuggestions';
import { dayText } from '../core/placement';
import { display } from '../core/format';
import { MAX_DAYS_AHEAD, addDays } from '../core/movements';
import {
    EXIT_AUTHORIZE, EXIT_HANDLE, EXIT_REQUEST, NEXT_STEPS, STATUS_FILTERS, emptyRequestForm, emptyTransitionForm, eventSummary, exitNeeds, exitOptions, isOpen, lateText, listParams, needsForm, requestBody, requestProblems,
    statusLabel, transitionBody, transitionLabel, transitionProblems
} from '../core/physicalExit';
import type { ExitOption, ExitPage, ExitRequest, ExitStatus, RequestForm, TransitionForm } from '../core/physicalExit';

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Le badge d'une étape : les couleurs des demandes sont celles des demandes de mouvement du patrimoine. */
function ExitBadge({ status, late = false }: { status: ExitStatus; late?: boolean }) {
    return <><Badge value={'R_' + status} label={statusLabel(status)} />{late && <Badge value="R_RETARD" label="En retard" />}</>;
}

/** Les droits d'une personne sur une demande : ceux du propriétaire de l'archive (son institution et son unité) ; sans propriétaire, seul le niveau national. */
function useExitRights(owner: { institutionId: string | null; departmentId: string | null }) {
    const { me } = useSession();
    const target = { institutionId: owner.institutionId, departmentId: owner.departmentId };
    return { rights: { request: can(me, EXIT_REQUEST, target), authorize: can(me, EXIT_AUTHORIZE, target), handle: can(me, EXIT_HANDLE, target) }, userId: me?.user.id ?? null };
}

// ---------- demande

export function ExitRequestDialog({ archive, onClose, onDone }: { archive: { id: string; cote: string }; onClose: () => void; onDone: (id: string) => void }) {
    const { physicalArchives } = useSession();
    const key = useRef(crypto.randomUUID());
    const [form, setForm] = useState<RequestForm>(emptyRequestForm);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const today = todayIso();
    const problems = requestProblems(form, today);
    const set = (patch: Partial<RequestForm>) => setForm({ ...form, ...patch });
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) return;
        setBusy(true); setError(null);
        try {
            const saved = await physicalArchives!.command<ExitRequest>('/archives/' + archive.id + '/exit-requests', requestBody(form), key.current, 'POST');
            onDone(saved.id); onClose();
        } catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal title="Demander la sortie de l’archive" subtitle={archive.cote} onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <Notice>Une archive ne sort pas sans demande : elle est autorisée par une autre personne que vous, puis le magasin la remet et la sortie s’inscrit à l’historique des mouvements. Vous pouvez annuler la demande tant que l’archive n’est pas remise.</Notice>
            <div className="form-grid">
                <Field label="Pour quoi *" hint="Consultation, prêt, numérisation, restauration…"><input value={form.objet} onChange={e => set({ objet: e.target.value })} maxLength={40} disabled={busy} list="physical-exit-purpose" /></Field><Suggestions id="physical-exit-purpose" field="TYPE_MOUVEMENT" />
                <Field label="Retour prévu *" hint="Une sortie a toujours une échéance (cinq ans au plus)"><input type="date" min={today} max={addDays(today, MAX_DAYS_AHEAD)} value={form.retourPrevu} onChange={e => set({ retourPrevu: e.target.value })} disabled={busy} /></Field>
                <Field label="Où l’archive ira *" hint="Salle de lecture, atelier, bureau…"><input value={form.destination} onChange={e => set({ destination: e.target.value })} maxLength={255} disabled={busy} /></Field>
                <Field label="Qui la reçoit *" hint="Personne ou service"><input value={form.destinataire} onChange={e => set({ destinataire: e.target.value })} maxLength={255} disabled={busy} /></Field>
                <Field label="Motif * (au moins 10 caractères)" wide hint="Pourquoi l’archive doit sortir de réserve"><textarea value={form.motif} onChange={e => set({ motif: e.target.value })} rows={3} maxLength={4000} disabled={busy} /></Field>
            </div>
            {problems.length > 0 && (form.objet !== '' || form.motif !== '' || form.destination !== '') && <ul className="wf-blockers" aria-label="À compléter">{problems.map(p => <li key={p} className="warn"><span>{p}</span></li>)}</ul>}
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy || problems.length > 0}>Déposer la demande</button></footer>
        </form>
    </Modal>;
}

// ---------- passages qui demandent plus qu'un clic

function TransitionDialog({ request, vers, onClose, onDone }: { request: ExitRequest; vers: ExitStatus; onClose: () => void; onDone: () => void }) {
    const { physicalArchives } = useSession();
    const needs = exitNeeds(vers);
    const [form, setForm] = useState<TransitionForm>(emptyTransitionForm);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const problems = transitionProblems(vers, form);
    const touched = form.texte !== '' || form.conditions !== '' || form.conforme !== '';
    const run = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) return;
        setBusy(true); setError(null);
        try { await physicalArchives!.command('/exit-requests/' + request.id + '/transition', transitionBody(vers, request.version, form), crypto.randomUUID(), 'POST'); onDone(); onClose(); }
        catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal title={transitionLabel(vers)} subtitle={request.numero + ' · ' + request.archiveCote} onClose={onClose} locked={busy}>
        <form onSubmit={run}>
            {vers === 'AUTORISEE' && <Notice>L’autorisation engage l’institution : elle est conservée avec son auteur et sa date. Elle est donnée par une autre personne que celle qui a demandé la sortie, et l’archive sera jugée de nouveau à la remise.</Notice>}
            {(vers === 'REFUSEE' || vers === 'ANNULEE') && <Notice tone="warning">Cette décision est définitive ; une nouvelle demande pourra ensuite être déposée.</Notice>}
            {vers === 'RETOURNEE' && <Notice>Le retour clôt le mouvement : l’archive est de nouveau disponible. Une archive rendue dans un autre état que celui où elle est partie se dit, avec une note.</Notice>}
            {(needs.conditions || needs.texte) && <div className="form-grid">
                {needs.conditions && <Field label="Conditions de manipulation" wide hint="Facultatif : gants, consultation sur place, interdiction de photocopier…">
                    <textarea value={form.conditions} onChange={e => setForm({ ...form, conditions: e.target.value })} rows={3} maxLength={4000} disabled={busy} /></Field>}
                {needs.texte && <Field label={needs.texteLabel + ' * (au moins 10 caractères)'} wide><textarea value={form.texte} onChange={e => setForm({ ...form, texte: e.target.value })} rows={3} maxLength={4000} disabled={busy} /></Field>}
            </div>}
            {needs.conformite && <>
                <fieldset className="placement-choices" disabled={busy}><legend>État de l’archive au retour *</legend>
                    <label><input type="radio" name="conforme" value="oui" checked={form.conforme === 'oui'} onChange={() => setForm({ ...form, conforme: 'oui' })} /><span><strong>Rendue dans l’état où elle est partie</strong><small>Aucune anomalie constatée au retour.</small></span></label>
                    <label><input type="radio" name="conforme" value="non" checked={form.conforme === 'non'} onChange={() => setForm({ ...form, conforme: 'non' })} /><span><strong>Rendue dans un autre état</strong><small>Une anomalie est constatée : elle se décrit.</small></span></label>
                </fieldset>
                {form.conforme !== '' && <div className="form-grid"><Field label={form.conforme === 'non' ? 'Anomalie constatée * (au moins 10 caractères)' : 'Note sur le retour'} wide hint={form.conforme === 'non' ? undefined : 'Facultatif'}>
                    <textarea value={form.texte} onChange={e => setForm({ ...form, texte: e.target.value })} rows={2} maxLength={4000} disabled={busy} /></Field></div>}
            </>}
            {problems.length > 0 && touched && <ul className="wf-blockers" aria-label="À compléter">{problems.map(p => <li key={p} className="warn"><span>{p}</span></li>)}</ul>}
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Retour</button><button type="submit" className="btn primary" disabled={busy || problems.length > 0}>Confirmer</button></footer>
        </form>
    </Modal>;
}

// ---------- fiche d'une demande

export function ExitDialog({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
    const { physicalArchives, epoch } = useSession();
    const [revision, setRevision] = useState(0);
    const [chosen, setChosen] = useState<ExitStatus | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const q = useResource<ExitRequest>(s => physicalArchives!.exitRequest(id, s), 'exit-request:' + id + ':' + revision + ':' + epoch);
    const last = useRef<ExitRequest | null>(null);
    if (q.data) last.current = q.data;
    const request = q.data ?? last.current;
    const { rights, userId } = useExitRights({ institutionId: request?.institutionId ?? null, departmentId: request?.departmentId ?? null });
    const refresh = () => { setRevision(r => r + 1); onChanged(); };
    if (!request && q.loading) return <Modal title="Demande de sortie" onClose={onClose} wide><Busy /></Modal>;
    if (!request) return <Modal title="Demande de sortie" onClose={onClose} wide><ErrorNotice error={q.error} onRetry={q.refresh} /></Modal>;
    const options = exitOptions(request, rights, userId);
    const quick = async (option: ExitOption) => {
        setBusy(true); setError(null);
        try { await physicalArchives!.command('/exit-requests/' + request.id + '/transition', transitionBody(option.vers, request.version, emptyTransitionForm()), crypto.randomUUID(), 'POST'); refresh(); }
        catch (e) { setError(e); } finally { setBusy(false); }
    };
    const today = todayIso();
    const late = lateText(request, today);
    return <Modal title={'Sortie de l’archive ' + request.archiveCote} subtitle={request.numero + (request.archiveIntitule ? ' · ' + request.archiveIntitule : '')} onClose={onClose} wide>
        <div className="entry-head"><ExitBadge status={request.statut} late={request.enRetard} /><Badge value="R_OBJET" label={display(request.objet)} /></div>
        <p className="placement-summary modal-summary">{NEXT_STEPS[request.statut]}{late && ' ' + late + '.'}</p>
        {options.length > 0 && <div className="asset-transitions"><div className="table-actions">{options.map(option => <button key={option.vers} type="button" className={'btn small ' + (option.vers === 'ANNULEE' || option.vers === 'REFUSEE' ? 'secondary' : 'primary')}
            disabled={!option.allowed || busy} title={option.why} onClick={() => needsForm(option.vers) ? setChosen(option.vers) : void quick(option)}>{transitionLabel(option.vers)}</button>)}</div>
            {options.filter(o => !o.allowed && o.why).length > 0 && <p className="wf-note">{options.filter(o => !o.allowed && o.why).map(o => transitionLabel(o.vers) + ' : ' + o.why).join(' ')}</p>}
            {error ? <ErrorNotice error={error} /> : null}</div>}
        <div className="asset-tab">
            <dl className="asset-fields">
                <div><dt>Où l’archive ira</dt><dd>{request.destination}</dd></div>
                <div><dt>Qui la reçoit</dt><dd>{request.destinataire}</dd></div>
                <div><dt>Retour prévu</dt><dd className={request.enRetard ? 'bad' : ''}>{dayText(request.retourPrevu)}{late && <small className="cell-sub">{late}</small>}</dd></div>
                <div><dt>Demandée</dt><dd>{dayText(request.demandeLe)}{request.demandePar && <small className="cell-sub">par {request.demandePar}</small>}</dd></div>
                <div className="wide"><dt>Motif</dt><dd className="conservation-text">{request.motif}</dd></div>
                {request.decideLe && <div><dt>{request.statut === 'REFUSEE' ? 'Refusée' : 'Autorisée'}</dt><dd>{dayText(request.decideLe)}{request.decidePar && <small className="cell-sub">par {request.decidePar}</small>}</dd></div>}
                {request.decisionMotif && <div className="wide"><dt>Motif du refus</dt><dd className="conservation-text">{request.decisionMotif}</dd></div>}
                {request.conditions && <div className="wide"><dt>Conditions de manipulation</dt><dd className="conservation-text">{request.conditions}</dd></div>}
                {request.remisLe && <div><dt>Remise</dt><dd>{dayText(request.remisLe)}{request.remisPar && <small className="cell-sub">par {request.remisPar}</small>}</dd></div>}
                {request.retourLe && <div><dt>Retour</dt><dd>{dayText(request.retourLe)}{request.retourPar && <small className="cell-sub">par {request.retourPar}</small>}</dd></div>}
                {request.retourConforme !== null && <div><dt>État au retour</dt><dd>{request.retourConforme ? 'Rendue dans l’état où elle est partie' : 'Rendue dans un autre état'}</dd></div>}
                {request.retourNote && <div className="wide"><dt>{request.retourConforme ? 'Note sur le retour' : 'Anomalie constatée'}</dt><dd className="conservation-text">{request.retourNote}</dd></div>}
                {request.fermeLe && <div><dt>Annulée</dt><dd>{dayText(request.fermeLe)}{request.fermePar && <small className="cell-sub">par {request.fermePar}</small>}</dd></div>}
                {request.fermeMotif && <div className="wide"><dt>Motif de l’annulation</dt><dd className="conservation-text">{request.fermeMotif}</dd></div>}
            </dl>
            <section className="asset-group"><h4>Historique</h4>
                <ol className="wf-history asset-journal">{[...request.evenements].reverse().map((e, i) => <li key={e.genre + e.le + i}>
                    <time dateTime={e.le}>{formatDate(e.le)}</time>
                    <span>{eventSummary(e.genre)}{e.par && ' · ' + e.par}</span>
                    {e.texte && <p>{e.texte}</p>}</li>)}</ol></section>
        </div>
        {chosen && <TransitionDialog request={request} vers={chosen} onClose={() => setChosen(null)} onDone={refresh} />}
        <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose}>Fermer</button></footer>
    </Modal>;
}

// ---------- fiche d'une archive : ses demandes de sortie

export function ArchiveExits({ archive, requests, loading, error, onRetry, canRequest, onChanged }: {
    archive: { id: string; cote: string }; requests: ExitRequest[]; loading: boolean; error: unknown; onRetry: () => void; canRequest: boolean; onChanged: () => void;
}) {
    const [opened, setOpened] = useState<string | null>(null);
    const [asking, setAsking] = useState(false);
    const open = requests.find(r => isOpen(r.statut));
    const closed = requests.filter(r => !isOpen(r.statut));
    const today = todayIso();
    return <div>
        <div className="section-heading"><h3>Demandes de sortie</h3>{canRequest && !open && <button className="btn small primary" onClick={() => setAsking(true)}>Demander la sortie</button>}</div>
        {loading && !requests.length ? <Busy /> : error ? <ErrorNotice error={error} onRetry={onRetry} /> : <>
            {open
                ? <p className="placement-summary"><strong>{open.numero}</strong> <ExitBadge status={open.statut} late={open.enRetard} /> — {display(open.objet)} vers {open.destination} ({open.destinataire}), retour prévu le {dayText(open.retourPrevu)}{open.enRetard && ' · ' + lateText(open, today)}. {NEXT_STEPS[open.statut]}
                    {' '}<button type="button" className="btn small secondary" onClick={() => setOpened(open.id)}>Ouvrir la demande</button></p>
                : <p className="placement-summary">Cette archive est en réserve. Pour la consulter, la prêter ou la faire sortir, déposez une demande : elle sera autorisée par une autre personne.</p>}
            {closed.length > 0 && <section className="asset-group"><h4>Demandes closes</h4><ul className="asset-links">{closed.map(r => <li key={r.id}>
                <span><strong>{r.numero}</strong> — {display(r.objet)} vers {r.destination} <ExitBadge status={r.statut} /><small> · demandée le {dayText(r.demandeLe)}{r.demandePar && ' par ' + r.demandePar}</small></span>
                <button type="button" className="btn small secondary" onClick={() => setOpened(r.id)}>Ouvrir</button></li>)}</ul></section>}
        </>}
        {asking && <ExitRequestDialog archive={archive} onClose={() => setAsking(false)} onDone={id => { onChanged(); setOpened(id); }} />}
        {opened && <ExitDialog id={opened} onClose={() => setOpened(null)} onChanged={onChanged} />}
    </div>;
}

// ---------- la file des demandes (page Archives physiques)

export function ExitQueueSection() {
    const { physicalArchives, epoch } = useSession();
    const [form, setForm] = useState({ statut: 'OUVERTES', q: '' });
    const [applied, setApplied] = useState(form);
    const [page, setPage] = useState(0);
    const [revision, setRevision] = useState(0);
    const [opened, setOpened] = useState<string | null>(null);
    const listQ = useResource<ExitPage>(s => physicalArchives!.exitRequests(listParams(applied), page, s), JSON.stringify(['physical-exit-queue', applied, page, revision, epoch]));
    const apply = (next: typeof form) => { setForm(next); setApplied(next); setPage(0); };
    const items = listQ.data?.items ?? [];
    const filtered = applied.statut !== 'OUVERTES' || applied.q !== '';
    const today = todayIso();
    return <>
        <div className="panel">
            <div className="section-heading"><h3>Demandes de sortie</h3></div>
            <p className="wf-note">Les sorties de réserve de votre périmètre : celles qui attendent une décision, une remise ou un retour, les sorties en retard d’abord. Chaque sortie est demandée, autorisée par une autre personne, remise, puis rendue.</p>
            <form className="asset-filters" onSubmit={e => { e.preventDefault(); apply(form); }} role="search" aria-label="Rechercher une demande de sortie">
                <Field label="Recherche"><input value={form.q} onChange={e => setForm({ ...form, q: e.target.value })} placeholder="Numéro, cote, destinataire ou lieu" /></Field>
                <Field label="Étape"><select value={form.statut} onChange={e => apply({ ...form, statut: e.target.value })}><option value="">Toutes</option>{STATUS_FILTERS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                <button type="submit" className="btn small secondary">Rechercher</button>
            </form>
            {listQ.loading && !listQ.data ? <Busy /> : listQ.error ? <ErrorNotice error={listQ.error} onRetry={listQ.refresh} /> : items.length ? <>
                <div className="table-scroll"><table><thead><tr><th>Demande</th><th>Archive</th><th>Pour quoi</th><th>Destination</th><th>Retour prévu</th><th>Étape</th></tr></thead>
                    <tbody>{items.map(r => <tr key={r.id}>
                        <td className="nowrap"><button type="button" className="text-link" onClick={() => setOpened(r.id)}>{r.numero}</button><small className="cell-sub">{dayText(r.demandeLe)}{r.demandePar && ' · ' + r.demandePar}</small></td>
                        <td className="nowrap">{r.archiveCote}{r.archiveIntitule && <small className="cell-sub">{r.archiveIntitule}</small>}</td>
                        <td>{display(r.objet)}</td>
                        <td>{r.destination}<small className="cell-sub">{r.destinataire}</small></td>
                        <td className="nowrap">{dayText(r.retourPrevu)}{r.enRetard && <small className="cell-sub bad">{lateText(r, today)}</small>}</td>
                        <td><ExitBadge status={r.statut} late={r.enRetard} /></td></tr>)}</tbody></table></div>
                <Pagination page={page} hasMore={listQ.data?.hasMore ?? false} onChange={setPage} count={items.length} />
            </> : <Empty title="Aucune demande" description={filtered ? 'Aucune demande ne correspond à ces critères.' : 'Aucune sortie n’est demandée ni en cours dans votre périmètre. Les demandes se déposent depuis la fiche d’une archive.'} />}
        </div>
        {opened && <ExitDialog id={opened} onClose={() => setOpened(null)} onChanged={() => setRevision(r => r + 1)} />}
    </>;
}
