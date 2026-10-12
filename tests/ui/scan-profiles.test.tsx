import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { ConformityReport, ImageTechnical, ScanProfile } from '../../src/core/scanProfiles';

const INST = '97571d20-3f49-497e-a185-dac22208eb3f';
const FILE = '44444444-4444-4444-8444-444444444444';
const PROFILE = '88888888-8888-4888-8888-888888888888';
const fixture = vi.hoisted(() => ({
    epoch: 1, demo: false, me: null as unknown, allowed: new Set<string>(),
    digitization: { scanProfiles: vi.fn(), imageTechnical: vi.fn(), imageMix: vi.fn(), imageConformity: vi.fn(), pdfaDeclaration: vi.fn(), command: vi.fn() } as Record<string, ReturnType<typeof vi.fn>>
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: { institutionId: INST, departmentId: null } }) }));
import { ImageTechnicalDialog, PdfaDialog, ScanProfilesSection } from '../../src/ui/ScanProfiles';

const profile = (over: Partial<ScanProfile> = {}): ScanProfile => ({
    id: PROFILE, institutionId: INST, code: 'NUM_400', name: 'Numérisation des registres', description: 'Registres d’état civil', source: 'Directive 2026-12', ppiMin: 400, bitsMin: 8,
    colorModes: ['RGB'], formats: ['image/tiff'], lossless: true, iccRequired: false, status: 'ACTIF', retireReason: null, createdAt: '2026-10-01T08:00:00Z', ...over
});
const technical = (over: Partial<ImageTechnical['metadata']> = {}): ImageTechnical => ({
    fileId: FILE, fileName: 'registre-1920-p3.tif', mediaType: 'image/tiff', size: 5_000_000, extractedAt: '2026-10-10T08:00:00Z',
    metadata: { format: 'TIFF', width: 4000, height: 3000, bitsPerSample: 8, samples: 3, colorMode: 'RGB', compression: 'LZW', lossless: true, ppiX: 400, ppiY: 400, iccProfile: false, ...over }
});
const report = (over: Partial<ConformityReport> = {}): ConformityReport => ({
    profileId: PROFILE, profileName: 'Numérisation des registres', conform: false, findings: [
        { code: 'RESOLUTION', ok: true, message: 'Résolution de 400 ppp (au moins 400).' },
        { code: 'ICC', ok: false, message: 'Aucun profil colorimétrique ICC n’est embarqué ; le profil l’exige.' }
    ], ...over
});

beforeEach(() => {
    fixture.epoch += 1;
    fixture.demo = false;
    fixture.allowed = new Set(['SCAN_PROFILE_MANAGE']);
    for (const fn of Object.values(fixture.digitization)) fn.mockReset();
    fixture.digitization.scanProfiles.mockResolvedValue([profile()]);
    fixture.digitization.imageTechnical.mockResolvedValue(technical());
});

// ---------------------------------------------------------------- caractéristiques d'une image
it('une image se lit par ses caractéristiques, et le profil choisi donne un constat par exigence', async () => {
    fixture.digitization.imageConformity.mockResolvedValue(report());
    render(<ImageTechnicalDialog fileId={FILE} fileName="registre-1920-p3.tif" institutionId={INST} onClose={() => undefined} />);
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('4000 × 3000 pixels')).toBeTruthy();
    expect(within(dialog).getByText('400 ppp')).toBeTruthy();
    expect(within(dialog).getByText('LZW (sans perte)')).toBeTruthy();
    expect(document.body.textContent).not.toContain(FILE);
    fireEvent.change(await within(dialog).findByLabelText(/^Profil de numérisation/), { target: { value: PROFILE } });
    await waitFor(() => expect(fixture.digitization.imageConformity).toHaveBeenCalledWith(FILE, PROFILE));
    expect(await within(dialog).findByText(/Non conforme au profil « Numérisation des registres »/)).toBeTruthy();
    // « Profil ICC » est à la fois une caractéristique de l'image et une exigence du profil : on prend la ligne du constat
    const row = within(dialog).getAllByText('Profil ICC').map(el => el.closest('tr')!).find(tr => tr.textContent!.includes('Non conforme'))!;
    expect(within(row).getByText('Non conforme')).toBeTruthy();
    expect(within(row).getByText(/Aucun profil colorimétrique ICC/)).toBeTruthy();
    expect(within(dialog).getByText(/ce n’est pas une certification FADGI ou Metamorfoze/)).toBeTruthy();
});

it('une image conforme est dite conforme, une valeur absente du fichier est dite absente', async () => {
    fixture.digitization.imageTechnical.mockResolvedValue(technical({ ppiX: null, ppiY: null, bitsPerSample: null }));
    fixture.digitization.imageConformity.mockResolvedValue(report({ conform: true, findings: [{ code: 'RESOLUTION', ok: true, message: 'ok' }] }));
    render(<ImageTechnicalDialog fileId={FILE} fileName="registre.tif" institutionId={INST} onClose={() => undefined} />);
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Non renseignée dans le fichier')).toBeTruthy();
    expect(within(dialog).getByText('Non déterminée')).toBeTruthy();
    fireEvent.change(await within(dialog).findByLabelText(/^Profil de numérisation/), { target: { value: PROFILE } });
    expect(await within(dialog).findByText(/^Conforme au profil/)).toBeTruthy();
});

it('exporte les caractéristiques en MIX (XML)', async () => {
    const created = vi.fn(() => 'blob:mix');
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = created;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
    fixture.digitization.imageMix.mockResolvedValue(new Blob(['<mix/>'], { type: 'application/xml' }));
    render(<ImageTechnicalDialog fileId={FILE} fileName="registre-1920-p3.tif" institutionId={INST} onClose={() => undefined} />);
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('4000 × 3000 pixels');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Exporter en MIX (XML)' }));
    await waitFor(() => expect(fixture.digitization.imageMix).toHaveBeenCalledWith(FILE));
    await waitFor(() => expect(created).toHaveBeenCalled());
});

it('un fichier illisible affiche la raison donnée par le serveur', async () => {
    fixture.digitization.imageTechnical.mockRejectedValue(new Error('Ce fichier image n’a pas pu être lu : format non reconnu ou en-têtes illisibles.'));
    render(<ImageTechnicalDialog fileId={FILE} fileName="cassee.png" institutionId={INST} onClose={() => undefined} />);
    expect(await screen.findByText(/n’a pas pu être lu/)).toBeTruthy();
});

// ---------------------------------------------------------------- profils de l'institution
it('les profils n’apparaissent pas sans habilitation ni en démonstration', () => {
    fixture.allowed = new Set();
    const first = render(<ScanProfilesSection />);
    expect(first.container.textContent).toBe('');
    first.unmount();
    fixture.allowed = new Set(['SCAN_PROFILE_MANAGE']);
    fixture.demo = true;
    expect(render(<ScanProfilesSection />).container.textContent).toBe('');
});

it('les profils se lisent par leur nom, avec leurs exigences en phrases et sans identifiant', async () => {
    fixture.digitization.scanProfiles.mockResolvedValue([profile(), profile({ id: 'p2', name: 'Ancien profil', code: 'ANCIEN', status: 'RETIRE', retireReason: 'Remplacé par un profil à 400 ppp', institutionId: null })]);
    render(<ScanProfilesSection />);
    const row = (await screen.findByText('Numérisation des registres')).closest('tr')!;
    expect(within(row).getByText('NUM_400')).toBeTruthy();
    expect(within(row).getByText('Résolution d’au moins 400 ppp')).toBeTruthy();
    expect(within(row).getByText('Compression sans perte')).toBeTruthy();
    expect(within(row).getByText('Institution')).toBeTruthy();
    expect(document.body.textContent).not.toContain(PROFILE);
    const retired = screen.getByText('Ancien profil').closest('tr')!;
    expect(within(retired).getByText('Nationale')).toBeTruthy();
    expect(within(retired).queryByRole('button', { name: 'Retirer' })).toBeNull();
});

it('définit un profil : un code invalide est refusé avant tout envoi, puis le profil est envoyé en majuscules', async () => {
    fixture.digitization.command.mockResolvedValue(profile());
    render(<ScanProfilesSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Définir un profil' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/^Nom/), { target: { value: 'Numérisation courante' } });
    fireEvent.change(within(dialog).getByLabelText(/^Code/), { target: { value: '1 mauvais' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Définir le profil' }));
    expect(await within(dialog).findByText(/Le code compte de 2 à 60 caractères/)).toBeTruthy();
    expect(fixture.digitization.command).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText(/^Code/), { target: { value: 'num_courante' } });
    fireEvent.change(within(dialog).getByLabelText(/^Résolution minimale/), { target: { value: '300' } });
    fireEvent.click(within(dialog).getByLabelText(/Couleur \(RVB\)/));
    fireEvent.click(within(dialog).getByLabelText('TIFF'));
    fireEvent.click(within(dialog).getByLabelText(/Compression sans perte/));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Définir le profil' }));
    await waitFor(() => expect(fixture.digitization.command).toHaveBeenCalledWith('/scan-profiles', expect.objectContaining({
        institutionId: INST, code: 'NUM_COURANTE', name: 'Numérisation courante', ppiMin: 300, bitsMin: 8, colorModes: ['RGB'], formats: ['image/tiff'], lossless: true, iccRequired: false
    }), expect.any(String)));
});

it('retire un profil avec un motif', async () => {
    fixture.digitization.command.mockResolvedValue(profile({ status: 'RETIRE' }));
    render(<ScanProfilesSection />);
    const row = (await screen.findByText('Numérisation des registres')).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Retirer' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/^Motif/), { target: { value: 'Remplacé par un profil à 600 ppp' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retirer le profil' }));
    await waitFor(() => expect(fixture.digitization.command).toHaveBeenCalledWith(`/scan-profiles/${PROFILE}/retire`, { reason: 'Remplacé par un profil à 600 ppp' }, expect.any(String)));
});

it('la déclaration PDF/A d’un fichier se lit avec sa version, son niveau, et la mention qu’elle n’est pas validée', async () => {
    fixture.digitization.pdfaDeclaration.mockResolvedValue({ fileId: FILE, fileName: 'dossier.pdf', mediaType: 'application/pdf', size: 90_000, pdfVersion: '1.7', declared: true, label: 'PDF/A-2b', part: 2,
        conformance: 'B', encrypted: false, xmpFound: true, validated: false, extractedAt: '2026-10-12T08:00:00Z',
        notice: 'Déclaration lue dans les métadonnées XMP du fichier : elle n’est pas validée. Aucun validateur PDF/A n’est raccordé ; un fichier peut se dire PDF/A sans l’être.' });
    render(<PdfaDialog fileId={FILE} fileName="dossier.pdf" onClose={() => {}} />);
    expect(await screen.findByText('Le fichier se déclare PDF/A-2b.')).toBeTruthy();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('1.7')).toBeTruthy();
    expect(within(dialog).getByText(/B — conformité de base/)).toBeTruthy();
    expect(within(dialog).getByText(/non validée : aucun validateur PDF\/A n’est raccordé/)).toBeTruthy();
    expect(within(dialog).getByText(/elle n’est pas validée/)).toBeTruthy();
});

it('un PDF sans déclaration le dit, et un chiffrement signalé est mentionné', async () => {
    fixture.digitization.pdfaDeclaration.mockResolvedValue({ fileId: FILE, fileName: 'simple.pdf', mediaType: 'application/pdf', size: 1000, pdfVersion: '1.4', declared: false, label: null, part: null,
        conformance: null, encrypted: true, xmpFound: false, validated: false, extractedAt: '2026-10-12T08:00:00Z', notice: 'Déclaration lue : elle n’est pas validée.' });
    render(<PdfaDialog fileId={FILE} fileName="simple.pdf" onClose={() => {}} />);
    expect(await screen.findByText('Le fichier ne déclare pas de conformité PDF/A.')).toBeTruthy();
    expect(screen.getByText('aucune déclaration')).toBeTruthy();
    expect(screen.getByText(/signalé : un PDF\/A ne se chiffre pas/)).toBeTruthy();
});
