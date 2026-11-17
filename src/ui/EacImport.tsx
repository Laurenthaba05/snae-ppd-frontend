import React, { useEffect, useRef, useState } from 'react';
import { ArchivesApi, commandKey, type EacFile, type EacImportResult, type EacPreview } from '../api/archives';
import { ErrorNotice, Field, Modal, Notice } from './components';

import { AuthorityImportDifferences as Differences, authorityImportActions as actionNames, authorityFieldNames as fieldNames, authorityImportKinds as kinds } from './AuthorityImportDifferences';
const relations: Record<string, string> = { TUTELLE: 'relève de', SUCCESSION: 'succède à', FAMILIALE: 'est lié familialement à', ASSOCIATIVE: 'est associé à' };
export function EacImport({ api, institution, onClose, onImported }: { api: ArchivesApi; institution: string; onClose: () => void; onImported: (result: EacImportResult) => void }) {
    const cancellation = useRef(new AbortController());
    useEffect(() => { const c = new AbortController(); cancellation.current = c; return () => c.abort(); }, []);
    const [files, setFiles] = useState<EacFile[]>([]); const [preview, setPreview] = useState<EacPreview | null>(null);
    const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>();
    const [updateExisting, setUpdateExisting] = useState(false);
    const intention = useRef<ReturnType<typeof commandKey> | null>(null);
    const load = async (selection: FileList | null) => {
        const signal = cancellation.current.signal;
        setFiles([]); setPreview(null); setError(undefined);
        const selected = Array.from(selection ?? []);
        if (!selected.length) return;
        if (selected.length > 100 || selected.reduce((sum, file) => sum + file.size, 0) > 5_000_000) { setError(new Error('Choisissez au plus 100 fichiers, pour un total de 5 Mo.')); return; }
        if (selected.some(file => !/\.(xml|eac)$/i.test(file.name) || !file.size)) { setError(new Error('Chaque fichier doit être un XML EAC-CPF non vide (.xml ou .eac).')); return; }
        setBusy(true);
        try {
            const loaded = await Promise.all(selected.map(async file => ({ name: file.name, xml: new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()) })));
            if (!signal.aborted) setFiles(loaded);
        } catch { if (!signal.aborted) setError(new Error('Les fichiers doivent être encodés en UTF-8.')); }
        finally { if (!signal.aborted) setBusy(false); }
    };
    const check = async () => {
        const signal = cancellation.current.signal; setBusy(true); setPreview(null); setError(undefined);
        try { const result = await api.previewEac(institution, files, signal, updateExisting); if (!signal.aborted) setPreview(result); }
        catch (e) { if (!signal.aborted) setError(e); } finally { if (!signal.aborted) setBusy(false); }
    };
    const confirm = async () => {
        if (!preview || preview.issues.length || busy) return;
        const signal = cancellation.current.signal; setBusy(true); setError(undefined);
        intention.current = commandKey(intention.current, { institution, hash: preview.hash });
        try { const result = await api.importEac(institution, files, preview.hash, intention.current.key, signal, updateExisting); if (!signal.aborted) { onImported(result); onClose(); } }
        catch (e) { if (!signal.aborted) setError(e); } finally { if (!signal.aborted) setBusy(false); }
    };
    return <Modal wide title="Importer des producteurs EAC-CPF" onClose={onClose} locked={busy}>
        <div className="panel-padding">
            <p>Sélectionnez les exports EAC-CPF 3 des producteurs à importer (100 fichiers, 5 Mo au total). Ajoutez ensemble les producteurs liés : leurs relations seront rétablies dans le même lot.</p>
            <p>Les nouvelles notices sont créées en <strong>brouillon</strong>. Une destination de relation doit figurer dans le lot ou être disponible dans cette institution.</p>
            <label><input type="checkbox" checked={updateExisting} disabled={busy} onChange={e => { setUpdateExisting(e.target.checked); setPreview(null); setError(undefined); }} /> Mettre à jour les producteurs existants</label>
            {updateExisting ? <Notice tone="warning">Le rapprochement utilise l’identifiant de notice ou la référence exacte dans cette institution. Les champs absents sont conservés ; une période d’existence fournie remplace ses deux bornes. Une notice modifiée repasse en brouillon. Les relations absentes sont conservées ; pour les mêmes producteurs, type et date de début, la date de fin et la description sont remplacées. Une autre date de début crée une relation distincte. Vérifiez les différences avant de confirmer.</Notice> : <p>Les références déjà présentes sont refusées. Activez la mise à jour pour prévisualiser leur réimport.</p>}
            <Field label="Fichiers EAC-CPF (.xml)"><input type="file" multiple accept=".xml,.eac,application/xml,text/xml" disabled={busy} onChange={e => load(e.target.files)} /></Field>
            {!!files.length && <ul aria-label="Fichiers sélectionnés">{files.map((file, index) => <li key={index}>{file.name}</li>)}</ul>}
            {error ? <ErrorNotice error={error} /> : null}
            {preview && <>
                <p role="status">{preview.authorities.length} producteur(s) et {preview.relations.length} relation(s) lus · {preview.issues.length} erreur(s).</p>
                {!!preview.issues.length && <ul role="alert" className="relation-problems">{preview.issues.map((issue, index) => <li key={index}>{issue.file} : {issue.message}</li>)}</ul>}
                {!!preview.warnings.length && <Notice tone="warning"><ul>{preview.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></Notice>}
                {!preview.issues.length && <Notice>Le contrôle est réussi. Les producteurs et leurs relations seront enregistrés ensemble après une nouvelle vérification du serveur.</Notice>}
                <p>{preview.authorities.filter(row => row.action === 'CREATE').length} à créer · {preview.authorities.filter(row => row.action === 'UPDATE').length} à mettre à jour · {preview.authorities.filter(row => row.action === 'UNCHANGED').length} inchangé(s).</p>
                <h4 className="form-section">Producteurs lus</h4>
                <ul className="ead-outline" aria-label="Producteurs lus">{preview.authorities.map((row, index) => <li key={index}>
                    <strong>{row.code} · {row.name}</strong> · {kinds[row.kind]}<p><strong>{actionNames[row.action]}</strong></p>
                    {row.action === 'UPDATE' && <Differences changes={row.changes} />}
                    <p>{row.file}{row.details.dateStart && ' · Début : ' + row.details.dateStart}{row.details.dateEnd && ' · Fin : ' + row.details.dateEnd}</p>
                    {row.actorId && <p>Lien acteur : {row.actorId}</p>}
                    <details><summary>Données descriptives reprises</summary><dl>{Object.entries(row.details).map(([key, value]) => <React.Fragment key={key}><dt>{fieldNames[key] ?? key}</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{value === 'BROUILLON' ? 'Brouillon' : value}</dd></React.Fragment>)}</dl></details>
                </li>)}</ul>
                <h4 className="form-section">Relations à rétablir</h4>
                {!preview.relations.length ? <p>Aucune relation dans ce lot.</p> : <ul className="ead-outline" aria-label="Relations à rétablir">{preview.relations.map((row, index) => <li key={index}>
                    {row.source} <strong>{relations[row.type] ?? row.type}</strong> {row.target}
                    <p><strong>{actionNames[row.action]}</strong></p>{row.action === 'UPDATE' && <Differences changes={row.changes} />}
                    {row.dateStart && <p>Début : {row.dateStart}</p>}{row.dateEnd && <p>Fin : {row.dateEnd}</p>}
                    {row.description && <p style={{ whiteSpace: 'pre-wrap' }}>{row.description}</p>}
                </li>)}</ul>}
            </>}
        </div>
        <footer className="modal-footer"><button className="btn secondary" disabled={busy} onClick={onClose}>Annuler</button>
            <button className="btn secondary" disabled={busy || !files.length} onClick={check}>Contrôler les fichiers</button>
            <button className="btn primary" disabled={busy || !preview || !!preview.issues.length || !preview.authorities.length} onClick={confirm}>{updateExisting ? 'Confirmer les créations et mises à jour' : 'Confirmer l’import'}</button></footer>
    </Modal>;
}
