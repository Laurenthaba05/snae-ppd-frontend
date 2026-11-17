import React, { Fragment, useEffect, useState } from 'react';
import type { ArchivesApi, ArchiveBrowseKind, ArchiveBrowseRow, ArchiveBrowseItem, ArchiveBrowseQuery, AuthorityView } from '../api/archives';
import { Busy, Empty, ErrorNotice, useResource } from './components';
import './ArchiveBrowse.css';

const levels={FONDS:'Fonds',SOUS_FONDS:'Sous-fonds',SERIE:'Série',SOUS_SERIE:'Sous-série',DOSSIER:'Dossier',PIECE:'Pièce'};
const authorityKinds={PERSONNE:'Personne',COLLECTIVITE:'Collectivité',FAMILLE:'Famille'};
const functionKinds={FONCTION:'Fonction',SOUS_FONCTION:'Sous-fonction',ACTIVITE:'Activité',TACHE:'Tâche',PROCESSUS:'Processus',AUTRE:'Autre'};
const statuses={BROUILLON:'Brouillon',A_RELIRE:'À relire',VALIDEE:'Validée'};
const functionStatuses={BROUILLON:'Brouillon',REVISEE:'Révisée',VALIDEE:'Validée'};
const labels={descriptions:'fonds et descriptions',authorities:'producteurs',functions:'fonctions'};
const nameOf=(row:ArchiveBrowseRow)=>'title' in row.input?row.input.title:row.input.name;
function useSearchText(text:string) {
    const [query,setQuery]=useState(text);
    useEffect(()=>{const timer=setTimeout(()=>setQuery(text),250);return()=>clearTimeout(timer);},[text]);
    return query;
}
type Producer={id:string;name:string;code:string};
export function ArchiveProducerFilter({api,institution,value,onChange}:{api:ArchivesApi;institution:string;value:Producer|null;onChange:(v:Producer|null)=>void}) {
    const [open,setOpen]=useState(false),[text,setText]=useState(''),[page,setPage]=useState(0);
    const search=useSearchText(text.trim());
    const q=useResource(s=>open?api.browse<AuthorityView>('authorities',institution,{q:search,page,size:20},s):Promise.resolve(null),JSON.stringify(['producer-filter',institution,open,search,page]));
    return <div className="archive-producer-filter">
        <button type="button" className="btn secondary" aria-label="Filtrer par producteur" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>{value?value.code+' · '+value.name:'Tous les producteurs'}</button>
        {value&&<button type="button" className="btn small secondary" onClick={()=>onChange(null)}>Retirer le filtre producteur</button>}
        {open&&<div className="archive-producer-options"><label>Rechercher un producteur<input value={text} maxLength={200} onChange={e=>{setText(e.target.value);setPage(0);}}/></label>
            {q.loading||search!==text.trim()?<Busy/>:q.error?<ErrorNotice error={q.error} onRetry={q.refresh}/>:<>
                {!q.data?.items.length&&<p>Aucun producteur trouvé.</p>}
                {q.data?.items.map(({row})=><button className="btn secondary" type="button" key={row.id} onClick={()=>{onChange({id:row.id,name:row.input.name,code:row.input.code});setOpen(false);}}>{row.input.code+' · '+row.input.name}</button>)}
                <div className="archive-branch-pages"><button type="button" className="btn small secondary" disabled={page===0} onClick={()=>setPage(p=>p-1)}>Producteurs précédents</button><span>Page {page+1}</span><button type="button" className="btn small secondary" disabled={!q.data?.hasMore} onClick={()=>setPage(p=>p+1)}>Producteurs suivants</button></div>
            </>}
        </div>}
    </div>;
}
type BrowseProps<T extends ArchiveBrowseRow>={api:ArchivesApi;institution:string;kind:ArchiveBrowseKind;revision?:number;headers:React.ReactNode;columns:number;renderCells:(item:ArchiveBrowseItem<T>)=>React.ReactNode};
export function ArchiveBrowse<T extends ArchiveBrowseRow>(props:BrowseProps<T>) {
    return <ArchiveBrowseContent key={props.institution+props.kind} {...props}/>;
}
function ArchiveBrowseContent<T extends ArchiveBrowseRow>(props:BrowseProps<T>) {
    const [text,setText]=useState(''),[type,setType]=useState(''),[status,setStatus]=useState('');
    const [producer,setProducer]=useState<Producer|null>(null),[treeRevision,setTreeRevision]=useState(0);
    const search=useSearchText(text.trim());
    const types=props.kind==='descriptions'?levels:props.kind==='functions'?functionKinds:authorityKinds;
    const states=props.kind==='functions'?functionStatuses:statuses;
    const filters:ArchiveBrowseQuery={q:search,...(props.kind==='descriptions'?{level:type}:{kind:type}),status,...(producer?{producerId:producer.id}:{})};
    const active=!!(text||type||status||producer);
    const key=JSON.stringify([props.kind,props.institution,props.revision,filters,treeRevision]);
    return <div className="archive-browser">
        <div className="archive-browse-filters">
            <label>Rechercher dans les {labels[props.kind]}<input type="search" maxLength={200} value={text} placeholder="Code ou nom" onChange={e=>setText(e.target.value)}/></label>
            <label>{props.kind==='descriptions'?'Niveau de description':'Type de notice'}<select value={type} onChange={e=>setType(e.target.value)}><option value="">Tous</option>{Object.entries(types).map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></label>
            <label>État de rédaction<select value={status} onChange={e=>setStatus(e.target.value)}><option value="">Tous les états</option>{Object.entries(states).map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></label>
            {props.kind!=='authorities'&&<ArchiveProducerFilter api={props.api} institution={props.institution} value={producer} onChange={setProducer}/>}
            {active&&<button className="btn secondary" type="button" onClick={()=>{setText('');setType('');setStatus('');setProducer(null);}}>Effacer les filtres</button>}
            {props.kind!=='authorities'&&!active&&<button className="btn secondary" type="button" onClick={()=>setTreeRevision(v=>v+1)}>Replier toutes les branches</button>}
        </div>
        <p className="archive-browse-hint">{active?'Recherche sur toutes les notices autorisées. Le chemin des résultats conserve leurs parents.':props.kind==='authorities'?'Les producteurs sont affichés par pages de 20 notices.':'Ouvrez une branche pour charger ses enfants. Chaque niveau est paginé séparément.'}{props.kind==='descriptions'&&producer?' Le filtre producteur inclut les rattachements hérités du parent.':props.kind==='functions'&&producer?' Le filtre porte sur les producteurs directement liés à la fonction.':''}</p>
        {search!==text.trim()?<Busy/>:<div className="table-scroll"><table><thead><tr><th>Référence et intitulé</th>{props.headers}</tr></thead><tbody>
            <Branch key={key} {...props} filters={filters} depth={0} parentId={undefined} parentName={undefined}/>
        </tbody></table></div>}
    </div>;
}
type BranchProps<T extends ArchiveBrowseRow>=BrowseProps<T>&{filters:ArchiveBrowseQuery;depth:number;parentId:string|undefined;parentName:string|undefined};
function Branch<T extends ArchiveBrowseRow>(props:BranchProps<T>) {
    const [page,setPage]=useState(0);
    const params={...props.filters,parentId:props.parentId,page,size:20};
    const q=useResource(s=>props.api.browse<T>(props.kind,props.institution,params,s),JSON.stringify([props.kind,props.institution,params,props.revision]));
    const subject=props.parentName?'les enfants de '+props.parentName:labels[props.kind];
    if(q.loading)return <tr><td colSpan={props.columns}><Busy/></td></tr>;
    if(q.error)return <tr><td colSpan={props.columns}><ErrorNotice error={q.error} onRetry={q.refresh}/></td></tr>;
    return <>{q.data?.items.map(item=><BrowseRow key={item.row.id} {...props} item={item} searching={q.data!.searching}/>)}
        {!q.data?.items.length&&<tr><td colSpan={props.columns}><Empty title="Aucune notice trouvée" description={props.parentId?'Cette branche ne contient aucun enfant accessible.':'Modifiez les filtres ou le périmètre pour retrouver une notice.'}/></td></tr>}
        <tr className="archive-branch-footer"><td colSpan={props.columns}><div className="archive-branch-pages">
            <span>{q.data?.total??0} notice(s){props.parentName?' sous '+props.parentName:''} · page {page+1}</span>
            <button type="button" className="btn small secondary" aria-label={'Page précédente pour '+subject} disabled={page===0} onClick={()=>setPage(p=>p-1)}>Précédente</button>
            <button type="button" className="btn small secondary" aria-label={'Page suivante pour '+subject} disabled={!q.data?.hasMore} onClick={()=>setPage(p=>p+1)}>Suivante</button>
        </div></td></tr></>;
}
function BrowseRow<T extends ArchiveBrowseRow>(props:BranchProps<T>&{item:ArchiveBrowseItem<T>;searching:boolean}) {
    const [open,setOpen]=useState(false);const {row,ancestors,hasChildren}=props.item;
    const name=nameOf(row);const title=row.input.code+' · '+name;
    return <Fragment><tr>
        <td className="archive-browse-title" style={{paddingLeft:16+Math.min(props.depth,8)*18}}>
            {props.searching&&ancestors.length>0&&<small className="archive-ancestors" aria-label="Chemin de la notice">{ancestors.map(a=>a.code+' · '+a.name).join(' › ')}</small>}
            <div>{hasChildren&&!props.searching&&<button type="button" className="archive-branch-toggle" aria-label={(open?'Replier ':'Déplier ')+row.input.code} aria-expanded={open} onClick={()=>setOpen(v=>!v)}>{open?'−':'+'}</button>}<span><strong>{row.input.code}</strong> · <span>{name}</span></span></div>
        </td>{props.renderCells(props.item)}
    </tr>{open&&!props.searching&&<Branch {...props} filters={{}} parentId={row.id} parentName={title} depth={props.depth+1}/>}</Fragment>;
}
