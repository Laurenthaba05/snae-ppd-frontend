import React, { useEffect, useRef, useState } from 'react';
import type { PublicDocumentsApi } from '../api/publicDocuments';
import { DocumentPaymentsApi, testCheckoutUrl, type DocumentPayment, type DocumentPaymentProvider } from '../api/documentPayments';
import { Busy, ErrorNotice, Notice, formatDate, useResource } from '../ui/components';
import { usePortal } from './context';
const defaultPayments = new DocumentPaymentsApi();
const labels = { EN_ATTENTE: 'En attente de confirmation', CONFIRME: 'Paiement confirmé par le serveur', ANNULE: 'Paiement refusé ou annulé', REMBOURSE: 'Paiement remboursé — accès retiré' };

function isExpired(payment: DocumentPayment) { return payment.status === 'CONFIRME' && payment.validUntil !== null && Date.parse(payment.validUntil) <= Date.now(); }
function isCurrent(payment: DocumentPayment) { return payment.status === 'CONFIRME' && payment.validUntil !== null && Date.parse(payment.validUntil) > Date.now(); }

export function DocumentPaymentPanel({ client, id, reader, onConfirmed, payments = defaultPayments, renewal = false }: {
    client: PublicDocumentsApi; id: string; reader: boolean; onConfirmed: () => void; payments?: DocumentPaymentsApi; renewal?: boolean;
}) {
    const offer = useResource(s => client.offer(id, s), 'document-offer:' + id);
    const latest = useResource(s => reader ? payments.latest(id, s) : Promise.resolve({ payment: null }), 'document-payment:' + id + ':' + reader);
    const [payment, setPayment] = useState<DocumentPayment | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const keys = useRef<Partial<Record<DocumentPaymentProvider, string>>>({});
    const portal = usePortal();
    useEffect(() => { if (latest.data) setPayment(latest.data.payment); }, [latest.data]);
    useEffect(() => { if (error) portal?.expired(error); if (latest.error) portal?.expired(latest.error); }, [error, latest.error, portal]);
    // The server rechecks the actual access. A displayed date never grants reading rights.
    function received(next: DocumentPayment) {
        setPayment(next);
        if (next.status === 'ANNULE' || next.status === 'REMBOURSE' || isExpired(next)) delete keys.current[next.provider];
        if (isCurrent(next)) onConfirmed();
    }
    async function start(provider: DocumentPaymentProvider) {
        setBusy(true); setError(null);
        keys.current[provider] ??= crypto.randomUUID();
        try { received(await payments.start(id, provider, keys.current[provider]!)); }
        catch (e) { setError(e); } finally { setBusy(false); }
    }
    async function verify() {
        if (!payment) return;
        setBusy(true); setError(null);
        try {
            received(await payments.refresh(payment.id));
        } catch (e) { setError(e); } finally { setBusy(false); }
    }
    const checkout = payment && testCheckoutUrl(payment);
    const expired = payment !== null && isExpired(payment);
    return <section aria-label={renewal ? "Renouveler l’accès au document" : "Tarif et paiement en ligne"}>
        {renewal && <p>Votre accès a expiré. Un nouveau paiement confirmé ouvrira une nouvelle période de lecture à compter de sa confirmation, au tarif actuellement publié. L’ancien achat reste dans votre historique.</p>}
        <h3>Tarif fixé par la Direction des Archives nationales</h3>
        {offer.loading ? <Busy /> : offer.error ? <ErrorNotice error={offer.error} onRetry={offer.refresh} /> : offer.data && <>
            {offer.data.mode === 'LOCAL_TEST' && <Notice tone="warning">Essai local isolé : aucun argent n’est débité. Les comptes marchands Orange Money et PayCard ne sont pas encore raccordés.</Notice>}
            {offer.data.tariff ? <p>{offer.data.tariff.typeLabel} : {new Intl.NumberFormat('fr-GN').format(offer.data.tariff.amountGnf)} GNF pour {offer.data.tariff.durationDays} jour(s) de lecture de ce document.</p>
                : <p>Le tarif de ce type de document n’a pas encore été publié par la direction.</p>}
            <p>La lecture intégrale sera ouverte après confirmation du paiement en ligne. Aucun téléchargement.</p>
            <ul>{offer.data.providers.map(provider => <li key={provider.code}>
                <button className="btn secondary" disabled={!reader || !provider.available || !offer.data?.tariff || busy || latest.loading || !!latest.error || payment?.status === 'EN_ATTENTE' || (payment?.status === 'CONFIRME' && !expired)}
                    onClick={() => start(provider.code as DocumentPaymentProvider)}>{renewal ? 'Renouveler avec ' : 'Payer avec '}{provider.label}</button>
                {!provider.available && <p>{provider.reason || 'Le paiement est actuellement indisponible.'}</p>}
            </li>)}</ul>
        </>}
        {latest.error != null && <ErrorNotice error={latest.error} onRetry={latest.refresh} />}
        {error != null && <ErrorNotice error={error} />}
        {payment && <div role="status">
            <p><strong>{expired ? 'Ancien paiement confirmé — accès expiré' : labels[payment.status]}</strong></p>
            <p>Commande : {payment.id} · {payment.amountGnf} {payment.currency}</p>
            {payment.validUntil && <p>{expired ? 'Accès terminé le ' : 'Fin d’accès : '}<time dateTime={payment.validUntil}>{formatDate(payment.validUntil)}</time></p>}
            {checkout && <p><a className="btn primary" href={checkout} target="_blank" rel="noopener noreferrer">Ouvrir le simulateur de paiement</a></p>}
            <button className="btn secondary" disabled={busy} onClick={verify}>{busy ? 'Vérification…' : 'Vérifier la confirmation du paiement'}</button>
        </div>}
    </section>;
}
