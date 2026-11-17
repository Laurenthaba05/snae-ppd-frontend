import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Actor, DocumentActor, RecordDocument } from '../../src/core/types';
const fixture = vi.hoisted(() => ({ epoch:1, allowed:true, me:null, records:{ command:vi.fn(), actor:vi.fn(), actorHistory:vi.fn(), documentActors:vi.fn() } }));
vi.mock('../../src/auth/session',()=>({useSession:()=>fixture}));
vi.mock('../../src/core/policy',()=>({can:()=>fixture.allowed}));
vi.mock('../../src/ui/OptionalFields',()=>({useOptionalFields:()=>({payload:()=>({})}),OptionalFields:()=>null}));
vi.mock('../../src/ui/ArchiveRecordPicker',()=>({
    actorLabel:(a:Actor)=>a.legalName || [a.firstName,a.name].filter(Boolean).join(' '),
    ArchiveRecordPicker:({onChange,disabled}:{onChange:(id:string)=>void;disabled?:boolean})=><button type="button" disabled={disabled} onClick={()=>onChange('44444444-4444-4444-8444-444444444444')}>Choisir le service corrigé</button>
}));
import { ActorLinkDialog, ActorLinkHistory } from '../../src/ui/ActorLinkActions';
import { ActorsPanel, AttachActorDialog } from '../../src/ui/RecordActors';
const DOC='11111111-1111-4111-8111-111111111111', LINK='22222222-2222-4222-8222-222222222222', ACTOR='33333333-3333-4333-8333-333333333333';
const actor:Actor={id:ACTOR,type:'SERVICE',name:'Service initial',firstName:null,legalName:null,externalId:null};
const link:DocumentActor={id:LINK,documentId:DOC,actorId:ACTOR,actor,role:'AUTEUR',order:1,comment:'Initial',version:3};
const record={id:DOC,institutionId:'i',departmentId:null,destroyed:false,businessStatus:'ACTIF',archivalStatus:'ACTIF'} as RecordDocument;
beforeEach(()=>{
    fixture.epoch++;fixture.allowed=true;
    for(const fn of Object.values(fixture.records)) fn.mockReset();
    fixture.records.actor.mockResolvedValue({...actor,id:'44444444-4444-4444-8444-444444444444',name:'Service corrigé'});
    fixture.records.actorHistory.mockResolvedValue({items:[],page:0,size:20,hasMore:false});
    fixture.records.documentActors.mockResolvedValue([link]);
    fixture.records.command.mockResolvedValue({});
});
function change(label:string,value:string){fireEvent.change(screen.getByLabelText((text)=>text.startsWith(label)),{target:{value}});}
function prepare(){change('Rôle *','PRODUCTEUR');change('Motif de la modification *','Correction vérifiée');}
it('affiche les différences sans écriture puis confirme explicitement la modification',async()=>{
    const done=vi.fn();render(<ActorLinkDialog documentId={DOC} link={link} mode="edit" onClose={()=>{}} onSuccess={done}/>);
    prepare();change('Ordre','');change('Commentaire','');
    await waitFor(()=>expect((screen.getByRole('button',{name:'Vérifier avant confirmation'}) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button',{name:'Vérifier avant confirmation'}));
    expect(fixture.records.command).not.toHaveBeenCalled();
    const preview=screen.getByRole('region',{name:'Vérification avant confirmation'});
    expect(preview.textContent).toContain('Auteur');expect(preview.textContent).toContain('Producteur');expect(preview.textContent).toContain('Initial');
    fireEvent.click(screen.getByRole('button',{name:'Confirmer la modification'}));
    await waitFor(()=>expect(done).toHaveBeenCalledOnce());
    expect(fixture.records.command).toHaveBeenCalledWith('/documents/'+DOC+'/actors/'+LINK,
        {expectedVersion:3,actorId:ACTOR,role:'PRODUCTEUR',order:null,comment:null,reason:'Correction vérifiée'},expect.any(String),'PUT');
});
it('permet de changer l’acteur et montre les deux noms avant confirmation',async()=>{
    render(<ActorLinkDialog documentId={DOC} link={link} mode="edit" onClose={()=>{}} onSuccess={()=>{}}/>);
    fireEvent.click(screen.getByText('Choisir le service corrigé'));change('Motif de la modification *','Mauvais service');
    await waitFor(()=>expect((screen.getByRole('button',{name:'Vérifier avant confirmation'}) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button',{name:'Vérifier avant confirmation'}));
    const region=screen.getByRole('region',{name:'Vérification avant confirmation'});
    expect(region.textContent).toContain('Service initial');expect(region.textContent).toContain('Service corrigé');expect(fixture.records.command).not.toHaveBeenCalled();
});
it('retirer exige motif puis confirmation et préserve la fiche de l’acteur',async()=>{
    const done=vi.fn();render(<ActorLinkDialog documentId={DOC} link={link} mode="remove" onClose={()=>{}} onSuccess={done}/>);
    expect((screen.getByRole('button',{name:'Vérifier avant confirmation'}) as HTMLButtonElement).disabled).toBe(true);
    change('Motif du retrait *','Erreur de rattachement');fireEvent.click(screen.getByRole('button',{name:'Vérifier avant confirmation'}));
    expect(fixture.records.command).not.toHaveBeenCalled();expect(screen.getByText(/La fiche de l’acteur est conservée/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Confirmer le retrait'}));await waitFor(()=>expect(done).toHaveBeenCalledOnce());
    expect(fixture.records.command).toHaveBeenCalledWith('/documents/'+DOC+'/actors/'+LINK+'/remove',
        {expectedVersion:3,reason:'Erreur de rattachement'},expect.any(String),'POST');
});
it('annuler ou revenir à la saisie ne modifie rien',async()=>{
    const close=vi.fn();render(<ActorLinkDialog documentId={DOC} link={link} mode="edit" onClose={close} onSuccess={()=>{}}/>);prepare();
    await waitFor(()=>expect((screen.getByRole('button',{name:'Vérifier avant confirmation'}) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button',{name:'Vérifier avant confirmation'}));fireEvent.click(screen.getByRole('button',{name:'Revenir à la saisie'}));
    expect(screen.getByLabelText('Motif de la modification *')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Annuler'}));
    expect(close).toHaveBeenCalledOnce();expect(fixture.records.command).not.toHaveBeenCalled();
});
it('rejoue une erreur réseau avec la même clé puis change de clé pour une autre intention',async()=>{
    fixture.records.command.mockRejectedValue(new Error('Erreur réseau'));
    render(<ActorLinkDialog documentId={DOC} link={link} mode="edit" onClose={()=>{}} onSuccess={()=>{}}/>);prepare();
    await waitFor(()=>expect((screen.getByRole('button',{name:'Vérifier avant confirmation'}) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button',{name:'Vérifier avant confirmation'}));fireEvent.click(screen.getByRole('button',{name:'Confirmer la modification'}));
    await screen.findByRole('alert');fireEvent.click(screen.getByRole('button',{name:'Confirmer la modification'}));
    await waitFor(()=>expect(fixture.records.command).toHaveBeenCalledTimes(2));
    expect(fixture.records.command.mock.calls[0]![2]).toBe(fixture.records.command.mock.calls[1]![2]);
    await waitFor(()=>expect((screen.getByRole('button',{name:'Revenir à la saisie'}) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button',{name:'Revenir à la saisie'}));change('Commentaire','Correction différente');
    fireEvent.click(screen.getByRole('button',{name:'Vérifier avant confirmation'}));fireEvent.click(screen.getByRole('button',{name:'Confirmer la modification'}));
    await waitFor(()=>expect(fixture.records.command).toHaveBeenCalledTimes(3));
    expect(fixture.records.command.mock.calls[2]![2]).not.toBe(fixture.records.command.mock.calls[0]![2]);
});
it('bloque les modifications inchangées ou sans version et les ordres invalides',async()=>{
    const v=render(<ActorLinkDialog documentId={DOC} link={link} mode="edit" onClose={()=>{}} onSuccess={()=>{}}/>);
    change('Motif de la modification *','Sans changement');expect((screen.getByRole('button',{name:'Vérifier avant confirmation'}) as HTMLButtonElement).disabled).toBe(true);
    change('Ordre','1.5');expect((screen.getByRole('button',{name:'Vérifier avant confirmation'}) as HTMLButtonElement).disabled).toBe(true);
    v.unmount();render(<ActorLinkDialog documentId={DOC} link={{...link,version:undefined as unknown as number}} mode="remove" onClose={()=>{}} onSuccess={()=>{}}/>);
    change('Motif du retrait *','Retrait');expect((screen.getByRole('button',{name:'Vérifier avant confirmation'}) as HTMLButtonElement).disabled).toBe(true);
});
it('affiche un historique paginé même après retrait avec valeurs et motif échappés',async()=>{
    fixture.records.actorHistory.mockResolvedValue({items:[{id:'e',linkId:LINK,action:'DOCUMENT_ACTOR_DETACH',occurredAt:'2026-10-23T12:00:00Z',performedBy:'Agent de recette',
        before:{actorLabel:'Service initial',role:'AUTEUR',order:1,comment:'<img src=x>'},after:{removed:true,reason:'Doublon'}}],page:0,size:20,hasMore:true});
    render(<ActorLinkHistory documentId={DOC}/>);
    await screen.findByText(/Retrait ·/);expect(screen.getByText('<img src=x>')).toBeTruthy();expect(document.querySelector('img')).toBeNull();expect(screen.getByText('Doublon')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Suivante'}));await waitFor(()=>expect(fixture.records.actorHistory).toHaveBeenLastCalledWith(DOC,1,expect.any(AbortSignal)));
});
it('garde la lecture de l’historique sans boutons de modification pour un document clos',async()=>{
    render(<ActorsPanel documentId={DOC} document={{...record,businessStatus:'CLOS'}}/>);
    await screen.findByText('Service initial');expect(screen.queryByRole('button',{name:'Modifier le rattachement'})).toBeNull();expect(screen.queryByRole('button',{name:'Retirer le rattachement'})).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Historique des rattachements'}));await screen.findByText('Aucun événement de rattachement');
});
it('respecte les droits de gestion dans le panneau',async()=>{
    fixture.allowed=false;render(<ActorsPanel documentId={DOC} document={record}/>);
    await screen.findByText('Service initial');expect(screen.queryByRole('button',{name:'Attacher un acteur'})).toBeNull();expect(screen.queryByRole('button',{name:'Modifier le rattachement'})).toBeNull();
});
it('réessaie le rattachement sans recréer un nouvel acteur après un échec partiel',async()=>{
    fixture.records.command.mockImplementation(async(path:string)=>{if(path==='/actors')return {id:ACTOR};throw new Error('Échec du rattachement');});
    render(<AttachActorDialog documentId={DOC} onClose={()=>{}} onSuccess={()=>{}}/>);
    fireEvent.click(screen.getByRole('button',{name:'Nouvel acteur'}));change('Nom','Service nouveau');fireEvent.click(screen.getByRole('button',{name:/Attacher$/}));
    await screen.findByRole('alert');fireEvent.click(screen.getByRole('button',{name:/Attacher$/}));
    await waitFor(()=>expect(fixture.records.command).toHaveBeenCalledTimes(3));
    expect(fixture.records.command.mock.calls.filter(c=>c[0]==='/actors')).toHaveLength(1);
    expect(fixture.records.command.mock.calls[1]![2]).toBe(fixture.records.command.mock.calls[2]![2]);
});

