import { ArchiveRecordPicker } from './ArchiveRecordPicker';
import { IntakeLinkPicker } from './IntakeLinkPicker';
import { uuid } from '../core/validation';
import React, { useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { useWorkspace } from './workspace';
import { can } from '../core/policy';
import { Badge, Busy, Empty, ErrorNotice, Field, Modal, Notice, Pagination, formatDate, useResource } from './components';
import { PlacementTab } from './HeritagePlacement';
import { ConservationTab } from './HeritageConservation';
import { MovementsTab } from './HeritageMovements';
import { DigitizationTab } from './HeritageDigitization';
import { DossiersTab } from './HeritageDossiers';
import { DeaccessionTab } from './HeritageDeaccessions';
import { ArkPanel } from './Dissemination';
import { KeywordsPanel } from './Vocabularies';
import {
    DESCRIPTION_LABELS, DIFFUSION_LABELS, DISPONIBILITE_LABELS, ETAT_LABELS, FIELD_GROUPS, FIELD_LABELS, JOURNAL_LABELS, NATURE_LABELS, NUMERISATION_LABELS, ORIGINE_LABELS,
    PRISE_EN_CHARGE_LABELS, ROLE_RESSOURCE_LABELS, changedFields, dateText, gapSummary, journalValue, label, listText, motifValide, needsCorrectionMotif, parseList, parseRefs, parseTitles, refsText, titlesText, transitionLabel
} from '../core/heritageAssets';
import type { FieldDef, FieldGroup } from '../core/heritageAssets';
import type { AssetFields, AssetGap, HeritageAsset, HeritageAssetPage, HeritageAssetSummary, HeritageDashboard, HeritageJournalEntry, HeritageReference, Place, HistoricalEvent, Subject, PhysicalArchive, Page, RecordDocument } from '../core/types';
import { display } from '../core/format';
import { UUID_RE } from '../core/validation';

const DESCRIPTION_STATUSES = ['MINIMALE', 'EN_REDACTION', 'A_RELIRE', 'VALIDEE'] as const;

const tone = (status: string): string => status === 'VALIDEE' ? 'ok' : status === 'A_RELIRE' ? 'warn' : '';

/** Les états indépendants d'un bien : jamais une succession unique. Les trois derniers sont calculés à la lecture à partir des objets réels. */
function StatesStrip({ asset }: { asset: HeritageAsset }) {
    const items: Array<[string, string, string?, string?]> = [
        ['Prise en charge', label(PRISE_EN_CHARGE_LABELS, asset.statutPriseEnCharge)],
        ['Description', label(DESCRIPTION_LABELS, asset.statutDescription), tone(asset.statutDescription)],
        ['État matériel', label(ETAT_LABELS, asset.etatMateriel), asset.etatMateriel === 'INTERVENTION_REQUISE' ? 'bad' : asset.etatMateriel === 'FRAGILE' ? 'warn' : ''],
        ['Disponibilité', label(DISPONIBILITE_LABELS, asset.disponibilite), asset.disponibilite === 'INTROUVABLE' ? 'bad' : asset.disponibilite === 'NON_LOCALISE' || asset.disponibilite === 'EN_RESTAURATION' ? 'warn' : '', 'calculée'],
        ['Numérisation', label(NUMERISATION_LABELS, asset.numerisation), '', 'calculée'],
        ['Diffusion', label(DIFFUSION_LABELS, asset.diffusion), '', 'calculée']
    ] as Array<[string, string, string?, string?]>;
    return <dl className="asset-states" aria-label="États du bien">{items.map(([name, value, kind, calc]) => <div key={name} className={kind ?? ''}><dt>{name}{calc && <small title="Calculée à la lecture à partir des objets réels : rien n’est stocké"> {calc}</small>}</dt><dd>{value}</dd></div>)}</dl>;
}

function GapList({ gaps }: { gaps: AssetGap[] }) {
    if (!gaps.length) return <Notice>La description n’a aucun manque connu.</Notice>;
    const blocking = gaps.filter(g => g.bloque !== null);
    const info = gaps.filter(g => g.bloque === null);
    return <div className="asset-gaps">
        {blocking.length > 0 && <><h4>À compléter</h4><ul className="wf-blockers">{blocking.map(g => <li key={g.code} className="warn"><span>{g.message}<small> {g.bloque === 'RELECTURE' ? 'Avant la relecture.' : 'Avant la validation.'}</small></span></li>)}</ul></>}
        {info.length > 0 && <><h4>À savoir</h4><ul className="asset-info">{info.map(g => <li key={g.code}>{g.message}</li>)}</ul></>}
    </div>;
}

// ---------- création

function CreateAssetDialog({ categories, onClose, onCreated }: { categories: HeritageReference[]; onClose: () => void; onCreated: (asset: HeritageAsset) => void }) {
    const { heritage } = useSession();
    const { scope } = useWorkspace();
    const key = useRef(crypto.randomUUID());
    const [intitule, setIntitule] = useState('');
    const [categorie, setCategorie] = useState('');
    const [origine, setOrigine] = useState('CREATION');
    const [nature, setNature] = useState('PHYSIQUE');
    const [numero, setNumero] = useState('');
    const [refs, setRefs] = useState('');
    const [resume, setResume] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const [problem, setProblem] = useState<string | null>(null);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setProblem(null);
        const parsed = parseRefs(refs);
        if (parsed === null) return setProblem('Chaque ancienne référence s’écrit « système : valeur », une par ligne.');
        if (origine === 'REPRISE_INVENTAIRE' && !numero.trim() && !parsed.length) return setProblem('Une reprise d’inventaire conserve les anciennes références : indiquez le numéro d’inventaire ou au moins une ancienne référence.');
        if (!scope.institutionId) return setProblem('Choisissez une institution dans le périmètre de travail.');
        setBusy(true); setError(null);
        try {
            const champs: AssetFields = { intitule: intitule.trim(), categorie, natureOriginale: nature };
            if (numero.trim()) champs.numeroInventaire = numero.trim();
            if (parsed.length) champs.anciennesReferences = parsed;
            if (resume.trim()) champs.resume = resume.trim();
            const created = await heritage!.command<HeritageAsset>('/assets', { institutionId: scope.institutionId, departementId: scope.departmentId ?? null, origine, champs }, key.current, 'POST');
            onCreated(created); onClose();
        } catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal title="Nouveau bien patrimonial" subtitle="Identification minimale : le reste se complète progressivement" onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Intitulé *" wide><input value={intitule} onChange={e => setIntitule(e.target.value)} required maxLength={500} disabled={busy} /></Field>
                <Field label="Catégorie *"><select value={categorie} onChange={e => setCategorie(e.target.value)} required disabled={busy}><option value="">Choisir…</option>
                    {categories.filter(c => c.actif).map(c => <option key={c.code} value={c.code}>{c.libelle}</option>)}</select></Field>
                <Field label="Origine de l’enregistrement" hint="Une réception est d’abord à examiner ; une reprise d’inventaire garde les anciennes références.">
                    <select value={origine} onChange={e => setOrigine(e.target.value)} disabled={busy}>{Object.entries(ORIGINE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                <Field label="Nature de l’original"><select value={nature} onChange={e => setNature(e.target.value)} disabled={busy}>{Object.entries(NATURE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                <Field label="Numéro d’inventaire"><input value={numero} onChange={e => setNumero(e.target.value)} maxLength={150} disabled={busy} /></Field>
                <Field label="Anciennes références" wide hint="Une par ligne : système : valeur"><textarea value={refs} onChange={e => setRefs(e.target.value)} rows={2} disabled={busy} /></Field>
                <Field label="Résumé" wide hint="Facultatif à ce stade"><textarea value={resume} onChange={e => setResume(e.target.value)} rows={3} disabled={busy} /></Field>
            </div>
            {problem && <Notice tone="warning">{problem}</Notice>}
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>Créer le bien</button></footer>
        </form>
    </Modal>;
}

// ---------- fiche : lecture et modification par groupes de champs

export type Draft = Record<string, string | boolean | string[]>;

export function toDraft(fields: FieldDef[], champs: AssetFields): Draft {
    const draft: Draft = {};
    for (const f of fields) {
        const value = champs[f.name];
        draft[f.name] = f.type === 'flag' ? value === true : f.type === 'criteres' ? (Array.isArray(value) ? value.map(String) : [])
            : f.type === 'list' ? listText(value) : f.type === 'refs' ? refsText(value) : f.type === 'titles' ? titlesText(value) : value === null || value === undefined ? '' : String(value);
    }
    return draft;
}

export function fromDraft(fields: FieldDef[], draft: Draft): { values: AssetFields; problem: string | null } {
    const values: AssetFields = {};
    for (const f of fields) {
        const raw = draft[f.name];
        if (f.type === 'flag') values[f.name] = raw === true;
        else if (f.type === 'criteres') values[f.name] = Array.isArray(raw) ? raw : [];
        else if (f.type === 'list') values[f.name] = parseList(String(raw ?? ''));
        else if (f.type === 'refs') { const refs = parseRefs(String(raw ?? '')); if (refs === null) return { values, problem: 'Chaque ancienne référence s’écrit « système : valeur », une par ligne.' }; values[f.name] = refs; }
        else if (f.type === 'titles') { const titles = parseTitles(String(raw ?? '')); if (titles === null) return { values, problem: 'Chaque titre alternatif s’écrit « type : titre », un par ligne.' }; values[f.name] = titles; }
        else if (f.type === 'actor' || f.type === 'intake') { const t = String(raw ?? '').trim(); try { values[f.name] = t ? uuid(t) : null; } catch { return { values, problem: f.label + ' : sélectionnez une référence valide.' }; } }
        else if (f.type === 'number') { const t = String(raw ?? '').trim().replace(',', '.'); values[f.name] = t === '' ? null : t; }
        else values[f.name] = String(raw ?? '').trim() === '' ? null : String(raw).trim();
    }
    return { values, problem: null };
}

export function displayValue(f: FieldDef, champs: AssetFields, categories: HeritageReference[], criteres: HeritageReference[]): string {
    const value = champs[f.name];
    if (f.type === 'flag') return value === true ? 'Oui' : 'Non';
    if (f.type === 'select') return typeof value === 'string' ? (f.options?.[value] ?? value) : '—';
    if (f.type === 'categorie') return typeof value === 'string' ? (categories.find(c => c.code === value)?.libelle ?? value) : '—';
    if (f.type === 'criteres') return Array.isArray(value) && value.length ? value.map(v => criteres.find(c => c.code === v)?.libelle ?? String(v)).join(', ') : '—';
    if (f.type === 'list') return Array.isArray(value) && value.length ? value.join(', ') : '—';
    if (f.type === 'refs') return Array.isArray(value) && value.length ? refsText(value) : '—';
    if (f.type === 'titles') return Array.isArray(value) && value.length ? titlesText(value) : '—';
    return value === null || value === undefined || value === '' ? '—' : String(value);
}

export function FieldInput({ f, draft, set, categories, criteres, disabled }: { f: FieldDef; draft: Draft; set: (name: string, value: string | boolean | string[]) => void; categories: HeritageReference[]; criteres: HeritageReference[]; disabled: boolean }) {
    const value = draft[f.name];
    const text = typeof value === 'string' ? value : '';
    const common = { disabled };
    if (f.type === 'actor') return <Field label={f.label}><ArchiveRecordPicker kind="actors" institution="" value={text || null} onChange={v => set(f.name, v ?? '')} disabled={disabled} /></Field>;
    if (f.type === 'intake') return <Field label={f.label}><IntakeLinkPicker value={text} onChange={v => set(f.name, v)} disabled={disabled} /></Field>;
    if (f.type === 'textarea') return <Field label={f.label} wide hint={f.hint}><textarea {...common} value={text} onChange={e => set(f.name, e.target.value)} rows={3} /></Field>;
    if (f.type === 'refs' || f.type === 'titles') return <Field label={f.label} wide hint={f.hint}><textarea {...common} value={text} onChange={e => set(f.name, e.target.value)} rows={2} /></Field>;
    if (f.type === 'select') return <Field label={f.label} hint={f.hint} wide={f.wide}><select {...common} value={text} onChange={e => set(f.name, e.target.value)}>{Object.entries(f.options ?? {}).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>;
    if (f.type === 'categorie') return <Field label={f.label}><select {...common} value={text} onChange={e => set(f.name, e.target.value)}>
        {!categories.some(c => c.code === text) && text && <option value={text}>{text}</option>}
        {categories.filter(c => c.actif || c.code === text).map(c => <option key={c.code} value={c.code}>{c.libelle}{c.actif ? '' : ' (retirée)'}</option>)}</select></Field>;
    if (f.type === 'criteres') {
        const chosen = Array.isArray(value) ? value : [];
        return <fieldset className="span2 asset-criteres" disabled={disabled}><legend>{f.label}</legend>{criteres.filter(c => c.actif || chosen.includes(c.code)).map(c =>
            <label key={c.code}><input type="checkbox" checked={chosen.includes(c.code)} onChange={e => set(f.name, e.target.checked ? [...chosen, c.code] : chosen.filter(x => x !== c.code))} />{c.libelle}</label>)}</fieldset>;
    }
    if (f.type === 'flag') return <label className="field asset-flag"><input type="checkbox" disabled={disabled} checked={value === true} onChange={e => set(f.name, e.target.checked)} /><span>{f.label}</span></label>;
    return <Field label={f.label} hint={f.hint} wide={f.wide}><input {...common} type={f.type === 'date' ? 'date' : 'text'} inputMode={f.type === 'number' ? 'decimal' : undefined} value={text} onChange={e => set(f.name, e.target.value)} /></Field>;
}

function GroupsTab({ asset, groups, canEdit, categories, criteres, onSaved, intro }: { asset: HeritageAsset; groups: FieldGroup[]; canEdit: boolean; categories: HeritageReference[]; criteres: HeritageReference[]; onSaved: () => void; intro?: React.ReactNode }) {
    const { heritage } = useSession();
    const fields = groups.flatMap(g => g.fields);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [motif, setMotif] = useState('');
    const [source, setSource] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const [problem, setProblem] = useState<string | null>(null);
    const correction = needsCorrectionMotif(asset);
    const start = () => { setDraft(toDraft(fields, asset.champs)); setMotif(''); setSource(''); setProblem(null); setError(null); };
    const save = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!draft) return;
        const { values, problem: bad } = fromDraft(fields, draft);
        if (bad) return setProblem(bad);
        const changes = changedFields(asset.champs, values);
        if (!Object.keys(changes).length) return setProblem('Aucune modification à enregistrer.');
        if (correction && !motifValide(motif)) return setProblem('Cette description est validée : une correction exige un motif écrit d’au moins 10 caractères.');
        setBusy(true); setError(null); setProblem(null);
        try {
            await heritage!.command('/assets/' + asset.id, { expectedVersion: asset.version, changes, motif: motif.trim() || undefined, source: source.trim() || undefined }, crypto.randomUUID(), 'PUT');
            setDraft(null); onSaved();
        } catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <div className="asset-tab">
        {intro}
        {groups.map(group => <section key={group.id} className="asset-group"><h4>{group.label}</h4>
            {draft ? <div className="form-grid">{group.fields.map(f => <FieldInput key={f.name} f={f} draft={draft} set={(n, v) => setDraft({ ...draft, [n]: v })} categories={categories} criteres={criteres} disabled={busy} />)}</div>
                : <dl className="asset-fields">{group.fields.map(f => <div key={f.name} className={f.wide ? 'wide' : ''}><dt>{f.label}</dt><dd>{displayValue(f, asset.champs, categories, criteres)}</dd></div>)}</dl>}
        </section>)}
        {draft ? <form onSubmit={save}>
            {correction && <div className="form-grid"><Notice tone="warning">Description validée : chaque correction conserve l’ancienne valeur, la nouvelle, son auteur, son motif et sa source.</Notice>
                <Field label="Motif de la correction * (au moins 10 caractères)" wide><textarea value={motif} onChange={e => setMotif(e.target.value)} rows={2} maxLength={2000} disabled={busy} /></Field>
                <Field label="Source" wide hint="Document, constat ou publication qui justifie la correction"><input value={source} onChange={e => setSource(e.target.value)} maxLength={2000} disabled={busy} /></Field></div>}
            {asset.statutDescription === 'A_RELIRE' && <Notice tone="warning">Cette description est en relecture : la modifier la renvoie en rédaction.</Notice>}
            {problem && <Notice tone="warning">{problem}</Notice>}
            {error ? <ErrorNotice error={error} /> : null}
            <div className="table-actions"><button type="button" className="btn secondary" onClick={() => setDraft(null)} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>{correction ? 'Enregistrer la correction' : 'Enregistrer'}</button></div>
        </form> : canEdit && <div className="table-actions"><button type="button" className="btn small secondary" onClick={start}>Modifier</button></div>}
    </div>;
}

// ---------- passages de la description

function TransitionBar({ asset, onDone }: { asset: HeritageAsset; onDone: () => void }) {
    const { heritage } = useSession();
    const [chosen, setChosen] = useState<HeritageAsset['passages'][number] | null>(null);
    const [motif, setMotif] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const run = async (vers: string, withMotif: string | null) => {
        setBusy(true); setError(null);
        try { await heritage!.command('/assets/' + asset.id + '/transitions', { vers, expectedVersion: asset.version, motif: withMotif ?? undefined }, crypto.randomUUID(), 'POST'); setChosen(null); setMotif(''); onDone(); }
        catch (e) { setError(e); } finally { setBusy(false); }
    };
    if (!asset.passages.length) return null;
    return <div className="asset-transitions">
        <div className="table-actions">{asset.passages.map(p => {
            const blocked = p.bloquants.length > 0;
            const why = !p.peutAgir ? 'Habilitation requise : ' + p.permissions.join(' ou ') : blocked ? 'Conditions non remplies' : undefined;
            return <button key={p.vers} type="button" className={'btn small ' + (p.renvoi ? 'secondary' : 'primary')} disabled={!p.peutAgir || blocked || busy} title={why}
                onClick={() => p.motifRequis ? setChosen(p) : void run(p.vers, null)}>{transitionLabel(asset.statutDescription, p.vers)}</button>;
        })}</div>
        {asset.passages.filter(p => p.peutAgir && p.bloquants.length > 0).map(p => <ul key={p.vers} className="wf-blockers">{p.bloquants.map(b => <li key={b.code} className="bad"><span>{b.message}</span></li>)}</ul>)}
        {error && !chosen ? <ErrorNotice error={error} /> : null}
        {chosen && <Modal title={transitionLabel(asset.statutDescription, chosen.vers)} onClose={() => setChosen(null)} locked={busy}>
            <form onSubmit={e => { e.preventDefault(); if (motifValide(motif)) void run(chosen.vers, motif.trim()); }}>
                <div className="form-grid"><Field label="Motif * (au moins 10 caractères)" wide hint="Conservé dans le journal du bien"><textarea value={motif} onChange={e => setMotif(e.target.value)} rows={3} maxLength={2000} disabled={busy} required /></Field></div>
                {error ? <ErrorNotice error={error} /> : null}
                <footer className="modal-footer"><button type="button" className="btn secondary" onClick={() => setChosen(null)} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy || !motifValide(motif)}>Confirmer</button></footer>
            </form></Modal>}
    </div>;
}

// ---------- ressources et liens

export interface Pick { id: string; label: string; detail?: string }

export function PickerDialog({ title, items, loading, roles, roleLabel, onPick, onClose }: { title: string; items: Pick[]; loading: boolean; roles?: Record<string, string>; roleLabel?: string; onPick: (id: string, role: string) => Promise<void>; onClose: () => void }) {
    const [filter, setFilter] = useState('');
    const [role, setRole] = useState(roles ? Object.keys(roles)[0] ?? '' : '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const shown = items.filter(i => (i.label + ' ' + (i.detail ?? '')).toLowerCase().includes(filter.toLowerCase())).slice(0, 50);
    const pick = async (id: string) => { setBusy(true); setError(null); try { await onPick(id, role); onClose(); } catch (e) { setError(e); } finally { setBusy(false); } };
    return <Modal title={title} onClose={onClose} locked={busy}>
        <div className="form-grid">
            <Field label="Rechercher" wide><input value={filter} onChange={e => setFilter(e.target.value)} disabled={busy} autoFocus /></Field>
            {roles ? <Field label={roleLabel ?? 'Rôle'}><select value={role} onChange={e => setRole(e.target.value)} disabled={busy}>{Object.entries(roles).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field> : null}
        </div>
        {loading ? <Busy /> : shown.length ? <ul className="asset-picker">{shown.map(i => <li key={i.id}><span>{i.label}{i.detail && <small> · {i.detail}</small>}</span><button type="button" className="btn small secondary" onClick={() => void pick(i.id)} disabled={busy}>Choisir</button></li>)}</ul> : <Empty title="Aucun résultat" description="Aucun élément ne correspond." />}
        {items.length > shown.length && <small>Affinez la recherche : {items.length - shown.length} autre(s) élément(s).</small>}
        {error ? <ErrorNotice error={error} /> : null}
    </Modal>;
}

function LinksTab({ asset, canEdit, onChanged }: { asset: HeritageAsset; canEdit: boolean; onChanged: () => void }) {
    const { heritage, physicalArchives, records, epoch } = useSession();
    const [dialog, setDialog] = useState<'original' | 'ressource' | 'place' | 'event' | 'subject' | null>(null);
    const [error, setError] = useState<unknown>(null);
    const archivesQ = useResource<PhysicalArchive[]>(s => dialog === 'original' ? physicalArchives!.archives(s) : Promise.resolve([]), 'asset-archives:' + dialog + ':' + epoch);
    const docsQ = useResource<Page<RecordDocument>>(s => dialog === 'ressource' ? records!.documents({ institutionId: asset.institutionId, page: 0, size: 100 }, s) : Promise.resolve({ items: [], page: 0, size: 0, hasMore: false }), 'asset-docs:' + dialog + ':' + epoch);
    const placesQ = useResource<Place[]>(s => dialog === 'place' ? heritage!.places(s) : Promise.resolve([]), 'asset-places:' + dialog + ':' + epoch);
    const eventsQ = useResource<HistoricalEvent[]>(s => dialog === 'event' ? heritage!.historicalEvents(s) : Promise.resolve([]), 'asset-events:' + dialog + ':' + epoch);
    const subjectsQ = useResource<Subject[]>(s => dialog === 'subject' ? heritage!.subjects(s) : Promise.resolve([]), 'asset-subjects:' + dialog + ':' + epoch);
    const post = async (path: string, body: unknown = {}) => { await heritage!.command('/assets/' + asset.id + path, body, crypto.randomUUID(), 'POST'); onChanged(); };
    const remove = async (path: string, body: unknown = {}) => { setError(null); try { await post(path, body); } catch (e) { setError(e); } };
    const linked = new Set(asset.originaux.map(o => o.archivePhysiqueId));
    return <div className="asset-tab">
        {error ? <ErrorNotice error={error} /> : null}
        <section className="asset-group"><div className="section-heading"><h4>Originaux physiques</h4>{canEdit && <button type="button" className="btn small secondary" onClick={() => setDialog('original')}>Relier un original</button>}</div>
            {asset.originaux.length ? <ul className="asset-links">{asset.originaux.map(o => <li key={o.archivePhysiqueId}><span><strong>{o.cote}</strong>{o.libelle && ' — ' + o.libelle}{o.support && <small> · {display(o.support)}</small>}{o.etatPhysique && <small> · {display(o.etatPhysique)}</small>}</span>
                {canEdit && <button type="button" className="btn small secondary" onClick={() => void remove('/originals/' + o.archivePhysiqueId + '/unlink')}>Retirer</button>}</li>)}</ul>
                : <Empty title={asset.champs.natureOriginale === 'NUMERIQUE_NATIF' ? 'Bien numérique natif' : 'Aucun original relié'} description={asset.champs.natureOriginale === 'NUMERIQUE_NATIF' ? 'Il n’y a pas d’original physique à localiser.' : 'Relier l’archive physique permet de localiser le bien.'} />}</section>
        <section className="asset-group"><div className="section-heading"><h4>Ressources liées</h4>{canEdit && <button type="button" className="btn small secondary" onClick={() => setDialog('ressource')}>Relier un document</button>}</div>
            {asset.ressources.length ? <ul className="asset-links">{asset.ressources.map(r => <li key={r.documentId}><span><strong>{r.titre}</strong> <Badge value={r.role} label={label(ROLE_RESSOURCE_LABELS, r.role)} />{r.identifiantMetier && <small> · {r.identifiantMetier}</small>}{r.libelle && <small> · {r.libelle}</small>}</span>
                {canEdit && <button type="button" className="btn small secondary" onClick={() => void remove('/resources/' + r.documentId + '/unlink')}>Retirer</button>}</li>)}</ul>
                : <Empty title="Aucune ressource liée" description="Représentations numériques, justificatifs, transcriptions, rapports : chaque document est conservé une fois et référencé ici." />}
            <small className="wf-note">Une nouvelle numérisation ajoute une représentation au même bien ; elle ne crée pas un second bien.</small></section>
        {([['Lieux', 'place', asset.lieux], ['Événements historiques', 'event', asset.evenements], ['Sujets', 'subject', asset.sujets]] as const).map(([title, kind, list]) => <section key={kind} className="asset-group">
            <div className="section-heading"><h4>{title}</h4>{canEdit && <button type="button" className="btn small secondary" onClick={() => setDialog(kind)}>Associer</button>}</div>
            {list.length ? <ul className="asset-links">{list.map(l => <li key={l.id + (l.detail ?? '')}><span>{l.libelle}{l.detail && <small> · {l.detail}</small>}</span>
                {canEdit && <button type="button" className="btn small secondary" onClick={() => void remove('/' + kind + 's/' + l.id + '/untag', { roleLieu: l.detail })}>Retirer</button>}</li>)}</ul> : <small className="wf-note">Aucun.</small>}</section>)}
        {dialog === 'original' && <PickerDialog title="Relier une archive physique" loading={archivesQ.loading} items={(archivesQ.data ?? []).filter(a => !linked.has(a.id)).map(a => ({ id: a.id, label: a.cote, detail: a.support ?? undefined }))}
            onPick={async id => post('/originals/' + id, {})} onClose={() => setDialog(null)} />}
        {dialog === 'ressource' && <PickerDialog title="Relier un document" loading={docsQ.loading} items={(docsQ.data?.items ?? []).map(d => ({ id: d.id, label: d.title, detail: d.reference }))} roles={ROLE_RESSOURCE_LABELS} roleLabel="Rôle du document"
            onPick={async (id, role) => post('/resources', { documentId: id, role })} onClose={() => setDialog(null)} />}
        {dialog === 'place' && <PickerDialog title="Associer un lieu" loading={placesQ.loading} items={(placesQ.data ?? []).map(p => ({ id: p.id, label: p.nom, detail: p.typeLieu ?? undefined }))}
            roles={{ LIEU_DE_PRODUCTION: 'Lieu de production', LIEU_REPRESENTE: 'Lieu représenté', LIEU_DE_CONSERVATION: 'Lieu de conservation', LIEU_EVOQUE: 'Lieu évoqué' }} roleLabel="Rôle du lieu" onPick={async (id, role) => post('/places/' + id, { roleLieu: role })} onClose={() => setDialog(null)} />}
        {dialog === 'event' && <PickerDialog title="Associer un événement" loading={eventsQ.loading} items={(eventsQ.data ?? []).map(e => ({ id: e.id, label: e.titre }))} onPick={async id => post('/events/' + id)} onClose={() => setDialog(null)} />}
        {dialog === 'subject' && <PickerDialog title="Associer un sujet" loading={subjectsQ.loading} items={(subjectsQ.data ?? []).map(s => ({ id: s.id, label: s.terme, detail: s.vocabulaire ?? undefined }))} onPick={async id => post('/subjects/' + id)} onClose={() => setDialog(null)} />}
    </div>;
}

// ---------- journal

/** Les valeurs d'un passage se lisent avec les libellés de ce qui change : la prise en charge, l'état matériel ou la description. */
const transitionLabels = (champ: string | null): Record<string, string> => champ === 'statutPriseEnCharge' ? PRISE_EN_CHARGE_LABELS : champ === 'etatMateriel' ? ETAT_LABELS : DESCRIPTION_LABELS;

function JournalTab({ assetId, stamp }: { assetId: string; stamp: string }) {
    const { heritage, epoch } = useSession();
    const q = useResource<HeritageJournalEntry[]>(s => heritage!.assetJournal(assetId, s), 'asset-journal:' + assetId + ':' + stamp + ':' + epoch);
    if (q.loading) return <Busy />;
    if (q.error) return <ErrorNotice error={q.error} onRetry={q.refresh} />;
    const list = [...(q.data ?? [])].reverse();
    return <ol className="wf-history asset-journal">{list.map(entry => <li key={entry.id}>
        <time dateTime={entry.createdAt}>{formatDate(entry.createdAt)}</time>
        <span><Badge value={entry.genre} label={label(JOURNAL_LABELS, entry.genre)} />{entry.automatique && <small className="wf-auto"> automatique</small>}{entry.champ && <strong> {label(FIELD_LABELS, entry.champ)}</strong>}</span>
        {entry.genre === 'CORRECTION' || entry.genre === 'TRANSITION' ? <p>{entry.genre === 'TRANSITION' ? <>{label(transitionLabels(entry.champ), String(entry.ancienneValeur))} → {label(transitionLabels(entry.champ), String(entry.nouvelleValeur))}</> : <><del>{journalValue(entry.ancienneValeur)}</del> → <ins>{journalValue(entry.nouvelleValeur)}</ins></>}</p>
            : entry.genre === 'MODIFICATION' && Array.isArray(entry.nouvelleValeur) ? <p>{entry.nouvelleValeur.map(n => label(FIELD_LABELS, String(n))).join(', ')}</p> : null}
        {entry.motif && <p>Motif : {entry.motif}</p>}
        {entry.source && <small>Source : {display(entry.source)}</small>}
    </li>)}</ol>;
}

// ---------- fiche

type Tab = 'description' | 'provenance' | 'valeur' | 'liens' | 'localisation' | 'conservation' | 'mouvements' | 'dossiers' | 'numerisation' | 'sortie' | 'journal';
const TABS: Array<[Tab, string]> = [['description', 'Description'], ['provenance', 'Provenance et droits'], ['valeur', 'Valeur patrimoniale'], ['liens', 'Ressources et liens'], ['localisation', 'Localisation'], ['conservation', 'Conservation'], ['mouvements', 'Mouvements'], ['dossiers', 'Prêts et expositions'], ['numerisation', 'Numérisation'], ['sortie', 'Sortie de collection'], ['journal', 'Historique']];

function AssetDialog({ id, categories, criteres, onClose, onChanged }: { id: string; categories: HeritageReference[]; criteres: HeritageReference[]; onClose: () => void; onChanged: () => void }) {
    const { me, heritage, epoch } = useSession();
    const [tab, setTab] = useState<Tab>('description');
    const [revision, setRevision] = useState(0);
    const q = useResource<HeritageAsset>(s => heritage!.asset(id, s), 'asset:' + id + ':' + revision + ':' + epoch);
    const refresh = () => { setRevision(r => r + 1); onChanged(); };
    // Pendant un rechargement la fiche reste affichée (pas de clignotement, le brouillon en cours n'est pas perdu).
    const last = useRef<HeritageAsset | null>(null);
    if (q.data) last.current = q.data;
    const current = q.data ?? last.current;
    if (!current && q.loading) return <Modal title="Bien patrimonial" onClose={onClose} wide><Busy /></Modal>;
    if (!current) return <Modal title="Bien patrimonial" onClose={onClose} wide><ErrorNotice error={q.error} onRetry={q.refresh} /></Modal>;
    const asset = current;
    const canEdit = can(me, 'HERITAGE_ASSET_MANAGE', { institutionId: asset.institutionId, departmentId: asset.departementId });
    const gaps = gapSummary(asset);
    const group = (ids: string[]) => FIELD_GROUPS.filter(g => ids.includes(g.id));
    return <Modal title={String(asset.champs.intitule ?? 'Bien patrimonial')} subtitle={asset.identifiant + ' · ' + dateText(String(asset.champs.precisionDate ?? ''), asset.champs.dateDebut as string | null, asset.champs.dateFin as string | null, asset.champs.dateTexte as string | null)} onClose={onClose} wide>
        <StatesStrip asset={asset} />
        {(can(me, 'DISSEMINATION_READ', { institutionId: asset.institutionId }) || can(me, 'DISSEMINATION_MANAGE', { institutionId: asset.institutionId })) &&
            <ArkPanel objectType="BIEN" objectId={asset.id} institutionId={asset.institutionId} canManage={can(me, 'DISSEMINATION_MANAGE', { institutionId: asset.institutionId })} />}
        <TransitionBar asset={asset} onDone={refresh} />
        <div role="tablist" className="asset-tabs" aria-label="Sections de la fiche">{TABS.map(([key, text]) => <button key={key} role="tab" type="button" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{text}{key === 'valeur' && gaps.validation > 0 && asset.lacunes.some(g => g.code.startsWith('NO_VALUE')) ? ' •' : ''}</button>)}</div>
        {tab === 'description' && <>
            <GroupsTab asset={asset} groups={group(['identification', 'description', 'contexte'])} canEdit={canEdit} categories={categories} criteres={criteres} onSaved={refresh} intro={<GapList gaps={asset.lacunes} />} />
            {can(me, 'HERITAGE_READ', { institutionId: asset.institutionId, departmentId: asset.departementId }) && <KeywordsPanel kind="BIEN" objectId={asset.id} institutionId={asset.institutionId}
                canEdit={canEdit && (asset.statutDescription === 'MINIMALE' || asset.statutDescription === 'EN_REDACTION')} />}
        </>}
        {tab === 'provenance' && <GroupsTab asset={asset} groups={group(['provenance'])} canEdit={canEdit} categories={categories} criteres={criteres} onSaved={refresh}
            intro={<Notice>La notice patrimoniale ne publie rien et ne change aucune confidentialité : la diffusion se décide séparément, bien par bien.</Notice>} />}
        {tab === 'valeur' && <GroupsTab asset={asset} groups={group(['valeur'])} canEdit={canEdit} categories={categories} criteres={criteres} onSaved={refresh}
            intro={<Notice>Appréciation interne : ce n’est ni une protection juridique ni une reconnaissance externe, et elle ne produit aucun badge « classé » ou « protégé ».</Notice>} />}
        {tab === 'liens' && <LinksTab asset={asset} canEdit={canEdit} onChanged={refresh} />}
        {tab === 'localisation' && <PlacementTab asset={asset} onChanged={refresh} />}
        {tab === 'conservation' && <ConservationTab asset={asset} onChanged={refresh} />}
        {tab === 'mouvements' && <MovementsTab asset={asset} onChanged={refresh} />}
        {tab === 'dossiers' && <DossiersTab asset={asset} onChanged={refresh} />}
        {tab === 'numerisation' && <DigitizationTab asset={asset} onChanged={refresh} />}
        {tab === 'sortie' && <DeaccessionTab asset={asset} onChanged={refresh} />}
        {tab === 'journal' && <JournalTab assetId={asset.id} stamp={String(asset.version)} />}
        <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose}>Fermer</button></footer>
    </Modal>;
}

// ---------- liste

const dash = (d: HeritageDashboard | undefined, key: string) => d?.parStatutDescription[key] ?? 0;

/** `initialAssetId` ouvre directement la fiche d'un bien (lien depuis un mot-clé ou une notification) ; un identifiant mal formé est ignoré. */
export function HeritageAssetsPanel({ initialAssetId }: { initialAssetId?: string } = {}) {
    const { me, heritage, epoch } = useSession();
    const { scope } = useWorkspace();
    const [form, setForm] = useState({ q: '', categorie: '', statutDescription: '', statutPriseEnCharge: '', etatMateriel: '' });
    const [applied, setApplied] = useState(form);
    const [page, setPage] = useState(0);
    const [revision, setRevision] = useState(0);
    const [creating, setCreating] = useState(false);
    const [opened, setOpened] = useState<string | null>(initialAssetId && UUID_RE.test(initialAssetId) ? initialAssetId : null);
    const listQ = useResource<HeritageAssetPage>(s => heritage!.assets({ ...applied, page, size: 20 }, s), JSON.stringify(['heritage-assets', applied, page, revision, epoch]));
    const dashQ = useResource<HeritageDashboard>(s => heritage!.assetsDashboard(s), 'heritage-assets-dashboard:' + revision + ':' + epoch);
    const catQ = useResource<HeritageReference[]>(s => heritage!.references('CATEGORIE', s), 'heritage-categories:' + epoch);
    const critQ = useResource<HeritageReference[]>(s => heritage!.references('CRITERE_VALEUR', s), 'heritage-criteres:' + epoch);
    const categories = catQ.data ?? [];
    const criteres = critQ.data ?? [];
    const canCreate = can(me, 'HERITAGE_ASSET_MANAGE', scope);
    const refresh = () => setRevision(r => r + 1);
    const d = dashQ.data;
    const apply = (next: typeof form) => { setForm(next); setApplied(next); setPage(0); };
    const items = listQ.data?.items ?? [];
    return <>
        <div className="panel">
            <div className="section-heading"><h3>Biens patrimoniaux</h3>{canCreate && <button className="btn small secondary" onClick={() => setCreating(true)}>Nouveau bien</button>}</div>
            {d && <ul className="scan-chips asset-dashboard" aria-label="Vue d’ensemble">
                <li>{d.total} bien{d.total > 1 ? 's' : ''}</li>
                {DESCRIPTION_STATUSES.map(s => <li key={s} className={s === 'A_RELIRE' && dash(d, s) > 0 ? 'warn' : s === 'VALIDEE' && dash(d, s) > 0 ? 'ok' : ''}><button type="button" className="chip-link" onClick={() => apply({ ...form, statutDescription: applied.statutDescription === s ? '' : s })}>{dash(d, s)} {label(DESCRIPTION_LABELS, s).toLowerCase()}</button></li>)}
                {d.introuvables > 0 && <li className="bad">{d.introuvables} introuvable{d.introuvables > 1 ? 's' : ''}</li>}
                {d.sansOriginal > 0 && <li className="warn">{d.sansOriginal} sans original localisé</li>}
                {d.provenanceAEtablir > 0 && <li className="warn">{d.provenanceAEtablir} provenance à établir</li>}
                {d.situationJuridiqueAClarifier > 0 && <li className="warn">{d.situationJuridiqueAClarifier} situation juridique à clarifier</li>}
                {d.valeurNonEvaluee > 0 && <li>{d.valeurNonEvaluee} valeur non évaluée</li>}
            </ul>}
            <form className="asset-filters" onSubmit={e => { e.preventDefault(); apply(form); }} role="search" aria-label="Rechercher un bien">
                <Field label="Recherche"><input value={form.q} onChange={e => setForm({ ...form, q: e.target.value })} placeholder="Intitulé, identifiant, numéro d’inventaire, résumé" /></Field>
                <Field label="Catégorie"><select value={form.categorie} onChange={e => apply({ ...form, categorie: e.target.value })}><option value="">Toutes</option>{categories.map(c => <option key={c.code} value={c.code}>{c.libelle}</option>)}</select></Field>
                <Field label="Description"><select value={form.statutDescription} onChange={e => apply({ ...form, statutDescription: e.target.value })}><option value="">Toutes</option>{DESCRIPTION_STATUSES.map(s => <option key={s} value={s}>{label(DESCRIPTION_LABELS, s)}</option>)}</select></Field>
                <Field label="Prise en charge"><select value={form.statutPriseEnCharge} onChange={e => apply({ ...form, statutPriseEnCharge: e.target.value })}><option value="">Toutes</option>{Object.entries(PRISE_EN_CHARGE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                <Field label="État matériel"><select value={form.etatMateriel} onChange={e => apply({ ...form, etatMateriel: e.target.value })}><option value="">Tous</option>{Object.entries(ETAT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                <button type="submit" className="btn small secondary">Rechercher</button>
            </form>
            {listQ.loading ? <Busy /> : listQ.error ? <ErrorNotice error={listQ.error} onRetry={listQ.refresh} /> : items.length ? <>
                <div className="table-scroll"><table><thead><tr><th>Identifiant</th><th>Intitulé</th><th>Catégorie</th><th>Date</th><th>Description</th><th>Prise en charge</th><th>État</th><th>Original</th><th>Manques</th><th>Modifié</th></tr></thead>
                    <tbody>{items.map((b: HeritageAssetSummary) => <tr key={b.id}>
                        <td><button type="button" className="text-link" onClick={() => setOpened(b.id)}>{b.identifiant}</button></td>
                        <td>{b.intitule}{b.numeroInventaire && <small className="cell-sub">Inv. {b.numeroInventaire}</small>}</td>
                        <td>{categories.find(c => c.code === b.categorie)?.libelle ?? b.categorie}</td>
                        <td>{dateText(b.precisionDate, b.dateDebut, b.dateFin, b.dateTexte)}</td>
                        <td><Badge value={b.statutDescription} label={label(DESCRIPTION_LABELS, b.statutDescription)} /></td>
                        <td>{label(PRISE_EN_CHARGE_LABELS, b.statutPriseEnCharge)}</td>
                        <td>{label(ETAT_LABELS, b.etatMateriel)}</td>
                        <td>{b.natureOriginale === 'NUMERIQUE_NATIF' ? 'Numérique' : b.originaux ? b.originaux + ' relié' + (b.originaux > 1 ? 's' : '') : 'Non localisé'}</td>
                        <td>{b.lacunesBloquantes > 0 ? <span className="asset-gap-count" title="Manques qui bloquent la relecture ou la validation">{b.lacunesBloquantes}</span> : '—'}</td>
                        <td>{formatDate(b.updatedAt)}</td></tr>)}</tbody></table></div>
                <Pagination page={page} hasMore={listQ.data?.hasMore ?? false} onChange={setPage} count={items.length} />
            </> : <Empty title="Aucun bien patrimonial" description={Object.values(applied).some(Boolean) ? 'Aucun bien ne correspond à ces critères.' : canCreate ? 'Créez le premier bien : une identification minimale suffit, le reste se complète ensuite.' : 'Aucun bien dans votre périmètre.'} />}
        </div>
        {creating && <CreateAssetDialog categories={categories} onClose={() => setCreating(false)} onCreated={asset => { refresh(); setOpened(asset.id); }} />}
        {opened && <AssetDialog id={opened} categories={categories} criteres={criteres} onClose={() => setOpened(null)} onChanged={refresh} />}
    </>;
}
