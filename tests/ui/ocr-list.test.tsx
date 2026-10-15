import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { OcrListItem } from '../../src/core/types';
const fixture = vi.hoisted(() => ({
    epoch: 1, me: null as unknown, allowManage: true,
    digitization: { ocrResults: vi.fn(), command: vi.fn() } as Record<string, ReturnType<typeof vi.fn>>
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => code === 'DIGITIZATION_MANAGE' ? fixture.allowManage : true }));
const navigate = vi.hoisted(() => vi.fn());
vi.mock('../../src/ui/navigation', () => ({ navigate }));
import { OcrListPage } from '../../src/pages/OcrIndexing';

const ID = '00000000-0000-4000-8000-0000000000';
const item = (n: number, extra: Partial<OcrListItem> = {}): OcrListItem => ({ id: ID + '1' + n, fichierId: ID + '2' + n, fichierNom: `page-${n}.tif`, documentId: ID + '3' + n, documentReference: 'DOC-' + n, documentTitre: 'Registre ' + n, elementId: ID + '4' + n, elementDescription: 'Élément ' + n, projetId: ID + '5' + n, projetNom: 'Projet état civil', typeReconnaissance: 'TESSERACT', langue: 'fra', moteur: 'Tesseract 5', confiance: 0.93, numeroPage: n, statutValidation: 'NON_VALIDE', caracteres: 1200, createdAt: '2026-10-01T10:00:00Z', ...extra });

beforeEach(() => {
    fixture.allowManage = true;
    navigate.mockReset();
    fixture.digitization.command.mockReset().mockResolvedValue({});
    fixture.digitization.ocrResults.mockReset().mockResolvedValue([
        item(1), item(2, { confiance: '0.55' }), item(3, { statutValidation: 'VALIDE', confiance: 0.97 }), item(4, { confiance: null, projetId: null, elementId: null, projetNom: null, elementDescription: null })
    ]);
});

it('résume les résultats : à vérifier, validés/indexés, confiance moyenne et résultats sous le seuil de 80 %', async () => {
    render(<OcrListPage />);
    await screen.findByText('page-1.tif');
    const chips = screen.getAllByRole('listitem').map(li => li.textContent);
    expect(chips).toContain('4 résultats');
    expect(chips).toContain('3 à vérifier');
    expect(chips).toContain('1 validé · indexé');
    expect(chips).toContain('Confiance moyenne : 82 %');   // (0.93 + 0.55 + 0.97) / 3
    expect(chips).toContain('1 sous le seuil de 80 %');
    expect(screen.getByText('Hors projet')).toBeTruthy();
});

it('filtre par état, par seuil et par texte', async () => {
    render(<OcrListPage />);
    await screen.findByText('page-1.tif');
    fireEvent.change(screen.getByLabelText('État de vérification'), { target: { value: 'VALIDE' } });
    expect(screen.queryByText('page-1.tif')).toBeNull();
    expect(screen.getByText('page-3.tif')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('État de vérification'), { target: { value: '' } });
    fireEvent.click(screen.getByLabelText('Sous le seuil'));
    expect(screen.getByText('page-2.tif')).toBeTruthy();
    expect(screen.queryByText('page-1.tif')).toBeNull();
    fireEvent.click(screen.getByLabelText('Sous le seuil'));
    fireEvent.change(screen.getByLabelText('Filtrer les résultats OCR'), { target: { value: 'registre 4' } });
    expect(screen.getByText('page-4.tif')).toBeTruthy();
    expect(screen.queryByText('page-1.tif')).toBeNull();
});

it('valide un résultat avec une clé d’idempotence puis recharge la liste ; absent sans droit de gestion', async () => {
    render(<OcrListPage />);
    const row = (await screen.findByText('page-1.tif')).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Valider' }));
    await waitFor(() => expect(fixture.digitization.command).toHaveBeenCalledTimes(1));
    const call = fixture.digitization.command.mock.calls[0]!;
    expect(call[0]).toBe(`/ocr-results/${ID}11/validate`);
    expect(call[3]).toBe('POST');
    await waitFor(() => expect(fixture.digitization.ocrResults).toHaveBeenCalledTimes(2));
    expect(within(screen.getByText('page-3.tif').closest('tr')!).queryByRole('button', { name: 'Valider' })).toBeNull();
});

it('sans habilitation de gestion, aucun bouton Valider ; « Ouvrir » mène à l’élément ou au document', async () => {
    fixture.allowManage = false;
    render(<OcrListPage />);
    await screen.findByText('page-1.tif');
    expect(screen.queryByRole('button', { name: 'Valider' })).toBeNull();
    fireEvent.click(within(screen.getByText('page-1.tif').closest('tr')!).getByRole('button', { name: 'Ouvrir' }));
    expect(navigate).toHaveBeenCalledWith(`/app/numerisation?project=${ID}51&element=${ID}41`);
    fireEvent.click(within(screen.getByText('page-4.tif').closest('tr')!).getByRole('button', { name: 'Ouvrir' }));
    expect(navigate).toHaveBeenLastCalledWith(`/app/documents/${ID}34`);
});

it('une liste vide ou une erreur serveur ne se déguise pas en « aucun problème »', async () => {
    fixture.digitization.ocrResults.mockResolvedValueOnce([]);
    const view = render(<OcrListPage />);
    await screen.findByText('Aucun résultat OCR');
    view.unmount();
    fixture.digitization.ocrResults.mockRejectedValueOnce(new Error('Indisponible'));
    render(<OcrListPage />);
    await screen.findByRole('alert');
    expect(screen.queryByText('Aucun résultat OCR')).toBeNull();
});

it('propose l’export ALTO seulement pour un résultat dont le moteur a donné la position des mots', async () => {
    const blob = new Blob(['<alto/>'], { type: 'application/xml' });
    fixture.digitization.ocrAlto = vi.fn().mockResolvedValue(blob);
    fixture.digitization.ocrResults.mockResolvedValue([item(1, { hasLayout: true }), item(2)]);
    const created = vi.fn(() => 'blob:alto');
    Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(<OcrListPage />);
    await screen.findByText('page-1.tif');
    const buttons = screen.getAllByRole('button', { name: 'ALTO' });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    await waitFor(() => expect(fixture.digitization.ocrAlto).toHaveBeenCalledWith(ID + '11', undefined, 1));
    await waitFor(() => expect(created).toHaveBeenCalled());
    click.mockRestore();
});

it('ouvre les positions depuis la liste sans charger les dispositions avant le clic', async () => {
    fixture.digitization.ocrLayout = vi.fn().mockResolvedValue({ resultId: ID + '11', width: 1000, height: 1500, unit: 'pixel', truncated: false, words: [
        { text: 'Recette', x: 10, y: 20, width: 100, height: 20, confidence: 92, line: 1 },
    ] });
    fixture.digitization.ocrResults.mockResolvedValue([item(1, { hasLayout: true }), item(2)]);
    render(<OcrListPage />);
    const buttons = await screen.findAllByRole('button', { name: 'Positions' });
    expect(buttons).toHaveLength(1);
    expect(fixture.digitization.ocrLayout).not.toHaveBeenCalled();
    fireEvent.click(buttons[0]);
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('group', { name: 'Mots reconnus' });
    expect(fixture.digitization.ocrLayout).toHaveBeenCalledWith(ID + '11', expect.any(AbortSignal), 1);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fermer les positions' }));
    expect(screen.queryByRole('dialog')).toBeNull();
});

it('demande la page à exporter pour un résultat de plusieurs pages au lieu de télécharger silencieusement la première', async () => {
    fixture.digitization.ocrAlto = vi.fn();
    fixture.digitization.ocrLayout = vi.fn().mockResolvedValue({ resultId: ID + '11', pageNumber: 1, width: 1000, height: 1500, unit: 'pixel', truncated: false, words: [] });
    fixture.digitization.ocrResults.mockResolvedValue([item(1, { hasLayout: true, numeroPage: null, layoutPages: [1, 2, 3] })]);
    render(<OcrListPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'ALTO' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(within(dialog).getByLabelText('Page OCR')).getAllByRole('option').map(option => option.textContent)).toEqual(['Page 1', 'Page 2', 'Page 3']);
    expect(fixture.digitization.ocrAlto).not.toHaveBeenCalled();
    await within(dialog).findByText('Aucun mot positionné');
});
