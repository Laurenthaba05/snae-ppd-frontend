import React, { useEffect, useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { Busy, ErrorNotice, useResource } from './components';
import { Icon } from './icons';
import { ocrErrorText, summarizeOcrJobs } from '../core/ocrJobs';
import { canWith, isWorkingStage } from '../core/workflow';
import type { DigitizationElement, OcrJobs } from '../core/types';
import { fileName } from '../core/format';

const POLL_MS = 8000;

/**
 * OCR automatique des pages d'un élément : ce qui est en attente, en cours, reconnu ou en échec, et le lancement ou la relance.
 * Le texte reconnu reste « non validé » : une personne le valide dans « OCR et indexation » avant qu'il n'alimente la recherche.
 */
export function OcrJobsPanel({ element }: { element: DigitizationElement }) {
    const { me, digitization, epoch } = useSession();
    const q = useResource<OcrJobs>(s => digitization!.ocrJobs(element.id, s), 'ocr-jobs:' + [element.id, element.statut, element.versionLock].join(':') + ':' + epoch);
    const items = q.data?.items ?? [];
    const summary = summarizeOcrJobs(items);
    const refresh = useRef(q.refresh);
    refresh.current = q.refresh;
    useEffect(() => {
        if (!summary.active) return;
        const timer = setInterval(() => refresh.current(), POLL_MS);
        return () => clearInterval(timer);
    }, [summary.active]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    if (q.loading && !q.data) return <Busy label="Lecture de l’état de l’OCR…" />;
    if (q.error && !q.data) return <ErrorNotice error={q.error} onRetry={q.refresh} />;
    const enabled = q.data?.enabled ?? false;
    const history = items.some(i => i.state !== null || i.hasText);
    if (!enabled && !history) return null;
    const canRun = enabled && canWith(me, 'DIGITIZATION_OCR') && isWorkingStage(element.statut) && summary.runnable > 0;
    const run = async () => {
        setBusy(true); setError(null);
        try { await digitization!.command('/elements/' + element.id + '/ocr/run', {}, crypto.randomUUID(), 'POST'); q.refresh(); }
        catch (e) { setError(e); } finally { setBusy(false); }
    };
    const failures = items.filter(i => i.state === 'FAILED' && !i.hasText);
    const noText = items.filter(i => i.state === 'DONE' && !i.hasText);
    return <section className="ocr-jobs" aria-label="OCR automatique">
        <div className="section-heading"><h4>OCR automatique</h4><button type="button" className="btn small secondary" onClick={q.refresh} disabled={q.loading || busy}>Actualiser l’OCR</button>
            {canRun && <button type="button" className="btn small secondary" onClick={() => void run()} disabled={busy}><Icon name="refresh" size={15} />{summary.failed || summary.noText ? 'Relancer l’OCR' : 'Lancer l’OCR'}</button>}</div>
        {!enabled && <small className="wf-note">L’OCR automatique est désactivé sur ce serveur.</small>}
        <ul className="scan-chips ocr-jobs-chips">
            <li className={summary.withText === summary.total && summary.total ? 'ok' : ''}>{summary.withText} / {summary.total} texte{summary.withText > 1 ? 's' : ''} reconnu{summary.withText > 1 ? 's' : ''}</li>
            {summary.queued > 0 && <li>{summary.queued} en attente</li>}
            {summary.running > 0 && <li className="warn">{summary.running} en cours</li>}
            {summary.failed > 0 && <li className="bad">{summary.failed} en échec</li>}
            {summary.noText > 0 && <li className="warn">{summary.noText} sans texte</li>}
        </ul>
        {error ? <ErrorNotice error={error} /> : null}
        {failures.length > 0 && <ul className="ocr-jobs-list">{failures.map(i => <li key={i.fichierId}>{fileName(i.numeroPage)} : {ocrErrorText(i.errorCode)}</li>)}</ul>}
        {noText.length > 0 && <small className="wf-note">Aucun texte reconnu : {noText.map(i => i.numeroPage ? 'page ' + i.numeroPage : 'fichier sans numéro de page').join(', ')}. Page blanche, photographie ou écriture illisible : le contrôle qualité décidera.</small>}
    </section>;
}
