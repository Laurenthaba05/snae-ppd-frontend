import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/core/http';
import { buildXlsx } from '../../src/core/spreadsheet';
const fixture = vi.hoisted(() => ({ api: { command: vi.fn() }, refresh: vi.fn() }));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
import { InstitutionImport } from '../../src/ui/InstitutionImport';

const csv = 'Code;Intitulé;Sigle;Type\nMEF;Ministère de l’Économie;MEF;Ministère\nDGI;Direction générale des impôts;;Direction générale\n1BAD;Code invalide;;Autre\n';
const upload = (file: File) => fireEvent.change(document.querySelector('input[type=file]') as HTMLInputElement, { target: { files: [file] } });
const setup = () => { const onClose = vi.fn(), onDone = vi.fn(); render(<InstitutionImport onClose={onClose} onDone={onDone} />); return { onClose, onDone }; };
beforeEach(() => { fixture.api.command.mockReset().mockResolvedValue({}); fixture.refresh.mockReset(); });

it('affiche un aperçu contrôlé puis crée uniquement les lignes valides, une clé d’idempotence par ligne', async () => {
    const { onDone } = setup();
    upload(new File([csv], 'institutions.csv', { type: 'text/csv' }));
    await screen.findByText('Importer 2 institutions');
    expect(screen.getByText(/ignorée.*erreurs/)).toBeTruthy();
    expect(screen.getByText(/Code invalide : une lettre/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Importer 2 institutions/ }));
    await screen.findByRole('button', { name: /Télécharger le rapport/ });
    expect(fixture.api.command).toHaveBeenCalledTimes(2);
    const [first, second] = fixture.api.command.mock.calls as Array<[string, Record<string, unknown>, string, string]>;
    expect(first.slice(0, 2)).toEqual(['/institutions', { code: 'MEF', nom: 'Ministère de l’Économie', sigle: 'MEF', typeInstitution: 'MINISTERE' }]);
    expect(second[1]).toEqual({ code: 'DGI', nom: 'Direction générale des impôts', sigle: null, typeInstitution: 'DIRECTION_GENERALE' });
    expect(first[3]).toBe('POST');
    expect(first[2]).not.toBe(second[2]);
    expect(screen.getAllByText('Créée')).toHaveLength(2);
    expect(onDone).toHaveBeenCalled();
});

it('lit aussi un classeur .xlsx généré (modèle rempli)', async () => {
    setup();
    const bytes = buildXlsx([{ name: 'Institutions', rows: [['Code', 'Intitulé', 'Sigle', 'Type'], ['SG', 'Secrétariat général', 'SG', 'Direction générale']] }]);
    upload(new File([bytes as BlobPart], 'm.xlsx'));
    await screen.findByText('Importer 1 institution');
});

it('un échec n’arrête pas les autres lignes et le rejeu réutilise la même clé', async () => {
    fixture.api.command.mockRejectedValueOnce(new ApiError(409, 'IAM_CODE_ALREADY_EXISTS', 'Ce code existe déjà.'));
    setup();
    upload(new File([csv], 'i.csv'));
    fireEvent.click(await screen.findByRole('button', { name: /Importer 2 institutions/ }));
    await screen.findByText('Ce code existe déjà.');
    expect(fixture.api.command).toHaveBeenCalledTimes(2);
    const firstKey = fixture.api.command.mock.calls[0]![2];
    fireEvent.click(screen.getByRole('button', { name: /Réessayer 1 ligne/ }));
    await waitFor(() => expect(fixture.api.command).toHaveBeenCalledTimes(3));
    expect(fixture.api.command.mock.calls[2]![2]).toBe(firstKey);
    await screen.findAllByText('Créée');
});

it('s’arrête sur un refus de droits et laisse les lignes restantes non traitées', async () => {
    fixture.api.command.mockRejectedValue(new ApiError(403, 'ACCESS_DENIED', 'Accès refusé.'));
    setup();
    upload(new File([csv], 'i.csv'));
    fireEvent.click(await screen.findByRole('button', { name: /Importer 2 institutions/ }));
    await screen.findByText(/Droits insuffisants/);
    expect(fixture.api.command).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Non traitée')).toBeTruthy();
});

it('refuse un fichier sans les colonnes attendues sans rien envoyer', async () => {
    setup();
    upload(new File(['Nom;Ville\nA;B\n'], 'x.csv'));
    await screen.findByText(/Colonnes obligatoires introuvables/);
    expect(fixture.api.command).not.toHaveBeenCalled();
});
