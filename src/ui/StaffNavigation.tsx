import { staffHref } from '../core/staffRoutes';
import React, { useRef, useState } from 'react';
import { navigationSections, navIcons, type NavigationItem } from '../design/navigation';
import { Icon } from './icons';
import { useLocale } from './i18n';

const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
type Props = { items: readonly NavigationItem[]; section: string; demo: boolean; onGo: (path: string) => void };

/** La clé de route réinitialise le filtre et ouvre la rubrique de la page sélectionnée. */
export function StaffNavigation(props: Props) {
    return <Navigation key={props.section} {...props} />;
}
function Navigation({ items, section, demo, onGo }: Props) {
    const { tr } = useLocale();
    const groups = navigationSections(items);
    const activeGroup = groups.find(group => group.items.some(item => item.path === section))?.id;
    const [opened, setOpened] = useState<string | null>(() => activeGroup ?? groups[0]?.id ?? null);
    const [query, setQuery] = useState('');
    const input = useRef<HTMLInputElement>(null);
    const terms = normalize(query.trim()).split(/\s+/).filter(Boolean);
    const searching = terms.length > 0;
    const found = groups.map(group => ({...group, items: group.items.filter(item =>
        terms.every(term => normalize(tr(group.label) + ' ' + tr(item.label) + ' ' + item.path).includes(term))
    )})).filter(group => group.items.length > 0);
    const openGroup = opened !== null && !groups.some(group => group.id === opened) ? groups[0]?.id : opened;
    const follow = (event: React.MouseEvent<HTMLAnchorElement>, path: string) => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        onGo(path);
    };
    return <nav aria-label={tr('Navigation principale')}>
        <a href="/app" className={'nx-dashboard ' + (!section ? 'active' : '')} aria-current={!section ? 'page' : undefined} onClick={event => follow(event, '')}>
            <Icon name="dashboard" size={20} /><span>{tr('Tableau de bord')}</span>
        </a>
        <div className="nx-nav-filter">
            <Icon name="search" size={18} />
            <input ref={input} type="search" maxLength={100} aria-label={tr('Filtrer le menu')} placeholder={tr('Rechercher un écran…')} value={query} onChange={event => setQuery(event.target.value)} />
            {query && <button type="button" aria-label={tr('Effacer le filtre du menu')} onClick={() => { setQuery(''); input.current?.focus(); }}><Icon name="close" size={16} /></button>}
        </div>
        {searching && <p className="nx-nav-status" role="status">{tr('Écrans trouvés :')} {found.reduce((sum, group) => sum + group.items.length, 0)}</p>}
        {!found.length && <p className="nx-nav-empty">{tr('Aucun écran accessible ne correspond à ce filtre.')}</p>}
        {found.map(group => {
            const expanded = searching || group.id === openGroup;
            const current = group.id === activeGroup;
            if (group.id === 'access' && group.items.length === 1 && group.items[0]?.path === 'espace-lecteurs') return <a key={group.id} href={staffHref('espace-lecteurs')} className="nx-section-head nx-reader-link" onClick={event => follow(event, 'espace-lecteurs')}><Icon name="eye" size={18} /><span>{tr('Consultation & diffusion')}</span><Icon name="arrow" size={16} /></a>;
            return <section className="nx-section" key={group.id}>
                <button type="button" className={'nx-section-head ' + (current ? 'current' : '')} aria-expanded={expanded} aria-controls={'nav-' + group.id} disabled={searching} onClick={() => setOpened(expanded ? null : group.id)}>
                    <Icon name={group.icon} size={18} /><span>{tr(group.label)}</span><small className="nx-nav-count" aria-hidden="true">{group.items.length}</small><Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={15} />
                </button>
                <div id={'nav-' + group.id} hidden={!expanded} className="nx-items">{group.items.map(item =>
                    <a href={staffHref(item.path)} key={item.path} className={'nx-item ' + (section === item.path ? 'active' : '')} aria-current={section === item.path ? 'page' : undefined} onClick={event => follow(event, item.path)}>
                        <Icon name={navIcons[item.path] ?? 'document'} size={17} /><span>{tr(item.label)}</span>
                        {item.path === 'statistiques' && <em className="nx-beta">{tr('Bêta')}</em>}
                        {!demo && item.demo && <span className="tag">{tr('Maquette')}</span>}
                    </a>
                )}</div>
            </section>;
        })}
    </nav>;
}
