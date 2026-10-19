import React from 'react';
import { Icon } from './icons';
import { nf } from './charts';

/** Les pièces communes des tableaux de bord : un indicateur, une carte, la mention d'une rubrique non disponible. */
export function Kpi({ icon, tone, value, label, hint, onClick }: { icon: string; tone: string; value: number | null | undefined; label: string; hint?: string; onClick?: () => void }) {
    const text = value === null || value === undefined ? '—' : nf(value);
    const body = <>
        <span className={'hm-kpi-icon ' + tone}><Icon name={icon} size={26} /></span>
        <span className="hm-kpi-body"><strong>{text}</strong><span>{label}</span></span>
    </>;
    const title = value === null || value === undefined ? 'Non disponible : votre habilitation ne couvre pas cette rubrique dans ce périmètre.' : hint;
    return onClick ? <button type="button" className="hm-kpi" title={title} onClick={onClick}>{body}</button> : <div className="hm-kpi" title={title}>{body}</div>;
}

export function Card({ title, action, children, className = '' }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
    return <section className={'db-card hm-card ' + className}><div className="hm-card-head"><h2>{title}</h2>{action}</div>{children}</section>;
}

/** Une rubrique que la personne n'a pas le droit de lire : on le dit (la phrase est écrite en entier par l'appelant, pour pouvoir être traduite), on ne montre pas un zéro. */
export function Unavailable({ children }: { children: string }) {
    return <p className="db-chart-note">{children}</p>;
}
