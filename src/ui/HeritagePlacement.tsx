import React, { useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { can } from '../core/policy';
import { Badge, Busy, Empty, ErrorNotice, Field, Modal, Notice, Pagination, formatDate, useResource } from './components';
import {
    CURRENT_LABELS, EVENT_LABELS, GAP_LABELS, GAP_NEXT_STEPS, PRESENCE_HINTS, PRESENCE_LABELS, PRESENCE_SHORT, ageText, dayText, emptyRelocateForm, emptyVerifyForm, eventSummary, gapLabel, gapTone,
    placeText, placementSummary, relocateBody, relocateProblems, unitOptions, verifyBody, verifyProblems, worstGap
} from '../core/placement';
import type { UnitOption } from '../core/placement';
import { STATUS_LABELS } from '../core/movements';
import type { RelocateForm, VerifyForm } from '../core/placement';
import type { ArchivePlacement, AssetLocation, HeritageAsset, HeritagePlacementPage, Localisation, PlacementEvent, PlacementGap, PresenceResult, StoragePlace, StorageUnit } from '../core/types';
import { display } from '../core/format';

const GAPS = Object.keys(GAP_LABELS) as PlacementGap[];
const RESULTS: PresenceResult[] = ['PRESENTE', 'AUTRE_EMPLACEMENT', 'ABSENTE'];

/** Les unités de stockage et leurs localisations, chargées à l'ouverture d'un formulaire de choix. */
function useUnitChoices(enabled: boolean, exclude: string[]) {
    const { physicalArchives, epoch } = useSession();
    const unitsQ = useResource<StorageUnit[]>(s => enabled ? physicalArchives!.storageUnits(s) : Promise.resolve([]), 'placement-units:' + enabled + ':' + epoch);
    const locationsQ = useResource<Localisation[]>(s => enabled ? physicalArchives!.locations(s) : Promise.resolve([]), 'placement-locations:' + enabled + ':' + epoch);
    return { loading: unitsQ.loading || locationsQ.loading, error: unitsQ.error ?? locationsQ.error, options: unitOptions(unitsQ.data ?? [], locationsQ.data ?? [], exclude) };
}

// ---------- constat de présence

export type UnitSource = (enabled: boolean, exclude: string[]) => { loading: boolean; error: unknown; options: UnitOption[] };

/**
 * Fenêtre de constat de présence, réutilisée par le récolement : seule la façon d'envoyer le constat et la liste des emplacements nommables changent.
 * `submit` envoie le corps du constat avec la clé d'idempotence de cette ouverture de fenêtre.
 */
export function PresenceDialog({ target, submit, unitSource = useUnitChoices, onClose, onDone }: {
    target: { cote: string; habituel: StoragePlace }; submit: (body: Record<string, unknown>, key: string) => Promise<unknown>; unitSource?: UnitSource; onClose: () => void; onDone: () => void;
}) {
    const key = useRef(crypto.randomUUID());
    const [form, setForm] = useState<VerifyForm>(emptyVerifyForm);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const choices = unitSource(form.resultat === 'AUTRE_EMPLACEMENT', [target.habituel.unitId]);
    const problems = verifyProblems(form, target.habituel.unitId);
    const send = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) return;
        setBusy(true); setError(null);
        try { await submit(verifyBody(form), key.current); onDone(); onClose(); }
        catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal title="Vérifier la présence" subtitle={target.cote + ' · rangée à ' + placeText(target.habituel)} onClose={onClose} locked={busy}>
        <form onSubmit={send}>
            <Notice>Allez voir l’archive, puis dites ce que vous avez constaté. Le constat est daté, signé et ne se modifie pas : il se remplace par un constat plus récent.</Notice>
            <fieldset className="placement-choices" disabled={busy}><legend>Ce que vous avez constaté *</legend>
                {RESULTS.map(r => <label key={r}><input type="radio" name="presence" value={r} checked={form.resultat === r} onChange={() => setForm({ ...form, resultat: r })} />
                    <span><strong>{PRESENCE_LABELS[r]}</strong><small>{PRESENCE_HINTS[r]}</small></span></label>)}
            </fieldset>
            <div className="form-grid">
                {form.resultat === 'AUTRE_EMPLACEMENT' && <Field label="Emplacement où elle a été trouvée *" wide>
                    {choices.loading ? <Busy /> : <select value={form.uniteConstateeId} onChange={e => setForm({ ...form, uniteConstateeId: e.target.value })} disabled={busy}><option value="">Choisir…</option>
                        {choices.options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select>}</Field>}
                {form.resultat && <Field label={form.resultat === 'ABSENTE' ? 'Où elle a été cherchée * (au moins 10 caractères)' : 'Note'} wide hint={form.resultat === 'ABSENTE' ? 'Dire qu’une archive est introuvable engage : décrivez les recherches faites.' : 'Facultatif'}>
                    <textarea value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} rows={3} maxLength={4000} disabled={busy} /></Field>}
            </div>
            {choices.error ? <ErrorNotice error={choices.error} /> : null}
            {problems.length > 0 && form.resultat !== '' && <ul className="wf-blockers" aria-label="À compléter">{problems.map(p => <li key={p} className="warn"><span>{p}</span></li>)}</ul>}
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy || problems.length > 0}>Enregistrer le constat</button></footer>
        </form>
    </Modal>;
}

function VerifyDialog({ placement, onClose, onDone }: { placement: ArchivePlacement; onClose: () => void; onDone: () => void }) {
    const { physicalArchives } = useSession();
    return <PresenceDialog target={placement} onClose={onClose} onDone={onDone} submit={(body, key) => physicalArchives!.command('/archives/' + placement.archiveId + '/verifications', body, key, 'POST')} />;
}

// ---------- rangement

function RelocateDialog({ placement, canVerify, onClose, onDone }: { placement: ArchivePlacement; canVerify: boolean; onClose: () => void; onDone: () => void }) {
    const { physicalArchives } = useSession();
    const key = useRef(crypto.randomUUID());
    // Une archive trouvée ailleurs : le plus probable est de régulariser en faisant de cet emplacement son emplacement habituel.
    const suggested = placement.actuel.source === 'CONSTATE_AILLEURS' ? placement.actuel.unite?.unitId ?? '' : '';
    const [form, setForm] = useState<RelocateForm>(() => ({ ...emptyRelocateForm(suggested), constaterPresence: canVerify }));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const choices = useUnitChoices(true, [placement.habituel.unitId]);
    const problems = relocateProblems(form, placement.habituel.unitId);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) return;
        setBusy(true); setError(null);
        try { await physicalArchives!.command('/archives/' + placement.archiveId + '/relocate', relocateBody(form), key.current, 'POST'); onDone(); onClose(); }
        catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal title="Changer l’emplacement habituel" subtitle={placement.cote + ' · rangée à ' + placeText(placement.habituel)} onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <Notice>Le rangement change l’emplacement habituel et s’inscrit à l’historique des mouvements. Il ne déplace pas l’archive : c’est le constat de ce qui a été fait.</Notice>
            <div className="form-grid">
                <Field label="Nouvel emplacement habituel *" wide>{choices.loading ? <Busy /> : <select value={form.uniteStockageId} onChange={e => setForm({ ...form, uniteStockageId: e.target.value })} disabled={busy}><option value="">Choisir…</option>
                    {choices.options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select>}</Field>
                <Field label="Motif * (au moins 10 caractères)" wide hint="Réorganisation du magasin, régularisation d’un constat…"><textarea value={form.motif} onChange={e => setForm({ ...form, motif: e.target.value })} rows={3} maxLength={4000} disabled={busy} /></Field>
                {canVerify && <label className="field span2 asset-flag"><input type="checkbox" checked={form.constaterPresence} onChange={e => setForm({ ...form, constaterPresence: e.target.checked })} disabled={busy} /><span>Je constate la présence de l’archive à ce nouvel emplacement</span></label>}
            </div>
            {choices.error ? <ErrorNotice error={choices.error} /> : null}
            {problems.length > 0 && (form.uniteStockageId !== '' || form.motif !== '') && <ul className="wf-blockers" aria-label="À compléter">{problems.map(p => <li key={p} className="warn"><span>{p}</span></li>)}</ul>}
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy || problems.length > 0}>Changer l’emplacement</button></footer>
        </form>
    </Modal>;
}

// ---------- historique

function History({ archiveId, stamp }: { archiveId: string; stamp: string }) {
    const { physicalArchives, epoch } = useSession();
    const q = useResource<PlacementEvent[]>(s => physicalArchives!.placementHistory(archiveId, s), 'placement-history:' + archiveId + ':' + stamp + ':' + epoch);
    if (q.loading) return <Busy />;
    if (q.error) return <ErrorNotice error={q.error} onRetry={q.refresh} />;
    const events = q.data ?? [];
    if (!events.length) return <small className="wf-note">Aucun constat ni mouvement enregistré.</small>;
    return <ol className="wf-history placement-history">{events.map(e => <li key={e.id}>
        <time dateTime={e.at}>{formatDate(e.at)}</time>
        <span><Badge value={e.genre} label={EVENT_LABELS[e.genre]} />{e.resultat && <Badge value={e.resultat} label={PRESENCE_SHORT[e.resultat]} />}{e.par && <small> par {e.par}</small>}</span>
        <p>{eventSummary(e)}</p>
        {e.retourPrevu && <small>Retour prévu le {dayText(e.retourPrevu)}</small>}
        {e.texte && <p>{e.genre === 'VERIFICATION' ? 'Note' : 'Motif'} : {e.texte}</p>}
    </li>)}</ol>;
}

// ---------- fiche d'emplacement d'une archive

export function PlacementCard({ placement, canVerify, canRelocate, onChanged, titre }: { placement: ArchivePlacement; canVerify: boolean; canRelocate: boolean; onChanged: () => void; titre?: string }) {
    const [dialog, setDialog] = useState<'verify' | 'relocate' | null>(null);
    const [history, setHistory] = useState(false);
    const worst = worstGap(placement.ecarts);
    const out = placement.actuel.source === 'EN_SORTIE';
    const check = placement.derniereVerification;
    return <section className={'placement-card ' + gapTone(worst)} aria-label={'Emplacement de ' + placement.cote}>
        <div className="section-heading"><h4>{titre ?? placement.cote}{placement.support && <small> · {display(placement.support)}</small>}{placement.etatPhysique && <small> · {display(placement.etatPhysique)}</small>}</h4>
            <span className="placement-gaps">{placement.ecarts.length ? placement.ecarts.map(g => <Badge key={g} value={g} label={gapLabel(g)} />) : <Badge value="CONFORME" label="Sans écart" />}</span></div>
        <p className="placement-summary">{placementSummary(placement)}</p>
        <dl className="asset-fields placement-facts">
            <div><dt>Emplacement habituel</dt><dd>{placeText(placement.habituel)}{!placement.habituel.actif && <small> (unité inactive)</small>}</dd></div>
            <div><dt>Emplacement actuel</dt><dd>{CURRENT_LABELS[placement.actuel.source]}{placement.actuel.source === 'CONSTATE_AILLEURS' && <small className="cell-sub">{placeText(placement.actuel.unite)}</small>}{placement.actuel.source === 'EN_SORTIE' && placement.actuel.destination && <small className="cell-sub">Vers {placeText(placement.actuel.destination)}</small>}</dd></div>
            <div className="wide"><dt>Dernière présence vérifiée</dt><dd>{check ? <>{PRESENCE_SHORT[check.resultat]} le {dayText(check.verifieLe)} ({ageText(placement.ageVerificationJours)}){check.verifiePar && ' par ' + check.verifiePar}
                {!check.valide && <small className="placement-stale"> · ne vaut plus : l’archive a été déplacée depuis</small>}
                {check.note && <small className="placement-note"> · {check.note}</small>}</> : 'Jamais vérifiée'}</dd></div>
        </dl>
        {placement.ecarts.length > 0 && <ul className="asset-info placement-steps">{placement.ecarts.map(g => <li key={g}><strong>{gapLabel(g)}.</strong> {GAP_NEXT_STEPS[g]}</li>)}</ul>}
        <div className="table-actions">
            <button type="button" className="btn small secondary" onClick={() => setHistory(h => !h)} aria-expanded={history}>{history ? 'Masquer l’historique' : 'Historique des constats et mouvements'}</button>
            {canVerify && <button type="button" className="btn small primary" onClick={() => setDialog('verify')} disabled={out} title={out ? 'Archive sortie : enregistrez son retour avant de vérifier sa présence' : undefined}>Vérifier la présence</button>}
            {canRelocate && <button type="button" className="btn small secondary" onClick={() => setDialog('relocate')} disabled={out} title={out ? 'Archive sortie : enregistrez son retour avant de changer son emplacement' : undefined}>Changer l’emplacement habituel</button>}
        </div>
        {history && <History archiveId={placement.archiveId} stamp={(check?.id ?? '') + ':' + placement.habituel.unitId + ':' + placement.actuel.source} />}
        {dialog === 'verify' && <VerifyDialog placement={placement} onClose={() => setDialog(null)} onDone={onChanged} />}
        {dialog === 'relocate' && <RelocateDialog placement={placement} canVerify={canVerify} onClose={() => setDialog(null)} onDone={onChanged} />}
    </section>;
}

// ---------- onglet « Localisation » d'un bien

export function PlacementTab({ asset, onChanged }: { asset: HeritageAsset; onChanged: () => void }) {
    const { me, heritage, epoch } = useSession();
    const [revision, setRevision] = useState(0);
    const q = useResource<AssetLocation>(s => heritage!.assetLocation(asset.id, s), 'asset-location:' + asset.id + ':' + asset.version + ':' + revision + ':' + epoch);
    const canVerify = can(me, 'PHYSICALARCHIVES_VERIFY', {});
    const canRelocate = can(me, 'PHYSICALARCHIVES_MANAGE', {});
    const last = useRef<AssetLocation | null>(null);
    if (q.data) last.current = q.data;
    const data = q.data ?? last.current;
    const changed = () => { setRevision(r => r + 1); onChanged(); };
    if (!data && q.loading) return <Busy />;
    if (!data) return <ErrorNotice error={q.error} onRetry={q.refresh} />;
    const digital = asset.champs.natureOriginale === 'NUMERIQUE_NATIF';
    return <div className="asset-tab">
        {!data.emplacementVisible && <Notice tone="warning">Où se trouve l’original est une information sensible : elle exige l’habilitation de lecture des archives physiques. La disponibilité du bien reste visible dans ses états.</Notice>}
        {data.emplacementVisible && <Notice>On constate, on ne devine pas : l’emplacement habituel est celui où l’archive est rangée ; l’emplacement actuel et la dernière présence vérifiée ne se savent que par un constat ou un mouvement enregistré.</Notice>}
        {data.originaux.length === 0
            ? <Empty title={digital ? 'Bien numérique natif' : 'Aucun original relié'} description={digital ? 'Il n’y a pas d’original physique à localiser.' : 'Reliez l’archive physique dans l’onglet « Ressources et liens » pour localiser le bien.'} />
            : data.originaux.map(o => <React.Fragment key={o.archivePhysiqueId}>
                {o.mouvement && <p className="wf-note placement-movement" role="status"><strong>{o.cote}</strong> : sortie {o.mouvement.numero} — {STATUS_LABELS[o.mouvement.statut].toLowerCase()}, retour prévu le {dayText(o.mouvement.retourPrevu)}{o.mouvement.enRetard && ' (en retard)'}. Voir l’onglet « Mouvements ».</p>}
                {o.emplacement
                    ? <PlacementCard placement={o.emplacement} canVerify={canVerify} canRelocate={canRelocate} onChanged={changed} titre={o.cote + (o.libelle ? ' — ' + o.libelle : '')} />
                    : <section className="placement-card"><h4>{o.cote}{o.libelle && ' — ' + o.libelle}</h4><small className="wf-note">Emplacement non visible avec vos habilitations.</small></section>}</React.Fragment>)}
    </div>;
}

// ---------- archive seule (depuis la liste des écarts)

export function ArchivePlacementDialog({ archiveId, onClose, onChanged }: { archiveId: string; onClose: () => void; onChanged: () => void }) {
    const { me, physicalArchives, epoch } = useSession();
    const [revision, setRevision] = useState(0);
    const q = useResource<ArchivePlacement>(s => physicalArchives!.placement(archiveId, s), 'archive-placement:' + archiveId + ':' + revision + ':' + epoch);
    const last = useRef<ArchivePlacement | null>(null);
    if (q.data) last.current = q.data;
    const data = q.data ?? last.current;
    const changed = () => { setRevision(r => r + 1); onChanged(); };
    return <Modal title="Emplacement de l’archive" subtitle={data?.cote} onClose={onClose} wide>
        {!data && q.loading ? <Busy /> : !data ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : <div className="asset-tab">
            <PlacementCard placement={data} canVerify={can(me, 'PHYSICALARCHIVES_VERIFY', {})} canRelocate={can(me, 'PHYSICALARCHIVES_MANAGE', {})} onChanged={changed} />
        </div>}
        <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose}>Fermer</button></footer>
    </Modal>;
}

// ---------- liste des écarts

export function PlacementsPanel() {
    const { heritage, epoch } = useSession();
    const [form, setForm] = useState({ ecart: '', q: '' });
    const [applied, setApplied] = useState(form);
    const [page, setPage] = useState(0);
    const [revision, setRevision] = useState(0);
    const [opened, setOpened] = useState<string | null>(null);
    const listQ = useResource<HeritagePlacementPage>(s => heritage!.placements({ ...applied, page, size: 20 }, s), JSON.stringify(['heritage-placements', applied, page, revision, epoch]));
    const apply = (next: typeof form) => { setForm(next); setApplied(next); setPage(0); };
    const items = listQ.data?.items ?? [];
    return <>
        <div className="panel">
            <div className="section-heading"><h3>Localisation et vérifications</h3></div>
            <p className="wf-note">Les archives qui s’écartent de ce que l’on attend, les plus graves d’abord : introuvables, trouvées ailleurs, sorties en retard, jamais ou plus vérifiées. Une présence vérifiée ne vaut plus une fois l’archive déplacée.</p>
            <form className="asset-filters" onSubmit={e => { e.preventDefault(); apply(form); }} role="search" aria-label="Rechercher une archive à régulariser">
                <Field label="Recherche"><input value={form.q} onChange={e => setForm({ ...form, q: e.target.value })} placeholder="Cote de l’archive" /></Field>
                <Field label="Écart"><select value={form.ecart} onChange={e => apply({ ...form, ecart: e.target.value })}><option value="">Tous les écarts</option>{GAPS.map(g => <option key={g} value={g}>{GAP_LABELS[g]}</option>)}</select></Field>
                <button type="submit" className="btn small secondary">Rechercher</button>
            </form>
            {listQ.loading ? <Busy /> : listQ.error ? <ErrorNotice error={listQ.error} onRetry={listQ.refresh} /> : items.length ? <>
                <p className="wf-note" role="status">{listQ.data!.total} archive{listQ.data!.total > 1 ? 's' : ''} à régulariser</p>
                <div className="table-scroll"><table><thead><tr><th>Cote</th><th>Bien</th><th>Emplacement habituel</th><th>Emplacement actuel</th><th>Écart</th><th>Dernier constat</th></tr></thead>
                    <tbody>{items.map(row => {
                        const r = row.emplacement;
                        return <tr key={r.archiveId}>
                            <td className="nowrap"><button type="button" className="text-link" onClick={() => setOpened(r.archiveId)}>{r.cote}</button>{r.support && <small className="cell-sub">{display(r.support)}</small>}</td>
                            <td>{row.bien ? <>{row.bien.identifiant}<small className="cell-sub">{row.bien.intitule}</small></> : '—'}</td>
                            <td>{placeText(r.habituel)}</td>
                            <td>{CURRENT_LABELS[r.actuel.source]}{r.actuel.source === 'CONSTATE_AILLEURS' && <small className="cell-sub">{placeText(r.actuel.unite)}</small>}</td>
                            <td>{r.ecarts.map(g => <Badge key={g} value={g} label={gapLabel(g)} />)}</td>
                            <td>{r.verifieLe ? dayText(r.verifieLe) : 'Jamais'}</td></tr>;
                    })}</tbody></table></div>
                <Pagination page={page} hasMore={listQ.data?.hasMore ?? false} onChange={setPage} count={items.length} />
            </> : <Empty title="Aucun écart" description={applied.ecart || applied.q ? 'Aucune archive ne correspond à ces critères.' : 'Toutes les archives sont à leur place connue et vérifiée.'} />}
        </div>
        {opened && <ArchivePlacementDialog archiveId={opened} onClose={() => setOpened(null)} onChanged={() => setRevision(r => r + 1)} />}
    </>;
}
