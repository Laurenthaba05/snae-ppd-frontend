import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/core/http';
import type { Me, RecordDocument, Dossier, ScanLot, HeritageReference } from '../../src/core/types';
const f = vi.hoisted(() => ({
    epoch: 1, refresh: vi.fn(), me: null as Me | null,
    api: { transport: { request: vi.fn() } },
    records: { document: vi.fn(), dossier: vi.fn(), command: vi.fn(), documentByPersistentId: vi.fn(), dossierChildren: vi.fn() },
    readingRoom: { updateReader: vi.fn() },
    navigate: vi.fn(),
    workflow: { command: vi.fn() },
    heritage: { references: vi.fn(), command: vi.fn() },
    digitization: { lotSummary: vi.fn(), elementWorkflow: vi.fn(), advanceLot: vi.fn() },
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => f }));
vi.mock('../../src/ui/navigation', () => ({ navigate: f.navigate }));
import { ReaderContactDialog } from '../../src/ui/ReadingRoom';
import type { Reader } from '../../src/core/readingRoom';
import { DossierCloseDialog } from '../../src/ui/DossierClose';
import { PersistentDocumentLookup } from '../../src/ui/PersistentDocumentLookup';
import { ResourceDetailsButton, ResourceDetailsDialog } from '../../src/ui/ResourceDetails';
import { RecordDescriptionDialog } from '../../src/ui/RecordDescription';
import { CancelWorkflowDialog } from '../../src/pages/Workflow';
import { LotAdvanceDialog } from '../../src/ui/LotAdvanceDialog';
import { HeritageReferenceCatalog, HeritageReferenceDialog } from '../../src/ui/HeritageReferenceCatalog';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const document = { id, title: 'Titre initial', description: 'Description conservée', documentDate: '2026-10-01', versionLock: 4, businessStatus: 'BROUILLON', archivalStatus: 'BROUILLON', destroyed: false } as RecordDocument;
const dossier = { ...document, subject: 'Objet conservé' } as Dossier;
const lot = { id, code: 'LOT-TEST', nom: 'Lot de contrôle', statut: 'OUVERT' } as ScanLot;
const reference: HeritageReference = { domaine: 'CATEGORIE', code: 'PHOTO', libelle: 'Photographies', description: 'Description initiale', ordre: 2, actif: true };
const callbacks = () => ({ onClose: vi.fn(), onDone: vi.fn(), onChanged: vi.fn() });
beforeEach(() => {
    f.epoch++;
    f.refresh.mockResolvedValue(undefined);
    f.records.dossierChildren.mockReset().mockResolvedValue([]);
    f.navigate.mockReset();
    f.records.documentByPersistentId.mockReset().mockResolvedValue(document);
    f.readingRoom.updateReader.mockReset().mockResolvedValue({ id });
    f.me = { user: { id: 'u1', accountType: 'USER', status: 'ACTIF' }, grants: [] } as unknown as Me;
    f.api.transport.request.mockReset().mockResolvedValue({ id, titre: 'Données du serveur', actif: true });
    f.records.document.mockReset().mockResolvedValue(document);
    f.records.dossier.mockReset().mockResolvedValue(dossier);
    f.records.command.mockReset().mockResolvedValue({});
    f.workflow.command.mockReset().mockResolvedValue({});
    f.heritage.references.mockReset().mockResolvedValue([reference]);
    f.heritage.command.mockReset().mockResolvedValue(reference);
    f.digitization.lotSummary.mockReset().mockResolvedValue({ items: [
        { elementId: 'e1', statut: 'NUMERISATION', description: 'Page 1' },
        { elementId: 'e2', statut: 'NUMERISATION', description: 'Page 2' },
    ] });
    f.digitization.elementWorkflow.mockReset().mockResolvedValue({ options: [
        { vers: 'OCR_INDEXATION', peutAgir: true, autorise: true, renvoi: false, motifRequis: false, blockers: [] },
        { vers: 'CONTROLE_QUALITE', peutAgir: false, autorise: false, renvoi: false, motifRequis: true, blockers: [] },
        { vers: 'SUSPENDU', peutAgir: true, autorise: true, renvoi: false, motifRequis: true, blockers: [] },
    ] });
    f.digitization.advanceLot.mockReset().mockResolvedValue({ appliques: 1, ignores: 1, resultats: [
        { elementId: 'e1', description: 'Page 1', applique: true, blockers: [] },
        { elementId: 'e2', description: 'Page 2', applique: false, blockers: [{ code: 'MISSING', message: 'Une page manque.', overridable: false }] },
    ] });
});
it('lit une fiche à la demande et affiche le texte serveur comme texte, sans HTML', async () => {
    f.api.transport.request.mockResolvedValue({ titre: '<img src=x onerror=alert(1)>', actif: true, description: 'Texte complet' });
    const view = render(<ResourceDetailsButton resource="scanner" id={id} title="Scanner central" />);
    expect(f.api.transport.request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Fiche complète : Scanner central' }));
    await screen.findByText('Texte complet');
    expect(f.api.transport.request).toHaveBeenCalledWith('/digitization/scanners/' + id, { signal: expect.any(AbortSignal) });
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
    expect(view.container.querySelector('img')).toBeNull();
    expect(screen.getByText('Oui')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Fermer la fiche' }));
    expect(f.api.transport.request.mock.calls[0][1].signal.aborted).toBe(true);
});
it('refuse un identifiant de fiche malformé avant tout appel', async () => {
    render(<ResourceDetailsDialog resource="scanner" id="../iam/users" onClose={vi.fn()} />);
    await screen.findByRole('alert');
    expect(f.api.transport.request).not.toHaveBeenCalled();
});
it('permet de relire une fiche après un échec sans afficher les données précédentes', async () => {
    f.api.transport.request.mockRejectedValueOnce(new ApiError(403, 'FORBIDDEN', 'Refusé')).mockResolvedValueOnce({ titre: 'Fiche autorisée' });
    render(<ResourceDetailsDialog resource="qualityControl" id={id} onClose={vi.fn()} />);
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Actualiser la fiche' }));
    await screen.findByText('Fiche autorisée');
    expect(f.api.transport.request).toHaveBeenCalledTimes(2);
});
it('conserve tous les champs de description du document et envoie la version relue', async () => {
    const cb = callbacks();
    render(<RecordDescriptionDialog kind="documents" id={id} {...cb} />);
    await screen.findByDisplayValue('Description conservée');
    fireEvent.change(screen.getByLabelText('Titre'), { target: { value: 'Nouveau titre' } });
    fireEvent.change(screen.getByLabelText('Motif de la correction'), { target: { value: 'Correction de la notice' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la description' }));
    await waitFor(() => expect(cb.onChanged).toHaveBeenCalledTimes(1));
    expect(f.records.command).toHaveBeenCalledWith('/documents/' + id + '/description', {
        expectedVersion: 4, title: 'Nouveau titre', description: 'Description conservée', documentDate: '2026-10-01', reason: 'Correction de la notice',
    }, expect.any(String), 'PUT');
});
it('permet de vider explicitement l’objet du dossier sans envoyer de date documentaire', async () => {
    const cb = callbacks();
    render(<RecordDescriptionDialog kind="dossiers" id={id} {...cb} />);
    await screen.findByDisplayValue('Objet conservé');
    fireEvent.change(screen.getByLabelText('Objet du dossier'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Motif de la correction'), { target: { value: 'Retrait de l’objet erroné' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la description' }));
    await waitFor(() => expect(cb.onChanged).toHaveBeenCalledTimes(1));
    expect(f.records.command.mock.calls[0][0]).toBe('/dossiers/' + id + '/description');
    expect(f.records.command.mock.calls[0][1]).toMatchObject({ expectedVersion: 4, subject: null, description: 'Description conservée' });
    expect(f.records.command.mock.calls[0][1]).not.toHaveProperty('documentDate');
});
it('conserve les corrections locales après un conflit et ne contourne pas le verrou de version', async () => {
    f.records.command.mockRejectedValue(new ApiError(409, 'DESCRIPTION_VERSION_CONFLICT', 'La notice a changé.'));
    const cb = callbacks();
    render(<RecordDescriptionDialog kind="documents" id={id} {...cb} />);
    await screen.findByDisplayValue('Titre initial');
    fireEvent.change(screen.getByLabelText('Titre'), { target: { value: 'Correction locale' } });
    fireEvent.change(screen.getByLabelText('Motif de la correction'), { target: { value: 'Motif' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la description' }));
    await screen.findByRole('alert');
    expect(screen.getByDisplayValue('Correction locale')).toBeTruthy();
    expect(cb.onClose).not.toHaveBeenCalled();
    expect(f.records.command).toHaveBeenCalledTimes(1);
});
it('interdit la correction directe d’un document clos', async () => {
    f.records.document.mockResolvedValue({ ...document, businessStatus: 'CLOS' });
    render(<RecordDescriptionDialog kind="documents" id={id} {...callbacks()} />);
    await screen.findByText(/Cette notice est verrouillée/);
    expect((screen.getByRole('button', { name: 'Enregistrer la description' }) as HTMLButtonElement).disabled).toBe(true);
    expect(f.records.command).not.toHaveBeenCalled();
});
it('annule un circuit avec un motif et bloque les doubles envois', async () => {
    let finish!: () => void;
    f.workflow.command.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const cb = callbacks();
    render(<CancelWorkflowDialog instanceId={id} {...cb} />);
    const submit = screen.getByRole('button', { name: 'Confirmer l’annulation' });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Motif d’annulation'), { target: { value: ' Fin de recette ' } });
    fireEvent.click(submit); fireEvent.click(submit);
    expect(f.workflow.command).toHaveBeenCalledTimes(1);
    expect(f.workflow.command).toHaveBeenCalledWith('/workflows/' + id + '/cancel', { reason: 'Fin de recette' }, expect.any(String), 'POST');
    finish();
    await waitFor(() => expect(cb.onDone).toHaveBeenCalledTimes(1));
});
it('réutilise la clé d’annulation après une erreur de réponse', async () => {
    f.workflow.command.mockRejectedValueOnce(new Error('Réseau indisponible')).mockResolvedValueOnce({});
    render(<CancelWorkflowDialog instanceId={id} {...callbacks()} />);
    fireEvent.change(screen.getByLabelText('Motif d’annulation'), { target: { value: 'Fin de recette' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’annulation' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’annulation' }));
    await waitFor(() => expect(f.workflow.command).toHaveBeenCalledTimes(2));
    expect(f.workflow.command.mock.calls[0][2]).toBe(f.workflow.command.mock.calls[1][2]);
});
it('applique au lot une transition autorisée et affiche distinctement les blocages partiels', async () => {
    const cb = callbacks();
    render(<LotAdvanceDialog lot={lot} {...cb} />);
    const select = await screen.findByLabelText('Passage à appliquer');
    await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(2));
    fireEvent.change(select, { target: { value: 'OCR_INDEXATION' } });
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer au lot' }));
    await screen.findByText('Une page manque.');
    expect(f.digitization.advanceLot).toHaveBeenCalledWith(id, { de: 'NUMERISATION', vers: 'OCR_INDEXATION', motif: null }, expect.any(String));
    expect(cb.onDone).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Appliquer au lot' })).toBeNull();
});
it('ne propose pas de mutation sur un lot vide', async () => {
    f.digitization.lotSummary.mockResolvedValue({ items: [] });
    render(<LotAdvanceDialog lot={lot} {...callbacks()} />);
    await screen.findByText('Aucun élément à faire avancer');
    expect((screen.getByRole('button', { name: 'Appliquer au lot' }) as HTMLButtonElement).disabled).toBe(true);
    expect(f.digitization.elementWorkflow).not.toHaveBeenCalled();
});
it('ne transmet un motif de dérogation qu’après un choix explicite et conserve la clé lors d’une reprise', async () => {
    f.digitization.advanceLot.mockRejectedValueOnce(new Error('Réponse perdue')).mockResolvedValueOnce({ appliques: 0, ignores: 0, resultats: [] });
    render(<LotAdvanceDialog lot={lot} {...callbacks()} />);
    const select = await screen.findByLabelText('Passage à appliquer');
    await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(2));
    fireEvent.change(select, { target: { value: 'OCR_INDEXATION' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Autoriser les écarts/ }));
    expect((screen.getByRole('button', { name: 'Appliquer au lot' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Motif commun (10 caractères minimum)'), { target: { value: 'Écart examiné en recette' } });
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer au lot' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer au lot' }));
    await waitFor(() => expect(f.digitization.advanceLot).toHaveBeenCalledTimes(2));
    expect(f.digitization.advanceLot.mock.calls[0][1].motif).toBe('Écart examiné en recette');
    expect(f.digitization.advanceLot.mock.calls[0][2]).toBe(f.digitization.advanceLot.mock.calls[1][2]);
});
it('modifie seulement les champs changés d’une référence, avec effacement explicite de la description', async () => {
    render(<HeritageReferenceDialog reference={reference} {...callbacks()} />);
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la référence' }));
    await waitFor(() => expect(f.heritage.command).toHaveBeenCalledTimes(1));
    expect(f.heritage.command).toHaveBeenCalledWith('/references/CATEGORIE/PHOTO', { description: '' }, expect.any(String), 'PUT');
});
it('cache les modifications du référentiel aux lecteurs non habilités', async () => {
    render(<HeritageReferenceCatalog />);
    await screen.findByText('Photographies');
    expect(screen.queryByRole('button', { name: 'Modifier Photographies' })).toBeNull();
    expect(f.heritage.command).not.toHaveBeenCalled();
});

it('affiche les listes de relations reçues par un point de détail', async () => {
    f.api.transport.request.mockResolvedValue([{ type: 'SUCCESSION', description: 'Relation complète' }]);
    render(<ResourceDetailsDialog resource="authorityRelations" id={id} onClose={vi.fn()} />);
    await screen.findByText('Relation complète');
    expect(f.api.transport.request).toHaveBeenCalledWith('/archives/authorities/' + id + '/relations', { signal: expect.any(AbortSignal) });
});
const reader = { id, firstName: 'Aïssatou', lastName: 'Diallo', researchTopic: 'Archives historiques',
    address: 'Adresse conservée', phone: '+224600000000', email: 'lecteur@example.test', organization: 'Archives' } as Reader;
it('conserve les coordonnées inchangées lors du remplacement du contact et permet un effacement explicite', async () => {
    const cb = callbacks();
    render(<ReaderContactDialog reader={reader} {...cb} />);
    fireEvent.change(screen.getByLabelText('Téléphone'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les coordonnées' }));
    await waitFor(() => expect(cb.onDone).toHaveBeenCalledTimes(1));
    expect(f.readingRoom.updateReader).toHaveBeenCalledWith(id, { address: reader.address, phone: null,
        email: reader.email, organization: reader.organization, researchTopic: reader.researchTopic }, expect.any(String));
});
it('exige un objet de recherche et conserve la clé de reprise du contact en erreur', async () => {
    f.readingRoom.updateReader.mockRejectedValueOnce(new Error('Réponse perdue')).mockResolvedValueOnce(reader);
    render(<ReaderContactDialog reader={reader} {...callbacks()} />);
    const submit = () => screen.getByRole('button', { name: 'Enregistrer les coordonnées' }) as HTMLButtonElement;
    fireEvent.change(screen.getByLabelText(/^Objet de la recherche/), { target: { value: 'x' } });
    expect(submit().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/^Objet de la recherche/), { target: { value: 'Histoire locale' } });
    fireEvent.click(submit());
    await screen.findByRole('alert');
    fireEvent.click(submit());
    await waitFor(() => expect(f.readingRoom.updateReader).toHaveBeenCalledTimes(2));
    expect(f.readingRoom.updateReader.mock.calls[0][2]).toBe(f.readingRoom.updateReader.mock.calls[1][2]);
});
it('résout un identifiant pérenne et ouvre la notice retournée par le serveur', async () => {
    render(<PersistentDocumentLookup />);
    fireEvent.click(screen.getByText('Ouvrir par identifiant pérenne'));
    fireEvent.change(screen.getByLabelText('Identifiant pérenne du document'), { target: { value: '  snae-document-test  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir la notice' }));
    await waitFor(() => expect(f.navigate).toHaveBeenCalledWith('/app/documents/' + id));
    expect(f.records.documentByPersistentId).toHaveBeenCalledWith('snae-document-test', expect.any(AbortSignal));
});
it('ne navigue pas sur une réponse périmée après fermeture de la recherche pérenne', async () => {
    let resolve!: (value: unknown) => void;
    f.records.documentByPersistentId.mockImplementation(() => new Promise(done => { resolve = done; }));
    const view = render(<PersistentDocumentLookup />);
    fireEvent.click(screen.getByText('Ouvrir par identifiant pérenne'));
    fireEvent.change(screen.getByLabelText('Identifiant pérenne du document'), { target: { value: 'snae-test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir la notice' }));
    view.unmount();
    expect(f.records.documentByPersistentId.mock.calls[0][1].aborted).toBe(true);
    resolve(document);
    await Promise.resolve();
    expect(f.navigate).not.toHaveBeenCalled();
});
it('reste sur la recherche et indique une erreur pour un identifiant pérenne absent', async () => {
    f.records.documentByPersistentId.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Document introuvable.'));
    render(<PersistentDocumentLookup />);
    fireEvent.click(screen.getByText('Ouvrir par identifiant pérenne'));
    fireEvent.change(screen.getByLabelText('Identifiant pérenne du document'), { target: { value: 'snae-inconnu' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir la notice' }));
    await screen.findByRole('alert');
    expect(f.navigate).not.toHaveBeenCalled();
});

function allowDossierClose() {
    f.me!.grants = [{ roleId: id, roleCode: 'ARCHIVISTE', permission: 'DOSSIER_CLOSE', scope: 'NATIONAL', institutionId: null, departmentId: null, delegationId: null, expiresAt: null }];
}
it('empêche de clore un dossier dont un sous-dossier reste ouvert', async () => {
    allowDossierClose();
    f.records.dossierChildren.mockResolvedValue([{ id: 'child', reference: 'SOUS-001', businessStatus: 'BROUILLON' }]);
    render(<DossierCloseDialog id={id} {...callbacks()} />);
    await screen.findByText(/Clôturez d’abord les sous-dossiers encore ouverts/);
    expect(screen.queryByRole('button', { name: 'Confirmer la clôture' })).toBeNull();
    expect(f.records.command).not.toHaveBeenCalled();
});
it('clôture le dossier uniquement après relecture et confirmation explicite', async () => {
    allowDossierClose();
    render(<DossierCloseDialog id={id} {...callbacks()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Continuer' }));
    expect(f.records.command).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmer la clôture' }));
    await waitFor(() => expect(f.records.command).toHaveBeenCalledWith('/dossiers/' + id + '/close', {}, expect.any(String), 'POST'));
});
