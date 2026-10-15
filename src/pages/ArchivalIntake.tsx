import { ResourceDetailsButton } from '../ui/ResourceDetails';
import { OptionalFields, useOptionalFields } from '../ui/OptionalFields';
import React, { useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { can } from '../core/policy';
import { PageHead, Busy, ErrorNotice, Empty, useResource, Modal, Field, Badge, formatDate, Notice } from '../ui/components';
import { ArchiveRecordPicker } from '../ui/ArchiveRecordPicker';
import { ReferencePicker } from '../ui/ReferencePicker';
import { DepositAgreementsPanel, useAuthorities } from '../ui/DepositAgreements';
import { StructuredSection } from '../ui/StructuredIntake';
import { inForce, agreementTitle, type AgreementView } from '../core/depositAgreements';
import { STAGE_LABELS, isFinal } from '../core/structuredIntake';
import { display } from '../core/format';
import { useWorkspace } from '../ui/workspace';
import { uuid } from '../core/validation';
import type { ArchivalIntake, IntakeMode } from '../core/types';

const modes: IntakeMode[] = ['VERSEMENT', 'DON', 'DEPOT', 'ACHAT', 'TRANSFERT', 'COLLECTE', 'RESTITUTION', 'AUTRE'];

function CreateIntakeDialog({ onClose, onCreated }: {
    onClose: () => void;
    onCreated: () => void;
}) {
    const { archivalIntake } = useSession();
    const [numero, setNumero] = useState('');
    const [modeEntree, setModeEntree] = useState<IntakeMode>('VERSEMENT');
    const [dateEntree, setDateEntree] = useState('');
    const [referencePreuve, setReferencePreuve] = useState('');
    const [description, setDescription] = useState('');
    const extra = useOptionalFields('intake');
    const [structured, setStructured] = useState(false);
    const [accordId, setAccordId] = useState('');
    const [institutionArchivesId, setInstitutionArchivesId] = useState('');
    const [producteurId, setProducteurId] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const intent=useRef<{payload:string;key:string}|null>(null);
    const today = new Date().toISOString().slice(0, 10);
    const agreementsQ = useResource<AgreementView[]>(signal => structured ? archivalIntake!.agreements(signal) : Promise.resolve([]), 'intake-create-agreements:' + structured);
    const usable = (agreementsQ.data ?? []).filter(a => inForce(a, today));
    const chosen = usable.find(a => a.id === accordId) ?? null;
    const producers = useAuthorities(structured ? institutionArchivesId : null);
    const chooseAgreement = (id: string) => {
        setAccordId(id);
        const a = usable.find(x => x.id === id);
        if (a) { setInstitutionArchivesId(a.input.institutionArchivesId); setProducteurId(a.input.producteurId); }
    };
    const partiesMissing = structured && (!institutionArchivesId || !producteurId);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if(busy)return;
        setBusy(true);
        setError(null);
        try {
            const payload={...extra.payload(), numero:numero.trim(),modeEntree,dateEntree:new Date(dateEntree).toISOString(),referencePreuve:referencePreuve.trim()||null,description:description.trim()||null,
                ...(structured ? { structured: true, accordId: accordId || null, producteurId, institutionArchivesId } : {})};
            const serialized=JSON.stringify(payload);
            if(intent.current?.payload!==serialized)intent.current={payload:serialized,key:crypto.randomUUID()};
            await archivalIntake!.command('/entries',payload,intent.current.key,'POST');
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
    return <Modal title="Créer une entrée archivistique" onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                
                <Field label="Numéro" wide><input value={numero} onChange={e => setNumero(e.target.value)} required maxLength={150} disabled={busy}/></Field>
                <Field label="Mode d’entrée"><select value={modeEntree} onChange={e => setModeEntree(e.target.value as IntakeMode)} disabled={busy}>{modes.map(m => <option key={m} value={m}>{display(m)}</option>)}</select></Field>
                <Field label="Date d’entrée"><input type="datetime-local" value={dateEntree} onChange={e => setDateEntree(e.target.value)} required disabled={busy}/></Field>
                <Field label="Référence de preuve" hint="Optionnelle" wide><input value={referencePreuve} onChange={e => setReferencePreuve(e.target.value)} maxLength={255} disabled={busy}/></Field>
                <Field label="Description" wide><textarea value={description} onChange={e => setDescription(e.target.value)} disabled={busy}/></Field>
                <label className="field span2 check-field"><span><input type="checkbox" checked={structured} onChange={e => setStructured(e.target.checked)} disabled={busy}/> Versement structuré</span><small>Bordereau ligne à ligne, contrôle par étapes, volumétrie, accusé de réception. À choisir pour un versement d’un service producteur.</small></label>
                {structured && <>
                    <Field label="Accord de versement" hint={agreementsQ.loading ? 'Chargement…' : usable.length ? 'Facultatif. Les accords actifs et en vigueur. Il fixe le producteur et le service d’archives.' : 'Aucun accord en vigueur : le versement se fait sans accord.'} wide>
                        <select value={accordId} onChange={e => chooseAgreement(e.target.value)} disabled={busy}><option value="">Sans accord</option>{usable.map(a => <option key={a.id} value={a.id}>{agreementTitle(a)}</option>)}</select></Field>
                    <div className="field"><span>Service d’archives destinataire</span><ReferencePicker kind="institutions" label="Service d’archives destinataire" value={institutionArchivesId} disabled={busy || !!chosen} onChange={id => { setInstitutionArchivesId(id); setProducteurId(''); }}/></div>
                    <Field label="Producteur" hint={institutionArchivesId ? 'Une notice d’autorité du service d’archives' : 'Choisissez d’abord le service d’archives'}>
                        <select value={producteurId} onChange={e => setProducteurId(e.target.value)} disabled={busy || !!chosen || !institutionArchivesId || producers.loading}><option value="">Choisir…</option>{(producers.data ?? []).map(a => <option key={a.id} value={a.id}>{a.input.name}</option>)}</select></Field>
                </>}
            <details className="span2"><summary>Informations complémentaires</summary><div className="form-grid"><OptionalFields form={extra} disabled={busy}/></div></details>
            </div>
            {error ? <ErrorNotice error={error}/> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy || partiesMissing}>Créer</button></footer>
        </form>
    </Modal>;
}

function LinkDialog({ intakeId, kind, onClose, onLinked }: {
    intakeId: string;
    kind: 'documents' | 'dossiers' | 'physical-archives';
    onClose: () => void;
    onLinked: () => void;
}) {
    const { archivalIntake } = useSession();
    const {scope}=useWorkspace();
    const [targetId, setTargetId] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const labels: Record<typeof kind, string> = { documents: 'un document', dossiers: 'un dossier', 'physical-archives': 'une archive physique' };
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await archivalIntake!.command(`/entries/${intakeId}/${kind}/${uuid(targetId.trim())}`, {}, crypto.randomUUID(), 'POST');
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
    return <Modal title={'Rattacher ' + labels[kind]} onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <div className="form-grid">
                {kind==='physical-archives'?<Field label="Identifiant de l’archive physique" wide hint="La sélection par emplacement reste à développer."><input value={targetId} onChange={e=>setTargetId(e.target.value)} required disabled={busy}/></Field>:<ArchiveRecordPicker kind={kind} institution={scope.institutionId??''} value={targetId||null} disabled={busy} onChange={value=>setTargetId(value??'')}/> }
            </div>
            {error ? <ErrorNotice error={error}/> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy || !targetId}>Rattacher</button></footer>
        </form>
    </Modal>;
}

function IntakeDetailDialog({ intake, canManage, onClose, onChanged }: {
    intake: ArchivalIntake;
    canManage: boolean;
    onClose: () => void;
    onChanged: () => void;
}) {
    const { archivalIntake } = useSession();
    const [linking, setLinking] = useState<'documents' | 'dossiers' | 'physical-archives' | null>(null);
    const [busy,setBusy]=useState(false); const [error,setError]=useState<unknown>(null);const [confirmClose,setConfirmClose]=useState(false);
    const close = async () => {if(busy)return;setBusy(true);setError(null);try{await archivalIntake!.command(`/entries/${intake.id}/close`,{},crypto.randomUUID(),'POST');onChanged();onClose();}catch(e){setError(e);}finally{setBusy(false);}};
    const unfinished = !!intake.etape && !isFinal(intake.etape);
    return <Modal wide={!!intake.etape} title={intake.numero} subtitle={display(intake.modeEntree)} onClose={onClose} locked={busy}>
        <div className="form-grid">
            <dl className="detail-card">
                <div><dt>Statut</dt><dd><Badge value={intake.statut}/></dd></div>
                {intake.etape && <div><dt>Étape du versement</dt><dd><Badge value={intake.etape} label={STAGE_LABELS[intake.etape]}/></dd></div>}
                <div><dt>Date d’entrée</dt><dd>{formatDate(intake.dateEntree)}</dd></div>
                <div><dt>Référence de preuve</dt><dd>{intake.referencePreuve ?? '—'}</dd></div>
                <div><dt>Description</dt><dd>{intake.description ?? '—'}</dd></div>
            </dl>
            {canManage && intake.statut === 'OUVERTE' && <div className="table-actions">
                <button className="btn small secondary" onClick={() => setLinking('documents')}>Rattacher un document</button>
                <button className="btn small secondary" onClick={() => setLinking('dossiers')}>Rattacher un dossier</button>
                <button className="btn small secondary" onClick={() => setLinking('physical-archives')}>Rattacher une archive physique</button>
                <button className="btn small warning" onClick={()=>setConfirmClose(true)} disabled={busy || unfinished} title={unfinished ? 'Un versement structuré se clôture une fois reçu ou rejeté.' : undefined}>Clôturer l’entrée</button>
            </div>}
        </div>
        {intake.etape && <StructuredSection intake={intake} canManage={canManage} onChanged={onChanged}/>}
        <Notice>La clôture change uniquement l’état de l’entrée. Elle ne certifie pas l’admission, l’intégration ou le scellement des documents.</Notice>
        {error?<ErrorNotice error={error}/>:null}
        {confirmClose&&<div className="f3-hint"><p>Confirmer la clôture de l’entrée {intake.numero} ? Aucune réouverture n’est exposée par l’API actuelle.</p><button className="btn secondary" disabled={busy} onClick={()=>setConfirmClose(false)}>Revenir</button> <button className="btn primary" disabled={busy} onClick={()=>void close()}>{busy?'Clôture en cours…':'Confirmer la clôture'}</button></div>}
        <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose}>Fermer</button></footer>
        {linking && <LinkDialog intakeId={intake.id} kind={linking} onClose={() => setLinking(null)} onLinked={onChanged}/>}
    </Modal>;
}

export function ArchivalIntakePage() {
    const { me, archivalIntake, epoch } = useSession();
    const canManage = can(me, 'ARCHIVAL_INTAKE_MANAGE', {});
    const [creating, setCreating] = useState(false);
    const [tab, setTab] = useState<'entries' | 'agreements'>('entries');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const entriesQ = useResource<ArchivalIntake[]>(s => archivalIntake!.entries(s), 'archival-intake-entries:' + epoch);
    const entries = entriesQ.data ?? [];
    const selected = entries.find(e => e.id === selectedId) ?? null;
    return <><PageHead eyebrow="MODULE · ENTRÉES D’ARCHIVES" title="Entrées archivistiques" description="Suivre les versements, dons, dépôts et autres entrées de fonds, et leur rattachement aux documents, dossiers et archives physiques.">
        {canManage && tab === 'entries' && <button className="btn primary" onClick={() => setCreating(true)}>Créer une entrée</button>}
    </PageHead>
        <div className="tabs" role="tablist" aria-label="Entrées et accords"><button role="tab" aria-selected={tab === 'entries'} className={tab === 'entries' ? 'active' : ''} onClick={() => setTab('entries')}>Entrées</button><button role="tab" aria-selected={tab === 'agreements'} className={tab === 'agreements' ? 'active' : ''} onClick={() => setTab('agreements')}>Accords de versement</button></div>
        {tab === 'agreements' ? <DepositAgreementsPanel canManage={canManage}/> : <div className="panel">
            <div className="section-heading"><h3>Entrées</h3></div>
            {entriesQ.loading ? <Busy /> : entriesQ.error ? <ErrorNotice error={entriesQ.error} onRetry={entriesQ.refresh}/> : entries.length ? <div className="table-scroll"><table><thead><tr><th>Numéro</th><th>Mode</th><th>Date</th><th>Étape</th><th>Statut</th></tr></thead><tbody>{entries.map(e => <tr key={e.id}><td><button className="record-name" onClick={() => setSelectedId(e.id)}><strong>{e.numero}</strong></button><ResourceDetailsButton resource="intakeEntry" id={e.id} title={e.numero} /></td><td>{display(e.modeEntree)}</td><td>{formatDate(e.dateEntree)}</td><td>{e.etape ? <Badge value={e.etape} label={STAGE_LABELS[e.etape]}/> : <small>Entrée simple</small>}</td><td><Badge value={e.statut}/></td></tr>)}</tbody></table></div> : <Empty title="Aucune entrée archivistique" description="Créez la première entrée."/>}
        </div>}
        {creating && <CreateIntakeDialog onClose={() => setCreating(false)} onCreated={entriesQ.refresh}/>}
        {selected && <IntakeDetailDialog intake={selected} canManage={canManage} onClose={() => setSelectedId(null)} onChanged={entriesQ.refresh}/>}
        </>;
}
