import { RESERVATION_LABELS, SLOT_LABELS } from '../core/readingRoom';
import { formatDate } from './components';
import React from 'react';
import { useSession } from '../auth/session';
import { can } from '../core/policy';
import { useQuerySelection } from './useQuerySelection';
import { Busy, ErrorNotice, Modal, useResource } from './components';
import { SlipDialog } from './ReadingRoomSlips';
import { OrderDialog } from './ReadingRoomOrders';
import { MailStatusPanel } from './MailMonitoring';

export function NotificationTarget() {
    const { me, readingRoom, epoch } = useSession();
    const [reservation, setReservation] = useQuerySelection('reservation');
    const [slip, setSlip] = useQuerySelection('bulletin');
    const [order, setOrder] = useQuerySelection('reproduction');
    const [mail, setMail] = useQuerySelection('courrier');
    const q = useResource(s => reservation ? readingRoom!.reservation(reservation, s) : Promise.resolve(null), 'notification-reservation:' + reservation + ':' + epoch);
    const mailAllowed = ['PORTAL_READ','PORTAL_READER_MANAGE','PRESERVATION_BACKUP_READ'].some(code => can(me, code, {}));
    if (slip) return <SlipDialog key={slip} id={slip} institutionId="" onClose={() => setSlip(null)} onChanged={() => {}}/>;
    if (order) return <OrderDialog key={order} id={order} institutionId="" onClose={() => setOrder(null)} onChanged={() => {}}/>;
    if (mail) return <Modal title="État du courrier sortant" onClose={() => setMail(null)}>{mailAllowed ? <MailStatusPanel/> : <p>Cette information exige une habilitation de surveillance du courrier.</p>}</Modal>;
    if (!reservation) return null;
    return <Modal title="Réservation de salle de lecture" onClose={() => setReservation(null)}>
        {q.loading ? <Busy/> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh}/> : q.data && <dl>
            <dt>Lecteur</dt><dd>{q.data.readerName} · {q.data.readerNumber}</dd><dt>Salle</dt><dd>{q.data.roomName}</dd>
            <dt>Jour</dt><dd>{formatDate(q.data.day)}</dd><dt>Créneau</dt><dd>{SLOT_LABELS[q.data.slot]}</dd><dt>État</dt><dd>{RESERVATION_LABELS[q.data.status]}</dd>
        </dl>}
    </Modal>;
}
