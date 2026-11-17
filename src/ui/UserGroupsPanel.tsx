import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { Badge, Busy, Empty, ErrorNotice, Field, Pagination, useResource } from './components';
import { CommandDialog } from './CommandDialog';
import { EntityName } from './names';
import { can, platform } from '../core/policy';
import { addMemberCommand, groupScope, removeMemberCommand } from '../core/userGroups';
import type { UserGroup } from '../core/userGroups';
import type { User } from '../core/types';

/** Ranger un compte dans un autre groupe : un groupe actif de son institution (ou un groupe national pour un compte national) où il n'est pas encore. */
export function AddToGroupDialog({ user, current, onClose, onSuccess }: { user: Pick<User, 'id' | 'institutionId'>; current: UserGroup[]; onClose: () => void; onSuccess: () => void }) {
    const { api, epoch } = useSession();
    const [groupId, setGroupId] = useState('');
    const [motif, setMotif] = useState('');
    const q = useResource(signal => api!.allGroups(user.institutionId ?? undefined, signal), 'add-to-group:' + user.id + epoch);
    const candidates = (q.data ?? []).filter(g => g.status === 'ACTIF' && g.institutionId === (user.institutionId ?? null) && !current.some(c => c.id === g.id));
    return <CommandDialog title="Ajouter à un groupe" description="Le groupe range le compte ; il n’accorde aucun droit. Les rôles s’attribuent à part." path={'/groups/' + groupId + '/members'}
        build={() => { if (!groupId) throw new Error('Choisissez un groupe.'); return addMemberCommand(user.id, { motif }); }} onClose={onClose} onSuccess={onSuccess}>
        {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : <>
            <Field label="Groupe *" wide>
                <select value={groupId} onChange={ev => setGroupId(ev.target.value)} required>
                    <option value="">Choisir un groupe</option>
                    {candidates.map(g => <option key={g.id} value={g.id}>{g.nom}</option>)}
                </select>
                {!candidates.length && <small>Aucun autre groupe disponible pour ce compte.</small>}
            </Field>
            <Field label="Motif *" wide><textarea required maxLength={2000} value={motif} onChange={ev => setMotif(ev.target.value)} /></Field>
        </>}
    </CommandDialog>;
}

/** Sortir un compte d'un groupe ; le serveur refuse de le laisser sans aucun groupe. */
export function RemoveFromGroupDialog({ userId, group, onClose, onSuccess }: { userId: string; group: UserGroup; onClose: () => void; onSuccess: () => void }) {
    const [reason, setReason] = useState('');
    return <CommandDialog title="Retirer du groupe" description="Un compte appartient toujours à au moins un groupe : ajoutez-le d’abord à un autre groupe." path={'/groups/' + group.id + '/members/' + userId + '/remove'}
        build={() => removeMemberCommand({ reason })} onClose={onClose} onSuccess={onSuccess} label="Retirer" danger>
        <Field label="Groupe" wide><input value={group.nom} readOnly disabled /></Field>
        <Field label="Motif *" wide><textarea required maxLength={2000} value={reason} onChange={ev => setReason(ev.target.value)} /></Field>
    </CommandDialog>;
}

/** Les groupes d'un compte sur sa fiche : à quels groupes il appartient, et de quoi l'en sortir ou l'ajouter à un autre. */
export function UserGroupsPanel({ user }: { user: User }) {
    const { api, me, epoch } = useSession();
    const [adding, setAdding] = useState(false);
    const [removing, setRemoving] = useState<UserGroup | null>(null);
    const [page, setPage] = useState(0);
    const q = useResource(signal => api!.allUserGroups(user.id, signal), 'user-groups:' + user.id + epoch);
    if (user.accountType !== 'USER') return null;   // un compte technique n'est dans aucun groupe
    const central = platform(me);
    const mayManage = user.institutionId ? can(me, 'IAM_USER_MANAGE', { institutionId: user.institutionId, departmentId: user.departmentId }) : central;
    const items = q.data ?? [];
    const currentPage = Math.min(page, Math.max(0, Math.ceil(items.length / 100) - 1));
    const shown = items.slice(currentPage * 100, (currentPage + 1) * 100);
    return <section className="panel">
        <div className="section-heading">
            <h3>Groupes</h3>
            {mayManage && <button type="button" className="btn small secondary" onClick={() => setAdding(true)}>Ajouter à un groupe</button>}
        </div>
        {q.loading && !q.data ? <Busy /> : q.error && !q.data ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : !items.length
            ? <Empty title="Aucun groupe" description="Ce compte n’est dans aucun groupe." />
            : <div className="table-scroll"><table>
                <thead><tr><th>Groupe</th><th>Portée</th><th>Statut</th><th /></tr></thead>
                <tbody>{shown.map(g => <tr key={g.id}>
                    <td>{g.nom}{g.defaultGroup && <small className="cell-sub">Groupe par défaut</small>}</td>
                    <td>{g.institutionId ? <EntityName kind="institutions" id={g.institutionId} /> : groupScope(g)}</td>
                    <td><Badge value={g.status} /></td>
                    <td>{(g.institutionId ? mayManage : central) && <button type="button" className="btn small secondary" disabled={items.length < 2} title={items.length < 2 ? 'Un compte reste toujours dans au moins un groupe.' : undefined} onClick={() => setRemoving(g)}>Retirer</button>}</td>
                </tr>)}</tbody>
            </table></div>}
        {items.length > 0 && <Pagination page={currentPage} hasMore={(currentPage + 1) * 100 < items.length} count={shown.length} onChange={setPage} />}
        {adding && <AddToGroupDialog user={user} current={items} onClose={() => setAdding(false)} onSuccess={() => { setAdding(false); q.refresh(); }} />}
        {removing && <RemoveFromGroupDialog userId={user.id} group={removing} onClose={() => setRemoving(null)} onSuccess={() => { setRemoving(null); q.refresh(); }} />}
    </section>;
}
