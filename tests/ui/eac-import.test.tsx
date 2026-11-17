import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import { beforeEach, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ epoch: 1, me: null as unknown }));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
import { EacImport } from '../../src/ui/EacImport';
import type { ArchivesApi, EacPreview } from '../../src/api/archives';

const api = { previewEac: vi.fn(), importEac: vi.fn() };
const good: EacPreview = { hash: 'h', format: 'EAC-CPF 3', issues: [], warnings: [], authorities: [
    {file:'a.xml',recordId:'urn:1',code:'A',name:'Service',kind:'COLLECTIVITE',details:{status:'BROUILLON',dateEnd:'2000'},actorId:null,action:'CREATE',existingId:null,changes:[]},
    {file:'b.xml',recordId:'urn:2',code:'B',name:'Ministère',kind:'COLLECTIVITE',details:{status:'BROUILLON'},actorId:null,action:'CREATE',existingId:null,changes:[]}],
    relations:[{source:'A · Service',target:'B · Ministère',type:'TUTELLE',dateStart:'1990',dateEnd:null,description:'Tutelle',action:'CREATE',existingId:null,changes:[]}] };
const setup = () => { const onClose=vi.fn(),onImported=vi.fn();render(<EacImport api={api as unknown as ArchivesApi} institution="inst" onClose={onClose} onImported={onImported}/>);return {onClose,onImported}; };
const upload = async (files = [new File(['<eac/>'],'a.xml'),new File(['<eac/>'],'b.xml')]) => {
    fireEvent.change(screen.getByLabelText('Fichiers EAC-CPF (.xml)'),{target:{files}});
    await waitFor(() => expect((screen.getByRole('button',{name:'Contrôler les fichiers'}) as HTMLButtonElement).disabled).toBe(false));
};
const check=async()=>{fireEvent.click(screen.getByRole('button',{name:'Contrôler les fichiers'}));await screen.findByRole('status');};
beforeEach(()=>{fixture.epoch++;api.previewEac.mockReset().mockResolvedValue(good);api.importEac.mockReset().mockResolvedValue({count:2,relations:1,ids:['a','b']});});
it('prévisualise les producteurs et le sens des relations avant de confirmer le lot',async()=>{
    const callbacks=setup();await upload();await check();expect(screen.getByText('relève de')).toBeTruthy();expect(screen.getByRole('status').textContent).toContain('2 producteur(s) et 1 relation(s)');
    fireEvent.click(screen.getByRole('button',{name:'Confirmer l’import'}));await waitFor(()=>expect(callbacks.onImported).toHaveBeenCalledWith({count:2,relations:1,ids:['a','b']}));
    expect(api.importEac.mock.calls[0][1]).toHaveLength(2);expect(api.importEac.mock.calls[0][2]).toBe('h');expect(callbacks.onClose).toHaveBeenCalled();
});
it('une erreur de destination bloque la confirmation et un nouveau fichier invalide l’aperçu',async()=>{
    api.previewEac.mockResolvedValue({...good,issues:[{file:'a.xml',message:'Destination indisponible'}]});setup();await upload();await check();
    expect(screen.getByRole('alert').textContent).toContain('Destination indisponible');expect((screen.getByRole('button',{name:'Confirmer l’import'}) as HTMLButtonElement).disabled).toBe(true);
    await upload([new File(['<eac/>'],'nouveau.xml')]);expect(screen.queryByRole('status')).toBeNull();expect(api.importEac).not.toHaveBeenCalled();
});
it('une nouvelle tentative après une erreur réseau conserve la clé d’idempotence',async()=>{
    api.importEac.mockRejectedValueOnce(new Error('Réseau interrompu'));setup();await upload();await check();fireEvent.click(screen.getByRole('button',{name:'Confirmer l’import'}));await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button',{name:'Confirmer l’import'}));await waitFor(()=>expect(api.importEac).toHaveBeenCalledTimes(2));expect(api.importEac.mock.calls[0][3]).toBe(api.importEac.mock.calls[1][3]);
});
it('refuse les fichiers trop volumineux et les encodages illisibles avant tout appel',async()=>{
    setup();fireEvent.change(screen.getByLabelText('Fichiers EAC-CPF (.xml)'),{target:{files:[new File(['x'.repeat(5_000_001)],'gros.xml')]}});expect(screen.getByRole('alert').textContent).toContain('5 Mo');
    fireEvent.change(screen.getByLabelText('Fichiers EAC-CPF (.xml)'),{target:{files:[new File([new Uint8Array([0xff])],'invalide.xml')]}});await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('UTF-8'));expect(api.previewEac).not.toHaveBeenCalled();
});
it('affiche les limitations et ne présente aucune violation automatique d’accessibilité',async()=>{
    api.previewEac.mockResolvedValue({...good,warnings:['Élément non repris : occupations.']});setup();await upload();await check();expect(screen.getByText('Élément non repris : occupations.')).toBeTruthy();
    const result=await axe.run(document.body,{rules:{'color-contrast':{enabled:false}}});expect(result.violations.map(v=>v.id)).toEqual([]);
});

it('le mode mise à jour affiche avant et après, transmet le mode et invalide son aperçu au changement', async () => {
    api.previewEac.mockResolvedValue({...good, authorities:[{...good.authorities[0], action:'UPDATE', existingId:'a', changes:[{field:'name',before:'Ancien service',after:'Service'}, {field:'status',before:'VALIDEE',after:'BROUILLON'}]}], relations:[{...good.relations[0],action:'UPDATE',existingId:'r',changes:[{field:'description',before:'Ancienne note',after:'Tutelle'}]}]});
    const callbacks=setup();await upload();fireEvent.click(screen.getByRole('checkbox',{name:'Mettre à jour les producteurs existants'}));await check();
    expect(api.previewEac.mock.calls[0][3]).toBe(true);expect(screen.getAllByLabelText('Différences avant confirmation')).toHaveLength(2);
    expect(screen.getByText(/Avant : Ancien service/).textContent).toContain('Après : Service');expect(screen.getByText(/Avant : Validée/).textContent).toContain('Après : Brouillon');
    fireEvent.click(screen.getByRole('button',{name:'Confirmer les créations et mises à jour'}));await waitFor(()=>expect(callbacks.onImported).toHaveBeenCalled());expect(api.importEac.mock.calls[0][5]).toBe(true);
    fireEvent.click(screen.getByRole('checkbox',{name:'Mettre à jour les producteurs existants'}));expect(screen.queryByRole('status')).toBeNull();expect((screen.getByRole('button',{name:'Confirmer l’import'}) as HTMLButtonElement).disabled).toBe(true);
});
it('un aperçu périmé affiche le refus et laisse recalculer les différences avant une nouvelle confirmation',async()=>{
    api.importEac.mockRejectedValueOnce(new Error('Aperçu périmé : contrôlez à nouveau le lot.'));setup();await upload();await check();fireEvent.click(screen.getByRole('button',{name:'Confirmer l’import'}));await screen.findByRole('alert');
    api.previewEac.mockResolvedValue({...good,hash:'new-hash'});await check();fireEvent.click(screen.getByRole('button',{name:'Confirmer l’import'}));await waitFor(()=>expect(api.importEac).toHaveBeenCalledTimes(2));
    expect(api.importEac.mock.calls[1][2]).toBe('new-hash');expect(api.importEac.mock.calls[1][3]).not.toBe(api.importEac.mock.calls[0][3]);
});
