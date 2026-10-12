import React from 'react';
import { usePath } from '../ui/navigation';
import { Notice } from '../ui/components';
import { UUID_RE } from '../core/validation';
import type { PortalApi } from '../api/portal';
import { PortalProvider } from './context';
import { PortalShell } from './Shell';
import { CataloguePage, NoticePage } from './Catalogue';
import { ViewerPage } from './Viewer';
import { PlansPage } from './Plans';
import { FindingAidNodePage, FindingAidsPage } from './FindingAids';
import { AccountPage } from './Account';
import { ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage, VerifyEmailPage } from './Auth';

export const isPortalPath = (path: string): boolean => path === '/portail' || path.startsWith('/portail/') || path.startsWith('/portail?');

/** Le choix de l'écran selon l'adresse : pur, pour que les routes se testent sans navigateur. */
export function portalRoute(pathname: string): { screen: string; id?: string } {
    const parts = pathname.split('/').filter(Boolean).slice(1);
    const [head, id] = parts;
    if (!head) return { screen: 'catalogue' };
    if (head === 'notices' && id) return UUID_RE.test(id) ? { screen: 'notice', id } : { screen: 'invalide' };
    if (head === 'lecture' && id) return UUID_RE.test(id) ? { screen: 'lecture', id } : { screen: 'invalide' };
    if (head === 'inventaires') {
        if (parts.length === 1) return { screen: 'inventaires' };
        if (parts.length === 4 && parts[2] === 'notices') return UUID_RE.test(parts[1] ?? '') && UUID_RE.test(parts[3] ?? '') ? { screen: 'inventaire-notice', id: parts[3] } : { screen: 'invalide' };
        return { screen: 'inconnu' };
    }
    if (parts.length === 1 && ['formules', 'compte', 'connexion', 'inscription', 'verification', 'mot-de-passe-oublie', 'reinitialisation'].includes(head)) return { screen: head };
    return { screen: 'inconnu' };
}

function Routes() {
    const path = usePath();
    const route = portalRoute(new URL(path, location.origin).pathname);
    switch (route.screen) {
        case 'catalogue': return <CataloguePage />;
        case 'notice': return <NoticePage key={route.id} id={route.id!} />;
        case 'lecture': return <ViewerPage key={route.id} documentId={route.id!} />;
        case 'inventaires': return <FindingAidsPage />;
        case 'inventaire-notice': return <FindingAidNodePage key={route.id} id={route.id!} />;
        case 'formules': return <PlansPage />;
        case 'compte': return <AccountPage />;
        case 'connexion': return <LoginPage />;
        case 'inscription': return <RegisterPage />;
        case 'verification': return <VerifyEmailPage />;
        case 'mot-de-passe-oublie': return <ForgotPasswordPage />;
        case 'reinitialisation': return <ResetPasswordPage />;
        case 'invalide': return <div className="portal-page"><Notice tone="warning">Cette adresse n’est pas valide.</Notice></div>;
        default: return <div className="portal-page"><Notice tone="warning">Cette page n’existe pas.</Notice></div>;
    }
}

/** Le portail public : une application à part, sans l'identité de l'institution (les lecteurs ont leur propre compte). */
export function PortalApp({ api }: { api?: PortalApi }) {
    return <PortalProvider api={api}><PortalShell><Routes /></PortalShell></PortalProvider>;
}
