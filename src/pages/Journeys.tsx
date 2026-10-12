import React, { useMemo, useState } from 'react';
import { journeys } from '../design/journeys';
import { moduleVisible } from '../design/navigation';
import { useSession } from '../auth/session';
import { useWorkspace } from '../ui/workspace';
import { navigate, usePath } from '../ui/navigation';
import { Icon } from '../ui/icons';
import { PageHead } from '../ui/components';
export function JourneysPage() {
  const {me,demo}=useSession(); const {scope}=useWorkspace(); const path=usePath();
  const requested=new URL(path,location.origin).searchParams.get('p');
  const [selected,setSelected]=useState(journeys.some(j=>j.id===requested)?requested!:'P12'); const [group,setGroup]=useState('Tous'); const [query,setQuery]=useState('');
  const groups=['Tous',...new Set(journeys.map(j=>j.group))];
  const filtered=useMemo(()=>journeys.filter(j=>(group==='Tous'||j.group===group)&&`${j.id} ${j.title} ${j.role}`.toLocaleLowerCase('fr').includes(query.toLocaleLowerCase('fr'))),[group,query]);
  const item=journeys.find(j=>j.id===selected)!;
  const label={existant:'Contrat présent',partiel:'Parcours à compléter',cible:'Évolution à développer'};
  return <><PageHead eyebrow="GUIDE OPÉRATIONNEL" title="Parcours utilisateurs" description="Les actions métier, leurs issues et les limites du contrat actuel."/>
    <div className="f3-atlas"><aside className="f3-atlas-index"><label className="field"><span>Rechercher un parcours</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Déposer, valider, consulter…"/></label><label className="field"><span>Domaine</span><select value={group} onChange={e=>setGroup(e.target.value)}>{groups.map(g=><option key={g}>{g}</option>)}</select></label><p className="f3-caption">{filtered.length} parcours de référence</p><nav aria-label="Parcours disponibles">{filtered.map(j=><button key={j.id} aria-current={j.id===selected?'page':undefined} className={j.id===selected?'selected':''} onClick={()=>{setSelected(j.id);document.getElementById('journey-heading')?.focus();}}><span>{j.id}</span><strong>{j.title}</strong></button>)}</nav></aside>
    <section className="f3-atlas-body"><div className="f3-status-line"><span className={'f3-contract '+item.support}>{label[item.support]}</span><span>{item.group} · {item.id}</span></div><h2 id="journey-heading" tabIndex={-1}>{item.title}</h2><p className="f3-role"><Icon name="users" size={18}/>{item.role}</p><ol className="f3-journey-steps">{item.steps.map((step,i)=><li key={step}><span>{String(i+1).padStart(2,'0')}</span><div><strong>{step}</strong></div></li>)}</ol>
    <section className="f3-result"><Icon name="check"/><div><h3>Résultat attendu</h3><p>{item.result}</p></div></section><details className="f3-exceptions" open><summary>Erreurs, refus et reprises</summary><ul>{item.exceptions.map(x=><li key={x}>{x}</li>)}</ul></details><details className="f3-contract-details"><summary>Correspondance avec le backend</summary><p>{item.source}</p>{item.api.map(a=><code key={a}>{a}</code>)}{!item.api.length&&<p>Pas de contrat complet exposé pour cette expérience. Les routes futures ne sont pas inventées ici.</p>}</details><footer className="f3-atlas-actions">{item.route!=='parcours'&&moduleVisible(me,item.route,scope,demo)&&<button className="btn primary" onClick={()=>navigate('/app/'+item.route)}>Ouvrir l’écran <Icon name="arrow" size={17}/></button>}<span>Guide de conception · aucun acte métier exécuté ici</span></footer></section></div></>;
}
