import type { Transport, RequestOptions } from '../core/http.js';
import { uuid } from '../core/validation.js';
import { allPages } from '../core/paging.js';
import { query } from '../core/http.js';
import type { AssetExits, Exit, ExitPage } from '../core/deaccessions.js';
import type { Place, HistoricalEvent, Subject, PlaceTag, MultilingualText, HeritageAsset, HeritageAssetPage, HeritageJournalEntry, HeritageDashboard, HeritageReference, HeritageAssetFilters, EntryFilters, EntryPage, EntryDashboard, HeritageEntry, EntryJournalEntry, EntryReceipt, HeritageReprise, AssetLocation, HeritagePlacementPage, PlacementFilters, RecolementFilters, RecolementPage, Recolement, RecolementJournalEntry, RecolementElementFilters, RecolementElementPage, RecolementReport, RecolementLocation, StoragePlace, AssetConservation, Treatment, TreatmentJournalEntry, ConservationQueueFilters, ConservationQueuePage, MovementRequest, MovementPage, MovementFilters, MovementJournalEntry, DigitizationOrder, DigitizationOrderPage, DigitizationOrderFilters, DigitizationOrderJournalEntry, OrderProject, LoanDossier, DossierPage, DossierFilters, DossierRow, DossierSummary, DossierJournalEntry } from '../core/types.js';
export class HeritageApi {
    constructor(readonly transport: Transport) { }
    /** Toutes les pages (jamais le tableau entier d'une table nationale) : au-delà de 5 000 éléments, une erreur explicite. */
    places(signal?: AbortSignal): Promise<Place[]> { return allPages<Place>((page, size) => this.transport.request('/heritage/places' + query({ page, size }), { signal })); }
    /** Toutes les pages (jamais le tableau entier d'une table nationale) : au-delà de 5 000 éléments, une erreur explicite. */
    historicalEvents(signal?: AbortSignal): Promise<HistoricalEvent[]> { return allPages<HistoricalEvent>((page, size) => this.transport.request('/heritage/historical-events' + query({ page, size }), { signal })); }
    /** Toutes les pages (jamais le tableau entier d'une table nationale) : au-delà de 5 000 éléments, une erreur explicite. */
    subjects(signal?: AbortSignal): Promise<Subject[]> { return allPages<Subject>((page, size) => this.transport.request('/heritage/subjects' + query({ page, size }), { signal })); }
    documentPlaces(documentId: string, signal?: AbortSignal): Promise<PlaceTag[]> { return this.transport.request('/heritage/documents/' + uuid(documentId) + '/places', { signal }); }
    documentHistoricalEvents(documentId: string, signal?: AbortSignal): Promise<HistoricalEvent[]> { return this.transport.request('/heritage/documents/' + uuid(documentId) + '/historical-events', { signal }); }
    documentSubjects(documentId: string, signal?: AbortSignal): Promise<Subject[]> { return this.transport.request('/heritage/documents/' + uuid(documentId) + '/subjects', { signal }); }
    documentTexts(documentId: string, signal?: AbortSignal): Promise<MultilingualText[]> { return this.transport.request('/heritage/documents/' + uuid(documentId) + '/texts', { signal }); }
    /** Biens patrimoniaux visibles pour la personne connectée (filtrés par périmètre côté serveur). */
    assets(filters: HeritageAssetFilters, signal?: AbortSignal): Promise<HeritageAssetPage> { return this.transport.request('/heritage/assets' + query({ ...filters }), { signal }); }
    assetsDashboard(signal?: AbortSignal): Promise<HeritageDashboard> { return this.transport.request('/heritage/assets/summary', { signal }); }
    asset(id: string, signal?: AbortSignal): Promise<HeritageAsset> { return this.transport.request('/heritage/assets/' + uuid(id), { signal }); }
    assetJournal(id: string, signal?: AbortSignal): Promise<HeritageJournalEntry[]> { return this.transport.request('/heritage/assets/' + uuid(id) + '/journal', { signal }); }
    references(domaine?: string, signal?: AbortSignal): Promise<HeritageReference[]> { return this.transport.request('/heritage/references' + query({ domaine, includeInactive: 'true' }), { signal }); }
    /** Entrées patrimoniales visibles pour la personne connectée (filtrées par périmètre côté serveur). */
    entries(filters: EntryFilters, signal?: AbortSignal): Promise<EntryPage> { return this.transport.request('/heritage/entries' + query({ ...filters }), { signal }); }
    entriesSummary(signal?: AbortSignal): Promise<EntryDashboard> { return this.transport.request('/heritage/entries/summary', { signal }); }
    entry(id: string, signal?: AbortSignal): Promise<HeritageEntry> { return this.transport.request('/heritage/entries/' + uuid(id), { signal }); }
    entryJournal(id: string, signal?: AbortSignal): Promise<EntryJournalEntry[]> { return this.transport.request('/heritage/entries/' + uuid(id) + '/journal', { signal }); }
    entryReceipt(id: string, signal?: AbortSignal): Promise<EntryReceipt> { return this.transport.request('/heritage/entries/' + uuid(id) + '/receipt', { signal }); }
    reprises(signal?: AbortSignal): Promise<HeritageReprise[]> { return this.transport.request('/heritage/reprises', { signal }); }
    /** Emplacement des originaux physiques d'un bien (masqué sans le droit de lire les archives physiques). */
    assetLocation(id: string, signal?: AbortSignal): Promise<AssetLocation> { return this.transport.request('/heritage/assets/' + uuid(id) + '/location', { signal }); }
    /** Archives qui s'écartent de ce que l'on attend : introuvables, trouvées ailleurs, sorties en retard, non vérifiées. */
    placements(filters: PlacementFilters, signal?: AbortSignal): Promise<HeritagePlacementPage> { return this.transport.request('/heritage/placements' + query({ ...filters }), { signal }); }
    /** Campagnes de récolement visibles pour la personne connectée (filtrées par périmètre côté serveur). */
    recolements(filters: RecolementFilters, signal?: AbortSignal): Promise<RecolementPage> { return this.transport.request('/heritage/recolements' + query({ ...filters }), { signal }); }
    recolement(id: string, signal?: AbortSignal): Promise<Recolement> { return this.transport.request('/heritage/recolements/' + uuid(id), { signal }); }
    recolementJournal(id: string, signal?: AbortSignal): Promise<RecolementJournalEntry[]> { return this.transport.request('/heritage/recolements/' + uuid(id) + '/journal', { signal }); }
    recolementElements(id: string, filters: RecolementElementFilters, signal?: AbortSignal): Promise<RecolementElementPage> { return this.transport.request('/heritage/recolements/' + uuid(id) + '/elements' + query({ ...filters }), { signal }); }
    recolementReport(id: string, signal?: AbortSignal): Promise<RecolementReport> { return this.transport.request('/heritage/recolements/' + uuid(id) + '/report', { signal }); }
    /** Emplacements que l'on peut nommer en constatant une archive ailleurs (pour les personnes affectées à la campagne). */
    recolementUnits(id: string, signal?: AbortSignal): Promise<StoragePlace[]> { return this.transport.request('/heritage/recolements/' + uuid(id) + '/units', { signal }); }
    recolementLocations(institutionId: string, signal?: AbortSignal): Promise<RecolementLocation[]> { return this.transport.request('/heritage/recolements/locations' + query({ institutionId }), { signal }); }
    /** Conservation d'un bien : constats d'état successifs et traitements de chacun de ses originaux. */
    assetConservation(id: string, signal?: AbortSignal): Promise<AssetConservation> { return this.transport.request('/heritage/assets/' + uuid(id) + '/conservation', { signal }); }
    treatment(id: string, signal?: AbortSignal): Promise<Treatment> { return this.transport.request('/heritage/treatments/' + uuid(id), { signal }); }
    treatmentJournal(id: string, signal?: AbortSignal): Promise<TreatmentJournalEntry[]> { return this.transport.request('/heritage/treatments/' + uuid(id) + '/journal', { signal }); }
    /** Originaux qui demandent de l'attention de la conservation (périmètre lisible côté serveur). */
    conservationQueue(filters: ConservationQueueFilters, signal?: AbortSignal): Promise<ConservationQueuePage> { return this.transport.request('/heritage/conservation/queue' + query({ ...filters }), { signal }); }
    /** Demandes de mouvement des originaux visibles pour la personne connectée (filtrées par périmètre côté serveur). */
    movements(filters: MovementFilters, signal?: AbortSignal): Promise<MovementPage> { return this.transport.request('/heritage/movements' + query({ ...filters }), { signal }); }
    movement(id: string, signal?: AbortSignal): Promise<MovementRequest> { return this.transport.request('/heritage/movements/' + uuid(id), { signal }); }
    movementJournal(id: string, signal?: AbortSignal): Promise<MovementJournalEntry[]> { return this.transport.request('/heritage/movements/' + uuid(id) + '/journal', { signal }); }
    /** Commandes de numérisation visibles pour la personne connectée (filtrées par périmètre côté serveur). */
    digitizations(filters: DigitizationOrderFilters, signal?: AbortSignal): Promise<DigitizationOrderPage> { return this.transport.request('/heritage/digitizations' + query({ ...filters }), { signal }); }
    digitization(id: string, signal?: AbortSignal): Promise<DigitizationOrder> { return this.transport.request('/heritage/digitizations/' + uuid(id), { signal }); }
    digitizationJournal(id: string, signal?: AbortSignal): Promise<DigitizationOrderJournalEntry[]> { return this.transport.request('/heritage/digitizations/' + uuid(id) + '/journal', { signal }); }
    /** Projets de numérisation en cours et leurs lots ouverts, proposés à l'atelier qui prend une commande en charge. */
    digitizationProjects(signal?: AbortSignal): Promise<OrderProject[]> { return this.transport.request('/heritage/digitizations/projects', { signal }); }
    /** Dossiers de prêt sortant et d'exposition visibles pour la personne connectée (filtrés par périmètre côté serveur). */
    dossiers(filters: DossierFilters, signal?: AbortSignal): Promise<DossierPage> { return this.transport.request('/heritage/dossiers' + query({ ...filters }), { signal }); }
    dossiersSummary(signal?: AbortSignal): Promise<DossierSummary> { return this.transport.request('/heritage/dossiers/summary', { signal }); }
    dossier(id: string, signal?: AbortSignal): Promise<LoanDossier> { return this.transport.request('/heritage/dossiers/' + uuid(id), { signal }); }
    dossierJournal(id: string, signal?: AbortSignal): Promise<DossierJournalEntry[]> { return this.transport.request('/heritage/dossiers/' + uuid(id) + '/journal', { signal }); }
    /** Les dossiers où figure un bien (onglet « Prêts et expositions » de sa fiche). */
    assetDossiers(id: string, signal?: AbortSignal): Promise<DossierRow[]> { return this.transport.request('/heritage/assets/' + uuid(id) + '/dossiers', { signal }); }
    /** Sorties définitives de la collection visibles pour la personne connectée (filtrées par périmètre côté serveur). */
    deaccessions(filters: { institutionId?: string; status?: string; bienId?: string; page?: number }, signal?: AbortSignal): Promise<ExitPage> {
        return this.transport.request('/heritage/deaccessions' + query({ institutionId: filters.institutionId, status: filters.status, bienId: filters.bienId, page: filters.page || undefined }), { signal });
    }
    deaccession(id: string, signal?: AbortSignal): Promise<Exit> { return this.transport.request('/heritage/deaccessions/' + uuid(id), { signal }); }
    /** Les sorties d'un bien et ce qui empêcherait aujourd'hui d'en proposer une (onglet « Sortie de collection » de sa fiche). */
    assetDeaccessions(id: string, signal?: AbortSignal): Promise<AssetExits> { return this.transport.request('/heritage/assets/' + uuid(id) + '/deaccessions', { signal }); }
    proposeDeaccession(input: { bienId: string; nature: string; motif: string; justification: string; destinataire: string | null; valeurVenale: number | null; devise: string | null; valeurSource: string | null }, key: string): Promise<Exit> {
        return this.command('/deaccessions', input, key);
    }
    examineDeaccession(id: string, input: { version: number; examen: string }, key: string): Promise<Exit> { return this.command('/deaccessions/' + uuid(id) + '/examine', input, key); }
    decideDeaccession(id: string, input: { version: number; approuve: boolean; reference: string | null; date: string | null; motif: string | null }, key: string): Promise<Exit> {
        return this.command('/deaccessions/' + uuid(id) + '/decide', input, key);
    }
    executeDeaccession(id: string, input: { version: number; dateSortie: string; acteReference: string; observations: string | null }, key: string): Promise<Exit> {
        return this.command('/deaccessions/' + uuid(id) + '/execute', input, key);
    }
    cancelDeaccession(id: string, input: { version: number; motif: string }, key: string): Promise<Exit> { return this.command('/deaccessions/' + uuid(id) + '/cancel', input, key); }
    command<T>(path: string, body: unknown, key: string, method: 'POST' | 'PUT' = 'POST'): Promise<T> { return this.transport.request('/heritage' + path, { method, body, idempotencyKey: key } satisfies RequestOptions); }
}
