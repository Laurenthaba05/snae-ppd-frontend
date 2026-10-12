import React, { useEffect, useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { Busy, Empty, ErrorNotice, Notice, PageHead, Pagination, useResource } from './components';
import { Icon } from './icons';
import { useLocale } from './i18n';
import { navigate } from './navigation';
import { useAction } from './ReadingRoomParts';
import {
    CATEGORY_HINTS, FILTERS, POLL_MS, bellLabel, categoryLabel, notificationPath, relativeTime, unreadBadge,
    type NotificationFilter, type NotificationPage, type NotificationPreference, type StaffNotification
} from '../core/notifications';

/** Le compteur de non lues, relu toutes les minutes tant que la page est visible. */
function useUnread(refreshKey: number): { count: number; reload: () => void } {
    const { notifications, epoch } = useSession();
    const [tick, setTick] = useState(0);
    useEffect(() => {
        if (!notifications) return;
        const timer = setInterval(() => { if (typeof document === 'undefined' || document.visibilityState !== 'hidden') setTick(n => n + 1); }, POLL_MS);
        return () => clearInterval(timer);
    }, [notifications]);
    const q = useResource<{ unread: number } | null>(async s => notifications ? await notifications.unread(s).catch(() => null) : null, `notifications-unread:${tick}:${refreshKey}:${epoch}`);
    return { count: q.data?.unread ?? 0, reload: () => setTick(n => n + 1) };
}

/** La cloche de l'en-tête : le nombre de non lues et, ouverte, les dernières notifications. Sans client des notifications (démonstration), elle reste inerte. */
export function NotificationBell({ open, onToggle, onClose }: { open: boolean; onToggle: () => void; onClose: () => void }) {
    const { notifications } = useSession();
    const { tr } = useLocale();
    const [revision, setRevision] = useState(0);
    const unread = useUnread(revision);
    if (!notifications) return <button type="button" className="nx-icon-btn" aria-label={tr('Notifications')} title={tr('Aucune notification disponible pour le moment')}><Icon name="bell" size={22} /></button>;
    const badge = unreadBadge(unread.count);
    return <div className="nx-pop">
        <button type="button" className="nx-icon-btn" aria-label={bellLabel(unread.count)} aria-haspopup="true" aria-expanded={open} onClick={onToggle}>
            <Icon name="bell" size={22} />{badge && <span className="nx-badge" aria-hidden="true">{badge}</span>}
        </button>
        {open && <NotificationPopover onClose={onClose} onChanged={() => { setRevision(n => n + 1); unread.reload(); }} />}
    </div>;
}

function NotificationPopover({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
    const { notifications, epoch } = useSession();
    const { tr } = useLocale();
    const [revision, setRevision] = useState(0);
    const action = useAction();
    const q = useResource<NotificationPage>(s => notifications!.list('ALL', 0, s), `notifications-popover:${revision}:${epoch}`);
    const last = useRef<NotificationPage | null>(null);
    if (q.data) last.current = q.data;
    const data = q.data ?? last.current;
    const items = (data?.items ?? []).slice(0, 8);
    const changed = () => { setRevision(n => n + 1); onChanged(); };
    const openItem = async (n: StaffNotification) => {
        if (!n.read) await action.run({ read: n.id }, key => notifications!.markRead(n.id, key));
        const path = notificationPath(n.objectType, n.objectId);
        changed();
        if (path) { onClose(); navigate(path); }
    };
    const readAll = async () => { if (await action.run({ readAll: revision }, key => notifications!.markAllRead(key))) changed(); };
    return <div className="nx-menu notifications" role="region" aria-label={tr('Notifications')}>
        <div className="notification-head"><strong>{tr('Notifications')}</strong>
            <button type="button" className="text-link" disabled={action.busy || (data?.unread ?? 0) === 0} onClick={readAll}>{tr('Tout marquer comme lu')}</button></div>
        {action.error ? <ErrorNotice error={action.error} /> : null}
        {q.loading && !data ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} />
            : items.length === 0 ? <p className="notification-empty">{tr('Aucune notification pour le moment.')}</p>
                : <ul className="notification-list">{items.map(n => <li key={n.id}>
                    <button type="button" className={`notification-item${n.read ? '' : ' unread'}`} onClick={() => openItem(n)} disabled={action.busy}>
                        <span className="notification-title">{n.title}</span>
                        {n.message && <span className="notification-message">{n.message}</span>}
                        <small>{tr(categoryLabel(n.category))} · {relativeTime(n.createdAt)}</small>
                    </button></li>)}</ul>}
        <div className="notification-foot"><button type="button" className="text-link" onClick={() => { onClose(); navigate('/app/notifications'); }}>{tr('Voir toutes les notifications')}</button></div>
    </div>;
}

/** La page des notifications : la boîte avec ses filtres, l'ouverture, la lecture et l'archivage, et les préférences par catégorie. */
export function NotificationsPage() {
    const { notifications, epoch } = useSession();
    const { tr } = useLocale();
    const [filter, setFilter] = useState<NotificationFilter>('UNREAD');
    const [page, setPage] = useState(0);
    const [revision, setRevision] = useState(0);
    const action = useAction();
    const q = useResource<NotificationPage | null>(s => notifications ? notifications.list(filter, page, s) : Promise.resolve(null), `notifications-page:${filter}:${page}:${revision}:${epoch}`);
    // pendant une relecture, la dernière liste du même filtre reste affichée : la page ne clignote pas à chaque action
    const last = useRef<{ key: string; data: NotificationPage } | null>(null);
    const key = `${filter}:${page}`;
    if (q.data) last.current = { key, data: q.data };
    const data = q.data ?? (last.current?.key === key ? last.current.data : undefined);
    const items = data?.items ?? [];
    const changed = () => setRevision(n => n + 1);
    if (!notifications) return <>
        <PageHead eyebrow={tr('MON ESPACE')} title={tr('Mes notifications')} description={tr('Ce qui attend votre action : tâches de validation, versements à contrôler, décisions sur vos versements.')} />
        <Notice>{tr('Les notifications ne sont pas disponibles en démonstration.')}</Notice>
    </>;
    const read = async (n: StaffNotification) => { if (await action.run({ read: n.id }, key => notifications.markRead(n.id, key))) changed(); };
    const archive = async (n: StaffNotification) => { if (await action.run({ archive: n.id }, key => notifications.archive(n.id, key))) changed(); };
    const readAll = async () => { if (await action.run({ readAll: revision }, key => notifications.markAllRead(key))) changed(); };
    const open = async (n: StaffNotification) => {
        if (!n.read) await action.run({ read: n.id }, key => notifications.markRead(n.id, key));
        const path = notificationPath(n.objectType, n.objectId);
        if (path) navigate(path); else changed();
    };
    return <>
        <PageHead eyebrow={tr('MON ESPACE')} title={tr('Mes notifications')} description={tr('Ce qui attend votre action : tâches de validation, versements à contrôler, décisions sur vos versements.')}>
            <button type="button" className="btn secondary" disabled={action.busy || (data?.unread ?? 0) === 0} onClick={readAll}>{tr('Tout marquer comme lu')}</button>
        </PageHead>
        <div role="tablist" className="asset-tabs page-tabs" aria-label={tr('Filtre des notifications')}>
            {FILTERS.map(([key, text]) => <button key={key} role="tab" type="button" aria-selected={filter === key} className={filter === key ? 'active' : ''}
                onClick={() => { setFilter(key); setPage(0); }}>{tr(text)}{key === 'UNREAD' && data && data.unread > 0 ? ` (${data.unread})` : ''}</button>)}
        </div>
        {action.error ? <ErrorNotice error={action.error} /> : null}
        <section className="panel" aria-label={tr('Notifications')}>
            {q.loading && !data ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} />
                : items.length === 0 ? <Empty title={filter === 'UNREAD' ? 'Rien ne vous attend' : filter === 'ARCHIVED' ? 'Aucune notification archivée' : 'Aucune notification'}
                    description={filter === 'UNREAD' ? 'Toutes vos notifications sont lues.' : 'La boîte est vide.'} icon="bell" />
                    : <ul className="notification-rows">{items.map(n => {
                        const path = notificationPath(n.objectType, n.objectId);
                        return <li key={n.id} className={n.read ? 'read' : 'unread'}>
                            <div><strong>{n.title}</strong>{n.message && <p>{n.message}</p>}<small>{tr(categoryLabel(n.category))} · {relativeTime(n.createdAt)}</small></div>
                            <div className="notification-actions">
                                {path && <button type="button" className="btn small primary" disabled={action.busy} onClick={() => open(n)}>{tr('Ouvrir')}</button>}
                                {!n.read && <button type="button" className="btn small secondary" disabled={action.busy} onClick={() => read(n)}>{tr('Marquer comme lue')}</button>}
                                {!n.archivedAt && <button type="button" className="btn small secondary" disabled={action.busy} onClick={() => archive(n)}>{tr('Archiver')}</button>}
                            </div>
                        </li>;
                    })}</ul>}
            {data && <Pagination page={page} hasMore={data.hasMore} onChange={setPage} count={items.length} />}
        </section>
        <NotificationPreferences />
    </>;
}

function NotificationPreferences() {
    const { notifications, epoch } = useSession();
    const { tr } = useLocale();
    const [revision, setRevision] = useState(0);
    const action = useAction();
    const q = useResource<NotificationPreference[]>(s => notifications!.preferences(s), `notification-preferences:${revision}:${epoch}`);
    const change = async (category: string, enabled: boolean) => {
        if (await action.run({ category, enabled }, key => notifications!.setPreference(category, enabled, key))) setRevision(n => n + 1);
    };
    return <section className="panel" aria-label={tr('Préférences de notification')}>
        <div className="section-heading"><h3>{tr('Ce que vous souhaitez recevoir')}</h3></div>
        <div className="panel-padding">
            {action.error ? <ErrorNotice error={action.error} /> : null}
            {q.loading && !q.data ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} />
                : <ul className="notification-prefs">{(q.data ?? []).map(p => <li key={p.category}>
                    <label><input type="checkbox" checked={p.enabled} disabled={action.busy} onChange={e => change(p.category, e.target.checked)} />
                        <span><strong>{tr(categoryLabel(p.category))}</strong><small>{tr(CATEGORY_HINTS[p.category] ?? '')}</small></span></label></li>)}</ul>}
            <p><small>{tr('Une catégorie refusée ne dépose plus rien dans votre boîte ; les décisions et les tâches elles-mêmes restent consultables dans leurs écrans.')}</small></p>
        </div>
    </section>;
}
