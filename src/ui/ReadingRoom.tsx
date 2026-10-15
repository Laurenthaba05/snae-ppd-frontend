import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { Badge, Busy, Empty, ErrorNotice, Field, Modal, Notice, formatDate, useResource } from './components';
import { can } from '../core/policy';
import { formatDay } from '../core/format';
import { ReasonPrompt, ReaderPicker, useAction } from './ReadingRoomParts';
import {
    CARD_LABELS, MAX_CARD_YEARS, PIECE_LABELS, RESERVATION_LABELS, ROOM_LABELS, SLOT_LABELS, addYears, emptyRegistration, occupancyText, pieceText, readerName, registrationBody,
    registrationProblems, reservationProblems, roomProblems, slotFull, todayIso,
    type DayOccupancy, type Reader, type ReaderDetail, type Reservation, type Room, type Slot, type Visit
} from '../core/readingRoom';

/** Le code de style du badge (couleurs existantes) pour l'état de la carte. */
const cardTone = (state: string) => state === 'VALIDE' ? 'ACTIF' : state === 'EXPIREE' ? 'EXPIRE' : 'SUSPENDU';

/** L'accueil de la salle : qui est présent, les réservations du jour, les arrivées et les départs. */
export function ReadingRoomDesk({ institutionId }: { institutionId: string }) {
    const { me, readingRoom, epoch } = useSession();
    const mayDesk = can(me, 'READING_ROOM_DESK', { institutionId });
    const [roomId, setRoomId] = useState('');
    const [day, setDay] = useState(todayIso());
    const [revision, setRevision] = useState(0);
    const [reserving, setReserving] = useState(false);
    const [walkIn, setWalkIn] = useState(false);
    const [cancelling, setCancelling] = useState<Reservation | null>(null);
    const action = useAction();
    const roomsQ = useResource<Room[]>(s => readingRoom!.rooms(institutionId, s), `rr-rooms:${institutionId}:${revision}:${epoch}`);
    const rooms = roomsQ.data ?? [];
    const room = rooms.find(r => r.id === roomId) ?? rooms[0];
    const occupancy = useResource<DayOccupancy | null>(s => room ? readingRoom!.occupancy(room.id, day, s) : Promise.resolve(null), `rr-occupancy:${room?.id ?? ''}:${day}:${revision}:${epoch}`);
    const visits = useResource<Visit[]>(s => room ? readingRoom!.visits(institutionId, { roomId: room.id, openOnly: true }, s) : Promise.resolve([]), `rr-visits:${institutionId}:${room?.id ?? ''}:${revision}:${epoch}`);
    const bookings = useResource<Reservation[]>(s => room ? readingRoom!.reservations(institutionId, { roomId: room.id, day }, s) : Promise.resolve([]), `rr-bookings:${institutionId}:${room?.id ?? ''}:${day}:${revision}:${epoch}`);
    const refresh = () => setRevision(n => n + 1);
    const isToday = day === todayIso();

    const arrive = async (r: Reservation) => { if (await action.run({ checkIn: r.id }, key => readingRoom!.checkIn(r.roomId, r.readerId, r.id, key))) refresh(); };
    const leave = async (v: Visit) => { if (await action.run({ checkOut: v.id }, key => readingRoom!.checkOut(v.id, key))) refresh(); };
    const absent = async (r: Reservation) => { if (await action.run({ absent: r.id }, key => readingRoom!.markAbsent(r.id, key))) refresh(); };

    if (roomsQ.loading && !roomsQ.data) return <Busy />;
    if (roomsQ.error) return <ErrorNotice error={roomsQ.error} onRetry={roomsQ.refresh} />;
    if (!room) return <Empty title="Aucune salle de lecture" description="Une personne qui configure la salle doit d’abord en créer une (onglet « Salles »)." icon="archive" />;
    return <div className="panel reading-room-desk" aria-label="Accueil de la salle de lecture" role="region">
        <div className="section-heading"><h3>Accueil</h3>
            {mayDesk && <span className="table-actions">
                <button type="button" className="btn small secondary" onClick={() => setWalkIn(true)} disabled={room.status !== 'OUVERTE'}>Arrivée sans réservation</button>
                <button type="button" className="btn small primary" onClick={() => setReserving(true)} disabled={room.status !== 'OUVERTE'}>Nouvelle réservation</button>
            </span>}
        </div>
        <div className="form-grid panel-padding">
            <Field label="Salle"><select value={room.id} onChange={e => setRoomId(e.target.value)}>{rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
            <Field label="Jour"><input type="date" value={day} onChange={e => setDay(e.target.value || todayIso())} /></Field>
        </div>
        <div className="panel-padding">
            {room.status === 'FERMEE' && <Notice tone="warning">Cette salle est fermée : aucune nouvelle réservation ni arrivée.</Notice>}
            {room.hours && <p><small>Horaires : {room.hours}</small></p>}
            {occupancy.data && <p><strong>{formatDay(occupancy.data.day)}</strong> — {occupancyText(occupancy.data)} <small>(capacité {occupancy.data.capacity} places)</small></p>}
            {action.error ? <ErrorNotice error={action.error} /> : null}
        </div>
        <h4 className="panel-padding">Présents dans la salle</h4>
        {visits.loading && !visits.data ? <Busy /> : visits.error ? <ErrorNotice error={visits.error} onRetry={visits.refresh} />
            : (visits.data ?? []).length === 0 ? <Empty title="Personne dans la salle" icon="check" />
                : <div className="table-scroll"><table><thead><tr><th>Lecteur</th><th>Arrivé à</th><th><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>{(visits.data ?? []).map(v => <tr key={v.id}>
                        <td><strong>{v.readerName}</strong><small className="cell-sub">{v.readerNumber}</small></td>
                        <td>{formatDate(v.arrivedAt)}</td>
                        <td className="table-actions">{mayDesk && <button type="button" className="btn small secondary" disabled={action.busy} onClick={() => leave(v)}>Enregistrer le départ</button>}</td>
                    </tr>)}</tbody></table></div>}
        <h4 className="panel-padding">Réservations du {formatDay(day)}</h4>
        {bookings.loading && !bookings.data ? <Busy /> : bookings.error ? <ErrorNotice error={bookings.error} onRetry={bookings.refresh} />
            : (bookings.data ?? []).length === 0 ? <Empty title="Aucune réservation ce jour" icon="archive" />
                : <div className="table-scroll"><table><thead><tr><th>Lecteur</th><th>Créneau</th><th>État</th><th><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>{(bookings.data ?? []).map(r => <tr key={r.id}>
                        <td><strong>{r.readerName}</strong><small className="cell-sub">{r.readerNumber}</small></td>
                        <td>{SLOT_LABELS[r.slot]}</td>
                        <td><Badge value={r.status} label={RESERVATION_LABELS[r.status]} />{r.cancellationReason && <small className="cell-sub">{r.cancellationReason}</small>}</td>
                        <td className="table-actions">{mayDesk && r.status === 'RESERVEE' && <>
                            {isToday && <button type="button" className="btn small primary" disabled={action.busy} onClick={() => arrive(r)}>Arrivée</button>}
                            {day <= todayIso() && <button type="button" className="btn small secondary" disabled={action.busy} onClick={() => absent(r)}>Non honorée</button>}
                            <button type="button" className="btn small secondary" disabled={action.busy} onClick={() => setCancelling(r)}>Annuler</button>
                        </>}</td>
                    </tr>)}</tbody></table></div>}
        {reserving && <ReserveDialog institutionId={institutionId} rooms={rooms} initialRoomId={room.id} initialDay={day} onClose={() => setReserving(false)} onDone={() => { setReserving(false); refresh(); }} />}
        {walkIn && <WalkInDialog institutionId={institutionId} room={room} onClose={() => setWalkIn(false)} onDone={() => { setWalkIn(false); refresh(); }} />}
        {cancelling && <ReasonPrompt title="Annuler la réservation" subtitle={`${cancelling.readerName} — ${formatDay(cancelling.day)}, ${SLOT_LABELS[cancelling.slot].toLowerCase()}`}
            hint="Dites pourquoi : absence prévenue, doublon, erreur de saisie…" confirm="Annuler la réservation" onClose={() => setCancelling(null)}
            onSubmit={async (reason, key) => { await readingRoom!.cancelReservation(cancelling.id, reason, key); refresh(); }} />}
    </div>;
}

function ReserveDialog({ institutionId, rooms, initialRoomId, initialDay, onClose, onDone }: {
    institutionId: string; rooms: Room[]; initialRoomId: string; initialDay: string; onClose: () => void; onDone: () => void;
}) {
    const { readingRoom, epoch } = useSession();
    const [roomId, setRoomId] = useState(initialRoomId);
    const [readerId, setReaderId] = useState('');
    const [day, setDay] = useState(initialDay < todayIso() ? todayIso() : initialDay);
    const [slot, setSlot] = useState<Slot>('JOURNEE');
    const [attempted, setAttempted] = useState(false);
    const action = useAction();
    const occupancy = useResource<DayOccupancy | null>(s => roomId && day ? readingRoom!.occupancy(roomId, day, s) : Promise.resolve(null), `rr-reserve-occupancy:${roomId}:${day}:${epoch}`);
    const problems = reservationProblems(roomId, readerId, day, slot);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) { setAttempted(true); return; }
        if (await action.run({ roomId, readerId, day, slot }, key => readingRoom!.reserve(roomId, readerId, day, slot, key))) onDone();
    };
    return <Modal title="Nouvelle réservation" subtitle="Une place par créneau, dans la limite de la capacité" onClose={onClose} locked={action.busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Salle *"><select value={roomId} onChange={e => setRoomId(e.target.value)} disabled={action.busy}>{rooms.filter(r => r.status === 'OUVERTE').map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
                <Field label="Jour *"><input type="date" value={day} min={todayIso()} onChange={e => setDay(e.target.value)} disabled={action.busy} /></Field>
                <Field label="Créneau *" hint={occupancy.data ? occupancyText(occupancy.data) : undefined}>
                    <select value={slot} onChange={e => setSlot(e.target.value as Slot)} disabled={action.busy}>
                        {(Object.keys(SLOT_LABELS) as Slot[]).map(s => <option key={s} value={s} disabled={slotFull(occupancy.data, s)}>{SLOT_LABELS[s]}{slotFull(occupancy.data, s) ? ' (complet)' : ''}</option>)}
                    </select></Field>
                <ReaderPicker institutionId={institutionId} value={readerId} onChange={id => setReaderId(id)} disabled={action.busy} />
            </div>
            {attempted && problems.length > 0 && <Notice tone="warning">{problems.join(' ')}</Notice>}
            {action.error ? <ErrorNotice error={action.error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Fermer</button>
                <button type="submit" className="btn primary" disabled={action.busy}>Réserver</button></footer>
        </form>
    </Modal>;
}

function WalkInDialog({ institutionId, room, onClose, onDone }: { institutionId: string; room: Room; onClose: () => void; onDone: () => void }) {
    const { readingRoom } = useSession();
    const [readerId, setReaderId] = useState('');
    const action = useAction();
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!readerId) return;
        if (await action.run({ roomId: room.id, readerId }, key => readingRoom!.checkIn(room.id, readerId, null, key))) onDone();
    };
    return <Modal title="Arrivée sans réservation" subtitle={`${room.name} — dans la limite des places libres`} onClose={onClose} locked={action.busy}>
        <form onSubmit={submit}>
            <ReaderPicker institutionId={institutionId} value={readerId} onChange={id => setReaderId(id)} disabled={action.busy} />
            {action.error ? <ErrorNotice error={action.error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Fermer</button>
                <button type="submit" className="btn primary" disabled={action.busy || !readerId}>Enregistrer l’arrivée</button></footer>
        </form>
    </Modal>;
}

/** Le registre des lecteurs : inscription sur place, carte (renouvellement, suspension), et ce que chacun a fait. */
export function ReadingRoomReaders({ institutionId }: { institutionId: string }) {
    const { me, readingRoom, epoch } = useSession();
    const mayDesk = can(me, 'READING_ROOM_DESK', { institutionId });
    const [text, setText] = useState('');
    const [applied, setApplied] = useState('');
    const [status, setStatus] = useState('');
    const [revision, setRevision] = useState(0);
    const [registering, setRegistering] = useState(false);
    const [opened, setOpened] = useState<string | null>(null);
    const q = useResource<Reader[]>(s => readingRoom!.readers(institutionId, { q: applied || null, status: status || null }, s), `rr-readers:${institutionId}:${applied}:${status}:${revision}:${epoch}`);
    const list = q.data ?? [];
    return <div className="panel" aria-label="Lecteurs de la salle" role="region">
        <div className="section-heading"><h3>Lecteurs</h3>{mayDesk && <button type="button" className="btn small primary" onClick={() => setRegistering(true)}>Inscrire un lecteur</button>}</div>
        <form className="table-toolbar" role="search" onSubmit={e => { e.preventDefault(); setApplied(text.trim()); }}>
            <input aria-label="Chercher un lecteur" placeholder="Nom, prénom ou numéro…" value={text} onChange={e => setText(e.target.value)} />
            <select aria-label="État de la carte" value={status} onChange={e => setStatus(e.target.value)}>
                <option value="">Toutes les cartes</option><option value="ACTIF">Actives</option><option value="SUSPENDU">Suspendues</option></select>
            <button type="submit" className="btn small secondary">Chercher</button>
        </form>
        {q.loading && !q.data ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} />
            : list.length === 0 ? <Empty title="Aucun lecteur" description="Aucun lecteur ne correspond à cette recherche." icon="users" />
                : <div className="table-scroll"><table><thead><tr><th>Lecteur</th><th>Objet de la recherche</th><th>Carte</th><th>Valable jusqu’au</th><th><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>{list.map(r => <tr key={r.id}>
                        <td><strong>{readerName(r)}</strong><small className="cell-sub">{r.number}</small></td>
                        <td>{r.researchTopic}</td>
                        <td><Badge value={cardTone(r.cardState)} label={CARD_LABELS[r.cardState]} /></td>
                        <td>{formatDay(r.cardValidUntil)}</td>
                        <td className="table-actions"><button type="button" className="btn small secondary" onClick={() => setOpened(r.id)}>Ouvrir</button></td>
                    </tr>)}</tbody></table></div>}
        {registering && <RegistrationDialog institutionId={institutionId} onClose={() => setRegistering(false)} onDone={r => { setRegistering(false); setRevision(n => n + 1); setOpened(r.id); }} />}
        {opened && <ReaderDialog id={opened} institutionId={institutionId} onClose={() => setOpened(null)} onChanged={() => setRevision(n => n + 1)} />}
    </div>;
}

function RegistrationDialog({ institutionId, onClose, onDone }: { institutionId: string; onClose: () => void; onDone: (reader: Reader) => void }) {
    const { readingRoom } = useSession();
    const [form, setForm] = useState(() => emptyRegistration());
    const [attempted, setAttempted] = useState(false);
    const action = useAction();
    const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm(prev => ({ ...prev, [key]: value }));
    const problems = registrationProblems(form);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) { setAttempted(true); return; }
        const body = registrationBody(institutionId, form);
        const created = await action.run(body, key => readingRoom!.register(body, key));
        if (created) onDone(created);
    };
    return <Modal wide title="Inscrire un lecteur" subtitle="Le numéro de la pièce n’est jamais conservé en entier : seuls ses quatre derniers caractères le sont" onClose={onClose} locked={action.busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Nom *"><input value={form.lastName} onChange={e => set('lastName', e.target.value)} maxLength={150} disabled={action.busy} /></Field>
                <Field label="Prénom *"><input value={form.firstName} onChange={e => set('firstName', e.target.value)} maxLength={150} disabled={action.busy} /></Field>
                <Field label="Date de naissance"><input type="date" value={form.birthDate} onChange={e => set('birthDate', e.target.value)} disabled={action.busy} /></Field>
                <Field label="Organisme"><input value={form.organization} onChange={e => set('organization', e.target.value)} maxLength={200} disabled={action.busy} /></Field>
                <Field label="Téléphone"><input value={form.phone} onChange={e => set('phone', e.target.value)} maxLength={40} disabled={action.busy} /></Field>
                <Field label="Adresse électronique"><input type="email" value={form.email} onChange={e => set('email', e.target.value)} maxLength={254} disabled={action.busy} /></Field>
                <Field label="Adresse" wide><input value={form.address} onChange={e => set('address', e.target.value)} maxLength={500} disabled={action.busy} /></Field>
                <Field label="Objet de la recherche *" wide hint="Le sujet pour lequel le lecteur vient consulter les documents."><textarea value={form.researchTopic} onChange={e => set('researchTopic', e.target.value)} rows={2} maxLength={2000} disabled={action.busy} /></Field>
                <Field label="Pièce présentée *"><select value={form.pieceType} onChange={e => set('pieceType', e.target.value)} disabled={action.busy}>
                    <option value="">Choisir…</option>{Object.entries(PIECE_LABELS).map(([code, text]) => <option key={code} value={code}>{text}</option>)}</select></Field>
                <Field label="Numéro de la pièce *" hint="Saisi pour vérification, jamais conservé en entier."><input value={form.pieceNumber} onChange={e => set('pieceNumber', e.target.value)} maxLength={60} autoComplete="off" disabled={action.busy} /></Field>
                <Field label="Version du règlement accepté *" hint="La référence du règlement de la salle que le lecteur a lu."><input value={form.regulationVersion} onChange={e => set('regulationVersion', e.target.value)} maxLength={40} disabled={action.busy} /></Field>
                <Field label="Carte valable jusqu’au *" hint={`Au plus ${MAX_CARD_YEARS} ans.`}><input type="date" value={form.cardValidUntil} min={todayIso()} max={addYears(todayIso(), MAX_CARD_YEARS)} onChange={e => set('cardValidUntil', e.target.value)} disabled={action.busy} /></Field>
                <Field label="Règlement" wide><label className="check-row"><input type="checkbox" checked={form.regulationAccepted} onChange={e => set('regulationAccepted', e.target.checked)} disabled={action.busy} /> Le lecteur a pris connaissance du règlement de la salle et l’accepte.</label></Field>
            </div>
            {attempted && problems.length > 0 && <Notice tone="warning"><ul>{problems.map(p => <li key={p}>{p}</li>)}</ul></Notice>}
            {action.error ? <ErrorNotice error={action.error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Fermer</button>
                <button type="submit" className="btn primary" disabled={action.busy}>Inscrire</button></footer>
        </form>
    </Modal>;
}

export function ReaderContactDialog({ reader, onClose, onDone }: { reader: Reader; onClose: () => void; onDone: () => void }) {
    const { readingRoom } = useSession();
    const [form, setForm] = useState(() => ({
        address: reader.address ?? '', phone: reader.phone ?? '', email: reader.email ?? '',
        organization: reader.organization ?? '', researchTopic: reader.researchTopic,
    }));
    const action = useAction();
    const set = (key: keyof typeof form, value: string) => setForm(previous => ({ ...previous, [key]: value }));
    const valid = form.researchTopic.trim().length >= 5;
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!valid || action.busy) return;
        // Le serveur remplace tous ces champs : transmettre aussi les coordonnées inchangées.
        const body = { address: form.address.trim() || null, phone: form.phone.trim() || null, email: form.email.trim() || null,
            organization: form.organization.trim() || null, researchTopic: form.researchTopic.trim() };
        if (await action.run({ id: reader.id, ...body }, key => readingRoom!.updateReader(reader.id, body, key))) onDone();
    };
    return <Modal title="Modifier les coordonnées" subtitle={readerName(reader)} onClose={onClose} locked={action.busy}>
        <form onSubmit={submit}><div className="form-grid">
            <Field label="Adresse" wide><input value={form.address} onChange={e => set('address', e.target.value)} maxLength={500} disabled={action.busy} /></Field>
            <Field label="Téléphone"><input value={form.phone} onChange={e => set('phone', e.target.value)} maxLength={40} disabled={action.busy} /></Field>
            <Field label="Adresse électronique"><input type="email" value={form.email} onChange={e => set('email', e.target.value)} maxLength={254} disabled={action.busy} /></Field>
            <Field label="Organisme"><input value={form.organization} onChange={e => set('organization', e.target.value)} maxLength={200} disabled={action.busy} /></Field>
            <Field label="Objet de la recherche *" wide hint="De 5 à 2000 caractères."><textarea value={form.researchTopic} onChange={e => set('researchTopic', e.target.value)} minLength={5} maxLength={2000} required disabled={action.busy} /></Field>
        </div>{action.error ? <ErrorNotice error={action.error} /> : null}
        <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Annuler</button>
            <button type="submit" className="btn primary" disabled={action.busy || !valid}>Enregistrer les coordonnées</button></footer></form>
    </Modal>;
}

function ReaderDialog({ id, institutionId, onClose, onChanged }: { id: string; institutionId: string; onClose: () => void; onChanged: () => void }) {
    const { me, readingRoom, epoch } = useSession();
    const mayManage = can(me, 'READING_ROOM_MANAGE', { institutionId });
    const [revision, setRevision] = useState(0);
    const [suspending, setSuspending] = useState(false);
    const mayEdit = can(me, 'READING_ROOM_DESK', { institutionId });
    const [editing, setEditing] = useState(false);
    const [renewing, setRenewing] = useState(false);
    const [until, setUntil] = useState(addYears(todayIso(), 1));
    const action = useAction();
    const q = useResource<ReaderDetail>(s => readingRoom!.reader(id, s), `rr-reader:${id}:${revision}:${epoch}`);
    const changed = () => { setRevision(n => n + 1); onChanged(); };
    const d = q.data;
    const reinstate = async () => { if (await action.run({ reinstate: id }, key => readingRoom!.reinstateReader(id, key))) changed(); };
    const renew = async () => { if (await action.run({ renew: id, until }, key => readingRoom!.renewCard(id, until, key))) { setRenewing(false); changed(); } };
    return <Modal wide title={d ? readerName(d.reader) : 'Lecteur'} subtitle={d ? `${d.reader.number} — ${CARD_LABELS[d.reader.cardState]}` : undefined} onClose={onClose} locked={action.busy}>
        {q.loading && !d ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : d && <>
            {d.reader.cardState === 'SUSPENDUE' && <Notice tone="warning">Carte suspendue : {d.reader.suspensionReason}</Notice>}
            {d.reader.cardState === 'EXPIREE' && <Notice tone="warning">La carte est expirée depuis le {formatDay(d.reader.cardValidUntil)} : elle doit être renouvelée avant toute réservation.</Notice>}
            {d.presentRoomName && <Notice>Présent dans la salle « {d.presentRoomName} ».{d.holding > 0 ? ` ${d.holding} document(s) entre ses mains.` : ''}</Notice>}
            <dl className="preservation-summary">
                <div><dt>Objet de la recherche</dt><dd>{d.reader.researchTopic}</dd></div>
                <div><dt>Pièce présentée</dt><dd>{pieceText(d.reader.pieceType, d.reader.pieceEnd)}</dd></div>
                <div><dt>Règlement accepté</dt><dd>{d.reader.regulationVersion}, le {formatDay(d.reader.regulationAcceptedOn)}</dd></div>
                <div><dt>Carte valable jusqu’au</dt><dd>{formatDay(d.reader.cardValidUntil)}</dd></div>
                {d.reader.organization && <div><dt>Organisme</dt><dd>{d.reader.organization}</dd></div>}
                {d.reader.phone && <div><dt>Téléphone</dt><dd>{d.reader.phone}</dd></div>}
                {d.reader.email && <div><dt>Adresse électronique</dt><dd>{d.reader.email}</dd></div>}
                {d.reader.address && <div><dt>Adresse</dt><dd>{d.reader.address}</dd></div>}
                <div><dt>Visites</dt><dd>{d.visits}</dd></div>
                <div><dt>Réservations</dt><dd>{d.reservations}</dd></div>
                <div><dt>Bulletins de communication</dt><dd>{d.slips}</dd></div>
                <div><dt>Commandes de reproduction</dt><dd>{d.orders}</dd></div>
                <div><dt>Inscrit le</dt><dd>{formatDate(d.reader.registeredAt)}</dd></div>
            </dl>
            {action.error ? <ErrorNotice error={action.error} /> : null}
            {mayEdit && <button type="button" className="btn secondary" disabled={action.busy} onClick={() => setEditing(true)}>Modifier les coordonnées</button>}
            {mayManage && <footer className="modal-footer">
                {d.reader.status === 'SUSPENDU' ? <button type="button" className="btn secondary" disabled={action.busy} onClick={reinstate}>Lever la suspension</button>
                    : <button type="button" className="btn danger" disabled={action.busy} onClick={() => setSuspending(true)}>Suspendre la carte</button>}
                <button type="button" className="btn primary" disabled={action.busy} onClick={() => setRenewing(true)}>Renouveler la carte</button>
            </footer>}
            {editing && <ReaderContactDialog reader={d.reader} onClose={() => setEditing(false)} onDone={() => { setEditing(false); changed(); }} />}
            {renewing && <Modal title="Renouveler la carte" subtitle={`Validité actuelle : ${formatDay(d.reader.cardValidUntil)}`} onClose={() => setRenewing(false)} locked={action.busy}>
                <Field label="Nouvelle validité *" hint="Au-delà de la validité actuelle, dix ans au plus."><input type="date" value={until} min={todayIso()} max={addYears(todayIso(), MAX_CARD_YEARS)} onChange={e => setUntil(e.target.value)} /></Field>
                <footer className="modal-footer"><button type="button" className="btn secondary" onClick={() => setRenewing(false)} disabled={action.busy}>Renoncer</button>
                    <button type="button" className="btn primary" onClick={renew} disabled={action.busy || until <= d.reader.cardValidUntil}>Renouveler</button></footer>
            </Modal>}
            {suspending && <ReasonPrompt title="Suspendre la carte" subtitle={readerName(d.reader)} hint="Les réservations à venir de ce lecteur seront annulées."
                confirm="Suspendre" onClose={() => setSuspending(false)} onSubmit={async (reason, key) => { await readingRoom!.suspendReader(id, reason, key); changed(); }} />}
        </>}
    </Modal>;
}

/** Les salles : nom, capacité, horaires, ouverture. Réservé à la personne qui configure la salle pour modifier. */
export function ReadingRoomRooms({ institutionId }: { institutionId: string }) {
    const { me, readingRoom, epoch } = useSession();
    const mayManage = can(me, 'READING_ROOM_MANAGE', { institutionId });
    const [revision, setRevision] = useState(0);
    const [editing, setEditing] = useState<Room | 'new' | null>(null);
    const action = useAction();
    const q = useResource<Room[]>(s => readingRoom!.rooms(institutionId, s), `rr-rooms-admin:${institutionId}:${revision}:${epoch}`);
    const list = q.data ?? [];
    const toggle = async (room: Room) => {
        const done = await action.run({ toggle: room.id, to: room.status }, key => room.status === 'OUVERTE' ? readingRoom!.closeRoom(room.id, key) : readingRoom!.openRoom(room.id, key));
        if (done) setRevision(n => n + 1);
    };
    return <div className="panel" aria-label="Salles de lecture" role="region">
        <div className="section-heading"><h3>Salles</h3>{mayManage && <button type="button" className="btn small primary" onClick={() => setEditing('new')}>Nouvelle salle</button>}</div>
        {action.error ? <ErrorNotice error={action.error} /> : null}
        {q.loading && !q.data ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} />
            : list.length === 0 ? <Empty title="Aucune salle" description="Créez la salle de lecture de l’institution : son nom, sa capacité et ses horaires." icon="archive" />
                : <div className="table-scroll"><table><thead><tr><th>Salle</th><th>Capacité</th><th>Horaires</th><th>État</th><th><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>{list.map(r => <tr key={r.id}>
                        <td><strong>{r.name}</strong><small className="cell-sub">{r.code}</small></td>
                        <td>{r.capacity} places</td>
                        <td>{r.hours ?? '—'}</td>
                        <td><Badge value={r.status} label={ROOM_LABELS[r.status]} /></td>
                        <td className="table-actions">{mayManage && <>
                            <button type="button" className="btn small secondary" onClick={() => setEditing(r)}>Modifier</button>
                            <button type="button" className="btn small secondary" disabled={action.busy} onClick={() => toggle(r)}>{r.status === 'OUVERTE' ? 'Fermer' : 'Rouvrir'}</button>
                        </>}</td>
                    </tr>)}</tbody></table></div>}
        {editing && <RoomDialog room={editing === 'new' ? null : editing} institutionId={institutionId} onClose={() => setEditing(null)} onDone={() => { setEditing(null); setRevision(n => n + 1); }} />}
    </div>;
}

function RoomDialog({ room, institutionId, onClose, onDone }: { room: Room | null; institutionId: string; onClose: () => void; onDone: () => void }) {
    const { readingRoom } = useSession();
    const [code, setCode] = useState(room?.code ?? '');
    const [name, setName] = useState(room?.name ?? '');
    const [capacity, setCapacity] = useState(room ? String(room.capacity) : '');
    const [hours, setHours] = useState(room?.hours ?? '');
    const [attempted, setAttempted] = useState(false);
    const action = useAction();
    const problems = roomProblems(code, name, capacity, !room);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) { setAttempted(true); return; }
        const body = { institutionId, code: code.trim(), name: name.trim(), capacity: Number(capacity), hours: hours.trim() || null };
        const done = await action.run(body, key => room ? readingRoom!.updateRoom(room.id, { name: body.name, capacity: body.capacity, hours: body.hours }, key) : readingRoom!.createRoom(body, key));
        if (done) onDone();
    };
    return <Modal title={room ? 'Modifier la salle' : 'Nouvelle salle'} onClose={onClose} locked={action.busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                {!room && <Field label="Code *" hint="Court et stable : SALLE-1."><input value={code} onChange={e => setCode(e.target.value)} maxLength={40} disabled={action.busy} /></Field>}
                <Field label="Nom *"><input value={name} onChange={e => setName(e.target.value)} maxLength={200} disabled={action.busy} /></Field>
                <Field label="Capacité (places) *"><input inputMode="numeric" value={capacity} onChange={e => setCapacity(e.target.value)} disabled={action.busy} /></Field>
                <Field label="Horaires" wide><input value={hours} onChange={e => setHours(e.target.value)} maxLength={500} disabled={action.busy} /></Field>
            </div>
            {attempted && problems.length > 0 && <Notice tone="warning"><ul>{problems.map(p => <li key={p}>{p}</li>)}</ul></Notice>}
            {action.error ? <ErrorNotice error={action.error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Fermer</button>
                <button type="submit" className="btn primary" disabled={action.busy}>Enregistrer</button></footer>
        </form>
    </Modal>;
}
