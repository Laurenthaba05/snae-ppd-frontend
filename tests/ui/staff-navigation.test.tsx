import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { StaffNavigation } from '../../src/ui/StaffNavigation';
import { navigationSections, moduleVisible, type NavigationItem } from '../../src/design/navigation';
import type { Me } from '../../src/core/types';

const items: NavigationItem[] = [
    { path:'users', label:'Utilisateurs', ok:true },
    { path:'recherche', label:'Recherche', ok:true },
    { path:'documents', label:'Documents', ok:true },
    { path:'ocr', label:'OCR et indexation', ok:true },
    { path:'scanners', label:'Scanners', ok:true },
    { path:'codification', label:'Codification des références', ok:true },
    { path:'roles', label:'Rôles confidentiels', ok:false },
    { path:'profile', label:'Mon profil', ok:true }
];

it('les rubriques suivent le travail métier, sans perdre ni dupliquer les écrans accessibles', () => {
    const groups = navigationSections([...items, {path:'nouvel-espace',label:'Nouvel espace',ok:true}]);
    expect(groups.map(g => g.id)).toEqual(['workspace','collect','records','reference','identity','support','other']);
    const paths = groups.flatMap(g => g.items.map(i => i.path));
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toEqual(expect.arrayContaining(items.filter(i => i.ok).map(i => i.path)));
    expect(paths).not.toContain('roles');
    expect(paths).toContain('nouvel-espace');
});

it('ouvre la rubrique courante, avec un seul volet et des liens directs conservés', () => {
    render(<StaffNavigation items={items} section="ocr" demo={false} onGo={() => {}} />);
    expect(screen.getByRole('button', {name:'Collecte & traitement'}).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('link', {name:'OCR et indexation'}).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', {name:'OCR et indexation'}).getAttribute('href')).toBe('/app/ocr');
    expect(screen.queryByRole('link', {name:'Utilisateurs'})).toBeNull();
    fireEvent.click(screen.getByRole('button', {name:'Administration'}));
    expect(screen.getByRole('link', {name:'Utilisateurs'})).toBeTruthy();
    expect(screen.queryByRole('link', {name:'Scanners'})).toBeNull();
    expect(screen.queryByText('Rôles confidentiels')).toBeNull();
});

it('le filtre retrouve les accents, les rubriques et les mots multiples sans révéler les écrans interdits', () => {
    render(<StaffNavigation items={items} section="" demo={false} onGo={() => {}} />);
    const field = screen.getByRole('searchbox', {name:'Filtrer le menu'});
    fireEvent.change(field, {target:{value:'references codification'}});
    expect(screen.getByRole('link', {name:'Codification des références'})).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Écrans trouvés : 1');
    fireEvent.change(field, {target:{value:'collecte'}});
    expect(screen.getByRole('link', {name:'Scanners'})).toBeTruthy();
    expect(screen.getByRole('link', {name:'OCR et indexation'})).toBeTruthy();
    fireEvent.change(field, {target:{value:'confidentiels'}});
    expect(screen.getByText('Aucun écran accessible ne correspond à ce filtre.')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Écrans trouvés : 0');
    fireEvent.click(screen.getByRole('button', {name:'Effacer le filtre du menu'}));
    expect(document.activeElement).toBe(field);
    expect(screen.getByRole('link', {name:'Recherche'})).toBeTruthy();
});

it('une navigation ouvre la nouvelle rubrique et enlève le filtre précédent', () => {
    const view = render(<StaffNavigation items={items} section="ocr" demo={false} onGo={() => {}} />);
    fireEvent.change(screen.getByRole('searchbox'), {target:{value:'ocr'}});
    view.rerender(<StaffNavigation items={items} section="users" demo={false} onGo={() => {}} />);
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('link', {name:'Utilisateurs'}).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', {name:'Administration'}).getAttribute('aria-expanded')).toBe('true');
});

it('retire immédiatement un droit révoqué et sa rubrique, même avec un filtre actif', () => {
    const view = render(<StaffNavigation items={items} section="users" demo={false} onGo={() => {}} />);
    fireEvent.change(screen.getByRole('searchbox'), {target:{value:'utilisateurs'}});
    view.rerender(<StaffNavigation items={items.map(i => ({...i,ok:i.ok && i.path !== 'users'}))} section="users" demo={false} onGo={() => {}} />);
    expect(screen.queryByRole('link', {name:'Utilisateurs'})).toBeNull();
    expect(screen.queryByRole('button', {name:'Administration'})).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Écrans trouvés : 0');
});

it('conserve la navigation SPA et le comportement natif des clics modifiés', () => {
    const go = vi.fn();
    render(<StaffNavigation items={items} section="ocr" demo={false} onGo={go} />);
    const link = screen.getByRole('link', {name:'Scanners'});
    const modified = new MouseEvent('click', {bubbles:true,cancelable:true,ctrlKey:true});
    // Observer le traitement avant d'annuler le comportement natif de jsdom.
    let prevented = true;
    document.addEventListener('click', event => { prevented = event.defaultPrevented; event.preventDefault(); }, {once:true});
    link.dispatchEvent(modified);
    expect(prevented).toBe(false);
    expect(go).not.toHaveBeenCalled();
    fireEvent.click(link);
    expect(go).toHaveBeenCalledWith('scanners');
    fireEvent.click(screen.getByRole('link', {name:'Tableau de bord'}));
    expect(go).toHaveBeenLastCalledWith('');
});

it('un agent de recette ne voit que les écrans de son périmètre autorisé', () => {
    const me = {user:{id:'agent',status:'ACTIF',accountType:'USER'},grants:[{permission:'DOCUMENT_READ',scope:'INSTITUTION',institutionId:'M-001',departmentId:null,expiresAt:null}]} as Me;
    const routes = [{path:'documents',label:'Documents'},{path:'ocr',label:'OCR et indexation'},{path:'conservation',label:'Conservation'}];
    const allowed = (institutionId:string) => routes.map(i => ({...i,ok:moduleVisible(me,i.path,{institutionId})}));
    const view = render(<StaffNavigation items={allowed('M-001')} section="documents" demo={false} onGo={() => {}} />);
    const nav = screen.getByRole('navigation');
    expect(within(nav).getByRole('link', {name:'Documents'})).toBeTruthy();
    expect(within(nav).queryByText('OCR et indexation')).toBeNull();
    expect(within(nav).queryByText('Conservation')).toBeNull();
    view.rerender(<StaffNavigation items={allowed('M-002')} section="documents" demo={false} onGo={() => {}} />);
    expect(within(nav).queryByRole('link', {name:'Documents'})).toBeNull();
});
