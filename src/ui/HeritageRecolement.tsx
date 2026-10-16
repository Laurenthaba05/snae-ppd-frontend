import React, { useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { useWorkspace } from './workspace';
import { can } from '../core/policy';
import { Badge, Busy, Empty, ErrorNotice, Field, Modal, Notice, Pagination, formatDate, useResource } from './components';
import { PresenceDialog } from './HeritagePlacement';
import type { UnitSource } from './HeritagePlacement';
import { printHtml } from './printHtml';
import { PRESENCE_SHORT, dayText, locationPath, placeText } from '../core/placement';
import { label } from '../core/heritageAssets';
import {
    CAMPAIGN_LABELS, ELEMENT_LABELS, RECOLEMENT_FIELD_LABELS, RECOLEMENT_JOURNAL_LABELS, campaignLabel, campaignTone, dateRangeText, elementTone, emptyRecolementForm, formOf, outcomeText,
    postponeProblems, progressSegments, recolementBody, recolementProblems, recolementTransitionLabel, reportHtml, transitionBody, transitionTextHint, transitionTextLabel, transitionTextProblems
} from '../core/recolement';
import type { RecolementForm } from '../core/recolement';
import type {
    CampaignStatus, Recolement, RecolementElement, RecolementElementPage, RecolementJournalEntry, RecolementLocation, RecolementPage, RecolementProgress, RecolementReport, RecolementSummary, RecolementTransitionOption,
    StoragePlace
} from '../core/types';
import { display } from '../core/format';

const STATUSES = Object.keys(CAMPAIGN_LABELS) as CampaignStatus[];

/** La barre d'avancement : chaque élément y figure une fois ; un report n'est pas une vérification. */
function ProgressBar({ progress, compact = false }: { progress: RecolementProgress; compact?: boolean }) {
    const segments = progressSegments(progress);
    const summary = progress.total === 0 ? 'Aucun élément' : `${progress.verifies} vérifié${progress.verifies > 1 ? 's' : ''} sur ${progress.total} (${progress.verifiesPourcent} %), ${progress.reportes} reporté${progress.reportes > 1 ? 's' : ''}, ${progress.restants} à vérifier`;
    return <div className={'rec-progress' + (compact ? ' compact' : '')}>
        <div className="rec-bar" role="img" aria-label={summary}>{segments.filter(s => s.count > 0).map(s => <span key={s.key} className={'seg ' + s.key} style={{ width: s.percent + '%' }} title={s.label + ' : ' + s.count} />)}</div>
        {compact ? <small>{progress.total === 0 ? '—' : progress.verifiesPourcent + ' % vérifié'}</small>
            : <ul className="rec-legend" aria-label="Répartition des éléments">{segments.map(s => <li key={s.key}><i className={'seg ' + s.key} />{s.label} <strong>{s.count}</strong></li>)}</ul>}
    </div>;
}

// ---------- création et modification

function CampaignFormDialog({ campaign, onClose, onSaved }: { campaign?: Recolement; onClose: () => void; onSaved: (c: Recolement) => void }) {
    const { heritage, epoch } = useSession();
    const { scope } = useWorkspace();
    const key = useRef(crypto.randomUUID());
    const institutionId = campaign?.institutionId ?? scope.institutionId ?? '';
    const [form, setForm] = useState<RecolementForm>(() => campaign ? formOf(campaign) : emptyRecolementForm());
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const locationsQ = useResource<RecolementLocation[]>(s => institutionId ? heritage!.recolementLocations(institutionId, s) : Promise.resolve([]), 'recolement-locations:' + institutionId + ':' + epoch);
    const byId = new Map((locationsQ.data ?? []).map(l => [l.id, l] as const));
    const options = (locationsQ.data ?? []).map(l => ({ id: l.id, label: locationPath(l.id, byId).join(' › ') })).sort((a, b) => a.label.localeCompare(b.label, 'fr'));
    const problems = recolementProblems(form);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) return;
        setBusy(true); setError(null);
        try {
            const saved = campaign
                ? await heritage!.command<Recolement>('/recolements/' + campaign.id, { ...recolementBody(form), expectedVersion: campaign.version }, crypto.randomUUID(), 'PUT')
                : await heritage!.command<Recolement>('/recolements', { ...recolementBody(form), institutionId, departementId: scope.departmentId ?? null }, key.current, 'POST');
            onSaved(saved); onClose();
        } catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal title={campaign ? 'Modifier la campagne' : 'Nouvelle campagne de récolement'} subtitle={campaign?.numero ?? 'Le périmètre se décide avant le lancement : ensuite la liste des éléments est figée'} onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            {!institutionId && <Notice tone="warning">Choisissez une institution dans le périmètre de travail.</Notice>}
            <div className="form-grid">
                <Field label="Libellé *" wide><input value={form.libelle} onChange={e => setForm({ ...form, libelle: e.target.value })} maxLength={255} disabled={busy} required /></Field>
                <Field label="Objet" wide hint="Ce que la campagne vérifie et pourquoi"><textarea value={form.objet} onChange={e => setForm({ ...form, objet: e.target.value })} rows={2} maxLength={5000} disabled={busy} /></Field>
                <Field label="Périmètre" wide hint="Les originaux physiques des biens de l’institution rangés dans cette localisation et ses sous-localisations. Vide : toute l’institution.">
                    {locationsQ.loading ? <Busy /> : <select value={form.localisationId} onChange={e => setForm({ ...form, localisationId: e.target.value })} disabled={busy}><option value="">Toute l’institution</option>
                        {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select>}</Field>
                <Field label="Début prévu"><input type="date" value={form.dateDebutPrevue} onChange={e => setForm({ ...form, dateDebutPrevue: e.target.value })} disabled={busy} /></Field>
                <Field label="Fin prévue"><input type="date" value={form.dateFinPrevue} onChange={e => setForm({ ...form, dateFinPrevue: e.target.value })} disabled={busy} /></Field>
            </div>
            {locationsQ.error ? <ErrorNotice error={locationsQ.error} /> : null}
            {problems.length > 0 && form.libelle !== '' && <ul className="wf-blockers" aria-label="À compléter">{problems.map(p => <li key={p} className="warn"><span>{p}</span></li>)}</ul>}
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy || problems.length > 0 || !institutionId}>{campaign ? 'Enregistrer' : 'Planifier la campagne'}</button></footer>
        </form>
    </Modal>;
}

// ---------- passages

function TransitionDialog({ campaign, option, onClose, onDone }: { campaign: Recolement; option: RecolementTransitionOption; onClose: () => void; onDone: () => void }) {
    const { heritage } = useSession();
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const problems = transitionTextProblems(option, text);
    const launching = option.vers === 'EN_COURS';
    const run = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) return;
        setBusy(true); setError(null);
        try { await heritage!.command('/recolements/' + campaign.id + '/transitions', transitionBody(option.vers, campaign.version, text), crypto.randomUUID(), 'POST'); onDone(); onClose(); }
        catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal title={recolementTransitionLabel(option.vers)} subtitle={campaign.numero + ' · ' + campaign.libelle} onClose={onClose} locked={busy}>
        <form onSubmit={run}>
            {launching && <Notice>Le lancement fige le périmètre : {campaign.perimetre ?? 0} {(campaign.perimetre ?? 0) > 1 ? 'originaux physiques seront' : 'original physique sera'} à vérifier. La campagne ne se modifiera plus, et sa clôture sera faite par une autre personne que vous.</Notice>}
            {option.vers === 'CLOTUREE' && <Notice>La clôture est définitive : plus aucun constat ne pourra être ajouté à cette campagne. Les écarts constatés restent à régulariser.</Notice>}
            {option.vers === 'ANNULEE' && <Notice tone="warning">L’annulation est définitive. Les constats déjà faits restent au journal de présence des archives.</Notice>}
            {option.motifRequis && <div className="form-grid"><Field label={transitionTextLabel(option.vers) + ' * (au moins 10 caractères)'} wide hint={transitionTextHint(option.vers)}>
                <textarea value={text} onChange={e => setText(e.target.value)} rows={4} maxLength={4000} disabled={busy} /></Field></div>}
            {problems.length > 0 && text !== '' && <ul className="wf-blockers" aria-label="À compléter">{problems.map(p => <li key={p} className="warn"><span>{p}</span></li>)}</ul>}
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Retour</button><button type="submit" className="btn primary" disabled={busy || problems.length > 0}>Confirmer</button></footer>
        </form>
    </Modal>;
}

function TransitionBar({ campaign, onDone }: { campaign: Recolement; onDone: () => void }) {
    const [chosen, setChosen] = useState<RecolementTransitionOption | null>(null);
    if (!campaign.passages.length) return null;
    return <div className="asset-transitions">
        <div className="table-actions">{campaign.passages.map(option => {
            const blocked = option.bloquants.length > 0;
            const why = !option.peutAgir ? 'Habilitation requise : ' + option.permissions.join(' ou ') : blocked ? 'Conditions non remplies' : undefined;
            return <button key={option.vers} type="button" className={'btn small ' + (option.vers === 'ANNULEE' ? 'secondary' : 'primary')} disabled={!option.peutAgir || blocked} title={why} onClick={() => setChosen(option)}>{recolementTransitionLabel(option.vers)}</button>;
        })}</div>
        {campaign.passages.filter(o => o.peutAgir && o.bloquants.length > 0).map(o => <ul key={o.vers} className="wf-blockers" aria-label={recolementTransitionLabel(o.vers)}>{o.bloquants.map(b => <li key={b.code} className="bad"><span>{b.message}</span></li>)}</ul>)}
        {chosen && <TransitionDialog campaign={campaign} option={chosen} onClose={() => setChosen(null)} onDone={onDone} />}
    </div>;
}

// ---------- parcours : constater ou reporter chaque élément

function PostponeDialog({ campaign, element, onClose, onDone }: { campaign: Recolement; element: RecolementElement; onClose: () => void; onDone: () => void }) {
    const { heritage } = useSession();
    const [motif, setMotif] = useState(element.motifReport ?? '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const problems = postponeProblems(motif);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) return;
        setBusy(true); setError(null);
        try { await heritage!.command('/recolements/' + campaign.id + '/elements/' + element.id + '/postpone', { expectedVersion: element.version, motif: motif.trim() }, crypto.randomUUID(), 'POST'); onDone(); onClose(); }
        catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal title="Reporter la vérification" subtitle={element.cote + ' · ' + element.bienIdentifiant} onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <Notice tone="warning">Un report n’est pas une vérification : l’élément reste compté à part dans l’avancement et dans le procès-verbal, avec son motif. Il pourra être vérifié plus tard, tant que la campagne est en cours.</Notice>
            <div className="form-grid"><Field label="Motif * (au moins 10 caractères)" wide hint="Archive sortie, local inaccessible, pièce en cours de restauration…"><textarea value={motif} onChange={e => setMotif(e.target.value)} rows={3} maxLength={4000} disabled={busy} /></Field></div>
            {problems.length > 0 && motif !== '' && <ul className="wf-blockers" aria-label="À compléter">{problems.map(p => <li key={p} className="warn"><span>{p}</span></li>)}</ul>}
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy || problems.length > 0}>Reporter</button></footer>
        </form>
    </Modal>;
}

/** Les emplacements nommables pour une archive trouvée ailleurs : fournis par la campagne, pour les personnes qui n'ont aucun droit national sur les archives. */
function useCampaignUnits(campaignId: string): UnitSource {
    return function useUnits(enabled, exclude) {
        const { heritage, epoch } = useSession();
        const q = useResource<StoragePlace[]>(s => enabled ? heritage!.recolementUnits(campaignId, s) : Promise.resolve([]), 'recolement-units:' + campaignId + ':' + enabled + ':' + epoch);
        return { loading: q.loading, error: q.error, options: (q.data ?? []).filter(p => !exclude.includes(p.unitId)).map(p => ({ id: p.unitId, label: placeText(p) })) };
    };
}

function ElementsTab({ campaign, onChanged }: { campaign: Recolement; onChanged: () => void }) {
    const { heritage, epoch } = useSession();
    const [form, setForm] = useState({ statut: '', resultat: '', q: '' });
    const [applied, setApplied] = useState(form);
    const [page, setPage] = useState(0);
    const [revision, setRevision] = useState(0);
    const [verifying, setVerifying] = useState<RecolementElement | null>(null);
    const [postponing, setPostponing] = useState<RecolementElement | null>(null);
    const unitSource = useCampaignUnits(campaign.id);
    const q = useResource<RecolementElementPage>(s => campaign.statut === 'PLANIFIEE' ? Promise.resolve({ items: [], page: 0, size: 25, total: 0, hasMore: false }) : heritage!.recolementElements(campaign.id, { ...applied, page, size: 25 }, s), JSON.stringify(['recolement-elements', campaign.id, applied, page, revision, campaign.version, epoch]));
    const apply = (next: typeof form) => { setForm(next); setApplied(next); setPage(0); };
    const changed = () => { setRevision(r => r + 1); onChanged(); };
    const items = q.data?.items ?? [];
    return <div className="asset-tab">
        {campaign.statut === 'PLANIFIEE' && <Notice>La liste des éléments se fige au lancement : {campaign.perimetre ?? 0} {(campaign.perimetre ?? 0) > 1 ? 'originaux physiques' : 'original physique'} dans le périmètre actuel.</Notice>}
        {campaign.statut !== 'PLANIFIEE' && <>
            <form className="asset-filters" onSubmit={e => { e.preventDefault(); apply(form); }} role="search" aria-label="Rechercher un élément">
                <Field label="Recherche"><input value={form.q} onChange={e => setForm({ ...form, q: e.target.value })} placeholder="Cote, identifiant ou intitulé du bien" /></Field>
                <Field label="Étape"><select value={form.statut} onChange={e => apply({ ...form, statut: e.target.value })}><option value="">Toutes</option>{Object.entries(ELEMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                <Field label="Constat"><select value={form.resultat} onChange={e => apply({ ...form, resultat: e.target.value })}><option value="">Tous</option>{(['PRESENTE', 'AUTRE_EMPLACEMENT', 'ABSENTE'] as const).map(r => <option key={r} value={r}>{PRESENCE_SHORT[r]}</option>)}</select></Field>
                <button type="submit" className="btn small secondary">Rechercher</button>
            </form>
            {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : items.length ? <>
                <p className="wf-note" role="status">{q.data!.total} élément{q.data!.total > 1 ? 's' : ''}, dans l’ordre du parcours (emplacement puis cote)</p>
                <div className="table-scroll"><table><thead><tr><th>Emplacement</th><th>Cote</th><th>Bien</th><th>Étape</th><th>Constat</th><th><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>{items.map(e => <tr key={e.id} className={'rec-el ' + elementTone(e)}>
                        <td className="nowrap">{placeText(e.habituel)}</td>
                        <td className="nowrap">{e.cote}{e.support && <small className="cell-sub">{display(e.support)}</small>}</td>
                        <td><span className="nowrap">{e.bienIdentifiant}</span><small className="cell-sub">{e.bienIntitule}</small></td>
                        <td><Badge value={e.statut} label={ELEMENT_LABELS[e.statut]} />{e.enSortie && <small className="cell-sub">Sortie de réserve</small>}</td>
                        <td>{e.statut === 'A_VERIFIER' ? (e.enSortie ? 'À reporter ou à vérifier au retour' : '—') : outcomeText(e)}{e.traiteLe && <small className="cell-sub">{dayText(e.traiteLe)}{e.verifiePar && ' · ' + e.verifiePar}</small>}{e.note && <small className="cell-sub">{e.note}</small>}</td>
                        <td>{campaign.peutConstater && <span className="table-actions">
                            <button type="button" className="btn small primary" onClick={() => setVerifying(e)} disabled={e.enSortie} title={e.enSortie ? 'Archive sortie : reportez la vérification, ou attendez son retour' : undefined}>{e.statut === 'VERIFIE' ? 'Revérifier' : 'Constater'}</button>
                            {e.statut !== 'VERIFIE' && <button type="button" className="btn small secondary" onClick={() => setPostponing(e)}>Reporter</button>}</span>}</td></tr>)}</tbody></table></div>
                <Pagination page={page} hasMore={q.data?.hasMore ?? false} onChange={setPage} count={items.length} />
            </> : <Empty title="Aucun élément" description={Object.values(applied).some(Boolean) ? 'Aucun élément ne correspond à ces critères.' : 'Cette campagne ne contient aucun élément.'} />}
        </>}
        {verifying && <PresenceDialog target={{ cote: verifying.cote, habituel: verifying.habituel ?? { unitId: '', cote: '?', typeUnite: '', localisation: [], actif: true } }} unitSource={unitSource} onClose={() => setVerifying(null)} onDone={changed}
            submit={(body, key) => heritage!.command('/recolements/' + campaign.id + '/elements/' + verifying.id + '/verify', { ...body, expectedVersion: verifying.version }, key, 'POST')} />}
        {postponing && <PostponeDialog campaign={campaign} element={postponing} onClose={() => setPostponing(null)} onDone={changed} />}
    </div>;
}

// ---------- avancement, rapport, historique

function ProgressTab({ campaign }: { campaign: Recolement }) {
    const p = campaign.progres;
    return <div className="asset-tab">
        <section className="asset-group"><h4>Avancement</h4><ProgressBar progress={p} />
            <dl className="asset-fields"><div><dt>Éléments à vérifier</dt><dd>{p.total}</dd></div><div><dt>Vérifiés</dt><dd>{p.verifies} ({p.verifiesPourcent} %)</dd></div><div><dt>Traités (vérifiés ou reportés)</dt><dd>{p.traitesPourcent} %</dd></div>
                <div><dt>Écarts constatés</dt><dd>{p.autresEmplacements + p.introuvables}</dd></div></dl></section>
        <section className="asset-group"><h4>Campagne</h4>
            <dl className="asset-fields">
                <div><dt>Périmètre</dt><dd>{campaign.localisation.length ? campaign.localisation.join(' › ') : 'Toute l’institution'}</dd></div>
                <div><dt>Dates prévues</dt><dd>{dateRangeText(campaign.dateDebutPrevue, campaign.dateFinPrevue)}</dd></div>
                {campaign.lanceLe && <div><dt>Lancée le</dt><dd>{dayText(campaign.lanceLe)}</dd></div>}
                {campaign.clotureLe && <div><dt>Clôturée le</dt><dd>{dayText(campaign.clotureLe)}</dd></div>}
                {campaign.annuleLe && <div><dt>Annulée le</dt><dd>{dayText(campaign.annuleLe)}</dd></div>}
                {campaign.objet && <div className="wide"><dt>Objet</dt><dd>{campaign.objet}</dd></div>}
                {campaign.clotureResume && <div className="wide"><dt>Conclusion</dt><dd>{campaign.clotureResume}</dd></div>}
                {campaign.annuleMotif && <div className="wide"><dt>Motif de l’annulation</dt><dd>{campaign.annuleMotif}</dd></div>}
            </dl></section>
    </div>;
}

function ReportTab({ campaign }: { campaign: Recolement }) {
    const { me, heritage, epoch } = useSession();
    const scope = { institutionId: campaign.institutionId, departmentId: campaign.departementId };
    const allowed = can(me, 'HERITAGE_RECOLEMENT_MANAGE', scope) || can(me, 'HERITAGE_RECOLEMENT_PERFORM', scope);
    const q = useResource<RecolementReport>(s => allowed ? heritage!.recolementReport(campaign.id, s) : Promise.resolve(null as unknown as RecolementReport), 'recolement-report:' + campaign.id + ':' + campaign.version + ':' + campaign.progres.verifies + ':' + campaign.progres.reportes + ':' + epoch);
    if (!allowed) return <Notice tone="warning">Le procès-verbal détaille où se trouvent les archives : il exige l’habilitation de récolement de cette institution.</Notice>;
    if (q.loading) return <Busy />;
    if (q.error) return <ErrorNotice error={q.error} onRetry={q.refresh} />;
    const report = q.data!;
    return <div className="asset-tab">
        <section className="asset-group"><div className="section-heading"><h4>Écarts constatés ({report.ecartsTotal})</h4><button type="button" className="btn small secondary" onClick={() => printHtml(reportHtml(campaign, report))}>Imprimer le procès-verbal</button></div>
            {report.ecartsTotal > 0 && <p className="wf-note" role="status">{report.ecartsOuverts} écart{report.ecartsOuverts > 1 ? 's' : ''} encore ouvert{report.ecartsOuverts > 1 ? 's' : ''} aujourd’hui ; les autres ont été régularisés depuis le constat.</p>}
            {report.ecarts.length ? <ul className="asset-links">{report.ecarts.map(g => <li key={g.element.id}><span><strong>{g.element.cote}</strong> — {g.element.bienIdentifiant} {g.element.bienIntitule}<small> · {outcomeText(g.element)}</small>{g.element.note && <small> · {g.element.note}</small>}</span>
                <Badge value={g.ouvert ? 'ECART_OUVERT' : 'REGULARISE'} label={g.ouvert ? 'Encore ouvert' : 'Régularisé'} /></li>)}</ul> : <Empty title="Aucun écart" description="Aucun élément vérifié n’a été trouvé ailleurs ou déclaré introuvable." />}
            {report.ecartsTotal > report.ecarts.length && <small className="wf-note">{report.ecartsTotal - report.ecarts.length} autre(s) écart(s) non listé(s) : filtrez le parcours par constat.</small>}</section>
        <section className="asset-group"><h4>Éléments reportés ({report.reportesTotal})</h4>
            {report.reportes.length ? <ul className="asset-links">{report.reportes.map(r => <li key={r.id}><span><strong>{r.cote}</strong> — {r.bienIdentifiant} {r.bienIntitule}<small> · {r.motifReport}</small></span></li>)}</ul> : <small className="wf-note">Aucun élément reporté.</small>}</section>
    </div>;
}

function JournalTab({ id, stamp }: { id: string; stamp: string }) {
    const { heritage, epoch } = useSession();
    const q = useResource<RecolementJournalEntry[]>(s => heritage!.recolementJournal(id, s), 'recolement-journal:' + id + ':' + stamp + ':' + epoch);
    if (q.loading) return <Busy />;
    if (q.error) return <ErrorNotice error={q.error} onRetry={q.refresh} />;
    const list = [...(q.data ?? [])].reverse();
    return <ol className="wf-history asset-journal">{list.map(entry => <li key={entry.id}>
        <time dateTime={entry.createdAt}>{formatDate(entry.createdAt)}</time>
        <span><Badge value={entry.genre} label={label(RECOLEMENT_JOURNAL_LABELS, entry.genre)} /></span>
        {entry.genre === 'TRANSITION' ? <p>{campaignLabel(String(entry.ancienneValeur))} → {campaignLabel(String(entry.nouvelleValeur))}</p>
            : entry.genre === 'MODIFICATION' && Array.isArray(entry.nouvelleValeur) ? <p>{entry.nouvelleValeur.map(n => label(RECOLEMENT_FIELD_LABELS, String(n))).join(', ')}</p> : null}
        {entry.motif && <p>{entry.nouvelleValeur === 'CLOTUREE' ? 'Conclusion' : 'Motif'} : {entry.motif}</p>}
    </li>)}</ol>;
}

// ---------- fiche

type Tab = 'avancement' | 'parcours' | 'rapport' | 'journal';

function RecolementDialog({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
    const { me, heritage, epoch } = useSession();
    const [tab, setTab] = useState<Tab>('avancement');
    const [revision, setRevision] = useState(0);
    const [editing, setEditing] = useState(false);
    const q = useResource<Recolement>(s => heritage!.recolement(id, s), 'recolement:' + id + ':' + revision + ':' + epoch);
    const refresh = () => { setRevision(r => r + 1); onChanged(); };
    // Pendant un rechargement la fiche reste affichée : pas de clignotement, la page du parcours n'est pas perdue.
    const last = useRef<Recolement | null>(null);
    if (q.data) last.current = q.data;
    const campaign = q.data ?? last.current;
    if (!campaign && q.loading) return <Modal title="Campagne de récolement" onClose={onClose} wide><Busy /></Modal>;
    if (!campaign) return <Modal title="Campagne de récolement" onClose={onClose} wide><ErrorNotice error={q.error} onRetry={q.refresh} /></Modal>;
    const canManage = can(me, 'HERITAGE_RECOLEMENT_MANAGE', { institutionId: campaign.institutionId, departmentId: campaign.departementId });
    const tabs: Array<[Tab, string]> = [['avancement', 'Avancement'], ['parcours', 'Parcours'], ['rapport', 'Procès-verbal'], ['journal', 'Historique']];
    return <Modal title={campaign.libelle} subtitle={campaign.numero + ' · ' + dateRangeText(campaign.dateDebutPrevue, campaign.dateFinPrevue)} onClose={onClose} wide>
        <div className="entry-head"><Badge value={campaign.statut} label={campaignLabel(campaign.statut)} /><ProgressBar progress={campaign.progres} compact />{campaign.modifiable && canManage && <button type="button" className="btn small secondary" onClick={() => setEditing(true)}>Modifier</button>}</div>
        {campaign.peutConstater && <Notice>Constatez chaque archive en allant la voir : le constat est daté, signé et rejoint le journal de présence de l’archive. Une archive sortie se reporte avec son motif.</Notice>}
        <TransitionBar campaign={campaign} onDone={refresh} />
        <div role="tablist" className="asset-tabs" aria-label="Sections de la campagne">{tabs.map(([key, text]) => <button key={key} role="tab" type="button" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{text}</button>)}</div>
        {tab === 'avancement' && <ProgressTab campaign={campaign} />}
        {tab === 'parcours' && <ElementsTab campaign={campaign} onChanged={refresh} />}
        {tab === 'rapport' && <ReportTab campaign={campaign} />}
        {tab === 'journal' && <JournalTab id={campaign.id} stamp={String(campaign.version)} />}
        {editing && <CampaignFormDialog campaign={campaign} onClose={() => setEditing(false)} onSaved={refresh} />}
        <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose}>Fermer</button></footer>
    </Modal>;
}

// ---------- liste

export function RecolementsPanel() {
    const { me, heritage, epoch } = useSession();
    const { scope } = useWorkspace();
    const [form, setForm] = useState({ q: '', statut: '' });
    const [applied, setApplied] = useState(form);
    const [page, setPage] = useState(0);
    const [revision, setRevision] = useState(0);
    const [creating, setCreating] = useState(false);
    const [opened, setOpened] = useState<string | null>(null);
    const listQ = useResource<RecolementPage>(s => heritage!.recolements({ ...applied, page, size: 20 }, s), JSON.stringify(['heritage-recolements', applied, page, revision, epoch]));
    const canCreate = can(me, 'HERITAGE_RECOLEMENT_MANAGE', scope);
    const refresh = () => setRevision(r => r + 1);
    const apply = (next: typeof form) => { setForm(next); setApplied(next); setPage(0); };
    const items = listQ.data?.items ?? [];
    return <>
        <div className="panel">
            <div className="section-heading"><h3>Récolements</h3>{canCreate && <button className="btn small secondary" onClick={() => setCreating(true)}>Nouvelle campagne</button>}</div>
            <p className="wf-note">Vérifier la collection pièce par pièce : chaque original reçoit un constat de présence ou un report motivé, et la campagne se clôture avec un procès-verbal, par une autre personne que celle qui l’a lancée.</p>
            <form className="asset-filters" onSubmit={e => { e.preventDefault(); apply(form); }} role="search" aria-label="Rechercher une campagne">
                <Field label="Recherche"><input value={form.q} onChange={e => setForm({ ...form, q: e.target.value })} placeholder="Numéro, libellé ou objet" /></Field>
                <Field label="Étape"><select value={form.statut} onChange={e => apply({ ...form, statut: e.target.value })}><option value="">Toutes</option>{STATUSES.map(s => <option key={s} value={s}>{CAMPAIGN_LABELS[s]}</option>)}</select></Field>
                <button type="submit" className="btn small secondary">Rechercher</button>
            </form>
            {listQ.loading ? <Busy /> : listQ.error ? <ErrorNotice error={listQ.error} onRetry={listQ.refresh} /> : items.length ? <>
                <div className="table-scroll"><table><thead><tr><th>Numéro</th><th>Campagne</th><th>Périmètre</th><th>Dates prévues</th><th>Étape</th><th>Avancement</th><th>Modifiée</th></tr></thead>
                    <tbody>{items.map((c: RecolementSummary) => <tr key={c.id} className={'rec-row ' + campaignTone(c.statut)}>
                        <td className="nowrap"><button type="button" className="text-link" onClick={() => setOpened(c.id)}>{c.numero}</button></td><td>{c.libelle}</td>
                        <td>{c.localisation.length ? c.localisation.join(' › ') : 'Toute l’institution'}</td><td>{dateRangeText(c.dateDebutPrevue, c.dateFinPrevue)}</td>
                        <td><Badge value={c.statut} label={campaignLabel(c.statut)} /></td><td className="rec-cell"><ProgressBar progress={c.progres} compact /></td><td>{formatDate(c.updatedAt)}</td></tr>)}</tbody></table></div>
                <Pagination page={page} hasMore={listQ.data?.hasMore ?? false} onChange={setPage} count={items.length} />
            </> : <Empty title="Aucune campagne de récolement" description={Object.values(applied).some(Boolean) ? 'Aucune campagne ne correspond à ces critères.' : canCreate ? 'Planifiez la première campagne : elle fige un périmètre, puis chaque original est constaté.' : 'Aucune campagne dans votre périmètre.'} />}
        </div>
        {creating && <CampaignFormDialog onClose={() => setCreating(false)} onSaved={c => { refresh(); setOpened(c.id); }} />}
        {opened && <RecolementDialog id={opened} onClose={() => setOpened(null)} onChanged={refresh} />}
    </>;
}

