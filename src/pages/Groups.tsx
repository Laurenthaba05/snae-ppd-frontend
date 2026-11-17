import React, { useEffect, useState } from 'react';
import { useSession } from '../auth/session';
import { PageHead, Badge, Busy, Empty, ErrorNotice, Field, Pagination, useResource, formatDate } from '../ui/components';
import { CommandDialog } from '../ui/CommandDialog';
import { Icon } from '../ui/icons';
import { EntityName } from '../ui/names';
import { InstitutionChoice } from '../ui/InstitutionChoice';
import { ReferencePicker } from '../ui/ReferencePicker';
import { RemoveFromGroupDialog } from '../ui/UserGroupsPanel';
import { can, platform } from '../core/policy';
import { addMemberCommand, archiveGroupCommand, createGroupCommand, groupScope, memberName, updateGroupCommand } from '../core/userGroups';
import type { GroupMember, UserGroup } from '../core/userGroups';

type Draft = Record<string, string>;

/** Créer (sans groupe) ou modifier (avec groupe) : le code et la portée ne changent plus une fois le groupe créé. */
function GroupDialog({ group, onClose, onSuccess }: { group?: UserGroup; onClose: () => void; onSuccess: () => void }) {
    const [d, setD] = useState<Draft>({ institutionId: group?.institutionId ?? '', code: group?.code ?? '', nom: group?.nom ?? '', description: group?.description ?? '', defaultGroup: group?.defaultGroup ? 'true' : 'false', reason: '' });
    const set = (k: string, v: string) => setD(old => ({ ...old, [k]: v }));
    const central = platform(useSession().me);
    return <CommandDialog title={group ? 'Modifier le groupe' : 'Créer un groupe'} description={group ? 'Modifiez le nom, la description ou le statut de groupe par défaut, et indiquez le motif.' : 'Un groupe range des comptes ; il n’accorde aucun droit.'}
        path={group ? '/groups/' + group.id : '/groups'} method={group ? 'PUT' : 'POST'}
        build={() => group ? updateGroupCommand(group, d) : createGroupCommand(d, d.institutionId || null)} onClose={onClose} onSuccess={onSuccess}>
        {!group && <Field label="Institution" hint={central ? 'Laissez vide pour un groupe national (réservé à l’administration de la plateforme).' : undefined} wide><InstitutionChoice value={d.institutionId ?? ''} onChange={v => set('institutionId', v)} nullable={central} /></Field>}
        {!group && <Field label="Code *"><input value={d.code} onChange={ev => set('code', ev.target.value)} required maxLength={50} /></Field>}
        <Field label="Intitulé *"><input value={d.nom} onChange={ev => set('nom', ev.target.value)} required maxLength={150} /></Field>
        <Field label="Description" wide><textarea value={d.description} maxLength={5000} onChange={ev => set('description', ev.target.value)} /></Field>
        <Field label="Groupe par défaut" hint="Les comptes créés sans choix de groupe y entrent. Il remplace l’éventuel groupe par défaut actuel de la même portée."><label className="perm-filter"><input type="checkbox" checked={d.defaultGroup === 'true'} onChange={ev => set('defaultGroup', ev.target.checked ? 'true' : 'false')} /> Groupe par défaut</label></Field>
        {group && <Field label="Motif de modification *" wide><textarea required maxLength={2000} value={d.reason} onChange={ev => set('reason', ev.target.value)} /></Field>}
    </CommandDialog>;
}

function ArchiveDialog({ group, onClose, onSuccess }: { group: UserGroup; onClose: () => void; onSuccess: () => void }) {
    const [reason, setReason] = useState('');
    return <CommandDialog title="Archiver le groupe" description="L’archivage est définitif. Il n’est possible que pour un groupe vide qui n’est pas le groupe par défaut." path={'/groups/' + group.id + '/archive'}
        build={() => archiveGroupCommand(group, { reason })} onClose={onClose} onSuccess={onSuccess} label="Archiver" danger>
        <Field label="Groupe" wide><input value={group.nom} readOnly disabled /></Field>
        <Field label="Motif *" wide><textarea required maxLength={2000} value={reason} onChange={ev => setReason(ev.target.value)} /></Field>
    </CommandDialog>;
}

function AddMemberDialog({ group, onClose, onSuccess }: { group: UserGroup; onClose: () => void; onSuccess: () => void }) {
    const [userId, setUserId] = useState('');
    const [motif, setMotif] = useState('');
    return <CommandDialog title="Ajouter un membre" description={group.institutionId ? 'Seuls les comptes de l’institution du groupe peuvent y entrer.' : 'Groupe national : tout compte humain actif peut y entrer.'} path={'/groups/' + group.id + '/members'}
        build={() => { if (!userId) throw new Error('Choisissez un compte.'); return addMemberCommand(userId, { motif }); }} onClose={onClose} onSuccess={onSuccess}>
        <Field label="Groupe" wide><input value={group.nom} readOnly disabled /></Field>
        <Field label="Compte *" wide><ReferencePicker kind="users" label="Sélectionner un compte" value={userId} onChange={setUserId} scope={group.institutionId ? { institutionId: group.institutionId } : {}} /></Field>
        <Field label="Motif *" wide><textarea required maxLength={2000} value={motif} onChange={ev => setMotif(ev.target.value)} /></Field>
    </CommandDialog>;
}

function Members({ group, manage, onChanged }: { group: UserGroup; manage: boolean; onChanged: () => void }) {
    const { api, epoch } = useSession();
    const [page, setPage] = useState(0);
    const [adding, setAdding] = useState(false);
    const [removing, setRemoving] = useState<GroupMember | null>(null);
    const q = useResource(signal => api!.groupMembers(group.id, page, signal), 'group-members:' + group.id + page + epoch);
    useEffect(() => { setPage(0); }, [group.id]);
    const done = () => { q.refresh(); onChanged(); };
    return <div>
        <div className="section-heading"><h4>Membres</h4>{manage && group.status === 'ACTIF' && <button type="button" className="btn small secondary" onClick={() => setAdding(true)}>Ajouter un membre</button>}</div>
        {q.loading && !q.data ? <Busy /> : q.error && !q.data ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : !q.data?.items.length
            ? <Empty title="Aucun membre visible" description="Ce groupe n’a aucun membre dans votre périmètre." />
            : <>
                <div className="table-scroll"><table>
                    <thead><tr><th>Compte</th><th>Adresse</th><th>Ajouté le</th><th /></tr></thead>
                    <tbody>{q.data.items.map(m => <tr key={m.userId}>
                        <td>{memberName(m)}</td><td>{m.email ?? '—'}</td><td>{formatDate(m.addedAt)}</td>
                        <td>{manage && <button type="button" className="btn small secondary" onClick={() => setRemoving(m)}>Retirer</button>}</td>
                    </tr>)}</tbody>
                </table></div>
                <Pagination page={page} hasMore={q.data.hasMore} onChange={setPage} count={q.data.items.length} />
            </>}
        {adding && <AddMemberDialog group={group} onClose={() => setAdding(false)} onSuccess={() => { setAdding(false); done(); }} />}
        {removing && <RemoveFromGroupDialog userId={removing.userId} group={group} onClose={() => setRemoving(null)} onSuccess={() => { setRemoving(null); done(); }} />}
    </div>;
}

export function GroupsPage() {
    const { api, me, epoch } = useSession();
    const [filter, setFilter] = useState('');
    const [applied, setApplied] = useState('');
    const [page, setPage] = useState(0);
    const [selected, setSelected] = useState('');
    const [dialog, setDialog] = useState<'' | 'create' | 'edit' | 'archive'>('');
    useEffect(() => { const timer = window.setTimeout(() => { setApplied(filter.trim()); setPage(0); }, 300); return () => window.clearTimeout(timer); }, [filter]);
    const q = useResource(signal => api!.groups({ page, size: 25, q: applied }, signal), JSON.stringify(['groups', page, applied, epoch]));
    const central = platform(me);
    const mayCreate = central || me!.grants.some(g => g.permission === 'IAM_USER_MANAGE');
    const mayManage = (g: UserGroup) => g.institutionId ? can(me, 'IAM_USER_MANAGE', { institutionId: g.institutionId }) : central;
    const current = q.data?.items.find(g => g.id === selected) ?? null;
    return <>
        <PageHead eyebrow="IDENTITÉ & ORGANISATION" title="Groupes d’utilisateurs" description="Chaque compte humain appartient à au moins un groupe, dès sa création. Un groupe range des comptes (équipe, métier, institution) ; il n’accorde aucun droit : les rôles s’attribuent à part." >
            {mayCreate && <button type="button" className="btn primary" onClick={() => setDialog('create')}>Créer un groupe</button>}
        </PageHead>
        <div className="panel">
            <div className="table-toolbar">
                <div className="input-icon search-box"><Icon name="search" /><input aria-label="Rechercher un groupe" maxLength={100} placeholder="Nom ou code du groupe" value={filter} onChange={e => setFilter(e.target.value)} /></div>
                {filter && <button type="button" className="btn small secondary" onClick={() => { setFilter(''); setApplied(''); setPage(0); }}>Effacer la recherche</button>}
            </div>
            {q.loading && !q.data ? <Busy /> : q.error && !q.data ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : !q.data?.items.length
                ? <Empty title="Aucun groupe" description={applied ? 'Aucun groupe ne correspond à la recherche.' : 'Aucun groupe dans votre périmètre.'} />
                : <>
                    <div className="table-scroll"><table>
                        <thead><tr><th>Groupe</th><th>Portée</th><th>Membres</th><th>Statut</th><th /></tr></thead>
                        <tbody>{q.data.items.map(g => <tr key={g.id} aria-selected={g.id === selected}>
                            <td>{g.nom}<small className="cell-sub">{g.code}{g.defaultGroup ? ' · groupe par défaut' : ''}</small></td>
                            <td>{g.institutionId ? <EntityName kind="institutions" id={g.institutionId} /> : groupScope(g)}</td>
                            <td>{g.memberCount}</td>
                            <td><Badge value={g.status} /></td>
                            <td><button type="button" className="btn small secondary" aria-expanded={g.id === selected} onClick={() => setSelected(id => id === g.id ? '' : g.id)}>{g.id === selected ? 'Masquer' : 'Ouvrir'}</button></td>
                        </tr>)}</tbody>
                    </table></div>
                    <Pagination page={page} hasMore={q.data.hasMore} onChange={setPage} count={q.data.items.length} />
                </>}
        </div>
        {current && <section className="panel" aria-label="Fiche du groupe">
            <div className="section-heading"><h3>{current.nom}</h3><Badge value={current.status} /></div>
            {current.description && <p>{current.description}</p>}
            {mayManage(current) && current.status === 'ACTIF' && <div className="actions-row">
                <button type="button" className="btn small secondary" onClick={() => setDialog('edit')}>Modifier</button>
                <button type="button" className="btn small secondary" onClick={() => setDialog('archive')}>Archiver</button>
            </div>}
            <Members group={current} manage={mayManage(current)} onChanged={q.refresh} />
        </section>}
        {dialog === 'create' && <GroupDialog onClose={() => setDialog('')} onSuccess={() => { setDialog(''); q.refresh(); }} />}
        {dialog === 'edit' && current && <GroupDialog group={current} onClose={() => setDialog('')} onSuccess={() => { setDialog(''); q.refresh(); }} />}
        {dialog === 'archive' && current && <ArchiveDialog group={current} onClose={() => setDialog('')} onSuccess={() => { setDialog(''); setSelected(''); q.refresh(); }} />}
    </>;
}
