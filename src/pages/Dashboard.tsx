import React from 'react';
import { useSession } from '../auth/session';
import { useWorkspace } from '../ui/workspace';
import { navigate } from '../ui/navigation';
import { Icon } from '../ui/icons';
import { Badge, Notice, PageHead } from '../ui/components';
import { can, platform, subjectTarget } from '../core/policy';

export function Dashboard() {
    const { me, demo } = useSession();
    const { scope } = useWorkspace();
    const central = platform(me);
    const permissions = new Set(me!.grants.map(grant => grant.permission));
    const scopes = new Set(me!.grants.map(grant => [grant.scope, grant.institutionId, grant.departmentId].join(':')));
    const shortcuts = [
        { path: 'institutions', title: 'Institutions', description: 'Consulter et administrer le référentiel des organismes.', icon: 'building', visible: me!.grants.some(g => g.permission === 'IAM_INSTITUTION_READ') },
        { path: 'users', title: 'Utilisateurs', description: 'Gérer les identités et leur rattachement administratif.', icon: 'users', visible: me!.grants.some(g => g.permission === 'IAM_USER_READ') },
        { path: 'roles', title: 'Rôles et habilitations', description: 'Définir les responsabilités et les permissions associées.', icon: 'shield', visible: can(me, 'IAM_ROLE_READ', subjectTarget(me!)) },
        { path: 'governance', title: 'Gouvernance des accès', description: 'Examiner les changements avec une approbation indépendante.', icon: 'check', visible: central }
    ];
    return <>
        <PageHead eyebrow="ACCUEIL / ESPACE PROFESSIONNEL" title="Espace de travail" description="Identité et organisation · Administration des habilitations">
            <button className="btn secondary" onClick={() => navigate('/app/help')}><Icon name="help" size={17} />Guide de prise en main</button>
        </PageHead>
        <section className="institutional-welcome">
            <div className="welcome-content"><span className="welcome-eyebrow">SNAE-PPD · MODULE 01</span><h2>Bonjour, {me!.user.prenom ?? me!.user.nom ?? 'bienvenue'}.</h2><p>Retrouvez vos services et gérez les accès<br className="desktop-only" /> dans votre périmètre de responsabilité.</p><button className="welcome-link" onClick={() => navigate('/app/profile')}>Consulter mon profil et mes droits<Icon name="arrow" size={18} /></button></div>
            <div className="welcome-identity"><Icon name="building" size={31} /><span>VOTRE ESPACE</span><strong>{central ? 'Administration centrale' : me!.user.scope === 'DEPARTEMENT' ? 'Administration départementale' : 'Administration institutionnelle'}</strong><small>{scope.institutionId ? 'Périmètre sélectionné dans la barre supérieure' : 'Périmètre de travail national'}</small><div className="welcome-identity-rule"><i /><i /><i /></div></div>
        </section>
        <div className="stat-grid">
            <div className="stat-card"><span className="stat-symbol"><Icon name="key" size={22} /></span><div><span className="stat-title">Permissions affichées</span><strong>{permissions.size}{me!.truncated ? '+' : ''}</strong><small>{demo ? 'Habilitations fictives du profil de recette' : 'Droits transmis par votre identité serveur'}</small></div></div>
            <div className="stat-card"><span className="stat-symbol"><Icon name="tree" size={22} /></span><div><span className="stat-title">Périmètres de droits</span><strong>{scopes.size}{me!.truncated ? '+' : ''}</strong><small>Dans les droits affichés, pas un total national</small></div></div>
            <div className="stat-card"><span className="stat-symbol"><Icon name="users" size={22} /></span><div><span className="stat-title">Rattachement du compte</span><div className="stat-scope"><Badge value={me!.user.scope} /></div><small>Les permissions sont attribuées séparément</small></div></div>
        </div>
        {me!.truncated && <Notice tone="warning">La liste des droits est limitée par le serveur. Certaines habilitations peuvent ne pas apparaître ici ; chaque opération reste contrôlée par le backend.</Notice>}
        <div className="home-columns">
            <section><div className="section-heading plain"><div><h3>Vos services d’administration</h3><p>Un accès direct aux fonctions de votre périmètre.</p></div><span className="section-caption">MODULE 01</span></div><div className="shortcut-grid">{shortcuts.filter(item => item.visible).map(item => <button className="shortcut" key={item.path} onClick={() => navigate('/app/' + item.path)}><span className="shortcut-icon"><Icon name={item.icon} size={25} /></span><span className="shortcut-copy"><strong>{item.title}</strong><span>{item.description}</span><span className="shortcut-link">Accéder au service<Icon name="arrow" size={16} /></span></span></button>)}</div></section>
            <aside className="governance-guide"><div className="guide-title"><Icon name="shield" size={21} /><h3>Un accès, une responsabilité</h3></div><p>Le circuit des habilitations</p><ol><li><span>01</span><div><strong>Identifier</strong><p>Un compte nominatif et un rattachement explicite.</p></div></li><li><span>02</span><div><strong>Habiliter</strong><p>Un rôle, un périmètre et une période adaptés à la mission.</p></div></li><li><span>03</span><div><strong>Contrôler</strong><p>Une seconde approbation pour les changements sensibles.</p></div></li></ol><button className="text-link" onClick={() => navigate('/app/help')}>Comprendre les règles<Icon name="arrow" size={16} /></button></aside>
        </div>
        <section className="heritage-note"><span className="heritage-note-icon"><Icon name="archive" size={28} /></span><div><strong>Préserver les documents. Transmettre la mémoire.</strong><p>La gestion des accès est la première étape d’une conservation maîtrisée.</p></div><span className="heritage-note-tag">ARCHIVES & PATRIMOINE</span></section>
        <p className="workspace-disclosure">{demo ? 'Les informations présentées sont fictives. Aucun service de l’État n’est appelé dans cette démonstration.' : 'Les droits d’affichage ne remplacent pas les contrôles de sécurité du serveur.'}</p>
    </>;
}
