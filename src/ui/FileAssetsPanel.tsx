import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { Busy, ErrorNotice, useResource } from './components';
import { Icon } from './icons';
import { PageViewerDialog } from './PageViewer';
import { assetErrorText, copyLines, detailsText, formatText, imageCount, summarizeAssets } from '../core/assets';
import { canWith, isWorkingStage } from '../core/workflow';
import type { DigitizationElement, FileAssetItem, FileAssets } from '../core/types';
import { fileName } from '../core/format';
import { usePolling } from './polling';

const POLL_MS = 8000;

function Cell({ item }: { item: FileAssetItem }) {
    const f = item.format;
    if (!f) return <>{item.identifyState === 'QUEUED' || item.identifyState === 'RUNNING' ? <small>identification en cours…</small>
        : item.identifyState === 'FAILED' ? <small className="asset-bad">{assetErrorText(item.identifyError)}</small> : <small>—</small>}</>;
    return <><strong>{formatText(f)}</strong>{f.puid && <small className="cell-sub" title="Identifiant PRONOM : correspondance interne à confirmer avec Siegfried ou DROID">PRONOM {f.puid}</small>}
        <small className="cell-sub">{detailsText(f)}</small></>;
}

function Copies({ item, onView }: { item: FileAssetItem; onView: () => void }) {
    if (item.derivatives.length) return <>{copyLines(item.derivatives).map(line => <small key={line} className="cell-sub">{line}</small>)}
        <button type="button" className="btn small secondary" onClick={onView}>Voir</button></>;
    if (!item.mediaType.startsWith('image/')) return <small>—</small>;
    if (item.deriveState === 'QUEUED' || item.deriveState === 'RUNNING') return <small>copie en cours…</small>;
    if (item.deriveState === 'FAILED') return <small className="asset-bad">{assetErrorText(item.deriveError)}</small>;
    return <small>—</small>;
}

/**
 * Format de chaque fichier de page (d'après le contenu, pas le nom) et copies de consultation : de quoi voir une page avant la validation du maître.
 * Les constats (fichier corrompu, type déclaré différent, format avec perte comme maître) sont des informations pour les archivistes.
 */
export function FileAssetsPanel({ element }: { element: DigitizationElement }) {
    const { me, digitization, epoch } = useSession();
    const q = useResource<FileAssets>(s => digitization!.fileAssets(element.id, s), 'file-assets:' + [element.id, element.statut, element.versionLock].join(':') + ':' + epoch);
    const items = q.data?.items ?? [];
    const summary = summarizeAssets(items);
    const active = summary.pending > 0;
    usePolling(q.refresh, POLL_MS, active);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const [viewing, setViewing] = useState<FileAssetItem | null>(null);
    if (q.loading && !q.data) return <Busy label="Lecture des formats et des copies…" />;
    if (q.error && !q.data) return <ErrorNotice error={q.error} onRetry={q.refresh} />;
    const data = q.data!;
    const enabled = data.identificationEnabled || data.derivativesEnabled;
    const hasHistory = items.some(i => i.format || i.derivatives.length || i.identifyState || i.deriveState);
    if (!enabled && !hasHistory) return null;
    const canRun = enabled && (canWith(me, 'DIGITIZATION_SCAN') || canWith(me, 'DIGITIZATION_QC')) && isWorkingStage(element.statut) && summary.runnable > 0;
    const run = async () => {
        setBusy(true); setError(null);
        try { await digitization!.command('/elements/' + element.id + '/file-assets/run', {}, crypto.randomUUID(), 'POST'); q.refresh(); }
        catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <section className="ocr-jobs assets" aria-label="Formats et copies de consultation">
        <div className="section-heading"><h4>Formats et copies de consultation</h4>
            {canRun && <button type="button" className="btn small secondary" onClick={() => void run()} disabled={busy}><Icon name="refresh" size={15} />{summary.failed ? 'Relancer' : 'Identifier et copier'}</button>}</div>
        {!enabled && <small className="wf-note">L’identification des formats et les copies sont désactivées sur ce serveur : les résultats déjà obtenus restent affichés.</small>}
        <ul className="scan-chips ocr-jobs-chips">
            <li className={summary.identified === summary.total && summary.total ? 'ok' : ''}>{summary.identified} / {summary.total} format{summary.identified > 1 ? 's' : ''} identifié{summary.identified > 1 ? 's' : ''}</li>
            <li>{summary.withCopies} copie{summary.withCopies > 1 ? 's' : ''} de consultation</li>
            {summary.withFindings > 0 && <li className="warn">{summary.withFindings} avec constat</li>}
            {summary.pending > 0 && <li>{summary.pending} en cours</li>}
            {summary.failed > 0 && <li className="bad">{summary.failed} en échec</li>}
        </ul>
        {error ? <ErrorNotice error={error} /> : null}
        {items.length > 0 && <div className="table-scroll"><table className="assets-table"><thead><tr><th>Page</th><th>Format</th><th>Constats</th><th>Copies</th></tr></thead>
            <tbody>{items.map(item => <tr key={item.fichierId}>
                <td>{item.numeroPage ?? '—'}</td>
                <td><Cell item={item} /></td>
                <td>{item.format?.findings.length ? item.format.findings.map(f => <span key={f.code} className="quality-issue">{f.message}</span>) : <small>—</small>}</td>
                <td><Copies item={item} onView={() => setViewing(item)} /></td></tr>)}</tbody></table></div>}
        {viewing && <PageViewerDialog fichierId={viewing.fichierId} title={fileName(viewing.numeroPage)} images={imageCount(viewing)} onClose={() => setViewing(null)} />}
    </section>;
}
