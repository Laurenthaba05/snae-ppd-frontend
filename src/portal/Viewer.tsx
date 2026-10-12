import React, { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../core/http';
import { navigate, usePath } from '../ui/navigation';
import { Busy, ErrorNotice } from '../ui/components';
import { findView, pageUrl, parseViewValue, portalPath, readingViews, viewLabel, viewValue } from '../core/portal';
import type { PortalReadablePage } from '../core/types';
import { usePortal } from './context';
import { PLink, RequireReader } from './Shell';

type Gate = { state: 'loading' } | { state: 'ready'; pages: PortalReadablePage[] } | { state: 'blocked'; error: ApiError } | { state: 'error'; error: unknown };

/**
 * La lecture d'un document, page après page (et image après image pour une page de plusieurs images). Les images viennent du serveur, déjà marquées au nom du lecteur : aucune copie sans marque n'existe côté
 * navigateur. On ne charge que la page affichée (chaque page lue est comptée et limitée par heure), sans bandeau de vignettes ni préchargement.
 */
function Reading({ documentId }: { documentId: string }) {
    const { api, expired } = usePortal();
    const path = usePath();
    const [gate, setGate] = useState<Gate>({ state: 'loading' });
    const [attempt, setAttempt] = useState(0);
    const [imageFailed, setImageFailed] = useState(false);
    const [imageLoaded, setImageLoaded] = useState(false);
    useEffect(() => {
        const controller = new AbortController();
        setGate({ state: 'loading' });
        api.pages(documentId, controller.signal).then(pages => { if (!controller.signal.aborted) setGate({ state: 'ready', pages }); }).catch(error => {
            if (controller.signal.aborted) return;
            if (expired(error)) return;
            setGate(error instanceof ApiError && [402, 404, 429].includes(error.status) ? { state: 'blocked', error } : { state: 'error', error });
        });
        return () => controller.abort();
    }, [documentId, attempt]);
    const views = useMemo(() => gate.state === 'ready' ? readingViews(gate.pages) : [], [gate]);
    const total = views.length;
    const params = new URL(path, location.origin).searchParams;
    const index = findView(views, Number(params.get('page')), Number(params.get('image') ?? 1) || 1);
    const view = views[index];
    const current = view?.page ?? 1;
    const goto = (target: { page: number; image: number } | undefined) => { if (target) navigate(portalPath('/lecture/' + documentId, { page: target.page, image: target.image > 1 ? target.image : null })); };
    useEffect(() => { setImageFailed(false); setImageLoaded(false); }, [documentId, current, view?.image]);
    useEffect(() => {
        if (gate.state !== 'ready') return;
        const onKey = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
            if (event.key === 'ArrowRight' && index < views.length - 1) goto(views[index + 1]);
            if (event.key === 'ArrowLeft' && index > 0) goto(views[index - 1]);
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    });

    if (gate.state === 'loading') return <div className="portal-page"><Busy label="Ouverture du document…" /></div>;
    if (gate.state === 'error') return <div className="portal-page"><ErrorNotice error={gate.error} onRetry={() => setAttempt(n => n + 1)} /></div>;
    if (gate.state === 'blocked') {
        const { status, message } = gate.error;
        return <div className="portal-page"><div className="portal-gate" role="alert">
            <h1>{status === 402 ? 'Un abonnement en cours est nécessaire' : status === 429 ? 'Limite de lecture atteinte' : 'Document indisponible'}</h1>
            <p>{message}</p>
            {status === 404 && <p className="portal-muted">Si ce document se lit sur demande, vérifiez que votre accès est encore valable dans <PLink to="/compte">votre compte</PLink>.</p>}
            <p>{status === 402 ? <PLink to="/formules" className="btn primary">Voir les abonnements</PLink> : <PLink to="" className="btn secondary">Retour au catalogue</PLink>}</p>
        </div></div>;
    }
    if (!view) return <div className="portal-page"><div className="portal-gate"><h1>Aucune page à lire</h1><p>Ce document n’a pas de page communicable pour le moment.</p><PLink to="" className="btn secondary">Retour au catalogue</PLink></div></div>;
    return <div className="portal-page portal-viewer">
        <div className="portal-viewer-bar">
            <button className="btn small secondary" onClick={() => history.length > 1 ? history.back() : navigate(portalPath(''))}>← Retour</button>
            <div className="portal-viewer-nav" role="group" aria-label="Pages du document">
                <button className="btn small secondary" disabled={index === 0} onClick={() => goto(views[index - 1])} aria-label="Page précédente">‹</button>
                <label><span className="sr-only">Aller à la page</span><select value={viewValue(view)} onChange={event => goto(parseViewValue(event.target.value) ?? undefined)}>{views.map(v => <option key={viewValue(v)} value={viewValue(v)}>{viewLabel(v)}</option>)}</select></label>
                <span aria-live="polite">sur {total}</span>
                <button className="btn small secondary" disabled={index >= total - 1} onClick={() => goto(views[index + 1])} aria-label="Page suivante">›</button>
            </div>
        </div>
        <figure className="portal-sheet">
            {!imageLoaded && !imageFailed && <Busy label={`Chargement de la page ${current}${view.images > 1 ? ', image ' + view.image : ''}…`} />}
            {imageFailed
                ? <div className="portal-gate" role="alert"><p>La page n’a pas pu être chargée. Vous avez peut-être atteint la limite de lecture par heure, ou votre session a pris fin.</p><button className="btn small secondary" onClick={() => { setImageFailed(false); setAttempt(n => n + 1); }}>Réessayer</button></div>
                : <img key={documentId + ':' + viewValue(view)} src={pageUrl(documentId, current, false, view.image)} alt={view.images > 1 ? `Page ${current}, image ${view.image} sur ${view.images}` : `Page ${current} sur ${total}`} draggable={false} className={imageLoaded ? 'loaded' : ''}
                    onLoad={() => setImageLoaded(true)} onError={() => setImageFailed(true)} onContextMenu={event => event.preventDefault()} />}
            <figcaption>Cette page porte votre numéro de lecteur ; chaque page lue est tracée. La reproduction est soumise aux conditions d’utilisation de l’institution.</figcaption>
        </figure>
    </div>;
}

export function ViewerPage({ documentId }: { documentId: string }) {
    return <RequireReader><Reading documentId={documentId} /></RequireReader>;
}
