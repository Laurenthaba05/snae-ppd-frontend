import type { Transport } from '../core/http';
import { IamApi } from '../api/iam';
import { RecordsApi } from '../api/records';
import { RetentionApi } from '../api/retention';
import { SearchApi } from '../api/search';
import { PublicationApi } from '../api/publication';
import { AuditApi } from '../api/audit';
import { ClassificationApi } from '../api/classification';
import { PhysicalArchivesApi } from '../api/physicalArchives';
import { HeritageApi } from '../api/heritage';
import { DigitizationApi } from '../api/digitization';
import { RightsApi } from '../api/rights';
import { MetadataApi } from '../api/metadata';
import { ArchivalIntakeApi } from '../api/archivalIntake';
import { WorkflowApi } from '../api/workflow';
import { ConsultationApi } from '../api/consultation';
import { PortalAdminApi } from '../api/portalAdmin';
import { ReadingRoomApi } from '../api/readingRoom';
import { PreservationPlanningApi } from '../api/preservationPlanning';
import { DisseminationApi } from '../api/dissemination';
import { VocabularyApi } from '../api/vocabulary';
import { NotificationsApi } from '../api/notifications';
import { CodificationApi } from '../api/codification';
import { DashboardApi } from '../api/dashboard';
import { AssistantApi } from '../api/assistant';

/**
 * Les clients d'API de l'application, déclarés une seule fois : ajouter un module, c'est ajouter une ligne ici. Chacun est créé sur le même transport quand la connexion est
 * initialisée ; ils sont absents (`null`) avant, et en démonstration à l'exception du client des identités.
 */
const factories = {
    api: (t: Transport) => new IamApi(t),
    records: (t: Transport) => new RecordsApi(t),
    retention: (t: Transport) => new RetentionApi(t),
    search: (t: Transport) => new SearchApi(t),
    publication: (t: Transport) => new PublicationApi(t),
    audit: (t: Transport) => new AuditApi(t),
    classification: (t: Transport) => new ClassificationApi(t),
    physicalArchives: (t: Transport) => new PhysicalArchivesApi(t),
    heritage: (t: Transport) => new HeritageApi(t),
    digitization: (t: Transport) => new DigitizationApi(t),
    rights: (t: Transport) => new RightsApi(t),
    metadata: (t: Transport) => new MetadataApi(t),
    archivalIntake: (t: Transport) => new ArchivalIntakeApi(t),
    workflow: (t: Transport) => new WorkflowApi(t),
    consultation: (t: Transport) => new ConsultationApi(t),
    portalAdmin: (t: Transport) => new PortalAdminApi(t),
    readingRoom: (t: Transport) => new ReadingRoomApi(t),
    preservationPlanning: (t: Transport) => new PreservationPlanningApi(t),
    dissemination: (t: Transport) => new DisseminationApi(t),
    vocabulary: (t: Transport) => new VocabularyApi(t),
    notifications: (t: Transport) => new NotificationsApi(t),
    codification: (t: Transport) => new CodificationApi(t),
    dashboard: (t: Transport) => new DashboardApi(t),
    assistant: (t: Transport) => new AssistantApi(t)
};

export type Clients = { [K in keyof typeof factories]: ReturnType<(typeof factories)[K]> };
/** Les clients tels que l'écran les reçoit : chacun peut être absent. */
export type ClientSet = { [K in keyof Clients]: Clients[K] | null };

const names = Object.keys(factories) as (keyof Clients)[];
export const noClients = (): ClientSet => Object.fromEntries(names.map(name => [name, null])) as ClientSet;
export const createClients = (transport: Transport): Clients => Object.fromEntries(names.map(name => [name, factories[name](transport)])) as Clients;
