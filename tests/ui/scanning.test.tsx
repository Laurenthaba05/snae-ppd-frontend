import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { DigitizationElement, PageCheck, ScanLot, ScanPage } from '../../src/core/types';
const fixture = vi.hoisted(() => ({
    epoch: 1,
    digitization: { command: vi.fn(), scanners: vi.fn(), lotsByProject: vi.fn(), pagesByElement: vi.fn(), pageCheck: vi.fn() },
    records: { versions: vi.fn(), uploadContent: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
import { LotDialog, PageImportDialog, PagesSection } from '../../src/ui/Scanning';

const ID = '00000000-0000-4000-8000-0000000000';
const element = (extra: Partial<DigitizationElement> = {}): DigitizationElement => ({ id: ID + '01', projetNumerisationId: ID + '02', archivePhysiqueId: null, documentId: ID + '03', ordre: null, descriptionSource: 'Registre 1950', statut: 'NUMERISATION', dateDebut: null, dateFin: null, versionLock: 1, lotId: null, pagesAttendues: 6, rectoVerso: false, ...extra });
const lot: ScanLot = { id: ID + '04', projetNumerisationId: ID + '02', code: 'LOT-1', nom: null, scannerId: null, operateurId: null, resolutionDpi: 300, resolutionMinDpi: 300, modeCouleur: 'COULEUR', rectoVerso: false, statut: 'OUVERT', commentaire: null, motifCloture: null, dateCloture: null, versionLock: 0 };
const page = (n: number, extra: Partial<ScanPage> = {}): ScanPage => ({ id: ID + '1' + n, elementNumerisationId: ID + '01', numeroPage: n, face: 'RECTO', statut: 'PRESENTE', fichierId: ID + '2' + n, largeurPx: 2480, hauteurPx: 3508, dpi: 300, sourceDpi: 'FICHIER', motif: null, versionLock: 0, ...extra });
const check = (extra: Partial<PageCheck> = {}): PageCheck => ({ elementId: ID + '01', attendues: 6, rectoVerso: false, resolutionMinimale: 300, presentes: [1, 2], vides: [], aRescanner: [], manquantes: [3, 4, 5, 6], resolutionInsuffisante: [], resolutionInconnue: [], feuilletsIncomplets: [], complet: false, ...extra });

function png(dpi: number | null): Uint8Array {
    const chunk = (type: string, data: number[]) => { const out = new Uint8Array(12 + data.length); const v = new DataView(out.buffer); v.setUint32(0, data.length); for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i); out.set(data, 8); return out; };
    const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
    const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', [...u32(2480), ...u32(3508), 8, 2, 0, 0, 0])];
    if (dpi !== null) parts.push(chunk('pHYs', [...u32(Math.round(dpi / 0.0254)), ...u32(Math.round(dpi / 0.0254)), 1]));
    parts.push(chunk('IDAT', [0, 0, 0, 0]), chunk('IEND', []));
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
}
const file = (name: string, dpi: number | null) => new File([png(dpi) as BlobPart], name, { type: 'image/png' });
const pick = (files: File[]) => fireEvent.change(document.querySelector('input[type=file]') as HTMLInputElement, { target: { files } });
const ingestion = (n: number) => ({ id: ID + '3' + n, versionId: ID + '05', status: 'COMPLETED', fileId: ID + '4' + n, filename: 'x', mediaType: 'image/png', size: 1, sha256: 'a', attempts: 1, resultCode: null, createdAt: '', updatedAt: '' });

beforeEach(() => {
    fixture.digitization.command.mockReset().mockResolvedValue({});
    fixture.digitization.scanners.mockReset().mockResolvedValue([]);
    fixture.digitization.lotsByProject.mockReset().mockResolvedValue([lot]);
    fixture.digitization.pagesByElement.mockReset().mockResolvedValue([page(1), page(2)]);
    fixture.digitization.pageCheck.mockReset().mockResolvedValue(check());
    fixture.records.versions.mockReset().mockResolvedValue([{ id: ID + '05', documentId: ID + '03', number: 1, state: 'BROUILLON', sealed: false, sealedHash: null, sealedAt: null }]);
    let n = 0;
    fixture.records.uploadContent.mockReset().mockImplementation(async () => ingestion(++n));
});

it('importe des pages : numérotation à partir de la première page manquante, résolution lue dans le fichier, une clé par page', async () => {
    const onDone = vi.fn();
    render(<PageImportDialog element={element()} lot={lot} pages={[page(1), page(2)]} check={check()} onClose={vi.fn()} onDone={onDone} onPlan={vi.fn()} />);
    await screen.findByText('Choisir les images');
    expect((screen.getByLabelText(/Première page importée/) as HTMLInputElement).value).toBe('3');
    pick([file('scan10.png', 300), file('scan2.png', 600), file('scan1.png', null)]);
    await screen.findByText('Importer 3 pages');
    expect(screen.getByText(/Résolution non lisible/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Importer 3 pages/ }));
    await screen.findByRole('button', { name: 'Terminer' });
    expect(fixture.records.uploadContent).toHaveBeenCalledTimes(3);
    expect(fixture.records.uploadContent.mock.calls[0]![0]).toBe(ID + '05');
    expect(fixture.records.uploadContent.mock.calls[0]![2]).toBe('MAITRE_CONSERVATION');
    const registered = fixture.digitization.command.mock.calls.map(c => (c[1] as { pages: Array<Record<string, unknown>> }).pages[0]!);
    expect(registered.map(p => p.numeroPage)).toEqual([3, 4, 5]);
    expect(registered[1]).toMatchObject({ numeroPage: 4, face: 'RECTO', statut: 'PRESENTE', dpi: 600, sourceDpi: 'FICHIER', largeurPx: 2480, hauteurPx: 3508 });
    expect(registered[0]).toMatchObject({ dpi: 300, sourceDpi: 'SAISIE' });   // scan1 : résolution absente du fichier, reprise du lot
    expect(registered[2]).toMatchObject({ dpi: 300, sourceDpi: 'FICHIER' });
    expect(new Set(fixture.digitization.command.mock.calls.map(c => c[2])).size).toBe(3);
    expect(fixture.digitization.command.mock.calls[0]![0]).toBe(`/elements/${ID}01/pages`);
    expect(onDone).toHaveBeenCalled();
});

it('une résolution absente du fichier est saisie et signalée comme telle', async () => {
    render(<PageImportDialog element={element()} lot={lot} pages={[]} check={null} onClose={vi.fn()} onDone={vi.fn()} onPlan={vi.fn()} />);
    await screen.findByText('Choisir les images');
    fireEvent.change(screen.getByLabelText(/Résolution si absente/), { target: { value: '400' } });
    pick([file('a.png', null)]);
    fireEvent.click(await screen.findByRole('button', { name: /Importer 1 page/ }));
    await screen.findByRole('button', { name: 'Terminer' });
    expect(((fixture.digitization.command.mock.calls[0]![1] as { pages: Array<Record<string, unknown>> }).pages[0])).toMatchObject({ dpi: 400, sourceDpi: 'SAISIE' });
});

it('en recto-verso, les pages paires sont des versos ; une page déjà présente bloque la ligne', async () => {
    render(<PageImportDialog element={element({ rectoVerso: true })} lot={null} pages={[page(1)]} check={null} onClose={vi.fn()} onDone={vi.fn()} onPlan={vi.fn()} />);
    await screen.findByText('Choisir les images');
    fireEvent.change(screen.getByLabelText(/Première page importée/), { target: { value: '1' } });
    pick([file('a.png', 300), file('b.png', 300)]);
    await screen.findByText(/La page 1 existe déjà/);
    expect(screen.getByText('Verso')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Importer 1 page$/ })).toBeTruthy();
});

it('un dépôt rejeté par le serveur n’enregistre aucune page et reste réessayable', async () => {
    fixture.records.uploadContent.mockResolvedValueOnce({ ...ingestion(1), status: 'REJECTED', fileId: null, resultCode: 'SCAN_THREAT_DETECTED' });
    render(<PageImportDialog element={element()} lot={lot} pages={[]} check={null} onClose={vi.fn()} onDone={vi.fn()} onPlan={vi.fn()} />);
    await screen.findByText('Choisir les images');
    pick([file('a.png', 300)]);
    fireEvent.click(await screen.findByRole('button', { name: /Importer 1 page/ }));
    await screen.findByText(/menace/);
    expect(fixture.digitization.command).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Réessayer 1 page/ }));
    await waitFor(() => expect(fixture.digitization.command).toHaveBeenCalledTimes(1));
    expect(fixture.records.uploadContent.mock.calls[1]![3]).toBe(fixture.records.uploadContent.mock.calls[0]![3]);
});

it('sans document lié, l’import renvoie vers le plan de numérisation', async () => {
    const onPlan = vi.fn();
    render(<PageImportDialog element={element({ documentId: null })} lot={lot} pages={[]} check={null} onClose={vi.fn()} onDone={vi.fn()} onPlan={onPlan} />);
    fireEvent.click(await screen.findByRole('button', { name: /plan de numérisation/ }));
    expect(onPlan).toHaveBeenCalled();
});

it('affiche les pages manquantes, la résolution insuffisante et les feuillets incomplets du contrôle serveur', async () => {
    fixture.digitization.pageCheck.mockResolvedValue(check({ manquantes: [3, 4, 5, 9], resolutionInsuffisante: [{ numero: 2, dpi: 150, minimum: 300 }], feuilletsIncomplets: [2], aRescanner: [1] }));
    render(<PagesSection element={element()} lots={[lot]} canManage onChanged={vi.fn()} />);
    await screen.findByText(/Pages manquantes \(4\) : 3-5, 9/);
    expect(screen.getByText(/Résolution inférieure à 300 dpi : p\. 2 \(150\)/)).toBeTruthy();
    expect(screen.getByText(/Feuillets dont une seule face/)).toBeTruthy();
    expect(screen.getByText(/Pages à rescanner : 1/)).toBeTruthy();
});

it('création de lot : refuse une résolution sous le minimum et un recto-verso que le scanner ne gère pas', async () => {
    fixture.digitization.scanners.mockResolvedValue([{ id: ID + '06', code: 'SC-1', nom: 'Fujitsu', fabricant: null, modele: null, numeroSerie: null, typeScanner: 'ALIMENTATEUR', rectoVerso: false, resolutionMaxDpi: 600, localisation: null, statut: 'ACTIF', versionLock: 0 }]);
    render(<LotDialog projectId={ID + '02'} onClose={vi.fn()} onCreated={vi.fn()} />);
    await screen.findByText(/SC-1/);
    fireEvent.change(screen.getByLabelText(/Résolution de numérisation/), { target: { value: '200' } });
    await screen.findByText(/inférieure au minimum exigé \(300 dpi\)/);
    expect((screen.getByRole('button', { name: 'Créer le lot' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Résolution de numérisation/), { target: { value: '300' } });
    fireEvent.change(screen.getByLabelText(/^Scanner/), { target: { value: ID + '06' } });
    fireEvent.change(screen.getByLabelText(/^Faces/), { target: { value: 'oui' } });
    await screen.findByText(/ne gère pas le recto-verso/);
    fireEvent.change(screen.getByLabelText(/^Faces/), { target: { value: 'non' } });
    fireEvent.change(screen.getByLabelText(/Résolution de numérisation/), { target: { value: '1200' } });
    await screen.findByText(/ne dépasse pas 600 dpi/);
});
