import React, { useEffect, useState } from 'react';
import { useSession } from '../auth/session';
import { CommandDialog } from '../ui/CommandDialog';
import { Busy, ErrorNotice, Field, Notice, useResource } from '../ui/components';
import { text } from '../core/validation';
import { normalizePermissions } from '../core/policy';
import type { Role, Permission } from '../core/types';
export async function allPermissions(api: NonNullable<ReturnType<typeof useSession>['api']>, signal: AbortSignal): Promise<Permission[]> {
    const all: Permission[] = [];
    for (let p = 0; p < 10; p++) {
        const result = await api.permissions(p, signal);
        all.push(...result.items);
        if (!result.hasMore)
            return all;
    }
    throw new Error('Catalogue supérieur à 1 000 permissions : chargement incomplet, modification désactivée.');
}
export function RolePermissionsDialog({ role, onClose, onSuccess }: {
    role: Role;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const { api, epoch } = useSession();
    const q = useResource(async (s) => { const [current, impact, permissions] = await Promise.all([api!.rolePermissions(role.id, s), api!.impact(role.id, s), allPermissions(api!, s)]); return { current, impact, permissions }; }, 'editpermissions:' + role.id + ':' + epoch);
    const [selected, setSelected] = useState<string[]>([]);
    const [reason, setReason] = useState('');
    const [filter, setFilter] = useState('');
    useEffect(() => {
        if (q.data)
            setSelected(q.data.current.permissions.map(p => p.id));
    }, [q.data]);
    if (q.loading || q.error)
        return <div className="floating-panel"><button className="btn secondary" onClick={onClose}>Fermer</button>{q.loading ? <Busy /> : <ErrorNotice error={q.error} onRetry={q.refresh}/>}</div>;
    const d = q.data!;
    const approval = d.impact.approvalRequired;
    return <CommandDialog title={approval ? 'Proposer de nouvelles permissions' : 'Configurer les permissions'} description={approval ? 'Ce rôle est utilisé. Une autre personne habilitée devra approuver la demande.' : 'Ce rôle n’est pas attribué : configuration directe autorisée selon le serveur.'} path={`/roles/${role.id}/${approval ? 'permission-changes' : 'permissions'}`} method={approval ? 'POST' : 'PUT'} build={() => {
            const ids = normalizePermissions(selected);
            if (ids.length > 250)
                throw new Error('Au maximum 250 permissions.');
            if (JSON.stringify(ids) === JSON.stringify(normalizePermissions(d.current.permissions.map(p => p.id))))
                throw new Error('Aucune permission modifiée.');
            return { ...(approval ? { expectedRoleVersion: d.current.role.version } : { expectedVersion: d.current.role.version }), permissionIds: ids, reason: text(reason, 2000) };
        }} onClose={onClose} onSuccess={() => { onSuccess(); onClose(); }} label={approval ? 'Soumettre la proposition' : 'Appliquer les permissions'}>
 <div className="span2"><Notice tone="warning">La liste sélectionnée remplace la liste complète. Les délégations existantes devront être réinstruites après un changement approuvé.</Notice><div className="permission-tools"><input aria-label="Filtrer le catalogue" placeholder="Filtrer les permissions" value={filter} onChange={e => setFilter(e.target.value)}/><span>{selected.length} sélectionnées</span></div><div className="permission-grid">{d.permissions.filter(p => (p.code + ' ' + p.domain).toLowerCase().includes(filter.toLowerCase())).map(p => <label key={p.id} className="permission-check"><input type="checkbox" checked={selected.includes(p.id)} onChange={e => setSelected(old => e.target.checked ? [...old, p.id] : old.filter(id => id !== p.id))}/><span><b>{p.code}</b><small>{p.description ?? p.domain}</small></span></label>)}</div></div><Field label="Motif *" wide><textarea required value={reason} onChange={e => setReason(e.target.value)} maxLength={2000}/></Field>
 </CommandDialog>;
}
