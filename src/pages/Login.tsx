import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { config, configIssue } from '../auth/config';
import { Icon } from '../ui/icons';
import { InstitutionalHeader } from '../ui/Institutional';
import { ErrorNotice } from '../ui/components';
import { LanguageSwitch, useLocale } from '../ui/i18n';

export function Login() {
    const session = useSession();
    const { tr } = useLocale();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [show, setShow] = useState(false);
    const [help, setHelp] = useState(false);
    const issue = configIssue();
    const contact = config.supportEmail ?? '';
    const mailto = contact ? 'mailto:' + contact + '?subject=' + encodeURIComponent(tr('Demande d’accès SNAE-PPD')) : '';
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        try { await session.signIn(email, password); }
        catch { /* L'erreur est présentée par le contexte de session. */ }
        finally { setPassword(''); }
    };
    const signIn = () => void session.signIn().catch(() => {});

    return <div className="gov-login">
        <a className="skip-link" href="#login-content">{tr('Aller à la connexion')}</a>
        <InstitutionalHeader>
            <button className="utility-link" onClick={() => setHelp(value => !value)} aria-expanded={help} aria-controls="login-assistance"><Icon name="help" size={17} />{tr('Assistance')}</button>
            <LanguageSwitch />
        </InstitutionalHeader>
        <main id="login-content" className="gov-login-main">
            <section className="gov-login-intro" aria-labelledby="service-heading">
                <div className="intro-kicker"><span />{tr('ARCHIVES ADMINISTRATIVES & PATRIMOINE')}</div>
                <h1 id="service-heading">Les archives de l’État.<br /><em>La mémoire <br />de la Nation.</em></h1>
                <p className="intro-description">{tr('Un espace de travail commun pour organiser les documents publics et préserver notre patrimoine documentaire.')}</p>
                <div className="institutional-rule"><span /><span /><span /></div>
                <div className="intro-service-list">
                    <div><Icon name="document" size={23} /><span><strong>{tr('Organiser les documents')}</strong><small>{tr('Des dossiers structurés et des responsabilités claires.')}</small></span></div>
                    <div><Icon name="shield" size={23} /><span><strong>{tr('Maîtriser les accès')}</strong><small>{tr('Des habilitations nominatives, vérifiées par le serveur.')}</small></span></div>
                    <div><Icon name="archive" size={23} /><span><strong>{tr('Préserver la mémoire')}</strong><small>{tr('Une continuité entre administration et patrimoine.')}</small></span></div>
                </div>
                <div className="intro-foot"><Icon name="archive" size={24} /><div><strong>SNAE-PPD</strong><span>{tr('Conserver aujourd’hui. Transmettre demain.')}</span></div></div>
                <div className="intro-watermark" aria-hidden="true"><Icon name="archive" size={230} /></div>
            </section>
            <section className="gov-login-access" aria-labelledby="access-title">
                <div className="access-location"><Icon name="building" size={17} /><span>{tr('ESPACE PROFESSIONNEL')}</span><span className="access-location-line" /></div>
                <div className="gov-login-card">
                    <div className="access-card-top"><span className="access-icon"><Icon name="lock" size={23} /></span><span className="access-classification">{tr('Accès réservé aux utilisateurs habilités')}</span></div>
                    <h2 id="access-title">{tr('Connexion à votre espace')}</h2>
                    <p className="access-description">{tr('Retrouvez les services et les informations autorisés dans votre périmètre.')}</p>
                    {session.demo ? <div className="gov-demo-access">
                        <div className="demo-access-note"><Icon name="info" size={19} /><div><strong>Environnement de démonstration</strong><p>Explorez l’interface avec des identités fictives. Aucun document ni service de l’État n’est consulté.</p></div></div>
                        <button className="btn primary full" onClick={signIn} disabled={session.busy}>{tr(session.busy ? 'Ouverture…' : 'Ouvrir la démonstration')}<Icon name="arrow" size={19} /></button>
                        <small className="access-demo-caption">Les essais restent dans cet onglet et s’effacent à sa fermeture ou après réinitialisation.</small>
                    </div> : config.authMode === 'supabase' ? <form onSubmit={submit} className="gov-credentials">
                        <label className="field"><span>Adresse e-mail professionnelle</span><div className="input-icon"><Icon name="mail" size={19} /><input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} placeholder="prenom.nom@institution.gn" disabled={session.busy || !!issue} /></div></label>
                        <label className="field"><span>Mot de passe</span><div className="input-icon"><Icon name="lock" size={19} /><input type={show ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Saisissez votre mot de passe" disabled={session.busy || !!issue} /><button type="button" className="icon-btn" onClick={() => setShow(v => !v)} aria-pressed={show} aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}><Icon name="eye" size={18} /></button></div></label>
                        <button type="button" className="credential-help" onClick={() => setHelp(true)} aria-controls="login-assistance">Un problème de connexion ?</button>
                        <button className="btn primary full" disabled={session.busy || !!issue}>{session.busy ? 'Connexion en cours…' : 'Se connecter'}<Icon name="arrow" size={19} /></button>
                    </form> : <div className="gov-sso-access"><button className="btn primary full" disabled={session.busy || !!issue} onClick={signIn}><Icon name="building" size={20} />{session.busy ? 'Redirection…' : 'Connexion institutionnelle'}<Icon name="arrow" size={19} /></button><p>Vous serez redirigé vers votre fournisseur d’identité.</p></div>}
                    {issue && <div className="notice warning"><Icon name="info" /><p>{issue}</p></div>}
                    {Boolean(session.error) && <ErrorNotice error={session.error} />}
                    <div className="access-security"><Icon name="shield" size={20} /><p>{tr('Utilisez votre compte nominatif. Ne partagez jamais vos identifiants ni votre mot de passe.')}</p></div>
                </div>
                <div className="access-assistance"><Icon name="help" size={20} /><div><strong>Besoin d’un accès ?</strong><span>Adressez-vous à l’administrateur de votre institution.</span></div>{contact
                    ? <a className="text-link" href={mailto}><Icon name="mail" size={16} />{contact}</a>
                    : <button className="text-link" onClick={() => setHelp(v => !v)} aria-expanded={help} aria-controls="login-assistance">En savoir plus<Icon name="arrow" size={16} /></button>}</div>
                {help && <div id="login-assistance" className="access-help" role="region" aria-label="Assistance à la connexion"><h3>Votre administrateur vous accompagne</h3><p>La création du compte et la récupération du mot de passe relèvent de votre fournisseur d’identité. Ce portail ne crée pas de mot de passe local. La fermeture de l’onglet n’assure pas la déconnexion du fournisseur SSO.</p>{contact && <p>{tr('Pour une demande d’accès ou en cas de problème de connexion, écrivez à l’adresse suivante :')} <a href={mailto}>{contact}</a></p>}<button className="text-link" onClick={() => setHelp(false)}>Fermer l’aide</button></div>}
                <p className="login-proposal">Proposition d’interface institutionnelle · Environnement de recette</p>
            </section>
        </main>
        <footer className="gov-login-footer"><span>SNAE-PPD · Archives et patrimoine documentaire</span><span>Travail · Justice · Solidarité<span className="footer-dot">•</span>Interface française</span></footer>
    </div>;
}
