import { ocrSearchMatcher } from '../core/ocrSearch';
import React from 'react';
import type { OcrLayout } from '../core/types';

export interface WordOverlay {
    layout: OcrLayout; filter: string; highlight?: string; selected: number | null; onSelect: (index: number) => void;
}
export function layoutFitsPage(layout: OcrLayout, width: number, height: number) {
    return layout.unit === 'pixel' && [layout.width, layout.height, width, height].every(n => Number.isFinite(n) && n > 0)
        && Math.abs((layout.width / layout.height) / (width / height) - 1) < 0.02;
}
export function OcrWordOverlay({ layout, filter, selected, onSelect, highlight = '' }: WordOverlay) {
    const matches = ocrSearchMatcher(highlight);
    return <div translate="no" style={{ display: 'contents' }}><svg className="ocr-word-overlay" viewBox={'0 0 ' + layout.width + ' ' + layout.height} preserveAspectRatio="none" aria-label="Positions des mots sur le document">
        {layout.words.map((w, index) => w.text.toLocaleLowerCase('fr').includes(filter.toLocaleLowerCase('fr')) &&
            <g key={index} role="button" tabIndex={0} aria-label={'Mot ' + (index + 1) + ' : ' + w.text} aria-pressed={selected === index}
                className={'ocr-word-box' + (matches(w.text) ? ' search-match' : '') + (selected === index ? ' selected' : '') + (w.confidence !== null && w.confidence < 80 ? ' low' : '')}
                onClick={() => onSelect(index)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(index); } }}>
                <title>{w.text + ' · ' + w.x + ', ' + w.y + ' · confiance ' + (w.confidence === null ? 'inconnue' : w.confidence + ' %')}</title>
                <rect x={w.x} y={w.y} width={w.width} height={w.height} vectorEffect="non-scaling-stroke" />
            </g>)}
    </svg></div>;
}
