import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { DocumentFile, DocumentVersion, OcrLayout, OcrResult } from '../../src/core/types';
import { ApiError } from '../../src/core/http';
import { ocrSearchMatcher } from '../../src/core/ocrSearch';
import { findOcrSearchTarget } from '../../src/ui/findOcrSearchTarget';

const fixture=vi.hoisted(()=>({ epoch:0,me:null,allowed:new Set<string>(),vocabulary:null,
    records:{versions:vi.fn(),files:vi.fn(),fileContent:vi.fn()},
    digitization:{ocrResultsByFile:vi.fn(),ocrLayout:vi.fn()},
    search:{search:vi.fn(),status:vi.fn()},pdf:vi.fn() }));
vi.mock('../../src/auth/session',()=>({useSession:()=>fixture}));
vi.mock('../../src/core/policy',()=>({can:(_me:unknown,p:string)=>fixture.allowed.has(p)}));
vi.mock('../../src/ui/workspace',()=>({useWorkspace:()=>({scope:{}})}));
vi.mock('pdfjs-dist',()=>({GlobalWorkerOptions:{},getDocument:fixture.pdf}));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url',()=>({default:'/worker.mjs'}));
import { SearchPage } from '../../src/pages/Search';
import { SearchOcrPreview } from '../../src/ui/SearchOcrPreview';
const pdf = new Blob(['%PDF-test'],{type:'application/pdf'});
const file:DocumentFile={id:'f1',versionId:'v2',originalFilename:'recette.pdf',mediaType:'application/pdf',size:pdf.size,
    role:'PIECE_JOINTE',state:'VALIDE',scanStatus:'CLEAN',master:false,validatedAt:'2026-10-18'};
const result={id:'r1',fichierId:'f1',statutValidation:'VALIDE',hasLayout:true,layoutPages:[3,1,2],texte:'ALPHA. BRAVO. CHARLIE.',createdAt:'2026-10-18'} as OcrResult;
const markers=['ALPHA','BRAVO','CHARLIE'];
const layout=(page:number):OcrLayout=>({resultId:'r1',pageNumber:page,width:800,height:1200,unit:'pixel',truncated:false,
    words:[{text:markers[page-1]+'.',x:20,y:30,width:80,height:25,line:1,confidence:96},
        {text:markers[page-1]!,x:100,y:70,width:80,height:25,line:2,confidence:96}]});
const resolve=(q:string,signal=new AbortController().signal)=>findOcrSearchTarget(fixture.records,fixture.digitization,'d1',q,signal);
beforeEach(()=>{
    vi.clearAllMocks();
    fixture.allowed=new Set(['SEARCH_READ','DOCUMENT_READ','DIGITIZATION_READ','FILE_CONTENT_DOWNLOAD']);
    fixture.records.versions.mockResolvedValue([{id:'v1',number:1},{id:'v2',number:2}] as DocumentVersion[]);
    fixture.records.files.mockResolvedValue([file]);
    fixture.records.fileContent.mockResolvedValue(pdf);
    fixture.digitization.ocrResultsByFile.mockResolvedValue([result]);
    fixture.digitization.ocrLayout.mockImplementation(async(_id,_s,page)=>layout(page));
    fixture.search.status.mockResolvedValue({status:'OK',indexes:[]});
    fixture.search.search.mockResolvedValue({hits:[{id:'d1',type:'DOCUMENT',titre:'Document de recette',description:null,score:1}],hasMore:false});
    fixture.pdf.mockImplementation(()=>({promise:Promise.resolve({numPages:3,getPage:async()=>({
        getViewport:({scale}:{scale:number})=>({width:400*scale,height:600*scale}),
        render:()=>({promise:Promise.resolve(),cancel:vi.fn()}),getTextContent:async()=>({items:[]})})}),destroy:async()=>{}}));
    window.history.replaceState({},'','/app/recherche');
});
it.each(markers)('ouvre depuis la recherche la page de %s avec les deux occurrences surlignées',async marker=>{
    render(<SearchPage/>);
    fireEvent.change(screen.getByRole('textbox',{name:'Rechercher'}),{target:{value:marker}});
    fireEvent.click(screen.getByRole('button',{name:'Rechercher'}));
    const open=await screen.findByRole('button',{name:'Voir le mot dans le PDF'});
    expect(fixture.records.versions).not.toHaveBeenCalled();
    fireEvent.click(open);
    await screen.findByRole('button',{name:'Mot 1 : '+marker+'.'});
    expect(screen.getByText('Page '+(markers.indexOf(marker)+1)+' sur 3')).toBeTruthy();
    expect(document.querySelectorAll('.ocr-word-box.search-match')).toHaveLength(2);
    expect(fixture.records.files).toHaveBeenCalledWith('v2',expect.any(AbortSignal));
    expect(fixture.records.fileContent).toHaveBeenCalledWith('f1',expect.any(AbortSignal));
    fireEvent.click(screen.getAllByRole('button',{name:'Fermer'}).at(-1)!);
    await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
    expect((screen.getByRole('textbox',{name:'Rechercher'}) as HTMLInputElement).value).toBe(marker);
    expect(window.location.pathname).toBe('/app/recherche');
});
it('ignore casse, accents et ponctuation, sans confondre un mot et son préfixe',()=>{
    const matches=ocrSearchMatcher('alpha ÉTÉ');
    expect(matches('ALPHA.')).toBe(true);expect(matches('été,')).toBe(true);
    expect(matches('Alphabet')).toBe(false);expect(ocrSearchMatcher('...')('ALPHA')).toBe(false);
});
it('ignore les OCR non validés et les fichiers non consultables',async()=>{
    fixture.records.files.mockResolvedValue([{...file,id:'blocked',validatedAt:null},file]);
    fixture.digitization.ocrResultsByFile.mockResolvedValue([{...result,statutValidation:'NON_VALIDE'}]);
    expect(await resolve('ALPHA')).toBeNull();
    expect(fixture.digitization.ocrResultsByFile).toHaveBeenCalledTimes(1);
    expect(fixture.digitization.ocrLayout).not.toHaveBeenCalled();
});
it('ne cherche ni dans une ancienne version ni dans une réponse de page incohérente',async()=>{
    fixture.digitization.ocrLayout.mockResolvedValue({...layout(1),resultId:'wrong'});
    expect(await resolve('ALPHA')).toBeNull();
    expect(fixture.records.files.mock.calls.map(c=>c[0])).toEqual(['v2']);
});
it('présente une absence de position sans ouvrir un PDF trompeur',async()=>{
    render(<SearchOcrPreview documentId="d1" title="Recette" query="inexistant" onClose={()=>{}}/>);
    await screen.findByText(/Aucune position correspondant aux mots exacts/);
    expect(fixture.records.fileContent).not.toHaveBeenCalled();
    expect(fixture.digitization.ocrLayout).not.toHaveBeenCalled();
    expect(screen.getByRole('button',{name:'Ouvrir la notice'})).toBeTruthy();
});
it('respecte un refus d’accès OCR et ne télécharge pas le PDF',async()=>{
    fixture.digitization.ocrResultsByFile.mockRejectedValue(new ApiError(403,'FORBIDDEN','Accès refusé'));
    render(<SearchOcrPreview documentId="d1" title="Recette" query="ALPHA" onClose={()=>{}}/>);
    await screen.findByRole('alert');
    expect(fixture.records.fileContent).not.toHaveBeenCalled();
});
it('arrête la localisation quand la fenêtre est fermée',async()=>{
    let release!:(v:OcrResult[])=>void;
    fixture.digitization.ocrResultsByFile.mockImplementation(()=>new Promise<OcrResult[]>(yes=>{release=yes;}));
    const view=render(<SearchOcrPreview documentId="d1" title="Recette" query="ALPHA" onClose={()=>{}}/>);
    await waitFor(()=>expect(fixture.digitization.ocrResultsByFile).toHaveBeenCalled());
    const signal=fixture.digitization.ocrResultsByFile.mock.calls[0]![1] as AbortSignal;
    view.unmount();expect(signal.aborted).toBe(true);
    await act(async()=>{release([result]);});
    expect(fixture.digitization.ocrLayout).not.toHaveBeenCalled();
});
it('ne propose pas le raccourci sans droits de consultation du fichier',async()=>{
    fixture.allowed.delete('FILE_CONTENT_DOWNLOAD');
    window.history.replaceState({},'','/app/recherche?q=ALPHA');
    render(<SearchPage/>);await screen.findByRole('button',{name:'Document de recette'});
    expect(screen.queryByRole('button',{name:'Voir le mot dans le PDF'})).toBeNull();
});
