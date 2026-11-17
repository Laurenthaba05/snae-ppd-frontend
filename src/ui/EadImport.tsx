import { DescriptionImportDifferences, descriptionImportActions } from './DescriptionImportDifferences';
import React, { useEffect, useRef, useState } from 'react';
import { ArchivesApi, commandKey, type EadImportResult, type EadPreview } from '../api/archives';
import { EAD_CONFIDENTIALITY, eadFileProblem, eadIssueText, eadOutlineText, eadSummary } from '../core/eadImport';
import { EXTENT_UNITS } from '../core/archivalDescription';
import { PRIORITIES, PROCESSING_STATES } from '../core/archiveEnrichment';
import { label } from '../core/format';
import { ErrorNotice, Field, Modal, Notice } from './components';

/**
 * Importer un fichier EAD (EAD3 ou EAD 2002) : le fichier est contrôlé par le serveur (schéma officiel de sa version, références, niveaux, droits), l'arborescence lue est montrée, puis l'import crée des notices
 * brouillon. La confidentialité des notices créées est celle qu'on choisit ici : elle ne vient jamais du fichier.
 */
export function EadImport({ api, institution, onClose, onImported }: { api: ArchivesApi; institution: string; onClose: () => void; onImported: (result: EadImportResult) => void }) {
    const cancellation = useRef(new AbortController());
    useEffect(() => { const controller = new AbortController(); cancellation.current = controller; return () => controller.abort(); }, []);
    const [xml, setXml] = useState(''); const [filename, setFilename] = useState(''); const [confidentiality, setConfidentiality] = useState('INTERNE');
    const [preview, setPreview] = useState<EadPreview | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>();
    const [updateExisting, setUpdateExisting] = useState(false); const [shown, setShown] = useState(100);
    const intention = useRef<ReturnType<typeof commandKey> | null>(null);
    const load = async (file?: File) => {
        const signal = cancellation.current.signal;
        setShown(100); setPreview(null); setXml(''); setError(undefined); setFilename(file?.name ?? '');
        if (!file) return;
        const problem = eadFileProblem(file);
        if (problem) { setError(new Error(problem)); return; }
        setBusy(true);
        try { const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); if (!signal.aborted) setXml(text); }
        catch { setError(new Error('Le fichier doit être encodé en UTF-8.')); }
        finally { setBusy(false); }
    };
    const check = async () => {
        const signal = cancellation.current.signal; setBusy(true); setError(undefined); setPreview(null); setShown(100);
        try { const p = await api.previewEad(institution, xml, confidentiality, signal, updateExisting); if (!signal.aborted) setPreview(p); } catch (e) { if (!signal.aborted) setError(e); } finally { setBusy(false); }
    };
    const confirm = async () => {
        const signal = cancellation.current.signal;
        if (!preview || preview.issues.length || busy) return;
        setBusy(true); setError(undefined); intention.current = commandKey(intention.current, { institution, confidentiality, hash: preview.hash });
        try { const r = await api.importEad(institution, xml, confidentiality, preview.hash, intention.current.key, signal, updateExisting); if (!signal.aborted) { onImported(r); onClose(); } }
        catch (e) { if (!signal.aborted) setError(e); } finally { setBusy(false); }
    };
    const changed = (next: string) => { setConfidentiality(next); setPreview(null); };
    return <Modal wide title="Importer un fichier EAD" onClose={onClose} locked={busy}><div className="panel-padding">
        <p>Choisissez un fichier EAD3 ou EAD 2002 (5 Mo et 5 000 unités au plus). Le contrôle vérifie les références, la hiérarchie, les producteurs, les intervenants et les liens internes, puis présente les données avant confirmation.</p>
        <label><input type="checkbox" checked={updateExisting} disabled={busy} onChange={e => { setUpdateExisting(e.target.checked); setPreview(null); setShown(100); setError(undefined); }} /> Mettre à jour les fonds et descriptions existants</label>
        {updateExisting ? <Notice tone="warning">Les notices sont rapprochées par identifiant ou référence exacte dans cette institution. Les champs et enfants absents sont conservés ; les listes fournies remplacent les listes correspondantes. Le profil SNAE peut indiquer le retrait de producteurs ou du traitement. Une date principale remplace sa période et son libellé. La confidentialité existante est conservée ; les notices modifiées repassent en brouillon. Vérifiez les différences avant de confirmer.</Notice> : <p>Les nouvelles notices sont créées en brouillon. Les références existantes sont refusées ; activez la mise à jour pour examiner leur réimport.</p>}
        <Field label="Fichier EAD (.xml)"><input type="file" accept=".xml,.ead,application/xml,text/xml" disabled={busy} onChange={e => load(e.target.files?.[0])} /></Field>{filename && <p>{filename}</p>}
        <Field label="Confidentialité des notices créées" hint="Elle s’applique aux créations. Les notices existantes conservent leur confidentialité, qui ne vient jamais du fichier.">
            <select value={confidentiality} disabled={busy} onChange={e => changed(e.target.value)}>{EAD_CONFIDENTIALITY.map(c => <option key={c} value={c}>{label('confidentiality', c)}</option>)}</select>
        </Field>
        {error ? <ErrorNotice error={error} /> : null}
        {preview && <>
            <p role="status">{eadSummary(preview)}</p>
            {preview.format && <p>Format reconnu : <strong>{preview.format}</strong>.</p>}
            {preview.issues.length > 0 && <ul className="relation-problems" role="alert">{preview.issues.map((issue, i) => <li key={i}>{eadIssueText(issue)}</li>)}</ul>}
            {preview.warnings.length > 0 && <Notice tone="warning"><ul>{preview.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></Notice>}
            {preview.issues.length === 0 && <Notice>Le contrôle est réussi. Toutes les notices seront enregistrées ensemble. Le serveur vérifiera à nouveau le fichier lors de la confirmation.</Notice>}
            {preview.created != null && <p>{preview.created} à créer · {preview.updated ?? 0} à mettre à jour · {preview.unchanged ?? 0} inchangée(s).</p>}
            <h4 className="form-section">Arborescence lue</h4>
            <ul className="ead-outline" aria-label="Arborescence lue">{preview.outline.slice(0, shown).map(entry => <li key={entry.rank} style={{ paddingLeft: Math.min(entry.depth, 4) * 12 }}>{eadOutlineText(entry)}
                {entry.action && <p><strong>{descriptionImportActions[entry.action]}</strong></p>}
                {entry.parent && <p>Parent : {entry.parent}</p>}
                {entry.confidentiality && <p>Confidentialité : {label('confidentiality', entry.confidentiality)}</p>}
                {entry.action === 'UPDATE' && <DescriptionImportDifferences changes={entry.changes ?? []} />}
                {!!entry.identifiers?.length && <details><summary>{entry.identifiers.length} identifiant(s) secondaire(s) repris</summary><ul>{entry.identifiers.map((x,i) => <li key={i}>{x.type} : {x.value}{x.source ? ' · ' + x.source : ''}{x.label ? ' · ' + x.label : ''}{x.uri ? ' · ' + x.uri : ''}</li>)}</ul></details>}
                {!!Object.keys(entry.primaryDate ?? {}).length && <p>Date principale : {[entry.primaryDate?.dateKind, entry.primaryDate?.dateStart, entry.primaryDate?.dateEnd, entry.primaryDate?.dateLabel].filter(Boolean).join(' · ')}</p>}
                {!!entry.dates?.length && <details><summary>{entry.dates.length} date(s) structurée(s) reprise(s)</summary><ul>{entry.dates.map((x,i) => <li key={i}>{[x.type, x.start, x.end, x.expression, x.certainty, x.calendar].filter(Boolean).join(' · ')}</li>)}</ul></details>}
                {!!entry.extents?.length && <details><summary>{entry.extents.length} volume(s) matériel(s) lu(s)</summary><ul>{entry.extents.map((x,i) => <li key={i}>{[x.quantity + ' ' + (EXTENT_UNITS.find(u => u.code === x.unit)?.label ?? x.unit), x.portion === 'PART' ? 'Partie' : 'Totalité', x.medium, x.dimensions].filter(Boolean).join(' · ')}</li>)}</ul></details>}
                {entry.producerId && <p>Producteur principal : {entry.producerNames?.[entry.producerId] ?? entry.producerId}</p>}
                {!!entry.producers?.length && <details><summary>{entry.producers.length} lien(s) de producteur lu(s)</summary><ul>{entry.producers.map((x,i) => <li key={i}>{entry.producerNames?.[x.authorityId] ?? x.authorityId} · {x.role}{x.start && ' · Début : ' + x.start}{x.end && ' · Fin : ' + x.end}</li>)}</ul></details>}
                {entry.processing && <details><summary>Plan de traitement lu</summary>
                    <p>Priorité : {PRIORITIES[entry.processing.priority] ?? entry.processing.priority} · État : {PROCESSING_STATES[entry.processing.status] ?? entry.processing.status}</p>
                    {entry.processing.plan && <p style={{whiteSpace:'pre-wrap'}}>{entry.processing.plan}</p>}
                    {entry.processing.estimatedHours != null && <p>Heures prévues : {entry.processing.estimatedHours}</p>}
                    {entry.processing.actualHours != null && <p>Heures réalisées : {entry.processing.actualHours}</p>}
                    {entry.processing.funding && <p>Financement : {entry.processing.funding}</p>}
                    {!!entry.processing.processors.length && <p>Intervenants : {entry.processing.processors.join(', ')}</p>}
                </details>}
                {(entry.documentId || entry.dossierId) && <details><summary>Liens internes lus</summary>{entry.documentId && <p>Document : {entry.documentId}</p>}{entry.dossierId && <p>Dossier : {entry.dossierId}</p>}<p>Ces liens ne seront rétablis que si tous les contrôles sont réussis.</p></details>}
            </li>)}</ul>
            {shown < preview.outline.length && <button className="btn secondary" onClick={() => setShown(n => n + 100)}>Afficher les {Math.min(100, preview.outline.length - shown)} notices suivantes</button>}
            {preview.units > preview.outline.length && <p><small>… et {preview.units - preview.outline.length} autres unités.</small></p>}
        </>}
    </div><footer className="modal-footer"><button className="btn secondary" disabled={busy} onClick={onClose}>Annuler</button><button className="btn secondary" disabled={busy || !xml} onClick={check}>Contrôler le fichier</button>
        <button className="btn primary" disabled={busy || !preview || preview.issues.length > 0} onClick={confirm}>{updateExisting ? 'Confirmer les créations et mises à jour' : 'Confirmer l’import'}</button></footer></Modal>;
}

