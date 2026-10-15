import { ExtractionReviewSelfAssignmentDialog, extractionReviewSelfOption } from '../ui/ExtractionReviewSelfAssignment';
import { ExtractionSelfAssignmentDialog, extractionSelfOption } from '../ui/ExtractionSelfAssignment';
import { ConservationSelfAssignmentDialog, conservationSelfOption } from '../ui/ConservationSelfAssignment';
import { DelegationDialog, UserScopeDialog, mayDelegate } from '../ui/IdentityScopeActions';
import { ResourceDetailsButton } from '../ui/ResourceDetails';
import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { navigate } from '../ui/navigation';
import { EntityName } from '../ui/names';
import { PageHead, Badge, Busy, ErrorNotice, Empty, useResource, CopyId, formatDate, Pagination, Notice } from '../ui/components';
import { Icon } from '../ui/icons';
import { EntityForm } from './EntityForm';
import { StatusDialog, AssignmentDialog, RevokeDialog } from './Actions';
import { RolePermissionsDialog } from './RolePermissions';
import { InstitutionFichePanel } from '../ui/InstitutionFiche';
import { catalogMeta } from './Catalog';
import { can, platform } from '../core/policy';
import type { Catalog, RecordEntity, User, Role, Assignment, Delegation, Page } from '../core/types';
export function Associated({ user }: {
    user: User;
}) {
    const { api, me, epoch } = useSession();
    const [tab, setTab] = useState('assignments');
    const [page, setPage] = useState(0);
    const [delegating, setDelegating] = useState<Assignment | null>(null);
    const [revoke, setRevoke] = useState<Assignment | Delegation | null>(null);
    const q = useResource<Page<Assignment | Delegation>>(s => tab === 'assignments' ? api!.assignments(user.id, page, s) : api!.delegations(user.id, page, s), 'associated:' + tab + user.id + page + epoch);
    const allowed = can(me, 'IAM_ASSIGNMENT_MANAGE', { institutionId: user.institutionId, departmentId: user.departmentId }) && user.id !== me!.user.id;
    return <section className="panel"><div className="tabs"><button className={tab === 'assignments' ? 'active' : ''} onClick={() => { setTab('assignments'); setPage(0); }}>Attributions</button><button className={tab === 'delegations' ? 'active' : ''} onClick={() => { setTab('delegations'); setPage(0); }}>Délégations</button></div>{q.loading ? <Busy /> : q.error ? <div className="panel-padding"><ErrorNotice error={q.error}/></div> : <><div className="table-scroll"><table><thead><tr><th>Rôle / source</th><th>Portée</th><th>Période UTC</th><th>Statut enregistré</th><th /></tr></thead><tbody>{q.data!.items.map(x => <tr key={x.id}><td>{x.roleId ? <EntityName kind="roles" id={x.roleId} fallback="Référence indisponible"/> : <span>Référence indisponible</span>}</td><td><Badge value={x.scope}/>{x.institutionId && <small className="cell-sub"><EntityName kind="institutions" id={x.institutionId}/>{x.departmentId && <> / <EntityName kind="departments" id={x.departmentId}/></>}</small>}</td><td><small>{formatDate(x.startsAt)}<br />{x.endsAt ? formatDate(x.endsAt) : 'Sans date de fin'}</small></td><td><Badge value={x.status}/></td><td><ResourceDetailsButton resource={tab === 'assignments' ? 'assignment' : 'delegation'} id={x.id} />
        {'userId' in x && mayDelegate(me, x) && <button type="button" className="btn small secondary" onClick={() => setDelegating(x)}>Déléguer ce rôle</button>}{(allowed || ('delegantId' in x && x.delegantId === me!.user.id)) && x.status === 'ACTIF' && <button className="btn small danger-outline" onClick={() => setRevoke(x)}>Révoquer</button>}</td></tr>)}</tbody></table></div>{!q.data!.items.length && <Empty title="Aucune habilitation enregistrée"/>}<Pagination page={page} hasMore={q.data!.hasMore} count={q.data!.items.length} onChange={setPage}/></>}<p className="panel-footnote">Un statut ACTIF ne garantit pas à lui seul des droits effectifs : dates, rôle, révision et organisation restent contrôlés côté serveur.</p>{delegating && <DelegationDialog source={delegating} onClose={() => setDelegating(null)} onDone={q.refresh} />}{revoke && <RevokeDialog path={`/${tab === 'assignments' ? 'role-assignments' : 'delegations'}/${revoke.id}/revoke`} version={revoke.version} onClose={() => setRevoke(null)} onSuccess={q.refresh}/>}</section>;
}
function RolePermissionList({ role }: {
    role: Role;
}) { const { api, epoch } = useSession(); const q = useResource(s => api!.rolePermissions(role.id, s), 'role-permissions:' + role.id + epoch); return <div className="panel"><div className="section-heading"><h3>Permissions du rôle</h3><Icon name="key"/></div>{q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error}/> : <div className="permission-list">{q.data!.permissions.map(p => <div key={p.id}><Icon name="check" size={16}/><div><code>{p.code}</code><small>{p.description ?? p.domain}</small></div></div>)}{!q.data!.permissions.length && <Empty title="Aucune permission attribuée"/>}</div>}</div>; }
export function DetailPage({ kind, id }: {
    kind: Catalog;
    id: string;
}) {
    const { api, me, epoch } = useSession();
    const q = useResource(s => api!.get<RecordEntity>(kind, id, s), 'detail:' + kind + id + epoch);
    const [dialog, setDialog] = useState('');
    if (q.loading)
        return <Busy />;
    if (q.error)
        return <ErrorNotice error={q.error} onRetry={q.refresh}/>;
    const e = q.data!;
    const v = e as any;
    const target = { institutionId: kind === 'institutions' ? e.id : v.institutionId, departmentId: kind === 'departments' ? undefined : v.departmentId };
    const central = platform(me);
    const selfConservation = kind === 'users' && conservationSelfOption(me, id);
    const selfExtraction = kind === 'users' && extractionSelfOption(me, id);
    const selfReview = kind === 'users' && extractionReviewSelfOption(me, id);
    const editable = e.status !== 'ARCHIVE' && (kind === 'roles' || kind === 'institutions' ? central : can(me, catalogMeta[kind].manage, target)) && !(kind === 'users' && e.id === me!.user.id) && !(kind === 'roles' && v.code === 'SNAE_PLATFORM_ADMIN');
    const fields: [
        string,
        unknown
    ][] = [['Version courante', e.version], ...('code' in e ? [['Code', e.code] as [
                string,
                unknown
            ]] : []), ...('institutionId' in e ? [['Institution', e.institutionId ? <EntityName kind="institutions" id={e.institutionId}/> : null], ['Département', 'departmentId' in e && e.departmentId ? <EntityName kind="departments" id={e.departmentId}/> : null]] as [
            string,
            unknown
        ][] : []), ...('ssoId' in e ? [['Identifiant SSO', e.ssoId], ['Adresse', e.email], ['Type de compte', e.accountType], ['Anciens tokens révoqués avant', formatDate(e.authNotBefore)]] as [
            string,
            unknown
        ][] : []), ...('parentId' in e ? [['Département parent', e.parentId ? <EntityName kind="departments" id={e.parentId}/> : null]] as [
            string,
            unknown
        ][] : []), ...('description' in e ? [['Description', e.description]] as [
            string,
            unknown
        ][] : [])];
    return <><button className="back-link" onClick={() => navigate('/app/' + kind)}>← Retour à {catalogMeta[kind].name.toLowerCase()}</button><PageHead eyebrow="FICHE DE RÉFÉRENCE" title={e.nom ?? 'Identité sans nom'} description="État actuel renvoyé par le backend. Chaque nouvelle décision est contrôlée.">{editable && <><button className="btn secondary" onClick={() => setDialog('edit')}>Modifier</button><button className="btn secondary" onClick={() => setDialog('status')}>Changer le statut</button></>}</PageHead>
 <div className="detail-grid"><section className="panel detail-card"><div className="section-heading"><h3>Informations</h3><Badge value={e.status}/></div><dl>{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value === null || value === undefined || value === '' ? '—' : React.isValidElement(value) ? value : String(value)}</dd></div>)}</dl><details className="detail-technical"><summary>Identifiant technique</summary><CopyId value={e.id}/></details></section><section className="panel detail-card"><span className="feature-icon"><Icon name="shield" size={25}/></span><h3>Contrôle & responsabilité</h3><p>Le compte, le périmètre et les permissions sont contrôlés au moment de chaque action.</p>{'scope' in e && <Badge value={e.scope}/>}
 {kind === 'users' && <>{central && editable && <button type="button" className="btn secondary full" onClick={() => setDialog('scope')}>Changer le rattachement</button>}<button className="btn secondary full" onClick={() => navigate('/app/profile?user=' + id)}>Consulter la synthèse d’accès</button>{editable && <button className="btn danger-outline full" onClick={() => setDialog('tokens')}>Révoquer les anciens tokens</button>}{can(me, 'IAM_ASSIGNMENT_MANAGE', target) && id !== me!.user.id && v.accountType === 'USER' && e.status === 'ACTIF' && <button className="btn primary full" onClick={() => setDialog('assign')}>Attribuer un rôle</button>}</>}
 {kind === 'roles' && central && <><button className="btn secondary full" onClick={() => navigate('/app/governance?role=' + id)}>Impact & demandes de changement</button>{editable && <button className="btn primary full" onClick={() => setDialog('permissions')}>Configurer les permissions</button>}</>}
 {selfConservation && <button type="button" className="btn primary full" onClick={() => setDialog('self-conservation')}>M’attribuer le rôle de conservation</button>}
 {selfExtraction && <button type="button" className="btn primary full" onClick={() => setDialog('self-extraction')}>M’attribuer le rôle d’extraction</button>}
 {selfReview && <button type="button" className="btn primary full" onClick={() => setDialog('self-review')}>M’attribuer le rôle de relecture</button>}
 {!editable && !selfConservation && !selfExtraction && !selfReview && <Notice>Modification indisponible pour votre compte, cette ressource ou son état.</Notice>}</section></div>
 {kind === 'departments' && <ResourceDetailsButton resource="departmentImpact" id={id} label="Consulter l’impact du département" />}{kind === 'institutions' && <InstitutionFichePanel institutionId={e.id}/>} {kind === 'users' && <Associated user={e as User}/>} {kind === 'roles' && <RolePermissionList role={e as Role}/>}
 {dialog === 'self-review' && selfReview && <ExtractionReviewSelfAssignmentDialog onClose={() => setDialog('')} onSuccess={() => { setDialog(''); q.refresh(); }} />}
 {dialog === 'self-extraction' && selfExtraction && <ExtractionSelfAssignmentDialog onClose={() => setDialog('')} onSuccess={() => { setDialog(''); q.refresh(); }} />}
 {dialog === 'self-conservation' && selfConservation && <ConservationSelfAssignmentDialog onClose={() => setDialog('')} onSuccess={() => { setDialog(''); q.refresh(); }} />}
 {dialog === 'scope' && kind === 'users' && <UserScopeDialog user={e as User} onClose={() => setDialog('')} onDone={q.refresh} />}{dialog === 'edit' && <EntityForm kind={kind} entity={e} onClose={() => setDialog('')} onSuccess={q.refresh}/>} {['status', 'tokens'].includes(dialog) && <StatusDialog kind={kind} entity={e} tokens={dialog === 'tokens'} onClose={() => setDialog('')} onSuccess={q.refresh}/>} {dialog === 'assign' && <AssignmentDialog user={e as User} onClose={() => setDialog('')} onSuccess={q.refresh}/>} {dialog === 'permissions' && <RolePermissionsDialog role={e as Role} onClose={() => setDialog('')} onSuccess={q.refresh}/>}</>;
}
