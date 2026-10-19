import { ResourceDetailsButton } from '../ui/ResourceDetails';
import { OptionalFields, useOptionalFields } from '../ui/OptionalFields';
import { OcrLayoutDialog } from '../ui/OcrLayoutDialog';
import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { can } from '../core/policy';
import { navigate } from '../ui/navigation';
import { PageHead, Busy, ErrorNotice, Empty, useResource, Modal, Field, Badge, formatDate } from '../ui/components';
import { Icon } from '../ui/icons';
import { uuid } from '../core/validation';
import { LotsPanel, PagesSection } from '../ui/Scanning';
import { ElementWorkflowPanel } from '../ui/ElementWorkflow';
import { OcrJobsPanel } from '../ui/OcrJobsPanel';
import { FileAssetsPanel } from '../ui/FileAssetsPanel';
import { AccessPdfPanel } from '../ui/AccessPdfPanel';
import { canWith, isCaptureStage, isWorkingStage, stageName } from '../core/workflow';
import { BatchImportDialog, CodeLookup, SheetsButton, elementSheet } from '../ui/ScanCodes';
import type { DigitizationProject, DigitizationElement, QualityControl, QualityControlListItem, OcrResult, Contribution, ScanLot } from '../core/types';
import { display, elementName } from '../core/format';
import { OriginDialog, OriginFields, OriginText, originPayload } from '../ui/Origin';

export function CreateProjectDialog({ onClose, onCreated }: {
    onClose: () => void;
    onCreated: () => void;
}) {
    const { digitization } = useSession();
    const [nom, setNom] = useState('');
    const [code, setCode] = useState('');
    const [perimetre, setPerimetre] = useState('');
    const [description, setDescription] = useState('');
    const [institutionId, setInstitutionId] = useState('');
    const [departmentId, setDepartmentId] = useState('');
    const extra = useOptionalFields('project');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await digitization!.command('/projects', { ...extra.payload(), nom: nom.trim(), code: code.trim() || null, perimetre: perimetre.trim() || null, description: description.trim() || null, ...originPayload(institutionId, departmentId) }, crypto.randomUUID(), 'POST');
            onCreated();
            onClose();
        }
        catch (e) {
            setError(e);
        }
        finally {
            setBusy(false);
        }
    };
    return <Modal title="Créer un projet de numérisation" onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                
                <Field label="Nom" wide><input value={nom} onChange={e => setNom(e.target.value)} required maxLength={255} disabled={busy}/></Field>
                <Field label="Code" hint="Optionnel"><input value={code} onChange={e => setCode(e.target.value)} maxLength={100} disabled={busy}/></Field>
                <Field label="Périmètre" hint="Optionnel"><input value={perimetre} onChange={e => setPerimetre(e.target.value)} disabled={busy}/></Field>
                <OriginFields institutionId={institutionId} departmentId={departmentId} onChange={(i, d) => { setInstitutionId(i); setDepartmentId(d); }} disabled={busy} hint="Facultatif : l’institution dont on numérise les archives. Elle sert aux tableaux de bord."/>
                <Field label="Description" wide><textarea value={description} onChange={e => setDescription(e.target.value)} disabled={busy}/></Field>
            <details className="span2"><summary>Informations complémentaires</summary><div className="form-grid"><OptionalFields form={extra} disabled={busy}/></div></details>
            </div>
            {error ? <ErrorNotice error={error}/> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>Créer</button></footer>
        </form>
    </Modal>;
}

function CreateElementDialog({ projectId, onClose, onCreated }: {
    projectId: string;
    onClose: () => void;
    onCreated: () => void;
}) {
    const extra = useOptionalFields('elementOrder');
    const { digitization, epoch } = useSession();
    const [archivePhysiqueId, setArchivePhysiqueId] = useState('');
    const [documentId, setDocumentId] = useState('');
    const [descriptionSource, setDescriptionSource] = useState('');
    const [lotId, setLotId] = useState('');
    const [pagesAttendues, setPagesAttendues] = useState('');
    const [rectoVerso, setRectoVerso] = useState(false);
    const lotsQ = useResource<ScanLot[]>(s => digitization!.lotsByProject(projectId, s), 'element-lots:' + projectId + ':' + epoch);
    const openLots = (lotsQ.data ?? []).filter(l => l.statut === 'OUVERT');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const trimmedArchive = archivePhysiqueId.trim();
            const trimmedDocument = documentId.trim();
            await digitization!.command('/elements', { ...extra.payload(), projetNumerisationId: projectId, archivePhysiqueId: trimmedArchive ? uuid(trimmedArchive) : null, documentId: trimmedDocument ? uuid(trimmedDocument) : null, descriptionSource: descriptionSource.trim() || null, lotId: lotId || null, pagesAttendues: pagesAttendues.trim() ? Number(pagesAttendues) : null, rectoVerso }, crypto.randomUUID(), 'POST');
            onCreated();
            onClose();
        }
        catch (e) {
            setError(e);
        }
        finally {
            setBusy(false);
        }
    };
    return <Modal title="Créer un élément à numériser" onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Archive physique" hint="Identifiant, optionnel si document renseigné" wide><input value={archivePhysiqueId} onChange={e => setArchivePhysiqueId(e.target.value)} disabled={busy}/></Field>
                <Field label="Document" hint="Identifiant, optionnel si archive renseignée" wide><input value={documentId} onChange={e => setDocumentId(e.target.value)} disabled={busy}/></Field>
                <Field label="Description de la source" wide><textarea value={descriptionSource} onChange={e => setDescriptionSource(e.target.value)} disabled={busy}/></Field>
                <Field label="Lot de numérisation" hint="Optionnel : réglages communs et suivi des pages"><select value={lotId} onChange={e => { setLotId(e.target.value); const lot = openLots.find(l => l.id === e.target.value); if (lot) setRectoVerso(lot.rectoVerso); }} disabled={busy}><option value="">Aucun lot</option>{openLots.map(l => <option key={l.id} value={l.id}>{l.code}{l.nom ? ' · ' + l.nom : ''}</option>)}</select></Field>
                <Field label="Pages attendues" hint="Optionnel : permet de détecter les pages manquantes"><input type="number" min={1} max={100000} value={pagesAttendues} onChange={e => setPagesAttendues(e.target.value)} disabled={busy}/></Field>
                <OptionalFields form={extra} disabled={busy} />
                <Field label="Faces"><select value={rectoVerso ? 'oui' : 'non'} onChange={e => setRectoVerso(e.target.value === 'oui')} disabled={busy}><option value="non">Recto seul</option><option value="oui">Recto-verso</option></select></Field>
            </div>
            {error ? <ErrorNotice error={error}/> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy || (!archivePhysiqueId.trim() && !documentId.trim())}>Créer</button></footer>
        </form>
    </Modal>;
}

function LinkFileDialog({ elementId, onClose, onLinked }: {
    elementId: string;
    onClose: () => void;
    onLinked: () => void;
}) {
    const { digitization } = useSession();
    const [fichierId, setFichierId] = useState('');
    const [typeSortie, setTypeSortie] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await digitization!.command(`/elements/${elementId}/files/${uuid(fichierId.trim())}`, { typeSortie: typeSortie.trim() }, crypto.randomUUID(), 'POST');
            onLinked();
            onClose();
        }
        catch (e) {
            setError(e);
        }
        finally {
            setBusy(false);
        }
    };
    return <Modal title="Rattacher un fichier numérisé" onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Identifiant du fichier" wide><input value={fichierId} onChange={e => setFichierId(e.target.value)} required disabled={busy}/></Field>
                <Field label="Type de sortie" hint="Ex. MAITRE, DERIVE"><input value={typeSortie} onChange={e => setTypeSortie(e.target.value)} required maxLength={40} disabled={busy}/></Field>
            </div>
            {error ? <ErrorNotice error={error}/> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>Rattacher</button></footer>
        </form>
    </Modal>;
}

function CreateQualityControlDialog({ elementId, onClose, onCreated }: {
    elementId: string;
    onClose: () => void;
    onCreated: () => void;
}) {
    const { digitization } = useSession();
    const [dpi, setDpi] = useState('');
    const [modeCouleur, setModeCouleur] = useState('');
    const [conforme, setConforme] = useState(true);
    const [decision, setDecision] = useState('');
    const extra = useOptionalFields('quality');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await digitization!.command(`/elements/${elementId}/quality-controls`, { ...extra.payload(), dpi: dpi.trim() ? Number(dpi) : null, modeCouleur: modeCouleur.trim() || null, conforme, decision: decision.trim() || null }, crypto.randomUUID(), 'POST');
            onCreated();
            onClose();
        }
        catch (e) {
            setError(e);
        }
        finally {
            setBusy(false);
        }
    };
    return <Modal title="Enregistrer un contrôle qualité" onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                
                <Field label="DPI" hint="Optionnel"><input type="number" value={dpi} onChange={e => setDpi(e.target.value)} disabled={busy}/></Field>
                <Field label="Mode couleur" hint="Optionnel"><input value={modeCouleur} onChange={e => setModeCouleur(e.target.value)} maxLength={40} disabled={busy}/></Field>
                <Field label="Conforme ?"><select value={conforme ? 'oui' : 'non'} onChange={e => setConforme(e.target.value === 'oui')} disabled={busy}><option value="oui">Oui</option><option value="non">Non</option></select></Field>
                <Field label="Décision" hint="Optionnelle"><input value={decision} onChange={e => setDecision(e.target.value)} maxLength={30} disabled={busy}/></Field>
            <details className="span2"><summary>Informations complémentaires</summary><div className="form-grid"><OptionalFields form={extra} disabled={busy}/></div></details>
            </div>
            {error ? <ErrorNotice error={error}/> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>Enregistrer</button></footer>
        </form>
    </Modal>;
}

export function CreateContributionDialog({ elementId, onClose, onCreated }: {
    elementId: string;
    onClose: () => void;
    onCreated: () => void;
}) {
    const { digitization } = useSession();
    const [typeContribution, setTypeContribution] = useState('');
    const [contenu, setContenu] = useState('');
    const [fileId, setFileId] = useState('');
    const [resultatOcrId, setResultatOcrId] = useState('');
    const files = useResource(s => digitization!.fileAssets(elementId, s), 'contribution-files:' + elementId);
    const ocr = useResource(s => fileId ? digitization!.ocrResultsByFile(fileId, s) : Promise.resolve([]), 'contribution-ocr:' + elementId + ':' + fileId);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (busy) return;
        if (fileId && (!resultatOcrId || ocr.loading || !ocr.data?.some(r => r.id === resultatOcrId && r.fichierId === fileId))) { setError(new Error('Choisissez un résultat OCR du fichier sélectionné.')); return; }
        setBusy(true);
        setError(null);
        try {
            await digitization!.command(`/elements/${elementId}/contributions`, { typeContribution: typeContribution.trim(), contenu, resultatOcrId: resultatOcrId ? uuid(resultatOcrId) : null }, crypto.randomUUID(), 'POST');
            onCreated();
            onClose();
        }
        catch (e) {
            setError(e);
        }
        finally {
            setBusy(false);
        }
    };
    return <Modal title="Ajouter une contribution" onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Type" hint="Ex. TRANSCRIPTION, CORRECTION"><input value={typeContribution} onChange={e => setTypeContribution(e.target.value)} required maxLength={40} disabled={busy}/></Field>
                <Field label="Fichier OCR" hint="Facultatif : pour corriger un résultat précis.">{files.error ? <ErrorNotice error={files.error} onRetry={files.refresh}/> : <select aria-label="Fichier OCR de la contribution" value={fileId} disabled={busy || files.loading} onChange={e => { setFileId(e.target.value); setResultatOcrId(''); }}><option value="">Contribution générale</option>{files.data?.items.filter((f, i, all) => all.findIndex(x => x.fichierId === f.fichierId) === i).map(f => <option key={f.fichierId} value={f.fichierId}>{f.numeroPage ? 'Page ' + f.numeroPage : 'Fichier'} · {f.mediaType} · {f.role}</option>)}</select>}</Field>
                {fileId && <Field label="Résultat OCR">{ocr.error ? <ErrorNotice error={ocr.error} onRetry={ocr.refresh}/> : <select aria-label="Résultat OCR de la contribution" value={resultatOcrId} disabled={busy || ocr.loading} required onChange={e => setResultatOcrId(e.target.value)}><option value="">Choisir un résultat</option>{ocr.data?.filter(r => r.fichierId === fileId).map(r => <option key={r.id} value={r.id}>{r.typeReconnaissance} · {r.moteur ?? 'Moteur non précisé'} · {r.statutValidation} · {r.createdAt}</option>)}</select>}</Field>}
                <Field label="Contenu" wide><textarea value={contenu} onChange={e => setContenu(e.target.value)} required disabled={busy}/></Field>
            </div>
            {error ? <ErrorNotice error={error}/> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy || (!!fileId && (ocr.loading || !!ocr.error || !resultatOcrId))}>Ajouter</button></footer>
        </form>
    </Modal>;
}

function OcrSection({ canManage }: {
    elementId: string;
    canManage: boolean;
}) {
    const { digitization, epoch } = useSession();
    const [layoutItem, setLayoutItem] = useState<OcrResult | null>(null);
    const [fichierId, setFichierId] = useState('');
    const [lookedUp, setLookedUp] = useState('');
    const [creating, setCreating] = useState(false);
    const [texte, setTexte] = useState('');
    const [typeReconnaissance, setTypeReconnaissance] = useState('');
    const extra = useOptionalFields('ocr');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const q = useResource<OcrResult[]>(s => lookedUp ? digitization!.ocrResultsByFile(lookedUp, s) : Promise.resolve([]), 'ocr-results:' + lookedUp + ':' + epoch);
    const results = q.data ?? [];
    const validate = async (result: OcrResult) => {
        await digitization!.command(`/ocr-results/${result.id}/validate`, {}, crypto.randomUUID(), 'POST');
        q.refresh();
    };
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await digitization!.command('/ocr-results', { ...extra.payload(), fichierId: lookedUp, typeReconnaissance: typeReconnaissance.trim(), texte }, crypto.randomUUID(), 'POST');
            setCreating(false);
            setTexte('');
            extra.reset();
            setTypeReconnaissance('');
            q.refresh();
        }
        catch (e) {
            setError(e);
        }
        finally {
            setBusy(false);
        }
    };
    return <div>
        <h4>Résultats OCR</h4>
        {layoutItem && <OcrLayoutDialog resultId={layoutItem.id} pageNumber={layoutItem.numeroPage} layoutPages={layoutItem.layoutPages} onClose={() => setLayoutItem(null)} />}
        <div className="form-grid">
            <Field label="Identifiant du fichier numérisé" wide hint="Renseignez l’identifiant pour consulter ou ajouter des résultats OCR de ce fichier.">
                <div className="input-icon"><input value={fichierId} onChange={e => setFichierId(e.target.value)} placeholder="Identifiant du fichier"/><button type="button" className="btn small secondary" onClick={() => setLookedUp(fichierId.trim() ? uuid(fichierId.trim()) : '')}>Consulter</button></div>
            </Field>
        </div>
        {lookedUp && <>
            {canManage && <button className="btn small secondary" onClick={() => setCreating(true)}>Ajouter un résultat OCR</button>}
            {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh}/> : results.length ? <div className="table-scroll"><table><thead><tr><th>Type</th><th>Langue</th><th>Statut</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{results.map(r => <tr key={r.id}><td>{r.typeReconnaissance}<ResourceDetailsButton resource="ocrResult" id={r.id} /></td><td>{r.langue ?? '—'}</td><td><Badge value={r.statutValidation}/></td><td>{r.hasLayout && <button className="btn small secondary" onClick={() => setLayoutItem(r)}>Positions</button>}{canManage && r.statutValidation === 'NON_VALIDE' && <button className="btn small secondary" onClick={() => validate(r)}>Valider</button>}</td></tr>)}</tbody></table></div> : <Empty title="Aucun résultat OCR pour ce fichier"/>}
        </>}
        {creating && <Modal title="Ajouter un résultat OCR" onClose={() => setCreating(false)} locked={busy}>
            <form onSubmit={submit}>
                <div className="form-grid">
                
                    <Field label="Type de reconnaissance" hint="Ex. TESSERACT"><input value={typeReconnaissance} onChange={e => setTypeReconnaissance(e.target.value)} required maxLength={20} disabled={busy}/></Field>
                    <Field label="Texte reconnu" wide><textarea value={texte} onChange={e => setTexte(e.target.value)} required rows={6} disabled={busy}/></Field>
                <details className="span2"><summary>Informations complémentaires</summary><div className="form-grid"><OptionalFields form={extra} disabled={busy}/></div></details>
            </div>
                {error ? <ErrorNotice error={error}/> : null}
                <footer className="modal-footer"><button type="button" className="btn secondary" onClick={() => setCreating(false)} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>Ajouter</button></footer>
            </form>
        </Modal>}
    </div>;
}

function ElementDetailDialog({ element, canManage, onClose, onChanged }: {
    element: DigitizationElement;
    canManage: boolean;
    onClose: () => void;
    onChanged: () => void;
}) {
    const { me, digitization, epoch } = useSession();
    const [linkingFile, setLinkingFile] = useState(false);
    const [filesRevision, setFilesRevision] = useState(0);
    const filesChanged = () => { setFilesRevision(value => value + 1); onChanged(); };
    const [creatingQc, setCreatingQc] = useState(false);
    const [creatingContribution, setCreatingContribution] = useState(false);
    const qcQ = useResource<QualityControl[]>(s => digitization!.qualityControlsByElement(element.id, s), 'quality-controls:' + element.id + ':' + epoch);
    const contributionsQ = useResource<Contribution[]>(s => digitization!.contributionsByElement(element.id, s), 'contributions:' + element.id + ':' + epoch);
    const moderate = async (contribution: Contribution, approve: boolean) => {
        await digitization!.command(`/contributions/${contribution.id}/${approve ? 'approve' : 'reject'}`, {}, crypto.randomUUID(), 'POST');
        contributionsQ.refresh();
    };
    const lotsQ = useResource<ScanLot[]>(s => digitization!.lotsByProject(element.projetNumerisationId, s), 'element-detail-lots:' + element.projetNumerisationId + ':' + epoch);
    return <Modal title="Élément de numérisation" subtitle={element.descriptionSource ?? undefined} onClose={onClose} wide>
        <div className="form-grid">
            <ElementWorkflowPanel key={filesRevision} element={element} onChanged={onChanged}/>
            {canManage && isWorkingStage(element.statut) && <div className="table-actions"><button className="btn small secondary" onClick={() => setLinkingFile(true)}>Rattacher un fichier</button></div>}
            <PagesSection element={element} lots={lotsQ.data ?? []} canManage={canManage || canWith(me, 'DIGITIZATION_SCAN') || canWith(me, 'DIGITIZATION_QC')} onChanged={filesChanged}/>
            <div>
                <div className="section-heading"><h4>Contrôles qualité</h4>{canWith(me, 'DIGITIZATION_QC') && element.statut === 'CONTROLE_QUALITE' && <button className="btn small secondary" onClick={() => setCreatingQc(true)}>Ajouter un contrôle</button>}</div>
                {qcQ.loading ? <Busy /> : qcQ.error ? <ErrorNotice error={qcQ.error} onRetry={qcQ.refresh}/> : qcQ.data?.length ? <div className="table-scroll"><table><thead><tr><th>Date</th><th>DPI</th><th>Conforme</th><th>Décision</th></tr></thead><tbody>{qcQ.data.map(c => <tr key={c.id}><td>{formatDate(c.dateControle)}<ResourceDetailsButton resource="qualityControl" id={c.id} /></td><td>{c.dpi ?? '—'}</td><td>{c.conforme ? 'Oui' : 'Non'}</td><td>{display(c.decision)}</td></tr>)}</tbody></table></div> : <Empty title="Aucun contrôle qualité"/>}
            </div>
            <OcrJobsPanel key={filesRevision} element={element}/>
            <FileAssetsPanel key={filesRevision} element={element}/>
            <AccessPdfPanel key={filesRevision} element={element}/>
            <OcrSection elementId={element.id} canManage={canWith(me, 'DIGITIZATION_OCR')}/>
            <div>
                <div className="section-heading"><h4>Contributions</h4>{canManage && <button className="btn small secondary" onClick={() => setCreatingContribution(true)}>Ajouter une contribution</button>}</div>
                {contributionsQ.loading ? <Busy /> : contributionsQ.error ? <ErrorNotice error={contributionsQ.error} onRetry={contributionsQ.refresh}/> : contributionsQ.data?.length ? <div className="table-scroll"><table><thead><tr><th>Type</th><th>Statut</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{contributionsQ.data.map(c => <tr key={c.id}><td>{c.typeContribution}<ResourceDetailsButton resource="contribution" id={c.id} /></td><td><Badge value={c.statut}/></td><td>{canManage && c.statut === 'SOUMISE' && <div className="table-actions"><button className="btn small secondary" onClick={() => moderate(c, true)}>Approuver</button><button className="btn small danger-outline" onClick={() => moderate(c, false)}>Rejeter</button></div>}</td></tr>)}</tbody></table></div> : <Empty title="Aucune contribution"/>}
            </div>
        </div>
        <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose}>Fermer</button></footer>
        {linkingFile && <LinkFileDialog elementId={element.id} onClose={() => setLinkingFile(false)} onLinked={filesChanged}/>}
        {creatingQc && <CreateQualityControlDialog elementId={element.id} onClose={() => setCreatingQc(false)} onCreated={qcQ.refresh}/>}
        {creatingContribution && <CreateContributionDialog elementId={element.id} onClose={() => setCreatingContribution(false)} onCreated={contributionsQ.refresh}/>}
    </Modal>;
}

export function DigitizationPage({ initialProjectId, initialElementId }: {
    initialProjectId?: string;
    initialElementId?: string;
} = {}) {
    const { me, digitization, epoch } = useSession();
    const canManage = can(me, 'DIGITIZATION_MANAGE', {});
    const [creatingProject, setCreatingProject] = useState(false);
    const [originOf, setOriginOf] = useState<DigitizationProject | null>(null);
    const [creatingElement, setCreatingElement] = useState(false);
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(initialProjectId ?? null);
    const [selectedElementId, setSelectedElementId] = useState<string | null>(initialElementId ?? null);
    const [focusLotId, setFocusLotId] = useState<string | null>(null);
    const [batching, setBatching] = useState(false);
    const projectsQ = useResource<DigitizationProject[]>(s => digitization!.projects(s), 'digitization-projects:' + epoch);
    const projects = projectsQ.data ?? [];
    const elementsQ = useResource<DigitizationElement[]>(s => selectedProjectId ? digitization!.elementsByProject(selectedProjectId, s) : Promise.resolve([]), 'digitization-elements:' + selectedProjectId + ':' + epoch);
    const elements = elementsQ.data ?? [];
    const lotsForLookup = useResource<ScanLot[]>(s => selectedProjectId ? digitization!.lotsByProject(selectedProjectId, s) : Promise.resolve([]), 'lookup-lots:' + selectedProjectId + ':' + epoch);
    const selectedElement = elements.find(el => el.id === selectedElementId) ?? null;
    const selectedProject = projects.find(p => p.id === selectedProjectId) ?? null;
    const openElement = (projectId: string, elementId: string) => { setSelectedProjectId(projectId); setSelectedElementId(elementId); };
    const openLot = (projectId: string, lotId: string) => { setSelectedProjectId(projectId); setSelectedElementId(null); setFocusLotId(lotId); };
    const terminate = async (project: DigitizationProject, action: 'complete' | 'cancel') => {
        await digitization!.command(`/projects/${project.id}/${action}`, {}, crypto.randomUUID(), 'POST');
        projectsQ.refresh();
    };
    return <><PageHead eyebrow="MODULE · NUMÉRISATION" title="Numérisation et OCR" description="Suivre les projets de numérisation, leurs éléments, les contrôles qualité, la reconnaissance de texte et les contributions.">
        {canManage && <button className="btn primary" onClick={() => setCreatingProject(true)}>Créer un projet</button>}
    </PageHead>
        <div className="panel panel-padding"><CodeLookup projectId={selectedProjectId} elements={elements} lots={lotsForLookup.data ?? []} onElement={openElement} onLot={openLot}/></div>
        <div className="panel">
            <div className="section-heading"><h3>Projets</h3></div>
            {projectsQ.loading ? <Busy /> : projectsQ.error ? <ErrorNotice error={projectsQ.error} onRetry={projectsQ.refresh}/> : projects.length ? <div className="table-scroll"><table><thead><tr><th>Nom</th><th>Code</th><th>Origine</th><th>Statut</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{projects.map(p => <tr key={p.id}><td><button className="record-name" onClick={() => setSelectedProjectId(p.id)}><strong>{p.nom}</strong></button><ResourceDetailsButton resource="digitizationProject" id={p.id} title={p.nom} /></td><td>{p.code ?? '—'}</td><td><OriginText institutionId={p.institutionId} departmentId={p.departmentId}/></td><td><Badge value={p.statut}/></td><td>{canManage && p.statut === 'EN_COURS' && <div className="table-actions"><button className="btn small secondary" onClick={() => setOriginOf(p)} aria-label={`Rattacher le projet ${p.nom} à son institution`}>Origine</button><button className="btn small secondary" onClick={() => terminate(p, 'complete')}>Terminer</button><button className="btn small danger-outline" onClick={() => terminate(p, 'cancel')}>Annuler</button></div>}</td></tr>)}</tbody></table></div> : <Empty title="Aucun projet de numérisation" description="Créez le premier projet."/>}
        </div>
        {selectedProjectId && <div className="panel">
            <div className="section-heading"><h3>Éléments</h3><div className="table-actions"><SheetsButton label="Feuilles séparatrices" title="Feuilles séparatrices" build={async () => elements.filter(el => isCaptureStage(el.statut)).map(el => elementSheet(el, selectedProject ? [selectedProject.nom] : []))}/>{canManage && <button className="btn small secondary" onClick={() => setBatching(true)}>Importer un lot de fichiers</button>}{canManage && <button className="btn small primary" onClick={() => setCreatingElement(true)}>Créer un élément</button>}</div></div>
            {elementsQ.loading ? <Busy /> : elementsQ.error ? <ErrorNotice error={elementsQ.error} onRetry={elementsQ.refresh}/> : elements.length ? <div className="table-scroll"><table><thead><tr><th>Description</th><th>Pages</th><th>Statut</th></tr></thead><tbody>{elements.map(el => <tr key={el.id}><td><button className="record-name" onClick={() => setSelectedElementId(el.id)}><strong>{elementName(el.descriptionSource, el.ordre)}</strong></button></td><td>{el.pagesAttendues ? el.pagesAttendues + (el.rectoVerso ? ' (recto-verso)' : '') : '—'}</td><td><Badge value={el.statut} label={stageName(el.statut)}/></td></tr>)}</tbody></table></div> : <Empty title="Aucun élément" description="Créez le premier élément à numériser pour ce projet."/>}
        </div>}
        {selectedProjectId && <LotsPanel projectId={selectedProjectId} canManage={canManage} focusLotId={focusLotId} projectName={selectedProject?.nom}/>}
        {batching && selectedProjectId && <BatchImportDialog projectId={selectedProjectId} lot={null} onClose={() => setBatching(false)} onDone={elementsQ.refresh}/>}
        {creatingProject && <CreateProjectDialog onClose={() => setCreatingProject(false)} onCreated={projectsQ.refresh}/>}
        {originOf && <OriginDialog title="Origine du projet" subject={originOf.nom} institutionId={originOf.institutionId ?? null} departmentId={originOf.departmentId ?? null}
            onSave={async (institutionId, departmentId) => { await digitization!.command(`/projects/${originOf.id}/origin`, { institutionId, departmentId }, crypto.randomUUID(), 'POST'); projectsQ.refresh(); }} onClose={() => setOriginOf(null)}/>}
        {creatingElement && selectedProjectId && <CreateElementDialog projectId={selectedProjectId} onClose={() => setCreatingElement(false)} onCreated={elementsQ.refresh}/>}
        {selectedElement && <ElementDetailDialog element={selectedElement} canManage={canManage} onClose={() => setSelectedElementId(null)} onChanged={elementsQ.refresh}/>}
        </>;
}

export function QualityControlListPage() {
    const { digitization, epoch } = useSession();
    const q = useResource<QualityControlListItem[]>(s => digitization!.qualityControls(s), 'quality-controls-all:' + epoch);
    const items = q.data ?? [];
    const open = (item: QualityControlListItem) => navigate('/app/numerisation?project=' + encodeURIComponent(item.projetId) + '&element=' + encodeURIComponent(item.elementNumerisationId));
    return <><PageHead eyebrow="MODULE · NUMÉRISATION" title="Contrôle qualité" description="Vue d’ensemble des contrôles qualité consignés sur les éléments de numérisation."/>
        <div className="panel">
            {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh}/> : items.length ? <div className="table-scroll"><table><thead><tr><th>Projet</th><th>Élément</th><th>Conforme</th><th>Décision</th><th>Date</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td>{item.projetCode ? item.projetCode + ' · ' : ''}{item.projetNom}<ResourceDetailsButton resource="qualityControl" id={item.id} /></td><td>{elementName(item.elementDescription)}</td><td>{item.conforme ? <Icon name="check" size={16}/> : <Icon name="alert" size={16}/>}</td><td>{display(item.decision)}</td><td>{formatDate(item.dateControle)}</td><td><button className="btn small secondary" onClick={() => open(item)}>Ouvrir</button></td></tr>)}</tbody></table></div> : <Empty title="Aucun contrôle qualité" description="Aucun contrôle qualité n'a encore été consigné."/>}
        </div>
    </>;
}
