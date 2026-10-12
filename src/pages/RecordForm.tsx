import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { useWorkspace } from '../ui/workspace';
import { CommandDialog } from '../ui/CommandDialog';
import { Field, useResource, Modal, ErrorNotice } from '../ui/components';
import { Icon } from '../ui/icons';
import { ReferencePicker } from '../ui/ReferencePicker';
import { text, uuid } from '../core/validation';
import { can, platform } from '../core/policy';
import type { RecordCatalog, DocumentType, Dossier } from '../core/types';
const id = (x: string) => x.trim() ? uuid(x.trim()) : null;
function CreateDocumentTypeDialog({ onClose, onCreated }: {
    onClose: () => void;
    onCreated: (type: DocumentType) => void;
}) {
    const { records } = useSession();
    const [code, setCode] = useState('');
    const [label, setLabel] = useState('');
    const [family, setFamily] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy)
            return;
        setBusy(true);
        setError(null);
        try {
            const type = await records!.createDocumentType(code.trim(), label.trim(), family.trim() || null, null, crypto.randomUUID());
            onCreated(type);
            onClose();
        }
        catch (err) {
            setError(err);
        }
        finally {
            setBusy(false);
        }
    };
    return <Modal title="Créer un type de document" onClose={onClose} locked={busy}><form onSubmit={submit}><div className="form-grid">
        <Field label="Code *"><input value={code} onChange={e => setCode(e.target.value)} required maxLength={100} disabled={busy}/></Field>
        <Field label="Libellé *" wide><input value={label} onChange={e => setLabel(e.target.value)} required maxLength={255} disabled={busy}/></Field>
        <Field label="Famille" hint="Optionnelle."><input value={family} onChange={e => setFamily(e.target.value)} maxLength={100} disabled={busy}/></Field>
        </div>{Boolean(error) && <ErrorNotice error={error}/>}<footer className="modal-footer"><button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>{busy ? <span className="spinner"/> : <Icon name="arrow" size={17}/>} Créer</button></footer></form></Modal>;
}
export function RecordForm({ kind, parent, onClose, onCreated }: {
    kind: RecordCatalog;
    /** Pour un sous-dossier : le dossier parent. L'institution, le service et la confidentialité minimale en découlent. */
    parent?: Dossier;
    onClose: () => void;
    onCreated: (data: {
        id: string;
    }, file: File | null) => void;
}) {
    const { me, records } = useSession();
    const { scope } = useWorkspace();
    const central = platform(me);
    const [creatingType, setCreatingType] = useState(false);
    const [reference, setReference] = useState('');
    const [title, setTitle] = useState('');
    const [institutionId, setInstitutionId] = useState(parent?.institutionId ?? scope.institutionId ?? '');
    const [departmentId, setDepartmentId] = useState(parent ? parent.departmentId ?? '' : scope.departmentId ?? '');
    const [confidentiality, setConfidentiality] = useState<string>(parent?.confidentiality ?? 'INTERNE');
    const tiers = ['PUBLIC', 'INTERNE', 'CONFIDENTIEL', 'SECRET'];
    const belowParent = (tier: string) => !!parent && tiers.indexOf(tier) < tiers.indexOf(parent.confidentiality);
    const [description, setDescription] = useState('');
    const [subject, setSubject] = useState('');
    const [typeDocumentId, setTypeDocumentId] = useState('');
    const [dossierId, setDossierId] = useState('');
    const [origin, setOrigin] = useState('CREE');
    const [documentDate, setDocumentDate] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const types = useResource(s => kind === 'documents' ? records!.documentTypes(s) : Promise.resolve([]), 'record-form-types:' + kind);
    const dossiers = useResource(s => kind === 'documents' && institutionId ? records!.dossiers({ institutionId, size: 100 }, s) : Promise.resolve({ items: [], page: 0, size: 100, hasMore: false }), 'record-form-dossiers:' + institutionId);
    const build = () => {
        const common = { reference: text(reference, 150)!, institutionId: uuid(institutionId), departmentId: id(departmentId), title: text(title, 500)!, description: text(description, 5000, false), confidentiality };
        if (kind === 'dossiers')
            return { ...common, subject: text(subject, 5000, false), parentId: parent?.id ?? null };
        return { ...common, typeDocumentId: uuid(typeDocumentId), dossierId: id(dossierId), origin, documentDate: documentDate || null };
    };
    return <>
        <CommandDialog title={kind === 'documents' ? 'Créer un document' : parent ? 'Créer un sous-dossier' : 'Créer un dossier'} description="Création dans le périmètre autorisé, sans droit implicite." path={'/' + kind} method="POST" api={records!} build={build} onClose={onClose} onSuccess={data => onCreated(data, file)}>
        {parent && <p className="span2"><small>Sous-dossier de <strong>{parent.reference} · {parent.title}</strong> : il reste dans la même institution et le même service, et n’est jamais moins confidentiel que lui.</small></p>}
        <Field label="Cote ou référence *"><input value={reference} onChange={e => setReference(e.target.value)} required maxLength={150}/></Field>
        <Field label="Titre *" wide><input value={title} onChange={e => setTitle(e.target.value)} required maxLength={500}/></Field>
        <Field label="Institution *"><ReferencePicker kind="institutions" label="Sélectionner une institution" value={institutionId} disabled={!!parent} onChange={v => { setInstitutionId(v); setDepartmentId(''); }} scope={central ? {} : { institutionId: me!.user.institutionId }}/></Field>
        <Field label="Département" hint="Optionnel."><ReferencePicker kind="departments" label="Sélectionner un département" value={departmentId} disabled={!!parent} onChange={setDepartmentId} scope={{ institutionId }} nullable/></Field>
        {kind === 'documents' && <Field label="Type de document *"><div className="input-icon"><select value={typeDocumentId} onChange={e => setTypeDocumentId(e.target.value)} required disabled={types.loading}><option value="">{types.loading ? 'Chargement…' : 'Choisir un type'}</option>{types.data?.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select>{can(me, 'TYPE_DOCUMENT_MANAGE', {}) && <button type="button" className="icon-btn" aria-label="Créer un type de document" onClick={() => setCreatingType(true)}><Icon name="plus" size={16}/></button>}</div></Field>}
        {kind === 'documents' && <Field label="Dossier" hint="Optionnel, limité aux dossiers de l’institution choisie."><select value={dossierId} onChange={e => setDossierId(e.target.value)} disabled={!institutionId || dossiers.loading}><option value="">Aucun</option>{dossiers.data?.items.map(d => <option key={d.id} value={d.id}>{d.title} ({d.reference})</option>)}</select></Field>}
        {kind === 'documents' && <Field label="Origine"><select value={origin} onChange={e => setOrigin(e.target.value)}><option value="CREE">Créé</option><option value="RECU">Reçu</option><option value="IMPORTE">Importé</option><option value="NUMERISE">Numérisé</option><option value="VERSE">Versé</option></select></Field>}
        {kind === 'documents' && <Field label="Date du document" hint="Optionnelle."><input type="date" value={documentDate} onChange={e => setDocumentDate(e.target.value)}/></Field>}
        {kind === 'documents' && <Field label="Fichier" wide hint={file ? 'Sélectionné : ' + file.name + ' — téléversé sur la version 1 juste après la création.' : 'Optionnel. Vous pourrez aussi le téléverser plus tard depuis la fiche du document.'}><input type="file" onChange={e => setFile(e.target.files?.[0] ?? null)}/></Field>}
        <Field label="Confidentialité"><select value={confidentiality} onChange={e => setConfidentiality(e.target.value)}><option value="PUBLIC" disabled={belowParent('PUBLIC')}>Public</option><option value="INTERNE" disabled={belowParent('INTERNE')}>Interne</option><option value="CONFIDENTIEL" disabled={belowParent('CONFIDENTIEL')}>Confidentiel</option><option value="SECRET" disabled={belowParent('SECRET')}>Secret</option></select></Field>
        {kind === 'dossiers' && <Field label="Objet" wide hint="Optionnel."><textarea value={subject} onChange={e => setSubject(e.target.value)} maxLength={5000}/></Field>}
        <Field label="Description" wide hint="Optionnelle."><textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={5000}/></Field>
        </CommandDialog>
        {creatingType && <CreateDocumentTypeDialog onClose={() => setCreatingType(false)} onCreated={t => { types.refresh(); setTypeDocumentId(t.id); }}/>}
    </>;
}
