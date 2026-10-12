import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { Badge, Busy, Empty, ErrorNotice, Field, Modal, Notice, formatDate, useResource } from './components';
import { can } from '../core/policy';
import { ReasonPrompt, ReaderPicker, useAction } from './ReadingRoomParts';
import {
    MAX_ORDER_LINES, ORDER_LABELS, UNIT_LABELS, moneyText, orderActions, orderBlockedText, orderBody, orderProblems, orderTotal, parsePrice, tariffProblems,
    type Order, type OrderItemDraft, type OrderStatus, type OrderSummary, type Tariff, type TariffUnit
} from '../core/readingRoom';

const STATUS_BADGES: Record<OrderStatus, string> = { DEMANDEE: 'DEMANDEE', ACCEPTEE: 'APPROUVEE', REALISEE: 'TERMINEE', LIVREE: 'REMISE', REFUSEE: 'REFUSEE', ANNULEE: 'ANNULEE' };

/** Les commandes de reproduction : devis au tarif du jour (figé), acceptation, encaissement enregistré au guichet, réalisation, remise. Le système n'exécute aucun paiement. */
export function ReadingRoomOrders({ institutionId }: { institutionId: string }) {
    const { me, readingRoom, epoch } = useSession();
    const mayDesk = can(me, 'READING_ROOM_DESK', { institutionId });
    const [status, setStatus] = useState('');
    const [revision, setRevision] = useState(0);
    const [creating, setCreating] = useState(false);
    const [opened, setOpened] = useState<string | null>(null);
    const q = useResource<OrderSummary[]>(s => readingRoom!.orders(institutionId, { status: status || null }, s), `rr-orders:${institutionId}:${status}:${revision}:${epoch}`);
    const list = q.data ?? [];
    return <>
        <div className="panel" aria-label="Commandes de reproduction" role="region">
            <div className="section-heading"><h3>Commandes de reproduction</h3>{mayDesk && <button type="button" className="btn small primary" onClick={() => setCreating(true)}>Nouvelle commande</button>}</div>
            <div className="panel-padding"><Notice>Le prix de chaque ligne est celui du tarif au jour de la commande. L’encaissement est fait au guichet : on enregistre ici sa référence (quittance), le système
                n’exécute aucun paiement. Les reproductions ne sont remises qu’une fois l’encaissement enregistré.</Notice></div>
            <div className="table-toolbar"><select aria-label="État de la commande" value={status} onChange={e => setStatus(e.target.value)}>
                <option value="">Toutes les commandes</option>{(Object.keys(ORDER_LABELS) as OrderStatus[]).map(s => <option key={s} value={s}>{ORDER_LABELS[s]}</option>)}</select></div>
            {q.loading && !q.data ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} />
                : list.length === 0 ? <Empty title="Aucune commande" description="Aucune commande de reproduction ne correspond à ce filtre." icon="document" />
                    : <div className="table-scroll"><table><thead><tr><th>Commande</th><th>Lecteur</th><th>État</th><th>Total</th><th>Encaissement</th><th>Passée le</th><th><span className="sr-only">Actions</span></th></tr></thead>
                        <tbody>{list.map(o => <tr key={o.id}>
                            <td><strong>{o.number}</strong></td>
                            <td>{o.readerName}<small className="cell-sub">{o.readerNumber}</small></td>
                            <td><Badge value={STATUS_BADGES[o.status]} label={ORDER_LABELS[o.status]} /></td>
                            <td>{moneyText(o.total, o.currency)}</td>
                            <td>{Number(o.total) === 0 ? 'Gratuit' : o.paid ? 'Enregistré' : 'À encaisser'}</td>
                            <td>{formatDate(o.createdAt)}</td>
                            <td className="table-actions"><button type="button" className="btn small secondary" onClick={() => setOpened(o.id)}>Ouvrir</button></td>
                        </tr>)}</tbody></table></div>}
            {creating && <NewOrderDialog institutionId={institutionId} onClose={() => setCreating(false)} onDone={o => { setCreating(false); setRevision(n => n + 1); setOpened(o.summary.id); }} />}
            {opened && <OrderDialog id={opened} institutionId={institutionId} onClose={() => setOpened(null)} onChanged={() => setRevision(n => n + 1)} />}
        </div>
        <ReadingRoomTariffs institutionId={institutionId} />
    </>;
}

function NewOrderDialog({ institutionId, onClose, onDone }: { institutionId: string; onClose: () => void; onDone: (order: Order) => void }) {
    const { readingRoom, epoch } = useSession();
    const tariffsQ = useResource<Tariff[]>(s => readingRoom!.tariffs(institutionId, false, s), `rr-order-tariffs:${institutionId}:${epoch}`);
    const tariffs = tariffsQ.data ?? [];
    const [readerId, setReaderId] = useState('');
    const [items, setItems] = useState<OrderItemDraft[]>([{ tariffId: '', quantity: '1', description: '' }]);
    const [observations, setObservations] = useState('');
    const [attempted, setAttempted] = useState(false);
    const action = useAction();
    const problems = orderProblems(readerId, items, tariffs);
    const total = orderTotal(items, tariffs);
    const setItem = (index: number, patch: Partial<OrderItemDraft>) => setItems(prev => prev.map((it, i) => i === index ? { ...it, ...patch } : it));
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) { setAttempted(true); return; }
        const body = orderBody(institutionId, readerId, null, items, observations);
        const created = await action.run(body, key => readingRoom!.createOrder(body, key));
        if (created) onDone(created);
    };
    return <Modal wide title="Nouvelle commande de reproduction" subtitle="Les prix sont ceux des tarifs en vigueur ; ils sont figés à la commande" onClose={onClose} locked={action.busy}>
        <form onSubmit={submit}>
            {tariffsQ.loading && !tariffsQ.data ? <Busy /> : tariffsQ.error ? <ErrorNotice error={tariffsQ.error} onRetry={tariffsQ.refresh} />
                : tariffs.length === 0 ? <Notice tone="warning">Aucun tarif n’est défini : la personne qui configure la salle doit d’abord en créer.</Notice> : <>
                    <ReaderPicker institutionId={institutionId} value={readerId} onChange={id => setReaderId(id)} disabled={action.busy} />
                    <div className="table-scroll"><table><thead><tr><th>Tarif</th><th>Quantité</th><th>Précision</th><th><span className="sr-only">Actions</span></th></tr></thead>
                        <tbody>{items.map((item, index) => <tr key={index}>
                            <td><select aria-label={`Tarif de la ligne ${index + 1}`} value={item.tariffId} onChange={e => setItem(index, { tariffId: e.target.value })} disabled={action.busy}>
                                <option value="">Choisir…</option>{tariffs.map(t => <option key={t.id} value={t.id}>{t.label} — {moneyText(t.unitPrice, t.currency)} / {UNIT_LABELS[t.unit]}</option>)}</select></td>
                            <td><input aria-label={`Quantité de la ligne ${index + 1}`} inputMode="numeric" value={item.quantity} onChange={e => setItem(index, { quantity: e.target.value })} disabled={action.busy} /></td>
                            <td><input aria-label={`Précision de la ligne ${index + 1}`} placeholder="Pages 12 à 21…" maxLength={500} value={item.description} onChange={e => setItem(index, { description: e.target.value })} disabled={action.busy} /></td>
                            <td className="table-actions">{items.length > 1 && <button type="button" className="btn small secondary" disabled={action.busy} onClick={() => setItems(prev => prev.filter((_, i) => i !== index))}>Retirer</button>}</td>
                        </tr>)}</tbody></table></div>
                    {items.length < MAX_ORDER_LINES && <button type="button" className="btn small secondary" disabled={action.busy} onClick={() => setItems(prev => [...prev, { tariffId: '', quantity: '1', description: '' }])}>Ajouter une ligne</button>}
                    <p><strong>Total : {total ? moneyText(total.amount, total.currency) : '—'}</strong></p>
                    <Field label="Observations" wide><textarea value={observations} onChange={e => setObservations(e.target.value)} rows={2} maxLength={2000} disabled={action.busy} /></Field>
                </>}
            {attempted && problems.length > 0 && <Notice tone="warning"><ul>{problems.map(p => <li key={p}>{p}</li>)}</ul></Notice>}
            {action.error ? <ErrorNotice error={action.error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Fermer</button>
                <button type="submit" className="btn primary" disabled={action.busy || tariffs.length === 0}>Enregistrer la commande</button></footer>
        </form>
    </Modal>;
}

function OrderDialog({ id, institutionId, onClose, onChanged }: { id: string; institutionId: string; onClose: () => void; onChanged: () => void }) {
    const { me, readingRoom, epoch } = useSession();
    const mayDesk = can(me, 'READING_ROOM_DESK', { institutionId });
    const [revision, setRevision] = useState(0);
    const [reference, setReference] = useState('');
    const [reason, setReason] = useState<'refuse' | 'cancel' | null>(null);
    const action = useAction();
    const q = useResource<Order>(s => readingRoom!.order(id, s), `rr-order:${id}:${revision}:${epoch}`);
    const order = q.data;
    const actions = order ? orderActions(order) : null;
    const changed = () => { setRevision(n => n + 1); onChanged(); };
    const simple = (name: string, call: (key: string) => Promise<unknown>) => async () => { if (await action.run({ name, id }, call)) changed(); };
    const record = async () => { if (await action.run({ pay: id, reference: reference.trim() }, key => readingRoom!.recordPayment(id, reference.trim(), key))) { setReference(''); changed(); } };
    const blocked = order ? orderBlockedText(order) : null;
    return <Modal wide title={order ? `Commande ${order.summary.number}` : 'Commande'} subtitle={order ? `${order.summary.readerName} — ${ORDER_LABELS[order.summary.status]}` : undefined} onClose={onClose} locked={action.busy}>
        {q.loading && !order ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : order && actions && <>
            {order.reason && <Notice tone="warning">{order.summary.status === 'REFUSEE' ? 'Refusée' : 'Annulée'} : {order.reason}</Notice>}
            {order.observations && <p><small>{order.observations}</small></p>}
            <div className="table-scroll"><table><thead><tr><th>Prestation</th><th>Quantité</th><th>Prix unitaire</th><th>Montant</th><th>Document</th></tr></thead>
                <tbody>{order.lines.map(l => <tr key={l.id}>
                    <td>{l.label}{l.description && <small className="cell-sub">{l.description}</small>}</td>
                    <td>{l.quantity} {UNIT_LABELS[l.unit as TariffUnit] ?? ''}</td>
                    <td>{moneyText(l.unitPrice, order.summary.currency)}</td>
                    <td>{moneyText(l.amount, order.summary.currency)}</td>
                    <td>{l.archiveCote ?? '—'}</td>
                </tr>)}</tbody>
                <tfoot><tr><th colSpan={3}>Total</th><td colSpan={2}><strong>{moneyText(order.summary.total, order.summary.currency)}</strong></td></tr></tfoot></table></div>
            {order.paymentReference ? <p><small>Encaissement enregistré : {order.paymentReference}{order.paidAt ? `, le ${formatDate(order.paidAt)}` : ''}.</small></p>
                : Number(order.summary.total) > 0 && <p><small>Encaissement non enregistré.</small></p>}
            {blocked && <Notice tone="warning">{blocked}</Notice>}
            {action.error ? <ErrorNotice error={action.error} /> : null}
            {mayDesk && actions.payment && <div className="form-grid">
                <Field label="Référence de l’encaissement" hint="La quittance remise au lecteur au guichet." wide>
                    <span className="inline-field"><input value={reference} maxLength={255} onChange={e => setReference(e.target.value)} disabled={action.busy} />
                        <button type="button" className="btn small primary" disabled={action.busy || !reference.trim()} onClick={record}>Enregistrer l’encaissement</button></span></Field>
            </div>}
            {mayDesk && <footer className="modal-footer">
                {actions.cancel && <button type="button" className="btn danger" disabled={action.busy} onClick={() => setReason('cancel')}>Annuler</button>}
                {actions.refuse && <button type="button" className="btn secondary" disabled={action.busy} onClick={() => setReason('refuse')}>Refuser</button>}
                {actions.accept && <button type="button" className="btn primary" disabled={action.busy} onClick={simple('accept', key => readingRoom!.acceptOrder(id, key))}>Accepter</button>}
                {actions.complete && <button type="button" className="btn primary" disabled={action.busy} onClick={simple('complete', key => readingRoom!.completeOrder(id, key))}>Reproductions réalisées</button>}
                {actions.deliver && <button type="button" className="btn primary" disabled={action.busy} onClick={simple('deliver', key => readingRoom!.deliverOrder(id, key))}>Remettre au lecteur</button>}
            </footer>}
            {reason && <ReasonPrompt title={reason === 'refuse' ? 'Refuser la commande' : 'Annuler la commande'} subtitle={order.summary.number}
                hint={reason === 'refuse' ? 'Dites pourquoi : document trop fragile, hors périmètre…' : 'Dites pourquoi : renoncement du lecteur, erreur de saisie…'}
                confirm={reason === 'refuse' ? 'Refuser' : 'Annuler la commande'} onClose={() => setReason(null)}
                onSubmit={async (text, key) => { if (reason === 'refuse') await readingRoom!.refuseOrder(id, text, key); else await readingRoom!.cancelOrder(id, text, key); changed(); }} />}
        </>}
    </Modal>;
}

/** Les tarifs : des données de l'institution (jamais livrés tout faits). Un tarif ne se modifie pas : on le retire et on en crée un nouveau. */
export function ReadingRoomTariffs({ institutionId }: { institutionId: string }) {
    const { me, readingRoom, epoch } = useSession();
    const mayManage = can(me, 'READING_ROOM_MANAGE', { institutionId });
    const [revision, setRevision] = useState(0);
    const [creating, setCreating] = useState(false);
    const [all, setAll] = useState(false);
    const action = useAction();
    const q = useResource<Tariff[]>(s => readingRoom!.tariffs(institutionId, all, s), `rr-tariffs:${institutionId}:${all}:${revision}:${epoch}`);
    const list = q.data ?? [];
    const retire = async (t: Tariff) => { if (await action.run({ retire: t.id }, key => readingRoom!.retireTariff(t.id, key))) setRevision(n => n + 1); };
    return <div className="panel" aria-label="Tarifs de reproduction" role="region">
        <div className="section-heading"><h3>Tarifs de reproduction</h3>{mayManage && <button type="button" className="btn small primary" onClick={() => setCreating(true)}>Nouveau tarif</button>}</div>
        <div className="table-toolbar"><label className="check-row"><input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} /> Afficher aussi les tarifs retirés</label></div>
        {action.error ? <ErrorNotice error={action.error} /> : null}
        {q.loading && !q.data ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} />
            : list.length === 0 ? <Empty title="Aucun tarif" description="Les tarifs sont fixés par l’institution : créez-les avant d’enregistrer des commandes." icon="document" />
                : <div className="table-scroll"><table><thead><tr><th>Tarif</th><th>Unité</th><th>Prix unitaire</th><th>État</th><th><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>{list.map(t => <tr key={t.id}>
                        <td><strong>{t.label}</strong><small className="cell-sub">{t.code}</small></td>
                        <td>{UNIT_LABELS[t.unit]}</td>
                        <td>{moneyText(t.unitPrice, t.currency)}</td>
                        <td><Badge value={t.status === 'ACTIF' ? 'ACTIF' : 'RETIRE'} label={t.status === 'ACTIF' ? 'En vigueur' : 'Retiré'} /></td>
                        <td className="table-actions">{mayManage && t.status === 'ACTIF' && <button type="button" className="btn small secondary" disabled={action.busy} onClick={() => retire(t)}>Retirer</button>}</td>
                    </tr>)}</tbody></table></div>}
        {creating && <TariffDialog institutionId={institutionId} onClose={() => setCreating(false)} onDone={() => { setCreating(false); setRevision(n => n + 1); }} />}
    </div>;
}

function TariffDialog({ institutionId, onClose, onDone }: { institutionId: string; onClose: () => void; onDone: () => void }) {
    const { readingRoom } = useSession();
    const [code, setCode] = useState('');
    const [label, setLabel] = useState('');
    const [unit, setUnit] = useState('');
    const [price, setPrice] = useState('');
    const [currency, setCurrency] = useState('GNF');
    const [attempted, setAttempted] = useState(false);
    const action = useAction();
    const problems = tariffProblems(code, label, unit, price, currency);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) { setAttempted(true); return; }
        const body = { institutionId, code: code.trim(), label: label.trim(), unit, unitPrice: parsePrice(price), currency: currency.trim().toUpperCase() };
        if (await action.run(body, key => readingRoom!.createTariff(body, key))) onDone();
    };
    return <Modal title="Nouveau tarif de reproduction" subtitle="Un tarif ne se modifie pas : retirez-le et créez-en un autre" onClose={onClose} locked={action.busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Code *"><input value={code} onChange={e => setCode(e.target.value)} maxLength={40} disabled={action.busy} /></Field>
                <Field label="Libellé *"><input value={label} onChange={e => setLabel(e.target.value)} maxLength={200} disabled={action.busy} /></Field>
                <Field label="Unité *"><select value={unit} onChange={e => setUnit(e.target.value)} disabled={action.busy}>
                    <option value="">Choisir…</option>{(Object.keys(UNIT_LABELS) as TariffUnit[]).map(u => <option key={u} value={u}>{UNIT_LABELS[u]}</option>)}</select></Field>
                <Field label="Prix unitaire *"><input inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} disabled={action.busy} /></Field>
                <Field label="Devise *" hint="Code de trois lettres : GNF, EUR…"><input value={currency} onChange={e => setCurrency(e.target.value)} maxLength={3} disabled={action.busy} /></Field>
            </div>
            {attempted && problems.length > 0 && <Notice tone="warning"><ul>{problems.map(p => <li key={p}>{p}</li>)}</ul></Notice>}
            {action.error ? <ErrorNotice error={action.error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={action.busy}>Fermer</button>
                <button type="submit" className="btn primary" disabled={action.busy}>Créer le tarif</button></footer>
        </form>
    </Modal>;
}
