import React, { useEffect, useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { commandKey } from '../api/archives';
import { Busy, Empty, ErrorNotice, Field, Modal, Notice, formatDate, useResource } from './components';
import { EntityName } from './names';
import { MAX_ZONES, rectFromPoints, redactionSummary, zoneBody, zoneProblems, zonesOf, type Rect, type RedactionPage, type RedactionZone } from '../core/communicability';

const percent = (v: number) => `${Math.round(v * 1000) / 10} %`;

/** La copie de consultation d'une page, en image : récupérée avec la session de l'agent, libérée à la fermeture. */
function usePageImage(fileId: string | null, image: number) {
    const { records } = useSession();
    const [url, setUrl] = useState<string | null>(null);
    const [error, setError] = useState<unknown>(null);
    useEffect(() => {
        if (!fileId) { setUrl(null); return; }
        const controller = new AbortController();
        let made: string | null = null;
        setUrl(null); setError(null);
        records!.fileDerivative(fileId, 'consultation', controller.signal, image)
            .then(blob => { if (controller.signal.aborted) return; made = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(blob) : ''; setUrl(made); })
            .catch(e => { if (!controller.signal.aborted) setError(e); });
        return () => { controller.abort(); if (made && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(made); };
    }, [fileId, image, records]);
    return { url, error };
}

/**
 * L'occultation des zones d'un document : on choisit une page, on tire un rectangle sur la copie de consultation, on dit pourquoi. Le lecteur du portail reçoit ensuite la page
 * avec ces zones noircies ; les agents voient toujours la page entière. Retirer une zone est motivé et tracé.
 */
export function RedactionPanel({ documentId, canManage, destroyed = false }: { documentId: string; canManage: boolean; destroyed?: boolean }) {
    const { rights, epoch } = useSession();
    const pagesQ = useResource<RedactionPage[]>(signal => rights!.redactionPages(documentId, signal), `redaction-pages:${documentId}:${epoch}`);
    const zonesQ = useResource<RedactionZone[]>(signal => rights!.redactionZones(documentId, signal), `redaction-zones:${documentId}:${epoch}`);
    const [pageNumber, setPageNumber] = useState(1);
    const [image, setImage] = useState(1);
    const [draft, setDraft] = useState<Rect | null>(null);
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [attempted, setAttempted] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const [removing, setRemoving] = useState<RedactionZone | null>(null);
    const intention = useRef<ReturnType<typeof commandKey> | null>(null);
    const pages = pagesQ.data ?? [];
    const zones = zonesQ.data ?? [];
    const page = pages.find(p => p.number === pageNumber) ?? pages[0] ?? null;
    const shown = page ? zonesOf(zones, page.number, image) : [];
    const active = zones.filter(z => z.status === 'ACTIVE');
    const picture = usePageImage(page?.fileId ?? null, image);
    const problems = zoneProblems(draft, reason, active.length);
    const choose = (n: number) => { setPageNumber(n); setImage(1); setDraft(null); setAttempted(false); };
    const save = async () => {
        if (busy || !page) return;
        if (problems.length) { setAttempted(true); return; }
        setBusy(true); setError(null);
        const body = zoneBody(page.number, image, draft!, reason);
        intention.current = commandKey(intention.current, { documentId, body });
        try { await rights!.addRedactionZone(documentId, body, intention.current.key); setDraft(null); setReason(''); setAttempted(false); intention.current = null; zonesQ.refresh(); pagesQ.refresh(); }
        catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <div className="redaction-panel" role="region" aria-label="Occultation">
        <div className="section-heading"><h4>Occultation de zones</h4></div>
        <p className="communicability-personal">{redactionSummary(zones)}</p>
        {(pagesQ.loading && !pagesQ.data) || (zonesQ.loading && !zonesQ.data) ? <Busy /> : pagesQ.error ? <ErrorNotice error={pagesQ.error} onRetry={pagesQ.refresh} /> : zonesQ.error ? <ErrorNotice error={zonesQ.error} onRetry={zonesQ.refresh} />
            : pages.length === 0 ? <Notice>Ce document n’a pas de page numérisée lisible : il n’y a rien à occulter. L’occultation s’applique aux pages lues sur le portail.</Notice>
                : <>
                    <div className="redaction-toolbar">
                        <label>Page <select value={page?.number ?? 1} onChange={e => choose(Number(e.target.value))}>
                            {pages.map(p => <option key={p.number} value={p.number}>Page {p.number}{p.zones > 0 ? ` (${p.zones} zone${p.zones > 1 ? 's' : ''})` : ''}</option>)}</select></label>
                        {page && page.images > 1 && <label>Image <select value={image} onChange={e => { setImage(Number(e.target.value)); setDraft(null); }}>
                            {Array.from({ length: page.images }, (_, i) => i + 1).map(n => <option key={n} value={n}>Image {n}</option>)}</select></label>}
                    </div>
                    {picture.error ? <ErrorNotice error={picture.error} /> : !picture.url ? <Busy label="Chargement de la page…" />
                        : <PageCanvas url={picture.url} zones={shown} draft={draft} editable={canManage && !destroyed && !busy} onDraft={rect => { setDraft(rect); setAttempted(false); }} />}
                    {canManage && !destroyed && <div className="redaction-form">
                        <p role="status" className="wf-note">{draft ? `Zone choisie : ${percent(draft.width)} de large sur ${percent(draft.height)} de haut, à ${percent(draft.x)} du bord gauche et ${percent(draft.y)} du haut.`
                            : 'Tirez un rectangle sur la page pour désigner la zone à cacher.'}</p>
                        <Field label="Motif de l’occultation *" wide hint="La raison qui justifie de cacher cette zone : donnée personnelle, secret protégé…"><input value={reason} onChange={e => setReason(e.target.value)} maxLength={500} disabled={busy} /></Field>
                        {attempted && problems.length > 0 && <ul className="relation-problems" role="alert">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
                        <div className="table-actions"><button type="button" className="btn primary" disabled={busy} onClick={() => void save()}>Occulter cette zone</button>
                            {draft && <button type="button" className="btn secondary" disabled={busy} onClick={() => setDraft(null)}>Effacer le rectangle</button>}</div>
                    </div>}
                    {error ? <ErrorNotice error={error} /> : null}
                    <ZoneTable zones={zones} canManage={canManage && !destroyed} onRemove={setRemoving} />
                    {active.length >= MAX_ZONES && <Notice tone="warning">Le maximum de {MAX_ZONES} zones occultées est atteint pour ce document.</Notice>}
                </>}
        {removing && <RemoveZoneDialog documentId={documentId} zone={removing} onClose={() => setRemoving(null)} onDone={() => { zonesQ.refresh(); pagesQ.refresh(); }} />}
    </div>;
}

/** La page et ses zones : les zones posées en noir, le rectangle en cours de tracé en rouge. Le geste se fait à la souris ; les coordonnées relatives suivent la taille affichée. */
function PageCanvas({ url, zones, draft, editable, onDraft }: { url: string; zones: RedactionZone[]; draft: Rect | null; editable: boolean; onDraft: (rect: Rect | null) => void }) {
    const box = useRef<HTMLDivElement | null>(null);
    const start = useRef<{ x: number; y: number } | null>(null);
    const [dragging, setDragging] = useState(false);
    const local = (event: React.MouseEvent) => {
        const bounds = box.current!.getBoundingClientRect();
        return { point: { x: event.clientX - bounds.left, y: event.clientY - bounds.top }, size: { width: bounds.width, height: bounds.height } };
    };
    return <div className="redaction-canvas" ref={box} data-testid="redaction-canvas"
        onMouseDown={e => { if (!editable || e.button !== 0) return; e.preventDefault(); start.current = local(e).point; setDragging(true); onDraft(null); }}
        onMouseMove={e => { if (!dragging || !start.current) return; const { point, size } = local(e); onDraft(rectFromPoints(start.current, point, size)); }}
        onMouseUp={e => { if (!dragging || !start.current) return; const { point, size } = local(e); onDraft(rectFromPoints(start.current, point, size)); start.current = null; setDragging(false); }}
        onMouseLeave={() => { if (dragging) { start.current = null; setDragging(false); } }}
        style={{ position: 'relative', display: 'inline-block', maxWidth: '100%', cursor: editable ? 'crosshair' : 'default', userSelect: 'none' }}>
        <img src={url} alt="Page à occulter" draggable={false} style={{ display: 'block', maxWidth: '100%', height: 'auto' }} />
        {zones.map(z => <div key={z.id} className="redaction-zone" title={z.reason} style={{ position: 'absolute', left: `${z.x * 100}%`, top: `${z.y * 100}%`, width: `${z.width * 100}%`, height: `${z.height * 100}%`,
            background: 'rgba(0,0,0,0.78)', outline: '1px solid #000' }} />)}
        {draft && <div className="redaction-draft" style={{ position: 'absolute', left: `${draft.x * 100}%`, top: `${draft.y * 100}%`, width: `${draft.width * 100}%`, height: `${draft.height * 100}%`,
            background: 'rgba(200,30,30,0.28)', outline: '2px solid #c81e1e' }} />}
    </div>;
}

function ZoneTable({ zones, canManage, onRemove }: { zones: RedactionZone[]; canManage: boolean; onRemove: (z: RedactionZone) => void }) {
    const active = zones.filter(z => z.status === 'ACTIVE');
    const removed = zones.filter(z => z.status !== 'ACTIVE');
    if (zones.length === 0) return <Empty title="Aucune zone" description="Les zones occultées apparaissent ici, avec leur motif." icon="shield" />;
    return <>
        {active.length > 0 && <div className="table-scroll"><table><thead><tr><th>Page</th><th>Zone</th><th>Motif</th><th>Posée par</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{active.map(z => <tr key={z.id}>
                <td>Page {z.page}{z.image > 1 ? ` · image ${z.image}` : ''}</td>
                <td>{percent(z.width)} × {percent(z.height)}<small className="cell-sub">à {percent(z.x)} du bord gauche, {percent(z.y)} du haut</small></td>
                <td>{z.reason}</td>
                <td><EntityName kind="users" id={z.createdById} /><small className="cell-sub">{formatDate(z.createdAt)}</small></td>
                <td className="table-actions">{canManage && <button type="button" className="btn small danger-outline" aria-label={`Retirer la zone de la page ${z.page}`} onClick={() => onRemove(z)}>Retirer</button>}</td>
            </tr>)}</tbody></table></div>}
        {removed.length > 0 && <details><summary>Zones retirées ({removed.length})</summary>
            <ul className="signature-notes">{removed.map(z => <li key={z.id}>Page {z.page} : {z.reason} — retirée le {formatDate(z.removedAt)} par <EntityName kind="users" id={z.removedById ?? ''} /> : {z.removalReason}</li>)}</ul></details>}
    </>;
}

function RemoveZoneDialog({ documentId, zone, onClose, onDone }: { documentId: string; zone: RedactionZone; onClose: () => void; onDone: () => void }) {
    const { rights } = useSession();
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const intention = useRef<ReturnType<typeof commandKey> | null>(null);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (busy || !reason.trim()) return;
        setBusy(true); setError(null);
        intention.current = commandKey(intention.current, { zone: zone.id, reason });
        try { await rights!.removeRedactionZone(documentId, zone.id, reason.trim(), intention.current.key); onDone(); onClose(); } catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal title="Retirer une zone occultée" subtitle={`Page ${zone.page} — ${zone.reason}`} onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <Notice tone="warning">Une fois la zone retirée, le lecteur du portail verra de nouveau ce que la page contient à cet endroit.</Notice>
            <Field label="Motif du retrait *" wide hint="Conservé au journal."><textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} maxLength={4000} disabled={busy} required /></Field>
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Garder la zone</button>
                <button type="submit" className="btn danger" disabled={busy || !reason.trim()}>Retirer la zone</button></footer>
        </form>
    </Modal>;
}
