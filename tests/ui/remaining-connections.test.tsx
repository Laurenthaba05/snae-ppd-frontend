import React from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { MetadataSchema, MetadataFieldDefinition, WorkflowDefinition } from '../../src/core/types';
const f = vi.hoisted(() => ({
    epoch: 1, me: null,
    metadata: { fields: vi.fn(), bindings: vi.fn(), command: vi.fn() },
    records: { documentTypes: vi.fn() },
    consultation: { request: vi.fn() },
    workflow: { steps: vi.fn(), bindings: vi.fn(), command: vi.fn() },
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => f }));
vi.mock('../../src/ui/ResourceDetails', () => ({ ResourceDetailsButton: () => null }));
vi.mock('../../src/ui/names', () => ({ EntityName: ({ id }: { id: string }) => <span>{id}</span> }));
import { BindSchemaDialog, SchemaDetailDialog, EditMetadataDialog } from '../../src/pages/Metadata';
import { ConsultationRequestDetail } from '../../src/pages/Consultations';
import { DefinitionDetailDialog } from '../../src/pages/Workflow';
const S = '00000000-0000-4000-8000-000000000001', T = '00000000-0000-4000-8000-000000000002', D = '00000000-0000-4000-8000-000000000003';
const schema = { id: S, code: 'RECETTE', name: 'Recette métadonnées', status: 'BROUILLON', version: 1, institutionId: null, effectiveFrom: '2026-10-14', effectiveTo: null } as MetadataSchema;
const field = { id: D, code: 'NATURE', name: 'Nature documentaire', type: 'ENUM', required: true, repeatable: false, order: 7, description: 'Choisir la nature du dossier.', vocabulary: 'Vocabulaire de recette', configuration: { allowedValues: ['Rapport', 'Décision'] } };
beforeEach(() => {
    f.epoch++;
    for (const group of [f.metadata, f.records, f.consultation, f.workflow]) for (const fn of Object.values(group)) fn.mockReset();
    f.records.documentTypes.mockResolvedValue([{ id: T, code: 'RECETTE', label: 'Type de recette', status: 'ACTIF' }]);
    f.metadata.fields.mockResolvedValue([field]);
    f.metadata.bindings.mockResolvedValue([{ schemaId: S, typeDocumentId: T, required: true, from: '2026-10-14', to: '2027-10-14' }]);
    f.metadata.command.mockResolvedValue({});
});
it('relit les rattachements et toutes les propriétés du champ après ouverture du schéma', async () => {
    render(<SchemaDetailDialog schema={schema} canManage onClose={vi.fn()} onChanged={vi.fn()}/>);
    await screen.findByText('Type de recette');
    expect(f.metadata.bindings).toHaveBeenCalledWith(S, expect.any(AbortSignal));
    for (const value of ['Choisir la nature du dossier.', 'Vocabulaire : Vocabulaire de recette', '7', '2027-10-14']) expect(screen.getByText(value)).toBeTruthy();
    expect(screen.getByText(/"allowedValues"/).textContent).toContain('Décision');
});
it('bloque l’activation sans rattachement et affiche une erreur de lecture récupérable', async () => {
    f.metadata.bindings.mockRejectedValueOnce(new Error('Lecture des rattachements indisponible')).mockResolvedValue([]);
    render(<SchemaDetailDialog schema={schema} canManage onClose={vi.fn()} onChanged={vi.fn()}/>);
    await screen.findByRole('alert');
    expect((screen.getByRole('button', { name: 'Activer le schéma' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Réessayer/ }));
    await screen.findByText('Ce schéma n’est lié à aucun type de document.');
    expect(f.metadata.command).not.toHaveBeenCalled();
});
it('conserve la boîte ouverte lorsque le serveur refuse une activation', async () => {
    f.metadata.command.mockRejectedValue(new Error('Un conflit a empêché l’activation.'));
    const onClose = vi.fn();
    render(<SchemaDetailDialog schema={schema} canManage onClose={onClose} onChanged={vi.fn()}/>);
    await screen.findByText('Type de recette');
    fireEvent.click(screen.getByRole('button', { name: 'Activer le schéma' }));
    await screen.findByRole('alert'); expect(onClose).not.toHaveBeenCalled();
});
it('choisit un type actif non encore lié et enregistre les dates du rattachement', async () => {
    f.records.documentTypes.mockResolvedValue([{ id: T, code: 'RECETTE', label: 'Type de recette', status: 'ACTIF' }, { id: D, code: 'ANCIEN', label: 'Ancien type', status: 'RETIRE' }]);
    f.metadata.bindings.mockResolvedValue([]);
    const onCreated = vi.fn();
    render(<BindSchemaDialog schemaId={S} onClose={vi.fn()} onCreated={onCreated}/>);
    await screen.findByRole('option', { name: 'RECETTE · Type de recette' });
    expect(screen.queryByRole('option', { name: /Ancien type/ })).toBeNull();
    fireEvent.change(screen.getByLabelText('Type de document'), { target: { value: T } });
    fireEvent.change(screen.getByLabelText('Début de validité'), { target: { value: '2026-10-14' } });
    fireEvent.change(screen.getByLabelText('Fin de validité'), { target: { value: '2027-10-14' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lier' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledOnce());
    expect(f.metadata.command).toHaveBeenCalledWith(`/admin/metadata-schemas/${S}/document-types/${T}`, { required: false, from: '2026-10-14', to: '2027-10-14' }, expect.any(String), 'POST');
});
it('retire les types déjà liés de la sélection', async () => {
    render(<BindSchemaDialog schemaId={S} onClose={vi.fn()} onCreated={vi.fn()}/>);
    await screen.findByText('Aucun type actif restant à rattacher.');
    expect(screen.queryByRole('option', { name: 'RECETTE · Type de recette' })).toBeNull();
});
it('transmet le contrôle de complétude choisi et conserve le formulaire en cas de refus', async () => {
    f.metadata.command.mockRejectedValueOnce(new Error('Un champ obligatoire manque.')).mockResolvedValue({});
    const definition = { fieldId: D, fieldCode: 'NATURE', fieldName: field.name, type: 'ENUM', required: true, repeatable: false, schemaRequired: true, schemaCode: 'RECETTE', schemaVersion: 1, description: field.description, vocabulary: field.vocabulary, configuration: field.configuration } as MetadataFieldDefinition;
    const onClose = vi.fn();
    render(<EditMetadataDialog documentId={D} fields={[definition]} currentValues={[]} onClose={onClose} onSaved={vi.fn()}/>);
    expect(screen.getByText(/Choisir la nature du dossier/)).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: /^Vérifier tous les champs obligatoires/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await screen.findByRole('alert'); expect(onClose).not.toHaveBeenCalled();
    expect(f.metadata.command.mock.calls[0][1]).toEqual({ values: [], requireComplete: true });
    fireEvent.change(screen.getByLabelText(/^Nature documentaire/), { target: { value: 'Rapport' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(f.metadata.command.mock.calls[1][1]).toEqual({ values: [{ fieldCode: 'NATURE', order: 0, value: 'Rapport' }], requireComplete: true });
    expect(f.metadata.command.mock.calls[1][2]).not.toBe(f.metadata.command.mock.calls[0][2]);
});
it('charge la demande individuelle et montre son motif de décision', async () => {
    f.consultation.request.mockResolvedValue({ id: D, motif: 'Recette de consultation', statut: 'REFUSEE', documentId: S, demandeurId: 'Demandeur de recette', instructeurId: 'Instructeur de recette', decisionMotif: 'Recette terminée sans dérogation accordée.', dateDepot: '2026-10-14T12:00:00Z', dateDecision: '2026-10-14T13:00:00Z' });
    render(<ConsultationRequestDetail id={D} onClose={vi.fn()}/>);
    await screen.findByText('Recette terminée sans dérogation accordée.');
    expect(f.consultation.request).toHaveBeenCalledWith(D, expect.any(AbortSignal));
    expect(screen.getByText('Instructeur de recette')).toBeTruthy();
});
it('permet de reprendre la lecture individuelle après un refus', async () => {
    f.consultation.request.mockRejectedValueOnce(new Error('Accès refusé')).mockResolvedValue({ id: D, motif: 'Demande relue', statut: 'DEPOSEE', demandeurId: 'Lecteur', dateDepot: '2026-10-14T12:00:00Z' });
    render(<ConsultationRequestDetail id={D} onClose={vi.fn()}/>);
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Actualiser la demande' }));
    await screen.findByText('Demande relue');
});
it('affiche le délai nul, la priorité et la date de fin du circuit sans les remplacer par des valeurs par défaut', async () => {
    f.workflow.steps.mockResolvedValue([{ id: D, code: 'ETAPE', label: 'Étape de recette', order: 1, delayMinutes: 0, initial: true, final: true }]);
    f.workflow.bindings.mockResolvedValue([{ id: D, typeDocumentId: T, required: true, priority: 23, from: '2026-10-14', to: '2028-02-15' }]);
    render(<DefinitionDetailDialog definition={{ id: S, name: 'Circuit de recette', code: 'RECETTE', version: 1, status: 'ACTIF' } as WorkflowDefinition} canManage={false} onClose={vi.fn()} onChanged={vi.fn()}/>);
    await screen.findByText('Étape de recette');
    expect(within(screen.getByText('Étape de recette').closest('tr')!).getByText('0')).toBeTruthy();
    await screen.findByText('23'); expect(screen.getByText('2028-02-15')).toBeTruthy();
});
