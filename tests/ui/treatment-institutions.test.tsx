import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { DigitizationPage, CreateProjectDialog } from '../../src/pages/Digitization';
import { moduleVisible } from '../../src/design/navigation';
import type { Me } from '../../src/core/types';
const f=vi.hoisted(()=>({ epoch:0, me:{ user:{ id:'u',status:'ACTIF',accountType:'USER',institutionId:'i1',departmentId:null },grants:[] } as unknown as Me,
    digitization:{ projects:vi.fn(),elementsByProject:vi.fn(),lotsByProject:vi.fn(),command:vi.fn() } }));
vi.mock('../../src/auth/session',()=>({useSession:()=>f}));
vi.mock('../../src/ui/workspace',()=>({useWorkspace:()=>({scope:{institutionId:'i1',departmentId:null}})}));
vi.mock('../../src/ui/names',()=>({EntityName:({id}:{id:string})=><span>{id}</span>}));
vi.mock('../../src/ui/OptionalFields',()=>({OptionalFields:()=>null,useOptionalFields:()=>({payload:()=>({})})}));
vi.mock('../../src/ui/ResourceDetails',()=>({ResourceDetailsButton:()=>null}));
vi.mock('../../src/ui/ScanCodes',()=>({CodeLookup:()=>null,SheetsButton:()=>null,elementSheet:()=>null,BatchImportDialog:()=>null}));
vi.mock('../../src/ui/Scanning',()=>({LotsPanel:()=>null,PagesSection:()=>null}));
vi.mock('../../src/ui/ReferencePicker',()=>({ReferencePicker:({kind,label,onChange,value,disabled}:{kind:string;label:string;onChange:(id:string)=>void;value:string;disabled:boolean})=>
    <button type="button" aria-label={label} disabled={disabled} onClick={()=>onChange(kind==='institutions'?'i1':'d1')}>{value||'Choisir'}</button>}));
const project={id:'p1',nom:'Projet M-001',code:'RECETTE',statut:'EN_COURS',institutionId:'i1',departmentId:null,versionLock:3};
function rights(...codes:string[]) { f.me.grants=codes.map(permission=>({permission,scope:'INSTITUTION',institutionId:'i1',departmentId:null,expiresAt:null})) as Me['grants']; }
beforeEach(()=>{
    vi.clearAllMocks();f.epoch++;f.me.user.institutionId='i1';rights('DIGITIZATION_READ','DIGITIZATION_MANAGE');
    f.digitization.projects.mockResolvedValue([project]);f.digitization.elementsByProject.mockResolvedValue([]);f.digitization.lotsByProject.mockResolvedValue([]);f.digitization.command.mockResolvedValue({});
});
it('opens treatment menu entries for an institutional reader without granting national administration',()=>{
    for(const path of ['numerisation','ocr','controle','scanners']) expect(moduleVisible(f.me,path,{})).toBe(true);
    expect(moduleVisible(f.me,'tableau-national',{})).toBe(false);
    f.me.grants=[];expect(moduleVisible(f.me,'numerisation',{})).toBe(false);
});
it('allows the institutional manager to work on the selected project but not change its ownership',async()=>{
    render(<DigitizationPage />);fireEvent.click(await screen.findByRole('button',{name:project.nom}));
    expect(await screen.findByRole('button',{name:'Créer un élément'})).toBeTruthy();
    expect(screen.getByRole('button',{name:'Terminer'})).toBeTruthy();
    expect(screen.queryByRole('button',{name:/Rattacher le projet/})).toBeNull();
});
it('hides write controls for a reader and for a project outside the manager scope',async()=>{
    rights('DIGITIZATION_READ');render(<DigitizationPage />);fireEvent.click(await screen.findByRole('button',{name:project.nom}));
    expect(screen.queryByRole('button',{name:'Créer un élément'})).toBeNull();expect(screen.queryByRole('button',{name:'Terminer'})).toBeNull();
});
it('never borrows another project institution to enable action buttons',async()=>{
    f.digitization.projects.mockResolvedValue([{...project,institutionId:'i2'}]);render(<DigitizationPage />);
    fireEvent.click(await screen.findByRole('button',{name:project.nom}));
    expect(screen.queryByRole('button',{name:'Créer un élément'})).toBeNull();expect(screen.queryByRole('button',{name:'Terminer'})).toBeNull();
});
it('keeps closed project ownership repair available to national managers with a version check',async()=>{
    f.me.user.institutionId=null;f.me.grants=f.me.grants.map(g=>({...g,scope:'NATIONAL',institutionId:null}));
    f.digitization.projects.mockResolvedValue([{...project,statut:'TERMINE',institutionId:null}]);render(<DigitizationPage />);
    fireEvent.click(await screen.findByRole('button',{name:/Rattacher le projet/}));
    fireEvent.click(screen.getByRole('button',{name:'Sélectionner une institution'}));
    fireEvent.click(screen.getByRole('button',{name:'Enregistrer'}));
    await waitFor(()=>expect(f.digitization.command).toHaveBeenCalledOnce());
    expect(f.digitization.command.mock.calls[0]?.slice(0,2)).toEqual(['/projects/p1/origin',{institutionId:'i1',departmentId:null,expectedVersion:3}]);
});
it('defaults a new project to the active institution and submits that scope',async()=>{
    render(<CreateProjectDialog onClose={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/^Nom/),{target:{value:'Projet local'}});fireEvent.click(screen.getByRole('button',{name:'Créer'}));
    await waitFor(()=>expect(f.digitization.command).toHaveBeenCalledOnce());expect(f.digitization.command.mock.calls[0]?.[1]).toMatchObject({institutionId:'i1',departmentId:null});
});
