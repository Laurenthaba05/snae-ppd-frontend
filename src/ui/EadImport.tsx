import React, { useEffect, useRef, useState } from 'react';
import { ArchivesApi, commandKey, type EadPreview } from '../api/archives';
import { EAD_CONFIDENTIALITY, eadFileProblem, eadIssueText, eadOutlineText, eadSummary } from '../core/eadImport';
import { label } from '../core/format';
import { ErrorNotice, Field, Modal, Notice } from './components';

/**
 * Importer un fichier EAD3 : le fichier est contrôlé par le serveur (schéma officiel, références, niveaux, droits), l'arborescence lue est montrée, puis l'import crée des notices
 * brouillon. La confidentialité des notices créées est celle qu'on choisit ici : elle ne vient jamais du fichier.
 */
export function EadImport({ api, institution, onClose, onImported }: { api: ArchivesApi; institution: string; onClose: () => void; onImported: (count: number) => void }) {
    const cancellation = useRef(new AbortController());
    useEffect(() => { const controller = new AbortController(); cancellation.current = controller; return () => controller.abort(); }, []);
    const [xml, setXml] = useState(''); const [filename, setFilename] = useState(''); const [confidentiality, setConfidentiality] = useState('INTERNE');
    const [preview, setPreview] = useState<EadPreview | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>();
    const intention = useRef<ReturnType<typeof commandKey> | null>(null);
    const load = async (file?: File) => {
        const signal = cancellation.current.signal;
        setPreview(null); setXml(''); setError(undefined); setFilename(file?.name ?? '');
        if (!file) return;
        const problem = eadFileProblem(file);
        if (problem) { setError(new Error(problem)); return; }
        setBusy(true);
        try { const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); if (!signal.aborted) setXml(text); }
        catch { setError(new Error('Le fichier doit être encodé en UTF-8.')); }
        finally { setBusy(false); }
    };
    const check = async () => {
        const signal = cancellation.current.signal; setBusy(true); setError(undefined); setPreview(null);
        try { const p = await api.previewEad(institution, xml, confidentiality, signal); if (!signal.aborted) setPreview(p); } catch (e) { if (!signal.aborted) setError(e); } finally { setBusy(false); }
    };
    const confirm = async () => {
        const signal = cancellation.current.signal;
        if (!preview || preview.issues.length) return;
        setBusy(true); setError(undefined); intention.current = commandKey(intention.current, { institution, confidentiality, hash: preview.hash });
        try { const r = await api.importEad(institution, xml, confidentiality, preview.hash, intention.current.key, signal); if (!signal.aborted) { onImported(r.count); onClose(); } }
        catch (e) { if (!signal.aborted) setError(e); } finally { setBusy(false); }
    };
    const changed = (next: string) => { setConfidentiality(next); setPreview(null); };
    return <Modal wide title="Importer un fichier EAD3" onClose={onClose} locked={busy}><div className="panel-padding">
        <p>Choisissez un fichier EAD3 au format XML (5 Mo et 5 000 unités au plus). Il doit respecter le schéma EAD3 officiel. Chaque unité devient une notice <strong>brouillon</strong> rattachée à son parent ;
            les références qui existent déjà sont refusées et rien n’est remplacé. Les éléments sans équivalent (par exemple les accès par sujet) ne sont pas repris : le contrôle les liste.</p>
        <Field label="Fichier EAD3 (.xml)"><input type="file" accept=".xml,.ead,application/xml,text/xml" disabled={busy} onChange={e => load(e.target.files?.[0])} /></Field>{filename && <p>{filename}</p>}
        <Field label="Confidentialité des notices créées" hint="Elle est choisie ici et ne vient jamais du fichier ; vous pourrez la modifier notice par notice.">
            <select value={confidentiality} disabled={busy} onChange={e => changed(e.target.value)}>{EAD_CONFIDENTIALITY.map(c => <option key={c} value={c}>{label('confidentiality', c)}</option>)}</select>
        </Field>
        {error ? <ErrorNotice error={error} /> : null}
        {preview && <>
            <p role="status">{eadSummary(preview)}</p>
            {preview.issues.length > 0 && <ul className="relation-problems" role="alert">{preview.issues.map((issue, i) => <li key={i}>{eadIssueText(issue)}</li>)}</ul>}
            {preview.warnings.length > 0 && <Notice tone="warning"><ul>{preview.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></Notice>}
            {preview.issues.length === 0 && <Notice>Le contrôle est réussi. Toutes les notices seront enregistrées ensemble. Le serveur vérifiera à nouveau le fichier lors de la confirmation.</Notice>}
            <h4 className="form-section">Arborescence lue</h4>
            <ul className="ead-outline" aria-label="Arborescence lue">{preview.outline.map(entry => <li key={entry.rank} style={{ paddingLeft: entry.depth * 18 }}>{eadOutlineText(entry)}</li>)}</ul>
            {preview.units > preview.outline.length && <p><small>… et {preview.units - preview.outline.length} autres unités.</small></p>}
        </>}
    </div><footer className="modal-footer"><button className="btn secondary" disabled={busy} onClick={onClose}>Annuler</button><button className="btn secondary" disabled={busy || !xml} onClick={check}>Contrôler le fichier</button>
        <button className="btn primary" disabled={busy || !preview || preview.issues.length > 0} onClick={confirm}>Confirmer l’import</button></footer></Modal>;
}
