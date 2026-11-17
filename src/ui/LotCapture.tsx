import { navigate } from './navigation';
import React, { useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { can } from '../core/policy';
import { IntentKey } from '../core/validation';
import { captureFileProblem } from '../core/lotCapture';
import type { CapturedDocument, LotContext, LotContextInput } from '../core/lotCapture';
import type { Ingestion, ScanLot, ScopeTarget } from '../core/types';
import { Busy, ErrorNotice, Field, Modal, Notice, useResource } from './components';
import { EntityName } from './names';
import { ArchiveRecordPicker } from './ArchiveRecordPicker';
import { classificationLabel, usableClassification } from './DocumentClassification';

export function LotContextSummary({ context: c }: {context: LotContext}) {
    return <div className="panel" aria-label="Contexte de classement validé">
        <p><strong>{c.lotCode} · {c.typeName}</strong></p>
        <p>Institution : <EntityName kind="institutions" id={c.institutionId}/>{c.departmentId && <> · Unité : <EntityName kind="departments" id={c.departmentId}/></>}</p>
        <p>Rubrique : {c.classificationName} · Responsable : {c.responsibleName}</p>
        <p>Confidentialité : {c.confidentiality}{c.dossierId ? ' · Dossier de destination défini' : ' · Sans dossier de destination'}</p>
        <p className="subtle">Validé le {new Date(c.validatedAt).toLocaleString('fr-FR')} par <EntityName kind="users" id={c.validatedBy}/>. Les nouveaux documents héritent de ce contexte. Pour changer de contexte, créez un autre lot.</p>
    </div>;
}
function ResponsiblePicker({lotId,value,onChange,disabled}: {lotId:string;value:string;onChange:(id:string)=>void;disabled:boolean}) {
    const {digitization}=useSession(); const [page,setPage]=useState(0),[term,setTerm]=useState('');
    const q=useResource(s=>digitization!.lotResponsibles(lotId,page,term,s),JSON.stringify([lotId,page,term]));
    const [chosen,setChosen]=useState<{id:string;name:string}|null>(null);
    return <Field label="Responsable du traitement *"><input aria-label="Rechercher un responsable" value={term} disabled={disabled} onChange={e=>{setTerm(e.target.value);setPage(0);}}/>
        {q.loading?<Busy/>:q.error?<ErrorNotice error={q.error} onRetry={q.refresh}/>:<>
            <select aria-label="Responsable du traitement" required value={value} disabled={disabled} onChange={e=>{onChange(e.target.value);setChosen(q.data?.find(x=>x.id===e.target.value)??null);}}>
                <option value="">Choisir un agent actif</option>{chosen&&!q.data?.slice(0,20).some(x=>x.id===chosen.id)&&<option value={chosen.id}>{chosen.name}</option>}
                {q.data?.slice(0,20).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>
            <button type="button" disabled={disabled||!page} onClick={()=>setPage(p=>p-1)}>Précédents</button><button type="button" disabled={disabled||!q.data||q.data.length<=20} onClick={()=>setPage(p=>p+1)}>Suivants</button>
        </>}</Field>;
}
export function LotContextDialog({lot,scope,onClose}: {lot:ScanLot;scope:ScopeTarget;onClose:()=>void}) {
    const {digitization,records,classification,me}=useSession();const [busy,setBusy]=useState(false),[error,setError]=useState<unknown>(null);
    const q=useResource(s=>digitization!.lotContext(lot.id,s),lot.id);
    const allowed=!!scope.institutionId&&can(me,'DOCUMENT_CREATE',scope)&&can(me,'DOCUMENT_CLASSIFY',scope)&&can(me,'DIGITIZATION_MANAGE',scope)&&lot.statut==='OUVERT';
    const [form,setForm]=useState<LotContextInput>({expectedVersion:lot.versionLock,typeDocumentId:'',classificationNodeId:'',responsibleId:'',dossierId:null,confidentiality:'INTERNE'});
    const [confirmed,setConfirmed]=useState(false);const keys=useRef(new IntentKey());
    const refs=useResource(async s=>allowed?{types:await records!.documentTypes(s),nodes:await classification!.nodes(scope.institutionId!,s)}:null,JSON.stringify([scope,allowed]));
    const set=<K extends keyof LotContextInput>(key:K,value:LotContextInput[K])=>setForm(f=>({...f,[key]:value}));
    return <Modal title={'Contexte du lot '+lot.code} onClose={onClose} locked={busy} wide>
        {q.loading?<Busy/>:q.error?<ErrorNotice error={q.error} onRetry={q.refresh}/>:q.data?.context?<LotContextSummary context={q.data.context}/>:!allowed?<Notice>Rattachez le projet à une institution. La validation exige les habilitations de gestion du traitement, de création et de classement documentaire.</Notice>:<form onSubmit={async e=>{e.preventDefault();if(!confirmed||busy)return;setBusy(true);setError(null);try{await digitization!.validateLotContext(lot.id,form,keys.current.forRequest('POST',lot.id,form));q.refresh();}catch(err){setError(err);}finally{setBusy(false);}}}>
            <Notice>Vérifiez ce contexte une fois. Chaque nouveau scan ou fichier déposé dans ce lot reprendra automatiquement ces valeurs. Les documents existants conservent leur classement.</Notice>
            <p>Institution : <EntityName kind="institutions" id={scope.institutionId}/>{scope.departmentId&&<> · <EntityName kind="departments" id={scope.departmentId}/></>}</p>
            {refs.loading?<Busy/>:refs.error?<ErrorNotice error={refs.error} onRetry={refs.refresh}/>:<div className="form-grid">
                <Field label="Type de document *"><select aria-label="Type du lot" required disabled={busy} value={form.typeDocumentId} onChange={e=>set('typeDocumentId',e.target.value)}><option value="">Décret, arrêté, circulaire…</option>{refs.data?.types.filter(x=>x.status==='ACTIF').map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select></Field>
                <Field label="Rubrique du plan *"><select aria-label="Rubrique du lot" required disabled={busy} value={form.classificationNodeId} onChange={e=>set('classificationNodeId',e.target.value)}><option value="">Choisir une rubrique active</option>{refs.data?.nodes.filter(x=>usableClassification(x,scope.institutionId!)).map(x=><option key={x.id} value={x.id}>{classificationLabel(x)}</option>)}</select></Field>
                <ResponsiblePicker lotId={lot.id} value={form.responsibleId} disabled={busy} onChange={id=>set('responsibleId',id)}/>
                <Field label="Confidentialité"><select aria-label="Confidentialité du lot" disabled={busy} value={form.confidentiality} onChange={e=>set('confidentiality',e.target.value as LotContextInput['confidentiality'])}>{['PUBLIC','INTERNE','CONFIDENTIEL','SECRET'].map(x=><option key={x}>{x}</option>)}</select></Field>
                {can(me,'DOSSIER_READ',scope)&&<Field label="Dossier de destination (facultatif)"><ArchiveRecordPicker kind="dossiers" institution={scope.institutionId!} department={scope.departmentId} value={form.dossierId} onChange={id=>set('dossierId',id)} disabled={busy}/></Field>}
            </div>}
            <label><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/>J’ai vérifié le contexte et j’autorise son affectation aux nouveaux documents de ce lot.</label>
            {error?<ErrorNotice error={error}/>:null}<footer className="modal-footer"><button className="btn primary" disabled={busy||!confirmed||!form.typeDocumentId||!form.classificationNodeId||!form.responsibleId||refs.loading||!!refs.error}>Valider le contexte du lot</button></footer>
        </form>}
    </Modal>;
}
type Source={blob:Blob;name:string;key:string};
type Row={file:File;title:string;key:string;created?:CapturedDocument;receipt?:Ingestion;linked?:boolean;message?:string};
export function LotDocumentDeposit({lot:fixedLot,source,ready=true,onStarted,onReceipt,onBusy}: {lot?:ScanLot;source?:Source;ready?:boolean;onStarted?:()=>void;onReceipt?:(receipt:Ingestion,doc:CapturedDocument)=>void;onBusy?:(busy:boolean)=>void}) {
    const {digitization,records,me}=useSession();const [projectId,setProjectId]=useState(''),[lotId,setLotId]=useState(fixedLot?.id??'');
    const projects=useResource(s=>!fixedLot?digitization!.projects(s):Promise.resolve([]),'capture-projects:'+!!fixedLot);
    const lots=useResource(s=>projectId?digitization!.lotsByProject(projectId,s):Promise.resolve([]),projectId);
    const context=useResource(s=>lotId?digitization!.lotContext(lotId,s):Promise.resolve({context:null}),'capture:'+lotId);
    const [rows,setRows]=useState<Row[]>(()=>source?[{file:new File([source.blob],source.name,{type:'application/pdf',lastModified:0}),title:source.name.replace(/\.pdf$/i,''),key:source.key}]:[]);
    const [busy,setBusy]=useState(false),[started,setStarted]=useState(false),[error,setError]=useState<unknown>(null);const lock=useRef(false);
    const c=context.data?.context;const allowed=!!c&&['DIGITIZATION_MANAGE','DOCUMENT_CREATE','FILE_INGEST'].every(p=>can(me,p,{institutionId:c.institutionId,departmentId:c.departmentId}));
    const refresh=()=>setRows([...rows]);
    const submit=async()=>{if(lock.current||!c||!allowed||!ready)return;const problem=captureFileProblem(rows.map(r=>r.file));if(problem){setError(new Error(problem));return;}lock.current=true;setBusy(true);onBusy?.(true);setStarted(true);onStarted?.();setError(null);
        try {for(const row of rows){
            row.created??=await digitization!.captureDocument(lotId,{title:row.title.trim(),origin:source?'NUMERISE':'IMPORTE'},'capture:'+lotId+':'+row.key);refresh();
            if(row.receipt)row.receipt=await records!.ingestion(row.receipt.id);
            else row.receipt=await records!.uploadContent(row.created.versionId,row.file,'PIECE_JOINTE','capture-upload:'+row.key+':'+row.created.versionId);
            if(row.receipt.fileId&&!row.linked){await digitization!.command('/elements/'+row.created.elementId+'/files/'+row.receipt.fileId,{typeSortie:'SOURCE'},'capture-link:'+row.key);row.linked=true;}
            row.message=row.receipt.status==='COMPLETED'?'Dépôt terminé — classement appliqué ; contrôles et OCR à suivre dans le traitement.':row.receipt.status==='PROCESSING'?'Contrôles en cours — relisez le reçu.':row.receipt.status==='REJECTED'?'Fichier rejeté — la notice et son historique sont conservés.':'Reprise nécessaire — consultez le reçu dans la notice.';
            refresh();onReceipt?.(row.receipt,row.created);
        }}catch(err){setError(err);}finally{lock.current=false;setBusy(false);onBusy?.(false);}
    };
    return <section className="acq-panel" aria-label="Dépôt dans un lot validé"><h3>Déposer dans un lot validé</h3>
        <p>Un fichier crée un document. Un PDF de plusieurs pages reste un seul document. Son classement vient du lot ; l’OCR est traité ensuite.</p>
        {!fixedLot&&<fieldset disabled={busy||started}><Field label="Projet de traitement"><select aria-label="Projet de dépôt" value={projectId} onChange={e=>{setProjectId(e.target.value);setLotId('');}}><option value="">Choisir un projet rattaché</option>{projects.data?.filter(p=>p.statut==='EN_COURS'&&p.institutionId).map(p=><option key={p.id} value={p.id}>{p.code} · {p.nom}</option>)}</select></Field>
            <Field label="Lot de destination"><select aria-label="Lot de dépôt" value={lotId} onChange={e=>setLotId(e.target.value)}><option value="">Choisir un lot ouvert</option>{lots.data?.filter(l=>l.statut==='OUVERT').map(l=><option key={l.id} value={l.id}>{l.code} · {l.nom}</option>)}</select></Field></fieldset>}
        {projects.error?<ErrorNotice error={projects.error} onRetry={projects.refresh}/>:null}{lots.error?<ErrorNotice error={lots.error} onRetry={lots.refresh}/>:null}
        {context.loading?<Busy/>:context.error?<ErrorNotice error={context.error} onRetry={context.refresh}/>:c?<LotContextSummary context={c}/>:lotId?<Notice>Ce lot n’a pas encore de contexte validé. Faites-le valider depuis Traitement → Lots de numérisation → Contexte du lot.</Notice>:null}
        {c&&!allowed&&<Notice>La gestion du traitement, la création documentaire et le dépôt de fichiers sont nécessaires dans l’institution de ce lot.</Notice>}
        {!source&&<Field label="PDF ou images à déposer"><input aria-label="Fichiers du lot" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff" disabled={busy||started||!allowed} onChange={e=>{setRows(Array.from(e.target.files??[]).map(file=>({file,title:file.name.replace(/\.[^.]+$/,''),key:crypto.randomUUID()})));setError(null);}}/></Field>}
        {rows.map((r,i)=><div key={r.key}><Field label={'Titre du document '+(i+1)}><input aria-label={'Titre du document '+(i+1)} required maxLength={500} value={r.title} disabled={busy||started} onChange={e=>setRows(xs=>xs.map((x,j)=>j===i?{...x,title:e.target.value}:x))}/></Field><small>{r.file.name}</small>{r.created&&<p><button type="button" className="text-link" onClick={()=>navigate('/app/documents/'+r.created!.documentId)}>{r.created.reference}</button></p>}{r.message&&<p role="status">{r.message}</p>}</div>)}
        {error?<ErrorNotice error={error}/>:null}{started&&<Notice>La destination est conservée pour reprendre cette même demande sans doublon. Les notices déjà créées restent accessibles même si un fichier est refusé.</Notice>}
        <button className="btn primary" disabled={busy||!allowed||!ready||!rows.length||rows.some(r=>!r.title.trim())} onClick={()=>void submit()}>{busy?'Dépôt en cours…':started?'Relire / reprendre les dépôts':'Créer, classer et déposer'}</button>
    </section>;
}
export function DocumentCaptureContext({documentId}: {documentId:string}) {
    const {digitization}=useSession();const q=useResource(s=>digitization!.documentCaptureContext(documentId,s),'document-capture:'+documentId);
    return q.loading?null:q.error?<ErrorNotice error={q.error} onRetry={q.refresh}/>:q.data?.context?<section aria-label="Provenance du classement"><h3>Contexte au dépôt</h3><LotContextSummary context={q.data.context}/><p>Ce contexte conserve la provenance initiale. Le classement actuel figure dans la description du document.</p></section>:null;
}
