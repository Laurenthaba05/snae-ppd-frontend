import { ArchiveRecordPicker, actorLabel } from './ArchiveRecordPicker';
import { OptionalFields, useOptionalFields } from './OptionalFields';
import React, { useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { ActorLinkDialog, ActorLinkHistory, actorLinksEditable } from './ActorLinkActions';
import { IntentKey } from '../core/validation';
import { Badge, Busy, ErrorNotice, Empty, useResource, Modal, Field, Notice } from './components';
import { Icon } from './icons';
import { can } from '../core/policy';
import type { DocumentActor, RecordDocument } from '../core/types';


export function AttachActorDialog({ documentId, onClose, onSuccess }: {
    documentId: string;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const pending = useRef(false), actorIntent = useRef(new IntentKey()), attachmentIntent = useRef(new IntentKey());
    const createdActor = useRef<{ key: string; id: string } | null>(null);
    const extra = useOptionalFields('actorDetails');
    const { records } = useSession();
    const [mode, setMode] = useState<'existing' | 'new'>('existing');
    const [actorId, setActorId] = useState('');
    const [typeActeur, setTypeActeur] = useState('PERSONNE_PHYSIQUE');
    const [nom, setNom] = useState('');
    const [prenom, setPrenom] = useState('');
    const [raisonSociale, setRaisonSociale] = useState('');
    const [role, setRole] = useState('AUTEUR');
    const [order, setOrder] = useState('');
    const [comment, setComment] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (pending.current)
            return;
        pending.current = true;
        setBusy(true);
        setError(null);
        try {
            const details = mode === 'new' ? extra.payload() : {};
            if (details.birthDate && details.deathDate && String(details.deathDate) < String(details.birthDate)) throw new Error('La date de fin doit suivre la naissance ou création.');
            let resolvedActorId = actorId;
            if (mode === 'new') {
                if (!nom.trim() && !raisonSociale.trim())
                    throw new Error('Indiquez un nom ou une raison sociale.');
                const body = { ...details, type: typeActeur, name: nom.trim() || null, firstName: prenom.trim() || null, legalName: raisonSociale.trim() || null };
                const key = actorIntent.current.forRequest('POST', '/actors', body);
                if (createdActor.current?.key !== key) {
                    const created = await records!.command<{ id: string }>('/actors', body, key, 'POST');
                    createdActor.current = { key, id: created.id };
                }
                resolvedActorId = createdActor.current.id;
            }
            if (!resolvedActorId)
                throw new Error('Choisissez un acteur.');
            const path = '/documents/' + documentId + '/actors';
            const body = { actorId: resolvedActorId, role, order: order ? Number(order) : null, comment: comment.trim() || null };
            await records!.command(path, body, attachmentIntent.current.forRequest('POST', path, body), 'POST');
            onSuccess();
            onClose();
        }
        catch (err) {
            setError(err);
        }
        finally {
            pending.current = false;
            setBusy(false);
        }
    };
    return <Modal title="Attacher un acteur" subtitle="Personne ou organisme lié à ce document (auteur, producteur, signataire…)." onClose={onClose} locked={busy}><form onSubmit={submit}><div className="form-grid">
        <div className="tabs"><button type="button" className={mode === 'existing' ? 'active' : ''} onClick={() => setMode('existing')}>Acteur existant</button><button type="button" className={mode === 'new' ? 'active' : ''} onClick={() => setMode('new')}>Nouvel acteur</button></div>
        {mode === 'existing' ? <Field label="Acteur *" wide><ArchiveRecordPicker kind="actors" institution="" value={actorId || null} onChange={v => setActorId(v || '')} disabled={busy} required /></Field> : <><Field label="Type *"><select value={typeActeur} onChange={e => setTypeActeur(e.target.value)}><option value="PERSONNE_PHYSIQUE">Personne physique</option><option value="PERSONNE_MORALE">Personne morale</option><option value="SERVICE">Service</option></select></Field>
        <Field label="Nom" hint="Nom ou raison sociale requis."><input value={nom} onChange={e => setNom(e.target.value)} maxLength={255}/></Field>
        <Field label="Prénom"><input value={prenom} onChange={e => setPrenom(e.target.value)} maxLength={150}/></Field>
        <Field label="Raison sociale"><input value={raisonSociale} onChange={e => setRaisonSociale(e.target.value)} maxLength={255}/></Field><OptionalFields form={extra} disabled={busy} /></>}
        <Field label="Rôle *"><select value={role} onChange={e => setRole(e.target.value)}><option value="AUTEUR">Auteur</option><option value="PRODUCTEUR">Producteur</option><option value="SIGNATAIRE">Signataire</option><option value="DESTINATAIRE">Destinataire</option><option value="DONATEUR">Donateur</option><option value="DEPOSANT">Déposant</option><option value="DETENTEUR_ANTERIEUR">Détenteur antérieur</option><option value="CONTRIBUTEUR">Contributeur</option><option value="AUTRE">Autre</option></select></Field>
        <Field label="Ordre" hint="Optionnel."><input type="number" min={0} value={order} onChange={e => setOrder(e.target.value)}/></Field>
        <Field label="Commentaire" wide hint="Optionnel."><textarea value={comment} onChange={e => setComment(e.target.value)} maxLength={2000}/></Field>
        </div>{Boolean(error) && <ErrorNotice error={error}/>}<footer className="modal-footer"><button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>{busy ? <span className="spinner"/> : <Icon name="arrow" size={17}/>} Attacher</button></footer></form></Modal>;
}


export function ActorsPanel({ documentId, document }: { documentId: string; document: RecordDocument }) {
    const { me, records, epoch } = useSession();
    const q = useResource<DocumentActor[]>(s => records!.documentActors(documentId, s), 'document-actors:' + documentId + epoch);
    const [attach, setAttach] = useState(false);
    const [action, setAction] = useState<{ link: DocumentActor; mode: 'edit' | 'remove' } | null>(null);
    const [history, setHistory] = useState(false);
    const [revision, setRevision] = useState(0);
    const [done, setDone] = useState('');
    const editable = actorLinksEditable(document);
    const canManage = can(me, 'DOCUMENT_ACTOR_MANAGE', { institutionId: document.institutionId, departmentId: document.departmentId }) && editable;
    const changed = (message: string) => { q.refresh(); setRevision(n => n + 1); setDone(message); };
    return <section className="panel" aria-label="Acteurs du document"><div className="section-heading"><h3>Acteurs</h3>
        <div className="table-actions"><button type="button" className="btn small secondary" aria-expanded={history} onClick={() => setHistory(!history)}>Historique des rattachements</button>
        <button type="button" className="btn small secondary" onClick={() => { q.refresh(); setRevision(n => n + 1); }}>Actualiser les acteurs</button>
        {canManage && <button className="btn small secondary" onClick={() => setAttach(true)}>Attacher un acteur</button>}</div></div>
        {done && <Notice>{done}</Notice>}
        {!editable && <Notice>Ce document est clos, détruit ou verrouillé pour l’archivage : ses rattachements sont en lecture seule.</Notice>}
        {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh}/> : q.data!.length ? <div className="table-scroll"><table>
            <thead><tr><th>Acteur</th><th>Rôle</th><th>Ordre</th><th>Commentaire</th>{canManage && <th>Actions</th>}</tr></thead>
            <tbody>{q.data!.map(a => <tr key={a.id}><td>{a.actor ? actorLabel(a.actor) : 'Acteur non disponible'}{a.actor && <details><summary>Fiche de l’acteur</summary>
                {a.actor.externalId && <p>Identifiant externe : {a.actor.externalId}</p>}{a.actor.birthDate && <p>Naissance ou création : {a.actor.birthDate}</p>}
                {a.actor.deathDate && <p>Décès ou dissolution : {a.actor.deathDate}</p>}{a.actor.description && <p>{a.actor.description}</p>}</details>}</td>
                <td><Badge value={a.role}/></td><td>{a.order ?? '—'}</td><td style={{whiteSpace:'pre-wrap'}}>{a.comment ?? '—'}</td>
                {canManage && <td><div className="table-actions"><button type="button" className="btn small secondary" onClick={() => setAction({link:a,mode:'edit'})}>Modifier le rattachement</button>
                    <button type="button" className="btn small danger-outline" onClick={() => setAction({link:a,mode:'remove'})}>Retirer le rattachement</button></div></td>}
            </tr>)}</tbody></table></div> : <Empty title="Aucun acteur attaché" icon="users"/>}
        {attach && <AttachActorDialog documentId={documentId} onClose={() => setAttach(false)} onSuccess={() => changed('Acteur attaché. L’ajout est enregistré dans l’historique.')}/>}
        {action && <ActorLinkDialog documentId={documentId} link={action.link} mode={action.mode} onClose={() => setAction(null)}
            onSuccess={() => changed(action.mode === 'edit' ? 'Rattachement modifié. Les différences et le motif sont enregistrés dans l’historique.' : 'Rattachement retiré. La fiche de l’acteur est conservée et le retrait figure dans l’historique.')} />}
        {history && <ActorLinkHistory key={documentId + ':' + revision} documentId={documentId} />}
    </section>;
}
