import React, { useEffect, useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { can } from '../core/policy';
import { IntentKey } from '../core/validation';
import { Badge, Busy, Empty, ErrorNotice, Field, Modal, Notice, Pagination, formatDate, useResource } from './components';
import { Icon } from './icons';
import { printHtml } from './printHtml';
import { PAYMENT_MODES, durationText, emptyPaymentForm, emptyPlanForm, formatAmount, motifProblems, normalizeReference, paymentBody, paymentModeLabel, paymentProblems, planBody, planFormOf, planProblems,
    receiptHtml, referenceProblem, subscriptionStateLabel, validityText, type PaymentForm, type PlanForm } from '../core/portal';
import type { AdminPlan, AdminReader, AdminSubscription, PaymentMode, PortalPage, PortalPayment } from '../core/types';
import { display } from '../core/format';

/** Une commande vers le serveur : la même intention garde la même clé d'idempotence, une nouvelle intention en prend une nouvelle. */
export function useCommand() {
    const { portalAdmin } = useSession();
    const key = useRef(new IntentKey());
    const running = useRef(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const send = async <T,>(path: string, body: unknown, method: 'POST' | 'PUT' = 'POST'): Promise<T | null> => {
        if (running.current) return null;
        running.current = true; setBusy(true); setError(null);
        try { const result = await portalAdmin!.command<T>(path, body, key.current.forRequest(method, path, body), method); key.current.clear(); return result; }
        catch (e) { setError(e); return null; }
        finally { running.current = false; setBusy(false); }
    };
    return { busy, error, send, clear: () => setError(null) };
}

const money = (amount: number, currency: string) => formatAmount(amount, currency);

// ---------------------------------------------------------------- dialogues de commande

/** Un acte engageant l'institution, motivé par écrit : exonération, annulation, suspension. */
function MotifDialog({ title, description, path, label = 'Motif', confirm, danger = false, onClose, onDone, body = {} }: {
    title: string; description: string; path: string; label?: string; confirm: string; danger?: boolean; onClose: () => void; onDone: () => void; body?: Record<string, unknown>;
}) {
    const [motif, setMotif] = useState('');
    const [touched, setTouched] = useState(false);
    const command = useCommand();
    const problems = motifProblems(motif, label);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault(); setTouched(true);
        if (problems.length) return;
        if (await command.send(path, { ...body, motif: motif.trim() }) !== null) { onDone(); onClose(); }
    };
    return <Modal title={title} subtitle={description} onClose={onClose} locked={command.busy}>
        <form onSubmit={submit} noValidate>
            <div className="form-grid">
                <Field label={label} hint="Écrit au dossier et conservé dans le journal." error={touched && problems.length ? problems[0] : undefined} wide><textarea value={motif} onChange={e => setMotif(e.target.value)} rows={4} maxLength={4000} disabled={command.busy} required /></Field>
            </div>
            {command.error !== null && <ErrorNotice error={command.error} />}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={command.busy}>Annuler</button><button type="submit" className={'btn ' + (danger ? 'danger' : 'primary')} disabled={command.busy}>{command.busy ? 'Envoi…' : confirm}</button></footer>
        </form>
    </Modal>;
}

/** L'encaissement : le montant exact de la formule, la pièce hors espèces. Le système n'exécute aucun paiement, il enregistre ce que la personne au guichet a reçu. */
function PaymentDialog({ sub, onClose, onDone }: { sub: AdminSubscription; onClose: () => void; onDone: (payment: PortalPayment) => void }) {
    const [form, setForm] = useState<PaymentForm>(emptyPaymentForm(sub));
    const [touched, setTouched] = useState(false);
    const command = useCommand();
    const problems = paymentProblems(form, sub);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault(); setTouched(true);
        if (problems.length) return;
        const payment = await command.send<PortalPayment>('/payments', paymentBody(form, sub));
        if (payment) { onDone(payment); onClose(); }
    };
    return <Modal title="Enregistrer un paiement" subtitle={`${sub.lecteur.nom} · ${sub.formuleLibelle}`} onClose={onClose} locked={command.busy}>
        <form onSubmit={submit} noValidate>
            <div className="form-grid">
                <div className="span2 portal-recap"><dl className="asset-fields">
                    <div><dt>Abonnement</dt><dd>{sub.numero}</dd></div><div><dt>Référence donnée par le lecteur</dt><dd className="mono">{sub.referencePaiement}</dd></div>
                    <div><dt>Formule</dt><dd>{sub.formuleLibelle} — {durationText(sub.dureeMois)}</dd></div><div><dt>Montant dû</dt><dd><strong>{money(sub.montant, sub.devise)}</strong></dd></div>
                </dl></div>
                <Field label="Mode d’encaissement"><select value={form.mode} onChange={e => setForm({ ...form, mode: e.target.value as PaymentMode })} disabled={command.busy}>{PAYMENT_MODES.map(m => <option key={m} value={m}>{paymentModeLabel(m)}</option>)}</select></Field>
                <Field label={`Montant encaissé (${sub.devise})`} hint="Exactement le montant dû." error={touched ? problems.find(p => p.includes('montant')) : undefined}><input inputMode="decimal" value={form.montant} onChange={e => setForm({ ...form, montant: e.target.value })} disabled={command.busy} /></Field>
                {form.mode !== 'ESPECES' && <Field label="Pièce de l’encaissement" hint="Référence du virement ou de l’opération." error={touched ? problems.find(p => p.includes('pièce')) : undefined} wide><input value={form.reference} maxLength={120} onChange={e => setForm({ ...form, reference: e.target.value })} disabled={command.busy} /></Field>}
                <Field label="Note (facultatif)" wide><textarea value={form.note} rows={2} maxLength={2000} onChange={e => setForm({ ...form, note: e.target.value })} disabled={command.busy} /></Field>
            </div>
            <Notice>L’abonnement s’ouvre dès l’enregistrement. Une erreur se corrige ensuite par une annulation motivée, validée par une autre personne.</Notice>
            {command.error !== null && <ErrorNotice error={command.error} />}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={command.busy}>Annuler</button><button type="submit" className="btn primary" disabled={command.busy}>{command.busy ? 'Enregistrement…' : 'Enregistrer le paiement'}</button></footer>
        </form>
    </Modal>;
}

export function printReceipt(receipt: Parameters<typeof receiptHtml>[0]) { printHtml(receiptHtml(receipt)); }

// ---------------------------------------------------------------- abonnement : fiche et actions

function SubscriptionDialog({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
    const { portalAdmin } = useSession();
    const q = useResource<AdminSubscription>(s => portalAdmin!.subscription(id, s), 'portal-subscription:' + id);
    const [action, setAction] = useState<'pay' | 'exempt' | 'cancel' | null>(null);
    const [receiptError, setReceiptError] = useState<unknown>(null);
    const done = () => { q.refresh(); onChanged(); };
    const sub = q.data;
    const receipt = async (paymentId: string) => {
        setReceiptError(null);
        try { printReceipt(await portalAdmin!.receipt(paymentId)); } catch (e) { setReceiptError(e); }
    };
    return <Modal title={sub ? 'Abonnement ' + sub.numero : 'Abonnement'} subtitle={sub ? `${sub.lecteur.nom} (${sub.lecteur.numero})` : undefined} onClose={onClose} wide>
        <div className="asset-tab">
            {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : sub && <>
                <p><Badge value={sub.etat} label={subscriptionStateLabel(sub.etat)} /> <span className="asset-gap-count">{money(sub.montant, sub.devise)}</span></p>
                <dl className="asset-fields">
                    <div><dt>Lecteur</dt><dd>{sub.lecteur.nom}<small className="cell-sub">{sub.lecteur.email}{sub.lecteur.suspendu && ' · compte suspendu'}{!sub.lecteur.emailVerifie && ' · adresse non confirmée'}</small></dd></div>
                    <div><dt>Formule</dt><dd>{sub.formuleLibelle} ({sub.formuleCode}) — {durationText(sub.dureeMois)}</dd></div>
                    <div><dt>Référence de paiement</dt><dd className="mono">{sub.referencePaiement}</dd></div>
                    <div><dt>Demandé le</dt><dd>{formatDate(sub.demandeLe)}</dd></div>
                    <div><dt>Période</dt><dd>{validityText(sub)}</dd></div>
                    <div><dt>Ouverture</dt><dd>{sub.modeActivation === 'EXONERATION' ? 'Par exonération' : sub.modeActivation === 'PAIEMENT' ? 'Par paiement' : '—'}</dd></div>
                    {sub.exonerationMotif && <div className="wide"><dt>Motif de l’exonération</dt><dd>{sub.exonerationMotif}</dd></div>}
                    {sub.annuleLe && <div className="wide"><dt>Annulation</dt><dd>{formatDate(sub.annuleLe)}{sub.annuleMotif ? ' — ' + sub.annuleMotif : ''}</dd></div>}
                </dl>
                {sub.paiement && <div className="panel"><h4>Paiement</h4><dl className="asset-fields">
                    <div><dt>Reçu</dt><dd>{sub.paiement.numero}{sub.paiement.statut === 'ANNULE' && ' (annulé)'}</dd></div>
                    <div><dt>Mode</dt><dd>{paymentModeLabel(sub.paiement.mode)}{sub.paiement.referenceExterne ? ' — ' + sub.paiement.referenceExterne : ''}</dd></div>
                    <div><dt>Encaissé par</dt><dd>{sub.paiement.recuPar ?? '—'} le {formatDate(sub.paiement.recuLe)}</dd></div>
                </dl><p><button type="button" className="btn small secondary" onClick={() => void receipt(sub.paiement!.id)}><Icon name="download" size={15} />Imprimer le reçu</button></p></div>}
                {receiptError !== null && <ErrorNotice error={receiptError} />}
                <div className="asset-transitions">
                    {sub.peutEncaisser && <button className="btn primary" onClick={() => setAction('pay')}>Enregistrer le paiement</button>}
                    {sub.peutExonerer && <button className="btn secondary" onClick={() => setAction('exempt')}>Accorder par exonération</button>}
                    {sub.peutAnnuler && <button className="btn secondary" onClick={() => setAction('cancel')}>Annuler l’abonnement</button>}
                    {!sub.peutEncaisser && !sub.peutExonerer && !sub.peutAnnuler && <p className="wf-note">Aucune action n’est possible pour votre profil sur cet abonnement dans son état actuel.</p>}
                </div>
            </>}
        </div>
        {sub && action === 'pay' && <PaymentDialog sub={sub} onClose={() => setAction(null)} onDone={done} />}
        {sub && action === 'exempt' && <MotifDialog title="Accorder par exonération" description="L’abonnement s’ouvre sans paiement. L’exonération engage l’institution : le motif (décision, convention, qualité du lecteur) est conservé." path={`/subscriptions/${sub.id}/exempt`} label="Motif de l’exonération" confirm="Accorder" onClose={() => setAction(null)} onDone={done} />}
        {sub && action === 'cancel' && <MotifDialog title="Annuler l’abonnement" description="Le lecteur perd l’accès à la lecture. L’annulation est motivée et conservée." path={`/subscriptions/${sub.id}/cancel`} label="Motif de l’annulation" confirm="Annuler l’abonnement" danger onClose={() => setAction(null)} onDone={done} />}
    </Modal>;
}

// ---------------------------------------------------------------- caisse

function PaymentRow({ payment, onReceipt, onCancel }: { payment: PortalPayment; onReceipt: (p: PortalPayment) => void; onCancel: (p: PortalPayment) => void }) {
    return <tr className={payment.statut === 'ANNULE' ? 'row-muted' : ''}>
        <td className="nowrap">{payment.numero}<small className="cell-sub">{formatDate(payment.recuLe)}</small></td>
        <td>{payment.lecteurNom}<small className="cell-sub">{payment.lecteurNumero} · {payment.abonnementNumero}</small></td>
        <td>{payment.formuleLibelle}</td>
        <td className="nowrap">{money(payment.montant, payment.devise)}</td>
        <td>{paymentModeLabel(payment.mode)}{payment.referenceExterne && <small className="cell-sub">{payment.referenceExterne}</small>}</td>
        <td>{payment.recuPar ?? '—'}</td>
        <td>{payment.statut === 'ANNULE' ? <Badge value="ANNULE" label="Annulé" /> : <Badge value="ACTIF" label="Enregistré" />}{payment.statut === 'ANNULE' && payment.annuleMotif && <small className="cell-sub">{payment.annuleMotif}</small>}</td>
        <td className="nowrap"><button type="button" className="text-link" onClick={() => onReceipt(payment)}>Reçu</button>{payment.peutAnnuler && <> · <button type="button" className="text-link" onClick={() => onCancel(payment)}>Annuler</button></>}</td>
    </tr>;
}

export function CashierPanel() {
    const { portalAdmin, epoch } = useSession();
    const [reference, setReference] = useState('');
    const [lookupError, setLookupError] = useState<unknown>(null);
    const [lookupBusy, setLookupBusy] = useState(false);
    const [opened, setOpened] = useState<string | null>(null);
    const [form, setForm] = useState({ statut: '', mode: '', mine: false, from: '', to: '' });
    const [applied, setApplied] = useState(form);
    const [page, setPage] = useState(0);
    const [revision, setRevision] = useState(0);
    const [cancelling, setCancelling] = useState<PortalPayment | null>(null);
    const [receiptError, setReceiptError] = useState<unknown>(null);
    const filters = { statut: applied.statut, mode: applied.mode, mine: applied.mine ? 'true' : '', from: applied.from, to: applied.to };
    const list = useResource<PortalPage<PortalPayment>>(s => portalAdmin!.payments({ ...filters, page, size: 20 }, s), JSON.stringify(['portal-payments', applied, page, revision, epoch]));
    const apply = (next: typeof form) => { setForm(next); setApplied(next); setPage(0); };
    const items = list.data?.items ?? [];
    const lookup = async (event: React.FormEvent) => {
        event.preventDefault();
        setLookupError(null);
        const problem = referenceProblem(reference);
        if (problem) { setLookupError(new Error(problem)); return; }
        setLookupBusy(true);
        try { const sub = await portalAdmin!.subscriptionByReference(normalizeReference(reference)); setOpened(sub.id); }
        catch (e) { setLookupError(e); }
        finally { setLookupBusy(false); }
    };
    const receipt = async (payment: PortalPayment) => {
        setReceiptError(null);
        try { printReceipt(await portalAdmin!.receipt(payment.id)); } catch (e) { setReceiptError(e); }
    };
    return <>
        <div className="panel">
            <div className="section-heading"><h3>Encaisser un abonnement</h3></div>
            <p className="wf-note">Le lecteur donne la référence <span className="mono">PAY-…</span> reçue à sa demande. Retrouvez sa demande, vérifiez le montant dû et enregistrez ce que vous avez encaissé : l’abonnement s’ouvre aussitôt et le reçu s’imprime.</p>
            <form className="asset-filters" onSubmit={lookup} role="search" aria-label="Retrouver un abonnement par sa référence">
                <Field label="Référence de paiement"><input value={reference} onChange={e => setReference(e.target.value)} placeholder="PAY-AB12CD34" maxLength={20} autoComplete="off" spellCheck={false} /></Field>
                <button type="submit" className="btn primary" disabled={lookupBusy || !reference.trim()}>{lookupBusy ? 'Recherche…' : 'Retrouver'}</button>
            </form>
            {lookupError !== null && <ErrorNotice error={lookupError} />}
        </div>
        <div className="panel">
            <div className="section-heading"><h3>Paiements enregistrés</h3></div>
            <form className="asset-filters" onSubmit={e => { e.preventDefault(); apply(form); }} aria-label="Filtrer les paiements">
                <Field label="Du"><input type="date" value={form.from} onChange={e => setForm({ ...form, from: e.target.value })} /></Field>
                <Field label="Au"><input type="date" value={form.to} onChange={e => setForm({ ...form, to: e.target.value })} /></Field>
                <Field label="Mode"><select value={form.mode} onChange={e => apply({ ...form, mode: e.target.value })}><option value="">Tous</option>{PAYMENT_MODES.map(m => <option key={m} value={m}>{paymentModeLabel(m)}</option>)}</select></Field>
                <Field label="État"><select value={form.statut} onChange={e => apply({ ...form, statut: e.target.value })}><option value="">Tous</option><option value="ENREGISTRE">Enregistrés</option><option value="ANNULE">Annulés</option></select></Field>
                <label className="field asset-flag"><input type="checkbox" checked={form.mine} onChange={e => apply({ ...form, mine: e.target.checked })} /><span>Mes encaissements</span></label>
                <button type="submit" className="btn small secondary">Filtrer</button>
            </form>
            {receiptError !== null && <ErrorNotice error={receiptError} />}
            {list.loading ? <Busy /> : list.error ? <ErrorNotice error={list.error} onRetry={list.refresh} /> : items.length ? <>
                <p className="wf-note" role="status">{list.data!.total} paiement{list.data!.total > 1 ? 's' : ''}</p>
                <div className="table-scroll"><table><thead><tr><th>Reçu</th><th>Lecteur</th><th>Formule</th><th>Montant</th><th>Mode</th><th>Encaissé par</th><th>État</th><th><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>{items.map(p => <PaymentRow key={p.id} payment={p} onReceipt={r => void receipt(r)} onCancel={setCancelling} />)}</tbody></table></div>
                <Pagination page={page} hasMore={list.data?.hasMore ?? false} onChange={setPage} count={items.length} />
            </> : <Empty title="Aucun paiement" description="Aucun paiement ne correspond à ces critères." icon="document" />}
        </div>
        {opened && <SubscriptionDialog id={opened} onClose={() => setOpened(null)} onChanged={() => setRevision(r => r + 1)} />}
        {cancelling && <MotifDialog title={'Annuler le paiement ' + cancelling.numero} description="L’abonnement lié se ferme. L’annulation est validée par une autre personne que celle qui a encaissé, et conservée au journal." path={`/payments/${cancelling.id}/cancel`}
            label="Motif de l’annulation" confirm="Annuler le paiement" danger onClose={() => setCancelling(null)} onDone={() => setRevision(r => r + 1)} />}
    </>;
}

// ---------------------------------------------------------------- abonnements

export function SubscriptionsPanel() {
    const { portalAdmin, epoch } = useSession();
    const [form, setForm] = useState({ etat: 'EN_ATTENTE_PAIEMENT', q: '' });
    const [applied, setApplied] = useState(form);
    const [page, setPage] = useState(0);
    const [revision, setRevision] = useState(0);
    const [opened, setOpened] = useState<string | null>(null);
    const list = useResource<PortalPage<AdminSubscription>>(s => portalAdmin!.subscriptions({ etat: applied.etat, q: applied.q, page, size: 20 }, s), JSON.stringify(['portal-subscriptions', applied, page, revision, epoch]));
    const apply = (next: typeof form) => { setForm(next); setApplied(next); setPage(0); };
    const items = list.data?.items ?? [];
    return <>
        <div className="panel">
            <div className="section-heading"><h3>Abonnements</h3></div>
            <form className="asset-filters" onSubmit={e => { e.preventDefault(); apply(form); }} role="search" aria-label="Rechercher un abonnement">
                <Field label="Recherche"><input value={form.q} onChange={e => setForm({ ...form, q: e.target.value })} placeholder="Numéro, référence, lecteur ou adresse" /></Field>
                <Field label="État"><select value={form.etat} onChange={e => apply({ ...form, etat: e.target.value })}><option value="">Tous</option>{(['EN_ATTENTE_PAIEMENT', 'EN_COURS', 'A_VENIR', 'EXPIRE', 'ANNULE'] as const).map(s => <option key={s} value={s}>{subscriptionStateLabel(s)}</option>)}</select></Field>
                <button type="submit" className="btn small secondary">Rechercher</button>
            </form>
            {list.loading ? <Busy /> : list.error ? <ErrorNotice error={list.error} onRetry={list.refresh} /> : items.length ? <>
                <p className="wf-note" role="status">{list.data!.total} abonnement{list.data!.total > 1 ? 's' : ''}</p>
                <div className="table-scroll"><table><thead><tr><th>Abonnement</th><th>Lecteur</th><th>Formule</th><th>Montant</th><th>Période</th><th>État</th></tr></thead>
                    <tbody>{items.map(s => <tr key={s.id}>
                        <td className="nowrap"><button type="button" className="text-link" onClick={() => setOpened(s.id)}>{s.numero}</button><small className="cell-sub mono">{s.referencePaiement}</small></td>
                        <td>{s.lecteur.nom}<small className="cell-sub">{s.lecteur.numero} · {s.lecteur.email}</small></td>
                        <td>{s.formuleLibelle}<small className="cell-sub">{durationText(s.dureeMois)}</small></td>
                        <td className="nowrap">{money(s.montant, s.devise)}</td>
                        <td>{validityText(s)}</td>
                        <td><Badge value={s.etat} label={subscriptionStateLabel(s.etat)} /></td></tr>)}</tbody></table></div>
                <Pagination page={page} hasMore={list.data?.hasMore ?? false} onChange={setPage} count={items.length} />
            </> : <Empty title="Aucun abonnement" description="Aucun abonnement ne correspond à ces critères." icon="document" />}
        </div>
        {opened && <SubscriptionDialog id={opened} onClose={() => setOpened(null)} onChanged={() => setRevision(r => r + 1)} />}
    </>;
}

// ---------------------------------------------------------------- lecteurs

export function ReadersPanel() {
    const { portalAdmin, epoch } = useSession();
    const [form, setForm] = useState({ statut: '', q: '' });
    const [applied, setApplied] = useState(form);
    const [page, setPage] = useState(0);
    const [revision, setRevision] = useState(0);
    const [suspending, setSuspending] = useState<AdminReader | null>(null);
    const command = useCommand();
    const list = useResource<PortalPage<AdminReader>>(s => portalAdmin!.readers({ statut: applied.statut, q: applied.q, page, size: 20 }, s), JSON.stringify(['portal-readers', applied, page, revision, epoch]));
    const apply = (next: typeof form) => { setForm(next); setApplied(next); setPage(0); };
    const items = list.data?.items ?? [];
    const act = async (reader: AdminReader, what: 'verify-email' | 'reinstate') => { if (await command.send(`/readers/${reader.id}/${what}`, {}) !== null) setRevision(r => r + 1); };
    return <>
        <div className="panel">
            <div className="section-heading"><h3>Lecteurs inscrits</h3></div>
            <p className="wf-note">Les comptes lecteurs sont distincts des comptes du personnel. Vous ne voyez jamais un mot de passe. Un compte suspendu ne peut plus ouvrir de session.</p>
            <form className="asset-filters" onSubmit={e => { e.preventDefault(); apply(form); }} role="search" aria-label="Rechercher un lecteur">
                <Field label="Recherche"><input value={form.q} onChange={e => setForm({ ...form, q: e.target.value })} placeholder="Numéro, nom ou adresse" /></Field>
                <Field label="Compte"><select value={form.statut} onChange={e => apply({ ...form, statut: e.target.value })}><option value="">Tous</option><option value="ACTIF">Actifs</option><option value="SUSPENDU">Suspendus</option></select></Field>
                <button type="submit" className="btn small secondary">Rechercher</button>
            </form>
            {command.error !== null && <ErrorNotice error={command.error} />}
            {list.loading ? <Busy /> : list.error ? <ErrorNotice error={list.error} onRetry={list.refresh} /> : items.length ? <>
                <p className="wf-note" role="status">{list.data!.total} lecteur{list.data!.total > 1 ? 's' : ''}</p>
                <div className="table-scroll"><table><thead><tr><th>Lecteur</th><th>Organisme</th><th>Abonnement</th><th>Dernière connexion</th><th>Compte</th><th><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>{items.map(r => <tr key={r.id}>
                        <td>{r.prenom} {r.nom}<small className="cell-sub">{r.numero} · {r.email}{!r.emailVerifie && ' · adresse non confirmée'}</small></td>
                        <td>{r.organisme ?? '—'}{r.categorie && <small className="cell-sub">{display(r.categorie)}</small>}</td>
                        <td>{r.abonnementEtat ? subscriptionStateLabel(r.abonnementEtat) : 'Aucun'}{r.abonnementFinLe && <small className="cell-sub">jusqu’au {formatDate(r.abonnementFinLe)}</small>}</td>
                        <td>{formatDate(r.derniereConnexionLe)}</td>
                        <td>{r.suspendu ? <Badge value="SUSPENDU" /> : <Badge value="ACTIF" />}{r.suspendu && r.motifSuspension && <small className="cell-sub">{r.motifSuspension}</small>}</td>
                        <td className="nowrap">
                            {!r.emailVerifie && <button type="button" className="text-link" disabled={command.busy} onClick={() => void act(r, 'verify-email')}>Confirmer l’adresse</button>}
                            {r.suspendu ? <> <button type="button" className="text-link" disabled={command.busy} onClick={() => void act(r, 'reinstate')}>Rétablir</button></> : <> <button type="button" className="text-link" disabled={command.busy} onClick={() => setSuspending(r)}>Suspendre</button></>}
                        </td></tr>)}</tbody></table></div>
                <Pagination page={page} hasMore={list.data?.hasMore ?? false} onChange={setPage} count={items.length} />
            </> : <Empty title="Aucun lecteur" description="Aucun lecteur ne correspond à ces critères." icon="users" />}
        </div>
        {suspending && <MotifDialog title={'Suspendre ' + suspending.numero} description="Le lecteur ne peut plus ouvrir de session et ses sessions en cours sont fermées. Le motif est conservé." path={`/readers/${suspending.id}/suspend`} label="Motif de la suspension" confirm="Suspendre" danger onClose={() => setSuspending(null)} onDone={() => setRevision(r => r + 1)} />}
    </>;
}

// ---------------------------------------------------------------- formules

function PlanDialog({ plan, onClose, onDone }: { plan: AdminPlan | null; onClose: () => void; onDone: () => void }) {
    const { heritage } = useSession();
    const [form, setForm] = useState<PlanForm>(plan ? planFormOf(plan) : emptyPlanForm());
    const [actif, setActif] = useState(plan?.actif ?? true);
    const [categories, setCategories] = useState<Array<{ code: string; libelle: string }>>([]);
    const [touched, setTouched] = useState(false);
    const command = useCommand();
    useEffect(() => {
        const controller = new AbortController();
        heritage?.references('CATEGORIE_LECTEUR', controller.signal).then(list => setCategories(list.filter(r => r.actif))).catch(() => { /* Sans le référentiel, la catégorie reste un texte libre contrôlé par le serveur. */ });
        return () => controller.abort();
    }, []);
    const problems = planProblems(form, !!plan);
    const set = <K extends keyof PlanForm>(key: K, value: PlanForm[K]) => setForm(f => ({ ...f, [key]: value }));
    const submit = async (event: React.FormEvent) => {
        event.preventDefault(); setTouched(true);
        if (problems.length) return;
        const saved = plan ? await command.send(`/plans/${plan.id}`, planBody(form, true, plan.version, actif), 'PUT') : await command.send('/plans', planBody(form));
        if (saved !== null) { onDone(); onClose(); }
    };
    return <Modal title={plan ? 'Modifier la formule ' + plan.code : 'Nouvelle formule'} subtitle="Les tarifs et durées sont ceux que l’institution décide : aucune valeur n’est imposée." onClose={onClose} locked={command.busy} wide>
        <form onSubmit={submit} noValidate>
            <div className="form-grid">
                {!plan && <Field label="Code" hint="2 à 40 caractères, sans espace." error={touched ? problems.find(p => p.startsWith('Le code')) : undefined}><input value={form.code} maxLength={40} onChange={e => set('code', e.target.value)} disabled={command.busy} /></Field>}
                <Field label="Libellé" error={touched ? problems.find(p => p.startsWith('Le libellé')) : undefined}><input value={form.libelle} maxLength={150} onChange={e => set('libelle', e.target.value)} disabled={command.busy} /></Field>
                <Field label="Durée (mois)" error={touched ? problems.find(p => p.startsWith('La durée')) : undefined}><input inputMode="numeric" value={form.dureeMois} onChange={e => set('dureeMois', e.target.value)} disabled={command.busy} /></Field>
                <Field label="Montant" hint="0 pour une formule accordée sur exonération." error={touched ? problems.find(p => p.startsWith('Le montant')) : undefined}><input inputMode="decimal" value={form.montant} onChange={e => set('montant', e.target.value)} disabled={command.busy} /></Field>
                <Field label="Devise" hint="Code à trois lettres (ISO 4217)." error={touched ? problems.find(p => p.startsWith('La devise')) : undefined}><input value={form.devise} maxLength={3} onChange={e => set('devise', e.target.value)} disabled={command.busy} /></Field>
                <Field label="Catégorie de lecteur (facultatif)"><input list="portal-plan-categories" value={form.categorie} onChange={e => set('categorie', e.target.value)} disabled={command.busy} /><datalist id="portal-plan-categories">{categories.map(c => <option key={c.code} value={c.code}>{c.libelle}</option>)}</datalist></Field>
                <Field label="Ordre d’affichage"><input inputMode="numeric" value={form.ordre} onChange={e => set('ordre', e.target.value)} disabled={command.busy} /></Field>
                <Field label="Description (facultatif)" wide><textarea value={form.description} rows={3} maxLength={4000} onChange={e => set('description', e.target.value)} disabled={command.busy} /></Field>
                <label className="field asset-flag span2"><input type="checkbox" checked={form.telechargement} onChange={e => set('telechargement', e.target.checked)} disabled={command.busy} /><span>La formule prévoit le téléchargement (non offert par le portail actuel : lecture à l’écran)</span></label>
                {plan && <label className="field asset-flag span2"><input type="checkbox" checked={actif} onChange={e => setActif(e.target.checked)} disabled={command.busy} /><span>Formule proposée au public</span></label>}
            </div>
            {plan && plan.abonnementsEnCours > 0 && <Notice>{plan.abonnementsEnCours} abonnement{plan.abonnementsEnCours > 1 ? 's' : ''} en cours ou en attente : {plan.abonnementsEnCours > 1 ? 'ils gardent' : 'il garde'} les conditions de {plan.abonnementsEnCours > 1 ? 'leur' : 'sa'} demande. La modification ne s’applique qu’aux demandes à venir.</Notice>}
            {command.error !== null && <ErrorNotice error={command.error} />}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={command.busy}>Annuler</button><button type="submit" className="btn primary" disabled={command.busy}>{command.busy ? 'Enregistrement…' : plan ? 'Enregistrer' : 'Créer la formule'}</button></footer>
        </form>
    </Modal>;
}

export function PlansPanel() {
    const { portalAdmin, epoch, me } = useSession();
    const [revision, setRevision] = useState(0);
    const [editing, setEditing] = useState<AdminPlan | 'new' | null>(null);
    const list = useResource<AdminPlan[]>(s => portalAdmin!.plans(s), JSON.stringify(['portal-plans', revision, epoch]));
    const canManage = can(me, 'PORTAL_PLAN_MANAGE', {});
    const items = list.data ?? [];
    return <>
        <div className="panel">
            <div className="section-heading"><h3>Formules d’abonnement</h3>{canManage && <button type="button" className="btn primary small" onClick={() => setEditing('new')}>Nouvelle formule</button>}</div>
            <p className="wf-note">Le portail ne propose que les formules actives. Les tarifs, les durées et les catégories de lecteurs sont fixés par l’institution : rien n’est préenregistré. Une formule modifiée ne change pas les abonnements déjà demandés.</p>
            {list.loading ? <Busy /> : list.error ? <ErrorNotice error={list.error} onRetry={list.refresh} /> : items.length ? <div className="table-scroll"><table><thead><tr><th>Formule</th><th>Durée</th><th>Montant</th><th>Catégorie</th><th>Abonnements en cours</th><th>État</th><th><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>{items.map(p => <tr key={p.id}>
                    <td>{p.libelle}<small className="cell-sub mono">{p.code}</small></td><td>{durationText(p.dureeMois)}</td><td className="nowrap">{p.montant === 0 ? 'Sur exonération' : money(p.montant, p.devise)}</td>
                    <td>{display(p.categorie)}</td><td>{p.abonnementsEnCours}</td><td>{p.actif ? <Badge value="ACTIF" label="Proposée" /> : <Badge value="INACTIF" label="Retirée" />}</td>
                    <td className="nowrap">{canManage && <button type="button" className="text-link" onClick={() => setEditing(p)}>Modifier</button>}</td></tr>)}</tbody></table></div>
                : <Empty title="Aucune formule" description={canManage ? 'Créez la première formule avec le tarif et la durée décidés par l’institution : le public ne pourra pas s’abonner avant.' : 'Aucune formule n’est définie. Une personne habilitée doit en créer.'} icon="document" />}
        </div>
        {editing && <PlanDialog plan={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={() => setRevision(r => r + 1)} />}
    </>;
}
