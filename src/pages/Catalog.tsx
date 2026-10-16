import React, { useEffect, useState } from 'react';
import { useSession } from '../auth/session';
import { useWorkspace } from '../ui/workspace';
import { navigate } from '../ui/navigation';
import { EntityName } from '../ui/names';
import { PageHead, Badge, Busy, ErrorNotice, Empty, Pagination, useResource, Notice } from '../ui/components';
import { Icon } from '../ui/icons';
import { ReferencePicker } from '../ui/ReferencePicker';
import { EntityForm } from './EntityForm';
import { InstitutionImport } from '../ui/InstitutionImport';
import { DepartmentImport } from '../ui/DepartmentImport';
import { can, platform } from '../core/policy';
import type { Catalog, RecordEntity } from '../core/types';
import { label } from '../core/format';
export const catalogMeta = { institutions: { name: 'Institutions', singular: 'institution', icon: 'building', read: 'IAM_INSTITUTION_READ', manage: 'IAM_INSTITUTION_MANAGE', description: 'Le référentiel des institutions et organismes de conservation.' }, departments: { name: 'Départements', singular: 'département', icon: 'tree', read: 'IAM_DEPARTMENT_READ', manage: 'IAM_DEPARTMENT_MANAGE', description: 'Organisez les directions et services, sans perdre leur rattachement.' }, users: { name: 'Utilisateurs', singular: 'identité', icon: 'users', read: 'IAM_USER_READ', manage: 'IAM_USER_MANAGE', description: 'Des identités nominatives, des rattachements explicites et des accès maîtrisés.' }, roles: { name: 'Rôles et habilitations', singular: 'rôle', icon: 'shield', read: 'IAM_ROLE_READ', manage: 'IAM_ROLE_MANAGE', description: 'Définissez les responsabilités et contrôlez leur périmètre d’application.' } };
export function CatalogPage({ kind }: {
    kind: Catalog;
}) {
    const { api, me, epoch } = useSession();
    const { scope, setScope } = useWorkspace();
    const [page, setPage] = useState(0);
    const [filter, setFilter] = useState('');
    const [status, setStatus] = useState('');
    const [create, setCreate] = useState(false);
    const [importing, setImporting] = useState(false);
    const m = catalogMeta[kind];
    useEffect(() => { setPage(0); setFilter(''); setStatus(''); }, [kind, scope.institutionId, scope.departmentId]);
    const needsScope = kind === 'departments' && !scope.institutionId;
    const params = kind === 'roles' ? { page, size: 20 } : kind === 'institutions' ? { page, size: 20, institutionId: scope.institutionId } : { page, size: 20, ...scope };
    const q = useResource(s => needsScope ? Promise.resolve({ items: [] as RecordEntity[], page: 0, size: 20, hasMore: false }) : api!.list<RecordEntity>(kind, params, s), JSON.stringify([kind, params, epoch]));
    const creatable = (kind === 'institutions' || kind === 'roles') ? platform(me) : can(me, m.manage, kind === 'departments' ? { institutionId: scope.institutionId } : scope);
    const rows = q.data?.items.filter(x => (!status || x.status === status) && JSON.stringify([x.nom, 'code' in x ? x.code : '', 'email' in x ? x.email : '']).toLowerCase().includes(filter.toLowerCase())) ?? [];
    return <><PageHead eyebrow="MODULE 01 · IDENTITÉ & ORGANISATION" title={m.name} description={m.description}>{creatable && <>{(kind === 'institutions' || kind === 'departments') && <button className="btn secondary" onClick={() => setImporting(true)}><Icon name="upload" size={18}/>Importer depuis Excel</button>}<button className="btn primary" onClick={() => setCreate(true)}><Icon name="plus" size={18}/>Ajouter {m.singular === 'identité' ? 'une identité' : 'un' + (kind === 'institutions' ? 'e' : '') + ' ' + m.singular}</button></>}</PageHead>
 {needsScope && <div className="panel choose-scope"><Icon name="building" size={32}/><div><h2>Choisissez une institution</h2><p>Les départements sont toujours consultés dans un périmètre explicite.</p></div><ReferencePicker kind="institutions" label="Sélectionner une institution" value="" onChange={v => setScope({ institutionId: v, departmentId: null })}/></div>}
 {!needsScope && <div className="panel"><div className="table-toolbar"><div className="input-icon search-box"><Icon name="search"/><input aria-label={'Filtrer ' + m.name} placeholder="Filtrer les éléments de cette page…" value={filter} onChange={e => setFilter(e.target.value)}/></div><div className="toolbar-right"><select aria-label="Statut sur la page" value={status} onChange={e => setStatus(e.target.value)}><option value="">Tous les statuts de la page</option><option value="ACTIF">Actifs</option><option value="SUSPENDU">Suspendus</option><option value="INACTIF">Inactifs</option><option value="ARCHIVE">Archivés</option></select><button className="icon-btn" aria-label="Actualiser la liste" onClick={q.refresh}><Icon name="refresh" size={18}/></button></div></div>
 {q.loading ? <Busy /> : q.error ? <div className="panel-padding"><ErrorNotice error={q.error} onRetry={q.refresh}/></div> : <><div className="table-scroll"><table><thead><tr><th>{kind === 'users' ? 'Identité' : 'Intitulé'}</th><th>{kind === 'users' ? 'Contact / SSO' : 'Code'}</th><th>{kind === 'institutions' ? 'Type' : 'Portée / rattachement'}</th><th>Statut</th><th>Version</th><th><span className="sr-only">Consulter</span></th></tr></thead><tbody>{rows.map(x => <tr key={x.id}><td><button className="record-name" onClick={() => navigate('/app/' + kind + '/' + x.id)}><span className={'table-avatar ' + kind}><Icon name={m.icon} size={19}/></span><span><strong>{'prenom' in x && x.prenom ? x.prenom + ' ' : ''}{x.nom ?? 'Identité sans nom'}</strong><small>{kind === 'institutions' ? 'sigle' in x ? x.sigle : '' : kind === 'users' && 'email' in x ? <EntityName kind="institutions" id={x.institutionId} fallback="National"/> : kind === 'departments' && 'typeUnite' in x ? x.typeUnite : ''}</small></span></button></td><td>{'code' in x ? <code>{x.code}</code> : 'email' in x ? <><span>{x.email ?? '—'}</span><small className="cell-sub">Identité SSO liée</small></> : null}</td><td>{'scope' in x ? <Badge value={x.scope}/> : 'typeInstitution' in x ? <span className="tag">{label('institutionType', x.typeInstitution)}</span> : 'institutionId' in x ? <EntityName kind="institutions" id={x.institutionId} fallback="—"/> : null}</td><td><Badge value={x.status}/></td><td><span className="version-number">v{x.version}</span></td><td><button className="icon-btn" aria-label={'Ouvrir ' + (x.nom ?? x.id)} onClick={() => navigate('/app/' + kind + '/' + x.id)}><Icon name="chevron" size={17}/></button></td></tr>)}</tbody></table></div>{!rows.length && <Empty title={filter || status ? 'Aucun résultat sur cette page' : 'Aucune ressource dans ce périmètre'} description={filter || status ? 'Les filtres portent uniquement sur les éléments chargés. Passez à la page suivante ou retirez les filtres.' : 'Les ressources apparaîtront après une création autorisée.'}/>}<Pagination page={page} hasMore={q.data!.hasMore} count={q.data!.items.length} onChange={setPage}/></>}
 </div>}
 <p className="page-note"><Icon name="shield" size={15}/>Les filtres d’affichage ne remplacent jamais les autorisations du backend.</p>{create && <EntityForm kind={kind} onClose={() => setCreate(false)} onSuccess={q.refresh}/>}{importing && kind === 'institutions' && <InstitutionImport onClose={() => setImporting(false)} onDone={q.refresh}/>}{importing && kind === 'departments' && <DepartmentImport initialInstitutionId={scope.institutionId ?? null} onClose={() => setImporting(false)} onDone={q.refresh}/>}</>;
}
