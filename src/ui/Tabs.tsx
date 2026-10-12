import React, {useId} from 'react';
/** Each panel is mounted only when selected. Keyboard follows the WAI-ARIA tab pattern. */
export function Tabs({items,value,onChange,label}:{items:{id:string;label:string}[];value:string;onChange:(id:string)=>void;label:string}){
 const uid=useId().replace(/:/g,'');
 const active=items.some(x=>x.id===value)?value:items[0]?.id;
 return <div role="tablist" aria-label={label} className="f3-tabs">{items.map((item,index)=><button key={item.id} type="button" role="tab" id={`${uid}-${item.id}`} aria-controls="f3-active-tab-panel" aria-selected={active===item.id} tabIndex={active===item.id?0:-1} onClick={()=>onChange(item.id)} onKeyDown={e=>{let next:number|undefined;if(e.key==='ArrowRight')next=(index+1)%items.length;if(e.key==='ArrowLeft')next=(index-1+items.length)%items.length;if(e.key==='Home')next=0;if(e.key==='End')next=items.length-1;if(next!==undefined){e.preventDefault();const target=items[next];if(target){onChange(target.id);document.getElementById(`${uid}-${target.id}`)?.focus();}}}}>{item.label}</button>)}</div>;
}
