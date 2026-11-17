import React, { useState } from 'react';
import type { AcquisitionApi, AcquisitionOperation, AcquisitionOperationType, AcquisitionHistoryFilters } from '../api/acquisition';
import { Busy, Empty, ErrorNotice, Field, Pagination, formatDate, useResource } from './components';
import { useWorkspace } from './workspace';
import { navigate } from './navigation';

export const acquisitionStates: Record<string,string> = { PREVIEW:'À confirmer',EXPIRED:'Aperçu expiré',COMMITTED:'Import réalisé',CANCELLED:'Annulé',
    QUEUED:'En attente',RUNNING:'Extraction en cours',TO_REVIEW:'À relire',REVIEWED:'Examen enregistré',FAILED:'Échec' };
const kinds:Record<string,string> = { DOCUMENTS:'Documents',DOSSIERS:'Dossiers',INSTITUTIONS:'Institutions',DEPARTMENTS:'Départements',ARCHIVES_PHYSIQUES:'Archives physiques' };
const actions:Record<string,string> = { ACQUISITION_IMPORT_PREVIEW:'Aperçu créé',ACQUISITION_IMPORT_COMMITTED:'Lot importé',ACQUISITION_IMPORT_CANCELLED:'Lot annulé',
    ACQUISITION_EXTRACTION_REQUESTED:'Extraction demandée',EXTRACTION_STARTED:'Extraction démarrée',EXTRACTION_COMPLETED:'Résultat prêt à relire',
    EXTRACTION_FAILED:'Extraction en échec',ACQUISITION_EXTRACTION_REVIEWED:'Décision enregistrée',ACQUISITION_EXTRACTION_CANCELLED:'Extraction annulée' };
const codes:Record<string,string> = { WORKER_INTERRUPTED:'Le moteur a été interrompu.',HUMAN_REVIEW_REQUIRED:'Le résultat attend une relecture humaine.',
    WORKER_STARTED:'Le moteur a pris en charge le fichier.' };

export function OperationEvents({api,type,id}:{api:AcquisitionApi;type:AcquisitionOperationType;id:string}) {
    const [page,setPage]=useState(0);
    const q=useResource(s=>api.operationEvents(type,id,page,s),type+id+page);
    return <section aria-label="Journal de l’opération" className="acq-sub"><h3>Journal de l’opération</h3>
        <p>Étapes enregistrées, de la plus récente à la plus ancienne. Les anciens événements non enregistrés ne sont pas reconstitués.</p>
        {q.loading?<Busy/>:q.error?<ErrorNotice error={q.error} onRetry={q.refresh}/>:q.data&&<>
            {q.data.items.length?<ol className="acq-events">{q.data.items.map(x=><li key={x.id}>
                <strong>{actions[x.action]??x.action}</strong><div>{formatDate(x.occurredAt)} · {x.performedBy}</div>
                {x.decision&&<p>Décision : {x.decision==='ACCEPTED'?'Acceptée':x.decision==='REJECTED'?'Rejetée':x.decision}</p>}
                {x.reason&&<p>Motif : {x.reason}</p>}{x.resultCode&&<small>{codes[x.resultCode]??x.resultCode}</small>}
            </li>)}</ol>:<Empty title="Aucun événement enregistré"/>}
            <Pagination page={page} hasMore={q.data.hasMore} count={q.data.items.length} onChange={setPage}/>
        </>}
    </section>;
}
export function OperationJournal({api,type,id}:{api:AcquisitionApi;type:AcquisitionOperationType;id:string}) {
    const [show,setShow]=useState(false);
    return <div><button className="btn secondary" aria-expanded={show} onClick={()=>setShow(!show)}>Journal de l’opération</button>
        {show&&<OperationEvents api={api} type={type} id={id}/>}</div>;
}
export function AcquisitionHistory({api}:{api:AcquisitionApi}) {
    const {scope}=useWorkspace();
    const [draft,setDraft]=useState({q:'',type:'',state:'',from:'',to:''});
    const [filters,setFilters]=useState(draft),[page,setPage]=useState(0),[selected,setSelected]=useState<AcquisitionOperation|null>(null);
    const request:AcquisitionHistoryFilters={...filters,type:filters.type as AcquisitionOperationType|'',institutionId:scope.institutionId??undefined,
        departmentId:scope.departmentId??undefined,page};
    const q=useResource(s=>api.operations(request,s),JSON.stringify(request));
    const invalidDates=Boolean(draft.from&&draft.to&&draft.from>draft.to);
    const states=draft.type==='IMPORT'?['PREVIEW','EXPIRED','COMMITTED','CANCELLED']:draft.type==='EXTRACTION'?['QUEUED','RUNNING','TO_REVIEW','REVIEWED','FAILED','CANCELLED']:Object.keys(acquisitionStates);
    return <section className="acq-panel"><h2>Historique de mes opérations</h2>
        <p>Retrouvez vos imports et extractions enregistrés, dans le périmètre sélectionné et selon vos droits actuels. La recherche porte sur toutes les pages.</p>
        <form onSubmit={event=>{event.preventDefault();if(invalidDates)return;setFilters(draft);setPage(0);setSelected(null);q.refresh();}}>
            <div className="acq-grid">
                <Field label="Rechercher une opération"><input aria-label="Rechercher une opération" value={draft.q} maxLength={200} placeholder="Fichier, référence ou identifiant" onChange={e=>setDraft({...draft,q:e.target.value})}/></Field>
                <Field label="Type d’opération"><select aria-label="Type d’opération" value={draft.type} onChange={e=>setDraft({...draft,type:e.target.value,state:''})}><option value="">Tous</option><option value="IMPORT">Imports</option><option value="EXTRACTION">Extractions</option></select></Field>
                <Field label="État de l’opération"><select aria-label="État de l’opération" value={draft.state} onChange={e=>setDraft({...draft,state:e.target.value})}><option value="">Tous les états</option>{states.map(s=><option key={s} value={s}>{acquisitionStates[s]}</option>)}</select></Field>
                <Field label="Créée à partir du"><input aria-label="Créée à partir du" type="date" value={draft.from} onChange={e=>setDraft({...draft,from:e.target.value})}/></Field>
                <Field label="Créée jusqu’au"><input aria-label="Créée jusqu’au" type="date" value={draft.to} onChange={e=>setDraft({...draft,to:e.target.value})}/></Field>
            </div>
            {invalidDates&&<p role="alert">La date de fin doit suivre la date de début.</p>}
            <div className="acq-actions"><button className="btn" type="submit" disabled={invalidDates}>Rechercher</button>
                <button className="btn secondary" type="button" onClick={()=>{const empty={q:'',type:'',state:'',from:'',to:''};setDraft(empty);setFilters(empty);setPage(0);setSelected(null);q.refresh();}}>Réinitialiser les filtres</button>
                <button className="btn secondary" type="button" onClick={()=>{q.refresh();setSelected(null);}}>Actualiser l’historique</button></div>
        </form>
        {q.loading?<Busy/>:q.error?<ErrorNotice error={q.error} onRetry={q.refresh}/>:q.data&&<>
            {q.data.items.length?<ul className="acq-history">{q.data.items.map(item=><li key={item.type+item.id}>
                <h3>{item.label}</h3><p><strong>{item.type==='IMPORT'?'Import · '+(kinds[item.kind??'']??item.kind):'Extraction'}</strong> · {acquisitionStates[item.state]??item.state}</p>
                <p>{item.institutionName??'Catalogue national'}{item.reference?' · '+item.reference:''}</p>
                <p>Créée le {formatDate(item.createdAt)} · mise à jour le {formatDate(item.updatedAt)}</p>
                {item.rowCount!==null&&<p>{item.rowCount} lignes · {item.createdCount} notices créées{item.valid===false?' · erreurs à corriger':''}</p>}
                {item.state==='EXPIRED'&&<p>L’aperçu a expiré : relisez le résultat, puis préparez un nouvel import corrigé si nécessaire.</p>}
                {item.errorCode&&<p>{codes[item.errorCode]??item.errorCode}</p>}
                {!item.canResume&&<p>Le fichier source n’est plus disponible ou vérifié. Le journal reste consultable.</p>}
                <div className="acq-actions"><button className="btn secondary" onClick={()=>setSelected(current=>current?.id===item.id&&current.type===item.type?null:item)} aria-expanded={selected?.id===item.id}>Voir le journal</button>
                    <button className="btn" disabled={!item.canResume} onClick={()=>navigate('/app/acquisition?tab='+(item.type==='IMPORT'?'imports':'extraction')+'&operationId='+encodeURIComponent(item.id))}>Ouvrir le traitement</button></div>
                <details><summary>Identifiant de l’opération</summary><p className="mono">{item.id}</p></details>
                {selected?.id===item.id&&<OperationEvents key={item.type+item.id+item.updatedAt} api={api} type={item.type} id={item.id}/>}
            </li>)}</ul>:<Empty title="Aucune opération trouvée" description="Modifiez les filtres ou le périmètre. Seules vos opérations encore accessibles sont affichées."/>}
            <Pagination page={page} hasMore={q.data.hasMore} count={q.data.items.length} onChange={p=>{setPage(p);setSelected(null);}}/>
        </>}
        <p className="subtle">Les fichiers refusés avant la création d’un lot ne figurent pas ici. Les scans temporaires du poste se retrouvent dans « Scanner un document » ; leurs extractions enregistrées apparaissent ici.</p>
    </section>;
}

