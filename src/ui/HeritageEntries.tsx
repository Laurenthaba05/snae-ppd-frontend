import { ArchiveRecordPicker } from './ArchiveRecordPicker';
import { IntakeLinkPicker } from './IntakeLinkPicker';
import { ResourceDetailsButton } from './ResourceDetails';
import React, { useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { useWorkspace } from './workspace';
import { can } from '../core/policy';
import { ApiError } from '../core/http';
import { buildXlsx, downloadBytes, readSpreadsheet } from '../core/spreadsheet';
import { Badge, Busy, Empty, ErrorNotice, Field, Modal, Notice, Pagination, formatDate, useResource } from './components';
import { Icon } from './icons';
import { printHtml } from './printHtml';
import { FieldInput, PickerDialog, displayValue, fromDraft, toDraft } from './HeritageAssets';
import type { Draft } from './HeritageAssets';
import { NATURE_LABELS, PRISE_EN_CHARGE_LABELS, changedFields, dateText, label } from '../core/heritageAssets';
import {
    DECISION_LABELS, ENTRY_FIELD_GROUPS, ENTRY_FIELD_LABELS, ENTRY_JOURNAL_LABELS, ENTRY_MODE_LABELS, ENTRY_ROLE_LABELS, ENTRY_STATUS_LABELS, MAX_REPRISE_ROWS, TERMINAL,
    decisionChoices, emptyTransitionForm, entryJournalValue, entryLabel, entrySteps, entryTone, entryTransitionLabel, needsForm, parseRepriseTable, receiptHtml, receiptLines,
    receptionFields, repriseTemplate, transitionBody, transitionNeeds, transitionProblems
} from '../core/heritageEntries';
import type { RepriseRow, TransitionForm } from '../core/heritageEntries';
import type {
    AssetFields, EntryDashboard, EntryJournalEntry, EntryPage, EntryReceipt, EntryStatus, EntrySummary, EntryTransitionOption, HeritageAssetPage, HeritageEntry, HeritageReference, HeritageReprise, Page, RecordDocument
} from '../core/types';
import { display } from '../core/format';

const STATUS_CHIPS: EntryStatus[] = ['RECUE', 'EN_EXAMEN', 'COMPLEMENT_REQUIS', 'SITUATION_A_CLARIFIER', 'ACCEPTEE', 'REFUSEE'];
const todayIso = () => new Date().toISOString().slice(0, 10);
const isoDay = (iso: string | null | undefined) => iso ? dateText('EXACTE', iso, iso) : '—';

/** Les étapes du parcours : réception, examen, décision, formalisation ou restitution. */
function Steps({ status }: { status: EntryStatus }) {
    return <ol className="entry-steps" aria-label="Parcours de l’entrée">{entrySteps(status).map(step =>
        <li key={step.key} className={step.state} aria-current={step.state === 'current' ? 'step' : undefined}><span>{step.label}</span></li>)}</ol>;
}

/** Dit clairement ce que la remise des biens est — et n'est pas — tant que rien n'est décidé. */
function Mention({ entry }: { entry: Pick<HeritageEntry, 'statut' | 'mention'> }) {
    const tone = entryTone(entry.statut);
    return <div className={'entry-mention ' + tone} role="note"><strong>Nature de la prise en charge</strong><p>{entry.mention.texte}</p></div>;
}

// ---------- réception

export function ReceptionDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (entry: HeritageEntry) => void }) {
    const { heritage } = useSession();
    const { scope } = useWorkspace();
    const key = useRef(crypto.randomUUID());
    const [form, setForm] = useState({ modeReception: 'DON', dateReception: '', deposantNom: '', deposantActeurId: '', entreeArchivistiqueId: '', nombrePieces: '', motifReception: '', descriptionLot: '' });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const [problem, setProblem] = useState<string | null>(null);
    const set = (name: keyof typeof form, value: string) => setForm(old => ({ ...old, [name]: value }));
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setProblem(null);
        if (!scope.institutionId) return setProblem('Choisissez une institution dans le périmètre de travail.');
        if (form.nombrePieces.trim() && !/^[1-9]\d{0,6}$/.test(form.nombrePieces.trim())) return setProblem('Le nombre de pièces est un entier positif.');
        setBusy(true); setError(null);
        try {
            const created = await heritage!.command<HeritageEntry>('/entries', { institutionId: scope.institutionId, departementId: scope.departmentId ?? null, champs: receptionFields(form) }, key.current, 'POST');
            onCreated(created); onClose();
        } catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal title="Nouvelle réception" subtitle="Enregistrer la remise d’un bien ou d’un lot, avant tout examen" onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <Notice>Recevoir un bien ne vaut ni acquisition, ni dépôt, ni prêt. L’institution décide après l’examen de la provenance et des conditions, et la décision est prise par une autre personne que celle qui enregistre la réception.</Notice>
            <div className="form-grid">
                <Field label="Type de réception *"><select value={form.modeReception} onChange={e => set('modeReception', e.target.value)} disabled={busy}>{Object.entries(ENTRY_MODE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                <Field label="Date de réception" hint="Aujourd’hui si elle n’est pas précisée"><input type="date" max={todayIso()} value={form.dateReception} onChange={e => set('dateReception', e.target.value)} disabled={busy} /></Field>
                <Field label="Déposant ou source" hint="Personne, famille ou organisme qui remet le bien"><input value={form.deposantNom} onChange={e => set('deposantNom', e.target.value)} maxLength={255} disabled={busy} /></Field>
                <Field label="Déposant du référentiel"><ArchiveRecordPicker kind="actors" institution={scope.institutionId ?? ''} value={form.deposantActeurId || null} onChange={v => set('deposantActeurId', v ?? '')} disabled={busy} /></Field>
                <Field label="Entrée archivistique associée"><IntakeLinkPicker value={form.entreeArchivistiqueId} onChange={v => set('entreeArchivistiqueId', v)} disabled={busy} /></Field>
                <Field label="Nombre de pièces"><input inputMode="numeric" value={form.nombrePieces} onChange={e => set('nombrePieces', e.target.value)} disabled={busy} /></Field>
                <Field label="Motif de la remise" wide><textarea value={form.motifReception} onChange={e => set('motifReception', e.target.value)} rows={2} maxLength={5000} disabled={busy} /></Field>
                <Field label="Description du lot" wide><textarea value={form.descriptionLot} onChange={e => set('descriptionLot', e.target.value)} rows={3} maxLength={10000} disabled={busy} /></Field>
            </div>
            {problem && <Notice tone="warning">{problem}</Notice>}
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>Enregistrer la réception</button></footer>
        </form>
    </Modal>;
}

// ---------- fiche : champs modifiables

function EntryFieldsTab({ entry, groupIds, canEdit, onSaved, intro }: { entry: HeritageEntry; groupIds: string[]; canEdit: boolean; onSaved: () => void; intro?: React.ReactNode }) {
    const { heritage } = useSession();
    const groups = ENTRY_FIELD_GROUPS.filter(g => groupIds.includes(g.id));
    const fields = groups.flatMap(g => g.fields);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const [problem, setProblem] = useState<string | null>(null);
    const start = () => { setDraft(toDraft(fields, entry.champs)); setProblem(null); setError(null); };
    const save = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!draft) return;
        const { values, problem: bad } = fromDraft(fields, draft);
        if (bad) return setProblem(bad);
        const changes = changedFields(entry.champs, values);
        if (!Object.keys(changes).length) return setProblem('Aucune modification à enregistrer.');
        setBusy(true); setError(null); setProblem(null);
        try { await heritage!.command('/entries/' + entry.id, { expectedVersion: entry.version, changes }, crypto.randomUUID(), 'PUT'); setDraft(null); onSaved(); }
        catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <div className="asset-tab">
        {intro}
        {groups.map(group => <section key={group.id} className="asset-group"><h4>{group.label}</h4>
            {draft ? <div className="form-grid">{group.fields.map(f => <FieldInput key={f.name} f={f} draft={draft} set={(n, v) => setDraft({ ...draft, [n]: v })} categories={[]} criteres={[]} disabled={busy} />)}</div>
                : <dl className="asset-fields">{group.fields.map(f => <div key={f.name} className={f.wide ? 'wide' : ''}><dt>{f.label}</dt><dd>{f.name === 'dateReception' ? isoDay(entry.champs.dateReception as string | null) : displayValue(f, entry.champs, [], [])}</dd></div>)}</dl>}
        </section>)}
        {draft ? <form onSubmit={save}>
            {problem && <Notice tone="warning">{problem}</Notice>}
            {error ? <ErrorNotice error={error} /> : null}
            <div className="table-actions"><button type="button" className="btn secondary" onClick={() => setDraft(null)} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>Enregistrer</button></div>
        </form> : canEdit ? <div className="table-actions"><button type="button" className="btn small secondary" onClick={start}>Modifier</button></div>
            : !entry.modifiable && <small className="wf-note">La décision est prise : ces champs ne se modifient plus. Le journal garde l’état de la réception.</small>}
    </div>;
}

// ---------- passages

function TransitionDialog({ entry, option, onClose, onDone }: { entry: HeritageEntry; option: EntryTransitionOption; onClose: () => void; onDone: () => void }) {
    const { heritage } = useSession();
    const needs = transitionNeeds(option);
    const [form, setForm] = useState<TransitionForm>(emptyTransitionForm);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const set = (name: keyof TransitionForm, value: string) => setForm(old => ({ ...old, [name]: value }));
    const problems = transitionProblems(option, form, entry, todayIso());
    const mode = entry.champs.modeReception as string | undefined;
    const run = async (event: React.FormEvent) => {
        event.preventDefault();
        if (problems.length) return;
        setBusy(true); setError(null);
        try { await heritage!.command('/entries/' + entry.id + '/transitions', transitionBody(option.vers, entry.version, form), crypto.randomUUID(), 'POST'); onDone(); onClose(); }
        catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal title={entryTransitionLabel(entry.statut, option.vers)} subtitle={entry.numero} onClose={onClose} locked={busy}>
        <form onSubmit={run}>
            {option.decision && <Notice>Cette décision engage l’institution et est conservée avec son auteur, sa date et son motif. Elle est prise par une autre personne que celle qui a enregistré la réception.</Notice>}
            <div className="form-grid">
                {needs.decision && <Field label="Nature de la prise en charge *" wide hint="Un prêt entrant reste un prêt ; un don ou un dépôt proposé peut être accepté comme acquisition ou comme dépôt.">
                    <select value={form.decisionType} onChange={e => set('decisionType', e.target.value)} disabled={busy} required><option value="">Choisir…</option>
                        {decisionChoices(mode).map(d => <option key={d} value={d}>{DECISION_LABELS[d]}</option>)}</select></Field>}
                {needs.motif && <Field label={needs.motifRequired ? 'Motif * (au moins 10 caractères)' : 'Motif de la décision'} wide hint="Conservé dans le journal de l’entrée">
                    <textarea value={form.motif} onChange={e => set('motif', e.target.value)} rows={3} maxLength={2000} disabled={busy} required={needs.motifRequired} /></Field>}
                {needs.convention && <>
                    <Field label="Référence de l’acte ou de la convention *" wide><input value={form.conventionReference} onChange={e => set('conventionReference', e.target.value)} maxLength={255} disabled={busy} /></Field>
                    <Field label="Début de la convention"><input type="date" value={form.conventionDateDebut} onChange={e => set('conventionDateDebut', e.target.value)} disabled={busy} /></Field>
                    <Field label={entry.decisionType === 'ACQUISITION' ? 'Fin de la convention' : 'Fin de la convention *'} hint={entry.decisionType === 'ACQUISITION' ? 'Une acquisition n’a pas d’échéance.' : 'Un dépôt ou un prêt entrant a une échéance.'}>
                        <input type="date" value={form.conventionDateFin} onChange={e => set('conventionDateFin', e.target.value)} disabled={busy} /></Field></>}
                {needs.retour && <>
                    <Field label="Date de la restitution *"><input type="date" max={todayIso()} value={form.retourLe} onChange={e => set('retourLe', e.target.value)} disabled={busy} /></Field>
                    <Field label="Repris par *"><input value={form.retourDestinataire} onChange={e => set('retourDestinataire', e.target.value)} maxLength={255} disabled={busy} /></Field>
                    <Field label="Note" wide><textarea value={form.retourNote} onChange={e => set('retourNote', e.target.value)} rows={2} maxLength={5000} disabled={busy} /></Field></>}
            </div>
            {problems.length > 0 && <ul className="wf-blockers" aria-label="À compléter">{problems.map(p => <li key={p} className="warn"><span>{p}</span></li>)}</ul>}
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy || problems.length > 0}>Confirmer</button></footer>
        </form>
    </Modal>;
}

function EntryTransitionBar({ entry, onDone }: { entry: HeritageEntry; onDone: () => void }) {
    const { heritage } = useSession();
    const [chosen, setChosen] = useState<EntryTransitionOption | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const quick = async (option: EntryTransitionOption) => {
        setBusy(true); setError(null);
        try { await heritage!.command('/entries/' + entry.id + '/transitions', transitionBody(option.vers, entry.version, emptyTransitionForm()), crypto.randomUUID(), 'POST'); onDone(); }
        catch (e) { setError(e); } finally { setBusy(false); }
    };
    if (!entry.passages.length) return null;
    return <div className="asset-transitions">
        <div className="table-actions">{entry.passages.map(option => {
            const blocked = option.bloquants.length > 0;
            const why = !option.peutAgir ? 'Habilitation requise : ' + option.permissions.join(' ou ') : blocked ? 'Conditions non remplies' : undefined;
            return <button key={option.vers} type="button" className={'btn small ' + (option.decision ? 'primary' : 'secondary')} disabled={!option.peutAgir || blocked || busy} title={why}
                onClick={() => needsForm(option) ? setChosen(option) : void quick(option)}>{entryTransitionLabel(entry.statut, option.vers)}</button>;
        })}</div>
        {entry.passages.filter(o => o.peutAgir && o.bloquants.length > 0).map(o => <ul key={o.vers} className="wf-blockers" aria-label={entryTransitionLabel(entry.statut, o.vers)}>{o.bloquants.map(b => <li key={b.code} className="bad"><span>{b.message}</span></li>)}</ul>)}
        {error && !chosen ? <ErrorNotice error={error} /> : null}
        {chosen && <TransitionDialog entry={entry} option={chosen} onClose={() => setChosen(null)} onDone={onDone} />}
    </div>;
}

// ---------- biens reçus

function AddAssetDialog({ entry, categories, onClose, onDone }: { entry: HeritageEntry; categories: HeritageReference[]; onClose: () => void; onDone: () => void }) {
    const { heritage } = useSession();
    const key = useRef(crypto.randomUUID());
    const [intitule, setIntitule] = useState('');
    const [categorie, setCategorie] = useState('');
    const [nature, setNature] = useState('PHYSIQUE');
    const [resume, setResume] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true); setError(null);
        try {
            const champs: AssetFields = { intitule: intitule.trim(), categorie, natureOriginale: nature };
            if (resume.trim()) champs.resume = resume.trim();
            await heritage!.command('/entries/' + entry.id + '/assets', champs, key.current, 'POST');
            onDone(); onClose();
        } catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal title="Enregistrer un bien reçu" subtitle={entry.numero + ' · identification minimale, le reste se complète après l’examen'} onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Intitulé *" wide><input value={intitule} onChange={e => setIntitule(e.target.value)} required maxLength={500} disabled={busy} /></Field>
                <Field label="Catégorie *"><select value={categorie} onChange={e => setCategorie(e.target.value)} required disabled={busy}><option value="">Choisir…</option>{categories.filter(c => c.actif).map(c => <option key={c.code} value={c.code}>{c.libelle}</option>)}</select></Field>
                <Field label="Nature de l’original"><select value={nature} onChange={e => setNature(e.target.value)} disabled={busy}>{Object.entries(NATURE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                <Field label="Résumé" wide hint="Facultatif à ce stade"><textarea value={resume} onChange={e => setResume(e.target.value)} rows={3} disabled={busy} /></Field>
            </div>
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>Enregistrer le bien</button></footer>
        </form>
    </Modal>;
}

function AssetsTab({ entry, categories, canEdit, onChanged }: { entry: HeritageEntry; categories: HeritageReference[]; canEdit: boolean; onChanged: () => void }) {
    const { heritage, epoch } = useSession();
    const [dialog, setDialog] = useState<'add' | 'link' | null>(null);
    const [error, setError] = useState<unknown>(null);
    const linkedIds = new Set(entry.biens.map(b => b.bienId));
    const candidates = useResource<HeritageAssetPage>(s => dialog === 'link' ? heritage!.assets({ statutPriseEnCharge: 'A_EXAMINER', page: 0, size: 100 }, s) : Promise.resolve({ items: [], page: 0, size: 0, total: 0, hasMore: false }), 'entry-candidates:' + dialog + ':' + epoch);
    const detach = async (bienId: string) => { setError(null); try { await heritage!.command('/entries/' + entry.id + '/assets/' + bienId + '/unlink', {}, crypto.randomUUID(), 'POST'); onChanged(); } catch (e) { setError(e); } };
    return <div className="asset-tab">
        {error ? <ErrorNotice error={error} /> : null}
        <section className="asset-group"><div className="section-heading"><h4>Biens reçus</h4>{canEdit && <span className="table-actions">
            <button type="button" className="btn small secondary" onClick={() => setDialog('link')}>Rattacher un bien déjà enregistré</button>
            <button type="button" className="btn small secondary" onClick={() => setDialog('add')}>Enregistrer un bien reçu</button></span>}</div>
            {entry.biens.length ? <ul className="asset-links">{entry.biens.map(b => <li key={b.bienId}><span><strong>{b.identifiant}</strong> — {b.intitule}<small> · {label(PRISE_EN_CHARGE_LABELS, b.statutPriseEnCharge)}</small></span>
                {canEdit && <button type="button" className="btn small secondary" onClick={() => void detach(b.bienId)} title="Le bien reste enregistré mais n’appartient plus à cette entrée">Détacher</button>}</li>)}</ul>
                : <Empty title="Aucun bien enregistré" description="Chaque pièce reçue devient un bien à examiner. Le constat d’état et au moins un bien sont requis avant l’examen." />}
            <small className="wf-note">La prise en charge de chaque bien suit l’entrée : elle reflète la décision, jamais l’inverse.</small></section>
        {dialog === 'add' && <AddAssetDialog entry={entry} categories={categories} onClose={() => setDialog(null)} onDone={onChanged} />}
        {dialog === 'link' && <PickerDialog title="Rattacher un bien déjà enregistré" loading={candidates.loading} items={(candidates.data?.items ?? []).filter(a => !linkedIds.has(a.id)).map(a => ({ id: a.id, label: a.identifiant + ' — ' + a.intitule, detail: a.numeroInventaire ?? undefined }))}
            onPick={async id => { await heritage!.command('/entries/' + entry.id + '/assets/' + id, {}, crypto.randomUUID(), 'POST'); onChanged(); }} onClose={() => setDialog(null)} />}
    </div>;
}

// ---------- justificatifs

function ResourcesTab({ entry, canEdit, onChanged }: { entry: HeritageEntry; canEdit: boolean; onChanged: () => void }) {
    const { heritage, records, epoch } = useSession();
    const [picking, setPicking] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const docsQ = useResource<Page<RecordDocument>>(s => picking ? records!.documents({ institutionId: entry.institutionId, page: 0, size: 100 }, s) : Promise.resolve({ items: [], page: 0, size: 0, hasMore: false }), 'entry-docs:' + picking + ':' + epoch);
    const remove = async (documentId: string) => { setError(null); try { await heritage!.command('/entries/' + entry.id + '/resources/' + documentId + '/unlink', {}, crypto.randomUUID(), 'POST'); onChanged(); } catch (e) { setError(e); } };
    return <div className="asset-tab">
        {error ? <ErrorNotice error={error} /> : null}
        <section className="asset-group"><div className="section-heading"><h4>Justificatifs et pièces</h4>{canEdit && <button type="button" className="btn small secondary" onClick={() => setPicking(true)}>Relier un document</button>}</div>
            {entry.ressources.length ? <ul className="asset-links">{entry.ressources.map(r => <li key={r.documentId}><span><strong>{r.titre}</strong> <Badge value={r.role} label={label(ENTRY_ROLE_LABELS, r.role)} />{r.identifiantMetier && <small> · {r.identifiantMetier}</small>}{r.libelle && <small> · {r.libelle}</small>}{r.confidentiel && <small> · confidentiel</small>}</span>
                {canEdit && <button type="button" className="btn small secondary" onClick={() => void remove(r.documentId)}>Retirer</button>}</li>)}</ul>
                : <Empty title="Aucun justificatif" description="Titre de propriété, attestation du déposant, photographies du constat, convention : chaque document est conservé une fois et référencé ici." />}</section>
        {picking && <PickerDialog title="Relier un document" loading={docsQ.loading} items={(docsQ.data?.items ?? []).map(d => ({ id: d.id, label: d.title, detail: d.reference }))} roles={ENTRY_ROLE_LABELS} roleLabel="Rôle du document"
            onPick={async (id, role) => { await heritage!.command('/entries/' + entry.id + '/resources', { documentId: id, role }, crypto.randomUUID(), 'POST'); onChanged(); }} onClose={() => setPicking(false)} />}
    </div>;
}

// ---------- décision

function DecisionTab({ entry }: { entry: HeritageEntry }) {
    const rows: Array<[string, string | null]> = [
        ['Nature de la prise en charge', entry.decisionType ? DECISION_LABELS[entry.decisionType] : null],
        ['Décision prise le', entry.decisionLe ? formatDate(entry.decisionLe) : null],
        ['Motif', entry.decisionMotif],
        ['Acte ou convention', entry.conventionReference],
        ['Début de la convention', entry.conventionDateDebut ? isoDay(entry.conventionDateDebut) : null],
        ['Fin de la convention', entry.conventionDateFin ? isoDay(entry.conventionDateFin) : null],
        ['Restitution le', entry.retourLe ? isoDay(entry.retourLe) : null],
        ['Repris par', entry.retourDestinataire],
        ['Note de restitution', entry.retourNote]
    ];
    const known = rows.filter(([, value]) => value);
    return <div className="asset-tab">
        <Notice>La décision est prise par une autre personne que celle qui a enregistré la réception. Elle n’est jamais déduite : l’acquisition, le dépôt et le prêt entrant sont trois décisions distinctes.</Notice>
        {known.length ? <dl className="asset-fields">{known.map(([name, value]) => <div key={name} className={name === 'Motif' || name === 'Note de restitution' ? 'wide' : ''}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>
            : <Empty title="Aucune décision" description="L’entrée est en cours d’examen : la décision viendra après l’examen de la provenance et des conditions." />}
    </div>;
}

// ---------- journal

function EntryJournalTab({ entryId, stamp }: { entryId: string; stamp: string }) {
    const { heritage, epoch } = useSession();
    const q = useResource<EntryJournalEntry[]>(s => heritage!.entryJournal(entryId, s), 'entry-journal:' + entryId + ':' + stamp + ':' + epoch);
    if (q.loading) return <Busy />;
    if (q.error) return <ErrorNotice error={q.error} onRetry={q.refresh} />;
    const list = [...(q.data ?? [])].reverse();
    return <ol className="wf-history asset-journal">{list.map(entry => <li key={entry.id}>
        <time dateTime={entry.createdAt}>{formatDate(entry.createdAt)}</time>
        <span><Badge value={entry.genre} label={label(ENTRY_JOURNAL_LABELS, entry.genre)} />{entry.automatique && <small className="wf-auto"> automatique</small>}{entry.champ && entry.genre !== 'TRANSITION' && <strong> {label(ENTRY_FIELD_LABELS, entry.champ)}</strong>}</span>
        {entry.genre === 'TRANSITION' ? <p>{entryJournalValue(entry.champ, entry.ancienneValeur)} → {entryJournalValue(entry.champ, entry.nouvelleValeur)}</p>
            : entry.genre === 'MODIFICATION' && Array.isArray(entry.nouvelleValeur) ? <p>{entry.nouvelleValeur.map(n => label(ENTRY_FIELD_LABELS, String(n))).join(', ')}</p>
            : entry.genre === 'LIEN' ? <p>{entry.nouvelleValeur ? 'Ajouté' : 'Retiré'}</p> : null}
        {entry.motif && <p>Motif : {entry.motif}</p>}
    </li>)}</ol>;
}

// ---------- reçu

function ReceiptDialog({ id, onClose }: { id: string; onClose: () => void }) {
    const { heritage, epoch } = useSession();
    const q = useResource<EntryReceipt>(s => heritage!.entryReceipt(id, s), 'entry-receipt:' + id + ':' + epoch);
    return <Modal title="Reçu de réception" subtitle={q.data?.numero} onClose={onClose}>
        {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : q.data ? <article className="entry-receipt" aria-label={'Reçu ' + q.data.numero}>
            <h3>{q.data.institution}</h3>
            <dl className="asset-fields">
                <div><dt>Date de réception</dt><dd>{isoDay(q.data.dateReception)}</dd></div>
                <div><dt>Type de réception</dt><dd>{label(ENTRY_MODE_LABELS, q.data.modeReception)}</dd></div>
                {q.data.deposant && <div><dt>Remis par</dt><dd>{q.data.deposant}</dd></div>}
                {q.data.nombrePieces !== null && <div><dt>Nombre de pièces</dt><dd>{q.data.nombrePieces}</dd></div>}
                {q.data.motifReception && <div className="wide"><dt>Motif</dt><dd>{q.data.motifReception}</dd></div>}
            </dl>
            <h4>Biens reçus</h4>
            {q.data.biens.length ? <ul className="asset-links">{q.data.biens.map(b => <li key={b.bienId}><span><strong>{b.identifiant}</strong> — {b.intitule}</span></li>)}</ul> : <small className="wf-note">Aucun bien encore enregistré.</small>}
            <p className="entry-mention-text" role="note">{q.data.mention.texte}</p>
        </article> : null}
        <footer className="modal-footer">
            {q.data && <><button type="button" className="btn secondary" onClick={() => void navigator.clipboard?.writeText(receiptLines(q.data!).join('\n'))}><Icon name="copy" size={16} />Copier le texte</button>
                <button type="button" className="btn secondary" onClick={() => printHtml(receiptHtml(q.data!))}><Icon name="download" size={16} />Imprimer</button></>}
            <button type="button" className="btn primary" onClick={onClose}>Fermer</button>
        </footer>
    </Modal>;
}

// ---------- fiche

type Tab = 'reception' | 'biens' | 'examen' | 'decision' | 'justificatifs' | 'journal';

function EntryDialog({ id, categories, onClose, onChanged }: { id: string; categories: HeritageReference[]; onClose: () => void; onChanged: () => void }) {
    const { me, heritage, epoch } = useSession();
    const [tab, setTab] = useState<Tab>('reception');
    const [revision, setRevision] = useState(0);
    const [receipt, setReceipt] = useState(false);
    const q = useResource<HeritageEntry>(s => heritage!.entry(id, s), 'entry:' + id + ':' + revision + ':' + epoch);
    const refresh = () => { setRevision(r => r + 1); onChanged(); };
    // Pendant un rechargement la fiche reste affichée : pas de clignotement, le brouillon en cours n'est pas perdu.
    const last = useRef<HeritageEntry | null>(null);
    if (q.data) last.current = q.data;
    const current = q.data ?? last.current;
    if (!current && q.loading) return <Modal title="Entrée patrimoniale" onClose={onClose} wide><Busy /></Modal>;
    if (!current) return <Modal title="Entrée patrimoniale" onClose={onClose} wide><ErrorNotice error={q.error} onRetry={q.refresh} /></Modal>;
    const entry = current;
    const scope = { institutionId: entry.institutionId, departmentId: entry.departementId };
    const canManage = can(me, 'HERITAGE_ENTRY_MANAGE', scope);
    const canEdit = canManage && entry.modifiable;
    const canLinkResources = (canManage || can(me, 'HERITAGE_ENTRY_DECIDE', scope)) && !TERMINAL.has(entry.statut);
    const tabs: Array<[Tab, string]> = [['reception', 'Réception'], ['biens', `Biens reçus (${entry.biens.length})`], ['examen', 'Examen et conditions'], ['decision', 'Décision'], ['justificatifs', `Justificatifs (${entry.ressources.length})`], ['journal', 'Historique']];
    return <Modal title={entry.numero} subtitle={label(ENTRY_MODE_LABELS, entry.champs.modeReception as string) + (entry.champs.deposantNom ? ' · ' + String(entry.champs.deposantNom) : '') + ' · ' + isoDay(entry.champs.dateReception as string | null)} onClose={onClose} wide>
        <div className="entry-head"><Badge value={entry.statut} label={entryLabel(entry.statut)} /><Steps status={entry.statut} /><button type="button" className="btn small secondary" onClick={() => setReceipt(true)}>Reçu de réception</button></div>
        <Mention entry={entry} />
        <EntryTransitionBar entry={entry} onDone={refresh} />
        <div role="tablist" className="asset-tabs" aria-label="Sections de l’entrée">{tabs.map(([key, text]) => <button key={key} role="tab" type="button" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{text}</button>)}</div>
        {tab === 'reception' && <EntryFieldsTab entry={entry} groupIds={['reception', 'constat']} canEdit={canEdit} onSaved={refresh} />}
        {tab === 'biens' && <AssetsTab entry={entry} categories={categories} canEdit={canEdit} onChanged={refresh} />}
        {tab === 'examen' && <EntryFieldsTab entry={entry} groupIds={['examen']} canEdit={canEdit} onSaved={refresh} intro={<Notice>L’examen établit la provenance, la situation juridique et les conditions de la prise en charge. Il précède toujours la décision.</Notice>} />}
        {tab === 'decision' && <DecisionTab entry={entry} />}
        {tab === 'justificatifs' && <ResourcesTab entry={entry} canEdit={canLinkResources} onChanged={refresh} />}
        {tab === 'journal' && <EntryJournalTab entryId={entry.id} stamp={String(entry.version)} />}
        {receipt && <ReceiptDialog id={entry.id} onClose={() => setReceipt(false)} />}
        <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose}>Fermer</button></footer>
    </Modal>;
}

// ---------- reprise d'inventaire

function CreateRepriseDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (lot: HeritageReprise) => void }) {
    const { heritage } = useSession();
    const { scope } = useWorkspace();
    const key = useRef(crypto.randomUUID());
    const [libelle, setLibelle] = useState('');
    const [source, setSource] = useState('');
    const [dateReference, setDateReference] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const [problem, setProblem] = useState<string | null>(null);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!scope.institutionId) return setProblem('Choisissez une institution dans le périmètre de travail.');
        setBusy(true); setError(null); setProblem(null);
        try {
            const lot = await heritage!.command<HeritageReprise>('/reprises', { institutionId: scope.institutionId, departementId: scope.departmentId ?? null, libelle: libelle.trim(), source: source.trim() || undefined, dateReference: dateReference || undefined }, key.current, 'POST');
            onCreated(lot); onClose();
        } catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal title="Nouveau lot de reprise d’inventaire" subtitle="Un lot regroupe les biens d’un même registre d’inventaire" onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Libellé du lot *" wide hint="Nom du registre : il qualifie les anciennes références conservées (ex. « Registre d’inventaire de 1978 »)."><input value={libelle} onChange={e => setLibelle(e.target.value)} required maxLength={255} disabled={busy} /></Field>
                <Field label="Source" wide hint="Où se trouve le registre, qui l’a tenu, dans quel état"><textarea value={source} onChange={e => setSource(e.target.value)} rows={2} maxLength={5000} disabled={busy} /></Field>
                <Field label="Date de référence" hint="Date de l’inventaire d’origine"><input type="date" max={todayIso()} value={dateReference} onChange={e => setDateReference(e.target.value)} disabled={busy} /></Field>
            </div>
            {problem && <Notice tone="warning">{problem}</Notice>}
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy || !libelle.trim()}>Créer le lot</button></footer>
        </form>
    </Modal>;
}

type ImportStage = 'choose' | 'preview' | 'running' | 'done';
interface Outcome { state: 'ok' | 'error'; message?: string; identifiant?: string; uncertain?: boolean }
/** Arrêt après autant d'échecs serveur ou réseau consécutifs : inutile d'insister si le service est indisponible. */
const MAX_CONSECUTIVE_FAILURES = 5;

export function RepriseImportDialog({ lot, categories, onClose, onDone }: { lot: HeritageReprise; categories: HeritageReference[]; onClose: () => void; onDone: () => void }) {
    const { heritage } = useSession();
    const [stage, setStage] = useState<ImportStage>('choose');
    const [fileName, setFileName] = useState('');
    const [rows, setRows] = useState<RepriseRow[]>([]);
    const [problem, setProblem] = useState<string | null>(null);
    const [outcomes, setOutcomes] = useState<Record<number, Outcome>>({});
    const [haltReason, setHaltReason] = useState<string | null>(null);
    const [dragging, setDragging] = useState(false);
    const cancelled = useRef(false);
    const keys = useRef(new Map<number, string>());
    const valid = rows.filter(r => r.champs);
    const invalid = rows.filter(r => !r.champs);
    const created = valid.filter(r => outcomes[r.line]?.state === 'ok').length;
    const failed = valid.filter(r => outcomes[r.line]?.state === 'error');
    const untouched = valid.filter(r => !outcomes[r.line]);
    const warned = rows.filter(r => r.champs && r.warnings.length).length;

    const load = async (file: File | undefined) => {
        if (!file) return;
        setProblem(null);
        try {
            const parsed = parseRepriseTable(await readSpreadsheet(file), categories, lot.libelle);
            if (parsed.fatal) { setProblem(parsed.fatal); return; }
            keys.current = new Map(); setOutcomes({}); setHaltReason(null);
            setFileName(file.name); setRows(parsed.rows); setStage('preview');
        } catch (error) { setProblem(error instanceof Error ? error.message : 'Lecture du fichier impossible.'); }
    };

    const run = async (targets: RepriseRow[]) => {
        if (!heritage) return;
        cancelled.current = false; setHaltReason(null); setStage('running');
        let consecutive = 0;
        for (const row of targets) {
            if (cancelled.current) { setHaltReason('Import interrompu : les lignes restantes n’ont pas été traitées.'); break; }
            if (!row.champs) continue;
            // Une clé d'idempotence par ligne : rejouer une ligne dont le résultat est incertain ne peut pas créer de doublon.
            const key = keys.current.get(row.line) ?? crypto.randomUUID();
            keys.current.set(row.line, key);
            try {
                const asset = await heritage.command<{ identifiant: string }>('/assets', { institutionId: lot.institutionId, departementId: lot.departementId, origine: 'REPRISE_INVENTAIRE', champs: row.champs, repriseId: lot.id }, key, 'POST');
                setOutcomes(old => ({ ...old, [row.line]: { state: 'ok', identifiant: asset?.identifiant } }));
                consecutive = 0;
            } catch (error) {
                const e = error instanceof ApiError ? error : null;
                setOutcomes(old => ({ ...old, [row.line]: { state: 'error', message: e?.message ?? 'Erreur inattendue.', uncertain: e?.uncertain } }));
                if (e && (e.status === 401 || e.status === 403)) { setHaltReason(e.status === 401 ? 'Session expirée : reconnectez-vous puis réessayez les lignes restantes.' : 'Droits insuffisants pour inventorier des biens : import arrêté.'); break; }
                if (e && e.code === 'HERITAGE_REPRISE_CLOSED') { setHaltReason('Ce lot est clôturé : plus aucun bien ne peut y être ajouté.'); break; }
                consecutive = !e || e.status >= 500 || e.status === 0 ? consecutive + 1 : 0;
                if (consecutive >= MAX_CONSECUTIVE_FAILURES) { setHaltReason('Le serveur ne répond pas correctement : import arrêté. Réessayez plus tard.'); break; }
            }
        }
        setStage('done');
        onDone();
    };

    const report = () => {
        const table = [['Ligne', 'Numéro d’inventaire', 'Intitulé', 'Catégorie', 'Résultat', 'Identifiant', 'Détail'], ...rows.map(r => {
            const o = outcomes[r.line];
            const result = !r.champs ? 'Ignorée (invalide)' : o?.state === 'ok' ? 'Reprise' : o?.state === 'error' ? 'Échec' : 'Non traitée';
            return [String(r.line), r.numero, r.intitule, r.categorie, result, o?.identifiant ?? '', !r.champs ? r.errors.join(' ') : o?.message ?? r.warnings.join(' ')];
        })];
        downloadBytes(buildXlsx([{ name: 'Rapport', rows: table, widths: [8, 22, 50, 24, 20, 16, 80] }]), 'rapport-reprise-inventaire.xlsx');
    };

    const close = () => { if (stage !== 'running') onClose(); };
    return <Modal title="Reprendre un registre d’inventaire" subtitle={stage === 'choose' ? lot.libelle : lot.libelle + ' · ' + fileName} onClose={close} locked={stage === 'running'} wide>
        <div className="imp">
            {stage === 'choose' && <>
                <ol className="imp-steps">
                    <li><strong>Téléchargez le modèle</strong> et recopiez le registre, une ligne par bien. Ce qui n’est pas connu reste vide : rien n’est deviné.<button type="button" className="btn secondary small" onClick={() => downloadBytes(repriseTemplate(categories), 'modele-reprise-inventaire.xlsx')}><Icon name="download" size={16} />Télécharger le modèle Excel</button></li>
                    <li><strong>Importez le fichier</strong> (.xlsx ou .csv, {MAX_REPRISE_ROWS} lignes et 2 Mo maximum). Vous pourrez tout vérifier avant la création.</li>
                </ol>
                <label className={'imp-drop' + (dragging ? ' over' : '')} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); void load(e.dataTransfer.files[0]); }}>
                    <Icon name="upload" size={30} /><span><strong>Choisir un fichier</strong> ou le déposer ici</span><small>Colonnes : Numéro d’inventaire, Intitulé, Catégorie, Date, Résumé, Support, Dimensions, Cote, Provenance connue</small>
                    <input type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e => { void load(e.target.files?.[0]); e.target.value = ''; }} />
                </label>
                {problem && <div className="notice error" role="alert"><Icon name="alert" /><div><strong>Fichier non utilisable</strong><p>{problem}</p></div></div>}
            </>}
            {(stage === 'preview' || stage === 'running' || stage === 'done') && <>
                <div className="imp-summary" role="status" aria-live="polite">
                    <span className="imp-count ok"><b>{valid.length}</b> prête{valid.length > 1 ? 's' : ''}</span>
                    {invalid.length > 0 && <span className="imp-count warn"><b>{invalid.length}</b> ignorée{invalid.length > 1 ? 's' : ''} (erreurs)</span>}
                    {warned > 0 && <span className="imp-count warn"><b>{warned}</b> à qualifier</span>}
                    {stage !== 'preview' && <><span className="imp-count ok"><b>{created}</b> reprise{created > 1 ? 's' : ''}</span>{failed.length > 0 && <span className="imp-count bad"><b>{failed.length}</b> en échec</span>}{untouched.length > 0 && stage === 'done' && <span className="imp-count warn"><b>{untouched.length}</b> non traitée{untouched.length > 1 ? 's' : ''}</span>}</>}
                </div>
                {stage === 'running' && <div className="imp-progress" role="progressbar" aria-valuemin={0} aria-valuemax={valid.length} aria-valuenow={created + failed.length}><span style={{ width: valid.length ? ((created + failed.length) * 100 / valid.length) + '%' : '0%' }} /></div>}
                {haltReason && <Notice tone="warning">{haltReason}</Notice>}
                {stage === 'preview' && invalid.length > 0 && <Notice tone="warning">Les lignes en erreur seront ignorées. Corrigez-les dans le fichier et réimportez-le pour les ajouter.</Notice>}
                {stage === 'preview' && warned > 0 && <Notice>Les lignes « à qualifier » seront reprises avec ce que le registre dit, sans précision inventée : le manque restera signalé sur chaque bien.</Notice>}
                <div className="table-scroll imp-table"><table>
                    <thead><tr><th scope="col">Ligne</th><th scope="col">N° d’inventaire</th><th scope="col">Intitulé</th><th scope="col">Catégorie</th><th scope="col">{stage === 'preview' ? 'Contrôle' : 'Résultat'}</th></tr></thead>
                    <tbody>{rows.map(r => {
                        const o = outcomes[r.line];
                        return <tr key={r.line} className={!r.champs || o?.state === 'error' ? 'imp-bad' : ''}>
                            <td>{r.line}</td><td><code>{r.numero || '—'}</code></td><td>{r.intitule}</td><td>{display(r.categorie)}</td>
                            <td>{!r.champs ? <span className="imp-tag bad"><Icon name="alert" size={13} />{r.errors.join(' ')}</span>
                                : o?.state === 'ok' ? <span className="imp-tag ok"><Icon name="check" size={13} />Reprise{o.identifiant ? ' (' + o.identifiant + ')' : ''}</span>
                                : o?.state === 'error' ? <span className="imp-tag bad"><Icon name="alert" size={13} />{o.message}{o.uncertain ? ' (résultat incertain : réessayez, aucun doublon ne sera créé)' : ''}</span>
                                : stage === 'preview' ? <span className={'imp-tag ' + (r.warnings.length ? 'idle' : 'ok')}><Icon name={r.warnings.length ? 'info' : 'check'} size={13} />{r.warnings.length ? r.warnings.join(' ') : 'Valide'}</span>
                                : <span className="imp-tag idle">{stage === 'running' ? 'En attente…' : 'Non traitée'}</span>}</td></tr>;
                    })}</tbody>
                </table></div>
            </>}
        </div>
        <footer className="modal-footer">
            {stage === 'choose' && <button type="button" className="btn secondary" onClick={onClose}>Annuler</button>}
            {stage === 'preview' && <><button type="button" className="btn secondary" onClick={() => { setStage('choose'); setRows([]); }}>Choisir un autre fichier</button>
                <button type="button" className="btn primary" disabled={!valid.length} onClick={() => void run(valid)}><Icon name="check" size={17} />Reprendre {valid.length} bien{valid.length > 1 ? 's' : ''}</button></>}
            {stage === 'running' && <button type="button" className="btn secondary" onClick={() => { cancelled.current = true; }}>Interrompre</button>}
            {stage === 'done' && <><button type="button" className="btn secondary" onClick={report}><Icon name="download" size={16} />Télécharger le rapport</button>
                {failed.length + untouched.length > 0 && !haltReason?.includes('clôturé') && <button type="button" className="btn secondary" onClick={() => void run([...failed, ...untouched])}><Icon name="refresh" size={16} />Réessayer {failed.length + untouched.length} ligne{failed.length + untouched.length > 1 ? 's' : ''}</button>}
                <button type="button" className="btn primary" onClick={onClose}>Terminer</button></>}
        </footer>
    </Modal>;
}

function CloseRepriseDialog({ lot, onClose, onDone }: { lot: HeritageReprise; onClose: () => void; onDone: () => void }) {
    const { heritage } = useSession();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const run = async () => {
        setBusy(true); setError(null);
        try { await heritage!.command('/reprises/' + lot.id + '/close', { expectedVersion: lot.version }, crypto.randomUUID(), 'POST'); onDone(); onClose(); }
        catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal title="Clôturer le lot" subtitle={lot.libelle} onClose={onClose} locked={busy}>
        <Notice tone="warning">Après la clôture, plus aucun bien ne peut être ajouté à ce lot. Les {lot.biens} bien{lot.biens > 1 ? 's' : ''} déjà repris restent ouverts à la description et à l’examen.</Notice>
        {error ? <ErrorNotice error={error} /> : null}
        <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="button" className="btn primary" onClick={() => void run()} disabled={busy}>Clôturer le lot</button></footer>
    </Modal>;
}

function ReprisePanel({ categories, canManage }: { categories: HeritageReference[]; canManage: boolean }) {
    const { heritage, epoch } = useSession();
    const [revision, setRevision] = useState(0);
    const [creating, setCreating] = useState(false);
    const [importing, setImporting] = useState<HeritageReprise | null>(null);
    const [closing, setClosing] = useState<HeritageReprise | null>(null);
    const q = useResource<HeritageReprise[]>(s => heritage!.reprises(s), 'heritage-reprises:' + revision + ':' + epoch);
    const refresh = () => setRevision(r => r + 1);
    const lots = q.data ?? [];
    return <div className="panel">
        <div className="section-heading"><h3>Reprises d’inventaire</h3>{canManage && <button type="button" className="btn small secondary" onClick={() => setCreating(true)}>Nouveau lot</button>}</div>
        <p className="wf-note">Une collection déjà présente depuis longtemps n’entre pas par une réception : elle se reprend depuis son registre d’inventaire. Les anciennes références sont conservées, et ce qui manque est compté plutôt qu’inventé.</p>
        {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : lots.length ? <div className="table-scroll"><table><thead><tr><th>Lot</th><th>Statut</th><th>Biens</th><th>Sans date</th><th>Sans résumé</th><th>Provenance à établir</th><th>Valeur non évaluée</th><th>Sans original localisé</th><th /></tr></thead>
            <tbody>{lots.map(lot => <tr key={lot.id}>
                <td>{lot.libelle}<ResourceDetailsButton resource="heritageReprise" id={lot.id} title={lot.libelle} />{lot.dateReference && <small className="cell-sub">Registre de {isoDay(lot.dateReference)}</small>}</td>
                <td><Badge value={lot.statut} /></td><td>{lot.biens}</td><td>{lot.sansDate || '—'}</td><td>{lot.sansResume || '—'}</td><td>{lot.provenanceAEtablir || '—'}</td><td>{lot.valeurNonEvaluee || '—'}</td><td>{lot.sansOriginal || '—'}</td>
                <td>{canManage && lot.statut === 'OUVERTE' && <span className="table-actions"><button type="button" className="btn small secondary" onClick={() => setImporting(lot)}>Importer un registre</button><button type="button" className="btn small secondary" onClick={() => setClosing(lot)}>Clôturer</button></span>}</td></tr>)}</tbody></table></div>
            : <Empty title="Aucun lot de reprise" description={canManage ? 'Créez un lot pour reprendre un registre d’inventaire existant.' : 'Aucun lot dans votre périmètre.'} />}
        {creating && <CreateRepriseDialog onClose={() => setCreating(false)} onCreated={lot => { refresh(); setImporting(lot); }} />}
        {importing && <RepriseImportDialog lot={importing} categories={categories} onClose={() => setImporting(null)} onDone={refresh} />}
        {closing && <CloseRepriseDialog lot={closing} onClose={() => setClosing(null)} onDone={refresh} />}
    </div>;
}

// ---------- liste

export function HeritageEntriesPanel() {
    const { me, heritage, epoch } = useSession();
    const { scope } = useWorkspace();
    const [form, setForm] = useState({ q: '', statut: '', mode: '' });
    const [applied, setApplied] = useState(form);
    const [page, setPage] = useState(0);
    const [revision, setRevision] = useState(0);
    const [creating, setCreating] = useState(false);
    const [opened, setOpened] = useState<string | null>(null);
    const listQ = useResource<EntryPage>(s => heritage!.entries({ ...applied, page, size: 20 }, s), JSON.stringify(['heritage-entries', applied, page, revision, epoch]));
    const dashQ = useResource<EntryDashboard>(s => heritage!.entriesSummary(s), 'heritage-entries-summary:' + revision + ':' + epoch);
    const catQ = useResource<HeritageReference[]>(s => heritage!.references('CATEGORIE', s), 'heritage-categories:' + epoch);
    const categories = catQ.data ?? [];
    const canManage = can(me, 'HERITAGE_ENTRY_MANAGE', scope);
    const refresh = () => setRevision(r => r + 1);
    const apply = (next: typeof form) => { setForm(next); setApplied(next); setPage(0); };
    const d = dashQ.data;
    const items = listQ.data?.items ?? [];
    return <>
        <div className="panel">
            <div className="section-heading"><h3>Entrées et provenance</h3>{canManage && <button className="btn small secondary" onClick={() => setCreating(true)}>Nouvelle réception</button>}</div>
            <p className="wf-note">Recevoir un bien ne vaut ni acquisition, ni dépôt, ni prêt : chaque entrée suit un examen, puis une décision prise par une autre personne que celle qui a enregistré la réception.</p>
            {d && <ul className="scan-chips asset-dashboard" aria-label="Vue d’ensemble des entrées">
                <li>{d.total} entrée{d.total > 1 ? 's' : ''}</li>
                {STATUS_CHIPS.map(s => (d.parStatut[s] ?? 0) > 0 || applied.statut === s ? <li key={s} className={s === 'COMPLEMENT_REQUIS' || s === 'SITUATION_A_CLARIFIER' ? 'warn' : ''}><button type="button" className="chip-link" onClick={() => apply({ ...form, statut: applied.statut === s ? '' : s })}>{d.parStatut[s] ?? 0} {ENTRY_STATUS_LABELS[s].toLowerCase()}</button></li> : null)}
                {d.sansDecisionDepuisJours > 0 && <li className="warn">{d.sansDecisionDepuisJours} en attente depuis plus de 30 jours</li>}
            </ul>}
            <form className="asset-filters" onSubmit={e => { e.preventDefault(); apply(form); }} role="search" aria-label="Rechercher une entrée">
                <Field label="Recherche"><input value={form.q} onChange={e => setForm({ ...form, q: e.target.value })} placeholder="Numéro, déposant, motif" /></Field>
                <Field label="Étape"><select value={form.statut} onChange={e => apply({ ...form, statut: e.target.value })}><option value="">Toutes</option>{Object.entries(ENTRY_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                <Field label="Type de réception"><select value={form.mode} onChange={e => apply({ ...form, mode: e.target.value })}><option value="">Tous</option>{Object.entries(ENTRY_MODE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                <button type="submit" className="btn small secondary">Rechercher</button>
            </form>
            {listQ.loading ? <Busy /> : listQ.error ? <ErrorNotice error={listQ.error} onRetry={listQ.refresh} /> : items.length ? <>
                <div className="table-scroll"><table><thead><tr><th>Numéro</th><th>Type</th><th>Déposant ou source</th><th>Reçue le</th><th>Biens</th><th>Étape</th><th>Décision</th><th>Modifiée</th></tr></thead>
                    <tbody>{items.map((e: EntrySummary) => <tr key={e.id}>
                        <td><button type="button" className="text-link" onClick={() => setOpened(e.id)}>{e.numero}</button></td>
                        <td>{label(ENTRY_MODE_LABELS, e.modeReception)}</td><td>{e.deposant ?? '—'}</td><td>{isoDay(e.dateReception)}</td><td>{e.nombreBiens}</td>
                        <td><Badge value={e.statut} label={entryLabel(e.statut)} /></td><td>{e.decisionType ? DECISION_LABELS[e.decisionType] : '—'}</td><td>{formatDate(e.updatedAt)}</td></tr>)}</tbody></table></div>
                <Pagination page={page} hasMore={listQ.data?.hasMore ?? false} onChange={setPage} count={items.length} />
            </> : <Empty title="Aucune entrée" description={Object.values(applied).some(Boolean) ? 'Aucune entrée ne correspond à ces critères.' : canManage ? 'Enregistrez la première réception : une remise de bien commence toujours ici.' : 'Aucune entrée dans votre périmètre.'} />}
        </div>
        <ReprisePanel categories={categories} canManage={canManage} />
        {creating && <ReceptionDialog onClose={() => setCreating(false)} onCreated={entry => { refresh(); setOpened(entry.id); }} />}
        {opened && <EntryDialog id={opened} categories={categories} onClose={() => setOpened(null)} onChanged={refresh} />}
    </>;
}
