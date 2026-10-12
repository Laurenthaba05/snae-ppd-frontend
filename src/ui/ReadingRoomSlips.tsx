import React, { useMemo, useState } from 'react';
import { useSession } from '../auth/session';
import { Badge, Busy, Empty, ErrorNotice, Field, Modal, Notice, formatDate, useResource } from './components';
import { can } from '../core/policy';
import { ReasonPrompt, ReaderPicker, useAction } from './ReadingRoomParts';
import {
    MAX_SLIP_ITEMS, SLIP_LABELS, SLIP_LINE_LABELS, slipActions, slipProblems, slipProgressText,
    type Room, type Slip, type SlipLine, type SlipSummary, type SlipStatus
} from '../core/readingRoom';
import type { PhysicalArchive } from '../core/types';

const STATUS_FILTERS: SlipStatus[] = ['DEMANDE', 'PREPARE', 'COMMUNIQUE', 'RESTITUE', 'REFUSE', 'ANNULE'];

/** Les bulletins de communication : la demande par cote, la préparation, la remise au lecteur présent et la restitution avec l'état constaté. */
export function ReadingRoomSlips({ institutionId }: { institutionId: string }) {
    const { me, readingRoom, epoch } = useSession();
    const mayDesk = can(me, 'READING_ROOM_DESK', { institutionId });
    const [status, setStatus] = useState('');
    const [revision, setRevision] = useState(0);
    const [creating, setCreating] = useState(false);
    const [opened, setOpened] = useState<string | null>(null);
    const q = useResource<SlipSummary[]>(s => readingRoom!.slips(institutionId, { status: status || null }, s), `rr-slips:${institutionId}:${status}:${revision}:${epoch}`);
    const list = q.data ?? [];
    return <div className="panel" aria-label="Bulletins de communication" role="region">
        <div className="section-heading"><h3>Bulletins de communication</h3>{mayDesk && <button type="button" className="btn small primary" onClick={() => setCreating(true)}>Nouveau bulletin</button>}</div>
        <div className="panel-padding"><Notice>Le bulletin liste les originaux demandés par un lecteur présent dans la salle, par cote de magasin. Un original n’est jamais entre les mains de deux lecteurs ;
            un document sous restriction n’est communiqué que sur dérogation écrite, donnée par la personne qui configure la salle.</Notice></div>
        <div className="table-toolbar">
            <select aria-label="État du bulletin" value={status} onChange={e => setStatus(e.target.value)}>
                <option value="">Tous les bulletins</option>{STATUS_FILTERS.map(s => <option key={s} value={s}>{SLIP_LABELS[s]}</option>)}</select>
        </div>
        {q.loading && !q.data ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} />
            : list.length === 0 ? <Empty title="Aucun bulletin" description="Aucun bulletin de communication ne correspond à ce filtre." icon="send" />
                : <div className="table-scroll"><table><thead><tr><th>Bulletin</th><th>Lecteur</th><th>Salle</th><th>État</th><th>Avancement</th><th>Établi le</th><th><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>{list.map(s => <tr key={s.id}>
                        <td><strong>{s.number}</strong></td>
                        <td>{s.readerName}<small className="cell-sub">{s.readerNumber}</small></td>
                        <td>{s.roomName}</td>
                        <td><Badge value={s.status === 'DEMANDE' ? 'DEPOSEE' : s.status === 'PREPARE' ? 'EN_INSTRUCTION' : s.status === 'COMMUNIQUE' ? 'REMISE' : s.status === 'RESTITUE' ? 'RESTITUEE' : s.status === 'REFUSE' ? 'REFUSEE' : 'ANNULEE'} label={SLIP_LABELS[s.status]} /></td>
                        <td>{slipProgressText(s)}</td>
                        <td>{formatDate(s.createdAt)}</td>
                        <td className="table-actions"><button type="button" className="btn small secondary" onClick={() => setOpened(s.id)}>Ouvrir</button></td>
                    </tr>)}</tbody></table></div>}
        {creating && <NewSlipDialog institutionId={institutionId} onClose={() => setCreating(false)} onDone={s => { setCreating(false); setRevision(n => n + 1); setOpened(s.summary.id); }} />}
        {opened && <SlipDialog id={opened} institutionId={institutionId} onClose={() => setOpened(null)} onChanged={() => setRevision(n => n + 1)} />}
    </div>;
}

/** Le choix des originaux par leur cote ou leur description ; la liste vient du magasin, filtrée ici. */
function ArchivePicker({ selected, onToggle, disabled }: { selected: ReadonlySet<string>; onToggle: (a: PhysicalArchive) => void; disabled: boolean }) {
    const { physicalArchives, epoch } = useSession();
    const [text, setText] = useState('');
    const q = useResource<PhysicalArchive[]>(s => physicalArchives!.archives(s), `rr-archives:${epoch}`);
    const shown = useMemo(() => {
        const needle = text.trim().toLowerCase();
        const all = q.data ?? [];
        return (needle ? all.filter(a => a.cote.toLowerCase().includes(needle) || (a.description ?? '').toLowerCase().includes(needle)) : all).slice(0, 50);
    }, [q.data, text]);
    return <Field label="Documents demandés *" wide hint={`Cherchez par cote ou description ; ${MAX_SLIP_ITEMS} documents au plus.`}>
        <div className="reference-picker">
            <input aria-label="Chercher un document par cote" placeholder="Cote ou description…" value={text} onChange={e => setText(e.target.value)} disabled={disabled} />
            {q.loading && !q.data ? <Busy label="Chargement du magasin…" /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} />
                : shown.length === 0 ? <p><small>Aucune archive ne correspond.</small></p>
                    : <div className="reference-options">{shown.map(a => <label key={a.id} className="check-row">
                        <input type="checkbox" checked={selected.has(a.id)} onChange={() => onToggle(a)} disabled={disabled} />
                        <span><strong>{a.cote}</strong>{a.description ? <small className="cell-sub">{a.description}</small> : null}</span></label>)}</div>}
        </div>
    </Field>;
}

function NewSlipDialog({ institutionId, onClose, onDone }: { institutionId: string; onClose: () => void; onDone: (slip: Slip) => void }) {
    const { me, readingRoom, epoch } = useSession();
    const mayManage = can(me, 'READING_ROOM_MANAGE', { institutionId });
    const roomsQ = useResource<Room[]>(s => readingRoom!.rooms(institutionId, s), `rr-slip-rooms:${institutionId}:${epoch}`);
    const [roomId, setRoomId] = useState('');
    const [readerId, setReaderId] = useState('');
    const [chosen, setChosen] = useState<Map<string, { cote: string; derogation: string }>>(new Map());
    const [observations, setObservations] = useState('');
    const [attempted, setAttempted] = useState(false);
    const action = useAction();
    const rooms = (roomsQ.data ?? []).filter(r => r.status === 'OUVERTE');
    const room = roomId || rooms[0]?.id || '';
    const problems = slipProblems(room, readerId, [...chosen.keys()]);
    const toggle = (a: PhysicalArchive) => setChosen(prev => {
        const next = new Map(prev);
        if (next.has(a.id)) next.delete(a.id); else next.set(a.id, { cote: a.cote, derogation: '' });
        return next;
    });
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) { setAttempted(true); return; }
        const items = [...chosen.entries()].map(([archiveId, v]) => ({ archiveId, derogationReference: v.derogation.trim() || null }));
        const created = await action.run({ room, readerId, items, observations }, key => readingRoom!.createSlip(room, readerId, items, observations.trim() || null, key));
        if (created) onDone(created);
    };
    return <Modal wide title="Nouveau bulletin de communication" subtitle="Le lecteur doit être présent dans la salle" onClose={onClose} locked={action.busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Salle *"><select value={room} onChange={e => setRoomId(e.target.value)} disabled={action.busy}>{rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
                <ReaderPicker institutionId={institutionId} value={readerId} onChange={id => setReaderId(id)} disabled={action.busy} />
                <ArchivePicker selected={new Set(chosen.keys())} onToggle={toggle} disabled={action.busy} />
                {chosen.size > 0 && <Field label="Documents choisis" wide hint={mayManage ? 'Si un document est sous restriction, indiquez la référence de la dérogation écrite.' : 'Un document sous restriction exige la dérogation de la personne qui configure la salle.'}>
                    <ul className="plain-list">{[...chosen.entries()].map(([id, v]) => <li key={id}><strong>{v.cote}</strong>{mayManage &&
                        <input aria-label={`Dérogation pour ${v.cote}`} placeholder="Référence de la dérogation (si restriction)" value={v.derogation} maxLength={255} disabled={action.busy}
                            onChange={e => setChosen(prev => new Map(prev).set(id, { ...v, derogation: e.target.value }))} />}</li>)}</ul></Field>}
                <Field label="Observations" wide><textarea value={observations} onChange={e => setObservations(e.target.value)} rows={2} maxLength={2000} disabled={action.busy} /></Field>
            </div>
            {attempted && problems.length > 0 && <Notice tone="warning">{problems.join(' ')}</Notice>}
            {action.error ? <ErrorNotice error={action.error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Fermer</button>
                <button type="submit" className="btn primary" disabled={action.busy}>Établir le bulletin</button></footer>
        </form>
    </Modal>;
}

function SlipDialog({ id, institutionId, onClose, onChanged }: { id: string; institutionId: string; onClose: () => void; onChanged: () => void }) {
    const { me, readingRoom, epoch } = useSession();
    const mayDesk = can(me, 'READING_ROOM_DESK', { institutionId });
    const [revision, setRevision] = useState(0);
    const [refusing, setRefusing] = useState<SlipLine | null>(null);
    const [cancelling, setCancelling] = useState(false);
    const [handover, setHandover] = useState<Record<string, string>>({});
    const [returned, setReturned] = useState<Record<string, string>>({});
    const action = useAction();
    const q = useResource<Slip>(s => readingRoom!.slip(id, s), `rr-slip:${id}:${revision}:${epoch}`);
    const slip = q.data;
    const changed = () => { setRevision(n => n + 1); onChanged(); };
    const actions = slip ? slipActions(slip) : null;
    const prepare = async (line: SlipLine) => { if (await action.run({ prepare: line.id }, key => readingRoom!.prepareSlipLine(id, line.id, key))) changed(); };
    const deliver = async () => {
        const conditions = Object.fromEntries(Object.entries(handover).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()]));
        if (await action.run({ deliver: id, conditions }, key => readingRoom!.deliverSlip(id, conditions, key))) changed();
    };
    const giveBack = async (line: SlipLine) => {
        const condition = (returned[line.id] ?? '').trim() || null;
        if (await action.run({ return: line.id, condition }, key => readingRoom!.returnSlipLine(id, line.id, condition, key))) changed();
    };
    return <Modal wide title={slip ? `Bulletin ${slip.summary.number}` : 'Bulletin'} subtitle={slip ? `${slip.summary.readerName} — ${slip.summary.roomName} — ${SLIP_LABELS[slip.summary.status]}` : undefined}
        onClose={onClose} locked={action.busy}>
        {q.loading && !slip ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : slip && actions && <>
            {slip.observations && <p><small>{slip.observations}</small></p>}
            {slip.cancellationReason && <Notice tone="warning">Annulé : {slip.cancellationReason}</Notice>}
            {action.error ? <ErrorNotice error={action.error} /> : null}
            <div className="table-scroll"><table><thead><tr><th>Cote</th><th>Document</th><th>État</th><th>Constat</th><th><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>{slip.items.map(line => <tr key={line.id}>
                    <td><strong>{line.cote}</strong>{line.restricted && <small className="cell-sub">Sous restriction — dérogation : {line.derogationReference}</small>}</td>
                    <td>{line.title ?? '—'}</td>
                    <td><Badge value={line.status} label={SLIP_LINE_LABELS[line.status]} />{line.refusalReason && <small className="cell-sub">{line.refusalReason}</small>}</td>
                    <td>
                        {line.status === 'PREPAREE' && mayDesk && actions.deliver ? <input aria-label={`État à la remise de ${line.cote}`} placeholder="État à la remise" value={handover[line.id] ?? ''} maxLength={500}
                            onChange={e => setHandover(prev => ({ ...prev, [line.id]: e.target.value }))} disabled={action.busy} />
                            : line.status === 'COMMUNIQUEE' && actions.returnLines.includes(line.id) && mayDesk ? <input aria-label={`État à la restitution de ${line.cote}`} placeholder="État à la restitution" value={returned[line.id] ?? ''}
                                maxLength={500} onChange={e => setReturned(prev => ({ ...prev, [line.id]: e.target.value }))} disabled={action.busy} />
                                : <>{line.handoverCondition && <small className="cell-sub">Remise : {line.handoverCondition}</small>}{line.returnCondition && <small className="cell-sub">Restitution : {line.returnCondition}</small>}</>}
                    </td>
                    <td className="table-actions">{mayDesk && <>
                        {actions.prepare.includes(line.id) && <button type="button" className="btn small primary" disabled={action.busy} onClick={() => prepare(line)}>Préparer</button>}
                        {actions.refuse.includes(line.id) && <button type="button" className="btn small secondary" disabled={action.busy} onClick={() => setRefusing(line)}>Refuser</button>}
                        {actions.returnLines.includes(line.id) && <button type="button" className="btn small primary" disabled={action.busy} onClick={() => giveBack(line)}>Restituer</button>}
                    </>}</td>
                </tr>)}</tbody></table></div>
            {slip.deliveredAt && <p><small>Remis le {formatDate(slip.deliveredAt)}{slip.returnedAt ? ` — restitué le ${formatDate(slip.returnedAt)}` : ''}.</small></p>}
            {mayDesk && (actions.deliver || actions.cancel) && <footer className="modal-footer">
                {actions.cancel && <button type="button" className="btn danger" disabled={action.busy} onClick={() => setCancelling(true)}>Annuler le bulletin</button>}
                {actions.deliver && <button type="button" className="btn primary" disabled={action.busy} onClick={deliver}>Remettre au lecteur</button>}
            </footer>}
            {refusing && <ReasonPrompt title="Refuser le document" subtitle={refusing.cote} hint="Dites pourquoi : original introuvable, trop fragile, hors périmètre…" confirm="Refuser"
                onClose={() => setRefusing(null)} onSubmit={async (reason, key) => { await readingRoom!.refuseSlipLine(id, refusing.id, reason, key); changed(); }} />}
            {cancelling && <ReasonPrompt title="Annuler le bulletin" subtitle={slip.summary.number} hint="Les documents préparés seront libérés." confirm="Annuler le bulletin"
                onClose={() => setCancelling(false)} onSubmit={async (reason, key) => { await readingRoom!.cancelSlip(id, reason, key); changed(); }} />}
        </>}
    </Modal>;
}
