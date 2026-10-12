import React, { useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { can } from '../core/policy';
import { Badge, Busy, Empty, ErrorNotice, Field, Modal, Notice, Pagination, formatDate, useResource } from './components';
import { ReportFields, useAlterations } from './HeritageConservation';
import { dayText } from '../core/placement';
import {
    NEXT_STEPS, PURPOSE_CHOICES, PURPOSE_LABELS, STATUS_FILTERS, MAX_DAYS_AHEAD, addDays, emptyRequestForm, emptyTransitionForm, isOpen, journalSummary, lateText, movementBody, movementNeeds, movementTransitionProblems,
    needsForm, purposeLabel, requestBody, requestOf, requestProblems, statusLabel, transitionLabel
} from '../core/movements';
import type { MovementTransitionForm, RequestForm } from '../core/movements';
import type { HeritageAsset, HeritageReference, MovementJournalEntry, MovementPage, MovementPurpose, MovementRequest, MovementRequestStatus, MovementRow, MovementTransitionOption } from '../core/types';

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Le badge d'une étape : une classe à part, pour que les couleurs des demandes ne se mêlent pas à celles des autres modules. */
function StatusBadge({ status, late = false }: { status: MovementRequestStatus; late?: boolean }) {
    return <><Badge value={'R_' + status} label={statusLabel(status)} />{late && <Badge value="R_RETARD" label="En retard" />}</>;
}

// ---------- demande (dépôt ou modification tant qu'elle n'est pas autorisée)

function RequestDialog({ bienId, original, movement, onClose, onDone }: { bienId: string; original: { archiveId: string; cote: string }; movement?: MovementRequest; onClose: () => void; onDone: (id: string) => void }) {
    const { heritage } = useSession();
    const key = useRef(crypto.randomUUID());
    const [form, setForm] = useState<RequestForm>(() => movement ? requestOf(movement) : emptyRequestForm());
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const today = todayIso();
    const problems = requestProblems(form, today);
    const set = (patch: Partial<RequestForm>) => setForm({ ...form, ...patch });
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) return;
        setBusy(true); setError(null);
        try {
            const saved = movement
                ? await heritage!.command<MovementRequest>('/movements/' + movement.id, { ...requestBody(form), expectedVersion: movement.version }, crypto.randomUUID(), 'PUT')
                : await heritage!.command<MovementRequest>('/assets/' + bienId + '/originals/' + original.archiveId + '/movements', requestBody(form), key.current, 'POST');
            onDone(saved.id); onClose();
        } catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal title={movement ? 'Modifier la demande' : 'Demander la sortie de l’original'} subtitle={original.cote + (movement ? ' · ' + movement.numero : '')} onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <Notice>Un original ne sort pas sans demande : elle est autorisée par une autre personne que vous, puis l’original est remis et la sortie s’inscrit à l’historique des mouvements. Vous pouvez modifier la demande tant qu’elle n’est pas autorisée.</Notice>
            <div className="form-grid">
                <Field label="Pour quoi *"><select value={form.objet} onChange={e => set({ objet: e.target.value as MovementPurpose })} disabled={busy}><option value="">Choisir…</option>
                    {PURPOSE_CHOICES.map(k => <option key={k} value={k}>{PURPOSE_LABELS[k]}</option>)}</select></Field>
                <Field label="Retour prévu *" hint="Une sortie a toujours une échéance (cinq ans au plus)"><input type="date" min={today} max={addDays(today, MAX_DAYS_AHEAD)} value={form.retourPrevu} onChange={e => set({ retourPrevu: e.target.value })} disabled={busy} /></Field>
                <Field label="Où l’original ira *" hint="Salle de lecture, atelier de numérisation, musée…"><input value={form.destination} onChange={e => set({ destination: e.target.value })} maxLength={255} disabled={busy} /></Field>
                <Field label="Qui le reçoit *" hint="Personne ou organisme"><input value={form.destinataire} onChange={e => set({ destinataire: e.target.value })} maxLength={255} disabled={busy} /></Field>
                <Field label="Motif * (au moins 10 caractères)" wide hint="Pourquoi l’original doit sortir de réserve"><textarea value={form.motif} onChange={e => set({ motif: e.target.value })} rows={3} maxLength={4000} disabled={busy} /></Field>
            </div>
            {problems.length > 0 && (form.objet !== '' || form.motif !== '' || form.destination !== '') && <ul className="wf-blockers" aria-label="À compléter">{problems.map(p => <li key={p} className="warn"><span>{p}</span></li>)}</ul>}
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy || problems.length > 0}>{movement ? 'Enregistrer' : 'Déposer la demande'}</button></footer>
        </form>
    </Modal>;
}

// ---------- passages qui demandent plus qu'un clic

function TransitionDialog({ movement, option, references, onClose, onDone }: { movement: MovementRequest; option: MovementTransitionOption; references: HeritageReference[]; onClose: () => void; onDone: () => void }) {
    const { heritage } = useSession();
    const needs = movementNeeds(option);
    const [form, setForm] = useState<MovementTransitionForm>(emptyTransitionForm);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const problems = movementTransitionProblems(option, form, todayIso());
    const touched = form.texte !== '' || form.conditions !== '' || form.conforme !== '' || form.constat.etat !== '';
    const run = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) return;
        setBusy(true); setError(null);
        try { await heritage!.command('/movements/' + movement.id + '/transitions', movementBody(option.vers, movement.version, form, option), crypto.randomUUID(), 'POST'); onDone(); onClose(); }
        catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal title={transitionLabel(option.vers)} subtitle={movement.numero + ' · ' + movement.cote} onClose={onClose} locked={busy} wide={needs.conformite}>
        <form onSubmit={run}>
            {option.vers === 'AUTORISEE' && <Notice>L’autorisation engage l’institution : elle est conservée avec son auteur et sa date. Elle est donnée par une autre personne que celle qui a demandé la sortie, et l’original sera jugé de nouveau à la remise.</Notice>}
            {(option.vers === 'REFUSEE' || option.vers === 'ANNULEE') && <Notice tone="warning">Cette décision est définitive ; une nouvelle demande pourra ensuite être déposée.</Notice>}
            {option.vers === 'RETOURNEE' && needs.constat && <Notice>Un original rentre d’un prêt ou d’une exposition avec un constat d’état au retour, même s’il est rendu dans l’état où il est parti : il devient le dernier état connu de l’original.</Notice>}
            {option.vers === 'RETOURNEE' && !needs.constat && <Notice>Un original rendu dans un autre état que celui où il est parti se constate : le constat est enregistré avec le retour et devient le dernier état connu de l’original.</Notice>}
            {(needs.conditions || needs.texte) && <div className="form-grid">
                {needs.conditions && <Field label={'Conditions de manipulation' + (needs.conditionsRequises ? ' * (au moins 10 caractères)' : '')} wide
                    hint={needs.conditionsRequises ? 'Le dernier constat d’état demande des précautions : dites lesquelles' : 'Facultatif : gants, support, interdiction de photocopier…'}>
                    <textarea value={form.conditions} onChange={e => setForm({ ...form, conditions: e.target.value })} rows={3} maxLength={4000} disabled={busy} /></Field>}
                {needs.texte && <Field label={needs.texteLabel + ' * (au moins 10 caractères)'} wide><textarea value={form.texte} onChange={e => setForm({ ...form, texte: e.target.value })} rows={3} maxLength={4000} disabled={busy} /></Field>}
            </div>}
            {needs.conformite && <>
                <fieldset className="placement-choices" disabled={busy}><legend>État de l’original au retour *</legend>
                    <label><input type="radio" name="conforme" value="oui" checked={form.conforme === 'oui'} onChange={() => setForm({ ...form, conforme: 'oui' })} /><span><strong>Rendu dans l’état où il est parti</strong><small>Aucune anomalie constatée au retour.</small></span></label>
                    <label><input type="radio" name="conforme" value="non" checked={form.conforme === 'non'} onChange={() => setForm({ ...form, conforme: 'non' })} /><span><strong>Rendu dans un autre état</strong><small>Une anomalie est constatée : elle se décrit et l’état de l’original se constate.</small></span></label>
                </fieldset>
                {form.conforme !== '' && <div className="form-grid"><Field label={form.conforme === 'non' ? 'Anomalie constatée * (au moins 10 caractères)' : 'Note sur le retour'} wide hint={form.conforme === 'non' ? undefined : 'Facultatif'}>
                    <textarea value={form.texte} onChange={e => setForm({ ...form, texte: e.target.value })} rows={2} maxLength={4000} disabled={busy} /></Field></div>}
                {(form.conforme === 'non' || (needs.constat && form.conforme !== '')) && <><h4 className="conservation-subtitle">État de l’original constaté au retour</h4>
                    <ReportFields form={form.constat} setForm={constat => setForm({ ...form, constat })} references={references} institutionId={movement.institutionId} final disabled={busy} /></>}
            </>}
            {problems.length > 0 && touched && <ul className="wf-blockers" aria-label="À compléter">{problems.map(p => <li key={p} className="warn"><span>{p}</span></li>)}</ul>}
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Retour</button><button type="submit" className="btn primary" disabled={busy || problems.length > 0}>Confirmer</button></footer>
        </form>
    </Modal>;
}

// ---------- fiche d'une demande

export function MovementDialog({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
    const { heritage, epoch } = useSession();
    const references = useAlterations();
    const [revision, setRevision] = useState(0);
    const [chosen, setChosen] = useState<MovementTransitionOption | null>(null);
    const [editing, setEditing] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const q = useResource<MovementRequest>(s => heritage!.movement(id, s), 'movement:' + id + ':' + revision + ':' + epoch);
    const journalQ = useResource<MovementJournalEntry[]>(s => heritage!.movementJournal(id, s), 'movement-journal:' + id + ':' + revision + ':' + epoch);
    const last = useRef<MovementRequest | null>(null);
    if (q.data) last.current = q.data;
    const movement = q.data ?? last.current;
    const refresh = () => { setRevision(r => r + 1); onChanged(); };
    if (!movement && q.loading) return <Modal title="Demande de mouvement" onClose={onClose} wide><Busy /></Modal>;
    if (!movement) return <Modal title="Demande de mouvement" onClose={onClose} wide><ErrorNotice error={q.error} onRetry={q.refresh} /></Modal>;
    const quick = async (option: MovementTransitionOption) => {
        setBusy(true); setError(null);
        try { await heritage!.command('/movements/' + movement.id + '/transitions', movementBody(option.vers, movement.version, emptyTransitionForm(), option), crypto.randomUUID(), 'POST'); refresh(); }
        catch (e) { setError(e); } finally { setBusy(false); }
    };
    const late = lateText(movement);
    return <Modal title={movement.bienIntitule} subtitle={movement.numero + ' · ' + movement.bienIdentifiant + ' · ' + movement.cote} onClose={onClose} wide>
        <div className="entry-head"><StatusBadge status={movement.statut} late={movement.enRetard} /><Badge value="R_OBJET" label={purposeLabel(movement.objet)} />
            {movement.modifiable && <button type="button" className="btn small secondary" onClick={() => setEditing(true)}>Modifier la demande</button>}</div>
        <p className="placement-summary modal-summary">{NEXT_STEPS[movement.statut]}{late && ' ' + late + '.'}</p>
        {movement.dossier && <Notice>Cette sortie fait partie du dossier <strong>{movement.dossier.numero}</strong> ({movement.dossier.nature === 'PRET' ? 'prêt sortant' : 'exposition'}) : elle ne se modifie pas et ne s’annule pas seule. La remise exige la convention, l’assurance et un constat d’état de départ récent ; le retour exige un constat d’état. Voir l’onglet « Prêts et expositions » du bien.</Notice>}
        {movement.numerisation && <Notice>Cette sortie est liée à la commande de numérisation <strong>{movement.numerisation.numero}</strong> : elle ne se modifie pas et ne s’annule pas seule, et l’original ne rentre qu’après le contrôle qualité des pages. Voir l’onglet « Numérisation » du bien.</Notice>}
        {movement.passages.length > 0 && <div className="asset-transitions"><div className="table-actions">{movement.passages.map(option => {
            const blocked = option.bloquants.length > 0;
            const why = !option.peutAgir ? 'Habilitation requise : ' + option.permissions.join(' ou ') : blocked ? 'Conditions non remplies' : undefined;
            return <button key={option.vers} type="button" className={'btn small ' + (option.vers === 'ANNULEE' || option.vers === 'REFUSEE' ? 'secondary' : 'primary')} disabled={!option.peutAgir || blocked || busy} title={why}
                onClick={() => needsForm(option) ? setChosen(option) : void quick(option)}>{transitionLabel(option.vers)}</button>;
        })}</div>
            {movement.passages.filter(o => o.peutAgir && o.bloquants.length > 0).map(o => <ul key={o.vers} className="wf-blockers" aria-label={transitionLabel(o.vers)}>{o.bloquants.map(b => <li key={b.code} className="bad"><span>{b.message}</span></li>)}</ul>)}
            {error ? <ErrorNotice error={error} /> : null}</div>}
        <div className="asset-tab">
            <dl className="asset-fields">
                <div><dt>Où l’original ira</dt><dd>{movement.destination}</dd></div>
                <div><dt>Qui le reçoit</dt><dd>{movement.destinataire}</dd></div>
                <div><dt>Retour prévu</dt><dd className={movement.enRetard ? 'bad' : ''}>{dayText(movement.retourPrevu)}{late && <small className="cell-sub">{late}</small>}</dd></div>
                <div><dt>Demandée</dt><dd>{dayText(movement.demande.le)}{movement.demande.par && <small className="cell-sub">par {movement.demande.par}</small>}</dd></div>
                <div className="wide"><dt>Motif</dt><dd className="conservation-text">{movement.motif}</dd></div>
                {movement.decision && <div><dt>{movement.statut === 'REFUSEE' ? 'Refusée' : 'Autorisée'}</dt><dd>{dayText(movement.decision.le)}{movement.decision.par && <small className="cell-sub">par {movement.decision.par}</small>}</dd></div>}
                {movement.decisionMotif && <div className="wide"><dt>Motif du refus</dt><dd>{movement.decisionMotif}</dd></div>}
                {movement.conditions && <div className="wide"><dt>Conditions de manipulation</dt><dd className="conservation-text">{movement.conditions}</dd></div>}
                {movement.remise && <div><dt>Remise</dt><dd>{dayText(movement.remise.le)}{movement.remise.par && <small className="cell-sub">par {movement.remise.par}</small>}</dd></div>}
                {movement.reception && <div><dt>Réception confirmée</dt><dd>{dayText(movement.reception.le)}{movement.reception.par && <small className="cell-sub">par {movement.reception.par}</small>}</dd></div>}
                {movement.retour && <div><dt>Retour</dt><dd>{dayText(movement.retour.le)}{movement.retour.par && <small className="cell-sub">par {movement.retour.par}</small>}</dd></div>}
                {movement.retourConforme !== null && <div><dt>État au retour</dt><dd>{movement.retourConforme ? 'Rendu dans l’état où il est parti' : 'Rendu dans un autre état'}</dd></div>}
                {movement.retourNote && <div className="wide"><dt>{movement.retourConforme ? 'Note sur le retour' : 'Anomalie constatée'}</dt><dd className="conservation-text">{movement.retourNote}</dd></div>}
                {movement.retourConstatId && <div className="wide"><dt>Constat d’état</dt><dd>Enregistré avec le retour : voir l’onglet « Conservation » du bien.</dd></div>}
                {movement.fermeture && <div><dt>Annulée</dt><dd>{dayText(movement.fermeture.le)}{movement.fermeture.par && <small className="cell-sub">par {movement.fermeture.par}</small>}</dd></div>}
                {movement.fermeMotif && <div className="wide"><dt>Motif de l’annulation</dt><dd>{movement.fermeMotif}</dd></div>}
            </dl>
            <section className="asset-group"><h4>Historique</h4>
                {journalQ.loading ? <Busy /> : journalQ.error ? <ErrorNotice error={journalQ.error} onRetry={journalQ.refresh} /> : <ol className="wf-history asset-journal">{[...(journalQ.data ?? [])].reverse().map(e => <li key={e.id}>
                    <time dateTime={e.createdAt}>{formatDate(e.createdAt)}</time>
                    <span>{journalSummary(e.genre, e.ancienneValeur, e.nouvelleValeur)}</span>
                    {e.motif && <p>Motif : {e.motif}</p>}</li>)}</ol>}</section>
        </div>
        {chosen && <TransitionDialog movement={movement} option={chosen} references={references} onClose={() => setChosen(null)} onDone={refresh} />}
        {editing && <RequestDialog bienId={movement.bienId} original={{ archiveId: movement.archiveId, cote: movement.cote }} movement={movement} onClose={() => setEditing(false)} onDone={refresh} />}
        <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose}>Fermer</button></footer>
    </Modal>;
}

// ---------- onglet « Mouvements » d'un bien

function OriginalMovements({ asset, original, requests, canRequest, onOpen, onAsk }: {
    asset: HeritageAsset; original: HeritageAsset['originaux'][number]; requests: MovementRow[]; canRequest: boolean; onOpen: (id: string) => void; onAsk: (archiveId: string, cote: string) => void;
}) {
    const mine = requests.filter(r => r.archiveId === original.archivePhysiqueId);
    const open = mine.find(r => isOpen(r.statut));
    const closed = mine.filter(r => !isOpen(r.statut));
    return <section className={'placement-card ' + (open?.enRetard ? 'bad' : open ? 'warn' : '')} aria-label={'Mouvements de ' + original.cote}>
        <div className="section-heading"><h4>{original.cote}{original.libelle && ' — ' + original.libelle}</h4>
            <span className="placement-gaps">{open ? <StatusBadge status={open.statut} late={open.enRetard} /> : <Badge value="R_AUCUNE" label="Aucune demande ouverte" />}</span></div>
        {open
            ? <p className="placement-summary"><strong>{open.numero}</strong> — {purposeLabel(open.objet)} vers {open.destination} ({open.destinataire}), retour prévu le {dayText(open.retourPrevu)}{open.enRetard && ' · ' + lateText(open)}. {NEXT_STEPS[open.statut]}</p>
            : <p className="placement-summary">Cet original est en réserve. Pour le consulter, le numériser, l’exposer ou le prêter, déposez une demande : elle sera autorisée par une autre personne.</p>}
        <div className="table-actions">
            {open && <button type="button" className="btn small primary" onClick={() => onOpen(open.id)}>Ouvrir la demande</button>}
            {!open && canRequest && <button type="button" className="btn small primary" onClick={() => onAsk(original.archivePhysiqueId, original.cote)}>Demander un mouvement</button>}
        </div>
        {closed.length > 0 && <section className="asset-group"><h4>Demandes closes</h4><ul className="asset-links">{closed.map(r => <li key={r.id}>
            <span><strong>{r.numero}</strong> — {purposeLabel(r.objet)} vers {r.destination} <StatusBadge status={r.statut} /><small> · demandée le {dayText(r.demandeLe)}{r.demandePar && ' par ' + r.demandePar}</small></span>
            <button type="button" className="btn small secondary" onClick={() => onOpen(r.id)}>Ouvrir</button></li>)}</ul></section>}
    </section>;
}

export function MovementsTab({ asset, onChanged }: { asset: HeritageAsset; onChanged: () => void }) {
    const { me, heritage, epoch } = useSession();
    const [revision, setRevision] = useState(0);
    const [opened, setOpened] = useState<string | null>(null);
    const [asking, setAsking] = useState<{ archiveId: string; cote: string } | null>(null);
    const q = useResource<MovementPage>(s => heritage!.movements({ bienId: asset.id, page: 0, size: 100 }, s), 'asset-movements:' + asset.id + ':' + asset.version + ':' + revision + ':' + epoch);
    const last = useRef<MovementPage | null>(null);
    if (q.data) last.current = q.data;
    const data = q.data ?? last.current;
    const canRequest = can(me, 'HERITAGE_MOVEMENT_REQUEST', { institutionId: asset.institutionId, departmentId: asset.departementId });
    const changed = () => { setRevision(r => r + 1); onChanged(); };
    if (!data && q.loading) return <Busy />;
    if (!data) return <ErrorNotice error={q.error} onRetry={q.refresh} />;
    const digital = asset.champs.natureOriginale === 'NUMERIQUE_NATIF';
    return <div className="asset-tab">
        <Notice>Un original ne sort pas de réserve parce que l’on a le droit de gérer les archives : la sortie est demandée, autorisée par une autre personne, remise, confirmée par celle qui la reçoit, puis rendue.</Notice>
        {asset.originaux.length === 0
            ? <Empty title={digital ? 'Bien numérique natif' : 'Aucun original relié'} description={digital ? 'Il n’y a pas d’original physique à déplacer.' : 'Reliez l’archive physique dans l’onglet « Ressources et liens » pour pouvoir en demander la sortie.'} />
            : asset.originaux.map(o => <OriginalMovements key={o.archivePhysiqueId} asset={asset} original={o} requests={data.items} canRequest={canRequest} onOpen={setOpened} onAsk={(archiveId, cote) => setAsking({ archiveId, cote })} />)}
        {asking && <RequestDialog bienId={asset.id} original={asking} onClose={() => setAsking(null)} onDone={id => { changed(); setOpened(id); }} />}
        {opened && <MovementDialog id={opened} onClose={() => setOpened(null)} onChanged={changed} />}
    </div>;
}

// ---------- liste des demandes (page Patrimoine)

export function MovementsPanel() {
    const { heritage, epoch } = useSession();
    const [form, setForm] = useState({ statut: 'OUVERTES', objet: '', q: '', enRetard: false, mine: false });
    const [applied, setApplied] = useState(form);
    const [page, setPage] = useState(0);
    const [revision, setRevision] = useState(0);
    const [opened, setOpened] = useState<string | null>(null);
    const filters = { statut: applied.statut, objet: applied.objet, q: applied.q, enRetard: applied.enRetard ? 'true' : '', mine: applied.mine ? 'true' : '' };
    const listQ = useResource<MovementPage>(s => heritage!.movements({ ...filters, page, size: 20 }, s), JSON.stringify(['heritage-movements', applied, page, revision, epoch]));
    const apply = (next: typeof form) => { setForm(next); setApplied(next); setPage(0); };
    const items = listQ.data?.items ?? [];
    const filtered = applied.statut !== 'OUVERTES' || applied.objet || applied.q || applied.enRetard || applied.mine;
    return <>
        <div className="panel">
            <div className="section-heading"><h3>Mouvements des originaux</h3></div>
            <p className="wf-note">Les sorties de réserve : celles qui attendent une décision, une remise ou un retour, les sorties en retard d’abord. Chaque sortie est demandée, autorisée par une autre personne, remise, confirmée à la réception, puis rendue.</p>
            <form className="asset-filters" onSubmit={e => { e.preventDefault(); apply(form); }} role="search" aria-label="Rechercher une demande de mouvement">
                <Field label="Recherche"><input value={form.q} onChange={e => setForm({ ...form, q: e.target.value })} placeholder="Numéro, cote, bien ou destinataire" /></Field>
                <Field label="Étape"><select value={form.statut} onChange={e => apply({ ...form, statut: e.target.value })}><option value="">Toutes</option>{STATUS_FILTERS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                <Field label="Pour quoi"><select value={form.objet} onChange={e => apply({ ...form, objet: e.target.value })}><option value="">Tous</option>{Object.entries(PURPOSE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                <label className="field asset-flag"><input type="checkbox" checked={form.enRetard} onChange={e => apply({ ...form, enRetard: e.target.checked })} /><span>Sorties en retard</span></label>
                <label className="field asset-flag"><input type="checkbox" checked={form.mine} onChange={e => apply({ ...form, mine: e.target.checked })} /><span>Mes demandes</span></label>
                <button type="submit" className="btn small secondary">Rechercher</button>
            </form>
            {listQ.loading ? <Busy /> : listQ.error ? <ErrorNotice error={listQ.error} onRetry={listQ.refresh} /> : items.length ? <>
                <p className="wf-note" role="status">{listQ.data!.total} demande{listQ.data!.total > 1 ? 's' : ''}</p>
                <div className="table-scroll"><table><thead><tr><th>Demande</th><th>Bien</th><th>Original</th><th>Pour quoi</th><th>Destination</th><th>Retour prévu</th><th>Étape</th></tr></thead>
                    <tbody>{items.map(r => <tr key={r.id}>
                        <td className="nowrap"><button type="button" className="text-link" onClick={() => setOpened(r.id)}>{r.numero}</button><small className="cell-sub">{dayText(r.demandeLe)}{r.demandePar && ' · ' + r.demandePar}</small></td>
                        <td>{r.bienIdentifiant}<small className="cell-sub">{r.bienIntitule}</small></td>
                        <td className="nowrap">{r.cote}</td>
                        <td>{purposeLabel(r.objet)}</td>
                        <td>{r.destination}<small className="cell-sub">{r.destinataire}</small></td>
                        <td className="nowrap">{dayText(r.retourPrevu)}{r.enRetard && <small className="cell-sub bad">{lateText(r)}</small>}</td>
                        <td><StatusBadge status={r.statut} late={r.enRetard} /></td></tr>)}</tbody></table></div>
                <Pagination page={page} hasMore={listQ.data?.hasMore ?? false} onChange={setPage} count={items.length} />
            </> : <Empty title="Aucune demande" description={filtered ? 'Aucune demande ne correspond à ces critères.' : 'Aucune sortie n’est demandée ni en cours dans votre périmètre. Les demandes se déposent depuis la fiche d’un bien, onglet « Mouvements ».'} />}
        </div>
        {opened && <MovementDialog id={opened} onClose={() => setOpened(null)} onChanged={() => setRevision(r => r + 1)} />}
    </>;
}
