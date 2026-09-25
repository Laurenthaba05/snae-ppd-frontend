import React, { useEffect, useRef, useState } from 'react';
import { SessionProvider, useSession } from './auth/session';
import { config } from './auth/config';
import { WorkspaceProvider, useWorkspace } from './ui/workspace';
import { usePath, navigate } from './ui/navigation';
import { Icon } from './ui/icons';
import { ArchiveMark, InstitutionalHeader } from './ui/Institutional';
import { Notice, Busy } from './ui/components';
import { ReferencePicker } from './ui/ReferencePicker';
import { can, platform, subjectTarget } from './core/policy';
import { UUID_RE } from './core/validation';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { CatalogPage } from './pages/Catalog';
import { DetailPage } from './pages/Detail';
import { PermissionsPage } from './pages/Permissions';
import { GovernancePage } from './pages/Governance';
import { ProfilePage } from './pages/Profile';
import { HelpPage } from './pages/Help';
import { ArchiveModulePage, archiveModules } from './pages/ArchiveModules';
import type { Catalog } from './core/types';

const catalogKeys = ['institutions', 'departments', 'users', 'roles'];

function Shell() {
    const { me, demo, epoch, logout, switchPersona, resetDemo } = useSession();
    const { scope, setScope } = useWorkspace();
    const path = usePath();
    const [menu, setMenu] = useState(false);
    const [scopeOpen, setScopeOpen] = useState(false);
    const menuButton = useRef<HTMLButtonElement>(null);
    const menuPanel = useRef<HTMLElement>(null);
    const url = new URL(path, location.origin);
    const parts = url.pathname.split('/').filter(Boolean);
    const section = parts[1] ?? '';
    const id = parts[2];
    const central = platform(me);
    const nav = [
        { path: '', label: 'Vue d’ensemble', icon: 'home', group: 'workspace', ok: true },
        { path: 'institutions', label: 'Institutions', icon: 'building', group: 'admin', ok: me!.grants.some(g => g.permission === 'IAM_INSTITUTION_READ') },
        { path: 'departments', label: 'Départements', icon: 'tree', group: 'admin', ok: me!.grants.some(g => g.permission === 'IAM_DEPARTMENT_READ') },
        { path: 'users', label: 'Utilisateurs', icon: 'users', group: 'admin', ok: me!.grants.some(g => g.permission === 'IAM_USER_READ') },
        { path: 'roles', label: 'Rôles et habilitations', icon: 'shield', group: 'admin', ok: can(me, 'IAM_ROLE_READ', subjectTarget(me!)) },
        { path: 'permissions', label: 'Permissions', icon: 'key', group: 'admin', ok: can(me, 'IAM_ROLE_READ', subjectTarget(me!)) },
        { path: 'governance', label: 'Gouvernance', icon: 'check', group: 'admin', ok: central },
        ...archiveModules.map(module => ({ path: module.id, label: module.title, icon: module.group === 'Patrimoine' ? 'archive' : 'tree', group: module.group, ok: true })),
        { path: 'profile', label: 'Mon profil', icon: 'users', group: 'support', ok: true },
        { path: 'help', label: 'Guide & assistance', icon: 'help', group: 'support', ok: true }
    ];
    const title = nav.find(item => item.path === section)?.label ?? 'Guide';
    const go = (route: string) => navigate('/app' + (route ? '/' + route : ''));

    useEffect(() => {
        setMenu(false);
        document.title = 'SNAE-PPD · ' + title;
        document.getElementById('main-content')?.focus({ preventScroll: true });
    }, [path]);
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
        if (archiveModules.some(module => module.id === section)) return <ArchiveModulePage section={section} id={id} />;
        return <Notice>Écran non disponible dans ce lot. <button className="text-link" onClick={() => go('')}>Retour à l’accueil</button></Notice>;
    };
    return <div className="app-shell institutional-shell">
        <a className="skip-link" href="#main-content">Aller au contenu</a>
        <InstitutionalHeader compact>
            <span className="header-environment">{demo ? 'DÉMONSTRATION' : config.label}</span>
            <span className="language-label">FR <span>Français</span></span>
        </InstitutionalHeader>
        {menu && <button className="nav-scrim" aria-label="Fermer le menu" onClick={() => { setMenu(false); menuButton.current?.focus(); }} />}
        <aside id="main-navigation" ref={menuPanel} className={'sidebar ' + (menu ? 'open' : '')}>
            <div className="sidebar-brand"><ArchiveMark /><div><strong>SNAE-PPD</strong><span>Espace professionnel</span></div><button className="icon-btn close-navigation" onClick={() => { setMenu(false); menuButton.current?.focus(); }} aria-label="Fermer la navigation"><Icon name="close" /></button></div>
            <div className="sidebar-module"><span className="workspace-dot" /><div><strong>Identité & organisation</strong><small>Module 01</small></div></div>
            <nav aria-label="Navigation principale">
                {['workspace', 'admin', 'Collecte', 'Archives', 'Accès', 'Traitements', 'Conservation', 'Patrimoine', 'Pilotage', 'support'].map(group => <React.Fragment key={group}>
                    {nav.some(item => item.group === group && item.ok) && <span className="nav-group">{group === 'workspace' ? 'POSTE DE TRAVAIL' : group === 'admin' ? 'ADMINISTRATION' : group === 'support' ? 'ACCOMPAGNEMENT' : group.toUpperCase()}</span>}
                    {nav.filter(item => item.group === group && item.ok).map(item => <button key={item.path} className={'nav-item ' + (section === item.path ? 'active' : '')} aria-current={section === item.path ? 'page' : undefined} onClick={() => go(item.path)}><Icon name={item.icon} size={19} /><span>{item.label}</span>{section === item.path && <Icon name="chevron" size={13} />}</button>)}
                </React.Fragment>)}
            </nav>
            <div className="sidebar-footer"><Icon name="archive" size={23} /><strong>La mémoire publique,<br />une responsabilité partagée.</strong><small>SNAE-PPD · F2 · Recette</small></div>
        </aside>
        <div className="workspace">
            <header className="topbar"><div className="topbar-left"><button ref={menuButton} className="icon-btn mobile-menu" aria-label="Ouvrir le menu" aria-expanded={menu} aria-controls="main-navigation" onClick={() => setMenu(true)}><Icon name="menu" /></button><span className="breadcrumb"><Icon name="home" size={15} /><span>Accueil</span><Icon name="chevron" size={12} /><b>{title}</b></span></div><div className="topbar-right"><button className="user-menu" onClick={() => go('profile')} aria-label="Ouvrir mon profil"><span className="user-initials">{(me!.user.prenom?.[0] ?? '') + (me!.user.nom?.[0] ?? 'U')}</span><div><strong>{me!.user.prenom ?? me!.user.nom ?? 'Utilisateur'}</strong><small>{central ? 'Administration centrale' : me!.user.scope === 'DEPARTEMENT' ? 'Périmètre départemental' : 'Périmètre institutionnel'}</small></div></button><button className="icon-btn logout" title="Fermer la session locale" aria-label="Se déconnecter" onClick={() => void logout()}><Icon name="logout" size={18} /></button></div></header>
            {demo && <div className="demo-banner"><span><b>DÉMONSTRATION</b> <span className="demo-explanation">Données fictives · Aucun appel au serveur</span></span><div><label>Profil <select aria-label="Persona de démonstration" value={me!.user.id.endsWith('001') ? 'a' : me!.user.id.endsWith('002') ? 'b' : 'agent'} onChange={e => void switchPersona(e.target.value as 'a' | 'b' | 'agent')}><option value="a">Administrateur A</option><option value="b">Administrateur B</option><option value="agent">Agent de recette</option></select></label><button onClick={() => { if (confirm('Réinitialiser toutes les données fictives de cet onglet ?')) { sessionStorage.removeItem('snae-f2-demo-records-v1'); sessionStorage.removeItem('snae-f2-demo-audit-v1'); void resetDemo(); } }}>Réinitialiser</button></div></div>}
            <div className="scope-strip"><span><Icon name="building" size={16} /><b>Périmètre de travail</b><span className="scope-selected">{scope.institutionId ? 'Institution ' + scope.institutionId.slice(0, 8) : 'National'}{scope.departmentId ? ' / département ' + scope.departmentId.slice(0, 8) : ''}</span></span><button className="text-link" onClick={() => setScopeOpen(value => !value)} aria-expanded={scopeOpen} aria-controls="scope-selection">{scopeOpen ? 'Fermer' : 'Changer de périmètre'}<Icon name="chevron" size={14} /></button></div>
            {scopeOpen && <div id="scope-selection" className="scope-panel"><ReferencePicker kind="institutions" value={scope.institutionId ?? ''} onChange={value => setScope({ institutionId: value || null, departmentId: me!.user.scope === 'DEPARTEMENT' ? me!.user.departmentId : null })} label="Choisir une institution" scope={can(me, 'IAM_INSTITUTION_READ', {}) ? {} : { institutionId: me!.user.institutionId }} nullable={can(me, 'IAM_INSTITUTION_READ', {})} />{scope.institutionId && <ReferencePicker kind="departments" value={scope.departmentId ?? ''} onChange={value => setScope({ ...scope, departmentId: value || null })} label="Choisir un département" scope={{ institutionId: scope.institutionId, departmentId: me!.user.scope === 'DEPARTEMENT' ? me!.user.departmentId : undefined }} nullable={me!.user.scope !== 'DEPARTEMENT'} />}</div>}
            <main id="main-content" tabIndex={-1} className="main-content" key={epoch + ':' + path}>{render()}</main>
            <footer className="workspace-footer"><span>SNAE-PPD · Archives et patrimoine documentaire</span><span>Proposition institutionnelle · F2 · Recette</span></footer>
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
export function App() { return <Boundary><SessionProvider><Gate /></SessionProvider></Boundary>; }
