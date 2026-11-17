import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { can } from '../core/policy';
import { locationPath } from '../core/placement';
import type { Localisation, StorageUnit } from '../core/types';
import { Modal, Field, Notice, ErrorNotice } from './components';

const levels=[['room','Salle'],['shelf','Étagère'],['row','Rang'],['compartment','Case']] as const;
type Level=typeof levels[number][0];
export function ShelvingDialog({locations,onClose,onCreated}:{locations:Localisation[];onClose:()=>void;onCreated:(unit:StorageUnit)=>void}) {
    const {me,physicalArchives}=useSession();
    const [parentId,setParent]=useState(''),[boxCode,setBox]=useState('');
    const [values,setValues]=useState<Record<Level,{code:string;label:string}>>({room:{code:'',label:''},shelf:{code:'',label:''},row:{code:'',label:''},compartment:{code:'',label:''}});
    const [busy,setBusy]=useState(false),[error,setError]=useState<unknown>(null);
    const [key]=useState(()=>crypto.randomUUID());
    const byId=new Map(locations.map(l=>[l.id,l]));
    const parents=locations.filter(l=>l.statut==='ACTIVE'&&['SITE','BATIMENT','MAGASIN','DEPOT'].includes(l.typeLocalisation)&&can(me,'PHYSICALARCHIVES_LOCATION_MANAGE',{institutionId:l.institutionId??null}));
    const update=(level:Level,field:'code'|'label',value:string)=>setValues(v=>({...v,[level]:{...v[level],[field]:field==='code'?value.toUpperCase():value}}));
    const submit=async(event:React.FormEvent)=>{
        event.preventDefault(); if(busy)return;setBusy(true);setError(null);
        try {
            const result=await physicalArchives!.command<{unit:StorageUnit}>('/shelving',{parentId,...values,boxCode},key,'POST');
            onCreated(result.unit);onClose();
        }catch(e){setError(e);}finally{setBusy(false);}
    };
    return <Modal title="Créer un rangement détaillé" subtitle="Salle → Étagère → Rang → Case → Boîte" onClose={onClose} locked={busy} wide>
        <Notice>Chaque niveau reçoit un code stable et un libellé. Les emplacements identiques sont réutilisés. La cote du dossier ou du document reste distincte de l’adresse de rangement.</Notice>
        <form onSubmit={submit}><div className="form-grid">
            <Field label="Site, bâtiment ou magasin parent" wide><select aria-label="Site, bâtiment ou magasin parent" value={parentId} onChange={e=>setParent(e.target.value)} required disabled={busy}><option value="">Choisir le dépôt</option>{parents.map(l=><option key={l.id} value={l.id}>{locationPath(l.id,byId).join(' › ')}</option>)}</select></Field>
            {levels.map(([id,label])=><React.Fragment key={id}>
                <Field label={'Code '+label} hint="1 à 16 caractères, sans accent"><input aria-label={'Code '+label} required pattern="[A-Za-z0-9][A-Za-z0-9_.\-]{0,15}" maxLength={16} value={values[id].code} onChange={e=>update(id,'code',e.target.value)} disabled={busy}/></Field>
                <Field label={'Libellé '+label}><input aria-label={'Libellé '+label} required maxLength={150} value={values[id].label} onChange={e=>update(id,'label',e.target.value)} disabled={busy}/></Field>
            </React.Fragment>)}
            <Field label="Code Boîte"><input aria-label="Code Boîte" required pattern="[A-Za-z0-9][A-Za-z0-9_.\-]{0,15}" maxLength={16} value={boxCode} onChange={e=>setBox(e.target.value.toUpperCase())} disabled={busy}/></Field>
        </div>
        <p aria-label="Aperçu du rangement">{parentId?locationPath(parentId,byId).join(' › '):'Dépôt'} › {levels.map(([id,label])=>`${label} ${values[id].code||'…'}`).join(' › ')} › Boîte {boxCode||'…'}</p>
        <p>Après création, rattachez la fiche papier à cette boîte. Pour un dossier déjà rangé, utilisez le déplacement tracé de sa fiche, puis vérifiez sa présence sur place.</p>
        {error?<ErrorNotice error={error}/>:null}
        <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="btn primary" disabled={busy||!parentId}>Créer ou retrouver le rangement</button></footer></form>
    </Modal>;
}
