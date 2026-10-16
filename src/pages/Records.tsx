import { DossierCloseButton } from '../ui/DossierClose';
import { RecordDescriptionButton, descriptionEditable } from '../ui/RecordDescription';
import React, { useEffect, useState } from 'react';
import { useSession } from '../auth/session';
import { useWorkspace, RecordWorkspaceProvider } from '../ui/workspace';
import { navigate } from '../ui/navigation';
import { PageHead, Badge, Busy, ErrorNotice, Empty, Pagination, useResource, CopyId, formatDate, Modal, Field, Notice } from '../ui/components';
import { Tabs } from '../ui/Tabs';
import { Icon } from '../ui/icons';
import { DocumentPremisPanel } from '../ui/PreservationPlanning';
import { ArkPanel } from '../ui/Dissemination';
import { DocumentFormPanel, KeywordsPanel } from '../ui/Vocabularies';
import { RecordForm } from './RecordForm';
import { AuditEventsTable, AuditDetailDialog } from './Audit';
import { HeritagePanel } from './Heritage';
import { RightsPanel } from './Rights';
import { MetadataPanel } from './Metadata';
import { WorkflowPanel } from './Workflow';
import { can } from '../core/policy';
import type { RecordCatalog, RecordDocument, Dossier, Page, Institution, Department, AuditEvent, ClassificationNode } from '../core/types';
import { DocumentArchivalPanel, DocumentRelationsPanel, DocumentTypeName, ClassificationName, DossierLink, DossierStructurePanel } from '../ui/RecordInfo';
import { SignaturesPanel } from '../ui/Signatures';
import { DocumentIntermediateNotice } from '../ui/Intermediate';
import { DocumentTransferNotice } from '../ui/ArchiveTransfers';
import { DocumentSamplingNotice } from '../ui/SamplingCampaigns';
import { PendingUpload, VersionsPanel } from '../ui/RecordFiles';
import { ActorsPanel } from '../ui/RecordActors';
import { PublicationPanel } from '../ui/RecordPublication';
import { LegalHoldsPanel, RetentionPanel } from '../ui/RecordRetention';
export { UploadDialog, PreservationDialog, PreservationEventListPage, VersionsPanel } from '../ui/RecordFiles';
export { AttachActorDialog } from '../ui/RecordActors';
export { ValidateDispositionDialog, EventDispositions, ReleaseHoldDialog, RetentionPanel } from '../ui/RecordRetention';

function useInstitutionNames() {
    const { api, epoch, me } = useSession();
    const q = useResource<Page<Institution>>(s => !me?.grants.some(g=>g.permission==='IAM_INSTITUTION_READ') ? Promise.resolve({items:[],page:0,size:100,hasMore:false}) : api!.list<Institution>('institutions', { page: 0, size: 100 }, s), 'institutions-lookup:' + epoch);
    return (id: string | null) => id ? (q.data?.items.find(i => i.id === id)?.nom ?? 'Institution non disponible') : '—';
}

function useDepartmentNames(institutionId: string | null) {
    const { api, epoch } = useSession();
    const q = useResource<Page<Department>>(s => institutionId ? api!.list<Department>('departments', { institutionId, page: 0, size: 100 }, s) : Promise.resolve({ items: [], page: 0, size: 100, hasMore: false }), 'departments-lookup:' + institutionId + epoch);
    return (id: string | null) => id ? (q.data?.items.find(d => d.id === id)?.nom ?? 'Département non disponible') : '—';
}

const recordMeta: Record<RecordCatalog, {
    name: string;
    singular: string;
    icon: string;
    description: string;
}> = {
    documents: { name: 'Documents', singular: 'document', icon: 'document', description: 'Les notices documentaires connues du backend, avec leur cote et leur statut réels.' },
    dossiers: { name: 'Dossiers', singular: 'dossier', icon: 'archive', description: 'Les dossiers regroupant des pièces, tels qu’enregistrés par le backend.' }
};

export function RecordCatalogPage({ kind }: {
    kind: RecordCatalog;
}) {
    const { me, records, epoch } = useSession();
    const { scope } = useWorkspace();
    const institutionName = useInstitutionNames();
    const [page, setPage] = useState(0);
    const [filter, setFilter] = useState('');
    const [create, setCreate] = useState(false);
    const [pendingUpload, setPendingUpload] = useState<{
        documentId: string;
        file: File;
    } | null>(null);
    const m = recordMeta[kind];
    useEffect(() => { setPage(0); setFilter(''); }, [kind, scope.institutionId, scope.departmentId]);
    const params = { page, size: 20, institutionId: scope.institutionId, departmentId: scope.departmentId };
    const q = useResource<Page<RecordDocument | Dossier>>(s => kind === 'documents' ? records!.documents(params, s) : records!.dossiers(params, s), JSON.stringify(['records', kind, params, epoch]));
    const rows = (q.data?.items ?? []).filter(x => JSON.stringify([x.title, x.reference]).toLowerCase().includes(filter.toLowerCase()));
    const creatable = can(me, kind === 'documents' ? 'DOCUMENT_CREATE' : 'DOSSIER_CREATE', scope);
    return <><PageHead eyebrow="MODULE · DOCUMENTS ET DOSSIERS" title={m.name} description={m.description}>{creatable && <button className="btn primary" onClick={() => setCreate(true)}><Icon name="plus" size={18}/>Ajouter {kind === 'documents' ? 'un document' : 'un dossier'}</button>}</PageHead>
        <div className="panel"><div className="table-toolbar"><div className="input-icon search-box"><Icon name="search"/><input aria-label={'Filtrer ' + m.name} placeholder="Filtrer les éléments de cette page…" value={filter} onChange={e => setFilter(e.target.value)}/></div><div className="toolbar-right"><button className="icon-btn" aria-label="Actualiser la liste" onClick={q.refresh}><Icon name="refresh" size={18}/></button></div></div>
        {q.loading ? <Busy /> : q.error ? <div className="panel-padding"><ErrorNotice error={q.error} onRetry={q.refresh}/></div> : <><div className="table-scroll"><table><thead><tr><th>Intitulé</th><th>Cote</th><th>Rattachement</th><th>Statut archivistique</th><th>Confidentialité</th><th><span className="sr-only">Consulter</span></th></tr></thead><tbody>{rows.map(x => <tr key={x.id}><td><button className="record-name" onClick={() => navigate('/app/' + kind + '/' + x.id)}><span className={'table-avatar ' + kind}><Icon name={m.icon} size={19}/></span><strong>{x.title}</strong></button></td><td><code>{x.reference}</code></td><td>{institutionName(x.institutionId)}</td><td><Badge value={x.archivalStatus}/></td><td><Badge value={x.confidentiality}/></td><td><button className="icon-btn" aria-label={'Ouvrir ' + x.title} onClick={() => navigate('/app/' + kind + '/' + x.id)}><Icon name="chevron" size={17}/></button></td></tr>)}</tbody></table></div>{!rows.length && <Empty title={filter ? 'Aucun résultat sur cette page' : 'Aucune ressource dans ce périmètre'} description={filter ? 'Le filtre porte uniquement sur les éléments déjà chargés. Passez à la page suivante ou retirez le filtre.' : 'Les ressources apparaîtront après une création autorisée côté backend.'}/>}<Pagination page={page} hasMore={q.data!.hasMore} count={q.data!.items.length} onChange={setPage}/></>}
        </div>
        <p className="page-note"><Icon name="shield" size={15}/>Les filtres d’affichage ne remplacent jamais les autorisations du backend.</p>
        {create && <RecordForm kind={kind} onClose={() => setCreate(false)} onCreated={(data, file) => { q.refresh(); setCreate(false); if (kind === 'documents' && file) setPendingUpload({ documentId: data.id, file }); }}/>}
        {pendingUpload && <PendingUpload documentId={pendingUpload.documentId} file={pendingUpload.file} onClose={() => setPendingUpload(null)} onSuccess={() => setPendingUpload(null)}/>}</>;
}

function AuditPanel({ objectType, objectId }: {
    objectType: string;
    objectId: string;
}) {
    const { me, audit, epoch } = useSession();
    const [page, setPage] = useState(0);
    const [selected, setSelected] = useState<AuditEvent | null>(null);
    const size = 20;
    const canRead = can(me, 'AUDIT_READ', {});
    const q = useResource(s => audit!.objectEvents(objectType, objectId, page, size, s), 'object-audit:' + objectType + objectId + page + epoch);
    if (!canRead)
        return null;
    const rows = q.data?.items ?? [];
    return <section className="panel"><div className="section-heading"><h3>Journal</h3></div>
        {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh}/> : rows.length ? <><AuditEventsTable rows={rows} onSelect={setSelected}/><Pagination page={page} hasMore={q.data!.hasMore} count={rows.length} onChange={setPage}/></> : <Empty title="Aucun événement journalisé" icon="clock"/>}
        {selected && <AuditDetailDialog event={selected} onClose={() => setSelected(null)}/>}
    </section>;
}

function ReclassifyDialog({ documentId, institutionId, currentNodeId, onClose, onSuccess }: {
    documentId: string;
    institutionId: string;
    currentNodeId: string | null;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const { records, classification } = useSession();
    const nodesQ = useResource<ClassificationNode[]>(s => classification!.nodes(institutionId, s), 'reclassify-nodes:' + institutionId);
    const [nodeId, setNodeId] = useState(currentNodeId ?? '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy)
            return;
        setBusy(true);
        setError(null);
        try {
            await records!.classify(documentId, nodeId || null, crypto.randomUUID());
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
    return <Modal title="Reclasser le document" onClose={onClose} locked={busy}><form onSubmit={submit}><div className="form-grid">
        <Field label="Nœud de classement" wide hint="Vide pour retirer le classement."><select value={nodeId} onChange={e => setNodeId(e.target.value)} disabled={busy || nodesQ.loading}><option value="">Aucun</option>{nodesQ.data?.map(n => <option key={n.id} value={n.id}>{n.code ? n.code + ' · ' : ''}{n.libelle}</option>)}</select></Field>
        </div>{Boolean(error) && <ErrorNotice error={error}/>}<footer className="modal-footer"><button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>{busy ? <span className="spinner"/> : <Icon name="arrow" size={17}/>} Enregistrer</button></footer></form></Modal>;
}

export function RecordDetailPage({ kind, id }: {kind: RecordCatalog; id: string;}) {
    const { me, records, epoch } = useSession();
    const q = useResource<RecordDocument | Dossier>(s => kind === 'documents' ? records!.document(id, s) : records!.dossier(id, s), 'record-detail:' + kind + id + epoch);
    const institutionName = useInstitutionNames();
    const departmentName = useDepartmentNames(q.data?.institutionId ?? null);
    const [reclassifying, setReclassifying] = useState(false);
    const [creatingChild, setCreatingChild] = useState(false);
    const [tab,setTab] = useState('description');
    if (q.loading) return <Busy />;
    if (q.error) return <ErrorNotice error={q.error} onRetry={q.refresh}/>;
    const e=q.data!;
    const scope={institutionId:e.institutionId,departmentId:e.departmentId};
    const allowed=(permission:string,national=false)=>can(me,permission,national?{}:scope);
    const isDocument=kind==='documents';
    const available=[
      {id:'description',label:'Description',show:true},
      {id:'files',label:'Fichiers & versions',show:isDocument&&allowed('DOCUMENT_READ')},
      {id:'workflow',label:'Traitement',show:isDocument&&allowed('WORKFLOW_READ')},
      {id:'rights',label:'Accès & diffusion',show:isDocument&&(allowed('RIGHTS_READ',true)||allowed('PUBLICATION_READ'))},
      {id:'preservation',label:'Conservation',show:isDocument&&(allowed('RETENTION_REVIEW')||allowed('LEGAL_HOLD_MANAGE')||allowed('HERITAGE_READ',true))},
      {id:'history',label:'Historique',show:allowed('AUDIT_READ',true)}
    ].filter(x=>x.show);
    const current=available.some(x=>x.id===tab)?tab:'description';
    const fields:[string,unknown][]=[['Référence interne',e.reference],['Institution',institutionName(e.institutionId)],['Département',departmentName(e.departmentId)],['Statut métier',e.businessStatus],['Classement',<ClassificationName id={e.classificationNodeId} institutionId={e.institutionId}/>],...(isDocument?[
        ['Type documentaire',<DocumentTypeName id={(e as RecordDocument).typeDocumentId}/>],['Dossier',(e as RecordDocument).dossierId?<DossierLink id={(e as RecordDocument).dossierId!}/>:null],['Diffusion',(e as RecordDocument).distributionStatus],['Origine',({ CREE: 'Créé', RECU: 'Reçu', IMPORTE: 'Importé', NUMERISE: 'Numérisé', VERSE: 'Versé' } as Record<string, string>)[(e as RecordDocument).origin ?? ''] ?? (e as RecordDocument).origin],['Institution détentrice',(e as RecordDocument).holderInstitutionId ? institutionName((e as RecordDocument).holderInstitutionId!) : null],['Transféré le',formatDate((e as RecordDocument).transferredAt)]
      ]:[['Ouvert le',formatDate((e as Dossier).openedOn)],['Clos le',formatDate((e as Dossier).closedOn)]]) as [string,unknown][]];
    return <RecordWorkspaceProvider scope={scope} key={kind+id+epoch}>
      <button className="back-link" onClick={()=>navigate('/app/'+kind)}>← Retour aux {recordMeta[kind].name.toLowerCase()}</button>
      <PageHead eyebrow="ARCHIVES · FICHE DOCUMENTAIRE" title={e.title} description={e.reference}>
        {!isDocument && <DossierCloseButton dossier={e as Dossier} onChanged={q.refresh} />}
        {isDocument&&allowed('DOCUMENT_CLASSIFY')&&<button className="btn secondary" onClick={()=>setReclassifying(true)}>Reclasser</button>}
      </PageHead>
      <div className="f3-status-summary"><span>Cycle archivistique <Badge value={e.archivalStatus}/></span><span>Confidentialité <Badge value={e.confidentiality}/></span></div>
      <Tabs label="Rubriques de la fiche" items={available} value={current} onChange={setTab}/>
      <section role="tabpanel" id="f3-active-tab-panel" className="f3-tab-panel" aria-label={available.find(x=>x.id===current)?.label}>
      {current==='description'&&<>
        <section className="panel f3-preview-description"><div className="section-heading"><h3>Description et contexte</h3>{descriptionEditable(e) && allowed(isDocument ? 'DOCUMENT_DESCRIPTION_UPDATE' : 'DOSSIER_DESCRIPTION_UPDATE') && <RecordDescriptionButton kind={kind} id={id} onChanged={q.refresh} />}</div>{e.description && <p style={{ whiteSpace: 'pre-wrap' }}>{e.description}</p>}{!isDocument && (e as Dossier).subject && <p><strong>Objet : </strong>{(e as Dossier).subject}</p>}<dl className="f3-description-list">{fields.map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v===null||v===undefined||v===''?'—':React.isValidElement(v)?v:String(v)}</dd></div>)}</dl><details className="f3-contract-details"><summary>Identifiants techniques</summary><CopyId value={id}/>{isDocument&&<p>Verrou de version : {(e as RecordDocument).versionLock}</p>}</details></section>
        {isDocument&&<DocumentArchivalPanel document={e as RecordDocument} canEdit={allowed('DOCUMENT_DESCRIPTION_UPDATE')} onChanged={q.refresh}/>}
        {isDocument&&<DocumentRelationsPanel document={e as RecordDocument} canEdit={allowed('DOCUMENT_DESCRIPTION_UPDATE')}/>}
        {isDocument&&allowed('DOCUMENT_READ')&&<DocumentFormPanel documentId={id} canEdit={allowed('DOCUMENT_DESCRIPTION_UPDATE')&&!(e as RecordDocument).destroyed}/>}
        {isDocument&&allowed('DOCUMENT_READ')&&<KeywordsPanel kind="DOCUMENT" objectId={id} institutionId={e.institutionId} canEdit={allowed('DOCUMENT_DESCRIPTION_UPDATE')&&!(e as RecordDocument).destroyed}/>}
        {!isDocument&&allowed('DOSSIER_READ')&&<KeywordsPanel kind="DOSSIER" objectId={id} institutionId={e.institutionId} canEdit={allowed('DOSSIER_DESCRIPTION_UPDATE')}/>}
        {isDocument&&allowed('DOCUMENT_METADATA_READ')&&<MetadataPanel documentId={id}/>}
        {isDocument&&allowed('DOCUMENT_READ')&&<details className="f3-contract-details"><summary>Acteurs du document</summary><ActorsPanel documentId={id}/></details>}
        {!isDocument&&<DossierStructurePanel dossier={e as Dossier} canEdit={allowed('DOSSIER_DESCRIPTION_UPDATE')} canCreate={allowed('DOSSIER_CREATE')} onChanged={q.refresh} onCreateChild={()=>setCreatingChild(true)}/>}
      </>}
      {current==='files'&&<><VersionsPanel documentId={id} goTo={setTab}/>{isDocument&&allowed('DOCUMENT_READ')&&<SignaturesPanel documentId={id} canEdit={allowed('DOCUMENT_DESCRIPTION_UPDATE')} destroyed={!!(e as RecordDocument).destroyed}/>}</>}
      {current==='workflow'&&<WorkflowPanel documentId={id}/>}
      {current==='rights'&&<>{allowed('RIGHTS_READ',true)&&<RightsPanel documentId={id} institutionId={isDocument?e.institutionId:undefined} destroyed={isDocument&&!!(e as RecordDocument).destroyed}/>} {allowed('PUBLICATION_READ')&&<><Notice>Une publication enregistrée n’implique pas qu’un portail public anonyme soit déployé.</Notice><PublicationPanel documentId={id}/></>}</>}
      {current==='preservation'&&<>{isDocument&&allowed('RETENTION_REVIEW')&&<DocumentIntermediateNotice documentId={id}/>}{isDocument&&allowed('RETENTION_REVIEW')&&<DocumentTransferNotice documentId={id}/>}{isDocument&&allowed('RETENTION_REVIEW')&&<DocumentSamplingNotice documentId={id}/>}{allowed('RETENTION_REVIEW')&&<RetentionPanel documentId={id} dossierId={isDocument ? (e as RecordDocument).dossierId : null} businessStatus={e.businessStatus} onDocumentChanged={q.refresh}/>}{allowed('LEGAL_HOLD_MANAGE')&&<LegalHoldsPanel documentId={id} institutionId={e.institutionId} departmentId={e.departmentId}/>} {isDocument&&(allowed('DISSEMINATION_READ')||allowed('DISSEMINATION_MANAGE'))&&<ArkPanel objectType="DOCUMENT" objectId={id} institutionId={e.institutionId} canManage={allowed('DISSEMINATION_MANAGE')}/>} {isDocument&&allowed('PRESERVATION_EVENT_READ')&&<DocumentPremisPanel documentId={id} reference={e.reference} canManage={allowed('PRESERVATION_EVENT_MANAGE')} canExport={allowed('PRESERVATION_PACKAGE_EXPORT')}/>} {allowed('HERITAGE_READ',true)&&<HeritagePanel documentId={id}/>}</>}
      {current==='history'&&allowed('AUDIT_READ',true)&&<AuditPanel objectType={isDocument?'DOCUMENT':'DOSSIER'} objectId={id}/>}
      </section>
      {creatingChild&&<RecordForm kind="dossiers" parent={e as Dossier} onClose={()=>setCreatingChild(false)} onCreated={data=>{setCreatingChild(false);navigate('/app/dossiers/'+data.id);}}/>}
      {reclassifying&&<ReclassifyDialog documentId={id} institutionId={e.institutionId} currentNodeId={isDocument?(e as RecordDocument).classificationNodeId:null} onClose={()=>setReclassifying(false)} onSuccess={q.refresh}/>}
    </RecordWorkspaceProvider>;
}
