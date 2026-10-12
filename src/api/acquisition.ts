import type { Transport } from '../core/http';
import { uuid } from '../core/validation';
export type ImportKind = 'INSTITUTIONS'|'DEPARTMENTS'|'DOSSIERS'|'DOCUMENTS';
export interface ImportIssue { row:number; field:string; code:string; message:string }
export interface ImportPreview { id:string; context:{kind:ImportKind;institutionId:string|null;departmentId:string|null}; sourceSha256:string; state:string; expiresAt:string; valid:boolean; rows:{number:number;values:Record<string,string>;issues:ImportIssue[]}[]; created:{row:number;reference:string;id:string;initialVersionId:string|null;fileName:string|null}[] }
export interface ExtractionCandidate { field:string;value:string;page:number|null;evidence:string;source:string;ruleStrength:string;rule:string;requiresReview:boolean }
export interface Extraction {id:string;fileId:string;documentId:string;state:string;sourceSha256:string;documentVersion:number;options:{ocr:string;language:string};errorCode:string|null;result:null|{technical:Record<string,unknown>;text:string;pages:Record<string,unknown>[];candidates:ExtractionCandidate[];warnings:string[]};review:Record<string,unknown>|null}
export interface ExtractionReview {expectedDocumentVersion:number;accept:boolean;applyTitle:boolean;title:string|null;applyDate:boolean;documentDate:string|null;publishVerifiedText:boolean;reason:string;correctedText?:string|null}
export interface Capabilities {importsEnabled:boolean;extractionEnabled:boolean;workerEnabled:boolean;maxImportBytes:number;maxImportRows:number}
export class AcquisitionApi {
  constructor(readonly transport:Transport){}
  capabilities(signal?:AbortSignal){return this.transport.request<Capabilities>('/acquisition/capabilities',{signal});}
  preview(file:File,fields:Record<string,string>,key:string){if(!this.transport.upload)throw new Error('Dépôt indisponible.');return this.transport.upload<ImportPreview>('/acquisition/imports/preview',file,fields,key);}
  import(id:string){return this.transport.request<ImportPreview>('/acquisition/imports/'+uuid(id));}
  commit(item:ImportPreview){return this.transport.request<ImportPreview>(`/acquisition/imports/${uuid(item.id)}/commit`,{method:'POST',body:{expectedSha256:item.sourceSha256},idempotencyKey:'commit:'+item.id});}
  cancelImport(id:string){return this.transport.request<ImportPreview>(`/acquisition/imports/${uuid(id)}/cancel`,{method:'POST',idempotencyKey:'cancel:'+id});}
  csv(path:string){return this.transport.request<Blob>('/acquisition/imports/'+path,{responseType:'blob'});}
  extract(fileId:string,options:{ocr:string;language:string},key:string){return this.transport.request<Extraction>(`/acquisition/files/${uuid(fileId)}/extractions`,{method:'POST',body:options,idempotencyKey:key});}
  extraction(id:string,signal?:AbortSignal){return this.transport.request<Extraction>('/acquisition/extractions/'+uuid(id),{signal});}
  review(item:Extraction,body:ExtractionReview,key:string){return this.transport.request<Extraction>(`/acquisition/extractions/${uuid(item.id)}/review`,{method:'POST',body,idempotencyKey:key});}
  cancelExtraction(id:string){return this.transport.request<Extraction>(`/acquisition/extractions/${uuid(id)}/cancel`,{method:'POST',idempotencyKey:'cancel:'+id});}
}
/** The bridge uses a distinct ephemeral pairing token, NEVER the application's JWT. */
export class ScannerClient {
  readonly base:string;
  constructor(base:string,private readonly token:string){
    const u=new URL(base); if(u.hostname!=='127.0.0.1'||u.username||u.password||u.pathname!=='/'||u.search||u.hash||!u.port)throw new Error('Connecteur local 127.0.0.1 avec port requis.');
    const localUi=['127.0.0.1','localhost','[::1]'].includes(location.hostname);
    if(u.protocol!=='https:'&&!(u.protocol==='http:'&&localUi))throw new Error('Le connecteur doit utiliser HTTPS hors développement local.');
    if(!/^[A-Za-z0-9_-]{40,100}$/.test(token))throw new Error('Code de jumelage invalide.'); this.base=u.origin;
  }
  async request<T>(path:string,body?:unknown,method:'GET'|'POST'|'DELETE'='GET',binary=false):Promise<T>{
    if(!/^\/(health|profiles|scans(?:\/[a-f0-9-]{36}(?:\/content)?)?)$/.test(path))throw new Error('Chemin du connecteur interdit.');
    const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),20000);
    try {const r=await fetch(this.base+path,{method,mode:'cors',credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',signal:controller.signal,headers:{Authorization:'Bearer '+this.token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
      if(!r.ok){const problem=await r.json().catch(()=>({error:'CONNECTOR_ERROR'}));throw new Error('Connecteur : '+String(problem.error));}
      return (binary?await r.blob():await r.json()) as T;
    }catch(e){if(e instanceof TypeError)throw new Error('Connecteur inaccessible. Vérifiez le certificat, le code, l’origine autorisée et la permission réseau local du navigateur.');throw e;}finally{clearTimeout(timer);}
  }
}
