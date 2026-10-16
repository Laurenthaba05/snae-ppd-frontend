import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { Busy, ErrorNotice, useResource } from './components';
import { Icon } from './icons';
import { PageViewerDialog } from './PageViewer';
import { metricsText, qualityErrorText, sampleToView, suggestedRescan, summarizeQuality } from '../core/quality';
import { canWith, isWorkingStage } from '../core/workflow';
import type { DigitizationElement, QualityAnalysis, QualityPage } from '../core/types';
import { fileName } from '../core/format';
import { usePolling } from './polling';

const POLL_MS = 8000;

/**
 * Analyse automatique de l'image des pages : pages signalées (floues, inclinées, sombres, peu contrastées, presque blanches) et échantillon
 * à contrôler visuellement. Ce sont des signalements : la décision reste celle du contrôleur, qui renvoie les pages ou justifie de passer outre.
 */
export function QualityPanel({ element, onSendBack }: { element: DigitizationElement; onSendBack?: (pages: number[]) => void }) {
    const { me, digitization, epoch } = useSession();
    const q = useResource<QualityAnalysis>(s => digitization!.qualityAnalysis(element.id, s), 'quality-analysis:' + [element.id, element.statut, element.versionLock].join(':') + ':' + epoch);
    const pages = q.data?.pages ?? [];
    const summary = summarizeQuality({ pages });
    const active = summary.pending > 0;
    usePolling(q.refresh, POLL_MS, active);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const [viewing, setViewing] = useState<QualityPage | null>(null);
    if (q.loading && !q.data) return <Busy label="Lecture de l’analyse des images…" />;
    if (q.error && !q.data) return <ErrorNotice error={q.error} onRetry={q.refresh} />;
    const data = q.data!;
    if (!data.enabled && summary.analyzed === 0) return null;
    const run = async () => {
        setBusy(true); setError(null);
        try { await digitization!.command('/elements/' + element.id + '/quality-analysis/run', {}, crypto.randomUUID(), 'POST'); q.refresh(); }
        catch (e) { setError(e); } finally { setBusy(false); }
    };
    const canRun = data.enabled && canWith(me, 'DIGITIZATION_QC') && isWorkingStage(element.statut) && summary.runnable > 0;
    const flaggedPages = pages.filter(p => p.flagged);
    const extra = sampleToView(data);
    const rescan = suggestedRescan(pages);
    const failed = pages.filter(p => !p.analyzed && p.jobState === 'FAILED');
    return <section className="ocr-jobs quality" aria-label="Analyse automatique des images">
        <div className="section-heading"><h4>Analyse automatique des images</h4>
            <div className="table-actions">
                {canRun && <button type="button" className="btn small secondary" onClick={() => void run()} disabled={busy}><Icon name="refresh" size={15} />{summary.failed ? 'Relancer l’analyse' : 'Analyser les images'}</button>}
                {onSendBack && rescan.length > 0 && <button type="button" className="btn small secondary" onClick={() => onSendBack(rescan)}>Renvoyer {rescan.length > 1 ? 'les ' + rescan.length + ' pages signalées' : 'la page signalée'}</button>}
            </div></div>
        {!data.enabled && <small className="wf-note">L’analyse automatique est désactivée sur ce serveur : les mesures déjà faites restent affichées.</small>}
        <ul className="scan-chips ocr-jobs-chips">
            <li className={summary.analyzed === summary.total && summary.total ? 'ok' : ''}>{summary.analyzed} / {summary.total} page{summary.total > 1 ? 's' : ''} analysée{summary.analyzed > 1 ? 's' : ''}</li>
            <li className={summary.flagged ? 'warn' : 'ok'}>{summary.flagged} signalée{summary.flagged > 1 ? 's' : ''}</li>
            {summary.pending > 0 && <li>{summary.pending} en attente</li>}
            {summary.failed > 0 && <li className="bad">{summary.failed} en échec</li>}
        </ul>
        {error ? <ErrorNotice error={error} /> : null}
        {flaggedPages.length > 0 && <div className="table-scroll"><table className="quality-table"><thead><tr><th>Page</th><th>Signalement</th><th>Mesures</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{flaggedPages.map(p => <tr key={p.fichierId}><td>{p.numeroPage ?? '—'}</td><td>{p.issues.map(i => <span key={i.code} className="quality-issue">{i.message}</span>)}</td><td><small>{metricsText(p)}</small></td><td><button type="button" className="btn small secondary" onClick={() => setViewing(p)}>Voir la page</button></td></tr>)}</tbody></table></div>}
        {failed.length > 0 && <ul className="ocr-jobs-list">{failed.map(p => <li key={p.fichierId}>{fileName(p.numeroPage)} : {qualityErrorText(p.errorCode)}</li>)}</ul>}
        {data.sample.length > 0 && <p className="quality-sample">Échantillon à contrôler visuellement ({Math.round(data.sampleRate * 100)} % des pages, au moins {data.sampleMinimum}) : <strong>{data.sample.map(n => 'p. ' + n).join(', ')}</strong>{extra.length < data.sample.length && <> — dont les pages signalées ci-dessus</>}.</p>}
        {viewing && <PageViewerDialog fichierId={viewing.fichierId} title={fileName(viewing.numeroPage)} images={viewing.images ?? 1} onClose={() => setViewing(null)} />}
    </section>;
}
