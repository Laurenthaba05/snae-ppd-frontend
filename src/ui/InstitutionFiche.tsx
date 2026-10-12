import React, { useMemo, useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { ArchivesApi, commandKey } from '../api/archives';
import { can } from '../core/policy';
import { FICHE_GROUPS, emptyFicheForm, ficheBody, ficheCompleteness, ficheFormOf, ficheProblems, type FicheForm, type InstitutionFicheView } from '../core/institutionFiche';
import { Busy, ErrorNotice, Field, Modal, Notice, formatDate, useResource } from './components';
import { ReferencePicker } from './ReferencePicker';

/**
 * Fiche du service d'archives d'une institution (ISDIAH) : coordonnées, horaires, accès, services, histoire, mandat, politique d'acquisition et tutelle.
 * Elle complète la fiche d'identité (code, nom, sigle, type, statut) sans la remplacer.
 */
export function InstitutionFichePanel({ institutionId }: { institutionId: string }) {
    const { me, records, epoch } = useSession();
    const api = useMemo(() => new ArchivesApi(records!.transport), [records]);
    const q = useResource<InstitutionFicheView>(s => api.fiche(institutionId, s), 'institution-fiche:' + institutionId + ':' + epoch);
    const [editing, setEditing] = useState(false);
    const [notice, setNotice] = useState('');
    const canEdit = can(me, 'ARCHIVAL_DESCRIPTION_MANAGE', { institutionId }) || can(me, 'IAM_INSTITUTION_MANAGE', { institutionId });
    if (q.loading && !q.data) return <section className="panel"><Busy label="Lecture de la fiche du service d’archives…" /></section>;
    if (q.error && !q.data) return <section className="panel"><div className="section-heading"><h3>Fiche du service d’archives</h3></div><ErrorNotice error={q.error} onRetry={q.refresh} /></section>;
    const view = q.data!;
    const form = ficheFormOf(view);
    const progress = ficheCompleteness(view);
    return <section className="panel institution-fiche" aria-label="Fiche du service d’archives">
        <div className="section-heading"><h3>Fiche du service d’archives</h3>
            {canEdit && <button type="button" className="btn small primary" onClick={() => { setNotice(''); setEditing(true); }}>{view.updatedAt ? 'Modifier la fiche' : 'Renseigner la fiche'}</button>}</div>
        {notice && <Notice>{notice}</Notice>}
        <p className="fiche-progress">{progress.done === 0 ? 'Aucune zone renseignée.' : `${progress.done} zone${progress.done > 1 ? 's' : ''} renseignée${progress.done > 1 ? 's' : ''} sur ${progress.total}.`}
            {view.updatedAt && <> Dernière mise à jour le {formatDate(view.updatedAt)}.</>}</p>
        <dl className="fiche-list">
            <div><dt>Tutelle</dt><dd>{view.tutelleNom ?? <small>Non renseignée</small>}</dd></div>
            {FICHE_GROUPS.flatMap(g => g.fields).map(f => <div key={f.key}><dt>{f.label}</dt><dd className="fiche-text">{form[f.key].trim() ? form[f.key] : <small>Non renseigné</small>}</dd></div>)}
        </dl>
        {editing && <FicheDialog api={api} institutionId={institutionId} view={view} onClose={() => setEditing(false)} onSaved={() => { setNotice('Fiche enregistrée.'); q.refresh(); }} />}
    </section>;
}

function FicheDialog({ api, institutionId, view, onClose, onSaved }: { api: ArchivesApi; institutionId: string; view: InstitutionFicheView; onClose: () => void; onSaved: () => void }) {
    const [form, setForm] = useState<FicheForm>(() => ({ ...emptyFicheForm(), ...ficheFormOf(view) }));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const intention = useRef<ReturnType<typeof commandKey> | null>(null);
    const problems = ficheProblems(form);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (busy || problems.length) return;
        setBusy(true); setError(null);
        const body = ficheBody(institutionId, form, view.version);
        intention.current = commandKey(intention.current, body);
        try { await api.saveFiche(institutionId, body, intention.current.key); onSaved(); onClose(); }
        catch (e) { setError(e); } finally { setBusy(false); }
    };
    const set = (key: keyof FicheForm, value: string) => setForm(f => ({ ...f, [key]: value }));
    return <Modal wide title="Fiche du service d’archives" subtitle={view.nom} onClose={onClose} locked={busy}><form onSubmit={submit} noValidate>
        <div className="form-grid">
            <Field label="Tutelle" wide hint="Autorité dont le service dépend ; la chaîne de tutelle ne peut pas former de boucle.">
                <ReferencePicker kind="institutions" value={form.tutelleInstitutionId} onChange={id => set('tutelleInstitutionId', id)} label="Choisir l’institution de tutelle" nullable excludeId={institutionId} disabled={busy} />
            </Field>
            {FICHE_GROUPS.map(group => <React.Fragment key={group.title}><h4 className="form-section span2">{group.title}</h4>
                {group.fields.map(f => <Field key={f.key} label={f.label} hint={f.hint} wide={f.kind === 'area'}>
                    {f.kind === 'area' ? <textarea rows={3} maxLength={10000} value={form[f.key]} disabled={busy} onChange={e => set(f.key, e.target.value)} />
                        : <input type={f.kind === 'tel' ? 'tel' : f.kind === 'email' ? 'email' : f.kind === 'url' ? 'url' : 'text'} value={form[f.key]} disabled={busy} maxLength={f.kind === 'url' ? 300 : f.kind === 'email' ? 200 : 60} onChange={e => set(f.key, e.target.value)} />}
                </Field>)}</React.Fragment>)}
        </div>
        {problems.length > 0 && <ul className="relation-problems" role="alert">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
        {error ? <ErrorNotice error={error} /> : null}
        <footer className="modal-footer"><button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Annuler</button><button className="btn primary" disabled={busy || problems.length > 0}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button></footer>
    </form></Modal>;
}
