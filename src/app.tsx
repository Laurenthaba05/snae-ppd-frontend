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
import { can, platform, subjectTarget } from './core/policy';
import { UUID_RE } from './core/validation';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { TreatmentDashboard } from './pages/TreatmentDashboard';
import { ScannersPage } from './pages/Scanners';
import { OcrListPage } from './pages/OcrIndexing';
import { CatalogPage } from './pages/Catalog';
import { DetailPage } from './pages/Detail';
import { PermissionsPage } from './pages/Permissions';
import { GovernancePage } from './pages/Governance';
import { ProfilePage } from './pages/Profile';
import { HelpPage } from './pages/Help';
import { DesignPreview } from './pages/DesignPreview';
import { AcquisitionPage } from './pages/Acquisition';
import { JourneysPage } from './pages/Journeys';
import { moduleVisible, navGroups, navIcons } from './design/navigation';
import { ArchiveModulePage, archiveModules } from './pages/ArchiveModules';
import { RecordCatalogPage, RecordDetailPage, PreservationEventListPage } from './pages/Records';
import { SearchPage } from './pages/Search';
import { AuditPage } from './pages/Audit';
import { ClassificationPage } from './pages/Classification';
import { ArchivalDescriptionPage } from './pages/ArchivalDescription';
import { PhysicalArchivesPage, RestorationListPage } from './pages/PhysicalArchives';
import { HeritagePage } from './pages/Heritage';
import { DigitizationPage, QualityControlListPage } from './pages/Digitization';
import { RightsPage } from './pages/Rights';
import { PortalAdminPage } from './pages/PortalAdmin';
import { ReadingRoomPage } from './pages/ReadingRoom';
import { VocabularyPage } from './ui/Vocabularies';
import { NotificationBell, NotificationsPage } from './ui/Notifications';
import { MetadataPage } from './pages/Metadata';
import { ArchivalIntakePage } from './pages/ArchivalIntake';
import { TaskInboxPage } from './pages/TaskInbox';
import { WorkflowPage } from './pages/Workflow';
import { RetentionNationalPage } from './pages/RetentionNational';
import { ConsultationsPage, CommunicationsPage } from './pages/Consultations';
import { PortalApp, isPortalPath } from './portal/PortalApp';
import type { Catalog, RecordCatalog } from './core/types';

const catalogKeys = ['institutions', 'departments', 'users', 'roles'];
const recordKeys = ['documents', 'dossiers'];
const connectedModules = new Set(['taches', 'acquisition', 'documents', 'dossiers', 'recherche', 'audit', 'classement', 'patrimoine', 'numerisation', 'ocr', 'metadonnees', 'versements', 'sort-final', 'gel-legal', 'eliminations', 'consultations', 'communications', 'controle', 'conservation', 'restauration', 'circuits-validation', 'archives-physiques', 'droits', 'fonds', 'portail', 'salle-lecture', 'vocabulaires']);

function Shell() {
    const { me, demo, epoch, logout, switchPersona, resetDemo } = useSession();
    const { scope, setScope } = useWorkspace();
    const scopeText = useScopeText(scope);
    const { tr } = useLocale();
    const path = usePath();
    const [menu, setMenu] = useState(false);
    const [scopeOpen, setScopeOpen] = useState(false);
    const [collapsed,setCollapsed] = useState<string[]>([]);
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
        { path: 'institutions', label: 'Institutions', group: 'admin', ok: me!.grants.some(g => g.permission === 'IAM_INSTITUTION_READ'), demo: false },
        { path: 'departments', label: 'Départements', group: 'admin', ok: me!.grants.some(g => g.permission === 'IAM_DEPARTMENT_READ'), demo: false },
        { path: 'users', label: 'Utilisateurs', group: 'admin', ok: me!.grants.some(g => g.permission === 'IAM_USER_READ'), demo: false },
        { path: 'roles', label: 'Rôles et habilitations', group: 'admin', ok: can(me, 'IAM_ROLE_READ', subjectTarget(me!)), demo: false },
        { path: 'permissions', label: 'Permissions', group: 'admin', ok: can(me, 'IAM_ROLE_READ', subjectTarget(me!)), demo: false },
        { path: 'governance', label: 'Gouvernance', group: 'admin', ok: central, demo: false },
        ...archiveModules.map(module => ({ path: module.id, label: module.title, group: module.group, ok: moduleVisible(me, module.id, scope, demo), demo: !connectedModules.has(module.id) })),
        { path: 'acquisition', label: 'Acquisition & imports', group: 'Collecte', ok: moduleVisible(me, 'acquisition', scope, demo), demo: false },
        { path: 'fonds', label: 'Fonds et producteurs', group: 'Archives', ok: moduleVisible(me, 'fonds', scope, demo), demo: false },
        { path: 'droits', label: 'Motifs et sources juridiques', group: 'Accès', ok: demo || can(me, 'RIGHTS_READ', {}), demo: false },
        { path: 'taches', label: 'Boîte des tâches', group: 'Traitements', ok: !demo && moduleVisible(me, 'taches', scope), demo: false },
        { path: 'circuits-validation', label: 'Circuits de validation', group: 'Traitements', ok: demo || can(me, 'WORKFLOW_DEFINITION_MANAGE', scope), demo: false },
        { path: 'scanners', label: 'Scanners', group: 'Traitements', ok: demo || can(me, 'DIGITIZATION_READ', {}), demo: false },
        { path: 'traitement', label: 'Suivi du traitement', group: 'Traitements', ok: demo || can(me, 'DIGITIZATION_READ', {}), demo: false },
        { path: 'archives-physiques', label: 'Archives physiques', group: 'Conservation', ok: demo || can(me, 'PHYSICALARCHIVES_READ', {}), demo: false },
        { path: 'notifications', label: 'Mes notifications', group: 'support', ok: !demo, demo: false },
        { path: 'profile', label: 'Mon profil', group: 'support', ok: true, demo: false },
        { path: 'help', label: 'Guide & assistance', group: 'support', ok: true, demo: false },
        { path: 'parcours', label: 'Parcours utilisateurs', group: 'support', ok: true, demo: false }
    ];
    const activeGroup = navGroups.find(g => g.groups.includes(nav.find(n => n.path === section)?.group ?? ''))?.id;
    const title = tr(!section ? 'Tableau de bord' : nav.find(item => item.path === section)?.label ?? 'Guide');
    const go = (route: string) => navigate('/app' + (route ? '/' + route : ''));
    const fullName = [me!.user.prenom, me!.user.nom].filter(Boolean).join(' ') || tr('Utilisateur');
    const quickItems = navGroups.filter(g => g.id !== 'identity' && g.id !== 'support').flatMap(g => nav.filter(item => g.groups.includes(item.group) && item.ok));
    const submitSearch = (event: React.FormEvent) => {
        event.preventDefault();
        const value = term.trim().slice(0, 200);
        if (value) { go('recherche?q=' + encodeURIComponent(value)); setTerm(''); }
    };

    useEffect(() => {
        setMenu(false);
        setPop(null);
        document.title = 'SNAE-PPD · ' + title;
        document.getElementById('main-content')?.focus({ preventScroll: true });
    }, [path, title]);
    useEffect(() => {
        if (!pop) return;
        const close = (event: MouseEvent) => { if (!popArea.current?.contains(event.target as Node)) setPop(null); };
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setPop(null); };
        document.addEventListener('mousedown', close);
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', onKey); };
    }, [pop]);
    useEffect(() => {
        const query = window.matchMedia('(min-width: 721px)');
        const closeWideMenu = () => { if (query.matches) setMenu(false); };
        query.addEventListener('change', closeWideMenu);
        return () => query.removeEventListener('change', closeWideMenu);
    }, []);
    useEffect(() => {
        if (!menu) return;
        menuPanel.current?.querySelector<HTMLButtonElement>('button')?.focus();
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { setMenu(false); menuButton.current?.focus(); }
            if (event.key === 'Tab') {
                const items = menuPanel.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled]),a[href]');
                if (!items?.length) return;
                const first = items[0];
                const last = items[items.length - 1];
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
            }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [menu]);

    const render = () => {
        if (!section) return <Dashboard />;
        if (section === 'acquisition') return <AcquisitionPage />;
        if (section === 'parcours') return <JourneysPage />;
        if (section === 'scanners') return demo || can(me, 'DIGITIZATION_READ', {}) ? <ScannersPage /> : <Notice tone="warning">Cette section exige une habilitation nationale de lecture de la numérisation.</Notice>;
        if (section === 'traitement') return can(me, 'DIGITIZATION_READ', {}) || demo ? <TreatmentDashboard /> : <Notice tone="warning">Cette section exige une habilitation nationale de lecture de la numérisation.</Notice>;
        if (!demo && !moduleVisible(me, section, scope)) return <Notice tone="warning">{tr('Cet espace n’est pas disponible dans vos habilitations pour le périmètre choisi. Consultez votre profil ou changez de périmètre.')}</Notice>;
        if (demo && (archiveModules.some(m=>m.id===section)||['fonds','circuits-validation','droits','archives-physiques'].includes(section))) return <DesignPreview section={section} id={id}/>;
        if (section === 'fonds') return <ArchivalDescriptionPage />;
        if (catalogKeys.includes(section)) return id
            ? (UUID_RE.test(id) ? <DetailPage kind={section as Catalog} id={id} /> : <Notice tone="warning">Identifiant de ressource invalide.</Notice>)
            : <CatalogPage kind={section as Catalog} />;
        if (section === 'permissions') return <PermissionsPage />;
        if (section === 'governance') {
            const role = url.searchParams.get('role') ?? '';
            return role && !UUID_RE.test(role) ? <Notice tone="warning">Identifiant de rôle invalide.</Notice> : <GovernancePage roleId={role} />;
        }
        if (section === 'profile') {
            const user = url.searchParams.get('user');
            return user && !UUID_RE.test(user) ? <Notice tone="warning">Identifiant utilisateur invalide.</Notice> : <ProfilePage userId={user ?? undefined} />;
        }
        if (section === 'help') return <HelpPage />;
        if (!demo && section === 'conservation') return can(me, 'PRESERVATION_EVENT_READ', scope) ? <PreservationEventListPage /> : <Notice tone="warning">Cette section exige une habilitation de lecture du journal de préservation pour ce périmètre.</Notice>;
        if (!demo && recordKeys.includes(section)) return id
            ? (UUID_RE.test(id) ? <RecordDetailPage kind={section as RecordCatalog} id={id} /> : <Notice tone="warning">Identifiant de ressource invalide.</Notice>)
            : <RecordCatalogPage kind={section as RecordCatalog} />;
        if (!demo && section === 'recherche') return <SearchPage />;
        if (!demo && section === 'audit') return can(me, 'AUDIT_READ', {}) ? <AuditPage /> : <Notice tone="warning">Cette section exige une habilitation nationale de lecture du journal d’audit.</Notice>;
        if (!demo && section === 'classement') return can(me, 'CLASSIFICATION_READ', scope) ? <ClassificationPage /> : <Notice tone="warning">Cette section exige une habilitation de lecture du plan de classement pour ce périmètre.</Notice>;
        if (!demo && section === 'archives-physiques') return can(me, 'PHYSICALARCHIVES_READ', {}) ? <PhysicalArchivesPage initialArchiveId={url.searchParams.get('archive') ?? undefined} /> : <Notice tone="warning">Cette section exige une habilitation nationale de lecture des archives physiques.</Notice>;
        if (!demo && section === 'restauration') return can(me, 'RESTORATION_READ', {}) ? <RestorationListPage /> : <Notice tone="warning">Cette section exige une habilitation nationale de lecture des interventions de restauration.</Notice>;
        if (!demo && section === 'patrimoine') return can(me, 'HERITAGE_READ', {}) ? <HeritagePage initialAssetId={url.searchParams.get('bien') ?? undefined} /> : <Notice tone="warning">Cette section exige une habilitation nationale de lecture du patrimoine.</Notice>;
        if (!demo && section === 'ocr') return can(me, 'DIGITIZATION_READ', {}) ? <OcrListPage /> : <Notice tone="warning">Cette section exige une habilitation nationale de lecture de la numérisation.</Notice>;
        if (!demo && section === 'numerisation') return can(me, 'DIGITIZATION_READ', {}) ? <DigitizationPage initialProjectId={url.searchParams.get('project') ?? undefined} initialElementId={url.searchParams.get('element') ?? undefined} /> : <Notice tone="warning">Cette section exige une habilitation nationale de lecture de la numérisation.</Notice>;
        if (!demo && section === 'controle') return can(me, 'DIGITIZATION_READ', {}) ? <QualityControlListPage /> : <Notice tone="warning">Cette section exige une habilitation nationale de lecture de la numérisation.</Notice>;
        if (!demo && section === 'droits') return can(me, 'RIGHTS_READ', {}) ? <RightsPage /> : <Notice tone="warning">Cette section exige une habilitation nationale de lecture des droits.</Notice>;
        if (!demo && section === 'portail') return ['PORTAL_READ', 'PORTAL_PLAN_MANAGE', 'PORTAL_READER_MANAGE', 'PORTAL_CASHIER', 'PORTAL_SUPERVISE'].some(code => can(me, code, {})) ? <PortalAdminPage /> : <Notice tone="warning">Cette section exige une habilitation nationale du portail des lecteurs.</Notice>;
        if (!demo && section === 'salle-lecture') return ['READING_ROOM_READ', 'READING_ROOM_DESK', 'READING_ROOM_MANAGE'].some(code => can(me, code, scope)) ? <ReadingRoomPage /> : <Notice tone="warning">Cette section exige une habilitation de la salle de lecture pour ce périmètre.</Notice>;
        if (!demo && section === 'notifications') return <NotificationsPage />;
        if (!demo && section === 'vocabulaires') return can(me, 'VOCABULARY_MANAGE', scope) ? <VocabularyPage /> : <Notice tone="warning">Cette section exige une habilitation de gestion des vocabulaires contrôlés pour ce périmètre.</Notice>;
        if (!demo && section === 'metadonnees') return can(me, 'METADATA_SCHEMA_MANAGE', scope) ? <MetadataPage /> : <Notice tone="warning">Cette section exige une habilitation d’administration des schémas de métadonnées.</Notice>;
        if (!demo && section === 'versements') return can(me, 'ARCHIVAL_INTAKE_READ', {}) ? <ArchivalIntakePage /> : <Notice tone="warning">Cette section exige une habilitation nationale de lecture des entrées archivistiques.</Notice>;
        if (!demo && section === 'taches') return <TaskInboxPage />;
        if (!demo && section === 'circuits-validation') return can(me, 'WORKFLOW_DEFINITION_MANAGE', scope) ? <WorkflowPage /> : <Notice tone="warning">Cette section exige une habilitation d’administration des circuits de validation.</Notice>;
        if (!demo && (section === 'sort-final' || section === 'gel-legal' || section === 'eliminations')) return <RetentionNationalPage />;
        if (!demo && section === 'consultations') return can(me, 'CONSULTATION_READ', scope) ? <ConsultationsPage /> : <Notice tone="warning">Cette section exige une habilitation de lecture des demandes de dérogation pour ce périmètre.</Notice>;
        if (!demo && section === 'communications') return can(me, 'COMMUNICATION_READ', scope) ? <CommunicationsPage /> : <Notice tone="warning">Cette section exige une habilitation de lecture du registre des communications pour ce périmètre.</Notice>;
        if (archiveModules.some(module => module.id === section)) return <ArchiveModulePage section={section} id={id} />;
        return <Notice>Écran non disponible dans ce lot. <button className="text-link" onClick={() => go('')}>Retour à l’accueil</button></Notice>;
    };
    return <div className="app-shell institutional-shell nx-shell">
        <a className="skip-link" href="#main-content">{tr('Aller au contenu')}</a>
        {menu && <button className="nav-scrim" aria-label={tr('Fermer le menu')} onClick={() => { setMenu(false); menuButton.current?.focus(); }} />}
        <aside id="main-navigation" ref={menuPanel} className={'nx-sidebar ' + (menu ? 'open' : '')}>
            <div className="nx-brand">
                <img src="/dashboard/emblem-sidebar.png" alt={tr('Armoiries de la République de Guinée')} width="52" height="56" />
                <div><strong>SNAE - PPD</strong><span>{tr('Système National d’Archivage Électronique et du Patrimoine Documentaire')}</span></div>
                <button className="icon-btn close-navigation" onClick={() => { setMenu(false); menuButton.current?.focus(); }} aria-label={tr('Fermer la navigation')}><Icon name="close" /></button>
            </div>
            <nav aria-label={tr('Navigation principale')}>
                <button className={'nx-dashboard ' + (!section ? 'active' : '')} aria-current={!section ? 'page' : undefined} onClick={() => go('')}><Icon name="dashboard" size={20} /><span>{tr('Tableau de bord')}</span></button>
                {navGroups.map(group => {
                    const items = nav.filter(item => group.groups.includes(item.group) && item.ok);
                    if (!items.length) return null;
                    const expanded = !collapsed.includes(group.id);
                    const current = activeGroup === group.id;
                    return <section className="nx-section" key={group.id}>
                        <button className={'nx-section-head ' + (current ? 'current' : '')} aria-expanded={expanded} aria-controls={'nav-' + group.id} onClick={() => setCollapsed(list => expanded ? [...list, group.id] : list.filter(id => id !== group.id))}><span>{tr(group.label)}</span><Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={15} /></button>
                        <div id={'nav-' + group.id} hidden={!expanded} className="nx-items">{items.map(item => <button key={item.path} className={'nx-item ' + (section === item.path ? 'active' : '')} aria-current={section === item.path ? 'page' : undefined} onClick={() => go(item.path)}><Icon name={navIcons[item.path] ?? 'document'} size={17} /><span>{tr(item.label)}</span>{item.path === 'statistiques' && <em className="nx-beta">{tr('Bêta')}</em>}{!demo && item.demo && <span className="tag">{tr('Maquette')}</span>}</button>)}</div>
                    </section>;
                })}
            </nav>
            <div className="nx-version">SNAE-PPD · {demo ? tr('Démonstration') : config.label}</div>
        </aside>
        <div className="nx-workspace">
            <header className="nx-topbar">
                <button ref={menuButton} className="icon-btn mobile-menu" aria-label={tr('Ouvrir le menu')} aria-expanded={menu} aria-controls="main-navigation" onClick={() => setMenu(true)}><Icon name="menu" /></button>
                <button className="nx-republic" onClick={() => go('')} aria-label={tr('République de Guinée — retour au tableau de bord')}><img src="/dashboard/emblem-header.png" alt="" width="48" height="46" /><span><strong>{tr('République de Guinée')}</strong><small>{tr('Travail – Justice – Solidarité')}</small></span></button>
                <form className="nx-search" role="search" onSubmit={submitSearch}><Icon name="search" size={19} /><input type="search" aria-label={tr('Rechercher un document, un dossier, une référence')} placeholder={tr('Rechercher un document, un dossier, une référence…')} value={term} maxLength={200} onChange={event => setTerm(event.target.value)} /></form>
                <div className="nx-actions" ref={popArea}>
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
            {demo && <div className="demo-banner"><span><b>DÉMONSTRATION</b> <span className="demo-explanation">Données fictives · Aucun appel au serveur</span></span><div><label>Profil <select aria-label="Persona de démonstration" value={me!.user.id.endsWith('001') ? 'a' : me!.user.id.endsWith('002') ? 'b' : 'agent'} onChange={e => void switchPersona(e.target.value as 'a' | 'b' | 'agent')}><option value="a">Administrateur A</option><option value="b">Administrateur B</option><option value="agent">Agent de recette</option></select></label><button onClick={() => { if (confirm('Réinitialiser toutes les données fictives de cet onglet ?')) { sessionStorage.removeItem('snae-f2-demo-records-v1'); sessionStorage.removeItem('snae-f2-demo-audit-v1'); window.dispatchEvent(new Event('snae-f3-demo-reset')); void resetDemo(); } }}>Réinitialiser</button></div></div>}
            {section && <div className="scope-strip"><span><Icon name="building" size={16} /><b>{tr('Périmètre de travail')}</b><span className="scope-selected">{scopeText}</span></span><button className="text-link" onClick={() => setScopeOpen(value => !value)} aria-expanded={scopeOpen} aria-controls="scope-selection">{tr(scopeOpen ? 'Fermer' : 'Changer de périmètre')}<Icon name="chevron" size={14} /></button></div>}
            {scopeOpen && <div id="scope-selection" className="scope-panel"><ReferencePicker kind="institutions" value={scope.institutionId ?? ''} onChange={value => setScope({ institutionId: value || null, departmentId: me!.user.scope === 'DEPARTEMENT' ? me!.user.departmentId : null })} label={tr('Choisir une institution')} scope={can(me, 'IAM_INSTITUTION_READ', {}) ? {} : { institutionId: me!.user.institutionId }} nullable={can(me, 'IAM_INSTITUTION_READ', {})} />{scope.institutionId && <ReferencePicker kind="departments" value={scope.departmentId ?? ''} onChange={value => setScope({ ...scope, departmentId: value || null })} label={tr('Choisir un département')} scope={{ institutionId: scope.institutionId, departmentId: me!.user.scope === 'DEPARTEMENT' ? me!.user.departmentId : undefined }} nullable={me!.user.scope !== 'DEPARTEMENT'} />}</div>}
            <main id="main-content" tabIndex={-1} className="main-content" key={epoch + ':' + path}>{render()}</main>
            <footer className="workspace-footer"><span>{tr('SNAE-PPD · Archives et patrimoine documentaire')}</span><span>{tr('Proposition institutionnelle · F3 · Recette')}</span></footer>
        </div>
    </div>;
}
function Gate() {
    const { me, busy } = useSession();
    const path = usePath();
    useEffect(() => { if (me && !path.startsWith('/app')) navigate('/app'); }, [!!me, path]);
    if (!me) return <Login />;
    if (busy) return <Busy />;
    return <WorkspaceProvider key={me.user.id}><Shell /></WorkspaceProvider>;
}
class Boundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    render() {
        return this.state.failed ? <main className="fatal"><h1>L’interface n’a pas pu afficher cet écran.</h1><p>Aucune réussite métier ne doit être déduite de cet incident. Relisez les données après rechargement.</p><button className="btn primary" onClick={() => location.assign('/connexion')}>Revenir à la connexion</button></main> : this.props.children;
    }
}
/** Le portail des lecteurs (/portail) n'utilise pas la session du personnel : il est choisi avant elle. */
function Root() {
    const path = usePath();
    return isPortalPath(path) ? <PortalApp /> : <SessionProvider><Gate /></SessionProvider>;
}
export function App() { return <Boundary><LocaleProvider><Root /></LocaleProvider></Boundary>; }
