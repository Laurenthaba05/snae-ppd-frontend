import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { DocumentSignature } from '../../src/core/signatures';
import type { TrustAnchor } from '../../src/core/trustAnchors';

const DOC = '33333333-3333-4333-8333-333333333333';
const INST = '97571d20-3f49-497e-a185-dac22208eb3f';
const FILE_TXT = '44444444-4444-4444-8444-444444444444';
const FILE_P7S = '55555555-5555-4555-8555-555555555555';
const FILE_P7M = '77777777-7777-4777-8777-777777777777';
const VERSION = '66666666-6666-4666-8666-666666666666';
const ANCHOR = '88888888-8888-4888-8888-888888888888';
const fixture = vi.hoisted(() => ({
    epoch: 1, demo: false, me: null as unknown, allowed: new Set<string>(),
    records: { documentSignatures: vi.fn(), declareSignature: vi.fn(), verifySignatures: vi.fn(), verifyDetachedSignature: vi.fn(), deleteSignature: vi.fn(), versions: vi.fn(), files: vi.fn(),
        trustAnchors: vi.fn(), addTrustAnchor: vi.fn(), retireTrustAnchor: vi.fn() } as Record<string, ReturnType<typeof vi.fn>>
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: { institutionId: INST, departmentId: null } }) }));
import { SignaturesPanel } from '../../src/ui/Signatures';
import { TrustAnchorsSection } from '../../src/ui/TrustAnchors';

const certificate = { subject: 'CN=Mamadou Diallo,O=Ministère,C=GN', issuer: 'CN=Autorité intermédiaire,O=Archives,C=GN', serial: '1a2b', sha256: 'ab'.repeat(32), validFrom: '2026-01-01T00:00:00Z', validTo: '2027-01-01T00:00:00Z' };
const signature = (over: Partial<DocumentSignature> = {}): DocumentSignature => ({
    id: 'sig-1', fileId: FILE_P7M, fileName: 'decision.p7m', source: 'VERIFIEE', format: 'CADES', level: 'INCONNU', signer: 'Mamadou Diallo', quality: null, organization: null, signedAt: '2026-09-01T09:00:00Z',
    fileHash: 'cd'.repeat(32), status: 'INTEGRITE_VALIDE', verifiedAt: '2026-10-10T08:00:00Z', message: null, coversWholeFile: null, certificate, signedWithinCertificateValidity: true, comment: null, version: 0,
    createdAt: '2026-10-10T08:00:00Z', chainStatus: 'NON_EVALUEE', chainAnchor: null, chainMessage: null, ...over
});
const anchor = (over: Partial<TrustAnchor> = {}): TrustAnchor => ({
    id: ANCHOR, institutionId: INST, label: 'Autorité nationale de certification', subject: 'CN=Autorité racine,O=Archives,C=GN', issuer: 'CN=Autorité racine,O=Archives,C=GN', serial: 'ff01',
    fingerprint: 'ef'.repeat(32), validFrom: '2020-01-01T00:00:00Z', validTo: '2040-01-01T00:00:00Z', selfSigned: true, expired: false, status: 'ACTIF', retireReason: null, retiredAt: null,
    createdAt: '2026-10-01T08:00:00Z', ...over
});

beforeEach(() => {
    fixture.epoch += 1;
    fixture.demo = false;
    fixture.allowed = new Set(['TRUST_ANCHOR_MANAGE']);
    for (const fn of Object.values(fixture.records)) fn.mockReset();
    fixture.records.documentSignatures.mockResolvedValue([]);
    fixture.records.versions.mockResolvedValue([{ id: VERSION, documentId: DOC, number: 1 }]);
    fixture.records.files.mockResolvedValue([
        { id: FILE_TXT, versionId: VERSION, originalFilename: 'decision.txt', mediaType: 'text/plain' },
        { id: FILE_P7S, versionId: VERSION, originalFilename: 'decision.txt.p7s', mediaType: 'application/pkcs7-signature' },
        { id: FILE_P7M, versionId: VERSION, originalFilename: 'decision.p7m', mediaType: 'application/pkcs7-mime' }
    ]);
    fixture.records.trustAnchors.mockResolvedValue([anchor()]);
});

it('une chaîne établie se lit : badge, autorité, et la révocation reste dite', async () => {
    fixture.records.documentSignatures.mockResolvedValue([signature({ chainStatus: 'VALIDE', chainAnchor: 'CN=Autorité racine,O=Archives,C=GN' })]);
    render(<SignaturesPanel documentId={DOC} canEdit />);
    const panel = screen.getByRole('region', { name: 'Signatures électroniques' });
    expect(await within(panel).findByText('Chaîne de confiance établie')).toBeTruthy();
    expect(within(panel).getByText(/remonte à une autorité de confiance déclarée \(Autorité racine\)/)).toBeTruthy();
    expect(within(panel).getByText(/La révocation du certificat n’est pas vérifiée/)).toBeTruthy();
    expect(within(panel).getByText(/· CAdES ·/)).toBeTruthy();
});

it('un émetteur non reconnu est signalé, une chaîne non évaluée n’affiche pas de badge de chaîne', async () => {
    fixture.records.documentSignatures.mockResolvedValue([signature({ chainStatus: 'NON_ANCREE' }), signature({ id: 'sig-2', signer: 'Fatoumata Camara', chainStatus: 'NON_EVALUEE' })]);
    render(<SignaturesPanel documentId={DOC} canEdit />);
    const panel = screen.getByRole('region', { name: 'Signatures électroniques' });
    expect(await within(panel).findByText('Émetteur non reconnu')).toBeTruthy();
    expect(within(panel).getByText(/aucune autorité de confiance déclarée/)).toBeTruthy();
    expect(within(panel).queryByText('Chaîne non évaluée')).toBeNull();
});

it('la vérification propose les fichiers vérifiables, et la signature détachée avec son fichier', async () => {
    fixture.records.verifyDetachedSignature.mockResolvedValue([signature({ id: 'sig-3', fileId: FILE_TXT, fileName: 'decision.txt', chainStatus: 'VALIDE', chainAnchor: 'CN=Autorité racine' })]);
    render(<SignaturesPanel documentId={DOC} canEdit />);
    fireEvent.click(await screen.findByRole('button', { name: 'Vérifier les signatures d’un fichier' }));
    const dialog = await screen.findByRole('dialog');
    // par défaut : signature intégrée ; seul le .p7m est proposé (ni le .txt, ni le .p7s)
    const embedded = await within(dialog).findByLabelText(/^Fichier signé/) as HTMLSelectElement;
    expect(within(embedded).getAllByRole('option').map(o => o.textContent)).toEqual(['Choisir un fichier', 'decision.p7m · version 1']);
    fireEvent.change(within(dialog).getByLabelText('Type de signature'), { target: { value: 'DETACHED' } });
    fireEvent.change(await within(dialog).findByLabelText(/^Fichier signé par la signature détachée/), { target: { value: FILE_TXT } });
    fireEvent.change(within(dialog).getByLabelText('Fichier de signature (.p7s)'), { target: { value: FILE_P7S } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Vérifier' }));
    await waitFor(() => expect(fixture.records.verifyDetachedSignature).toHaveBeenCalledWith(DOC, FILE_TXT, FILE_P7S, expect.any(String)));
    expect(await within(dialog).findByText('Chaîne de confiance établie')).toBeTruthy();
});

it('une signature intégrée .p7m se vérifie par la route commune', async () => {
    fixture.records.verifySignatures.mockResolvedValue([signature()]);
    render(<SignaturesPanel documentId={DOC} canEdit />);
    fireEvent.click(await screen.findByRole('button', { name: 'Vérifier les signatures d’un fichier' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect((within(dialog).getByLabelText(/^Fichier signé/) as HTMLSelectElement).value).toBe(FILE_P7M));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Vérifier' }));
    await waitFor(() => expect(fixture.records.verifySignatures).toHaveBeenCalledWith(DOC, FILE_P7M, expect.any(String)));
});

// ---------------------------------------------------------------- autorités de confiance
it('les autorités de confiance n’apparaissent pas sans habilitation ni en démonstration', () => {
    fixture.allowed = new Set();
    const first = render(<TrustAnchorsSection />);
    expect(first.container.textContent).toBe('');
    first.unmount();
    fixture.allowed = new Set(['TRUST_ANCHOR_MANAGE']);
    fixture.demo = true;
    expect(render(<TrustAnchorsSection />).container.textContent).toBe('');
});

it('les autorités se lisent par leur nom, sans identifiant, avec l’empreinte courte', async () => {
    fixture.records.trustAnchors.mockResolvedValue([anchor(), anchor({ id: 'a2', label: 'Ancienne autorité', status: 'RETIRE', retireReason: 'Certificat remplacé', institutionId: null })]);
    render(<TrustAnchorsSection />);
    const row = (await screen.findByText('Autorité nationale de certification')).closest('tr')!;
    expect(within(row).getByText('Racine (auto-signé)')).toBeTruthy();
    expect(within(row).getByText('Institution')).toBeTruthy();
    expect(document.body.textContent).not.toContain(ANCHOR);
    expect(document.body.textContent).not.toContain('ef'.repeat(32));
    const retired = screen.getByText('Ancienne autorité').closest('tr')!;
    expect(within(retired).getByText('Nationale')).toBeTruthy();
    expect(within(retired).getByText('Certificat remplacé')).toBeTruthy();
    expect(within(retired).queryByRole('button', { name: 'Retirer' })).toBeNull();
});

it('déclare une autorité : le certificat doit être un PEM, jamais une clé privée', async () => {
    fixture.records.addTrustAnchor.mockResolvedValue(anchor());
    render(<TrustAnchorsSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Déclarer une autorité de confiance' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/^Libellé/), { target: { value: 'Autorité racine de test' } });
    fireEvent.change(within(dialog).getByLabelText(/^Certificat \*/), { target: { value: '-----BEGIN PRIVATE KEY-----\nMIIB\n-----END PRIVATE KEY-----' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Déclarer l’autorité' }));
    expect(await within(dialog).findByText(/Ce texte contient une clé privée/)).toBeTruthy();
    expect(fixture.records.addTrustAnchor).not.toHaveBeenCalled();
    const pem = '-----BEGIN CERTIFICATE-----\nMIIBkTCB+wIJAKHBfpegPjMCMA0GCSqGSIb3DQEBCwUAMBExDzANBgNVBAMMBnRlc3RDQTAeFw0yNjAxMDEwMDAwMDBaFw00MDAxMDEwMDAwMDBaMBEx\n-----END CERTIFICATE-----';
    fireEvent.change(within(dialog).getByLabelText(/^Certificat \*/), { target: { value: pem } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Déclarer l’autorité' }));
    await waitFor(() => expect(fixture.records.addTrustAnchor).toHaveBeenCalledWith(INST, 'Autorité racine de test', pem + '\n', expect.any(String)));
});

it('retire une autorité avec un motif', async () => {
    fixture.records.retireTrustAnchor.mockResolvedValue(anchor({ status: 'RETIRE', retireReason: 'Certificat remplacé par la nouvelle autorité' }));
    render(<TrustAnchorsSection />);
    const row = (await screen.findByText('Autorité nationale de certification')).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Retirer' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/^Motif/), { target: { value: 'Certificat remplacé par la nouvelle autorité' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retirer l’autorité' }));
    await waitFor(() => expect(fixture.records.retireTrustAnchor).toHaveBeenCalledWith(ANCHOR, 'Certificat remplacé par la nouvelle autorité', expect.any(String)));
});
