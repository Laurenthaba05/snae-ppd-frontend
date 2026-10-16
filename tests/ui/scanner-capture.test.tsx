import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {  fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Capabilities, ScannerJob } from '../../src/api/acquisition';
import { ApiError } from '../../src/core/http';
const f = vi.hoisted(() => ({
    scope: { institutionId: '00000000-0000-4000-8000-000000000001', departmentId: null },
    permissions: ['FILE_INGEST', 'ACQUISITION_EXTRACT'],
    request: vi.fn(), upload: vi.fn(), ingestion: vi.fn(), versions: vi.fn(), files: vi.fn(), extract: vi.fn(),
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => ({
    records: { uploadContent: f.upload, ingestion: f.ingestion, versions: f.versions, files: f.files },
    me: { user: { status: 'ACTIF', accountType: 'USER' }, grants: f.permissions.map(permission => ({ permission, scope: 'NATIONAL', expiresAt: null })) }
}) }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: f.scope }) }));
vi.mock('../../src/ui/PdfPreview', () => ({ default: () => <p>Lecteur PDF de recette</p> }));
vi.mock('../../src/ui/ArchiveRecordPicker', () => ({ ArchiveRecordPicker: ({ onChange, disabled }: { onChange: (id: string) => void; disabled: boolean }) => <button disabled={disabled} onClick={() => onChange('document-recette')}>Choisir le document de recette</button> }));
vi.mock('../../src/api/acquisition', async original => {
    const actual = await original<typeof import('../../src/api/acquisition')>();
    return { ...actual, ScannerClient: class { request = f.request; } };
});
import { ScannerCapture } from '../../src/ui/ScannerCapture';
const id = '00000000-0000-4000-8000-000000000012';
const ready: ScannerJob = { id, state: 'READY', createdAt: '2026-10-15T10:00:00Z', expiresAt: '2026-10-15T10:30:00Z' };
const profile = { id: 'bureau', name: 'Scanner de recette', sources: ['glass'], resolutions: [300, 600], pageSizes: ['a4', 'a3'], colorModes: ['color', 'gray'] };
const capabilities: Capabilities = { importsEnabled: true, extractionEnabled: true, workerEnabled: true, maxImportBytes: 1, maxImportRows: 1 };
const props = () => ({ api: { extract: f.extract } as never, capabilities });
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name, exact: true }));
async function connect() {
    fireEvent.change(screen.getByLabelText('Code de jumelage temporaire'), { target: { value: 'test-pairing-only' } }); click('Connecter');
    await screen.findByText(/Connecteur local connecté/);
}
async function preview() {
    await connect(); click('Lancer le scanner');
    await screen.findByLabelText(/J’ai vérifié la lisibilité/);
}
async function destination() {
    click('Choisir le document de recette');
    await screen.findByRole('option', { name: 'Version 1 · BROUILLON' });
    fireEvent.change(screen.getByLabelText('Version documentaire'), { target: { value: 'version-recette' } });
    fireEvent.click(screen.getByLabelText(/J’ai vérifié la lisibilité/));
}
beforeEach(() => {
    for (const mock of [f.request, f.upload, f.ingestion, f.versions, f.files, f.extract]) mock.mockReset();
    f.permissions = ['FILE_INGEST', 'ACQUISITION_EXTRACT']; f.scope.institutionId = '00000000-0000-4000-8000-000000000001';
    f.versions.mockResolvedValue([{ id: 'version-recette', number: 1, state: 'BROUILLON', sealed: false }, { id: 'sealed', number: 2, state: 'VALIDEE', sealed: true }]);
    f.upload.mockResolvedValue({ id: 'receipt-recette', status: 'PROCESSING' });
    f.ingestion.mockResolvedValue({ id: 'receipt-recette', status: 'COMPLETED', fileId: 'file-recette' });
    f.extract.mockResolvedValue({ id: 'extraction-recette' });
    f.files.mockResolvedValue([{ id: 'file-recette', state: 'VALIDE', scanStatus: 'CLEAN', validatedAt: '2026-10-15T10:05:00Z' }]);
    f.request.mockImplementation(async (path: string, _body: unknown, method: string = 'GET') => {
        if (path === '/health') return { protocolVersion: 2 };
        if (path === '/profiles') return { items: [profile] };
        if (path === '/scans' && method === 'GET') return { items: [] };
        if (path.endsWith('/content')) return new Blob(['%PDF-1.7\nrecette'], { type: 'application/pdf' });
        return ready;
    });
});
afterEach(() => vi.useRealTimers());
it('propose les seules capacités du profil et envoie le format et le mode couleur', async () => {
    render(<ScannerCapture {...props()} />); await connect();
    expect(screen.queryByRole('option', { name: 'Chargeur recto verso' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Résolution'), { target: { value: '600' } });
    fireEvent.change(screen.getByLabelText('Format de page'), { target: { value: 'a3' } });
    fireEvent.change(screen.getByLabelText('Mode couleur'), { target: { value: 'gray' } });
    click('Lancer le scanner'); await screen.findByTitle('Aperçu du document numérisé');
    expect(f.request).toHaveBeenCalledWith('/scans', expect.objectContaining({ dpi: 600, source: 'glass', pageSize: 'a3', colorMode: 'gray', requestId: expect.any(String) }), 'POST', false, expect.any(AbortSignal));
    expect(screen.queryByLabelText('Code de jumelage temporaire')).toBeNull();
});
it('refuse un ancien connecteur et garde une erreur visible', async () => {
    f.request.mockResolvedValue({ version: '13.1' }); render(<ScannerCapture {...props()} />);
    fireEvent.change(screen.getByLabelText('Code de jumelage temporaire'), { target: { value: 'test' } }); click('Connecter');
    expect((await screen.findByRole('alert')).textContent).toContain('protocole 2');
    expect(screen.queryByRole('button', { name: 'Lancer le scanner' })).toBeNull();
});
it('reprend la même intention après une réponse de lancement perdue', async () => {
    const original = f.request.getMockImplementation()!; let lost = true;
    f.request.mockImplementation(async (...args: unknown[]) => {
        if (args[0] === '/scans' && args[2] === 'POST' && lost) { lost = false; throw new Error('Réponse perdue'); }
        return original(...args);
    });
    render(<ScannerCapture {...props()} />); await connect(); click('Lancer le scanner');
    await screen.findByRole('alert'); click('Relire la demande de scan'); await screen.findByTitle('Aperçu du document numérisé');
    const launches = f.request.mock.calls.filter(c => c[0] === '/scans' && c[2] === 'POST');
    expect(launches).toHaveLength(2); expect(launches[0]![1]).toEqual(launches[1]![1]);
});
it('retrouve un scan existant après reconnexion sans lancer le matériel', async () => {
    const original = f.request.getMockImplementation()!;
    f.request.mockImplementation(async (...args: unknown[]) => args[0] === '/scans' && args[2] === 'GET' ? { items: [ready] } : original(...args));
    render(<ScannerCapture {...props()} />); await connect(); click('Reprendre ce scan'); await screen.findByTitle('Aperçu du document numérisé');
    expect(f.request.mock.calls.some(c => c[2] === 'POST')).toBe(false);
});
it('actualise automatiquement un scan en cours et charge son PDF sans annuler la réponse', async () => {
    const original = f.request.getMockImplementation()!;
    f.request.mockImplementation(async (...args: unknown[]) => args[0] === '/scans' && args[2] === 'POST' ? { ...ready, state: 'SCANNING' } : original(...args));
    render(<ScannerCapture {...props()} />); await connect(); click('Lancer le scanner');
    await screen.findByText(/Numérisation en cours ·/);
    await screen.findByTitle('Aperçu du document numérisé');
    const contentRead = f.request.mock.calls.find(c => String(c[0]).endsWith('/content'));
    expect(contentRead).toBeTruthy();
});
it('ne dépose pas sans vérification et exclut une version scellée', async () => {
    render(<ScannerCapture {...props()} />); await preview(); click('Choisir le document de recette');
    const sealed = await screen.findByRole('option', { name: /Version 2/ }); expect((sealed as HTMLOptionElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Version documentaire'), { target: { value: 'version-recette' } });
    expect((screen.getByRole('button', { name: 'Importer ce scan' }) as HTMLButtonElement).disabled).toBe(true);
    expect(f.upload).not.toHaveBeenCalled();
});
it('bloque le changement de cible pendant le dépôt et démarre l’OCR après une complétion différée', async () => {
    render(<ScannerCapture {...props()} />); await preview(); await destination();
    fireEvent.click(screen.getByLabelText(/Demander l’extraction après le dépôt terminé/)); click('Importer ce scan');
    await screen.findByText(/Contrôles en cours · reçu/);
    expect((screen.getByRole('button', { name: 'Choisir le document de recette' }) as HTMLButtonElement).disabled).toBe(true);
    expect(f.extract).not.toHaveBeenCalled(); click('Relire le dépôt');
    await screen.findByText(/Extraction demandée/);
    expect(f.extract).toHaveBeenCalledWith('file-recette', { ocr: 'AUTO', language: 'fra+eng' }, 'scan-extract:receipt-recette');
    click('Relire le dépôt'); await waitFor(() => expect(f.ingestion).toHaveBeenCalledTimes(2)); expect(f.extract).toHaveBeenCalledTimes(1);
});
it('garde la même clé de dépôt après une erreur réseau et évite un deuxième envoi concurrent', async () => {
    f.upload.mockRejectedValueOnce(new Error('Dépôt sans réponse')).mockResolvedValueOnce({ id: 'receipt-recette', status: 'COMPLETED' });
    render(<ScannerCapture {...props()} />); await preview(); await destination(); click('Importer ce scan');
    await screen.findByRole('alert'); click('Reprendre le même dépôt');
    await screen.findByText(/Dépôt terminé · reçu/);
    expect(f.upload.mock.calls[0]![3]).toBe(f.upload.mock.calls[1]![3]);
    expect(f.upload.mock.calls[0]![3]).toBe('scanner:' + id + ':version-recette');
    expect(f.upload.mock.calls[0]![2]).toBe('PIECE_JOINTE');
});
it('un échec OCR conserve le reçu puis se reprend avec la même clé', async () => {
    f.upload.mockResolvedValue({ id: 'receipt-recette', status: 'COMPLETED', fileId: 'file-recette' });
    f.extract.mockRejectedValueOnce(new ApiError(403, 'DENIED', 'Extraction non autorisée')).mockResolvedValueOnce({ id: 'extraction-recette' });
    render(<ScannerCapture {...props()} />); await preview(); await destination();
    fireEvent.click(screen.getByLabelText(/Demander l’extraction après le dépôt terminé/)); click('Importer ce scan'); await screen.findByRole('alert');
    expect(screen.getByText(/Dépôt terminé · reçu/)).toBeTruthy(); click('Demander / reprendre l’extraction'); await screen.findByText(/Extraction demandée/);
    expect(f.upload).toHaveBeenCalledTimes(1); expect(f.extract.mock.calls[0]).toEqual(f.extract.mock.calls[1]);
    expect((screen.getByRole('button', { name: 'Choisir le document de recette' }) as HTMLButtonElement).disabled).toBe(true);
});
it('permet de corriger la destination après un refus définitif avant dépôt', async () => {
    f.upload.mockRejectedValueOnce(new ApiError(404, 'VERSION_NOT_FOUND', 'Version non autorisée'));
    render(<ScannerCapture {...props()} />); await preview(); await destination(); click('Importer ce scan'); await screen.findByRole('alert');
    expect((screen.getByRole('button', { name: 'Choisir le document de recette' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText(/Conservez cette sélection/)).toBeNull();
});
it('attend la validation humaine du fichier avant de demander l’extraction', async () => {
    f.upload.mockResolvedValue({ id: 'receipt-recette', versionId: 'version-recette', status: 'COMPLETED', fileId: 'file-recette' });
    f.files.mockResolvedValueOnce([{ id: 'file-recette', state: 'QUARANTINED', scanStatus: 'CLEAN', validatedAt: null }]);
    render(<ScannerCapture {...props()} />); await preview(); await destination();
    fireEvent.click(screen.getByLabelText(/Demander l’extraction après le dépôt terminé/)); click('Importer ce scan');
    await screen.findByText(/Un agent habilité doit valider le fichier/); expect(f.extract).not.toHaveBeenCalled();
    expect(f.files).toHaveBeenCalledWith('version-recette', expect.any(AbortSignal));
    click('Demander / reprendre l’extraction'); await screen.findByText(/Extraction demandée/);
    expect(f.extract).toHaveBeenCalledTimes(1); expect(screen.queryByText(/Un agent habilité doit valider le fichier/)).toBeNull();
});
it('ne présente pas un rejet de fichier comme une réussite et ne lance pas l’OCR', async () => {
    f.upload.mockResolvedValue({ id: 'receipt-recette', status: 'REJECTED', resultCode: 'MALWARE_DETECTED' });
    render(<ScannerCapture {...props()} />); await preview(); await destination();
    fireEvent.click(screen.getByLabelText(/Demander l’extraction après le dépôt terminé/)); click('Importer ce scan');
    await screen.findByText(/Fichier rejeté · reçu/); expect(f.extract).not.toHaveBeenCalled();
});
it('conserve le PDF lorsque l’institution est choisie après la numérisation', async () => {
    f.scope.institutionId = ''; const view = render(<ScannerCapture {...props()} />); await preview();
    f.scope.institutionId = '00000000-0000-4000-8000-000000000001'; view.rerender(<ScannerCapture {...props()} />);
    expect(screen.getByTitle('Aperçu du document numérisé')).toBeTruthy(); await destination();
});
it('n’offre pas de dépôt sans la permission FILE_INGEST', async () => {
    f.permissions = []; render(<ScannerCapture {...props()} />); await preview();
    expect(screen.getByText(/L’habilitation de dépôt/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Importer ce scan' }) as HTMLButtonElement).disabled).toBe(true);
});
it('demande une confirmation locale avant effacement et nettoie le résultat affiché', async () => {
    render(<ScannerCapture {...props()} />); await preview();
    expect((screen.getByRole('button', { name: 'Effacer la copie temporaire du poste' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/Je n’ai plus besoin de la copie/)); click('Effacer la copie temporaire du poste');
    await waitFor(() => expect(screen.queryByTitle('Aperçu du document numérisé')).toBeNull());
    expect(f.request).toHaveBeenCalledWith('/scans/' + id, undefined, 'DELETE');
});
