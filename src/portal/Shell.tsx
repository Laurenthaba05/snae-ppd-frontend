import React, { useEffect } from 'react';
import { navigate, usePath } from '../ui/navigation';
import { Icon } from '../ui/icons';
import { NationalFlag } from '../ui/Institutional';
import { Busy } from '../ui/components';
import { portalPath } from '../core/portal';
import { usePortal } from './context';
import { PortalAssistant } from './Assistant';

/** Un lien du portail : une vraie adresse (clic du milieu, copie du lien), sans rechargement de la page. */
export function PLink({ to, className, children, params, ...rest }: { to: string; className?: string; children: React.ReactNode; params?: Record<string, string | number | null | undefined> } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
    const href = portalPath(to, params);
    return <a {...rest} href={href} className={className} onClick={event => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigate(href);
    }}>{children}</a>;
}

/** Les pages qui exigent un compte renvoient vers la connexion, puis reviennent à la page demandée. */
export function RequireReader({ children }: { children: React.ReactNode }) {
    const { reader, loading } = usePortal();
    const path = usePath();
    useEffect(() => { if (!loading && !reader) navigate(portalPath('/connexion', { retour: path })); }, [loading, !!reader]);
    if (loading || !reader) return <Busy label="Vérification de votre session…" />;
    return <>{children}</>;
}

export function PortalShell({ children }: { children: React.ReactNode }) {
    const { reader, loading, signOut, access } = usePortal();
    const path = usePath();
    const here = new URL(path, location.origin).pathname;
    const current = (to: string) => here === portalPath(to) || (to !== '' && here.startsWith(portalPath(to) + '/')) ? 'page' : undefined;
    useEffect(() => { document.getElementById('portal-main')?.focus({ preventScroll: true }); }, [here]);
    return <div className="portal-shell">
        <a className="skip-link" href="#portal-main">Aller au contenu</a>
        <header className="portal-header">
            <div className="portal-identity"><NationalFlag /><div><strong>RÉPUBLIQUE DE GUINÉE</strong><small>Travail · Justice · Solidarité</small></div></div>
            <PLink to="" className="portal-title"><span>Archives et patrimoine documentaire</span><small>Portail des lecteurs</small></PLink>
            <nav className="portal-nav" aria-label="Navigation du portail">
                <PLink to="" aria-current={here === portalPath('') || here.startsWith(portalPath('/notices')) ? 'page' : undefined}>Catalogue</PLink>
                <PLink to="/inventaires" aria-current={here.startsWith(portalPath('/inventaires')) ? 'page' : undefined}>Inventaires</PLink>
                <PLink to="/formules" aria-current={current('/formules')}>Abonnements</PLink>
                {loading ? null : reader
                    ? <>
                        <PLink to="/compte" aria-current={current('/compte')}><Icon name="user" size={16} />{reader.prenom}</PLink>
                        <button className="portal-link-button" onClick={() => { void signOut().then(() => navigate(portalPath(''))); }}>Se déconnecter</button>
                    </>
                    : <>
                        <PLink to="/connexion" aria-current={current('/connexion')}>Se connecter</PLink>
                        <PLink to="/inscription" className="btn primary small" aria-current={current('/inscription')}>Créer un compte</PLink>
                    </>}
            </nav>
        </header>
        {reader && access === 'EN_ATTENTE' && <div className="portal-banner" role="status"><Icon name="info" size={18} /><span>Votre demande d’abonnement attend le paiement au guichet. <PLink to="/compte">Voir la référence à donner</PLink></span></div>}
        <main id="portal-main" tabIndex={-1} className="portal-main">{children}</main>
        <PortalAssistant />
        <footer className="portal-footer"><span>SNAE-PPD · Archives et patrimoine documentaire</span><span>Les pages consultées portent le nom du lecteur et sont tracées.</span></footer>
    </div>;
}
