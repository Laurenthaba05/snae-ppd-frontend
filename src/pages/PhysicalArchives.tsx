import { ResourceDetailsButton } from '../ui/ResourceDetails';
import { OptionalFields, useOptionalFields } from '../ui/OptionalFields';
import { PhysicalEliminationSection } from '../ui/PhysicalElimination';
import { PhysicalRiskSection } from '../ui/PhysicalRisk';
import React, { useEffect, useMemo, useState } from 'react';
import { useSession } from '../auth/session';
import { can } from '../core/policy';
import { navigate } from '../ui/navigation';
import { PageHead, Busy, ErrorNotice, Empty, useResource, Modal, Field, Badge, formatDate } from '../ui/components';
import { uuid } from '../core/validation';
import type { Localisation, StorageUnit, PhysicalArchive, ArchiveMovement, RestorationIntervention, RestorationListItem } from '../core/types';
import { DocumentName } from '../ui/names';
import { display } from '../core/format';
import { OriginDialog, OriginFields, OriginText, originPayload } from '../ui/Origin';

function CreateLocationDialog({ locations, onClose, onCreated }: {
    locations: Localisation[];
    onClose: () => void;
    onCreated: () => void;
}) {
    const { physicalArchives } = useSession();
    const [libelle, setLibelle] = useState('');
    const [typeLocalisation, setTypeLocalisation] = useState('');
    const [code, setCode] = useState('');
    const [adresse, setAdresse] = useState('');
    const [description, setDescription] = useState('');
    const [parentId, setParentId] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await physicalArchives!.command('/locations', { parentId: parentId || null, typeLocalisation: typeLocalisation.trim(), code: code.trim() || null, libelle: libelle.trim(), adresse: adresse.trim() || null, description: description.trim() || null }, crypto.randomUUID(), 'POST');
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
    return <Modal title="Créer un emplacement" onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Libellé" wide><input value={libelle} onChange={e => setLibelle(e.target.value)} required maxLength={255} disabled={busy}/></Field>
                <Field label="Type" hint="Ex. BATIMENT, MAGASIN, RAYONNAGE"><input value={typeLocalisation} onChange={e => setTypeLocalisation(e.target.value)} required maxLength={40} disabled={busy}/></Field>
                <Field label="Code" hint="Optionnel"><input value={code} onChange={e => setCode(e.target.value)} maxLength={100} disabled={busy}/></Field>
                <Field label="Emplacement parent" wide><select value={parentId} onChange={e => setParentId(e.target.value)} disabled={busy}><option value="">Aucun (racine)</option>{locations.map(l => <option key={l.id} value={l.id}>{l.code ? l.code + ' · ' : ''}{l.libelle}</option>)}</select></Field>
                <Field label="Adresse" wide><input value={adresse} onChange={e => setAdresse(e.target.value)} disabled={busy}/></Field>
                <Field label="Description" wide><textarea value={description} onChange={e => setDescription(e.target.value)} disabled={busy}/></Field>
            </div>
            {error ? <ErrorNotice error={error}/> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>Créer</button></footer>
        </form>
    </Modal>;
}

function CreateStorageUnitDialog({ locationId, onClose, onCreated }: {
    locationId: string;
    onClose: () => void;
    onCreated: () => void;
}) {
    const { physicalArchives } = useSession();
    const [typeUnite, setTypeUnite] = useState('');
    const [cote, setCote] = useState('');
    const [capacite, setCapacite] = useState('');
    const extra = useOptionalFields('storage');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await physicalArchives!.command('/storage-units', { ...extra.payload(), localisationId: locationId, typeUnite: typeUnite.trim(), cote: cote.trim(), capacite: capacite.trim() || null }, crypto.randomUUID(), 'POST');
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
    return <Modal title="Créer une unité de stockage" onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                
                <Field label="Cote" wide><input value={cote} onChange={e => setCote(e.target.value)} required maxLength={150} disabled={busy}/></Field>
                <Field label="Type" hint="Ex. BOITE, ETAGERE, ARMOIRE"><input value={typeUnite} onChange={e => setTypeUnite(e.target.value)} required maxLength={40} disabled={busy}/></Field>
                <Field label="Capacité" hint="Optionnelle"><input value={capacite} onChange={e => setCapacite(e.target.value)} disabled={busy}/></Field>
            <details className="span2"><summary>Informations complémentaires</summary><div className="form-grid"><OptionalFields form={extra} disabled={busy}/></div></details>
            </div>
            {error ? <ErrorNotice error={error}/> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>Créer</button></footer>
        </form>
    </Modal>;
}

export function CreateArchiveDialog({ unitId, onClose, onCreated }: {
    unitId: string;
    onClose: () => void;
    onCreated: () => void;
}) {
    const { physicalArchives } = useSession();
    const [cote, setCote] = useState('');
    const [support, setSupport] = useState('');
    const [etatPhysique, setEtatPhysique] = useState('');
    const [description, setDescription] = useState('');
    const [documentId, setDocumentId] = useState('');
    const [institutionId, setInstitutionId] = useState('');
    const [departmentId, setDepartmentId] = useState('');
    const extra = useOptionalFields('archive');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const trimmedDocumentId = documentId.trim();
            await physicalArchives!.command('/archives', { ...extra.payload(), uniteStockageId: unitId, cote: cote.trim(), support: support.trim() || null, etatPhysique: etatPhysique.trim() || null, description: description.trim() || null, ...originPayload(institutionId, departmentId), documentId: trimmedDocumentId ? uuid(trimmedDocumentId) : null }, crypto.randomUUID(), 'POST');
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
    return <Modal title="Créer une archive physique" onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                
                <Field label="Cote" wide><input value={cote} onChange={e => setCote(e.target.value)} required maxLength={150} disabled={busy}/></Field>
                <Field label="Support" hint="Optionnel"><input value={support} onChange={e => setSupport(e.target.value)} maxLength={80} disabled={busy}/></Field>
                <Field label="État physique" hint="Optionnel"><input value={etatPhysique} onChange={e => setEtatPhysique(e.target.value)} maxLength={40} disabled={busy}/></Field>
                <Field label="Document lié" hint="Identifiant du document, optionnel" wide><input value={documentId} onChange={e => setDocumentId(e.target.value)} disabled={busy}/></Field>
                <OriginFields institutionId={institutionId} departmentId={departmentId} onChange={(i, d) => { setInstitutionId(i); setDepartmentId(d); }} disabled={busy} hint="Facultatif : l’institution qui a produit ces archives (celle du document quand il y en a un)."/>
                <Field label="Description" wide><textarea value={description} onChange={e => setDescription(e.target.value)} disabled={busy}/></Field>
            <details className="span2"><summary>Informations complémentaires</summary><div className="form-grid"><OptionalFields form={extra} disabled={busy}/></div></details>
            </div>
            {error ? <ErrorNotice error={error}/> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>Créer</button></footer>
        </form>
    </Modal>;
}

function CheckoutDialog({ archive, units, onClose, onDone }: {
    archive: PhysicalArchive;
    units: StorageUnit[];
    onClose: () => void;
    onDone: () => void;
}) {
    const { physicalArchives } = useSession();
    const [typeMouvement, setTypeMouvement] = useState('');
    const [motif, setMotif] = useState('');
    const [destinationUniteStockageId, setDestination] = useState('');
    const extra = useOptionalFields('checkout');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await physicalArchives!.command(`/archives/${archive.id}/checkout`, { ...extra.payload(), typeMouvement: typeMouvement.trim(), motif: motif.trim(), destinationUniteStockageId: destinationUniteStockageId || null }, crypto.randomUUID(), 'POST');
            onDone();
            onClose();
        }
        catch (e) {
            setError(e);
        }
        finally {
            setBusy(false);
        }
    };
    return <Modal title={'Sortir l’archive ' + archive.cote} onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                
                <Field label="Type de mouvement" hint="Ex. CONSULTATION, TRANSFERT"><input value={typeMouvement} onChange={e => setTypeMouvement(e.target.value)} required maxLength={40} disabled={busy}/></Field>
                <Field label="Unité de destination" hint="Optionnelle, si transfert"><select value={destinationUniteStockageId} onChange={e => setDestination(e.target.value)} disabled={busy}><option value="">Aucune</option>{units.map(u => <option key={u.id} value={u.id}>{u.cote}</option>)}</select></Field>
                <Field label="Motif" wide><textarea value={motif} onChange={e => setMotif(e.target.value)} required disabled={busy}/></Field>
            <details className="span2"><summary>Informations complémentaires</summary><div className="form-grid"><OptionalFields form={extra} disabled={busy}/></div></details>
            </div>
            {error ? <ErrorNotice error={error}/> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>Sortir l’archive</button></footer>
        </form>
    </Modal>;
}

function AttachDocumentDialog({ archiveId, onClose, onAttached }: {
    archiveId: string;
    onClose: () => void;
    onAttached: () => void;
}) {
    const { physicalArchives } = useSession();
    const [documentId, setDocumentId] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await physicalArchives!.command(`/archives/${archiveId}/document/${uuid(documentId.trim())}`, {}, crypto.randomUUID(), 'POST');
            onAttached();
            onClose();
        }
        catch (e) {
            setError(e);
        }
        finally {
            setBusy(false);
        }
    };
    return <Modal title="Rattacher un document" onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Identifiant du document" wide><input value={documentId} onChange={e => setDocumentId(e.target.value)} required disabled={busy}/></Field>
            </div>
            {error ? <ErrorNotice error={error}/> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>Rattacher</button></footer>
        </form>
    </Modal>;
}

function CreateRestorationDialog({ archiveId, onClose, onCreated }: {
    archiveId: string;
    onClose: () => void;
    onCreated: () => void;
}) {
    const { physicalArchives } = useSession();
    const [intitule, setIntitule] = useState('');
    const [constat, setConstat] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true); setError(null);
        try {
            await physicalArchives!.command(`/archives/${archiveId}/restorations`, { intitule, constat }, crypto.randomUUID(), 'POST');
            onCreated(); onClose();
        } catch (err) { setError(err); } finally { setBusy(false); }
    };
    return <Modal title="Déclarer une intervention de restauration" onClose={onClose} locked={busy}>
        <form onSubmit={submit}><div className="form-grid">
            <Field label="Intervention *" wide><input value={intitule} onChange={e => setIntitule(e.target.value)} required maxLength={500}/></Field>
            <Field label="Constat et intervention envisagée *" wide><textarea value={constat} onChange={e => setConstat(e.target.value)} required maxLength={4000}/></Field>
        </div>{Boolean(error) && <ErrorNotice error={error}/>}
        <footer className="modal-footer"><button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>{busy ? <span className="spinner"/> : null} Déclarer</button></footer></form>
    </Modal>;
}
function CompleteRestorationDialog({ restorationId, onClose, onDone }: {
    restorationId: string;
    onClose: () => void;
    onDone: () => void;
}) {
    const { physicalArchives } = useSession();
    const [compteRendu, setCompteRendu] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true); setError(null);
        try {
            await physicalArchives!.command(`/restorations/${restorationId}/advance`, { compteRendu }, crypto.randomUUID(), 'POST');
            onDone(); onClose();
        } catch (err) { setError(err); } finally { setBusy(false); }
    };
    return <Modal title="Clore l’intervention" onClose={onClose} locked={busy}>
        <form onSubmit={submit}><div className="form-grid">
            <Field label="Compte rendu *" wide hint="Requis pour clore l’intervention."><textarea value={compteRendu} onChange={e => setCompteRendu(e.target.value)} required maxLength={4000}/></Field>
        </div>{Boolean(error) && <ErrorNotice error={error}/>}
        <footer className="modal-footer"><button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>{busy ? <span className="spinner"/> : null} Clore</button></footer></form>
    </Modal>;
}
function ArchiveDetailDialog({ archive, units, canManage, onClose, onChanged }: {
    archive: PhysicalArchive;
    units: StorageUnit[];
    canManage: boolean;
    onClose: () => void;
    onChanged: () => void;
}) {
    const { me, physicalArchives, epoch } = useSession();
    const [checkingOut, setCheckingOut] = useState(false);
    const [attachingDocument, setAttachingDocument] = useState(false);
    const [creatingRestoration, setCreatingRestoration] = useState(false);
    const [editingOrigin, setEditingOrigin] = useState(false);
    const [completingRestoration, setCompletingRestoration] = useState<string | null>(null);
    const [pending, setPending] = useState<string | null>(null);
    const canReadRestoration = can(me, 'RESTORATION_READ', {});
    const canManageRestoration = can(me, 'RESTORATION_MANAGE', {});
    const q = useResource(s => physicalArchives!.movementsByArchive(archive.id, s), JSON.stringify(['archive-movements', archive.id, epoch]));
    const movements = q.data ?? [];
    const open = movements.find(m => m.statut === 'EN_COURS');
    const restorationsQ = useResource<RestorationIntervention[]>(s => canReadRestoration ? physicalArchives!.restorationsByArchive(archive.id, s) : Promise.resolve([]), JSON.stringify(['archive-restorations', archive.id, epoch]));
    const restorations = restorationsQ.data ?? [];
    const checkin = async (movement: ArchiveMovement) => {
        setPending(movement.id);
        try {
            await physicalArchives!.command(`/movements/${movement.id}/checkin`, {}, crypto.randomUUID(), 'POST');
            q.refresh();
            onChanged();
        }
        finally {
            setPending(null);
        }
    };
    const advanceRestoration = async (restoration: RestorationIntervention) => {
        if (restoration.statut === 'EN_COURS') { setCompletingRestoration(restoration.id); return; }
        setPending(restoration.id);
        try {
            await physicalArchives!.command(`/restorations/${restoration.id}/advance`, {}, crypto.randomUUID(), 'POST');
            restorationsQ.refresh();
        }
        finally {
            setPending(null);
        }
    };
    return <Modal title={'Archive ' + archive.cote} subtitle={archive.support ?? undefined} onClose={onClose} wide>
        <div className="form-grid">
            <dl className="detail-card">
                <div><dt>État physique</dt><dd>{display(archive.etatPhysique)}</dd></div>
                <div><dt>Document lié</dt><dd>{archive.documentId ? <DocumentName id={archive.documentId}/> : <span className="table-actions"><span>—</span>{canManage && <button className="btn small secondary" onClick={() => setAttachingDocument(true)}>Rattacher un document</button>}</span>}</dd></div>
                <div><dt>Origine</dt><dd><span className="table-actions"><OriginText institutionId={archive.institutionId} departmentId={archive.departmentId}/>{canManage && !archive.documentId && <button className="btn small secondary" onClick={() => setEditingOrigin(true)}>Modifier</button>}</span></dd></div>
                <div><dt>Dates extrêmes</dt><dd>{archive.dateExtremeDebut ?? '—'} → {archive.dateExtremeFin ?? '—'}</dd></div>
                <div><dt>Quantité</dt><dd>{archive.quantite ? archive.quantite + (archive.uniteQuantite ? ' ' + archive.uniteQuantite : '') : '—'}</dd></div>
                <div><dt>Description</dt><dd>{archive.description ?? '—'}</dd></div>
            </dl>
            <div>
                <div className="section-heading"><h3>Mouvements</h3>{canManage && !open && <button className="btn small primary" onClick={() => setCheckingOut(true)}>Sortir l’archive</button>}</div>
                {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh}/> : movements.length ? <div className="table-scroll"><table><thead><tr><th>Type</th><th>Motif</th><th>Statut</th><th>Sortie</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{movements.map(m => <tr key={m.id}><td>{display(m.typeMouvement)}<ResourceDetailsButton resource="physicalMovement" id={m.id} /></td><td>{m.motif}</td><td><Badge value={m.statut}/></td><td>{formatDate(m.dateSortie)}</td><td>{canManage && m.statut === 'EN_COURS' && <button className="btn small secondary" disabled={pending === m.id} onClick={() => checkin(m)}>Réintégrer</button>}</td></tr>)}</tbody></table></div> : <Empty title="Aucun mouvement" description="Cette archive n’a jamais quitté son unité de stockage."/>}
            </div>
            {canReadRestoration && <div>
                <div className="section-heading"><h3>Restauration</h3>{canManageRestoration && <button className="btn small primary" onClick={() => setCreatingRestoration(true)}>Déclarer une intervention</button>}</div>
                {restorationsQ.loading ? <Busy /> : restorationsQ.error ? <ErrorNotice error={restorationsQ.error} onRetry={restorationsQ.refresh}/> : restorations.length ? <div className="table-scroll"><table><thead><tr><th>Intervention</th><th>Statut</th><th>Diagnostic</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{restorations.map(r => <tr key={r.id}><td>{r.intitule}<ResourceDetailsButton resource="restoration" id={r.id} title={r.intitule} /></td><td><Badge value={r.statut}/></td><td>{formatDate(r.dateDiagnostic)}</td><td>{canManageRestoration && r.statut !== 'TERMINEE' && <button className="btn small secondary" disabled={pending === r.id} onClick={() => advanceRestoration(r)}>{r.statut === 'EN_COURS' ? 'Clore' : 'Étape suivante'}</button>}</td></tr>)}</tbody></table></div> : <Empty title="Aucune intervention" description="Aucune intervention de restauration déclarée pour cette archive."/>}
            </div>}
        </div>
        <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose}>Fermer</button></footer>
        {checkingOut && <CheckoutDialog archive={archive} units={units} onClose={() => setCheckingOut(false)} onDone={() => { q.refresh(); onChanged(); }}/>}
        {attachingDocument && <AttachDocumentDialog archiveId={archive.id} onClose={() => setAttachingDocument(false)} onAttached={onChanged}/>}
        {editingOrigin && <OriginDialog title="Origine de l’archive" subject={archive.cote} institutionId={archive.institutionId ?? null} departmentId={archive.departmentId ?? null}
            onSave={async (institutionId, departmentId) => { await physicalArchives!.command(`/archives/${archive.id}/origin`, { institutionId, departmentId }, crypto.randomUUID(), 'POST'); onChanged(); }} onClose={() => setEditingOrigin(false)}/>}
        {creatingRestoration && <CreateRestorationDialog archiveId={archive.id} onClose={() => setCreatingRestoration(false)} onCreated={restorationsQ.refresh}/>}
        {completingRestoration && <CompleteRestorationDialog restorationId={completingRestoration} onClose={() => setCompletingRestoration(null)} onDone={restorationsQ.refresh}/>}
    </Modal>;
}

function LocationRow({ location, depth, children, canManage, onToggle, pending, onSelect }: {
    location: Localisation;
    depth: number;
    children: React.ReactNode;
    canManage: boolean;
    onToggle: (location: Localisation) => void;
    pending: boolean;
    onSelect: (location: Localisation) => void;
}) {
    return <><tr>
        <td style={{ paddingLeft: 12 + depth * 20 }}><button className="record-name" onClick={() => onSelect(location)}><strong>{location.libelle}</strong></button><ResourceDetailsButton resource="physicalLocation" id={location.id} title={location.libelle} /></td>
        <td>{location.typeLocalisation}</td>
        <td>{location.code ?? '—'}</td>
        <td><Badge value={location.statut}/></td>
        <td>{canManage && <button className="btn small secondary" disabled={pending} onClick={() => onToggle(location)}>{location.statut === 'ACTIVE' ? 'Désactiver' : 'Activer'}</button>}</td>
    </tr>{children}</>;
}

export function PhysicalArchivesPage({ initialArchiveId }: {
    initialArchiveId?: string;
} = {}) {
    const { me, physicalArchives, epoch } = useSession();
    const [creatingLocation, setCreatingLocation] = useState(false);
    const [creatingUnit, setCreatingUnit] = useState(false);
    const [creatingArchive, setCreatingArchive] = useState(false);
    const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
    const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
    const [selectedArchiveId, setSelectedArchiveId] = useState<string | null>(initialArchiveId ?? null);
    useEffect(() => {
        if (!initialArchiveId) return;
        let alive = true;
        physicalArchives!.archive(initialArchiveId).then(archive => { if (alive) setSelectedUnitId(archive.uniteStockageId); }).catch(() => {});
        return () => { alive = false; };
    }, [initialArchiveId]);
    const canManage = can(me, 'PHYSICALARCHIVES_LOCATION_MANAGE', {});
    const canManageArchives = can(me, 'PHYSICALARCHIVES_MANAGE', {});
    const [pendingLocation, setPendingLocation] = useState<string | null>(null);
    const [pendingUnit, setPendingUnit] = useState<string | null>(null);
    const [actionError, setActionError] = useState<unknown>(null);

    const locationsQ = useResource(s => physicalArchives!.locations(s), 'physical-locations:' + epoch);
    const locations = useMemo(() => (locationsQ.data ?? []).slice().sort((a, b) => a.libelle.localeCompare(b.libelle)), [locationsQ.data]);
    const byParent = useMemo(() => {
        const map = new Map<string, Localisation[]>();
        for (const l of locations) {
            const key = l.parentId ?? '';
            const list = map.get(key) ?? [];
            list.push(l);
            map.set(key, list);
        }
        return map;
    }, [locations]);

    const unitsQ = useResource(s => selectedLocationId ? physicalArchives!.storageUnitsByLocation(selectedLocationId, s) : Promise.resolve([]), 'physical-units:' + selectedLocationId + ':' + epoch);
    const units = unitsQ.data ?? [];
    const allUnitsQ = useResource(s => physicalArchives!.storageUnits(s), 'physical-units-all:' + epoch);
    const allUnits = allUnitsQ.data ?? [];

    const archivesQ = useResource(s => selectedUnitId ? physicalArchives!.archivesByStorageUnit(selectedUnitId, s) : Promise.resolve([]), 'physical-archives-list:' + selectedUnitId + ':' + epoch);
    const archives = archivesQ.data ?? [];
    const selectedArchive = archives.find(a => a.id === selectedArchiveId) ?? null;

    const toggleLocation = async (location: Localisation) => {
        setPendingLocation(location.id);
        setActionError(null);
        try {
            await physicalArchives!.command(`/locations/${location.id}/${location.statut === 'ACTIVE' ? 'deactivate' : 'activate'}`, {}, crypto.randomUUID(), 'POST');
            locationsQ.refresh();
        }
        catch (e) {
            setActionError(e);
        }
        finally {
            setPendingLocation(null);
        }
    };
    const toggleUnit = async (unit: StorageUnit) => {
        setPendingUnit(unit.id);
        setActionError(null);
        try {
            await physicalArchives!.command(`/storage-units/${unit.id}/${unit.statut === 'ACTIVE' ? 'deactivate' : 'activate'}`, {}, crypto.randomUUID(), 'POST');
            unitsQ.refresh();
            allUnitsQ.refresh();
        }
        catch (e) {
            setActionError(e);
        }
        finally {
            setPendingUnit(null);
        }
    };
    const selectLocation = (location: Localisation) => { setSelectedLocationId(location.id); setSelectedUnitId(null); };
    const renderChildren = (parentId: string, depth: number): React.ReactNode => {
        const list = byParent.get(parentId) ?? [];
        return list.map(l => <LocationRow key={l.id} location={l} depth={depth} canManage={canManage} onToggle={toggleLocation} pending={pendingLocation === l.id} onSelect={selectLocation}>{renderChildren(l.id, depth + 1)}</LocationRow>);
    };

    return <><PageHead eyebrow="MODULE · ARCHIVES PHYSIQUES" title="Archives physiques" description="Gérer les emplacements, unités de stockage, cotes physiques et mouvements de sortie/retour.">
        {canManage && <button className="btn primary" onClick={() => setCreatingLocation(true)}>Créer un emplacement</button>}
    </PageHead>
        {Boolean(actionError) && <ErrorNotice error={actionError}/>}
        <div className="panel">
            <div className="section-heading"><h3>Emplacements</h3></div>
            {locationsQ.loading ? <Busy /> : locationsQ.error ? <div className="panel-padding"><ErrorNotice error={locationsQ.error} onRetry={locationsQ.refresh}/></div> : locations.length ? <div className="table-scroll"><table><thead><tr><th>Libellé</th><th>Type</th><th>Code</th><th>Statut</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{renderChildren('', 0)}</tbody></table></div> : <Empty title="Aucun emplacement" description="Créez le premier emplacement de conservation."/>}
        </div>
        {selectedLocationId && <div className="panel">
            <div className="section-heading"><h3>Unités de stockage</h3>{canManage && <button className="btn small primary" onClick={() => setCreatingUnit(true)}>Créer une unité</button>}</div>
            {unitsQ.loading ? <Busy /> : unitsQ.error ? <ErrorNotice error={unitsQ.error} onRetry={unitsQ.refresh}/> : units.length ? <div className="table-scroll"><table><thead><tr><th>Cote</th><th>Type</th><th>Capacité</th><th>Statut</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{units.map(u => <tr key={u.id}><td><button className="record-name" onClick={() => setSelectedUnitId(u.id)}><strong>{u.cote}</strong></button><ResourceDetailsButton resource="storageUnit" id={u.id} title={u.cote} /></td><td>{display(u.typeUnite)}</td><td>{u.capacite ?? '—'}</td><td><Badge value={u.statut}/></td><td>{canManage && <button className="btn small secondary" disabled={pendingUnit === u.id} onClick={() => toggleUnit(u)}>{u.statut === 'ACTIVE' ? 'Désactiver' : 'Activer'}</button>}</td></tr>)}</tbody></table></div> : <Empty title="Aucune unité de stockage" description="Créez la première unité de stockage pour cet emplacement."/>}
        </div>}
        {selectedUnitId && <div className="panel">
            <div className="section-heading"><h3>Archives physiques</h3>{canManageArchives && <button className="btn small primary" onClick={() => setCreatingArchive(true)}>Créer une archive</button>}</div>
            {archivesQ.loading ? <Busy /> : archivesQ.error ? <ErrorNotice error={archivesQ.error} onRetry={archivesQ.refresh}/> : archives.length ? <div className="table-scroll"><table><thead><tr><th>Cote</th><th>Support</th><th>État</th><th>Document</th><th>Origine</th></tr></thead><tbody>{archives.map(a => <tr key={a.id}><td><button className="record-name" onClick={() => setSelectedArchiveId(a.id)}><strong>{a.cote}</strong></button></td><td>{display(a.support)}</td><td>{display(a.etatPhysique)}</td><td>{a.documentId ? <DocumentName id={a.documentId}/> : '—'}</td><td><OriginText institutionId={a.institutionId} departmentId={a.departmentId}/></td></tr>)}</tbody></table></div> : <Empty title="Aucune archive physique" description="Créez la première archive pour cette unité de stockage."/>}
        </div>}
        <PhysicalEliminationSection />
        <PhysicalRiskSection />
        {creatingLocation && <CreateLocationDialog locations={locations} onClose={() => setCreatingLocation(false)} onCreated={locationsQ.refresh}/>}
        {creatingUnit && selectedLocationId && <CreateStorageUnitDialog locationId={selectedLocationId} onClose={() => setCreatingUnit(false)} onCreated={() => { unitsQ.refresh(); allUnitsQ.refresh(); }}/>}
        {creatingArchive && selectedUnitId && <CreateArchiveDialog unitId={selectedUnitId} onClose={() => setCreatingArchive(false)} onCreated={archivesQ.refresh}/>}
        {selectedArchive && <ArchiveDetailDialog archive={selectedArchive} units={allUnits} canManage={canManageArchives} onClose={() => setSelectedArchiveId(null)} onChanged={archivesQ.refresh}/>}
        </>;
}

export function RestorationListPage() {
    const { physicalArchives, epoch } = useSession();
    const q = useResource<RestorationListItem[]>(s => physicalArchives!.restorations(s), 'restorations-all:' + epoch);
    const items = q.data ?? [];
    return <><PageHead eyebrow="MODULE · PATRIMOINE" title="Restauration" description="Vue d'ensemble des interventions de restauration déclarées sur les archives physiques."/>
        <div className="panel">
            {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh}/> : items.length ? <div className="table-scroll"><table><thead><tr><th>Cote</th><th>Intervention</th><th>Statut</th><th>Diagnostic</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td>{item.archiveCote}</td><td>{item.intitule}<ResourceDetailsButton resource="restoration" id={item.id} title={item.intitule} /></td><td><Badge value={item.statut}/></td><td>{formatDate(item.dateDiagnostic)}</td><td><button className="btn small secondary" onClick={() => navigate('/app/archives-physiques?archive=' + encodeURIComponent(item.archivePhysiqueId))}>Ouvrir</button></td></tr>)}</tbody></table></div> : <Empty title="Aucune intervention" description="Aucune intervention de restauration n'a encore été déclarée."/>}
        </div>
    </>;
}
