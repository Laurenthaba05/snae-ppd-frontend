import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ load: vi.fn(), page: vi.fn(), destroy: vi.fn(), cancel: vi.fn(), render: vi.fn() }));
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, getDocument: fixture.load }));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '/local-pdf-worker.mjs' }));
import PdfPreview from '../../src/ui/PdfPreview';

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}
const blob = () => new Blob(['%PDF-1.7 test'], { type: 'application/pdf' });
function page(number: number) {
    return { getViewport: ({ scale }: { scale: number }) => ({ width: 400 * scale, height: 600 * scale }),
        render: fixture.render, getTextContent: async () => ({ items: [{ str: 'Contenu page ' + number, hasEOL: true }] }) };
}
beforeEach(() => {
    fixture.destroy.mockResolvedValue(undefined);
    fixture.render.mockImplementation(() => ({ promise: Promise.resolve(), cancel: fixture.cancel }));
    fixture.page.mockImplementation(async (number: number) => page(number));
    fixture.load.mockImplementation(() => ({ promise: Promise.resolve({ numPages: 3, getPage: fixture.page }), destroy: fixture.destroy }));
});

describe('Lecteur React : navigation, rendu, zoom et nettoyage', () => {
    it('parcourt les trois pages et désactive les boutons aux extrémités', async () => {
        render(<PdfPreview blob={blob()}/>);
        await screen.findByText('Contenu page 1');
        expect((screen.getByRole('button', { name: 'Page précédente' }) as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: 'Page suivante' }));
        await screen.findByText('Contenu page 2');
        expect(screen.getByText('Page 2 sur 3')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Page suivante' }));
        await screen.findByText('Contenu page 3');
        expect((screen.getByRole('button', { name: 'Page suivante' }) as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: 'Page précédente' }));
        await screen.findByText('Contenu page 2');
        expect(fixture.page.mock.calls.map(call => call[0])).toEqual([1, 2, 3, 2]);
    });

    it('applique réellement le zoom aux dimensions du canvas et relance le rendu', async () => {
        render(<PdfPreview blob={blob()}/>);
        await screen.findByText('Contenu page 1');
        const canvas = screen.getByRole('img') as HTMLCanvasElement;
        expect(canvas.width).toBe(600);
        fireEvent.change(screen.getByRole('combobox', { name: 'Zoom' }), { target: { value: '2' } });
        await waitFor(() => expect(canvas.width).toBe(1200));
        expect(canvas.height).toBe(1800);
        fireEvent.change(screen.getByRole('combobox', { name: 'Zoom' }), { target: { value: '0.75' } });
        await waitFor(() => expect(canvas.width).toBe(450));
        expect(fixture.render).toHaveBeenCalledTimes(3);
    });

    it('ignore une ancienne page arrivée après la page actuellement sélectionnée', async () => {
        const slow = deferred<ReturnType<typeof page>>();
        fixture.page.mockImplementation((number: number) => number === 2 ? slow.promise : Promise.resolve(page(number)));
        render(<PdfPreview blob={blob()}/>);
        await screen.findByText('Contenu page 1');
        fireEvent.click(screen.getByRole('button', { name: 'Page suivante' }));
        fireEvent.click(screen.getByRole('button', { name: 'Page suivante' }));
        await screen.findByText('Contenu page 3');
        await act(async () => { slow.resolve(page(2)); });
        expect(screen.queryByText('Contenu page 2')).toBeNull();
        expect(screen.getByText('Contenu page 3')).toBeTruthy();
    });

    it('annule un rendu actif et détruit le lecteur lors de la fermeture', async () => {
        const rendering = deferred<void>();
        fixture.render.mockImplementation(() => ({ promise: rendering.promise, cancel: fixture.cancel }));
        const view = render(<PdfPreview blob={blob()}/>);
        await waitFor(() => expect(fixture.render).toHaveBeenCalled());
        view.unmount();
        expect(fixture.cancel).toHaveBeenCalled();
        expect(fixture.destroy).toHaveBeenCalledTimes(1);
        await act(async () => { rendering.reject(new Error('Rendering cancelled')); });
    });

    it('détruit le chargement en cours sans afficher le document après fermeture', async () => {
        const loading = deferred<unknown>();
        fixture.load.mockReturnValue({ promise: loading.promise, destroy: fixture.destroy });
        const view = render(<PdfPreview blob={blob()}/>);
        await waitFor(() => expect(fixture.load).toHaveBeenCalled());
        view.unmount();
        expect(fixture.destroy).toHaveBeenCalledTimes(1);
        await act(async () => { loading.resolve({ numPages: 3, getPage: fixture.page }); });
        expect(fixture.page).not.toHaveBeenCalled();
    });

    it('signale un PDF illisible et ne conserve pas un écran de chargement', async () => {
        fixture.load.mockReturnValue({ promise: Promise.reject(new Error('Invalid PDF')), destroy: fixture.destroy });
        render(<PdfPreview blob={blob()}/>);
        await screen.findByRole('alert');
        expect(screen.queryByRole('status')).toBeNull();
        expect(screen.queryByRole('combobox')).toBeNull();
    });

    it('permet de changer de page après une erreur de rendu', async () => {
        fixture.page.mockImplementation((number: number) => number === 1 ? Promise.reject(new Error('Broken page')) : Promise.resolve(page(number)));
        render(<PdfPreview blob={blob()}/>);
        await screen.findByRole('alert');
        fireEvent.click(screen.getByRole('button', { name: 'Page suivante' }));
        await screen.findByText('Contenu page 2');
        expect(screen.queryByRole('alert')).toBeNull();
    });
});
