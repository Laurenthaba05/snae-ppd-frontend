import React from 'react';
import { Field } from './components';
import { ArchiveProcessingPicker } from './ArchiveProcessingPicker';
import type { AuthorityView } from '../api/archives';
import { EXTENT_UNITS } from '../core/archivalDescription';
import { emptyEnrichment, emptyProcessing, DATE_TYPES, CERTAINTIES, CALENDARS, PRIORITIES, PROCESSING_STATES } from '../core/archiveEnrichment';
import type { DescriptionEnrichment, ArchiveIdentifier } from '../core/archiveEnrichment';

const options=(values:Record<string,string>)=>Object.entries(values).map(([k,v])=><option key={k} value={k}>{v}</option>);
function Text({label,value,onChange,max=255,disabled,wide=false,hint}:{label:string;value?:string|null;onChange:(v:string)=>void;max?:number;disabled:boolean;wide?:boolean;hint?:string}) {
    return <Field label={label} wide={wide} hint={hint}><input aria-label={label} value={value??''} maxLength={max} disabled={disabled} onChange={e=>onChange(e.target.value)} /></Field>;
}
function Remove({label,onClick,disabled}:{label:string;onClick:()=>void;disabled:boolean}) { return <button type="button" className="btn small secondary" disabled={disabled} onClick={onClick}>{label}</button>; }
export function IdentifierFields({value,disabled,onChange}:{value:ArchiveIdentifier[];disabled:boolean;onChange:(v:ArchiveIdentifier[])=>void}) {
    return <fieldset className="span2 archive-enrichment"><legend>Identifiants multiples</legend>
        {value.map((x,i)=><fieldset key={i}><legend>Identifiant {i+1}</legend><div className="form-grid">
            <Text label="Type d’identifiant" value={x.type} max={100} disabled={disabled} onChange={v=>onChange(value.map((r,j)=>j===i?{...r,type:v}:r))} />
            <Text label="Valeur de l’identifiant" value={x.value} max={500} disabled={disabled} onChange={v=>onChange(value.map((r,j)=>j===i?{...r,value:v}:r))} />
            <Text label="Système d’origine" value={x.source} disabled={disabled} onChange={v=>onChange(value.map((r,j)=>j===i?{...r,source:v}:r))} />
            <Text label="Libellé de l’identifiant" value={x.label} disabled={disabled} onChange={v=>onChange(value.map((r,j)=>j===i?{...r,label:v}:r))} />
            <Text label="URI de l’identifiant" value={x.uri} max={2000} wide disabled={disabled} onChange={v=>onChange(value.map((r,j)=>j===i?{...r,uri:v}:r))} />
        </div><Remove label={'Supprimer l’identifiant '+(i+1)} disabled={disabled} onClick={()=>onChange(value.filter((_,j)=>j!==i))}/></fieldset>)}
        <button type="button" className="btn small secondary" disabled={disabled||value.length>=50} onClick={()=>onChange([...value,{type:'',value:''}])}>Ajouter un identifiant</button>
    </fieldset>;
}
export function ArchiveEnrichmentFields({value,authorities,institution,disabled,onChange}:{value?:DescriptionEnrichment|null;authorities:AuthorityView[];institution:string;disabled:boolean;onChange:(v:DescriptionEnrichment)=>void}) {
    const e=value??emptyEnrichment();
    const update=<K extends keyof DescriptionEnrichment>(key:K,v:DescriptionEnrichment[K])=>onChange({...e,[key]:v});
    const p=e.processing; const process=(key:string,v:unknown)=>update('processing',{...(p??emptyProcessing()),[key]:v});
    return <>
        <h4 className="form-section span2">Description enrichie</h4>
        <p className="span2">Les informations ci-dessous complètent les champs principaux. Les bornes de dates acceptent une année, un mois ou un jour ; une date incertaine peut garder son expression originale.</p>
        <IdentifierFields value={e.identifiers} disabled={disabled} onChange={v=>update('identifiers',v)} />
        <fieldset className="span2 archive-enrichment"><legend>Dates structurées</legend>{e.dates.map((x,i)=>{
            const set=(key:string,v:string)=>update('dates',e.dates.map((r,j)=>j===i?{...r,[key]:v}:r));
            return <fieldset key={i}><legend>Date {i+1}</legend><div className="form-grid">
                <Field label="Type de date"><select disabled={disabled} value={x.type} onChange={v=>set('type',v.target.value)}>{options(DATE_TYPES)}</select></Field>
                <Field label="Certitude"><select disabled={disabled} value={x.certainty} onChange={v=>set('certainty',v.target.value)}>{options(CERTAINTIES)}</select></Field>
                <Field label="Calendrier"><select disabled={disabled} value={x.calendar} onChange={v=>set('calendar',v.target.value)}>{options(CALENDARS)}</select></Field>
                <Text label="Expression originale" value={x.expression} max={1000} disabled={disabled} onChange={v=>set('expression',v)} />
                <Text label="Début structuré" hint="AAAA, AAAA-MM ou AAAA-MM-JJ" value={x.start} max={10} disabled={disabled||x.calendar!=='GREGORIEN'} onChange={v=>set('start',v)} />
                <Text label="Fin structurée" value={x.end} max={10} disabled={disabled||x.calendar!=='GREGORIEN'} onChange={v=>set('end',v)} />
                {x.calendar!=='GREGORIEN'&&(x.start||x.end)&&<button type="button" className="btn secondary" disabled={disabled} onClick={()=>update('dates',e.dates.map((r,j)=>j===i?{...r,start:null,end:null}:r))}>Effacer les bornes grégoriennes</button>}
            </div><Remove label={'Supprimer la date '+(i+1)} disabled={disabled} onClick={()=>update('dates',e.dates.filter((_,j)=>j!==i))} /></fieldset>;
        })}<button type="button" className="btn small secondary" disabled={disabled||e.dates.length>=50} onClick={()=>update('dates',[...e.dates,{type:'CREATION',certainty:'EXACTE',calendar:'GREGORIEN'}])}>Ajouter une date</button></fieldset>
        <fieldset className="span2 archive-enrichment"><legend>Producteurs multiples</legend>{e.producers.map((x,i)=>{
            const set=(key:string,v:string)=>update('producers',e.producers.map((r,j)=>j===i?{...r,[key]:v}:r));
            return <fieldset key={i}><legend>Producteur {i+1}</legend><div className="form-grid">
                <Field label="Autorité productrice"><select value={x.authorityId} disabled={disabled} onChange={v=>set('authorityId',v.target.value)}><option value="">Choisir un producteur</option>{authorities.map(a=><option key={a.id} value={a.id}>{a.input.code} · {a.input.name}</option>)}</select></Field>
                <Text label="Rôle du producteur" value={x.role} max={100} disabled={disabled} onChange={v=>set('role',v)} />
                <Text label="Début de responsabilité" value={x.start} max={10} disabled={disabled} onChange={v=>set('start',v)} />
                <Text label="Fin de responsabilité" value={x.end} max={10} disabled={disabled} onChange={v=>set('end',v)} />
            </div><Remove label={'Supprimer le producteur '+(i+1)} disabled={disabled} onClick={()=>update('producers',e.producers.filter((_,j)=>j!==i))}/></fieldset>;
        })}<button type="button" className="btn small secondary" disabled={disabled||e.producers.length>=50} onClick={()=>update('producers',[...e.producers,{authorityId:'',role:'PRODUCTEUR'}])}>Ajouter un producteur lié</button></fieldset>
        <fieldset className="span2 archive-enrichment"><legend>Volumes et supports multiples</legend>{e.extents.map((x,i)=>{
            const set=(key:string,v:string)=>update('extents',e.extents.map((r,j)=>j===i?{...r,[key]:v}:r));
            return <fieldset key={i}><legend>Volume {i+1}</legend><div className="form-grid">
                <Text label="Quantité du volume" value={x.quantity} max={13} disabled={disabled} onChange={v=>set('quantity',v.replace(',','.'))} />
                <Field label="Unité du volume"><select value={x.unit} disabled={disabled} onChange={v=>set('unit',v.target.value)}><option value="">Choisir une unité</option>{EXTENT_UNITS.map(u=><option key={u.code} value={u.code}>{u.label}</option>)}</select></Field>
                <Text label="Support du volume" value={x.medium} disabled={disabled} onChange={v=>set('medium',v)} />
                <Text label="Dimensions" value={x.dimensions} disabled={disabled} onChange={v=>set('dimensions',v)} />
                <Field label="Portion décrite"><select value={x.portion} disabled={disabled} onChange={v=>set('portion',v.target.value)}><option value="WHOLE">Ensemble</option><option value="PART">Partie</option></select></Field>
            </div><Remove label={'Supprimer le volume '+(i+1)} disabled={disabled} onClick={()=>update('extents',e.extents.filter((_,j)=>j!==i))}/></fieldset>;
        })}<button type="button" className="btn small secondary" disabled={disabled||e.extents.length>=50} onClick={()=>update('extents',[...e.extents,{quantity:'',unit:'',portion:'WHOLE'}])}>Ajouter un volume</button></fieldset>
        <fieldset className="span2 archive-enrichment"><legend>Planification du traitement</legend><p>Informations de travail internes au service des archives.</p>
            {!p?<button type="button" className="btn small secondary" disabled={disabled} onClick={()=>update('processing',emptyProcessing())}>Planifier le traitement</button>:<><div className="form-grid">
                <Field label="Priorité du traitement"><select value={p.priority} disabled={disabled} onChange={v=>process('priority',v.target.value)}>{options(PRIORITIES)}</select></Field>
                <Field label="État du traitement"><select value={p.status} disabled={disabled} onChange={v=>process('status',v.target.value)}>{options(PROCESSING_STATES)}</select></Field>
                <Field label="Plan de traitement" wide><textarea value={p.plan??''} rows={3} maxLength={3000} disabled={disabled} onChange={v=>process('plan',v.target.value)}/></Field>
                <Field label="Heures prévues"><input type="number" min="0" max="1000000" step="0.01" value={p.estimatedHours??''} disabled={disabled} onChange={v=>process('estimatedHours',v.target.value===''?null:Number(v.target.value))}/></Field>
                <Field label="Heures réalisées"><input type="number" min="0" max="1000000" step="0.01" value={p.actualHours??''} disabled={disabled} onChange={v=>process('actualHours',v.target.value===''?null:Number(v.target.value))}/></Field>
                <Text label="Financement du traitement" value={p.funding} max={1000} wide disabled={disabled} onChange={v=>process('funding',v)}/>
            </div>{p.processors.map((id,i)=><div key={i}><ArchiveProcessingPicker value={id} label={'Intervenant '+(i+1)} institution={institution} disabled={disabled} onChange={v=>process('processors',p.processors.map((r,j)=>j===i?v:r))}/><Remove label={'Retirer l’intervenant '+(i+1)} disabled={disabled} onClick={()=>process('processors',p.processors.filter((_,j)=>j!==i))}/></div>)}
            <button type="button" className="btn small secondary" disabled={disabled||p.processors.length>=50} onClick={()=>process('processors',[...p.processors,''])}>Ajouter un intervenant</button>
            <Remove label="Retirer la planification" disabled={disabled} onClick={()=>update('processing',null)}/></>}
        </fieldset>
    </>;
}
