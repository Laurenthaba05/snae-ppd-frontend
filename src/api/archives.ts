import type { ArchiveExtent, ArchiveProducer, ArchiveProcessing, DescriptionEnrichment } from '../core/archiveEnrichment';
import type { Transport } from '../core/http';
import { uuid } from '../core/validation';
import type { RelationInput, RelationView } from '../core/authorityRelations';
import type { InstitutionFicheInput, InstitutionFicheView } from '../core/institutionFiche';
import type { FunctionDetailView, FunctionInput, FunctionLinkInput, FunctionLinkView, FunctionView, FunctionLinkHistoryPage } from '../core/archivalFunctions';
export const archiveLevels = ['FONDS', 'SOUS_FONDS', 'SERIE', 'SOUS_SERIE', 'DOSSIER', 'PIECE'] as const;
export type ArchiveLevel = typeof archiveLevels[number];
export type ArchiveKind = 'descriptions' | 'authorities';
export type ArchiveCsvKind = ArchiveKind | 'functions' | 'function-links';
export interface DescriptionInput {
    institutionId: string; code: string; title: string; level: ArchiveLevel; parentId: string | null;
    producerId: string | null; confidentiality: string; documentId: string | null; dossierId: string | null;
    details: Record<string, string>; version?: number; enrichment?: DescriptionEnrichment | null;
}
export interface AuthorityInput {
    institutionId: string; code: string; name: string; kind: 'PERSONNE' | 'COLLECTIVITE' | 'FAMILLE';
    actorId: string | null; details: Record<string, string>; version?: number;
}
export interface DescriptionView { id: string; input: DescriptionInput; version: number; updatedAt: string; createdAt?: string }
export interface AuthorityView { id: string; input: AuthorityInput; version: number; updatedAt: string; createdAt?: string }
export interface CsvEntry { row: number; reference: string; title: string; level: string; action: 'CREATE' | 'UPDATE' | 'UNCHANGED'; existingId: string | null; changes: EadChange[]; confidentiality: string; parent: string | null }
export interface CsvAuthorityEntry { row: number; code: string; name: string; kind: AuthorityInput['kind']; action: 'CREATE' | 'UPDATE' | 'UNCHANGED'; existingId: string | null; changes: EacChange[] }
export interface CsvFunctionEntry { row: number; code: string; name: string; kind: FunctionInput['kind']; action: 'CREATE' | 'UPDATE' | 'UNCHANGED'; existingId: string | null; changes: EadChange[]; parent: string | null }
export interface CsvFunctionLinkEntry { row: number; functionCode: string; functionName: string; targetKind: FunctionLinkInput['targetKind']; targetCode: string; targetName: string; nature: FunctionLinkInput['nature']; dateStart: string | null; dateEnd: string | null; description: string | null; action: 'CREATE' | 'UPDATE' | 'UNCHANGED'; existingId: string | null; changes: EadChange[] }
export interface CsvPreview { functionLinks?: CsvFunctionLinkEntry[]; functions?: CsvFunctionEntry[]; authorities?: CsvAuthorityEntry[]; hash: string; rows: number; issues: { row: number; message: string }[]; entries?: CsvEntry[]; created?: number; updated?: number; unchanged?: number }
export interface CsvImportResult { count: number; created?: number; updated?: number; unchanged?: number }
/** Import d'un EAD3 : `unit` est le rang de l'unité dans le fichier (0 : le fichier entier). */
export interface EadIssue { unit: number; reference: string | null; message: string }
export interface EadChange { field: string; before: string | null; after: string | null }
export interface EadImportResult { count: number; ids: string[]; created: number; updated: number; unchanged: number }
export interface EadOutlineEntry { action?: 'CREATE' | 'UPDATE' | 'UNCHANGED' | null; existingId?: string | null; changes?: EadChange[]; confidentiality?: string | null; parent?: string | null; extents?: ArchiveExtent[]; producers?: ArchiveProducer[]; producerId?: string | null; producerNames?: Record<string,string>; processing?: ArchiveProcessing | null; documentId?: string | null; dossierId?: string | null; identifiers?: Array<{ type: string; value: string; source?: string | null; label?: string | null; uri?: string | null }>; dates?: Array<{ type: string; start?: string | null; end?: string | null; expression?: string | null; certainty: string; calendar: string }>; primaryDate?: Record<string,string>; rank: number; depth: number; level: string | null; reference: string | null; title: string | null }
/** `format` : la version reconnue dans le fichier (« EAD3 » ou « EAD 2002 »). */
export interface EadPreview { created?: number; updated?: number; unchanged?: number; hash: string; units: number; issues: EadIssue[]; warnings: string[]; outline: EadOutlineEntry[]; format?: string }
export interface EacFile { name: string; xml: string }
export type EacAction = 'CREATE' | 'UPDATE' | 'UNCHANGED';
export interface EacChange { field: string; before: string | null; after: string | null }
export interface EacPreview {
    hash: string; format: string;
    authorities: Array<{file: string; recordId: string; code: string; name: string; kind: AuthorityInput['kind']; details: Record<string,string>; actorId: string | null; action: EacAction; existingId: string | null; changes: EacChange[]}>;
    relations: Array<{source: string; target: string; type: string; dateStart: string | null; dateEnd: string | null; description: string | null; action: EacAction; existingId: string | null; changes: EacChange[]}>;
    issues: Array<{file: string; message: string}>; warnings: string[];
}
export interface EacImportResult { count: number; relations: number; ids: string[]; created: number; updated: number; unchanged: number; relationsCreated: number; relationsUpdated: number; relationsUnchanged: number }

export type ArchiveBrowseKind = ArchiveKind | 'functions';
export type ArchiveBrowseRow = DescriptionView | AuthorityView | FunctionView;
export interface ArchiveBrowseRef { id: string; code: string; name: string; kind: string }
export interface ArchiveBrowseItem<T extends ArchiveBrowseRow> { row: T; ancestors: ArchiveBrowseRef[]; hasChildren: boolean; producerKnown: boolean; relationCount: number }
export interface ArchiveBrowsePage<T extends ArchiveBrowseRow> { items: ArchiveBrowseItem<T>[]; page: number; size: number; total: number; hasMore: boolean; searching: boolean }
export interface ArchiveBrowseQuery { q?: string; level?: string; kind?: string; status?: string; producerId?: string; parentId?: string; page?: number; size?: number }

export class ArchivesApi {
    constructor(private transport: Transport) { }
    browse<T extends ArchiveBrowseRow>(kind: ArchiveBrowseKind, institution: string, filters: ArchiveBrowseQuery = {}, signal?: AbortSignal): Promise<ArchiveBrowsePage<T>> {
        const params = new URLSearchParams({institutionId: uuid(institution)});
        for (const [key,value] of Object.entries(filters)) if (value !== undefined && value !== '') params.set(key,String(value));
        return this.transport.request('/archives/browse/' + kind + '?' + params.toString(), {signal});
    }

    descriptions(institution: string, signal?: AbortSignal): Promise<DescriptionView[]> { return this.transport.request(`/archives/descriptions?institutionId=${uuid(institution)}`, { signal }); }
    authorities(institution: string, signal?: AbortSignal): Promise<AuthorityView[]> { return this.transport.request(`/archives/authorities?institutionId=${uuid(institution)}`, { signal }); }
    save(kind: ArchiveKind, id: string | undefined, input: DescriptionInput | AuthorityInput, key: string, signal?: AbortSignal) {
        return this.transport.request(`/archives/${kind}${id ? '/' + uuid(id) : ''}`, { method: id ? 'PUT' : 'POST', body: input, idempotencyKey: key, signal });
    }
    /** Relations entre notices d'autorité (ISAAR 5.3) : toutes celles d'une institution, ou celles d'une notice. */
    relations(institution: string, signal?: AbortSignal): Promise<RelationView[]> { return this.transport.request(`/archives/relations?institutionId=${uuid(institution)}`, { signal }); }
    authorityRelations(authorityId: string, signal?: AbortSignal): Promise<RelationView[]> { return this.transport.request(`/archives/authorities/${uuid(authorityId)}/relations`, { signal }); }
    saveRelation(id: string | undefined, input: RelationInput, key: string, signal?: AbortSignal): Promise<RelationView> {
        return this.transport.request(`/archives/relations${id ? '/' + uuid(id) : ''}`, { method: id ? 'PUT' : 'POST', body: input, idempotencyKey: key, signal });
    }
    deleteRelation(id: string, institution: string, version: number, key: string, signal?: AbortSignal): Promise<{ id: string }> {
        return this.transport.request(`/archives/relations/${uuid(id)}/delete?institutionId=${uuid(institution)}&version=${Math.trunc(version)}`, { method: 'POST', body: {}, idempotencyKey: key, signal });
    }
    // ---- description des fonctions (ISDF)
    functions(institution: string, signal?: AbortSignal): Promise<FunctionView[]> { return this.transport.request(`/archives/functions?institutionId=${uuid(institution)}`, { signal }); }
    functionDetail(id: string, signal?: AbortSignal): Promise<FunctionDetailView> { return this.transport.request(`/archives/functions/${uuid(id)}`, { signal }); }
    saveFunction(id: string | undefined, input: FunctionInput, key: string, signal?: AbortSignal): Promise<FunctionView> {
        return this.transport.request(`/archives/functions${id ? '/' + uuid(id) : ''}`, { method: id ? 'PUT' : 'POST', body: input, idempotencyKey: key, signal });
    }
    deleteFunction(id: string, institution: string, version: number, key: string, signal?: AbortSignal): Promise<{ id: string }> {
        return this.transport.request(`/archives/functions/${uuid(id)}/delete?institutionId=${uuid(institution)}&version=${Math.trunc(version)}`, { method: 'POST', body: {}, idempotencyKey: key, signal });
    }
    addFunctionLink(input: FunctionLinkInput, key: string, signal?: AbortSignal): Promise<FunctionLinkView> {
        return this.transport.request('/archives/functions/links', { method: 'POST', body: input, idempotencyKey: key, signal });
    }
    removeFunctionLink(id: string, institution: string, version: number, key: string, signal?: AbortSignal): Promise<{ id: string }> {
        return this.transport.request(`/archives/functions/links/${uuid(id)}/delete?institutionId=${uuid(institution)}&version=${Math.trunc(version)}`, { method: 'POST', body: {}, idempotencyKey: key, signal });
    }
    updateFunctionLink(id:string,input:FunctionLinkInput,key:string,signal?:AbortSignal):Promise<FunctionLinkView> {
        return this.transport.request('/archives/functions/links/'+uuid(id),{method:'PUT',body:input,idempotencyKey:key,signal});
    }
    functionLinkHistory(id:string,page=0,size=20,signal?:AbortSignal):Promise<FunctionLinkHistoryPage> {
        return this.transport.request('/archives/functions/'+uuid(id)+'/links/history?page='+page+'&size='+size,{signal});
    }
    /** Fiche du service d'archives (ISDIAH) d'une institution. */
    fiche(institution: string, signal?: AbortSignal): Promise<InstitutionFicheView> { return this.transport.request(`/archives/institutions/${uuid(institution)}/fiche`, { signal }); }
    saveFiche(institution: string, input: InstitutionFicheInput, key: string, signal?: AbortSignal): Promise<InstitutionFicheView> {
        return this.transport.request(`/archives/institutions/${uuid(institution)}/fiche`, { method: 'PUT', body: input, idempotencyKey: key, signal });
    }
    previewEac(institutionId: string, files: EacFile[], signal?: AbortSignal, updateExisting = false): Promise<EacPreview> {
        return this.transport.request('/archives/imports/eac/preview', { method: 'POST', body: {institutionId, files, updateExisting}, idempotencyKey: crypto.randomUUID(), signal });
    }
    importEac(institutionId: string, files: EacFile[], previewHash: string, key: string, signal?: AbortSignal, updateExisting = false): Promise<EacImportResult> {
        return this.transport.request('/archives/imports/eac', { method: 'POST', body: {institutionId, files, previewHash, updateExisting}, idempotencyKey: key, signal });
    }
    previewEad(institutionId: string, xml: string, confidentiality: string, signal?: AbortSignal, updateExisting = false): Promise<EadPreview> {
        return this.transport.request('/archives/imports/ead/preview', { method: 'POST', body: { institutionId, xml, confidentiality, updateExisting }, idempotencyKey: crypto.randomUUID(), signal });
    }
    importEad(institutionId: string, xml: string, confidentiality: string, previewHash: string, key: string, signal?: AbortSignal, updateExisting = false): Promise<EadImportResult> {
        return this.transport.request('/archives/imports/ead', { method: 'POST', body: { institutionId, xml, confidentiality, previewHash, updateExisting }, idempotencyKey: key, signal });
    }
    preview(institutionId: string, kind: ArchiveCsvKind, csv: string, signal?: AbortSignal, updateExisting = false): Promise<CsvPreview> {
        return this.transport.request('/archives/imports/preview', { method: 'POST', body: { institutionId, kind, csv, updateExisting }, idempotencyKey: crypto.randomUUID(), signal });
    }
    import(institutionId: string, kind: ArchiveCsvKind, csv: string, previewHash: string, key: string, signal?: AbortSignal, updateExisting = false): Promise<CsvImportResult> {
        return this.transport.request('/archives/imports', { method: 'POST', body: { institutionId, kind, csv, previewHash, updateExisting }, idempotencyKey: key, signal });
    }
    file(path: string, signal?: AbortSignal): Promise<Blob> { return this.transport.request('/archives/' + path, { responseType: 'blob', signal }); }
}
/** Preserve the same intention when a network failure is retried. */
export function commandKey(previous: { payload: string; key: string } | null, payload: unknown) {
    const text = JSON.stringify(payload);
    return previous?.payload === text ? previous : { payload: text, key: crypto.randomUUID() };
}
export function flattenDescriptions(rows: DescriptionView[]): { row: DescriptionView; depth: number }[] {
    const children = new Map<string, DescriptionView[]>();
    for (const row of rows) { const id = row.input.parentId ?? ''; children.set(id, [...(children.get(id) ?? []), row]); }
    const result: { row: DescriptionView; depth: number }[] = []; const visited = new Set<string>();
    function walk(id: string, depth: number) {
        for (const row of (children.get(id) ?? []).sort((a, b) => a.input.code.localeCompare(b.input.code))) {
            if (visited.has(row.id)) continue;
            visited.add(row.id); result.push({ row, depth }); if (depth < 6) walk(row.id, depth + 1);
        }
    }
    walk('', 0); return result;
}
