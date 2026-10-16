import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { Busy, ErrorNotice, useResource } from './components';
import {
    baseRequest, baseSide, clampView, detailWidth, fitView, fitZoom, identifier, matchWords, needsDetail, panBy, parseOcrPage, regionRequest, visibleRegion, zoomAt, zoomText,
    type OcrWord, type Rect, type Size, type View
} from '../core/iiifViewer';

const KEY_STEP = 80;

/**
 * Visionneuse d'une copie de consultation par l'API d'images IIIF : l'image entière (réduite) s'affiche d'abord, puis la zone visible est redemandée au serveur en plus fine
 * résolution quand on zoome. Glisser pour déplacer, molette ou boutons pour zoomer ; le texte reconnu, s'il existe, se cherche et se surligne. Les octets passent par l'API avec
 * les droits de la personne (jamais d'adresse publique).
 */
export function IiifZoomViewer({ fileId, frame, alt, onUnavailable }: { fileId: string; frame: number; alt: string; onUnavailable?: () => void }) {
    const { records, epoch } = useSession();
    const info = useResource<Size>(signal => records!.iiifInfo(fileId, frame, signal), 'iiif-info:' + fileId + ':' + frame + ':' + epoch);
    useEffect(() => { if (info.error) onUnavailable?.(); }, [info.error, onUnavailable]);
    if (info.loading && !info.data) return <Busy label="Ouverture de la visionneuse…" />;
    if (info.error || !info.data) return null;
    return <ZoomCanvas key={fileId + ':' + frame} fileId={fileId} frame={frame} image={info.data} alt={alt} />;
}

function ZoomCanvas({ fileId, frame, image, alt }: { fileId: string; frame: number; image: Size; alt: string }) {
    const { records, epoch } = useSession();
    const id = identifier(fileId, frame);
    const base = useResource<Blob>(signal => { const r = baseRequest(baseSide(image)); return records!.iiifImage(id, r.region, r.size, signal); }, 'iiif-base:' + id + ':' + epoch);
    const [baseUrl, setBaseUrl] = useState('');
    const [detail, setDetail] = useState<{ region: Rect; url: string } | null>(null);
    const boxRef = useRef<HTMLDivElement>(null);
    const [box, setBox] = useState<Size>({ width: 800, height: 560 });
    const touched = useRef(false);
    const [view, setView] = useState<View>(() => fitView(image, { width: 800, height: 560 }));
    const drag = useRef<{ x: number; y: number } | null>(null);
    const [query, setQuery] = useState('');
    const [words, setWords] = useState<OcrWord[] | null>(null);
    const [wordsError, setWordsError] = useState(false);

    // l'image de base devient une adresse locale, libérée avec la visionneuse
    useEffect(() => {
        if (!base.data) return;
        const url = URL.createObjectURL(base.data);
        setBaseUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [base.data]);

    // la taille de la fenêtre ; tant que la personne n'a rien touché, l'image reste ajustée
    useEffect(() => {
        const node = boxRef.current;
        if (!node) return;
        const measure = () => {
            const r = node.getBoundingClientRect();
            if (r.width < 10 || r.height < 10) return;
            const next = { width: r.width, height: r.height };
            setBox(prev => prev.width === next.width && prev.height === next.height ? prev : next);
        };
        measure();
        if (typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(measure);
        observer.observe(node);
        return () => observer.disconnect();
    }, []);
    useEffect(() => { setView(current => touched.current ? clampView(current, image, box) : fitView(image, box)); }, [box, image]);

    // la zone visible, redemandée en détail quand l'image de base ne suffit plus
    useEffect(() => {
        if (!needsDetail(view, image)) { setDetail(null); return; }
        const region = visibleRegion(view, image, box);
        const width = detailWidth(region, view.zoom, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1);
        const controller = new AbortController();
        const request = regionRequest(region, width);
        const timer = setTimeout(() => {
            records!.iiifImage(id, request.region, request.size, controller.signal).then(blob => {
                if (controller.signal.aborted) return;
                const url = URL.createObjectURL(blob);
                setDetail(previous => { if (previous) URL.revokeObjectURL(previous.url); return { region, url }; });
            }).catch(() => undefined);
        }, 250);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [view, box, image, id, records]);
    useEffect(() => () => { setDetail(previous => { if (previous) URL.revokeObjectURL(previous.url); return null; }); }, []);

    const apply = useCallback((next: View) => { touched.current = true; setView(next); }, []);
    const fit = fitZoom(image, box);

    // molette : zoom autour du curseur (écouteur natif, pour pouvoir empêcher le défilement de la page)
    useEffect(() => {
        const node = boxRef.current;
        if (!node) return;
        const onWheel = (event: WheelEvent) => {
            event.preventDefault();
            const rect = node.getBoundingClientRect();
            const factor = event.deltaY < 0 ? 1.25 : 0.8;
            touched.current = true;
            setView(current => zoomAt(current, factor, { x: event.clientX - rect.left, y: event.clientY - rect.top }, image, box));
        };
        node.addEventListener('wheel', onWheel, { passive: false });
        return () => node.removeEventListener('wheel', onWheel);
    }, [image, box]);

    const loadWords = async () => {
        if (words !== null || wordsError) return;
        try { setWords(parseOcrPage(await records!.iiifOcr(fileId, frame))); } catch { setWordsError(true); }
    };
    const highlighted = useMemo(() => (words && query.trim() ? matchWords(words, query) : []), [words, query]);

    const tx = box.width / 2 - view.cx * view.zoom;
    const ty = box.height / 2 - view.cy * view.zoom;
    const zoomBy = (factor: number) => apply(zoomAt(view, factor, { x: box.width / 2, y: box.height / 2 }, image, box));

    return <div className="iiif-viewer-wrap">
        <div className="iiif-toolbar" role="group" aria-label="Zoom de l’image">
            <button type="button" className="btn small secondary" onClick={() => zoomBy(0.8)} aria-label="Réduire">−</button>
            <button type="button" className="btn small secondary" onClick={() => zoomBy(1.25)} aria-label="Agrandir">+</button>
            <button type="button" className="btn small secondary" onClick={() => apply(fitView(image, box))}>Ajuster</button>
            <button type="button" className="btn small secondary" onClick={() => apply(clampView({ zoom: 1, cx: view.cx, cy: view.cy }, image, box))}>Taille réelle</button>
            <span className="iiif-zoom" aria-live="polite">{zoomText(view, fit)}</span>
            <label className="iiif-search"><span>Texte reconnu</span>
                <input type="search" value={query} placeholder="Chercher un mot" onFocus={() => void loadWords()} onChange={e => { setQuery(e.target.value); void loadWords(); }} /></label>
        </div>
        {query.trim() && words !== null && <small className="iiif-hint" aria-live="polite">
            {words.length === 0 ? 'Aucun texte reconnu pour cette image.' : highlighted.length === 0 ? 'Aucun mot ne correspond.' : `${highlighted.length} mot${highlighted.length > 1 ? 's' : ''} surligné${highlighted.length > 1 ? 's' : ''}.`}</small>}
        {wordsError && <small className="iiif-hint">Le texte reconnu n’est pas disponible pour cette image.</small>}
        <div ref={boxRef} className="iiif-viewer" tabIndex={0} role="group" aria-label={`Visionneuse : ${alt}. Glisser pour déplacer, molette ou boutons pour zoomer.`}
            onPointerDown={e => { drag.current = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture?.(e.pointerId); }}
            onPointerMove={e => {
                const start = drag.current;
                if (!start) return;
                const dx = e.clientX - start.x, dy = e.clientY - start.y;
                drag.current = { x: e.clientX, y: e.clientY };
                setView(current => { touched.current = true; return panBy(current, dx, dy, image, box); });
            }}
            onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
            onKeyDown={e => {
                const keys: Record<string, () => void> = {
                    ArrowLeft: () => apply(panBy(view, KEY_STEP, 0, image, box)), ArrowRight: () => apply(panBy(view, -KEY_STEP, 0, image, box)),
                    ArrowUp: () => apply(panBy(view, 0, KEY_STEP, image, box)), ArrowDown: () => apply(panBy(view, 0, -KEY_STEP, image, box)),
                    '+': () => zoomBy(1.25), '=': () => zoomBy(1.25), '-': () => zoomBy(0.8), '0': () => apply(fitView(image, box))
                };
                const action = keys[e.key];
                if (action) { e.preventDefault(); action(); }
            }}>
            <div className="iiif-world" style={{ transform: `translate(${tx}px, ${ty}px) scale(${view.zoom})`, width: image.width, height: image.height }}>
                {baseUrl ? <img src={baseUrl} alt={alt} draggable={false} style={{ left: 0, top: 0, width: image.width, height: image.height }} />
                    : base.error ? null : <span className="iiif-wait"><Busy label="Récupération de l’image…" /></span>}
                {detail && <img className="iiif-detail" src={detail.url} alt="" aria-hidden="true" draggable={false}
                    style={{ left: detail.region.x, top: detail.region.y, width: detail.region.width, height: detail.region.height }} />}
                {highlighted.map((w, i) => <span key={i} className="iiif-word" title={w.text} style={{ left: w.x, top: w.y, width: w.width, height: w.height }} />)}
            </div>
        </div>
        {base.error ? <ErrorNotice error={base.error} onRetry={base.refresh} /> : null}
    </div>;
}
