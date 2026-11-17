import React from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
const f=vi.hoisted(()=>({context:vi.fn(),create:vi.fn(),upload:vi.fn(),ingestion:vi.fn(),command:vi.fn(),permissions:['DIGITIZATION_MANAGE','DOCUMENT_CREATE','FILE_INGEST']}));
vi.mock('../../src/auth/session',()=>({useSession:()=>({digitization:{lotContext:f.context,captureDocument:f.create,command:f.command},records:{uploadContent:f.upload,ingestion:f.ingestion},me:{user:{status:'ACTIF',accountType:'USER'},grants:f.permissions.map(permission=>({permission,scope:'NATIONAL',expiresAt:null}))}})}));
vi.mock('../../src/ui/names',()=>({EntityName:()=> <span>Institution de recette</span>}));
import { LotDocumentDeposit } from '../../src/ui/LotCapture';
import { usePath } from '../../src/ui/navigation';
import { captureFileProblem } from '../../src/core/lotCapture';
const lot={id:'lot',code:'DECRETS',statut:'OUVERT'} as never;
const context={lotId:'lot',lotCode:'DECRETS',institutionId:'institution',departmentId:null,typeName:'Décret',classificationName:'Actes réglementaires',responsibleName:'Responsable de recette',confidentiality:'INTERNE',validatedAt:'2026-11-11T12:00:00Z',validatedBy:'user'};
const created={documentId:'document',versionId:'version',elementId:'element',reference:'CAP-RECETTE',lotId:'lot'};
beforeEach(()=>{vi.clearAllMocks();f.permissions=['DIGITIZATION_MANAGE','DOCUMENT_CREATE','FILE_INGEST'];f.context.mockResolvedValue({context});f.create.mockResolvedValue(created);f.upload.mockResolvedValue({id:'receipt',status:'COMPLETED',fileId:'file'});f.ingestion.mockResolvedValue({id:'receipt',status:'COMPLETED',fileId:'file'});f.command.mockResolvedValue({});});
async function selectFile(){await screen.findByText('DECRETS · Décret');fireEvent.change(screen.getByLabelText('Fichiers du lot'),{target:{files:[new File(['%PDF-1.7'], 'recette-trois-pages.pdf',{type:'application/pdf'})]}});}
it('un PDF multipage crée une seule notice héritant du lot puis rattache le fichier au traitement',async()=>{
    render(<LotDocumentDeposit lot={lot}/>);await selectFile();fireEvent.click(screen.getByRole('button',{name:'Créer, classer et déposer'}));await screen.findByText(/Dépôt terminé — classement appliqué/);
    expect(f.create).toHaveBeenCalledTimes(1);expect(f.create.mock.calls[0]![1]).toEqual({title:'recette-trois-pages',origin:'IMPORTE'});
    expect(f.upload.mock.calls[0]![0]).toBe('version');expect(f.command.mock.calls[0]![0]).toBe('/elements/element/files/file');
    fireEvent.click(screen.getByRole('button',{name:'Relire / reprendre les dépôts'}));await waitFor(()=>expect(f.ingestion).toHaveBeenCalledTimes(1));expect(f.create).toHaveBeenCalledTimes(1);expect(f.upload).toHaveBeenCalledTimes(1);
});
it('une réponse de dépôt perdue conserve la notice et réemploie la même clé',async()=>{
    f.upload.mockRejectedValueOnce(new Error('Réponse perdue'));render(<LotDocumentDeposit lot={lot}/>);await selectFile();fireEvent.click(screen.getByRole('button',{name:'Créer, classer et déposer'}));await screen.findByText('Réponse perdue');
    fireEvent.click(screen.getByRole('button',{name:'Relire / reprendre les dépôts'}));await screen.findByText(/Dépôt terminé — classement appliqué/);expect(f.create).toHaveBeenCalledTimes(1);expect(f.upload.mock.calls[0]![3]).toBe(f.upload.mock.calls[1]![3]);
});
it('un lot non validé et un compte sans dépôt ne peuvent pas créer de document',async()=>{
    f.context.mockResolvedValue({context:null});const view=render(<LotDocumentDeposit lot={lot}/>);await screen.findByText(/Ce lot n’a pas encore/);expect(screen.getByRole('button',{name:'Créer, classer et déposer'})).toHaveProperty('disabled',true);view.unmount();
    f.context.mockResolvedValue({context});f.permissions=['DIGITIZATION_MANAGE','DOCUMENT_CREATE'];render(<LotDocumentDeposit lot={lot}/>);await screen.findByText('DECRETS · Décret');expect(screen.getByRole('button',{name:'Créer, classer et déposer'})).toHaveProperty('disabled',true);expect(f.create).not.toHaveBeenCalled();
});
it('le scan exige la vérification des pages et conserve son origine NUMERISE',async()=>{
    const props={lot,source:{blob:new Blob(['pdf']),name:'scan.pdf',key:'scanner:job'}};
    const view=render(<LotDocumentDeposit {...props} ready={false}/>);await screen.findByText('DECRETS · Décret');expect(screen.getByRole('button',{name:'Créer, classer et déposer'})).toHaveProperty('disabled',true);
    view.rerender(<LotDocumentDeposit {...props} ready/>);fireEvent.click(screen.getByRole('button',{name:'Créer, classer et déposer'}));await screen.findByText(/Dépôt terminé — classement appliqué/);expect(f.create.mock.calls[0]![1].origin).toBe('NUMERISE');expect(f.create.mock.calls[0]![2]).toBe('capture:lot:scanner:job');
});
it('refuse un fichier vide, trop grand ou un type non pris en charge avant toute notice',()=>{
    expect(captureFileProblem([new File([],'vide.pdf')])).toMatch(/64 Mio/);expect(captureFileProblem([new File(['x'],'script.exe')])).toMatch(/PDF/);expect(captureFileProblem(Array.from({length:101},()=>new File(['x'],'doc.pdf')))).toMatch(/100/);
});

it('ouvrir la notice du reçu utilise la navigation interne sans perdre le contexte de session',async()=>{
    history.replaceState(null,'','/app/numerisation');
    function ReceiptJourney(){
        const path=usePath();
        const [sessionMarker]=React.useState(()=>crypto.randomUUID());
        return <><output data-testid="session-marker">{sessionMarker}</output>{path==='/app/documents/document'?<h1>Notice créée</h1>:<LotDocumentDeposit lot={lot}/>}</>;
    }
    render(<ReceiptJourney/>);
    const marker=screen.getByTestId('session-marker').textContent;
    await selectFile();fireEvent.click(screen.getByRole('button',{name:'Créer, classer et déposer'}));
    await screen.findByText(/Dépôt terminé — classement appliqué/);
    fireEvent.click(screen.getByRole('button',{name:'CAP-RECETTE',exact:true}));
    await screen.findByRole('heading',{name:'Notice créée'});
    expect(location.pathname).toBe('/app/documents/document');
    expect(screen.getByTestId('session-marker').textContent).toBe(marker);
    expect(f.create).toHaveBeenCalledTimes(1);expect(f.upload).toHaveBeenCalledTimes(1);
    history.replaceState(null,'','/');
});
