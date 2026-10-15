import { ResourceDetailsButton } from '../ui/ResourceDetails';
import React, { useState, useRef } from 'react';
import { useSession } from '../auth/session';
import { can } from '../core/policy';
import { Badge, Busy, ErrorNotice, Notice, PageHead, useResource } from '../ui/components';
import { Icon } from '../ui/icons';
import { SCANNER_TYPES, ScannerDialog, scannerStatusActions } from '../ui/Scanning';
import { ScanProfilesSection } from '../ui/ScanProfiles';
import { ScannerWorkspace } from '../ui/ScannerCapture';
import type { Scanner, ScannerStatus } from '../core/types';

/** Parc de scanners : inventaire du matériel de numérisation (type, recto-verso, résolution maximale, état). */
export function ScannersPage() {
    const [tab, setTab] = useState<'capture' | 'inventory'>('capture');
    const [pending, setPending] = useState(false);
    const statusLock = useRef(false);
    const { me, digitization, epoch } = useSession();
    const canManage = can(me, 'DIGITIZATION_MANAGE', {});
    const canRead = can(me, 'DIGITIZATION_READ', {});
    const q = useResource<Scanner[]>(s => digitization && canRead ? digitization.scanners(s) : Promise.resolve([]), 'scanners:' + epoch);
    const [editing, setEditing] = useState<Scanner | 'new' | null>(null);
    const [error, setError] = useState<unknown>(null);
    const scanners = q.data ?? [];
    const changeStatus = async (scanner: Scanner, to: ScannerStatus) => {
        if (statusLock.current) return;
        statusLock.current = true; setPending(true); setError(null);
        try { await digitization!.command(`/scanners/${scanner.id}/status`, { statut: to, expectedVersion: scanner.versionLock }, crypto.randomUUID(), 'POST'); q.refresh(); }
        catch (e) { setError(e); }
        finally { statusLock.current = false; setPending(false); }
    };
    if (!digitization) return <Notice tone="warning">L’inventaire des scanners est disponible en mode connecté.</Notice>;
    return <><PageHead eyebrow="MODULE · NUMÉRISATION" title="Scanners" description="Numériser un document, vérifier le résultat et le déposer dans les archives. Le parc et les profils de qualité restent accessibles ici.">
        {tab === 'inventory' && canManage && <button className="btn primary" onClick={() => setEditing('new')}><Icon name="plus" size={18} />Ajouter un scanner</button>}</PageHead>
        <nav className="acq-tabs" aria-label="Module Scanners">
            <button className={tab === 'capture' ? 'active' : ''} aria-current={tab === 'capture' ? 'page' : undefined} onClick={() => setTab('capture')}>Numériser un document</button>
            <button disabled={!canRead} className={tab === 'inventory' ? 'active' : ''} aria-current={tab === 'inventory' ? 'page' : undefined} onClick={() => setTab('inventory')}>Parc et profils de qualité</button>
        </nav>
        <div hidden={tab !== 'capture'}><ScannerWorkspace /></div>
        <div hidden={tab !== 'inventory'}><div className="panel">
            {error ? <ErrorNotice error={error} /> : null}
            {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : scanners.length ? <div className="table-scroll"><table>
                <thead><tr><th>Scanner</th><th>Type</th><th>Recto-verso</th><th>Résolution max.</th><th>Emplacement</th><th>Statut</th><th /></tr></thead>
                <tbody>{scanners.map(s => <tr key={s.id}><td><strong>{s.nom}</strong><small className="cell-sub">{s.code}{s.fabricant || s.modele ? ' · ' + [s.fabricant, s.modele].filter(Boolean).join(' ') : ''}{s.numeroSerie ? ' · S/N ' + s.numeroSerie : ''}</small></td>
                    <td>{SCANNER_TYPES[s.typeScanner]}</td><td>{s.rectoVerso ? 'Oui' : 'Non'}</td><td>{s.resolutionMaxDpi ? s.resolutionMaxDpi + ' dpi' : '—'}</td><td>{s.localisation ?? '—'}</td><td><Badge value={s.statut} /></td>
                    <td className="table-actions"><ResourceDetailsButton resource="scanner" id={s.id} title={s.nom} />{canManage && s.statut !== 'RETIRE' && <button className="btn small secondary" onClick={() => setEditing(s)}>Modifier</button>}{canManage && scannerStatusActions[s.statut].map(a => <button key={a.to} className={'btn small ' + (a.to === 'RETIRE' ? 'warning' : 'secondary')} disabled={pending} onClick={() => void changeStatus(s, a.to)}>{a.label}</button>)}</td></tr>)}</tbody></table></div>
                : <p className="page-note">Aucun scanner enregistré. Ajoutez le matériel de l’atelier pour pouvoir l’associer aux lots de numérisation.</p>}
        </div>
        {editing && <ScannerDialog scanner={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={q.refresh} />}
        <ScanProfilesSection /></div>
    </>;
}
