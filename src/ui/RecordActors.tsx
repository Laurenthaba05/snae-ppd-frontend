import { OptionalFields, useOptionalFields } from './OptionalFields';
import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { useWorkspace } from './workspace';
import { Badge, Busy, ErrorNotice, Empty, useResource, Modal, Field } from './components';
import { Icon } from './icons';
import { can } from '../core/policy';
import type { Page, Actor, DocumentActor } from '../core/types';

function actorLabel(a: Actor): string {
    return a.legalName || [a.firstName, a.name].filter(Boolean).join(' ') || a.externalId || 'Acteur sans nom';
}

export function AttachActorDialog({ documentId, onClose, onSuccess }: {
    documentId: string;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const extra = useOptionalFields('actorDetails');
    const { records } = useSession();
    const existing = useResource<Page<Actor>>(s => records!.actors({ page: 0, size: 100 }, s), 'attach-actor-existing');
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
        if (busy)
            return;
        setBusy(true);
        setError(null);
        try {
            const details = mode === 'new' ? extra.payload() : {};
            if (details.birthDate && details.deathDate && String(details.deathDate) < String(details.birthDate)) throw new Error('La date de fin doit suivre la naissance ou création.');
            let resolvedActorId = actorId;
            if (mode === 'new') {
                if (!nom.trim() && !raisonSociale.trim())
                    throw new Error('Indiquez un nom ou une raison sociale.');
                const created = await records!.command<{
                    id: string;
                }>('/actors', { ...details, type: typeActeur, name: nom.trim() || null, firstName: prenom.trim() || null, legalName: raisonSociale.trim() || null }, crypto.randomUUID(), 'POST');
                resolvedActorId = created.id;
            }
            if (!resolvedActorId)
                throw new Error('Choisissez un acteur.');
            await records!.command('/documents/' + documentId + '/actors', { actorId: resolvedActorId, role, order: order ? Number(order) : null, comment: comment.trim() || null }, crypto.randomUUID(), 'POST');
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
    return <Modal title="Attacher un acteur" subtitle="Personne ou organisme lié à ce document (auteur, producteur, signataire…)." onClose={onClose} locked={busy}><form onSubmit={submit}><div className="form-grid">
        <div className="tabs"><button type="button" className={mode === 'existing' ? 'active' : ''} onClick={() => setMode('existing')}>Acteur existant</button><button type="button" className={mode === 'new' ? 'active' : ''} onClick={() => setMode('new')}>Nouvel acteur</button></div>
        {mode === 'existing' ? <Field label="Acteur *" wide><select value={actorId} onChange={e => setActorId(e.target.value)} required disabled={existing.loading}><option value="">{existing.loading ? 'Chargement…' : 'Choisir un acteur'}</option>{existing.data?.items.map(a => <option key={a.id} value={a.id}>{actorLabel(a)}</option>)}</select>{!existing.loading && !existing.data?.items.length && <small>Aucun acteur enregistré pour l’instant — utilisez « Nouvel acteur ».</small>}</Field> : <><Field label="Type *"><select value={typeActeur} onChange={e => setTypeActeur(e.target.value)}><option value="PERSONNE_PHYSIQUE">Personne physique</option><option value="PERSONNE_MORALE">Personne morale</option><option value="SERVICE">Service</option></select></Field>
        <Field label="Nom" hint="Nom ou raison sociale requis."><input value={nom} onChange={e => setNom(e.target.value)} maxLength={255}/></Field>
        <Field label="Prénom"><input value={prenom} onChange={e => setPrenom(e.target.value)} maxLength={150}/></Field>
        <Field label="Raison sociale"><input value={raisonSociale} onChange={e => setRaisonSociale(e.target.value)} maxLength={255}/></Field><OptionalFields form={extra} disabled={busy} /></>}
        <Field label="Rôle *"><select value={role} onChange={e => setRole(e.target.value)}><option value="AUTEUR">Auteur</option><option value="PRODUCTEUR">Producteur</option><option value="SIGNATAIRE">Signataire</option><option value="DESTINATAIRE">Destinataire</option><option value="DONATEUR">Donateur</option><option value="DEPOSANT">Déposant</option><option value="DETENTEUR_ANTERIEUR">Détenteur antérieur</option><option value="CONTRIBUTEUR">Contributeur</option><option value="AUTRE">Autre</option></select></Field>
        <Field label="Ordre" hint="Optionnel."><input type="number" min={0} value={order} onChange={e => setOrder(e.target.value)}/></Field>
        <Field label="Commentaire" wide hint="Optionnel."><textarea value={comment} onChange={e => setComment(e.target.value)} maxLength={2000}/></Field>
        </div>{Boolean(error) && <ErrorNotice error={error}/>}<footer className="modal-footer"><button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>{busy ? <span className="spinner"/> : <Icon name="arrow" size={17}/>} Attacher</button></footer></form></Modal>;
}

export function ActorsPanel({ documentId }: {
    documentId: string;
}) {
    const { me, records, epoch } = useSession();
    const { scope } = useWorkspace();
    const q = useResource<DocumentActor[]>(s => records!.documentActors(documentId, s), 'document-actors:' + documentId + epoch);
    const actorsLookup = useResource<Page<Actor>>(s => records!.actors({ page: 0, size: 100 }, s), 'actors-lookup:' + epoch);
    const [attach, setAttach] = useState(false);
    const canAttach = can(me, 'DOCUMENT_ACTOR_MANAGE', scope);
    const label = (actorId: string) => { const a = actorsLookup.data?.items.find(x => x.id === actorId); return a ? actorLabel(a) : 'Acteur non disponible'; };
    return <section className="panel"><div className="section-heading"><h3>Acteurs</h3>{canAttach && <button className="btn small secondary" onClick={() => setAttach(true)}>Attacher un acteur</button>}</div>
        {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh}/> : q.data!.length ? <div className="table-scroll"><table><thead><tr><th>Acteur</th><th>Rôle</th><th>Ordre</th><th>Commentaire</th></tr></thead><tbody>{q.data!.map(a => <tr key={a.id}><td>{label(a.actorId)}{(() => { const actor = actorsLookup.data?.items.find(x => x.id === a.actorId); return actor && <details><summary>Fiche de l’acteur</summary>{actor.externalId && <p>Identifiant externe : {actor.externalId}</p>}{actor.birthDate && <p>Naissance ou création : {actor.birthDate}</p>}{actor.deathDate && <p>Décès ou dissolution : {actor.deathDate}</p>}{actor.description && <p>{actor.description}</p>}</details>; })()}</td><td><Badge value={a.role}/></td><td>{a.order ?? '—'}</td><td>{a.comment ?? '—'}</td></tr>)}</tbody></table></div> : <Empty title="Aucun acteur attaché" icon="users"/>}
        {attach && <AttachActorDialog documentId={documentId} onClose={() => setAttach(false)} onSuccess={q.refresh}/>}
    </section>;
}
