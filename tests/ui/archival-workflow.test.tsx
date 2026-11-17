import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { ArchivalReadiness } from '../../src/api/archivalReadiness';
import type { Localisation, ScanLot } from '../../src/core/types';
const f=vi.hoisted(()=>({epoch:1,me:null,digitization:{transport:{request:vi.fn()}},physicalArchives:{command:vi.fn()}}));
const nav=vi.hoisted(()=>vi.fn());
vi.mock('../../src/auth/session',()=>({useSession:()=>f}));
vi.mock('../../src/core/policy',()=>({can:()=>true}));
vi.mock('../../src/ui/navigation',()=>({navigate:nav}));
vi.mock('../../src/ui/ArchivalConcordancePanel',()=>({ArchivalConcordancePanel:({onChanged}:{onChanged:()=>void})=><button onClick={onChanged}>Enregistrer le contrôle de test</button>}));
import { ArchivalWorkflowPanel, LotArchivalDialog } from '../../src/ui/ArchivalWorkflow';
import { ShelvingDialog } from '../../src/ui/ShelvingDialog';
const ID='00000000-0000-4000-8000-000000000001';
let state:ArchivalReadiness;
beforeEach(()=>{
    f.epoch++;nav.mockReset();f.physicalArchives.command.mockReset().mockResolvedValue({unit:{id:ID,localisationId:ID}});
    state={elementId:ID,documentId:ID,title:'RECETTE-DECRETS-20261112',archived:false,agentsVisible:true,
        physicalLinks:[{id:ID,cote:'DEC-001',path:['Salle S01','Étagère E02','Rang R03','Case C04','Boîte B05']}],
        steps:[{code:'TREATMENT',label:'Traitement, OCR et scellement',status:'DONE',detail:'Prêt pour versement.',permissions:['DIGITIZATION_VALIDATE'],blockers:[],completedBy:null},
            {code:'CONCORDANCE',label:'Contrôle papier/numérique',status:'BLOCKED',detail:'Comparer à l’original.',permissions:['DOCUMENT_CLOSE'],blockers:['PHYSICAL_PRESENCE_REQUIRED'],completedBy:null},
            {code:'ARCHIVE',label:'Archivage définitif',status:'BLOCKED',detail:'Troisième agent.',permissions:['DISPOSITION_EXECUTE'],blockers:['ARCHIVAL_CONCORDANCE_REQUIRED'],completedBy:null}]};
    f.digitization.transport.request.mockReset().mockImplementation(async(path:string)=>path.includes('/agents')?{items:[{id:ID,name:'Agent habilité M-001'}],hasMore:!path.includes('page=1')}:path.includes('/archival-elements')?{items:[{elementId:ID,documentId:ID,title:state.title,status:'TERMINE'}],hasMore:true}:state);
});
it('distingue le traitement terminé de l’archivage bloqué et expose le chemin physique',async()=>{
    render(<ArchivalWorkflowPanel elementId={ID}/>);
    await screen.findByText(/Archivage définitif non terminé/);
    expect(screen.getByText('Terminé')).toBeTruthy();expect(screen.getAllByText('Bloqué')).toHaveLength(2);
    expect(screen.getByText('Salle S01 › Étagère E02 › Rang R03 › Case C04 › Boîte B05')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Retrouver l’original physique'}));expect(nav).toHaveBeenCalledWith('/app/archives-physiques?archive='+ID);
});
it('charge les agents à la demande et permet de poursuivre leur pagination',async()=>{
    render(<ArchivalWorkflowPanel elementId={ID}/>);
    fireEvent.click(await screen.findByRole('button',{name:'Agents habilités — Archivage définitif'}));
    await screen.findByText('Agent habilité M-001');expect(screen.getByText(/Le proposant est exclu/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Agents suivants'}));
    await waitFor(()=>expect(f.digitization.transport.request.mock.calls.some(([p])=>p.includes('step=ARCHIVE')&&p.includes('page=1'))).toBe(true));
});
it('ne révèle pas la liste des agents sans accès à l’annuaire',async()=>{
    state.agentsVisible=false;render(<ArchivalWorkflowPanel elementId={ID}/>);await screen.findByText(state.title);
    expect(screen.queryByRole('button',{name:/Agents habilités/})).toBeNull();
    expect(f.digitization.transport.request.mock.calls.some(([p])=>p.includes('/agents'))).toBe(false);
});
it('ouvre le contrôle dans le workflow et actualise le bilan après enregistrement',async()=>{
    render(<ArchivalWorkflowPanel elementId={ID}/>);fireEvent.click(await screen.findByRole('button',{name:'Effectuer le contrôle papier/numérique'}));
    state={...state,steps:state.steps.map(s=>s.code==='CONCORDANCE'?{...s,status:'DONE',blockers:[]}:s)};
    fireEvent.click(screen.getByRole('button',{name:'Enregistrer le contrôle de test'}));
    await waitFor(()=>expect(screen.getAllByText('Terminé')).toHaveLength(2));
});
it('ouvre le parcours depuis le lot et pagine ses documents',async()=>{
    render(<LotArchivalDialog lot={{id:ID,code:'RECETTE-DECRETS-20261112'} as ScanLot} onClose={()=>{}}/>);
    await screen.findByRole('combobox',{name:'Document du lot'});fireEvent.click(screen.getByRole('button',{name:'Documents suivants'}));
    await waitFor(()=>expect(f.digitization.transport.request.mock.calls.some(([p])=>p.includes('/archival-elements?page=1'))).toBe(true));
});
it('présente les cinq niveaux et transmet le rangement sans déplacer une archive',async()=>{
    const done=vi.fn();render(<ShelvingDialog locations={[{id:ID,parentId:null,typeLocalisation:'MAGASIN',libelle:'Dépôt M-001',statut:'ACTIVE'} as Localisation]} onClose={()=>{}} onCreated={done}/>);
    fireEvent.change(screen.getByRole('combobox'),{target:{value:ID}});
    for(const [label,code] of [['Salle','S01'],['Étagère','E02'],['Rang','R03'],['Case','C04']]){
        fireEvent.change(screen.getByLabelText('Code '+label),{target:{value:code}});fireEvent.change(screen.getByLabelText('Libellé '+label),{target:{value:label+' recette'}});
    }
    fireEvent.change(screen.getByLabelText('Code Boîte'),{target:{value:'B05'}});
    expect(screen.getByLabelText('Aperçu du rangement').textContent).toContain('Salle S01 › Étagère E02 › Rang R03 › Case C04 › Boîte B05');
    fireEvent.submit(screen.getByRole('button',{name:'Créer ou retrouver le rangement'}).closest('form')!);
    await waitFor(()=>expect(done).toHaveBeenCalled());
    expect(f.physicalArchives.command).toHaveBeenCalledTimes(1);
    expect(f.physicalArchives.command.mock.calls[0][0]).toBe('/shelving');
    expect(f.physicalArchives.command.mock.calls[0][1]).toMatchObject({parentId:ID,boxCode:'B05',compartment:{code:'C04',label:'Case recette'}});
});
