import type { Transport } from '../core/http.js';
import { query } from '../core/http.js';
import { uuid } from '../core/validation.js';
import type { NationalDashboard, ScopeDashboard } from '../core/dashboard.js';

/** Les tableaux de bord : celui d'une institution ou d'une unité (le périmètre de travail), et la vue d'ensemble nationale. */
export class DashboardApi {
    constructor(readonly transport: Transport) { }
    /** Le tableau de bord d'un périmètre : une unité comprend ses sous-unités, une institution toutes ses unités. Sans institution : le périmètre national. */
    scope(institutionId: string | null, departmentId: string | null, signal?: AbortSignal): Promise<ScopeDashboard> {
        return this.transport.request('/dashboard' + query({ institutionId: institutionId ? uuid(institutionId) : undefined, departmentId: departmentId ? uuid(departmentId) : undefined }), { signal });
    }
    /** La vue d'ensemble nationale (réservée à l'habilitation nationale dédiée) : des nombres seulement. */
    national(signal?: AbortSignal): Promise<NationalDashboard> {
        return this.transport.request('/dashboard/national', { signal });
    }
}
