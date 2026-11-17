import React from 'react';
import type { ClosureNotification } from '../core/readingRoom';
import { formatDate } from './components';

const labels: Record<string,string> = {
    A_NOTIFIER: 'Alerte à préparer', ADRESSE_A_COMPLETER: 'Adresse e-mail à compléter', ADRESSE_MODIFIEE: 'Adresse modifiée : alerte à reprendre',
    SMTP_DESACTIVE: 'En attente d’activation du courrier', A_PREPARER: 'Alerte programmée', A_ENVOYER: 'E-mail en attente d’envoi',
    ENVOYE: 'E-mail envoyé', ECHEC: 'Échec d’envoi', CADUQUE: 'Alerte devenue caduque'
};
export function RoomClosureNotification({ notice, mayDesk, busy, onRetry, onContact }: { notice: ClosureNotification | null | undefined; mayDesk: boolean; busy: boolean; onRetry: () => void; onContact: () => void }) {
    if (!notice) return <span>—</span>;
    return <div><span>{labels[notice.state] ?? 'État de l’alerte indisponible'}</span>
        {notice.recipient && <small className="cell-sub">{notice.recipient}</small>}
        {notice.sentAt && <small className="cell-sub">{formatDate(notice.sentAt)}</small>}
        {mayDesk && notice.state === 'ADRESSE_A_COMPLETER' && <button type="button" className="btn small secondary" disabled={busy} onClick={onContact}>Coordonnées du lecteur</button>}
        {mayDesk && ['A_NOTIFIER','ADRESSE_MODIFIEE','ECHEC'].includes(notice.state) && <button type="button" className="btn small secondary" disabled={busy} onClick={onRetry}>Reprendre l’alerte</button>}
    </div>;
}
