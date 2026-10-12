import React, { useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { Badge, Busy, Empty, ErrorNotice, Field, Modal, Notice, Pagination, formatDate, useResource } from './components';
import { PickerDialog } from './HeritageAssets';
import { ageText, dayText } from '../core/placement';
import { label } from '../core/heritageAssets';
import {
    ATTENTION_LABELS, ATTENTION_NEXT_STEPS, CONTEXT_CHOICES, CONTEXT_LABELS, HANDLING_LABELS, STATE_HINTS, STATE_LABELS, TREATMENT_STATUS_LABELS, TREATMENT_TYPE_LABELS, URGENCY_LABELS, alterationLabels,
    attentionLabel, attentionTone, emptyProposalForm, emptyReportForm, emptyTransitionForm, handlingChoices, handlingTone, needsForm, proposalBody, proposalOf, proposalProblems, reportBody, reportProblems,
    stateLabel, stateTone, statusLabel, transitionNeeds, treatmentBody, treatmentDays, treatmentTransitionLabel, treatmentTransitionProblems, worstAttention
} from '../core/conservation';
import type { ProposalForm, ReportForm, TreatmentTransitionForm } from '../core/conservation';
import type {
    AssetConservation, ConditionReport, ConditionState, ConservationAttention, ConservationQueuePage, HeritageAsset, HeritageReference, OriginalConservation, Page, RecordDocument, Treatment, TreatmentJournalEntry,
    TreatmentTransitionOption, TreatmentType
} from '../core/types';

const todayIso = () => new Date().toISOString().slice(0, 10);
const ATTENTIONS = Object.keys(ATTENTION_LABELS) as ConservationAttention[];

/** Les altérations du référentiel (valeurs d'exemple, administrables), chargées une fois pour l'écran. */
export function useAlterations() {
    const { heritage, epoch } = useSession();
    const q = useResource<HeritageReference[]>(s => heritage!.references('ALTERATION', s), 'heritage-alterations:' + epoch);
    return q.data ?? [];
}

// ---------- champs d'un constat (constat libre, ou constat d'après traitement)

export function ReportFields({ form, setForm, references, institutionId, final, disabled }: { form: ReportForm; setForm: (f: ReportForm) => void; references: HeritageReference[]; institutionId: string; final: boolean; disabled: boolean }) {
    const { records, epoch } = useSession();
    const [picking, setPicking] = useState(false);
    const [titles, setTitles] = useState<Record<string, string>>({});
    const docsQ = useResource<Page<RecordDocument>>(s => picking ? records!.documents({ institutionId, page: 0, size: 100 }, s) : Promise.resolve({ items: [], page: 0, size: 0, hasMore: false }), 'conservation-docs:' + picking + ':' + institutionId + ':' + epoch);
    const set = (patch: Partial<ReportForm>) => setForm({ ...form, ...patch });
    const choices = handlingChoices(form.etat);
    const active = references.filter(r => r.actif || form.alterations.includes(r.code));
    return <>
        <div className="form-grid">
            {!final && <Field label="Circonstances *"><select value={form.contexte} onChange={e => set({ contexte: e.target.value as ReportForm['contexte'] })} disabled={disabled}><option value="">Choisir…</option>
                {CONTEXT_CHOICES.map(c => <option key={c} value={c}>{CONTEXT_LABELS[c]}</option>)}</select></Field>}
            <Field label="Date du constat" hint="Aujourd’hui si elle n’est pas précisée"><input type="date" max={todayIso()} value={form.constateLe} onChange={e => set({ constateLe: e.target.value })} disabled={disabled} /></Field>
        </div>
        <fieldset className="placement-choices" disabled={disabled}><legend>État constaté *</legend>
            {(Object.keys(STATE_LABELS) as ConditionState[]).map(s => <label key={s}><input type="radio" name={'etat-' + (final ? 'final' : 'libre')} value={s} checked={form.etat === s}
                onChange={() => set({ etat: s, manipulation: s === 'INTERVENTION_REQUISE' && form.manipulation === 'LIBRE' ? '' : form.manipulation })} /><span><strong>{STATE_LABELS[s]}</strong><small>{STATE_HINTS[s]}</small></span></label>)}
        </fieldset>
        <div className="form-grid">
            <Field label="Manipulation *" hint="Ce que l’on peut faire de l’objet"><select value={form.manipulation} onChange={e => set({ manipulation: e.target.value as ReportForm['manipulation'] })} disabled={disabled}><option value="">Choisir…</option>
                {choices.map(h => <option key={h} value={h}>{HANDLING_LABELS[h]}</option>)}</select></Field>
            <Field label="Urgence"><select value={form.urgence} onChange={e => set({ urgence: e.target.value as ReportForm['urgence'] })} disabled={disabled}>{Object.entries(URGENCY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            {form.etat !== 'STABLE' && form.etat !== '' && <fieldset className="span2 asset-criteres" disabled={disabled}><legend>Altérations constatées *</legend>{active.map(r =>
                <label key={r.code}><input type="checkbox" checked={form.alterations.includes(r.code)} onChange={e => set({ alterations: e.target.checked ? [...form.alterations, r.code] : form.alterations.filter(x => x !== r.code) })} />{r.libelle}</label>)}</fieldset>}
            <Field label="Observations * (au moins 10 caractères)" wide hint="Ce qui a été vu : où, quelle étendue, depuis quand si on le sait"><textarea value={form.observations} onChange={e => set({ observations: e.target.value })} rows={3} maxLength={20000} disabled={disabled} /></Field>
            {form.etat === 'INTERVENTION_REQUISE' && <Field label="Traitement recommandé * (au moins 10 caractères)" wide><textarea value={form.traitementRecommande} onChange={e => set({ traitementRecommande: e.target.value })} rows={2} maxLength={10000} disabled={disabled} /></Field>}
            <div className="span2 conservation-docs"><div className="section-heading"><h4>Photographies et pièces</h4><button type="button" className="btn small secondary" onClick={() => setPicking(true)} disabled={disabled}>Joindre un document</button></div>
                {form.documentIds.length ? <ul className="asset-links">{form.documentIds.map(id => <li key={id}><span>{titles[id] ?? id}</span><button type="button" className="btn small secondary" onClick={() => set({ documentIds: form.documentIds.filter(d => d !== id) })} disabled={disabled}>Retirer</button></li>)}</ul> : <small className="wf-note">Aucune pièce jointe (dix au plus).</small>}</div>
        </div>
        {picking && <PickerDialog title="Joindre un document" loading={docsQ.loading} items={(docsQ.data?.items ?? []).filter(d => !form.documentIds.includes(d.id)).map(d => ({ id: d.id, label: d.title, detail: d.reference }))}
            onPick={async id => { const doc = docsQ.data?.items.find(d => d.id === id); if (doc) setTitles(t => ({ ...t, [id]: doc.title })); if (form.documentIds.length < 10) set({ documentIds: [...form.documentIds, id] }); }} onClose={() => setPicking(false)} />}
    </>;
}

// ---------- nouveau constat

function ReportDialog({ bienId, institutionId, original, references, onClose, onDone }: { bienId: string; institutionId: string; original: OriginalConservation; references: HeritageReference[]; onClose: () => void; onDone: () => void }) {
    const { heritage } = useSession();
    const key = useRef(crypto.randomUUID());
    const [form, setForm] = useState<ReportForm>(() => emptyReportForm('PERIODIQUE'));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const problems = reportProblems(form, todayIso());
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) return;
        setBusy(true); setError(null);
        try { await heritage!.command('/assets/' + bienId + '/originals/' + original.archiveId + '/condition-reports', reportBody(form), key.current, 'POST'); onDone(); onClose(); }
        catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal title="Constater l’état" subtitle={original.cote + (original.libelle ? ' — ' + original.libelle : '')} onClose={onClose} locked={busy} wide>
        <form onSubmit={submit}>
            <Notice>Le constat est daté, signé et ne se modifie pas : un constat plus récent le remplace, et l’historique garde tous les états successifs. L’état matériel du bien suit le plus préoccupant des derniers constats de ses originaux.</Notice>
            <ReportFields form={form} setForm={setForm} references={references} institutionId={institutionId} final={false} disabled={busy} />
            {problems.length > 0 && form.etat !== '' && <ul className="wf-blockers" aria-label="À compléter">{problems.map(p => <li key={p} className="warn"><span>{p}</span></li>)}</ul>}
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy || problems.length > 0}>Enregistrer le constat</button></footer>
        </form>
    </Modal>;
}

// ---------- proposition de traitement (ou sa modification tant qu'elle est une proposition)

function ProposalDialog({ bienId, original, treatment, onClose, onDone }: { bienId: string; original: OriginalConservation; treatment?: Treatment; onClose: () => void; onDone: () => void }) {
    const { heritage } = useSession();
    const key = useRef(crypto.randomUUID());
    const [form, setForm] = useState<ProposalForm>(() => treatment ? proposalOf(treatment) : emptyProposalForm());
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const problems = proposalProblems(form);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) return;
        setBusy(true); setError(null);
        try {
            if (treatment) await heritage!.command('/treatments/' + treatment.id, { ...proposalBody(form), expectedVersion: treatment.version }, crypto.randomUUID(), 'PUT');
            else await heritage!.command('/assets/' + bienId + '/originals/' + original.archiveId + '/treatments', proposalBody(form), key.current, 'POST');
            onDone(); onClose();
        } catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal title={treatment ? 'Modifier la proposition' : 'Proposer un traitement'} subtitle={original.cote + (treatment ? ' · ' + treatment.numero : '')} onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <Notice>Le traitement part du dernier constat d’état. Il sera validé ou refusé par une autre personne que vous ; tant qu’il n’est pas validé, vous pouvez encore le modifier.</Notice>
            <div className="form-grid">
                <Field label="Intitulé *" wide><input value={form.intitule} onChange={e => setForm({ ...form, intitule: e.target.value })} maxLength={255} disabled={busy} /></Field>
                <Field label="Nature du traitement *"><select value={form.typeTraitement} onChange={e => setForm({ ...form, typeTraitement: e.target.value as TreatmentType })} disabled={busy}><option value="">Choisir…</option>
                    {Object.entries(TREATMENT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                <Field label="Diagnostic * (au moins 10 caractères)" wide hint="Pourquoi traiter : ce que le constat montre"><textarea value={form.diagnostic} onChange={e => setForm({ ...form, diagnostic: e.target.value })} rows={3} maxLength={20000} disabled={busy} /></Field>
                <Field label="Traitement prévu * (au moins 10 caractères)" wide hint="Ce qui sera fait, avec quels matériaux ou quelle méthode"><textarea value={form.traitementPrevu} onChange={e => setForm({ ...form, traitementPrevu: e.target.value })} rows={3} maxLength={20000} disabled={busy} /></Field>
            </div>
            {problems.length > 0 && form.intitule !== '' && <ul className="wf-blockers" aria-label="À compléter">{problems.map(p => <li key={p} className="warn"><span>{p}</span></li>)}</ul>}
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy || problems.length > 0}>{treatment ? 'Enregistrer' : 'Proposer le traitement'}</button></footer>
        </form>
    </Modal>;
}

// ---------- passages d'un traitement

function TreatmentTransitionDialog({ treatment, option, institutionId, references, onClose, onDone }: { treatment: Treatment; option: TreatmentTransitionOption; institutionId: string; references: HeritageReference[]; onClose: () => void; onDone: () => void }) {
    const { heritage } = useSession();
    const needs = transitionNeeds(option);
    const [form, setForm] = useState<TreatmentTransitionForm>(emptyTransitionForm);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const problems = treatmentTransitionProblems(option, form, todayIso());
    const run = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) return;
        setBusy(true); setError(null);
        try { await heritage!.command('/treatments/' + treatment.id + '/transitions', treatmentBody(option.vers, treatment.version, form, option), crypto.randomUUID(), 'POST'); onDone(); onClose(); }
        catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal title={treatmentTransitionLabel(option.vers)} subtitle={treatment.numero + ' · ' + treatment.intitule} onClose={onClose} locked={busy} wide={needs.constat}>
        <form onSubmit={run}>
            {option.vers === 'VALIDE' && <Notice>La validation engage l’institution : elle est conservée avec son auteur et sa date. Elle est faite par une autre personne que celle qui a proposé le traitement.</Notice>}
            {option.vers === 'EN_COURS' && <Notice>Pendant le traitement, l’objet n’est plus manipulable et le bien est « en restauration ».</Notice>}
            {option.vers === 'TERMINE' && <Notice>Un traitement se termine avec un compte rendu et un constat de l’état de l’objet après le traitement : ce constat devient le dernier état connu.</Notice>}
            {(option.vers === 'ANNULE' || option.vers === 'REFUSE') && <Notice tone="warning">Cette décision est définitive ; un nouveau traitement pourra ensuite être proposé.</Notice>}
            <div className="form-grid">
                {needs.intervenant && <Field label="Réalisé par *" wide hint="Atelier de restauration, restaurateur, agent de conservation"><input value={form.intervenant} onChange={e => setForm({ ...form, intervenant: e.target.value })} maxLength={255} disabled={busy} /></Field>}
                {needs.texte && <Field label={needs.texteLabel + ' * (au moins 10 caractères)'} wide><textarea value={form.texte} onChange={e => setForm({ ...form, texte: e.target.value })} rows={3} maxLength={20000} disabled={busy} /></Field>}
            </div>
            {needs.constat && <><h4 className="conservation-subtitle">État de l’objet après le traitement</h4><ReportFields form={form.constat} setForm={constat => setForm({ ...form, constat })} references={references} institutionId={institutionId} final disabled={busy} /></>}
            {problems.length > 0 && (form.texte !== '' || form.intervenant !== '' || form.constat.etat !== '') && <ul className="wf-blockers" aria-label="À compléter">{problems.map(p => <li key={p} className="warn"><span>{p}</span></li>)}</ul>}
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Retour</button><button type="submit" className="btn primary" disabled={busy || problems.length > 0}>Confirmer</button></footer>
        </form>
    </Modal>;
}

function TreatmentDialog({ id, institutionId, original, bienId, references, onClose, onChanged }: { id: string; institutionId: string; original: OriginalConservation; bienId: string; references: HeritageReference[]; onClose: () => void; onChanged: () => void }) {
    const { heritage, epoch } = useSession();
    const [revision, setRevision] = useState(0);
    const [chosen, setChosen] = useState<TreatmentTransitionOption | null>(null);
    const [editing, setEditing] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const q = useResource<Treatment>(s => heritage!.treatment(id, s), 'treatment:' + id + ':' + revision + ':' + epoch);
    const journalQ = useResource<TreatmentJournalEntry[]>(s => heritage!.treatmentJournal(id, s), 'treatment-journal:' + id + ':' + revision + ':' + epoch);
    const last = useRef<Treatment | null>(null);
    if (q.data) last.current = q.data;
    const treatment = q.data ?? last.current;
    const refresh = () => { setRevision(r => r + 1); onChanged(); };
    if (!treatment && q.loading) return <Modal title="Traitement de conservation" onClose={onClose} wide><Busy /></Modal>;
    if (!treatment) return <Modal title="Traitement de conservation" onClose={onClose} wide><ErrorNotice error={q.error} onRetry={q.refresh} /></Modal>;
    const days = treatmentDays(treatment);
    const quick = async (option: TreatmentTransitionOption) => {
        setBusy(true); setError(null);
        try { await heritage!.command('/treatments/' + treatment.id + '/transitions', treatmentBody(option.vers, treatment.version, emptyTransitionForm(), option), crypto.randomUUID(), 'POST'); refresh(); }
        catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal title={treatment.intitule} subtitle={treatment.numero + ' · ' + TREATMENT_TYPE_LABELS[treatment.typeTraitement]} onClose={onClose} wide>
        <div className="entry-head"><Badge value={treatment.statut} label={statusLabel(treatment.statut)} />{treatment.modifiable && <button type="button" className="btn small secondary" onClick={() => setEditing(true)}>Modifier la proposition</button>}</div>
        {treatment.passages.length > 0 && <div className="asset-transitions"><div className="table-actions">{treatment.passages.map(option => {
            const blocked = option.bloquants.length > 0;
            const why = !option.peutAgir ? 'Habilitation requise : ' + option.permissions.join(' ou ') : blocked ? 'Conditions non remplies' : undefined;
            return <button key={option.vers} type="button" className={'btn small ' + (option.vers === 'ANNULE' || option.vers === 'REFUSE' ? 'secondary' : 'primary')} disabled={!option.peutAgir || blocked || busy} title={why}
                onClick={() => needsForm(option) ? setChosen(option) : void quick(option)}>{treatmentTransitionLabel(option.vers)}</button>;
        })}</div>
            {treatment.passages.filter(o => o.peutAgir && o.bloquants.length > 0).map(o => <ul key={o.vers} className="wf-blockers" aria-label={treatmentTransitionLabel(o.vers)}>{o.bloquants.map(b => <li key={b.code} className="bad"><span>{b.message}</span></li>)}</ul>)}
            {error ? <ErrorNotice error={error} /> : null}</div>}
        <div className="asset-tab">
            <section className="asset-group"><h4>Diagnostic</h4><p className="conservation-text">{treatment.diagnostic}</p><h4>Traitement prévu</h4><p className="conservation-text">{treatment.traitementPrevu}</p></section>
            <dl className="asset-fields">
                <div><dt>Proposé le</dt><dd>{dayText(treatment.proposeLe)}</dd></div>
                {treatment.valideLe && <div><dt>Validé le</dt><dd>{dayText(treatment.valideLe)}</dd></div>}
                {treatment.intervenant && <div><dt>Réalisé par</dt><dd>{treatment.intervenant}</dd></div>}
                {treatment.debutLe && <div><dt>Démarré le</dt><dd>{dayText(treatment.debutLe)}</dd></div>}
                {treatment.finLe && <div><dt>Terminé le</dt><dd>{dayText(treatment.finLe)}{days !== null && ' (' + days + ' jour' + (days > 1 ? 's' : '') + ')'}</dd></div>}
                {treatment.fermeMotif && <div className="wide"><dt>{treatment.statut === 'REFUSE' ? 'Motif du refus' : 'Motif de l’annulation'}</dt><dd>{treatment.fermeMotif}</dd></div>}
                {treatment.compteRendu && <div className="wide"><dt>Compte rendu</dt><dd>{treatment.compteRendu}</dd></div>}
            </dl>
            <section className="asset-group"><h4>Historique</h4>
                {journalQ.loading ? <Busy /> : journalQ.error ? <ErrorNotice error={journalQ.error} onRetry={journalQ.refresh} /> : <ol className="wf-history asset-journal">{[...(journalQ.data ?? [])].reverse().map(e => <li key={e.id}>
                    <time dateTime={e.createdAt}>{formatDate(e.createdAt)}</time>
                    <span><Badge value={e.genre} label={label({ CREATION: 'Proposition', MODIFICATION: 'Modification', TRANSITION: 'Passage' }, e.genre)} /></span>
                    {e.genre === 'TRANSITION' ? <p>{statusLabel(String(e.ancienneValeur))} → {statusLabel(String(e.nouvelleValeur))}</p> : null}
                    {e.motif && <p>Motif : {e.motif}</p>}</li>)}</ol>}</section>
        </div>
        {chosen && <TreatmentTransitionDialog treatment={treatment} option={chosen} institutionId={institutionId} references={references} onClose={() => setChosen(null)} onDone={refresh} />}
        {editing && <ProposalDialog bienId={bienId} original={original} treatment={treatment} onClose={() => setEditing(false)} onDone={refresh} />}
        <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose}>Fermer</button></footer>
    </Modal>;
}

// ---------- fiche de conservation d'un original

function ReportItem({ report, references }: { report: ConditionReport; references: HeritageReference[] }) {
    return <li><time dateTime={report.constateLe}>{dayText(report.constateLe)}</time>
        <span><Badge value={report.etat} label={STATE_LABELS[report.etat]} /><small> {CONTEXT_LABELS[report.contexte]} · {HANDLING_LABELS[report.manipulation]}{report.urgence !== 'AUCUNE' && ' · ' + URGENCY_LABELS[report.urgence]}{report.auteur && ' · par ' + report.auteur}</small></span>
        {report.alterations.length > 0 && <p>Altérations : {alterationLabels(report.alterations, references).join(', ')}</p>}
        <p>{report.observations}</p>
        {report.traitementRecommande && <p>Traitement recommandé : {report.traitementRecommande}</p>}
        {report.documents.length > 0 && <small>Pièces : {report.documents.map(d => d.titre).join(', ')}</small>}</li>;
}

export function OriginalCard({ bienId, institutionId, original, references, onChanged }: { bienId: string; institutionId: string; original: OriginalConservation; references: HeritageReference[]; onChanged: () => void }) {
    const [dialog, setDialog] = useState<'report' | 'propose' | null>(null);
    const [history, setHistory] = useState(false);
    const [openTreatment, setOpenTreatment] = useState<string | null>(null);
    const worst = worstAttention(original.attention);
    const latest = original.constats[0];
    return <section className={'placement-card ' + attentionTone(worst)} aria-label={'Conservation de ' + original.cote}>
        <div className="section-heading"><h4>{original.cote}{original.libelle && ' — ' + original.libelle}</h4>
            <span className="placement-gaps"><Badge value={original.etat ?? 'NON_EVALUE'} label={stateLabel(original.etat)} />{original.manipulation && <Badge value={'M_' + original.manipulation} label={HANDLING_LABELS[original.manipulation]} />}
                {original.attention.filter(a => a !== 'FRAGILE').map(a => <Badge key={a} value={'A_' + a} label={attentionLabel(a)} />)}</span></div>
        {latest ? <p className="placement-summary">Dernier constat {dayText(latest.constateLe)} ({ageText(original.ageConstatJours)}) : {STATE_LABELS[latest.etat].toLowerCase()}.</p> : <p className="placement-summary">L’état de cet original n’a jamais été constaté.</p>}
        {original.enTraitement && <Notice tone="warning">Traitement en cours : l’objet ne se manipule pas.</Notice>}
        {latest && <dl className="asset-fields placement-facts">
            <div><dt>Manipulation</dt><dd className={handlingTone(original.manipulation)}>{original.manipulation ? HANDLING_LABELS[original.manipulation] : '—'}{original.enTraitement && <small className="cell-sub">Pendant le traitement</small>}</dd></div>
            <div><dt>Urgence</dt><dd>{original.urgence ? URGENCY_LABELS[original.urgence] : '—'}</dd></div>
            {latest.alterations.length > 0 && <div className="wide"><dt>Altérations</dt><dd>{alterationLabels(latest.alterations, references).join(', ')}</dd></div>}
            <div className="wide"><dt>Observations</dt><dd>{latest.observations}</dd></div>
            {latest.traitementRecommande && <div className="wide"><dt>Traitement recommandé</dt><dd>{latest.traitementRecommande}</dd></div>}
        </dl>}
        {original.attention.length > 0 && <ul className="asset-info placement-steps">{original.attention.map(a => <li key={a}><strong>{attentionLabel(a)}.</strong> {ATTENTION_NEXT_STEPS[a]}</li>)}</ul>}
        {original.traitements.length > 0 && <section className="asset-group"><h4>Traitements</h4><ul className="asset-links">{original.traitements.map(t => <li key={t.id}>
            <span><strong>{t.numero}</strong> — {t.intitule} <Badge value={t.statut} label={TREATMENT_STATUS_LABELS[t.statut]} /><small> · {TREATMENT_TYPE_LABELS[t.typeTraitement]} · proposé le {dayText(t.proposeLe)}</small></span>
            <button type="button" className="btn small secondary" onClick={() => setOpenTreatment(t.id)}>Ouvrir</button></li>)}</ul></section>}
        <div className="table-actions">
            {original.constats.length > 0 && <button type="button" className="btn small secondary" onClick={() => setHistory(h => !h)} aria-expanded={history}>{history ? 'Masquer les constats' : 'Constats successifs (' + original.constats.length + ')'}</button>}
            {original.peutConstater && <button type="button" className="btn small primary" onClick={() => setDialog('report')}>Nouveau constat d’état</button>}
            {original.peutProposer && <button type="button" className="btn small secondary" onClick={() => setDialog('propose')}>Proposer un traitement</button>}
        </div>
        {history && <ol className="wf-history placement-history conservation-history">{original.constats.map(r => <ReportItem key={r.id} report={r} references={references} />)}</ol>}
        {dialog === 'report' && <ReportDialog bienId={bienId} institutionId={institutionId} original={original} references={references} onClose={() => setDialog(null)} onDone={onChanged} />}
        {dialog === 'propose' && <ProposalDialog bienId={bienId} original={original} onClose={() => setDialog(null)} onDone={onChanged} />}
        {openTreatment && <TreatmentDialog id={openTreatment} institutionId={institutionId} original={original} bienId={bienId} references={references} onClose={() => setOpenTreatment(null)} onChanged={onChanged} />}
    </section>;
}

// ---------- onglet « Conservation » d'un bien

export function ConservationTab({ asset, onChanged }: { asset: HeritageAsset; onChanged: () => void }) {
    const { heritage, epoch } = useSession();
    const [revision, setRevision] = useState(0);
    const references = useAlterations();
    const q = useResource<AssetConservation>(s => heritage!.assetConservation(asset.id, s), 'asset-conservation:' + asset.id + ':' + asset.version + ':' + revision + ':' + epoch);
    const last = useRef<AssetConservation | null>(null);
    if (q.data) last.current = q.data;
    const data = q.data ?? last.current;
    const changed = () => { setRevision(r => r + 1); onChanged(); };
    if (!data && q.loading) return <Busy />;
    if (!data) return <ErrorNotice error={q.error} onRetry={q.refresh} />;
    const digital = asset.champs.natureOriginale === 'NUMERIQUE_NATIF';
    return <div className="asset-tab">
        <Notice>L’état matériel d’un original se constate, à des dates successives : il ne se saisit pas. L’état matériel du bien est le plus préoccupant des derniers constats de ses originaux.</Notice>
        {data.originaux.length === 0
            ? <Empty title={digital ? 'Bien numérique natif' : 'Aucun original relié'} description={digital ? 'Il n’y a pas d’original physique dont constater l’état.' : 'Reliez l’archive physique dans l’onglet « Ressources et liens » pour constater son état.'} />
            : data.originaux.map(o => <OriginalCard key={o.archiveId} bienId={asset.id} institutionId={asset.institutionId} original={o} references={references} onChanged={changed} />)}
    </div>;
}

// ---------- un bien depuis la liste « à traiter »

function ConservationDialog({ bienId, onClose, onChanged }: { bienId: string; onClose: () => void; onChanged: () => void }) {
    const { heritage, epoch } = useSession();
    const [revision, setRevision] = useState(0);
    const references = useAlterations();
    const q = useResource<AssetConservation>(s => heritage!.assetConservation(bienId, s), 'dialog-conservation:' + bienId + ':' + revision + ':' + epoch);
    const last = useRef<AssetConservation | null>(null);
    if (q.data) last.current = q.data;
    const data = q.data ?? last.current;
    const changed = () => { setRevision(r => r + 1); onChanged(); };
    return <Modal title={data ? data.identifiant : 'Conservation'} subtitle={data?.intitule} onClose={onClose} wide>
        {!data && q.loading ? <Busy /> : !data ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : <div className="asset-tab">
            <small className="wf-note">État matériel du bien : {stateLabel(data.etatMateriel === 'NON_EVALUE' ? null : data.etatMateriel)}</small>
            {data.originaux.map(o => <OriginalCard key={o.archiveId} bienId={data.bienId} institutionId={data.institutionId} original={o} references={references} onChanged={changed} />)}</div>}
        <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose}>Fermer</button></footer>
    </Modal>;
}

// ---------- liste des originaux qui demandent de l'attention

export function ConservationQueuePanel() {
    const { heritage, epoch } = useSession();
    const [form, setForm] = useState({ attention: '', q: '' });
    const [applied, setApplied] = useState(form);
    const [page, setPage] = useState(0);
    const [revision, setRevision] = useState(0);
    const [opened, setOpened] = useState<string | null>(null);
    const listQ = useResource<ConservationQueuePage>(s => heritage!.conservationQueue({ ...applied, page, size: 20 }, s), JSON.stringify(['conservation-queue', applied, page, revision, epoch]));
    const apply = (next: typeof form) => { setForm(next); setApplied(next); setPage(0); };
    const items = listQ.data?.items ?? [];
    return <>
        <div className="panel">
            <div className="section-heading"><h3>Conservation</h3></div>
            <p className="wf-note">Les originaux qui demandent de l’attention, les plus graves d’abord : à traiter, traitements à valider ou à démarrer, en cours, fragiles, constats anciens ou jamais faits. L’état matériel se constate à des dates successives, il ne se saisit pas.</p>
            <form className="asset-filters" onSubmit={e => { e.preventDefault(); apply(form); }} role="search" aria-label="Rechercher un original">
                <Field label="Recherche"><input value={form.q} onChange={e => setForm({ ...form, q: e.target.value })} placeholder="Cote, identifiant ou intitulé du bien" /></Field>
                <Field label="Point d’attention"><select value={form.attention} onChange={e => apply({ ...form, attention: e.target.value })}><option value="">Tous</option>{ATTENTIONS.map(a => <option key={a} value={a}>{ATTENTION_LABELS[a]}</option>)}</select></Field>
                <button type="submit" className="btn small secondary">Rechercher</button>
            </form>
            {listQ.loading ? <Busy /> : listQ.error ? <ErrorNotice error={listQ.error} onRetry={listQ.refresh} /> : items.length ? <>
                <p className="wf-note" role="status">{listQ.data!.total} {listQ.data!.total > 1 ? 'originaux' : 'original'} à suivre</p>
                <div className="table-scroll"><table><thead><tr><th>Bien</th><th>Original</th><th>État</th><th>Manipulation</th><th>Dernier constat</th><th>Traitement</th><th>Attention</th></tr></thead>
                    <tbody>{items.map(r => <tr key={r.archiveId}>
                        <td className="nowrap"><button type="button" className="text-link" onClick={() => setOpened(r.bienId)}>{r.bienIdentifiant}</button><small className="cell-sub">{r.bienIntitule}</small></td>
                        <td className="nowrap">{r.cote}</td>
                        <td>{r.etat ? <Badge value={r.etat} label={STATE_LABELS[r.etat]} /> : '—'}{r.urgence && r.urgence !== 'AUCUNE' && <small className="cell-sub">{URGENCY_LABELS[r.urgence]}</small>}</td>
                        <td>{r.manipulation ? HANDLING_LABELS[r.manipulation] : '—'}</td>
                        <td>{r.constateLe ? dayText(r.constateLe) : 'Jamais'}</td>
                        <td className="nowrap">{r.traitementNumero ? <>{r.traitementNumero}<small className="cell-sub">{statusLabel(r.traitementStatut)}</small></> : '—'}</td>
                        <td>{r.attention.map(a => <Badge key={a} value={'A_' + a} label={attentionLabel(a)} />)}</td></tr>)}</tbody></table></div>
                <Pagination page={page} hasMore={listQ.data?.hasMore ?? false} onChange={setPage} count={items.length} />
            </> : <Empty title="Rien à suivre" description={applied.attention || applied.q ? 'Aucun original ne correspond à ces critères.' : 'Aucun original ne demande d’attention dans votre périmètre.'} />}
        </div>
        {opened && <ConservationDialog bienId={opened} onClose={() => setOpened(null)} onChanged={() => setRevision(r => r + 1)} />}
    </>;
}
