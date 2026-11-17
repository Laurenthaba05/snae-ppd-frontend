import React, { useMemo, useState } from 'react';
import { useSession } from '../auth/session';
import { ArchivalReadinessApi, type ArchivalStep } from '../api/archivalReadiness';
import { concordanceBlockers } from '../api/archivalConcordance';
import { ArchivalConcordancePanel } from './ArchivalConcordancePanel';
import { Busy, ErrorNotice, Notice, Modal, useResource } from './components';
import { navigate } from './navigation';
import type { ScanLot } from '../core/types';

const labels={DONE:'Terminé',TODO:'À faire',BLOCKED:'Bloqué',UNAVAILABLE:'Accès requis'};
const blockers: Record<string,string>={...concordanceBlockers, CONTROL_REQUIRED:'Contrôle à enregistrer.', DOCUMENT_NOT_CLOSED:'Document encore ouvert.',
    NO_APPLICABLE_RULE:'Aucune règle de conservation applicable.', RULES_AMBIGUOUS:'Plusieurs règles concurrentes : arbitrage nécessaire.',
    BASE_DATE_MISSING:'Date de départ manquante.', BASE_DATE_FUTURE:'Date de départ future.', EVENT_NOT_DECLARED:'Événement déclencheur à déclarer.',
    DOSSIER_REQUIRED:'Dossier de rattachement requis.', DOSSIER_NOT_CLOSED:'Dossier encore ouvert.',
    DISPOSITION_VALIDATION_REQUIRED:'Décision de conservation à proposer et à valider.', ARCHIVAL_CONCORDANCE_REQUIRED:'Concordance papier/numérique obligatoire.'};

function Agents({api,elementId,step}:{api:ArchivalReadinessApi;elementId:string;step:ArchivalStep}) {
    const [page,setPage]=useState(0);
    const q=useResource(s=>api.agents(elementId,step.code,page,s),`archival-agents:${elementId}:${step.code}:${page}`);
    return <div aria-label={'Agents pour '+step.label}>
        {q.loading?<Busy/>:q.error?<ErrorNotice error={q.error} onRetry={q.refresh}/>:<>
            {q.data?.items.length?<ul>{q.data.items.map(a=><li key={a.id}>{a.name}</li>)}</ul>:<p>Aucun agent visible ne dispose actuellement de toutes les habilitations requises pour cette étape.</p>}
            <div className="table-actions"><button className="btn small secondary" disabled={!page} onClick={()=>setPage(p=>p-1)}>Agents précédents</button><span>Page {page+1}</span><button className="btn small secondary" disabled={!q.data?.hasMore} onClick={()=>setPage(p=>p+1)}>Agents suivants</button></div>
        </>}
        <small>Habilitations vérifiées dans l’institution du document. Les comptes expirés sont exclus. Les conditions métier seront revérifiées lors de l’action.</small>
        {['VALIDATE','ARCHIVE'].includes(step.code)&&<p>Le proposant est exclu de la validation ; le proposant et le validateur sont exclus de l’exécution. La liste évolue après chaque décision.</p>}
    </div>;
}

export function ArchivalWorkflowPanel({elementId}:{elementId:string}) {
    const {digitization,epoch}=useSession();
    const api=useMemo(()=>new ArchivalReadinessApi(digitization!.transport),[digitization]);
    const q=useResource(s=>api.state(elementId,s),'archival-readiness:'+elementId+':'+epoch);
    const [agents,setAgents]=useState<string|null>(null),[control,setControl]=useState(false);
    if(q.loading&&!q.data) return <Busy label="Chargement du parcours d’archivage…"/>;
    if(q.error) return <ErrorNotice error={q.error} onRetry={q.refresh}/>;
    if(!q.data) return null;
    const d=q.data;
    return <section className="panel" aria-label="Parcours d’archivage">
        <div className="section-heading"><h3>Du traitement à l’archivage définitif</h3><button className="btn small secondary" onClick={q.refresh}>Actualiser le parcours</button></div>
        <p><strong>{d.title}</strong></p>
        <Notice tone={d.archived?'info':'warning'}>{d.archived?'Document archivé définitivement.':'Archivage définitif non terminé. Le versement reçu et le traitement terminé restent acquis ; les contrôles ci-dessous complètent ce parcours.'}</Notice>
        {d.physicalLinks.map(a=><div key={a.id} className="panel"><strong>Cote papier : {a.cote}</strong><p>{a.path.join(' › ')}</p><button className="btn small secondary" onClick={()=>navigate('/app/archives-physiques?archive='+a.id)}>Retrouver l’original physique</button></div>)}
        <ol aria-label="Étapes de l’archivage" style={{paddingLeft:24}}>{d.steps.map(step=><li key={step.code} style={{padding:'12px 0',borderBottom:'1px solid var(--border, #d6dee5)'}}>
            <strong>{step.label}</strong> — <span>{labels[step.status]}</span>
            <p>{step.detail}</p>
            {step.blockers.length>0&&<ul>{step.blockers.map(b=><li key={b}>{blockers[b]??b}</li>)}</ul>}
            {step.status!=='DONE'&&<><small>Permissions : {step.permissions.join(', ')}</small><div className="table-actions">
                {d.agentsVisible?<button className="btn small secondary" aria-expanded={agents===step.code} onClick={()=>setAgents(agents===step.code?null:step.code)}>Agents habilités — {step.label}</button>:<small>La consultation des agents nécessite l’accès à l’annuaire de cette institution.</small>}
                {step.code==='CONCORDANCE'&&<button className="btn small primary" aria-expanded={control} onClick={()=>setControl(v=>!v)}>{control?'Masquer le contrôle':'Effectuer le contrôle papier/numérique'}</button>}
                {step.code==='CLOSE'&&<button className="btn small secondary" onClick={()=>navigate('/app/documents/'+d.documentId)}>Ouvrir la notice</button>}
                {['SCHEDULE','PROPOSE','VALIDATE','ARCHIVE'].includes(step.code)&&<button className="btn small secondary" onClick={()=>navigate('/app/sort-final')}>Ouvrir {step.code==='SCHEDULE'?'la conservation':'le sort final'}</button>}
            </div></>}
            {agents===step.code&&<Agents key={step.code} api={api} elementId={elementId} step={step}/>}
        </li>)}</ol>
        <p className="page-note">Le constat physique doit être effectué sur place. L’OCR ne remplace pas la comparaison avec l’original. Toute modification de la cote, du rangement ou du document peut imposer un nouveau contrôle.</p>
        {control&&<ArchivalConcordancePanel documentId={d.documentId} onChanged={q.refresh}/>}
    </section>;
}

export function LotArchivalDialog({lot,onClose}:{lot:ScanLot;onClose:()=>void}) {
    const {digitization,epoch}=useSession();
    const api=useMemo(()=>new ArchivalReadinessApi(digitization!.transport),[digitization]);
    const [page,setPage]=useState(0),[selected,setSelected]=useState('');
    const q=useResource(s=>api.lot(lot.id,page,s),`lot-archival:${lot.id}:${page}:${epoch}`);
    const current=q.data?.items.find(e=>e.elementId===selected)??q.data?.items[0];
    return <Modal title={'Archivage du lot '+lot.code} onClose={onClose} wide>
        {q.loading?<Busy/>:q.error?<ErrorNotice error={q.error} onRetry={q.refresh}/>:<>
            {q.data?.items.length?<><label>Document du lot<select aria-label="Document du lot" value={current?.elementId??''} onChange={e=>setSelected(e.target.value)}>{q.data.items.map(e=><option key={e.elementId} value={e.elementId}>{e.title}</option>)}</select></label>
                {current&&<ArchivalWorkflowPanel key={current.elementId} elementId={current.elementId}/>}</>:<p>Aucun document lié accessible sur cette page.</p>}
            <div className="table-actions"><button className="btn secondary" disabled={!page} onClick={()=>setPage(p=>p-1)}>Documents précédents</button><span>Page {page+1}</span><button className="btn secondary" disabled={!q.data?.hasMore} onClick={()=>setPage(p=>p+1)}>Documents suivants</button></div>
        </>}
    </Modal>;
}
