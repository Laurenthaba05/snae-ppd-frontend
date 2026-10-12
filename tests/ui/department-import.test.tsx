import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/core/http';
const INST = '201f8298-f32b-4188-b804-c3d9b97c908f';
const fixture = vi.hoisted(() => ({
    epoch: 1, refresh: vi.fn(),
    me: { user: { id: 'u1', status: 'ACTIF', accountType: 'USER', institutionId: null, departmentId: null }, grants: [], truncated: false },
    api: { command: vi.fn(), list: vi.fn(), get: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
import { DepartmentImport } from '../../src/ui/DepartmentImport';

const api = fixture.api;
const csv = 'Code;Intitulé;Code du parent;Type d’unité\nSC;Service du courrier;DAF;Service\nDAF;Direction administrative;DG;Direction\nDRH;Ressources humaines;;Direction\nDG;Déjà là;;\n';
const upload = (file: File) => fireEvent.change(document.querySelector('input[type=file]') as HTMLInputElement, { target: { files: [file] } });
const setup = (institutionId: string | null = INST) => { const onClose = vi.fn(), onDone = vi.fn(); render(<DepartmentImport initialInstitutionId={institutionId} onClose={onClose} onDone={onDone} />); return { onClose, onDone }; };
const ready = async () => { await waitFor(() => expect((document.querySelector('input[type=file]') as HTMLInputElement).disabled).toBe(false)); };
beforeEach(() => {
    fixture.epoch += 1; fixture.refresh.mockReset();
    api.command.mockReset().mockImplementation(async (_path: string, body: { code: string }) => ({ id: 'new-' + body.code }));
    api.list.mockReset().mockResolvedValue({ items: [{ id: 'id-dg', code: 'DG', nom: 'Direction générale' }], page: 0, size: 100, hasMore: false });
    api.get.mockReset().mockResolvedValue({ id: INST, nom: 'Archives nationales de Guinée' });
});

it('lit les départements existants avant d’accepter un fichier, puis crée les parents avant leurs enfants', async () => {
    const { onDone } = setup();
    expect((document.querySelector('input[type=file]') as HTMLInputElement).disabled).toBe(true);
    await ready();
    expect(api.list).toHaveBeenCalledWith('departments', { institutionId: INST, page: 0, size: 100 }, expect.anything());
    expect(screen.getByText('1 département existe déjà : ils peuvent servir de parent.')).toBeTruthy();
    upload(new File([csv], 'departements.csv', { type: 'text/csv' }));
    await screen.findByText('Importer 3 départements');
    expect(screen.getByText(/existe déjà dans l’institution/)).toBeTruthy();
    expect(await screen.findByText('Archives nationales de Guinée')).toBeTruthy();
    expect(document.body.textContent).not.toContain('201f8298');
    fireEvent.click(screen.getByRole('button', { name: /Importer 3 départements/ }));
    await screen.findByRole('button', { name: /Télécharger le rapport/ });
    const calls = api.command.mock.calls as Array<[string, Record<string, unknown>, string, string]>;
    expect(calls.map(c => (c[1] as { code: string }).code)).toEqual(['DAF', 'SC', 'DRH']);
    expect(calls[0]!.slice(0, 2)).toEqual(['/departments', { institutionId: INST, parentId: 'id-dg', code: 'DAF', nom: 'Direction administrative', typeUnite: 'Direction' }]);
    expect(calls[1]![1]).toEqual({ institutionId: INST, parentId: 'new-DAF', code: 'SC', nom: 'Service du courrier', typeUnite: 'Service' });
    expect(calls[2]![1]).toEqual({ institutionId: INST, parentId: null, code: 'DRH', nom: 'Ressources humaines', typeUnite: 'Direction' });
    expect(calls[0]![3]).toBe('POST');
    expect(new Set(calls.map(c => c[2])).size).toBe(3);
    expect(screen.getAllByText('Créé')).toHaveLength(3);
    expect(onDone).toHaveBeenCalled();
});

it('lit aussi un classeur .xlsx et plusieurs pages de départements existants', async () => {
    const { buildXlsx } = await import('../../src/core/spreadsheet');
    api.list.mockReset()
        .mockResolvedValueOnce({ items: [{ id: 'id-a', code: 'A', nom: 'A' }], page: 0, size: 100, hasMore: true })
        .mockResolvedValueOnce({ items: [{ id: 'id-b', code: 'B', nom: 'B' }], page: 1, size: 100, hasMore: false });
    setup();
    await screen.findByText('2 départements existent déjà : ils peuvent servir de parent.');
    expect(api.list).toHaveBeenCalledTimes(2);
    upload(new File([buildXlsx([{ name: 'Départements', rows: [['Code', 'Intitulé', 'Code du parent', 'Type d’unité'], ['X1', 'Fils de B', 'b', '']] }]) as BlobPart], 'm.xlsx'));
    await screen.findByText('Importer 1 département');
});

it('un parent en échec empêche ses enfants sans appeler le serveur ; le rejeu réutilise la clé et crée l’enfant', async () => {
    api.command.mockImplementationOnce(async () => { throw new ApiError(409, 'IAM_DEPARTMENT_CODE_EXISTS', 'Code déjà utilisé dans l’institution.'); });
    setup();
    await ready();
    upload(new File([csv], 'd.csv'));
    fireEvent.click(await screen.findByRole('button', { name: /Importer 3 départements/ }));
    await screen.findByText('Code déjà utilisé dans l’institution.');
    expect(await screen.findByText(/Non créé : le parent « DAF » \(ligne 3\) n’a pas été créé/)).toBeTruthy();
    expect(api.command).toHaveBeenCalledTimes(2); // DAF (refusé) et DRH ; SC n'a pas été envoyé
    const firstKey = api.command.mock.calls[0]![2];
    fireEvent.click(screen.getByRole('button', { name: /Réessayer 2 lignes/ }));
    await waitFor(() => expect(api.command).toHaveBeenCalledTimes(4));
    expect(api.command.mock.calls[2]![2]).toBe(firstKey);
    expect((api.command.mock.calls[3]![1] as { parentId: string }).parentId).toBe('new-DAF');
    await waitFor(() => expect(screen.getAllByText('Créé')).toHaveLength(3));
});

it('s’arrête sur un refus de droits et laisse les lignes restantes non traitées', async () => {
    api.command.mockReset().mockRejectedValue(new ApiError(403, 'ACCESS_DENIED', 'Accès refusé.'));
    setup();
    await ready();
    upload(new File([csv], 'd.csv'));
    fireEvent.click(await screen.findByRole('button', { name: /Importer 3 départements/ }));
    await screen.findByText(/Droits insuffisants/);
    expect(api.command).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText('Non traité').length).toBe(2);
});

it('sans institution choisie, aucun fichier n’est accepté ; la lecture des départements existants peut échouer et se rejouer', async () => {
    setup(null);
    expect((document.querySelector('input[type=file]') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText('Choisissez d’abord une institution')).toBeTruthy();
    expect(api.list).not.toHaveBeenCalled();
});

it('une lecture refusée des départements existants bloque l’import et propose de réessayer', async () => {
    api.list.mockReset().mockRejectedValueOnce(new ApiError(403, 'ACCESS_DENIED', 'Accès refusé.')).mockResolvedValue({ items: [], page: 0, size: 100, hasMore: false });
    setup();
    expect(await screen.findByText('Accès refusé.')).toBeTruthy();
    expect((document.querySelector('input[type=file]') as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Réessayer/ }));
    expect(await screen.findByText('Aucun département n’existe encore dans cette institution.')).toBeTruthy();
    await ready();
});

it('refuse un fichier sans les colonnes attendues sans rien envoyer', async () => {
    setup();
    await ready();
    upload(new File(['Nom;Ville\nA;B\n'], 'x.csv'));
    await screen.findByText(/Colonnes obligatoires introuvables/);
    expect(api.command).not.toHaveBeenCalled();
});
