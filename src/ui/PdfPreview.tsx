import React, { useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Busy, ErrorNotice, Notice } from './components';
import { OcrWordOverlay, layoutFitsPage, type WordOverlay } from './OcrWordOverlay';

GlobalWorkerOptions.workerSrc = workerUrl;
const assets = import.meta.env.BASE_URL + 'pdfjs/';

export default function PdfPreview({ blob, overlay, onPageChange }: { blob: Blob; overlay?: WordOverlay; onPageChange?: (page: number) => void }) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
    const [page, setPage] = useState(1);
    const [size, setSize] = useState({ width: 0, height: 0 });
    useEffect(() => { onPageChange?.(page); }, [page, onPageChange]);
    const [zoom, setZoom] = useState(1);
    const [busy, setBusy] = useState(true);
    const [pageText, setPageText] = useState('');
    const [error, setError] = useState<unknown>(null);
    useEffect(() => {
        let active = true;
        let task: ReturnType<typeof getDocument> | undefined;
        setPdf(null); setPage(1); setError(null); setBusy(true);
        blob.arrayBuffer().then(data => {
            if (!active) return;
            // Only render pages to canvas; no document scripts, interactive forms or links.
            task = getDocument({ data, enableXfa: false, stopAtErrors: true,
                cMapUrl: assets + 'cmaps/', standardFontDataUrl: assets + 'standard_fonts/', wasmUrl: assets + 'wasm/', iccUrl: assets + 'iccs/' });
            return task.promise;
        }).then(document => { if (active && document) setPdf(document); }).catch(() => {
            if (active) { setBusy(false); setError(new Error('Ce PDF ne peut pas être affiché. Il peut être endommagé ou protégé par un mot de passe. Vous pouvez télécharger l’original.')); }
        });
        return () => { active = false; void task?.destroy().catch(() => {}); };
    }, [blob]);
    useEffect(() => {
        if (!pdf) return;
        let active = true;
        let render: RenderTask | undefined;
        setBusy(true); setError(null); setPageText('');
        pdf.getPage(page).then(current => {
            if (!active || !canvas.current) return;
            const original = current.getViewport({ scale: 1 });
            const scale = Math.min(1.5 * zoom, 4096 / Math.max(original.width, original.height));
            const viewport = current.getViewport({ scale });
            canvas.current.width = Math.ceil(viewport.width);
            canvas.current.height = Math.ceil(viewport.height);
            setSize({ width: canvas.current.width, height: canvas.current.height });
            render = current.render({ canvas: canvas.current, viewport });
            void current.getTextContent().then(content => {
                if (active) setPageText(content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join(''));
            }).catch(() => {});
            return render.promise;
        }).then(() => { if (active) setBusy(false); }).catch(() => {
            if (active) { setBusy(false); setError(new Error('Cette page ne peut pas être affichée. Vous pouvez essayer une autre page ou télécharger l’original.')); }
        });
        return () => { active = false; render?.cancel(); };
    }, [pdf, page, zoom]);
    const currentOverlay = overlay && (overlay.layout.pageNumber ?? 1) === page ? overlay : undefined;
    const fits = currentOverlay && layoutFitsPage(currentOverlay.layout, size.width, size.height);
    return <div className="pdf-reader">
        {pdf && <div className="pdf-toolbar"><button className="btn small secondary" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Page précédente</button><span aria-live="polite">Page {page} sur {pdf.numPages}</span><button className="btn small secondary" disabled={page >= pdf.numPages} onClick={() => setPage(value => value + 1)}>Page suivante</button><label>Zoom <select value={zoom} onChange={event => setZoom(Number(event.target.value))}><option value={0.75}>75 %</option><option value={1}>100 %</option><option value={1.5}>150 %</option><option value={2}>200 %</option></select></label></div>}
        {busy && <Busy label="Affichage de la page…"/>}{Boolean(error) && <ErrorNotice error={error}/>}
        <div className="pdf-canvas-wrap" hidden={busy || Boolean(error)}><div className="pdf-page-surface" style={{ width: size.width || undefined, height: size.height || undefined }}><canvas ref={canvas} role="img" aria-label={'Page ' + page + ' du document PDF'}/>{!busy && !error && fits && <OcrWordOverlay {...currentOverlay!}/>}</div></div>
        {!busy && currentOverlay && !fits && <Notice tone="warning">Les dimensions OCR ne correspondent pas à cette page. Les cadres ne sont pas superposés.</Notice>}
        {!busy && pageText.trim() && <details><summary>Afficher le texte de cette page</summary><pre className="file-preview-text">{pageText}</pre></details>}
    </div>;
}
