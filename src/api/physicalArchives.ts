import type { Transport, RequestOptions } from '../core/http.js';
import { uuid } from '../core/validation.js';
import { query } from '../core/http.js';
import type { Elimination, EliminationCandidatePage, EliminationSummary } from '../core/physicalElimination.js';
import type { EmergencyPlan, Exercise, Hazard, PlanSummary, Risk, RiskSummary, SiteRiskSummary } from '../core/physicalRisk.js';
import type { Localisation, StorageUnit, PhysicalArchive, ArchiveMovement, RestorationIntervention, RestorationListItem, ArchivePlacement, PlacementEvent } from '../core/types.js';
export class PhysicalArchivesApi {
    constructor(readonly transport: Transport) { }
    restorationsByArchive(archiveId: string, signal?: AbortSignal): Promise<RestorationIntervention[]> { return this.transport.request('/physical-archives/archives/' + uuid(archiveId) + '/restorations', { signal }); }
    locations(signal?: AbortSignal): Promise<Localisation[]> { return this.transport.request('/physical-archives/locations', { signal }); }
    location(id: string, signal?: AbortSignal): Promise<Localisation> { return this.transport.request('/physical-archives/locations/' + uuid(id), { signal }); }
    storageUnits(signal?: AbortSignal): Promise<StorageUnit[]> { return this.transport.request('/physical-archives/storage-units', { signal }); }
    storageUnitsByLocation(locationId: string, signal?: AbortSignal): Promise<StorageUnit[]> { return this.transport.request('/physical-archives/locations/' + uuid(locationId) + '/storage-units', { signal }); }
    archives(signal?: AbortSignal): Promise<PhysicalArchive[]> { return this.transport.request('/physical-archives/archives', { signal }); }
    archive(id: string, signal?: AbortSignal): Promise<PhysicalArchive> { return this.transport.request('/physical-archives/archives/' + uuid(id), { signal }); }
    restorations(signal?: AbortSignal): Promise<RestorationListItem[]> { return this.transport.request('/physical-archives/restorations', { signal }); }
    archivesByStorageUnit(unitId: string, signal?: AbortSignal): Promise<PhysicalArchive[]> { return this.transport.request('/physical-archives/storage-units/' + uuid(unitId) + '/archives', { signal }); }
    movementsByArchive(archiveId: string, signal?: AbortSignal): Promise<ArchiveMovement[]> { return this.transport.request('/physical-archives/archives/' + uuid(archiveId) + '/movements', { signal }); }
    placement(archiveId: string, signal?: AbortSignal): Promise<ArchivePlacement> { return this.transport.request('/physical-archives/archives/' + uuid(archiveId) + '/placement', { signal }); }
    placementHistory(archiveId: string, signal?: AbortSignal): Promise<PlacementEvent[]> { return this.transport.request('/physical-archives/archives/' + uuid(archiveId) + '/placement/history', { signal }); }
    // ---------- élimination des archives physiques (V95)
    eliminations(status: string | null, signal?: AbortSignal): Promise<EliminationSummary[]> { return this.transport.request('/physical-archives/eliminations' + query({ status }), { signal }); }
    eliminationCandidates(q: string | null, page: number, signal?: AbortSignal): Promise<EliminationCandidatePage> {
        return this.transport.request('/physical-archives/eliminations/candidates' + query({ q, page: page || undefined }), { signal });
    }
    elimination(id: string, signal?: AbortSignal): Promise<Elimination> { return this.transport.request('/physical-archives/eliminations/' + uuid(id), { signal }); }
    createElimination(title: string, remarks: string | null, archiveIds: string[], key: string): Promise<Elimination> { return this.command('/eliminations', { title, remarks, archiveIds }, key); }
    addEliminationLines(id: string, archiveIds: string[], key: string): Promise<Elimination> { return this.command('/eliminations/' + uuid(id) + '/lines', { archiveIds }, key); }
    removeEliminationLine(id: string, lineId: string, key: string): Promise<Elimination> { return this.command('/eliminations/' + uuid(id) + '/lines/' + uuid(lineId) + '/remove', {}, key); }
    submitElimination(id: string, key: string): Promise<Elimination> { return this.command('/eliminations/' + uuid(id) + '/submit', {}, key); }
    decideEliminationLine(id: string, lineId: string, accept: boolean, reason: string | null, key: string): Promise<Elimination> {
        return this.command('/eliminations/' + uuid(id) + '/lines/' + uuid(lineId) + '/decide', { accept, reason }, key);
    }
    approveElimination(id: string, input: { authority: string; visaReference: string; visaDate: string; minutes: string }, key: string): Promise<Elimination> {
        return this.command('/eliminations/' + uuid(id) + '/approve', input, key);
    }
    rejectElimination(id: string, authority: string, minutes: string, key: string): Promise<Elimination> { return this.command('/eliminations/' + uuid(id) + '/reject', { authority, minutes }, key); }
    executeElimination(id: string, input: { destructionDate: string; method: string; place: string; operator: string; witness: string }, key: string): Promise<Elimination> {
        return this.command('/eliminations/' + uuid(id) + '/execute', input, key);
    }
    cancelElimination(id: string, reason: string, key: string): Promise<Elimination> { return this.command('/eliminations/' + uuid(id) + '/cancel', { reason }, key); }
    // ---------- risques et plan d'urgence (V101)
    riskHazards(includeRetired: boolean, signal?: AbortSignal): Promise<Hazard[]> {
        return this.transport.request('/physical-archives/risk/hazards' + query({ includeRetired: includeRetired ? 'true' : undefined }), { signal });
    }
    createHazard(input: { code: string; label: string; order?: number }, key: string): Promise<Hazard> { return this.command('/risk/hazards', input, key); }
    retireHazard(code: string, key: string): Promise<Hazard> { return this.command('/risk/hazards/' + encodeURIComponent(code) + '/retire', {}, key); }
    reactivateHazard(code: string, key: string): Promise<Hazard> { return this.command('/risk/hazards/' + encodeURIComponent(code) + '/reactivate', {}, key); }
    riskSites(signal?: AbortSignal): Promise<SiteRiskSummary[]> { return this.transport.request('/physical-archives/risk/sites', { signal }); }
    risks(locationId: string | null, signal?: AbortSignal): Promise<RiskSummary[]> {
        return this.transport.request('/physical-archives/risk/risks' + query({ locationId: locationId ? uuid(locationId) : undefined }), { signal });
    }
    risk(id: string, signal?: AbortSignal): Promise<Risk> { return this.transport.request('/physical-archives/risk/risks/' + uuid(id), { signal }); }
    createRisk(input: { locationId: string; hazard: string; description: string; probability: number; severity: number; existingMeasures: string | null; owner: string | null; nextReview: string }, key: string): Promise<Risk> {
        return this.command('/risk/risks', input, key);
    }
    updateRisk(id: string, input: { version: number; hazard: string; description: string; existingMeasures: string | null; owner: string | null }, key: string): Promise<Risk> {
        return this.command('/risk/risks/' + uuid(id) + '/update', input, key);
    }
    reviewRisk(id: string, input: { version: number; probability: number; severity: number; note: string | null; nextReview: string }, key: string): Promise<Risk> {
        return this.command('/risk/risks/' + uuid(id) + '/review', input, key);
    }
    setRiskStatus(id: string, input: { version: number; status: string; reason: string | null }, key: string): Promise<Risk> { return this.command('/risk/risks/' + uuid(id) + '/status', input, key); }
    addRiskMeasure(riskId: string, input: { label: string; description: string | null; owner: string | null; dueDate: string | null }, key: string): Promise<Risk> {
        return this.command('/risk/risks/' + uuid(riskId) + '/measures', input, key);
    }
    progressRiskMeasure(measureId: string, input: { version: number; status: string; note: string | null; completedOn: string | null }, key: string): Promise<Risk> {
        return this.command('/risk/measures/' + uuid(measureId) + '/progress', input, key);
    }
    emergencyPlans(locationId: string | null, signal?: AbortSignal): Promise<PlanSummary[]> {
        return this.transport.request('/physical-archives/risk/plans' + query({ locationId: locationId ? uuid(locationId) : undefined }), { signal });
    }
    emergencyPlan(id: string, signal?: AbortSignal): Promise<EmergencyPlan> { return this.transport.request('/physical-archives/risk/plans/' + uuid(id), { signal }); }
    createEmergencyPlan(input: { locationId: string; title: string | null; copyFromCurrent: boolean }, key: string): Promise<EmergencyPlan> { return this.command('/risk/plans', input, key); }
    updateEmergencyPlan(id: string, input: {
        version: number; title: string; scope: string | null; alert: string | null; evacuation: string | null; rescue: string | null; stabilisation: string | null; resources: string | null;
        contacts: Array<{ role: string; name: string; phone: string | null; email: string | null; note: string | null }>;
        priorities: Array<{ label: string; storageUnitId: string | null; archiveId: string | null; reason: string }>;
    }, key: string): Promise<EmergencyPlan> { return this.command('/risk/plans/' + uuid(id) + '/update', input, key); }
    approveEmergencyPlan(id: string, input: { version: number; nextReview: string; approvalReference: string | null }, key: string): Promise<EmergencyPlan> {
        return this.command('/risk/plans/' + uuid(id) + '/approve', input, key);
    }
    reviewEmergencyPlan(id: string, input: { version: number; nextReview: string }, key: string): Promise<EmergencyPlan> { return this.command('/risk/plans/' + uuid(id) + '/review', input, key); }
    abandonEmergencyPlan(id: string, input: { version: number; reason: string }, key: string): Promise<EmergencyPlan> { return this.command('/risk/plans/' + uuid(id) + '/abandon', input, key); }
    emergencyExercises(locationId: string | null, signal?: AbortSignal): Promise<Exercise[]> {
        return this.transport.request('/physical-archives/risk/exercises' + query({ locationId: locationId ? uuid(locationId) : undefined }), { signal });
    }
    recordEmergencyExercise(input: {
        locationId: string; type: string; occurredOn: string; title: string; description: string; participants: number | null; findings: string; actions: string | null; riskId: string | null;
    }, key: string): Promise<Exercise> { return this.command('/risk/exercises', input, key); }
    command<T>(path: string, body: unknown, key: string, method: 'POST' | 'PUT' = 'POST'): Promise<T> { return this.transport.request('/physical-archives' + path, { method, body, idempotencyKey: key } satisfies RequestOptions); }
}
