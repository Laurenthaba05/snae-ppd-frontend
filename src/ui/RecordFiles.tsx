import { IntentKey } from '../core/validation';
import { OptionalFields, useOptionalFields } from './OptionalFields';
import React, { useEffect, useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { useWorkspace } from './workspace';
import { navigate } from './navigation';
import { PageHead, Badge, Busy, ErrorNotice, Empty, useResource, CopyId, formatDate, Modal, Field, Notice } from './components';
import { Icon } from './icons';
import { PreservationMonitoring } from './PreservationMonitoring';
import { BackupMonitoring } from './BackupMonitoring';
import { ReplicationMonitoring } from './ReplicationMonitoring';
import { PreservationPlanningSection } from './PreservationPlanning';
import { DisseminationSection } from './Dissemination';
import { TrustAnchorsSection } from './TrustAnchors';
import { RevocationListsSection } from './RevocationLists';
import { SealKeyStatusSection } from './SealKeyStatus';
import { can } from '../core/policy';
import { ApiError } from '../core/http';
import { ingestionMessage, sealHint } from '../core/ingestion';
import { timestampFailure } from '../core/timestamp';
import { fileIsReadable } from '../core/file-content';
import { FileContentDialog } from './FileContentDialog';
import { IngestionHistory } from './IngestionHistory';
import { DocumentLifecycleBox } from './DocumentLifecycleBox';
import type { StepAction } from '../core/lifecycle';
import type { DocumentLifecycle, DocumentVersion, DocumentFile, Ingestion, QualifiedTimestamp, IntegrityCheck, PreservationEvent, PreservationEventListItem } from '../core/types';
import { formatBytes } from '../core/format';
import { DocumentTombstone } from './Destruction';
import { ImageTechnicalDialog, PdfaDialog } from './ScanProfiles';
import { isImageFile, isPdfFile } from '../core/scanProfiles';

/** La version n'a pas encore de fichier maître validé : le prochain dépôt est, en principe, le maître. */
function needsMaster(lifecycle: DocumentLifecycle | null, versionId: string): boolean {
    return !!lifecycle && lifecycle.version?.id === versionId && lifecycle.validatedMasters === 0 && lifecycle.sealBlockers.includes('VALIDATED_CONTENT_REQUIRED');
}

/** Le serveur a déjà dit que cette version ne peut pas être scellée : inutile de laisser cliquer. Sans information, le bouton reste actif et le serveur tranche. */
function sealBlocked(lifecycle: DocumentLifecycle | null, versionId: string): boolean {
    return !!lifecycle && lifecycle.version?.id === versionId && lifecycle.sealBlockers.length > 0;
}

export function UploadDialog({ versionId, initialFile, defaultRole = 'PIECE_JOINTE', onClose, onSuccess }: {
    versionId: string;
    initialFile?: File;
    /** Rôle proposé au départ : « Maître de conservation » quand la version n'en a pas encore, « Pièce jointe » sinon. */
    defaultRole?: 'PIECE_JOINTE' | 'MAITRE_CONSERVATION';
    onClose: () => void;
    onSuccess: () => void;
}) {
    const { records } = useSession();
    const [file, setFile] = useState<File | null>(initialFile ?? null);
    const [key, setKey] = useState(initialFile ? crypto.randomUUID() : '');
    const [role, setRole] = useState<typeof defaultRole>(defaultRole);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const [result, setResult] = useState<Ingestion | null>(null);
    const pick = (f: File | null) => { setFile(f); setKey(f ? crypto.randomUUID() : ''); setResult(null); setError(null); };
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file || busy)
            return;
        setBusy(true);
        setError(null);
        try {
            const ingestion = await records!.uploadContent(versionId, file, role, key);
            setResult(ingestion);
            if (ingestion.status === 'COMPLETED')
                onSuccess();
        }
        catch (err) {
            setError(err);
        }
        finally {
            setBusy(false);
        }
    };
    const refreshStatus = async () => {
        if (!result || busy) return;
        setBusy(true); setError(null);
        try { const current = await records!.ingestion(result.id); setResult(current); if (current.status === 'COMPLETED') onSuccess(); }
        catch (err) { setError(err); }
        finally { setBusy(false); }
    };
    const done = result?.status === 'COMPLETED';
    const processing = result?.status === 'PROCESSING' && result.leaseExpired !== true;
    return <Modal title="Téléverser un fichier" subtitle="Le fichier est analysé et contrôlé par le serveur avant d’être associé à cette version." onClose={onClose} locked={busy}><form onSubmit={submit}><div className="form-grid">
        <Field label="Fichier *" wide hint={file ? 'Sélectionné : ' + file.name : undefined}><input type="file" onChange={e => pick(e.target.files?.[0] ?? null)} required={!file} disabled={busy || done || processing}/></Field>
        <Field label="Rôle"><select value={role} onChange={e => { setRole(e.target.value as typeof defaultRole); setKey(crypto.randomUUID()); setResult(null); setError(null); }} disabled={busy || done || processing}><option value="PIECE_JOINTE">Pièce jointe</option><option value="MAITRE_CONSERVATION">Maître de conservation</option></select></Field>
        {result && result.status === 'COMPLETED' && <Notice tone="info">Dépôt terminé : {result.filename} ({formatBytes(result.size)}). Validez ensuite le fichier dans la liste pour autoriser sa consultation.</Notice>}
        {result && result.status === 'REJECTED' && <Notice tone="warning">{ingestionMessage(result)}</Notice>}
        {result && (result.status === 'RETRYABLE' || result.leaseExpired === true) && <Notice tone="warning">{ingestionMessage(result)}</Notice>}
        {processing && <Notice tone="info">Analyse en cours. Actualisez le statut pour connaître le résultat.</Notice>}
        </div>{Boolean(error) && <ErrorNotice error={error}/>}<footer className="modal-footer"><button type="button" className="btn secondary" disabled={busy} onClick={onClose}>{done ? 'Fermer' : 'Annuler'}</button>{processing ? <button type="button" className="btn primary" disabled={busy} onClick={refreshStatus}>Actualiser le statut</button> : !done && <button type="submit" className="btn primary" disabled={busy || !file || result?.status === 'REJECTED'}>{busy ? <span className="spinner"/> : <Icon name="arrow" size={17}/>} Téléverser</button>}</footer></form></Modal>;
}

export function PendingUpload({ documentId, file, onClose, onSuccess }: {
    documentId: string;
    file: File;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const { records } = useSession();
    const q = useResource<DocumentVersion[]>(s => records!.versions(documentId, s), 'pending-upload:' + documentId);
    if (q.loading)
        return <Modal title="Téléverser un fichier" subtitle="Préparation de la version…" onClose={onClose}><Busy /></Modal>;
    const version = q.data?.[0];
    if (q.error || !version)
        return <Modal title="Téléverser un fichier" onClose={onClose}><ErrorNotice error={q.error ?? new Error('Version introuvable pour ce document.')} onRetry={q.refresh}/></Modal>;
    return <UploadDialog versionId={version.id} initialFile={file} onClose={onClose} onSuccess={onSuccess}/>;
}

function VersionTimestampCell({ versionId }: {
    versionId: string;
}) {
    const { me, records } = useSession();
    const { scope } = useWorkspace();
    const q = useResource<QualifiedTimestamp | null>(s => records!.timestamp(versionId, s).catch(err => { if (err instanceof ApiError && err.status === 404)
            return null; throw err; }), 'version-timestamp:' + versionId);
    const [busy, setBusy] = useState(false);
    const [failure, setFailure] = useState<unknown>(null);
    const canTimestamp = can(me, 'VERSION_TIMESTAMP', scope);
    const create = () => {
        setBusy(true); setFailure(null);
        records!.createTimestamp(versionId, crypto.randomUUID()).then(() => q.refresh()).catch(err => { setFailure(err); q.refresh(); }).finally(() => setBusy(false));
    };
    if (q.loading)
        return <Busy label="…"/>;
    if (q.data)
        return <span title={q.data.authority}><Badge value="VALIDEE"/> {formatDate(q.data.timestampedAt)}</span>;
    if (q.error)
        return <ErrorNotice error={q.error}/>;
    if (!canTimestamp) return <span>—</span>;
    return <>
        <button className="btn small warning" onClick={create} disabled={busy}>{busy ? 'Envoi…' : 'Horodater'}</button>
        {failure !== null && (() => {
            const known = failure instanceof ApiError ? timestampFailure(failure.code) : null;
            return known ? <Notice tone="warning">{known.text}</Notice> : <ErrorNotice error={failure}/>;
        })()}
    </>;
}

function IntegrityCell({ check }: {
    check: IntegrityCheck | undefined;
}) {
    if (!check)
        return <>—</>;
    const ok = check.result === 'OK' && !check.blocked;
    return <span title={'SHA-256 attendu : ' + check.expectedSha256}>{ok ? <Icon name="check" size={16}/> : <Icon name="alert" size={16}/>} {check.blocked ? 'Fichier bloqué' : ok ? 'Intégrité confirmée' : 'Contrôle en anomalie'}<small>{formatDate(check.checkedAt)}</small></span>;
}

export function PreservationDialog({ fileId, canManage, onClose }: {
    fileId: string;
    canManage: boolean;
    onClose: () => void;
}) {
    const { records, preservationPlanning } = useSession();
    const { scope } = useWorkspace();
    const extra = useOptionalFields('preservationDetails');
    const [agentId, setAgentId] = useState('');
    const agentsQ = useResource(s => canManage ? preservationPlanning!.agents(scope.institutionId, false, s) : Promise.resolve([]), 'event-agents:' + scope.institutionId + ':' + canManage);
    const q = useResource<PreservationEvent[]>(s => records!.preservationEvents(fileId, s), 'preservation:' + fileId);
    const [typeEvenement, setTypeEvenement] = useState('MIGRATION_FORMAT');
    const [resultat, setResultat] = useState('SUCCES');
    const [outil, setOutil] = useState('');
    const [versionOutil, setVersionOutil] = useState('');
    const [description, setDescription] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true); setError(null);
        try {
            await records!.recordPreservationEvent(fileId, typeEvenement, resultat, outil.trim() || null, versionOutil.trim() || null, description.trim() || null, { ...extra.payload(), agentId: agentId || null });
            setOutil(''); setVersionOutil(''); setDescription(''); setAgentId(''); extra.reset();
            q.refresh();
        } catch (err) { setError(err); } finally { setBusy(false); }
    };
    return <Modal title="Journal de préservation" subtitle="Événements techniques consignés sur ce fichier (migration de format, rafraîchissement de support, vérification de fixité…)." onClose={onClose} locked={busy}>
        {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh}/> : q.data?.length ?
            <div className="table-scroll"><table><thead><tr><th>Type</th><th>Résultat</th><th>Outil</th><th>Date</th></tr></thead><tbody>
                {q.data.map(ev => <tr key={ev.id}><td><Badge value={ev.typeEvenement}/></td><td><Badge value={ev.resultat}/></td><td>{ev.outil ?? '—'}{ev.versionOutil ? ' v' + ev.versionOutil : ''}</td><td>{formatDate(ev.dateEvenement)}{(ev.description || ev.agentId || ev.source || ev.destination) && <details><summary>Détails</summary>{ev.description && <p>{ev.description}</p>}{ev.agentId && <p>Agent : {agentsQ.data?.find(a => a.id === ev.agentId)?.name ?? ev.agentId}</p>}{ev.source && <><strong>État source</strong><pre>{JSON.stringify(ev.source, null, 2)}</pre></>}{ev.destination && <><strong>Destination</strong><pre>{JSON.stringify(ev.destination, null, 2)}</pre></>}</details>}</td></tr>)}
            </tbody></table></div> : <Empty title="Aucun événement de préservation" icon="archive"/>}
        {canManage && <form onSubmit={submit} className="form-grid">
            <Field label="Type *"><select value={typeEvenement} onChange={e => setTypeEvenement(e.target.value)}><option value="MIGRATION_FORMAT">Migration de format</option><option value="RAFRAICHISSEMENT_SUPPORT">Rafraîchissement de support</option><option value="VERIFICATION_FIXITE">Vérification de fixité</option><option value="NORMALISATION">Normalisation</option><option value="AUTRE">Autre</option></select></Field>
            <Field label="Résultat *"><select value={resultat} onChange={e => setResultat(e.target.value)}><option value="SUCCES">Succès</option><option value="ECHEC">Échec</option><option value="PARTIEL">Partiel</option></select></Field>
            <Field label="Agent de préservation" hint="Logiciel, équipement ou organisme PREMIS responsable de cette intervention."><select aria-label="Agent de préservation" value={agentId} onChange={e => setAgentId(e.target.value)} disabled={agentsQ.loading || busy}><option value="">Non renseigné</option>{agentsQ.data?.filter(a => a.status === 'ACTIF').map(a => <option key={a.id} value={a.id}>{a.name}{a.version ? ' · ' + a.version : ''}</option>)}</select>{agentsQ.error ? <ErrorNotice error={agentsQ.error} onRetry={agentsQ.refresh}/> : null}</Field>
            <OptionalFields form={extra} disabled={busy} />
            <Field label="Outil" hint="Optionnel."><input value={outil} onChange={e => setOutil(e.target.value)} maxLength={255}/></Field>
            <Field label="Version de l’outil" hint="Optionnelle."><input value={versionOutil} onChange={e => setVersionOutil(e.target.value)} maxLength={100}/></Field>
            <Field label="Description" wide hint="Optionnelle."><textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={4000}/></Field>
            {Boolean(error) && <ErrorNotice error={error}/>}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose}>Fermer</button><button type="submit" className="btn primary" disabled={busy}>{busy ? <span className="spinner"/> : null} Consigner l’événement</button></footer>
        </form>}
    </Modal>;
}

export function PreservationEventListPage() {
    const { records, epoch } = useSession();
    const { scope } = useWorkspace();
    const q = useResource<PreservationEventListItem[]>(s => records!.allPreservationEvents(scope.institutionId, scope.departmentId, s), JSON.stringify(['preservation-events-all', scope, epoch]));
    const items = q.data ?? [];
    return <><PageHead eyebrow="CONSERVATION" title="Conservation" description="Suivi de l’intégrité des fichiers et des 200 derniers événements de préservation visibles dans votre périmètre."/>
        <PreservationMonitoring/>
        <BackupMonitoring/>
        <ReplicationMonitoring/>
        <PreservationPlanningSection/>
        <DisseminationSection/>
        <TrustAnchorsSection/>
        <RevocationListsSection/>
        <SealKeyStatusSection/>
        <div className="panel">
            {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh}/> : items.length ? <div className="table-scroll"><table><thead><tr><th>Document</th><th>Type</th><th>Résultat</th><th>Outil</th><th>Date</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td>{item.documentReference ?? 'Document non disponible'}</td><td><Badge value={item.typeEvenement}/></td><td><Badge value={item.resultat}/></td><td>{item.outil ?? '—'}</td><td>{formatDate(item.dateEvenement)}</td><td><button className="btn small secondary" onClick={() => navigate('/app/documents/' + item.documentId)}>Ouvrir le document</button></td></tr>)}</tbody></table></div> : <Empty title="Aucun événement" description="Aucun événement de préservation consigné dans ce périmètre."/>}
        </div>
    </>;
}

function FilesRow({ files, editable, onChanged }: {
    files: DocumentFile[];
    editable: boolean;
    onChanged: () => void;
}) {
    const { me, records, digitization } = useSession();
    const { scope } = useWorkspace();
    const [busy, setBusy] = useState<string | null>(null);
    const [checking, setChecking] = useState<string | null>(null);
    const [error, setError] = useState<unknown>(null);
    const [integrity, setIntegrity] = useState<Record<string, IntegrityCheck>>({});
    const [preservationFile, setPreservationFile] = useState<string | null>(null);
    const [imageFile, setImageFile] = useState<DocumentFile | null>(null);
    const [pdfFile, setPdfFile] = useState<DocumentFile | null>(null);
    const canReadImage = !!digitization && can(me, 'DOCUMENT_READ', scope);
    const [opened, setOpened] = useState<{ file: DocumentFile; preview: boolean } | null>(null);
    const validationKeys = useRef<Record<string, string>>({});
    const canValidate = can(me, 'FILE_VALIDATE_MASTER', scope);
    const canReadContent = can(me, 'FILE_CONTENT_DOWNLOAD', scope);
    const canCheck = can(me, 'FILE_INTEGRITY_CHECK', scope);
    const canManagePreservation = can(me, 'PRESERVATION_EVENT_MANAGE', scope);
    const canReadPreservation = canManagePreservation || can(me, 'PRESERVATION_EVENT_READ', scope);
    const validate = async (fileId: string) => {
        if (busy) return;
        setBusy(fileId); setError(null);
        const key = validationKeys.current[fileId] ??= crypto.randomUUID();
        try { await records!.command('/files/' + fileId + '/validate-master', {}, key); onChanged(); }
        catch (err) { setError(err); }
        finally { setBusy(null); }
    };
    const verify = async (fileId: string) => {
        if (checking) return;
        setChecking(fileId); setError(null);
        try { const result = await records!.verifyIntegrity(fileId, crypto.randomUUID()); setIntegrity(prev => ({ ...prev, [fileId]: result })); }
        catch (err) { setError(err); }
        finally { setChecking(null); }
    };
    return <>{Boolean(error) && <ErrorNotice error={error}/>}{files.length ? <div className="table-scroll"><table><thead><tr><th>Fichier</th><th>Type</th><th>Rôle</th><th>Taille</th><th>Analyse</th><th>État</th><th>Intégrité</th><th>Actions</th></tr></thead><tbody>
        {files.map(f => <tr key={f.id}><td>{f.originalFilename}{f.master && <small>Maître de conservation</small>}</td><td><code>{f.mediaType}</code></td><td><Badge value={f.role}/></td><td>{formatBytes(f.size)}</td><td><Badge value={f.scanStatus}/></td><td><Badge value={f.state}/>{f.state === 'QUARANTINED' && f.scanStatus === 'CLEAN' && <small>Validation requise</small>}</td><td><IntegrityCell check={integrity[f.id]}/></td><td><div className="table-actions">
            {editable && f.state === 'QUARANTINED' && f.scanStatus === 'CLEAN' && !f.validatedAt && canValidate && <button className="btn small secondary" onClick={() => validate(f.id)} disabled={busy !== null}>{busy === f.id ? 'Validation…' : f.role === 'MAITRE_CONSERVATION' ? 'Valider comme maître' : 'Valider le fichier'}</button>}
            {fileIsReadable(f) && canReadContent && !integrity[f.id]?.blocked && <><button className="btn small primary" onClick={() => setOpened({ file: f, preview: true })}>Consulter</button><button className="btn small secondary" onClick={() => setOpened({ file: f, preview: false })}>Télécharger</button></>}
            {canCheck && <button className="btn small secondary" onClick={() => verify(f.id)} disabled={checking !== null}>{checking === f.id ? 'Vérification…' : 'Vérifier l’intégrité'}</button>}
            {canReadPreservation && <button className="btn small secondary" onClick={() => setPreservationFile(f.id)}>Conservation</button>}
            {canReadImage && isImageFile(f.mediaType) && <button className="btn small secondary" onClick={() => setImageFile(f)}>Caractéristiques</button>}
            {canReadImage && isPdfFile(f.mediaType) && <button className="btn small secondary" onClick={() => setPdfFile(f)}>PDF/A</button>}
        </div></td></tr>)}
    </tbody></table></div> : <Empty title="Aucun fichier enregistré pour cette version" icon="document"/>}
    {preservationFile && <PreservationDialog fileId={preservationFile} canManage={canManagePreservation} onClose={() => setPreservationFile(null)}/>}
    {opened && <FileContentDialog file={opened.file} preview={opened.preview} onClose={() => setOpened(null)}/>}
    {imageFile && <ImageTechnicalDialog fileId={imageFile.id} fileName={imageFile.originalFilename} institutionId={scope.institutionId ?? null} onClose={() => setImageFile(null)}/>}
    {pdfFile && <PdfaDialog fileId={pdfFile.id} fileName={pdfFile.originalFilename} onClose={() => setPdfFile(null)}/>}</>;
}

function VersionFilesRow({ version, revision }: { version: DocumentVersion; revision: number }) {
    const { records, epoch } = useSession();
    const q = useResource(s => records!.files(version.id, s), JSON.stringify(['files', version.id, revision, epoch]));
    return <tr><td colSpan={6}><div className="section-heading"><h4>Fichiers de la version {version.number}</h4><button className="btn small secondary" onClick={q.refresh} disabled={q.loading}>Actualiser les fichiers</button></div>
        {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh}/> : <FilesRow files={q.data!} editable={!version.sealed} onChanged={q.refresh}/>}</td></tr>;
}

export function VersionsPanel({ documentId, goTo }: { documentId: string; goTo?: (tab: string) => void }) {
    const { me, records, epoch } = useSession();
    const { scope } = useWorkspace();
    const q = useResource<DocumentVersion[]>(s => records!.versions(documentId, s), 'versions:' + documentId + epoch);
    // Le chemin du document ; si le serveur ne le donne pas (plus ancien), le panneau reste comme avant.
    const lifecycleQ = useResource<DocumentLifecycle | null>(s => Promise.resolve().then(() => records!.lifecycle(documentId, s)).catch(() => null), 'lifecycle:' + documentId + epoch);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const [fileRevision, setFileRevision] = useState(0);
    const [upload, setUpload] = useState<string | null>(null);
    const [history, setHistory] = useState<string | null>(null);
    const [creatingVersion, setCreatingVersion] = useState(false);
    const [sealing, setSealing] = useState<string | null>(null);
    const [error, setError] = useState<unknown>(null);
    const [sealedVersion, setSealedVersion] = useState<string | null>(null);
    const versionKey = useRef(new IntentKey());
    const [versionComment, setVersionComment] = useState('');
    const sealKeys = useRef<Record<string, string>>({});
    const canUpload = can(me, 'FILE_INGEST', scope);
    const canVersion = can(me, 'DOCUMENT_VERSION_CREATE', scope);
    const canSeal = can(me, 'VERSION_SEAL', scope);
    const addVersion = async () => {
        if (creatingVersion) return;
        setCreatingVersion(true); setError(null);
        try { const body = versionComment.trim() ? { comment: versionComment.trim() } : {}; const path = '/documents/' + documentId + '/versions'; await records!.command(path, body, versionKey.current.forRequest('POST', path, body)); versionKey.current.clear(); setVersionComment(''); q.refresh(); lifecycleQ.refresh(); }
        catch (err) { setError(err); }
        finally { setCreatingVersion(false); }
    };
    const seal = async (versionId: string) => {
        if (sealing) return;
        setSealing(versionId); setError(null); setSealedVersion(versionId);
        try { await records!.command('/versions/' + versionId + '/seal', {}, sealKeys.current[versionId] ??= crypto.randomUUID()); q.refresh(); lifecycleQ.refresh(); }
        catch (err) { setError(err); lifecycleQ.refresh(); }
        finally { setSealing(null); }
    };
    const refreshFiles = (versionId: string) => { setExpanded(prev => ({ ...prev, [versionId]: true })); setFileRevision(prev => prev + 1); lifecycleQ.refresh(); };
    const lifecycle = lifecycleQ.data ?? null;
    const onStep = (action: StepAction) => {
        const versionId = lifecycle?.version?.id;
        if (action === 'UPLOAD' && versionId) setUpload(versionId);
        else if (action === 'INGESTIONS' && versionId) { setSealedVersion(versionId); setHistory(versionId); }
        else if (action === 'SEAL' && versionId) void seal(versionId);
        else if (action === 'NEW_VERSION') void addVersion();
        else if (action === 'WORKFLOW') goTo?.('workflow');
        else if (action === 'CONSERVATION') goTo?.('preservation');
    };
    return <section className="panel"><div className="section-heading"><h3>Versions</h3>{canVersion && <button className="btn small secondary" onClick={addVersion} disabled={creatingVersion}>{creatingVersion ? 'Création…' : 'Nouvelle version'}</button>}</div>
        {canVersion && <Field label="Commentaire de la nouvelle version" wide hint="Facultatif : explique le contenu ou le motif de cette version."><textarea aria-label="Commentaire de la nouvelle version" value={versionComment} onChange={e => setVersionComment(e.target.value)} maxLength={2000} disabled={creatingVersion} /></Field>}
        {lifecycle?.destroyed && <DocumentTombstone documentId={documentId}/>}
        {lifecycle && <DocumentLifecycleBox lifecycle={lifecycle} busy={sealing !== null || creatingVersion} onAction={onStep}
            can={{ UPLOAD: canUpload, INGESTIONS: canUpload, SEAL: canSeal, NEW_VERSION: canVersion, WORKFLOW: goTo !== undefined, CONSERVATION: goTo !== undefined }} />}
        {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh}/> : q.data!.length ? <div className="table-scroll"><table><thead><tr><th>Numéro</th><th>État</th><th>Scellée</th><th>Empreinte</th><th>Horodatage RFC 3161</th><th>Actions</th></tr></thead><tbody>{q.data!.map(v =>
            <React.Fragment key={v.id}><tr><td>v{v.number}{v.comment && <small className="cell-sub">{v.comment}</small>}</td><td><Badge value={v.state}/></td><td>{v.sealed ? <Badge value="VALIDEE"/> : '—'}</td><td>{v.sealedHash ? <CopyId value={v.sealedHash}/> : '—'}</td><td>{v.sealed && <VersionTimestampCell versionId={v.id}/>}</td><td><div className="table-actions">
                <button className="btn small secondary" aria-expanded={!!expanded[v.id]} onClick={() => setExpanded(prev => ({ ...prev, [v.id]: !prev[v.id] }))}>{expanded[v.id] ? 'Masquer les fichiers' : 'Voir les fichiers'}</button>
                {canUpload && <button className="btn small secondary" onClick={() => setHistory(v.id)}>Suivi de mes dépôts</button>}
                {canUpload && !v.sealed && <button className="btn small primary" onClick={() => setUpload(v.id)}>Téléverser un fichier</button>}
                {canSeal && !v.sealed && <button className="btn small warning" onClick={() => seal(v.id)} disabled={sealing !== null || sealBlocked(lifecycle, v.id)} title={sealBlocked(lifecycle, v.id) ? 'Pas encore possible : voir « Du brouillon à la conservation » ci-dessus.' : undefined}>{sealing === v.id ? 'Scellement…' : 'Sceller'}</button>}
            </div></td></tr>{expanded[v.id] && <VersionFilesRow version={v} revision={fileRevision}/>}</React.Fragment>)}</tbody></table></div> : <Empty title="Aucune version enregistrée" icon="document"/>}
        {Boolean(error) && <ErrorNotice error={error}/>}
        {(() => {
            const hint = error instanceof ApiError ? sealHint(error.code) : null;
            return hint && <Notice tone="warning"><span>{hint.text}</span>{hint.open === 'INGESTIONS' && sealedVersion && <> <button className="btn small secondary" onClick={() => setHistory(sealedVersion)}>Ouvrir le suivi des dépôts</button></>}</Notice>;
        })()}
        {upload && <UploadDialog versionId={upload} defaultRole={needsMaster(lifecycle, upload) ? 'MAITRE_CONSERVATION' : 'PIECE_JOINTE'} onClose={() => { refreshFiles(upload); setUpload(null); }} onSuccess={() => refreshFiles(upload)}/>}
        {history && <IngestionHistory versionId={history} onClose={() => { setHistory(null); lifecycleQ.refresh(); }} onRefreshFiles={() => refreshFiles(history)}/>}
    </section>;
}

export function useDocumentFiles(documentId: string) {
    const { records, epoch } = useSession();
    const versions = useResource<DocumentVersion[]>(s => records!.versions(documentId, s), 'publish-versions:' + documentId + epoch);
    const [files, setFiles] = useState<Array<DocumentFile & {
        versionNumber: number;
    }> | null>(null);
    useEffect(() => {
        if (!versions.data)
            return;
        let alive = true;
        Promise.all(versions.data.map(v => records!.files(v.id).then(fs => fs.map(f => ({ ...f, versionNumber: v.number }))))).then(lists => { if (alive)
            setFiles(lists.flat()); });
        return () => { alive = false; };
    }, [versions.data]);
    return { loading: versions.loading || (!!versions.data && files === null), error: versions.error, files: files ?? [] };
}
