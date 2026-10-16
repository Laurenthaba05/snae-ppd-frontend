import React, {  useState } from 'react';
import { Icon } from '../ui/icons';
import { Badge, ErrorNotice, Field, Modal, Notice, formatDate } from '../ui/components';
import { printHtml } from '../ui/printHtml';
import { accessStateLabel, accessTone, accessUntilText, daysLeft, formatAmount, passwordProblems, paymentInstructions, paymentModeLabel, receiptHtml, stateTone, subscriptionStateLabel, validityText } from '../core/portal';
import type { PortalAccessRequest, PortalCategory, PortalReceipt, PortalSubscription } from '../core/types';
import { useAction, usePortal } from './context';
import { PLink, RequireReader } from './Shell';

function SubscriptionCard({ sub }: { sub: PortalSubscription }) {
    const { api, reload } = usePortal();
    const action = useAction();
    const [receipt, setReceipt] = useState<PortalReceipt | null>(null);
    const left = daysLeft(sub.finLe);
    return <article className={'portal-subscription tone-' + (stateTone(sub.etat) || 'plain')}>
        <header>
            <div><h3>{sub.formuleLibelle}</h3><p className="portal-meta">{sub.numero} · demandé le {formatDate(sub.demandeLe)}</p></div>
            <Badge value={sub.etat} label={subscriptionStateLabel(sub.etat)} />
        </header>
        {sub.etat === 'EN_ATTENTE_PAIEMENT' && <div className="portal-payment">
            <p>{paymentInstructions(sub)}</p>
            <p className="portal-reference"><span>Référence à donner</span><strong className="mono" aria-label={'Référence ' + sub.referencePaiement}>{sub.referencePaiement}</strong></p>
            <button className="btn small secondary" disabled={action.busy} onClick={() => void action.run(async () => { await api.cancelSubscription(sub.id); await reload(); })}>Annuler ma demande</button>
        </div>}
        {sub.etat !== 'EN_ATTENTE_PAIEMENT' && sub.etat !== 'ANNULE' && <p>{validityText(sub)}{sub.etat === 'EN_COURS' && left !== null && <> — <strong>{left === 0 ? 'se termine aujourd’hui' : `${left} jour${left > 1 ? 's' : ''} restant${left > 1 ? 's' : ''}`}</strong></>}</p>}
        {sub.etat === 'ANNULE' && <p className="portal-muted">{sub.annuleParLecteur ? 'Annulé à votre demande' : 'Annulé par l’institution'}{sub.annuleMotif ? ` : ${sub.annuleMotif}` : ''}</p>}
        {sub.modeActivation === 'EXONERATION' && <p className="portal-muted">Accordé par l’institution, sans paiement.</p>}
        {sub.paiement && <p className="portal-muted">Paiement {paymentModeLabel(sub.paiement.mode)} reçu le {formatDate(sub.paiement.recuLe)} · reçu <strong>{sub.paiement.numero}</strong>{' '}
            <button className="text-link" disabled={action.busy} onClick={() => void action.run(async () => { setReceipt(await api.receipt(sub.paiement!.numero)); })}>Voir le reçu</button></p>}
        {action.error !== null && <ErrorNotice error={action.error} />}
        {receipt && <Modal title={'Reçu ' + receipt.paiement.numero} subtitle={formatAmount(receipt.paiement.montant, receipt.paiement.devise)} onClose={() => setReceipt(null)}>
            <div className="portal-receipt">
                <dl className="portal-fields">
                    <div><dt>Lecteur</dt><dd>{receipt.paiement.lecteurNom} ({receipt.paiement.lecteurNumero})</dd></div>
                    <div><dt>Formule</dt><dd>{receipt.paiement.formuleLibelle}</dd></div>
                    <div><dt>Mode</dt><dd>{paymentModeLabel(receipt.paiement.mode)}{receipt.paiement.referenceExterne ? ' — ' + receipt.paiement.referenceExterne : ''}</dd></div>
                    <div><dt>Reçu le</dt><dd>{formatDate(receipt.paiement.recuLe)}</dd></div>
                    <div><dt>Période</dt><dd>{validityText({ etat: 'EN_COURS', debutLe: receipt.debutLe, finLe: receipt.finLe })}</dd></div>
                </dl>
                {receipt.paiement.statut === 'ANNULE' && <Notice tone="warning">Ce reçu est annulé{receipt.paiement.annuleMotif ? ' : ' + receipt.paiement.annuleMotif : ''}.</Notice>}
                <div className="portal-actions"><button className="btn primary" onClick={() => printHtml(receiptHtml(receipt))}><Icon name="download" size={16} />Imprimer</button><button className="btn secondary" onClick={() => setReceipt(null)}>Fermer</button></div>
            </div>
        </Modal>}
    </article>;
}

function AccessRequestCard({ request }: { request: PortalAccessRequest }) {
    const { api, reload } = usePortal();
    const action = useAction();
    const reading = request.etat === 'ACCORDEE';
    return <article className={'portal-subscription tone-' + (accessTone(request.etat) || 'plain')}>
        <header>
            <div><h3>{request.documentTitre}</h3><p className="portal-meta">{request.numero} · déposée le {formatDate(request.deposeLe)}{request.noticeIntitule ? ' · ' + request.noticeIntitule : ''}</p></div>
            <Badge value={request.etat} label={accessStateLabel(request.etat)} />
        </header>
        <p className="portal-quote">{request.motif}</p>
        {request.etat === 'ACCORDEE' && request.accordeJusquAu && <p>Accès accordé jusqu’au <strong>{accessUntilText(request)}</strong>.</p>}
        {request.etat === 'EXPIREE' && request.accordeJusquAu && <p className="portal-muted">L’accès a expiré le {accessUntilText(request)}.</p>}
        {request.message && <p className="portal-muted">Message de l’institution : {request.message}</p>}
        <div className="portal-actions">
            {reading && <PLink to={'/lecture/' + request.documentId} className="btn primary small">Lire</PLink>}
            {request.noticeId && <PLink to={'/notices/' + request.noticeId} className="btn secondary small">Voir la notice</PLink>}
            {request.peutAnnuler && <button className="btn small secondary" disabled={action.busy} onClick={() => void action.run(async () => { await api.cancelAccessRequest(request.id); await reload(); })}>Annuler ma demande</button>}
        </div>
        {action.error !== null && <ErrorNotice error={action.error} />}
    </article>;
}

function ProfileForm() {
    const { api, reader, reload } = usePortal();
    const [categories, setCategories] = useState<PortalCategory[] | null>(null);
    const [form, setForm] = useState({ prenom: reader!.prenom, nom: reader!.nom, organisme: reader!.organisme ?? '', categorie: reader!.categorie ?? '' });
    const [saved, setSaved] = useState(false);
    const action = useAction();
    React.useEffect(() => {
        const controller = new AbortController();
        api.readerCategories(controller.signal).then(setCategories).catch(() => setCategories([]));
        return () => controller.abort();
    }, []);
    const valid = form.prenom.trim() && form.nom.trim();
    return <form className="portal-form" onSubmit={event => {
        event.preventDefault();
        void action.run(async () => { await api.updateMe({ prenom: form.prenom.trim(), nom: form.nom.trim(), organisme: form.organisme.trim() || undefined, categorie: form.categorie || undefined }); await reload(); setSaved(true); });
    }} noValidate>
        <div className="portal-two">
            <Field label="Prénom"><input value={form.prenom} maxLength={100} required onChange={e => { setSaved(false); setForm({ ...form, prenom: e.target.value }); }} /></Field>
            <Field label="Nom"><input value={form.nom} maxLength={100} required onChange={e => { setSaved(false); setForm({ ...form, nom: e.target.value }); }} /></Field>
        </div>
        <Field label="Organisme"><input value={form.organisme} maxLength={200} onChange={e => { setSaved(false); setForm({ ...form, organisme: e.target.value }); }} /></Field>
        {categories && categories.length > 0 && <Field label="Vous êtes"><select value={form.categorie} onChange={e => { setSaved(false); setForm({ ...form, categorie: e.target.value }); }}><option value="">—</option>{categories.map(c => <option key={c.code} value={c.code}>{c.libelle}</option>)}</select></Field>}
        {action.error !== null && <ErrorNotice error={action.error} />}
        {saved && <Notice>Profil enregistré.</Notice>}
        <button className="btn primary" disabled={action.busy || !valid}>{action.busy ? 'Enregistrement…' : 'Enregistrer'}</button>
    </form>;
}

function PasswordForm() {
    const { api, reader } = usePortal();
    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [done, setDone] = useState<string | null>(null);
    const action = useAction();
    const issues = next ? passwordProblems(next, reader!.email) : [];
    return <form className="portal-form" onSubmit={event => {
        event.preventDefault();
        void action.run(async () => { try { const result = await api.changePassword(current, next); setDone(result.message); } finally { setCurrent(''); setNext(''); } });
    }} noValidate>
        <Field label="Mot de passe actuel"><input type="password" autoComplete="current-password" value={current} maxLength={200} onChange={e => { setDone(null); setCurrent(e.target.value); }} /></Field>
        <Field label="Nouveau mot de passe"><input type="password" autoComplete="new-password" value={next} maxLength={200} onChange={e => { setDone(null); setNext(e.target.value); }} /></Field>
        <ul className="portal-issues" aria-live="polite">{issues.map(p => <li key={p}>{p}</li>)}</ul>
        {action.error !== null && <ErrorNotice error={action.error} />}
        {done && <Notice>{done}</Notice>}
        <button className="btn secondary" disabled={action.busy || !current || !next || issues.length > 0}>{action.busy ? 'Enregistrement…' : 'Changer le mot de passe'}</button>
    </form>;
}

function Account() {
    const { reader, subscriptions, accessRequests, access } = usePortal();
    const ordered = [...subscriptions].sort((a, b) => b.demandeLe.localeCompare(a.demandeLe));
    return <div className="portal-page">
        <h1>Mon compte</h1>
        <p className="portal-meta">{reader!.prenom} {reader!.nom} · lecteur {reader!.numero} · {reader!.email}</p>
        <section aria-labelledby="subs-title" className="portal-section">
            <h2 id="subs-title">Mes abonnements</h2>
            {access === 'ABONNE' && <Notice>Vous pouvez lire les documents communicables. <PLink to="">Parcourir le catalogue</PLink></Notice>}
            {access === 'SANS_ABONNEMENT' && <Notice tone="warning">Vous n’avez pas d’abonnement en cours : la lecture des documents est fermée. <PLink to="/formules">Voir les formules</PLink></Notice>}
            {ordered.length === 0 ? <p className="portal-muted">Aucun abonnement pour le moment.</p> : <div className="portal-subscriptions">{ordered.map(s => <SubscriptionCard key={s.id} sub={s} />)}</div>}
            {access !== 'EN_ATTENTE' && <p><PLink to="/formules" className="btn secondary small">{access === 'ABONNE' ? 'Renouveler' : 'Demander un abonnement'}</PLink></p>}
        </section>
        <section aria-labelledby="requests-title" className="portal-section">
            <h2 id="requests-title">Mes demandes d’accès</h2>
            <p className="portal-muted">Certains documents ne se lisent qu’après l’accord de l’institution qui les conserve.</p>
            {accessRequests.length === 0 ? <p className="portal-muted">Aucune demande pour le moment.</p> : <div className="portal-subscriptions">{accessRequests.map(r => <AccessRequestCard key={r.id} request={r} />)}</div>}
        </section>
        <section aria-labelledby="profile-title" className="portal-section"><h2 id="profile-title">Mes informations</h2><ProfileForm /></section>
        <section aria-labelledby="password-title" className="portal-section"><h2 id="password-title">Mot de passe</h2><PasswordForm /></section>
    </div>;
}

export function AccountPage() { return <RequireReader><Account /></RequireReader>; }
