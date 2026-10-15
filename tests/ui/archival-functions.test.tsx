import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { ArchivesApi, AuthorityView, DescriptionView } from '../../src/api/archives';
import { emptyFunction, type FunctionDetailView, type FunctionView } from '../../src/core/archivalFunctions';
import { ArchivalFunctionsPanel } from '../../src/ui/ArchivalFunctions';

const INST = '97571d20-3f49-497e-a185-dac22208eb3f';
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const AUTH = '33333333-3333-4333-8333-333333333333';
const DESC = '44444444-4444-4444-8444-444444444444';

const fn = (id: string, code: string, name: string, kind: FunctionView['input']['kind'], parentId: string | null = null): FunctionView =>
    ({ id, version: 2, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-02T00:00:00Z', input: { ...emptyFunction(INST), code, name, kind, parentId, description: 'Décrite', status: 'REVISEE' } });
const api = {
    functions: vi.fn(), functionDetail: vi.fn(), saveFunction: vi.fn(), deleteFunction: vi.fn(), addFunctionLink: vi.fn(), removeFunctionLink: vi.fn()
};
const authorities = [{ id: AUTH, input: { institutionId: INST, code: 'MIN-FP', name: 'Ministère de la Fonction publique', kind: 'COLLECTIVITE', actorId: null, details: {} }, version: 0, updatedAt: '' }] as unknown as AuthorityView[];
const descriptions = [{ id: DESC, input: { institutionId: INST, code: 'FONDS-FP', title: 'Fonds du ministère', level: 'FONDS', parentId: null, producerId: null, confidentiality: 'INTERNE', documentId: null, dossierId: null, details: {} }, version: 0, updatedAt: '' }] as unknown as DescriptionView[];
const detail = (row: FunctionView, over: Partial<FunctionDetailView> = {}): FunctionDetailView => ({ function: row, ancestors: [], children: [], links: [], ...over });
const panel = (canManage = true) => render(<ArchivalFunctionsPanel api={api as unknown as ArchivesApi} institution={INST} descriptions={descriptions} authorities={authorities} canManage={canManage} />);

beforeEach(() => {
    for (const f of Object.values(api)) f.mockReset();
    api.functions.mockResolvedValue([fn(B, 'RH.PAIE', 'Paie', 'ACTIVITE', A), fn(A, 'RH', 'Gestion des ressources humaines', 'FONCTION')]);
    api.functionDetail.mockImplementation(async (id: string) => detail((await api.functions.mock.results[0]!.value as FunctionView[]).find(f => f.id === id)!));
    api.saveFunction.mockResolvedValue({});
});

it('liste les fonctions en arbre : la mère d’abord, sa fille en retrait, avec type et état', async () => {
    panel();
    const rows = await screen.findAllByRole('row');
    const text = rows.map(r => r.textContent ?? '');
    expect(text.findIndex(t => t.includes('RH · Gestion'))).toBeLessThan(text.findIndex(t => t.includes('RH.PAIE · Paie')));
    expect(screen.getByText('Activité')).toBeTruthy();
    expect(screen.getAllByText('Révisée').length).toBe(2);
});

it('crée une fonction : le code et le nom sont exigés, puis la saisie part au serveur', async () => {
    panel();
    fireEvent.click(await screen.findByRole('button', { name: 'Créer une fonction' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(await within(dialog).findByText(/Le code est obligatoire/)).toBeTruthy();
    expect(api.saveFunction).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText('Code *'), { target: { value: 'FIN' } });
    fireEvent.change(within(dialog).getByLabelText('Forme autorisée du nom *'), { target: { value: 'Gestion financière' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(api.saveFunction).toHaveBeenCalled());
    const [id, input] = api.saveFunction.mock.calls[0] as [string | undefined, Record<string, unknown>];
    expect(id).toBeUndefined();
    expect(input).toMatchObject({ institutionId: INST, code: 'FIN', name: 'Gestion financière', kind: 'FONCTION', parentId: null, status: 'BROUILLON' });
    expect(await screen.findByText('Fonction créée.')).toBeTruthy();
});

it('le niveau proposé suit la fonction mère choisie', async () => {
    panel();
    fireEvent.click(await screen.findByRole('button', { name: 'Créer une fonction' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Fonction mère/), { target: { value: B } });   // une activité
    const type = within(dialog).getByLabelText('Type') as HTMLSelectElement;
    await waitFor(() => expect(Array.from(type.options).map(o => o.textContent)).toEqual(['Tâche', 'Processus', 'Autre']));
});

it('relie une fonction au producteur qui l’exerce et retire un lien', async () => {
    api.functionDetail.mockResolvedValue(detail(fn(A, 'RH', 'Gestion des ressources humaines', 'FONCTION'), {
        children: [{ id: B, code: 'RH.PAIE', name: 'Paie', kind: 'ACTIVITE' }],
        links: [{ id: 'l1', version: 3, updatedAt: '', targetLabel: 'FONDS-FP — Fonds du ministère', input: { institutionId: INST, functionId: A, targetKind: 'DESCRIPTION', targetId: DESC, nature: 'DOCUMENTEE_PAR', dateStart: null, dateEnd: null, description: null } }]
    }));
    api.addFunctionLink.mockResolvedValue({});
    api.removeFunctionLink.mockResolvedValue({ id: 'l1' });
    panel();
    fireEvent.click((await screen.findAllByRole('button', { name: 'Consulter / modifier' }))[0]!);   // RH, la fonction de premier niveau
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/Documentée par/)).toBeTruthy();
    expect(within(dialog).getByText(/Contient : RH.PAIE · Paie/)).toBeTruthy();
    const form = within(dialog).getByRole('form', { name: 'Ajouter un lien' });
    fireEvent.change(within(form).getByLabelText('Cible'), { target: { value: AUTH } });
    fireEvent.click(within(form).getByRole('button', { name: 'Ajouter le lien' }));
    await waitFor(() => expect(api.addFunctionLink).toHaveBeenCalled());
    expect(api.addFunctionLink.mock.calls[0]![0]).toMatchObject({ institutionId: INST, functionId: A, targetKind: 'AUTHORITY', targetId: AUTH, nature: 'EXERCEE_PAR' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retirer' }));
    await waitFor(() => expect(api.removeFunctionLink).toHaveBeenCalledWith('l1', INST, 3, expect.any(String)));
});

it('sans droit de gestion, tout se consulte et rien ne se modifie', async () => {
    panel(false);
    await screen.findAllByRole('row');
    expect(screen.queryByRole('button', { name: 'Créer une fonction' })).toBeNull();
    fireEvent.click((await screen.findAllByRole('button', { name: 'Consulter' }))[0]!);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('button', { name: 'Enregistrer' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Supprimer' })).toBeNull();
    expect(within(dialog).queryByRole('form', { name: 'Ajouter un lien' })).toBeNull();
});

it('un conflit du serveur s’affiche et la fenêtre reste ouverte', async () => {
    api.saveFunction.mockRejectedValue(Object.assign(new Error('Ce code est déjà pris dans l’institution.'), { status: 409, code: 'ARCHIVAL_CONFLICT' }));
    panel();
    fireEvent.click(await screen.findByRole('button', { name: 'Créer une fonction' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Code *'), { target: { value: 'RH' } });
    fireEvent.change(within(dialog).getByLabelText('Forme autorisée du nom *'), { target: { value: 'Doublon' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(await within(dialog).findByText(/déjà pris/)).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
});
