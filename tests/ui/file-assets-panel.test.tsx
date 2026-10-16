import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/core/http';
import type { DigitizationElement, FileAssetItem, FileAssets, QualityAnalysis } from '../../src/core/types';
const fixture = vi.hoisted(() => ({
    epoch: 1, me: null as unknown, allowed: new Set<string>(['DIGITIZATION_READ', 'DIGITIZATION_QC']),
    digitization: { fileAssets: vi.fn(), command: vi.fn(), qualityAnalysis: vi.fn() },
    records: { fileDerivative: vi.fn(), iiifInfo: vi.fn(), iiifImage: vi.fn(), iiifOcr: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
import { FileAssetsPanel } from '../../src/ui/FileAssetsPanel';
import { QualityPanel } from '../../src/ui/QualityPanel';

const ID = '00000000-0000-4000-8000-0000000000';
const element: DigitizationElement = { id: ID + '01', projetNumerisationId: ID + '02', archivePhysiqueId: null, documentId: ID + '03', ordre: null, descriptionSource: 'Registre', statut: 'CONTROLE_QUALITE', dateDebut: null, dateFin: null, versionLock: 1 };
const format = (extra = {}) => ({ family: 'TIFF', name: 'TIFF', version: null, puid: 'fmt/353', mediaType: 'image/tiff', wellFormed: true, lossy: false, details: { dpi: [300, 300], compression: 'tiff_lzw', colorMode: 'RGB' }, findings: [], ...extra });
const item = (n: number, extra: Partial<FileAssetItem> = {}): FileAssetItem => ({ numeroPage: n, fichierId: ID + '1' + n, mediaType: 'image/tiff', role: 'MAITRE_CONSERVATION', format: null, identifyState: null, identifyError: null, derivatives: [], deriveState: null, deriveError: null, ...extra });
const copies = [{ kind: 'CONSULTATION' as const, frame: 1, width: 2400, height: 1600, sizeBytes: 1_234_567, mediaType: 'image/jpeg' }, { kind: 'THUMBNAIL' as const, frame: 1, width: 360, height: 240, sizeBytes: 23_456, mediaType: 'image/jpeg' }];
const framesOf = (count: number) => Array.from({ length: count }, (_, i) => copies.map(c => ({ ...c, frame: i + 1 }))).flat();
const assets = (items: FileAssetItem[], extra: Partial<FileAssets> = {}): FileAssets => ({ identificationEnabled: true, derivativesEnabled: true, items, ...extra });

beforeEach(() => {
    fixture.allowed = new Set(['DIGITIZATION_READ', 'DIGITIZATION_QC']);
    fixture.digitization.command.mockReset().mockResolvedValue({ files: 3, identification: 2, derivatives: 2 });
    fixture.digitization.fileAssets.mockReset();
    fixture.records.fileDerivative.mockReset();
    // le service d'images IIIF n'est pas servi : la visionneuse retombe sur l'image entière, ce que ces tests vérifient
    fixture.records.iiifInfo.mockReset().mockRejectedValue(new ApiError(404, 'IIIF_DISABLED', 'Le service d’images IIIF n’est pas activé sur ce serveur.'));
    fixture.digitization.qualityAnalysis.mockReset();
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:copie');
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
});
afterEach(() => { vi.useRealTimers(); });

it('montre le format lu dans le contenu, ses caractéristiques, les constats et les copies', async () => {
    fixture.digitization.fileAssets.mockResolvedValue(assets([
        item(1, { format: format(), derivatives: copies }),
        item(2, { mediaType: 'image/jpeg', format: format({ family: 'JPEG', name: 'JPEG', version: '1.01', puid: 'fmt/43', lossy: true, details: { dpi: [300, 300], colorMode: 'RGB' },
            findings: [{ code: 'LOSSY_MASTER', message: 'Format avec perte (JPEG compressé) utilisé comme maître.' }] }) }),
        item(3, { format: format({ wellFormed: false, findings: [{ code: 'NOT_WELL_FORMED', message: 'Fichier illisible ou corrompu : il ne se décode pas entièrement.' }] }) })]));
    render(<FileAssetsPanel element={element} />);
    expect(await screen.findByText('3 / 3 formats identifiés')).toBeTruthy();
    expect(screen.getByText('1 copie de consultation')).toBeTruthy();
    expect(screen.getByText('2 avec constat')).toBeTruthy();
    expect(screen.getByText('JPEG 1.01')).toBeTruthy();
    expect(screen.getAllByText(/PRONOM fmt\/353/).length).toBe(2);
    expect(screen.getAllByText('300 dpi · LZW · couleur').length).toBe(2);
    expect(screen.getByText(/Format avec perte \(JPEG compressé\)/)).toBeTruthy();
    expect(screen.getByText(/ne se décode pas entièrement/)).toBeTruthy();
    expect(screen.getByText(/Consultation · 2400 × 1600 · 1,2 Mo/)).toBeTruthy();
    expect(screen.getByText(/Vignette · 360 × 240 · 23 Ko/)).toBeTruthy();
});

it('« Voir » ouvre la copie de consultation de la page, avec un message clair quand elle n’existe pas', async () => {
    fixture.digitization.fileAssets.mockResolvedValue(assets([item(1, { format: format(), derivatives: copies })]));
    fixture.records.fileDerivative.mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }));
    const view = render(<FileAssetsPanel element={element} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Voir' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByRole('img', { name: 'Page 1' }).getAttribute('src')).toBe('blob:copie'));
    expect(fixture.records.fileDerivative).toHaveBeenCalledWith(ID + '11', 'consultation', expect.anything(), 1);
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Fermer' }).at(-1)!);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:copie');
    view.unmount();

    fixture.records.fileDerivative.mockRejectedValue(new ApiError(404, 'DERIVATIVE_NOT_FOUND', 'Copie de consultation introuvable.'));
    render(<FileAssetsPanel element={element} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Voir' }));
    expect(await screen.findByText(/Aucune copie de consultation n’est disponible pour cette page/)).toBeTruthy();
});

it('un fichier de plusieurs images le dit, et « Voir » se parcourt image après image', async () => {
    fixture.digitization.fileAssets.mockResolvedValue(assets([item(1, { format: format({ details: { dpi: [300, 300], compression: 'tiff_lzw', colorMode: 'RGB', frames: 3 } }), derivatives: framesOf(3) })]));
    fixture.records.fileDerivative.mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }));
    render(<FileAssetsPanel element={element} />);
    expect(await screen.findByText(/Consultation · 3 images · 3,5 Mo au total/)).toBeTruthy();
    expect(screen.getByText(/Vignette · 3 images · 69 Ko au total/)).toBeTruthy();
    expect(screen.getByText('300 dpi · LZW · couleur · 3 images')).toBeTruthy();
    expect(screen.getByText('1 copie de consultation')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Voir' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByRole('img', { name: 'Page 1 · image 1 sur 3' })).toBeTruthy());
    expect(within(dialog).getByText('Image 1 sur 3')).toBeTruthy();
    expect((within(dialog).getByRole('button', { name: 'Image précédente' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Image suivante' }));
    await waitFor(() => expect(fixture.records.fileDerivative).toHaveBeenLastCalledWith(ID + '11', 'consultation', expect.anything(), 2));
    await waitFor(() => expect(within(dialog).getByRole('img', { name: 'Page 1 · image 2 sur 3' })).toBeTruthy());
    fireEvent.click(within(dialog).getByRole('button', { name: 'Image suivante' }));
    await waitFor(() => expect(fixture.records.fileDerivative).toHaveBeenLastCalledWith(ID + '11', 'consultation', expect.anything(), 3));
    expect((within(dialog).getByRole('button', { name: 'Image suivante' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Image précédente' }));
    await waitFor(() => expect(fixture.records.fileDerivative).toHaveBeenLastCalledWith(ID + '11', 'consultation', expect.anything(), 2));
});

it('explique les échecs, relance ce qui manque et ne propose rien sans l’habilitation', async () => {
    fixture.digitization.fileAssets.mockResolvedValue(assets([
        item(1, { format: format(), derivatives: copies }),
        item(2, { identifyState: 'FAILED', identifyError: 'FILE_TOO_LARGE', deriveState: 'FAILED', deriveError: 'FILE_TOO_LARGE' }),
        item(3, { mediaType: 'application/pdf', format: format({ family: 'PDF', name: 'PDF', version: '1.7', puid: 'fmt/276', details: { pages: 4 } }) })]));
    const view = render(<FileAssetsPanel element={element} />);
    expect(await screen.findAllByText(/fichier plus grand que la limite de traitement du serveur/)).toHaveLength(2);
    expect(screen.getByText('PDF 1.7')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Relancer' }));
    await waitFor(() => expect(fixture.digitization.command).toHaveBeenCalledTimes(1));
    expect(fixture.digitization.command.mock.calls[0]![0]).toBe(`/elements/${ID}01/file-assets/run`);
    await waitFor(() => expect(fixture.digitization.fileAssets).toHaveBeenCalledTimes(2));
    view.unmount();

    fixture.allowed = new Set(['DIGITIZATION_READ']);
    render(<FileAssetsPanel element={element} />);
    await screen.findByText(/formats? identifiés?/);
    expect(screen.queryByRole('button', { name: /Relancer|Identifier/ })).toBeNull();
});

it('désactivé et sans résultat : rien n’est affiché ; désactivé avec des résultats : ils restent visibles sans bouton', async () => {
    fixture.digitization.fileAssets.mockResolvedValue(assets([item(1)], { identificationEnabled: false, derivativesEnabled: false }));
    const view = render(<FileAssetsPanel element={element} />);
    await waitFor(() => expect(fixture.digitization.fileAssets).toHaveBeenCalled());
    await waitFor(() => expect(view.container.querySelector('.assets')).toBeNull());
    view.unmount();
    fixture.digitization.fileAssets.mockResolvedValue(assets([item(1, { format: format() })], { identificationEnabled: false, derivativesEnabled: false }));
    render(<FileAssetsPanel element={element} />);
    expect(await screen.findByText(/désactivées sur ce serveur/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Relancer|Identifier/ })).toBeNull();
});

it('rafraîchit toutes les huit secondes tant qu’un traitement est en cours, puis s’arrête', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fixture.digitization.fileAssets.mockResolvedValueOnce(assets([item(1, { identifyState: 'RUNNING' })]));
    render(<FileAssetsPanel element={element} />);
    expect(await screen.findByText('1 en cours')).toBeTruthy();
    fixture.digitization.fileAssets.mockResolvedValue(assets([item(1, { format: format(), derivatives: copies })]));
    await act(async () => { await vi.advanceTimersByTimeAsync(8100); });
    expect(await screen.findByText('1 / 1 format identifié')).toBeTruthy();
    const calls = fixture.digitization.fileAssets.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(20000); });
    expect(fixture.digitization.fileAssets.mock.calls.length).toBe(calls);
});

it('depuis l’analyse d’image, « Voir la page » ouvre la copie de la page signalée', async () => {
    const analysis: QualityAnalysis = { enabled: true, flagged: [2], pending: 0, sample: [], sampleRate: 0.1, sampleMinimum: 5, pages: [
        { numeroPage: 2, fichierId: ID + '12', jobState: 'DONE', errorCode: null, analyzed: true, flagged: true, issues: [{ code: 'BLUR', message: 'Image floue (netteté 126, minimum 250).' }],
          metrics: { width: 2480, height: 3508, sharpness: 126, contrast: 30, brightness: 232, inkRatio: 0.14, skewDegrees: 0 } }] };
    fixture.digitization.qualityAnalysis.mockResolvedValue(analysis);
    fixture.records.fileDerivative.mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }));
    render(<QualityPanel element={element} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Voir la page' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByRole('img', { name: 'Page 2' })).toBeTruthy());
    expect(fixture.records.fileDerivative).toHaveBeenCalledWith(ID + '12', 'consultation', expect.anything(), 1);
});
