import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { DigitizationElement, ScanLot } from '../../src/core/types';
import { buildCode } from '../../src/core/scanCodes';
const fixture = vi.hoisted(() => ({
    epoch: 1,
    digitization: { command: vi.fn(), element: vi.fn(), lot: vi.fn(), elementsByProject: vi.fn(), lotsByProject: vi.fn(), pagesByElement: vi.fn() },
    records: { versions: vi.fn(), uploadContent: vi.fn() },
    codes: new Map<string, string[]>()
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
// Le décodage d'image dépend du navigateur : on simule les codes lus pour chaque fichier.
vi.mock('../../src/ui/codeReading', () => ({
    readFileCodes: async (file: File) => file.name.endsWith('.tif') ? { hits: [], unreadable: true } : { hits: (fixture.codes.get(file.name) ?? []).map(text => ({ text, format: 'QR', source: 'interne' })), unreadable: false }
}));
import { BatchImportDialog, CodeLookup, SheetsButton } from '../../src/ui/ScanCodes';

const ID = '00000000-0000-4000-8000-0000000000';
// Préfixes distincts : un code court ne doit désigner qu'un seul élément.
const E = (n: number) => `${n}${n}${n}${n}${n}${n}${n}${n}-1111-4111-8111-11111111111${n}`;
const element = (n: number, extra: Partial<DigitizationElement> = {}): DigitizationElement => ({ id: E(n), projetNumerisationId: ID + '02', archivePhysiqueId: null, documentId: ID + '9' + n, ordre: null, descriptionSource: 'Registre ' + n, statut: 'NUMERISATION', dateDebut: null, dateFin: null, versionLock: 0, lotId: null, pagesAttendues: null, rectoVerso: false, ...extra });
const lot = (extra: Partial<ScanLot> = {}): ScanLot => ({ id: ID + '40', projetNumerisationId: ID + '02', code: 'LOT-1', nom: null, scannerId: null, operateurId: null, resolutionDpi: 300, resolutionMinDpi: 300, modeCouleur: 'COULEUR', rectoVerso: false, statut: 'OUVERT', commentaire: null, motifCloture: null, dateCloture: null, versionLock: 0, ...extra });

function png(dpi: number): Uint8Array {
    const chunk = (type: string, data: number[]) => { const out = new Uint8Array(12 + data.length); new DataView(out.buffer).setUint32(0, data.length); for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i); out.set(data, 8); return out; };
    const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
    const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', [...u32(100), ...u32(100), 8, 2, 0, 0, 0]), chunk('pHYs', [...u32(Math.round(dpi / 0.0254)), ...u32(Math.round(dpi / 0.0254)), 1]), chunk('IDAT', [0, 0, 0, 0]), chunk('IEND', [])];
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
}
const img = (name: string, codes: string[] = []) => { fixture.codes.set(name, codes); return new File([png(300) as BlobPart], name, { type: 'image/png' }); };
const pick = (files: File[]) => fireEvent.change(document.querySelector('input[type=file]') as HTMLInputElement, { target: { files } });
const ingestion = (n: number) => ({ id: ID + '5' + n, versionId: ID + '60', status: 'COMPLETED', fileId: ID + '7' + n, filename: 'x', mediaType: 'image/png', size: 1, sha256: 'a', attempts: 1, resultCode: null, createdAt: '', updatedAt: '' });

beforeEach(() => {
    fixture.codes.clear();
    fixture.digitization.command.mockReset().mockResolvedValue({});
    fixture.digitization.element.mockReset(); fixture.digitization.lot.mockReset();
    fixture.digitization.elementsByProject.mockReset().mockResolvedValue([element(1), element(2, { pagesAttendues: 4 }), element(3, { documentId: null }), element(4, { statut: 'TERMINE' })]);
    fixture.digitization.lotsByProject.mockReset().mockResolvedValue([lot()]);
    fixture.digitization.pagesByElement.mockReset().mockResolvedValue([]);
    fixture.records.versions.mockReset().mockResolvedValue([{ id: ID + '60', documentId: ID + '91', number: 1, state: 'BROUILLON', sealed: false, sealedHash: null, sealedAt: null }]);
    let n = 0;
    fixture.records.uploadContent.mockReset().mockImplementation(async () => ingestion(++n));
});

it('découpe un lot par feuilles séparatrices, ignore les feuilles et numérote chaque élément depuis 1', async () => {
    const onDone = vi.fn();
    render(<BatchImportDialog projectId={ID + '02'} lot={null} onClose={vi.fn()} onDone={onDone} />);
    await screen.findByText(/Choisir les images du lot/);
    pick([
        img('s01.png', [buildCode('ELEMENT', E(1))]), img('s02.png'), img('s03.png'),
        img('s04.png', [buildCode('ELEMENT', E(2), 'short')]), img('s05.png'), img('s06.png'), img('s07.png')
    ]);
    await screen.findByText('Importer 5 pages');
    expect(screen.getByText((_, node) => node?.tagName === 'SPAN' && node.textContent === '2 élément(s) reconnu(s)')).toBeTruthy();
    expect(screen.getByText(/Il manquera encore 1 page\(s\) : 4/)).toBeTruthy();   // Registre 2 : 4 attendues, 3 fournies
    fireEvent.click(screen.getByRole('button', { name: 'Importer 5 pages' }));
    await screen.findByRole('button', { name: 'Terminer' });
    expect(fixture.records.uploadContent).toHaveBeenCalledTimes(5);   // les feuilles séparatrices ne sont pas envoyées
    const calls = fixture.digitization.command.mock.calls.map(c => ({ path: c[0] as string, page: (c[1] as { pages: Array<{ numeroPage: number }> }).pages[0]!.numeroPage }));
    expect(calls.filter(c => c.path.includes(E(1))).map(c => c.page)).toEqual([1, 2]);
    expect(calls.filter(c => c.path.includes(E(2))).map(c => c.page)).toEqual([1, 2, 3]);
    expect(fixture.records.uploadContent.mock.calls.every(c => c[2] === 'MAITRE_CONSERVATION')).toBe(true);
    expect(onDone).toHaveBeenCalled();
});

it('un groupe sans élément correspondant, terminé ou sans document est bloqué sans bloquer les autres', async () => {
    render(<BatchImportDialog projectId={ID + '02'} lot={null} onClose={vi.fn()} onDone={vi.fn()} />);
    await screen.findByText(/Choisir les images du lot/);
    pick([
        img('a1.png', [buildCode('ELEMENT', E(1))]), img('a2.png'),
        img('b1.png', [buildCode('ELEMENT', '99999999-9999-4999-8999-999999999999')]), img('b2.png'),
        img('c1.png', [buildCode('ELEMENT', E(3))]), img('c2.png'),
        img('d1.png', [buildCode('ELEMENT', E(4))]), img('d2.png')
    ]);
    await screen.findByText('Importer 1 page');
    expect(screen.getByText(/Aucun élément de ce projet ne correspond/)).toBeTruthy();
    expect(screen.getByText(/n’est lié à aucun document/)).toBeTruthy();
    expect(screen.getByText(/a quitté l’étape de numérisation/)).toBeTruthy();
    expect(screen.getByText((_, node) => node?.tagName === 'SPAN' && node.textContent === '3 groupe(s) bloqué(s)')).toBeTruthy();
});

it('refuse le lot si des fichiers sont illisibles (TIFF) : une feuille séparatrice serait prise pour une page', async () => {
    render(<BatchImportDialog projectId={ID + '02'} lot={null} onClose={vi.fn()} onDone={vi.fn()} />);
    await screen.findByText(/Choisir les images du lot/);
    pick([img('a.png', [buildCode('ELEMENT', E(1))]), new File([new Uint8Array(20)], 'b.tif')]);
    await screen.findByText(/ne peut pas lire le contenu de 1 fichier/);
    expect(fixture.records.uploadContent).not.toHaveBeenCalled();
});

it('signale les fichiers avant la première feuille et une feuille de lot différente du lot choisi', async () => {
    render(<BatchImportDialog projectId={ID + '02'} lot={lot()} onClose={vi.fn()} onDone={vi.fn()} />);
    await screen.findByText(/Choisir les images du lot/);
    pick([img('0.png'), img('1.png', [buildCode('LOT', '11111111-2222-4333-8444-555555555555')]), img('2.png', [buildCode('ELEMENT', E(1))]), img('3.png')]);
    await screen.findByText('Importer 1 page');
    expect(screen.getByText(/précèdent la première feuille séparatrice/)).toBeTruthy();
    expect(screen.getByText(/désigne un autre lot que LOT-1/)).toBeTruthy();
});

it('une image sans feuille séparatrice (une capture d’écran) est expliquée, et peut être importée comme page d’un élément choisi', async () => {
    const onDone = vi.fn();
    render(<BatchImportDialog projectId={ID + '02'} lot={null} onClose={vi.fn()} onDone={onDone} />);
    await screen.findByText(/Choisir les images du lot/);
    pick([img('SNAE-PPD-F1.1-ESPACE.png')]);
    expect(await screen.findByText(/Aucune feuille séparatrice n’a été reconnue dans le fichier sélectionné/)).toBeTruthy();
    expect(screen.getByText(/une capture d’écran ou une photo sans code n’en est pas une/)).toBeTruthy();
    // Aucune feuille n'existe : « précède la première feuille » serait trompeur.
    expect(screen.queryByText(/précèdent la première feuille/)).toBeNull();
    const manual = screen.getByRole('region', { name: 'Importer sans feuille séparatrice' });
    expect(manual.textContent).toContain('Ce fichier peut devenir une page');
    const prepare = screen.getByRole('button', { name: 'Préparer l’import' }) as HTMLButtonElement;
    expect(prepare.disabled).toBe(true);
    const choices = [...(screen.getByLabelText('Élément qui reçoit les pages') as HTMLSelectElement).options].map(o => o.textContent);
    // Seuls les éléments à l'étape de numérisation et liés à un document reçoivent des pages.
    expect(choices).toEqual(['Choisir…', 'Registre 1', 'Registre 2']);
    fireEvent.change(screen.getByLabelText('Élément qui reçoit les pages'), { target: { value: E(2) } });
    fireEvent.click(prepare);
    await screen.findByText('Importer 1 page');
    expect(screen.getByText(/Import sans feuille séparatrice : les 1 fichier\(s\)/)).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Importer sans feuille séparatrice' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Importer 1 page' }));
    await screen.findByRole('button', { name: 'Terminer' });
    expect(fixture.records.uploadContent).toHaveBeenCalledTimes(1);
    const call = fixture.digitization.command.mock.calls[0]!;
    expect(call[0]).toContain(E(2)); expect((call[1] as { pages: Array<{ numeroPage: number }> }).pages[0]!.numeroPage).toBe(1);
    expect(onDone).toHaveBeenCalled();
});

it('sans feuille, plusieurs fichiers deviennent les pages 1, 2, 3 dans l’ordre de la sélection, et l’on peut choisir un autre élément', async () => {
    render(<BatchImportDialog projectId={ID + '02'} lot={null} onClose={vi.fn()} onDone={vi.fn()} />);
    await screen.findByText(/Choisir les images du lot/);
    pick([img('p1.png'), img('p2.png'), img('p3.png')]);
    await screen.findByText(/dans le fichier|dans les 3 fichiers sélectionnés/);
    fireEvent.change(screen.getByLabelText('Élément qui reçoit les pages'), { target: { value: E(1) } });
    fireEvent.click(screen.getByRole('button', { name: 'Préparer l’import' }));
    await screen.findByText('Importer 3 pages');
    expect(screen.getAllByRole('row').slice(1).map(r => r.textContent)).toEqual([expect.stringContaining('p1.png'), expect.stringContaining('p2.png'), expect.stringContaining('p3.png')]);
    fireEvent.click(screen.getByRole('button', { name: 'Choisir un autre élément' }));
    expect(await screen.findByRole('region', { name: 'Importer sans feuille séparatrice' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Élément qui reçoit les pages'), { target: { value: E(2) } });
    fireEvent.click(screen.getByRole('button', { name: 'Préparer l’import' }));
    await screen.findByText(/Il manquera encore 1 page\(s\) : 4/);
    fireEvent.click(screen.getByRole('button', { name: 'Importer 3 pages' }));
    await screen.findByRole('button', { name: 'Terminer' });
    const pages = fixture.digitization.command.mock.calls.map(c => ({ path: c[0] as string, page: (c[1] as { pages: Array<{ numeroPage: number }> }).pages[0]!.numeroPage }));
    expect(pages.every(c => c.path.includes(E(2)))).toBe(true);
    expect(pages.map(c => c.page)).toEqual([1, 2, 3]);
});

it('sans feuille, une feuille de lot reconnue n’est jamais importée comme une page, et sans élément capable de recevoir des pages le repli le dit', async () => {
    render(<BatchImportDialog projectId={ID + '02'} lot={null} onClose={vi.fn()} onDone={vi.fn()} />);
    await screen.findByText(/Choisir les images du lot/);
    pick([img('lot.png', [buildCode('LOT', '11111111-2222-4333-8444-555555555555')]), img('page.png')]);
    await screen.findByText(/Importer sans feuille séparatrice/);
    expect(screen.getByRole('region', { name: 'Importer sans feuille séparatrice' }).textContent).toContain('Ce fichier peut devenir une page');
    // La feuille de lot n'est pas comptée parmi les pages : un seul fichier peut devenir une page.
    expect(screen.getByRole('region', { name: 'Importer sans feuille séparatrice' }).textContent).not.toContain('2 fichiers');
});

it('sans élément capable de recevoir des pages, l’import sans feuille l’explique', async () => {
    fixture.digitization.elementsByProject.mockResolvedValue([element(3, { documentId: null }), element(4, { statut: 'TERMINE' })]);
    render(<BatchImportDialog projectId={ID + '02'} lot={null} onClose={vi.fn()} onDone={vi.fn()} />);
    await screen.findByText(/Choisir les images du lot/);
    pick([img('page.png')]);
    expect(await screen.findByText(/Aucun élément de ce projet n’accepte de pages pour le moment/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Préparer l’import' })).toBeNull();
});

it('recherche par code : un code complet ouvre l’élément, un code court n’est résolu que dans le projet ouvert', async () => {
    fixture.digitization.element.mockResolvedValue(element(1));
    const onElement = vi.fn(), onLot = vi.fn();
    const { rerender } = render(<CodeLookup projectId={null} elements={[element(1), element(2)]} lots={[lot()]} onElement={onElement} onLot={onLot} />);
    const input = screen.getByPlaceholderText(/Scanner ou saisir un code/);
    fireEvent.change(input, { target: { value: buildCode('ELEMENT', E(1)) } });
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(onElement).toHaveBeenCalledWith(ID + '02', E(1)));
    fireEvent.change(input, { target: { value: buildCode('ELEMENT', E(2), 'short') } });
    fireEvent.submit(input.closest('form')!);
    await screen.findByText(/ouvrez d’abord le projet/);
    rerender(<CodeLookup projectId={ID + '02'} elements={[element(1), element(2)]} lots={[lot()]} onElement={onElement} onLot={onLot} />);
    fireEvent.change(input, { target: { value: buildCode('ELEMENT', E(2), 'short') } });
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(onElement).toHaveBeenLastCalledWith(ID + '02', E(2)));
    fireEvent.change(input, { target: { value: 'LOT-2026-001' } });
    fireEvent.submit(input.closest('form')!);
    await screen.findByText(/Ce n’est pas un code SNAE/);
    expect(onLot).not.toHaveBeenCalled();
});

it('impression : ouvre une fenêtre avec les feuilles, ou explique que le navigateur l’a bloquée', async () => {
    const written: string[] = [];
    const fakeWindow = { document: { open: vi.fn(), write: (html: string) => written.push(html), close: vi.fn() }, focus: vi.fn(), print: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(fakeWindow as unknown as Window);
    render(<SheetsButton label="Feuilles" title="Test" build={async () => [{ kind: 'ELEMENT', id: E(1), title: 'Registre <b>1</b>', details: ['Projet A'] }]} />);
    fireEvent.click(screen.getByRole('button', { name: /Feuilles/ }));
    await waitFor(() => expect(written).toHaveLength(1));
    expect(written[0]).toContain(buildCode('ELEMENT', E(1)));
    expect(written[0]).not.toContain('<b>1</b>');
    open.mockReturnValue(null);
    fireEvent.click(screen.getByRole('button', { name: /Feuilles/ }));
    await screen.findByText(/bloqué la fenêtre d’impression/);
});
