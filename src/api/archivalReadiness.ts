import type { Transport } from '../core/http';
import { query } from '../core/http';
import { uuid } from '../core/validation';
import type { Page } from '../core/types';
export interface ArchivalStep { code: string; label: string; status: 'DONE'|'TODO'|'BLOCKED'|'UNAVAILABLE'; detail: string; permissions: string[]; blockers: string[]; completedBy: string|null }
export interface ArchivalReadiness { elementId: string; documentId: string; title: string; archived: boolean; steps: ArchivalStep[]; physicalLinks: {id: string; cote: string|null; path: string[]}[]; agentsVisible: boolean }
export interface ArchivalLotMember { elementId: string; documentId: string; title: string; status: string }
export interface ArchivalAgent { id: string; name: string }
export class ArchivalReadinessApi {
    constructor(readonly transport: Transport) {}
    state(id: string, signal?: AbortSignal): Promise<ArchivalReadiness> { return this.transport.request('/digitization/elements/'+uuid(id)+'/archival-readiness',{signal}); }
    lot(id: string,page: number,signal?: AbortSignal): Promise<Page<ArchivalLotMember>> { return this.transport.request('/digitization/lots/'+uuid(id)+'/archival-elements'+query({page}),{signal}); }
    agents(id: string,step: string,page: number,signal?: AbortSignal): Promise<Page<ArchivalAgent>> { return this.transport.request('/digitization/elements/'+uuid(id)+'/archival-readiness/agents'+query({step,page}),{signal}); }
}
