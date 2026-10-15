import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const INST = '00000000-0000-4000-8000-000000000001';
const DOC = '00000000-0000-4000-8000-000000000002';
const DOS = '00000000-0000-4000-8000-000000000003';
const NODE = '00000000-0000-4000-8000-000000000004';
const DEP = '00000000-0000-4000-8000-000000000005';
const OCR = '00000000-0000-4000-8000-000000000006';
const FILE = '00000000-0000-4000-8000-000000000007';
const OTHER = '00000000-0000-4000-8000-000000000008';
const fixture = vi.hoisted(() => ({
 epoch: 1, me: { user: { institutionId: '00000000-0000-4000-8000-000000000001' } }, departmental: false,
 refresh: vi.fn(),
 api: { get: vi.fn(), list: vi.fn(), command: vi.fn() },
 records: { documents: vi.fn(), dossiers: vi.fn(), actors: vi.fn(), documentTypes: vi.fn(), command: vi.fn(), preservationEvents: vi.fn(), recordPreservationEvent: vi.fn() },
 retention: { command: vi.fn() },
 classification: { nodes: vi.fn(), command: vi.fn() },
 digitization: { command: vi.fn(), fileAssets: vi.fn(), ocrResultsByFile: vi.fn() },
 heritage: { command: vi.fn() },
 archivalIntake: { entries: vi.fn() },
 preservationPlanning: { agents: vi.fn() },
 consultation: { createCommunication: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({
 can: (_me: unknown, _permission: string, scope: { departmentId?: string } = {}) => !fixture.departmental || scope.departmentId === '00000000-0000-4000-8000-000000000005',
 platform: () => true
}));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: { institutionId: '00000000-0000-4000-8000-000000000001', departmentId: null } }), RecordWorkspaceProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('../../src/ui/ReferencePicker', () => ({ ReferencePicker: ({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) => <input aria-label={label} value={value} onChange={e => onChange(e.target.value)} disabled={disabled}/> }));
import { LegalHoldDialog } from '../../src/ui/LegalHoldDialog';
import { RecordForm } from '../../src/pages/RecordForm';
import { CreateContributionDialog } from '../../src/pages/Digitization';
import { ReceptionDialog } from '../../src/ui/HeritageEntries';
import { AttachActorDialog, PreservationDialog, ValidateDispositionDialog } from '../../src/pages/Records';
import { CreateCommunicationDialog } from '../../src/pages/Consultations';
import { CreateNodeDialog } from '../../src/pages/Classification';

beforeEach(() => {
 fixture.epoch++; fixture.departmental = false;
 for (const value of Object.values(fixture)) if (value && typeof value === 'object') for (const fn of Object.values(value)) if (vi.isMockFunction(fn)) fn.mockReset();
 fixture.refresh.mockReset();
 fixture.records.documents.mockResolvedValue({ items: [{ id: DOC, reference: 'DOC-1', title: 'Document réel' }], hasMore: false });
 fixture.records.dossiers.mockResolvedValue({ items: [{ id: DOS, reference: 'DOS-1', title: 'Dossier réel' }], hasMore: false });
 fixture.records.actors.mockResolvedValue({ items: [{ id: OTHER, name: 'Déposant du test' }], hasMore: false });
 fixture.records.documentTypes.mockResolvedValue([{ id: OTHER, label: 'Rapport', status: 'ACTIF' }]);
 fixture.classification.nodes.mockResolvedValue([{ id: NODE, institutionId: INST, code: 'RH', libelle: 'Ressources humaines', statut: 'ACTIF' }]);
 fixture.api.command.mockResolvedValue({ id: DOS }); fixture.records.command.mockResolvedValue({ id: OTHER });
 fixture.retention.command.mockResolvedValue({}); fixture.classification.command.mockResolvedValue({});
 fixture.digitization.fileAssets.mockResolvedValue({ items: [{ fichierId: FILE, numeroPage: 1, mediaType: 'image/png', role: 'MASTER' }, { fichierId: OTHER, numeroPage: 2, mediaType: 'image/png', role: 'MASTER' }] });
 fixture.digitization.ocrResultsByFile.mockImplementation(async (id: string) => id === FILE ? [{ id: OCR, fichierId: FILE, typeReconnaissance: 'OCR', moteur: 'Tesseract', statutValidation: 'NON_VALIDE' }] : []);
 fixture.digitization.command.mockResolvedValue({});
 fixture.archivalIntake.entries.mockResolvedValue([{ id: NODE, numero: 'ENT-1', description: 'Entrée réelle' }]);
 fixture.heritage.command.mockResolvedValue({ id: OTHER });
 fixture.records.preservationEvents.mockResolvedValue([]);
 fixture.records.recordPreservationEvent.mockResolvedValue({});
 fixture.preservationPlanning.agents.mockResolvedValue([{ id: OTHER, name: 'Tesseract PREMIS', status: 'ACTIF' }]);
 fixture.consultation.createCommunication.mockResolvedValue({});
});
const change = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const confirm = async (label: string) => { fireEvent.click(screen.getByRole('button', { name: 'Continuer' })); fireEvent.click(await screen.findByRole('button', { name: label })); };
it('un gel réunit plusieurs types de cibles sans doublons et conserve sa description', async () => {
 render(<LegalHoldDialog institutionId={INST} onClose={vi.fn()} onSuccess={vi.fn()}/>);
 change('Référence du gel', 'GEL-1'); change('Motif du gel', 'Litige en cours'); change('Description du gel', 'Pièces utiles'); change('Autorité du gel', 'Archives');
 fireEvent.click(await screen.findByLabelText('DOC-1 · Document réel'));
 change('Type de cible du gel', 'dossiers'); fireEvent.click(await screen.findByLabelText('DOS-1 · Dossier réel'));
 change('Type de cible du gel', 'nodes'); fireEvent.click(await screen.findByLabelText('RH · Ressources humaines'));
 await confirm('Ouvrir le gel');
 await waitFor(() => expect(fixture.retention.command).toHaveBeenCalled());
 expect(fixture.retention.command.mock.calls[0][1]).toMatchObject({ description: 'Pièces utiles', authority: 'Archives', institutionId: INST, departmentId: null, documentIds: [DOC], dossierIds: [DOS], classificationNodeIds: [NODE] });
});
it('changer le département retire toutes les cibles de la portée précédente', async () => {
 render(<LegalHoldDialog institutionId={INST} onClose={vi.fn()} onSuccess={vi.fn()}/>);
 fireEvent.click(await screen.findByLabelText('DOC-1 · Document réel'));
 change('Département du gel', DEP);
 expect(await screen.findByText('0 cible(s) sélectionnée(s)')).toBeTruthy();
 expect((screen.getByRole('option', { name: 'Dossiers' }) as HTMLOptionElement).disabled).toBe(true);
});
it('un gestionnaire de département reste dans sa portée et ne peut viser une branche', async () => {
 fixture.departmental = true;
 render(<LegalHoldDialog institutionId={INST} departmentId={DEP} documentId={DOC} onClose={vi.fn()} onSuccess={vi.fn()}/>);
 expect((screen.getByLabelText('Département du gel') as HTMLInputElement).disabled).toBe(true);
 expect((screen.getByRole('option', { name: 'Branches du classement' }) as HTMLOptionElement).disabled).toBe(true);
 change('Référence du gel', 'GEL-DEP'); change('Motif du gel', 'Litige départemental');
 await confirm('Ouvrir le gel');
 expect(fixture.retention.command.mock.calls[0][1]).toMatchObject({ departmentId: DEP, documentIds: [DOC], dossierIds: [], classificationNodeIds: [] });
});
it.each(['dossiers', 'documents'] as const)('classe le %s dès sa création', async kind => {
 render(<RecordForm kind={kind} onClose={vi.fn()} onCreated={vi.fn()}/>);
 change(/^Cote ou référence/, 'REF-TEST'); change(/^Titre/, 'Dossier classé');
 change('Rubrique du plan de classement', NODE);
 if (kind === 'documents') { await screen.findByRole('option', { name: 'Rapport' }); change(/^Type de document/, OTHER); }
 await screen.findByRole('option', { name: 'RH · Ressources humaines' }); change('Rubrique du plan de classement', NODE);
 await confirm('Confirmer');
 await waitFor(() => expect(fixture.records.command).toHaveBeenCalled());
 expect(fixture.records.command.mock.calls[0][1]).toMatchObject({ classificationNodeId: NODE, institutionId: INST });
});
it('la contribution référence le résultat OCR du fichier choisi', async () => {
 render(<CreateContributionDialog elementId={DOS} onClose={vi.fn()} onCreated={vi.fn()}/>);
 change(/^Type/, 'CORRECTION'); change('Contenu', 'Transcription corrigée');
 await screen.findByRole('option', { name: /Page 1/ }); change('Fichier OCR de la contribution', FILE);
 await screen.findByRole('option', { name: /Tesseract/ }); change('Résultat OCR de la contribution', OCR);
 fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
 await waitFor(() => expect(fixture.digitization.command).toHaveBeenCalled());
 expect(fixture.digitization.command.mock.calls[0][1]).toMatchObject({ resultatOcrId: OCR, contenu: 'Transcription corrigée' });
});
it('changer le fichier OCR efface le résultat et interdit un lien périmé', async () => {
 render(<CreateContributionDialog elementId={DOS} onClose={vi.fn()} onCreated={vi.fn()}/>);
 await screen.findByRole('option', { name: /Page 1/ }); change('Fichier OCR de la contribution', FILE);
 await screen.findByRole('option', { name: /Tesseract/ }); change('Résultat OCR de la contribution', OCR);
 change('Fichier OCR de la contribution', OTHER);
 expect((screen.getByLabelText('Résultat OCR de la contribution') as HTMLSelectElement).value).toBe('');
 expect((screen.getByRole('button', { name: 'Ajouter' }) as HTMLButtonElement).disabled).toBe(true);
 expect(fixture.digitization.command).not.toHaveBeenCalled();
});
it('enregistre les liens patrimoniaux vers un acteur et une entrée archivistique', async () => {
 render(<ReceptionDialog onClose={vi.fn()} onCreated={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button', { name: 'Acteur du référentiel' }));
 fireEvent.click(await screen.findByRole('button', { name: 'Déposant du test' }));
 await screen.findByRole('option', { name: 'ENT-1 · Entrée réelle' }); change('Entrée archivistique associée', NODE);
 fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la réception' }));
 await waitFor(() => expect(fixture.heritage.command).toHaveBeenCalled());
 expect(fixture.heritage.command.mock.calls[0][1].champs).toMatchObject({ deposantActeurId: OTHER, entreeArchivistiqueId: NODE });
});
it('envoie les dates et références du nouvel acteur', async () => {
 render(<AttachActorDialog documentId={DOC} onClose={vi.fn()} onSuccess={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button', { name: 'Nouvel acteur' }));
 change(/^Nom/, 'Déposant'); change('Identifiant externe', 'ACT-EXT'); change('Date de naissance ou de création', '1960-01-02'); change('Date de décès ou de dissolution', '2025-02-03'); change('Description de l’acteur', 'Biographie');
 fireEvent.click(screen.getByRole('button', { name: /Attacher$/ }));
 await waitFor(() => expect(fixture.records.command).toHaveBeenCalledTimes(2));
 expect(fixture.records.command.mock.calls[0][1]).toMatchObject({ externalId: 'ACT-EXT', birthDate: '1960-01-02', deathDate: '2025-02-03', description: 'Biographie' });
});
it('enregistre l’agent PREMIS et les objets source/destination', async () => {
 render(<PreservationDialog fileId={FILE} canManage onClose={vi.fn()}/>);
 await screen.findByRole('option', { name: 'Tesseract PREMIS' }); change('Agent de préservation', OTHER);
 change('État source (JSON)', '{"format":"TIFF"}'); change('État de destination (JSON)', '{"format":"PDF/A"}');
 fireEvent.click(screen.getByRole('button', { name: /Consigner/ }));
 await waitFor(() => expect(fixture.records.recordPreservationEvent).toHaveBeenCalled());
 expect(fixture.records.recordPreservationEvent.mock.calls[0][6]).toEqual({ agentId: OTHER, source: { format: 'TIFF' }, destination: { format: 'PDF/A' } });
});
it('encode la preuve complémentaire au format texte JSON attendu par le backend', async () => {
 render(<ValidateDispositionDialog dispositionId={DOC} decision="REEXAMINER" onClose={vi.fn()} onSuccess={vi.fn()}/>);
 change('Pièces complémentaires (JSON)', '{"reference":"PV-42"}');
 fireEvent.click(screen.getByRole('button', { name: 'Valider' }));
 await waitFor(() => expect(fixture.retention.command).toHaveBeenCalled());
 expect(fixture.retention.command.mock.calls[0][1].evidenceJson).toBe('{"reference":"PV-42"}');
});
it('enregistre une communication de dossier avec documentId nul', async () => {
 render(<CreateCommunicationDialog onClose={vi.fn()} onSuccess={vi.fn()}/>);
 change('Objet communiqué', 'dossiers'); fireEvent.click(screen.getByRole('button', { name: 'Dossier lié' }));
 fireEvent.click(await screen.findByRole('button', { name: 'DOS-1 · Dossier réel' }));
 change('Sélectionner : bénéficiaire', OTHER);
 fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
 await waitFor(() => expect(fixture.consultation.createCommunication).toHaveBeenCalled());
 expect(fixture.consultation.createCommunication.mock.calls[0].slice(0, 3)).toEqual([null, DOS, OTHER]);
});
it('transmet ordre et dates de validité du classement', async () => {
 render(<CreateNodeDialog nodes={[]} onClose={vi.fn()} onCreated={vi.fn()}/>);
 change(/^Libellé/, 'Rubrique'); change(/^Type de nœud/, 'SERIE'); change('Ordre dans le classement', '12'); change('Début de validité', '2026-01-01'); change('Fin de validité', '2030-12-31');
 fireEvent.click(screen.getByRole('button', { name: 'Créer' }));
 await waitFor(() => expect(fixture.classification.command).toHaveBeenCalled());
 expect(fixture.classification.command.mock.calls[0][1]).toMatchObject({ ordre: 12, dateDebutValidite: '2026-01-01', dateFinValidite: '2030-12-31' });
});
