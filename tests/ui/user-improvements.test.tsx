import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const fixture=vi.hoisted(()=>({ api:{userOverview:vi.fn()},epoch:1 }));
vi.mock('../../src/auth/session',()=>({useSession:()=>fixture}));
import { UserDirectoryOverview } from '../../src/ui/UserDirectoryOverview';
import { ModuleFinder } from '../../src/ui/ModuleFinder';
import { useDebouncedValue } from '../../src/ui/useDebouncedValue';
const items=[{path:'users',label:'Utilisateurs',ok:true},{path:'fonds',label:'Fonds et producteurs',ok:true},{path:'roles',label:'Rôles secrets',ok:false}];
beforeEach(()=>{ localStorage.clear();vi.clearAllMocks(); fixture.api.userOverview.mockResolvedValue({total:31,active:20,inactive:8,suspended:3,archived:0,human:31,service:0,missingEmail:2,missingSso:0,missingName:1}); });
it('les indicateurs se chargent à la demande, avec les filtres et sans pagination',async()=>{
 render(<UserDirectoryOverview params={{institutionId:'i1',status:'ACTIF'}}/>);
 expect(fixture.api.userOverview).not.toHaveBeenCalled();fireEvent.click(screen.getByText('Vue d’ensemble des comptes'));
 await screen.findByText('Comptes trouvés');expect(fixture.api.userOverview).toHaveBeenCalledWith({institutionId:'i1',status:'ACTIF'},expect.anything());
 expect(screen.getByText('Sans adresse e-mail').nextSibling?.textContent).toBe('2');
});
it('une erreur des indicateurs reste explicite et peut être relue',async()=>{
 fixture.api.userOverview.mockRejectedValueOnce(new Error('Lecture interrompue'));
 render(<UserDirectoryOverview params={{}}/>);fireEvent.click(screen.getByText('Vue d’ensemble des comptes'));
 await screen.findByText('Lecture interrompue');fireEvent.click(screen.getByText('Réessayer la lecture'));await screen.findByText('Comptes trouvés');
});
it('la recherche d’écrans ignore les accents, respecte les droits et navigue au clavier',async()=>{
 const go=vi.fn();render(<ModuleFinder userId="u1" items={items} onGo={go}/>);
 fireEvent.keyDown(window,{key:'k',ctrlKey:true});expect(screen.getByRole('dialog')).toBeTruthy();
 expect(screen.queryByText('Rôles secrets')).toBeNull();fireEvent.change(screen.getByLabelText('Rechercher un écran'),{target:{value:'producteurs'}});
 fireEvent.click(screen.getByText('Fonds et producteurs'));expect(go).toHaveBeenCalledWith('fonds');expect(screen.queryByRole('dialog')).toBeNull();
});
it('les favoris sont personnels, limités aux écrans autorisés et une révocation les masque',()=>{
 const go=vi.fn();const view=render(<ModuleFinder userId="u1" items={items} onGo={go}/>);
 fireEvent.click(screen.getByLabelText('Trouver un écran'));fireEvent.click(screen.getByLabelText('Ajouter aux favoris : Utilisateurs'));
 expect(JSON.parse(localStorage.getItem('snae-module-favorites-v1:u1')!)).toEqual(['users']);
 view.rerender(<ModuleFinder userId="u1" items={items.map(i=>({...i,ok:i.path==='fonds'}))} onGo={go}/>);
 expect(screen.queryByText('Utilisateurs')).toBeNull();view.rerender(<ModuleFinder userId="u2" items={items} onGo={go}/>);
 fireEvent.click(screen.getByLabelText('Trouver un écran'));expect(screen.getByLabelText('Ajouter aux favoris : Utilisateurs').getAttribute('aria-pressed')).toBe('false');
});
it('un stockage invalide ou indisponible ne bloque pas la navigation',()=>{
 localStorage.setItem('snae-module-favorites-v1:u1','bad');const spy=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('denied');});
 try { render(<ModuleFinder userId="u1" items={items} onGo={()=>{}}/>);fireEvent.click(screen.getByLabelText('Trouver un écran'));fireEvent.click(screen.getByLabelText('Ajouter aux favoris : Utilisateurs'));expect(screen.getByText(/Le navigateur refuse/)).toBeTruthy(); } finally { spy.mockRestore(); }
});
it('une rafale de frappe ne déclenche que la dernière recherche après une pause',async()=>{
 vi.useFakeTimers();const observed=vi.fn();function Probe({value}:{value:string}){const result=useDebouncedValue(value);React.useEffect(()=>{observed(result);},[result]);return <span>{result}</span>;}
 try{const view=render(<Probe value=""/>);for(const value of ['a','al','alp','alph','alpha']) view.rerender(<Probe value={value}/>);
 expect(observed).toHaveBeenCalledTimes(1);await act(async()=>{vi.advanceTimersByTime(300);});expect(observed).toHaveBeenCalledTimes(2);expect(observed).toHaveBeenLastCalledWith('alpha');
 view.rerender(<Probe value=""/>);expect(observed).toHaveBeenLastCalledWith('');}finally{vi.useRealTimers();}
});

it('la démonstration applique les mêmes filtres de comptes et ses compteurs restent fictifs',async()=>{
 const {DemoTransport,DEMO_IDS}=await import('../../src/demo/transport');const {IamApi}=await import('../../src/api/iam');
 const transport=new DemoTransport();const api=new IamApi(transport);
 expect((await api.userOverview({accountScope:'NATIONAL'})).total).toBe(2);
 expect((await api.list('users',{accountScope:'DEPARTEMENT'})).items).toHaveLength(1);
 expect((await api.userOverview({completeness:'MISSING_EMAIL'})).total).toBe(0);
 transport.persona='agent';await expect(api.userOverview({})).rejects.toThrow();
 expect((await api.userOverview({institutionId:DEMO_IDS.institution})).total).toBe(1);
});
