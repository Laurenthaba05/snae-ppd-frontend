import { ResourceDetailsButton } from '../ui/ResourceDetails';
import { AuditChainPanel } from '../ui/AuditChainPanel';
import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { PageHead, Busy, ErrorNotice, Empty, Pagination, useResource, CopyId, formatDate, Modal } from '../ui/components';
import { Icon } from '../ui/icons';
import type { AuditEvent, Page, User } from '../core/types';
import { display, label } from '../core/format';
function useUserNames() {
    const { api, epoch } = useSession();
    const q = useResource<Page<User>>(s => api!.list<User>('users', { page: 0, size: 100 }, s), 'users-lookup:' + epoch);
    return (id: string | null) => {
        if (!id)
            return null;
        const u = q.data?.items.find(x => x.id === id);
        if (!u)
            return 'Utilisateur';
        return [u.prenom, u.nom].filter(Boolean).join(' ') || u.email || 'Utilisateur';
    };
}
function actorLabel(event: AuditEvent, userName: (id: string | null) => string | null): string {
    if (event.actorType === 'USER')
        return userName(event.userId) ?? 'Utilisateur';
    return event.actorType + (event.actorExternalId ? ' · ' + event.actorExternalId : '');
}
export function AuditDetailDialog({ event, onClose }: {
    event: AuditEvent;
    onClose: () => void;
}) {
    const userName = useUserNames();
    return <Modal title={event.action} subtitle={event.objectType + (event.objectReference ? ' · ' + event.objectReference : '')} onClose={onClose} wide>
        <ResourceDetailsButton resource="auditEvent" id={event.id} label="Relire l’événement complet" /><div className="form-grid">
            <dl className="detail-card"><div><dt>Acteur</dt><dd>{actorLabel(event, userName)}</dd></div>
                <div><dt>Résultat</dt><dd>{label('outcome', event.result)}{event.resultCode ? ' · ' + event.resultCode : ''}</dd></div>
                <div><dt>Survenu le</dt><dd>{formatDate(event.occurredAt)}</dd></div>
                <div><dt>Corrélation</dt><dd>{event.correlationId ?? '—'}</dd></div>
                <div><dt>Empreinte</dt><dd className="mono">{event.eventHash}</dd></div>
                <div><dt>Empreinte précédente</dt><dd className="mono">{event.previousHash ?? '—'}</dd></div>
            </dl>
            {event.before != null && <div><h3>Avant</h3><pre>{JSON.stringify(event.before, null, 2)}</pre></div>}
            {event.after != null && <div><h3>Après</h3><pre>{JSON.stringify(event.after, null, 2)}</pre></div>}
        </div>
        <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose}>Fermer</button></footer>
    </Modal>;
}
export function AuditEventsTable({ rows, onSelect }: {
    rows: AuditEvent[];
    onSelect: (event: AuditEvent) => void;
}) {
    const userName = useUserNames();
    return <div className="table-scroll"><table><thead><tr><th>Action</th><th>Objet</th><th>Acteur</th><th>Résultat</th><th>Date</th></tr></thead><tbody>{rows.map(e => <tr key={e.id}><td><button className="record-name" onClick={() => onSelect(e)}><strong><code>{e.action}</code></strong><small>{display(e.category)}</small></button></td><td>{e.objectType}{e.objectId && <><br /><CopyId value={e.objectId}/></>}</td><td>{actorLabel(e, userName)}</td><td>{label('outcome', e.result)}</td><td>{formatDate(e.occurredAt)}</td></tr>)}</tbody></table></div>;
}
export function AuditPage() {
    const { audit, epoch } = useSession();
    const [category, setCategory] = useState('');
    const [page, setPage] = useState(0);
    const [selected, setSelected] = useState<AuditEvent | null>(null);
    const size = 20;
    const q = useResource(s => audit!.recentEvents(category || null, page, size, s), JSON.stringify(['audit', category, page, epoch]));
    const rows = q.data?.items ?? [];
    return <><PageHead eyebrow="MODULE · TRAÇABILITÉ" title="Journal d’audit" description="Journal inviolable, à chaîne de hachage, de toutes les actions métier du système."/>
        <AuditChainPanel />
        <div className="panel"><div className="table-toolbar"><div className="input-icon search-box"><Icon name="search"/><input aria-label="Filtrer par catégorie" placeholder="Catégorie (ex. RETENTION, RECORDS, PUBLICATION…)" value={category} onChange={e => { setCategory(e.target.value); setPage(0); }}/></div><div className="toolbar-right"><button className="icon-btn" aria-label="Actualiser" onClick={q.refresh}><Icon name="refresh" size={18}/></button></div></div>
        {q.loading ? <Busy /> : q.error ? <div className="panel-padding"><ErrorNotice error={q.error} onRetry={q.refresh}/></div> : rows.length ? <><AuditEventsTable rows={rows} onSelect={setSelected}/><Pagination page={page} hasMore={q.data!.hasMore} count={rows.length} onChange={setPage}/></> : <Empty title="Aucun événement" description="Aucune action journalisée pour ce filtre."/>}
        </div>
        {selected && <AuditDetailDialog event={selected} onClose={() => setSelected(null)}/>}
        </>;
}
