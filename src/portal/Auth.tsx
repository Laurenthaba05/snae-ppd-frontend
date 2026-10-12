import React, { useEffect, useRef, useState } from 'react';
import { ApiError } from '../core/http';
import { navigate, usePath } from '../ui/navigation';
import { ErrorNotice, Field, Notice } from '../ui/components';
import { emailProblem, emptyRegistration, passwordProblems, portalPath, registrationBody, registrationProblems, safeReturnPath } from '../core/portal';
import type { PortalCategory, RegistrationForm } from '../core/types';
import { usePortal } from './context';
import { PLink } from './Shell';

const useSearch = () => new URL(usePath(), location.origin).searchParams;

/** Envoi d'un formulaire : un seul envoi à la fois, l'erreur du serveur est montrée telle quelle. */
function useSubmit() {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const running = useRef(false);
    const run = async (action: () => Promise<void>) => {
        if (running.current) return;
        running.current = true; setBusy(true); setError(null);
        try { await action(); } catch (e) { setError(e); } finally { running.current = false; setBusy(false); }
    };
    return { busy, error, run, setError };
}

export function LoginPage() {
    const { api, signedIn, reader } = usePortal();
    const target = safeReturnPath(useSearch().get('retour'));
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [show, setShow] = useState(false);
    const [resent, setResent] = useState<string | null>(null);
    const form = useSubmit();
    useEffect(() => { if (reader) navigate(target); }, [!!reader]);
    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        void form.run(async () => {
            try { const me = await api.login(email.trim(), password); setPassword(''); await signedIn(me); navigate(target); }
            catch (e) { setPassword(''); throw e; }
        });
    };
    const resend = () => void form.run(async () => { setResent((await api.resendVerification(email.trim())).message); });
    const notVerified = form.error instanceof ApiError && form.error.code === 'PORTAL_EMAIL_NOT_VERIFIED';
    return <div className="portal-page portal-narrow">
        <h1>Se connecter</h1>
        <form className="portal-form" onSubmit={submit} noValidate>
            <Field label="Adresse électronique"><input type="email" autoComplete="username" required value={email} maxLength={254} onChange={e => setEmail(e.target.value)} /></Field>
            <Field label="Mot de passe"><span className="portal-password"><input type={show ? 'text' : 'password'} autoComplete="current-password" required value={password} maxLength={200} onChange={e => setPassword(e.target.value)} />
                <button type="button" className="btn small secondary" aria-pressed={show} onClick={() => setShow(v => !v)}>{show ? 'Masquer' : 'Afficher'}</button></span></Field>
            {form.error !== null && <ErrorNotice error={form.error} />}
            {notVerified && <p><button type="button" className="text-link" disabled={form.busy || !!emailProblem(email)} onClick={resend}>Renvoyer le courrier de confirmation</button></p>}
            {resent && <Notice>{resent}</Notice>}
            <button className="btn primary" disabled={form.busy || !email.trim() || !password}>{form.busy ? 'Connexion…' : 'Se connecter'}</button>
        </form>
        <p className="portal-links"><PLink to="/mot-de-passe-oublie">Mot de passe oublié</PLink> · <PLink to="/inscription">Créer un compte</PLink></p>
    </div>;
}

export function RegisterPage() {
    const { api, reader } = usePortal();
    const [form, setForm] = useState<RegistrationForm>(emptyRegistration());
    const [categories, setCategories] = useState<PortalCategory[]>([]);
    const [terms, setTerms] = useState<string | null>(null);
    const [done, setDone] = useState<string | null>(null);
    const [touched, setTouched] = useState(false);
    const submit = useSubmit();
    useEffect(() => {
        const controller = new AbortController();
        api.readerCategories(controller.signal).then(setCategories).catch(() => { /* Sans catégories, le champ reste simplement absent. */ });
        api.termsVersion(controller.signal).then(t => setTerms(t.version)).catch(() => { });
        return () => controller.abort();
    }, []);
    useEffect(() => { if (reader) navigate(portalPath('/compte')); }, [!!reader]);
    const set = <K extends keyof RegistrationForm>(key: K, value: RegistrationForm[K]) => setForm(f => ({ ...f, [key]: value }));
    const problems = registrationProblems(form);
    const send = (event: React.FormEvent) => {
        event.preventDefault();
        setTouched(true);
        if (problems.length) return;
        void submit.run(async () => { const result = await api.register(registrationBody(form)); setForm(f => ({ ...f, motDePasse: '' })); setDone(result.message); });
    };
    if (done) return <div className="portal-page portal-narrow"><h1>Vérifiez votre courrier</h1><Notice>{done}</Notice><p>Le courrier contient un lien de confirmation. Une fois l’adresse confirmée, vous pourrez vous connecter.</p><p><PLink to="/connexion" className="btn primary">Aller à la connexion</PLink></p></div>;
    const passwordIssues = form.motDePasse ? passwordProblems(form.motDePasse, form.email) : [];
    return <div className="portal-page portal-narrow">
        <h1>Créer un compte lecteur</h1>
        <p className="portal-lead">Le compte sert à lire les documents et à suivre vos abonnements. Il est distinct des comptes des agents de l’institution.</p>
        <form className="portal-form" onSubmit={send} noValidate>
            <Field label="Adresse électronique" error={touched ? (emailProblem(form.email) ?? undefined) : undefined}><input type="email" autoComplete="email" required value={form.email} maxLength={254} onChange={e => set('email', e.target.value)} /></Field>
            <div className="portal-two">
                <Field label="Prénom" error={touched && !form.prenom.trim() ? 'Le prénom est obligatoire.' : undefined}><input autoComplete="given-name" required value={form.prenom} maxLength={100} onChange={e => set('prenom', e.target.value)} /></Field>
                <Field label="Nom" error={touched && !form.nom.trim() ? 'Le nom est obligatoire.' : undefined}><input autoComplete="family-name" required value={form.nom} maxLength={100} onChange={e => set('nom', e.target.value)} /></Field>
            </div>
            <Field label="Organisme (facultatif)"><input autoComplete="organization" value={form.organisme} maxLength={200} onChange={e => set('organisme', e.target.value)} /></Field>
            {categories.length > 0 && <Field label="Vous êtes (facultatif)"><select value={form.categorie} onChange={e => set('categorie', e.target.value)}><option value="">—</option>{categories.map(c => <option key={c.code} value={c.code}>{c.libelle}</option>)}</select></Field>}
            <Field label="Mot de passe" hint="10 caractères au moins, avec trois sortes parmi : minuscules, majuscules, chiffres, signes.">
                <input type="password" autoComplete="new-password" required value={form.motDePasse} maxLength={200} onChange={e => set('motDePasse', e.target.value)} aria-describedby="password-issues" /></Field>
            <ul id="password-issues" className="portal-issues" aria-live="polite">{passwordIssues.map(p => <li key={p}>{p}</li>)}</ul>
            <label className="portal-check"><input type="checkbox" checked={form.accepteConditions} onChange={e => set('accepteConditions', e.target.checked)} /><span>J’ai pris connaissance des conditions d’utilisation du portail{terms ? ` (version ${terms})` : ''} et je les accepte.</span></label>
            {touched && !form.accepteConditions && <small className="field-error">Les conditions d’utilisation doivent être acceptées.</small>}
            {submit.error !== null && <ErrorNotice error={submit.error} />}
            <button className="btn primary" disabled={submit.busy}>{submit.busy ? 'Envoi…' : 'Créer mon compte'}</button>
        </form>
        <p className="portal-links">Déjà inscrit ? <PLink to="/connexion">Se connecter</PLink></p>
    </div>;
}

export function VerifyEmailPage() {
    const { api } = usePortal();
    const token = useSearch().get('jeton') ?? '';
    const [done, setDone] = useState<string | null>(null);
    const submit = useSubmit();
    if (!token) return <div className="portal-page portal-narrow"><h1>Confirmer mon adresse</h1><Notice tone="warning">Le lien est incomplet. Ouvrez-le depuis le courrier reçu, ou demandez un nouveau courrier depuis la page de connexion.</Notice></div>;
    return <div className="portal-page portal-narrow">
        <h1>Confirmer mon adresse</h1>
        {done
            ? <><Notice>{done}</Notice><p><PLink to="/connexion" className="btn primary">Se connecter</PLink></p></>
            : <><p>Confirmez que cette adresse est bien la vôtre pour activer votre compte.</p>
                {submit.error !== null && <ErrorNotice error={submit.error} />}
                <button className="btn primary" disabled={submit.busy} onClick={() => void submit.run(async () => { setDone((await api.verifyEmail(token)).message); })}>{submit.busy ? 'Confirmation…' : 'Confirmer mon adresse'}</button></>}
    </div>;
}

export function ForgotPasswordPage() {
    const { api } = usePortal();
    const [email, setEmail] = useState('');
    const [done, setDone] = useState<string | null>(null);
    const submit = useSubmit();
    return <div className="portal-page portal-narrow">
        <h1>Mot de passe oublié</h1>
        {done ? <Notice>{done}</Notice> : <form className="portal-form" onSubmit={event => { event.preventDefault(); void submit.run(async () => { setDone((await api.forgotPassword(email.trim())).message); }); }} noValidate>
            <p>Indiquez l’adresse de votre compte : si elle existe, un lien pour choisir un nouveau mot de passe y sera envoyé.</p>
            <Field label="Adresse électronique"><input type="email" autoComplete="username" required value={email} maxLength={254} onChange={e => setEmail(e.target.value)} /></Field>
            {submit.error !== null && <ErrorNotice error={submit.error} />}
            <button className="btn primary" disabled={submit.busy || !!emailProblem(email)}>{submit.busy ? 'Envoi…' : 'Envoyer le lien'}</button>
        </form>}
        <p className="portal-links"><PLink to="/connexion">Retour à la connexion</PLink></p>
    </div>;
}

export function ResetPasswordPage() {
    const { api } = usePortal();
    const token = useSearch().get('jeton') ?? '';
    const [password, setPassword] = useState('');
    const [done, setDone] = useState<string | null>(null);
    const submit = useSubmit();
    if (!token) return <div className="portal-page portal-narrow"><h1>Nouveau mot de passe</h1><Notice tone="warning">Le lien est incomplet. Ouvrez-le depuis le courrier reçu, ou demandez un nouveau lien.</Notice><p><PLink to="/mot-de-passe-oublie">Demander un nouveau lien</PLink></p></div>;
    const issues = password ? passwordProblems(password, '') : [];
    return <div className="portal-page portal-narrow">
        <h1>Nouveau mot de passe</h1>
        {done ? <><Notice>{done}</Notice><p><PLink to="/connexion" className="btn primary">Se connecter</PLink></p></>
            : <form className="portal-form" onSubmit={event => { event.preventDefault(); void submit.run(async () => { const result = await api.resetPassword(token, password); setPassword(''); setDone(result.message); }); }} noValidate>
                <Field label="Nouveau mot de passe" hint="10 caractères au moins, avec trois sortes parmi : minuscules, majuscules, chiffres, signes."><input type="password" autoComplete="new-password" required value={password} maxLength={200} onChange={e => setPassword(e.target.value)} /></Field>
                <ul className="portal-issues" aria-live="polite">{issues.map(p => <li key={p}>{p}</li>)}</ul>
                {submit.error !== null && <ErrorNotice error={submit.error} />}
                <button className="btn primary" disabled={submit.busy || !password || issues.length > 0}>{submit.busy ? 'Enregistrement…' : 'Enregistrer'}</button>
            </form>}
    </div>;
}


