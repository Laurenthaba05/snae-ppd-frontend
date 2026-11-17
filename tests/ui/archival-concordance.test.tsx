import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { ConcordanceState } from '../../src/api/archivalConcordance';
const fixture=vi.hoisted(()=>({ epoch:1, records:{ transport:{request:vi.fn()} } }));
vi.mock('../../src/auth/session',()=>({useSession:()=>fixture}));
vi.mock('../../src/ui/navigation',()=>({navigate:vi.fn()}));
import { ArchivalConcordancePanel } from '../../src/ui/ArchivalConcordancePanel';
const DOC='11111111-1111-4111-8111-111111111111', ARCHIVE='22222222-2222-4222-8222-222222222222';
let state: ConcordanceState;
beforeEach(()=>{
    state={valid:false,status:'A_CONTROLER',canValidate:true,physicalReadable:true,
        choices:[{archiveId:ARCHIVE,cote:'M-001/DEC/2026/001',title:'Décret de recette',location:['Dépôt M-001','Salle A','Rayonnage 4','Boîte 12'],fingerprint:'a'.repeat(64),blockers:[]}],
        nativeChoice:{archiveId:null,cote:null,title:null,location:[],fingerprint:'b'.repeat(64),blockers:['PAPER_ORIGIN_REQUIRED']},history:{items:[],page:0,hasMore:false}};
    fixture.epoch++; fixture.records.transport.request.mockReset().mockImplementation(async (_path:string,options?:{method?:string})=>{
        if(options?.method==='POST') {state={...state,valid:true,status:'VALIDE'};} return state;
    });
});
async function choose(){render(<ArchivalConcordancePanel documentId={DOC}/>); const select=await screen.findByRole('combobox',{name:'Cote et fiche physique liée'}); fireEvent.change(select,{target:{value:ARCHIVE}});}
function fill(){ fireEvent.change(screen.getByLabelText('Cote relevée sur l’original'),{target:{value:'M-001/DEC/2026/001'}}); screen.getAllByRole('checkbox').forEach(c=>fireEvent.click(c)); fireEvent.change(screen.getByRole('textbox',{name:'Constat de concordance ou justification de l’origine numérique'}),{target:{value:'Les trois pages correspondent à la pièce papier de recette.'}}); }
it('explique le blocage et présente la cote et le chemin physique complet',async()=>{
    await choose(); expect(screen.getByText(/Archivage définitif bloqué/)).toBeTruthy(); expect(screen.getByText(/Dépôt M-001 › Salle A › Rayonnage 4 › Boîte 12/)).toBeTruthy();
    expect((screen.getByRole('button',{name:'Valider la concordance'}) as HTMLButtonElement).disabled).toBe(true);
});
it('envoie les quatre contrôles et l’empreinte observée seulement après confirmation complète',async()=>{
    await choose(); fill(); fireEvent.click(screen.getByRole('button',{name:'Valider la concordance'}));
    await screen.findByRole('status');
    const calls=fixture.records.transport.request.mock.calls.filter(c=>c[1]?.method==='POST');expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('/documents/'+DOC+'/archival-concordance');expect(calls[0][1].idempotencyKey).toBeTruthy();
    expect(calls[0][1].body).toMatchObject({origin:'PAPIER',archiveId:ARCHIVE,observedCote:'M-001/DEC/2026/001',fingerprint:'a'.repeat(64),checks:{identity:true,context:true,completeness:true,legibility:true}});
    await screen.findByText(/Contrôle conforme aux données actuelles/);
});
it('refuse une cote différente ou une attestation incomplète',async()=>{
    await choose(); fill(); fireEvent.change(screen.getByLabelText('Cote relevée sur l’original'),{target:{value:'FAUX'}});
    expect((screen.getByRole('button',{name:'Valider la concordance'}) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toContain('ne correspond pas');
    fireEvent.change(screen.getByLabelText('Cote relevée sur l’original'),{target:{value:'M-001/DEC/2026/001'}});
    fireEvent.click(screen.getAllByRole('checkbox')[2]);expect((screen.getByRole('button',{name:'Valider la concordance'}) as HTMLButtonElement).disabled).toBe(true);
});
it('explique l’absence de présence et bloque le formulaire',async()=>{
    state.choices[0].blockers=['PHYSICAL_PRESENCE_REQUIRED'];await choose();
    expect(screen.getByText(/Vérifiez la présence de l’original/)).toBeTruthy();
    expect((screen.getByRole('button',{name:'Valider la concordance'}) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getAllByRole('checkbox')[0].closest('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
});
it('signale un contrôle périmé en conservant son historique',async()=>{
    state.status='A_REVALIDER';state.history.items=[{id:'h',origin:'PAPIER',cote:'ANCIENNE-COTE',location:['Ancien rangement'],note:'Contrôle précédent conservé',validatedBy:'agent',validatedAt:'2026-11-12T10:00:00Z',current:false}];
    await choose();expect(screen.getByText(/les informations contrôlées ont changé/)).toBeTruthy();expect(screen.getByText('Contrôle précédent conservé')).toBeTruthy();
});
it('ne propose pas la validation à un compte non habilité',async()=>{
    state.canValidate=false;render(<ArchivalConcordancePanel documentId={DOC}/>);await screen.findByText(/La validation nécessite un agent habilité/);
    expect(screen.queryByRole('button',{name:'Valider la concordance'})).toBeNull();
});
it('empêche de déclarer natif un document provenant du papier',async()=>{
    await choose(); fireEvent.change(screen.getByRole('combobox',{name:'Origine de l’original'}),{target:{value:'NATIF_NUMERIQUE'}});
    expect(screen.getByText(/Ce document provient du papier/)).toBeTruthy(); expect((screen.getByRole('button',{name:'Valider la concordance'}) as HTMLButtonElement).disabled).toBe(true);
});
it('montre la cote et l’emplacement en lecture seule sans proposer de validation',async()=>{
    state.canValidate=false;render(<ArchivalConcordancePanel documentId={DOC}/>);
    expect(await screen.findByText('Cote : M-001/DEC/2026/001')).toBeTruthy();
    expect(screen.getByText(/Emplacement physique : Dépôt M-001 › Salle A › Rayonnage 4 › Boîte 12/)).toBeTruthy();
    expect(screen.queryByRole('button',{name:'Valider la concordance'})).toBeNull();
});
it('garde les informations en cas de conflit serveur et permet de recharger',async()=>{
    await choose(); fill(); fixture.records.transport.request.mockRejectedValueOnce(new Error('Les données ont changé.'));
    fireEvent.click(screen.getByRole('button',{name:'Valider la concordance'})); await waitFor(()=>expect(screen.getByText(/Les données ont changé/)).toBeTruthy());
    expect((screen.getByLabelText('Cote relevée sur l’original') as HTMLInputElement).value).toBe('M-001/DEC/2026/001');
    fireEvent.click(screen.getByRole('button',{name:'Actualiser'}));expect(((await screen.findAllByRole('checkbox'))[0] as HTMLInputElement).checked).toBe(false);
});
