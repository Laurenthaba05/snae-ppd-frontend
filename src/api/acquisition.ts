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
export interface ScannerProfile {
  id: string; name: string; sources: string[]; resolutions: number[]; pageSizes: string[]; colorModes: string[];
}
export interface ScannerSettings { profileId: string; source: string; dpi: number; pageSize: string; colorMode: string }
export interface ScannerJob {
  id: string; state: 'SCANNING' | 'READY' | 'FAILED'; error?: string | null;
  createdAt?: string; expiresAt?: string; sizeBytes?: number | null; settings?: Partial<ScannerSettings>;
}
export const scannerErrors: Record<string, string> = {
  CONNECTOR_ACCESS_DENIED: 'Code de jumelage expiré ou incorrect. Vérifiez aussi l’origine autorisée dans le connecteur.',
  SCANNER_BUSY: 'Une numérisation est déjà en cours. Actualisez les scans du poste pour la retrouver.',
  SCANNER_JOB_LIMIT: 'Quatre scans temporaires sont conservés. Libérez une copie dont vous n’avez plus besoin.',
  SCANNER_DRIVER_ERROR: 'Le pilote n’a pas terminé le scan. Vérifiez le câble ou le réseau, le papier et le profil NAPS2.',
  SCANNER_TIMEOUT: 'Le scanner n’a pas terminé dans le délai de trois minutes. Vérifiez l’appareil avant une nouvelle tentative.',
  SCANNER_FAILED: 'La numérisation a échoué. Vérifiez le scanner et son profil NAPS2.',
  SCANNER_OUTPUT_LIMIT: 'Le PDF est vide ou dépasse la limite de 50 Mio. Réduisez le nombre de pages.',
  SCANNER_OUTPUT_NOT_PDF: 'Le scanner n’a pas produit de PDF valide.',
  INVALID_SCAN_OPTIONS: 'Ces réglages ne sont pas autorisés pour ce profil de scanner.',
  SCAN_NOT_FOUND: 'Ce scan a expiré ou a été effacé du poste.',
  SCAN_REQUEST_EXPIRED: 'Cette demande a déjà été traitée et sa copie a expiré ou été effacée. Actualisez les scans du poste.',
  SCAN_REQUEST_CONFLICT: 'La même demande ne peut pas être relancée avec des réglages différents.',
  SCANNER_SESSION_LIMIT: 'La limite de cette session est atteinte. Terminez les dépôts avant de redémarrer le connecteur.'
};
/** Distinct ephemeral pairing token: never the application JWT, never persisted. */
export class ScannerClient {
  readonly base: string;
  constructor(base: string, private readonly token: string) {
    const u = new URL(base);
    if (u.hostname !== '127.0.0.1' || u.username || u.password || u.pathname !== '/' || u.search || u.hash || !u.port)
      throw new Error('Connecteur local 127.0.0.1 avec port requis.');
    const localUi = ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && localUi && location.protocol === 'http:'))
      throw new Error('Le connecteur doit utiliser HTTPS hors développement local HTTP.');
    if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) throw new Error('Code de jumelage invalide.');
    this.base = u.origin;
  }
  async request<T>(path: string, body?: unknown, method: 'GET' | 'POST' | 'DELETE' = 'GET', binary = false, signal?: AbortSignal): Promise<T> {
    if (!/^\/(health|profiles|scans(?:\/[a-f0-9-]{36}(?:\/content)?)?)$/.test(path)) throw new Error('Chemin du connecteur interdit.');
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, {once: true});
    const timer = setTimeout(abort, 20000);
    try {
      const r = await fetch(this.base + path, {method, mode: 'cors', credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal,
        headers: {Authorization: 'Bearer ' + this.token, ...(body ? {'Content-Type': 'application/json'} : {})}, ...(body ? {body: JSON.stringify(body)} : {})});
      if (!r.ok) {const problem = await r.json().catch(() => ({error: 'CONNECTOR_ERROR'})); const code = String(problem.error); throw new Error(scannerErrors[code] ?? 'Connecteur : ' + code);}
      if (binary) {
        const blob = await r.blob();
        if (blob.type.split(';')[0] !== 'application/pdf' || !blob.size || blob.size > 50 * 1024 * 1024 || !(await blob.slice(0, 5).text()).startsWith('%PDF-'))
          throw new Error('Le connecteur n’a pas renvoyé un PDF valide de 50 Mio maximum.');
        return blob as T;
      }
      return await r.json() as T;
    } catch (e) {
      if (signal?.aborted) throw e;
      if (controller.signal.aborted) throw new Error('Le connecteur ne répond plus. Actualisez les scans du poste avant de relancer une demande.');
      if (e instanceof TypeError) throw new Error('Connecteur inaccessible. Vérifiez son démarrage, son adresse, le certificat, l’origine autorisée et la permission réseau local du navigateur.');
      throw e;
    } finally {clearTimeout(timer); signal?.removeEventListener('abort', abort);}
  }
}
