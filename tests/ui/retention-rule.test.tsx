import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/core/http';
const INST = '201f8298-f32b-4188-b804-c3d9b97c908f';
const fixture = vi.hoisted(() => ({
    epoch: 1,
    retention: { command: vi.fn(), triggerEventTypes: vi.fn() },
    records: { documentTypes: vi.fn() },
    classification: { nodes: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: { institutionId: INST, departmentId: null } }) }));
import { ConfigureRetentionRuleDialog } from '../../src/ui/RetentionRuleDialog';

const setup = () => { const onClose = vi.fn(), onSuccess = vi.fn(); render(<ConfigureRetentionRuleDialog onClose={onClose} onSuccess={onSuccess} />); return { onClose, onSuccess }; };
const fill = async (code = 'CONV-10') => {
    fireEvent.change(await screen.findByLabelText(/^Code/), { target: { value: code } });
    fireEvent.change(screen.getByLabelText(/^Intitulé/), { target: { value: 'Conservation 10 ans' } });
    fireEvent.change(screen.getByLabelText(/^Durée/), { target: { value: '10' } });
};
const submit = () => fireEvent.click(screen.getByRole('button', { name: /Créer et activer|Enregistrer et activer/ }));
beforeEach(() => {
    fixture.epoch += 1;
    fixture.retention.triggerEventTypes.mockReset().mockResolvedValue([]);
    fixture.retention.command.mockReset().mockImplementation(async (path: string) => path === '/rules' ? { id: 'rule-1' } : path.endsWith('/versions') ? { id: 'version-1' } : {});
    fixture.records.documentTypes.mockReset().mockResolvedValue([{ id: 't-rapport', code: 'RAPPORT', label: 'Rapport', family: null, status: 'ACTIF' }, { id: 't-decret', code: 'DECRET', label: 'Décret', family: null, status: 'ACTIF' }, { id: 't-old', code: 'ANCIEN', label: 'Ancien type', family: null, status: 'ARCHIVE' }]);
    fixture.classification.nodes.mockReset().mockResolvedValue([{ id: 'n-1', parentId: null, institutionId: INST, code: 'RH', libelle: 'Ressources humaines', description: null, typeNoeud: 'SERIE', statut: 'ACTIF', ordre: 1, dateDebutValidite: null, dateFinValidite: null, versionLock: 0 },
        { id: 'n-2', parentId: null, institutionId: INST, code: 'OLD', libelle: 'Rubrique retirée', description: null, typeNoeud: 'SERIE', statut: 'INACTIF', ordre: 2, dateDebutValidite: null, dateFinValidite: null, versionLock: 0 }]);
});

it('propose les types de documents actifs et les rubriques actives par leur nom, jamais par un identifiant', async () => {
    setup();
    expect(await screen.findByLabelText('Rapport')).toBeTruthy();
    expect(screen.getByLabelText('Décret')).toBeTruthy();
    expect(screen.queryByLabelText('Ancien type')).toBeNull();
    expect(await screen.findByLabelText('RH — Ressources humaines')).toBeTruthy();
    expect(screen.queryByLabelText(/Rubrique retirée/)).toBeNull();
    expect(fixture.classification.nodes).toHaveBeenCalledWith(INST, expect.anything());
    expect(document.body.textContent).not.toContain('t-rapport');
});

it('sans cible, rien n’est envoyé et la règle n’est pas créée à vide', async () => {
    setup();
    await fill();
    submit();
    expect(await screen.findByText(/au moins un type de document ou une rubrique/)).toBeTruthy();
    expect(fixture.retention.command).not.toHaveBeenCalled();
});

it('une règle qui élimine exige sa référence légale', async () => {
    setup();
    await fill();
    fireEvent.click(await screen.findByLabelText('Rapport'));
    fireEvent.change(screen.getByLabelText(/^Sort final/), { target: { value: 'ELIMINER' } });
    submit();
    expect(await screen.findByText(/exige sa référence légale/)).toBeTruthy();
    expect(fixture.retention.command).not.toHaveBeenCalled();
});

it('crée la règle, sa version avec ses cibles, puis l’active', async () => {
    const { onClose, onSuccess } = setup();
    await fill('conv-10');
    fireEvent.click(await screen.findByLabelText('Rapport'));
    fireEvent.click(await screen.findByLabelText('RH — Ressources humaines'));
    submit();
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
    const calls = fixture.retention.command.mock.calls as Array<[string, Record<string, unknown>, string, string]>;
    expect(calls.map(c => c[0])).toEqual(['/rules', '/rules/rule-1/versions', '/versions/version-1/activate']);
    expect(calls[0]![1]).toEqual({ code: 'conv-10', label: 'Conservation 10 ans', scope: 'INSTITUTION', institutionId: INST, priority: 100 });
    expect(calls[1]![1]).toMatchObject({ duration: 10, unit: 'ANNEES', trigger: 'DATE_CLOTURE_DOCUMENT', finalDisposition: 'REEXAMINER', legalReference: null, typeDocumentIds: ['t-rapport'], classificationNodeIds: ['n-1'] });
    expect((calls[1]![1] as { effectiveFrom: string }).effectiveFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Set(calls.map(c => c[2])).size).toBe(3);
});

it('si la version est refusée, la règle déjà créée n’est pas recréée : on corrige et on reprend à l’étape de la version', async () => {
    fixture.retention.command.mockImplementation(async (path: string) => {
        if (path === '/rules') return { id: 'rule-1' };
        if (path.endsWith('/versions') && fixture.retention.command.mock.calls.filter(c => (c[0] as string).endsWith('/versions')).length === 1) throw new ApiError(422, 'RETENTION_VALIDITY_INVALID', 'La période de validité est inversée.');
        return path.endsWith('/versions') ? { id: 'version-1' } : {};
    });
    const { onSuccess } = setup();
    await fill();
    fireEvent.click(await screen.findByLabelText('Rapport'));
    submit();
    expect(await screen.findByText('La période de validité est inversée.')).toBeTruthy();
    expect(screen.getByText(/est créée ; il reste à enregistrer et activer sa première version/)).toBeTruthy();
    // L'identité de la règle ne se modifie plus ; la version, si.
    expect((screen.getByLabelText(/^Code/) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText(/^Intitulé/) as HTMLInputElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/^Durée/), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer et activer la version' }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const paths = fixture.retention.command.mock.calls.map(c => c[0] as string);
    expect(paths.filter(p => p === '/rules')).toHaveLength(1);
    expect(paths).toEqual(['/rules', '/rules/rule-1/versions', '/rules/rule-1/versions', '/versions/version-1/activate']);
    expect(fixture.retention.command.mock.calls[2]![1]).toMatchObject({ duration: 12 });
    expect(fixture.retention.command.mock.calls[2]![2]).not.toBe(fixture.retention.command.mock.calls[1]![2]); // contenu modifié : nouvelle intention, nouvelle clé
});

it('rejouer le même contenu réutilise la même clé d’idempotence', async () => {
    let attempts = 0;
    fixture.retention.command.mockImplementation(async (path: string) => {
        if (path === '/rules') return { id: 'rule-1' };
        if (path.endsWith('/versions')) { attempts += 1; if (attempts === 1) throw new ApiError(0, 'NETWORK', 'Connexion impossible.'); return { id: 'version-1' }; }
        return {};
    });
    const { onSuccess } = setup();
    await fill();
    fireEvent.click(await screen.findByLabelText('Rapport'));
    submit();
    await screen.findByText('Connexion impossible.');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer et activer la version' }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const versionCalls = fixture.retention.command.mock.calls.filter(c => (c[0] as string).endsWith('/versions'));
    expect(versionCalls).toHaveLength(2);
    expect(versionCalls[1]![2]).toBe(versionCalls[0]![2]);
});

it('un code déjà pris l’explique et n’envoie pas de version', async () => {
    fixture.retention.command.mockRejectedValue(new ApiError(409, 'RETENTION_RULE_EXISTS', 'Ce code de règle existe déjà.'));
    setup();
    await fill();
    fireEvent.click(await screen.findByLabelText('Rapport'));
    submit();
    expect(await screen.findByText('Ce code de règle existe déjà.')).toBeTruthy();
    expect(screen.getByText(/Choisissez un autre code/)).toBeTruthy();
    expect(fixture.retention.command).toHaveBeenCalledTimes(1);
    expect((screen.getByLabelText(/^Code/) as HTMLInputElement).disabled).toBe(false);
});

it('si le plan de classement ne se lit pas, la règle peut viser des types de documents seulement', async () => {
    fixture.classification.nodes.mockReset().mockRejectedValue(new ApiError(403, 'ACCESS_DENIED', 'Accès refusé.'));
    setup();
    expect(await screen.findByText(/plan de classement n’a pas pu être lu/)).toBeTruthy();
    await fill();
    fireEvent.click(await screen.findByLabelText('Rapport'));
    submit();
    await waitFor(() => expect(fixture.retention.command).toHaveBeenCalledTimes(3));
});

it('enregistre une règle future en brouillon avec priorité, description et fondement juridique', async () => {
 const { onSuccess } = setup();
 await fill('FUTURE-1'); fireEvent.click(await screen.findByLabelText('Rapport'));
 fireEvent.change(screen.getByLabelText('Description de la règle'), { target: { value: 'Règle pour le prochain exercice' } });
 fireEvent.change(screen.getByLabelText('Priorité de la règle'), { target: { value: '42' } });
 fireEvent.change(screen.getByLabelText('Début d’effet'), { target: { value: '2090-01-01' } });
 fireEvent.change(screen.getByLabelText('Fin d’effet'), { target: { value: '2095-12-31' } });
 fireEvent.change(screen.getByLabelText('Description juridique'), { target: { value: 'Application du texte de référence' } });
 submit();
 expect(await screen.findByText(/ne permet pas une activation aujourd’hui/)).toBeTruthy();
 expect(fixture.retention.command).not.toHaveBeenCalled();
 fireEvent.change(screen.getByLabelText('Enregistrement de la règle'), { target: { value: 'draft' } });
 fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));
 await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('FUTURE-1', false));
 expect(fixture.retention.command.mock.calls).toHaveLength(2);
 expect(fixture.retention.command.mock.calls[0][1]).toMatchObject({ priority: 42, description: 'Règle pour le prochain exercice' });
 expect(fixture.retention.command.mock.calls[1][1]).toMatchObject({ effectiveFrom: '2090-01-01', effectiveTo: '2095-12-31', legalDescription: 'Application du texte de référence' });
});
it('refuse une période de validité inversée avant toute création', async () => {
 setup(); await fill(); fireEvent.click(await screen.findByLabelText('Rapport'));
 fireEvent.change(screen.getByLabelText('Début d’effet'), { target: { value: '2090-01-01' } });
 fireEvent.change(screen.getByLabelText('Fin d’effet'), { target: { value: '2080-01-01' } });
 submit();
 expect(await screen.findByText(/La fin de validité doit suivre le début/)).toBeTruthy();
 expect(fixture.retention.command).not.toHaveBeenCalled();
});
