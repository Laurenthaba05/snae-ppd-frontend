import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { AcquisitionApi } from '../../src/api/acquisition';
const fixture=vi.hoisted(()=>({epoch:1,demo:false,scope:{institutionId:'11111111-1111-4111-8111-111111111111',departmentId:null as string|null},
    request:vi.fn(),records:{transport:{} as unknown,versions:vi.fn(),files:vi.fn()}}));
vi.mock('../../src/auth/session',()=>({useSession:()=>fixture}));
vi.mock('../../src/ui/workspace',()=>({useWorkspace:()=>({scope:fixture.scope})}));
vi.mock('../../src/ui/ScannerCapture',()=>({ScannerCapture:()=>null}));
vi.mock('../../src/ui/ArchiveRecordPicker',()=>({ArchiveRecordPicker:()=>null}));
vi.mock('../../src/ui/names',()=>({ScopeName:()=> <span>Institution de recette</span>}));
import { AcquisitionPage } from '../../src/pages/Acquisition';
const ID='22222222-2222-4222-8222-222222222222';
const op={id:ID,type:'IMPORT',kind:'DOCUMENTS',state:'COMMITTED',createdAt:'2026-10-23T12:00:00Z',updatedAt:'2026-10-23T12:01:00Z',
    label:'recette.csv',institutionId:'i',departmentId:null,institutionName:'Institution de recette',reference:null,documentId:null,
    rowCount:1,createdCount:1,valid:true,expiresAt:'2099-01-01T00:00:00Z',errorCode:null,canResume:true};
let operations= [op],hasMore=false;
const events={items:[{id:'event',action:'ACQUISITION_EXTRACTION_REVIEWED',occurredAt:'2026-10-23T12:01:00Z',performedBy:'Agent de recette',reason:'<img src=x> Décision relue',decision:'ACCEPTED',resultCode:null}],page:0,size:20,hasMore:false};
beforeEach(()=>{
    history.replaceState(null,'','/app/acquisition?tab=history');window.scrollTo=vi.fn();fixture.epoch++;
    fixture.scope={institutionId:'11111111-1111-4111-8111-111111111111',departmentId:null};operations=[op];hasMore=false;
    fixture.records.transport={request:fixture.request};fixture.request.mockReset();
    fixture.request.mockImplementation(async(path:string)=>{
        if(path==='/acquisition/capabilities')return {importsEnabled:false,extractionEnabled:false,workerEnabled:false,maxImportRows:500,maxImportBytes:5000000};
        if(path.startsWith('/acquisition/history?'))return {items:operations,page:Number(new URLSearchParams(path.split('?')[1]).get('page')),size:20,hasMore};
        if(path.startsWith('/acquisition/history/'))return events;
        if(path.startsWith('/acquisition/imports/'))return {id:ID,context:{kind:'DOCUMENTS',institutionId:'i',departmentId:null},sourceSha256:'hash',
            state:'COMMITTED',expiresAt:'2099-01-01T00:00:00Z',valid:true,rows:[{number:1,values:{reference:'DOC-1',titre:'Import repris'},issues:[]}],created:[{id:'created',row:1,reference:'DOC-1',initialVersionId:null,fileName:null}]};
        throw new Error('Unexpected path: '+path);
    });
});
it('affiche les opérations persistées même si les nouveaux imports sont désactivés',async()=>{
    render(<AcquisitionPage/>);await screen.findByText('recette.csv');
    expect(screen.getAllByText(/Import réalisé/).length).toBeGreaterThan(0);expect(screen.getByText(/1 lignes · 1 notices créées/)).toBeTruthy();
    expect(fixture.request).toHaveBeenCalledWith(expect.stringContaining('institutionId=11111111'),expect.objectContaining({signal:expect.any(AbortSignal)}));
});
it('recherche côté serveur sur tous les résultats avec les filtres sans écrire',async()=>{
    render(<AcquisitionPage/>);await screen.findByText('recette.csv');
    fireEvent.change(screen.getByLabelText('Rechercher une opération'),{target:{value:'centième & lot'}});
    fireEvent.change(screen.getByLabelText('Type d’opération'),{target:{value:'IMPORT'}});
    fireEvent.change(screen.getByLabelText('État de l’opération'),{target:{value:'EXPIRED'}});
    fireEvent.change(screen.getByLabelText('Créée à partir du'),{target:{value:'2026-10-01'}});
    fireEvent.change(screen.getByLabelText('Créée jusqu’au'),{target:{value:'2026-10-23'}});
    fireEvent.click(screen.getByRole('button',{name:'Rechercher',exact:true}));
    await waitFor(()=>expect(fixture.request.mock.calls.some(([p])=>p.includes('q=centi%C3%A8me+%26+lot')&&p.includes('state=EXPIRED')&&p.includes('from=2026-10-01'))).toBe(true));
    expect(fixture.request.mock.calls.every(([,opts])=>!opts?.method)).toBe(true);
});
it('parcourt les pages et réinitialise la page lors d’une recherche',async()=>{
    hasMore=true;render(<AcquisitionPage/>);await screen.findByText('recette.csv');fireEvent.click(screen.getByRole('button',{name:'Suivante'}));
    await waitFor(()=>expect(fixture.request).toHaveBeenCalledWith(expect.stringContaining('page=1'),expect.anything()));
    fireEvent.change(screen.getByLabelText('Rechercher une opération'),{target:{value:'nouveau'}});fireEvent.click(screen.getByRole('button',{name:'Rechercher',exact:true}));
    await waitFor(()=>expect(fixture.request.mock.calls.some(([p])=>p.includes('page=0')&&p.includes('q=nouveau'))).toBe(true));
});
it('ouvre un import depuis l’historique sans nouvelle analyse ni confirmation automatique',async()=>{
    render(<AcquisitionPage/>);await screen.findByText('recette.csv');fireEvent.click(screen.getByRole('button',{name:'Ouvrir le traitement'}));
    await screen.findByText('Import repris');expect(location.search).toContain('operationId='+ID);
    expect(fixture.request.mock.calls.every(([,opts])=>!opts?.method)).toBe(true);
    expect(screen.getByText(/Retrouvez ce lot dans l’historique/)).toBeTruthy();
});
it('une URL de reprise reste utilisable après remontage et les identifiants invalides restent une erreur lisible',async()=>{
    history.replaceState(null,'','/app/acquisition?tab=imports&operationId='+ID);
    const view=render(<AcquisitionPage/>);await screen.findByText('Import repris');view.unmount();
    history.replaceState(null,'','/app/acquisition?tab=imports&operationId=invalide');
    render(<AcquisitionPage/>);await screen.findByRole('alert');
    expect(fixture.request.mock.calls.some(([p])=>p.includes('/imports/invalide'))).toBe(false);
});
it('charge un journal daté seulement à la demande, avec texte échappé',async()=>{
    render(<AcquisitionPage/>);await screen.findByText('recette.csv');
    expect(fixture.request.mock.calls.some(([p])=>p.startsWith('/acquisition/history/'))).toBe(false);
    fireEvent.click(screen.getByRole('button',{name:'Voir le journal'}));await screen.findByText('Décision enregistrée');
    expect(screen.getByText(/<img src=x> Décision relue/)).toBeTruthy();expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText(/Agent de recette/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Voir le journal'}));expect(screen.queryByText('Décision enregistrée')).toBeNull();
});
it('garde le journal accessible pour une source indisponible et empêche la reprise',async()=>{
    operations=[{...op,type:'EXTRACTION',state:'FAILED',canResume:false,errorCode:'WORKER_INTERRUPTED'}];
    render(<AcquisitionPage/>);await screen.findByText('recette.csv');
    expect((screen.getByRole('button',{name:'Ouvrir le traitement'}) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button',{name:'Voir le journal'}));await screen.findByText('Décision enregistrée');
});
it('signale le résultat vide et bloque une période de dates inversée',async()=>{
    operations=[];render(<AcquisitionPage/>);await screen.findByText('Aucune opération trouvée');
    fireEvent.change(screen.getByLabelText('Créée à partir du'),{target:{value:'2026-10-23'}});
    fireEvent.change(screen.getByLabelText('Créée jusqu’au'),{target:{value:'2026-10-01'}});
    expect((screen.getByRole('button',{name:'Rechercher',exact:true}) as HTMLButtonElement).disabled).toBe(true);
});
it('respecte le nouveau périmètre et supprime le résultat de l’ancien',async()=>{
    const view=render(<AcquisitionPage/>);await screen.findByText('recette.csv');
    operations=[];fixture.scope={institutionId:'33333333-3333-4333-8333-333333333333',departmentId:null};
    view.rerender(<AcquisitionPage/>);await screen.findByText('Aucune opération trouvée');expect(screen.queryByText('recette.csv')).toBeNull();
    expect(fixture.request).toHaveBeenLastCalledWith(expect.stringContaining('institutionId=33333333'),expect.anything());
});
it('présente une erreur de lecture et permet une nouvelle lecture',async()=>{
    fixture.request.mockRejectedValueOnce(new Error('Interruption de lecture'));
    render(<AcquisitionPage/>);await screen.findByText('Interruption de lecture');
    fireEvent.click(screen.getByRole('button',{name:'Réessayer la lecture'}));await screen.findByText('recette.csv');
});
it('construit les routes de journal avec validation de l’identifiant et pagination',async()=>{
    const api=new AcquisitionApi({request:fixture.request} as never);
    await api.operationEvents('IMPORT',ID,2);
    expect(fixture.request).toHaveBeenLastCalledWith('/acquisition/history/IMPORT/'+ID+'?page=2&size=20',{signal:undefined});
    await expect(api.operationEvents('IMPORT','../private',0)).rejects.toThrow();
});

