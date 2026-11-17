import React,{useEffect,useRef,useState} from 'react';
import {type ArchivesApi,type AuthorityView,type DescriptionView,commandKey} from '../api/archives';
import {type FunctionDetailView,type FunctionView,type FunctionLinkInput,type FunctionLinkView,type FunctionLinkTarget,type FunctionLinkSnapshot,
    NATURE_LABELS,TARGET_LABELS,naturesFor,functionLinkProblems} from '../core/archivalFunctions';
import {Busy,ErrorNotice,Field,Notice,formatDate,useResource} from './components';
import './FunctionLinks.css';

type Props={api:ArchivesApi;institution:string;functionId:string;detail:FunctionDetailView|null;all:FunctionView[];
    descriptions:DescriptionView[];authorities:AuthorityView[];readOnly:boolean;loading?:boolean;loadError?:unknown;
    onChanged:()=>void;onReload:()=>void;onBusyChange:(busy:boolean)=>void};
const normalized=(v:FunctionLinkInput):FunctionLinkInput=>({...v,dateStart:v.dateStart?.trim()||null,dateEnd:v.dateEnd?.trim()||null,description:v.description?.trim()||null});
const empty=(institutionId:string,functionId:string):FunctionLinkInput=>({institutionId,functionId,targetKind:'AUTHORITY',targetId:'',nature:'EXERCEE_PAR',dateStart:null,dateEnd:null,description:null});
type Difference={label:string;before:string|null;after:string|null;cleared:boolean};
function Differences({changes}:{changes:Difference[]}) {
    return <div className="table-scroll"><table className="function-link-differences"><thead><tr><th>Champ</th><th>Avant</th><th>Après</th></tr></thead><tbody>
        {changes.map(c=><tr key={c.label}><th>{c.label}</th><td>{c.before||'Non renseigné'}</td><td>{c.after||(c.cleared?'Effacé':'Non renseigné')}</td></tr>)}
    </tbody></table></div>;
}
export function FunctionLinks({api,institution,functionId,detail,all,descriptions,authorities,readOnly,loading,loadError,onChanged,onReload,onBusyChange}:Props) {
    const [draft,setDraft]=useState(()=>empty(institution,functionId)),[editing,setEditing]=useState<FunctionLinkView|null>(null);
    const [review,setReview]=useState(false),[removing,setRemoving]=useState<FunctionLinkView|null>(null),[ackClear,setAckClear]=useState(false);
    const [busy,setBusy]=useState(false),[error,setError]=useState<unknown>(),[done,setDone]=useState(''),[attempted,setAttempted]=useState(false);
    const [history,setHistory]=useState(false),[revision,setRevision]=useState(0);
    const intention=useRef<ReturnType<typeof commandKey>|null>(null),cancellation=useRef(new AbortController());
    useEffect(()=>{const controller=new AbortController();cancellation.current=controller;return()=>controller.abort();},[]);
    const optionsFor=(kind:FunctionLinkTarget)=>kind==='FUNCTION'?all.filter(f=>f.id!==functionId).map(f=>({id:f.id,label:f.input.code+' · '+f.input.name})):
        kind==='AUTHORITY'?authorities.map(a=>({id:a.id,label:a.input.code+' · '+a.input.name})):descriptions.map(d=>({id:d.id,label:d.input.code+' · '+d.input.title}));
    const labelOf=(v:FunctionLinkInput)=>optionsFor(v.targetKind).find(o=>o.id===v.targetId)?.label??(editing?.input.targetId===v.targetId?editing.targetLabel:null)??'Cible indisponible';
    const draftOptions=optionsFor(draft.targetKind);
    if(editing&&draft.targetId===editing.input.targetId&&!draftOptions.some(o=>o.id===draft.targetId))draftOptions.push({id:draft.targetId,label:editing.targetLabel??'Cible indisponible'});
    const input=normalized(draft);
    const changes:Difference[]=editing?([
        ['Type de cible',TARGET_LABELS[editing.input.targetKind],TARGET_LABELS[input.targetKind]],
        ['Cible',labelOf(editing.input),labelOf(input)],
        ['Nature',NATURE_LABELS[editing.input.nature],NATURE_LABELS[input.nature]],
        ['Depuis',editing.input.dateStart,input.dateStart],['Jusqu’à',editing.input.dateEnd,input.dateEnd],['Commentaire',editing.input.description,input.description]
    ] as Array<[string,string|null,string|null]>).filter(([,a,b])=>a!==b).map(([label,before,after])=>({label,before,after,cleared:!!before&&!after})):[];
    // IDs are authoritative even when two target labels happen to be identical.
    if(editing&&editing.input.targetId!==input.targetId&&!changes.some(c=>c.label==='Cible'))
        changes.push({label:'Cible',before:labelOf(editing.input),after:labelOf(input)+' (autre notice)',cleared:false});
    const clears=changes.some(c=>c.cleared),problems=functionLinkProblems(input);
    const unavailable=busy||!!loading||!!loadError||readOnly;
    const reset=()=>{setEditing(null);setDraft(empty(institution,functionId));setReview(false);setAckClear(false);setAttempted(false);setError(undefined);intention.current=null;};
    const mutate=async(action:'create'|'update'|'remove')=>{
        if(unavailable)return;
        if(action!=='remove'&&problems.length){setAttempted(true);return;}
        if(action==='update'&&(!editing||!review||!changes.length||(clears&&!ackClear)))return;
        if(action==='remove'&&!removing)return;
        const snapshot=action==='remove'?removing!:editing;
        const request=action==='remove'?{id:snapshot!.id,version:snapshot!.version}:input;
        intention.current=commandKey(intention.current,{action,request});
        const signal=cancellation.current.signal;
        setBusy(true);onBusyChange(true);setError(undefined);
        try {
            if(action==='create')await api.addFunctionLink(input,intention.current.key,signal);
            else if(action==='update')await api.updateFunctionLink(editing!.id,input,intention.current.key,signal);
            else await api.removeFunctionLink(removing!.id,institution,removing!.version,intention.current.key,signal);
            if(!signal.aborted){reset();setRemoving(null);setDone(action==='create'?'Lien ajouté.':action==='update'?'Lien modifié.':'Lien retiré.');setRevision(v=>v+1);onChanged();}
        }catch(e){if(!signal.aborted)setError(e);}
        finally{if(!signal.aborted){setBusy(false);onBusyChange(false);}}
    };
    const edit=(link:FunctionLinkView)=>{reset();setRemoving(null);setEditing(link);setDraft({...link.input,version:link.version});setDone('');};
    const chooseTarget=(targetKind:FunctionLinkTarget)=>setDraft(d=>({...d,targetKind,targetId:'',nature:naturesFor(targetKind)[0]!}));
    const submit=(event:React.FormEvent)=>{event.preventDefault();if(unavailable)return;setAttempted(true);setError(undefined);if(problems.length)return;if(editing){setReview(true);setAckClear(false);}else void mutate('create');};
    const links=detail?.links??[];
    return <section aria-label="Liens de la fonction" className="panel-padding function-links">
        <h4 className="form-section">Liens</h4>
        <div className="page-actions"><button type="button" className="btn small secondary" disabled={busy||loading} onClick={onReload}>Actualiser les liens</button>
            <button type="button" className="btn small secondary" aria-expanded={history} onClick={()=>setHistory(v=>!v)}>Historique des liens</button></div>
        {loading?<Busy label="Chargement des liens…"/>:loadError?<ErrorNotice error={loadError} onRetry={onReload}/>:<>
        {links.length===0?<p><small>Cette fonction n’est reliée à aucune autre fonction, aucun producteur ni aucun fonds accessible.</small></p>:
            <ul className="plain-list">{links.map(l=><li key={l.id} className="function-link">
                <strong>{NATURE_LABELS[l.input.nature]}</strong> · {l.targetLabel??'—'} <small>({TARGET_LABELS[l.input.targetKind]}{l.input.dateStart?', depuis '+l.input.dateStart:''}{l.input.dateEnd?' jusqu’à '+l.input.dateEnd:''})</small>
                {l.input.description&&<p className="function-link-comment">{l.input.description}</p>}
                {!readOnly&&<div className="page-actions"><button type="button" className="btn small secondary" disabled={busy||!!editing||!!removing} onClick={()=>edit(l)}>Modifier le lien</button>
                    <button type="button" className="btn small danger-outline" disabled={busy||!!editing||!!removing} onClick={()=>{reset();setRemoving(l);setDone('');}}>Retirer</button></div>}
            </li>)}</ul>}
        </>}
        {detail&&detail.children.length>0&&<p><small>Contient : {detail.children.map(c=>c.code+' · '+c.name).join(' ; ')}.</small></p>}
        {done&&<div role="status"><Notice>{done}</Notice></div>}{error?<ErrorNotice error={error}/>:null}
        {!readOnly&&removing&&<div role="region" aria-label="Confirmer le retrait du lien" className="function-link-review">
            <h4>Retirer ce lien ?</h4><p>{NATURE_LABELS[removing.input.nature]} · {removing.targetLabel}</p>
            <p>Le rattachement sera retiré. Les notices liées seront conservées et l’opération restera dans l’historique.</p>
            <button type="button" className="btn secondary" disabled={busy} onClick={()=>{setRemoving(null);setError(undefined);}}>Annuler le retrait</button>{' '}
            <button type="button" className="btn danger-outline" disabled={unavailable} onClick={()=>void mutate('remove')}>Confirmer le retrait</button>
        </div>}
        {!readOnly&&!removing&&(review&&editing?<div role="region" aria-label="Aperçu des modifications du lien" className="function-link-review">
            <h4>Vérifier les modifications</h4><p>L’identifiant du lien sera conservé.</p>
            <Differences changes={changes}/>
            {clears&&<label className="function-link-ack"><input type="checkbox" checked={ackClear} disabled={busy} onChange={e=>setAckClear(e.target.checked)}/>Je confirme l’effacement des valeurs indiquées.</label>}
            <div className="page-actions"><button type="button" className="btn secondary" disabled={busy} onClick={()=>setReview(false)}>Revenir à la saisie</button>
                <button type="button" className="btn primary" disabled={unavailable||!changes.length||(clears&&!ackClear)} onClick={()=>void mutate('update')}>Confirmer la modification du lien</button></div>
        </div>:<form onSubmit={submit} aria-label={editing?'Modifier le lien':'Ajouter un lien'}><h4>{editing?'Modifier le lien':'Ajouter un lien'}</h4><div className="form-grid">
            <Field label="Relier à"><select value={draft.targetKind} disabled={unavailable} onChange={e=>chooseTarget(e.target.value as FunctionLinkTarget)}>
                {Object.entries(TARGET_LABELS).map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></Field>
            <Field label="Nature du lien"><select value={draft.nature} disabled={unavailable} onChange={e=>setDraft(d=>({...d,nature:e.target.value as FunctionLinkInput['nature']}))}>
                {naturesFor(draft.targetKind).map(n=><option key={n} value={n}>{NATURE_LABELS[n]}</option>)}</select></Field>
            <Field label="Cible" wide><select value={draft.targetId} disabled={unavailable} onChange={e=>setDraft(d=>({...d,targetId:e.target.value}))}>
                <option value="">Choisir…</option>{draftOptions.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}</select></Field>
            <Field label="Depuis" hint="AAAA, AAAA-MM ou AAAA-MM-JJ."><input maxLength={10} value={draft.dateStart??''} disabled={unavailable} onChange={e=>setDraft(d=>({...d,dateStart:e.target.value||null}))}/></Field>
            <Field label="Jusqu’à"><input maxLength={10} value={draft.dateEnd??''} disabled={unavailable} onChange={e=>setDraft(d=>({...d,dateEnd:e.target.value||null}))}/></Field>
            <Field label="Commentaire du lien" wide><textarea rows={3} maxLength={10000} value={draft.description??''} disabled={unavailable} onChange={e=>setDraft(d=>({...d,description:e.target.value||null}))}/></Field>
        </div>
        {editing&&<p><small>Videz une date ou le commentaire pour l’effacer ; cet effacement devra être confirmé dans l’aperçu.</small></p>}
        {attempted&&problems.length>0&&<Notice tone="warning"><ul>{problems.map(p=><li key={p}>{p}</li>)}</ul></Notice>}
        {editing&&!changes.length&&<p>Aucune modification à confirmer.</p>}
        <div className="page-actions">{editing&&<button type="button" className="btn secondary" disabled={busy} onClick={reset}>Annuler la modification</button>}
            <button type="submit" className="btn small secondary" disabled={unavailable||!draft.targetId||(!!editing&&!changes.length)}>{editing?'Vérifier les modifications':'Ajouter le lien'}</button></div>
        </form>)}
        {history&&<LinkHistory key={functionId+':'+revision} api={api} functionId={functionId}/>}
    </section>;
}
function snapshotFields(s:FunctionLinkSnapshot|null):Array<[string,string|null]> {
    return [['Fonction',s?.functionLabel??null],['Cible',s?.targetLabel??null],['Type de cible',s?TARGET_LABELS[s.targetKind]:null],['Nature',s?NATURE_LABELS[s.nature]:null],
        ['Depuis',s?.dateStart??null],['Jusqu’à',s?.dateEnd??null],['Commentaire',s?.description??null]];
}
function LinkHistory({api,functionId}:{api:ArchivesApi;functionId:string}) {
    const [page,setPage]=useState(0);
    const q=useResource(s=>api.functionLinkHistory(functionId,page,20,s),'function-link-history:'+functionId+':'+page);
    return <section aria-label="Historique des liens" className="function-link-history"><h4>Historique des liens</h4>
        <p><small>Les modifications détaillées sont enregistrées depuis cette version, y compris les imports CSV. Seules les opérations dont les cibles restent accessibles sont affichées.</small></p>
        {q.loading?<Busy/>:q.error?<ErrorNotice error={q.error} onRetry={q.refresh}/>:<>
            {!q.data?.items.length&&<p>Aucune opération accessible sur cette page.</p>}
            {q.data?.items.map(e=>{
                const removed=e.action==='ARCHIVAL_FUNCTION_LINK_DELETED';
                const before=snapshotFields(e.before),after=snapshotFields(removed?null:e.after);
                const changes=before.map(([label,value],i)=>({label,before:value,after:after[i]![1],cleared:!!value&&!after[i]![1]})).filter(c=>c.before!==c.after);
                return <details key={e.id}><summary>{removed?'Lien retiré':e.before?'Lien modifié':'Lien ajouté'} · {formatDate(e.occurredAt)} · {e.performedBy}{e.after?.origin==='CSV_IMPORT'?' · Import CSV':''}</summary>
                    <p>{e.after?.targetLabel??e.before?.targetLabel??'Cible indisponible'}</p><Differences changes={changes}/>
                    {(e.before?.descriptionTruncated||e.after?.descriptionTruncated)&&<p><small>Commentaire long : l’historique conserve un extrait de 1 000 caractères et l’empreinte du contenu complet.</small></p>}
                    {!changes.length&&<p>Les valeurs affichées sont identiques ; le contenu complet ou la fonction de rattachement a changé.</p>}
                </details>;
            })}
            <div className="page-actions"><button type="button" className="btn small secondary" disabled={page===0} onClick={()=>setPage(v=>v-1)}>Événements précédents</button>
                <span>Page {page+1}</span><button type="button" className="btn small secondary" disabled={!q.data?.hasMore} onClick={()=>setPage(v=>v+1)}>Événements suivants</button></div>
        </>}
    </section>;
}

