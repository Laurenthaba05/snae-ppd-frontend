import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { AcquisitionApi, ScannerClient, scannerErrors } from '../api/acquisition';
import type { Capabilities, ScannerJob, ScannerProfile, ScannerSettings } from '../api/acquisition';
import type { Ingestion } from '../core/types';
import { can } from '../core/policy';
import { ApiError } from '../core/http';
import { useSession } from '../auth/session';
import { useWorkspace } from './workspace';
import { ArchiveRecordPicker } from './ArchiveRecordPicker';
import { Busy, ErrorNotice, Field, Notice, useResource } from './components';
import { navigate } from './navigation';
import '../design/acquisition.css';

const PdfPreview = lazy(() => import('./PdfPreview'));

const sources: Record<string, string> = { glass: 'Vitre', feeder: 'Chargeur', duplex: 'Chargeur recto verso' };
const colors: Record<string, string> = { color: 'Couleur', gray: 'Niveaux de gris', bw: 'Noir et blanc' };
const states: Record<string, string> = { SCANNING: 'Numérisation en cours', READY: 'PDF prêt à vérifier', FAILED: 'Échec de la numérisation' };
const depositStates: Record<string, string> = { COMPLETED: 'Dépôt terminé', PROCESSING: 'Contrôles en cours', RETRYABLE: 'Reprise nécessaire', REJECTED: 'Fichier rejeté' };
const defaultBase = () => location.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) ? 'http://127.0.0.1:8765' : 'https://127.0.0.1:8765';
type Target = { documentId: string | null; versionId: string };

export function ScannerWorkspace() {
    const { records, demo, epoch } = useSession();
    const { scope } = useWorkspace();
    const api = useMemo(() => records ? new AcquisitionApi(records.transport) : null, [records]);
    const q = useResource(signal => api && !demo ? api.capabilities(signal) : Promise.resolve(null), String(epoch));
    if (demo) return <Notice>Le scanner est disponible en mode connecté. Aucun appareil n’est piloté en démonstration.</Notice>;
    return <div className="acquisition">{q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : api && q.data ?
        <ScannerCapture key={epoch} api={api} capabilities={q.data} /> : <Notice>Connexion au backend nécessaire.</Notice>}</div>;
}

export function ScannerCapture({ api, capabilities }: { api: AcquisitionApi; capabilities: Capabilities }) {
    const { records, me } = useSession();
    const { scope } = useWorkspace();
    const [base, setBase] = useState(defaultBase), [token, setToken] = useState('');
    const [client, setClient] = useState<ScannerClient | null>(null), [profiles, setProfiles] = useState<ScannerProfile[]>([]);
    const [settings, setSettings] = useState<ScannerSettings>({ profileId: '', source: 'glass', dpi: 300, pageSize: 'a4', colorMode: 'color' });
    const [jobs, setJobs] = useState<ScannerJob[]>([]), [job, setJob] = useState<ScannerJob | null>(null);
    const [uncertain, setUncertain] = useState(false), [pdf, setPdf] = useState<Blob | null>(null), [url, setUrl] = useState('');
    const [reviewed, setReviewed] = useState(false), [target, setTarget] = useState<Target>({ documentId: null, versionId: '' });
    const [auto, setAuto] = useState(false), [receipt, setReceipt] = useState<Ingestion | null>(null), [extractId, setExtractId] = useState('');
    const [extractionWaiting, setExtractionWaiting] = useState(false);
    const [uploadStarted, setUploadStarted] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState<unknown>(null);
    const [pollError, setPollError] = useState<unknown>(null), [confirmDelete, setConfirmDelete] = useState(false);
    const lock = useRef(false), lifetime = useRef(new AbortController()), requestId = useRef<string | null>(null);
    const profile = profiles.find(p => p.id === settings.profileId);
    const active = jobs.some(j => j.state === 'SCANNING') || job?.state === 'SCANNING';
    const canUpload = can(me, 'FILE_INGEST', scope);
    const canExtract = capabilities.extractionEnabled && capabilities.workerEnabled && can(me, 'ACQUISITION_EXTRACT', scope);
    const versions = useResource(s => target.documentId && records ? records.versions(target.documentId, s) : Promise.resolve([]), String(target.documentId));

    useEffect(() => { lifetime.current = new AbortController(); return () => lifetime.current.abort(); }, []);
    useEffect(() => { if (!uploadStarted) setTarget({ documentId: null, versionId: '' }); }, [scope.institutionId, scope.departmentId]);
    useEffect(() => {
        if (!pdf) { setUrl(''); return; }
        const next = URL.createObjectURL(pdf); setUrl(next); return () => URL.revokeObjectURL(next);
    }, [pdf]);
    const run = async (action: () => Promise<void>) => {
        if (lock.current) return;
        lock.current = true; setBusy(true); setError(null);
        try { await action(); } catch (e) { if (!lifetime.current.signal.aborted) setError(e); }
        finally { lock.current = false; if (!lifetime.current.signal.aborted) setBusy(false); }
    };
    const clearSelection = () => { setPdf(null); setJob(null); setReviewed(false); setReceipt(null); setExtractId(''); setExtractionWaiting(false); setUploadStarted(false); setPollError(null); setConfirmDelete(false); };
    const selectProfile = (p: ScannerProfile) => setSettings({ profileId: p.id, source: p.sources[0]!, dpi: p.resolutions.includes(300) ? 300 : p.resolutions[0]!, pageSize: p.pageSizes[0]!, colorMode: p.colorModes[0]! });
    const readJobs = async (c: ScannerClient) => {
        const result = await c.request<{ items: ScannerJob[] }>('/scans', undefined, 'GET', false, lifetime.current.signal);
        if (!lifetime.current.signal.aborted) setJobs(result.items);
    };
    const readJob = async (c: ScannerClient, id: string, signal = lifetime.current.signal) => {
        const next = await c.request<ScannerJob>('/scans/' + id, undefined, 'GET', false, signal);
        if (signal.aborted) return;
        if (next.state === 'READY') {
            const content = await c.request<Blob>('/scans/' + id + '/content', undefined, 'GET', true, signal);
            if (signal.aborted) return;
            setPdf(content);
        }
        setJob(next); setJobs(xs => xs.map(x => x.id === id ? next : x));
    };
    // One read at a time; the next timer starts only after the previous response. A failure pauses polling.
    useEffect(() => {
        if (!client || !job || job.state !== 'SCANNING' || busy || pollError) return;
        const controller = new AbortController();
        const timer = setTimeout(() => {
            readJob(client, job.id, controller.signal).catch(e => { if (!controller.signal.aborted) setPollError(e); });
        }, 1500);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [client, job, busy, pollError]);
    const requestExtraction = async (result: Ingestion) => {
        if (result.status === 'COMPLETED' && result.fileId && !extractId) {
            const files = await records!.files(result.versionId, lifetime.current.signal);
            if (lifetime.current.signal.aborted) return;
            const source = files.find(f => f.id === result.fileId);
            if (!source || source.scanStatus !== 'CLEAN' || !source.validatedAt || !['VALIDE', 'ARCHIVE'].includes(source.state)) {
                setExtractionWaiting(true); return;
            }
            setExtractionWaiting(false);
            const extraction = await api.extract(result.fileId, { ocr: 'AUTO', language: 'fra+eng' }, 'scan-extract:' + result.id);
            if (!lifetime.current.signal.aborted) setExtractId(extraction.id);
        }
    };
    const acceptReceipt = async (result: Ingestion) => {
        if (lifetime.current.signal.aborted) return;
        setReceipt(result);
        if (auto && canExtract) await requestExtraction(result);
    };
    const connect = async () => {
        const c = new ScannerClient(base.trim(), token.trim());
        const health = await c.request<{ protocolVersion?: number }>('/health', undefined, 'GET', false, lifetime.current.signal);
        if (health.protocolVersion !== 2) throw new Error('Mettez à jour le connecteur local pour bénéficier de la reprise des scans (protocole 2).');
        const available = await c.request<{ items: ScannerProfile[] }>('/profiles', undefined, 'GET', false, lifetime.current.signal);
        if (!available.items.length || available.items.some(p => !p.sources?.length || !p.resolutions?.length || !p.pageSizes?.length || !p.colorModes?.length))
            throw new Error('Aucun profil utilisable. Configurez et testez un profil NAPS2 sur ce poste.');
        await readJobs(c);
        if (lifetime.current.signal.aborted) return;
        setClient(c); setProfiles(available.items); selectProfile(available.items[0]!); setToken(''); setUncertain(false);
    };
    const launch = async () => {
        requestId.current ??= crypto.randomUUID();
        setUncertain(true);
        const next = await client!.request<ScannerJob>('/scans', { ...settings, requestId: requestId.current }, 'POST', false, lifetime.current.signal);
        if (lifetime.current.signal.aborted) return;
        setUncertain(false); setJob(next); setJobs(xs => [next, ...xs.filter(x => x.id !== next.id)]);
        if (next.state === 'READY') await readJob(client!, next.id);
    };

    return <div className="scanner-capture">
        <ol className="scanner-steps" aria-label="Étapes de numérisation"><li>Connecter le poste</li><li>Numériser et vérifier</li><li>Déposer et suivre</li></ol>
        <details className="acq-panel"><summary>Préparer le scanner — à faire une seule fois</summary>
            <ol><li>Brancher l’appareil et installer son pilote, puis NAPS2.</li><li>Créer un profil NAPS2 et tester une page. Déclarer uniquement les sources et résolutions réellement prises en charge dans le connecteur SNAE.</li><li>Lancer le connecteur sur ce PC et saisir ci-dessous son code temporaire. Le code reste uniquement en mémoire dans cet écran.</li></ol>
            <p>Le parc décrit les appareils. Les profils de qualité définissent les exigences de conservation. Le profil local NAPS2 pilote l’appareil.</p>
            <p>Le connecteur doit autoriser l’origine <code>{location.origin}</code>. Une connexion réussie au connecteur ne prouve pas que le scanner est branché.</p>
        </details>
        <section className="acq-panel"><h2>1 · Connecter le poste</h2>
            <fieldset disabled={busy}><div className="acq-grid">
                <Field label="Adresse du connecteur"><input aria-label="Adresse du connecteur" value={base} disabled={!!client} onChange={e => setBase(e.target.value)} /></Field>
                {!client && <Field label="Code de jumelage temporaire"><input aria-label="Code de jumelage temporaire" type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} /></Field>}
            </div><div className="acq-actions">{client ? <><span role="status">Connecteur local connecté · {profiles.length} profil(s)</span><button className="btn secondary" onClick={() => { setClient(null); setToken(''); setProfiles([]); setJobs([]); clearSelection(); setUncertain(false); requestId.current = null; }}>Déconnecter</button></> : <button className="btn primary" disabled={!token.trim()} onClick={() => void run(connect)}>Connecter</button>}</div></fieldset>
            <p>Le code de jumelage est distinct de votre mot de passe. Les copies temporaires peuvent être retrouvées après reconnexion, pendant 30 minutes.</p>
        </section>
        {client && <>
            <section className="acq-panel"><h2>Scans conservés sur ce poste</h2>
                <button className="btn secondary" disabled={busy} onClick={() => void run(() => readJobs(client))}>Actualiser les scans du poste</button>
                {!jobs.length ? <p>Aucun scan temporaire.</p> : <ul className="scanner-jobs">{jobs.map(item => <li key={item.id}><strong>{states[item.state]}</strong><small>{item.createdAt ? new Date(item.createdAt).toLocaleString('fr-FR') : item.id}</small>
                    <button className="btn small secondary" disabled={busy || item.id === job?.id || uploadStarted && receipt?.status !== 'COMPLETED'} onClick={() => void run(async () => { clearSelection(); requestId.current = null; setUncertain(false); await readJob(client, item.id); })}>Reprendre ce scan</button></li>)}</ul>}
            </section>
            <section className="acq-panel"><h2>2 · Numériser et vérifier</h2>
                {!job && <fieldset disabled={busy || uncertain || active}><div className="acq-grid">
                    <Field label="Profil de scanner"><select aria-label="Profil de scanner" value={settings.profileId} onChange={e => selectProfile(profiles.find(p => p.id === e.target.value)!)}>{profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
                    <Field label="Source"><select aria-label="Source" value={settings.source} onChange={e => setSettings(s => ({ ...s, source: e.target.value }))}>{profile?.sources.map(x => <option key={x} value={x}>{sources[x] ?? x}</option>)}</select></Field>
                    <Field label="Résolution"><select aria-label="Résolution" value={settings.dpi} onChange={e => setSettings(s => ({ ...s, dpi: Number(e.target.value) }))}>{profile?.resolutions.map(x => <option key={x} value={x}>{x} ppp</option>)}</select></Field>
                    <Field label="Format de page"><select aria-label="Format de page" value={settings.pageSize} onChange={e => setSettings(s => ({ ...s, pageSize: e.target.value }))}>{profile?.pageSizes.map(x => <option key={x} value={x}>{x.toUpperCase()}</option>)}</select></Field>
                    <Field label="Mode couleur"><select aria-label="Mode couleur" value={settings.colorMode} onChange={e => setSettings(s => ({ ...s, colorMode: e.target.value }))}>{profile?.colorModes.map(x => <option key={x} value={x}>{colors[x] ?? x}</option>)}</select></Field>
                </div><button className="btn primary" disabled={!profile} onClick={() => void run(launch)}>Lancer le scanner</button></fieldset>}
                {uncertain && <Notice tone="warning">La réponse au lancement est incertaine. Retrouvez le scan dans la liste du poste ou relisez la même demande.<button className="btn secondary" disabled={busy} onClick={() => void run(launch)}>Relire la demande de scan</button></Notice>}
                {active && !job && <Notice>Une numérisation est déjà en cours sur le poste. Reprenez-la dans la liste ci-dessus.</Notice>}
                {job && <><p role="status">{states[job.state]} · <code>{job.id}</code></p>
                    {job.settings && <p>{profiles.find(p => p.id === job.settings?.profileId)?.name ?? job.settings.profileId} · {sources[job.settings.source ?? ''] ?? job.settings.source} · {job.settings.dpi} ppp · {job.settings.pageSize?.toUpperCase()} · {colors[job.settings.colorMode ?? ''] ?? job.settings.colorMode}</p>}
                    {job.error && <Notice tone="warning">{scannerErrors[job.error] ?? job.error}</Notice>}
                    {job.expiresAt && <p>Copie locale disponible jusqu’à {new Date(job.expiresAt).toLocaleTimeString('fr-FR')}.</p>}
                    <div className="acq-actions"><button className="btn secondary" disabled={busy} onClick={() => void run(async () => { setPollError(null); await readJob(client, job.id); })}>Relire l’état / aperçu</button>
                        {job.state !== 'SCANNING' && <button className="btn secondary" disabled={busy || uploadStarted && receipt?.status !== 'COMPLETED' && receipt?.status !== 'REJECTED'} onClick={() => { clearSelection(); requestId.current = null; setUncertain(false); }}>Préparer un autre scan</button>}</div>
                </>}
                {!!pollError && <ErrorNotice error={pollError} />}
                {url && pdf && <><section title="Aperçu du document numérisé" aria-label="Aperçu du document numérisé"><Suspense fallback={<Busy label="Ouverture du lecteur PDF…" />}><PdfPreview blob={pdf} /></Suspense></section><a className="btn secondary" href={url} download={'scan-' + job?.id + '.pdf'}>Télécharger le PDF pour le vérifier</a>
                    <label className="acq-check"><input type="checkbox" checked={reviewed} disabled={busy || uploadStarted} onChange={e => setReviewed(e.target.checked)} />J’ai vérifié la lisibilité, le nombre et l’ordre des pages.</label></>}
            </section>
        </>}
        {pdf && job && <section className="acq-panel"><h2>3 · Déposer et suivre</h2>
            {!scope.institutionId && <Notice tone="warning">Sélectionnez une institution dans l’en-tête pour choisir le document destinataire.</Notice>}
            {!canUpload && <Notice tone="warning">L’habilitation de dépôt de fichiers est nécessaire dans cette institution.</Notice>}
            <fieldset disabled={busy || uploadStarted}>
                <ArchiveRecordPicker kind="documents" required institution={scope.institutionId ?? ''} department={scope.departmentId} value={target.documentId} disabled={!scope.institutionId || !canUpload || busy || uploadStarted} onChange={id => setTarget({ documentId: id, versionId: '' })} />
                {versions.loading ? <Busy /> : versions.error ? <ErrorNotice error={versions.error} onRetry={versions.refresh} /> : <Field label="Version documentaire"><select aria-label="Version documentaire" value={target.versionId} onChange={e => setTarget(v => ({ ...v, versionId: e.target.value }))}><option value="">Choisir une version non scellée</option>{versions.data?.map(v => <option key={v.id} value={v.id} disabled={v.sealed}>Version {v.number} · {v.state}{v.sealed ? ' · scellée' : ''}</option>)}</select></Field>}
                <label className="acq-check"><input type="checkbox" checked={auto} disabled={!canExtract} onChange={e => setAuto(e.target.checked)} />Demander l’extraction après le dépôt terminé</label>
            </fieldset>
            {(!capabilities.extractionEnabled || !capabilities.workerEnabled) ? <Notice>L’extraction automatique est désactivée sur ce serveur. Le dépôt du PDF reste disponible.</Notice> : !canExtract ? <Notice>Votre compte ne possède pas l’habilitation d’extraction dans ce périmètre. Le dépôt du PDF reste disponible.</Notice> : null}
            <p>Le PDF sera ajouté comme pièce jointe. Le dépôt applique les permissions, l’antivirus et les contrôles d’intégrité du backend.</p>
            <button className="btn primary" disabled={busy || !reviewed || !target.versionId || !canUpload || !!receipt} onClick={() => void run(async () => {
                setUploadStarted(true);
                let result: Ingestion;
                try {
                    result = await records!.uploadContent(target.versionId, new File([pdf], 'scan-' + job.id + '.pdf', { type: 'application/pdf', lastModified: 0 }), 'PIECE_JOINTE', 'scanner:' + job.id + ':' + target.versionId);
                } catch (e) {
                    // A definitive rejection before receiving an ingestion can be corrected; an uncertain write keeps its destination locked.
                    if (e instanceof ApiError && !e.uncertain && [400, 403, 404, 422].includes(e.status)) setUploadStarted(false);
                    throw e;
                }
                await acceptReceipt(result);
            })}>{uploadStarted ? 'Reprendre le même dépôt' : 'Importer ce scan'}</button>
            {uploadStarted && !receipt && <Notice>Conservez cette sélection. En cas de réponse perdue, « Reprendre le même dépôt » utilise la même demande et ne crée pas de doublon.</Notice>}
            {receipt && <><p role="status">{depositStates[receipt.status] ?? receipt.status} · reçu <code>{receipt.id}</code></p>
                <button className="btn secondary" disabled={busy} onClick={() => void run(async () => acceptReceipt(await records!.ingestion(receipt.id)))}>Relire le dépôt</button>
                {receipt.status === 'COMPLETED' && <><button className="btn secondary" onClick={() => navigate('/app/documents/' + target.documentId)}>Ouvrir le document</button>{canExtract && !extractId && <button className="btn secondary" disabled={busy} onClick={() => void run(() => requestExtraction(receipt))}>Demander / reprendre l’extraction</button>}</>}
                {receipt.status === 'RETRYABLE' || receipt.status === 'REJECTED' ? <Notice tone="warning">{receipt.resultCode ?? 'Le dépôt nécessite une intervention.'} Retrouvez le reçu dans la fiche documentaire pour traiter la cause.</Notice> : null}
            </>}
            {extractId && <p role="status">Extraction demandée : <code>{extractId}</code>. Cet identifiant permet de reprendre la relecture dans Acquisition.</p>}
            {extractionWaiting && <Notice>Le dépôt est terminé. Un agent habilité doit valider le fichier depuis la fiche documentaire avant l’extraction. Une fois cette validation faite, relisez le dépôt ou reprenez l’extraction.</Notice>}
        </section>}
        {client && job && job.state !== 'SCANNING' && <details className="acq-panel"><summary>Libérer la copie temporaire du poste</summary>
            <p>Cette suppression concerne uniquement le fichier du connecteur. Vérifiez que vous avez terminé le dépôt ou enregistré une copie si vous souhaitez la conserver.</p>
            <label className="acq-check"><input type="checkbox" checked={confirmDelete} disabled={busy} onChange={e => setConfirmDelete(e.target.checked)} />Je n’ai plus besoin de la copie locale de ce scan.</label>
            <button className="btn secondary" disabled={busy || !confirmDelete || uploadStarted && receipt?.status !== 'COMPLETED' && receipt?.status !== 'REJECTED'} onClick={() => void run(async () => { await client.request('/scans/' + job.id, undefined, 'DELETE'); clearSelection(); setUncertain(false); requestId.current = null; await readJobs(client); })}>Effacer la copie temporaire du poste</button>
        </details>}
        {busy && <Busy label="Opération en cours…" />}{!!error && <ErrorNotice error={error} />}
        <p className="page-note">Les scans temporaires expirent après 30 minutes et sont nettoyés à la prochaine requête. Le connecteur les efface à son arrêt normal. Les reçus de dépôt restent consultables dans la fiche documentaire.</p>
    </div>;
}
