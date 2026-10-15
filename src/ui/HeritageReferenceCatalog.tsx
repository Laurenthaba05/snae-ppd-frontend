import React, { useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { can } from '../core/policy';
import { IntentKey } from '../core/validation';
import type { HeritageReference } from '../core/types';
import { Busy, Empty, ErrorNotice, Field, Modal, useResource } from './components';

const domains: Record<HeritageReference['domaine'], string> = { CATEGORIE: 'Catégories de biens', CRITERE_VALEUR: 'Critères de valeur', ALTERATION: 'Altérations', CATEGORIE_LECTEUR: 'Catégories de lecteurs', MOTIF_SORTIE: 'Motifs de sortie' };
export function HeritageReferenceCatalog() {
    const { heritage, me, epoch } = useSession();
    const [domain, setDomain] = useState<HeritageReference['domaine']>('CATEGORIE');
    const q = useResource<HeritageReference[]>(signal => heritage!.references(domain, signal), 'heritage-reference-catalog:' + domain + ':' + epoch);
    const [editing, setEditing] = useState<HeritageReference | null>(null);
    const mayEdit = can(me, 'HERITAGE_CATALOG_MANAGE', {});
    return <section className="panel" aria-label="Référentiels administrables">
        <div className="section-heading"><h3>Référentiels administrables</h3><button type="button" className="btn small secondary" onClick={q.refresh} disabled={q.loading}>Actualiser les références</button></div>
        <Field label="Référentiel"><select value={domain} onChange={e => { setDomain(e.target.value as HeritageReference['domaine']); setEditing(null); }}>{Object.entries(domains).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></Field>
        {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : q.data?.length ? <div className="table-scroll"><table><thead><tr><th>Référence</th><th>Description</th><th>Ordre</th><th>État</th><th>Action</th></tr></thead><tbody>{q.data.map(row => <tr key={row.domaine + ':' + row.code}><td><strong>{row.libelle}</strong><small className="cell-sub">{row.code}</small></td><td>{row.description || '—'}</td><td>{row.ordre}</td><td>{row.actif ? 'Active' : 'Retirée'}</td><td>{mayEdit && <button type="button" className="btn small secondary" onClick={() => setEditing(row)}>Modifier {row.libelle}</button>}</td></tr>)}</tbody></table></div> : <Empty title="Aucune référence" />}
        {editing && mayEdit && <HeritageReferenceDialog reference={editing} onClose={() => setEditing(null)} onDone={q.refresh} />}
    </section>;
}
export function HeritageReferenceDialog({ reference, onClose, onDone }: { reference: HeritageReference; onClose: () => void; onDone: () => void }) {
    const { heritage } = useSession();
    const [label, setLabel] = useState(reference.libelle);
    const [description, setDescription] = useState(reference.description ?? '');
    const [order, setOrder] = useState(reference.ordre);
    const [active, setActive] = useState(reference.actif);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const pending = useRef(false);
    const intent = useRef(new IntentKey());
    const body = { ...(label.trim() !== reference.libelle ? { libelle: label.trim() } : {}), ...(description !== (reference.description ?? '') ? { description: description.trim() } : {}), ...(order !== reference.ordre ? { ordre: order } : {}), ...(active !== reference.actif ? { actif: active } : {}) };
    const ready = label.trim().length > 0 && Number.isInteger(order) && order >= 0 && order <= 10000 && Object.keys(body).length > 0;
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!ready || pending.current) return;
        pending.current = true; setBusy(true); setError(null);
        const path = '/references/' + encodeURIComponent(reference.domaine) + '/' + encodeURIComponent(reference.code);
        try { await heritage!.command(path, body, intent.current.forRequest('PUT', path, body), 'PUT'); onDone(); onClose(); }
        catch (e) { setError(e); }
        finally { pending.current = false; setBusy(false); }
    };
    return <Modal title="Modifier une référence" subtitle={domains[reference.domaine] + ' · ' + reference.code} onClose={onClose} locked={busy}>
        <form onSubmit={submit}><div className="form-grid">
            <Field label="Libellé" wide><input value={label} onChange={e => setLabel(e.target.value)} required maxLength={255} disabled={busy} /></Field>
            <Field label="Description" wide><textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={5000} disabled={busy} /></Field>
            <Field label="Ordre d’affichage"><input type="number" min={0} max={10000} step={1} value={Number.isFinite(order) ? order : ''} onChange={e => setOrder(e.target.value === '' ? Number.NaN : Number(e.target.value))} disabled={busy} /></Field>
            <label><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} disabled={busy} /> Référence active</label>
            <p className="span2">Une référence retirée reste lisible sur les fiches existantes. Seuls les champs modifiés seront envoyés.</p>
        </div>{error ? <ErrorNotice error={error} /> : null}
        <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy || !ready}>Enregistrer la référence</button></footer></form>
    </Modal>;
}
