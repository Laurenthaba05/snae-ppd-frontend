import React, { useEffect, useRef, useState } from 'react';
import { ApiError } from '../core/http';
import { navigate } from '../ui/navigation';
import { Busy, Empty, ErrorNotice, Notice } from '../ui/components';
import { durationText, formatAmount, portalPath } from '../core/portal';
import { display } from '../core/format';
import type { PublicPlan } from '../core/types';
import { usePortal } from './context';
import { PLink } from './Shell';

/** Les formules d'abonnement publiées par l'institution, avec ce que le lecteur doit faire ensuite. */
export function PlansPage() {
    const { api, reader, access, subscriptions, reload, expired } = usePortal();
    const [plans, setPlans] = useState<PublicPlan[] | null>(null);
    const [error, setError] = useState<unknown>(null);
    const [attempt, setAttempt] = useState(0);
    const [categories, setCategories] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState<string | null>(null);
    const [actionError, setActionError] = useState<unknown>(null);
    const pending = useRef(false);
    useEffect(() => {
        const controller = new AbortController();
        setError(null);
        api.plans(controller.signal).then(setPlans).catch(e => { if (!controller.signal.aborted) setError(e); });
        return () => controller.abort();
    }, [attempt]);
    // Une formule réservée à une catégorie la nomme par son libellé ; si la liste manque, le code est rendu lisible.
    useEffect(() => {
        const controller = new AbortController();
        void Promise.resolve().then(() => api.readerCategories(controller.signal)).then(list => { if (!controller.signal.aborted) setCategories(Object.fromEntries(list.map(c => [c.code, c.libelle]))); }).catch(() => undefined);
        return () => controller.abort();
    }, []);
    const request = async (plan: PublicPlan) => {
        if (pending.current) return;
        pending.current = true; setBusy(plan.id); setActionError(null);
        try { await api.subscribe(plan.id); await reload(); navigate(portalPath('/compte')); }
        catch (e) { if (!expired(e)) setActionError(e); if (e instanceof ApiError && e.status === 401) navigate(portalPath('/connexion', { retour: portalPath('/formules') })); }
        finally { pending.current = false; setBusy(null); }
    };
    const waiting = subscriptions.some(s => s.etat === 'EN_ATTENTE_PAIEMENT');
    return <div className="portal-page">
        <h1>Abonnements</h1>
        <p className="portal-lead">Un abonnement donne accès, pour sa durée, à la lecture des documents communicables au public. Le catalogue reste ouvert à tous. Le premier paiement se fait au guichet de l’institution ou par virement ; un agent habilité l’enregistre et l’abonnement démarre aussitôt.</p>
        {access === 'ABONNE' && <Notice>Vous avez un abonnement en cours. Une nouvelle formule choisie ici démarrera à la fin de l’abonnement actuel.</Notice>}
        {waiting && <Notice tone="warning">Votre demande précédente attend encore son règlement. <PLink to="/compte">Voir la référence à donner</PLink></Notice>}
        {error !== null && <ErrorNotice error={error} onRetry={() => setAttempt(n => n + 1)} />}
        {actionError !== null && <ErrorNotice error={actionError} />}
        {plans === null && error === null && <Busy label="Chargement des formules…" />}
        {plans !== null && (plans.length === 0
            ? <Empty title="Aucune formule publiée" description="L’institution n’a pas encore publié ses formules d’abonnement. Revenez plus tard." icon="document" />
            : <ul className="portal-plans">{plans.map(plan => <li key={plan.id}><article>
                <h2>{plan.libelle}</h2>
                <p className="portal-price">{plan.montant === 0 ? 'Sur exonération' : formatAmount(plan.montant, plan.devise)}<small> pour {durationText(plan.dureeMois)}</small></p>
                {plan.description && <p>{plan.description}</p>}
                <ul className="portal-plan-facts">
                    <li>Lecture des documents communicables, pendant {durationText(plan.dureeMois)}</li>
                    <li>{plan.telechargement ? 'Téléchargement prévu par la formule' : 'Lecture à l’écran, pages marquées à votre nom'}</li>
                    {plan.categorie && <li>Réservée à la catégorie « {categories[plan.categorie] ?? display(plan.categorie)} »</li>}
                </ul>
                {reader
                    ? <button className="btn primary" disabled={busy !== null || waiting} onClick={() => void request(plan)}>{busy === plan.id ? 'Envoi…' : 'Demander cet abonnement'}</button>
                    : <PLink to="/connexion" params={{ retour: portalPath('/formules') }} className="btn secondary">Se connecter pour demander</PLink>}
                {plan.montant === 0 && <small className="portal-muted">Formule accordée sur décision de l’institution : un agent examine votre demande et l’ouvre s’il l’accepte.</small>}
            </article></li>)}</ul>)}
    </div>;
}
