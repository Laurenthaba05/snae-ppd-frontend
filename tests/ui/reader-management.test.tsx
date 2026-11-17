import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Me } from '../../src/core/types';
const state = vi.hoisted(() => ({me:null as Me|null,scope:{institutionId:'M-001',departmentId:null},consultations:vi.fn(),communications:vi.fn(),room:vi.fn(),readers:vi.fn()}));
vi.mock('../../src/auth/session', () => ({useSession:()=>({me:state.me,demo:false,epoch:1,logout:vi.fn()}),useOptionalSession:()=>({me:state.me})}));
vi.mock('../../src/ui/workspace', () => ({useWorkspace:()=>({scope:state.scope,setScope:vi.fn()})}));
vi.mock('../../src/ui/names', () => ({useScopeText:()=>state.scope.institutionId}));
vi.mock('../../src/ui/ReferencePicker', () => ({ReferencePicker:()=>null}));
vi.mock('../../src/pages/Consultations',()=>({ConsultationsPage:()=>{state.consultations();return <h1>Demandes réelles</h1>;},CommunicationsPage:()=>{state.communications();return <h1>Communications réelles</h1>;}}));
vi.mock('../../src/pages/ReadingRoom',()=>({ReadingRoomPage:()=>{state.room();return <h1>Salle autorisée</h1>;}}));
vi.mock('../../src/pages/PortalAdmin',()=>({PortalAdminPage:()=>{state.readers();return <h1>Administration lecteurs</h1>;}}));
import { ReaderManagement } from '../../src/portal/ReaderManagement';
import { StaffNavigation } from '../../src/ui/StaffNavigation';
import { navigate } from '../../src/ui/navigation';
import { canonicalStaffPath, readerManagementSection, isReaderManagementPath, staffHref } from '../../src/core/staffRoutes';
const admin=(permission:string,scope='INSTITUTION',institutionId:string|null='M-001',expiresAt:string|null=null) => ({user:{id:'agent',prenom:'Agent',nom:'Recette',status:'ACTIF',accountType:'USER',scope:'INSTITUTION',institutionId:'M-001',departmentId:null},grants:[{permission,scope,institutionId,expiresAt}]} as Me);
beforeEach(()=>{state.me=null;vi.clearAllMocks();history.replaceState(null,'','/portail/gestion');});

it('les anciens liens mènent aux nouveaux écrans en conservant les paramètres',()=>{
 expect(staffHref('consultations?tab=portail')).toBe('/portail/gestion/consultations?tab=portail');
 expect(staffHref('communications')).toBe('/portail/gestion/communications');
 expect(staffHref('salle-lecture')).toBe('/portail/gestion/salle-lecture');
 expect(staffHref('portail')).toBe('/portail/gestion/lecteurs');
 expect(canonicalStaffPath('/app/consultations?tab=portail')).toBe('/portail/gestion/consultations?tab=portail');
 expect(staffHref('documents/id?onglet=ocr')).toBe('/app/documents/id?onglet=ocr');
 navigate('/app/communications');expect(location.pathname).toBe('/portail/gestion/communications');
});
it('les chemins voisins ou incomplets ne donnent pas accès à un écran de gestion',()=>{
 expect(isReaderManagementPath('/portail/gestionnaires')).toBe(false);
 expect(readerManagementSection('/portail/gestion')).toBe('');
 expect(readerManagementSection('/portail/gestion/lecteurs')).toBe('portail');
 for(const path of ['/portail/gestion/lecteurs/secret','/portail/gestion/documents','/portail/gestion/portail','/portail/gestion/../documents','/portail/documents']) expect(readerManagementSection(path)).toBeNull();
});
it('le menu propose un lien direct vers la gestion dans le portail',()=>{
 const go=vi.fn();render(<StaffNavigation section="" demo={false} onGo={go} items={[{path:'espace-lecteurs',label:'Consultation & diffusion',ok:true}]} />);
 const link=screen.getByRole('link',{name:'Consultation & diffusion'});expect(link.getAttribute('href')).toBe('/portail/gestion');fireEvent.click(link);expect(go).toHaveBeenCalledWith('espace-lecteurs');
 expect(screen.queryByRole('button',{name:'Consultation & diffusion'})).toBeNull();
});
it('un visiteur sans identité du personnel ne monte aucun écran interne',()=>{
 history.replaceState(null,'','/portail/gestion/lecteurs');render(<ReaderManagement />);
 expect(screen.getByText(/Connectez-vous avec un compte professionnel/)).toBeTruthy();
 expect(state.readers).not.toHaveBeenCalled();expect(state.consultations).not.toHaveBeenCalled();
});
it('un droit institutionnel ouvre uniquement la gestion correspondante dans le périmètre autorisé',async()=>{
 state.me=admin('CONSULTATION_READ');render(<ReaderManagement />);
 const nav=screen.getByRole('navigation',{name:'Gestion des services aux lecteurs'});
 expect(within(nav).getByRole('link',{name:'Consultations'})).toBeTruthy();expect(within(nav).queryByRole('link',{name:'Gestion des lecteurs'})).toBeNull();
 fireEvent.click(within(nav).getByRole('link',{name:'Consultations'}));
 expect(await screen.findByRole('heading',{name:'Demandes réelles'})).toBeTruthy();expect(location.pathname).toBe('/portail/gestion/consultations');
 expect(state.readers).not.toHaveBeenCalled();
});
it.each([
 ['mauvaise institution',()=>admin('READING_ROOM_READ','INSTITUTION','M-002')],
 ['droit expiré',()=>admin('READING_ROOM_READ','INSTITUTION','M-001','2000-01-01T00:00:00Z')],
 ['compte suspendu',()=>{const me=admin('READING_ROOM_READ');me.user.status='SUSPENDU';return me;}],
 ['aucun droit',()=>({...admin('READING_ROOM_READ'),grants:[]})]
])('le lien direct est refusé pour %s',(_label,identity)=>{
 state.me=identity();history.replaceState(null,'','/portail/gestion/salle-lecture');render(<ReaderManagement />);
 expect(screen.getByText(/Cet espace n’est pas disponible/)).toBeTruthy();expect(state.room).not.toHaveBeenCalled();
});
it('une révocation retire la page sans appeler ses données une nouvelle fois',async()=>{
 state.me=admin('PORTAL_READ','NATIONAL',null);history.replaceState(null,'','/portail/gestion/lecteurs');
 const view=render(<ReaderManagement />);await screen.findByRole('heading',{name:'Administration lecteurs'});
 const calls=state.readers.mock.calls.length;state.me={...state.me,grants:[]};view.rerender(<ReaderManagement />);
 await waitFor(()=>expect(screen.queryByRole('heading',{name:'Administration lecteurs'})).toBeNull());expect(state.readers).toHaveBeenCalledTimes(calls);
});
