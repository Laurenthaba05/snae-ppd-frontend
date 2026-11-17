import { canonicalStaffPath, isReaderManagementModule, isReaderManagementPath, staffHref } from './core/staffRoutes';
import { ModuleFinder } from './ui/ModuleFinder';
import { StaffNavigation } from './ui/StaffNavigation';
import React, { useEffect, useRef, useState } from 'react';
import { SessionProvider, useSession } from './auth/session';
import { config } from './auth/config';
import { WorkspaceProvider, useWorkspace } from './ui/workspace';
import { usePath, navigate } from './ui/navigation';
import { Icon } from './ui/icons';
import { Notice, Busy } from './ui/components';
import { ReferencePicker } from './ui/ReferencePicker';
import { useScopeText } from './ui/names';
import { LanguageSwitch, LocaleProvider, useLocale } from './ui/i18n';
import { can, canAnywhere, platform, subjectTarget } from './core/policy';
import { UUID_RE } from './core/validation';
import { Login } from './pages/Login';
import { moduleVisible, navigationSections, navIcons } from './design/navigation';
import { ArchiveModulePage, archiveModules } from './pages/ArchiveModules';
import { NotificationBell, NotificationsPage } from './ui/Notifications';
import { StaffAssistant } from './ui/StaffAssistant';
import { isPortalPath } from './portal/path';
import type { Catalog, RecordCatalog } from './core/types';

/** Chaque écran est un morceau chargé à la première visite : le premier affichage ne porte que la coque, la connexion et ce qu'elle utilise. */
const screen = <K extends string>(load: () => Promise<Record<K, React.ComponentType<any>>>, name: K) => React.lazy(() => load().then(module => ({ default: module[name] })));
const Dashboard = screen(() => import('./pages/Dashboard'), 'Dashboard');
const TreatmentDashboard = screen(() => import('./pages/TreatmentDashboard'), 'TreatmentDashboard');
const ScannersPage = screen(() => import('./pages/Scanners'), 'ScannersPage');
const OcrListPage = screen(() => import('./pages/OcrIndexing'), 'OcrListPage');
const CatalogPage = screen(() => import('./pages/Catalog'), 'CatalogPage');
const DetailPage = screen(() => import('./pages/Detail'), 'DetailPage');
const PermissionsPage = screen(() => import('./pages/Permissions'), 'PermissionsPage');
const GroupsPage = screen(() => import('./pages/Groups'), 'GroupsPage');
const GovernancePage = screen(() => import('./pages/Governance'), 'GovernancePage');
const ProfilePage = screen(() => import('./pages/Profile'), 'ProfilePage');
const HelpPage = screen(() => import('./pages/Help'), 'HelpPage');
const DesignPreview = screen(() => import('./pages/DesignPreview'), 'DesignPreview');
const AcquisitionPage = screen(() => import('./pages/Acquisition'), 'AcquisitionPage');
const JourneysPage = screen(() => import('./pages/Journeys'), 'JourneysPage');
const RecordCatalogPage = screen(() => import('./pages/Records'), 'RecordCatalogPage');
const RecordDetailPage = screen(() => import('./pages/Records'), 'RecordDetailPage');
const PreservationEventListPage = screen(() => import('./pages/Records'), 'PreservationEventListPage');
const SearchPage = screen(() => import('./pages/Search'), 'SearchPage');
const AuditPage = screen(() => import('./pages/Audit'), 'AuditPage');
const ClassificationPage = screen(() => import('./pages/Classification'), 'ClassificationPage');
const ArchivalDescriptionPage = screen(() => import('./pages/ArchivalDescription'), 'ArchivalDescriptionPage');
const PhysicalArchivesPage = screen(() => import('./pages/PhysicalArchives'), 'PhysicalArchivesPage');
const RestorationListPage = screen(() => import('./pages/PhysicalArchives'), 'RestorationListPage');
const HeritagePage = screen(() => import('./pages/Heritage'), 'HeritagePage');
const DigitizationPage = screen(() => import('./pages/Digitization'), 'DigitizationPage');
const QualityControlListPage = screen(() => import('./pages/Digitization'), 'QualityControlListPage');
const RightsPage = screen(() => import('./pages/Rights'), 'RightsPage');
const PortalAdminPage = screen(() => import('./pages/PortalAdmin'), 'PortalAdminPage');
const ReadingRoomPage = screen(() => import('./pages/ReadingRoom'), 'ReadingRoomPage');
const VocabularyPage = screen(() => import('./ui/Vocabularies'), 'VocabularyPage');
const MetadataPage = screen(() => import('./pages/Metadata'), 'MetadataPage');
const CodificationPage = screen(() => import('./ui/Codification'), 'CodificationPage');
const GecPage = screen(() => import('./ui/Gec'), 'GecPage');
const ScopeDashboardPage = screen(() => import('./pages/ScopeDashboard'), 'ScopeDashboardPage');
const NationalDashboardPage = screen(() => import('./pages/NationalDashboard'), 'NationalDashboardPage');
const ArchivalIntakePage = screen(() => import('./pages/ArchivalIntake'), 'ArchivalIntakePage');
const TaskInboxPage = screen(() => import('./pages/TaskInbox'), 'TaskInboxPage');
const WorkflowPage = screen(() => import('./pages/Workflow'), 'WorkflowPage');
const RetentionNationalPage = screen(() => import('./pages/RetentionNational'), 'RetentionNationalPage');
const ConsultationsPage = screen(() => import('./pages/Consultations'), 'ConsultationsPage');
const CommunicationsPage = screen(() => import('./pages/Consultations'), 'CommunicationsPage');
const PortalApp = screen(() => import('./portal/PortalApp'), 'PortalApp');
const ReaderManagement = screen(() => import('./portal/ReaderManagement'), 'ReaderManagement');

const catalogKeys = ['institutions', 'departments', 'users', 'roles'];
const recordKeys = ['documents', 'dossiers'];
const connectedModules = new Set(['taches', 'acquisition', 'documents', 'dossiers', 'recherche', 'audit', 'classement', 'patrimoine', 'numerisation', 'ocr', 'metadonnees', 'versements', 'sort-final', 'gel-legal', 'eliminations', 'consultations', 'communications', 'controle', 'conservation', 'restauration', 'circuits-validation', 'archives-physiques', 'droits', 'fonds', 'portail', 'salle-lecture', 'vocabulaires', 'codification', 'gec', 'tableau-de-bord', 'tableau-national']);

/**
 * Le menu latéral est un volet qui se range : au-delà de 1000 px (`WIDE_SCREEN`) il se découvre quand la souris touche le bord gauche de la fenêtre et se range quand elle le quitte ;
 * en deçà, ou sans souris (`HOVER_POINTER` faux : écran tactile), c'est un tiroir ouvert par le bouton du menu, avec son voile (voir `dashboard.css`).
 */
const WIDE_SCREEN = '(min-width: 1001px)';
const HOVER_POINTER = '(hover: hover) and (pointer: fine)';
const matches = (query: string) => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
/** Le temps pendant lequel la souris doit rester au bord pour ouvrir le menu (pas d'ouverture au passage), et celui qu'elle peut passer hors du menu avant qu'il se range. */
const EDGE_DWELL_MS = 140;
const LEAVE_DELAY_MS = 350;
const EDGE_AWAY_PX = 48;

function Shell() {
    const { me, demo, epoch, logout, switchPersona, resetDemo } = useSession();
    const { scope, setScope } = useWorkspace();
    const scopeText = useScopeText(scope);
    const { tr } = useLocale();
    const path = usePath();
    // Le menu est rangé au départ. Sur un grand écran avec une souris il se découvre au bord gauche et se range quand la souris le quitte ; dans tous les cas il se range
    // quand on navigue vers un autre écran, avec la touche Échap ou le bouton de fermeture, et le bouton du menu l'ouvre.
    const [wide, setWide] = useState(() => matches(WIDE_SCREEN));
    const [hoverable, setHoverable] = useState(() => matches(HOVER_POINTER));
    const [menu, setMenu] = useState(false);
    const autoHide = wide && hoverable;
    const edgeTimer = useRef<number | undefined>(undefined);
    const leaveTimer = useRef<number | undefined>(undefined);
    const [scopeOpen, setScopeOpen] = useState(false);
    const [pop,setPop] = useState<'apps'|'user'|'notifications'|null>(null);
    const [term,setTerm] = useState('');
    const popArea = useRef<HTMLDivElement>(null);
    const menuButton = useRef<HTMLButtonElement>(null);
    const menuPanel = useRef<HTMLElement>(null);
    const url = new URL(path, location.origin);
    const parts = url.pathname.split('/').filter(Boolean);
    const section = parts[1] ?? '';
    const id = parts[2];
    const central = platform(me);
    const nav = [
        { path:'espace-lecteurs', label:'Consultation & diffusion', group:'Accès', ok:true, demo:false },
        { path: 'institutions', label: 'Institutions', group: 'admin', ok: canAnywhere(me, 'IAM_INSTITUTION_READ'), demo: false },
        { path: 'departments', label: 'Départements', group: 'admin', ok: canAnywhere(me, 'IAM_DEPARTMENT_READ'), demo: false },
        { path: 'users', label: 'Utilisateurs', group: 'admin', ok: canAnywhere(me, 'IAM_USER_READ'), demo: false },
        { path: 'groups', label: 'Groupes', group: 'admin', ok: canAnywhere(me, 'IAM_USER_READ'), demo: false },
        { path: 'roles', label: 'Rôles et habilitations', group: 'admin', ok: can(me, 'IAM_ROLE_READ', subjectTarget(me!)), demo: false },
        { path: 'permissions', label: 'Permissions', group: 'admin', ok: can(me, 'IAM_ROLE_READ', subjectTarget(me!)), demo: false },
        { path: 'governance', label: 'Gouvernance', group: 'admin', ok: central, demo: false },
        ...archiveModules.map(module => ({ path: module.id, label: module.title, group: module.group, ok: moduleVisible(me, module.id, scope, demo), demo: !connectedModules.has(module.id) })),
        { path: 'acquisition', label: 'Acquisition & imports', group: 'Collecte', ok: moduleVisible(me, 'acquisition', scope, demo), demo: false },
        { path: 'fonds', label: 'Fonds et producteurs', group: 'Archives', ok: moduleVisible(me, 'fonds', scope, demo), demo: false },
        { path: 'droits', label: 'Motifs et sources juridiques', group: 'Accès', ok: demo || can(me, 'RIGHTS_READ', {}), demo: false },
        { path: 'taches', label: 'Boîte des tâches', group: 'Traitements', ok: !demo && moduleVisible(me, 'taches', scope), demo: false },
        { path: 'circuits-validation', label: 'Circuits de validation', group: 'Traitements', ok: demo || can(me, 'WORKFLOW_DEFINITION_MANAGE', scope), demo: false },
        { path: 'scanners', label: 'Scanners', group: 'Traitements', ok: moduleVisible(me, 'scanners', scope, demo), demo: false },
        { path: 'traitement', label: 'Suivi du traitement', group: 'Traitements', ok: demo || canAnywhere(me, 'DIGITIZATION_READ'), demo: false },
        { path: 'archives-physiques', label: 'Archives physiques', group: 'Conservation', ok: demo || canAnywhere(me, 'PHYSICALARCHIVES_READ'), demo: false },
        { path: 'notifications', label: 'Mes notifications', group: 'support', ok: !demo, demo: false },
        { path: 'profile', label: 'Mon profil', group: 'support', ok: true, demo: false },
        { path: 'help', label: 'Guide & assistance', group: 'support', ok: true, demo: false },
        { path: 'parcours', label: 'Parcours utilisateurs', group: 'support', ok: true, demo: false }
    ];
    const title = tr(!section ? 'Tableau de bord' : nav.find(item => item.path === section)?.label ?? 'Guide');
    const go = (route: string) => navigate(staffHref(route));
    const fullName = [me!.user.prenom, me!.user.nom].filter(Boolean).join(' ') || tr('Utilisateur');
    const quickItems = navigationSections(nav.filter(item => !isReaderManagementModule(item.path))).filter(group => group.id !== 'identity' && group.id !== 'support').flatMap(group => group.items);
    const submitSearch = (event: React.FormEvent) => {
        event.preventDefault();
        const value = term.trim().slice(0, 200);
        if (value) { go('recherche?q=' + encodeURIComponent(value)); setTerm(''); }
    };

    useEffect(() => {
        setPop(null);
        document.title = 'SNAE-PPD · ' + title;
        document.getElementById('main-content')?.focus({ preventScroll: true });
    }, [path, title]);
    // Le menu se range quand on navigue vers un autre écran (jamais au premier affichage, ni quand seule la requête de l'adresse change : filtre, onglet, page).
    const lastScreen = useRef(url.pathname);
    useEffect(() => {
        if (lastScreen.current === url.pathname) return;
        lastScreen.current = url.pathname;
        setMenu(false);
    }, [url.pathname]);
    useEffect(() => {
        if (!pop) return;
        const close = (event: MouseEvent) => { if (!popArea.current?.contains(event.target as Node)) setPop(null); };
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setPop(null); };
        document.addEventListener('mousedown', close);
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', onKey); };
    }, [pop]);
    useEffect(() => {
        if (typeof window.matchMedia !== 'function') return;
        const size = window.matchMedia(WIDE_SCREEN);
        const pointer = window.matchMedia(HOVER_POINTER);
        // en changeant de largeur ou de pointeur, le menu reprend son état de départ : rangé
        const onSize = () => { setWide(size.matches); setMenu(false); };
        const onPointer = () => { setHoverable(pointer.matches); setMenu(false); };
        size.addEventListener('change', onSize);
        pointer.addEventListener('change', onPointer);
        return () => { size.removeEventListener('change', onSize); pointer.removeEventListener('change', onPointer); };
    }, []);
    // les minuteries du bord et de la sortie ne survivent ni au démontage ni à la fermeture du menu
    useEffect(() => () => { window.clearTimeout(edgeTimer.current); window.clearTimeout(leaveTimer.current); }, []);
    useEffect(() => { if (!menu) window.clearTimeout(leaveTimer.current); }, [menu]);
    useEffect(() => {
        // grand écran : pas de piège du clavier ni de prise de focus (le menu est un volet), mais Échap le range
        if (!menu || !wide) return;
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMenu(false); menuButton.current?.focus(); } };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [menu, wide]);
    // Après une fermeture, le bord ne rouvre pas le menu tant que la souris n'en a pas été éloignée (sinon Échap ou un clic au bord le rouvrirait aussitôt)
    const edgeArmed = useRef(false);
    useEffect(() => {
        if (menu || !autoHide) return;
        edgeArmed.current = false;
        const away = (event: MouseEvent) => { if (event.clientX > EDGE_AWAY_PX) edgeArmed.current = true; };
        document.addEventListener('mousemove', away);
        return () => document.removeEventListener('mousemove', away);
    }, [menu, autoHide]);
    const touchEdge = () => {
        window.clearTimeout(edgeTimer.current);
        if (edgeArmed.current) edgeTimer.current = window.setTimeout(() => setMenu(true), EDGE_DWELL_MS);
    };
    const leaveEdge = () => window.clearTimeout(edgeTimer.current);
    const enterMenu = () => window.clearTimeout(leaveTimer.current);
    // la souris quitte le menu : il se range, sauf si le clavier y a le focus
    const leaveMenu = () => {
        if (!autoHide) return;
        window.clearTimeout(leaveTimer.current);
        leaveTimer.current = window.setTimeout(() => { if (!menuPanel.current?.querySelector(':focus-visible')) setMenu(false); }, LEAVE_DELAY_MS);
    };
    useEffect(() => {
        // le piège du clavier et la prise de focus ne valent que pour le tiroir
        if (!menu || wide) return;
        menuPanel.current?.querySelector<HTMLButtonElement>('button')?.focus();
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { setMenu(false); menuButton.current?.focus(); }
            if (event.key === 'Tab') {
                const items = Array.from(menuPanel.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled])') ?? []).filter(item => item.tabIndex >= 0 && !item.closest('[hidden]'));
                if (!items?.length) return;
                const first = items[0];
                const last = items[items.length - 1];
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
            }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [menu, wide]);

    const render = () => {
        // le Directeur national n'a pas d'institution de rattachement : son accueil est la vue d'ensemble nationale (dès qu'il choisit une institution, il retrouve l'accueil ordinaire)
        if (!section) return !demo && !scope.institutionId && can(me, 'DASHBOARD_NATIONAL_READ', {}) ? <NationalDashboardPage /> : <Dashboard />;
        if (section === 'acquisition') return <AcquisitionPage />;
        if (section === 'parcours') return <JourneysPage />;
        if (section === 'scanners') return moduleVisible(me, section, scope, demo) ? <ScannersPage /> : <Notice tone="warning">Cette section exige une habilitation de dépôt de fichiers ou de lecture du parc de scanners.</Notice>;
        if (section === 'traitement') return canAnywhere(me, 'DIGITIZATION_READ') || demo ? <TreatmentDashboard /> : <Notice tone="warning">Cette section exige une habilitation de lecture de la numérisation dans au moins une institution.</Notice>;
        if (!demo && !moduleVisible(me, section, scope)) return <Notice tone="warning">{tr('Cet espace n’est pas disponible dans vos habilitations pour le périmètre choisi. Consultez votre profil ou changez de périmètre.')}</Notice>;
        if (demo && (archiveModules.some(m=>m.id===section)||['fonds','circuits-validation','droits','archives-physiques'].includes(section))) return <DesignPreview section={section} id={id}/>;
        if (section === 'fonds') return <ArchivalDescriptionPage />;
        if (catalogKeys.includes(section)) return id
            ? (UUID_RE.test(id) ? <DetailPage kind={section as Catalog} id={id} /> : <Notice tone="warning">Identifiant de ressource invalide.</Notice>)
            : <CatalogPage kind={section as Catalog} />;
        if (section === 'permissions') return <PermissionsPage />;
        if (section === 'groups') return <GroupsPage />;
        if (section === 'governance') {
            const role = url.searchParams.get('role') ?? '';
            return role && !UUID_RE.test(role) ? <Notice tone="warning">Identifiant de rôle invalide.</Notice> : <GovernancePage roleId={role} />;
        }
        if (section === 'profile') {
            const user = url.searchParams.get('user');
            return user && !UUID_RE.test(user) ? <Notice tone="warning">Identifiant utilisateur invalide.</Notice> : <ProfilePage userId={user ?? undefined} />;
        }
        if (section === 'help') return <HelpPage />;
        if (!demo && section === 'conservation') return <PreservationEventListPage />;
        if (!demo && recordKeys.includes(section)) return id
            ? (UUID_RE.test(id) ? <RecordDetailPage kind={section as RecordCatalog} id={id} /> : <Notice tone="warning">Identifiant de ressource invalide.</Notice>)
            : <RecordCatalogPage kind={section as RecordCatalog} />;
        if (!demo && section === 'recherche') return <SearchPage />;
        if (!demo && section === 'audit') return can(me, 'AUDIT_READ', {}) ? <AuditPage /> : <Notice tone="warning">Cette section exige une habilitation nationale de lecture du journal d’audit.</Notice>;
        if (!demo && section === 'classement') return can(me, 'CLASSIFICATION_READ', scope) ? <ClassificationPage /> : <Notice tone="warning">Cette section exige une habilitation de lecture du plan de classement pour ce périmètre.</Notice>;
        if (!demo && section === 'archives-physiques') return canAnywhere(me, 'PHYSICALARCHIVES_READ') ? <PhysicalArchivesPage initialArchiveId={url.searchParams.get('archive') ?? undefined} /> : <Notice tone="warning">Cette section exige une habilitation de lecture des archives physiques.</Notice>;
        if (!demo && section === 'restauration') return canAnywhere(me, 'RESTORATION_READ') ? <RestorationListPage /> : <Notice tone="warning">Cette section exige une habilitation de lecture des interventions de restauration.</Notice>;
        if (!demo && section === 'patrimoine') return can(me, 'HERITAGE_READ', {}) ? <HeritagePage initialAssetId={url.searchParams.get('bien') ?? undefined} /> : <Notice tone="warning">Cette section exige une habilitation nationale de lecture du patrimoine.</Notice>;
        if (!demo && section === 'ocr') return canAnywhere(me, 'DIGITIZATION_READ') ? <OcrListPage /> : <Notice tone="warning">Cette section exige une habilitation de lecture de la numérisation dans au moins une institution.</Notice>;
        if (!demo && section === 'numerisation') return canAnywhere(me, 'DIGITIZATION_READ') ? <DigitizationPage initialProjectId={url.searchParams.get('project') ?? undefined} initialElementId={url.searchParams.get('element') ?? undefined} /> : <Notice tone="warning">Cette section exige une habilitation de lecture de la numérisation dans au moins une institution.</Notice>;
        if (!demo && section === 'controle') return canAnywhere(me, 'DIGITIZATION_READ') ? <QualityControlListPage /> : <Notice tone="warning">Cette section exige une habilitation de lecture de la numérisation dans au moins une institution.</Notice>;
        if (!demo && section === 'droits') return can(me, 'RIGHTS_READ', {}) ? <RightsPage /> : <Notice tone="warning">Cette section exige une habilitation nationale de lecture des droits.</Notice>;
        if (!demo && section === 'portail') return ['PORTAL_READ', 'PORTAL_PLAN_MANAGE', 'PORTAL_READER_MANAGE', 'PORTAL_CASHIER', 'PORTAL_SUPERVISE'].some(code => can(me, code, {})) ? <PortalAdminPage /> : <Notice tone="warning">Cette section exige une habilitation nationale du portail des lecteurs.</Notice>;
        if (!demo && section === 'salle-lecture') return ['READING_ROOM_READ', 'READING_ROOM_DESK', 'READING_ROOM_MANAGE'].some(code => can(me, code, scope)) ? <ReadingRoomPage /> : <Notice tone="warning">Cette section exige une habilitation de la salle de lecture pour ce périmètre.</Notice>;
        if (!demo && section === 'notifications') return <NotificationsPage />;
        if (!demo && section === 'vocabulaires') return can(me, 'VOCABULARY_MANAGE', scope) ? <VocabularyPage /> : <Notice tone="warning">Cette section exige une habilitation de gestion des vocabulaires contrôlés pour ce périmètre.</Notice>;
        if (!demo && section === 'tableau-national') return can(me, 'DASHBOARD_NATIONAL_READ', {}) ? <NationalDashboardPage /> : <Notice tone="warning">Cette section exige l’habilitation nationale de lecture du tableau de bord national.</Notice>;
        if (!demo && section === 'tableau-de-bord') return <ScopeDashboardPage />;
        if (!demo && section === 'gec') return can(me, 'GEC_READ', scope) || can(me, 'GEC_MANAGE', scope) ? <GecPage /> : <Notice tone="warning">Cette section exige une habilitation de lecture des courriers de la GEC pour ce périmètre.</Notice>;
        if (!demo && section === 'codification') return can(me, 'CODIFICATION_MANAGE', scope) ? <CodificationPage /> : <Notice tone="warning">Cette section exige une habilitation de gestion de la codification des références pour ce périmètre.</Notice>;
        if (!demo && section === 'metadonnees') return can(me, 'METADATA_SCHEMA_MANAGE', scope) ? <MetadataPage /> : <Notice tone="warning">Cette section exige une habilitation d’administration des schémas de métadonnées.</Notice>;
        if (!demo && section === 'versements') return can(me, 'ARCHIVAL_INTAKE_READ', {}) ? <ArchivalIntakePage /> : <Notice tone="warning">Cette section exige une habilitation nationale de lecture des entrées archivistiques.</Notice>;
        if (!demo && section === 'taches') return <TaskInboxPage />;
        if (!demo && section === 'circuits-validation') return can(me, 'WORKFLOW_DEFINITION_MANAGE', scope) ? <WorkflowPage /> : <Notice tone="warning">Cette section exige une habilitation d’administration des circuits de validation.</Notice>;
        if (!demo && (section === 'sort-final' || section === 'gel-legal' || section === 'eliminations')) return <RetentionNationalPage />;
        if (!demo && section === 'consultations') return <ConsultationsPage />;
        if (!demo && section === 'communications') return can(me, 'COMMUNICATION_READ', scope) ? <CommunicationsPage /> : <Notice tone="warning">Cette section exige une habilitation de lecture du registre des communications pour ce périmètre.</Notice>;
        if (archiveModules.some(module => module.id === section)) return <ArchiveModulePage section={section} id={id} />;
        return <Notice>Écran non disponible dans ce lot. <button className="text-link" onClick={() => go('')}>Retour à l’accueil</button></Notice>;
    };
    return <div className={'app-shell institutional-shell nx-shell' + (menu ? ' nav-open' : '')}>
        <a className="skip-link" href="#main-content">{tr('Aller au contenu')}</a>
        {autoHide && !menu && <div className="nx-edge" aria-hidden="true" onMouseEnter={touchEdge} onMouseLeave={leaveEdge} />}
        {menu && !autoHide && <button className="nav-scrim" aria-label={tr('Fermer le menu')} onClick={() => { setMenu(false); menuButton.current?.focus(); }} />}
        <aside id="main-navigation" aria-label={tr('Menu de navigation')} ref={menuPanel} className={'nx-sidebar ' + (menu ? 'open' : '')} inert={!menu} onMouseEnter={enterMenu} onMouseLeave={leaveMenu}>
            <div className="nx-brand">
                <img src="/dashboard/emblem-sidebar.png" alt={tr('Armoiries de la République de Guinée')} width="52" height="56" />
                <div><strong>SNAE - PPD</strong><span>{tr('Système National d’Archivage Électronique et du Patrimoine Documentaire')}</span></div>
                <button className="icon-btn close-navigation" onClick={() => { setMenu(false); menuButton.current?.focus(); }} aria-label={tr('Fermer la navigation')}><Icon name="close" /></button>
            </div>
            <StaffNavigation key={me!.user.id} items={nav.filter(item => !isReaderManagementModule(item.path))} section={section} demo={demo} onGo={go} />
            <div className="nx-version">SNAE-PPD · {demo ? tr('Démonstration') : config.label}</div>
        </aside>
        <div className="nx-workspace">
            <header className="nx-topbar">
                <button ref={menuButton} className="icon-btn mobile-menu" aria-label={tr('Ouvrir le menu')} aria-expanded={menu} aria-controls="main-navigation" onClick={() => setMenu(open => !open)}><Icon name="menu" /></button>
                <button className="nx-republic" onClick={() => go('')} aria-label={tr('République de Guinée — retour au tableau de bord')}><img src="/dashboard/emblem-header.png" alt="" width="48" height="46" /><span><strong>{tr('République de Guinée')}</strong><small>{tr('Travail – Justice – Solidarité')}</small></span></button>
                <form className="nx-search" role="search" onSubmit={submitSearch}><Icon name="search" size={19} /><input type="search" aria-label={tr('Rechercher un document, un dossier, une référence')} placeholder={tr('Rechercher un document, un dossier, une référence…')} value={term} maxLength={200} onChange={event => setTerm(event.target.value)} /></form>
                <div className="nx-actions" ref={popArea}>
                    <ModuleFinder userId={me!.user.id} items={[{path:'',label:'Tableau de bord',ok:true},...nav]} onGo={go} />
                    <LanguageSwitch className="nx-language" />
                    <NotificationBell open={pop === 'notifications'} onToggle={() => setPop(pop === 'notifications' ? null : 'notifications')} onClose={() => setPop(null)} />
                    <div className="nx-pop">
                        <button className="nx-icon-btn" aria-label={tr('Accès rapides aux espaces')} aria-haspopup="true" aria-expanded={pop === 'apps'} onClick={() => setPop(pop === 'apps' ? null : 'apps')}><Icon name="grid" size={22} /></button>
                        {pop === 'apps' && <div className="nx-menu apps" role="menu" aria-label={tr('Accès rapides')}>{quickItems.map(item => <button key={item.path} role="menuitem" onClick={() => go(item.path)}><Icon name={navIcons[item.path] ?? 'document'} size={20} /><span>{tr(item.label)}</span></button>)}</div>}
                    </div>
                    <div className="nx-pop">
                        <button className="nx-user" aria-haspopup="true" aria-expanded={pop === 'user'} aria-label={tr('Menu de') + ' ' + fullName} onClick={() => setPop(pop === 'user' ? null : 'user')}>
                            <span className="nx-avatar" aria-hidden="true">{(me!.user.prenom?.[0] ?? '') + (me!.user.nom?.[0] ?? 'U')}</span>
                            <span className="nx-user-text"><strong>{fullName}</strong><small>{tr(central ? 'Administrateur' : me!.user.scope === 'DEPARTEMENT' ? 'Périmètre départemental' : 'Périmètre institutionnel')}</small></span>
                            <Icon name="chevronDown" size={16} />
                        </button>
                        {pop === 'user' && <div className="nx-menu user" role="menu"><button role="menuitem" onClick={() => go('profile')}><Icon name="user" size={18} />{tr('Mon profil')}</button><button role="menuitem" onClick={() => { setScopeOpen(true); setPop(null); }}><Icon name="building" size={18} />{tr('Changer de périmètre')}</button><button role="menuitem" onClick={() => void logout()}><Icon name="logout" size={18} />{tr('Se déconnecter')}</button></div>}
                    </div>
                </div>
            </header>
            {demo && <section className="demo-banner" aria-label="Mode démonstration"><span><b>DÉMONSTRATION</b> <span className="demo-explanation">Données fictives · Aucun appel au serveur</span></span><div><label>Profil <select aria-label="Persona de démonstration" value={me!.user.id.endsWith('001') ? 'a' : me!.user.id.endsWith('002') ? 'b' : 'agent'} onChange={e => void switchPersona(e.target.value as 'a' | 'b' | 'agent')}><option value="a">Administrateur A</option><option value="b">Administrateur B</option><option value="agent">Agent de recette</option></select></label><button onClick={() => { if (confirm('Réinitialiser toutes les données fictives de cet onglet ?')) { sessionStorage.removeItem('snae-f2-demo-records-v1'); sessionStorage.removeItem('snae-f2-demo-audit-v1'); window.dispatchEvent(new Event('snae-f3-demo-reset')); void resetDemo(); } }}>Réinitialiser</button></div></section>}
            {section && <section className="scope-strip" aria-label={tr('Périmètre de travail')}><span><Icon name="building" size={16} /><b>{tr('Périmètre de travail')}</b><span className="scope-selected">{scopeText}</span></span><button className="text-link" onClick={() => setScopeOpen(value => !value)} aria-expanded={scopeOpen} aria-controls="scope-selection">{tr(scopeOpen ? 'Fermer' : 'Changer de périmètre')}<Icon name="chevron" size={14} /></button></section>}
            {scopeOpen && <div id="scope-selection" className="scope-panel"><ReferencePicker kind="institutions" value={scope.institutionId ?? ''} onChange={value => setScope({ institutionId: value || null, departmentId: me!.user.scope === 'DEPARTEMENT' ? me!.user.departmentId : null })} label={tr('Choisir une institution')} scope={can(me, 'IAM_INSTITUTION_READ', {}) ? {} : { institutionId: me!.user.institutionId }} nullable={can(me, 'IAM_INSTITUTION_READ', {})} />{scope.institutionId && <ReferencePicker kind="departments" value={scope.departmentId ?? ''} onChange={value => setScope({ ...scope, departmentId: value || null })} label={tr('Choisir un département')} scope={{ institutionId: scope.institutionId, departmentId: me!.user.scope === 'DEPARTEMENT' ? me!.user.departmentId : undefined }} nullable={me!.user.scope !== 'DEPARTEMENT'} />}</div>}
            <main id="main-content" tabIndex={-1} className="main-content" key={epoch + ':' + path}><React.Suspense fallback={<Busy />}>{render()}</React.Suspense></main>
            <footer className="workspace-footer"><span>{tr('SNAE-PPD · Archives et patrimoine documentaire')}</span><span>{tr('Proposition institutionnelle · F3 · Recette')}</span></footer>
        </div>
        <StaffAssistant />
    </div>;
}
function Gate() {
    const { me, busy } = useSession();
    const path = usePath();
    useEffect(() => {
        if (!me) return;
        const canonical = canonicalStaffPath(path);
        if (canonical !== path) navigate(canonical, {replace:true});
        else if (!path.startsWith('/app') && !isReaderManagementPath(path)) navigate('/app', {replace:true});
    }, [me, path]);
    if (!me) return <Login />;
    if (busy) return <Busy />;
    return isReaderManagementPath(canonicalStaffPath(path)) ? <React.Suspense fallback={<Busy />}><ReaderManagement /></React.Suspense> : <Shell />;
}
function SessionRoutes() {
    const { me } = useSession();
    const path = usePath();
    const content = isPortalPath(path) && !isReaderManagementPath(path) ? <React.Suspense fallback={<Busy />}><PortalApp /></React.Suspense> : <Gate />;
    // Le périmètre reste en mémoire quand un agent consulte le catalogue public puis revient.
    return me ? <WorkspaceProvider key={me.user.id}>{content}</WorkspaceProvider> : content;
}
class Boundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    render() {
        return this.state.failed ? <main className="fatal"><h1>L’interface n’a pas pu afficher cet écran.</h1><p>Aucune réussite métier ne doit être déduite de cet incident. Relisez les données après rechargement.</p><button className="btn primary" onClick={() => location.assign('/connexion')}>Revenir à la connexion</button></main> : this.props.children;
    }
}
/** Le catalogue public n'initialise pas le SSO. Une session agent existante reste en mémoire pendant la navigation. */
function Root() {
    const path = usePath();
    return <SessionProvider enabled={!isPortalPath(path) || isReaderManagementPath(path)}><SessionRoutes /></SessionProvider>;
}
export function App() { return <Boundary><LocaleProvider><Root /></LocaleProvider></Boundary>; }
