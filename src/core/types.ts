export type Scope = 'NATIONAL' | 'INSTITUTION' | 'DEPARTEMENT';
export type Status = 'ACTIF' | 'INACTIF' | 'SUSPENDU' | 'ARCHIVE';
export interface Page<T> {
    items: T[];
    page: number;
    size: number;
    hasMore: boolean;
}
export interface Institution {
    id: string;
    code: string;
    nom: string;
    sigle: string | null;
    typeInstitution: string;
    status: string;
    version: number;
    createdAt: string;
    updatedAt: string;
}
export interface Department {
    id: string;
    institutionId: string;
    parentId: string | null;
    code: string;
    nom: string;
    typeUnite: string | null;
    status: string;
    version: number;
}
export interface User {
    id: string;
    institutionId: string | null;
    departmentId: string | null;
    ssoId: string | null;
    nom: string | null;
    prenom: string | null;
    email: string | null;
    accountType: 'USER' | 'SERVICE';
    scope: Scope | 'SERVICE';
    status: Status;
    authNotBefore: string | null;
    version: number;
}
export interface Role {
    id: string;
    code: string;
    nom: string;
    description: string | null;
    scope: Scope;
    status: Status;
    version: number;
}
export interface Permission {
    id: string;
    code: string;
    description: string | null;
    domain: string;
}
export interface Grant {
    roleId: string;
    roleCode: string;
    permission: string;
    scope: Scope;
    institutionId: string | null;
    departmentId: string | null;
    expiresAt: string | null;
    delegationId: string | null;
}
export interface ScopedSelfAssignment {
    roleId: string;
    roleCode: string;
    roleName: string;
    institutionId: string;
    institutionName: string;
}
export type ConservationSelfAssignment = ScopedSelfAssignment;
export interface Me {
    extractionSelfAssignment?: ScopedSelfAssignment | null;
    extractionReviewSelfAssignment?: ScopedSelfAssignment | null;
    conservationSelfAssignment?: ConservationSelfAssignment | null;
    user: User;
    grants: Grant[];
    truncated: boolean;
}
export interface Assignment {
    id: string;
    userId: string;
    roleId: string;
    scope: Scope;
    institutionId: string | null;
    departmentId: string | null;
    startsAt: string;
    endsAt: string | null;
    status: 'ACTIF' | 'REVOQUE' | 'EXPIRE';
    revokedAt: string | null;
    version: number;
}
export interface Delegation {
    id: string;
    sourceAssignmentId: string | null;
    delegantId: string;
    delegataireId: string;
    roleId: string | null;
    scope: Scope;
    institutionId: string | null;
    departmentId: string | null;
    startsAt: string;
    endsAt: string;
    status: 'ACTIF' | 'REVOQUE' | 'EXPIRE';
    revokedAt: string | null;
    version: number;
    sourcePermissionRevision: number | null;
}
export interface RolePermissions {
    role: Role;
    permissions: Permission[];
}
export interface Change {
    id: string;
    roleId: string;
    expectedRoleVersion: number;
    previousPermissionIds: string[];
    requestedPermissionIds: string[];
    requestedBy: string;
    requestedAt: string;
    expiresAt: string;
    reason: string;
    status: 'PENDING' | 'APPLIED' | 'REJECTED' | 'CANCELLED';
    version: number;
    resolvedBy: string | null;
    resolvedAt: string | null;
    resolutionReason: string | null;
    resultingRoleVersion: number | null;
    requestHash: string;
}
export interface Impact {
    roleId: string;
    roleVersion: number;
    permissionRevision: number;
    currentOrFutureAssignments: number;
    currentOrFutureDelegations: number;
    distinctAssignedUsers: number;
    pendingChanges: number;
    approvalRequired: boolean;
    observedAt: string;
}
export interface Summary {
    user: User;
    effectiveAccountActive: boolean;
    effectiveDirectGrants: number;
    effectiveDelegatedGrants: number;
    scheduledAssignments: number;
    distinctPermissions: number;
    delegationsWithChangedRole: number;
    observedAt: string;
}
export interface DepartmentImpact {
    departmentId: string;
    version: number;
    descendantDepartments: number;
    attachedAccounts: number;
    currentlyEffectiveAccounts: number;
    currentOrFutureAssignments: number;
    observedAt: string;
}
export interface ScopeTarget {
    institutionId?: string | null;
    departmentId?: string | null;
}
export type RecordEntity = Institution | Department | User | Role;
export type Catalog = 'institutions' | 'departments' | 'users' | 'roles';
export type ArchivalStatus = 'BROUILLON' | 'ACTIF' | 'SEMI_ACTIF' | 'ARCHIVE_DEFINITIVE' | 'ELIMINATION_APPROUVEE' | 'DETRUIT';
export type DistributionStatus = 'NON_PUBLIE' | 'INTERNE' | 'RESTREINT' | 'PUBLIC';
export type ConfidentialityLevel = 'PUBLIC' | 'INTERNE' | 'CONFIDENTIEL' | 'SECRET';
export type DocumentOrigin = 'CREE' | 'RECU' | 'IMPORTE' | 'NUMERISE' | 'VERSE';
export type VersionState = 'BROUILLON' | 'VALIDEE' | 'REJETEE' | 'OBSOLETE';
export type FileRole = 'MAITRE_CONSERVATION' | 'DERIVE_CONSULTATION' | 'DERIVE_PUBLIC' | 'PIECE_JOINTE' | 'PREVIEW' | 'AUTRE';
export type FileScanStatus = 'PENDING_SCAN' | 'CLEAN' | 'INFECTED' | 'QUARANTINED' | 'FAILED';
export type FileState = 'PENDING_SCAN' | 'QUARANTINED' | 'VALIDE' | 'REJETE' | 'ARCHIVE';
export interface DocumentType {
    description?: string | null;
    id: string;
    code: string;
    label: string;
    family: string | null;
    status: string;
}
export interface Dossier {
    classificationNodeId?: string | null;
    id: string;
    reference: string;
    institutionId: string;
    departmentId: string | null;
    title: string;
    businessStatus: string;
    archivalStatus: ArchivalStatus;
    confidentiality: ConfidentialityLevel;
    openedOn: string | null;
    closedOn: string | null;
    /** Structure du dossier (V77) : absente des serveurs antérieurs. */
    versionLock?: number;
    subject?: string | null;
    description?: string | null;
    parentId?: string | null;
    level?: number;
    producerId?: string | null;
    contentStartDate?: string | null;
    contentEndDate?: string | null;
    extentQuantity?: number | null;
    extentUnit?: string | null;
}
export interface RecordDocument {
    origin?: string; holderInstitutionId?: string | null; transferredAt?: string | null;
    id: string;
    reference: string;
    institutionId: string;
    departmentId: string | null;
    typeDocumentId: string;
    dossierId: string | null;
    classificationNodeId: string | null;
    title: string;
    businessStatus: string;
    archivalStatus: ArchivalStatus;
    distributionStatus: DistributionStatus;
    confidentiality: ConfidentialityLevel;
    destroyed: boolean;
    versionLock: number;
    /** Date de création de la fiche (ISO). Absente des serveurs antérieurs à cet ajout. */
    createdAt?: string | null;
    documentDate?: string | null;
    description?: string | null;
    /** Informations d'archivage (V77) : absentes des serveurs antérieurs. */
    persistentId?: string | null;
    language?: string | null;
    extentQuantity?: number | null;
    extentUnit?: string | null;
    formerReference?: string | null;
    formerReferenceOrigin?: string | null;
    personalData?: 'A_EVALUER' | 'AUCUNE' | 'PRESENTES';
    sensitiveData?: boolean;
    personalDataNature?: string | null;
    essential?: boolean;
    essentialReason?: string | null;
}
export interface DocumentVersion {
    comment?: string | null;
    id: string;
    documentId: string;
    number: number;
    state: VersionState;
    sealed: boolean;
    sealedHash: string | null;
    sealedAt: string | null;
}
export interface DocumentFile {
    id: string;
    versionId: string;
    originalFilename: string;
    mediaType: string;
    role: FileRole;
    size: number;
    state: FileState;
    scanStatus: FileScanStatus;
    master: boolean;
    validatedAt: string | null;
}
export type RecordCatalog = 'documents' | 'dossiers';
export type PreservationFileState = 'BLOCKED' | 'UNAVAILABLE' | 'UNSCHEDULED' | 'RUNNING' | 'DUE' | 'VERIFIED';
export interface BackupMonitor {
    enabled: boolean; intervalHours: number; retentionCopies: number;
    nextRunAt: string; lastSuccessAt: string | null; running: boolean; errorCode: string | null;
    runs: Array<{ id: string; startedAt: string; completedAt: string | null;
        status: 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'INTERRUPTED'; objectCount: number | null;
        totalBytes: number | null; manifestVerified: boolean; restoreVerified: boolean;
        restoredObjects: number | null; errorCode: string | null }>;
}
export interface PreservationMonitor {
    enabled: boolean;
    intervalDays: number;
    pollMs: number;
    worker: { lastStartedAt: string | null; lastFinishedAt: string | null; lastHeartbeatAt: string | null; errorCode: string | null };
    summary: { total: number; blocked: number; unavailable: number; due: number; unscheduled: number };
    items: Array<{ fileId: string; documentId: string; documentReference: string; filename: string; mediaType: string;
        status: PreservationFileState; lastVerifiedAt: string; lastCheckedAt: string | null; nextCheckAt: string | null; consecutiveFailures: number }>;
    page: number;
    hasMore: boolean;
}
export type IngestionStatus = 'PROCESSING' | 'RETRYABLE' | 'REJECTED' | 'COMPLETED';
export type ActorRole = 'AUTEUR' | 'PRODUCTEUR' | 'SIGNATAIRE' | 'DESTINATAIRE' | 'DONATEUR' | 'DEPOSANT' | 'DETENTEUR_ANTERIEUR' | 'CONTRIBUTEUR' | 'AUTRE';
export interface Actor {
    birthDate?: string | null; deathDate?: string | null; description?: string | null;
    id: string;
    type: string;
    name: string | null;
    firstName: string | null;
    legalName: string | null;
    externalId: string | null;
}
export interface DocumentActor {
    id: string;
    documentId: string;
    actorId: string;
    role: ActorRole;
    order: number | null;
    comment: string | null;
}
export type RetentionScope = 'NATIONAL' | 'INSTITUTION';
export type RetentionUnit = 'JOURS' | 'MOIS' | 'ANNEES';
export type RetentionTrigger = 'DATE_DOCUMENT' | 'DATE_CLOTURE_DOCUMENT' | 'DATE_ARCHIVAGE' | 'DATE_CLOTURE_DOSSIER' | 'EVENEMENT';
export type FinalDisposition = 'CONSERVER_DEFINITIVEMENT' | 'ELIMINER' | 'TRANSFERER' | 'REEXAMINER' | 'TRIER';
export type RetentionEventStatus = 'PLANIFIE' | 'ECHEANCE' | 'EN_DECISION' | 'CLOTURE' | 'ANNULE' | 'SUSPENDU';
export type DispositionStatus = 'PROPOSEE' | 'VALIDEE' | 'REJETEE' | 'EXECUTEE' | 'ANNULEE';
export interface RetentionEvent {
    id: string;
    documentId: string | null;
    dossierId: string | null;
    ruleVersionId: string;
    institutionId: string | null;
    departmentId: string | null;
    baseDate: string;
    dueDate: string;
    intermediatePhaseDate?: string | null;
    status: RetentionEventStatus;
    suspendedFromStatus: RetentionEventStatus | null;
    suspendedAt: string | null;
    reviewCount: number;
    closedAt: string | null;
    version: number;
}
/** Ce qui se passerait si l'on planifiait la conservation d'un document, ou ce qui l'en empêche (indicatif : le serveur revérifie à la planification). */
export interface RetentionPlanningRule { code: string; label: string; scope: string; versionNumber: number; trigger: string; duration: number; unit: string; finalDisposition: string; currentPhaseDuration?: number | null; currentPhaseUnit?: string | null; triggerEventTypeId?: string | null; triggerEventTypeLabel?: string | null; sampling?: SamplingSummary | null }
export interface RetentionPlanning { documentClosed: boolean; scheduled: boolean; rule: RetentionPlanningRule | null; baseDate: string | null; dueDate: string | null; blockers: string[]; intermediatePhaseDate?: string | null }
export interface Disposition {
    id: string;
    eventId: string;
    decision: FinalDisposition;
    status: DispositionStatus;
    proposedBy: string | null;
    validatedBy: string | null;
    executedBy: string | null;
    proposedAt: string;
    validatedAt: string | null;
    executedAt: string | null;
    visaReference: string | null;
    evidenceHash: string | null;
    executionReference: string | null;
    version: number;
}
export type LegalHoldStatus = 'ACTIF' | 'LEVE';
export interface LegalHold {
    description?: string | null; authority?: string | null;
    id: string;
    reference: string;
    reason: string;
    status: LegalHoldStatus;
    institutionId: string | null;
    departmentId: string | null;
    openedBy: string | null;
    openedAt: string;
    releasedBy: string | null;
    releasedAt: string | null;
    releaseReference: string | null;
    version: number;
}
export interface DispositionReadiness {
    actionId: string;
    executable: boolean;
    blockers: string[];
}
export type SearchTargetType = 'ALL' | 'DOCUMENT' | 'DOSSIER';
export interface SearchHit {
    id: string;
    type: 'DOCUMENT' | 'DOSSIER';
    titre: string | null;
    description: string | null;
    score: number;
}
export interface SearchResultPage {
    hasMore: boolean;
    hits: SearchHit[];
    page: number;
    size: number;
}
/** OK : moteur joignable, index sains et alignés sur la base. DEGRADED : la recherche répond mais un index manque, est incomplet ou mal répliqué. */
export type SearchHealth = 'OK' | 'DEGRADED' | 'UNAVAILABLE' | 'DISABLED';
/** `indexed` / `expected` : volumes nationaux, renseignés pour un détenteur de SEARCH_REINDEX seulement. */
export interface SearchIndexStatus {
    name: string;
    health: string | null;
    indexed: number | null;
    expected: number | null;
}
export interface SearchStatus {
    status: SearchHealth;
    code: string | null;
    indexes: SearchIndexStatus[];
    checkedAt: string;
}
/** OK : OCR automatique actif, moteur présent, file qui avance, aucune page en échec. DEGRADED : file bloquée ou pages à relancer. */
export interface OcrStatus {
    status: 'OK' | 'DEGRADED' | 'UNAVAILABLE' | 'DISABLED';
    code: string | null;
    queued: number;
    running: number;
    failedFiles: number;
    done24h: number;
    lastCompletedAt: string | null;
    checkedAt: string;
}
/** RUNNING : en cours (le serveur travaille en arrière-plan). DONE. FAILED : panne du moteur ou erreur, reprenable. INTERRUPTED : le serveur s'est arrêté, reprenable. */
export type SearchReindexState = 'RUNNING' | 'DONE' | 'FAILED' | 'INTERRUPTED';
export interface SearchReindexReport {
    documents: number;
    dossiers: number;
    failures: number;
    /** Absents d'un bilan synchrone (ancien serveur) : le bilan est alors définitif. */
    id?: string;
    state?: SearchReindexState;
    phase?: 'DOCUMENTS' | 'DOSSIERS';
    errorCode?: string | null;
    startedAt?: string;
    finishedAt?: string | null;
    resumedFrom?: string | null;
}
export interface SearchReindexStatus {
    run: SearchReindexReport | null;
}
export type LicenceStatus = 'ACTIF' | 'INACTIF';
export type PublicationStatus = 'PUBLIEE' | 'RETIREE';
export interface Licence {
    id: string;
    code: string;
    libelle: string;
    description: string | null;
    uri: string | null;
    statut: LicenceStatus;
}
export interface Publication {
    id: string;
    documentId: string;
    fichierId: string;
    licenceId: string | null;
    canal: string;
    statut: PublicationStatus;
    visibilite: DistributionStatus;
    datePublication: string | null;
    dateRetrait: string | null;
    publieParId: string | null;
    retireParId: string | null;
    versionLock: number;
}
export interface AuditEvent {
    id: string;
    userId: string | null;
    actorType: string;
    actorExternalId: string | null;
    correlationId: string | null;
    action: string;
    category: string | null;
    objectType: string;
    objectId: string | null;
    objectReference: string | null;
    occurredAt: string;
    before: Json | null;
    after: Json | null;
    result: string;
    resultCode: string | null;
    institutionId: string | null;
    departmentId: string | null;
    previousHash: string | null;
    eventHash: string;
}
export interface QualifiedTimestamp {
    id: string;
    versionId: string;
    authority: string;
    hashAlgorithm: string;
    hashValue: string;
    serialNumber: string | null;
    timestampedAt: string;
    tokenBase64: string;
    createdAt: string;
    createdById: string | null;
}
export type ClassificationStatus = 'ACTIF' | 'INACTIF';
export interface ClassificationNode {
    id: string;
    parentId: string | null;
    institutionId: string | null;
    code: string | null;
    libelle: string;
    description: string | null;
    typeNoeud: string;
    statut: ClassificationStatus;
    ordre: number | null;
    dateDebutValidite: string | null;
    dateFinValidite: string | null;
    versionLock: number;
}
export type LocationStatus = 'ACTIVE' | 'INACTIVE';
export type MovementStatus = 'EN_COURS' | 'TERMINE';
export type RestorationStatus = 'DIAGNOSTIC' | 'A_VALIDER' | 'EN_COURS' | 'TERMINEE';
export interface Localisation {
    id: string;
    parentId: string | null;
    typeLocalisation: string;
    code: string | null;
    libelle: string;
    adresse: string | null;
    description: string | null;
    statut: LocationStatus;
    versionLock: number;
}
export interface StorageUnit {
    id: string;
    localisationId: string;
    typeUnite: string;
    cote: string;
    capacite: string | null;
    conditionsConservation: Json | null;
    statut: LocationStatus;
    versionLock: number;
}
export interface PhysicalArchive {
    id: string;
    documentId: string | null;
    uniteStockageId: string;
    cote: string;
    support: string | null;
    etatPhysique: string | null;
    description: string | null;
    dateExtremeDebut: string | null;
    dateExtremeFin: string | null;
    quantite: string | null;
    uniteQuantite: string | null;
    versionLock: number;
}
export interface ArchiveMovement {
    id: string;
    archivePhysiqueId: string;
    origineUniteStockageId: string;
    destinationUniteStockageId: string | null;
    typeMouvement: string;
    motif: string;
    dateSortie: string;
    dateRetourPrevue: string | null;
    dateRetourEffective: string | null;
    responsableId: string | null;
    statut: MovementStatus;
    versionLock: number;
}
export interface RestorationIntervention {
    id: string;
    archivePhysiqueId: string;
    intitule: string;
    constat: string;
    responsableId: string | null;
    statut: RestorationStatus;
    dateDiagnostic: string;
    dateDebut: string | null;
    dateFin: string | null;
    compteRendu: string | null;
    versionLock: number;
}
export interface RestorationListItem {
    id: string;
    archivePhysiqueId: string;
    archiveCote: string;
    intitule: string;
    statut: RestorationStatus;
    dateDiagnostic: string;
    dateDebut: string | null;
    dateFin: string | null;
}
export interface Place {
    id: string;
    nom: string;
    typeLieu: string | null;
    latitude: string | null;
    longitude: string | null;
    description: string | null;
    identifiantExterne: string | null;
}
export interface HistoricalEvent {
    id: string;
    titre: string;
    description: string | null;
    dateDebut: string | null;
    dateFin: string | null;
    precisionDate: string | null;
}
export interface Subject {
    id: string;
    terme: string;
    vocabulaire: string | null;
    identifiant: string | null;
    definition: string | null;
}
export interface PlaceTag {
    place: Place;
    roleLieu: string;
}
export interface MultilingualText {
    id: string;
    documentId: string;
    langue: string;
    typeTexte: string;
    contenu: string;
    estOriginal: boolean;
    createdAt: string;
    createdById: string | null;
}
export type DigitizationProjectStatus = 'EN_COURS' | 'TERMINE' | 'ANNULE';
/** Étapes d'un élément : sept étapes de parcours (TERMINE = prêt pour versement), plus SUSPENDU et ANNULE hors parcours. */
export type DigitizationElementStatus = 'RECEPTION' | 'NUMERISATION' | 'OCR_INDEXATION' | 'CONTROLE_QUALITE' | 'METADONNEES' | 'VALIDATION' | 'TERMINE' | 'SUSPENDU' | 'ANNULE';
export type ContributionStatus = 'SOUMISE' | 'APPROUVEE' | 'REJETEE';
export type OcrValidationStatus = 'NON_VALIDE' | 'VALIDE';
export interface DigitizationProject {
    id: string;
    code: string | null;
    nom: string;
    description: string | null;
    perimetre: string | null;
    responsableId: string | null;
    dateDebut: string | null;
    dateFinPrevue: string | null;
    dateFinReelle: string | null;
    statut: DigitizationProjectStatus;
    versionLock: number;
}
export interface DigitizationElement {
    id: string;
    projetNumerisationId: string;
    archivePhysiqueId: string | null;
    documentId: string | null;
    ordre: number | null;
    descriptionSource: string | null;
    statut: DigitizationElementStatus;
    dateDebut: string | null;
    dateFin: string | null;
    versionLock: number;
    /** Plan de numérisation (absent des serveurs antérieurs à la gestion des lots et des pages). */
    lotId?: string | null;
    pagesAttendues?: number | null;
    rectoVerso?: boolean;
    /** Étape à laquelle reprend un élément suspendu. */
    etapeSuspension?: DigitizationElementStatus | null;
}
/** Un obstacle à un passage d'étape ; « overridable » : on peut passer outre avec un motif écrit. */
export interface WorkflowBlocker {
    code: string;
    message: string;
    overridable: boolean;
}
/** Un passage possible depuis l'étape courante, évalué pour la personne connectée. */
export interface TransitionOption {
    vers: DigitizationElementStatus;
    permission: string;
    peutAgir: boolean;
    autorise: boolean;
    motifRequis: boolean;
    renvoi: boolean;
    blockers: WorkflowBlocker[];
}
/** Scellement de la version d'un élément : un maître par page, ordre et empreinte scellés au passage « Prêt pour versement ». */
export interface ElementSealing {
    versionId: string;
    numeroVersion: number;
    scellee: boolean;
    empreinte: string | null;
    dateScellement: string | null;
    /** Pages numérotées de l'élément (0 sans suivi de pages). */
    pages: number;
    fichiers: number;
    /** Fichiers remplacés (pages rescannées), rejetés et listés à part dans le manifeste. */
    ecartes: number;
}
export interface ElementWorkflow {
    element: DigitizationElement;
    depuis: string | null;
    options: TransitionOption[];
    /** Présent aux étapes de validation et de fin ; null tant que l'élément n'a pas de fichier de page. */
    scellement?: ElementSealing | null;
}
export interface ElementTransition {
    id: string;
    elementId: string;
    de: DigitizationElementStatus | null;
    vers: DigitizationElementStatus;
    motif: string | null;
    acteurId: string | null;
    automatique: boolean;
    contexte: Record<string, unknown> | null;
    createdAt: string;
}
export interface PipelineStage {
    statut: DigitizationElementStatus;
    elements: number;
    plusAncienJours: number | null;
}
export interface QueueItem {
    elementId: string;
    projetId: string;
    projetNom: string;
    description: string | null;
    lotCode: string | null;
    statut: DigitizationElementStatus;
    depuis: string | null;
}
export interface LotAdvance {
    lotId: string;
    de: DigitizationElementStatus;
    vers: DigitizationElementStatus;
    appliques: number;
    ignores: number;
    resultats: Array<{ elementId: string; description: string | null; applique: boolean; blockers: WorkflowBlocker[] }>;
}
/** OCR automatique d'un fichier de l'élément : état de la dernière tâche (null : jamais demandée) et présence d'un texte. */
export interface OcrJobItem {
    fichierId: string;
    numeroPage: number | null;
    state: 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED' | 'CANCELLED' | null;
    attempts: number;
    errorCode: string | null;
    hasText: boolean;
    updatedAt: string | null;
}
export interface OcrJobs {
    enabled: boolean;
    language: string;
    items: OcrJobItem[];
}
export interface OcrRun {
    files: number;
    queued: number;
}
/** Mesures d'une image de page ; les signalements sont calculés par le serveur avec ses seuils courants. */
export interface QualityMetrics {
    width: number;
    height: number;
    sharpness: number;
    contrast: number;
    brightness: number;
    inkRatio: number;
    skewDegrees: number | null;
}
export interface QualityIssue {
    code: string;
    message: string;
}
export interface QualityPage {
    numeroPage: number | null;
    fichierId: string;
    jobState: 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED' | 'CANCELLED' | null;
    errorCode: string | null;
    analyzed: boolean;
    metrics: QualityMetrics | null;
    issues: QualityIssue[];
    flagged: boolean;
    /** Images du fichier de la page (1 pour la plupart ; davantage pour un TIFF de plusieurs images). */
    images: number;
}
/** Analyse automatique de l'image des pages d'un élément : signalements, fichiers en attente et échantillon à contrôler visuellement. */
export interface QualityAnalysis {
    enabled: boolean;
    pages: QualityPage[];
    flagged: number[];
    pending: number;
    sample: number[];
    sampleRate: number;
    sampleMinimum: number;
}
/** Format d'un fichier de page d'après son contenu, avec les constats à connaître (corrompu, type déclaré différent, format avec perte comme maître…). */
export interface FileFormat {
    family: string;
    name: string;
    version: string | null;
    /** Identifiant PRONOM : correspondance interne de l'application, à confirmer avec Siegfried ou DROID avant tout usage hors de l'application. */
    puid: string | null;
    mediaType: string | null;
    wellFormed: boolean | null;
    lossy: boolean | null;
    details: Record<string, unknown>;
    findings: Array<{ code: string; message: string }>;
}
export interface FileDerivative {
    kind: 'CONSULTATION' | 'THUMBNAIL';
    /** Numéro de l'image du fichier (à partir de 1) : un TIFF de plusieurs images a des copies pour chacune. */
    frame: number;
    width: number;
    height: number;
    sizeBytes: number;
    mediaType: string;
}
export type JobState = 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED' | 'CANCELLED' | null;
export interface FileAssetItem {
    numeroPage: number | null;
    fichierId: string;
    mediaType: string;
    role: string;
    format: FileFormat | null;
    identifyState: JobState;
    identifyError: string | null;
    derivatives: FileDerivative[];
    deriveState: JobState;
    deriveError: string | null;
}
export interface FileAssets {
    identificationEnabled: boolean;
    derivativesEnabled: boolean;
    items: FileAssetItem[];
}
/* ---------- Biens patrimoniaux (patrimoine historique et documentaire) ---------- */
export type DescriptionStatus = 'MINIMALE' | 'EN_REDACTION' | 'A_RELIRE' | 'VALIDEE';
export interface AssetGap {
    code: string;
    message: string;
    /** Étape que ce manque bloque ; null : simple information. */
    bloque: 'RELECTURE' | 'VALIDATION' | null;
}
export interface AssetTransitionOption {
    vers: DescriptionStatus;
    permissions: string[];
    peutAgir: boolean;
    motifRequis: boolean;
    renvoi: boolean;
    bloquants: AssetGap[];
}
export interface AssetLink { id: string; libelle: string; detail: string | null }
export interface AssetOriginal { archivePhysiqueId: string; cote: string; libelle: string | null; support: string | null; etatPhysique: string | null }
export interface AssetResource { documentId: string; role: string; titre: string; identifiantMetier: string | null; libelle: string | null; confidentiel: boolean }
/** Champs modifiables d'un bien, par nom (texte, énumération, liste, date ISO, booléen). */
export type AssetFields = Record<string, unknown>;
export interface HeritageAsset {
    id: string;
    identifiant: string;
    institutionId: string;
    departementId: string | null;
    origineEnregistrement: 'CREATION' | 'RECEPTION' | 'REPRISE_INVENTAIRE';
    champs: AssetFields;
    statutPriseEnCharge: string;
    statutDescription: DescriptionStatus;
    etatMateriel: string;
    /** Calculés à la lecture à partir des objets réels : rien n'est stocké. */
    disponibilite: string;
    numerisation: string;
    diffusion: string;
    descriptionSoumiseParId: string | null;
    descriptionValideeParId: string | null;
    descriptionValideeLe: string | null;
    valeurEvaluateurId: string | null;
    lacunes: AssetGap[];
    passages: AssetTransitionOption[];
    originaux: AssetOriginal[];
    ressources: AssetResource[];
    lieux: AssetLink[];
    evenements: AssetLink[];
    sujets: AssetLink[];
    version: number;
    createdAt: string;
    updatedAt: string;
}
export interface HeritageAssetSummary {
    id: string;
    identifiant: string;
    institutionId: string;
    intitule: string;
    categorie: string;
    numeroInventaire: string | null;
    natureOriginale: string;
    precisionDate: string;
    dateDebut: string | null;
    dateFin: string | null;
    dateTexte: string | null;
    statutPriseEnCharge: string;
    statutDescription: DescriptionStatus;
    etatMateriel: string;
    originaux: number;
    representations: number;
    lacunes: number;
    lacunesBloquantes: number;
    updatedAt: string;
}
export interface HeritageAssetPage { items: HeritageAssetSummary[]; page: number; size: number; total: number; hasMore: boolean }
export interface HeritageJournalEntry {
    id: string;
    genre: 'CREATION' | 'MODIFICATION' | 'CORRECTION' | 'TRANSITION' | 'LIEN';
    champ: string | null;
    ancienneValeur: unknown;
    nouvelleValeur: unknown;
    motif: string | null;
    source: string | null;
    automatique: boolean;
    auteurId: string | null;
    createdAt: string;
}
export interface HeritageDashboard {
    total: number;
    parStatutDescription: Record<string, number>;
    parStatutPriseEnCharge: Record<string, number>;
    parEtatMateriel: Record<string, number>;
    sansOriginal: number;
    provenanceAEtablir: number;
    situationJuridiqueAClarifier: number;
    valeurNonEvaluee: number;
    /** Biens dont un original est déclaré introuvable à son dernier constat de présence. */
    introuvables: number;
}
export interface HeritageReference { domaine: 'CATEGORIE' | 'CRITERE_VALEUR' | 'ALTERATION' | 'CATEGORIE_LECTEUR' | 'MOTIF_SORTIE'; code: string; libelle: string; description: string | null; ordre: number; actif: boolean }
export interface HeritageAssetFilters { q?: string; categorie?: string; statutDescription?: string; statutPriseEnCharge?: string; etatMateriel?: string; page?: number; size?: number }
/* ---------- Entrées patrimoniales (réception, examen, décision, formalisation ou retour) et reprise d'inventaire ---------- */
export type EntryStatus = 'RECUE' | 'EN_EXAMEN' | 'COMPLEMENT_REQUIS' | 'SITUATION_A_CLARIFIER' | 'ACCEPTEE' | 'REFUSEE' | 'FORMALISEE' | 'RETOURNEE';
export type EntryDecisionType = 'ACQUISITION' | 'DEPOT' | 'PRET_ENTRANT';
export interface EntryTransitionOption {
    vers: EntryStatus;
    permissions: string[];
    peutAgir: boolean;
    motifRequis: boolean;
    /** Passage qui engage l'institution : il est pris par une autre personne que celle qui a enregistré la réception. */
    decision: boolean;
    bloquants: AssetGap[];
}
export interface EntryAsset { bienId: string; identifiant: string; intitule: string; categorie: string; statutPriseEnCharge: string }
export interface EntryResource { documentId: string; role: string; titre: string; identifiantMetier: string | null; libelle: string | null; confidentiel: boolean }
export interface ReceiptMention { code: string; texte: string }
export interface HeritageEntry {
    id: string;
    numero: string;
    institutionId: string;
    departementId: string | null;
    champs: AssetFields;
    statut: EntryStatus;
    decisionType: EntryDecisionType | null;
    decisionMotif: string | null;
    decisionParId: string | null;
    decisionLe: string | null;
    conventionReference: string | null;
    conventionDateDebut: string | null;
    conventionDateFin: string | null;
    retourLe: string | null;
    retourDestinataire: string | null;
    retourNote: string | null;
    enregistreParId: string | null;
    /** Les champs et la liste des biens ne se modifient plus une fois la décision prise. */
    modifiable: boolean;
    mention: ReceiptMention;
    biens: EntryAsset[];
    ressources: EntryResource[];
    passages: EntryTransitionOption[];
    version: number;
    createdAt: string;
    updatedAt: string;
}
export interface EntrySummary {
    id: string;
    numero: string;
    institutionId: string;
    modeReception: string;
    deposant: string | null;
    dateReception: string;
    statut: EntryStatus;
    nombreBiens: number;
    decisionType: EntryDecisionType | null;
    updatedAt: string;
}
export interface EntryPage { items: EntrySummary[]; page: number; size: number; total: number; hasMore: boolean }
export interface EntryJournalEntry {
    id: string;
    genre: string;
    champ: string | null;
    ancienneValeur: unknown;
    nouvelleValeur: unknown;
    motif: string | null;
    automatique: boolean;
    auteurId: string | null;
    createdAt: string;
}
export interface EntryDashboard { total: number; parStatut: Record<string, number>; sansDecisionDepuisJours: number }
export interface EntryReceipt {
    numero: string;
    institution: string;
    dateReception: string;
    modeReception: string;
    deposant: string | null;
    nombrePieces: number | null;
    motifReception: string | null;
    biens: EntryAsset[];
    mention: ReceiptMention;
    genereLe: string;
}
export interface EntryFilters { q?: string; statut?: string; mode?: string; page?: number; size?: number }
/** Lot de reprise d'inventaire : une collection ancienne qui entre par un registre d'inventaire plutôt que par une réception. */
export interface HeritageReprise {
    id: string;
    institutionId: string;
    departementId: string | null;
    libelle: string;
    source: string | null;
    dateReference: string | null;
    statut: 'OUVERTE' | 'CLOTUREE';
    biens: number;
    sansDate: number;
    sansResume: number;
    provenanceAEtablir: number;
    valeurNonEvaluee: number;
    sansOriginal: number;
    clotureeLe: string | null;
    version: number;
    createdAt: string;
}
/** Un volume du PDF d'accès d'un élément (découpé par taille quand l'élément est volumineux). */
export interface AccessPdfPart {
    partNo: number;
    partCount: number;
    firstPage: number;
    lastPage: number;
    pageCount: number;
    sizeBytes: number;
}
export interface AccessPdfJob {
    state: 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED' | 'CANCELLED';
    errorCode: string | null;
    updatedAt: string;
}
/**
 * PDF d'accès d'un élément : copies de consultation des pages assemblées dans l'ordre (copie de lecture, jamais le maître).
 * « aJour » : il correspond encore aux pages actuelles ; sinon il est à régénérer mais reste téléchargeable.
 */
export interface AccessPdf {
    enabled: boolean;
    pages: number;
    copiesManquantes: number[];
    genereLe: string | null;
    aJour: boolean;
    volumes: AccessPdfPart[];
    tache: AccessPdfJob | null;
}
export interface QualityControl {
    id: string;
    elementNumerisationId: string;
    controleurId: string | null;
    dateControle: string;
    dpi: number | null;
    modeCouleur: string | null;
    nettete: string | null;
    nombrePages: number | null;
    conforme: boolean;
    defauts: Json | null;
    decision: string | null;
}
export interface OcrWord {
    text: string;
    x: number; y: number; width: number; height: number;
    /** Score du moteur de 0 à 100, distinct de la confiance globale de 0 à 1. */
    confidence: number | null;
    line: number;
}
export interface OcrLayout {
    pageNumber?: number;
    resultId: string;
    width: number; height: number;
    unit: string;
    truncated: boolean;
    words: OcrWord[];
}
export interface OcrResult {
    id: string;
    fichierId: string;
    typeReconnaissance: string;
    texte: string;
    langue: string | null;
    moteur: string | null;
    versionMoteur: string | null;
    confiance: string | null;
    numeroPage: number | null;
    statutValidation: OcrValidationStatus;
    createdAt: string;
    versionLock: number;
    /** Le moteur a donné la position de chaque mot : l'export ALTO est possible. */
    hasLayout?: boolean;
    layoutPages?: number[];
}
export interface Contribution {
    id: string;
    elementNumerisationId: string;
    resultatOcrId: string | null;
    auteurId: string | null;
    typeContribution: string;
    contenu: string;
    statut: ContributionStatus;
    moderateurId: string | null;
    dateCreation: string;
    dateModeration: string | null;
    versionLock: number;
}
export type RestrictionLevel = 'RESTREINT' | 'CONFIDENTIEL' | 'SECRET';
export type RestrictionStatus = 'ACTIF' | 'INACTIF' | 'LEVEE' | 'EXPIREE' | 'ANNULEE';
export interface LegalSource {
    id: string;
    typeSource: string;
    reference: string;
    titre: string | null;
    dateSource: string | null;
    uri: string | null;
    autorite: string | null;
}
export interface LegalStatus {
    id: string;
    documentId: string | null;
    fichierId: string | null;
    typeStatut: string;
    titulaire: string | null;
    dateDebut: string | null;
    dateFin: string | null;
    justification: string | null;
    sourceJuridiqueId: string | null;
}
export interface AccessRestriction {
    id: string;
    documentId: string;
    niveau: RestrictionLevel;
    motif: string;
    dateDebut: string;
    dateFin: string | null;
    dateReexamen: string | null;
    autorite: string | null;
    reference: string | null;
    sourceJuridiqueId: string | null;
    statut: RestrictionStatus;
    releasedById: string | null;
    releasedAt: string | null;
    releaseReference: string | null;
    versionLock: number;
}
export type MetadataSchemaStatus = 'BROUILLON' | 'ACTIF' | 'INACTIF' | 'RETIRE';
export type MetadataValueType = 'TEXTE' | 'TEXTE_LONG' | 'ENTIER' | 'DECIMAL' | 'BOOLEEN' | 'DATE' | 'DATETIME' | 'UUID' | 'ENUM';
export interface MetadataSchema {
    id: string;
    code: string;
    name: string;
    version: number;
    status: MetadataSchemaStatus;
    institutionId: string | null;
    effectiveFrom: string;
    effectiveTo: string | null;
}
export interface MetadataField {
    description?: string | null;
    vocabulary?: string | null;
    configuration?: Json;
    id: string;
    code: string;
    name: string;
    type: MetadataValueType;
    required: boolean;
    repeatable: boolean;
    order: number | null;
}
export interface MetadataBinding {
    schemaId: string;
    typeDocumentId: string;
    required: boolean;
    from: string;
    to: string | null;
}
export interface MetadataFieldDefinition {
    description?: string | null;
    vocabulary?: string | null;
    order?: number | null;
    schemaCode: string;
    schemaVersion: number;
    schemaRequired: boolean;
    fieldId: string;
    fieldCode: string;
    fieldName: string;
    type: MetadataValueType;
    required: boolean;
    repeatable: boolean;
    configuration: Json;
}
export interface MetadataValue {
    schemaCode: string;
    schemaVersion: number;
    fieldCode: string;
    fieldName: string;
    type: MetadataValueType;
    order: number;
    value: Json;
    valueVersion: number;
}
export type IntakeMode = 'VERSEMENT' | 'DON' | 'DEPOT' | 'ACHAT' | 'TRANSFERT' | 'COLLECTE' | 'RESTITUTION' | 'AUTRE';
export type IntakeStatus = 'OUVERTE' | 'CLOTUREE';
export interface ArchivalIntake {
    id: string;
    numero: string;
    modeEntree: IntakeMode;
    sourceActeurId: string | null;
    sourceInstitutionId: string | null;
    dateEntree: string;
    statut: IntakeStatus;
    instrument: string | null;
    referencePreuve: string | null;
    responsableId: string | null;
    description: string | null;
    versionLock: number;
    /** Versement structuré : null pour une entrée classique. */
    etape?: 'PREPARATION' | 'SOUMIS' | 'EN_CONTROLE' | 'A_CORRIGER' | 'ACCEPTE' | 'REJETE' | 'RECU' | null;
    accordId?: string | null;
    producteurId?: string | null;
    institutionArchivesId?: string | null;
    dateSoumission?: string | null;
    dateDecision?: string | null;
    motifDecision?: string | null;
    accuseReference?: string | null;
    accuseDate?: string | null;
}
export type WorkflowDefinitionStatus = 'BROUILLON' | 'ACTIF' | 'INACTIF' | 'RETIRE';
export type WorkflowDomain = 'DOCUMENT' | 'DOSSIER';
export type WorkflowInstanceStatus = 'EN_COURS' | 'TERMINE' | 'ANNULE' | 'SUSPENDU';
export type WorkflowTaskStatus = 'OUVERTE' | 'EN_COURS' | 'TERMINEE' | 'ANNULEE';
export interface WorkflowDefinition {
    id: string;
    code: string;
    name: string;
    domain: WorkflowDomain;
    version: number;
    status: WorkflowDefinitionStatus;
    institutionId: string | null;
    effectiveFrom: string;
    effectiveTo: string | null;
}
export interface WorkflowStep {
    id: string;
    definitionId: string;
    code: string;
    label: string;
    order: number;
    responsibleRoleId: string | null;
    delayMinutes: number | null;
    initial: boolean;
    final: boolean;
}
export interface WorkflowTransition {
    id: string;
    definitionId: string;
    sourceStepId: string;
    destinationStepId: string;
    code: string;
    condition: Json | null;
    action: Json | null;
    status: string;
}
export interface WorkflowBinding {
    id: string;
    definitionId: string;
    typeDocumentId: string;
    required: boolean;
    priority: number;
    from: string;
    to: string | null;
}
export type WorkflowInboxBucket = 'MINE' | 'AVAILABLE';
export interface WorkflowInboxItem {
    id: string; instanceId: string; stepId: string; stepLabel: string;
    status: WorkflowTaskStatus; dueAt: string | null;
    documentId: string; documentReference: string; documentTitle: string;
}
export interface WorkflowTask {
    taskId: string;
    stepId: string;
    status: WorkflowTaskStatus;
    roleId: string | null;
    assignedUserId: string | null;
    dueAt: string | null;
    claimedAt: string | null;
    completedAt: string | null;
    decisionCode: string | null;
    /** Les noms à montrer à la place des identifiants (absents d'un serveur plus ancien). */
    stepLabel?: string | null;
    roleName?: string | null;
    assignedUserName?: string | null;
}
/** Ce que la personne qui traite une tâche peut faire ensuite (indicatif : le serveur revérifie à la fin). */
export interface WorkflowActionOption { transitionCode: string; label: string; enabled: boolean; blockedReason: string | null }
export interface WorkflowTaskActions { taskId: string; stepLabel: string; canCompleteFinal: boolean; options: WorkflowActionOption[]; advisory: boolean }
export interface WorkflowInstance {
    instanceId: string;
    definitionId: string;
    documentId: string | null;
    status: WorkflowInstanceStatus;
    currentStepId: string | null;
    context: Json;
    startedAt: string;
    completedAt: string | null;
    entreeArchivistiqueId: string | null;
    tasks: WorkflowTask[];
}
export interface IntegrityCheck {
    fileId: string;
    checkId: string;
    result: string;
    expectedSha256: string;
    observedSha256: string | null;
    checkedAt: string;
    blocked: boolean;
}
export interface Ingestion {
    /** Computed by the server; browser time is never used to authorize recovery. */
    leaseExpired?: boolean;
    id: string;
    versionId: string;
    status: IngestionStatus;
    fileId: string | null;
    filename: string;
    mediaType: string;
    size: number;
    sha256: string;
    attempts: number;
    resultCode: string | null;
    createdAt: string;
    updatedAt: string;
}
export interface QualityControlListItem {
    id: string;
    elementNumerisationId: string;
    elementDescription: string | null;
    projetId: string;
    projetNom: string;
    projetCode: string | null;
    dateControle: string;
    conforme: boolean;
    decision: string | null;
}
export interface PreservationEventListItem {
    id: string;
    fichierId: string;
    documentId: string;
    documentReference: string | null;
    typeEvenement: string;
    dateEvenement: string;
    outil: string | null;
    resultat: string;
}
export interface PreservationEvent {
    agentId?: string | null; source?: Record<string, unknown> | null; destination?: Record<string, unknown> | null;
    id: string;
    fichierId: string;
    typeEvenement: 'MIGRATION_FORMAT' | 'RAFRAICHISSEMENT_SUPPORT' | 'VERIFICATION_FIXITE' | 'NORMALISATION' | 'AUTRE';
    dateEvenement: string;
    outil: string | null;
    versionOutil: string | null;
    resultat: 'SUCCES' | 'ECHEC' | 'PARTIEL';
    description: string | null;
}
export interface ConsultationRequest {
    id: string;
    documentId: string | null;
    dossierId: string | null;
    demandeurId: string;
    institutionId: string;
    motif: string;
    statut: 'DEPOSEE' | 'EN_INSTRUCTION' | 'AUTORISEE' | 'REFUSEE';
    instructeurId: string | null;
    decisionMotif: string | null;
    dateDepot: string;
    dateDecision: string | null;
    versionLock: number;
}
export interface Communication {
    id: string;
    documentId: string | null;
    dossierId: string | null;
    beneficiaireId: string;
    institutionId: string;
    demandeConsultationId: string | null;
    statut: 'DEMANDEE' | 'REMISE' | 'RESTITUEE';
    lieu: string | null;
    dateDemande: string;
    dateRemise: string | null;
    dateRestitutionPrevue: string | null;
    dateRestitutionEffective: string | null;
    versionLock: number;
}
export type Json = null | boolean | number | string | Json[] | {
    [key: string]: Json;
};

export type ScannerType = 'A_PLAT' | 'ALIMENTATEUR' | 'PLANETAIRE' | 'FILM' | 'AUTRE';
export type ScannerStatus = 'ACTIF' | 'MAINTENANCE' | 'RETIRE';
export interface Scanner {
    id: string;
    code: string;
    nom: string;
    fabricant: string | null;
    modele: string | null;
    numeroSerie: string | null;
    typeScanner: ScannerType;
    rectoVerso: boolean;
    resolutionMaxDpi: number | null;
    localisation: string | null;
    statut: ScannerStatus;
    versionLock: number;
}
export type ColorMode = 'NOIR_BLANC' | 'GRIS' | 'COULEUR';
export type LotStatus = 'OUVERT' | 'CLOS';
export interface ScanLot {
    id: string;
    projetNumerisationId: string;
    code: string;
    nom: string | null;
    scannerId: string | null;
    operateurId: string | null;
    resolutionDpi: number | null;
    resolutionMinDpi: number;
    modeCouleur: ColorMode;
    rectoVerso: boolean;
    statut: LotStatus;
    commentaire: string | null;
    motifCloture: string | null;
    dateCloture: string | null;
    versionLock: number;
}
export type PageFace = 'RECTO' | 'VERSO';
export type PageStatus = 'PRESENTE' | 'VIDE' | 'MANQUANTE' | 'A_RESCANNER';
export interface ScanPage {
    id: string;
    elementNumerisationId: string;
    numeroPage: number;
    face: PageFace;
    statut: PageStatus;
    fichierId: string | null;
    largeurPx: number | null;
    hauteurPx: number | null;
    dpi: number | null;
    sourceDpi: 'FICHIER' | 'SAISIE' | null;
    motif: string | null;
    versionLock: number;
}
export interface PageCheck {
    elementId: string;
    attendues: number | null;
    rectoVerso: boolean;
    resolutionMinimale: number | null;
    presentes: number[];
    vides: number[];
    aRescanner: number[];
    manquantes: number[];
    resolutionInsuffisante: Array<{ numero: number; dpi: number; minimum: number }>;
    resolutionInconnue: number[];
    feuilletsIncomplets: number[];
    complet: boolean;
}
export interface PageBatch { pages: ScanPage[]; check: PageCheck }
export interface LotSummary {
    lotId: string;
    elements: number;
    elementsTermines: number;
    pagesAttendues: number;
    pagesPresentes: number;
    pagesManquantes: number;
    pagesARescanner: number;
    pagesResolutionInsuffisante: number;
    items: Array<{ elementId: string; description: string | null; statut: DigitizationElementStatus; attendues: number | null; presentes: number; manquantes: number; aRescanner: number; resolutionInsuffisante: number; complet: boolean }>;
}

/** Résultat OCR sans son texte, avec le contexte de numérisation du fichier (vue d'ensemble). */
export interface OcrListItem {
    id: string;
    fichierId: string;
    fichierNom: string;
    documentId: string;
    documentReference: string;
    documentTitre: string;
    elementId: string | null;
    elementDescription: string | null;
    projetId: string | null;
    projetNom: string | null;
    typeReconnaissance: string;
    langue: string | null;
    moteur: string | null;
    /** Entre 0 et 1 (nombre ou chaîne selon la sérialisation du serveur). */
    confiance: number | string | null;
    numeroPage: number | null;
    statutValidation: OcrValidationStatus;
    caracteres: number;
    createdAt: string;
    /** Le moteur a donné la position de chaque mot : l'export ALTO est possible. */
    hasLayout?: boolean;
    layoutPages?: number[];
}
/* ---------- Emplacement des archives physiques : habituel, actuel, dernière présence vérifiée ---------- */
export type PresenceResult = 'PRESENTE' | 'AUTRE_EMPLACEMENT' | 'ABSENTE';
export type CurrentSource = 'HABITUEL' | 'EN_SORTIE' | 'CONSTATE_AILLEURS' | 'INTROUVABLE';
export type PlacementGap = 'INTROUVABLE' | 'AUTRE_EMPLACEMENT' | 'SORTIE_EN_RETARD' | 'NON_VERIFIEE' | 'VERIFICATION_ANCIENNE';
/** Un emplacement précis : l'unité de stockage et le chemin des localisations qui la contiennent, de la plus large à la plus fine. */
export interface StoragePlace { unitId: string; cote: string; typeUnite: string; localisation: string[]; actif: boolean }
export interface CurrentPlace { source: CurrentSource; unite: StoragePlace | null; destination: StoragePlace | null; sortiLe: string | null; retourPrevu: string | null }
export interface PresenceCheck {
    id: string;
    resultat: PresenceResult;
    verifieLe: string;
    verifieParId: string;
    verifiePar: string | null;
    uniteAttendue: StoragePlace | null;
    uniteConstatee: StoragePlace | null;
    note: string | null;
    /** Faux quand l'archive a été déplacée depuis : le constat ne vaut plus. */
    valide: boolean;
}
export interface ArchivePlacement {
    archiveId: string;
    cote: string;
    support: string | null;
    etatPhysique: string | null;
    habituel: StoragePlace;
    actuel: CurrentPlace;
    derniereVerification: PresenceCheck | null;
    ageVerificationJours: number | null;
    ecarts: PlacementGap[];
    seuilVerificationJours: number;
}
export interface PlacementEvent {
    id: string;
    genre: 'VERIFICATION' | 'SORTIE' | 'RETOUR' | 'RANGEMENT';
    at: string;
    parId: string | null;
    par: string | null;
    de: StoragePlace | null;
    vers: StoragePlace | null;
    resultat: PresenceResult | null;
    texte: string | null;
    retourPrevu: string | null;
}
export interface OriginalPlacement { archivePhysiqueId: string; cote: string; libelle: string | null; emplacement: ArchivePlacement | null; mouvement?: OpenMovement | null }
/** L'emplacement d'un bien : celui de ses originaux physiques. Masqué sans le droit de lire les archives physiques. */
export interface AssetLocation { emplacementVisible: boolean; originaux: OriginalPlacement[] }
export interface PlacementRow { archiveId: string; cote: string; support: string | null; etatPhysique: string | null; habituel: StoragePlace; actuel: CurrentPlace; ecarts: PlacementGap[]; verifieLe: string | null }
export interface PlacementAssetLink { id: string; identifiant: string; intitule: string }
export interface HeritagePlacementRow { emplacement: PlacementRow; bien: PlacementAssetLink | null }
export interface HeritagePlacementPage { items: HeritagePlacementRow[]; page: number; size: number; total: number; hasMore: boolean }
export interface PlacementFilters { ecart?: string; q?: string; page?: number; size?: number }
/* ---------- Récolement : vérifier la collection pièce par pièce ---------- */
export type CampaignStatus = 'PLANIFIEE' | 'EN_COURS' | 'CLOTUREE' | 'ANNULEE';
export type ElementStatus = 'A_VERIFIER' | 'VERIFIE' | 'REPORTE';
/** Avancement : chaque élément n'est compté qu'une fois ; un report n'est pas une vérification. */
export interface RecolementProgress {
    total: number;
    verifies: number;
    conformes: number;
    autresEmplacements: number;
    introuvables: number;
    reportes: number;
    restants: number;
    traitesPourcent: number;
    verifiesPourcent: number;
}
export interface RecolementTransitionOption { vers: CampaignStatus; permissions: string[]; peutAgir: boolean; motifRequis: boolean; bloquants: AssetGap[] }
export interface Recolement {
    id: string;
    numero: string;
    institutionId: string;
    departementId: string | null;
    libelle: string;
    objet: string | null;
    localisationId: string | null;
    localisation: string[];
    dateDebutPrevue: string | null;
    dateFinPrevue: string | null;
    statut: CampaignStatus;
    lanceParId: string | null;
    lanceLe: string | null;
    clotureParId: string | null;
    clotureLe: string | null;
    clotureResume: string | null;
    annuleLe: string | null;
    annuleMotif: string | null;
    /** Nombre d'originaux que le lancement fixerait (avant le lancement seulement). */
    perimetre: number | null;
    progres: RecolementProgress;
    modifiable: boolean;
    peutConstater: boolean;
    passages: RecolementTransitionOption[];
    version: number;
    createdAt: string;
    updatedAt: string;
}
export interface RecolementSummary {
    id: string;
    numero: string;
    institutionId: string;
    libelle: string;
    localisation: string[];
    statut: CampaignStatus;
    dateDebutPrevue: string | null;
    dateFinPrevue: string | null;
    lanceLe: string | null;
    clotureLe: string | null;
    progres: RecolementProgress;
    updatedAt: string;
}
export interface RecolementPage { items: RecolementSummary[]; page: number; size: number; total: number; hasMore: boolean }
export interface RecolementElement {
    id: string;
    archiveId: string;
    cote: string;
    support: string | null;
    etatPhysique: string | null;
    bienId: string;
    bienIdentifiant: string;
    bienIntitule: string;
    habituel: StoragePlace | null;
    statut: ElementStatus;
    resultat: PresenceResult | null;
    verifieLe: string | null;
    verifiePar: string | null;
    uniteConstatee: StoragePlace | null;
    note: string | null;
    motifReport: string | null;
    traiteLe: string | null;
    enSortie: boolean;
    version: number;
}
export interface RecolementElementPage { items: RecolementElement[]; page: number; size: number; total: number; hasMore: boolean }
export interface RecolementEcart { element: RecolementElement; ouvert: boolean; ecartsActuels: string[] }
export interface RecolementReport { progres: RecolementProgress; ecarts: RecolementEcart[]; ecartsTotal: number; ecartsOuverts: number; reportes: RecolementElement[]; reportesTotal: number }
export interface RecolementJournalEntry { id: string; genre: string; champ: string | null; ancienneValeur: unknown; nouvelleValeur: unknown; motif: string | null; auteurId: string | null; createdAt: string }
export interface RecolementLocation { id: string; parentId: string | null; libelle: string; typeLocalisation: string }
export interface RecolementFilters { q?: string; statut?: string; page?: number; size?: number }
export interface RecolementElementFilters { statut?: string; resultat?: string; q?: string; enSortie?: string; page?: number; size?: number }
/* ---------- Conservation : constats d'état successifs et traitements ---------- */
export type ConditionState = 'STABLE' | 'FRAGILE' | 'INTERVENTION_REQUISE';
export type Handling = 'LIBRE' | 'PRECAUTIONS' | 'INTERDITE';
export type Urgency = 'AUCUNE' | 'A_PLANIFIER' | 'URGENTE';
export type ReportContext = 'RECEPTION' | 'REPRISE_INVENTAIRE' | 'PERIODIQUE' | 'RECOLEMENT' | 'AVANT_MOUVEMENT' | 'APRES_MOUVEMENT' | 'AVANT_TRAITEMENT' | 'APRES_TRAITEMENT' | 'AUTRE';
export type TreatmentType = 'NETTOYAGE' | 'CONSOLIDATION' | 'RESTAURATION' | 'RELIURE' | 'DESACIDIFICATION' | 'CONDITIONNEMENT' | 'AUTRE';
export type TreatmentStatus = 'PROPOSE' | 'VALIDE' | 'EN_COURS' | 'TERMINE' | 'REFUSE' | 'ANNULE';
export type ConservationAttention = 'INTERVENTION_REQUISE' | 'TRAITEMENT_A_VALIDER' | 'TRAITEMENT_A_DEMARRER' | 'TRAITEMENT_EN_COURS' | 'FRAGILE' | 'CONSTAT_ANCIEN' | 'SANS_CONSTAT';
export interface ConditionDocument { documentId: string; titre: string; identifiantMetier: string | null; libelle: string | null; confidentiel: boolean }
/** Un constat d'état : ce qui a été vu, à quelle date, par qui. Il ne se modifie pas ; un constat plus récent le remplace. */
export interface ConditionReport {
    id: string;
    archiveId: string;
    contexte: ReportContext;
    etat: ConditionState;
    manipulation: Handling;
    urgence: Urgency;
    alterations: string[];
    observations: string;
    traitementRecommande: string | null;
    constateLe: string;
    auteurId: string;
    auteur: string | null;
    createdAt: string;
    documents: ConditionDocument[];
}
export interface TreatmentTransitionOption { vers: TreatmentStatus; permissions: string[]; peutAgir: boolean; motifRequis: boolean; intervenantRequis: boolean; constatRequis: boolean; bloquants: AssetGap[] }
export interface Treatment {
    id: string;
    numero: string;
    bienId: string;
    archiveId: string;
    intitule: string;
    typeTraitement: TreatmentType;
    diagnostic: string;
    traitementPrevu: string;
    constatAvantId: string;
    constatApresId: string | null;
    statut: TreatmentStatus;
    proposeParId: string;
    proposeLe: string;
    valideParId: string | null;
    valideLe: string | null;
    fermeParId: string | null;
    fermeLe: string | null;
    fermeMotif: string | null;
    intervenant: string | null;
    debutLe: string | null;
    finLe: string | null;
    compteRendu: string | null;
    modifiable: boolean;
    passages: TreatmentTransitionOption[];
    version: number;
    createdAt: string;
}
export interface OriginalConservation {
    archiveId: string;
    cote: string;
    libelle: string | null;
    etat: ConditionState | null;
    /** Ce que l'on peut faire de l'objet maintenant : interdit pendant un traitement en cours. */
    manipulation: Handling | null;
    urgence: Urgency | null;
    contexte: ReportContext | null;
    constateLe: string | null;
    ageConstatJours: number | null;
    enTraitement: boolean;
    attention: ConservationAttention[];
    constats: ConditionReport[];
    traitements: Treatment[];
    peutConstater: boolean;
    peutProposer: boolean;
    seuilConstatJours: number;
}
export interface AssetConservation { bienId: string; identifiant: string; intitule: string; institutionId: string; etatMateriel: string; originaux: OriginalConservation[] }
export interface TreatmentJournalEntry { id: string; genre: string; champ: string | null; ancienneValeur: unknown; nouvelleValeur: unknown; motif: string | null; auteurId: string | null; createdAt: string }
export interface ConservationQueueRow {
    bienId: string;
    bienIdentifiant: string;
    bienIntitule: string;
    archiveId: string;
    cote: string;
    etat: ConditionState | null;
    manipulation: Handling | null;
    urgence: Urgency | null;
    constateLe: string | null;
    traitementId: string | null;
    traitementNumero: string | null;
    traitementStatut: TreatmentStatus | null;
    attention: ConservationAttention[];
}
export interface ConservationQueuePage { items: ConservationQueueRow[]; page: number; size: number; total: number; hasMore: boolean }
export interface ConservationQueueFilters { attention?: string; q?: string; page?: number; size?: number }
/* ---------- Mouvements : demande, autorisation, remise, réception, retour ---------- */
export type MovementPurpose = 'CONSULTATION' | 'NUMERISATION' | 'EXPOSITION' | 'PRET' | 'RESTAURATION' | 'EXPERTISE' | 'TRANSFERT' | 'AUTRE';
export type MovementRequestStatus = 'DEMANDEE' | 'AUTORISEE' | 'REFUSEE' | 'ANNULEE' | 'REMISE' | 'RECUE' | 'RETOURNEE';
/** Une personne qui a fait quelque chose, à un moment. */
export interface MovementStep { parId: string; par: string | null; le: string }
export interface MovementTransitionOption { vers: MovementRequestStatus; permissions: string[]; peutAgir: boolean; motifRequis: boolean; conditionsRequises: boolean; conformiteRequise: boolean; bloquants: AssetGap[]; /** Un original d'un prêt ou d'une exposition rentre toujours avec un constat d'état. */ constatRequis?: boolean }
export interface MovementRequest {
    id: string;
    numero: string;
    bienId: string;
    bienIdentifiant: string;
    bienIntitule: string;
    institutionId: string;
    archiveId: string;
    cote: string;
    objet: MovementPurpose;
    motif: string;
    destination: string;
    destinataire: string;
    retourPrevu: string;
    statut: MovementRequestStatus;
    demande: MovementStep;
    decision: MovementStep | null;
    decisionMotif: string | null;
    conditions: string | null;
    remise: MovementStep | null;
    mouvementId: string | null;
    reception: MovementStep | null;
    retour: MovementStep | null;
    retourConforme: boolean | null;
    retourNote: string | null;
    retourConstatId: string | null;
    fermeture: MovementStep | null;
    fermeMotif: string | null;
    enRetard: boolean;
    joursRetard: number | null;
    modifiable: boolean;
    passages: MovementTransitionOption[];
    version: number;
    createdAt: string;
    /** La commande de numérisation à laquelle la sortie est liée, quand elle l'est. */
    numerisation?: { id: string; numero: string; statut: OrderStatus } | null;
    /** Le dossier de prêt ou d'exposition auquel la sortie est liée, quand elle l'est. */
    dossier?: { id: string; numero: string; nature: DossierNature; statut: DossierStatus } | null;
}
export interface MovementRow {
    id: string;
    numero: string;
    bienId: string;
    bienIdentifiant: string;
    bienIntitule: string;
    archiveId: string;
    cote: string;
    objet: MovementPurpose;
    destination: string;
    destinataire: string;
    retourPrevu: string;
    statut: MovementRequestStatus;
    demandeLe: string;
    demandePar: string | null;
    enRetard: boolean;
    joursRetard: number | null;
}
export interface MovementPage { items: MovementRow[]; page: number; size: number; total: number; hasMore: boolean }
export interface MovementJournalEntry { id: string; genre: string; champ: string | null; ancienneValeur: unknown; nouvelleValeur: unknown; motif: string | null; auteurId: string | null; createdAt: string }
/** La demande ouverte d'un original, quand il y en a une. */
export interface OpenMovement { id: string; numero: string; statut: MovementRequestStatus; objet: MovementPurpose; destination: string; retourPrevu: string; enRetard: boolean }
export interface MovementFilters { statut?: string; objet?: string; bienId?: string; q?: string; enRetard?: string; mine?: string; institutionId?: string; page?: number; size?: number }
/* ---------- Numérisation commandée par le patrimoine : commande, prise en charge, réception ---------- */
export type OrderStatus = 'COMMANDEE' | 'EN_COURS' | 'RECEPTIONNEE' | 'ANNULEE';
export type OrderStage = 'SORTIE_A_AUTORISER' | 'A_PRENDRE_EN_CHARGE' | 'ORIGINAL_A_REMETTRE' | 'NUMERISATION' | 'ORIGINAL_A_RENDRE' | 'FINALISATION' | 'A_RECEPTIONNER' | 'RECEPTIONNEE' | 'ANNULEE';
export interface OrderTransitionOption { vers: OrderStatus; permissions: string[]; peutAgir: boolean; motifRequis: boolean; projetRequis: boolean; bloquants: AssetGap[] }
/** La sortie de l'original liée à la commande. */
export interface OrderMovement { id: string; numero: string; statut: MovementRequestStatus; destination: string; destinataire: string; retourPrevu: string; enRetard: boolean; joursRetard: number | null }
/** L'élément de numérisation créé par l'atelier, avec l'avancement de ses pages. */
export interface OrderElement { id: string; statut: string; projetId: string; projetNom: string; lotId: string | null; lotCode: string | null; pagesAttendues: number | null; pagesPresentes: number }
export interface DigitizationOrder {
    id: string;
    numero: string;
    bienId: string;
    bienIdentifiant: string;
    bienIntitule: string;
    institutionId: string;
    archiveId: string;
    cote: string;
    documentId: string;
    documentIdentifiant: string;
    statut: OrderStatus;
    etape: OrderStage;
    motif: string;
    consignes: string | null;
    resolutionMinDpi: number | null;
    pagesAttendues: number | null;
    rectoVerso: boolean;
    reprise: boolean;
    commande: MovementStep;
    priseEnCharge: MovementStep | null;
    reception: MovementStep | null;
    receptionNote: string | null;
    fermeture: MovementStep | null;
    fermeMotif: string | null;
    mouvement: OrderMovement;
    element: OrderElement | null;
    passages: OrderTransitionOption[];
    version: number;
    createdAt: string;
}
export interface DigitizationOrderRow {
    id: string;
    numero: string;
    bienId: string;
    bienIdentifiant: string;
    bienIntitule: string;
    archiveId: string;
    cote: string;
    statut: OrderStatus;
    etape: OrderStage;
    retourPrevu: string;
    enRetard: boolean;
    joursRetard: number | null;
    reprise: boolean;
    commandeLe: string;
    commandePar: string | null;
    elementStatut: string | null;
}
export interface DigitizationOrderPage { items: DigitizationOrderRow[]; page: number; size: number; total: number; hasMore: boolean }
export interface DigitizationOrderJournalEntry { id: string; genre: string; champ: string | null; ancienneValeur: unknown; nouvelleValeur: unknown; motif: string | null; auteurId: string | null; createdAt: string }
export interface OrderLot { id: string; code: string; nom: string | null; resolutionMinDpi: number }
export interface OrderProject { id: string; nom: string; code: string | null; lots: OrderLot[] }
export interface DigitizationOrderFilters { statut?: string; bienId?: string; q?: string; mine?: string; institutionId?: string; page?: number; size?: number }
/* ---------- Portail public : lecteurs, formules, abonnements, caisse ---------- */
export type SubscriptionState = 'EN_ATTENTE_PAIEMENT' | 'A_VENIR' | 'EN_COURS' | 'EXPIRE' | 'ANNULE';
export type PaymentMode = 'ESPECES' | 'VIREMENT' | 'MOBILE_MONEY' | 'AUTRE';
export interface PortalPage<T> { items: T[]; page: number; size: number; total: number; hasMore: boolean }
/** Une page lisible d'un document sur le portail et le nombre de ses images (1 pour une page d'une seule image). */
export interface PortalReadablePage { number: number; images: number }
export interface PortalReader { id: string; numero: string; email: string; prenom: string; nom: string; organisme: string | null; categorie: string | null; emailVerifie: boolean; conditionsVersion: string; creeLe: string }
export interface PublicPlan { id: string; code: string; libelle: string; description: string | null; dureeMois: number; montant: number; devise: string; telechargement: boolean; categorie: string | null }
export interface PortalReceiptRef { numero: string; recuLe: string; mode: PaymentMode }
export interface PortalSubscription {
    id: string; numero: string; formuleCode: string; formuleLibelle: string; dureeMois: number; montant: number; devise: string; referencePaiement: string; statut: string; etat: SubscriptionState;
    demandeLe: string; debutLe: string | null; finLe: string | null; modeActivation: 'PAIEMENT' | 'EXONERATION' | null; paiement: PortalReceiptRef | null; annuleLe: string | null; annuleMotif: string | null; annuleParLecteur: boolean;
}
export interface PortalNoticeSummary { id: string; intitule: string; categorie: string | null; categorieLibelle: string | null; dateTexte: string | null; extrait: string | null; documents: number; /** Documents que l'institution ouvre sur demande. */ surDemande: number }
/** LIBRE : se lit avec un abonnement. SUR_DEMANDE : l'institution décide de l'accès, document par document. */
export interface PortalNoticeDocument { id: string; titre: string; pages: number; acces: 'LIBRE' | 'SUR_DEMANDE' }
export interface PortalNotice {
    id: string; intitule: string; categorie: string | null; categorieLibelle: string | null; resume: string | null; langues: string[]; ecritures: string[]; support: string | null; materiaux: string | null; dimensions: string | null;
    paginationDuree: string | null; dateDebut: string | null; dateFin: string | null; precisionDate: string | null; dateTexte: string | null; attributionIncertaine: boolean; bibliographie: string | null; documents: PortalNoticeDocument[];
}
export interface PortalNoticeFilters { q?: string; categorie?: string; page?: number; size?: number }
export interface PortalCategory { code: string; libelle: string }
export interface RegistrationForm { email: string; motDePasse: string; prenom: string; nom: string; organisme: string; categorie: string; accepteConditions: boolean }
/** Le personnel : formules, lecteurs, abonnements et caisse. */
export interface AdminPlan { id: string; code: string; libelle: string; description: string | null; dureeMois: number; montant: number; devise: string; telechargement: boolean; categorie: string | null; actif: boolean; ordre: number; version: number; abonnementsEnCours: number }
export interface PortalReaderRef { id: string; numero: string; nom: string; email: string; categorie: string | null; suspendu: boolean; emailVerifie: boolean }
export interface PortalPayment {
    id: string; numero: string; abonnementId: string; abonnementNumero: string; lecteurNumero: string; lecteurNom: string; formuleLibelle: string; montant: number; devise: string; mode: PaymentMode; referenceExterne: string | null;
    note: string | null; recuPar: string | null; recuParId: string; recuLe: string; statut: 'ENREGISTRE' | 'ANNULE'; annulePar: string | null; annuleLe: string | null; annuleMotif: string | null; peutAnnuler: boolean;
}
export interface AdminSubscription {
    id: string; numero: string; lecteur: PortalReaderRef; formuleCode: string; formuleLibelle: string; dureeMois: number; montant: number; devise: string; referencePaiement: string; statut: string; etat: SubscriptionState;
    demandeLe: string; debutLe: string | null; finLe: string | null; modeActivation: 'PAIEMENT' | 'EXONERATION' | null; exonerationMotif: string | null; paiement: PortalPayment | null; annuleLe: string | null; annuleMotif: string | null;
    peutEncaisser: boolean; peutExonerer: boolean; peutAnnuler: boolean;
}
export interface PortalReceipt { paiement: PortalPayment; lecteurEmail: string; formuleCode: string; dureeMois: number; debutLe: string | null; finLe: string | null }
export interface AdminReader {
    id: string; numero: string; email: string; prenom: string; nom: string; organisme: string | null; categorie: string | null; suspendu: boolean; motifSuspension: string | null; emailVerifie: boolean; creeLe: string;
    derniereConnexionLe: string | null; abonnementEtat: string | null; abonnementFinLe: string | null; pagesLuesHeure: number;
}
export interface PaymentFilters { statut?: string; mode?: string; from?: string; to?: string; mine?: string; q?: string; page?: number; size?: number }
export interface AdminSubscriptionFilters { etat?: string; q?: string; page?: number; size?: number }
export interface AdminReaderFilters { statut?: string; q?: string; page?: number; size?: number }

/* ---------- Prêts sortants et expositions : dossier, originaux, convention, assurance, transport ---------- */
export type DossierNature = 'PRET' | 'EXPOSITION';
export type DossierStatus = 'EN_INSTRUCTION' | 'ACCEPTE' | 'REFUSE' | 'ANNULE' | 'CLOS';
export type DossierStage = 'EN_INSTRUCTION' | 'A_PREPARER' | 'EN_PREPARATION' | 'EN_COURS' | 'A_CLORE' | 'CLOS' | 'REFUSE' | 'ANNULE';
export interface DossierTransitionOption { vers: DossierStatus; permissions: string[]; peutAgir: boolean; motifRequis: boolean; bloquants: AssetGap[] }
/** La sortie d'un original du dossier : une demande de mouvement, avec son étape. */
export interface DossierMovement { id: string; numero: string; statut: MovementRequestStatus; retourPrevu: string; enRetard: boolean; joursRetard: number | null }
export interface DossierReport { id: string; contexte: string; constateLe: string; etat: ConditionState; manipulation: Handling }
export interface DossierElement {
    id: string; bienId: string; bienIdentifiant: string; bienIntitule: string; archiveId: string; cote: string; valeurAssuree: number | null; conditions: string | null; emplacement: string | null;
    sortie: DossierMovement | null; constatDepart: DossierReport | null; constatRetour: DossierReport | null; obstacles: AssetGap[];
}
export interface DossierConvention { reference: string | null; signeeLe: string | null; signataire: string | null }
export interface DossierAssurance { assureur: string | null; police: string | null; du: string | null; au: string | null; exonerationMotif: string | null; devise: string | null }
export interface DossierTransport { mode: string | null; transporteur: string | null; convoyeur: string | null; allerLe: string | null; retourLe: string | null; emballage: string | null }
export interface Dossier {
    classificationNodeId?: string | null;
    id: string; numero: string; nature: DossierNature; institutionId: string; intitule: string; objet: string; lieuNom: string; lieuAdresse: string | null; dateDebut: string; dateFin: string; retourPrevu: string;
    emprunteurNom: string | null; emprunteurContact: string | null; commissaire: string | null; convention: DossierConvention; assurance: DossierAssurance; transport: DossierTransport;
    statut: DossierStatus; etape: DossierStage; creation: MovementStep; decision: MovementStep | null; decisionMotif: string | null; fermeture: MovementStep | null; fermeMotif: string | null;
    enRetard: boolean; joursRetard: number | null; prolongations: number; valeurTotale: number | null; elements: DossierElement[]; preparation: AssetGap[]; passages: DossierTransitionOption[];
    peutModifier: boolean; peutCompleter: boolean; peutPreparer: boolean; peutProlonger: boolean; peutConstater: boolean; sortiesADemander: number; version: number; createdAt: string;
}
export interface DossierRow {
    id: string; numero: string; nature: DossierNature; intitule: string; lieuNom: string; emprunteurNom: string | null; dateDebut: string; dateFin: string; retourPrevu: string; statut: DossierStatus; etape: DossierStage;
    enRetard: boolean; joursRetard: number | null; originaux: number; creeLe: string; creePar: string | null;
}
export interface DossierPage { items: DossierRow[]; page: number; size: number; total: number; hasMore: boolean }
export interface DossierSummary { aDecider: number; aPreparer: number; enPreparation: number; enCours: number; enRetard: number; aClore: number; retoursSous30Jours: number }
export interface DossierJournalEntry { id: string; genre: string; champ: string | null; ancienneValeur: unknown; nouvelleValeur: unknown; motif: string | null; auteurId: string | null; createdAt: string }
export interface DossierFilters { statut?: string; nature?: string; bienId?: string; q?: string; mine?: string; institutionId?: string; page?: number; size?: number }

/* ---------- Accès sur demande : un lecteur demande un document que le public ne lit pas librement ---------- */
export type AccessRequestStatus = 'DEPOSEE' | 'EN_INSTRUCTION' | 'ACCORDEE' | 'REFUSEE' | 'ANNULEE' | 'REVOQUEE';
/** L'état affiché : celui de la décision, avec l'expiration d'un accès accordé calculée par le serveur. */
export type AccessRequestState = AccessRequestStatus | 'EXPIREE';
export interface PortalAccessRequest {
    id: string; numero: string; documentId: string; documentTitre: string; noticeId: string | null; noticeIntitule: string | null; motif: string; statut: AccessRequestStatus; etat: AccessRequestState;
    deposeLe: string; decideLe: string | null; message: string | null; accordeJusquAu: string | null; annuleLe: string | null; peutAnnuler: boolean;
}
export interface AdminAccessRequest {
    id: string; numero: string; lecteur: PortalReaderRef; lecteurOrganisme: string | null; documentId: string; documentTitre: string; documentIdentifiant: string; noticeId: string | null; noticeIntitule: string | null;
    institutionId: string; motif: string; statut: AccessRequestStatus; etat: AccessRequestState; deposeLe: string; instructeur: string | null; prisEnChargeLe: string | null; decidePar: string | null; decideLe: string | null;
    message: string | null; accordeJusquAu: string | null; revoquePar: string | null; revoqueLe: string | null; revoqueMotif: string | null; annuleLe: string | null;
    peutPrendreEnCharge: boolean; peutAccorder: boolean; peutRefuser: boolean; peutRevoquer: boolean; lecteurAbonne: boolean;
}
export interface AccessRequestRow {
    id: string; numero: string; lecteurNumero: string; lecteurNom: string; documentTitre: string; noticeIntitule: string | null; statut: AccessRequestStatus; etat: AccessRequestState; deposeLe: string; accordeJusquAu: string | null; instructeur: string | null;
}
export interface AccessJournalEntry { id: string; genre: string; auteur: string | null; auteurLecteur: boolean; motif: string | null; createdAt: string }
export interface AccessRequestFilters { statut?: string; q?: string; page?: number; size?: number }

/* ---------- Cycle de vie d'un document : de « brouillon » à « clos », et les règles de conservation ---------- */
export interface LifecycleVersion { id: string; number: number; sealed: boolean }
/** Où en est un document (version courante, fichiers) et ce qui empêche de sceller puis de clore ; indicatif, le serveur revérifie. */
export interface DocumentLifecycle {
    businessStatus: string; archivalStatus: string; destroyed: boolean; version: LifecycleVersion | null;
    files: number; validatedFiles: number; validatedMasters: number; sealBlockers: string[]; closeBlockers: string[];
}
export interface RetentionRuleVersionSummary {
    legalDescription?: string | null;
    id: string; number: number; status: 'BROUILLON' | 'ACTIVE' | 'RETIRE' | string; effectiveFrom: string; effectiveTo: string | null; duration: number; unit: string; trigger: string; finalDisposition: string;
    legalReference: string | null; typeDocumentIds: string[]; classificationNodeIds: string[]; currentPhaseDuration?: number | null; currentPhaseUnit?: string | null;
    triggerEventTypeId?: string | null; triggerEventTypeLabel?: string | null; sampling?: SamplingSummary | null;
}
export interface SamplingSummary { method: string; step: number | null; rate: number | null; modulo: number | null; remainder: number | null; note: string | null }
export interface RetentionRuleListItem {
    description?: string | null;
    id: string; code: string; label: string; scope: 'NATIONAL' | 'INSTITUTION' | string; institutionId: string | null; priority: number; status: string;
    versions: RetentionRuleVersionSummary[]; deletable: boolean;
}
