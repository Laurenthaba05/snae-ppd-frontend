import React, { useEffect, useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { Busy, ErrorNotice, formatDate, useResource } from './components';
import { Icon } from './icons';
import { accessPdfErrorText, accessPdfState, canGenerate, generateLabel, missingText, volumeFileName, volumeLabel } from '../core/accessPdf';
import { canWith } from '../core/workflow';
import type { AccessPdf, AccessPdfPart, DigitizationElement } from '../core/types';

const POLL_MS = 8000;

/** Ouvre le PDF dans un nouvel onglet ; si le navigateur bloque la fenêtre, le fichier est téléchargé. L'adresse temporaire est libérée ensuite. */
function openBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const opened = window.open(url, '_blank', 'noopener');
    if (!opened) {
        const link = document.createElement('a');
        link.href = url; link.download = fileName; link.rel = 'noopener';
        document.body.appendChild(link); link.click(); link.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/**
 * PDF d'accès de l'élément : ses copies de consultation assemblées dans l'ordre des pages, en un ou plusieurs volumes. C'est une copie de
 * lecture, sans couche de texte : le maître et les pages ne changent pas. Après une page rescannée, le PDF existant est signalé « à régénérer ».
 */
export function AccessPdfPanel({ element }: { element: DigitizationElement }) {
    const { me, digitization, epoch } = useSession();
    const q = useResource<AccessPdf>(s => digitization!.accessPdf(element.id, s), 'access-pdf:' + [element.id, element.statut, element.versionLock].join(':') + ':' + epoch);
    const refresh = useRef(q.refresh);
    refresh.current = q.refresh;
    const running = q.data?.tache?.state === 'QUEUED' || q.data?.tache?.state === 'RUNNING';
    useEffect(() => {
        if (!running) return;
        const timer = setInterval(() => refresh.current(), POLL_MS);
        return () => clearInterval(timer);
    }, [running]);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<unknown>(null);
    if (q.loading && !q.data) return <Busy label="Lecture du PDF d’accès…" />;
    if (q.error && !q.data) return <ErrorNotice error={q.error} onRetry={q.refresh} />;
    const view = q.data!;
    const state = accessPdfState(view);
    if (state === 'DISABLED' || state === 'NO_PAGES') return null;
    const mayRequest = (canWith(me, 'DIGITIZATION_SCAN') || canWith(me, 'DIGITIZATION_QC')) && element.statut !== 'ANNULE';
    const generate = async () => {
        setBusy('generate'); setError(null);
        try { await digitization!.command('/elements/' + element.id + '/access-pdf', {}, crypto.randomUUID(), 'POST'); q.refresh(); }
        catch (e) { setError(e); } finally { setBusy(null); }
    };
    const open = async (part: AccessPdfPart) => {
        setBusy('part:' + part.partNo); setError(null);
        try { openBlob(await digitization!.accessPdfPart(element.id, part.partNo), volumeFileName(part)); }
        catch (e) { setError(e); } finally { setBusy(null); }
    };
    const failure = view.tache?.state === 'FAILED' ? accessPdfErrorText(view.tache.errorCode) : null;
    return <section className="ocr-jobs assets access-pdf" aria-label="PDF d’accès">
        <div className="section-heading"><h4>PDF d’accès</h4>
            {mayRequest && canGenerate(view) && <button type="button" className="btn small secondary" onClick={() => void generate()} disabled={busy !== null}><Icon name="refresh" size={15} />{generateLabel(view)}</button>}</div>
        <ul className="scan-chips ocr-jobs-chips">
            <li>{view.pages} page{view.pages > 1 ? 's' : ''}</li>
            {state === 'UP_TO_DATE' && <li className="ok">à jour</li>}
            {state === 'STALE' && <li className="warn">à régénérer : les pages ont changé</li>}
            {state === 'RUNNING' && <li>génération en cours…</li>}
            {state === 'FAILED' && <li className="bad">échec</li>}
            {state === 'NOT_GENERATED' && <li>pas encore généré</li>}
            {state === 'WAITING_COPIES' && <li className="warn">{view.copiesManquantes.length} sans copie de consultation</li>}
        </ul>
        {state === 'WAITING_COPIES' && <small className="wf-note">Le PDF est assemblé à partir des copies de consultation : il manque celles des {missingText(view.copiesManquantes)}. Lancez d’abord les copies.</small>}
        {failure && <small className="asset-bad">{state === 'FAILED' || state === 'STALE' ? 'Dernière génération en échec : ' + failure + '.' : failure}</small>}
        {error ? <ErrorNotice error={error} /> : null}
        {view.volumes.length > 0 && <>
            <ul className="access-pdf-volumes">{view.volumes.map(part => <li key={part.partNo}>
                <span>{volumeLabel(part)}</span>
                <button type="button" className="btn small secondary" onClick={() => void open(part)} disabled={busy !== null}>{busy === 'part:' + part.partNo ? 'Ouverture…' : 'Ouvrir'}</button></li>)}</ul>
            {view.genereLe && <small className="wf-note">Généré le {formatDate(view.genereLe)}. Copie de lecture sans couche de texte : le maître et les pages ne sont pas modifiés.</small>}
        </>}
    </section>;
}
