import React from 'react';
import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';
import {FunctionLinks} from '../../src/ui/FunctionLinks';
import {ArchivesApi,type AuthorityView,type DescriptionView} from '../../src/api/archives';
import {emptyFunction,type FunctionView,type FunctionLinkView,type FunctionDetailView,type FunctionLinkSnapshot} from '../../src/core/archivalFunctions';
const I='11111111-1111-4111-8111-111111111111',F='22222222-2222-4222-8222-222222222222',A='33333333-3333-4333-8333-333333333333',D='44444444-4444-4444-8444-444444444444',L='55555555-5555-4555-8555-555555555555';
const fn:FunctionView={id:F,input:{...emptyFunction(I),code:'RH',name:'Ressources humaines'},version:1,createdAt:'',updatedAt:''};
const authority={id:A,input:{institutionId:I,code:'MIN',name:'Ministère',kind:'COLLECTIVITE',actorId:null,details:{}},version:0,updatedAt:''} as AuthorityView;
const description={id:D,input:{institutionId:I,code:'FONDS',title:'Fonds du ministère',level:'FONDS',parentId:null,producerId:null,confidentiality:'INTERNE',documentId:null,dossierId:null,details:{}},version:0,updatedAt:''} as DescriptionView;
const link:FunctionLinkView={id:L,input:{institutionId:I,functionId:F,targetId:A,targetKind:'AUTHORITY',nature:'EXERCEE_PAR',dateStart:'2000',dateEnd:'2010',description:'Commentaire original'},version:4,updatedAt:''};
const detail:FunctionDetailView={function:fn,ancestors:[],children:[],links:[link]};
const snapshot={...link.input,targetLabel:'Ministère',version:4,descriptionTruncated:false,descriptionLength:20,hash:'hash',origin:'DIRECT'} as FunctionLinkSnapshot;
const api={addFunctionLink:vi.fn(),updateFunctionLink:vi.fn(),removeFunctionLink:vi.fn(),functionLinkHistory:vi.fn()};
const changed=vi.fn(),reload=vi.fn(),busyChanged=vi.fn();
const props={api:api as unknown as ArchivesApi,institution:I,functionId:F,detail,all:[fn],authorities:[authority],descriptions:[description],readOnly:false,onChanged:changed,onReload:reload,onBusyChange:busyChanged};
beforeEach(()=>{for(const f of Object.values(api))f.mockReset();changed.mockReset();reload.mockReset();busyChanged.mockReset();api.updateFunctionLink.mockResolvedValue(link);api.addFunctionLink.mockResolvedValue(link);api.removeFunctionLink.mockResolvedValue({id:L});api.functionLinkHistory.mockResolvedValue({items:[],page:0,size:20,hasMore:false});});
const show=()=>render(<FunctionLinks {...props}/>);
async function edit(){fireEvent.click(await screen.findByRole('button',{name:'Modifier le lien',exact:true}));return screen.getByRole('form',{name:'Modifier le lien',exact:true});}
function review(form:HTMLElement){fireEvent.click(within(form).getByRole('button',{name:'Vérifier les modifications'}));return screen.getByRole('region',{name:'Aperçu des modifications du lien'});}
it('affiche le commentaire existant et garde les opérations en lecture seule',async()=>{
 render(<FunctionLinks {...props} readOnly/>);expect(screen.getByText('Commentaire original')).toBeTruthy();
 expect(screen.queryByRole('button',{name:'Modifier le lien'})).toBeNull();expect(screen.queryByRole('button',{name:'Retirer',exact:true})).toBeNull();
 expect(screen.queryByRole('form')).toBeNull();expect(api.functionLinkHistory).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Historique des liens'}));await screen.findByText('Aucune opération accessible sur cette page.');
 expect(api.functionLinkHistory).toHaveBeenCalledWith(F,0,20,expect.any(AbortSignal));
});
it('préremplit le lien et permet d’annuler les différences sans écriture',async()=>{
 show();const form=await edit();
 expect((within(form).getByLabelText(/^Depuis/) as HTMLInputElement).value).toBe('2000');
 fireEvent.change(within(form).getByLabelText('Commentaire du lien'),{target:{value:'Commentaire proposé'}});
 const preview=review(form);expect(within(preview).getByText('Commentaire original')).toBeTruthy();expect(within(preview).getByText('Commentaire proposé')).toBeTruthy();
 expect(api.updateFunctionLink).not.toHaveBeenCalled();
 fireEvent.click(within(preview).getByRole('button',{name:'Revenir à la saisie'}));
 fireEvent.click(screen.getByRole('button',{name:'Annuler la modification'}));
 expect(api.updateFunctionLink).not.toHaveBeenCalled();expect(screen.getByText('Commentaire original')).toBeTruthy();
});
it('efface explicitement les dates et le commentaire après confirmation en conservant le lien et sa version',async()=>{
 show();const form=await edit();
 for(const field of ['Depuis','Jusqu’à','Commentaire du lien'])fireEvent.change(within(form).getByLabelText(new RegExp('^'+field)),{target:{value:''}});
 const preview=review(form),confirm=within(preview).getByRole('button',{name:'Confirmer la modification du lien'});
 expect(within(preview).getAllByText('Effacé')).toHaveLength(3);expect((confirm as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(within(preview).getByRole('checkbox',{name:'Je confirme l’effacement des valeurs indiquées.'}));fireEvent.click(confirm);
 await screen.findByText('Lien modifié.');
 expect(api.updateFunctionLink).toHaveBeenCalledWith(L,expect.objectContaining({version:4,functionId:F,dateStart:null,dateEnd:null,description:null}),expect.any(String),expect.any(AbortSignal));
 expect(changed).toHaveBeenCalledTimes(1);expect(busyChanged.mock.calls).toEqual([[true],[false]]);
});
it('change le type, la cible, la nature et le commentaire en une seule mise à jour',async()=>{
 show();const form=await edit();
 fireEvent.change(within(form).getByLabelText('Relier à'),{target:{value:'DESCRIPTION'}});
 expect((within(form).getByLabelText('Nature du lien') as HTMLSelectElement).value).toBe('DOCUMENTEE_PAR');
 fireEvent.change(within(form).getByLabelText('Cible'),{target:{value:D}});
 fireEvent.change(within(form).getByLabelText('Commentaire du lien'),{target:{value:'  Motif de rattachement  '}});
 fireEvent.click(within(review(form)).getByRole('button',{name:'Confirmer la modification du lien'}));await screen.findByText('Lien modifié.');
 expect(api.updateFunctionLink.mock.calls[0]?.[1]).toMatchObject({targetKind:'DESCRIPTION',targetId:D,nature:'DOCUMENTEE_PAR',description:'Motif de rattachement',version:4});
 expect(api.removeFunctionLink).not.toHaveBeenCalled();expect(api.addFunctionLink).not.toHaveBeenCalled();
});
it('bloque une période inversée et une modification sans différence',async()=>{
 show();const form=await edit();
 expect((within(form).getByRole('button',{name:'Vérifier les modifications'}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.change(within(form).getByLabelText(/^Depuis/),{target:{value:'2030'}});
 fireEvent.click(within(form).getByRole('button',{name:'Vérifier les modifications'}));
 expect(screen.getByText('La date de début dépasse la date de fin.')).toBeTruthy();expect(screen.queryByRole('region',{name:'Aperçu des modifications du lien'})).toBeNull();
 expect(api.updateFunctionLink).not.toHaveBeenCalled();
});
it('garde la même intention après une erreur réseau et ne masque pas le conflit',async()=>{
 api.updateFunctionLink.mockRejectedValueOnce(new Error('Connexion interrompue')).mockRejectedValueOnce(new Error('Le lien a été modifié.'));
 show();const form=await edit();fireEvent.change(within(form).getByLabelText('Commentaire du lien'),{target:{value:'Révision'}});
 const preview=review(form);fireEvent.click(within(preview).getByRole('button',{name:'Confirmer la modification du lien'}));await screen.findByText('Connexion interrompue');
 fireEvent.click(within(preview).getByRole('button',{name:'Confirmer la modification du lien'}));await screen.findByText('Le lien a été modifié.');
 expect(api.updateFunctionLink.mock.calls[0]?.[2]).toBe(api.updateFunctionLink.mock.calls[1]?.[2]);expect(changed).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Actualiser les liens'}));expect(reload).toHaveBeenCalledTimes(1);
});
it('demande confirmation pour le retrait et réutilise la clé en cas de nouvelle tentative',async()=>{
 api.removeFunctionLink.mockRejectedValueOnce(new Error('Connexion interrompue')).mockResolvedValue({id:L});
 show();fireEvent.click(screen.getByRole('button',{name:'Retirer',exact:true}));expect(api.removeFunctionLink).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Annuler le retrait'}));expect(api.removeFunctionLink).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Retirer',exact:true}));fireEvent.click(screen.getByRole('button',{name:'Confirmer le retrait'}));await screen.findByText('Connexion interrompue');
 fireEvent.click(screen.getByRole('button',{name:'Confirmer le retrait'}));await screen.findByText('Lien retiré.');
 expect(api.removeFunctionLink).toHaveBeenCalledWith(L,I,4,expect.any(String),expect.any(AbortSignal));expect(api.removeFunctionLink.mock.calls[0]?.[3]).toBe(api.removeFunctionLink.mock.calls[1]?.[3]);
});
it('saisit un commentaire lors de l’ajout',async()=>{
 show();const form=screen.getByRole('form',{name:'Ajouter un lien'});fireEvent.change(within(form).getByLabelText('Cible'),{target:{value:A}});
 fireEvent.change(within(form).getByLabelText('Commentaire du lien'),{target:{value:'Lien documenté'}});
 fireEvent.click(within(form).getByRole('button',{name:'Ajouter le lien'}));await screen.findByText('Lien ajouté.');
 expect(api.addFunctionLink.mock.calls[0]?.[0]).toMatchObject({description:'Lien documenté',targetId:A});
});
it('affiche les valeurs historiques après retrait et les imports CSV sur plusieurs pages',async()=>{
 const removed={id:'e1',linkId:L,action:'ARCHIVAL_FUNCTION_LINK_DELETED',occurredAt:'2026-10-26T13:00:00Z',performedBy:'Agent de recette',before:snapshot,after:{...snapshot,removed:true}};
 const imported={...removed,id:'e2',action:'ARCHIVAL_FUNCTION_LINK_SAVED',before:null,after:{...snapshot,origin:'CSV_IMPORT',descriptionTruncated:true}};
 api.functionLinkHistory.mockResolvedValueOnce({items:[removed],page:0,size:20,hasMore:true}).mockResolvedValueOnce({items:[imported],page:1,size:20,hasMore:false});
 render(<FunctionLinks {...props} detail={{...detail,links:[]}} readOnly/>);fireEvent.click(screen.getByRole('button',{name:'Historique des liens'}));
 fireEvent.click(await screen.findByText(/Lien retiré ·/));expect(screen.getByText('Commentaire original')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Événements suivants'}));await screen.findByText(/Import CSV/);
 expect(api.functionLinkHistory).toHaveBeenLastCalledWith(F,1,20,expect.any(AbortSignal));
 fireEvent.click(screen.getByText(/Lien ajouté ·/));expect(screen.getByText(/Commentaire long/)).toBeTruthy();
});
it('affiche une erreur de lecture sans laisser les liens périmés modifiables',()=>{
 render(<FunctionLinks {...props} loadError={new Error('Accès retiré')}/>);
 expect(screen.getByText('Accès retiré')).toBeTruthy();expect(screen.queryByText('Commentaire original')).toBeNull();
 expect((screen.getByRole('button',{name:'Ajouter le lien',exact:true}) as HTMLButtonElement).disabled).toBe(true);
});
it('annule la lecture de l’historique quand la fonction change',async()=>{
 let resolve:(v:unknown)=>void=()=>{};
 api.functionLinkHistory.mockImplementationOnce(()=>new Promise(yes=>{resolve=yes;})).mockResolvedValue({items:[],page:0,size:20,hasMore:false});
 const view=render(<FunctionLinks key={F} {...props}/>);fireEvent.click(screen.getByRole('button',{name:'Historique des liens'}));
 await waitFor(()=>expect(api.functionLinkHistory).toHaveBeenCalled());const signal=api.functionLinkHistory.mock.calls[0]?.[3] as AbortSignal;
 view.rerender(<FunctionLinks key={D} {...props} functionId={D}/>);expect(signal.aborted).toBe(true);
 await act(async()=>resolve({items:[{id:'old',before:snapshot}],page:0,size:20,hasMore:false}));
 expect(screen.queryByText(/Lien ajouté ·/)).toBeNull();
});
it('utilise PUT avec version et un GET paginé pour l’historique',async()=>{
 const request=vi.fn().mockResolvedValue({}),client=new ArchivesApi({request}),controller=new AbortController();
 await client.updateFunctionLink(L,{...link.input,version:4},'intention',controller.signal);await client.functionLinkHistory(F,1,20,controller.signal);
 expect(request).toHaveBeenNthCalledWith(1,'/archives/functions/links/'+L,{method:'PUT',body:{...link.input,version:4},idempotencyKey:'intention',signal:controller.signal});
 expect(request).toHaveBeenNthCalledWith(2,'/archives/functions/'+F+'/links/history?page=1&size=20',{signal:controller.signal});
});

