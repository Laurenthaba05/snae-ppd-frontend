import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { FilePdfaValidation, PdfaStatus, PdfaSummary } from '../../src/core/pdfaValidation';

const INST = '97571d20-3f49-497e-a185-dac22208eb3f';
const DOC = '80f0f431-a8f1-4da0-b0b2-bbca91b9a739';
const fixture = vi.hoisted(() => ({
    epoch: 1, demo: false, me: null as unknown, allowed: new Set<string>(),
    preservationPlanning: { pdfaStatus: vi.fn(), pdfaSummary: vi.fn(), runPdfaValidation: vi.fn(), documentPdfaValidations: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
import { DocumentPdfaList, PdfaValidationPanel } from '../../src/ui/PdfaValidation';

const status = (over: Partial<PdfaStatus> = {}): PdfaStatus => ({
    enabled: true, configured: true, tool: 'veraPDF', toolVersion: '1.30.3', flavour: '0', defaultFlavour: '2b', lastRunAt: '2026-10-15T09:00:00Z', ...over
});
const summary = (over: Partial<PdfaSummary> = {}): PdfaSummary => ({
    institutionId: INST, eligible: 12, validated: 11, compliant: 8, nonCompliant: 2, unreadable: 1, pending: 1,
    profiles: [
        { code: '1b', name: 'PDF/A-1b validation profile', compliant: 6, nonCompliant: 0 },
        { code: '2b', name: 'PDF/A-2b validation profile', compliant: 2, nonCompliant: 2 }
    ],
    failures: [{ specification: 'ISO 19005-2:2011', clause: '6.6.2.1', description: 'Le dictionnaire du catalogue doit contenir la clé Metadata', files: 2 }],
    files: [{ fileId: 'f1', documentId: DOC, documentReference: 'DOC-1', profileCode: '2b', profileName: 'PDF/A-2b validation profile', declaration: null, failedRules: 1,
        verifiedAt: '2026-10-15T09:00:00Z' }], ...over
});

beforeEach(() => {
    fixture.epoch += 1;
    fixture.allowed = new Set(['PRESERVATION_PLANNING_READ', 'PRESERVATION_PLANNING_MANAGE']);
    for (const fn of Object.values(fixture.preservationPlanning)) fn.mockReset();
    fixture.preservationPlanning.pdfaStatus.mockResolvedValue(status());
    fixture.preservationPlanning.pdfaSummary.mockResolvedValue(summary());
});

it('le bilan montre les profils jugés, les règles les plus échouées et les PDF non conformes', async () => {
    render(<PdfaValidationPanel institutionId={INST} />);
    expect(await screen.findByText(/Sur 12 PDF : 8 conformes, 2 non conformes, 1 non analysable\./)).toBeTruthy();
    const region = screen.getByRole('region', { name: 'Validation PDF/A' });
    const row = within(region).getByText('PDF/A-2b').closest('tr')!;
    expect(within(row).getAllByText('2').length).toBe(2); // 2 conformes, 2 non conformes
    expect(within(region).getByText('6.6.2.1')).toBeTruthy();
    expect(within(region).getByText(/Le dictionnaire du catalogue doit contenir la clé Metadata/)).toBeTruthy();
    expect(within(region).getByText(/DOC-1 : PDF\/A-2b, ne déclare aucun profil — 1 règle échouée/)).toBeTruthy();
    expect(within(region).getByText(/Outil : veraPDF 1\.30\.3/)).toBeTruthy();
    expect(within(region).getByText(/jugé contre le profil qu’il déclare/)).toBeTruthy();
});

it('un passage lance la validation et en rend le bilan', async () => {
    fixture.preservationPlanning.runPdfaValidation.mockResolvedValue({ processed: 1, compliant: 1, nonCompliant: 0, unreadable: 0, failed: 0, failures: [], remaining: 0 });
    render(<PdfaValidationPanel institutionId={INST} />);
    await screen.findByText(/Sur 12 PDF/);
    fixture.preservationPlanning.pdfaSummary.mockResolvedValue(summary({ pending: 0, compliant: 9 }));
    fireEvent.click(screen.getByRole('button', { name: 'Valider les PDF restants' }));
    await waitFor(() => expect(fixture.preservationPlanning.runPdfaValidation).toHaveBeenCalledWith(INST, expect.any(String)));
    expect(await screen.findByText(/1 fichier traité : 1 conforme/)).toBeTruthy();
    expect(await screen.findByText(/Plus aucun PDF à valider\./)).toBeTruthy();
});

it('sans validateur activé, le panneau le dit et ne propose pas de passage', async () => {
    fixture.preservationPlanning.pdfaStatus.mockResolvedValue(status({ enabled: false, configured: false, tool: null, toolVersion: null, lastRunAt: null }));
    render(<PdfaValidationPanel institutionId={INST} />);
    expect(await screen.findByText(/n’est pas activée sur ce serveur/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Valider les PDF restants' }) as HTMLButtonElement).disabled).toBe(true);
});

it('un validateur activé mais invalide est signalé', async () => {
    fixture.preservationPlanning.pdfaStatus.mockResolvedValue(status({ configured: false }));
    render(<PdfaValidationPanel institutionId={INST} />);
    expect(await screen.findByText(/le lanceur du validateur n’est pas valide/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Valider les PDF restants' }) as HTMLButtonElement).disabled).toBe(true);
});

it('sans habilitation de gestion, aucun passage n’est proposé', async () => {
    fixture.allowed = new Set(['PRESERVATION_PLANNING_READ']);
    render(<PdfaValidationPanel institutionId={INST} />);
    await screen.findByText(/Sur 12 PDF/);
    expect(screen.queryByRole('button', { name: 'Valider les PDF restants' })).toBeNull();
});

it('les PDF d’un document montrent le profil jugé, ce qu’ils déclarent et les règles échouées', async () => {
    const list: FilePdfaValidation[] = [
        { fileId: 'f1', fileName: 'conforme.pdf', findings: [{ profileCode: '1b', profileName: 'PDF/A-1b validation profile', status: 'CONFORME', declaration: 'PDF/A-1b', passedRules: 129,
            failedRules: 0, passedChecks: 91, failedChecks: 0, failures: [], exception: null, tool: 'veraPDF', toolVersion: '1.30.3', verifiedAt: '2026-10-15T09:00:00Z' }] },
        { fileId: 'f2', fileName: 'ordinaire.pdf', findings: [{ profileCode: '2b', profileName: 'PDF/A-2b validation profile', status: 'NON_CONFORME', declaration: null, passedRules: 143,
            failedRules: 1, passedChecks: 48, failedChecks: 1, failures: [{ specification: 'ISO 19005-2:2011', clause: '6.6.2.1', testNumber: 1, description: 'd', failedChecks: 1,
                message: 'Pas de métadonnées' }], exception: null, tool: 'veraPDF', toolVersion: '1.30.3', verifiedAt: '2026-10-15T09:00:00Z' }] },
        { fileId: 'f3', fileName: 'casse.pdf', findings: [{ profileCode: 'aucun', profileName: null, status: 'NON_ANALYSABLE', declaration: null, passedRules: 0, failedRules: 0, passedChecks: 0,
            failedChecks: 0, failures: [], exception: 'Couldn’t parse stream', tool: 'veraPDF', toolVersion: '1.30.3', verifiedAt: '2026-10-15T09:00:00Z' }] }
    ];
    fixture.preservationPlanning.documentPdfaValidations.mockResolvedValue(list);
    render(<DocumentPdfaList documentId={DOC} />);
    const good = (await screen.findByText('conforme.pdf')).closest('tr')!;
    expect(within(good).getByText('Conforme')).toBeTruthy();
    expect(within(good).getAllByText('PDF/A-1b').length).toBe(2); // profil jugé et profil déclaré
    const bad = screen.getByText('ordinaire.pdf').closest('tr')!;
    expect(within(bad).getByText('Non conforme')).toBeTruthy();
    expect(within(bad).getByText('Aucun profil')).toBeTruthy();
    expect(within(bad).getByText(/6\.6\.2\.1 \(ISO 19005-2:2011\) — 1 contrôle/)).toBeTruthy();
    expect(within(bad).getByText(/Pas de métadonnées/)).toBeTruthy();
    const broken = screen.getByText('casse.pdf').closest('tr')!;
    expect(within(broken).getByText('Non analysable')).toBeTruthy();
    expect(within(broken).getByText(/parse stream/)).toBeTruthy();
});

it('un document sans validation le dit', async () => {
    fixture.preservationPlanning.documentPdfaValidations.mockResolvedValue([]);
    render(<DocumentPdfaList documentId={DOC} />);
    expect(await screen.findByText(/n’a encore été validé/)).toBeTruthy();
});
