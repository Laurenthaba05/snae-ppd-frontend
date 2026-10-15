import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
const request = vi.hoisted(() => vi.fn());
vi.mock('../../src/auth/session', () => ({ useSession: () => ({ records: { transport: { request } }, epoch: 1 }) }));
import { ArchiveProcessingPicker } from '../../src/ui/ArchiveProcessingPicker';
const institution='11111111-1111-4111-8111-111111111111', id='22222222-2222-4222-8222-222222222222';
it('recherche et sélectionne un intervenant via le périmètre archivistique sans administration IAM', async () => {
    request.mockImplementation(async (path:string) => ({ items: [{id,name:path.includes('query=Keita')?'Mariam Keita':'Administrateur central'}], page:0, hasMore:false }));
    const change=vi.fn();
    render(<ArchiveProcessingPicker institution={institution} value="" label="Intervenant 1" disabled={false} onChange={change}/>);
    expect(request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Intervenant 1'}));
    await screen.findByRole('button',{name:'Administrateur central'});
    fireEvent.change(screen.getByLabelText('Rechercher Intervenant 1'),{target:{value:'Keita'}});
    fireEvent.click(await screen.findByRole('button',{name:'Mariam Keita'}));
    expect(change).toHaveBeenCalledWith(id);
    expect(request.mock.calls.every(c=>c[0].startsWith('/archives/processing-agents?institutionId='+institution))).toBe(true);
});
it('résout le nom enregistré sans afficher de données du compte', async () => {
    request.mockResolvedValue({items:[],page:0,hasMore:false,selected:{id,name:'Mariam Keita'}});
    render(<ArchiveProcessingPicker institution={institution} value={id} label="Intervenant 1" disabled onChange={()=>{}}/>);
    await waitFor(()=>expect(screen.getByRole('button',{name:'Intervenant 1'}).textContent).toBe('Mariam Keita'));
    expect(request.mock.calls.at(-1)?.[0]).toContain('selectedId='+id);
});
