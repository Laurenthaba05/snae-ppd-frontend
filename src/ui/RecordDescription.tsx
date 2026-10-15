import React, { useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { IntentKey, uuid } from '../core/validation';
import type { Dossier, RecordDocument } from '../core/types';
import { Busy, ErrorNotice, Field, Modal, Notice, useResource } from './components';

export const descriptionEditable = (record: Dossier | RecordDocument) =>
    !('destroyed' in record && record.destroyed) && record.businessStatus !== 'CLOS' && ['BROUILLON', 'ACTIF'].includes(record.archivalStatus);

export function RecordDescriptionButton({ kind, id, onChanged }: { kind: 'documents' | 'dossiers'; id: string; onChanged: () => void }) {
    const [open, setOpen] = useState(false);
    return <><button type="button" className="btn small secondary" onClick={() => setOpen(true)}>Modifier la description</button>
        {open && <RecordDescriptionDialog kind={kind} id={id} onClose={() => setOpen(false)} onChanged={onChanged} />}</>;
}
export function RecordDescriptionDialog({ kind, id, onClose, onChanged }: { kind: 'documents' | 'dossiers'; id: string; onClose: () => void; onChanged: () => void }) {
    const { records, epoch } = useSession();
    const q = useResource<RecordDocument | Dossier>(signal => kind === 'documents' ? records!.document(id, signal) : records!.dossier(id, signal), 'edit-description:' + kind + ':' + id + ':' + epoch);
    const [busy, setBusy] = useState(false);
    return <Modal title="Modifier la description" onClose={onClose} locked={busy}>
        {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : q.data && <DescriptionForm key={kind + ':' + id + ':' + q.data.versionLock} kind={kind} record={q.data} onClose={onClose} onChanged={onChanged} busy={busy} setBusy={setBusy} />}
    </Modal>;
}
function DescriptionForm({ kind, record, onClose, onChanged, busy, setBusy }: { kind: 'documents' | 'dossiers'; record: RecordDocument | Dossier; onClose: () => void; onChanged: () => void; busy: boolean; setBusy: (value: boolean) => void }) {
    const { records } = useSession();
    const [title, setTitle] = useState(record.title);
    const [description, setDescription] = useState(record.description ?? '');
    const [subject, setSubject] = useState((record as Dossier).subject ?? '');
    const [date, setDate] = useState((record as RecordDocument).documentDate ?? '');
    const [reason, setReason] = useState('');
    const [error, setError] = useState<unknown>(null);
    const pending = useRef(false);
    const intent = useRef(new IntentKey());
    const editable = descriptionEditable(record) && Number.isSafeInteger(record.versionLock) && record.versionLock! >= 0;
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!editable || pending.current || !title.trim() || !reason.trim()) return;
        pending.current = true; setBusy(true); setError(null);
        const path = '/' + kind + '/' + uuid(record.id) + '/description';
        const body = { expectedVersion: record.versionLock, title: title.trim(), description: description.trim() || null, reason: reason.trim(),
            ...(kind === 'documents' ? { documentDate: date || null } : { subject: subject.trim() || null }) };
        try { await records!.command(path, body, intent.current.forRequest('PUT', path, body), 'PUT'); onChanged(); onClose(); }
        catch (e) { setError(e); }
        finally { pending.current = false; setBusy(false); }
    };
    return <form onSubmit={submit}>
        {!editable && <Notice tone="warning">Cette notice est verrouillée ou sa version n’est pas disponible. La correction directe est désactivée.</Notice>}
        <fieldset disabled={busy || !editable} className="form-grid">
            <Field label="Titre" wide><input value={title} onChange={e => setTitle(e.target.value)} required maxLength={500} /></Field>
            {kind === 'dossiers' ? <Field label="Objet du dossier" wide><textarea value={subject} onChange={e => setSubject(e.target.value)} maxLength={5000} /></Field> : <Field label="Date du document"><input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>}
            <Field label="Description" wide><textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={5000} rows={5} /></Field>
            <Field label="Motif de la correction" wide><textarea value={reason} onChange={e => setReason(e.target.value)} required maxLength={2000} /></Field>
        </fieldset>
        {error ? <ErrorNotice error={error} /> : null}
        <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy || !editable || !title.trim() || !reason.trim()}>Enregistrer la description</button></footer>
    </form>;
}
