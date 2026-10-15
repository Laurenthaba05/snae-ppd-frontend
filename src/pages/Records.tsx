import { IntentKey } from '../core/validation';
import { OptionalFields, useOptionalFields } from '../ui/OptionalFields';
import { DossierCloseButton } from '../ui/DossierClose';
import { RecordDescriptionButton, descriptionEditable } from '../ui/RecordDescription';
import { LegalHoldDialog } from '../ui/LegalHoldDialog';
import { ResourceDetailsButton } from '../ui/ResourceDetails';
import React, { useEffect, useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { useWorkspace, RecordWorkspaceProvider } from '../ui/workspace';
import { navigate } from '../ui/navigation';
import { PageHead, Badge, Busy, ErrorNotice, Empty, Pagination, useResource, CopyId, formatDate, Modal, Field, Notice } from '../ui/components';
import { Tabs } from '../ui/Tabs';
import { Icon } from '../ui/icons';
import { PreservationMonitoring } from '../ui/PreservationMonitoring';
import { BackupMonitoring } from '../ui/BackupMonitoring';
import { ReplicationMonitoring } from '../ui/ReplicationMonitoring';
import { PreservationPlanningSection, DocumentPremisPanel } from '../ui/PreservationPlanning';
import { ArkPanel, DisseminationSection } from '../ui/Dissemination';
import { DocumentFormPanel, KeywordsPanel } from '../ui/Vocabularies';
import { TrustAnchorsSection } from '../ui/TrustAnchors';
import { RecordForm } from './RecordForm';
import { AuditEventsTable, AuditDetailDialog } from './Audit';
import { HeritagePanel } from './Heritage';
import { RightsPanel } from './Rights';
import { MetadataPanel } from './Metadata';
import { WorkflowPanel } from './Workflow';
import { can } from '../core/policy';
import { ApiError } from '../core/http';
import { ingestionMessage, sealHint } from '../core/ingestion';
import { timestampFailure } from '../core/timestamp';
import { fileIsReadable } from '../core/file-content';
import { FileContentDialog } from '../ui/FileContentDialog';
import { IngestionHistory } from '../ui/IngestionHistory';
import { ConfigureRetentionRuleDialog } from '../ui/RetentionRuleDialog';
import { RetentionPlanningBox } from '../ui/RetentionPlanningBox';
import { DocumentLifecycleBox } from '../ui/DocumentLifecycleBox';
import type { StepAction } from '../core/lifecycle';
import { canSchedule as planningAllows } from '../core/retentionPlanning';
import type { DocumentLifecycle, RetentionPlanning, RecordCatalog, RecordDocument, Dossier, DocumentVersion, DocumentFile, Page, Ingestion, Institution, Department, Actor, DocumentActor, RetentionEvent, Disposition, LegalHold, Licence, Publication, AuditEvent, QualifiedTimestamp, IntegrityCheck, ClassificationNode, PreservationEvent, PreservationEventListItem } from '../core/types';
import { formatBytes } from '../core/format';
import { CertificateButton, CertificateDialog, DestructionPreviewBox, DocumentTombstone } from '../ui/Destruction';
import { DocumentArchivalPanel, DocumentRelationsPanel, DocumentTypeName, ClassificationName, DossierLink, DossierStructurePanel } from '../ui/RecordInfo';
import { SignaturesPanel } from '../ui/Signatures';
import { ImageTechnicalDialog, PdfaDialog } from '../ui/ScanProfiles';
import { isImageFile, isPdfFile } from '../core/scanProfiles';
import { DocumentIntermediateNotice } from '../ui/Intermediate';
import { DocumentTransferNotice } from '../ui/ArchiveTransfers';
import { DeclareTriggerEventDialog, DocumentTriggerEvents } from '../ui/TriggerEvents';
import { DocumentSamplingNotice } from '../ui/SamplingCampaigns';
import { blockerText, confirmationText, type DestructionCertificate, type DestructionPreview } from '../core/destruction';
function actorLabel(a: Actor): string {
    return a.legalName || [a.firstName, a.name].filter(Boolean).join(' ') || a.externalId || 'Acteur sans nom';
}
function useInstitutionNames() {
    const { api, epoch, me } = useSession();
    const q = useResource<Page<Institution>>(s => !me?.grants.some(g=>g.permission==='IAM_INSTITUTION_READ') ? Promise.resolve({items:[],page:0,size:100,hasMore:false}) : api!.list<Institution>('institutions', { page: 0, size: 100 }, s), 'institutions-lookup:' + epoch);
    return (id: string | null) => id ? (q.data?.items.find(i => i.id === id)?.nom ?? 'Institution non disponible') : '—';
}
function useDepartmentNames(institutionId: string | null) {
    const { api, epoch } = useSession();
    const q = useResource<Page<Department>>(s => institutionId ? api!.list<Department>('departments', { institutionId, page: 0, size: 100 }, s) : Promise.resolve({ items: [], page: 0, size: 100, hasMore: false }), 'departments-lookup:' + institutionId + epoch);
    return (id: string | null) => id ? (q.data?.items.find(d => d.id === id)?.nom ?? 'Département non disponible') : '—';
}
const recordMeta: Record<RecordCatalog, {
    name: string;
    singular: string;
    icon: string;
    description: string;
}> = {
    documents: { name: 'Documents', singular: 'document', icon: 'document', description: 'Les notices documentaires connues du backend, avec leur cote et leur statut réels.' },
    dossiers: { name: 'Dossiers', singular: 'dossier', icon: 'archive', description: 'Les dossiers regroupant des pièces, tels qu’enregistrés par le backend.' }
};
export function RecordCatalogPage({ kind }: {
    kind: RecordCatalog;
}) {
    const { me, records, epoch } = useSession();
    const { scope } = useWorkspace();
    const institutionName = useInstitutionNames();
    const [page, setPage] = useState(0);
    const [filter, setFilter] = useState('');
    const [create, setCreate] = useState(false);
    const [pendingUpload, setPendingUpload] = useState<{
        documentId: string;
        file: File;
    } | null>(null);
    const m = recordMeta[kind];
    useEffect(() => { setPage(0); setFilter(''); }, [kind, scope.institutionId, scope.departmentId]);
    const params = { page, size: 20, institutionId: scope.institutionId, departmentId: scope.departmentId };
    const q = useResource<Page<RecordDocument | Dossier>>(s => kind === 'documents' ? records!.documents(params, s) : records!.dossiers(params, s), JSON.stringify(['records', kind, params, epoch]));
    const rows = (q.data?.items ?? []).filter(x => JSON.stringify([x.title, x.reference]).toLowerCase().includes(filter.toLowerCase()));
    const creatable = can(me, kind === 'documents' ? 'DOCUMENT_CREATE' : 'DOSSIER_CREATE', scope);
    return <><PageHead eyebrow="MODULE · DOCUMENTS ET DOSSIERS" title={m.name} description={m.description}>{creatable && <button className="btn primary" onClick={() => setCreate(true)}><Icon name="plus" size={18}/>Ajouter {kind === 'documents' ? 'un document' : 'un dossier'}</button>}</PageHead>
        <div className="panel"><div className="table-toolbar"><div className="input-icon search-box"><Icon name="search"/><input aria-label={'Filtrer ' + m.name} placeholder="Filtrer les éléments de cette page…" value={filter} onChange={e => setFilter(e.target.value)}/></div><div className="toolbar-right"><button className="icon-btn" aria-label="Actualiser la liste" onClick={q.refresh}><Icon name="refresh" size={18}/></button></div></div>
        {q.loading ? <Busy /> : q.error ? <div className="panel-padding"><ErrorNotice error={q.error} onRetry={q.refresh}/></div> : <><div className="table-scroll"><table><thead><tr><th>Intitulé</th><th>Cote</th><th>Rattachement</th><th>Statut archivistique</th><th>Confidentialité</th><th><span className="sr-only">Consulter</span></th></tr></thead><tbody>{rows.map(x => <tr key={x.id}><td><button className="record-name" onClick={() => navigate('/app/' + kind + '/' + x.id)}><span className={'table-avatar ' + kind}><Icon name={m.icon} size={19}/></span><strong>{x.title}</strong></button></td><td><code>{x.reference}</code></td><td>{institutionName(x.institutionId)}</td><td><Badge value={x.archivalStatus}/></td><td><Badge value={x.confidentiality}/></td><td><button className="icon-btn" aria-label={'Ouvrir ' + x.title} onClick={() => navigate('/app/' + kind + '/' + x.id)}><Icon name="chevron" size={17}/></button></td></tr>)}</tbody></table></div>{!rows.length && <Empty title={filter ? 'Aucun résultat sur cette page' : 'Aucune ressource dans ce périmètre'} description={filter ? 'Le filtre porte uniquement sur les éléments déjà chargés. Passez à la page suivante ou retirez le filtre.' : 'Les ressources apparaîtront après une création autorisée côté backend.'}/>}<Pagination page={page} hasMore={q.data!.hasMore} count={q.data!.items.length} onChange={setPage}/></>}
        </div>
        <p className="page-note"><Icon name="shield" size={15}/>Les filtres d’affichage ne remplacent jamais les autorisations du backend.</p>
        {create && <RecordForm kind={kind} onClose={() => setCreate(false)} onCreated={(data, file) => { q.refresh(); setCreate(false); if (kind === 'documents' && file) setPendingUpload({ documentId: data.id, file }); }}/>}
        {pendingUpload && <PendingUpload documentId={pendingUpload.documentId} file={pendingUpload.file} onClose={() => setPendingUpload(null)} onSuccess={() => setPendingUpload(null)}/>}</>;
}
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
function PendingUpload({ documentId, file, onClose, onSuccess }: {
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
        <div className="panel">
            {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh}/> : items.length ? <div className="table-scroll"><table><thead><tr><th>Document</th><th>Type</th><th>Résultat</th><th>Outil</th><th>Date</th><th /></tr></thead><tbody>{items.map(item => <tr key={item.id}><td>{item.documentReference ?? 'Document non disponible'}</td><td><Badge value={item.typeEvenement}/></td><td><Badge value={item.resultat}/></td><td>{item.outil ?? '—'}</td><td>{formatDate(item.dateEvenement)}</td><td><button className="btn small secondary" onClick={() => navigate('/app/documents/' + item.documentId)}>Ouvrir le document</button></td></tr>)}</tbody></table></div> : <Empty title="Aucun événement" description="Aucun événement de préservation consigné dans ce périmètre."/>}
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
export function AttachActorDialog({ documentId, onClose, onSuccess }: {
    documentId: string;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const extra = useOptionalFields('actorDetails');
    const { records } = useSession();
    const existing = useResource<Page<Actor>>(s => records!.actors({ page: 0, size: 100 }, s), 'attach-actor-existing');
    const [mode, setMode] = useState<'existing' | 'new'>('existing');
    const [actorId, setActorId] = useState('');
    const [typeActeur, setTypeActeur] = useState('PERSONNE_PHYSIQUE');
    const [nom, setNom] = useState('');
    const [prenom, setPrenom] = useState('');
    const [raisonSociale, setRaisonSociale] = useState('');
    const [role, setRole] = useState('AUTEUR');
    const [order, setOrder] = useState('');
    const [comment, setComment] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy)
            return;
        setBusy(true);
        setError(null);
        try {
            const details = mode === 'new' ? extra.payload() : {};
            if (details.birthDate && details.deathDate && String(details.deathDate) < String(details.birthDate)) throw new Error('La date de fin doit suivre la naissance ou création.');
            let resolvedActorId = actorId;
            if (mode === 'new') {
                if (!nom.trim() && !raisonSociale.trim())
                    throw new Error('Indiquez un nom ou une raison sociale.');
                const created = await records!.command<{
                    id: string;
                }>('/actors', { ...details, type: typeActeur, name: nom.trim() || null, firstName: prenom.trim() || null, legalName: raisonSociale.trim() || null }, crypto.randomUUID(), 'POST');
                resolvedActorId = created.id;
            }
            if (!resolvedActorId)
                throw new Error('Choisissez un acteur.');
            await records!.command('/documents/' + documentId + '/actors', { actorId: resolvedActorId, role, order: order ? Number(order) : null, comment: comment.trim() || null }, crypto.randomUUID(), 'POST');
            onSuccess();
            onClose();
        }
        catch (err) {
            setError(err);
        }
        finally {
            setBusy(false);
        }
    };
    return <Modal title="Attacher un acteur" subtitle="Personne ou organisme lié à ce document (auteur, producteur, signataire…)." onClose={onClose} locked={busy}><form onSubmit={submit}><div className="form-grid">
        <div className="tabs"><button type="button" className={mode === 'existing' ? 'active' : ''} onClick={() => setMode('existing')}>Acteur existant</button><button type="button" className={mode === 'new' ? 'active' : ''} onClick={() => setMode('new')}>Nouvel acteur</button></div>
        {mode === 'existing' ? <Field label="Acteur *" wide><select value={actorId} onChange={e => setActorId(e.target.value)} required disabled={existing.loading}><option value="">{existing.loading ? 'Chargement…' : 'Choisir un acteur'}</option>{existing.data?.items.map(a => <option key={a.id} value={a.id}>{actorLabel(a)}</option>)}</select>{!existing.loading && !existing.data?.items.length && <small>Aucun acteur enregistré pour l’instant — utilisez « Nouvel acteur ».</small>}</Field> : <><Field label="Type *"><select value={typeActeur} onChange={e => setTypeActeur(e.target.value)}><option value="PERSONNE_PHYSIQUE">Personne physique</option><option value="PERSONNE_MORALE">Personne morale</option><option value="SERVICE">Service</option></select></Field>
        <Field label="Nom" hint="Nom ou raison sociale requis."><input value={nom} onChange={e => setNom(e.target.value)} maxLength={255}/></Field>
        <Field label="Prénom"><input value={prenom} onChange={e => setPrenom(e.target.value)} maxLength={150}/></Field>
        <Field label="Raison sociale"><input value={raisonSociale} onChange={e => setRaisonSociale(e.target.value)} maxLength={255}/></Field><OptionalFields form={extra} disabled={busy} /></>}
        <Field label="Rôle *"><select value={role} onChange={e => setRole(e.target.value)}><option value="AUTEUR">Auteur</option><option value="PRODUCTEUR">Producteur</option><option value="SIGNATAIRE">Signataire</option><option value="DESTINATAIRE">Destinataire</option><option value="DONATEUR">Donateur</option><option value="DEPOSANT">Déposant</option><option value="DETENTEUR_ANTERIEUR">Détenteur antérieur</option><option value="CONTRIBUTEUR">Contributeur</option><option value="AUTRE">Autre</option></select></Field>
        <Field label="Ordre" hint="Optionnel."><input type="number" min={0} value={order} onChange={e => setOrder(e.target.value)}/></Field>
        <Field label="Commentaire" wide hint="Optionnel."><textarea value={comment} onChange={e => setComment(e.target.value)} maxLength={2000}/></Field>
        </div>{Boolean(error) && <ErrorNotice error={error}/>}<footer className="modal-footer"><button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>{busy ? <span className="spinner"/> : <Icon name="arrow" size={17}/>} Attacher</button></footer></form></Modal>;
}
function ActorsPanel({ documentId }: {
    documentId: string;
}) {
    const { me, records, epoch } = useSession();
    const { scope } = useWorkspace();
    const q = useResource<DocumentActor[]>(s => records!.documentActors(documentId, s), 'document-actors:' + documentId + epoch);
    const actorsLookup = useResource<Page<Actor>>(s => records!.actors({ page: 0, size: 100 }, s), 'actors-lookup:' + epoch);
    const [attach, setAttach] = useState(false);
    const canAttach = can(me, 'DOCUMENT_ACTOR_MANAGE', scope);
    const label = (actorId: string) => { const a = actorsLookup.data?.items.find(x => x.id === actorId); return a ? actorLabel(a) : 'Acteur non disponible'; };
    return <section className="panel"><div className="section-heading"><h3>Acteurs</h3>{canAttach && <button className="btn small secondary" onClick={() => setAttach(true)}>Attacher un acteur</button>}</div>
        {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh}/> : q.data!.length ? <div className="table-scroll"><table><thead><tr><th>Acteur</th><th>Rôle</th><th>Ordre</th><th>Commentaire</th></tr></thead><tbody>{q.data!.map(a => <tr key={a.id}><td>{label(a.actorId)}{(() => { const actor = actorsLookup.data?.items.find(x => x.id === a.actorId); return actor && <details><summary>Fiche de l’acteur</summary>{actor.externalId && <p>Identifiant externe : {actor.externalId}</p>}{actor.birthDate && <p>Naissance ou création : {actor.birthDate}</p>}{actor.deathDate && <p>Décès ou dissolution : {actor.deathDate}</p>}{actor.description && <p>{actor.description}</p>}</details>; })()}</td><td><Badge value={a.role}/></td><td>{a.order ?? '—'}</td><td>{a.comment ?? '—'}</td></tr>)}</tbody></table></div> : <Empty title="Aucun acteur attaché" icon="users"/>}
        {attach && <AttachActorDialog documentId={documentId} onClose={() => setAttach(false)} onSuccess={q.refresh}/>}
    </section>;
}
function ProposeDispositionDialog({ eventId, onClose, onSuccess }: {
    eventId: string;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const { retention } = useSession();
    const [decision, setDecision] = useState('REEXAMINER');
    const [comment, setComment] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy)
            return;
        setBusy(true);
        setError(null);
        try {
            await retention!.command('/events/' + eventId + '/dispositions', { decision, comment: comment.trim() || null }, crypto.randomUUID(), 'POST');
            onSuccess();
            onClose();
        }
        catch (err) {
            setError(err);
        }
        finally {
            setBusy(false);
        }
    };
    return <Modal title="Proposer une décision" subtitle="La validation devra être faite par une autre personne avant toute exécution." onClose={onClose} locked={busy}><form onSubmit={submit}><div className="form-grid">
        <Field label="Décision *"><select value={decision} onChange={e => setDecision(e.target.value)}><option value="CONSERVER_DEFINITIVEMENT">Conserver définitivement</option><option value="ELIMINER">Éliminer</option><option value="TRANSFERER">Transférer</option><option value="REEXAMINER">Réexaminer</option></select></Field>
        <Field label="Commentaire" wide hint="Optionnel."><textarea value={comment} onChange={e => setComment(e.target.value)} maxLength={4000}/></Field>
        </div>{Boolean(error) && <ErrorNotice error={error}/>}<footer className="modal-footer"><button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>{busy ? <span className="spinner"/> : <Icon name="arrow" size={17}/>} Proposer</button></footer></form></Modal>;
}
export function ValidateDispositionDialog({ dispositionId, decision, onClose, onSuccess }: {
    dispositionId: string;
    decision?: string;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const extra = useOptionalFields('dispositionEvidence');
    const { retention } = useSession();
    const [approve, setApprove] = useState(true);
    const [visaReference, setVisaReference] = useState('');
    const [procesVerbal, setProcesVerbal] = useState('');
    const [comment, setComment] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const elimination = decision === 'ELIMINER';
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy)
            return;
        setBusy(true);
        setError(null);
        try {
            const details = extra.payload();
            if (details.evidenceJson) details.evidenceJson = JSON.stringify(details.evidenceJson);
            await retention!.command('/dispositions/' + dispositionId + '/validate', { ...details, approve, visaReference: visaReference.trim() || null, procesVerbal: procesVerbal.trim() || null, comment: comment.trim() || null }, crypto.randomUUID(), 'POST');
            onSuccess();
            onClose();
        }
        catch (err) {
            setError(err);
        }
        finally {
            setBusy(false);
        }
    };
    return <Modal title="Valider la disposition" subtitle="La validation doit être faite par une personne différente de celle qui a proposé la décision." onClose={onClose} locked={busy}><form onSubmit={submit}><div className="form-grid">
        <OptionalFields form={extra} disabled={busy} />
        <Field label="Décision *"><select value={approve ? '1' : '0'} onChange={e => setApprove(e.target.value === '1')}><option value="1">Approuver</option><option value="0">Rejeter</option></select></Field>
        {elimination && approve && <div className="span2"><DestructionPreviewBox dispositionId={dispositionId}/></div>}
        <Field label={elimination && approve ? 'Référence de visa *' : 'Référence de visa'} hint={elimination && approve ? 'Obligatoire pour une élimination : la référence du visa de l’autorité.' : 'Optionnelle.'}><input value={visaReference} onChange={e => setVisaReference(e.target.value)} maxLength={255} required={elimination && approve}/></Field>
        <Field label={elimination && approve ? 'Procès-verbal *' : 'Procès-verbal'} wide hint={elimination && approve ? 'Obligatoire pour une élimination. L’inventaire exact des fichiers est joint à la preuve : l’exécution refusera s’ils changent.' : 'Optionnel.'}><textarea value={procesVerbal} onChange={e => setProcesVerbal(e.target.value)} maxLength={4000} required={elimination && approve}/></Field>
        <Field label="Commentaire" wide hint="Optionnel."><textarea value={comment} onChange={e => setComment(e.target.value)} maxLength={4000}/></Field>
        </div>{Boolean(error) && <ErrorNotice error={error}/>}<footer className="modal-footer"><button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Annuler</button><button type="submit" className={'btn ' + (approve ? 'primary' : 'danger')} disabled={busy}>{busy ? <span className="spinner"/> : <Icon name="check" size={17}/>} {approve ? 'Valider' : 'Rejeter'}</button></footer></form></Modal>;
}
function ExecuteDispositionDialog({ dispositionId, decision, onClose, onSuccess }: {
    dispositionId: string;
    decision?: string;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const { retention } = useSession();
    const readiness = useResource(s => retention!.readiness(dispositionId, s), 'disposition-readiness:' + dispositionId);
    const [executionReference, setExecutionReference] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const elimination = decision === 'ELIMINER';
    const [preview, setPreview] = useState<DestructionPreview | null>(null);
    const [confirmed, setConfirmed] = useState(false);
    const [certificate, setCertificate] = useState<DestructionCertificate | null>(null);
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy)
            return;
        setBusy(true);
        setError(null);
        try {
            await retention!.command('/dispositions/' + dispositionId + '/execute', { executionReference: executionReference.trim() || null }, crypto.randomUUID(), 'POST');
            onSuccess();
            if (elimination) { setCertificate(await retention!.certificateOfAction(dispositionId)); return; }
            onClose();
        }
        catch (err) {
            setError(err);
        }
        finally {
            setBusy(false);
        }
    };
    const blocked = !!readiness.data && !readiness.data.executable;
    // l'élimination se confirme en connaissance du contenu : l'aperçu doit être chargé, et la case cochée
    const mustConfirm = elimination && !confirmed;
    if (certificate) return <CertificateDialog certificate={certificate} onClose={onClose}/>;
    return <Modal title={elimination ? 'Exécuter l’élimination' : 'Exécuter la disposition'} subtitle={elimination ? 'Destruction définitive du contenu : le certificat en sera la preuve.' : 'Action définitive, conforme à la décision validée.'} onClose={onClose} locked={busy}><form onSubmit={submit}><div className="form-grid">
        {readiness.loading ? <Busy /> : readiness.data && <Notice tone={blocked ? 'warning' : 'info'}>{blocked ? <>Non exécutable :<ul>{readiness.data.blockers.map(b => <li key={b}>{blockerText(b)}</li>)}</ul></> : 'Prête à être exécutée.'}</Notice>}
        {elimination && <div className="span2"><DestructionPreviewBox dispositionId={dispositionId} onLoaded={setPreview}/></div>}
        <Field label="Référence d’exécution" wide hint="Optionnelle. À défaut, la référence du certificat de destruction."><input value={executionReference} onChange={e => setExecutionReference(e.target.value)} maxLength={255}/></Field>
        {elimination && preview && <label className="field span2 check-field"><span><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={busy}/> {confirmationText(preview)}</span><small>Cette opération est irréversible.</small></label>}
        </div>{Boolean(error) && <ErrorNotice error={error}/>}<footer className="modal-footer"><button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Annuler</button><button type="submit" className="btn danger" disabled={busy || blocked || mustConfirm || (elimination && !preview)}>{busy ? <span className="spinner"/> : <Icon name="check" size={17}/>} Exécuter</button></footer></form></Modal>;
}
function CancelDispositionDialog({ dispositionId, onClose, onSuccess }: {
    dispositionId: string;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const { retention } = useSession();
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy)
            return;
        setBusy(true);
        setError(null);
        try {
            await retention!.command('/dispositions/' + dispositionId + '/cancel', { reason: reason.trim() }, crypto.randomUUID(), 'POST');
            onSuccess();
            onClose();
        }
        catch (err) {
            setError(err);
        }
        finally {
            setBusy(false);
        }
    };
    return <Modal title="Annuler la disposition" onClose={onClose} locked={busy}><form onSubmit={submit}><div className="form-grid">
        <Field label="Motif *" wide><textarea value={reason} onChange={e => setReason(e.target.value)} required maxLength={4000}/></Field>
        </div>{Boolean(error) && <ErrorNotice error={error}/>}<footer className="modal-footer"><button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Retour</button><button type="submit" className="btn danger" disabled={busy}>{busy ? <span className="spinner"/> : <Icon name="close" size={17}/>} Annuler la disposition</button></footer></form></Modal>;
}
function ReexamineDispositionDialog({ dispositionId, onClose, onSuccess }: {
    dispositionId: string;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const { retention } = useSession();
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const [nextReviewDate, setNextReviewDate] = useState('');
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy || !nextReviewDate || reason.trim().length < 4)
            return;
        setBusy(true);
        setError(null);
        try {
            await retention!.command('/dispositions/' + dispositionId + '/reexamine', { nextReviewDate, reason: reason.trim() }, crypto.randomUUID(), 'POST');
            onSuccess();
            onClose();
        }
        catch (err) {
            setError(err);
        }
        finally {
            setBusy(false);
        }
    };
    return <Modal title="Réexaminer le document" subtitle="Le document n’est ni conservé ni éliminé : son échéance est repoussée à la date de la prochaine revue." onClose={onClose} locked={busy}><form onSubmit={submit}><div className="form-grid">
        <Field label="Prochaine date de revue *" hint="Postérieure à aujourd’hui."><input type="date" min={tomorrow} value={nextReviewDate} onChange={e => setNextReviewDate(e.target.value)} required disabled={busy}/></Field>
        <Field label="Motif *" wide hint="Pourquoi la décision est reportée (4 caractères au moins)."><textarea value={reason} onChange={e => setReason(e.target.value)} required maxLength={4000} disabled={busy}/></Field>
        </div>{Boolean(error) && <ErrorNotice error={error}/>}<footer className="modal-footer"><button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Annuler</button><button type="submit" className="btn primary" disabled={busy || !nextReviewDate || reason.trim().length < 4}>{busy ? 'Enregistrement…' : 'Réexaminer'}</button></footer></form></Modal>;
}
export function EventDispositions({ eventId, eventStatus }: {
    eventId: string;
    eventStatus: string;
}) {
    const { me, retention, epoch } = useSession();
    const { scope } = useWorkspace();
    const q = useResource<Disposition[]>(s => retention!.eventDispositions(eventId, s), 'event-dispositions:' + eventId + epoch);
    const [propose, setPropose] = useState(false);
    const [validateId, setValidateId] = useState<string | null>(null);
    const [executeId, setExecuteId] = useState<string | null>(null);
    const [cancelId, setCancelId] = useState<string | null>(null);
    const [reexamineId, setReexamineId] = useState<string | null>(null);
    const canPropose = can(me, 'DISPOSITION_PROPOSE', scope);
    const canValidate = can(me, 'DISPOSITION_VALIDATE', scope);
    const canExecute = can(me, 'DISPOSITION_EXECUTE', scope);
    const canCancel = can(me, 'DISPOSITION_CANCEL', scope);
    const dispositions = q.data ?? [];
    const latest = dispositions[0];
    const showPropose = canPropose && ['ECHEANCE', 'EN_DECISION'].includes(eventStatus) && (!latest || ['REJETEE', 'ANNULEE', 'EXECUTEE'].includes(latest.status));
    return <tr><td colSpan={4}>
        {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh}/> : dispositions.length ? <div className="table-scroll"><table><thead><tr><th>Décision</th><th>Statut</th><th>Proposée le</th><th /></tr></thead><tbody>{dispositions.map(d => <tr key={d.id}><td><Badge value={d.decision}/></td><td><Badge value={d.status}/></td><td>{formatDate(d.proposedAt)}</td><td className="table-actions">{d.status === 'PROPOSEE' && canValidate && <button className="btn small secondary" onClick={() => setValidateId(d.id)}>Valider</button>}{d.status === 'VALIDEE' && canExecute && (d.decision === 'REEXAMINER'
            ? <button className="btn small primary" onClick={() => setReexamineId(d.id)}>Réexaminer</button>
            : <button className="btn small primary" onClick={() => setExecuteId(d.id)}>Exécuter</button>)}{d.status === 'EXECUTEE' && d.decision === 'ELIMINER' && <CertificateButton label="Certificat de destruction" load={signal => retention!.certificateOfAction(d.id, signal)}/>}{['PROPOSEE', 'VALIDEE'].includes(d.status) && canCancel && <button className="btn small danger-outline" onClick={() => setCancelId(d.id)}>Annuler</button>}</td></tr>)}</tbody></table></div> : <Empty title="Aucune disposition proposée" icon="check"/>}
        {showPropose && <button className="btn small secondary" style={{ marginTop: 8 }} onClick={() => setPropose(true)}>Proposer une décision</button>}
        {propose && <ProposeDispositionDialog eventId={eventId} onClose={() => setPropose(false)} onSuccess={q.refresh}/>}
        {validateId && <ValidateDispositionDialog dispositionId={validateId} decision={dispositions.find(d => d.id === validateId)?.decision} onClose={() => setValidateId(null)} onSuccess={q.refresh}/>}
        {executeId && <ExecuteDispositionDialog dispositionId={executeId} decision={dispositions.find(d => d.id === executeId)?.decision} onClose={() => setExecuteId(null)} onSuccess={q.refresh}/>}
        {cancelId && <CancelDispositionDialog dispositionId={cancelId} onClose={() => setCancelId(null)} onSuccess={q.refresh}/>}
        {reexamineId && <ReexamineDispositionDialog dispositionId={reexamineId} onClose={() => setReexamineId(null)} onSuccess={q.refresh}/>}
    </td></tr>;
}
export function ReleaseHoldDialog({ holdId, onClose, onSuccess }: {
    holdId: string;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const { retention } = useSession();
    const [releaseReference, setReleaseReference] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy)
            return;
        setBusy(true);
        setError(null);
        try {
            await retention!.command('/legal-holds/' + holdId + '/release', { releaseReference }, crypto.randomUUID(), 'POST');
            onSuccess();
            onClose();
        }
        catch (err) {
            setError(err);
        }
        finally {
            setBusy(false);
        }
    };
    return <Modal title="Lever le gel légal" onClose={onClose} locked={busy}><form onSubmit={submit}><div className="form-grid">
        <Field label="Référence de levée *" wide><input value={releaseReference} onChange={e => setReleaseReference(e.target.value)} required maxLength={255}/></Field>
        </div>{Boolean(error) && <ErrorNotice error={error}/>}<footer className="modal-footer"><button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>{busy ? <span className="spinner"/> : <Icon name="check" size={17}/>} Lever</button></footer></form></Modal>;
}
function LegalHoldsPanel({ documentId, institutionId, departmentId }: {
    departmentId?: string | null;
    documentId: string;
    institutionId: string;
}) {
    const { me, retention, epoch } = useSession();
    const { scope } = useWorkspace();
    const q = useResource<LegalHold[]>(s => retention!.documentHolds(documentId, s), 'document-holds:' + documentId + epoch);
    const [open, setOpen] = useState(false);
    const [release, setRelease] = useState<string | null>(null);
    const canManage = can(me, 'LEGAL_HOLD_MANAGE', scope);
    const holds = q.data ?? [];
    return <section className="panel"><div className="section-heading"><h3>Gels légaux</h3>{canManage && <button className="btn small secondary" onClick={() => setOpen(true)}>Ouvrir un gel</button>}</div>
        {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh}/> : holds.length ? <div className="table-scroll"><table><thead><tr><th>Référence</th><th>Statut</th><th>Motif</th><th>Ouvert le</th><th /></tr></thead><tbody>{holds.map(h => <tr key={h.id}><td><code>{h.reference}</code></td><td><Badge value={h.status}/></td><td>{h.reason}{h.description && <small className="cell-sub">{h.description}</small>}{h.authority && <small className="cell-sub">Autorité : {h.authority}</small>}</td><td>{formatDate(h.openedAt)}</td><td>{h.status === 'ACTIF' && canManage && <button className="btn small danger-outline" onClick={() => setRelease(h.id)}>Lever</button>}</td></tr>)}</tbody></table></div> : <Empty title="Aucun gel légal sur ce document" icon="shield"/>}
        {open && <LegalHoldDialog documentId={documentId} institutionId={institutionId} departmentId={departmentId} onClose={() => setOpen(false)} onSuccess={q.refresh}/>}
        {release && <ReleaseHoldDialog holdId={release} onClose={() => setRelease(null)} onSuccess={q.refresh}/>}
    </section>;
}
export function RetentionPanel({ documentId, dossierId = null, businessStatus, onDocumentChanged }: {
    documentId: string;
    dossierId?: string | null;
    businessStatus: string;
    onDocumentChanged: () => void;
}) {
    const { me, records, retention, epoch } = useSession();
    const { scope } = useWorkspace();
    const q = useResource<RetentionEvent[]>(s => retention!.documentEvents(documentId, s), 'retention-events:' + documentId + epoch);
    const planningQ = useResource<RetentionPlanning>(s => retention!.planning(documentId, s), 'retention-planning:' + documentId + ':' + businessStatus + epoch);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const [configureRule, setConfigureRule] = useState(false);
    const [declaring, setDeclaring] = useState(false);
    const [ruleNotice, setRuleNotice] = useState<string | null>(null);
    const canClose = can(me, 'DOCUMENT_CLOSE', scope);
    const canSchedule = can(me, 'RETENTION_SCHEDULE', scope);
    const canManageRules = can(me, 'RETENTION_RULE_MANAGE', scope);
    const closeDocument = async () => {
        setBusy(true);
        setError(null);
        try {
            await records!.command('/documents/' + documentId + '/close', {}, crypto.randomUUID(), 'POST');
            onDocumentChanged();
        }
        catch (err) {
            setError(err);
        }
        finally {
            setBusy(false);
        }
    };
    const schedule = async () => {
        setBusy(true);
        setError(null);
        try {
            await retention!.schedule(documentId, crypto.randomUUID());
            q.refresh();
            planningQ.refresh();
        }
        catch (err) {
            setError(err);
        }
        finally {
            setBusy(false);
        }
    };
    const [expanded, setExpanded] = useState<string | null>(null);
    const events = q.data ?? [];
    return <section className="panel"><div className="section-heading"><h3>Conservation</h3>{canManageRules && <button className="btn small secondary" onClick={() => setConfigureRule(true)}>Configurer une règle</button>}</div>
        {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh}/> : events.length ? <div className="table-scroll"><table><thead><tr><th>Statut</th><th>Date de base</th><th>Échéance</th><th>Révisions</th></tr></thead><tbody>{events.map(ev => <React.Fragment key={ev.id}><tr><td><Badge value={ev.status}/></td><td>{formatDate(ev.baseDate)}</td><td>{formatDate(ev.dueDate)}</td><td><button className="btn small secondary" onClick={() => setExpanded(x => x === ev.id ? null : ev.id)}>{ev.reviewCount} · {expanded === ev.id ? 'Masquer' : 'Dispositions'}</button></td></tr>{expanded === ev.id && <EventDispositions eventId={ev.id} eventStatus={ev.status}/>}</React.Fragment>)}</tbody></table></div> : (planningQ.data ? <RetentionPlanningBox planning={planningQ.data} onDeclareEvent={canSchedule && planningQ.data.rule?.triggerEventTypeId ? () => setDeclaring(true) : undefined}/> : <Empty title="Aucune échéance planifiée" description="Le document doit être clos et une règle de conservation applicable doit exister." icon="clock"/>)}
        {ruleNotice && <Notice>{ruleNotice}</Notice>}
        <DocumentTriggerEvents documentId={documentId} onChanged={() => { q.refresh(); planningQ.refresh(); }}/>
        {declaring && planningQ.data?.rule?.triggerEventTypeId && <DeclareTriggerEventDialog documentId={documentId} dossierId={dossierId} typeId={planningQ.data.rule.triggerEventTypeId}
            typeLabel={planningQ.data.rule.triggerEventTypeLabel ?? 'Événement déclencheur'} onClose={() => setDeclaring(false)} onDone={() => { setDeclaring(false); q.refresh(); planningQ.refresh(); }}/>}
        {Boolean(error) && <ErrorNotice error={error}/>}
        <div className="table-actions" style={{ marginTop: 12 }}>
            {businessStatus !== 'CLOS' && canClose && <button className="btn small warning" onClick={closeDocument} disabled={busy}>Clore le document</button>}
            {businessStatus === 'CLOS' && !events.length && canSchedule && <button className="btn small primary" onClick={schedule} disabled={busy || !planningAllows(planningQ.data)} title={planningAllows(planningQ.data) ? undefined : 'Voir ce qui manque ci-dessus.'}>Planifier la conservation</button>}
        </div>
        {configureRule && <ConfigureRetentionRuleDialog onClose={() => setConfigureRule(false)} onSuccess={code => { setRuleNotice(`La règle ${code} est active. Elle s’applique aux documents qui correspondent à ses types et rubriques ; la situation de ce document est mise à jour ci-dessus.`); planningQ.refresh(); }}/>}
    </section>;
}
function useDocumentFiles(documentId: string) {
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
function CreateLicenceDialog({ onClose, onSuccess }: {
    onClose: () => void;
    onSuccess: (licence: Licence) => void;
}) {
    const { publication } = useSession();
    const [code, setCode] = useState('');
    const [libelle, setLibelle] = useState('');
    const [uri, setUri] = useState('');
    const [description, setDescription] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy)
            return;
        setBusy(true);
        setError(null);
        try {
            const licence = await publication!.command<Licence>('/licences', { code, libelle, uri: uri.trim() || null, description: description.trim() || null }, crypto.randomUUID(), 'POST');
            onSuccess(licence);
            onClose();
        }
        catch (err) {
            setError(err);
        }
        finally {
            setBusy(false);
        }
    };
    return <Modal title="Créer une licence" onClose={onClose} locked={busy}><form onSubmit={submit}><div className="form-grid">
        <Field label="Code *"><input value={code} onChange={e => setCode(e.target.value)} required maxLength={100} placeholder="CC-BY-4.0"/></Field>
        <Field label="Intitulé *"><input value={libelle} onChange={e => setLibelle(e.target.value)} required maxLength={255}/></Field>
        <Field label="URL" hint="Optionnelle."><input value={uri} onChange={e => setUri(e.target.value)} maxLength={2000}/></Field>
        <Field label="Description" wide hint="Optionnelle."><textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={4000}/></Field>
        </div>{Boolean(error) && <ErrorNotice error={error}/>}<footer className="modal-footer"><button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>{busy ? <span className="spinner"/> : <Icon name="arrow" size={17}/>} Créer</button></footer></form></Modal>;
}
function PublishDialog({ documentId, onClose, onSuccess }: {
    documentId: string;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const { publication } = useSession();
    const { files, loading: filesLoading } = useDocumentFiles(documentId);
    const licences = useResource<Licence[]>(s => publication!.licences(s), 'licences-lookup');
    const [fichierId, setFichierId] = useState('');
    const [visibilite, setVisibilite] = useState('PUBLIC');
    const [canal, setCanal] = useState('PORTAIL');
    const [licenceId, setLicenceId] = useState('');
    const [createLicence, setCreateLicence] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy)
            return;
        setBusy(true);
        setError(null);
        try {
            await publication!.command('/documents/' + documentId + '/publications', { fichierId, visibilite, canal, licenceId: licenceId || null }, crypto.randomUUID(), 'POST');
            onSuccess();
            onClose();
        }
        catch (err) {
            setError(err);
        }
        finally {
            setBusy(false);
        }
    };
    return <Modal title="Publier un fichier" subtitle="Enregistre une publication selon le canal choisi. Aucun portail public anonyme n’est fourni par ce contrat." onClose={onClose} locked={busy}><form onSubmit={submit}><div className="form-grid">
        <Field label="Fichier *" wide><select value={fichierId} onChange={e => setFichierId(e.target.value)} required disabled={filesLoading}><option value="">{filesLoading ? 'Chargement…' : 'Choisir un fichier'}</option>{files.map(f => <option key={f.id} value={f.id}>v{f.versionNumber} — {f.originalFilename}</option>)}</select>{!filesLoading && !files.length && <small>Aucun fichier téléversé sur ce document.</small>}</Field>
        <Field label="Visibilité *"><select value={visibilite} onChange={e => setVisibilite(e.target.value)}><option value="PUBLIC">Public</option><option value="RESTREINT">Restreint</option><option value="INTERNE">Interne</option></select></Field>
        <Field label="Canal *"><input value={canal} onChange={e => setCanal(e.target.value)} required maxLength={50}/></Field>
        <Field label="Licence" wide hint="Optionnelle."><div className="input-icon"><select value={licenceId} onChange={e => setLicenceId(e.target.value)} disabled={licences.loading}><option value="">Aucune</option>{licences.data?.map(l => <option key={l.id} value={l.id}>{l.libelle}</option>)}</select><button type="button" className="icon-btn" aria-label="Créer une licence" onClick={() => setCreateLicence(true)}><Icon name="plus" size={16}/></button></div></Field>
        </div>{Boolean(error) && <ErrorNotice error={error}/>}<footer className="modal-footer"><button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Annuler</button><button type="submit" className="btn primary" disabled={busy || !files.length}>{busy ? <span className="spinner"/> : <Icon name="arrow" size={17}/>} Publier</button></footer></form>
        {licenceId && <ResourceDetailsButton resource="licence" id={licenceId} label="Lire la licence" />}
        {createLicence && <CreateLicenceDialog onClose={() => setCreateLicence(false)} onSuccess={l => { licences.refresh(); setLicenceId(l.id); }}/>}
    </Modal>;
}
function PublicationPanel({ documentId }: {
    documentId: string;
}) {
    const { me, publication, epoch } = useSession();
    const { scope } = useWorkspace();
    const q = useResource<Publication[]>(s => publication!.documentPublications(documentId, s), 'document-publications:' + documentId + epoch);
    const [publish, setPublish] = useState(false);
    const [busy, setBusy] = useState(false);
    const [actionError,setActionError]=useState<unknown>(null);
    const canManage = can(me, 'PUBLICATION_MANAGE', scope);
    const withdraw = async (id: string) => {
        if(busy) return;
        setBusy(true); setActionError(null);
        try {
            await publication!.command('/publications/' + id + '/withdraw', {}, crypto.randomUUID(), 'POST');
            q.refresh();
        }
        catch(error) { setActionError(error); }
        finally {
            setBusy(false);
        }
    };
    const publications = q.data ?? [];
    return <section className="panel"><div className="section-heading"><h3>Publication</h3>{canManage && <button className="btn small secondary" onClick={() => setPublish(true)}>Publier un fichier</button>}</div>
        {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh}/> : publications.length ? <div className="table-scroll"><table><thead><tr><th>Statut</th><th>Visibilité</th><th>Canal</th><th>Publiée le</th><th /></tr></thead><tbody>{publications.map(p => <tr key={p.id}><td><Badge value={p.statut}/><ResourceDetailsButton resource="publication" id={p.id} /></td><td><Badge value={p.visibilite}/></td><td>{p.canal}</td><td>{formatDate(p.datePublication)}</td><td>{p.statut === 'PUBLIEE' && canManage && <button className="btn small danger-outline" onClick={() => withdraw(p.id)} disabled={busy}>Retirer</button>}</td></tr>)}</tbody></table></div> : <Empty title="Aucune publication" icon="check"/>}
        {Boolean(actionError)&&<ErrorNotice error={actionError}/>}
        {publish && <PublishDialog documentId={documentId} onClose={() => setPublish(false)} onSuccess={q.refresh}/>}
    </section>;
}
function AuditPanel({ objectType, objectId }: {
    objectType: string;
    objectId: string;
}) {
    const { me, audit, epoch } = useSession();
    const [page, setPage] = useState(0);
    const [selected, setSelected] = useState<AuditEvent | null>(null);
    const size = 20;
    const canRead = can(me, 'AUDIT_READ', {});
    const q = useResource(s => audit!.objectEvents(objectType, objectId, page, size, s), 'object-audit:' + objectType + objectId + page + epoch);
    if (!canRead)
        return null;
    const rows = q.data?.items ?? [];
    return <section className="panel"><div className="section-heading"><h3>Journal</h3></div>
        {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh}/> : rows.length ? <><AuditEventsTable rows={rows} onSelect={setSelected}/><Pagination page={page} hasMore={q.data!.hasMore} count={rows.length} onChange={setPage}/></> : <Empty title="Aucun événement journalisé" icon="clock"/>}
        {selected && <AuditDetailDialog event={selected} onClose={() => setSelected(null)}/>}
    </section>;
}
function ReclassifyDialog({ documentId, institutionId, currentNodeId, onClose, onSuccess }: {
    documentId: string;
    institutionId: string;
    currentNodeId: string | null;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const { records, classification } = useSession();
    const nodesQ = useResource<ClassificationNode[]>(s => classification!.nodes(institutionId, s), 'reclassify-nodes:' + institutionId);
    const [nodeId, setNodeId] = useState(currentNodeId ?? '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy)
            return;
        setBusy(true);
        setError(null);
        try {
            await records!.classify(documentId, nodeId || null, crypto.randomUUID());
            onSuccess();
            onClose();
        }
        catch (err) {
            setError(err);
        }
        finally {
            setBusy(false);
        }
    };
    return <Modal title="Reclasser le document" onClose={onClose} locked={busy}><form onSubmit={submit}><div className="form-grid">
        <Field label="Nœud de classement" wide hint="Vide pour retirer le classement."><select value={nodeId} onChange={e => setNodeId(e.target.value)} disabled={busy || nodesQ.loading}><option value="">Aucun</option>{nodesQ.data?.map(n => <option key={n.id} value={n.id}>{n.code ? n.code + ' · ' : ''}{n.libelle}</option>)}</select></Field>
        </div>{Boolean(error) && <ErrorNotice error={error}/>}<footer className="modal-footer"><button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>{busy ? <span className="spinner"/> : <Icon name="arrow" size={17}/>} Enregistrer</button></footer></form></Modal>;
}
export function RecordDetailPage({ kind, id }: {kind: RecordCatalog; id: string;}) {
    const { me, records, epoch } = useSession();
    const q = useResource<RecordDocument | Dossier>(s => kind === 'documents' ? records!.document(id, s) : records!.dossier(id, s), 'record-detail:' + kind + id + epoch);
    const institutionName = useInstitutionNames();
    const departmentName = useDepartmentNames(q.data?.institutionId ?? null);
    const [reclassifying, setReclassifying] = useState(false);
    const [creatingChild, setCreatingChild] = useState(false);
    const [tab,setTab] = useState('description');
    if (q.loading) return <Busy />;
    if (q.error) return <ErrorNotice error={q.error} onRetry={q.refresh}/>;
    const e=q.data!;
    const scope={institutionId:e.institutionId,departmentId:e.departmentId};
    const allowed=(permission:string,national=false)=>can(me,permission,national?{}:scope);
    const isDocument=kind==='documents';
    const available=[
      {id:'description',label:'Description',show:true},
      {id:'files',label:'Fichiers & versions',show:isDocument&&allowed('DOCUMENT_READ')},
      {id:'workflow',label:'Traitement',show:isDocument&&allowed('WORKFLOW_READ')},
      {id:'rights',label:'Accès & diffusion',show:isDocument&&(allowed('RIGHTS_READ',true)||allowed('PUBLICATION_READ'))},
      {id:'preservation',label:'Conservation',show:isDocument&&(allowed('RETENTION_REVIEW')||allowed('LEGAL_HOLD_MANAGE')||allowed('HERITAGE_READ',true))},
      {id:'history',label:'Historique',show:allowed('AUDIT_READ',true)}
    ].filter(x=>x.show);
    const current=available.some(x=>x.id===tab)?tab:'description';
    const fields:[string,unknown][]=[['Référence interne',e.reference],['Institution',institutionName(e.institutionId)],['Département',departmentName(e.departmentId)],['Statut métier',e.businessStatus],['Classement',<ClassificationName id={e.classificationNodeId} institutionId={e.institutionId}/>],...(isDocument?[
        ['Type documentaire',<DocumentTypeName id={(e as RecordDocument).typeDocumentId}/>],['Dossier',(e as RecordDocument).dossierId?<DossierLink id={(e as RecordDocument).dossierId!}/>:null],['Diffusion',(e as RecordDocument).distributionStatus],['Origine',({ CREE: 'Créé', RECU: 'Reçu', IMPORTE: 'Importé', NUMERISE: 'Numérisé', VERSE: 'Versé' } as Record<string, string>)[(e as RecordDocument).origin ?? ''] ?? (e as RecordDocument).origin],['Institution détentrice',(e as RecordDocument).holderInstitutionId ? institutionName((e as RecordDocument).holderInstitutionId!) : null],['Transféré le',formatDate((e as RecordDocument).transferredAt)]
      ]:[['Ouvert le',formatDate((e as Dossier).openedOn)],['Clos le',formatDate((e as Dossier).closedOn)]]) as [string,unknown][]];
    return <RecordWorkspaceProvider scope={scope} key={kind+id+epoch}>
      <button className="back-link" onClick={()=>navigate('/app/'+kind)}>← Retour aux {recordMeta[kind].name.toLowerCase()}</button>
      <PageHead eyebrow="ARCHIVES · FICHE DOCUMENTAIRE" title={e.title} description={e.reference}>
        {!isDocument && <DossierCloseButton dossier={e as Dossier} onChanged={q.refresh} />}
        {isDocument&&allowed('DOCUMENT_CLASSIFY')&&<button className="btn secondary" onClick={()=>setReclassifying(true)}>Reclasser</button>}
      </PageHead>
      <div className="f3-status-summary"><span>Cycle archivistique <Badge value={e.archivalStatus}/></span><span>Confidentialité <Badge value={e.confidentiality}/></span></div>
      <Tabs label="Rubriques de la fiche" items={available} value={current} onChange={setTab}/>
      <section role="tabpanel" id="f3-active-tab-panel" className="f3-tab-panel" aria-label={available.find(x=>x.id===current)?.label}>
      {current==='description'&&<>
        <section className="panel f3-preview-description"><div className="section-heading"><h3>Description et contexte</h3>{descriptionEditable(e) && allowed(isDocument ? 'DOCUMENT_DESCRIPTION_UPDATE' : 'DOSSIER_DESCRIPTION_UPDATE') && <RecordDescriptionButton kind={kind} id={id} onChanged={q.refresh} />}</div>{e.description && <p style={{ whiteSpace: 'pre-wrap' }}>{e.description}</p>}{!isDocument && (e as Dossier).subject && <p><strong>Objet : </strong>{(e as Dossier).subject}</p>}<dl className="f3-description-list">{fields.map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v===null||v===undefined||v===''?'—':React.isValidElement(v)?v:String(v)}</dd></div>)}</dl><details className="f3-contract-details"><summary>Identifiants techniques</summary><CopyId value={id}/>{isDocument&&<p>Verrou de version : {(e as RecordDocument).versionLock}</p>}</details></section>
        {isDocument&&<DocumentArchivalPanel document={e as RecordDocument} canEdit={allowed('DOCUMENT_DESCRIPTION_UPDATE')} onChanged={q.refresh}/>}
        {isDocument&&<DocumentRelationsPanel document={e as RecordDocument} canEdit={allowed('DOCUMENT_DESCRIPTION_UPDATE')}/>}
        {isDocument&&allowed('DOCUMENT_READ')&&<DocumentFormPanel documentId={id} canEdit={allowed('DOCUMENT_DESCRIPTION_UPDATE')&&!(e as RecordDocument).destroyed}/>}
        {isDocument&&allowed('DOCUMENT_READ')&&<KeywordsPanel kind="DOCUMENT" objectId={id} institutionId={e.institutionId} canEdit={allowed('DOCUMENT_DESCRIPTION_UPDATE')&&!(e as RecordDocument).destroyed}/>}
        {!isDocument&&allowed('DOSSIER_READ')&&<KeywordsPanel kind="DOSSIER" objectId={id} institutionId={e.institutionId} canEdit={allowed('DOSSIER_DESCRIPTION_UPDATE')}/>}
        {isDocument&&allowed('DOCUMENT_METADATA_READ')&&<MetadataPanel documentId={id}/>}
        {isDocument&&allowed('DOCUMENT_READ')&&<details className="f3-contract-details"><summary>Acteurs du document</summary><ActorsPanel documentId={id}/></details>}
        {!isDocument&&<DossierStructurePanel dossier={e as Dossier} canEdit={allowed('DOSSIER_DESCRIPTION_UPDATE')} canCreate={allowed('DOSSIER_CREATE')} onChanged={q.refresh} onCreateChild={()=>setCreatingChild(true)}/>}
      </>}
      {current==='files'&&<><VersionsPanel documentId={id} goTo={setTab}/>{isDocument&&allowed('DOCUMENT_READ')&&<SignaturesPanel documentId={id} canEdit={allowed('DOCUMENT_DESCRIPTION_UPDATE')} destroyed={!!(e as RecordDocument).destroyed}/>}</>}
      {current==='workflow'&&<WorkflowPanel documentId={id}/>}
      {current==='rights'&&<>{allowed('RIGHTS_READ',true)&&<RightsPanel documentId={id} institutionId={isDocument?e.institutionId:undefined} destroyed={isDocument&&!!(e as RecordDocument).destroyed}/>} {allowed('PUBLICATION_READ')&&<><Notice>Une publication enregistrée n’implique pas qu’un portail public anonyme soit déployé.</Notice><PublicationPanel documentId={id}/></>}</>}
      {current==='preservation'&&<>{isDocument&&allowed('RETENTION_REVIEW')&&<DocumentIntermediateNotice documentId={id}/>}{isDocument&&allowed('RETENTION_REVIEW')&&<DocumentTransferNotice documentId={id}/>}{isDocument&&allowed('RETENTION_REVIEW')&&<DocumentSamplingNotice documentId={id}/>}{allowed('RETENTION_REVIEW')&&<RetentionPanel documentId={id} dossierId={isDocument ? (e as RecordDocument).dossierId : null} businessStatus={e.businessStatus} onDocumentChanged={q.refresh}/>}{allowed('LEGAL_HOLD_MANAGE')&&<LegalHoldsPanel documentId={id} institutionId={e.institutionId} departmentId={e.departmentId}/>} {isDocument&&(allowed('DISSEMINATION_READ')||allowed('DISSEMINATION_MANAGE'))&&<ArkPanel objectType="DOCUMENT" objectId={id} institutionId={e.institutionId} canManage={allowed('DISSEMINATION_MANAGE')}/>} {isDocument&&allowed('PRESERVATION_EVENT_READ')&&<DocumentPremisPanel documentId={id} reference={e.reference} canManage={allowed('PRESERVATION_EVENT_MANAGE')} canExport={allowed('PRESERVATION_PACKAGE_EXPORT')}/>} {allowed('HERITAGE_READ',true)&&<HeritagePanel documentId={id}/>}</>}
      {current==='history'&&allowed('AUDIT_READ',true)&&<AuditPanel objectType={isDocument?'DOCUMENT':'DOSSIER'} objectId={id}/>}
      </section>
      {creatingChild&&<RecordForm kind="dossiers" parent={e as Dossier} onClose={()=>setCreatingChild(false)} onCreated={data=>{setCreatingChild(false);navigate('/app/dossiers/'+data.id);}}/>}
      {reclassifying&&<ReclassifyDialog documentId={id} institutionId={e.institutionId} currentNodeId={isDocument?(e as RecordDocument).classificationNodeId:null} onClose={()=>setReclassifying(false)} onSuccess={q.refresh}/>}
    </RecordWorkspaceProvider>;
}
