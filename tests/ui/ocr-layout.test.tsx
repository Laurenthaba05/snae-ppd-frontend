import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import type { OcrLayout } from '../../src/core/types';
import { ApiError } from '../../src/core/http';
const fixture = vi.hoisted(() => ({ epoch: 1, digitization: { ocrLayout: vi.fn(), ocrAlto: vi.fn() } }));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
import { OcrLayoutDialog, OcrLayoutViewer } from '../../src/ui/OcrLayoutDialog';
const layout: OcrLayout = { resultId: 'ocr1', width: 1000, height: 1500, unit: 'pixel', truncated: false, words: [
    { text: 'Archives', x: 100, y: 150, width: 180, height: 30, confidence: 95, line: 1 },
    { text: 'Guinée', x: 300, y: 150, width: 130, height: 30, confidence: 65, line: 1 },
    { text: '<script>alert(1)</script>', x: 100, y: 220, width: 200, height: 30, confidence: null, line: 2 },
] };
beforeEach(() => { fixture.digitization.ocrLayout.mockReset().mockResolvedValue(layout); fixture.digitization.ocrAlto.mockReset(); });
it('charge à la demande, conserve les coordonnées et permet la sélection au clavier', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const view = render(<OcrLayoutDialog resultId="ocr1" fileName="page.tif" pageNumber={2} onClose={onClose} />);
    await screen.findByText('page.tif · Page 2');
    const group = await screen.findByRole('group', { name: 'Mots reconnus' });
    expect(fixture.digitization.ocrLayout).toHaveBeenCalledWith('ocr1', expect.any(AbortSignal), 2);
    const svg = view.container.querySelector('svg[aria-label="Disposition des mots sur la page"]')!;
    expect(svg.getAttribute('viewBox')).toBe('0 0 1000 1500');
    const rect = svg.querySelector('g rect')!;
    expect(['x','y','width','height'].map(n => rect.getAttribute(n))).toEqual(['100','150','180','30']);
    const button = within(group).getByRole('button', { name: 'Archives Ligne 1 · 95 %' });
    button.focus(); await user.keyboard('{Enter}');
    expect(screen.getByText('100, 150')).toBeTruthy();
    expect(screen.getByText('180 × 30')).toBeTruthy();
    expect(screen.getByText('95 %', { selector: 'dd' })).toBeTruthy();
    fireEvent.click(svg.querySelectorAll('g')[1]);
    expect(screen.getByText('300, 150')).toBeTruthy();
    expect(within(group).getByRole('button', { name: 'Guinée Ligne 1 · 65 %' }).getAttribute('aria-pressed')).toBe('true');
    expect(view.container.querySelector('script')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Fermer les positions' }));
    expect(onClose).toHaveBeenCalledOnce();
});
it('filtre les mots, distingue la confiance inconnue et applique le zoom', async () => {
    const view = render(<OcrLayoutViewer layout={layout} />);
    fireEvent.click(screen.getByLabelText('Confiance inférieure à 80 %'));
    expect(screen.getByRole('status').textContent).toContain('1 mot affiché sur 3');
    expect(within(screen.getByRole('group', { name: 'Mots reconnus' })).queryByText('Archives')).toBeNull();
    fireEvent.change(screen.getByLabelText('Rechercher un mot'), { target: { value: 'absent' } });
    expect(screen.getByText('Aucun mot pour ces filtres')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Rechercher un mot'), { target: { value: 'GUINÉE' } });
    expect(screen.getByRole('status').textContent).toContain('1 mot affiché sur 3');
    fireEvent.change(screen.getByLabelText('Zoom de la page'), { target: { value: '200' } });
    expect((view.container.querySelector('svg[viewBox]') as SVGSVGElement).style.width).toBe('200%');
});
it('signale les positions partielles, les résultats vides et les dimensions invalides', () => {
    const view = render(<OcrLayoutViewer layout={{ ...layout, truncated: true }} />);
    expect(screen.getByText(/Positions partielles/)).toBeTruthy();
    view.rerender(<OcrLayoutViewer layout={{ ...layout, words: [] }} />);
    expect(screen.getByText('Aucun mot positionné')).toBeTruthy();
    view.rerender(<OcrLayoutViewer layout={{ ...layout, width: 0 }} />);
    expect(screen.getByText(/dimensions.*invalides/)).toBeTruthy();
});
it('pagine les grandes listes de mots et revient à la première page après filtrage', () => {
    render(<OcrLayoutViewer layout={{ ...layout, words: Array.from({ length: 125 }, (_, i) => ({ ...layout.words[0], text: 'Mot' + i })) }} />);
    const group = screen.getByRole('group', { name: 'Mots reconnus' });
    expect(within(group).getAllByRole('button')).toHaveLength(50);
    fireEvent.click(screen.getByRole('button', { name: 'Suivante' }));
    expect(within(group).getByText('Mot50')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Rechercher un mot'), { target: { value: 'Mot124' } });
    expect(within(group).getAllByRole('button')).toHaveLength(1);
    expect((screen.getByRole('button', { name: 'Précédente' }) as HTMLButtonElement).disabled).toBe(true);
});
it('explique une disposition absente sans masquer un refus de lecture', async () => {
    fixture.digitization.ocrLayout.mockRejectedValueOnce(new ApiError(404, 'OCR_LAYOUT_ABSENT', 'Absent'));
    const view = render(<OcrLayoutDialog resultId="ocr1" onClose={() => {}} />);
    await screen.findByText('Positions non disponibles');
    view.unmount();
    fixture.digitization.ocrLayout.mockRejectedValueOnce(new ApiError(403, 'FORBIDDEN', 'Accès refusé aux positions'));
    render(<OcrLayoutDialog resultId="ocr2" onClose={() => {}} />);
    await screen.findByRole('alert');
    expect(screen.queryByText('Positions non disponibles')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer la lecture' }));
    await screen.findByRole('group', { name: 'Mots reconnus' });
});
it('annule la requête lors de la fermeture du dialogue', async () => {
    fixture.digitization.ocrLayout.mockImplementation(() => new Promise(() => {}));
    const view = render(<OcrLayoutDialog resultId="ocr1" onClose={() => {}} />);
    const signal = fixture.digitization.ocrLayout.mock.calls[0][1] as AbortSignal;
    view.unmount();
    await waitFor(() => expect(signal.aborted).toBe(true));
});

it('sélectionne chaque page disponible et exporte uniquement la page choisie avec son numéro', async () => {
    fixture.digitization.ocrLayout.mockImplementation((_id, _signal, page) => Promise.resolve({
        ...layout, pageNumber: page, words: [{ ...layout.words[0], text: page === 1 ? 'ALPHA' : 'CHARLIE' }],
    }));
    fixture.digitization.ocrAlto.mockReset().mockResolvedValue(new Blob(['<alto/>']));
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:alto'), revokeObjectURL: vi.fn() });
    const downloads: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { downloads.push(this.download); });
    render(<OcrLayoutDialog resultId="ocr1" fileName="lot.pdf" layoutPages={[1, 3]} onClose={() => {}} />);
    await screen.findByRole('button', { name: 'ALPHA Ligne 1 · 95 %' });
    fireEvent.change(screen.getByLabelText('Rechercher un mot'), { target: { value: 'ALPHA' } });
    fireEvent.change(screen.getByLabelText('Page OCR'), { target: { value: '3' } });
    await screen.findByRole('button', { name: 'CHARLIE Ligne 1 · 95 %' });
    expect(screen.queryByRole('button', { name: 'ALPHA Ligne 1 · 95 %' })).toBeNull();
    expect((screen.getByLabelText('Rechercher un mot') as HTMLInputElement).value).toBe('');
    expect(fixture.digitization.ocrLayout).toHaveBeenLastCalledWith('ocr1', expect.any(AbortSignal), 3);
    fireEvent.click(screen.getByRole('button', { name: 'Exporter ALTO · page 3' }));
    await waitFor(() => expect(downloads).toEqual(['alto-lot-page-3.xml']));
    expect(fixture.digitization.ocrAlto).toHaveBeenLastCalledWith('ocr1', undefined, 3);
    click.mockRestore();
});

it('ne conserve ni les mots ni l’export de la page précédente si la page demandée est inaccessible', async () => {
    fixture.digitization.ocrLayout.mockResolvedValueOnce({ ...layout, pageNumber: 1 })
        .mockRejectedValueOnce(new ApiError(404, 'OCR_LAYOUT_ABSENT', 'Absent'));
    render(<OcrLayoutDialog resultId="ocr1" layoutPages={[1, 2]} onClose={() => {}} />);
    await screen.findByRole('group', { name: 'Mots reconnus' });
    fireEvent.change(screen.getByLabelText('Page OCR'), { target: { value: '2' } });
    await screen.findByText('Positions non disponibles');
    expect(screen.queryByRole('group', { name: 'Mots reconnus' })).toBeNull();
    expect((screen.getByRole('button', { name: 'Exporter ALTO · page 2' }) as HTMLButtonElement).disabled).toBe(true);
});

it('exporte toutes les pages indépendamment de la page affichée et de ses filtres', async () => {
    fixture.digitization.ocrAlto.mockResolvedValue(new Blob(['<alto/>']));
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:alto'), revokeObjectURL: vi.fn() });
    const downloads: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { downloads.push(this.download); });
    try {
        render(<OcrLayoutDialog resultId="ocr1" fileName="lot.pdf" pageNumber={2} layoutPages={[3, 1, 2]} onClose={() => {}} />);
        await screen.findByRole('group', { name: 'Mots reconnus' });
        fireEvent.change(screen.getByLabelText('Rechercher un mot'), { target: { value: 'absent' } });
        expect(screen.getByText('Aucun mot pour ces filtres')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Exporter ALTO · toutes les pages (3)' }));
        await waitFor(() => expect(downloads).toEqual(['alto-lot-complet.xml']));
        expect(fixture.digitization.ocrAlto).toHaveBeenCalledExactlyOnceWith('ocr1', undefined, undefined);
        expect(fixture.digitization.ocrLayout).toHaveBeenCalledExactlyOnceWith('ocr1', expect.any(AbortSignal), 2);
        expect((screen.getByLabelText('Page OCR') as HTMLSelectElement).value).toBe('2');
    } finally { click.mockRestore(); }
});

it('signale un échec de l’export complet et permet de le retenter sans téléchargement incomplet', async () => {
    let rejectExport!: (reason: unknown) => void;
    fixture.digitization.ocrAlto.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectExport = reject; }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
        render(<OcrLayoutDialog resultId="ocr1" layoutPages={[1, 2, 3]} onClose={() => {}} />);
        await screen.findByRole('group', { name: 'Mots reconnus' });
        fireEvent.click(screen.getByRole('button', { name: 'Exporter ALTO · toutes les pages (3)' }));
        expect((screen.getByLabelText('Page OCR') as HTMLSelectElement).disabled).toBe(true);
        for (const button of screen.getAllByRole('button', { name: 'Export en cours…' })) expect((button as HTMLButtonElement).disabled).toBe(true);
        rejectExport(new ApiError(404, 'OCR_LAYOUT_ABSENT', 'Positions absentes'));
        await screen.findByRole('alert');
        expect(click).not.toHaveBeenCalled();
        expect((screen.getByRole('button', { name: 'Exporter ALTO · toutes les pages (3)' }) as HTMLButtonElement).disabled).toBe(false);
    } finally { click.mockRestore(); }
});
