import React from 'react';
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {ArchivesApi,type ArchiveBrowsePage,type DescriptionView,type ArchiveBrowseItem} from '../../src/api/archives';
import {ArchiveBrowse} from '../../src/ui/ArchiveBrowse';
const I='11111111-1111-4111-8111-111111111111',J='22222222-2222-4222-8222-222222222222';
const row=(code:string):DescriptionView=>({id:code,input:{institutionId:I,code,title:'Notice '+code,level:'FONDS',parentId:null,producerId:null,confidentiality:'INTERNE',documentId:null,dossierId:null,details:{}},version:0,updatedAt:''});
const item=(code:string,children=false):ArchiveBrowseItem<DescriptionView>=>({row:row(code),hasChildren:children,ancestors:[],producerKnown:false,relationCount:0});
const page=(items:ArchiveBrowseItem<DescriptionView>[],extra:Partial<ArchiveBrowsePage<DescriptionView>>={})=>({items,page:0,size:20,total:items.length,hasMore:false,searching:false,...extra});
const show=(api:ArchivesApi,institution=I)=> <ArchiveBrowse<DescriptionView> api={api} institution={institution} kind="descriptions" columns={2} headers={<th>Niveau</th>} renderCells={({row})=><td>{row.input.level}</td>}/>;
it('charge une branche sur demande, pagine ses enfants en conservant le parent et les replie',async()=>{
 const browse=vi.fn(async(_k,_i,p)=>p.parentId?page([item(p.page?'ENFANT-21':'ENFANT-01')],{page:p.page,total:21,hasMore:p.page===0}):page([item('FONDS',true)]));
 render(show({browse} as unknown as ArchivesApi));
 await screen.findByText('Notice FONDS');expect(browse).toHaveBeenCalledTimes(1);
 fireEvent.click(screen.getByRole('button',{name:'Déplier FONDS'}));
 await screen.findByText('Notice ENFANT-01');
 fireEvent.click(screen.getByRole('button',{name:'Page suivante pour les enfants de FONDS · Notice FONDS'}));
 await screen.findByText('Notice ENFANT-21');expect(screen.getByText('Notice FONDS')).toBeTruthy();expect(screen.queryByText('Notice ENFANT-01')).toBeNull();
 expect(browse).toHaveBeenLastCalledWith('descriptions',I,expect.objectContaining({parentId:'FONDS',page:1,size:20}),expect.any(AbortSignal));
 fireEvent.click(screen.getByRole('button',{name:'Replier toutes les branches'}));
 await screen.findByRole('button',{name:'Déplier FONDS'});expect(screen.queryByText('Notice ENFANT-21')).toBeNull();
});
it('recherche au-delà de la page courante et conserve le chemin du résultat',async()=>{
 const target={...item('PIECE'),ancestors:[{id:'f',code:'F',name:'Fonds',kind:'FONDS'},{id:'s',code:'S',name:'Série',kind:'SERIE'}]};
 const browse=vi.fn(async(_k,_i,p)=>p.q?page([target],{searching:true}):page([item(p.page?'SECOND':'PREMIER')],{page:p.page,total:21,hasMore:p.page===0}));
 render(show({browse} as unknown as ArchivesApi)); await screen.findByText('Notice PREMIER');
 fireEvent.click(screen.getByRole('button',{name:'Page suivante pour fonds et descriptions'}));await screen.findByText('Notice SECOND');
 fireEvent.change(screen.getByRole('searchbox'),{target:{value:'piece'}});
 await screen.findByText('Notice PIECE');
 expect(browse).toHaveBeenLastCalledWith('descriptions',I,expect.objectContaining({q:'piece',page:0}),expect.any(AbortSignal));
 expect(screen.getByLabelText('Chemin de la notice').textContent).toBe('F · Fonds › S · Série');
 expect(screen.queryByRole('button',{name:/Déplier/})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Effacer les filtres'}));await screen.findByText('Notice PREMIER');
});
it('combine niveau et état puis réinitialise la pagination',async()=>{
 const browse=vi.fn(async(_k,_i,p)=>page([item('RESULTAT')],{page:p.page,total:21,hasMore:p.page===0,searching:!!p.level}));
 render(show({browse} as unknown as ArchivesApi));await screen.findByText('Notice RESULTAT');
 fireEvent.click(screen.getByRole('button',{name:'Page suivante pour fonds et descriptions'}));await waitFor(()=>expect(browse.mock.lastCall?.[2].page).toBe(1));
 fireEvent.change(screen.getByLabelText('Niveau de description'),{target:{value:'SERIE'}});
 fireEvent.change(screen.getByLabelText('État de rédaction'),{target:{value:'A_RELIRE'}});
 await waitFor(()=>expect(browse).toHaveBeenLastCalledWith('descriptions',I,expect.objectContaining({page:0,level:'SERIE',status:'A_RELIRE'}),expect.any(AbortSignal)));
});
it('cherche et sélectionne un producteur sur une autre page',async()=>{
 const browse=vi.fn(async(kind,_i,p)=>kind==='authorities'?{items:[{row:{id:p.page?'p21':'p1',input:{code:p.page?'P21':'P1',name:'Producteur'}}}],page:p.page,total:21,hasMore:p.page===0}:page([item('FONDS')],{searching:!!p.producerId}));
 render(show({browse} as unknown as ArchivesApi));await screen.findByText('Notice FONDS');
 fireEvent.click(screen.getByRole('button',{name:'Filtrer par producteur'}));await screen.findByRole('button',{name:'P1 · Producteur'});
 fireEvent.click(screen.getByRole('button',{name:'Producteurs suivants'}));fireEvent.click(await screen.findByRole('button',{name:'P21 · Producteur'}));
 await waitFor(()=>expect(browse).toHaveBeenLastCalledWith('descriptions',I,expect.objectContaining({producerId:'p21',page:0}),expect.any(AbortSignal)));
 expect(screen.getByText(/rattachements hérités/)).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Retirer le filtre producteur'}));
 await waitFor(()=>expect(browse.mock.lastCall?.[2].producerId).toBeUndefined());
});
it('annule la lecture précédente et efface les filtres au changement de périmètre',async()=>{
 let resolveOld:(v:ArchiveBrowsePage<DescriptionView>)=>void=()=>{};
 const browse=vi.fn((_k,i,p)=>i===I&&p.q?new Promise<ArchiveBrowsePage<DescriptionView>>(resolve=>{resolveOld=resolve;}):Promise.resolve(page([item(i===I?'ANCIEN':'NOUVEAU')])));
 const api={browse} as unknown as ArchivesApi;const view=render(show(api));await screen.findByText('Notice ANCIEN');
 fireEvent.change(screen.getByRole('searchbox'),{target:{value:'ancien'}});await waitFor(()=>expect(browse.mock.lastCall?.[2].q).toBe('ancien'));
 const signal=browse.mock.lastCall?.[3] as AbortSignal|undefined;
 view.rerender(show(api,J));await screen.findByText('Notice NOUVEAU');
 expect(signal?.aborted).toBe(true);expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('');
 await act(async()=>resolveOld(page([item('RETARD')])));expect(screen.queryByText('Notice RETARD')).toBeNull();
});
it('permet de réessayer une erreur puis affiche un résultat vide',async()=>{
 const browse=vi.fn().mockRejectedValueOnce(new Error('Lecture interrompue')).mockResolvedValue(page([]));
 render(show({browse} as unknown as ArchivesApi));await screen.findByText('Lecture interrompue');
 fireEvent.click(screen.getByRole('button',{name:/Réessayer/}));
 expect(await screen.findByText('Aucune notice trouvée')).toBeTruthy();
 expect((screen.getByRole('button',{name:'Page suivante pour fonds et descriptions'}) as HTMLButtonElement).disabled).toBe(true);
});
it('encode les recherches littérales et transmet le signal à la nouvelle route',async()=>{
 const request=vi.fn().mockResolvedValue(page([])),api=new ArchivesApi({request}),abort=new AbortController();
 await api.browse('descriptions',I,{q:'A&B 100%_',level:'SERIE',page:1,size:20},abort.signal);
 const [path,options]=request.mock.calls[0]!;
 expect(path.startsWith('/archives/browse/descriptions?')).toBe(true);
 const p=new URLSearchParams(path.split('?')[1]);expect(p.get('q')).toBe('A&B 100%_');expect(p.get('institutionId')).toBe(I);expect(p.get('page')).toBe('1');expect(options.signal).toBe(abort.signal);
});

