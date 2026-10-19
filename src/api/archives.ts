import type { DescriptionEnrichment } from '../core/archiveEnrichment';
import type { Transport } from '../core/http';
import { uuid } from '../core/validation';
import type { RelationInput, RelationView } from '../core/authorityRelations';
import type { InstitutionFicheInput, InstitutionFicheView } from '../core/institutionFiche';
import type { FunctionDetailView, FunctionInput, FunctionLinkInput, FunctionLinkView, FunctionView } from '../core/archivalFunctions';
export const archiveLevels = ['FONDS', 'SOUS_FONDS', 'SERIE', 'SOUS_SERIE', 'DOSSIER', 'PIECE'] as const;
export type ArchiveLevel = typeof archiveLevels[number];
export type ArchiveKind = 'descriptions' | 'authorities';
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
export interface CsvPreview { hash: string; rows: number; issues: { row: number; message: string }[] }
/** Import d'un EAD3 : `unit` est le rang de l'unité dans le fichier (0 : le fichier entier). */
export interface EadIssue { unit: number; reference: string | null; message: string }
export interface EadOutlineEntry { rank: number; depth: number; level: string | null; reference: string | null; title: string | null }
export interface EadPreview { hash: string; units: number; issues: EadIssue[]; warnings: string[]; outline: EadOutlineEntry[] }
export class ArchivesApi {
    constructor(private transport: Transport) { }
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
    /** Fiche du service d'archives (ISDIAH) d'une institution. */
    fiche(institution: string, signal?: AbortSignal): Promise<InstitutionFicheView> { return this.transport.request(`/archives/institutions/${uuid(institution)}/fiche`, { signal }); }
    saveFiche(institution: string, input: InstitutionFicheInput, key: string, signal?: AbortSignal): Promise<InstitutionFicheView> {
        return this.transport.request(`/archives/institutions/${uuid(institution)}/fiche`, { method: 'PUT', body: input, idempotencyKey: key, signal });
    }
    previewEad(institutionId: string, xml: string, confidentiality: string, signal?: AbortSignal): Promise<EadPreview> {
        return this.transport.request('/archives/imports/ead/preview', { method: 'POST', body: { institutionId, xml, confidentiality }, idempotencyKey: crypto.randomUUID(), signal });
    }
    importEad(institutionId: string, xml: string, confidentiality: string, previewHash: string, key: string, signal?: AbortSignal): Promise<{ count: number }> {
        return this.transport.request('/archives/imports/ead', { method: 'POST', body: { institutionId, xml, confidentiality, previewHash }, idempotencyKey: key, signal });
    }
    preview(institutionId: string, kind: ArchiveKind, csv: string, signal?: AbortSignal): Promise<CsvPreview> {
        return this.transport.request('/archives/imports/preview', { method: 'POST', body: { institutionId, kind, csv }, idempotencyKey: crypto.randomUUID(), signal });
    }
    import(institutionId: string, kind: ArchiveKind, csv: string, previewHash: string, key: string, signal?: AbortSignal): Promise<{ count: number }> {
        return this.transport.request('/archives/imports', { method: 'POST', body: { institutionId, kind, csv, previewHash }, idempotencyKey: key, signal });
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
