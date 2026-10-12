import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
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
import { HttpTransport, ApiError } from '../core/http';
import type { Me } from '../core/types';
import { canonical } from '../core/validation';
import { config, configIssue } from './config';
import { createAuthDriver, type AuthDriver } from './driver';
import type { DemoTransport } from '../demo/transport';
import { navigate } from '../ui/navigation';
interface SessionValue {
    me: Me | null;
    api: IamApi | null;
    records: RecordsApi | null;
    retention: RetentionApi | null;
    search: SearchApi | null;
    publication: PublicationApi | null;
    audit: AuditApi | null;
    classification: ClassificationApi | null;
    physicalArchives: PhysicalArchivesApi | null;
    heritage: HeritageApi | null;
    digitization: DigitizationApi | null;
    rights: RightsApi | null;
    metadata: MetadataApi | null;
    archivalIntake: ArchivalIntakeApi | null;
    workflow: WorkflowApi | null;
    consultation: ConsultationApi | null;
    portalAdmin: PortalAdminApi | null;
    readingRoom: ReadingRoomApi | null;
    preservationPlanning: PreservationPlanningApi | null;
    dissemination: DisseminationApi | null;
    vocabulary: VocabularyApi | null;
    notifications: NotificationsApi | null;
    busy: boolean;
    error: unknown;
    demo: boolean;
    epoch: number;
    signIn: (email?: string, password?: string) => Promise<void>;
    logout: () => Promise<void>;
    refresh: () => Promise<void>;
    switchPersona: (persona: 'a' | 'b' | 'agent') => Promise<void>;
    resetDemo: () => Promise<void>;
}
const Context = createContext<SessionValue | null>(null);
export function useSession(): SessionValue {
    const value = useContext(Context);
    if (!value)
        throw new Error('SessionProvider requis');
    return value;
}
export function SessionProvider({ children }: {
    children: React.ReactNode;
}) {
    const [me, setMe] = useState<Me | null>(null);
    const [api, setApi] = useState<IamApi | null>(null);
    const [records, setRecords] = useState<RecordsApi | null>(null);
    const [retention, setRetention] = useState<RetentionApi | null>(null);
    const [search, setSearch] = useState<SearchApi | null>(null);
    const [publication, setPublication] = useState<PublicationApi | null>(null);
    const [audit, setAudit] = useState<AuditApi | null>(null);
    const [classification, setClassification] = useState<ClassificationApi | null>(null);
    const [physicalArchives, setPhysicalArchives] = useState<PhysicalArchivesApi | null>(null);
    const [heritage, setHeritage] = useState<HeritageApi | null>(null);
    const [digitization, setDigitization] = useState<DigitizationApi | null>(null);
    const [rights, setRights] = useState<RightsApi | null>(null);
    const [metadata, setMetadata] = useState<MetadataApi | null>(null);
    const [archivalIntake, setArchivalIntake] = useState<ArchivalIntakeApi | null>(null);
    const [workflow, setWorkflow] = useState<WorkflowApi | null>(null);
    const [consultation, setConsultation] = useState<ConsultationApi | null>(null);
    const [portalAdmin, setPortalAdmin] = useState<PortalAdminApi | null>(null);
    const [readingRoom, setReadingRoom] = useState<ReadingRoomApi | null>(null);
    const [preservationPlanning, setPreservationPlanning] = useState<PreservationPlanningApi | null>(null);
    const [dissemination, setDissemination] = useState<DisseminationApi | null>(null);
    const [vocabulary, setVocabulary] = useState<VocabularyApi | null>(null);
    const [notifications, setNotifications] = useState<NotificationsApi | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const [epoch, setEpoch] = useState(0);
    const driver = useRef<AuthDriver | null>(null);
    const client = useRef<IamApi | null>(null);
    const recordsClient = useRef<RecordsApi | null>(null);
    const retentionClient = useRef<RetentionApi | null>(null);
    const searchClient = useRef<SearchApi | null>(null);
    const publicationClient = useRef<PublicationApi | null>(null);
    const auditClient = useRef<AuditApi | null>(null);
    const classificationClient = useRef<ClassificationApi | null>(null);
    const physicalArchivesClient = useRef<PhysicalArchivesApi | null>(null);
    const heritageClient = useRef<HeritageApi | null>(null);
    const digitizationClient = useRef<DigitizationApi | null>(null);
    const rightsClient = useRef<RightsApi | null>(null);
    const metadataClient = useRef<MetadataApi | null>(null);
    const archivalIntakeClient = useRef<ArchivalIntakeApi | null>(null);
    const workflowClient = useRef<WorkflowApi | null>(null);
    const consultationClient = useRef<ConsultationApi | null>(null);
    const portalAdminClient = useRef<PortalAdminApi | null>(null);
    const readingRoomClient = useRef<ReadingRoomApi | null>(null);
    const preservationPlanningClient = useRef<PreservationPlanningApi | null>(null);
    const disseminationClient = useRef<DisseminationApi | null>(null);
    const vocabularyClient = useRef<VocabularyApi | null>(null);
    const notificationsClient = useRef<NotificationsApi | null>(null);
    const http = useRef<HttpTransport | null>(null);
    const mock = useRef<DemoTransport | null>(null);
    const current = useRef<Me | null>(null);
    const generation = useRef(0);
    const initializing = useRef<Promise<void> | null>(null);
    const refreshInFlight = useRef<Promise<void> | null>(null);
    const setIdentity = (value: Me | null) => {
        if (canonical(current.current) !== canonical(value)) {
            setEpoch(x => x + 1);
            current.current = value;
            setMe(value);
        }
    };
    const expire = () => { generation.current++; http.current?.abortAll(); setIdentity(null); setError(new ApiError(401, 'SESSION_EXPIRED', 'Votre session a expiré. Reconnectez-vous.')); navigate('/connexion'); };
    const refresh = useCallback(async () => {
        if (refreshInFlight.current)
            return refreshInFlight.current;
        const gen = generation.current;
        const task = (async () => {
            if (!client.current)
                return;
            try {
                const identity = await client.current.me();
                if (gen !== generation.current)
                    return;
                setIdentity(identity);
                setError(null);
            }
            catch (e) {
                if (gen !== generation.current)
                    return;
                setIdentity(null);
                setError(e);
            }
        })();
        refreshInFlight.current = task;
        try {
            await task;
        }
        finally {
            refreshInFlight.current = null;
        }
    }, []);
    const initialize = async () => {
        if (initializing.current)
            return initializing.current;
        initializing.current = (async () => {
            const d = await createAuthDriver();
            driver.current = d;
            http.current = new HttpTransport(config.apiBase, () => d.accessToken(), expire);
            client.current = new IamApi(http.current);
            setApi(client.current);
            recordsClient.current = new RecordsApi(http.current);
            setRecords(recordsClient.current);
            retentionClient.current = new RetentionApi(http.current);
            setRetention(retentionClient.current);
            searchClient.current = new SearchApi(http.current);
            setSearch(searchClient.current);
            publicationClient.current = new PublicationApi(http.current);
            setPublication(publicationClient.current);
            auditClient.current = new AuditApi(http.current);
            setAudit(auditClient.current);
            classificationClient.current = new ClassificationApi(http.current);
            setClassification(classificationClient.current);
            physicalArchivesClient.current = new PhysicalArchivesApi(http.current);
            setPhysicalArchives(physicalArchivesClient.current);
            heritageClient.current = new HeritageApi(http.current);
            setHeritage(heritageClient.current);
            digitizationClient.current = new DigitizationApi(http.current);
            setDigitization(digitizationClient.current);
            rightsClient.current = new RightsApi(http.current);
            setRights(rightsClient.current);
            metadataClient.current = new MetadataApi(http.current);
            setMetadata(metadataClient.current);
            archivalIntakeClient.current = new ArchivalIntakeApi(http.current);
            setArchivalIntake(archivalIntakeClient.current);
            workflowClient.current = new WorkflowApi(http.current);
            setWorkflow(workflowClient.current);
            consultationClient.current = new ConsultationApi(http.current);
            setConsultation(consultationClient.current);
            portalAdminClient.current = new PortalAdminApi(http.current);
            setPortalAdmin(portalAdminClient.current);
            readingRoomClient.current = new ReadingRoomApi(http.current);
            setReadingRoom(readingRoomClient.current);
            preservationPlanningClient.current = new PreservationPlanningApi(http.current);
            setPreservationPlanning(preservationPlanningClient.current);
            disseminationClient.current = new DisseminationApi(http.current);
            setDissemination(disseminationClient.current);
            vocabularyClient.current = new VocabularyApi(http.current);
            setVocabulary(vocabularyClient.current);
            notificationsClient.current = new NotificationsApi(http.current);
            setNotifications(notificationsClient.current);
            const active = await d.initialize();
            if (active)
                await refresh();
        })();
        try {
            await initializing.current;
        }
        catch (e) {
            initializing.current = null;
            throw e;
        }
    };
    useEffect(() => {
        if (config.demo || configIssue())
            return;
        let alive = true;
        setBusy(true);
        initialize().catch(e => {
            if (alive)
                setError(new Error('Connexion SSO non aboutie. Vérifiez la configuration et recommencez.'));
        }).finally(() => {
            if (alive)
                setBusy(false);
        });
        return () => { alive = false; };
    }, []);
    useEffect(() => {
        if (!me || config.demo)
            return;
        const t = setInterval(() => void refresh(), 60000);
        const focus = () => {
            if (document.visibilityState === 'visible')
                void refresh();
        };
        window.addEventListener('focus', focus);
        document.addEventListener('visibilitychange', focus);
        return () => { clearInterval(t); window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', focus); };
    }, [!!me, refresh]);
    const switchPersona = async (persona: 'a' | 'b' | 'agent') => {
        if (!config.demo)
            return;
        generation.current++;
        setIdentity(null);
        if (!mock.current) {
            const { DemoTransport } = await import('../demo/transport');
            mock.current = new DemoTransport();
        }
        mock.current.persona = persona;
        client.current = new IamApi(mock.current);
        setApi(client.current);
        await refresh();
        navigate('/app');
    };
    const signIn = async (email?: string, password?: string) => {
        setBusy(true);
        setError(null);
        try {
            if (config.demo) {
                await switchPersona('a');
                return;
            }
            await initialize();
            await driver.current!.signIn(email, password);
            if (config.authMode === 'supabase') {
                await refresh();
                if (current.current)
                    navigate('/app');
            }
        }
        catch (e) {
            setError(e);
            throw e;
        }
        finally {
            setBusy(false);
        }
    };
    const logout = async () => {
        generation.current++;
        http.current?.abortAll();
        setIdentity(null);
        setError(null);
        navigate('/connexion');
        try {
            await driver.current?.signOut();
        }
        catch (e) {
            setError(e);
        }
    };
    return <Context.Provider value={{ me, api, records, retention, search, publication, audit, classification, physicalArchives, heritage, digitization, rights, metadata, archivalIntake, workflow, consultation, portalAdmin, readingRoom, preservationPlanning, dissemination, vocabulary, notifications, busy, error, demo: config.demo, epoch, signIn, logout, refresh, switchPersona, resetDemo: async () => { mock.current = null; await switchPersona('a'); } }}>{children}</Context.Provider>;
}
