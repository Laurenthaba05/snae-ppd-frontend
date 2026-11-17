import React, { useEffect, useState } from 'react';
import { Modal, Empty, Notice } from './components';
import { Icon } from './icons';
import { useLocale } from './i18n';
import './ModuleFinder.css';
type Item = { path: string; label: string; ok: boolean };
const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const MAX = 12;
export function ModuleFinder({ userId, items, onGo }: { userId: string; items: Item[]; onGo: (path: string) => void }) {
    return <Finder key={userId} userId={userId} items={items} onGo={onGo} />;
}
function Finder({ userId, items, onGo }: { userId: string; items: Item[]; onGo: (path: string) => void }) {
    const { tr } = useLocale();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const key = 'snae-module-favorites-v1:' + userId;
    const [favorites, setFavorites] = useState<string[]>(() => {
        try { const raw: unknown = JSON.parse(localStorage.getItem(key) ?? '[]'); return Array.isArray(raw) ? [...new Set(raw.filter((v): v is string => typeof v === 'string' && /^[a-z0-9-]{0,80}$/.test(v)))].slice(0, MAX) : []; }
        catch { return []; }
    });
    const [storageError, setStorageError] = useState(false);
    useEffect(() => {
        const handle = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !event.altKey && !event.repeat) { event.preventDefault(); setOpen(v => !v); setQuery(''); } };
        window.addEventListener('keydown', handle); return () => window.removeEventListener('keydown', handle);
    }, []);
    const available = items.filter((x,i) => x.ok && items.findIndex(y => y.path === x.path) === i);
    const pinned = favorites.filter(path => available.some(x => x.path === path));
    const found = available.filter(x => normalize(tr(x.label)).includes(normalize(query.trim())))
        .sort((a,b) => Number(pinned.includes(b.path)) - Number(pinned.includes(a.path)) || tr(a.label).localeCompare(tr(b.label)));
    const toggle = (path: string) => {
        const next = pinned.includes(path) ? pinned.filter(p => p !== path) : [...pinned, path].slice(0, MAX);
        setFavorites(next);
        try { localStorage.setItem(key, JSON.stringify(next)); setStorageError(false); } catch { setStorageError(true); }
    };
    return <><button type="button" className="nx-icon-btn" aria-label={tr('Trouver un écran')} title={tr('Trouver un écran (Ctrl+K)')} onClick={()=>{setOpen(true);setQuery('');}}><Icon name="search" size={22}/></button>
        {open && <Modal title={tr('Trouver un écran')} subtitle={tr('Recherchez un espace autorisé et gardez vos favoris à portée de main.')} onClose={()=>setOpen(false)}>
            <div className="module-finder"><input autoFocus type="search" maxLength={100} aria-label={tr('Rechercher un écran')} placeholder={tr('Nom de l’écran…')} value={query} onChange={e=>setQuery(e.target.value)}/>
                <p>{tr('Les favoris sont enregistrés dans ce navigateur, pour ce compte. Maximum : 12.')}</p>
                {storageError && <Notice tone="warning">{tr('Le navigateur refuse l’enregistrement. Les favoris restent disponibles pendant cette session.')}</Notice>}
                <ul>{found.map(x=><li key={x.path}><button type="button" className="btn secondary" onClick={()=>{setOpen(false);onGo(x.path);}}>{tr(x.label)}</button>
                    <button type="button" className="btn secondary" aria-label={tr(pinned.includes(x.path)?'Retirer des favoris':'Ajouter aux favoris')+' : '+tr(x.label)} aria-pressed={pinned.includes(x.path)} disabled={!pinned.includes(x.path)&&pinned.length>=MAX} onClick={()=>toggle(x.path)}>{pinned.includes(x.path)?'★':'☆'}</button></li>)}</ul>
                {!found.length && <Empty title={tr('Aucun écran autorisé ne correspond à la recherche.')} />}
            </div></Modal>}
    </>;
}
