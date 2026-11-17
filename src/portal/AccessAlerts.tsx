import React, { useEffect } from 'react';
import { DocumentPaymentsApi, type ReaderDocumentPayment } from '../api/documentPayments';
import { Busy, ErrorNotice, Notice } from '../ui/components';
import { PLink } from './Shell';
import { usePortal } from './context';
import { useReaderPayments } from './useReaderPayments';

const defaultClient = new DocumentPaymentsApi();
export function AccessExpiryNotice({item}: {item: ReaderDocumentPayment}) {
    if (item.accessAlert === 'EXPIRING_SOON' && item.canRead) return <Notice tone="warning">Votre accès expire dans les sept prochains jours. Vous pouvez encore lire ce document jusqu’à l’échéance indiquée. Le renouvellement sera disponible après expiration.</Notice>;
    if (item.accessAlert === 'EXPIRED' && item.accessStatus === 'EXPIRE' && item.documentAvailable) return <Notice tone="warning">Votre accès a expiré. Pour reprendre la lecture intégrale, renouvelez-le avec un nouveau paiement confirmé. L’aperçu gratuit reste disponible, sans téléchargement.</Notice>;
    return null;
}
export function AccessAlertsSummary({client = defaultClient}: {client?: DocumentPaymentsApi}) {
    const {reader, expired} = usePortal();
    const result = useReaderPayments(client, reader?.id ?? '', 'alerts', 0);
    useEffect(() => { if (result.error) expired(result.error); }, [result.error, expired]);
    return <section className="portal-section" aria-label="Alertes de mes accès">
        <h2>Alertes de mes accès</h2>
        {result.loading ? <Busy label="Vérification des échéances…" /> : result.error ? <ErrorNotice error={result.error} onRetry={result.refresh} /> : result.data && <>
            {result.data.items.length ? <Notice tone="warning">Des accès arrivent à échéance dans les sept prochains jours ou sont déjà expirés. Consultez les dates et les possibilités de renouvellement.</Notice>
                : <p>Aucun accès expiré ou arrivant à échéance dans les sept prochains jours.</p>}
            <PLink to="/alertes-acces" className="btn secondary small">Voir mes alertes d’accès</PLink>
        </>}
    </section>;
}
