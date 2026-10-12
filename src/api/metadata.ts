import type { Transport, RequestOptions } from '../core/http.js';
import { query } from '../core/http.js';
import { uuid } from '../core/validation.js';
import type { MetadataSchema, MetadataField, MetadataBinding, MetadataValue, MetadataFieldDefinition } from '../core/types.js';
export class MetadataApi {
    constructor(readonly transport: Transport) { }
    schemas(institutionId: string | null | undefined, signal?: AbortSignal): Promise<MetadataSchema[]> { return this.transport.request('/admin/metadata-schemas' + query({ institutionId }), { signal }); }
    fields(schemaId: string, signal?: AbortSignal): Promise<MetadataField[]> { return this.transport.request('/admin/metadata-schemas/' + uuid(schemaId) + '/fields', { signal }); }
    bindings(schemaId: string, signal?: AbortSignal): Promise<MetadataBinding[]> { return this.transport.request('/admin/metadata-schemas/' + uuid(schemaId) + '/document-types', { signal }); }
    documentMetadata(documentId: string, signal?: AbortSignal): Promise<MetadataValue[]> { return this.transport.request('/documents/' + uuid(documentId) + '/metadata', { signal }); }
    applicableFields(documentId: string, signal?: AbortSignal): Promise<MetadataFieldDefinition[]> { return this.transport.request('/documents/' + uuid(documentId) + '/metadata/schema', { signal }); }
    command<T>(path: string, body: unknown, key: string, method: 'POST' | 'PUT' = 'POST'): Promise<T> { return this.transport.request(path, { method, body, idempotencyKey: key } satisfies RequestOptions); }
}
