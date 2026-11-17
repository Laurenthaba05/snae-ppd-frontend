import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { TreatmentClassificationPanel } from '../../src/ui/TreatmentClassification';
import { ReclassifyDialog, usableClassification } from '../../src/ui/DocumentClassification';
import { classificationContextText } from '../../src/core/workflow';
import type { ClassificationNode } from '../../src/core/types';
const f = vi.hoisted(() => ({ epoch: 0, me: { user: { status: 'ACTIF', accountType: 'USER' }, grants: [] as Array<{permission: string; scope: string; institutionId: string; expiresAt: null}> }, records: { document: vi.fn(), dossier: vi.fn(), classify: vi.fn() }, classification: { nodes: vi.fn(), suggestions: vi.fn(), acceptSuggestion: vi.fn() } }));
vi.mock('../../src/auth/session', () => ({ useSession: () => f }));
vi.mock('../../src/ui/navigation', () => ({ navigate: vi.fn() }));
import { navigate } from '../../src/ui/navigation';
const node = { id: 'node', institutionId: 'inst', code: 'FIN', libelle: 'Finances', statut: 'ACTIF', dateDebutValidite: null, dateFinValidite: null } as ClassificationNode;
const document = { id: 'doc', title: 'Recette multipage', reference: 'RECETTE', institutionId: 'inst', departmentId: null, dossierId: 'folder', classificationNodeId: null, businessStatus: 'BROUILLON', archivalStatus: 'BROUILLON', versionLock: 0 };
const grants = (...permissions: string[]) => { f.me.grants = permissions.map(permission => ({permission, scope: 'INSTITUTION', institutionId: 'inst', expiresAt: null})); };
beforeEach(() => {
    vi.clearAllMocks(); f.epoch++;
    grants('DOCUMENT_READ','DOSSIER_READ','CLASSIFICATION_READ','DOCUMENT_CLASSIFY');
    f.records.document.mockResolvedValue(document);
    f.records.dossier.mockResolvedValue({ ...document, id: 'folder', title: 'Dossier financier', reference: 'DOS', classificationNodeId: 'node' });
    f.classification.nodes.mockResolvedValue([node]);
    f.classification.suggestions.mockResolvedValue({revision:'abc', currentNodeId:null, candidates:[{nodeId:'node',code:'FIN',label:'Finances',score:100,matchedTerms:['alpha']}], ocrResults:3,unvalidatedResults:0,ocrPending:false,limited:false});
    f.classification.acceptSuggestion.mockResolvedValue(undefined); f.records.classify.mockResolvedValue({});
});
it('relie document dossier plan et propositions sans classer automatiquement', async () => {
    render(<TreatmentClassificationPanel documentId="doc" onChanged={vi.fn()} />);
    await screen.findByText('DOS · Dossier financier');
    expect(screen.getByText(/Classement obligatoire avant la validation finale/)).toBeTruthy();
    expect(f.records.classify).not.toHaveBeenCalled(); expect(f.classification.acceptSuggestion).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Ouvrir la fiche et les métadonnées'}));
    expect(navigate).toHaveBeenCalledWith('/app/documents/doc');
    fireEvent.click(screen.getByText('Proposer le classement du dossier'));
    await waitFor(() => expect(f.classification.suggestions).toHaveBeenCalledWith('dossiers','folder',expect.any(AbortSignal)));
});
it('enregistre uniquement après choix et validation humaine puis actualise le traitement', async () => {
    const changed=vi.fn(); render(<TreatmentClassificationPanel documentId="doc" onChanged={changed} />);
    fireEvent.click(await screen.findByRole('button',{name:'Choisir cette rubrique'}));
    fireEvent.change(screen.getByLabelText('Motif de validation'),{target:{value:'Vérifié sur le document de recette'}});
    fireEvent.click(screen.getByRole('button',{name:'Valider le classement'}));
    await waitFor(() => expect(changed).toHaveBeenCalledOnce());
    expect(f.classification.acceptSuggestion).toHaveBeenCalledWith('documents','doc',{nodeId:'node',revision:'abc',reason:'Vérifié sur le document de recette'});
});
it('affiche un dossier classé sans le confondre avec le classement du document', async () => {
    render(<TreatmentClassificationPanel documentId="doc" onChanged={vi.fn()} />);
    await screen.findByText(/Rubrique du dossier : FIN/);
    expect(screen.getByText(/Le classement du dossier ne suffit pas/)).toBeTruthy();
});
it('ne lit pas de document sans habilitation documentaire', async () => {
    grants('DIGITIZATION_READ');render(<TreatmentClassificationPanel documentId="doc" onChanged={vi.fn()} />);
    expect(await screen.findByText(/nécessite l’habilitation de lecture documentaire/)).toBeTruthy();
    expect(f.records.document).not.toHaveBeenCalled();expect(f.classification.nodes).not.toHaveBeenCalled();
});
it('ne propose pas de mutation pour les lecteurs ou les documents clôturés', async () => {
    grants('DOCUMENT_READ','CLASSIFICATION_READ');f.records.document.mockResolvedValue({...document,businessStatus:'CLOS'});
    render(<TreatmentClassificationPanel documentId="doc" onChanged={vi.fn()} />);
    await screen.findByText('FIN · Finances');
    expect(screen.queryByText('Choisir dans le plan')).toBeNull();expect(screen.queryByText('Choisir cette rubrique')).toBeNull();expect(f.records.dossier).not.toHaveBeenCalled();
});
it('respecte les permissions du document et non celles d’une autre institution', async () => {
    f.me.grants.forEach(g=>g.institutionId='autre');render(<TreatmentClassificationPanel documentId="doc" onChanged={vi.fn()} />);
    await screen.findByText(/consultation des rubriques nécessite/);
    expect(f.classification.nodes).not.toHaveBeenCalled();expect(f.classification.suggestions).not.toHaveBeenCalled();
});
it('signale une erreur de lecture sans présenter un document comme non classé', async () => {
    f.records.document.mockRejectedValue(new Error('Document inaccessible'));
    render(<TreatmentClassificationPanel documentId="doc" onChanged={vi.fn()} />);
    await screen.findByRole('button',{name:'Réessayer la lecture'});
    expect(screen.queryByText(/Classement obligatoire avant/)).toBeNull();expect(f.classification.suggestions).not.toHaveBeenCalled();
});
it('permet de classer un document semi-actif encore ouvert comme le backend', async () => {
    f.records.document.mockResolvedValue({...document,archivalStatus:'SEMI_ACTIF',dossierId:null});
    render(<TreatmentClassificationPanel documentId="doc" onChanged={vi.fn()} />);
    expect(await screen.findByRole('button',{name:'Choisir dans le plan'})).toBeTruthy();
});
it('ne permet pas de soumettre un choix lorsque le plan ne se charge pas', async () => {
    f.classification.nodes.mockRejectedValue(new Error('Plan indisponible'));
    render(<ReclassifyDialog documentId="doc" institutionId="inst" currentNodeId={null} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await screen.findByRole('button',{name:'Réessayer la lecture'});
    expect((screen.getByRole('button',{name:'Enregistrer'}) as HTMLButtonElement).disabled).toBe(true);
    expect(f.records.classify).not.toHaveBeenCalled();
});
it('écarte les rubriques inactives futures expirées ou d’une autre institution', () => {
    expect(usableClassification(node,'inst','2026-11-11')).toBe(true);
    for(const override of [{statut:'INACTIF'},{institutionId:'autre'},{dateDebutValidite:'2026-11-12'},{dateFinValidite:'2026-11-10'}]) expect(usableClassification({...node,...override} as ClassificationNode,'inst','2026-11-11')).toBe(false);
    expect(usableClassification({...node,institutionId:null,dateDebutValidite:'2026-11-11',dateFinValidite:'2026-11-11'},'inst','2026-11-11')).toBe(true);
});
it('garde le libellé du classement validé dans l’historique', () => {
    expect(classificationContextText({classement:{nodeId:'node',code:'FIN',label:'Finances'}})).toBe('Classement validé : FIN · Finances');
    expect(classificationContextText({})).toBeNull();expect(classificationContextText({classement:{code:42}})).toBeNull();
});
