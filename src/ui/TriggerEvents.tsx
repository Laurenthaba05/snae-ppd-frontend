import { ResourceDetailsButton } from './ResourceDetails';
import React, { useMemo, useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { commandKey } from '../api/archives';
import { Badge, Busy, Empty, ErrorNotice, Field, Modal, Notice, formatDate, useResource } from './components';
import { EntityName } from './names';
import { can } from '../core/policy';
import { formatDay } from '../core/format';
import {
    DOCUMENT_STATUS_TEXT, MAX_JUSTIFICATION, declareBody, declareProblems, emptyDeclareForm, emptyTypeForm, eventSentence, schedulingText, typeBody, typeProblems,
    type DeclareForm, type TriggerEvent, type TriggerEventDocument, type TriggerEventScheduling, type TriggerEventType
} from '../core/triggerEvents';

const today = () => new Date().toISOString().slice(0, 10);

/** Les types d'événements déclencheurs : une donnée de référence, saisie par le niveau national ou par l'institution. Aucun n'est livré. */
export function TriggerEventTypesPanel({ institutionId }: { institutionId: string }) {
    const { me, retention, epoch } = useSession();
    const q = useResource<TriggerEventType[]>(signal => retention!.triggerEventTypes(institutionId, signal), `trigger-event-types:${institutionId}:${epoch}`);
    const mayManage = can(me, 'RETENTION_RULE_MANAGE', { institutionId, departmentId: null });
    const mayManageNational = can(me, 'RETENTION_RULE_MANAGE', { institutionId: null, departmentId: null });
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const list = q.data ?? [];
    const retire = async (t: TriggerEventType) => {
        if (busyId) return;
        setBusyId(t.id); setError(null);
        try { await retention!.retireTriggerEventType(t.id, crypto.randomUUID()); q.refresh(); } catch (e) { setError(e); } finally { setBusyId(null); }
    };
    return <div className="panel trigger-types-panel" role="region" aria-label="Événements déclencheurs">
        <div className="section-heading"><h3>Événements déclencheurs</h3>{mayManage && <button type="button" className="btn small primary" onClick={() => setCreating(true)}>Nouveau type d’événement</button>}</div>
        <div className="panel-padding"><Notice>Certains délais de conservation ne partent ni d’une date du document, ni de sa clôture, mais d’un <strong>événement</strong> constaté plus tard : fin d’un marché, décès,
            fin d’un mandat… Définissez ici les types d’événements que vos règles peuvent attendre ; la personne habilitée constate ensuite l’événement sur le document ou sur son dossier.</Notice></div>
        {error ? <ErrorNotice error={error} /> : null}
        {q.loading && !q.data ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} />
            : list.length === 0 ? <Empty title="Aucun type d’événement" description="Aucun type n’est défini : les règles ne peuvent pas encore partir d’un événement." icon="clock" />
                : <div className="table-scroll"><table><thead><tr><th>Type d’événement</th><th>Portée</th><th>État</th><th>Règles</th><th><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>{list.map(t => <tr key={t.id}>
                        <td><strong>{t.label}</strong><small className="cell-sub">{t.description ?? t.code}</small></td>
                        <td>{t.scope === 'NATIONAL' ? 'Nationale' : <EntityName kind="institutions" id={t.institutionId} />}</td>
                        <td><Badge value={t.status} label={t.status === 'ACTIF' ? 'Actif' : 'Retiré'} /></td>
                        <td>{t.versionsUsing === 0 ? 'Aucune règle' : t.versionsUsing === 1 ? '1 version de règle' : `${t.versionsUsing} versions de règle`}</td>
                        <td className="table-actions">{t.status === 'ACTIF' && (t.scope === 'NATIONAL' ? mayManageNational : mayManage)
                            && <button type="button" className="btn small danger-outline" disabled={busyId !== null} onClick={() => void retire(t)} aria-label={`Retirer ${t.label}`}>Retirer</button>}</td>
                    </tr>)}</tbody></table></div>}
        {creating && <CreateTypeDialog institutionId={institutionId} mayNational={mayManageNational} onClose={() => setCreating(false)} onDone={() => { setCreating(false); q.refresh(); }} />}
    </div>;
}

function CreateTypeDialog({ institutionId, mayNational, onClose, onDone }: { institutionId: string; mayNational: boolean; onClose: () => void; onDone: () => void }) {
    const { retention } = useSession();
    const [form, setForm] = useState(emptyTypeForm);
    const [busy, setBusy] = useState(false);
    const [attempted, setAttempted] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const intention = useRef<ReturnType<typeof commandKey> | null>(null);
    const problems = typeProblems(form);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (busy) return;
        if (problems.length) { setAttempted(true); return; }
        setBusy(true); setError(null);
        const body = typeBody(form, institutionId);
        intention.current = commandKey(intention.current, body);
        try { await retention!.createTriggerEventType(body, intention.current.key); onDone(); } catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal title="Nouveau type d’événement" subtitle="Ce que les règles de conservation peuvent attendre" onClose={onClose} locked={busy}>
        <form onSubmit={submit}><div className="form-grid">
            <Field label="Libellé *" wide hint="Ce que la personne verra : « Réception définitive du marché »."><input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} maxLength={200} disabled={busy} /></Field>
            <Field label="Code *" hint="Lettres, chiffres et tirets bas ; unique."><input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} maxLength={60} disabled={busy} /></Field>
            <Field label="Portée"><select value={form.scope} onChange={e => setForm(f => ({ ...f, scope: e.target.value as typeof form.scope }))} disabled={busy}>
                <option value="INSTITUTION">Cette institution</option>{mayNational && <option value="NATIONAL">Nationale (toutes les institutions)</option>}</select></Field>
            <Field label="Description" wide hint="Facultatif : ce qui atteste que l’événement est survenu."><textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} maxLength={2000} disabled={busy} /></Field>
        </div>
        {attempted && problems.length > 0 && <ul className="relation-problems" role="alert">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
        {error ? <ErrorNotice error={error} /> : null}
        <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>Créer le type</button></footer></form>
    </Modal>;
}

/**
 * Constater l'événement qu'une règle attend : sa date, la pièce qui l'atteste, sur le document ou sur son dossier (il vaut alors pour tous les documents du dossier et de ses
 * sous-dossiers). Le type est celui de la règle applicable.
 */
export function DeclareTriggerEventDialog({ documentId, dossierId, typeId, typeLabel, onClose, onDone }: {
    documentId: string; dossierId: string | null; typeId: string; typeLabel: string; onClose: () => void; onDone: (event: TriggerEvent) => void;
}) {
    const { retention } = useSession();
    const [form, setForm] = useState<DeclareForm>(() => emptyDeclareForm(typeId, Boolean(dossierId)));
    const [busy, setBusy] = useState(false);
    const [attempted, setAttempted] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const intention = useRef<ReturnType<typeof commandKey> | null>(null);
    const problems = declareProblems(form, today());
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (busy) return;
        if (problems.length) { setAttempted(true); return; }
        setBusy(true); setError(null);
        const body = declareBody(form, documentId, dossierId);
        intention.current = commandKey(intention.current, body);
        try { onDone(await retention!.declareTriggerEvent(body, intention.current.key)); } catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal title="Constater l’événement" subtitle={typeLabel} onClose={onClose} locked={busy}>
        <form onSubmit={submit}><div className="form-grid">
            {dossierId && <Field label="Sur quoi porte l’événement" wide hint="Un événement constaté sur le dossier vaut pour tous les documents du dossier et de ses sous-dossiers.">
                <select value={form.scope} onChange={e => setForm(f => ({ ...f, scope: e.target.value as DeclareForm['scope'] }))} disabled={busy}>
                    <option value="DOSSIER">Le dossier du document</option><option value="DOCUMENT">Ce document seulement</option></select></Field>}
            <Field label="Date de l’événement *" hint="La date à laquelle il est survenu, pas celle de la saisie."><input type="date" value={form.date} max={today()} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} disabled={busy} /></Field>
            <Field label="Justification *" wide hint={`L’acte, le procès-verbal ou la référence qui atteste l’événement (${MAX_JUSTIFICATION} caractères au plus).`}>
                <input value={form.justification} onChange={e => setForm(f => ({ ...f, justification: e.target.value }))} maxLength={MAX_JUSTIFICATION} disabled={busy} /></Field>
            <Field label="Observations" wide><textarea value={form.observations} onChange={e => setForm(f => ({ ...f, observations: e.target.value }))} rows={2} maxLength={4000} disabled={busy} /></Field>
        </div>
        <Notice tone="warning">Une fois qu’une échéance de conservation est partie de cet événement, il ne peut plus être annulé : vérifiez la date.</Notice>
        {attempted && problems.length > 0 && <ul className="relation-problems" role="alert">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
        {error ? <ErrorNotice error={error} /> : null}
        <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>Constater l’événement</button></footer></form>
    </Modal>;
}

/** Les événements constatés qui concernent un document (le sien et ceux de ses dossiers), avec leur annulation motivée et la planification des documents concernés. */
export function DocumentTriggerEvents({ documentId, onChanged }: { documentId: string; onChanged?: () => void }) {
    const { me, retention, epoch } = useSession();
    const q = useResource<TriggerEvent[]>(signal => retention!.triggerEvents({ documentId }, signal), `document-trigger-events:${documentId}:${epoch}`);
    const [cancelling, setCancelling] = useState<TriggerEvent | null>(null);
    const [scheduling, setScheduling] = useState<TriggerEvent | null>(null);
    const events = (q.data ?? []).filter(e => e.status === 'CONSTATE');
    if (q.loading && !q.data) return null;
    if (q.error || events.length === 0) return null;
    return <section className="panel" aria-label="Événements déclencheurs constatés">
        <div className="section-heading"><h3>Événements déclencheurs constatés</h3></div>
        <ul className="relation-list">{events.map(e => <li key={e.id}>
            <span>{eventSentence(e, d => formatDay(d))}<small className="cell-sub">Constaté le {formatDate(e.declaredAt)} par <EntityName kind="users" id={e.declaredById} />{e.inUse ? ' · une échéance en est partie' : ''}</small></span>
            <span className="table-actions">
                <ResourceDetailsButton resource="triggerEvent" id={e.id} title={e.typeLabel} /><button type="button" className="btn small secondary" onClick={() => setScheduling(e)}>Planifier les documents concernés</button>
                {!e.inUse && <button type="button" className="btn small danger-outline" onClick={() => setCancelling(e)} aria-label={`Annuler l’événement ${e.typeLabel}`}>Annuler</button>}
            </span></li>)}</ul>
        {cancelling && <CancelDialog event={cancelling} onClose={() => setCancelling(null)} onDone={() => { setCancelling(null); q.refresh(); onChanged?.(); }} />}
        {scheduling && <ScheduleDialog event={scheduling} onClose={() => setScheduling(null)} onDone={() => { q.refresh(); onChanged?.(); }} />}
    </section>;
}

function CancelDialog({ event, onClose, onDone }: { event: TriggerEvent; onClose: () => void; onDone: () => void }) {
    const { retention } = useSession();
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const intention = useRef<ReturnType<typeof commandKey> | null>(null);
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy || reason.trim().length < 5) return;
        setBusy(true); setError(null);
        intention.current = commandKey(intention.current, { cancel: event.id, reason });
        try { await retention!.cancelTriggerEvent(event.id, reason.trim(), intention.current.key); onDone(); } catch (err) { setError(err); } finally { setBusy(false); }
    };
    return <Modal title="Annuler l’événement" subtitle={event.typeLabel} onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <Field label="Motif *" hint="Conservé au journal. 5 caractères au moins." wide><textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} maxLength={500} disabled={busy} required /></Field>
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Garder</button>
                <button type="submit" className="btn danger" disabled={busy || reason.trim().length < 5}>Annuler l’événement</button></footer>
        </form>
    </Modal>;
}

/** Les documents que l'événement concerne, ce qui est planifiable, et la planification en une fois. */
function ScheduleDialog({ event, onClose, onDone }: { event: TriggerEvent; onClose: () => void; onDone: () => void }) {
    const { retention, epoch } = useSession();
    const q = useResource<TriggerEventDocument[]>(signal => retention!.triggerEventDocuments(event.id, signal), `trigger-event-documents:${event.id}:${epoch}`);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const [result, setResult] = useState<TriggerEventScheduling | null>(null);
    const docs = result?.documents ?? q.data ?? [];
    const ready = useMemo(() => docs.filter(d => d.status === 'PLANIFIABLE').length, [docs]);
    const run = async () => {
        if (busy) return;
        setBusy(true); setError(null);
        try { const r = await retention!.scheduleTriggerEvent(event.id, crypto.randomUUID()); setResult(r); onDone(); } catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal wide title="Planifier les documents concernés" subtitle={eventSentence(event, d => formatDay(d))} onClose={onClose} locked={busy}>
        <div className="panel-padding">
            {q.loading && !q.data ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : docs.length === 0 ? <Empty title="Aucun document" icon="clock" />
                : <div className="table-scroll"><table><thead><tr><th>Document</th><th>Situation</th></tr></thead>
                    <tbody>{docs.map(d => <tr key={d.documentId}><td><strong>{d.reference}</strong><small className="cell-sub">{d.title}</small></td><td>{DOCUMENT_STATUS_TEXT[d.status] ?? d.status}</td></tr>)}</tbody></table></div>}
            {result && <Notice tone={result.failures.length ? 'warning' : 'info'}>{schedulingText(result)}</Notice>}
            {result && result.failures.length > 0 && <ul className="relation-problems" role="alert">{result.failures.map(f => <li key={f}>{f}</li>)}</ul>}
            {error ? <ErrorNotice error={error} /> : null}
        </div>
        <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Fermer</button>
            <button type="button" className="btn primary" disabled={busy || ready === 0} onClick={() => void run()}>Planifier {ready === 1 ? '1 échéance' : `${ready} échéances`}</button></footer>
    </Modal>;
}
