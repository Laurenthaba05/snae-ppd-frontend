import type { Transport, RequestOptions } from '../core/http.js';
import { query } from '../core/http.js';
import { uuid } from '../core/validation.js';
import type { MetadataSchema, MetadataField, MetadataBinding, MetadataValue, MetadataFieldDefinition } from '../core/types.js';
import type { MetadataTemplate, MetadataTemplateInstance } from '../core/metadataTemplates.js';
export class MetadataApi {
    constructor(readonly transport: Transport) { }
    schemas(institutionId: string | null | undefined, signal?: AbortSignal): Promise<MetadataSchema[]> { return this.transport.request('/admin/metadata-schemas' + query({ institutionId }), { signal }); }
    fields(schemaId: string, signal?: AbortSignal): Promise<MetadataField[]> { return this.transport.request('/admin/metadata-schemas/' + uuid(schemaId) + '/fields', { signal }); }
    bindings(schemaId: string, signal?: AbortSignal): Promise<MetadataBinding[]> { return this.transport.request('/admin/metadata-schemas/' + uuid(schemaId) + '/document-types', { signal }); }
    documentMetadata(documentId: string, signal?: AbortSignal): Promise<MetadataValue[]> { return this.transport.request('/documents/' + uuid(documentId) + '/metadata', { signal }); }
    applicableFields(documentId: string, signal?: AbortSignal): Promise<MetadataFieldDefinition[]> { return this.transport.request('/documents/' + uuid(documentId) + '/metadata/schema', { signal }); }
    /** Les gabarits de schémas (Dublin Core, gestion des documents d'activité) : des valeurs d'exemple à relire. */
    templates(institutionId: string | null | undefined, signal?: AbortSignal): Promise<MetadataTemplate[]> { return this.transport.request('/admin/metadata-templates' + query({ institutionId }), { signal }); }
    instantiateTemplate(code: string, body: Record<string, unknown>, key: string): Promise<MetadataTemplateInstance> {
        return this.command('/admin/metadata-templates/' + encodeURIComponent(code) + '/instantiate', body, key);
    }
    command<T>(path: string, body: unknown, key: string, method: 'POST' | 'PUT' = 'POST'): Promise<T> { return this.transport.request(path, { method, body, idempotencyKey: key } satisfies RequestOptions); }
}
