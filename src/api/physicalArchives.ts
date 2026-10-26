import type { Transport, RequestOptions } from '../core/http.js';
import { uuid } from '../core/validation.js';
import { allPages, SEARCH_PAGE_SIZE, type PageResult } from '../core/paging.js';
import { query } from '../core/http.js';
import type { Elimination, EliminationCandidatePage, EliminationSummary } from '../core/physicalElimination.js';
import { searchParams, type ArchiveFound, type ArchiveSearchCriteria } from '../core/physicalSearch.js';
import type { ConditionAlert, Reading } from '../core/physicalConditions.js';
import { params as occupationParams, type OccupationBy, type OccupationReport } from '../core/physicalOccupation.js';
import type { ExitPage, ExitRequest } from '../core/physicalExit.js';
import type { EmergencyPlan, Exercise, Hazard, PlanSummary, Risk, RiskSummary, SiteRiskSummary } from '../core/physicalRisk.js';
import type { Localisation, StorageUnit, PhysicalArchive, ArchiveMovement, RestorationIntervention, RestorationListItem, ArchivePlacement, PlacementEvent, PlacementFilters, PlacementGapPage } from '../core/types.js';
export class PhysicalArchivesApi {
    constructor(readonly transport: Transport) { }
    /** Toutes les pages, les plus récentes d'abord (jamais un tableau sans borne) : au-delà de 5 000 éléments, une erreur explicite. */
    restorationsByArchive(archiveId: string, signal?: AbortSignal): Promise<RestorationIntervention[]> { return allPages<RestorationIntervention>((page, size) => this.transport.request('/physical-archives/archives/' + uuid(archiveId) + '/restorations' + query({ page, size }), { signal })); }
    /** Toutes les pages (jamais le tableau entier d'une table nationale) : au-delà de 5 000 éléments, une erreur explicite. */
    locations(signal?: AbortSignal): Promise<Localisation[]> { return allPages<Localisation>((page, size) => this.transport.request('/physical-archives/locations' + query({ page, size }), { signal })); }
    location(id: string, signal?: AbortSignal): Promise<Localisation> { return this.transport.request('/physical-archives/locations/' + uuid(id), { signal }); }
    /** Toutes les pages (jamais le tableau entier d'une table nationale) : au-delà de 5 000 éléments, une erreur explicite. */
    storageUnits(signal?: AbortSignal): Promise<StorageUnit[]> { return allPages<StorageUnit>((page, size) => this.transport.request('/physical-archives/storage-units' + query({ page, size }), { signal })); }
    storageUnitsByLocation(locationId: string, signal?: AbortSignal): Promise<StorageUnit[]> { return allPages<StorageUnit>((page, size) => this.transport.request('/physical-archives/locations/' + uuid(locationId) + '/storage-units' + query({ page, size }), { signal })); }
    /** Toutes les pages (jamais le tableau entier d'une table nationale) : au-delà de 5 000 éléments, une erreur explicite. */
    archives(signal?: AbortSignal): Promise<PhysicalArchive[]> { return allPages<PhysicalArchive>((page, size) => this.transport.request('/physical-archives/archives' + query({ page, size }), { signal })); }
    /** Une recherche faite par le serveur (cote ou description, sans tenir compte de la casse) : vingt résultats au plus, hasMore dit s'il y en a d'autres. Un texte vide rend le début de la liste. */
    searchArchives(text: string, signal?: AbortSignal): Promise<PageResult<PhysicalArchive>> { return this.transport.request('/physical-archives/archives' + query({ q: text.trim(), page: 0, size: SEARCH_PAGE_SIZE }), { signal }); }
    /** Retrouver une archive par ce que l'on en sait (mots, lieu, période, service…) : une page à la fois, sans total ; chaque résultat porte son emplacement complet. */
    findArchives(criteria: ArchiveSearchCriteria, page: number, signal?: AbortSignal): Promise<PageResult<ArchiveFound>> { return this.transport.request('/physical-archives/archives/search' + query(searchParams(criteria, page, SEARCH_PAGE_SIZE)), { signal }); }
    /** Les relevés de température et d'humidité d'une unité, le plus récent d'abord. */
    readings(unitId: string, page: number, signal?: AbortSignal): Promise<PageResult<Reading>> { return this.transport.request('/physical-archives/storage-units/' + uuid(unitId) + '/readings' + query({ page, size: SEARCH_PAGE_SIZE }), { signal }); }
    /** Le métrage linéaire et le remplissage, par lieu (parentId ouvre un lieu) ou par institution : calculés par le serveur sur ce que la personne peut lire. */
    occupation(by: OccupationBy, parentId: string | null, signal?: AbortSignal): Promise<OccupationReport> {
        const p = occupationParams(by, parentId);
        return this.transport.request('/physical-archives/occupation' + query({ by: p.by, parentId: p.parentId ? uuid(p.parentId) : null }), { signal });
    }
    /** Les unités dont le dernier relevé sort des seuils qu'elles se sont fixés. */
    conditionAlerts(page: number, signal?: AbortSignal): Promise<PageResult<ConditionAlert>> { return this.transport.request('/physical-archives/storage-units/condition-alerts' + query({ page, size: SEARCH_PAGE_SIZE }), { signal }); }
    /** Les valeurs déjà employées d'un champ libre, à proposer à la saisie (TYPE_LOCALISATION, TYPE_UNITE, TYPE_MOUVEMENT, SUPPORT, ETAT_PHYSIQUE, UNITE_QUANTITE). */
    vocabulary(field: string, signal?: AbortSignal): Promise<string[]> { return this.transport.request('/physical-archives/vocabulary' + query({ field }), { signal }); }
    archive(id: string, signal?: AbortSignal): Promise<PhysicalArchive> { return this.transport.request('/physical-archives/archives/' + uuid(id), { signal }); }
    restorations(signal?: AbortSignal): Promise<RestorationListItem[]> { return allPages<RestorationListItem>((page, size) => this.transport.request('/physical-archives/restorations' + query({ page, size }), { signal })); }
    archivesByStorageUnit(unitId: string, signal?: AbortSignal): Promise<PhysicalArchive[]> { return allPages<PhysicalArchive>((page, size) => this.transport.request('/physical-archives/storage-units/' + uuid(unitId) + '/archives' + query({ page, size }), { signal })); }
    movementsByArchive(archiveId: string, signal?: AbortSignal): Promise<ArchiveMovement[]> { return allPages<ArchiveMovement>((page, size) => this.transport.request('/physical-archives/archives/' + uuid(archiveId) + '/movements' + query({ page, size }), { signal })); }
    /** La file des demandes de sortie que la personne peut lire : à décider d'abord, puis à remettre, puis dehors (retards en tête), enfin closes. Une page à la fois, sans total. */
    exitRequests(params: Record<string, string>, page: number, signal?: AbortSignal): Promise<ExitPage> { return this.transport.request('/physical-archives/exit-requests' + query({ ...params, page, size: SEARCH_PAGE_SIZE }), { signal }); }
    exitRequest(id: string, signal?: AbortSignal): Promise<ExitRequest> { return this.transport.request('/physical-archives/exit-requests/' + uuid(id), { signal }); }
    /** Les demandes de sortie d'une archive, la plus récente d'abord. */
    exitRequestsByArchive(archiveId: string, signal?: AbortSignal): Promise<ExitRequest[]> { return allPages<ExitRequest>((page, size) => this.transport.request('/physical-archives/archives/' + uuid(archiveId) + '/exit-requests' + query({ page, size }), { signal })); }
    /** Les archives qui s'écartent de ce que l'on attend (introuvables, trouvées ailleurs, sorties en retard, jamais ou plus vérifiées), les plus graves d'abord. */
    placementGaps(filters: PlacementFilters, signal?: AbortSignal): Promise<PlacementGapPage> { return this.transport.request('/physical-archives/placements/discrepancies' + query({ ...filters }), { signal }); }
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
