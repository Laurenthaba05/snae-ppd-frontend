import React, { useMemo, useState } from 'react';
import { useSession } from '../auth/session';
import { saveBlob } from './ReadingRoomParts';
import { ApiError } from '../core/http';
import type { OcrLayout } from '../core/types';
import { Busy, Empty, ErrorNotice, Modal, Notice, Pagination, useResource } from './components';

export function OcrLayoutDialog({ resultId, fileName, pageNumber, layoutPages, onClose }: {
    resultId: string; fileName?: string; pageNumber?: number | null; layoutPages?: number[]; onClose: () => void;
}) {
    const { digitization, epoch } = useSession();
    const pages = [...new Set(layoutPages?.length ? layoutPages : [pageNumber ?? 1])].sort((a, b) => a - b);
    const [requestedPage, setRequestedPage] = useState(pageNumber ?? pages[0]!);
    const page = pages.includes(requestedPage) ? requestedPage : pages[0]!;
    const [exporting, setExporting] = useState(false);
    const [exportError, setExportError] = useState<unknown>(null);
    const q = useResource<OcrLayout>(s => digitization!.ocrLayout(resultId, s, page), 'ocr-layout:' + resultId + ':' + page + ':' + epoch);
    const exportAlto = async (allPages = false) => {
        setExporting(true); setExportError(null);
        try {
            const name = (fileName ?? resultId).replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9._-]+/g, '-');
            saveBlob(await digitization!.ocrAlto(resultId, undefined, allPages ? undefined : page), 'alto-' + name + (allPages ? '-complet' : '-page-' + page) + '.xml');
        } catch (error) { setExportError(error); } finally { setExporting(false); }
    };
    const absent = q.error instanceof ApiError && q.error.code === 'OCR_LAYOUT_ABSENT';
    return <Modal title="Positions OCR" subtitle={[fileName, 'Page ' + page].filter(Boolean).join(' · ')} onClose={onClose} wide>
        {pages.length > 1 && <label className="field"><span>Page OCR</span><select value={page} disabled={exporting} onChange={e => { setRequestedPage(Number(e.target.value)); setExportError(null); }}>{pages.map(p => <option key={p} value={p}>Page {p}</option>)}</select></label>}
        {q.loading ? <Busy label="Chargement des positions des mots…" /> : absent
            ? <Empty title="Positions non disponibles" description="Le moteur n’a pas enregistré la position des mots pour ce résultat." />
            : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} />
            : q.data ? <OcrLayoutViewer key={resultId + ':' + page + ':' + epoch} layout={q.data} /> : null}
        {Boolean(exportError) && <ErrorNotice error={exportError} />}
        <footer className="modal-footer">
            {pages.length > 1 && <button className="btn primary" disabled={exporting || q.loading || !!q.error || !q.data} onClick={() => void exportAlto(true)}>{exporting ? 'Export en cours…' : 'Exporter ALTO · toutes les pages (' + pages.length + ')'}</button>}
            <button className="btn secondary" disabled={exporting || q.loading || !!q.error || !q.data} onClick={() => void exportAlto()}>{exporting ? 'Export en cours…' : 'Exporter ALTO · page ' + page}</button><button className="btn secondary" onClick={onClose}>Fermer les positions</button></footer>
    </Modal>;
}
export function OcrLayoutViewer({ layout }: { layout: OcrLayout }) {
    const [filter, setFilter] = useState('');
    const [lowOnly, setLowOnly] = useState(false);
    const [selected, setSelected] = useState<number | null>(null);
    const [page, setPage] = useState(0);
    const [zoom, setZoom] = useState(100);
    const words = useMemo(() => layout.words.map((word, index) => ({ word, index })).filter(({ word }) =>
        word.text.toLocaleLowerCase('fr').includes(filter.toLocaleLowerCase('fr')) &&
        (!lowOnly || (word.confidence !== null && word.confidence < 80))), [layout.words, filter, lowOnly]);
    const current = selected === null ? null : words.find(w => w.index === selected)?.word;
    const reset = () => { setPage(0); setSelected(null); };
    const select = (index: number) => { setSelected(index); setPage(Math.floor(words.findIndex(w => w.index === index) / 50)); };
    const validSize = Number.isFinite(layout.width) && Number.isFinite(layout.height) && layout.width > 0 && layout.height > 0;
    if (!validSize) return <Notice tone="warning">Les dimensions de cette page OCR sont invalides.</Notice>;
    return <div className="ocr-layout">
        <p>Reconstitution du texte aux positions reconnues sur la page. Sélectionnez un mot dans la page ou dans la liste pour consulter sa position.</p>
        <p className="page-note">Page de {layout.width} × {layout.height} {layout.unit === 'pixel' ? 'pixels' : layout.unit}. Origine des coordonnées : angle supérieur gauche.</p>
        {layout.truncated && <Notice tone="warning">Positions partielles : le moteur a limité ou écarté une partie des mots. Cette vue ne représente pas tout le texte.</Notice>}
        <div className="table-toolbar">
            <label className="field"><span>Rechercher un mot</span><input value={filter} onChange={e => { setFilter(e.target.value); reset(); }} /></label>
            <label className="scan-toggle"><input type="checkbox" checked={lowOnly} onChange={e => { setLowOnly(e.target.checked); reset(); }} />Confiance inférieure à 80 %</label>
            <label className="field"><span>Zoom de la page</span><select value={zoom} onChange={e => setZoom(Number(e.target.value))}><option value={100}>100 %</option><option value={150}>150 %</option><option value={200}>200 %</option></select></label>
        </div>
        <p role="status">{words.length} mot{words.length > 1 ? 's' : ''} affiché{words.length > 1 ? 's' : ''} sur {layout.words.length}. Les cadres orange indiquent une confiance inférieure à 80 %.</p>
        {layout.words.length ? <div className="ocr-layout-grid">
            <div className="ocr-layout-canvas" tabIndex={0} aria-label="Page OCR, zone de défilement">
                <svg viewBox={'0 0 ' + layout.width + ' ' + layout.height} style={{ width: zoom + '%' }} aria-label="Disposition des mots sur la page">
                    <title>Texte reconnu et cadres des mots</title>
                    <rect width={layout.width} height={layout.height} fill="white" />
                    {words.map(({ word: w, index }) => <g key={index} className={'ocr-layout-word' + (w.confidence !== null && w.confidence < 80 ? ' low' : '') + (index === selected ? ' selected' : '')} onClick={() => select(index)}>
                        <title>{w.text + ' · x ' + w.x + ', y ' + w.y + ' · confiance ' + (w.confidence === null ? 'inconnue' : w.confidence + ' %')}</title>
                        <rect x={w.x} y={w.y} width={w.width} height={w.height} vectorEffect="non-scaling-stroke" />
                        <text x={w.x} y={w.y + w.height * 0.82} fontSize={w.height * 0.85} textLength={w.width} lengthAdjust="spacingAndGlyphs">{w.text}</text>
                    </g>)}
                </svg>
            </div>
            <div className="ocr-layout-details">
                <div className="ocr-layout-selection" aria-live="polite">
                    {current ? <><h3>{current.text}</h3><dl>
                        <dt>Position (x, y)</dt><dd>{current.x}, {current.y}</dd>
                        <dt>Dimensions (largeur × hauteur)</dt><dd>{current.width} × {current.height}</dd>
                        <dt>Ligne</dt><dd>{current.line}</dd>
                        <dt>Confiance</dt><dd>{current.confidence === null ? 'Non renseignée' : current.confidence + ' %'}</dd>
                    </dl></> : <p>Sélectionnez un mot pour voir ses coordonnées.</p>}
                </div>
                {words.length ? <>
                    <div className="ocr-layout-word-list" role="group" aria-label="Mots reconnus">
                        {words.slice(page * 50, (page + 1) * 50).map(({ word, index }) => <button key={index} className="btn small secondary" aria-pressed={selected === index} onClick={() => select(index)}><span>{word.text}</span>{' '}<small>Ligne {word.line} · {word.confidence === null ? 'Confiance inconnue' : word.confidence + ' %'}</small></button>)}
                    </div>
                    <Pagination page={page} hasMore={(page + 1) * 50 < words.length} count={words.slice(page * 50, (page + 1) * 50).length} onChange={setPage} />
                </> : <Empty title="Aucun mot pour ces filtres" description="Modifiez le texte recherché ou le filtre de confiance." />}
            </div>
        </div> : <Empty title="Aucun mot positionné" description="Ce résultat ne contient aucune position de mot." />}
    </div>;
}
