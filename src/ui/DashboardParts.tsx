import React, { useRef } from 'react';
import { Icon } from './icons';
import { Sparkline, nf } from './charts';
import { formatClock, formatShortDate } from '../core/locale';

/** Les pièces communes des tableaux de bord : un indicateur, une carte, la mention d'une rubrique non disponible, une suite de chiffres. */

export interface KpiDelta { text: string; up?: boolean }

export interface KpiProps {
    icon: string;
    /** La teinte de la pastille d'icône : green, mint, green2 (vert), blue, red (critique), amber (vigilance). */
    tone: string;
    /** Un nombre (formaté ici), un texte déjà prêt (« 240+ », « … » pendant le chargement), ou rien : « — », jamais zéro. */
    value: number | string | null | undefined;
    label: string;
    /** Ajouté au nombre : « + » quand le chiffre est calculé sur un échantillon partiel. */
    suffix?: string;
    hint?: string;
    onClick?: () => void;
    /** `hero` : l'indicateur en tête de page (grand chiffre, fond foncé) ; `compact` : une ligne, pour l'en-tête. */
    variant?: 'tile' | 'hero' | 'compact';
    /** La tendance (douze mois par exemple), en mini-courbe décorative ; `trendLabels` nomme chaque période. */
    trend?: number[];
    trendLabels?: string[];
    /** Sous la tendance de l'indicateur phare : ce qu'elle couvre (« 12 derniers mois »). */
    trendCaption?: string;
    delta?: KpiDelta | null;
    /** Mise en garde quand la valeur est positive : `critical` (échéance dépassée), `warning` (en attente), `info`. Une valeur nulle reste calme. */
    alert?: 'critical' | 'warning' | 'info';
}

export function Kpi({ icon, tone, value, label, suffix, hint, onClick, variant = 'tile', trend, trendLabels, trendCaption, delta, alert }: KpiProps) {
    const missing = value === null || value === undefined;
    const text = missing ? '—' : typeof value === 'number' ? nf(value) + (suffix ?? '') : value;
    const positive = typeof value === 'number' && value > 0;
    const zero = typeof value === 'number' && value === 0;
    const loading = value === '…';
    const hero = variant === 'hero';
    const classes = ['hm-kpi', 'dv-kpi', variant, tone, alert && positive ? 'alert-' + alert : '', loading ? 'loading' : '', onClick ? 'action' : ''].filter(Boolean).join(' ');
    const first = trendLabels?.[0], last = trendLabels?.[trendLabels.length - 1];
    const main = <span className="dv-kpi-main">
        <span className={'hm-kpi-icon ' + tone}><Icon name={icon} size={hero ? 24 : 22} /></span>
        <span className="hm-kpi-body">
            <strong className={zero && !hero ? 'zero' : undefined}>{text}</strong>
            <span>{label}</span>
            {delta ? <em className={delta.up === false ? 'down' : 'up'}>{delta.up !== undefined && <Icon name={delta.up ? 'arrowUp' : 'arrowDown'} size={12} />}{delta.text}</em> : null}
        </span>
    </span>;
    // l'indicateur phare s'organise selon sa propre largeur (requête de conteneur) : chiffre à gauche et tendance à droite quand il est large, tendance dessous quand il est étroit
    const body = hero
        ? <span className="dv-hero-wrap"><span className={'dv-hero-grid' + (trend && trend.length > 1 ? '' : ' alone')}>
            {main}
            {trend && trend.length > 1 && <span className="dv-hero-trend">
                {trendCaption && <span className="dv-hero-cap">{trendCaption}</span>}
                <Sparkline values={trend} labels={trendLabels} color="#ffffff" accent="#f1d98c" surface="#14513c" height={92} fluid />
                {first && last && first !== last && <span className="dv-hero-axis" aria-hidden="true"><span>{first}</span><span>{last}</span></span>}
            </span>}
        </span></span>
        : <>{main}{trend && trend.length > 1 && <Sparkline values={trend} labels={trendLabels} />}</>;
    const title = missing && !hint ? 'Non disponible : votre habilitation ne couvre pas cette rubrique dans ce périmètre.' : hint;
    return onClick ? <button type="button" className={classes} title={title} onClick={onClick}>{body}</button> : <div className={classes} title={title}>{body}</div>;
}

export function Card({ title, subtitle, action, children, className = '' }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
    return <section className={'db-card hm-card dv-card ' + className}>
        <div className="hm-card-head"><div className="dv-card-title"><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>
        {children}
    </section>;
}

/** Une rubrique que la personne n'a pas le droit de lire : on le dit (la phrase est écrite en entier par l'appelant, pour pouvoir être traduite), on ne montre pas un zéro. */
export function Unavailable({ children }: { children: string }) {
    return <p className="db-chart-note dv-unavailable"><Icon name="lock" size={15} />{children}</p>;
}

/** Un état vide : une phrase calme, avec son icône, sans graphique inventé. */
export function EmptyNote({ children, icon = 'info' }: { children: string; icon?: string }) {
    return <p className="db-chart-note dv-empty"><Icon name={icon} size={15} />{children}</p>;
}

/** Une suite de chiffres (valeur, puis ce qu'elle compte) : chaque ligne est un élément de liste ; un zéro s'atténue (ce n'est pas ce qui compte). */
export function Facts({ rows, className = '' }: { rows: Array<[string, number | null]>; className?: string }) {
    return <ul className={'dv-facts ' + className}>{rows.map(([label, value]) => <li key={label}><b className={value === 0 ? 'zero' : undefined}>{value === null ? '—' : nf(value)}</b><span>{label}</span></li>)}</ul>;
}

/** « Mis à jour le 20/10/2026 à 15:19 » ; rien quand la date est illisible. */
export function updatedText(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '' : `Mis à jour le ${formatShortDate(date)} à ${formatClock(date)}`;
}

/**
 * Pendant une relecture de la même vue, garde les données déjà lues : l'écran ne se vide pas, il s'estompe. Quand la vue change (une autre institution, une autre session),
 * rien n'est gardé : on ne montre jamais les chiffres d'un autre périmètre.
 */
export function useKeptData<T>(data: T | null | undefined, key: string): T | null {
    const kept = useRef<{ key: string; data: T } | null>(null);
    if (data) kept.current = { key, data };
    return data ?? (kept.current && kept.current.key === key ? kept.current.data : null);
}
