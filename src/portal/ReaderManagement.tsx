import React, { useEffect, useState } from 'react';
import { useSession } from '../auth/session';
import { useWorkspace } from '../ui/workspace';
import { useScopeText } from '../ui/names';
import { ReferencePicker } from '../ui/ReferencePicker';
import { can, subjectTarget } from '../core/policy';
import { readerManagementSection, staffHref, type ReaderManagementModule } from '../core/staffRoutes';
import { moduleVisible } from '../design/navigation';
import { navigate, usePath } from '../ui/navigation';
import { Busy, Notice } from '../ui/components';
import { NationalFlag } from '../ui/Institutional';
import { LanguageSwitch, useLocale } from '../ui/i18n';
import { PLink } from './Shell';

const Consultations = React.lazy(() => import('../pages/Consultations').then(m => ({default:m.ConsultationsPage})));
const Communications = React.lazy(() => import('../pages/Consultations').then(m => ({default:m.CommunicationsPage})));
const ReadingRoom = React.lazy(() => import('../pages/ReadingRoom').then(m => ({default:m.ReadingRoomPage})));
const Readers = React.lazy(() => import('../pages/PortalAdmin').then(m => ({default:m.PortalAdminPage})));
export const readerManagementEntries: Array<{id:ReaderManagementModule;label:string;description:string}> = [
    {id:'consultations',label:'Consultations',description:'Instruire les demandes de consultation et les dérogations.'},
    {id:'communications',label:'Communications',description:'Suivre la remise et la restitution des documents.'},
    {id:'salle-lecture',label:'Salle de lecture',description:'Gérer les lecteurs, les réservations et les bulletins de communication.'},
    {id:'portail',label:'Gestion des lecteurs',description:'Gérer les comptes lecteurs, les tarifs, les paiements et les abonnements.'}
];
function StaffLink({to, children, ...rest}: {to:string;children:React.ReactNode} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>,'href'>) {
    return <a {...rest} href={to} onClick={event => {
        if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault(); navigate(to);
    }}>{children}</a>;
}
/** Aucun compte lecteur n'autorise ces pages : elles emploient uniquement la session et les API du personnel. */
export function ReaderManagement() {
    const {me, demo, epoch, logout} = useSession();
    const {scope, setScope} = useWorkspace();
    const scopeText = useScopeText(scope);
    const {tr} = useLocale();
    const path = usePath();
    const section = readerManagementSection(path);
    const [scopeOpen,setScopeOpen] = useState(false);
    const entries = readerManagementEntries.filter(item => moduleVisible(me,item.id,scope,demo));
    const permitted = !!section && entries.some(item => item.id === section);
    useEffect(() => { document.title = 'SNAE-PPD · ' + tr('Consultation & diffusion'); document.getElementById('main-content')?.focus({preventScroll:true}); }, [path,tr]);
    if (!me) return <Notice tone="warning">{tr('Connectez-vous avec un compte professionnel pour gérer les services aux lecteurs.')}</Notice>;
    return <div className="portal-shell portal-management">
        <a className="skip-link" href="#main-content">{tr('Aller au contenu')}</a>
        <header className="portal-header">
            <div className="portal-identity"><NationalFlag /><div><strong>{tr('République de Guinée')}</strong><small>{tr('Travail – Justice – Solidarité')}</small></div></div>
            <PLink to="/documents" className="portal-title"><span>{tr('Archives et patrimoine documentaire')}</span><small>{tr('Portail des lecteurs')}</small></PLink>
            <nav className="portal-nav" aria-label={tr('Navigation des services aux lecteurs')}>
                <PLink to="/documents">{tr('Catalogue public')}</PLink>
                <PLink to="/gestion" aria-current={!section ? 'page' : undefined}>{tr('Consultation & diffusion')}</PLink>
                <StaffLink to="/app">{tr('Espace agents')}</StaffLink>
                <LanguageSwitch />
                <button className="portal-link-button" onClick={() => void logout()}>{tr('Se déconnecter')}</button>
            </nav>
        </header>
        <div className="reader-management-identity"><span>{tr('Gestion réservée aux agents habilités')}</span><strong>{[me.user.prenom,me.user.nom].filter(Boolean).join(' ')}</strong></div>
        <section className="scope-strip" aria-label={tr('Périmètre de travail')}><span><b>{tr('Périmètre de travail')}</b> {scopeText}</span><button className="text-link" aria-expanded={scopeOpen} aria-controls="reader-management-scope" onClick={() => setScopeOpen(v => !v)}>{tr(scopeOpen ? 'Fermer' : 'Changer de périmètre')}</button></section>
        {scopeOpen && <div className="scope-panel" id="reader-management-scope">
            <ReferencePicker kind="institutions" value={scope.institutionId ?? ''} onChange={value => setScope({institutionId:value || null, departmentId:me.user.scope === 'DEPARTEMENT' ? me.user.departmentId : null})} label={tr('Choisir une institution')} scope={can(me,'IAM_INSTITUTION_READ',{}) ? {} : subjectTarget(me)} nullable={can(me,'IAM_INSTITUTION_READ',{})} />
            {scope.institutionId && <ReferencePicker kind="departments" value={scope.departmentId ?? ''} onChange={value => setScope({...scope,departmentId:value || null})} label={tr('Choisir un département')} scope={{institutionId:scope.institutionId,departmentId:me.user.scope === 'DEPARTEMENT' ? me.user.departmentId : undefined}} nullable={me.user.scope !== 'DEPARTEMENT'} />}
        </div>}
        <nav className="reader-management-nav" aria-label={tr('Gestion des services aux lecteurs')}>
            {entries.map(item => <StaffLink key={item.id} to={staffHref(item.id)} aria-current={section === item.id ? 'page' : undefined}>{tr(item.label)}</StaffLink>)}
        </nav>
        <main id="main-content" tabIndex={-1} className="portal-main reader-management-main" key={epoch + ':' + path}>
            {section === null ? <Notice tone="warning">{tr('Cette adresse n’est pas valide.')}</Notice>
                : section === '' ? <div className="portal-page"><div className="portal-hero"><h1>{tr('Consultation & diffusion')}</h1><p>{tr('Les services aux lecteurs réunis dans leur portail. Choisissez une activité autorisée dans votre périmètre.')}</p><PLink to="/documents" className="btn secondary">{tr('Consulter les documents publiés')}</PLink></div>
                    {entries.length ? <div className="reader-management-cards">{entries.map(item => <StaffLink to={staffHref(item.id)} key={item.id}><strong>{tr(item.label)}</strong><span>{tr(item.description)}</span></StaffLink>)}</div> : <Notice>{tr('Aucun service de gestion n’est autorisé dans ce périmètre. Consultez votre profil ou choisissez une autre institution.')}</Notice>}
                </div> : !permitted ? <Notice tone="warning">{tr('Cet espace n’est pas disponible dans vos habilitations pour le périmètre choisi. Consultez votre profil ou changez de périmètre.')}</Notice>
                : demo ? <Notice>{tr('Cette gestion nécessite une connexion au backend réel.')}</Notice>
                : <React.Suspense fallback={<Busy />}>{section === 'consultations' ? <Consultations /> : section === 'communications' ? <Communications /> : section === 'salle-lecture' ? <ReadingRoom /> : <Readers />}</React.Suspense>}
        </main>
        <footer className="portal-footer"><span>SNAE-PPD · {tr('Portail des lecteurs')}</span><PLink to="/documents">{tr('Retour au catalogue public')}</PLink><StaffLink to="/app/profile">{tr('Mon profil')}</StaffLink></footer>
    </div>;
}
