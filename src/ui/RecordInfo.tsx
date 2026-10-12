import React, { useMemo, useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { commandKey } from '../api/archives';
import { ArchiveRecordPicker } from './ArchiveRecordPicker';
import { Badge, Busy, CopyId, Empty, ErrorNotice, Field, Modal, Notice, useResource } from './components';
import { useAuthorities } from './DepositAgreements';
import { navigate } from './navigation';
import { EXTENT_UNITS } from '../core/archivalDescription';
import { formatBytes, formatDay } from '../core/format';
import {
    LANGUAGE_SUGGESTIONS, PERSONAL_LABELS, RELATION_TYPES, dossierBody, dossierProblems, extentText, extremeDates, formOfDossier, formOfInfo, groupRelations, infoBody, infoGaps, infoProblems,
    languageLabel, levelLabel, relationProblems, volumetrySummary,
    type DocumentRelation, type DocumentRelations, type DossierForm, type InfoForm, type PersonalData, type RelationType, type Volumetry
} from '../core/recordInfo';
import type { Dossier, Page, RecordDocument } from '../core/types';

/** Le nom du type documentaire (le catalogue est partagé et mis en cache par la session) : jamais son identifiant. */
export function DocumentTypeName({ id }: { id: string }) {
    const { records, epoch } = useSession();
    const q = useResource(signal => records!.documentTypes(signal), 'record-type-names:' + epoch);
    return <>{q.data?.find(t => t.id === id)?.label ?? (q.loading ? '…' : 'Type documentaire')}</>;
}

/** Le dossier qui contient un document, par sa cote et son intitulé, avec le lien pour l'ouvrir. */
export function DossierLink({ id }: { id: string }) {
    const { records, epoch } = useSession();
    const q = useResource<Dossier | null>(signal => records!.dossier(id, signal).catch(() => null), `record-dossier-link:${id}:${epoch}`);
    if (q.loading && q.data === undefined) return <>…</>;
    return q.data ? <button type="button" className="text-link" onClick={() => navigate('/app/dossiers/' + id)}>{q.data.reference} · {q.data.title}</button> : <>Dossier non lisible</>;
}

const Yes = ({ children }: { children: React.ReactNode }) => <span className="record-flag">{children}</span>;

/** Les informations d'archivage d'un document : identifiant pérenne, langue, étendue, ancienne cote, données personnelles, document essentiel. */
export function DocumentArchivalPanel({ document: d, canEdit, onChanged }: { document: RecordDocument; canEdit: boolean; onChanged: () => void }) {
    const [editing, setEditing] = useState(false);
    const gaps = infoGaps({ language: d.language, extentQuantity: d.extentQuantity, personalData: d.personalData });
    const extent = extentText(d.extentQuantity, d.extentUnit);
    return <section className="panel record-info" aria-label="Informations d’archivage">
        <div className="section-heading"><h3>Informations d’archivage</h3>{canEdit && !d.destroyed && <button type="button" className="btn small secondary" onClick={() => setEditing(true)}>Modifier</button>}</div>
        <dl className="f3-description-list">
            <div><dt>Identifiant pérenne</dt><dd>{d.persistentId ? <><code>{d.persistentId}</code> <CopyId value={d.persistentId} /></> : '—'}<small className="cell-sub">Attribué une fois pour toutes : il ne change jamais, même si la cote change.</small></dd></div>
            <div><dt>Langue du contenu</dt><dd>{d.language ? languageLabel(d.language) : '—'}</dd></div>
            <div><dt>Étendue</dt><dd>{extent || '—'}</dd></div>
            <div><dt>Ancienne cote</dt><dd>{d.formerReference ? <>{d.formerReference}{d.formerReferenceOrigin && <small className="cell-sub">{d.formerReferenceOrigin}</small>}</> : '—'}</dd></div>
            <div><dt>Données personnelles</dt><dd>{d.personalData ? <Badge value={d.personalData} label={PERSONAL_LABELS[d.personalData]} /> : '—'}{d.sensitiveData && <> <Yes>sensibles</Yes></>}{d.personalDataNature && <small className="cell-sub">{d.personalDataNature}</small>}</dd></div>
            <div><dt>Document essentiel</dt><dd>{d.essential ? <><Yes>Essentiel</Yes><small className="cell-sub">{d.essentialReason}</small></> : 'Non'}</dd></div>
        </dl>
        {gaps.length > 0 && !d.destroyed && <p className="record-info-gaps"><small>À compléter : {gaps.join(', ')}.</small></p>}
        {d.essential && <Notice tone="warning">Un document essentiel ne peut pas être éliminé tant que cette mention n’est pas retirée, avec son motif.</Notice>}
        {editing && <DocumentInfoDialog document={d} onClose={() => setEditing(false)} onSaved={onChanged} />}
    </section>;
}

function DocumentInfoDialog({ document: d, onClose, onSaved }: { document: RecordDocument; onClose: () => void; onSaved: () => void }) {
    const { records } = useSession();
    const [form, setForm] = useState<InfoForm>(formOfInfo({ language: d.language, extentQuantity: d.extentQuantity, extentUnit: d.extentUnit, formerReference: d.formerReference, formerReferenceOrigin: d.formerReferenceOrigin,
        personalData: d.personalData, sensitiveData: d.sensitiveData, personalDataNature: d.personalDataNature, essential: d.essential, essentialReason: d.essentialReason }));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const intention = useRef<ReturnType<typeof commandKey> | null>(null);
    const problems = useMemo(() => infoProblems(form), [form]);
    const set = <K extends keyof InfoForm>(key: K, value: InfoForm[K]) => setForm(f => ({ ...f, [key]: value }));
    const text = (key: keyof InfoForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => set(key, e.target.value as never);
    const present = form.personalData === 'PRESENTES';
    const canSave = !busy && problems.length === 0 && form.reason.trim().length > 0;
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!canSave) return;
        setBusy(true); setError(null);
        const body = infoBody(form, d.versionLock);
        intention.current = commandKey(intention.current, body);
        try { await records!.saveDocumentInfo(d.id, body, intention.current.key); onSaved(); onClose(); } catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal wide title="Informations d’archivage" subtitle={d.reference} onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Langue du contenu" hint="Code de langue : fra, eng, fuf (pular)… Les suggestions couvrent les langues les plus courantes."><input list="record-languages" value={form.language} onChange={text('language')} maxLength={35} disabled={busy} />
                    <datalist id="record-languages">{LANGUAGE_SUGGESTIONS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}</datalist></Field>
                <div className="form-row">
                    <Field label="Étendue : quantité" hint="Pages, feuillets, pièces…"><input inputMode="decimal" value={form.extentQuantity} onChange={text('extentQuantity')} maxLength={15} disabled={busy} placeholder="12" /></Field>
                    <Field label="Étendue : unité"><select value={form.extentUnit} onChange={text('extentUnit')} disabled={busy}><option value="">Aucune</option>{EXTENT_UNITS.map(u => <option key={u.code} value={u.code}>{u.label}</option>)}</select></Field>
                </div>
                <Field label="Ancienne cote" hint="La cote sous un ancien plan de classement : on retrouve le document par elle."><input value={form.formerReference} onChange={text('formerReference')} maxLength={150} disabled={busy} /></Field>
                <Field label="Origine de l’ancienne cote" hint="Quel plan, quelle année."><input value={form.formerReferenceOrigin} onChange={text('formerReferenceOrigin')} maxLength={200} disabled={busy} /></Field>
                <Field label="Données personnelles" hint="Sert à fixer les délais de communication et les occultations."><select value={form.personalData} onChange={e => set('personalData', e.target.value as PersonalData)} disabled={busy}>
                    {(Object.keys(PERSONAL_LABELS) as PersonalData[]).map(k => <option key={k} value={k}>{PERSONAL_LABELS[k]}</option>)}</select></Field>
                <label className="field check-field"><span><input type="checkbox" checked={present && form.sensitiveData} onChange={e => set('sensitiveData', e.target.checked)} disabled={busy || !present} /> Données sensibles</span><small>Santé, opinions, origine, condamnations… Suppose des données personnelles présentes.</small></label>
                <Field label="Nature des données personnelles" wide hint={present ? 'Quelles données : noms et adresses d’agents, dossiers médicaux…' : 'Seulement si des données personnelles sont présentes.'}><textarea value={form.personalDataNature} onChange={text('personalDataNature')} rows={2} maxLength={2000} disabled={busy || !present} /></Field>
                <label className="field span2 check-field"><span><input type="checkbox" checked={form.essential} onChange={e => set('essential', e.target.checked)} disabled={busy} /> Document essentiel</span><small>Nécessaire à la continuité de l’institution (titre de propriété, état civil…). Il ne pourra pas être éliminé.</small></label>
                <Field label="Motif de la mention « essentiel »" wide hint={form.essential ? 'Obligatoire.' : undefined}><textarea value={form.essentialReason} onChange={text('essentialReason')} rows={2} maxLength={2000} disabled={busy || !form.essential} /></Field>
                <Field label="Motif de la modification *" wide hint="Conservé dans le journal : pourquoi on précise ou corrige ces informations."><textarea value={form.reason} onChange={text('reason')} rows={2} maxLength={2000} disabled={busy} required /></Field>
            </div>
            {problems.length > 0 && <ul className="relation-problems" role="alert">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={!canSave}>Enregistrer</button></footer>
        </form>
    </Modal>;
}

/** Les relations d'un document avec d'autres : « remplace », « est une annexe de », « répond à »… lues dans les deux sens. */
export function DocumentRelationsPanel({ document: d, canEdit }: { document: RecordDocument; canEdit: boolean }) {
    const { records, epoch } = useSession();
    const q = useResource<DocumentRelations>(signal => records!.documentRelations(d.id, signal), `document-relations:${d.id}:${epoch}`);
    const [adding, setAdding] = useState(false);
    const [editing, setEditing] = useState<DocumentRelation | null>(null);
    const [confirming, setConfirming] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const intention = useRef<ReturnType<typeof commandKey> | null>(null);
    const groups = useMemo(() => groupRelations(q.data?.items ?? []), [q.data]);
    const remove = async (r: DocumentRelation) => {
        if (busy) return;
        setBusy(true); setError(null);
        intention.current = commandKey(intention.current, { remove: r.id, version: r.version });
        try { await records!.deleteRelation(d.id, r.id, r.version, intention.current.key); setConfirming(null); q.refresh(); } catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <section className="panel document-relations" aria-label="Relations avec d’autres documents">
        <div className="section-heading"><h3>Relations avec d’autres documents</h3>{canEdit && !d.destroyed && <button type="button" className="btn small secondary" onClick={() => setAdding(true)}>Ajouter une relation</button>}</div>
        {q.loading && !q.data ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} />
            : groups.length === 0 ? <Empty title="Aucune relation" description="Un document peut en remplacer un autre, en être l’annexe, y répondre, en être la traduction ou la copie." icon="link" />
                : <div className="relation-groups">{groups.map(g => <div key={g.label} className="relation-group"><h4>Ce document {g.label}</h4>
                    <ul>{g.items.map(r => <li key={r.id}>
                        <button type="button" className="text-link" onClick={() => navigate('/app/documents/' + r.other.id)}><strong>{r.other.reference}</strong> · {r.other.title}</button>
                        {r.other.destroyed && <> <Badge value="DETRUIT" label="Détruit" /></>}
                        {r.comment && <small className="cell-sub">{r.comment}</small>}
                        {canEdit && r.outgoing && !d.destroyed && (confirming === r.id
                            ? <span className="relation-actions"><span className="relation-confirm">Supprimer cette relation ?</span> <button type="button" className="btn small danger" disabled={busy} onClick={() => void remove(r)}>Supprimer</button> <button type="button" className="btn small secondary" disabled={busy} onClick={() => setConfirming(null)}>Garder</button></span>
                            : <span className="relation-actions"><button type="button" className="btn small secondary" onClick={() => setEditing(r)}>Commentaire</button> <button type="button" className="btn small danger-outline" onClick={() => setConfirming(r.id)}>Supprimer</button></span>)}
                    </li>)}</ul></div>)}</div>}
        {q.data && q.data.unreadable > 0 && <Notice tone="warning">{q.data.unreadable === 1 ? 'Une relation concerne un document que vous n’avez pas le droit de lire.' : `${q.data.unreadable} relations concernent des documents que vous n’avez pas le droit de lire.`}</Notice>}
        {error ? <ErrorNotice error={error} /> : null}
        {adding && <RelationDialog document={d} onClose={() => setAdding(false)} onSaved={q.refresh} />}
        {editing && <RelationCommentDialog document={d} relation={editing} onClose={() => setEditing(null)} onSaved={q.refresh} />}
    </section>;
}

function RelationDialog({ document: d, onClose, onSaved }: { document: RecordDocument; onClose: () => void; onSaved: () => void }) {
    const { records } = useSession();
    const [type, setType] = useState<RelationType>('REMPLACE');
    const [targetId, setTargetId] = useState<string | null>(null);
    const [comment, setComment] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const intention = useRef<ReturnType<typeof commandKey> | null>(null);
    const problems = relationProblems(d.id, targetId, comment);
    const hint = RELATION_TYPES.find(r => r.type === type)?.hint;
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (busy || problems.length) return;
        setBusy(true); setError(null);
        intention.current = commandKey(intention.current, { type, targetId, comment });
        try { await records!.addRelation(d.id, targetId!, type, comment.trim() || null, intention.current.key); onSaved(); onClose(); } catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal title="Ajouter une relation" subtitle={d.reference} onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Ce document…" wide hint={hint}><select value={type} onChange={e => setType(e.target.value as RelationType)} disabled={busy}>{RELATION_TYPES.map(r => <option key={r.type} value={r.type}>{r.label}</option>)}</select></Field>
                <ArchiveRecordPicker kind="documents" institution={d.institutionId} value={targetId} disabled={busy} required onChange={setTargetId} />
                <Field label="Commentaire" wide hint="Facultatif : précise la relation (annexe 1, version de 2019…)."><textarea value={comment} onChange={e => setComment(e.target.value)} rows={2} maxLength={2000} disabled={busy} /></Field>
            </div>
            {problems.length > 0 && targetId !== null && <ul className="relation-problems" role="alert">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy || problems.length > 0}>Enregistrer</button></footer>
        </form>
    </Modal>;
}

function RelationCommentDialog({ document: d, relation, onClose, onSaved }: { document: RecordDocument; relation: DocumentRelation; onClose: () => void; onSaved: () => void }) {
    const { records } = useSession();
    const [comment, setComment] = useState(relation.comment ?? '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true); setError(null);
        try { await records!.updateRelation(d.id, relation.id, comment.trim() || null, relation.version, crypto.randomUUID()); onSaved(); onClose(); } catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal title="Commentaire de la relation" subtitle={`${relation.label} ${relation.other.reference}`} onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <div className="form-grid"><Field label="Commentaire" wide><textarea value={comment} onChange={e => setComment(e.target.value)} rows={3} maxLength={2000} disabled={busy} /></Field></div>
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>Enregistrer</button></footer>
        </form>
    </Modal>;
}

/**
 * La structure d'un dossier : sa place dans la hiérarchie, son service producteur, ses dates extrêmes, son étendue, sa volumétrie, ses sous-dossiers et ses documents.
 * `onCreateChild` ouvre la création d'un sous-dossier (le formulaire de création est celui du catalogue).
 */
export function DossierStructurePanel({ dossier: d, canEdit, canCreate, onChanged, onCreateChild }: { dossier: Dossier; canEdit: boolean; canCreate: boolean; onChanged: () => void; onCreateChild: () => void }) {
    const { records, epoch } = useSession();
    const parent = useResource<Dossier | null>(signal => d.parentId ? records!.dossier(d.parentId, signal).catch(() => null) : Promise.resolve(null), `dossier-parent:${d.parentId ?? ''}:${epoch}`);
    const children = useResource<Dossier[]>(signal => records!.dossierChildren(d.id, signal), `dossier-children:${d.id}:${epoch}`);
    const volumetry = useResource<Volumetry>(signal => records!.dossierVolumetry(d.id, signal), `dossier-volumetry:${d.id}:${epoch}`);
    const documents = useResource<Page<RecordDocument>>(signal => records!.dossierDocuments(d.id, { page: 0, size: 20 }, signal), `dossier-documents:${d.id}:${epoch}`);
    const authorities = useAuthorities(d.producerId ? d.institutionId : null);
    const [editing, setEditing] = useState(false);
    const level = d.level ?? 1;
    const producerName = d.producerId ? authorities.data?.find(a => a.id === d.producerId)?.input.name ?? (authorities.loading ? '…' : 'Notice non lisible') : null;
    const dates = extremeDates({ contentStartDate: d.contentStartDate ?? null, contentEndDate: d.contentEndDate ?? null }, volumetry.data ?? null);
    const closed = d.businessStatus === 'CLOS';
    return <section className="panel dossier-structure" aria-label="Structure du dossier">
        <div className="section-heading"><h3>Structure du dossier</h3><div className="table-actions">
            {canCreate && !closed && level < 8 && <button type="button" className="btn small primary" onClick={onCreateChild}>Créer un sous-dossier</button>}
            {canEdit && <button type="button" className="btn small secondary" onClick={() => setEditing(true)}>Modifier</button>}</div></div>
        <dl className="f3-description-list">
            <div><dt>Niveau</dt><dd>{levelLabel(level)}{d.parentId && <> de {parent.data ? <button type="button" className="text-link" onClick={() => navigate('/app/dossiers/' + d.parentId)}>{parent.data.reference} · {parent.data.title}</button> : '…'}</>}</dd></div>
            <div><dt>Service producteur</dt><dd>{producerName ?? '—'}</dd></div>
            <div><dt>Dates extrêmes</dt><dd>{dates.start || dates.end ? <>{formatDay(dates.start)} → {formatDay(dates.end)}{dates.computed && <small className="cell-sub">Calculées d’après les dates des documents</small>}</> : '—'}</dd></div>
            <div><dt>Étendue</dt><dd>{extentText(d.extentQuantity, d.extentUnit) || '—'}</dd></div>
            <div><dt>Volumétrie</dt><dd>{volumetry.data ? <>{volumetrySummary(volumetry.data)}{volumetry.data.totalBytes > 0 && <small className="cell-sub">{formatBytes(volumetry.data.totalBytes)} de fichiers</small>}</> : volumetry.loading ? '…' : '—'}<small className="cell-sub">Compte seulement ce que vous avez le droit de voir.</small></dd></div>
        </dl>
        <h4>Sous-dossiers</h4>
        {children.loading && !children.data ? <Busy /> : children.error ? <ErrorNotice error={children.error} onRetry={children.refresh} />
            : (children.data ?? []).length === 0 ? <p className="relation-empty">Aucun sous-dossier.</p>
                : <div className="table-scroll"><table><thead><tr><th>Cote et intitulé</th><th>Niveau</th><th>Statut</th></tr></thead><tbody>{children.data!.map(c => <tr key={c.id}>
                    <td><button type="button" className="text-link" onClick={() => navigate('/app/dossiers/' + c.id)}><strong>{c.reference}</strong> · {c.title}</button></td><td>{levelLabel(c.level ?? 2)}</td><td><Badge value={c.businessStatus} /></td></tr>)}</tbody></table></div>}
        <h4>Documents du dossier</h4>
        {documents.loading && !documents.data ? <Busy /> : documents.error ? <ErrorNotice error={documents.error} onRetry={documents.refresh} />
            : (documents.data?.items ?? []).length === 0 ? <p className="relation-empty">Aucun document que vous puissiez voir directement dans ce dossier.</p>
                : <div className="table-scroll"><table><thead><tr><th>Cote et titre</th><th>Statut</th></tr></thead><tbody>{documents.data!.items.map(x => <tr key={x.id}>
                    <td><button type="button" className="text-link" onClick={() => navigate('/app/documents/' + x.id)}><strong>{x.reference}</strong> · {x.title}</button></td><td><Badge value={x.archivalStatus} /></td></tr>)}</tbody></table>
                    {documents.data!.hasMore && <p><small>La liste est limitée aux 20 premiers documents.</small></p>}</div>}
        {editing && <DossierInfoDialog dossier={d} onClose={() => setEditing(false)} onSaved={onChanged} />}
    </section>;
}

function DossierInfoDialog({ dossier: d, onClose, onSaved }: { dossier: Dossier; onClose: () => void; onSaved: () => void }) {
    const { records } = useSession();
    const authorities = useAuthorities(d.institutionId);
    const [form, setForm] = useState<DossierForm>(formOfDossier({ producerId: d.producerId ?? null, contentStartDate: d.contentStartDate ?? null, contentEndDate: d.contentEndDate ?? null, extentQuantity: d.extentQuantity ?? null, extentUnit: d.extentUnit ?? null }));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const intention = useRef<ReturnType<typeof commandKey> | null>(null);
    const problems = useMemo(() => dossierProblems(form), [form]);
    const text = (key: keyof DossierForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm(f => ({ ...f, [key]: e.target.value }));
    const canSave = !busy && problems.length === 0 && form.reason.trim().length > 0;
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!canSave) return;
        setBusy(true); setError(null);
        const body = dossierBody(form, d.versionLock ?? 0);
        intention.current = commandKey(intention.current, body);
        try { await records!.saveDossierInfo(d.id, body, intention.current.key); onSaved(); onClose(); } catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal wide title="Structure du dossier" subtitle={d.reference} onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Service producteur" wide hint="Une notice d’autorité de l’institution : le service qui a produit ces documents."><select value={form.producerId} onChange={text('producerId')} disabled={busy || authorities.loading}>
                    <option value="">Aucun</option>{(authorities.data ?? []).map(a => <option key={a.id} value={a.id}>{a.input.name}</option>)}</select></Field>
                <Field label="Date de début du contenu" hint="Vide : déduite des documents."><input type="date" value={form.contentStartDate} onChange={text('contentStartDate')} disabled={busy} /></Field>
                <Field label="Date de fin du contenu" hint="Vide : déduite des documents."><input type="date" value={form.contentEndDate} onChange={text('contentEndDate')} disabled={busy} /></Field>
                <Field label="Étendue : quantité" hint="Pour un dossier papier : mètres linéaires, boîtes…"><input inputMode="decimal" value={form.extentQuantity} onChange={text('extentQuantity')} maxLength={15} disabled={busy} placeholder="2,5" /></Field>
                <Field label="Étendue : unité"><select value={form.extentUnit} onChange={text('extentUnit')} disabled={busy}><option value="">Aucune</option>{EXTENT_UNITS.map(u => <option key={u.code} value={u.code}>{u.label}</option>)}</select></Field>
                <Field label="Motif de la modification *" wide><textarea value={form.reason} onChange={text('reason')} rows={2} maxLength={2000} disabled={busy} required /></Field>
            </div>
            {problems.length > 0 && <ul className="relation-problems" role="alert">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={!canSave}>Enregistrer</button></footer>
        </form>
    </Modal>;
}
