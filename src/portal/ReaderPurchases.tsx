import React, { useEffect, useState } from 'react';
import { PublicDocumentsApi } from '../api/publicDocuments';
import { DocumentPaymentPanel } from './DocumentPaymentPanel';
import { DocumentPaymentsApi, type ReaderDocumentPayment } from '../api/documentPayments';
import { Badge, Busy, ErrorNotice, Field, Notice, Pagination, formatDate } from '../ui/components';
import { PLink, RequireReader } from './Shell';
import { useAction, usePortal } from './context';
import { useReaderPayments } from './useReaderPayments';
import { AccessExpiryNotice } from './AccessAlerts';

const defaultApi = new DocumentPaymentsApi();
const defaultDocuments = new PublicDocumentsApi();
const paymentLabels: Record<string, string> = { EN_ATTENTE: 'En attente de confirmation', CONFIRME: 'Confirmé', ANNULE: 'Refusé ou annulé', REMBOURSE: 'Remboursé' };
const accessLabels: Record<string, string> = { EN_COURS: 'Accès en cours', EXPIRE: 'Accès expiré', REMBOURSE: 'Accès retiré après remboursement', ANNULE: 'Aucun accès accordé', NON_CONFIRME: 'Paiement non confirmé', INDISPONIBLE: 'Document indisponible à la lecture', A_VENIR: 'Accès à venir' };
const providers: Record<string, string> = { ORANGE_MONEY: 'Orange Money', PAYCARD: 'PayCard' };
function DateValue({ value }: { value: string | null }) { return value ? <time dateTime={value}>{formatDate(value)}</time> : <>—</>; }

function PaymentCard({ item, purchased, client, documents, onRefresh, openRenewal = false }: { openRenewal?: boolean; item: ReaderDocumentPayment; purchased: boolean; client: DocumentPaymentsApi; documents: PublicDocumentsApi; onRefresh: () => void }) {
    const [renewing, setRenewing] = useState(openRenewal);
    const canRenew = purchased && item.accessStatus === 'EXPIRE' && item.documentAvailable && !item.canRead;
    const action = useAction();
    return <article className={'portal-subscription tone-' + (item.canRead ? 'ok' : 'warn')} aria-label={item.documentTitle}>
        <header style={{ alignItems: 'flex-start' }}><div><h2>{item.documentTitle}</h2>{item.documentReference && <p className="portal-meta">{item.documentReference}</p>}</div>
            <Badge value={purchased ? item.accessStatus : item.status} label={(purchased ? accessLabels[item.accessStatus] : paymentLabels[item.status]) ?? item.status} /></header>
        <dl className="portal-fields">
            {!purchased && <>
                <div><dt>Commande</dt><dd className="mono">{item.id}</dd></div>
                <div><dt>Demandée le</dt><dd><DateValue value={item.createdAt} /></dd></div>
                <div><dt>Montant</dt><dd>{new Intl.NumberFormat('fr-GN').format(item.amountGnf)} {item.currency}</dd></div>
                <div><dt>Moyen de paiement</dt><dd>{providers[item.provider] ?? item.provider}</dd></div>
            </>}
            <div><dt>Début d’accès</dt><dd>{item.validFrom ? <DateValue value={item.validFrom} /> : 'Accès non ouvert'}</dd></div>
            <div><dt>{item.status === 'REMBOURSE' ? 'Fin initialement prévue' : 'Fin d’accès'}</dt><dd><strong><DateValue value={item.validUntil} /></strong></dd></div>
        </dl>
        {purchased && <AccessExpiryNotice item={item} />}
        {!purchased && <p>{accessLabels[item.accessStatus] ?? item.accessStatus}</p>}
        {item.status === 'REMBOURSE' && <p>Le remboursement a retiré le droit de lecture, même si la date de fin initiale n’est pas atteinte.</p>}
        <div className="portal-actions">
            {canRenew && <button className="btn primary small" aria-expanded={renewing} aria-controls={'renewal-' + item.id} onClick={() => setRenewing(!renewing)}>{renewing ? 'Fermer le renouvellement' : 'Renouveler l’accès'}</button>}
            {item.canRead && <PLink to={'/documents/' + item.documentId} className="btn primary small">Lire le document</PLink>}
            {!item.canRead && item.documentAvailable && <PLink to={'/documents/' + item.documentId} className="btn secondary small">Voir l’aperçu gratuit</PLink>}
            {!purchased && item.status === 'EN_ATTENTE' && <button className="btn secondary small" disabled={action.busy} onClick={() => void action.run(async () => { await client.refresh(item.id); onRefresh(); })}>
                {action.busy ? 'Vérification…' : 'Vérifier le paiement'}</button>}
        </div>
        {canRenew && renewing && <div id={'renewal-' + item.id}>
            <DocumentPaymentPanel client={documents} id={item.documentId} reader payments={client} renewal onConfirmed={onRefresh} />
        </div>}
        {action.error !== null && <ErrorNotice error={action.error} />}
    </article>;
}

function PurchasesContent({ purchased, client, documents = defaultDocuments, alerts = false, documentId = '' }: { documentId?: string; purchased: boolean; client: DocumentPaymentsApi; documents?: PublicDocumentsApi; alerts?: boolean }) {
    const { reader, expired } = usePortal();
    const [page, setPage] = useState(0);
    const [status, setStatus] = useState('');
    const result = useReaderPayments(client, reader?.id ?? '', alerts ? 'alerts' : purchased ? 'purchased' : 'history', page, status, documentId);
    useEffect(() => { if (result.error) expired(result.error); }, [result.error, expired]);
    return <div className="portal-page">
        <h1>{documentId ? 'Mon accès au document' : alerts ? 'Mes alertes d’accès' : purchased ? 'Mes documents achetés' : 'Mes paiements'}</h1>
        <p>{alerts ? 'Les accès qui expirent dans les sept prochains jours et les accès déjà expirés sont regroupés ici. Après expiration, un nouveau paiement confirmé est nécessaire pour renouveler.' : purchased ? 'Retrouvez vos documents et la date de fin de chaque accès. Les accès expirés ou remboursés restent visibles.' : 'Consultez vos commandes de lecture et leur état de paiement.'}</p>
        <p>Lecture à l’écran uniquement, sans téléchargement. Les dates sont indiquées en UTC, heure de Conakry.</p>
        <div className="portal-actions"><PLink to={alerts ? "/achats" : "/alertes-acces"} className="btn secondary small">{alerts ? "Tous mes documents achetés" : "Mes alertes d’accès"}</PLink><PLink to={purchased ? '/paiements' : '/achats'} className="btn secondary small">{purchased ? 'Historique des paiements' : 'Mes documents achetés'}</PLink><PLink to="/compte" className="btn secondary small">Mon compte</PLink></div>
        {!purchased && <Field label="État du paiement"><select value={status} onChange={e => { setPage(0); setStatus(e.target.value); }}><option value="">Tous les paiements</option>
            {Object.entries(paymentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>}
        <p><button className="btn secondary small" disabled={result.loading} onClick={result.refresh}>Actualiser</button></p>
        {result.loading ? <Busy /> : result.error ? <ErrorNotice error={result.error} onRetry={result.refresh} /> : result.data && <>
            {result.data.mode === 'LOCAL_TEST' && <Notice tone="warning">Recette locale : ces paiements et ces accès sont simulés. Aucun argent réel n’a été débité.</Notice>}
            {!result.data.items.length && <Notice>{documentId ? 'Aucun achat de ce document n’est rattaché à ce compte lecteur.' : alerts ? 'Aucun accès expiré ou arrivant à échéance dans les sept prochains jours.' : purchased ? 'Vous n’avez aucun document acheté pour le moment.' : status ? 'Aucun paiement ne correspond à cet état.' : 'Vous n’avez aucun paiement pour le moment.'}</Notice>}
            <div className="portal-subscriptions">{result.data.items.map(item => <PaymentCard openRenewal={!!documentId} key={item.id} item={item} purchased={purchased} client={client} documents={documents} onRefresh={result.refresh} />)}</div>
            <Pagination page={page} hasMore={result.data.hasMore} count={result.data.items.length} onChange={setPage} />
        </>}
    </div>;
}
export function ReaderPaymentsPage({ client = defaultApi }: { client?: DocumentPaymentsApi }) { return <RequireReader><PurchasesContent purchased={false} client={client} /></RequireReader>; }
export function ReaderPurchasesPage({ client = defaultApi, documents = defaultDocuments }: { client?: DocumentPaymentsApi; documents?: PublicDocumentsApi }) { return <RequireReader><PurchasesContent purchased client={client} documents={documents} /></RequireReader>; }

export function ReaderAccessAlertsPage({ client = defaultApi, documents = defaultDocuments }: { client?: DocumentPaymentsApi; documents?: PublicDocumentsApi }) { return <RequireReader><PurchasesContent purchased alerts client={client} documents={documents} /></RequireReader>; }

/** An email only opens this authenticated view; starting a payment still requires a button click. */
export function ReaderRenewalPage({ id, client = defaultApi, documents = defaultDocuments }: { id: string; client?: DocumentPaymentsApi; documents?: PublicDocumentsApi }) {
    return <RequireReader><PurchasesContent purchased documentId={id} client={client} documents={documents} /></RequireReader>;
}
