import React, { useEffect, useId, useRef, useState } from 'react';
import { Icon } from './icons';
import { formatNumber, formatPercent } from '../core/locale';

/**
 * Diagrammes SVG/HTML sans dépendance : courbe ou colonnes, mini-courbe, répartition, anneau, jauge, colonnes empilées, barres d’avancement et de classement.
 * Traits fins (2 px), 2 px d’écart entre marques qui se touchent, repères de 2 px de la couleur du fond, grille en filets : la donnée est la seule chose à « parler fort ».
 *
 * Accessibilité : un graphique n'est qu'un seul arrêt de tabulation (les flèches parcourent ses périodes), ses marques ne sont jamais focalisables ni des rôles imbriqués ; sa lecture
 * complète est le texte (résumé, lignes de la répartition, tableau jumeau). L'infobulle montre la même chose, elle ne remplace jamais la lecture ; une zone vocale annonce la période active.
 */
export const nf = formatNumber;
export const percent = (part: number, total: number) => total > 0 ? Math.round(part * 100 / total) : 0;
/** Une part en pourcentage ; « < 1 % » quand la valeur existe mais s'arrondit à zéro. */
const share = (part: number, total: number) => part > 0 && percent(part, total) === 0 ? (formatPercent(1).replace('1', '< 1')) : formatPercent(percent(part, total));

interface TipRow { color: string; label: string; value: string }
interface TipState { x: number; y: number; title: string; rows: TipRow[] }

/** L'infobulle : la valeur d'abord, son nom ensuite ; décorative (les mêmes chiffres sont écrits ailleurs), jamais annoncée. */
function Tip({ tip, bound }: { tip: TipState; bound?: number }) {
    const x = bound ? Math.min(Math.max(tip.x, 84), Math.max(bound - 84, 84)) : tip.x;
    return <div className="db-tip" style={{ left: x, top: tip.y }} aria-hidden="true">
        <b>{tip.title}</b>
        {tip.rows.map(row => <span key={row.label}><i style={{ background: row.color }} /><strong>{row.value}</strong><em>{row.label}</em></span>)}
    </div>;
}

/** Infobulle de pointeur (répartitions et anneau) : suit le pointeur dans la boîte du diagramme. */
function useTip() {
    const box = useRef<HTMLDivElement | null>(null);
    const [tip, setTip] = useState<TipState | null>(null);
    const show = (event: React.PointerEvent, title: string, rows: TipRow[]) => {
        const host = box.current?.getBoundingClientRect();
        if (!host) return;
        setTip({ x: Math.min(Math.max(event.clientX - host.left, 84), Math.max(host.width - 84, 84)), y: event.clientY - host.top, title, rows });
    };
    const hide = () => setTip(null);
    return { box, show, hide, view: tip && <Tip tip={tip} /> };
}

/** La largeur réelle d'un conteneur : le texte et les traits restent à leur taille, quel que soit l'écran (hors navigateur sans mesure : la valeur de repli). */
function useWidth(fallback: number) {
    const ref = useRef<HTMLDivElement | null>(null);
    const [width, setWidth] = useState(fallback);
    useEffect(() => {
        const node = ref.current;
        if (!node || typeof ResizeObserver === 'undefined') return;
        const measure = () => { const w = Math.round(node.getBoundingClientRect().width); if (w > 40) setWidth(w); };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(node);
        return () => observer.disconnect();
    }, []);
    return [ref, width] as const;
}

/** La période active d'un graphique : choisie au pointeur ou aux flèches (gauche/droite, début, fin ; Échap l'efface). */
function useActivePoint(count: number) {
    const [active, setActive] = useState<number | null>(null);
    const onKeyDown = (event: React.KeyboardEvent) => {
        if (count === 0) return;
        const last = count - 1;
        let next: number | null;
        switch (event.key) {
            case 'ArrowRight': case 'ArrowDown': next = active === null ? 0 : Math.min(last, active + 1); break;
            case 'ArrowLeft': case 'ArrowUp': next = active === null ? last : Math.max(0, active - 1); break;
            case 'Home': next = 0; break;
            case 'End': next = last; break;
            case 'Escape': next = null; break;
            default: return;
        }
        event.preventDefault();
        setActive(next);
    };
    return { active, setActive, keys: { tabIndex: 0, onKeyDown, onBlur: () => setActive(null) } };
}

const niceMax = (max: number) => {
    if (max <= 4) return Math.max(max, 2);
    const base = Math.pow(10, Math.floor(Math.log10(max)));
    for (const step of [1, 1.5, 2, 3, 4, 5, 6, 8, 10]) if (max <= step * base) return step * base;
    return max;
};

/** Une courbe qui passe par chaque point sans jamais dépasser entre deux (interpolation monotone) : pas de creux ni de bosse qui n'existent pas dans les données. */
function monotonePath(xs: number[], ys: number[]): string {
    const n = xs.length;
    if (n === 0) return '';
    if (n === 1) return `M${xs[0]!.toFixed(1)} ${ys[0]!.toFixed(1)}`;
    const dx: number[] = [], slope: number[] = [], tangent: number[] = new Array(n).fill(0);
    for (let i = 0; i < n - 1; i++) { dx[i] = xs[i + 1]! - xs[i]!; slope[i] = (ys[i + 1]! - ys[i]!) / dx[i]!; }
    tangent[0] = slope[0]!; tangent[n - 1] = slope[n - 2]!;
    for (let i = 1; i < n - 1; i++) tangent[i] = slope[i - 1]! * slope[i]! <= 0 ? 0 : (slope[i - 1]! + slope[i]!) / 2;
    for (let i = 0; i < n - 1; i++) {
        if (slope[i] === 0) { tangent[i] = 0; tangent[i + 1] = 0; continue; }
        const a = tangent[i]! / slope[i]!, b = tangent[i + 1]! / slope[i]!, s = a * a + b * b;
        if (s > 9) { const k = 3 / Math.sqrt(s); tangent[i] = k * a * slope[i]!; tangent[i + 1] = k * b * slope[i]!; }
    }
    let d = `M${xs[0]!.toFixed(1)} ${ys[0]!.toFixed(1)}`;
    for (let i = 0; i < n - 1; i++) {
        d += `C${(xs[i]! + dx[i]! / 3).toFixed(1)} ${(ys[i]! + tangent[i]! * dx[i]! / 3).toFixed(1)} ${(xs[i + 1]! - dx[i]! / 3).toFixed(1)} ${(ys[i + 1]! - tangent[i + 1]! * dx[i]! / 3).toFixed(1)} ${xs[i + 1]!.toFixed(1)} ${ys[i + 1]!.toFixed(1)}`;
    }
    return d;
}

function roundedTop(x: number, y: number, w: number, h: number, r: number) {
    const k = Math.min(r, w / 2, h);
    return `M${x} ${y + h}V${y + k}Q${x} ${y} ${x + k} ${y}H${x + w - k}Q${x + w} ${y} ${x + w} ${y + k}V${y + h}Z`;
}

/** Des comptes par période, peu nombreux ou clairsemés : de simples colonnes disent la vérité (zéro, zéro, puis quatre), une courbe lissée inventerait une montée progressive. */
const isSparse = (values: number[]) => values.filter(v => v > 0).length <= 3;

// ------------------------------------------------------------------------------------------------ le tableau jumeau
/** La version tableau d'un diagramme : montrée à la demande (le bouton la déplie), pour lire chaque valeur sans survol. */
export function ChartTable({ caption, head, rows }: { caption: string; head: [string, string]; rows: Array<[string, string]> }) {
    const [open, setOpen] = useState(false);
    const id = useId();
    return <div className="dv-table">
        <button type="button" className="dv-table-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}><Icon name={open ? 'chevronUp' : 'chevronDown'} size={14} />{open ? 'Masquer le tableau' : 'Afficher les données sous forme de tableau'}</button>
        {open && <div id={id} className="dv-table-wrap"><table><caption>{caption}</caption><thead><tr><th scope="col">{head[0]}</th><th scope="col" className="num">{head[1]}</th></tr></thead>
            <tbody>{rows.map(([a, b]) => <tr key={a}><th scope="row">{a}</th><td className="num">{b}</td></tr>)}</tbody></table></div>}
    </div>;
}

// ------------------------------------------------------------------------------------------------ la mini-courbe
/**
 * La tendance d'un indicateur, en filet : décorative (la valeur est écrite à côté), la dernière valeur est marquée. Peu de périodes avec une valeur (trois au plus) : des colonnes, une par
 * période, la dernière mise en valeur ; sinon une courbe lissée. `labels` nomme chaque période (infobulle native au survol d'une colonne).
 */
export function Sparkline({ values, labels, color = '#1f8a5b', accent, surface = '#fff', area = true, width = 104, height = 34, fluid = false, variant = 'auto' }:
    { values: number[]; labels?: string[]; color?: string; accent?: string; surface?: string; area?: boolean; width?: number; height?: number; fluid?: boolean; variant?: 'auto' | 'line' | 'bars' }) {
    const gradient = useId();
    const [measure, measured] = useWidth(width);
    if (values.length < 2) return null;
    const w = fluid ? measured : width;
    const bars = variant === 'bars' || (variant === 'auto' && isSparse(values));
    const pad = 4, max = Math.max(1, ...values), min = Math.min(0, ...values);
    let body: React.ReactNode;
    if (bars) {
        // une colonne par période, centrée dans sa case : la première et la dernière tombent sous les repères de l'axe
        const slot = (w - 2 * pad) / values.length, bw = Math.max(2, Math.min(slot * 0.6, fluid ? 22 : 14));
        const base = height - pad;
        body = values.map((v, i) => {
            const h = v > 0 ? Math.max(3, (v / max) * (height - 2 * pad - 2)) : 2;
            const last = i === values.length - 1;
            return <rect key={i} x={pad + slot * i + (slot - bw) / 2} y={base - h} width={bw} height={h} rx={Math.min(2, bw / 2)} fill={last && accent ? accent : color} opacity={v > 0 ? 1 : 0.35}>
                {labels?.[i] && <title>{labels[i] + ' : ' + formatNumber(v)}</title>}</rect>;
        });
    } else {
        const xs = values.map((_, i) => pad + (i * (w - 2 * pad)) / (values.length - 1));
        const ys = values.map(v => height - pad - ((v - min) / (max - min || 1)) * (height - 2 * pad));
        const line = monotonePath(xs, ys);
        body = <>
            {area && <><defs><linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity="0.22" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
                <path d={`${line}L${xs[xs.length - 1]!.toFixed(1)} ${height}L${xs[0]!.toFixed(1)} ${height}Z`} fill={`url(#${gradient})`} /></>}
            <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r={3.5} fill={color} stroke={surface} strokeWidth={2} />
        </>;
    }
    const svg = <svg className={'dv-spark' + (bars ? ' bars' : '')} width={w} height={height} viewBox={`0 0 ${w} ${height}`} aria-hidden="true" focusable="false">{body}</svg>;
    return fluid ? <div className="dv-spark-fluid" ref={measure}>{svg}</div> : svg;
}

// ------------------------------------------------------------------------------------------------ la courbe
export interface SeriesPoint { key: string; label: string; value: number }

/**
 * Évolution d’une série dans le temps : courbe de 2 px lissée avec un aplat léger, ou des colonnes quand peu de périodes ont une valeur (`variant="auto"`). Un repère suit le pointeur ou les
 * flèches, la valeur finale est écrite, le tableau jumeau s'ouvre à la demande.
 */
export function AreaChart({ title, unit, points, color, height = 236, variant = 'auto' }: { title: string; unit: string; points: SeriesPoint[]; color: string; height?: number; variant?: 'auto' | 'area' | 'columns' }) {
    const [measure, width] = useWidth(560);
    const gradient = useId();
    const { active, setActive, keys } = useActivePoint(points.length);
    const columns = variant === 'columns' || (variant === 'auto' && isSparse(points.map(p => p.value)));
    const H = height, bottom = 28, top = 18, right = 16;
    const max = niceMax(Math.max(0, ...points.map(p => p.value)));
    const ticks = [0, 1, 2, 3, 4].map(i => (max * i) / 4).filter((v, i, all) => Number.isInteger(v) && all.indexOf(v) === i);
    const left = 14 + Math.max(...ticks.map(t => nf(t).length), 1) * 7;
    const plotW = Math.max(width - left - right, 40), plotH = H - top - bottom;
    const step = points.length > 1 ? plotW / (points.length - 1) : 0;
    const band = columns ? plotW / Math.max(points.length, 1) : step;
    const xOf = (i: number) => columns ? left + band * i + band / 2 : left + (points.length > 1 ? step * i : plotW / 2);
    const yOf = (v: number) => top + plotH - (v / max) * plotH;
    const xs = points.map((_, i) => xOf(i)), ys = points.map(p => yOf(p.value));
    const line = monotonePath(xs, ys);
    const area = points.length ? line + `L${xOf(points.length - 1).toFixed(1)} ${top + plotH}L${xOf(0).toFixed(1)} ${top + plotH}Z` : '';
    const last = points.length - 1;
    const hit = Math.max(columns ? band : step, 24);
    const bw = Math.min(26, band * 0.6);
    // les étiquettes de l'axe : une sur « every », en partant de la dernière pour que la période courante soit toujours nommée
    const every = band > 0 ? Math.max(1, Math.ceil(46 / band)) : 1;
    const shown = new Set<number>();
    for (let i = last; i >= 0; i -= every) shown.add(i);
    const summary = title + ' : ' + points.map(p => p.label + ' ' + p.value).join(' ; ');
    const focus = active !== null ? points[active] : undefined;
    const tip = focus ? { x: xOf(active!), y: yOf(focus.value) + 4, title: focus.label, rows: [{ color, label: title, value: nf(focus.value) + ' ' + unit }] } : null;
    const endLabelWidth = (value: number) => Math.max(36, nf(value).length * 8 + 16);
    const endValue = points[last]?.value ?? 0;
    return <div className="db-chart dv-area" ref={el => { measure.current = el; }}>
        <div className="dv-plot" role="group" aria-label={summary} {...keys}>
            <svg className="db-columns db-area" width={width} height={H} viewBox={`0 0 ${width} ${H}`} aria-hidden="true" focusable="false">
                <defs><linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity="0.2" /><stop offset="1" stopColor={color} stopOpacity="0.02" /></linearGradient></defs>
                {ticks.map(t => <g key={t}><line x1={left} x2={width - right} y1={yOf(t)} y2={yOf(t)} className={t === 0 ? 'axis' : 'grid'} /><text x={left - 10} y={yOf(t) + 4} textAnchor="end">{nf(t)}</text></g>)}
                {!columns && area && <path d={area} fill={`url(#${gradient})`} />}
                {!columns && line && <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
                {columns && points.map((p, i) => {
                    const h = (p.value / max) * plotH;
                    const on = active === i;
                    return p.value > 0 ? <path key={p.key} d={roundedTop(xOf(i) - bw / 2, top + plotH - h, bw, h, 5)} fill={color} opacity={active !== null && !on ? 0.45 : 1} />
                        : <rect key={p.key} x={xOf(i) - bw / 2} y={top + plotH - 2} width={bw} height={2} rx={1} fill={color} opacity={on ? 0.9 : 0.35} />;
                })}
                {points.map((p, i) => shown.has(i) ? <text key={p.key} x={xOf(i)} y={H - 7} textAnchor="middle">{p.label}</text> : null)}
                {active !== null && !columns && <line x1={xOf(active)} x2={xOf(active)} y1={top} y2={top + plotH} className="axis" />}
                {active !== null && columns && <rect x={xOf(active) - band / 2} y={top} width={band} height={plotH + 4} className="dv-band-on" />}
                {!columns && points.length > 0 && <circle cx={xOf(active ?? last)} cy={yOf(points[active ?? last]!.value)} r={5} fill={color} stroke="#fff" strokeWidth={2} />}
                {active !== null && !columns && <circle className="dv-focus-ring" cx={xOf(active)} cy={yOf(points[active]!.value)} r={9} fill="none" />}
                {points.length > 0 && active === null && endValue > 0 && <g className="dv-endlabel"><rect x={Math.min(xOf(last) - 6, width - right - endLabelWidth(endValue))} y={yOf(endValue) - 34} width={endLabelWidth(endValue)} height={20} rx={10} fill={color} />
                    <text x={Math.min(xOf(last) - 6, width - right - endLabelWidth(endValue)) + endLabelWidth(endValue) / 2} y={yOf(endValue) - 20} textAnchor="middle">{nf(endValue)}</text></g>}
                {points.map((p, i) => <rect key={p.key} x={xOf(i) - hit / 2} y={top} width={hit} height={plotH + bottom} fill="transparent" onPointerMove={() => setActive(i)} onPointerLeave={() => setActive(null)} />)}
            </svg>
            {tip && <Tip tip={tip} bound={width} />}
        </div>
        <span className="sr-only" role="status" aria-live="polite">{focus ? focus.label + ' : ' + nf(focus.value) + ' ' + unit : ''}</span>
        {points.length > 0 && <ChartTable caption={title} head={['Période', unit]} rows={points.map(p => [p.label, nf(p.value)])} />}
    </div>;
}

// ------------------------------------------------------------------------------------------------ les parts d'un tout
export interface Segment { key: string; label: string; value: number; color: string; icon?: string }

/** Les lignes d'une répartition : pastille, libellé, valeur, part ; survoler une ligne met en valeur sa part dans le diagramme, et inversement. */
function Rows({ segments, total, active, onActive }: { segments: Segment[]; total: number; active: string | null; onActive: (key: string | null) => void }) {
    return <ul className="dv-rows">{segments.map(s => <li key={s.key} className={(active === s.key ? 'on ' : '') + (active && active !== s.key ? 'dim ' : '') + (s.value === 0 ? 'zero' : '')} onPointerEnter={() => onActive(s.key)} onPointerLeave={() => onActive(null)}>
        <i className="dv-swatch" style={{ background: s.color }} /><span className="dv-row-label">{s.label}</span><b>{nf(s.value)}</b><span className="dv-row-share">{share(s.value, total)}</span>
        <span className="dv-row-bar" aria-hidden="true"><span style={{ width: percent(s.value, total) + '%', background: s.color }} /></span>
    </li>)}</ul>;
}

/**
 * Part d’un tout : une barre empilée (2 px d’écart entre parts, bouts arrondis) puis une ligne par part avec sa valeur et son pourcentage. L'ordre est celui qu'on donne
 * (un cycle de vie se lit dans l'ordre de ses étapes, pas du plus grand au plus petit). `inline` : une légende sur une ligne, pour les petites cartes. Une seule part non vide : pas de
 * barre (une barre pleine ne dit rien de plus que la ligne).
 */
export function Breakdown({ title, unit, segments, layout = 'rows' }: { title: string; unit: string; segments: Segment[]; layout?: 'rows' | 'inline' }) {
    const { box, show, hide, view } = useTip();
    const [active, setActive] = useState<string | null>(null);
    const total = segments.reduce((sum, s) => sum + s.value, 0);
    const live = segments.filter(s => s.value > 0);
    const summary = title + ' : ' + segments.map(s => s.label + ' ' + nf(s.value)).join(', ');
    return <div className="db-chart dv-break" ref={box}>
        {(live.length > 1 || layout === 'inline') && <div className="db-sbar" role="img" aria-label={summary}>
            {live.length ? live.map(s => {
                const rows = [{ color: s.color, label: s.label, value: nf(s.value) + ' ' + unit + ' · ' + share(s.value, total) }];
                return <span key={s.key} className={'db-sbar-seg' + (active === s.key ? ' on' : active ? ' dim' : '')} style={{ flexGrow: s.value, background: s.color }}
                    onPointerMove={e => { setActive(s.key); show(e, title, rows); }} onPointerLeave={() => { setActive(null); hide(); }} />;
            }) : <span className="db-sbar-empty" />}
        </div>}
        {layout === 'rows' ? <Rows segments={segments} total={total} active={active} onActive={setActive} />
            : <ul className="db-key">{segments.map(s => <li key={s.key}><i style={{ background: s.color }} />{s.icon && <Icon name={s.icon} size={13} />}<span>{s.label}</span><b>{nf(s.value)}</b></li>)}</ul>}
        {view}
    </div>;
}

/** Part d’un tout en barre empilée : la même pièce, sous le nom que les écrans de traitement utilisent. */
export const StackedBar = Breakdown;

/** Un ratio : piste de la même rampe que le remplissage. */
export function Meter({ label, value, total, fill, track }: { label: string; value: number; total: number; fill: string; track: string }) {
    const share = percent(value, total);
    return <div className="db-meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={Math.max(total, 1)} aria-valuenow={value} aria-valuetext={nf(value) + ' sur ' + nf(total) + ' (' + share + ' %)'} style={{ background: track }}>
        <span style={{ width: share + '%', background: fill }} />
    </div>;
}

/**
 * Part d’un tout (3 à 6 parts) : anneau fin avec le total au centre (ou la part survolée), 2 px d’écart, lignes de légende liées au survol. Avec deux parts ou moins, un anneau ne montre
 * rien qu'une barre ne dise mieux : la répartition en barre et en lignes la remplace.
 */
export function Donut({ title, unit, segments, centerLabel }: { title: string; unit: string; segments: Segment[]; centerLabel: string }) {
    const { box, show, hide, view } = useTip();
    const [active, setActive] = useState<string | null>(null);
    const total = segments.reduce((sum, s) => sum + s.value, 0);
    if (segments.filter(s => s.value > 0).length <= 2) return <Breakdown title={title} unit={unit} segments={segments} />;
    const R = 64, C = 2 * Math.PI * R, GAP = 2.5, STROKE = 20;
    let offset = 0;
    const focus = segments.find(s => s.key === active);
    return <div className="db-chart db-donut dv-donut" ref={box}>
        <svg viewBox="0 0 180 180" role="img" aria-label={title + ' : ' + segments.map(s => s.label + ' ' + formatPercent(percent(s.value, total))).join(', ')}>
            <circle cx="90" cy="90" r={R} fill="none" stroke="#eef3f1" strokeWidth={STROKE} />
            <g transform="rotate(-90 90 90)">
                {segments.filter(s => s.value > 0).map(s => {
                    const length = Math.max((s.value / total) * C - GAP, 0.5);
                    const start = offset; offset += (s.value / total) * C;
                    const rows = [{ color: s.color, label: s.label, value: nf(s.value) + ' ' + unit + ' · ' + share(s.value, total) }];
                    return <circle key={s.key} className={'db-donut-seg' + (active === s.key ? ' on' : active ? ' dim' : '')} cx="90" cy="90" r={R} fill="none" stroke={s.color} strokeWidth={active === s.key ? STROKE + 4 : STROKE} strokeDasharray={`${length} ${C - length}`} strokeDashoffset={-start}
                        onPointerMove={e => { setActive(s.key); show(e, title, rows); }} onPointerLeave={() => { setActive(null); hide(); }} />;
                })}
            </g>
            <text x="90" y="92" textAnchor="middle" className="db-donut-total">{nf(focus ? focus.value : total)}</text>
            <text x="90" y="112" textAnchor="middle" className="db-donut-label">{focus ? share(focus.value, total) : centerLabel}</text>
        </svg>
        <Rows segments={segments} total={total} active={active} onActive={setActive} />
        {view}
    </div>;
}

// ------------------------------------------------------------------------------------------------ colonnes, avancement, classement
export interface Column { key: string; label: string; good: number; warn: number }

/** Évolution par période : colonnes empilées (≤ 22 px, sommet arrondi, 2 px d’écart). Un seul arrêt de tabulation ; les flèches parcourent les périodes. */
export function StackedColumns({ title, unit, columns, good, warn }: { title: string; unit: string; columns: Column[]; good: { label: string; color: string; icon: string }; warn: { label: string; color: string; icon: string } }) {
    const [measure, W] = useWidth(420);
    const { active, setActive, keys } = useActivePoint(columns.length);
    const H = 210, left = 36, bottom = 26, top = 12;
    const plotH = H - bottom - top;
    const max = niceMax(Math.max(0, ...columns.map(c => c.good + c.warn)));
    const band = (W - left - 6) / Math.max(columns.length, 1);
    const barW = Math.min(22, band * 0.5);
    const yOf = (v: number) => top + plotH - (v / max) * plotH;
    const ticks = [0, max / 2, max].filter((v, i, all) => Number.isInteger(v) && all.indexOf(v) === i);
    const summary = title + ' : ' + columns.map(c => c.label + ' ' + c.good + ' conformes, ' + c.warn + ' à corriger').join(' ; ');
    const focus = active !== null ? columns[active] : undefined;
    const tip = focus ? { x: left + band * active! + band / 2, y: yOf(focus.good + focus.warn) + 12, title: focus.label, rows: [
        { color: good.color, label: good.label, value: nf(focus.good) + ' ' + unit }, { color: warn.color, label: warn.label, value: nf(focus.warn) + ' ' + unit }] } : null;
    return <div className="db-chart" ref={el => { measure.current = el; }}>
        <div className="dv-plot" role="group" aria-label={summary} {...keys}>
            <svg className="db-columns" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
                {ticks.map(t => <g key={t}><line x1={left} x2={W - 4} y1={yOf(t)} y2={yOf(t)} className={t === 0 ? 'axis' : 'grid'} /><text x={left - 8} y={yOf(t) + 4} textAnchor="end">{nf(t)}</text></g>)}
                {columns.map((c, i) => {
                    const cx = left + band * i + band / 2;
                    const x = cx - barW / 2;
                    const gap = c.good > 0 && c.warn > 0 ? 2 : 0;
                    const goodH = (c.good / max) * plotH;
                    const warnH = (c.warn / max) * plotH;
                    return <g key={c.key} opacity={active !== null && active !== i ? 0.5 : 1}>
                        {c.good > 0 && <path d={c.warn > 0 ? `M${x} ${top + plotH}V${top + plotH - goodH + gap}H${x + barW}V${top + plotH}Z` : roundedTop(x, top + plotH - goodH, barW, goodH, 4)} fill={good.color} />}
                        {c.warn > 0 && <path d={roundedTop(x, top + plotH - goodH - warnH, barW, Math.max(warnH - gap, 2), 4)} fill={warn.color} />}
                        <text x={cx} y={H - 7} textAnchor="middle">{c.label}</text>
                        <rect x={cx - band / 2} y={top} width={band} height={plotH + bottom} fill="transparent" onPointerMove={() => setActive(i)} onPointerLeave={() => setActive(null)} />
                    </g>;
                })}
                {active !== null && <rect className="dv-band-on" x={left + band * active} y={top} width={band} height={plotH + 4} />}
            </svg>
            {tip && <Tip tip={tip} bound={W} />}
        </div>
        <span className="sr-only" role="status" aria-live="polite">{focus ? focus.label + ' : ' + nf(focus.good) + ' ' + good.label + ', ' + nf(focus.warn) + ' ' + warn.label : ''}</span>
        <ul className="db-key"><li><i style={{ background: good.color }} /><Icon name={good.icon} size={13} /><span>{good.label}</span></li><li><i style={{ background: warn.color }} /><Icon name={warn.icon} size={13} /><span>{warn.label}</span></li></ul>
    </div>;
}

export interface Progress { key: string; name: string; done: number; total: number }

/** Magnitudes comparées : barres d’avancement d’une seule teinte, valeur au bout de chaque ligne. */
export function ProgressBars({ rows, fill, track }: { rows: Progress[]; fill: string; track: string }) {
    return <ul className="db-hbars">{rows.map(row => <li key={row.key}>
        <div className="db-hbar-head"><span title={row.name}>{row.name}</span><b>{nf(row.done)} / {nf(row.total)} · {formatPercent(percent(row.done, row.total))}</b></div>
        <div className="db-hbar" role="meter" aria-label={row.name} aria-valuemin={0} aria-valuemax={Math.max(row.total, 1)} aria-valuenow={row.done} aria-valuetext={nf(row.done) + ' sur ' + nf(row.total)} style={{ background: track }}><span style={{ width: percent(row.done, row.total) + '%', background: fill }} /></div>
    </li>)}</ul>;
}

export interface RankRow { key: string; label: string; value: number }

/** Des quantités comparées sur une même échelle (la plus grande remplit la piste) : une teinte, la valeur en bout de ligne. */
export function RankBars({ rows, fill, track, unit }: { rows: RankRow[]; fill: string; track: string; unit: string }) {
    const biggest = Math.max(1, ...rows.map(r => r.value));
    return <ul className="db-hbars dv-rank">{rows.map(row => <li key={row.key}>
        <div className="db-hbar-head"><span title={row.label}>{row.label}</span><b>{nf(row.value)}</b></div>
        <div className="db-hbar" role="meter" aria-label={row.label} aria-valuemin={0} aria-valuemax={biggest} aria-valuenow={row.value} aria-valuetext={nf(row.value) + ' ' + unit} style={{ background: track }}><span style={{ width: Math.max(row.value > 0 ? 2 : 0, (row.value / biggest) * 100) + '%', background: fill }} /></div>
    </li>)}</ul>;
}
