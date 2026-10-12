import type { Transport, RequestOptions } from '../core/http.js';
import { query } from '../core/http.js';
import { uuid } from '../core/validation.js';
import type { WorkflowDefinition, WorkflowStep, WorkflowTransition, WorkflowBinding, WorkflowInstance, WorkflowTaskActions } from '../core/types.js';
export class WorkflowApi {
    constructor(readonly transport: Transport) { }
    definitions(institutionId: string | null | undefined, signal?: AbortSignal): Promise<WorkflowDefinition[]> { return this.transport.request('/admin/workflow-definitions' + query({ institutionId }), { signal }); }
    steps(definitionId: string, signal?: AbortSignal): Promise<WorkflowStep[]> { return this.transport.request('/admin/workflow-definitions/' + uuid(definitionId) + '/steps', { signal }); }
    transitions(definitionId: string, signal?: AbortSignal): Promise<WorkflowTransition[]> { return this.transport.request('/admin/workflow-definitions/' + uuid(definitionId) + '/transitions', { signal }); }
    bindings(definitionId: string, signal?: AbortSignal): Promise<WorkflowBinding[]> { return this.transport.request('/admin/workflow-definitions/' + uuid(definitionId) + '/document-types', { signal }); }
    /** Les suites possibles d'une tâche prise en charge par la personne connectée. */
    taskActions(taskId: string, signal?: AbortSignal): Promise<WorkflowTaskActions> { return this.transport.request('/workflow-tasks/' + uuid(taskId) + '/actions', { signal }); }
    documentWorkflows(documentId: string, signal?: AbortSignal): Promise<WorkflowInstance[]> { return this.transport.request('/documents/' + uuid(documentId) + '/workflow', { signal }); }
    command<T>(path: string, body: unknown, key: string, method: 'POST' | 'PUT' = 'POST'): Promise<T> { return this.transport.request(path, { method, body, idempotencyKey: key } satisfies RequestOptions); }
}
