import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { PageHead, Busy, ErrorNotice, Empty, Badge, Notice, Field, Pagination, formatDate, useResource, CopyId } from '../ui/components';
import { ReferencePicker } from '../ui/ReferencePicker';
import { CommandDialog } from '../ui/CommandDialog';
import { Icon } from '../ui/icons';
import { canResolve, platform } from '../core/policy';
import { text } from '../core/validation';
import { navigate } from '../ui/navigation';
import { allPermissions } from './RolePermissions';
import type { Change } from '../core/types';
function ResolveDialog({ change, operation, onClose, onSuccess }: {
    change: Change;
    operation: 'approve' | 'reject' | 'cancel';
    onClose: () => void;
    onSuccess: () => void;
}) { const [reason, setReason] = useState(''); return <CommandDialog title={operation === 'approve' ? 'Approuver le changement' : operation === 'reject' ? 'Rejeter le changement' : 'Annuler la demande'} description="La demande, sa version, son délai et les droits des intervenants seront revérifiés par le serveur." path={`/permission-changes/${change.id}/${operation}`} build={() => ({ expectedVersion: change.version, reason: text(reason, 2000) })} onClose={onClose} onSuccess={() => { onSuccess(); onClose(); }} danger={operation !== 'approve'}><Field label="Motif de votre décision *" wide><textarea required value={reason} onChange={e => setReason(e.target.value)} maxLength={2000}/></Field></CommandDialog>; }
export function GovernancePage({ roleId }: {
    roleId: string;
}) {
    const { api, me, epoch } = useSession();
    const [page, setPage] = useState(0);
    const [chosen, setChosen] = useState<string | null>(null);
    const [operation, setOperation] = useState<'approve' | 'reject' | 'cancel' | null>(null);
    const q = useResource(async (s) => roleId ? { impact: await api!.impact(roleId, s), changes: await api!.changes(roleId, page, s) } : null, 'gov:' + roleId + page + epoch);
    const detail = useResource(async (s) => chosen ? { change: await api!.change(chosen, s), permissions: await allPermissions(api!, s) } : null, 'change:' + chosen + epoch);
    if (!platform(me))
        return <Notice tone="warning">Cette page exige une attribution nationale directe du rôle d’administration centrale. Le backend reste l’autorité de décision.</Notice>;
    const change = detail.data?.change;
    const names = new Map(detail.data?.permissions.map(p => [p.id, p.code]));
    const pick = (id: string) => { setPage(0); setChosen(null); navigate('/app/governance?role=' + id); };
    const refresh = () => { q.refresh(); detail.refresh(); };
    return <><PageHead eyebrow="GOUVERNANCE DES HABILITATIONS" title="Des décisions à deux regards." description="Proposez, examinez et approuvez les évolutions des rôles déjà utilisés."/><div className="panel scope-hero"><Icon name="shield" size={28}/><div><strong>Choisir un rôle à examiner</strong><p>Le backend expose les demandes par rôle, pas de boîte globale.</p></div><ReferencePicker kind="roles" label="Sélectionner un rôle" value={roleId} onChange={pick}/></div>
 {!roleId ? <Empty title="Commencez par un rôle" description="Son impact et ses demandes apparaîtront ici."/> : q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh}/> : q.data && <><div className="stat-grid three"><div className="stat-card"><span>Attributions actuelles ou futures</span><strong>{q.data.impact.currentOrFutureAssignments}</strong><small>Photographie du backend</small></div><div className="stat-card"><span>Délégations enregistrées</span><strong>{q.data.impact.currentOrFutureDelegations}</strong><small>Réinstruction après changement de droits</small></div><div className="stat-card"><span>Demandes non expirées</span><strong>{q.data.impact.pendingChanges}</strong><small>Révision des permissions : {q.data.impact.permissionRevision}</small></div></div><div className="panel"><div className="section-heading"><h3>Demandes de changement</h3><button className="btn small secondary" onClick={() => navigate('/app/roles/' + roleId)}>Ouvrir le rôle</button></div><div className="table-scroll"><table><thead><tr><th>Motif</th><th>Demandée par</th><th>Échéance UTC</th><th>Statut</th><th /></tr></thead><tbody>{q.data.changes.items.map(c => <tr key={c.id}><td><button className="text-link" onClick={() => setChosen(c.id)}>{c.reason}</button></td><td><CopyId value={c.requestedBy}/></td><td>{formatDate(c.expiresAt)}</td><td><Badge value={c.status}/>{c.status === 'PENDING' && Date.parse(c.expiresAt) < Date.now() && <small className="cell-sub">Délai expiré</small>}</td><td><button className="btn small secondary" onClick={() => setChosen(c.id)}>Examiner</button></td></tr>)}</tbody></table></div>{!q.data.changes.items.length && <Empty title="Aucune demande pour ce rôle" description="Une proposition se crée depuis la fiche du rôle, dans Configurer les permissions."/>}<Pagination page={page} hasMore={q.data.changes.hasMore} count={q.data.changes.items.length} onChange={setPage}/></div></>}
 {chosen && <section className="panel change-detail"><div className="section-heading"><h3>Examen indépendant</h3><button className="icon-btn" aria-label="Fermer l’examen" onClick={() => setChosen(null)}><Icon name="close"/></button></div>{detail.loading ? <Busy /> : detail.error ? <ErrorNotice error={detail.error} onRetry={detail.refresh}/> : change && <><div className="change-meta"><Badge value={change.status}/><span>Version de demande : {change.version}</span><span>Version de rôle attendue : {change.expectedRoleVersion}</span></div><blockquote>{change.reason}</blockquote><div className="comparison"><div><h4>Permissions précédentes</h4>{change.previousPermissionIds.map(id => <span className={'permission-chip ' + (!change.requestedPermissionIds.includes(id) ? 'removed' : '')} key={id}>{names.get(id) ?? id}</span>)}</div><div><h4>Permissions demandées</h4>{change.requestedPermissionIds.map(id => <span className={'permission-chip ' + (!change.previousPermissionIds.includes(id) ? 'added' : '')} key={id}>{names.get(id) ?? id}</span>)}{change.requestedPermissionIds.length === 0 && <Notice tone="warning">Cette demande retire toutes les permissions du rôle.</Notice>}</div></div><p className="subtle">Demandée le {formatDate(change.requestedAt)} · valable jusqu’au {formatDate(change.expiresAt)}</p>{change.resolutionReason && <p>Décision : {change.resolutionReason}</p>}{change.requestedBy === me!.user.id && change.status === 'PENDING' && <Notice>Vous êtes à l’origine de cette demande. Une autre autorité centrale doit l’approuver ou la rejeter.</Notice>}<div className="change-actions">{(['approve', 'reject', 'cancel'] as const).map(op => canResolve(me, change, op) && <button key={op} className={'btn ' + (op === 'approve' ? 'primary' : 'secondary')} onClick={() => setOperation(op)}>{op === 'approve' ? 'Approuver' : op === 'reject' ? 'Rejeter' : 'Annuler ma demande'}</button>)}</div></>}</section>}
 {operation && change && <ResolveDialog change={change} operation={operation} onClose={() => setOperation(null)} onSuccess={refresh}/>}</>;
}
