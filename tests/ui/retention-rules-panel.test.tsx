import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/core/http';
import type { RetentionRuleListItem } from '../../src/core/types';
const INST = '97571d20-3f49-497e-a185-dac22208eb3f';
const fixture = vi.hoisted(() => ({
    epoch: 1,
    retention: { rules: vi.fn(), command: vi.fn(), triggerEventTypes: vi.fn() },
    records: { documentTypes: vi.fn() },
    classification: { nodes: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: { institutionId: INST, departmentId: null } }) }));
import { RetentionRulesPanel } from '../../src/ui/RetentionRules';

const version = (extra: Record<string, unknown> = {}) => ({ id: 'v1', number: 1, status: 'ACTIVE', effectiveFrom: '2026-10-05', effectiveTo: null, duration: 10, unit: 'ANNEES', trigger: 'DATE_CLOTURE_DOCUMENT', finalDisposition: 'CONSERVER_DEFINITIVEMENT', legalReference: null,
    typeDocumentIds: ['t-arrete', 't-corr'], classificationNodeIds: [], ...extra });
const rule = (extra: Partial<RetentionRuleListItem> = {}): RetentionRuleListItem => ({ id: 'r1', code: 'CONS-10', label: 'Conservation 10 ans', scope: 'INSTITUTION', institutionId: INST, priority: 100, status: 'ACTIF', versions: [version()], deletable: false, ...extra });
const empty = (code: string, id: string): RetentionRuleListItem => rule({ id, code, label: 'CONSERVATION', versions: [], deletable: true });

beforeEach(() => {
    fixture.epoch += 1;
    for (const fn of [...Object.values(fixture.retention), ...Object.values(fixture.records), ...Object.values(fixture.classification)]) fn.mockReset();
    fixture.retention.triggerEventTypes.mockResolvedValue([]);
    fixture.retention.rules.mockResolvedValue([rule(), empty('CONV-10', 'r2')]);
    fixture.retention.command.mockImplementation(async (path: string) => path.endsWith('/versions') ? { id: 'version-new' } : null);
    fixture.records.documentTypes.mockResolvedValue([{ id: 't-arrete', code: 'ARRETE', label: 'Arrêté', family: null, status: 'ACTIF' }, { id: 't-corr', code: 'CORRESPONDANCE', label: 'Correspondance', family: null, status: 'ACTIF' }, { id: 't-rapport', code: 'RAPPORT', label: 'Rapport', family: null, status: 'ACTIF' }]);
    fixture.classification.nodes.mockResolvedValue([]);
});

it('liste chaque règle avec ce qu’elle dit, ce qu’elle vise par leurs noms et son état', async () => {
    render(<RetentionRulesPanel />);
    const row = (await screen.findByText('CONS-10')).closest('tr')!;
    expect(within(row).getByText('10 ans après la clôture du document, puis conserver définitivement')).toBeTruthy();
    await waitFor(() => expect(within(row).getByText('Arrêté, Correspondance')).toBeTruthy());
    expect(within(row).getByText('En vigueur')).toBeTruthy();
    expect(within(row).getByText(/version 1 depuis le 5 octobre 2026/)).toBeTruthy();
    expect(within(row).queryByRole('button', { name: 'Supprimer' })).toBeNull();
    const orphan = screen.getByText('CONV-10').closest('tr')!;
    expect(within(orphan).getByText('Sans version')).toBeTruthy();
    expect(within(orphan).getByRole('button', { name: 'Supprimer' })).toBeTruthy();
    expect(within(orphan).getByRole('button', { name: 'Ajouter une version' })).toBeTruthy();
    expect(fixture.retention.rules).toHaveBeenCalledWith(INST, expect.anything());
    expect(document.body.textContent).not.toContain('t-arrete');
});

it('donner une nouvelle version à une règle existante ne recrée pas la règle et remplace la version en vigueur', async () => {
    render(<RetentionRulesPanel />);
    const row = (await screen.findByText('CONS-10')).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Nouvelle version' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Nouvelle version de la règle CONS-10')).toBeTruthy();
    expect(within(dialog).getByText(/remplace la version en vigueur/)).toBeTruthy();
    expect((within(dialog).getByLabelText(/^Code/) as HTMLInputElement).disabled).toBe(true);
    expect((within(dialog).getByLabelText(/^Durée/) as HTMLInputElement).value).toBe('10');
    expect((await within(dialog).findByLabelText('Arrêté') as HTMLInputElement).checked).toBe(true);
    expect((within(dialog).getByLabelText('Rapport') as HTMLInputElement).checked).toBe(false);
    fireEvent.change(within(dialog).getByLabelText(/^Durée/), { target: { value: '15' } });
    fireEvent.click(within(dialog).getByLabelText('Rapport'));
    fixture.retention.rules.mockResolvedValue([rule({ versions: [version({ id: 'v-new', number: 2, duration: 15 }), version({ status: 'RETIRE' })] }), empty('CONV-10', 'r2')]);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer et activer la version' }));
    expect(await screen.findByText('La nouvelle version de la règle CONS-10 est en vigueur.')).toBeTruthy();
    const calls = fixture.retention.command.mock.calls as Array<[string, Record<string, unknown>, string, string]>;
    expect(calls.map(c => c[0])).toEqual(['/rules/r1/versions', '/versions/version-new/activate']);
    expect(calls[0]![1]).toMatchObject({ duration: 15, unit: 'ANNEES', trigger: 'DATE_CLOTURE_DOCUMENT', finalDisposition: 'CONSERVER_DEFINITIVEMENT', typeDocumentIds: ['t-arrete', 't-corr', 't-rapport'] });
    await waitFor(() => expect(screen.getByText('2 versions au total')).toBeTruthy());
});

it('une règle sans version se complète avec sa première version, formulaire vide de réglages', async () => {
    render(<RetentionRulesPanel />);
    const orphan = (await screen.findByText('CONV-10')).closest('tr')!;
    fireEvent.click(within(orphan).getByRole('button', { name: 'Ajouter une version' }));
    const dialog = await screen.findByRole('dialog');
    expect((within(dialog).getByLabelText(/^Durée/) as HTMLInputElement).value).toBe('');
    fireEvent.change(within(dialog).getByLabelText(/^Durée/), { target: { value: '5' } });
    fireEvent.click(await within(dialog).findByLabelText('Rapport'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer et activer la version' }));
    await waitFor(() => expect(fixture.retention.command).toHaveBeenCalledTimes(2));
    expect(fixture.retention.command.mock.calls[0]![0]).toBe('/rules/r2/versions');
});

it('supprimer une règle sans version demande confirmation, puis la retire de la liste', async () => {
    render(<RetentionRulesPanel />);
    const orphan = (await screen.findByText('CONV-10')).closest('tr')!;
    fireEvent.click(within(orphan).getByRole('button', { name: 'Supprimer' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/aucune version/)).toBeTruthy();
    expect(fixture.retention.command).not.toHaveBeenCalled();
    fixture.retention.rules.mockResolvedValue([rule()]);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Supprimer la règle' }));
    await waitFor(() => expect(fixture.retention.command).toHaveBeenCalledWith('/rules/r2/delete', {}, expect.any(String), 'POST'));
    expect(await screen.findByText('La règle CONV-10 est supprimée.')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('CONV-10', { selector: 'strong' })).toBeNull());
});

it('un refus de suppression s’affiche et la règle reste', async () => {
    fixture.retention.command.mockRejectedValue(new ApiError(409, 'RETENTION_RULE_HAS_VERSIONS', 'Une règle qui a des versions ne se supprime pas : donnez-lui une nouvelle version.'));
    render(<RetentionRulesPanel />);
    const orphan = (await screen.findByText('CONV-10')).closest('tr')!;
    fireEvent.click(within(orphan).getByRole('button', { name: 'Supprimer' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Supprimer la règle' }));
    expect(await screen.findByText('Une règle qui a des versions ne se supprime pas : donnez-lui une nouvelle version.')).toBeTruthy();
    expect(screen.getAllByText('CONV-10').length).toBeGreaterThan(0);
});

it('sans règle, le panneau invite à en créer une ; une erreur de lecture se montre', async () => {
    fixture.retention.rules.mockResolvedValue([]);
    const view = render(<RetentionRulesPanel />);
    expect(await screen.findByText('Aucune règle de conservation')).toBeTruthy();
    view.unmount();
    fixture.retention.rules.mockRejectedValue(new ApiError(403, 'ACCESS_DENIED', 'Accès refusé.'));
    render(<RetentionRulesPanel />);
    expect(await screen.findByText('Accès refusé.')).toBeTruthy();
});
