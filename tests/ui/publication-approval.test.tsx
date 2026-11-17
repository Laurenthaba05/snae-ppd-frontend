import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { PublicationPanel } from '../../src/ui/RecordPublication';
const state=vi.hoisted(()=>({epoch:0, permitted:true, publication:{documentPublications:vi.fn(),licences:vi.fn(),command:vi.fn()}}));
vi.mock('../../src/auth/session',()=>({useSession:()=>({...state,me:{}})}));
vi.mock('../../src/ui/workspace',()=>({useWorkspace:()=>({scope:{}})}));
vi.mock('../../src/core/policy',()=>({can:(_me:unknown,p:string)=>p==='DOCUMENT_DESCRIPTION_UPDATE'?state.permitted:true}));
vi.mock('../../src/ui/RecordFiles',()=>({useDocumentFiles:()=>({files:[{id:'file',versionNumber:1,originalFilename:'recette.pdf'}],loading:false})}));
vi.mock('../../src/ui/ResourceDetails',()=>({ResourceDetailsButton:()=>null}));
beforeEach(()=>{vi.clearAllMocks();state.epoch++;state.permitted=true;state.publication.documentPublications.mockResolvedValue([]);state.publication.licences.mockResolvedValue([]);state.publication.command.mockResolvedValue({});});
it('exige une confirmation et un motif avant de rendre le document interne public',async()=>{
 const changed=vi.fn();render(<PublicationPanel documentId="doc" confidentiality="INTERNE" documentVersion={7} institutionId="institution" onPublished={changed}/>);
 fireEvent.click(screen.getByRole('button',{name:'Publier un fichier'}));
 await screen.findByRole('option',{name:'v1 — recette.pdf'});
 fireEvent.change(screen.getByLabelText('Fichier *'),{target:{value:'file'}});
 const approval=screen.getByRole('checkbox',{name:'Rendre ce document public et publier le fichier choisi'});
 expect((approval as HTMLInputElement).checked).toBe(false);
 fireEvent.click(approval);
 expect((screen.getByRole('button',{name:'Publier',exact:true}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.change(screen.getByLabelText('Motif de diffusion publique *'),{target:{value:'Trois pages fictives vérifiées'}});
 fireEvent.click(screen.getByRole('button',{name:'Publier',exact:true}));
 await waitFor(()=>expect(changed).toHaveBeenCalledOnce());
 expect(state.publication.command).toHaveBeenCalledWith('/documents/doc/publications',expect.objectContaining({fichierId:'file',makeDocumentPublic:true,documentVersion:7,publicAccessReason:'Trois pages fictives vérifiées'}),expect.any(String),'POST');
});
it('masque l’approbation sans le droit de modifier la description',async()=>{
 state.permitted=false;render(<PublicationPanel documentId="doc" confidentiality="INTERNE" documentVersion={7}/>);
 fireEvent.click(screen.getByRole('button',{name:'Publier un fichier'}));
 expect(screen.queryByRole('checkbox')).toBeNull();expect(screen.getByText(/Un responsable disposant aussi/)).toBeTruthy();
});
it('préserve la confidentialité quand la publication est créée sans approbation',async()=>{
 render(<PublicationPanel documentId="doc" confidentiality="INTERNE" documentVersion={7}/>);
 fireEvent.click(screen.getByRole('button',{name:'Publier un fichier'}));await screen.findByRole('option',{name:'v1 — recette.pdf'});
 fireEvent.change(screen.getByLabelText('Fichier *'),{target:{value:'file'}});fireEvent.click(screen.getByRole('button',{name:'Publier',exact:true}));
 await waitFor(()=>expect(state.publication.command).toHaveBeenCalledOnce());
 expect(state.publication.command.mock.calls[0][1].makeDocumentPublic).toBeUndefined();
});
