import React, { useEffect, useMemo, useState } from 'react';
import { useSession } from '../auth/session';
import { PageHead, Busy, ErrorNotice, Empty, useResource } from '../ui/components';
import { Icon } from '../ui/icons';
import { navigate } from '../ui/navigation';
import { attributionText, catalogSummary, groupByDomain, onlyUnassigned } from '../core/permissionGroups';
import type { AttributedRole, PermissionGroup } from '../core/permissionGroups';

/** Le nom d'un rôle sous forme d'un bouton qui ouvre sa fiche ; un rôle inactif se reconnaît sans couleur seule (« inactif »). */
function RoleChip({ role }: { role: AttributedRole }) {
    const inactive = role.status !== 'ACTIF';
    return <button type="button" className={'role-chip' + (inactive ? ' inactive' : '')} title={role.code + (inactive ? ' · inactif' : '')} onClick={() => navigate('/app/roles/' + role.id)}>{role.name || role.code}{inactive && <small> (inactif)</small>}</button>;
}

function Group({ group, open, onToggle }: { group: PermissionGroup; open: boolean; onToggle: () => void }) {
    const panel = 'perm-group-' + group.domain;
    return <section className="perm-group">
        <button type="button" className="perm-group-head" aria-expanded={open} aria-controls={panel} onClick={onToggle}>
            <Icon name={open ? 'chevronUp' : 'chevronDown'} size={16} />
            <span className="perm-group-title">{group.label}</span>
            <small>{group.permissions.length} permission{group.permissions.length > 1 ? 's' : ''}</small>
            {group.unassigned > 0 && <span className="perm-warn">{group.unassigned} sans rôle</span>}
        </button>
        <div id={panel} className="perm-group-body" hidden={!open}>
            <div className="table-scroll"><table>
                <thead><tr><th>Permission</th><th>Attribution</th></tr></thead>
                <tbody>{group.permissions.map(p => <tr key={p.id}>
                    <td><code>{p.code}</code>{p.description && <small className="cell-sub">{p.description}</small>}</td>
                    <td>{p.roles.length === 0
                        ? <span className="perm-none">{attributionText(p.roles)}</span>
                        : <div className="perm-roles" aria-label={attributionText(p.roles)}>{p.roles.map(r => <RoleChip key={r.id} role={r} />)}</div>}</td>
                </tr>)}</tbody>
            </table></div>
        </div>
    </section>;
}

export function PermissionsPage() {
    const { api, epoch } = useSession();
    const [filter, setFilter] = useState('');
    const [applied, setApplied] = useState('');
    const [unassignedOnly, setUnassignedOnly] = useState(false);
    const [expansion, setExpansion] = useState<{ key: string; defaultOpen: boolean; overrides: Record<string, boolean> }>({ key: '', defaultOpen: false, overrides: {} });
    // la recherche part un instant après la dernière frappe : le serveur filtre sur tout le catalogue
    useEffect(() => { const timer = window.setTimeout(() => setApplied(filter.trim()), 300); return () => window.clearTimeout(timer); }, [filter]);
    const q = useResource(signal => api!.allPermissionAttributions(signal, applied), JSON.stringify(['permission-attributions', applied, epoch]));
    const groups = useMemo(() => groupByDomain(unassignedOnly ? onlyUnassigned(q.data ?? []) : q.data ?? []), [q.data, unassignedOnly]);
    const summary = useMemo(() => catalogSummary(groupByDomain(q.data ?? [])), [q.data]);
    // Le filtre détermine l'ouverture initiale ; une réponse tardive ou une actualisation
    // du catalogue ne doit pas annuler les choix de l'utilisateur.
    const expansionKey = JSON.stringify([applied, unassignedOnly]);
    const currentExpansion: typeof expansion = expansion.key === expansionKey ? expansion : { key: expansionKey, defaultOpen: !!(applied || unassignedOnly), overrides: {} };
    const isOpen = (domain: string) => currentExpansion.overrides[domain] ?? currentExpansion.defaultOpen;
    const setAll = (open: boolean) => setExpansion({ key: expansionKey, defaultOpen: open, overrides: {} });
    const toggle = (domain: string) => setExpansion({ ...currentExpansion, overrides: { ...currentExpansion.overrides, [domain]: !isOpen(domain) } });
    return <>
        <PageHead eyebrow="RÉFÉRENTIEL" title="Catalogue des permissions" description="Les permissions exécutables définies par le serveur, rangées par domaine, avec les rôles qui détiennent chacune. Ce catalogue n’est pas modifiable ici : les permissions d’un rôle se configurent depuis la fiche du rôle." />
        <div className="panel">
            <div className="table-toolbar">
                <div className="input-icon search-box"><Icon name="search" /><input aria-label="Rechercher une permission" maxLength={200} placeholder="Code, domaine ou description" value={filter} onChange={e => setFilter(e.target.value)} /></div>
                <label className="perm-filter"><input type="checkbox" checked={unassignedOnly} onChange={e => setUnassignedOnly(e.target.checked)} /> Sans aucun rôle</label>
                <button type="button" className="btn small secondary" onClick={() => setAll(true)} disabled={!groups.length}>Tout déplier</button>
                <button type="button" className="btn small secondary" onClick={() => setAll(false)} disabled={!groups.some(g => isOpen(g.domain))}>Tout replier</button>
                {filter && <button type="button" className="btn small secondary" onClick={() => { setFilter(''); setApplied(''); }}>Effacer la recherche</button>}
            </div>
            {q.loading && !q.data ? <Busy /> : q.error && !q.data ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : <>
                <p className="perm-summary" role="status"><span><strong>{summary.permissions}</strong> permission{summary.permissions > 1 ? 's' : ''}</span><span><strong>{summary.domains}</strong> domaine{summary.domains > 1 ? 's' : ''}</span><span><strong>{summary.unassigned}</strong> sans aucun rôle</span>{applied && <span>Recherche : « {applied} »</span>}</p>
                {groups.map(group => <Group key={group.domain} group={group} open={isOpen(group.domain)} onToggle={() => toggle(group.domain)} />)}
                {!groups.length && <Empty title="Aucune permission trouvée" description={unassignedOnly ? 'Toutes les permissions trouvées sont détenues par au moins un rôle.' : 'La recherche porte sur tout le catalogue.'} />}
            </>}
        </div>
    </>;
}
