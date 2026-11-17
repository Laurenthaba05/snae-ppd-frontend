import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { Busy, ErrorNotice, useResource } from './components';
export function UserDirectoryOverview({ params }: { params: Record<string, string | number | null | undefined> }) {
    const [open, setOpen] = useState(false);
    return <section className="panel panel-padding"><button type="button" className="btn secondary" aria-expanded={open} onClick={() => setOpen(v => !v)}>Vue d’ensemble des comptes</button>
        {open && <Overview params={params} />}</section>;
}
function Overview({ params }: { params: Record<string, string | number | null | undefined> }) {
    const { api, epoch } = useSession();
    const q = useResource(s => api!.userOverview(params, s), JSON.stringify(['user-overview', params, epoch]));
    if (q.loading) return <Busy />;
    if (q.error) return <ErrorNotice error={q.error} onRetry={q.refresh} />;
    const v = q.data!;
    return <><p>Comptes correspondant aux filtres, sur toutes les pages du périmètre autorisé. Le statut actif ne garantit pas des droits effectifs.</p>
        <div className="stat-grid">{[['Comptes trouvés',v.total],['Actifs',v.active],['Inactifs',v.inactive],['Suspendus',v.suspended],['Archivés',v.archived],['Comptes nominatifs',v.human],['Comptes techniques',v.service],['Sans adresse e-mail',v.missingEmail],['Sans identifiant SSO',v.missingSso],['Sans nom',v.missingName]].map(([name,value]) =>
            <div className="stat-card" key={name}><span>{name}</span><strong>{value}</strong></div>)}</div>
        <button type="button" className="btn small secondary" onClick={q.refresh}>Actualiser les indicateurs</button></>;
}
