import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { can } from '../core/policy';
import { Badge, Busy, ErrorNotice, Notice, PageHead, useResource } from '../ui/components';
import { Icon } from '../ui/icons';
import { SCANNER_TYPES, ScannerDialog, scannerStatusActions } from '../ui/Scanning';
import { ScanProfilesSection } from '../ui/ScanProfiles';
import type { Scanner, ScannerStatus } from '../core/types';

/** Parc de scanners : inventaire du matériel de numérisation (type, recto-verso, résolution maximale, état). */
export function ScannersPage() {
    const { me, digitization, epoch } = useSession();
    const canManage = can(me, 'DIGITIZATION_MANAGE', {});
    const q = useResource<Scanner[]>(s => digitization ? digitization.scanners(s) : Promise.resolve([]), 'scanners:' + epoch);
    const [editing, setEditing] = useState<Scanner | 'new' | null>(null);
    const [error, setError] = useState<unknown>(null);
    const scanners = q.data ?? [];
    const changeStatus = async (scanner: Scanner, to: ScannerStatus) => {
        setError(null);
        try { await digitization!.command(`/scanners/${scanner.id}/status`, { statut: to, expectedVersion: scanner.versionLock }, crypto.randomUUID(), 'POST'); q.refresh(); }
        catch (e) { setError(e); }
    };
    if (!digitization) return <Notice tone="warning">L’inventaire des scanners est disponible en mode connecté.</Notice>;
    return <><PageHead eyebrow="MODULE · NUMÉRISATION" title="Scanners" description="Inventaire du matériel de numérisation. Chaque lot précise le scanner utilisé, la résolution, le mode couleur et le recto-verso.">
        {canManage && <button className="btn primary" onClick={() => setEditing('new')}><Icon name="plus" size={18} />Ajouter un scanner</button>}</PageHead>
        <div className="panel">
            {error ? <ErrorNotice error={error} /> : null}
            {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : scanners.length ? <div className="table-scroll"><table>
                <thead><tr><th>Scanner</th><th>Type</th><th>Recto-verso</th><th>Résolution max.</th><th>Emplacement</th><th>Statut</th><th /></tr></thead>
                <tbody>{scanners.map(s => <tr key={s.id}><td><strong>{s.nom}</strong><small className="cell-sub">{s.code}{s.fabricant || s.modele ? ' · ' + [s.fabricant, s.modele].filter(Boolean).join(' ') : ''}{s.numeroSerie ? ' · S/N ' + s.numeroSerie : ''}</small></td>
                    <td>{SCANNER_TYPES[s.typeScanner]}</td><td>{s.rectoVerso ? 'Oui' : 'Non'}</td><td>{s.resolutionMaxDpi ? s.resolutionMaxDpi + ' dpi' : '—'}</td><td>{s.localisation ?? '—'}</td><td><Badge value={s.statut} /></td>
                    <td className="table-actions">{canManage && s.statut !== 'RETIRE' && <button className="btn small secondary" onClick={() => setEditing(s)}>Modifier</button>}{canManage && scannerStatusActions[s.statut].map(a => <button key={a.to} className={'btn small ' + (a.to === 'RETIRE' ? 'warning' : 'secondary')} onClick={() => void changeStatus(s, a.to)}>{a.label}</button>)}</td></tr>)}</tbody></table></div>
                : <p className="page-note">Aucun scanner enregistré. Ajoutez le matériel de l’atelier pour pouvoir l’associer aux lots de numérisation.</p>}
        </div>
        {editing && <ScannerDialog scanner={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={q.refresh} />}
        <ScanProfilesSection />
    </>;
}
