import React, { useEffect, useState } from 'react';
import { useSession } from '../auth/session';
import type { OcrLayout } from '../core/types';
import PdfPreview from './PdfPreview';
import { Busy, ErrorNotice, Notice, useResource } from './components';

export default function DocumentPdfPreview({ blob, fileId }: { blob: Blob; fileId: string }) {
    const { digitization, epoch } = useSession();
    const [page, setPage] = useState(1);
    const [show, setShow] = useState(true);
    const q = useResource(s => digitization!.ocrResultsByFile(fileId, s), 'preview-ocr:' + fileId + ':' + epoch);
    const results = (q.data ?? []).filter(r => r.statutValidation === 'VALIDE' && r.hasLayout)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
    const choices = results.filter(r => (r.layoutPages ?? [r.numeroPage ?? 1]).includes(page));
    const [chosen, setChosen] = useState('');
    const selected = choices.find(r => r.id === chosen) ?? choices[0];
    const positions = useResource<OcrLayout | null>(s => show && selected ? digitization!.ocrLayout(selected.id, s, page) : Promise.resolve(null),
        'preview-layout:' + fileId + ':' + selected?.id + ':' + page + ':' + show + ':' + epoch);
    const layout = show && !positions.loading && !positions.error && positions.data?.resultId === selected?.id
        && (positions.data?.pageNumber ?? 1) === page ? positions.data : null;
    const [filter, setFilter] = useState('');
    const [wordIndex, setWordIndex] = useState<number | null>(null);
    useEffect(() => { setFilter(''); setWordIndex(null); }, [selected?.id, page]);
    const word = layout && wordIndex !== null ? layout.words[wordIndex] : null;
    return <section className="document-ocr-preview" aria-label="Aperçu avec positions OCR">
        <label className="scan-toggle"><input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)}/>Afficher les positions OCR validées</label>
        {show && q.loading && <Busy label="Recherche des positions OCR…"/>}
        {show && Boolean(q.error) && <><Notice>Les positions OCR ne sont pas accessibles. L’aperçu du fichier reste disponible.</Notice><ErrorNotice error={q.error} onRetry={q.refresh}/></>}
        {show && !q.loading && !q.error && !selected && <Notice>Aucune position OCR validée pour cette page.</Notice>}
        {show && selected && choices.length > 1 && <label className="field"><span>Résultat OCR à afficher</span><select value={selected.id} onChange={e => setChosen(e.target.value)}>{choices.map(r => <option key={r.id} value={r.id}>{r.moteur ?? r.typeReconnaissance} · {new Date(r.createdAt).toLocaleString('fr')}</option>)}</select></label>}
        {show && selected && positions.loading && <Busy label="Chargement des positions des mots…"/>}
        {show && Boolean(positions.error) && <ErrorNotice error={positions.error} onRetry={positions.refresh}/>}
        {layout && <><label className="field"><span>Rechercher un mot OCR</span><input value={filter} onChange={e => { setFilter(e.target.value); setWordIndex(null); }}/></label>
            <p role="status">{layout.words.filter(w => w.text.toLocaleLowerCase('fr').includes(filter.toLocaleLowerCase('fr'))).length} mot(s) affiché(s) sur {layout.words.length} · page {page}. Sélectionnez un cadre pour lire ses coordonnées.</p>
            {layout.truncated && <Notice tone="warning">Les positions de cette page sont partielles.</Notice>}
            <div className="ocr-overlay-selection" aria-live="polite">{word && <><strong>{word.text}</strong><p>Position : {word.x}, {word.y} · Dimensions : {word.width} × {word.height} pixels · Confiance : {word.confidence === null ? 'inconnue' : word.confidence + ' %'}</p></>}</div></>}
        <PdfPreview blob={blob} onPageChange={setPage} overlay={layout ? { layout, filter, selected: wordIndex, onSelect: setWordIndex } : undefined}/>
    </section>;
}
