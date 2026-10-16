import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { FileIdentification, IdentificationStatus, IdentificationSummary } from '../../src/core/formatIdentification';

const INST = '97571d20-3f49-497e-a185-dac22208eb3f';
const DOC = '80f0f431-a8f1-4da0-b0b2-bbca91b9a739';
const fixture = vi.hoisted(() => ({
    epoch: 1, demo: false, me: null as unknown, allowed: new Set<string>(),
    preservationPlanning: { identificationStatus: vi.fn(), identificationSummary: vi.fn(), runIdentification: vi.fn(), documentIdentifications: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
import { DocumentIdentificationList, FormatIdentificationPanel } from '../../src/ui/FormatIdentification';

const status = (over: Partial<IdentificationStatus> = {}): IdentificationStatus => ({
    enabled: true, configured: true, tool: 'Siegfried', toolVersion: '1.11.1', signature: 'pronom: DROID_SignatureFile_V119.xml', lastRunAt: '2026-10-15T09:00:00Z', ...over
});
const summary = (over: Partial<IdentificationSummary> = {}): IdentificationSummary => ({
    institutionId: INST, eligible: 12, identified: 9, ambiguous: 1, unknown: 1, pending: 1, mismatched: 1,
    rows: [
        { puid: 'fmt/18', name: 'Acrobat PDF 1.4 - Portable Document Format', version: '1.4', mediaType: 'application/pdf', files: 6, bytes: 6144, mismatches: 1, registered: false },
        { puid: 'fmt/116', name: 'Windows Bitmap', version: '3.0', mediaType: 'image/bmp', files: 4, bytes: 2048, mismatches: 0, registered: true }
    ],
    mismatches: [{ fileId: 'f1', documentId: DOC, documentReference: 'DOC-1', declaredMediaType: 'text/plain', puid: 'fmt/18', name: 'PDF', mediaType: 'application/pdf' }], ...over
});

beforeEach(() => {
    fixture.epoch += 1;
    fixture.allowed = new Set(['PRESERVATION_PLANNING_READ', 'PRESERVATION_PLANNING_MANAGE']);
    for (const fn of Object.values(fixture.preservationPlanning)) fn.mockReset();
    fixture.preservationPlanning.identificationStatus.mockResolvedValue(status());
    fixture.preservationPlanning.identificationSummary.mockResolvedValue(summary());
});

it('le bilan montre les formats reconnus, ceux qui ne sont pas au registre et les écarts avec le type déclaré', async () => {
    render(<FormatIdentificationPanel institutionId={INST} />);
    expect(await screen.findByText(/Sur 12 fichiers : 9 identifiés, 1 ambigu, 1 inconnu\./)).toBeTruthy();
    const region = screen.getByRole('region', { name: 'Identification par signature' });
    const pdf = within(region).getByText('fmt/18').closest('tr')!;
    expect(within(pdf).getByText('Non évalué')).toBeTruthy();
    expect(within(pdf).getByText('1 différent')).toBeTruthy();
    const bmp = within(region).getByText('fmt/116').closest('tr')!;
    expect(within(bmp).getByText('Au registre')).toBeTruthy();
    expect(within(region).getByText(/DOC-1 : déclaré text\/plain, reconnu application\/pdf \(fmt\/18\)/)).toBeTruthy();
    expect(within(region).getByText(/Outil : Siegfried 1\.11\.1/)).toBeTruthy();
});

it('un passage lance l’identification et en rend le bilan', async () => {
    fixture.preservationPlanning.runIdentification.mockResolvedValue({ processed: 1, identified: 1, ambiguous: 0, unknown: 0, failed: 0, failures: [], remaining: 0 });
    render(<FormatIdentificationPanel institutionId={INST} />);
    await screen.findByText(/Sur 12 fichiers/);
    fixture.preservationPlanning.identificationSummary.mockResolvedValue(summary({ pending: 0, identified: 10 }));
    fireEvent.click(screen.getByRole('button', { name: 'Identifier les fichiers restants' }));
    await waitFor(() => expect(fixture.preservationPlanning.runIdentification).toHaveBeenCalledWith(INST, expect.any(String)));
    expect(await screen.findByText(/1 fichier traité : 1 identifié/)).toBeTruthy();
    expect(await screen.findByText(/Plus aucun fichier à identifier\./)).toBeTruthy();
});

it('sans outil activé, le panneau le dit et ne propose pas de passage', async () => {
    fixture.preservationPlanning.identificationStatus.mockResolvedValue(status({ enabled: false, configured: false, tool: null, toolVersion: null, signature: null, lastRunAt: null }));
    render(<FormatIdentificationPanel institutionId={INST} />);
    expect(await screen.findByText(/n’est pas activée sur ce serveur/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Identifier les fichiers restants' }) as HTMLButtonElement).disabled).toBe(true);
});

it('un outil activé mais invalide est signalé', async () => {
    fixture.preservationPlanning.identificationStatus.mockResolvedValue(status({ configured: false }));
    render(<FormatIdentificationPanel institutionId={INST} />);
    expect(await screen.findByText(/l’exécutable de l’outil n’est pas valide/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Identifier les fichiers restants' }) as HTMLButtonElement).disabled).toBe(true);
});

it('sans habilitation de gestion, aucun passage n’est proposé', async () => {
    fixture.allowed = new Set(['PRESERVATION_PLANNING_READ']);
    render(<FormatIdentificationPanel institutionId={INST} />);
    await screen.findByText(/Sur 12 fichiers/);
    expect(screen.queryByRole('button', { name: 'Identifier les fichiers restants' })).toBeNull();
});

it('les fichiers d’un document montrent le format reconnu et la comparaison au type déclaré', async () => {
    const list: FileIdentification[] = [
        { fileId: 'f1', fileName: 'scan.bmp', status: 'IDENTIFIE', puid: 'fmt/116', name: 'Windows Bitmap', version: '3.0', mediaType: 'image/bmp', declaredMediaType: 'image/bmp',
          concordance: 'CONCORDE', warning: null, candidates: 1, tool: 'Siegfried', toolVersion: '1.11.1', signature: null, identifiedAt: '2026-10-15T09:00:00Z' },
        { fileId: 'f2', fileName: 'note.txt', status: 'INCONNU', puid: null, name: null, version: null, mediaType: null, declaredMediaType: 'text/plain', concordance: 'NON_EVALUEE',
          warning: 'no match', candidates: 0, tool: 'Siegfried', toolVersion: '1.11.1', signature: null, identifiedAt: '2026-10-15T09:00:00Z' },
        { fileId: 'f3', fileName: 'faux.txt', status: 'AMBIGU', puid: 'fmt/18', name: 'PDF', version: '1.4', mediaType: 'application/pdf', declaredMediaType: 'text/plain', concordance: 'DIFFERE',
          warning: null, candidates: 2, tool: 'Siegfried', toolVersion: '1.11.1', signature: null, identifiedAt: '2026-10-15T09:00:00Z' }
    ];
    fixture.preservationPlanning.documentIdentifications.mockResolvedValue(list);
    render(<DocumentIdentificationList documentId={DOC} />);
    const bmp = (await screen.findByText('scan.bmp')).closest('tr')!;
    expect(within(bmp).getByText('Conforme au type déclaré')).toBeTruthy();
    expect(within(bmp).getByText('fmt/116')).toBeTruthy();
    const unknown = screen.getByText('note.txt').closest('tr')!;
    expect(within(unknown).getByText('Inconnu')).toBeTruthy();
    expect(within(unknown).getByText('Non comparé')).toBeTruthy();
    const ambiguous = screen.getByText('faux.txt').closest('tr')!;
    expect(within(ambiguous).getByText('Différent du type déclaré')).toBeTruthy();
    expect(within(ambiguous).getByText(/2 correspondances possibles/)).toBeTruthy();
});

it('un document sans identification le dit', async () => {
    fixture.preservationPlanning.documentIdentifications.mockResolvedValue([]);
    render(<DocumentIdentificationList documentId={DOC} />);
    expect(await screen.findByText(/n’a encore été identifié par signature/)).toBeTruthy();
});
