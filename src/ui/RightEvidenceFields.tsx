import React from 'react';
import { Field, formatDate } from './components';
import type { RightEvidence, PreservationRight } from '../core/preservationPlanning';
import { COPYRIGHT_LABELS, DECISION_LABELS } from '../core/preservationPlanning';

export function RightEvidenceFields({value,disabled,onChange}:{value:RightEvidence[];disabled:boolean;onChange:(v:RightEvidence[])=>void}) {
    return <fieldset className="span2 archive-enrichment"><legend>Justificatifs du droit</legend>{value.map((x,i)=>{
        const set=(key:string,v:string)=>onChange(value.map((r,j)=>j===i?{...r,[key]:v}:r));
        return <fieldset key={i}><legend>Justificatif {i+1}</legend><div className="form-grid">
            <Field label="Type de justificatif"><input value={x.type} maxLength={100} disabled={disabled} onChange={v=>set('type',v.target.value)}/></Field>
            <Field label="Référence du justificatif"><input value={x.value} maxLength={1000} disabled={disabled} onChange={v=>set('value',v.target.value)}/></Field>
            <Field label="Rôle du justificatif"><input value={x.role??''} maxLength={255} disabled={disabled} onChange={v=>set('role',v.target.value)}/></Field>
            <Field label="URI du justificatif"><input value={x.uri??''} maxLength={2000} disabled={disabled} onChange={v=>set('uri',v.target.value)}/></Field>
        </div><button type="button" className="btn small secondary" disabled={disabled} onClick={()=>onChange(value.filter((_,j)=>i!==j))}>Retirer le justificatif {i+1}</button></fieldset>;
    })}<button type="button" className="btn small secondary" disabled={disabled||value.length>=50} onClick={()=>onChange([...value,{type:'',value:''}])}>Ajouter un justificatif</button></fieldset>;
}
export function RightDetailsView({right:r}:{right:PreservationRight}) {
    return <details><summary>Détails du droit</summary><dl>
        <dt>Décision</dt><dd>{DECISION_LABELS[r.decision??(r.granted?'ALLOW':'DISALLOW')]}</dd>
        <dt>Juridiction</dt><dd>{r.jurisdiction||'Non renseignée'}</dd>
        <dt>Date de détermination</dt><dd>{r.determinedOn?formatDate(r.determinedOn):'Non renseignée'}</dd>
        <dt>Statut du droit d’auteur</dt><dd>{COPYRIGHT_LABELS[r.copyrightStatus??'']||'Non renseigné'}</dd>
    </dl>{r.evidence?.length?<ul>{r.evidence.map((e,i)=><li key={i}>{e.type} · {e.value}{e.role?' — '+e.role:''}{e.uri?<p>{e.uri}</p>:null}</li>)}</ul>:<p>Aucun justificatif renseigné.</p>}</details>;
}
