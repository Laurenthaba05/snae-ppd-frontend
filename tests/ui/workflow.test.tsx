import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/core/http';
import type { WorkflowInstance } from '../../src/core/types';
const DOC = '80f0f431-a8f1-4da0-b0b2-bbca91b9a739';
const DEF = '58a41776-7252-480e-b32a-8c3abe06e0d5';
const TYPE_RAPPORT = '7c5e0d9e-2f4a-4e6b-9d3c-1a2b3c4d5e61';
const ROLE = 'ee2509c7-8a90-4085-a3e1-4317cf10002b';
const STEP = '1db067c2-dbe2-4d57-a60c-fc388b2ced6b';
const USER = '3d7fe8bc-72a0-4946-ac15-63b735e88e41';
const fixture = vi.hoisted(() => ({
    epoch: 1, me: null as unknown, allowed: new Set<string>(),
    api: { get: vi.fn(), list: vi.fn() },
    workflow: { documentWorkflows: vi.fn(), command: vi.fn(), definitions: vi.fn(), steps: vi.fn(), bindings: vi.fn(), taskActions: vi.fn() },
    archivalIntake: { entries: vi.fn() },
    records: { documentTypes: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: { institutionId: null, departmentId: null } }) }));
import { WorkflowPage, WorkflowPanel } from '../../src/pages/Workflow';

const instance = (extra: Partial<WorkflowInstance> = {}): WorkflowInstance => ({ instanceId: 'i1', definitionId: DEF, documentId: DOC, status: 'EN_COURS', currentStepId: STEP, context: {}, startedAt: '2026-10-05T10:00:00Z', completedAt: null, entreeArchivistiqueId: null,
    tasks: [{ taskId: 't1', stepId: STEP, status: 'OUVERTE', roleId: ROLE, assignedUserId: null, dueAt: null, claimedAt: null, completedAt: null, decisionCode: null, stepLabel: 'Soumission', roleName: 'Administrateur metier (recette)', assignedUserName: null }], ...extra });
const unhandled: unknown[] = [];
beforeEach(() => {
    fixture.epoch += 1;
    fixture.archivalIntake.entries.mockResolvedValue([{ id: TYPE_RAPPORT, numero: 'ENT-TEST' }]);
    fixture.allowed = new Set(['WORKFLOW_START', 'WORKFLOW_TASK_CLAIM', 'WORKFLOW_TASK_COMPLETE', 'WORKFLOW_DEFINITION_MANAGE']);
    for (const fn of [...Object.values(fixture.workflow), ...Object.values(fixture.records), ...Object.values(fixture.api)]) fn.mockReset();
    fixture.workflow.documentWorkflows.mockResolvedValue([]);
    fixture.workflow.command.mockResolvedValue({});
    fixture.api.get.mockImplementation(async (kind: string, id: string) => kind === 'roles' && id === ROLE ? { id, nom: 'Administrateur metier (recette)' } : kind === 'users' && id === USER ? { id, prenom: 'Mamadou', nom: 'Bah' } : Promise.reject(new Error('Introuvable')));
    fixture.api.list.mockResolvedValue({ items: [{ id: ROLE, nom: 'Administrateur metier (recette)', code: 'SNAE_RECETTE_ADMIN_METIER' }], page: 0, size: 20, hasMore: false });
    fixture.records.documentTypes.mockResolvedValue([{ id: TYPE_RAPPORT, code: 'RAPPORT', label: 'Rapport', family: null, status: 'ACTIF' }, { id: 'old', code: 'ANCIEN', label: 'Ancien type', family: null, status: 'ARCHIVE' }]);
    unhandled.length = 0;
});
window.addEventListener('unhandledrejection', event => { unhandled.push(event.reason); });

it('un circuit sans type de document lié explique quoi faire au lieu d’échouer en silence', async () => {
    fixture.workflow.command.mockRejectedValue(new ApiError(422, 'WORKFLOW_DEFINITION_MISSING', 'Aucun workflow actif n’est applicable à ce document.', 'd57442db-43b8-4cf2-9034-cfa240820732'));
    render(<WorkflowPanel documentId={DOC} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Démarrer un circuit' }));
    expect(await screen.findByText(/Aucun circuit ne s’applique à ce type de document/)).toBeTruthy();
    expect(screen.getByText(/Types de documents liés/)).toBeTruthy();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(unhandled).toEqual([]);
    expect((screen.getByRole('button', { name: 'Démarrer un circuit' }) as HTMLButtonElement).disabled).toBe(false);
});

it('toute autre erreur d’une action s’affiche, avec sa référence', async () => {
    fixture.workflow.command.mockRejectedValue(new ApiError(409, 'WORKFLOW_ALREADY_ACTIVE', 'Un circuit est déjà en cours.', 'ref-123'));
    render(<WorkflowPanel documentId={DOC} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Démarrer un circuit' }));
    expect(await screen.findByText('Un circuit est déjà en cours.')).toBeTruthy();
    expect(screen.getByText('Référence : ref-123')).toBeTruthy();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(unhandled).toEqual([]);
});

it('une prise en charge refusée s’affiche aussi', async () => {
    fixture.workflow.documentWorkflows.mockResolvedValue([instance()]);
    fixture.workflow.command.mockRejectedValue(new ApiError(409, 'WORKFLOW_TASK_NOT_AVAILABLE', 'La tâche n’est plus disponible.'));
    render(<WorkflowPanel documentId={DOC} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Prendre en charge' }));
    expect(await screen.findByText('La tâche n’est plus disponible.')).toBeTruthy();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(unhandled).toEqual([]);
});

it('les étapes se lisent par leur nom, avec le rôle responsable ou la personne qui a pris la tâche, jamais par un identifiant', async () => {
    fixture.workflow.documentWorkflows.mockResolvedValue([instance({ tasks: [
        { taskId: 't1', stepId: STEP, status: 'TERMINEE', roleId: ROLE, assignedUserId: USER, dueAt: null, claimedAt: null, completedAt: null, decisionCode: 'SOUMETTRE', stepLabel: 'Soumission', roleName: 'Administrateur metier (recette)', assignedUserName: 'Mamadou Bah' },
        { taskId: 't2', stepId: 'step-2', status: 'OUVERTE', roleId: ROLE, assignedUserId: null, dueAt: null, claimedAt: null, completedAt: null, decisionCode: null, stepLabel: 'Validation', roleName: 'Administrateur metier (recette)', assignedUserName: null }] })]);
    const view = render(<WorkflowPanel documentId={DOC} />);
    expect(await screen.findByText('Soumission')).toBeTruthy();
    expect(screen.getByText('Mamadou Bah · Administrateur metier (recette)')).toBeTruthy();
    expect(screen.getByText('Validation')).toBeTruthy();
    expect(view.container.textContent).not.toContain('1db067c2');
    expect(view.container.textContent).not.toContain('step-2');
});

it('face à un serveur plus ancien (sans noms), la tâche garde un libellé neutre et le nom de la personne est retrouvé', async () => {
    fixture.workflow.documentWorkflows.mockResolvedValue([instance({ tasks: [{ taskId: 't1', stepId: STEP, status: 'EN_COURS', roleId: null, assignedUserId: USER, dueAt: null, claimedAt: null, completedAt: null, decisionCode: null }] })]);
    const view = render(<WorkflowPanel documentId={DOC} />);
    expect(await screen.findByText('Étape', { selector: 'strong' })).toBeTruthy();
    expect(await screen.findByText('Mamadou Bah')).toBeTruthy();
    expect(view.container.textContent).not.toContain('1db067c2');
});

const openDefinition = async (status: 'BROUILLON' | 'ACTIF') => {
    fixture.workflow.definitions.mockResolvedValue([{ id: DEF, code: 'CV-NATIONAL-DOC', name: 'Circuit national', domain: 'DOCUMENT', version: 1, status, institutionId: null, effectiveFrom: '2026-09-30', effectiveTo: null }]);
    fixture.workflow.steps.mockResolvedValue([{ id: STEP, definitionId: DEF, code: 'SOUMISSION', label: 'Soumission', order: 1, responsibleRoleId: ROLE, delayMinutes: null, initial: true, final: false }]);
    render(<WorkflowPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'CV-NATIONAL-DOC' }));
    return screen.findByRole('dialog');
};

it('la fiche d’un circuit montre le rôle de chaque étape et les types de documents liés par leur nom', async () => {
    fixture.workflow.bindings.mockResolvedValue([{ id: 'b1', definitionId: DEF, typeDocumentId: TYPE_RAPPORT, required: false, priority: 100, from: '2026-09-30', to: null }]);
    const dialog = await openDefinition('ACTIF');
    expect(await within(dialog).findByText('Rapport')).toBeTruthy();
    expect(await within(dialog).findAllByText('Administrateur metier (recette)')).toBeTruthy();
    expect(within(dialog).getByText(/ne se modifie plus/)).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Lier à un type de document' })).toBeNull();
    expect(dialog.textContent).not.toContain(TYPE_RAPPORT.slice(0, 8));
});

it('un circuit sans aucun type lié le dit clairement', async () => {
    fixture.workflow.bindings.mockResolvedValue([]);
    const dialog = await openDefinition('BROUILLON');
    expect(await within(dialog).findByText(/n’est lié à aucun type de document/)).toBeTruthy();
});

it('le lien à un type de document se choisit par le nom du type (types actifs seulement), facultatif par défaut', async () => {
    fixture.workflow.bindings.mockResolvedValue([]);
    const dialog = await openDefinition('BROUILLON');
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Lier à un type de document' }));
    const bind = (await screen.findAllByRole('dialog')).at(-1)!;
    const select = await within(bind).findByLabelText(/Type de document/) as HTMLSelectElement;
    expect([...select.options].map(o => o.textContent)).toEqual(['Choisir un type de document', 'Rapport']);
    fireEvent.click(within(bind).getByRole('button', { name: 'Lier' }));
    expect(await within(bind).findByText('Choisissez le type de document.')).toBeTruthy();
    expect(fixture.workflow.command).not.toHaveBeenCalled();
    fireEvent.change(select, { target: { value: TYPE_RAPPORT } });
    fireEvent.click(within(bind).getByRole('button', { name: 'Lier' }));
    await waitFor(() => expect(fixture.workflow.command).toHaveBeenCalledTimes(1));
    const [path, body, , method] = fixture.workflow.command.mock.calls[0]!;
    expect(path).toBe(`/admin/workflow-definitions/${DEF}/document-types/${TYPE_RAPPORT}`);
    expect(body).toMatchObject({ required: false });
    expect(method).toBe('POST');
});

it('une étape se crée en choisissant le rôle responsable par son nom', async () => {
    fixture.workflow.bindings.mockResolvedValue([]);
    const dialog = await openDefinition('BROUILLON');
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Ajouter une étape' }));
    const step = (await screen.findAllByRole('dialog')).at(-1)!;
    fireEvent.change(within(step).getByLabelText(/^Code/), { target: { value: 'REVUE' } });
    fireEvent.change(within(step).getByLabelText(/^Libellé/), { target: { value: 'Revue' } });
    fireEvent.click(within(step).getByRole('button', { name: 'Ajouter' }));
    expect(await within(step).findByText('Choisissez le rôle responsable de cette étape.')).toBeTruthy();
    expect(fixture.workflow.command).not.toHaveBeenCalled();
    fireEvent.click(within(step).getByRole('button', { name: 'Sélectionner un rôle' }));
    fireEvent.click(await within(step).findByText('Administrateur metier (recette)', { selector: 'span' }));
    fireEvent.click(within(step).getByRole('button', { name: 'Ajouter' }));
    await waitFor(() => expect(fixture.workflow.command).toHaveBeenCalledTimes(1));
    expect(fixture.workflow.command.mock.calls[0]![1]).toMatchObject({ code: 'REVUE', label: 'Revue', responsibleRoleId: ROLE });
});

const inProgress = () => instance({ tasks: [{ taskId: 't9', stepId: STEP, status: 'EN_COURS', roleId: ROLE, assignedUserId: USER, dueAt: null, claimedAt: null, completedAt: null, decisionCode: null, stepLabel: 'Validation', roleName: 'Administrateur metier (recette)', assignedUserName: 'Mamadou Bah' }] });

it('terminer une tâche propose les suites possibles par leur libellé et envoie le code choisi', async () => {
    fixture.workflow.documentWorkflows.mockResolvedValue([inProgress()]);
    fixture.workflow.taskActions.mockResolvedValue({ taskId: 't9', stepLabel: 'Validation', canCompleteFinal: false, advisory: true, options: [
        { transitionCode: 'VALIDER', label: 'Passer à : Clôture', enabled: true, blockedReason: null },
        { transitionCode: 'REJETER', label: 'Passer à : Rejet', enabled: false, blockedReason: 'WORKFLOW_TRANSITION_CONDITION_FAILED' }] });
    render(<WorkflowPanel documentId={DOC} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Terminer' }));
    const dialog = await screen.findByRole('dialog');
    const select = await within(dialog).findByLabelText(/Suite à donner/) as HTMLSelectElement;
    expect([...select.options].map(o => o.textContent)).toEqual(['Choisir', 'Passer à : Clôture', 'Passer à : Rejet (indisponible : condition non remplie)']);
    expect(select.options[2]!.disabled).toBe(true);
    expect(within(dialog).queryByLabelText('Code de transition')).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Terminer' }));
    expect(await within(dialog).findByText('Choisissez la suite à donner.')).toBeTruthy();
    expect(fixture.workflow.command).not.toHaveBeenCalled();
    fireEvent.change(select, { target: { value: 'VALIDER' } });
    fireEvent.change(within(dialog).getByLabelText('Commentaire'), { target: { value: ' Conforme ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Terminer' }));
    await waitFor(() => expect(fixture.workflow.command).toHaveBeenCalledTimes(1));
    expect(fixture.workflow.command.mock.calls[0]!.slice(0, 2)).toEqual(['/workflow-tasks/t9/complete', { transitionCode: 'VALIDER', comment: 'Conforme' }]);
});

it('à l’étape finale, la tâche se termine sans choix de suite', async () => {
    fixture.workflow.documentWorkflows.mockResolvedValue([inProgress()]);
    fixture.workflow.taskActions.mockResolvedValue({ taskId: 't9', stepLabel: 'Clôture', canCompleteFinal: true, advisory: true, options: [] });
    render(<WorkflowPanel documentId={DOC} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Terminer' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/la dernière : la terminer clôture le circuit/)).toBeTruthy();
    expect(within(dialog).queryByLabelText(/Suite à donner/)).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Terminer' }));
    await waitFor(() => expect(fixture.workflow.command).toHaveBeenCalledTimes(1));
    expect(fixture.workflow.command.mock.calls[0]![1]).toEqual({ transitionCode: null, comment: null });
});

it('si les suites possibles ne se lisent pas, le code de transition se saisit comme avant, avec une explication', async () => {
    fixture.workflow.documentWorkflows.mockResolvedValue([inProgress()]);
    fixture.workflow.taskActions.mockRejectedValue(new ApiError(404, 'WORKFLOW_TASK_NOT_FOUND', 'Tâche introuvable.'));
    render(<WorkflowPanel documentId={DOC} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Terminer' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/n’ont pas pu être lues/)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText(/Code de transition/), { target: { value: 'VALIDER' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Terminer' }));
    await waitFor(() => expect(fixture.workflow.command).toHaveBeenCalledTimes(1));
    expect(fixture.workflow.command.mock.calls[0]![1]).toEqual({ transitionCode: 'VALIDER', comment: null });
});

it('transmet la définition explicite, le contexte et le lien archivistique au démarrage', async () => {
 render(<WorkflowPanel documentId={DOC}/>);
 fireEvent.change(screen.getByLabelText('Définition du circuit'), { target: { value: DEF } });
 fireEvent.change(screen.getByLabelText('Contexte du circuit (JSON)'), { target: { value: '{"objet":"instruction"}' } });
 await screen.findByRole('option', { name: 'ENT-TEST' });
 fireEvent.change(screen.getByLabelText('Entrée archivistique associée'), { target: { value: TYPE_RAPPORT } });
 fireEvent.click(screen.getByRole('button', { name: 'Démarrer un circuit' }));
 await waitFor(() => expect(fixture.workflow.command).toHaveBeenCalled());
 expect(fixture.workflow.command.mock.calls[0][1]).toEqual({ definitionId: DEF, context: { objet: 'instruction' }, entreeArchivistiqueId: TYPE_RAPPORT });
});
