import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/core/http';

const FILE = '97571d20-3f49-497e-a185-dac22208eb3f';
const fixture = vi.hoisted(() => ({
    epoch: 1, demo: false, me: null as unknown,
    records: { iiifInfo: vi.fn(), iiifImage: vi.fn(), iiifOcr: vi.fn(), fileDerivative: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
import { PageViewerDialog } from '../../src/ui/PageViewer';

const jpeg = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' });

beforeEach(() => {
    fixture.epoch += 1;
    for (const fn of Object.values(fixture.records)) fn.mockReset();
    fixture.records.iiifInfo.mockResolvedValue({ width: 3000, height: 2000 });
    fixture.records.iiifImage.mockImplementation(async () => jpeg());
    fixture.records.iiifOcr.mockResolvedValue({ items: [
        { body: { value: 'Décès' }, target: 'x/canvas#xywh=20,40,100,24' },
        { body: { value: 'registre' }, target: 'x/canvas#xywh=140,40,80,24' }
    ] });
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:test');
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
});

it('ouvre l’image par l’API IIIF : dimensions, puis image entière réduite', async () => {
    render(<PageViewerDialog fichierId={FILE} title="Page 3" onClose={() => undefined} />);
    expect(await screen.findByRole('img', { name: 'Page 3' })).toBeTruthy();
    expect(fixture.records.iiifInfo).toHaveBeenCalledWith(FILE, 1, expect.anything());
    expect(fixture.records.iiifImage).toHaveBeenCalledWith(`${FILE}-1`, "full", "!1400,1400", expect.anything());
    expect(fixture.records.fileDerivative).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Agrandir' })).toBeTruthy();
    expect(screen.getByText('100 %')).toBeTruthy();
});

it('zoomer redemande la zone visible en plus fine résolution', async () => {
    render(<PageViewerDialog fichierId={FILE} title="Page 3" onClose={() => undefined} />);
    await screen.findByRole('img', { name: 'Page 3' });
    const zoomIn = screen.getByRole('button', { name: 'Agrandir' });
    for (let i = 0; i < 5; i++) fireEvent.click(zoomIn);
    await waitFor(() => {
        // arguments : (identifiant, région, taille, signal)
        const calls = fixture.records.iiifImage.mock.calls.map(c => [c[0], c[1], c[2]] as [string, string, string]);
        expect(calls.some(([id, region, size]) => id === `${FILE}-1` && /^\d+,\d+,\d+,\d+$/.test(region) && /^\d+,$/.test(size))).toBe(true);
    }, { timeout: 2000 });
    expect(screen.getByText('305 %')).toBeTruthy();
    // Ajuster revient à l'image entière
    fireEvent.click(screen.getByRole('button', { name: 'Ajuster' }));
    expect(screen.getByText('100 %')).toBeTruthy();
});

it('le texte reconnu se cherche et se surligne, sans accent ni casse', async () => {
    const { container } = render(<PageViewerDialog fichierId={FILE} title="Page 3" onClose={() => undefined} />);
    await screen.findByRole('img', { name: 'Page 3' });
    const input = screen.getByPlaceholderText('Chercher un mot');
    fireEvent.change(input, { target: { value: 'deces' } });
    expect(await screen.findByText('1 mot surligné.')).toBeTruthy();
    expect(container.querySelectorAll('.iiif-word').length).toBe(1);
    expect(fixture.records.iiifOcr).toHaveBeenCalledWith(FILE, 1);
    fireEvent.change(input, { target: { value: 'introuvable' } });
    expect(await screen.findByText('Aucun mot ne correspond.')).toBeTruthy();
    expect(container.querySelectorAll('.iiif-word').length).toBe(0);
});

it('sans texte reconnu, la recherche le dit', async () => {
    fixture.records.iiifOcr.mockResolvedValue({ items: [] });
    render(<PageViewerDialog fichierId={FILE} title="Page 3" onClose={() => undefined} />);
    await screen.findByRole('img', { name: 'Page 3' });
    fireEvent.change(screen.getByPlaceholderText('Chercher un mot'), { target: { value: 'registre' } });
    expect(await screen.findByText('Aucun texte reconnu pour cette image.')).toBeTruthy();
});

it('un fichier de plusieurs images se parcourt image après image', async () => {
    render(<PageViewerDialog fichierId={FILE} title="Page 3" images={2} onClose={() => undefined} />);
    await screen.findByRole('img', { name: 'Page 3 · image 1 sur 2' });
    fireEvent.click(screen.getByRole('button', { name: 'Image suivante' }));
    await waitFor(() => expect(fixture.records.iiifInfo).toHaveBeenCalledWith(FILE, 2, expect.anything()));
    expect(await screen.findByRole('img', { name: 'Page 3 · image 2 sur 2' })).toBeTruthy();
});

it('si le service d’images n’est pas servi, l’image entière s’affiche comme avant', async () => {
    fixture.records.iiifInfo.mockRejectedValue(new ApiError(404, 'IIIF_DISABLED', 'Le service d’images IIIF n’est pas activé sur ce serveur.'));
    fixture.records.fileDerivative.mockResolvedValue(jpeg());
    render(<PageViewerDialog fichierId={FILE} title="Page 3" onClose={() => undefined} />);
    expect(await screen.findByRole('img', { name: 'Page 3' })).toBeTruthy();
    expect(fixture.records.fileDerivative).toHaveBeenCalledWith(FILE, 'consultation', expect.anything(), 1);
    expect(screen.queryByRole('button', { name: 'Agrandir' })).toBeNull();
});

it('une page sans copie de consultation le dit', async () => {
    fixture.records.iiifInfo.mockRejectedValue(new ApiError(404, 'IIIF_IMAGE_NOT_FOUND', 'Image introuvable.'));
    fixture.records.fileDerivative.mockRejectedValue(new ApiError(404, 'DERIVATIVE_NOT_FOUND', 'Copie de consultation introuvable.'));
    render(<PageViewerDialog fichierId={FILE} title="Page 3" onClose={() => undefined} />);
    expect(await screen.findByText(/Aucune copie de consultation n’est disponible/)).toBeTruthy();
});
