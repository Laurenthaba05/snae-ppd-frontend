import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import { beforeEach, expect, it, vi } from 'vitest';

/**
 * Garde-fou d'accessibilité (WCAG 2.2 AA) des écrans récents : axe-core sur le DOM rendu. Le contraste et les repères de page ne se mesurent pas sous jsdom (pas de mise en page) :
 * ils sont contrôlés dans un vrai navigateur, écran par écran (voir docs/ACCESSIBILITE.md). Ce test attrape ce que jsdom voit : noms accessibles, étiquettes, structure des tableaux,
 * ordre des titres, rôles et attributs ARIA.
 */
const INST = '97571d20-3f49-497e-a185-dac22208eb3f';
const DOC = '80f0f431-a8f1-4da0-b0b2-bbca91b9a739';
const fixture = vi.hoisted(() => ({
    epoch: 1, demo: false, me: null as unknown, allowed: new Set<string>(),
    preservationPlanning: {
        pdfaStatus: vi.fn(), pdfaSummary: vi.fn(), runPdfaValidation: vi.fn(), documentPdfaValidations: vi.fn(),
        identificationStatus: vi.fn(), identificationSummary: vi.fn(), runIdentification: vi.fn(), documentIdentifications: vi.fn()
    },
    records: { sealKeyStatus: vi.fn(), iiifInfo: vi.fn(), iiifImage: vi.fn(), iiifOcr: vi.fn(), fileDerivative: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
import { DocumentPdfaList, PdfaValidationPanel } from '../../src/ui/PdfaValidation';
import { DocumentIdentificationList, FormatIdentificationPanel } from '../../src/ui/FormatIdentification';
import { SealKeyStatusSection } from '../../src/ui/SealKeyStatus';
import { PageViewerDialog } from '../../src/ui/PageViewer';

async function violations(container: HTMLElement): Promise<string[]> {
    const result = await axe.run(container, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
        rules: { 'color-contrast': { enabled: false }, region: { enabled: false }, 'landmark-one-main': { enabled: false }, 'page-has-heading-one': { enabled: false } }
    });
    return result.violations.map(v => `${v.id} (${v.impact}) : ${v.nodes.map(n => n.target.join(' ')).join(' ; ')}`);
}

beforeEach(() => {
    fixture.epoch += 1;
    fixture.allowed = new Set(['PRESERVATION_PLANNING_READ', 'PRESERVATION_PLANNING_MANAGE', 'TRUST_ANCHOR_MANAGE']);
    for (const group of [fixture.preservationPlanning, fixture.records]) for (const fn of Object.values(group)) fn.mockReset();
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:test');
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
});

it('le panneau de validation PDF/A n’a aucune violation de structure ou de nom accessible', async () => {
    fixture.preservationPlanning.pdfaStatus.mockResolvedValue({ enabled: true, configured: true, tool: 'veraPDF', toolVersion: '1.30.3', flavour: '0', defaultFlavour: '2b', lastRunAt: '2026-10-15T09:00:00Z' });
    fixture.preservationPlanning.pdfaSummary.mockResolvedValue({ institutionId: INST, eligible: 3, validated: 2, compliant: 1, nonCompliant: 1, unreadable: 0, pending: 1,
        profiles: [{ code: '2b', name: 'PDF/A-2b validation profile', compliant: 1, nonCompliant: 1 }],
        failures: [{ specification: 'ISO 19005-2:2011', clause: '6.6.2.1', description: 'Metadata', files: 1 }],
        files: [{ fileId: 'f', documentId: DOC, documentReference: 'DOC-1', profileCode: '2b', profileName: 'PDF/A-2b validation profile', declaration: null, failedRules: 1, verifiedAt: '2026-10-15T09:00:00Z' }] });
    const { container } = render(<PdfaValidationPanel institutionId={INST} />);
    await screen.findByText(/Sur 3 PDF/);
    expect(await violations(container)).toEqual([]);
});

it('la liste des constats PDF/A d’un document est un tableau accessible', async () => {
    fixture.preservationPlanning.documentPdfaValidations.mockResolvedValue([{ fileId: 'f1', fileName: 'ordinaire.pdf', findings: [{ profileCode: '2b', profileName: 'PDF/A-2b validation profile',
        status: 'NON_CONFORME', declaration: null, passedRules: 143, failedRules: 1, passedChecks: 48, failedChecks: 1, failures: [{ specification: 'ISO 19005-2:2011', clause: '6.6.2.1',
            testNumber: 1, description: 'd', failedChecks: 1, message: 'Pas de métadonnées' }], exception: null, tool: 'veraPDF', toolVersion: '1.30.3', verifiedAt: '2026-10-15T09:00:00Z' }] }]);
    const { container } = render(<DocumentPdfaList documentId={DOC} />);
    await screen.findByText('ordinaire.pdf');
    expect(await violations(container)).toEqual([]);
});

it('le panneau d’identification et la liste d’un document n’ont aucune violation', async () => {
    fixture.preservationPlanning.identificationStatus.mockResolvedValue({ enabled: true, configured: true, tool: 'Siegfried', toolVersion: '1.11.9', signature: 'pronom', lastRunAt: null });
    fixture.preservationPlanning.identificationSummary.mockResolvedValue({ institutionId: INST, eligible: 2, identified: 2, ambiguous: 0, unknown: 0, pending: 0, mismatched: 0,
        rows: [{ puid: 'fmt/18', name: 'PDF', version: '1.4', mediaType: 'application/pdf', files: 2, bytes: 2048, mismatches: 0, registered: true }], mismatches: [] });
    const { container } = render(<FormatIdentificationPanel institutionId={INST} />);
    await screen.findByText(/Sur 2 fichiers/);
    expect(await violations(container)).toEqual([]);

    fixture.preservationPlanning.documentIdentifications.mockResolvedValue([{ fileId: 'f', fileName: 'scan.bmp', status: 'IDENTIFIE', puid: 'fmt/116', name: 'Windows Bitmap', version: '3.0',
        mediaType: 'image/bmp', declaredMediaType: 'image/bmp', concordance: 'CONCORDE', warning: null, candidates: 1, tool: 'Siegfried', toolVersion: '1.11.9', signature: null, identifiedAt: '2026-10-15T09:00:00Z' }]);
    const list = render(<DocumentIdentificationList documentId={DOC} />);
    await screen.findByText('scan.bmp');
    expect(await violations(list.container)).toEqual([]);
});

it('l’état de la clé de scellement n’a aucune violation', async () => {
    fixture.records.sealKeyStatus.mockResolvedValue({ enabled: true, storeType: 'PKCS11', hardware: true, alias: 'sceau', subject: 'CN=Sceau', issuer: 'CN=Autorité', serial: '1a', fingerprint: 'ab'.repeat(32),
        notBefore: '2026-01-01T00:00:00Z', notAfter: '2027-01-01T00:00:00Z', daysRemaining: 260, rotationDue: false, rotationWarnDays: 90, algorithm: 'SHA256withRSA', keyBits: 3072, sealsWithCurrentKey: 3,
        history: [{ fingerprint: 'ab'.repeat(32), subject: 'CN=Sceau', seals: 3, firstSealedAt: '2026-03-01T00:00:00Z', lastSealedAt: '2026-10-01T00:00:00Z', current: true }], warnings: [] });
    const { container } = render(<SealKeyStatusSection />);
    await screen.findByText('Module matériel (PKCS#11)');
    expect(await violations(container)).toEqual([]);
});

it('la visionneuse d’image est un groupe nommé, ses commandes sont des boutons nommés', async () => {
    fixture.records.iiifInfo.mockResolvedValue({ width: 3000, height: 2000 });
    fixture.records.iiifImage.mockResolvedValue(new Blob([new Uint8Array([0xff, 0xd8])], { type: 'image/jpeg' }));
    fixture.records.iiifOcr.mockResolvedValue({ items: [] });
    const { baseElement } = render(<PageViewerDialog fichierId={INST} title="Page 3" onClose={() => undefined} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Agrandir' })).toBeTruthy());
    await screen.findByRole('img', { name: 'Page 3' });
    expect(await violations(baseElement)).toEqual([]);
});

it('contrôle négatif : le contrôle détecte un bouton sans nom et un tableau sans en-tête nommé', async () => {
    const { container } = render(<div><button type="button"><svg aria-hidden="true" /></button><table><thead><tr><th /></tr></thead><tbody><tr><td>x</td></tr></tbody></table></div>);
    const found = await violations(container);
    expect(found.some(v => v.startsWith('button-name'))).toBe(true);
    expect(found.some(v => v.startsWith('empty-table-header'))).toBe(true);
});
