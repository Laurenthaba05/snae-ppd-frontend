import React from 'react';
import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import { beforeEach,expect,it,vi } from 'vitest';
const fixture=vi.hoisted(()=>({epoch:1,me:null,api:{list:vi.fn(),get:vi.fn(),permissions:vi.fn(),allPermissionAttributions:vi.fn()},records:{documents:vi.fn(),dossiers:vi.fn()},
    scope:{institutionId:'i1',departmentId:null as string|null}}));
vi.mock('../../src/auth/session',()=>({useSession:()=>fixture}));
vi.mock('../../src/ui/workspace',()=>({useWorkspace:()=>({scope:fixture.scope})}));
vi.mock('../../src/core/policy',()=>({can:()=>false,platform:()=>false}));
vi.mock('../../src/ui/names',()=>({EntityName:()=>null,DocumentName:()=>null,useEntityName:()=>({name:'Sélection existante',loading:false}),
    entityLabel:(_kind:string,x:{prenom?:string;nom?:string})=>[x.prenom,x.nom].filter(Boolean).join(' ')}));
import {ReferencePicker} from '../../src/ui/ReferencePicker';
import {RecordCatalogPage} from '../../src/pages/Records';
import {PermissionsPage} from '../../src/pages/Permissions';
const page=(items:unknown[],hasMore=false,p=0)=>({items,page:p,size:20,hasMore});
beforeEach(()=>{
    fixture.epoch++;fixture.scope={institutionId:'i1',departmentId:null};vi.clearAllMocks();
    fixture.api.list.mockResolvedValue(page([{id:'i1',nom:'Première institution',code:'AA'}]));
    fixture.api.permissions.mockResolvedValue(page([{id:'p1',code:'READ',domain:'DOCUMENT',description:'Lire'}]));
    fixture.api.allPermissionAttributions.mockResolvedValue([{id:'p1',code:'READ',domain:'DOCUMENT',description:'Lire',roles:[]}]);
    fixture.records.documents.mockResolvedValue(page([{id:'d1',title:'Première notice',reference:'D-1',institutionId:'i1',archivalStatus:'BROUILLON',confidentiality:'INTERNE'}]));
    fixture.records.dossiers.mockImplementation(fixture.records.documents);
});
it('le sélecteur recherche le code au-delà de la page, conserve la sélection nommée et exclut la cible côté serveur',async()=>{
    const chosen=vi.fn();
    fixture.api.list.mockImplementation(async(_kind:string,params:{q?:string,page:number})=>page(params.q?[{id:'i31',nom:'Institution éloignée',code:'CODE-31'}]:[{id:'i1',nom:'Première institution',code:'AA'}],!params.q,params.page));
    render(<ReferencePicker kind="institutions" label="Institution" value="" onChange={chosen} excludeId="excluded"/>);
    expect(fixture.api.list).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Institution',exact:true}));
    await screen.findByText('Première institution');fireEvent.click(screen.getByRole('button',{name:'Suivante'}));
    await waitFor(()=>expect(fixture.api.list).toHaveBeenLastCalledWith('institutions',expect.objectContaining({page:1}),expect.anything()));
    await screen.findByText('Première institution');
    fireEvent.change(screen.getByLabelText('Filtrer Institution'),{target:{value:'CODE-31'}});
    await screen.findByText('Institution éloignée');
    expect(fixture.api.list).toHaveBeenLastCalledWith('institutions',expect.objectContaining({page:0,q:'CODE-31',excludeId:'excluded'}),expect.anything());
    fireEvent.click(screen.getByRole('button',{name:/Institution éloignée/}));expect(chosen).toHaveBeenCalledWith('i31');
});
it('le prénom et le contact sont recherchés et le prénom est affiché dans le sélecteur utilisateur',async()=>{
    fixture.api.list.mockResolvedValue(page([{id:'u1',prenom:'Aïssatou',nom:'Diallo',email:'cible@example.test'}]));
    render(<ReferencePicker kind="users" label="Utilisateur" value="" onChange={()=>{}}/>);
    fireEvent.click(screen.getByRole('button',{name:'Utilisateur',exact:true}));await screen.findByText('Aïssatou Diallo');
    fireEvent.change(screen.getByLabelText('Filtrer Utilisateur'),{target:{value:'cible@example.test'}});
    await waitFor(()=>expect(fixture.api.list).toHaveBeenLastCalledWith('users',expect.objectContaining({q:'cible@example.test'}),expect.anything()));
    expect(await screen.findByText('cible@example.test')).toBeTruthy();
});
it('un changement de périmètre ferme le sélecteur et efface les anciens résultats',async()=>{
    const v=render(<ReferencePicker kind="departments" label="Département" value="" scope={{institutionId:'i1'}} onChange={()=>{}}/>);
    fireEvent.click(screen.getByRole('button',{name:'Département',exact:true}));await screen.findByText('Première institution');
    v.rerender(<ReferencePicker kind="departments" label="Département" value="" scope={{institutionId:'i2'}} onChange={()=>{}}/>);
    expect(screen.queryByText('Première institution')).toBeNull();expect(screen.queryByLabelText('Filtrer Département')).toBeNull();
});
it('un ancien résultat en retard ne remplace pas une recherche plus récente',async()=>{
    let complete:(value:unknown)=>void=()=>{};
    fixture.api.list.mockImplementation((_kind:string,p:{q?:string})=>p.q==='ancien'?new Promise(resolve=>{complete=resolve;}):Promise.resolve(page(p.q?[{id:'new',nom:'Nouveau résultat'}]:[])));
    render(<ReferencePicker kind="institutions" label="Institution" value="" onChange={()=>{}}/>);
    fireEvent.click(screen.getByRole('button',{name:'Institution',exact:true}));await screen.findByText('Aucun résultat');
    fireEvent.change(screen.getByLabelText('Filtrer Institution'),{target:{value:'ancien'}});
    fireEvent.change(screen.getByLabelText('Filtrer Institution'),{target:{value:'nouveau'}});
    await screen.findByText('Nouveau résultat');complete(page([{id:'old',nom:'Ancien résultat'}]));
    await waitFor(()=>expect(screen.queryByText('Ancien résultat')).toBeNull());
});
it('une erreur du sélecteur peut être relue et un résultat vide est explicite',async()=>{
    fixture.api.list.mockRejectedValueOnce(new Error('Catalogue indisponible')).mockResolvedValueOnce(page([]));
    render(<ReferencePicker kind="roles" label="Rôle" value="" onChange={()=>{}}/>);
    fireEvent.click(screen.getByRole('button',{name:'Rôle',exact:true}));await screen.findByText('Catalogue indisponible');
    fireEvent.click(screen.getByRole('button',{name:'Réessayer la lecture'}));await screen.findByText('Aucun résultat');
});
for(const kind of ['documents','dossiers'] as const){
    it('le catalogue '+kind+' recherche toutes les pages et revient à la première',async()=>{
        fixture.records[kind].mockImplementation(async(p:{q?:string,page:number})=>page([{id:'d1',title:p.q?'Notice retrouvée hors page':'Première notice',reference:p.q?'D-31':'D-1',institutionId:'i1',archivalStatus:'BROUILLON',confidentiality:'INTERNE'}],!p.q,p.page));
        render(<RecordCatalogPage kind={kind}/>);await screen.findByText('Première notice');
        fireEvent.click(screen.getByRole('button',{name:'Suivante'}));await waitFor(()=>expect(fixture.records[kind]).toHaveBeenLastCalledWith(expect.objectContaining({page:1}),expect.anything()));
        await screen.findByText('Première notice');fireEvent.change(screen.getByLabelText('Filtrer '+(kind==='documents'?'Documents':'Dossiers')),{target:{value:'D-31'}});
        await screen.findByText('Notice retrouvée hors page');expect(fixture.records[kind]).toHaveBeenLastCalledWith(expect.objectContaining({q:'D-31',page:0,institutionId:'i1'}),expect.anything());
        fireEvent.click(screen.getByRole('button',{name:'Effacer la recherche'}));await screen.findByText('Première notice');
    });
}
it('le catalogue des permissions cherche code, domaine ou description côté serveur',async()=>{
    fixture.api.allPermissionAttributions.mockImplementation(async(_s:unknown,search:string)=>search?[{id:'last',code:'LAST',domain:'PRESERVATION',description:'Résultat de dernière page',roles:[]}]:[{id:'p1',code:'READ',domain:'DOCUMENT',description:'Lire',roles:[]}]);
    render(<PermissionsPage/>);await screen.findByText('READ');
    fireEvent.change(screen.getByLabelText('Rechercher une permission'),{target:{value:'dernière'}});
    await screen.findByText('LAST');expect(fixture.api.allPermissionAttributions).toHaveBeenLastCalledWith(expect.anything(),'dernière');
    expect(screen.queryByText('READ')).toBeNull();
});

