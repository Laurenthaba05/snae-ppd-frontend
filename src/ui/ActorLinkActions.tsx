import React, { useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { IntentKey, uuid } from '../core/validation';
import type { ActorRole, DocumentActor, DocumentActorHistoryEntry, Page, RecordDocument } from '../core/types';
import { ArchiveRecordPicker, actorLabel } from './ArchiveRecordPicker';
import { Busy, Empty, ErrorNotice, Field, Modal, Notice, Pagination, formatDate, useResource } from './components';

const roles: Record<ActorRole, string> = { AUTEUR: 'Auteur', PRODUCTEUR: 'Producteur', SIGNATAIRE: 'Signataire', DESTINATAIRE: 'Destinataire',
    DONATEUR: 'Donateur', DEPOSANT: 'Déposant', DETENTEUR_ANTERIEUR: 'Détenteur antérieur', CONTRIBUTEUR: 'Contributeur', AUTRE: 'Autre' };
export const actorLinksEditable = (record: RecordDocument) => !record.destroyed && record.businessStatus !== 'CLOS'
    && !['DETRUIT', 'ARCHIVE_DEFINITIVE', 'ELIMINATION_APPROUVEE'].includes(record.archivalStatus);
const valueText = (v: unknown) => v === null || v === undefined || v === '' ? '—' : String(v);

export function ActorLinkDialog({ documentId, link, mode, onClose, onSuccess }: {
    documentId: string; link: DocumentActor; mode: 'edit' | 'remove'; onClose: () => void; onSuccess: () => void;
}) {
    const { records } = useSession();
    const [actorId, setActorId] = useState(link.actorId);
    const [role, setRole] = useState<ActorRole>(link.role);
    const [order, setOrder] = useState(link.order === null ? '' : String(link.order));
    const [comment, setComment] = useState(link.comment ?? '');
    const [reason, setReason] = useState('');
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>();
    const lock = useRef(false), intent = useRef(new IntentKey());
    const removing = mode === 'remove';
    const actorQ = useResource(s => removing || actorId === link.actorId && link.actor
        ? Promise.resolve(link.actor ?? null) : actorId ? records!.actor(actorId, s) : Promise.resolve(null), 'actor-link-choice:' + actorId);
    const selected = actorQ.data?.id === actorId ? actorQ.data : null;
    const previousName = link.actor ? actorLabel(link.actor) : 'Acteur non disponible';
    const changed = actorId !== link.actorId || role !== link.role || (order === '' ? null : Number(order)) !== link.order || (comment.trim() || null) !== link.comment;
    const validOrder = order === '' || /^\d+$/.test(order) && Number.isSafeInteger(Number(order)) && Number(order) <= 2147483647;
    const validVersion = Number.isSafeInteger(link.version) && link.version >= 0;
    const valid = validVersion && reason.trim().length > 0 && (removing || Boolean(selected) && validOrder && changed);
    const changes = [
        ['Acteur', previousName, selected ? actorLabel(selected) : '—'],
        ['Rôle', roles[link.role], roles[role]],
        ['Ordre', valueText(link.order), valueText(order)],
        ['Commentaire', valueText(link.comment), valueText(comment.trim())]
    ].filter(([label, before, after]) => removing || before !== after || label === 'Acteur' && actorId !== link.actorId);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (lock.current || !valid) return;
        if (!confirming) { setConfirming(true); return; }
        lock.current = true; setBusy(true); setError(undefined);
        const path = '/documents/' + uuid(documentId) + '/actors/' + uuid(link.id) + (removing ? '/remove' : '');
        const method = removing ? 'POST' : 'PUT';
        const body = { expectedVersion: link.version, reason: reason.trim(),
            ...(!removing ? { actorId, role, order: order === '' ? null : Number(order), comment: comment.trim() || null } : {}) };
        try { await records!.command(path, body, intent.current.forRequest(method, path, body), method); onSuccess(); onClose(); }
        catch (e) { setError(e); }
        finally { lock.current = false; setBusy(false); }
    };
    return <Modal title={removing ? 'Retirer le rattachement' : 'Modifier le rattachement'} subtitle={previousName} onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            {!validVersion && <Notice tone="warning">La version du rattachement manque. Actualisez la liste avant de continuer.</Notice>}
            {!confirming ? <>
                <fieldset disabled={busy} className="form-grid">
                    {removing ? <div className="span2"><p>Le rattachement de <strong>{previousName}</strong> comme <strong>{roles[link.role]}</strong> sera retiré de ce document.</p>
                        <p>La fiche de l’acteur et ses autres rattachements seront conservés. L’opération restera dans l’historique.</p></div> : <>
                        <Field label="Acteur *" wide><ArchiveRecordPicker kind="actors" institution="" value={actorId || null} onChange={id => setActorId(id || '')} required disabled={busy} /></Field>
                        {actorQ.error ? <ErrorNotice error={actorQ.error} onRetry={actorQ.refresh} /> : null}
                        <Field label="Rôle *"><select value={role} onChange={e => setRole(e.target.value as ActorRole)}>{Object.entries(roles).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                        <Field label="Ordre" hint="Entier positif ou nul ; vide pour effacer."><input type="number" min={0} max={2147483647} step={1} value={order} onChange={e => setOrder(e.target.value)} /></Field>
                        <Field label="Commentaire" wide hint="Laissez vide pour effacer le commentaire."><textarea maxLength={2000} rows={3} value={comment} onChange={e => setComment(e.target.value)} /></Field>
                    </>}
                    <Field label={removing ? 'Motif du retrait *' : 'Motif de la modification *'} wide><textarea required maxLength={2000} rows={3} value={reason} onChange={e => setReason(e.target.value)} /></Field>
                </fieldset>
                {!removing && !validOrder && <Notice tone="warning">L’ordre doit être un entier entre 0 et 2 147 483 647.</Notice>}
                {!removing && !changed && <p>Aucune modification du rattachement.</p>}
            </> : <section aria-label="Vérification avant confirmation">
                <h3>{removing ? 'Confirmer le retrait' : 'Vérifier les différences'}</h3>
                <div className="table-scroll"><table><thead><tr><th>Champ</th><th>Avant</th><th>Après</th></tr></thead>
                    <tbody>{changes.map(([label,before,after]) => <tr key={label}><th scope="row">{label}</th><td style={{whiteSpace:'pre-wrap'}}>{before}</td><td style={{whiteSpace:'pre-wrap'}}>{removing ? 'Rattachement retiré' : after}</td></tr>)}</tbody></table></div>
                <p><strong>Motif : </strong>{reason.trim()}</p>
                {removing && <Notice>La fiche de l’acteur est conservée. Le retrait et ses valeurs précédentes seront consultables dans l’historique.</Notice>}
            </section>}
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer">
                <button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Annuler</button>
                {confirming && <button type="button" className="btn secondary" disabled={busy} onClick={() => { setConfirming(false); setError(undefined); }}>Revenir à la saisie</button>}
                <button type="submit" className={'btn ' + (removing && confirming ? 'danger' : 'primary')} disabled={busy || !valid}>
                    {busy ? 'Enregistrement…' : confirming ? removing ? 'Confirmer le retrait' : 'Confirmer la modification' : 'Vérifier avant confirmation'}
                </button>
            </footer>
        </form>
    </Modal>;
}

const historyActions: Record<string,string> = { DOCUMENT_ACTOR_ATTACH: 'Ajout', DOCUMENT_ACTOR_UPDATE: 'Modification', DOCUMENT_ACTOR_DETACH: 'Retrait' };
function HistoryValues({ entry }: { entry: DocumentActorHistoryEntry }) {
    const rows: Array<[string, string]> = [['actorLabel','Acteur'],['role','Rôle'],['order','Ordre'],['comment','Commentaire']];
    const text = (snapshot: DocumentActorHistoryEntry['before'], key: string) => {
        if (!snapshot) return '—';
        if (snapshot.removed) return 'Rattachement retiré';
        if (!(key in snapshot)) return 'Non consigné';
        return key === 'role' && snapshot.role ? roles[snapshot.role as ActorRole] ?? String(snapshot.role) : valueText(snapshot[key]);
    };
    return <><p><strong>Motif : </strong>{entry.after?.reason ? String(entry.after.reason) : 'Non consigné pour cet événement'}</p>
        <div className="table-scroll"><table><thead><tr><th>Champ</th><th>Avant</th><th>Après</th></tr></thead><tbody>
            {rows.map(([key,label]) => <tr key={key}><th scope="row">{label}</th><td style={{whiteSpace:'pre-wrap'}}>{text(entry.before,key)}</td><td style={{whiteSpace:'pre-wrap'}}>{text(entry.after,key)}</td></tr>)}
        </tbody></table></div></>;
}
export function ActorLinkHistory({ documentId }: { documentId: string }) {
    const { records, epoch } = useSession();
    const [page, setPage] = useState(0);
    const q = useResource<Page<DocumentActorHistoryEntry>>(s => records!.actorHistory(documentId, page, s), 'actor-history:' + documentId + ':' + page + ':' + epoch);
    return <section aria-label="Historique des rattachements" className="panel-padding"><h4>Historique des rattachements</h4>
        <p>Ajouts, modifications et retraits, du plus récent au plus ancien. Les valeurs non enregistrées dans les anciens événements sont indiquées « Non consigné ».</p>
        {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : q.data && <>
            {q.data.items.length ? q.data.items.map(entry => <details key={entry.id} className="panel-padding">
                <summary>{historyActions[entry.action] ?? entry.action} · {formatDate(entry.occurredAt)} · {entry.performedBy}</summary>
                <HistoryValues entry={entry} />
            </details>) : <Empty title="Aucun événement de rattachement" />}
            <Pagination page={page} hasMore={q.data.hasMore} count={q.data.items.length} onChange={setPage} />
        </>}
    </section>;
}

