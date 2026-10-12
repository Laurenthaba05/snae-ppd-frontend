import React, { useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { can } from '../core/policy';
import { Badge, Busy, Empty, ErrorNotice, Field, Modal, Notice, Pagination, formatDate, useResource } from './components';
import { MovementDialog } from './HeritageMovements';
import { navigate } from './navigation';
import { dayText } from '../core/placement';
import { MAX_DAYS_AHEAD, addDays, lateText, statusLabel as movementStatusLabel } from '../core/movements';
import {
    STAGE_NEXT_STEPS, STATUS_FILTERS, elementStageLabel, emptyOrderForm, emptyTransitionForm, isOpen, journalSummary, lotsOf, orderBody, orderProblems, pagesText, stageLabel, stageTone,
    statusLabel, timeline, transitionBody, transitionLabel, transitionProblems
} from '../core/digitizationOrders';
import type { OrderForm, OrderTransitionForm } from '../core/digitizationOrders';
import type { DigitizationOrder, DigitizationOrderJournalEntry, DigitizationOrderPage, DigitizationOrderRow, DocumentType, HeritageAsset, OrderProject, OrderStage, OrderTransitionOption } from '../core/types';

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Le badge d'une étape : une classe à part, pour que les couleurs des commandes ne se mêlent pas à celles des autres modules. */
function StageBadge({ stage, late = false }: { stage: OrderStage; late?: boolean }) {
    return <><Badge value={'D_' + stage} label={stageLabel(stage)} />{late && <Badge value="D_RETARD" label="En retard" />}</>;
}

// ---------- commande

function OrderRequestDialog({ bienId, original, onClose, onDone }: { bienId: string; original: { archiveId: string; cote: string }; onClose: () => void; onDone: (id: string) => void }) {
    const { heritage, records, epoch } = useSession();
    const key = useRef(crypto.randomUUID());
    const [form, setForm] = useState<OrderForm>(emptyOrderForm);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const typesQ = useResource<DocumentType[]>(s => records!.documentTypes(s), 'order-document-types:' + epoch);
    const today = todayIso();
    const problems = orderProblems(form, today);
    const set = (patch: Partial<OrderForm>) => setForm({ ...form, ...patch });
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) return;
        setBusy(true); setError(null);
        try {
            const saved = await heritage!.command<DigitizationOrder>('/assets/' + bienId + '/originals/' + original.archiveId + '/digitizations', orderBody(form), key.current, 'POST');
            onDone(saved.id); onClose();
        } catch (e) { setError(e); } finally { setBusy(false); }
    };
    const types = (typesQ.data ?? []).filter(t => !t.status || t.status === 'ACTIF');
    return <Modal title="Commander une numérisation" subtitle={original.cote} onClose={onClose} locked={busy} wide>
        <form onSubmit={submit}>
            <Notice>La commande crée le document qui recevra la numérisation et dépose la demande de sortie de l’original : elle sera autorisée par une autre personne que vous. L’atelier prend ensuite la commande en charge, numérise, puis une autre personne réceptionne la représentation. Il vous faut le droit de créer des documents de l’institution.</Notice>
            <div className="form-grid">
                <Field label="Pourquoi numériser * (au moins 10 caractères)" wide><textarea value={form.motif} onChange={e => set({ motif: e.target.value })} rows={3} maxLength={4000} disabled={busy} /></Field>
                <Field label="Type du document * " hint="Le document de la représentation numérique">
                    {typesQ.loading ? <Busy /> : <select value={form.typeDocumentId} onChange={e => set({ typeDocumentId: e.target.value })} disabled={busy}><option value="">Choisir…</option>
                        {types.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select>}</Field>
                <Field label="Retour prévu *" hint="Une sortie a toujours une échéance"><input type="date" min={today} max={addDays(today, MAX_DAYS_AHEAD)} value={form.retourPrevu} onChange={e => set({ retourPrevu: e.target.value })} disabled={busy} /></Field>
                <Field label="Où l’original ira *" hint="Atelier de numérisation"><input value={form.destination} onChange={e => set({ destination: e.target.value })} maxLength={255} disabled={busy} /></Field>
                <Field label="Qui le reçoit *" hint="Personne ou organisme"><input value={form.destinataire} onChange={e => set({ destinataire: e.target.value })} maxLength={255} disabled={busy} /></Field>
                <Field label="Résolution minimale (dpi)" hint="Facultatif : l’atelier choisira un lot qui la respecte"><input inputMode="numeric" value={form.resolutionMinDpi} onChange={e => set({ resolutionMinDpi: e.target.value })} disabled={busy} /></Field>
                <Field label="Nombre de pages attendu" hint="Facultatif"><input inputMode="numeric" value={form.pagesAttendues} onChange={e => set({ pagesAttendues: e.target.value })} disabled={busy} /></Field>
                <label className="field span2 asset-flag"><input type="checkbox" checked={form.rectoVerso} onChange={e => set({ rectoVerso: e.target.checked })} disabled={busy} /><span>Numérisation recto-verso</span></label>
                <Field label="Consignes pour l’atelier" wide hint="Facultatif : précautions, formats, pages à photographier à part…"><textarea value={form.consignes} onChange={e => set({ consignes: e.target.value })} rows={2} maxLength={4000} disabled={busy} /></Field>
            </div>
            {typesQ.error ? <ErrorNotice error={typesQ.error} onRetry={typesQ.refresh} /> : null}
            {problems.length > 0 && (form.motif !== '' || form.destination !== '' || form.typeDocumentId !== '') && <ul className="wf-blockers" aria-label="À compléter">{problems.map(p => <li key={p} className="warn"><span>{p}</span></li>)}</ul>}
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy || problems.length > 0}>Commander la numérisation</button></footer>
        </form>
    </Modal>;
}

// ---------- passages : prise en charge, réception, annulation

function TransitionDialog({ order, option, onClose, onDone }: { order: DigitizationOrder; option: OrderTransitionOption; onClose: () => void; onDone: () => void }) {
    const { heritage, epoch } = useSession();
    const [form, setForm] = useState<OrderTransitionForm>(emptyTransitionForm);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const taking = option.vers === 'EN_COURS';
    const projectsQ = useResource<OrderProject[]>(s => taking ? heritage!.digitizationProjects(s) : Promise.resolve([]), 'order-projects:' + taking + ':' + epoch);
    const projects = projectsQ.data ?? [];
    const problems = transitionProblems(option, order, projects, form);
    const run = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) return;
        setBusy(true); setError(null);
        try { await heritage!.command('/digitizations/' + order.id + '/transitions', transitionBody(option.vers, order.version, form), crypto.randomUUID(), 'POST'); onDone(); onClose(); }
        catch (e) { setError(e); } finally { setBusy(false); }
    };
    const lots = lotsOf(projects, form.projetId);
    return <Modal title={transitionLabel(option.vers)} subtitle={order.numero + ' · ' + order.cote} onClose={onClose} locked={busy}>
        <form onSubmit={run}>
            {taking && <Notice>Prendre la commande en charge crée l’élément de numérisation (avec l’original et le document de la commande), relie la représentation au bien et permet la remise de l’original. {order.resolutionMinDpi !== null && <>Le patrimoine impose une résolution minimale de <strong>{order.resolutionMinDpi} dpi</strong>.</>}</Notice>}
            {option.vers === 'RECEPTIONNEE' && <Notice>La réception confirme que la représentation numérique correspond à l’original et reste reliée au bien. Elle est faite par une autre personne que celle qui a commandé la numérisation.</Notice>}
            {option.vers === 'ANNULEE' && <Notice tone="warning">Annuler la commande annule la demande de sortie de l’original. Le document créé pour la numérisation reste en brouillon dans les documents. Cette décision est définitive.</Notice>}
            <div className="form-grid">
                {taking && <>
                    <Field label="Projet de numérisation *">{projectsQ.loading ? <Busy /> : <select value={form.projetId} onChange={e => setForm({ ...form, projetId: e.target.value, lotId: '' })} disabled={busy}><option value="">Choisir…</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.nom}{p.code ? ' (' + p.code + ')' : ''}</option>)}</select>}</Field>
                    <Field label={'Lot' + (order.resolutionMinDpi !== null ? ' *' : '')} hint={order.resolutionMinDpi !== null ? 'La résolution minimale du lot doit respecter la consigne' : 'Facultatif'}>
                        <select value={form.lotId} onChange={e => setForm({ ...form, lotId: e.target.value })} disabled={busy || !form.projetId}><option value="">{order.resolutionMinDpi !== null ? 'Choisir…' : 'Sans lot'}</option>
                            {lots.map(l => <option key={l.id} value={l.id}>{l.code}{l.nom ? ' — ' + l.nom : ''} ({l.resolutionMinDpi} dpi minimum)</option>)}</select></Field>
                </>}
                {(option.motifRequis || option.vers === 'RECEPTIONNEE') && <Field label={option.vers === 'RECEPTIONNEE' ? 'Note de réception' : 'Motif * (au moins 10 caractères)'} wide hint={option.vers === 'RECEPTIONNEE' ? 'Facultatif : pages contrôlées, réserves…' : undefined}>
                    <textarea value={form.texte} onChange={e => setForm({ ...form, texte: e.target.value })} rows={3} maxLength={4000} disabled={busy} /></Field>}
            </div>
            {projectsQ.error ? <ErrorNotice error={projectsQ.error} onRetry={projectsQ.refresh} /> : null}
            {problems.length > 0 && (form.texte !== '' || form.projetId !== '' || form.lotId !== '') && <ul className="wf-blockers" aria-label="À compléter">{problems.map(p => <li key={p} className="warn"><span>{p}</span></li>)}</ul>}
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Retour</button><button type="submit" className="btn primary" disabled={busy || problems.length > 0}>Confirmer</button></footer>
        </form>
    </Modal>;
}

// ---------- fiche d'une commande

export function DigitizationOrderDialog({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
    const { me, heritage, epoch } = useSession();
    const [revision, setRevision] = useState(0);
    const [chosen, setChosen] = useState<OrderTransitionOption | null>(null);
    const [movementOpen, setMovementOpen] = useState(false);
    const q = useResource<DigitizationOrder>(s => heritage!.digitization(id, s), 'digitization:' + id + ':' + revision + ':' + epoch);
    const journalQ = useResource<DigitizationOrderJournalEntry[]>(s => heritage!.digitizationJournal(id, s), 'digitization-journal:' + id + ':' + revision + ':' + epoch);
    const last = useRef<DigitizationOrder | null>(null);
    if (q.data) last.current = q.data;
    const order = q.data ?? last.current;
    const refresh = () => { setRevision(r => r + 1); onChanged(); };
    if (!order && q.loading) return <Modal title="Commande de numérisation" onClose={onClose} wide><Busy /></Modal>;
    if (!order) return <Modal title="Commande de numérisation" onClose={onClose} wide><ErrorNotice error={q.error} onRetry={q.refresh} /></Modal>;
    const late = lateText(order.mouvement);
    const steps = timeline(order);
    return <Modal title={order.bienIntitule} subtitle={order.numero + ' · ' + order.bienIdentifiant + ' · ' + order.cote} onClose={onClose} wide>
        <div className="entry-head"><Badge value={'D_' + order.statut} label={statusLabel(order.statut)} />{order.etape !== order.statut && <StageBadge stage={order.etape} late={order.mouvement.enRetard} />}{order.reprise && <Badge value="D_REPRISE" label="Nouvelle numérisation" />}</div>
        <p className="placement-summary modal-summary">{STAGE_NEXT_STEPS[order.etape]}{late && ' ' + late + '.'}</p>
        <ol className="order-timeline" aria-label="Déroulé de la numérisation">{steps.map(s => <li key={s.key} className={s.state}><span aria-hidden="true" className="order-dot" />{s.label}<small>{s.state === 'done' ? 'Fait' : s.state === 'current' ? 'En cours' : s.state === 'cancelled' ? 'Annulé' : 'À venir'}</small></li>)}</ol>
        {order.passages.length > 0 && <div className="asset-transitions"><div className="table-actions">{order.passages.map(option => {
            const blocked = option.bloquants.length > 0;
            const why = !option.peutAgir ? 'Habilitation requise : ' + option.permissions.join(' ou ') : blocked ? 'Conditions non remplies' : undefined;
            return <button key={option.vers} type="button" className={'btn small ' + (option.vers === 'ANNULEE' ? 'secondary' : 'primary')} disabled={!option.peutAgir || blocked} title={why} onClick={() => setChosen(option)}>{transitionLabel(option.vers)}</button>;
        })}</div>
            {order.passages.filter(o => o.peutAgir && o.bloquants.length > 0).map(o => <ul key={o.vers} className="wf-blockers" aria-label={transitionLabel(o.vers)}>{o.bloquants.map(b => <li key={b.code} className="bad"><span>{b.message}</span></li>)}</ul>)}</div>}
        <div className="asset-tab">
            <dl className="asset-fields">
                <div className="wide"><dt>Pourquoi numériser</dt><dd className="conservation-text">{order.motif}</dd></div>
                {order.consignes && <div className="wide"><dt>Consignes pour l’atelier</dt><dd className="conservation-text">{order.consignes}</dd></div>}
                <div><dt>Résolution minimale</dt><dd>{order.resolutionMinDpi !== null ? order.resolutionMinDpi + ' dpi' : 'Non imposée'}</dd></div>
                <div><dt>Pages attendues</dt><dd>{order.pagesAttendues !== null ? order.pagesAttendues : 'Non précisé'}{order.rectoVerso && <small className="cell-sub">Recto-verso</small>}</dd></div>
                <div><dt>Document de la représentation</dt><dd className="nowrap">{order.documentIdentifiant}</dd></div>
                <div><dt>Commandée</dt><dd>{dayText(order.commande.le)}{order.commande.par && <small className="cell-sub">par {order.commande.par}</small>}</dd></div>
                {order.priseEnCharge && <div><dt>Prise en charge</dt><dd>{dayText(order.priseEnCharge.le)}{order.priseEnCharge.par && <small className="cell-sub">par {order.priseEnCharge.par}</small>}</dd></div>}
                {order.reception && <div><dt>Réceptionnée</dt><dd>{dayText(order.reception.le)}{order.reception.par && <small className="cell-sub">par {order.reception.par}</small>}</dd></div>}
                {order.receptionNote && <div className="wide"><dt>Note de réception</dt><dd>{order.receptionNote}</dd></div>}
                {order.fermeture && <div><dt>Annulée</dt><dd>{dayText(order.fermeture.le)}{order.fermeture.par && <small className="cell-sub">par {order.fermeture.par}</small>}</dd></div>}
                {order.fermeMotif && <div className="wide"><dt>Motif de l’annulation</dt><dd>{order.fermeMotif}</dd></div>}
            </dl>
            <section className="asset-group"><h4>Sortie de l’original</h4>
                <p className="placement-summary"><strong>{order.mouvement.numero}</strong> — {movementStatusLabel(order.mouvement.statut)} · vers {order.mouvement.destination} ({order.mouvement.destinataire}), retour prévu le {dayText(order.mouvement.retourPrevu)}{late && ' · ' + late}</p>
                <div className="table-actions"><button type="button" className="btn small secondary" onClick={() => setMovementOpen(true)}>Ouvrir la sortie</button></div></section>
            {order.element && <section className="asset-group"><h4>Suivi du traitement</h4>
                <p className="placement-summary">{order.element.projetNom}{order.element.lotCode && ' · lot ' + order.element.lotCode} — {elementStageLabel(order.element.statut)} · {pagesText(order.element)}</p>
                {can(me, 'DIGITIZATION_READ', {}) && <div className="table-actions"><button type="button" className="btn small secondary" onClick={() => { onClose(); navigate('/app/numerisation?project=' + order.element!.projetId + '&element=' + order.element!.id); }}>Ouvrir dans le suivi du traitement</button></div>}</section>}
            <section className="asset-group"><h4>Historique</h4>
                {journalQ.loading ? <Busy /> : journalQ.error ? <ErrorNotice error={journalQ.error} onRetry={journalQ.refresh} /> : <ol className="wf-history asset-journal">{[...(journalQ.data ?? [])].reverse().map(e => <li key={e.id}>
                    <time dateTime={e.createdAt}>{formatDate(e.createdAt)}</time>
                    <span>{journalSummary(e.genre, e.ancienneValeur, e.nouvelleValeur)}</span>
                    {e.motif && <p>Motif : {e.motif}</p>}</li>)}</ol>}</section>
        </div>
        {chosen && <TransitionDialog order={order} option={chosen} onClose={() => setChosen(null)} onDone={refresh} />}
        {movementOpen && <MovementDialog id={order.mouvement.id} onClose={() => setMovementOpen(false)} onChanged={refresh} />}
        <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose}>Fermer</button></footer>
    </Modal>;
}

// ---------- onglet « Numérisation » d'un bien

function OriginalDigitization({ original, orders, canOrder, onOpen, onOrder }: {
    original: HeritageAsset['originaux'][number]; orders: DigitizationOrderRow[]; canOrder: boolean; onOpen: (id: string) => void; onOrder: (archiveId: string, cote: string) => void;
}) {
    const mine = orders.filter(r => r.archiveId === original.archivePhysiqueId);
    const open = mine.find(r => isOpen(r.statut));
    const closed = mine.filter(r => !isOpen(r.statut));
    return <section className={'placement-card ' + stageTone(open?.etape ?? 'ANNULEE', open?.enRetard ?? false)} aria-label={'Numérisation de ' + original.cote}>
        <div className="section-heading"><h4>{original.cote}{original.libelle && ' — ' + original.libelle}</h4>
            <span className="placement-gaps">{open ? <StageBadge stage={open.etape} late={open.enRetard} /> : <Badge value="D_AUCUNE" label="Aucune commande ouverte" />}</span></div>
        {open
            ? <p className="placement-summary"><strong>{open.numero}</strong> — {STAGE_NEXT_STEPS[open.etape]}{open.enRetard && ' ' + lateText(open) + '.'}</p>
            : <p className="placement-summary">Cet original n’a pas de numérisation en cours. Pour en produire une représentation numérique, commandez sa numérisation : la sortie sera autorisée par une autre personne et la représentation réceptionnée par une autre personne.</p>}
        <div className="table-actions">
            {open && <button type="button" className="btn small primary" onClick={() => onOpen(open.id)}>Ouvrir la commande</button>}
            {!open && canOrder && <button type="button" className="btn small primary" onClick={() => onOrder(original.archivePhysiqueId, original.cote)}>Commander une numérisation</button>}
        </div>
        {closed.length > 0 && <section className="asset-group"><h4>Commandes closes</h4><ul className="asset-links">{closed.map(r => <li key={r.id}>
            <span><strong>{r.numero}</strong> <StageBadge stage={r.etape} />{r.reprise && <small> · nouvelle numérisation</small>}<small> · commandée le {dayText(r.commandeLe)}{r.commandePar && ' par ' + r.commandePar}</small></span>
            <button type="button" className="btn small secondary" onClick={() => onOpen(r.id)}>Ouvrir</button></li>)}</ul></section>}
    </section>;
}

export function DigitizationTab({ asset, onChanged }: { asset: HeritageAsset; onChanged: () => void }) {
    const { me, heritage, epoch } = useSession();
    const [revision, setRevision] = useState(0);
    const [opened, setOpened] = useState<string | null>(null);
    const [ordering, setOrdering] = useState<{ archiveId: string; cote: string } | null>(null);
    const q = useResource<DigitizationOrderPage>(s => heritage!.digitizations({ bienId: asset.id, page: 0, size: 100 }, s), 'asset-digitizations:' + asset.id + ':' + asset.version + ':' + revision + ':' + epoch);
    const last = useRef<DigitizationOrderPage | null>(null);
    if (q.data) last.current = q.data;
    const data = q.data ?? last.current;
    const canOrder = can(me, 'HERITAGE_DIGITIZATION_ORDER', { institutionId: asset.institutionId, departmentId: asset.departementId });
    const changed = () => { setRevision(r => r + 1); onChanged(); };
    if (!data && q.loading) return <Busy />;
    if (!data) return <ErrorNotice error={q.error} onRetry={q.refresh} />;
    const digital = asset.champs.natureOriginale === 'NUMERIQUE_NATIF';
    return <div className="asset-tab">
        <Notice>La numérisation d’un original se commande : la sortie est autorisée par une autre personne, l’atelier numérise dans le suivi du traitement, l’original ne rentre qu’après le contrôle qualité des pages, puis une autre personne réceptionne la représentation numérique, qui reste reliée au bien.</Notice>
        {asset.originaux.length === 0
            ? <Empty title={digital ? 'Bien numérique natif' : 'Aucun original relié'} description={digital ? 'Il n’y a pas d’original physique à numériser.' : 'Reliez l’archive physique dans l’onglet « Ressources et liens » pour pouvoir en commander la numérisation.'} />
            : asset.originaux.map(o => <OriginalDigitization key={o.archivePhysiqueId} original={o} orders={data.items} canOrder={canOrder} onOpen={setOpened} onOrder={(archiveId, cote) => setOrdering({ archiveId, cote })} />)}
        {ordering && <OrderRequestDialog bienId={asset.id} original={ordering} onClose={() => setOrdering(null)} onDone={id => { changed(); setOpened(id); }} />}
        {opened && <DigitizationOrderDialog id={opened} onClose={() => setOpened(null)} onChanged={changed} />}
    </div>;
}

// ---------- liste des commandes (page Patrimoine)

export function DigitizationOrdersPanel() {
    const { heritage, epoch } = useSession();
    const [form, setForm] = useState({ statut: 'OUVERTES', q: '', mine: false });
    const [applied, setApplied] = useState(form);
    const [page, setPage] = useState(0);
    const [revision, setRevision] = useState(0);
    const [opened, setOpened] = useState<string | null>(null);
    const filters = { statut: applied.statut, q: applied.q, mine: applied.mine ? 'true' : '' };
    const listQ = useResource<DigitizationOrderPage>(s => heritage!.digitizations({ ...filters, page, size: 20 }, s), JSON.stringify(['heritage-digitizations', applied, page, revision, epoch]));
    const apply = (next: typeof form) => { setForm(next); setApplied(next); setPage(0); };
    const items = listQ.data?.items ?? [];
    const filtered = applied.statut !== 'OUVERTES' || applied.q || applied.mine;
    return <>
        <div className="panel">
            <div className="section-heading"><h3>Numérisation des biens</h3></div>
            <p className="wf-note">Les numérisations commandées par le patrimoine : celles que l’atelier doit prendre en charge d’abord, puis celles en cours, puis les closes. Chaque commande relie la sortie de l’original, l’élément du suivi du traitement et la représentation du bien.</p>
            <form className="asset-filters" onSubmit={e => { e.preventDefault(); apply(form); }} role="search" aria-label="Rechercher une commande de numérisation">
                <Field label="Recherche"><input value={form.q} onChange={e => setForm({ ...form, q: e.target.value })} placeholder="Numéro, cote ou bien" /></Field>
                <Field label="Étape"><select value={form.statut} onChange={e => apply({ ...form, statut: e.target.value })}><option value="">Toutes</option>{STATUS_FILTERS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                <label className="field asset-flag"><input type="checkbox" checked={form.mine} onChange={e => apply({ ...form, mine: e.target.checked })} /><span>Mes commandes</span></label>
                <button type="submit" className="btn small secondary">Rechercher</button>
            </form>
            {listQ.loading ? <Busy /> : listQ.error ? <ErrorNotice error={listQ.error} onRetry={listQ.refresh} /> : items.length ? <>
                <p className="wf-note" role="status">{listQ.data!.total} commande{listQ.data!.total > 1 ? 's' : ''}</p>
                <div className="table-scroll"><table><thead><tr><th>Commande</th><th>Bien</th><th>Original</th><th>Retour prévu</th><th>Suivi du traitement</th><th>Étape</th></tr></thead>
                    <tbody>{items.map(r => <tr key={r.id}>
                        <td className="nowrap"><button type="button" className="text-link" onClick={() => setOpened(r.id)}>{r.numero}</button><small className="cell-sub">{dayText(r.commandeLe)}{r.commandePar && ' · ' + r.commandePar}{r.reprise && ' · nouvelle numérisation'}</small></td>
                        <td>{r.bienIdentifiant}<small className="cell-sub">{r.bienIntitule}</small></td>
                        <td className="nowrap">{r.cote}</td>
                        <td className="nowrap">{dayText(r.retourPrevu)}{r.enRetard && <small className="cell-sub bad">{lateText(r)}</small>}</td>
                        <td>{r.elementStatut ? elementStageLabel(r.elementStatut) : '—'}</td>
                        <td><StageBadge stage={r.etape} late={r.enRetard} /></td></tr>)}</tbody></table></div>
                <Pagination page={page} hasMore={listQ.data?.hasMore ?? false} onChange={setPage} count={items.length} />
            </> : <Empty title="Aucune commande" description={filtered ? 'Aucune commande ne correspond à ces critères.' : 'Aucune numérisation n’est commandée ni en cours dans votre périmètre. Les commandes se passent depuis la fiche d’un bien, onglet « Numérisation ».'} />}
        </div>
        {opened && <DigitizationOrderDialog id={opened} onClose={() => setOpened(null)} onChanged={() => setRevision(r => r + 1)} />}
    </>;
}
