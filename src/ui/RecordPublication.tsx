import { ResourceDetailsButton } from './ResourceDetails';
import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { useWorkspace } from './workspace';
import { Badge, Busy, ErrorNotice, Empty, useResource, formatDate, Modal, Field } from './components';
import { Icon } from './icons';
import { can } from '../core/policy';
import type { Licence, Publication } from '../core/types';
import { useDocumentFiles } from './RecordFiles';

function CreateLicenceDialog({ onClose, onSuccess }: {
    onClose: () => void;
    onSuccess: (licence: Licence) => void;
}) {
    const { publication } = useSession();
    const [code, setCode] = useState('');
    const [libelle, setLibelle] = useState('');
    const [uri, setUri] = useState('');
    const [description, setDescription] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy)
            return;
        setBusy(true);
        setError(null);
        try {
            const licence = await publication!.command<Licence>('/licences', { code, libelle, uri: uri.trim() || null, description: description.trim() || null }, crypto.randomUUID(), 'POST');
            onSuccess(licence);
            onClose();
        }
        catch (err) {
            setError(err);
        }
        finally {
            setBusy(false);
        }
    };
    return <Modal title="Créer une licence" onClose={onClose} locked={busy}><form onSubmit={submit}><div className="form-grid">
        <Field label="Code *"><input value={code} onChange={e => setCode(e.target.value)} required maxLength={100} placeholder="CC-BY-4.0"/></Field>
        <Field label="Intitulé *"><input value={libelle} onChange={e => setLibelle(e.target.value)} required maxLength={255}/></Field>
        <Field label="URL" hint="Optionnelle."><input value={uri} onChange={e => setUri(e.target.value)} maxLength={2000}/></Field>
        <Field label="Description" wide hint="Optionnelle."><textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={4000}/></Field>
        </div>{Boolean(error) && <ErrorNotice error={error}/>}<footer className="modal-footer"><button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>{busy ? <span className="spinner"/> : <Icon name="arrow" size={17}/>} Créer</button></footer></form></Modal>;
}

function PublishDialog({ documentId, onClose, onSuccess }: {
    documentId: string;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const { publication } = useSession();
    const { files, loading: filesLoading } = useDocumentFiles(documentId);
    const licences = useResource<Licence[]>(s => publication!.licences(s), 'licences-lookup');
    const [fichierId, setFichierId] = useState('');
    const [visibilite, setVisibilite] = useState('PUBLIC');
    const [canal, setCanal] = useState('PORTAIL');
    const [licenceId, setLicenceId] = useState('');
    const [createLicence, setCreateLicence] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy)
            return;
        setBusy(true);
        setError(null);
        try {
            await publication!.command('/documents/' + documentId + '/publications', { fichierId, visibilite, canal, licenceId: licenceId || null }, crypto.randomUUID(), 'POST');
            onSuccess();
            onClose();
        }
        catch (err) {
            setError(err);
        }
        finally {
            setBusy(false);
        }
    };
    return <Modal title="Publier un fichier" subtitle="Enregistre une publication selon le canal choisi. Aucun portail public anonyme n’est fourni par ce contrat." onClose={onClose} locked={busy}><form onSubmit={submit}><div className="form-grid">
        <Field label="Fichier *" wide><select value={fichierId} onChange={e => setFichierId(e.target.value)} required disabled={filesLoading}><option value="">{filesLoading ? 'Chargement…' : 'Choisir un fichier'}</option>{files.map(f => <option key={f.id} value={f.id}>v{f.versionNumber} — {f.originalFilename}</option>)}</select>{!filesLoading && !files.length && <small>Aucun fichier téléversé sur ce document.</small>}</Field>
        <Field label="Visibilité *"><select value={visibilite} onChange={e => setVisibilite(e.target.value)}><option value="PUBLIC">Public</option><option value="RESTREINT">Restreint</option><option value="INTERNE">Interne</option></select></Field>
        <Field label="Canal *"><input value={canal} onChange={e => setCanal(e.target.value)} required maxLength={50}/></Field>
        <Field label="Licence" wide hint="Optionnelle."><div className="input-icon"><select value={licenceId} onChange={e => setLicenceId(e.target.value)} disabled={licences.loading}><option value="">Aucune</option>{licences.data?.map(l => <option key={l.id} value={l.id}>{l.libelle}</option>)}</select><button type="button" className="icon-btn" aria-label="Créer une licence" onClick={() => setCreateLicence(true)}><Icon name="plus" size={16}/></button></div></Field>
        </div>{Boolean(error) && <ErrorNotice error={error}/>}<footer className="modal-footer"><button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Annuler</button><button type="submit" className="btn primary" disabled={busy || !files.length}>{busy ? <span className="spinner"/> : <Icon name="arrow" size={17}/>} Publier</button></footer></form>
        {licenceId && <ResourceDetailsButton resource="licence" id={licenceId} label="Lire la licence" />}
        {createLicence && <CreateLicenceDialog onClose={() => setCreateLicence(false)} onSuccess={l => { licences.refresh(); setLicenceId(l.id); }}/>}
    </Modal>;
}

export function PublicationPanel({ documentId }: {
    documentId: string;
}) {
    const { me, publication, epoch } = useSession();
    const { scope } = useWorkspace();
    const q = useResource<Publication[]>(s => publication!.documentPublications(documentId, s), 'document-publications:' + documentId + epoch);
    const [publish, setPublish] = useState(false);
    const [busy, setBusy] = useState(false);
    const [actionError,setActionError]=useState<unknown>(null);
    const canManage = can(me, 'PUBLICATION_MANAGE', scope);
    const withdraw = async (id: string) => {
        if(busy) return;
        setBusy(true); setActionError(null);
        try {
            await publication!.command('/publications/' + id + '/withdraw', {}, crypto.randomUUID(), 'POST');
            q.refresh();
        }
        catch(error) { setActionError(error); }
        finally {
            setBusy(false);
        }
    };
    const publications = q.data ?? [];
    return <section className="panel"><div className="section-heading"><h3>Publication</h3>{canManage && <button className="btn small secondary" onClick={() => setPublish(true)}>Publier un fichier</button>}</div>
        {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh}/> : publications.length ? <div className="table-scroll"><table><thead><tr><th>Statut</th><th>Visibilité</th><th>Canal</th><th>Publiée le</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{publications.map(p => <tr key={p.id}><td><Badge value={p.statut}/><ResourceDetailsButton resource="publication" id={p.id} /></td><td><Badge value={p.visibilite}/></td><td>{p.canal}</td><td>{formatDate(p.datePublication)}</td><td>{p.statut === 'PUBLIEE' && canManage && <button className="btn small danger-outline" onClick={() => withdraw(p.id)} disabled={busy}>Retirer</button>}</td></tr>)}</tbody></table></div> : <Empty title="Aucune publication" icon="check"/>}
        {Boolean(actionError)&&<ErrorNotice error={actionError}/>}
        {publish && <PublishDialog documentId={documentId} onClose={() => setPublish(false)} onSuccess={q.refresh}/>}
    </section>;
}
