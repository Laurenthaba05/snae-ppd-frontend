import { ResourceDetailsButton } from '../ui/ResourceDetails';
import { CopyId, Notice } from '../ui/components';
import { OptionalFields, useOptionalFields } from '../ui/OptionalFields';
import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { useWorkspace } from '../ui/workspace';
import { can } from '../core/policy';
import { PageHead, Busy, ErrorNotice, Empty, useResource, Modal, Field, Badge, formatDate } from '../ui/components';
import type { LegalSource, LegalStatus, AccessRestriction } from '../core/types';
import { CommunicabilityCatalogPanel, DocumentCommunicabilityPanel } from '../ui/Communicability';
import { RedactionPanel } from '../ui/Redaction';

function CreateSourceDialog({ onClose, onCreated }: {
    onClose: () => void;
    onCreated: () => void;
}) {
    const { rights } = useSession();
    const [typeSource, setTypeSource] = useState('');
    const [reference, setReference] = useState('');
    const [titre, setTitre] = useState('');
    const [autorite, setAutorite] = useState('');
    const extra = useOptionalFields('source');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await rights!.command('/sources', { ...extra.payload(), typeSource: typeSource.trim(), reference: reference.trim(), titre: titre.trim() || null, autorite: autorite.trim() || null }, crypto.randomUUID(), 'POST');
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
    return <Modal title="Créer une source juridique" onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                
                <Field label="Type" hint="Ex. LOI, DECRET, CIRCULAIRE"><input value={typeSource} onChange={e => setTypeSource(e.target.value)} required maxLength={50} disabled={busy}/></Field>
                <Field label="Référence" wide><input value={reference} onChange={e => setReference(e.target.value)} required maxLength={255} disabled={busy}/></Field>
                <Field label="Titre" wide hint="Optionnel"><input value={titre} onChange={e => setTitre(e.target.value)} disabled={busy}/></Field>
                <Field label="Autorité" hint="Optionnelle"><input value={autorite} onChange={e => setAutorite(e.target.value)} maxLength={255} disabled={busy}/></Field>
            <details className="span2"><summary>Informations complémentaires</summary><div className="form-grid"><OptionalFields form={extra} disabled={busy}/></div></details>
            </div>
            {error ? <ErrorNotice error={error}/> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>Créer</button></footer>
        </form>
    </Modal>;
}

export function RightsPage() {
    const { me, rights, epoch } = useSession();
    const { scope: workspaceScope } = useWorkspace();
    const canManage = can(me, 'RIGHTS_SOURCE_MANAGE', {});
    const [creating, setCreating] = useState(false);
    const sourcesQ = useResource<LegalSource[]>(s => rights!.sources(s), 'rights-sources:' + epoch);
    return <><PageHead eyebrow="MODULE · DROITS" title="Droits et sources juridiques" description="Référentiel national des sources juridiques utilisées pour motiver les statuts et restrictions d’accès.">
        {canManage && <button className="btn primary" onClick={() => setCreating(true)}>Créer une source</button>}
    </PageHead>
        <div className="panel">
            <div className="section-heading"><h3>Sources juridiques</h3></div>
            {sourcesQ.loading ? <Busy /> : sourcesQ.error ? <ErrorNotice error={sourcesQ.error} onRetry={sourcesQ.refresh}/> : sourcesQ.data?.length ? <div className="table-scroll"><table><thead><tr><th>Type</th><th>Référence</th><th>Titre</th><th>Autorité</th></tr></thead><tbody>{sourcesQ.data.map(s => <tr key={s.id}><td>{s.typeSource}</td><td>{s.reference}<ResourceDetailsButton resource="legalSource" id={s.id} title={s.reference} /></td><td>{s.titre ?? '—'}</td><td>{s.autorite ?? '—'}</td></tr>)}</tbody></table></div> : <Empty title="Aucune source juridique" description="Créez la première source du référentiel."/>}
        </div>
        {workspaceScope.institutionId && can(me, 'RIGHTS_READ', workspaceScope) && <CommunicabilityCatalogPanel institutionId={workspaceScope.institutionId}
            canCatalog={can(me, 'RIGHTS_SOURCE_MANAGE', workspaceScope)} canApply={can(me, 'RIGHTS_RESTRICTION_MANAGE', workspaceScope)}/>}
        {creating && <CreateSourceDialog onClose={() => setCreating(false)} onCreated={sourcesQ.refresh}/>}
        </>;
}

function CreateStatusDialog({ documentId, sources, onClose, onCreated }: {
    documentId: string;
    sources: LegalSource[];
    onClose: () => void;
    onCreated: () => void;
}) {
    const { rights } = useSession();
    const [typeStatut, setTypeStatut] = useState('');
    const [titulaire, setTitulaire] = useState('');
    const [sourceJuridiqueId, setSourceJuridiqueId] = useState('');
    const [justification, setJustification] = useState('');
    const [receipt, setReceipt] = useState<{id:string; fichierId:string | null} | null>(null);
    const extra = useOptionalFields('status');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const saved = await rights!.command<{id:string; fichierId:string | null}>('/statuses', { ...extra.payload(), documentId: extra.values.fichierId?.trim() ? null : documentId, typeStatut: typeStatut.trim(), titulaire: titulaire.trim() || null, sourceJuridiqueId: sourceJuridiqueId || null, justification: justification.trim() || null }, crypto.randomUUID(), 'POST');
            onCreated();
            setReceipt(saved);
        }
        catch (e) {
            setError(e);
        }
        finally {
            setBusy(false);
        }
    };
    if (receipt) return <Modal title="Statut juridique enregistré" onClose={onClose}>
        <Notice>Le statut a été enregistré pour {receipt.fichierId ? 'le fichier ' + receipt.fichierId : 'ce document'}. {receipt.fichierId ? 'Les statuts de fichiers ne figurent pas dans la liste des statuts du document ; conservez cet identifiant.' : ''}</Notice>
        <CopyId value={receipt.id}/><footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose}>Fermer</button></footer>
    </Modal>;
    return <Modal title="Ajouter un statut juridique" onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                
                <Field label="Type de statut" hint="Ex. DROIT_AUTEUR, DOMAINE_PUBLIC"><input value={typeStatut} onChange={e => setTypeStatut(e.target.value)} required maxLength={50} disabled={busy}/></Field>
                <Field label="Titulaire" hint="Optionnel"><input value={titulaire} onChange={e => setTitulaire(e.target.value)} maxLength={255} disabled={busy}/></Field>
                <Field label="Source juridique" wide hint="Optionnelle"><select value={sourceJuridiqueId} onChange={e => setSourceJuridiqueId(e.target.value)} disabled={busy}><option value="">Aucune</option>{sources.map(s => <option key={s.id} value={s.id}>{s.reference}</option>)}</select></Field>
                <Field label="Justification" wide><textarea value={justification} onChange={e => setJustification(e.target.value)} disabled={busy}/></Field>
            <details className="span2"><summary>Informations complémentaires</summary><div className="form-grid"><OptionalFields form={extra} disabled={busy}/></div></details>
            </div>
            {error ? <ErrorNotice error={error}/> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>Ajouter</button></footer>
        </form>
    </Modal>;
}

function OpenRestrictionDialog({ documentId, sources, onClose, onCreated }: {
    documentId: string;
    sources: LegalSource[];
    onClose: () => void;
    onCreated: () => void;
}) {
    const { rights } = useSession();
    const [niveau, setNiveau] = useState('RESTREINT');
    const [motif, setMotif] = useState('');
    const [autorite, setAutorite] = useState('');
    const [sourceJuridiqueId, setSourceJuridiqueId] = useState('');
    const extra = useOptionalFields('restriction');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await rights!.command(`/documents/${documentId}/restrictions`, { ...extra.payload(), niveau, motif: motif.trim(), autorite: autorite.trim() || null, sourceJuridiqueId: sourceJuridiqueId || null }, crypto.randomUUID(), 'POST');
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
    return <Modal title="Ouvrir une restriction d’accès" onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                
                <Field label="Niveau"><select value={niveau} onChange={e => setNiveau(e.target.value)} disabled={busy}><option value="RESTREINT">Restreint</option><option value="CONFIDENTIEL">Confidentiel</option><option value="SECRET">Secret</option></select></Field>
                <Field label="Autorité" hint="Optionnelle"><input value={autorite} onChange={e => setAutorite(e.target.value)} maxLength={255} disabled={busy}/></Field>
                <Field label="Source juridique" wide hint="Optionnelle"><select value={sourceJuridiqueId} onChange={e => setSourceJuridiqueId(e.target.value)} disabled={busy}><option value="">Aucune</option>{sources.map(s => <option key={s.id} value={s.id}>{s.reference}</option>)}</select></Field>
                <Field label="Motif" wide><textarea value={motif} onChange={e => setMotif(e.target.value)} required maxLength={4000} disabled={busy}/></Field>
            <details className="span2"><summary>Informations complémentaires</summary><div className="form-grid"><OptionalFields form={extra} disabled={busy}/></div></details>
            </div>
            {error ? <ErrorNotice error={error}/> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>Ouvrir</button></footer>
        </form>
    </Modal>;
}

function ReleaseRestrictionDialog({ restriction, onClose, onReleased }: {
    restriction: AccessRestriction;
    onClose: () => void;
    onReleased: () => void;
}) {
    const { rights } = useSession();
    const [releaseReference, setReleaseReference] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await rights!.command(`/restrictions/${restriction.id}/release`, { releaseReference: releaseReference.trim() }, crypto.randomUUID(), 'POST');
            onReleased();
            onClose();
        }
        catch (e) {
            setError(e);
        }
        finally {
            setBusy(false);
        }
    };
    return <Modal title="Lever la restriction" onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                <Field label="Référence de levée" wide><input value={releaseReference} onChange={e => setReleaseReference(e.target.value)} required maxLength={255} disabled={busy}/></Field>
            </div>
            {error ? <ErrorNotice error={error}/> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy}>Lever</button></footer>
        </form>
    </Modal>;
}

export function RightsPanel({ documentId, institutionId, destroyed = false }: {
    documentId: string;
    institutionId?: string;
    destroyed?: boolean;
}) {
    const { me, rights, epoch } = useSession();
    const { scope } = useWorkspace();
    const canManageStatus = can(me, 'RIGHTS_STATUS_MANAGE', scope);
    const canManageRestriction = can(me, 'RIGHTS_RESTRICTION_MANAGE', scope);
    const [addingStatus, setAddingStatus] = useState(false);
    const [openingRestriction, setOpeningRestriction] = useState(false);
    const [releasing, setReleasing] = useState<AccessRestriction | null>(null);
    const statusesQ = useResource<LegalStatus[]>(s => rights!.documentStatuses(documentId, s), 'legal-statuses:' + documentId + epoch);
    const restrictionsQ = useResource<AccessRestriction[]>(s => rights!.documentRestrictions(documentId, s), 'access-restrictions:' + documentId + epoch);
    const sourcesQ = useResource<LegalSource[]>(s => rights!.sources(s), 'rights-sources:' + epoch);
    const sources = sourcesQ.data ?? [];
    return <section className="panel">
        <div className="section-heading"><h3>Droits</h3></div>
        <div className="section-heading"><h4>Statuts juridiques</h4>{canManageStatus && <button className="btn small secondary" onClick={() => setAddingStatus(true)}>Ajouter un statut</button>}</div>
        {statusesQ.loading ? <Busy /> : statusesQ.error ? <ErrorNotice error={statusesQ.error} onRetry={statusesQ.refresh}/> : statusesQ.data?.length ? <div className="table-scroll"><table><thead><tr><th>Type</th><th>Titulaire</th><th>Justification</th></tr></thead><tbody>{statusesQ.data.map(s => <tr key={s.id}><td>{s.typeStatut}<ResourceDetailsButton resource="legalStatus" id={s.id} /></td><td>{s.titulaire ?? '—'}</td><td>{s.justification ?? '—'}</td></tr>)}</tbody></table></div> : <Empty title="Aucun statut juridique"/>}
        <div className="section-heading"><h4>Restrictions d’accès</h4>{canManageRestriction && <button className="btn small secondary" onClick={() => setOpeningRestriction(true)}>Ouvrir une restriction</button>}</div>
        {restrictionsQ.loading ? <Busy /> : restrictionsQ.error ? <ErrorNotice error={restrictionsQ.error} onRetry={restrictionsQ.refresh}/> : restrictionsQ.data?.length ? <div className="table-scroll"><table><thead><tr><th>Niveau</th><th>Statut</th><th>Motif</th><th>Ouverte le</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{restrictionsQ.data.map(r => <tr key={r.id}><td>{r.niveau}<ResourceDetailsButton resource="restriction" id={r.id} /></td><td><Badge value={r.statut}/></td><td>{r.motif}</td><td>{formatDate(r.dateDebut)}</td><td>{r.statut === 'ACTIF' && canManageRestriction && <button className="btn small danger-outline" onClick={() => setReleasing(r)}>Lever</button>}</td></tr>)}</tbody></table></div> : <Empty title="Aucune restriction d’accès"/>}
        {addingStatus && <CreateStatusDialog documentId={documentId} sources={sources} onClose={() => setAddingStatus(false)} onCreated={statusesQ.refresh}/>}
        {openingRestriction && <OpenRestrictionDialog documentId={documentId} sources={sources} onClose={() => setOpeningRestriction(false)} onCreated={restrictionsQ.refresh}/>}
        {institutionId && <>
            <DocumentCommunicabilityPanel documentId={documentId} institutionId={institutionId} canManage={canManageRestriction} destroyed={destroyed}/>
            <RedactionPanel documentId={documentId} canManage={canManageRestriction} destroyed={destroyed}/>
        </>}
        {releasing && <ReleaseRestrictionDialog restriction={releasing} onClose={() => setReleasing(null)} onReleased={restrictionsQ.refresh}/>}
    </section>;
}
