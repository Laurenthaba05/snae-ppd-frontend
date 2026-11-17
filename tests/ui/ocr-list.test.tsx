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
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: {} }) }));   // le panneau de politique d'indexation lit la portée de travail ; sans module de recherche il ne s'affiche pas
const navigate = vi.hoisted(() => vi.fn());
vi.mock('../../src/ui/navigation', () => ({ navigate }));
import { OcrListPage } from '../../src/pages/OcrIndexing';

const paged = (items: OcrListItem[], page = 0, hasMore = false) => ({ items, page, size: 50, hasMore });
const ID = '00000000-0000-4000-8000-0000000000';
const item = (n: number, extra: Partial<OcrListItem> = {}): OcrListItem => ({ id: ID + '1' + n, fichierId: ID + '2' + n, fichierNom: `page-${n}.tif`, documentId: ID + '3' + n, documentReference: 'DOC-' + n, documentTitre: 'Registre ' + n, elementId: ID + '4' + n, elementDescription: 'Élément ' + n, projetId: ID + '5' + n, projetNom: 'Projet état civil', typeReconnaissance: 'TESSERACT', langue: 'fra', moteur: 'Tesseract 5', confiance: 0.93, numeroPage: n, statutValidation: 'NON_VALIDE', caracteres: 1200, createdAt: '2026-10-01T10:00:00Z', ...extra });

beforeEach(() => {
    fixture.allowManage = true;
    navigate.mockReset();
    fixture.digitization.command.mockReset().mockResolvedValue({});
    fixture.digitization.ocrResults.mockReset().mockResolvedValue(paged([
        item(1), item(2, { confiance: '0.55' }), item(3, { statutValidation: 'VALIDE', confiance: 0.97 }), item(4, { confiance: null, projetId: null, elementId: null, projetNom: null, elementDescription: null })
    ]));
});

it('résume les résultats : à vérifier, validés/indexés, confiance moyenne et résultats sous le seuil de 80 %', async () => {
    render(<OcrListPage />);
    await screen.findByText('page-1.tif');
    const chips = screen.getAllByRole('listitem').map(li => li.textContent);
    expect(chips).toContain('4 éléments sur cette page · page 1');
    expect(chips).toContain('3 à vérifier');
    expect(chips).toContain('1 Validé');
    expect(chips).toContain('Confiance moyenne : 82 %');   // (0.93 + 0.55 + 0.97) / 3
    expect(chips).toContain('1 sous le seuil de 80 %');
    expect(screen.getByText('Hors projet')).toBeTruthy();
});

it('filtre sur le serveur et revient à la première page pour chaque filtre', async () => {
    fixture.digitization.ocrResults.mockImplementation(async options => paged(
        [item(options.status === 'VALIDE' ? 3 : options.lowConfidence ? 2 : options.q ? 4 : 1)], options.page, true));
    render(<OcrListPage />);
    await screen.findByText('page-1.tif');
    fireEvent.click(screen.getByRole('button', { name: 'Suivante' }));
    await waitFor(() => expect(fixture.digitization.ocrResults).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }), expect.any(AbortSignal)));
    fireEvent.change(screen.getByLabelText('État de vérification'), { target: { value: 'VALIDE' } });
    await screen.findByText('page-3.tif');
    expect(fixture.digitization.ocrResults).toHaveBeenLastCalledWith(expect.objectContaining({ page: 0, status: 'VALIDE' }), expect.any(AbortSignal));
    fireEvent.change(screen.getByLabelText('État de vérification'), { target: { value: '' } });
    fireEvent.click(screen.getByLabelText('Sous le seuil'));
    await screen.findByText('page-2.tif');
    expect(fixture.digitization.ocrResults).toHaveBeenLastCalledWith(expect.objectContaining({ page: 0, lowConfidence: true }), expect.any(AbortSignal));
    fireEvent.click(screen.getByLabelText('Sous le seuil'));
    fireEvent.change(screen.getByLabelText('Filtrer les résultats OCR'), { target: { value: 'registre 4' } });
    await screen.findByText('page-4.tif');
    expect(fixture.digitization.ocrResults).toHaveBeenLastCalledWith(expect.objectContaining({ page: 0, q: 'registre 4' }), expect.any(AbortSignal));
});

it('atteint une page au-delà des 500 résultats puis revient en arrière sans cumuler les lignes', async () => {
    fixture.digitization.ocrResults.mockImplementation(async ({ page }) => paged([item(page + 1)], page, page < 10));
    render(<OcrListPage />);
    await screen.findByText('page-1.tif');
    for (let n = 2; n <= 11; n++) {
        fireEvent.click(screen.getByRole('button', { name: 'Suivante' }));
        await screen.findByText(`page-${n}.tif`);
        expect(screen.queryByText(`page-${n - 1}.tif`)).toBeNull();
    }
    expect((screen.getByRole('button', { name: 'Suivante' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Précédente' }));
    await screen.findByText('page-10.tif');
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
    fixture.digitization.ocrResults.mockResolvedValueOnce(paged([]));
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
    fixture.digitization.ocrResults.mockResolvedValue(paged([item(1, { hasLayout: true }), item(2)]));
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
    fixture.digitization.ocrResults.mockResolvedValue(paged([item(1, { hasLayout: true }), item(2)]));
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
    fixture.digitization.ocrResults.mockResolvedValue(paged([item(1, { hasLayout: true, numeroPage: null, layoutPages: [1, 2, 3] })]));
    render(<OcrListPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'ALTO' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(within(dialog).getByLabelText('Page OCR')).getAllByRole('option').map(option => option.textContent)).toEqual(['Page 1', 'Page 2', 'Page 3']);
    expect(fixture.digitization.ocrAlto).not.toHaveBeenCalled();
    await within(dialog).findByText('Aucun mot positionné');
});

it('montre la fiabilité de chaque texte par un mot, ses raisons à la demande et la préparation de l’image', async () => {
    fixture.digitization.ocrResults.mockResolvedValue(paged([
        item(1, { confiance: 0.93, fiabilite: { level: 'FIABLE', reasons: [] } }),
        item(2, { confiance: 0.91, fiabilite: { level: 'A_VERIFIER', reasons: [{ code: 'LOW_CONTRAST', message: 'Contraste de l’encre insuffisant (22, minimum 30).' }] } }),
        item(3, { confiance: 0.62, preparation: 'median3', fiabilite: { level: 'NON_FIABLE', reasons: [{ code: 'RESCUED', message: 'La première lecture n’avait rien rendu.' }, { code: 'VERY_LOW_CONFIDENCE', message: 'Confiance de lecture très faible (62 %).' }] } }),
        item(4, { confiance: null })
    ]));
    render(<OcrListPage />);
    await screen.findByText('page-1.tif');
    expect(screen.getAllByText('Fiable')).toHaveLength(1);
    expect(screen.getByText('À vérifier', { selector: 'span.rel-pill' })).toBeTruthy();
    expect(screen.getByText('Non fiable', { selector: 'span.rel-pill' })).toBeTruthy();
    expect(screen.getAllByRole('listitem').map(li => li.textContent)).toContain('Fiabilité du texte — fiables : 1 · à vérifier : 1 · non fiables : 1');
    expect(screen.getByText('Lu après préparation de l’image (filtre médian léger)')).toBeTruthy();
    // un texte fiable n'a pas de « Pourquoi ? » ; les deux autres donnent leurs raisons
    expect(screen.getAllByText('Pourquoi ?')).toHaveLength(2);
    expect(screen.getByText('Contraste de l’encre insuffisant (22, minimum 30).')).toBeTruthy();
    expect(screen.getByText('Confiance de lecture très faible (62 %).')).toBeTruthy();
});

it('sans évaluation du serveur, aucune pastille de fiabilité et aucun chiffre d’en-tête', async () => {
    render(<OcrListPage />);
    await screen.findByText('page-1.tif');
    expect(document.querySelector('.rel-pill')).toBeNull();
    expect(screen.getAllByRole('listitem').some(li => (li.textContent ?? '').startsWith('Fiabilité du texte'))).toBe(false);
});

it('dit pour chaque texte s’il est dans l’index : validé, jugé fiable et signalé « non vérifié », ou pas indexé', async () => {
    fixture.digitization.ocrResults.mockResolvedValue(paged([
        item(1, { statutValidation: 'VALIDE', indexation: 'VALIDE' }),
        item(2, { indexation: 'AUTOMATIQUE' }),
        item(3, { indexation: 'NON' }),
        item(4, {})
    ]));
    render(<OcrListPage />);
    await screen.findByText('page-1.tif');
    expect(screen.getByText('Indexé (validé)')).toBeTruthy();
    expect(screen.getByText('Indexé · non vérifié')).toBeTruthy();
    expect(screen.getByText('Pas indexé')).toBeTruthy();
    expect(screen.getAllByText(/^(Indexé|Pas indexé)/)).toHaveLength(3);   // un ancien serveur qui ne dit rien n'affiche rien
});

it('écarte un texte non validé de l’index avec un motif, une clé d’idempotence, puis recharge la liste', async () => {
    render(<OcrListPage />);
    const row = (await screen.findByText('page-1.tif')).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Écarter' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Texte illisible : bruit de numérisation' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Écarter de l’index' }));
    await waitFor(() => expect(fixture.digitization.command).toHaveBeenCalledTimes(1));
    const call = fixture.digitization.command.mock.calls[0]!;
    expect(call[0]).toBe(`/ocr-results/${ID}11/discard`);
    expect(call[1]).toEqual({ reason: 'Texte illisible : bruit de numérisation' });
    expect(typeof call[2]).toBe('string');
    expect(call[3]).toBe('POST');
    await waitFor(() => expect(fixture.digitization.ocrResults).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('dialog')).toBeNull();
});

it('un motif trop court est refusé dans la fenêtre, sans rien envoyer au serveur', async () => {
    render(<OcrListPage />);
    const row = (await screen.findByText('page-1.tif')).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Écarter' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'trop bref' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Écarter de l’index' }));
    await within(dialog).findByRole('alert');
    expect(fixture.digitization.command).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
});

it('un texte écarté se dit avec son motif, se réintègre, et ne propose plus « Écarter » ; un texte validé ne s’écarte pas', async () => {
    fixture.digitization.ocrResults.mockResolvedValue(paged([
        item(1, { indexation: 'ECARTE', ecarteLe: '2026-11-17T09:00:00Z', ecarteMotif: 'Faux : lecture d’une autre page' }),
        item(2, { statutValidation: 'VALIDE', indexation: 'VALIDE' }),
        item(3, { indexation: 'NON' })
    ]));
    render(<OcrListPage />);
    const row = (await screen.findByText('page-1.tif')).closest('tr')!;
    expect(within(row).getByText('Écarté de l’index')).toBeTruthy();
    expect(within(row).getByText('Motif : Faux : lecture d’une autre page')).toBeTruthy();
    expect(within(row).queryByRole('button', { name: 'Écarter' })).toBeNull();
    expect(within(screen.getByText('page-2.tif').closest('tr')!).queryByRole('button', { name: 'Écarter' })).toBeNull();
    expect(within(screen.getByText('page-3.tif').closest('tr')!).getByRole('button', { name: 'Écarter' })).toBeTruthy();
    expect(screen.getAllByRole('listitem').map(li => li.textContent)).toContain('1 écarté de l’index');
    expect(screen.getAllByRole('listitem').map(li => li.textContent)).toContain('1 à vérifier');   // l'écarté n'est plus à vérifier
    fireEvent.click(within(row).getByRole('button', { name: 'Réintégrer' }));
    await waitFor(() => expect(fixture.digitization.command).toHaveBeenCalledTimes(1));
    expect(fixture.digitization.command.mock.calls[0]![0]).toBe(`/ocr-results/${ID}11/restore`);
    await waitFor(() => expect(fixture.digitization.ocrResults).toHaveBeenCalledTimes(2));
});

it('sans habilitation de gestion, ni « Écarter » ni « Réintégrer »', async () => {
    fixture.allowManage = false;
    fixture.digitization.ocrResults.mockResolvedValue(paged([item(1, { indexation: 'ECARTE', ecarteLe: '2026-11-17T09:00:00Z', ecarteMotif: 'Faux : lecture d’une autre page' }), item(2)]));
    render(<OcrListPage />);
    await screen.findByText('page-1.tif');
    expect(screen.queryByRole('button', { name: 'Écarter' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Réintégrer' })).toBeNull();
});
