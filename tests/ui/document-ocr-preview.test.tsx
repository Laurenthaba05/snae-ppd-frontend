import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { OcrLayout, OcrResult } from '../../src/core/types';
const fixture=vi.hoisted(() => ({ results:vi.fn(), layout:vi.fn(), load:vi.fn(), page:vi.fn() }));
vi.mock('../../src/auth/session', () => ({ useSession: () => ({ epoch:0, digitization:{ ocrResultsByFile:fixture.results, ocrLayout:fixture.layout } }) }));
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions:{}, getDocument:fixture.load }));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default:'/worker.mjs' }));
import DocumentPdfPreview from '../../src/ui/DocumentPdfPreview';
import { layoutFitsPage } from '../../src/ui/OcrWordOverlay';
const result = { id:'ocr1',statutValidation:'VALIDE',hasLayout:true,layoutPages:[1,2],createdAt:'2026-10-15T10:18:33Z' } as OcrResult;
const layout=(page=1):OcrLayout => ({ resultId:'ocr1',pageNumber:page,width:800,height:1200,unit:'pixel',truncated:false,
    words:[{text:page===1?'NAPS2':'Seconde',x:20,y:40,width:100,height:30,confidence:95,line:1},
        {text:'document',x:140,y:40,width:100,height:30,confidence:70,line:1}] });
const blob=()=>new Blob(['%PDF-test'],{type:'application/pdf'});
beforeEach(() => {
    fixture.results.mockResolvedValue([result]);
    fixture.layout.mockImplementation(async (_id,_signal,page) => layout(page));
    fixture.page.mockImplementation(async (n) => ({ getViewport:({scale}:{scale:number})=>({width:400*scale,height:600*scale}),
        render:()=>({promise:Promise.resolve(),cancel:vi.fn()}),getTextContent:async()=>({items:[{str:'Page native '+n}]}) }));
    fixture.load.mockImplementation(()=>({promise:Promise.resolve({numPages:3,getPage:fixture.page}),destroy:async()=>{}}));
});
it('superpose les cadres, filtre les mots et affiche leurs coordonnées par sélection clavier',async()=>{
    render(<DocumentPdfPreview blob={blob()} fileId="file1"/>);
    const word=await screen.findByRole('button',{name:'Mot 1 : NAPS2'});
    expect(word.querySelector('rect')?.getAttribute('x')).toBe('20');
    fireEvent.keyDown(word,{key:'Enter'});
    expect(screen.getByText(/Position : 20, 40/)).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox',{name:'Rechercher un mot OCR'}),{target:{value:'naps2'}});
    expect(screen.queryByRole('button',{name:'Mot 2 : document'})).toBeNull();
    expect(screen.getByText(/1 mot\(s\) affiché\(s\) sur 2/)).toBeTruthy();
});
it('conserve les cadres sur le même support que le canvas quand le zoom change',async()=>{
    render(<DocumentPdfPreview blob={blob()} fileId="file1"/>);
    await screen.findByRole('button',{name:'Mot 1 : NAPS2'});
    const canvas=screen.getByRole('img') as HTMLCanvasElement;
    const surface=canvas.parentElement!;
    expect(surface.style.width).toBe('600px');
    fireEvent.change(screen.getByRole('combobox',{name:'Zoom'}),{target:{value:'2'}});
    await waitFor(()=>expect(surface.style.width).toBe('1200px'));
    expect(surface.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 800 1200');
    expect(surface.style.height).toBe(canvas.height+'px');
});
it('change de page sans remonter le PDF et masque les positions absentes ou désactivées',async()=>{
    render(<DocumentPdfPreview blob={blob()} fileId="file1"/>);
    await screen.findByRole('button',{name:'Mot 1 : NAPS2'});
    fireEvent.click(screen.getByRole('button',{name:'Page suivante'}));
    await screen.findByRole('button',{name:'Mot 1 : Seconde'});
    expect(screen.queryByRole('button',{name:'Mot 1 : NAPS2'})).toBeNull();
    expect(screen.getByText('Page 2 sur 3')).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox',{name:'Afficher les positions OCR validées'}));
    expect(screen.queryByRole('button',{name:'Mot 1 : Seconde'})).toBeNull();
    expect(screen.getByText('Page 2 sur 3')).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox',{name:'Afficher les positions OCR validées'}));
    await screen.findByRole('button',{name:'Mot 1 : Seconde'});
    fireEvent.click(screen.getByRole('button',{name:'Page suivante'}));
    await screen.findByText('Aucune position OCR validée pour cette page.');
    expect(screen.queryByRole('button',{name:'Mot 1 : Seconde'})).toBeNull();
    expect(fixture.load).toHaveBeenCalledTimes(1);
});
it('ne montre pas de positions pour un texte non validé et garde le fichier lisible',async()=>{
    fixture.results.mockResolvedValue([{...result,statutValidation:'NON_VALIDE'}]);
    render(<DocumentPdfPreview blob={blob()} fileId="file1"/>);
    await screen.findByText('Aucune position OCR validée pour cette page.');
    expect(fixture.layout).not.toHaveBeenCalled();
    expect(await screen.findByRole('img',{name:'Page 1 du document PDF'})).toBeTruthy();
});
it('conserve le PDF lorsque la lecture des positions est refusée',async()=>{
    fixture.layout.mockRejectedValue(new Error('Accès refusé'));
    render(<DocumentPdfPreview blob={blob()} fileId="file1"/>);
    await screen.findByRole('alert');
    expect(await screen.findByRole('img',{name:'Page 1 du document PDF'})).toBeTruthy();
    expect(screen.queryByRole('button',{name:'Mot 1 : NAPS2'})).toBeNull();
});
it('refuse une superposition dont les dimensions ne correspondent pas au PDF',async()=>{
    fixture.layout.mockResolvedValue({...layout(),width:1200,height:800});
    render(<DocumentPdfPreview blob={blob()} fileId="file1"/>);
    await screen.findByText(/Les dimensions OCR ne correspondent pas/);
    expect(screen.queryByRole('button',{name:'Mot 1 : NAPS2'})).toBeNull();
    expect(layoutFitsPage({...layout(),width:0},600,900)).toBe(false);
});
it('ignore une ancienne réponse de positions arrivée après le changement de page',async()=>{
    let resolve!: (value:OcrLayout)=>void;
    fixture.layout.mockImplementation((_id,_signal,page)=>page===1?new Promise<OcrLayout>(yes=>{resolve=yes;}):Promise.resolve(layout(page)));
    render(<DocumentPdfPreview blob={blob()} fileId="file1"/>);
    await screen.findByText('Page native 1');
    await waitFor(()=>expect(fixture.layout).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button',{name:'Page suivante'}));
    await screen.findByRole('button',{name:'Mot 1 : Seconde'});
    await act(async()=>{resolve(layout(1));});
    expect(screen.queryByRole('button',{name:'Mot 1 : NAPS2'})).toBeNull();
    expect(screen.getByRole('button',{name:'Mot 1 : Seconde'})).toBeTruthy();
});

it('ouvre directement la page ciblée et surligne le mot recherché sans changer de résultat OCR',async()=>{
    render(<DocumentPdfPreview blob={blob()} fileId="file1" searchFocus={{resultId:'ocr1',page:2,query:'seconde'}}/>);
    const word=await screen.findByRole('button',{name:'Mot 1 : Seconde'});
    expect(screen.getByText('Page 2 sur 3')).toBeTruthy();
    expect(word.classList.contains('search-match')).toBe(true);
    await waitFor(()=>expect(word.getAttribute('aria-pressed')).toBe('true'));
    expect(word.closest('[translate]')?.getAttribute('translate')).toBe('no');
    expect(screen.getByText('seconde').getAttribute('translate')).toBe('no');
    expect(fixture.page.mock.calls.every(c=>c[0]===2)).toBe(true);
    expect(screen.getByRole('button',{name:'Mot 2 : document'}).classList.contains('search-match')).toBe(false);
    fireEvent.change(screen.getByRole('combobox',{name:'Zoom'}),{target:{value:'2'}});
    await waitFor(()=>expect((screen.getByRole('img') as HTMLCanvasElement).width).toBe(1200));
    expect(screen.getByRole('button',{name:'Mot 1 : Seconde'}).classList.contains('search-match')).toBe(true);
    fireEvent.click(screen.getByRole('button',{name:'Page précédente'}));
    await screen.findByRole('button',{name:'Mot 1 : NAPS2'});
    expect(document.querySelectorAll('.search-match')).toHaveLength(0);
});
it('ne substitue pas un autre OCR lorsque le résultat ciblé a perdu sa validation',async()=>{
    fixture.results.mockResolvedValue([{...result,id:'other'},{...result,statutValidation:'NON_VALIDE'}]);
    render(<DocumentPdfPreview blob={blob()} fileId="file1" searchFocus={{resultId:'ocr1',page:2,query:'seconde'}}/>);
    await screen.findByText('Aucune position OCR validée pour cette page.');
    expect(fixture.layout).not.toHaveBeenCalled();
    expect(screen.getByText('Page 2 sur 3')).toBeTruthy();
});
it('signale une page ciblée hors du PDF et revient à la première page sans cadres erronés',async()=>{
    render(<DocumentPdfPreview blob={blob()} fileId="file1" searchFocus={{resultId:'ocr1',page:99,query:'seconde'}}/>);
    await screen.findByText('La page demandée n’existe plus dans ce PDF. La première page est affichée.');
    await screen.findByRole('button',{name:'Mot 1 : NAPS2'});
    expect(screen.getByText('Page 1 sur 3')).toBeTruthy();
    expect(fixture.page.mock.calls.every(c=>c[0]===1)).toBe(true);
    expect(document.querySelectorAll('.search-match')).toHaveLength(0);
});
