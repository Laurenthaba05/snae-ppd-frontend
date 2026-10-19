import React, { useRef, useState } from 'react';
import { Icon } from './icons';

/** Diagrammes SVG/HTML sans dépendance : barre empilée, jauge, colonnes empilées, barres d’avancement. */
export const nf = (n: number) => n.toLocaleString('fr-FR');
export const percent = (part: number, total: number) => total > 0 ? Math.round(part * 100 / total) : 0;

interface TipRow { color: string; label: string; value: string }
interface TipState { x: number; y: number; title: string; rows: TipRow[] }

/** Infobulle partagée : souris et clavier (focus) affichent les mêmes détails. */
function useTip() {
    const box = useRef<HTMLDivElement>(null);
    const [tip, setTip] = useState<TipState | null>(null);
    const show = (event: React.PointerEvent | React.FocusEvent, title: string, rows: TipRow[]) => {
        const host = box.current?.getBoundingClientRect();
        if (!host) return;
        const mouse = 'clientX' in event;
        const rect = (event.currentTarget as Element).getBoundingClientRect();
        const x = mouse ? event.clientX : rect.left + rect.width / 2;
        const y = mouse ? event.clientY : rect.top;
        setTip({ x: Math.min(Math.max(x - host.left, 70), Math.max(host.width - 70, 70)), y: y - host.top, title, rows });
    };
    const hide = () => setTip(null);
    const view = tip && <div className="db-tip" style={{ left: tip.x, top: tip.y }} role="status">
        <b>{tip.title}</b>
        {tip.rows.map(row => <span key={row.label}><i style={{ background: row.color }} /><strong>{row.value}</strong>{row.label}</span>)}
    </div>;
    return { box, show, hide, view };
}

export interface Segment { key: string; label: string; value: number; color: string; icon?: string }

/** Part d’un tout : une barre horizontale empilée (2 px d’écart entre segments), légende avec valeurs. */
export function StackedBar({ title, unit, segments }: { title: string; unit: string; segments: Segment[] }) {
    const { box, show, hide, view } = useTip();
    const total = segments.reduce((sum, s) => sum + s.value, 0);
    const live = segments.filter(s => s.value > 0);
    const summary = title + ' : ' + segments.map(s => s.label + ' ' + nf(s.value)).join(', ');
    return <div className="db-chart" ref={box}>
        <div className="db-sbar" role="img" aria-label={summary}>
            {live.length ? live.map(s => {
                const rows = [{ color: s.color, label: s.label, value: nf(s.value) + ' ' + unit + ' · ' + percent(s.value, total) + ' %' }];
                return <span key={s.key} className="db-sbar-seg" tabIndex={0} role="img" aria-label={s.label + ' : ' + nf(s.value)} style={{ flexGrow: s.value, background: s.color }}
                    onPointerMove={e => show(e, title, rows)} onPointerLeave={hide} onFocus={e => show(e, title, rows)} onBlur={hide} />;
            }) : <span className="db-sbar-empty" />}
        </div>
        <ul className="db-key">{segments.map(s => <li key={s.key}><i style={{ background: s.color }} />{s.icon && <Icon name={s.icon} size={13} />}<span>{s.label}</span><b>{nf(s.value)}</b></li>)}</ul>
        {view}
    </div>;
}

/** Un ratio : piste de la même rampe que le remplissage. */
export function Meter({ label, value, total, fill, track }: { label: string; value: number; total: number; fill: string; track: string }) {
    const share = percent(value, total);
    return <div className="db-meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={Math.max(total, 1)} aria-valuenow={value} aria-valuetext={nf(value) + ' sur ' + nf(total) + ' (' + share + ' %)'} style={{ background: track }}>
        <span style={{ width: share + '%', background: fill }} />
    </div>;
}

export interface Column { key: string; label: string; good: number; warn: number }
const niceMax = (max: number) => {
    if (max <= 4) return Math.max(max, 2);
    const base = Math.pow(10, Math.floor(Math.log10(max)));
    for (const step of [1, 2, 5, 10]) if (max <= step * base) return step * base;
    return max;
};
function roundedTop(x: number, y: number, w: number, h: number, r: number) {
    const k = Math.min(r, w / 2, h);
    return `M${x} ${y + h}V${y + k}Q${x} ${y} ${x + k} ${y}H${x + w - k}Q${x + w} ${y} ${x + w} ${y + k}V${y + h}Z`;
}

/** Évolution par période : colonnes empilées (≤ 24 px, sommet arrondi, 2 px d’écart). */
export function StackedColumns({ title, unit, columns, good, warn }: { title: string; unit: string; columns: Column[]; good: { label: string; color: string; icon: string }; warn: { label: string; color: string; icon: string } }) {
    const { box, show, hide, view } = useTip();
    const W = 360, H = 190, left = 30, bottom = 24, top = 10;
    const plotH = H - bottom - top;
    const max = niceMax(Math.max(0, ...columns.map(c => c.good + c.warn)));
    const band = (W - left - 6) / Math.max(columns.length, 1);
    const barW = Math.min(24, band * 0.55);
    const yOf = (v: number) => top + plotH - (v / max) * plotH;
    const ticks = [0, max / 2, max].filter((v, i, all) => Number.isInteger(v) && all.indexOf(v) === i);
    return <div className="db-chart" ref={box}>
        <svg className="db-columns" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title + ' : ' + columns.map(c => c.label + ' ' + c.good + ' conformes, ' + c.warn + ' à corriger').join(' ; ')}>
            {ticks.map(t => <g key={t}><line x1={left} x2={W - 4} y1={yOf(t)} y2={yOf(t)} className={t === 0 ? 'axis' : 'grid'} /><text x={left - 6} y={yOf(t) + 3.5} textAnchor="end">{nf(t)}</text></g>)}
            {columns.map((c, i) => {
                const cx = left + band * i + band / 2;
                const x = cx - barW / 2;
                const gap = c.good > 0 && c.warn > 0 ? 2 : 0;
                const goodH = (c.good / max) * plotH;
                const warnH = (c.warn / max) * plotH;
                const rows = [
                    { color: good.color, label: good.label, value: nf(c.good) + ' ' + unit },
                    { color: warn.color, label: warn.label, value: nf(c.warn) + ' ' + unit }
                ];
                return <g key={c.key}>
                    {c.good > 0 && <path d={c.warn > 0 ? `M${x} ${top + plotH}V${top + plotH - goodH + gap}H${x + barW}V${top + plotH}Z` : roundedTop(x, top + plotH - goodH, barW, goodH, 4)} fill={good.color} />}
                    {c.warn > 0 && <path d={roundedTop(x, top + plotH - goodH - warnH, barW, warnH - gap, 4)} fill={warn.color} />}
                    <text x={cx} y={H - 7} textAnchor="middle">{c.label}</text>
                    <rect x={cx - band / 2} y={top} width={band} height={plotH + bottom} fill="transparent" tabIndex={0} role="img" aria-label={c.label + ' : ' + c.good + ' conformes, ' + c.warn + ' à corriger'}
                        onPointerMove={e => show(e, c.label, rows)} onPointerLeave={hide} onFocus={e => show(e, c.label, rows)} onBlur={hide} />
                </g>;
            })}
        </svg>
        <ul className="db-key"><li><i style={{ background: good.color }} /><Icon name={good.icon} size={13} /><span>{good.label}</span></li><li><i style={{ background: warn.color }} /><Icon name={warn.icon} size={13} /><span>{warn.label}</span></li></ul>
        {view}
    </div>;
}

export interface Progress { key: string; name: string; done: number; total: number }

/** Magnitudes comparées : barres d’avancement d’une seule teinte, valeur au bout de chaque barre. */
export function ProgressBars({ rows, fill, track }: { rows: Progress[]; fill: string; track: string }) {
    return <ul className="db-hbars">{rows.map(row => <li key={row.key}>
        <div className="db-hbar-head"><span title={row.name}>{row.name}</span><b>{nf(row.done)} / {nf(row.total)} · {percent(row.done, row.total)} %</b></div>
        <div className="db-hbar" role="meter" aria-label={row.name} aria-valuemin={0} aria-valuemax={Math.max(row.total, 1)} aria-valuenow={row.done} aria-valuetext={nf(row.done) + ' sur ' + nf(row.total)} style={{ background: track }}><span style={{ width: percent(row.done, row.total) + '%', background: fill }} /></div>
    </li>)}</ul>;
}


export interface SeriesPoint { key: string; label: string; value: number }

/** Évolution d’une série dans le temps : ligne 2 px + aplat à 10 %, repère de survol, pastille finale. */
export function AreaChart({ title, unit, points, color }: { title: string; unit: string; points: SeriesPoint[]; color: string }) {
    const { box, show, hide, view } = useTip();
    const [active, setActive] = useState<number | null>(null);
    const W = 520, H = 210, left = 42, bottom = 26, top = 12, right = 12;
    const plotW = W - left - right, plotH = H - top - bottom;
    const max = niceMax(Math.max(0, ...points.map(p => p.value)));
    const step = points.length > 1 ? plotW / (points.length - 1) : 0;
    const xOf = (i: number) => left + (points.length > 1 ? step * i : plotW / 2);
    const yOf = (v: number) => top + plotH - (v / max) * plotH;
    const ticks = [0, 1, 2, 3, 4].map(i => (max * i) / 4).filter((v, i, all) => Number.isInteger(v) && all.indexOf(v) === i);
    const line = points.map((p, i) => (i ? 'L' : 'M') + xOf(i).toFixed(1) + ' ' + yOf(p.value).toFixed(1)).join('');
    const area = points.length ? line + `L${xOf(points.length - 1).toFixed(1)} ${top + plotH}L${xOf(0).toFixed(1)} ${top + plotH}Z` : '';
    const last = points.length - 1;
    const dot = active ?? last;
    const hit = Math.max(step, 24);
    return <div className="db-chart" ref={box}>
        <svg className="db-columns db-area" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title + ' : ' + points.map(p => p.label + ' ' + p.value).join(' ; ')}>
            {ticks.map(t => <g key={t}><line x1={left} x2={W - right} y1={yOf(t)} y2={yOf(t)} className={t === 0 ? 'axis' : 'grid'} /><text x={left - 8} y={yOf(t) + 3.5} textAnchor="end">{nf(t)}</text></g>)}
            {area && <path d={area} fill={color} opacity={0.1} />}
            {line && <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
            {points.map((p, i) => <text key={p.key} x={xOf(i)} y={H - 8} textAnchor="middle">{p.label}</text>)}
            {active !== null && <line x1={xOf(active)} x2={xOf(active)} y1={top} y2={top + plotH} className="axis" />}
            {points.length > 0 && <circle cx={xOf(dot)} cy={yOf(points[dot]!.value)} r={4.5} fill={color} stroke="#fff" strokeWidth={2} />}
            {points.map((p, i) => <rect key={p.key} x={xOf(i) - hit / 2} y={top} width={hit} height={plotH + bottom} fill="transparent" tabIndex={0} role="img" aria-label={p.label + ' : ' + nf(p.value) + ' ' + unit}
                onPointerMove={e => { setActive(i); show(e, p.label, [{ color, label: title, value: nf(p.value) + ' ' + unit }]); }} onPointerLeave={() => { setActive(null); hide(); }}
                onFocus={e => { setActive(i); show(e, p.label, [{ color, label: title, value: nf(p.value) + ' ' + unit }]); }} onBlur={() => { setActive(null); hide(); }} />)}
        </svg>
        {view}
    </div>;
}

/** Part d’un tout (≤ 6 segments) : anneau avec total au centre, 2 px d’écart, légende avec parts en %. */
export function Donut({ title, unit, segments, centerLabel }: { title: string; unit: string; segments: Segment[]; centerLabel: string }) {
    const { box, show, hide, view } = useTip();
    const total = segments.reduce((sum, s) => sum + s.value, 0);
    const R = 62, C = 2 * Math.PI * R, GAP = segments.filter(s => s.value > 0).length > 1 ? 2 : 0;
    let offset = 0;
    return <div className="db-chart db-donut" ref={box}>
        <svg viewBox="0 0 170 170" role="img" aria-label={title + ' : ' + segments.map(s => s.label + ' ' + percent(s.value, total) + ' %').join(', ')}>
            <circle cx="85" cy="85" r={R} fill="none" stroke="#eef2f5" strokeWidth={24} />
            <g transform="rotate(-90 85 85)">
                {segments.filter(s => s.value > 0).map(s => {
                    const length = Math.max((s.value / total) * C - GAP, 0.5);
                    const start = offset; offset += (s.value / total) * C;
                    const rows = [{ color: s.color, label: s.label, value: nf(s.value) + ' ' + unit + ' · ' + percent(s.value, total) + ' %' }];
                    return <circle key={s.key} className="db-donut-seg" cx="85" cy="85" r={R} fill="none" stroke={s.color} strokeWidth={24} strokeDasharray={`${length} ${C - length}`} strokeDashoffset={-start} tabIndex={0} role="img" aria-label={s.label + ' : ' + nf(s.value)}
                        onPointerMove={e => show(e, title, rows)} onPointerLeave={hide} onFocus={e => show(e, title, rows)} onBlur={hide} />;
                })}
            </g>
            <text x="85" y="86" textAnchor="middle" className="db-donut-total">{nf(total)}</text>
            <text x="85" y="104" textAnchor="middle" className="db-donut-label">{centerLabel}</text>
        </svg>
        <ul className="db-donut-key">{segments.map(s => <li key={s.key}><i style={{ background: s.color }} /><span>{s.label}</span><b>{percent(s.value, total)} %</b></li>)}</ul>
        {view}
    </div>;
}
