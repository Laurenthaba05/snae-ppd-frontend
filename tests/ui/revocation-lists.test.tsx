import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { RevocationList } from '../../src/core/revocationLists';
import type { DocumentSignature } from '../../src/core/signatures';

const DOC = '33333333-3333-4333-8333-333333333333';
const INST = '97571d20-3f49-497e-a185-dac22208eb3f';
const FILE_P7M = '77777777-7777-4777-8777-777777777777';
const VERSION = '66666666-6666-4666-8666-666666666666';
const LIST = '99999999-9999-4999-8999-999999999999';
const fixture = vi.hoisted(() => ({
    epoch: 1, demo: false, me: null as unknown, allowed: new Set<string>(),
    records: { revocationLists: vi.fn(), addRevocationList: vi.fn(), retireRevocationList: vi.fn(), documentSignatures: vi.fn(), versions: vi.fn(), files: vi.fn() } as Record<string, ReturnType<typeof vi.fn>>
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: { institutionId: INST, departmentId: null } }) }));
import { RevocationListsSection } from '../../src/ui/RevocationLists';
import { SignaturesPanel } from '../../src/ui/Signatures';

const PEM = '-----BEGIN X509 CRL-----\nMIIBabc\n-----END X509 CRL-----';
const list = (over: Partial<RevocationList> = {}): RevocationList => ({
    id: LIST, institutionId: INST, label: 'Autorité intermédiaire, 15 octobre', issuer: 'CN=Autorité intermédiaire,O=Archives,C=GN', number: '42', thisUpdate: '2026-10-15T08:00:00Z',
    nextUpdate: '2099-10-22T08:00:00Z', entries: 3, fingerprint: 'ab'.repeat(32), status: 'ACTIF', retireReason: null, retiredAt: null, createdAt: '2026-10-15T09:00:00Z', ...over
});
const certificate = { subject: 'CN=Mamadou Diallo,O=Ministère,C=GN', issuer: 'CN=Autorité intermédiaire,O=Archives,C=GN', serial: '1a2b', sha256: 'ab'.repeat(32), validFrom: '2026-01-01T00:00:00Z', validTo: '2027-01-01T00:00:00Z' };
const signature = (over: Partial<DocumentSignature> = {}): DocumentSignature => ({
    id: 'sig-1', fileId: FILE_P7M, fileName: 'decision.p7m', source: 'VERIFIEE', format: 'CADES', level: 'INCONNU', signer: 'Mamadou Diallo', quality: null, organization: null, signedAt: '2026-09-01T09:00:00Z',
    fileHash: 'cd'.repeat(32), status: 'INTEGRITE_VALIDE', verifiedAt: '2026-10-10T08:00:00Z', message: null, coversWholeFile: null, certificate, signedWithinCertificateValidity: true, comment: null, version: 0,
    createdAt: '2026-10-10T08:00:00Z', chainStatus: 'VALIDE', chainAnchor: 'CN=Autorité racine,O=Archives,C=GN', chainMessage: null, ...over
});

beforeEach(() => {
    fixture.epoch += 1;
    fixture.demo = false;
    fixture.allowed = new Set(['TRUST_ANCHOR_MANAGE']);
    for (const fn of Object.values(fixture.records)) fn.mockReset();
    fixture.records.revocationLists.mockResolvedValue([list()]);
    fixture.records.documentSignatures.mockResolvedValue([]);
    fixture.records.versions.mockResolvedValue([{ id: VERSION, documentId: DOC, number: 1 }]);
    fixture.records.files.mockResolvedValue([{ id: FILE_P7M, versionId: VERSION, originalFilename: 'decision.p7m', mediaType: 'application/pkcs7-mime' }]);
});

it('les listes déposées se lisent avec leur émetteur, leur numéro, leurs entrées et leur fraîcheur', async () => {
    fixture.records.revocationLists.mockResolvedValue([list(), list({ id: 'l2', label: 'Liste échue', nextUpdate: '2026-10-01T00:00:00Z', entries: 0, institutionId: null })]);
    render(<RevocationListsSection />);
    const panel = await screen.findByRole('region', { name: 'Listes de révocation' });
    const row = (await within(panel).findByText('Autorité intermédiaire, 15 octobre')).closest('tr')!;
    expect(within(row).getByText('Numéro 42')).toBeTruthy();
    expect(within(row).getByText('Autorité intermédiaire')).toBeTruthy();
    expect(within(row).getByText('Institution')).toBeTruthy();
    const stale = within(panel).getByText('Liste échue').closest('tr')!;
    expect(within(stale).getByText(/prochaine mise à jour est passée/)).toBeTruthy();
    expect(within(stale).getByText('Nationale')).toBeTruthy();
});

it('sans l’habilitation de gérer les autorités de confiance, la section n’apparaît pas', async () => {
    fixture.allowed = new Set();
    const { container } = render(<RevocationListsSection />);
    await waitFor(() => expect(fixture.records.revocationLists).not.toHaveBeenCalled());
    expect(container.textContent).toBe('');
});

it('une liste se dépose avec un libellé, une saisie incomplète est expliquée', async () => {
    fixture.records.addRevocationList.mockResolvedValue(list());
    render(<RevocationListsSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Déposer une liste de révocation' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Déposer la liste' }));
    expect(await within(dialog).findByText(/Donnez un libellé/)).toBeTruthy();
    expect(fixture.records.addRevocationList).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText(/^Libellé/), { target: { value: 'Autorité intermédiaire, 15 octobre' } });
    fireEvent.change(within(dialog).getByLabelText(/^Liste \(PEM ou base64\)/), { target: { value: PEM } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Déposer la liste' }));
    await waitFor(() => expect(fixture.records.addRevocationList).toHaveBeenCalledWith(INST, 'Autorité intermédiaire, 15 octobre', PEM, expect.any(String)));
});

it('une liste se retire avec un motif', async () => {
    fixture.records.retireRevocationList.mockResolvedValue(list({ status: 'RETIRE', retireReason: 'Remplacée' }));
    render(<RevocationListsSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retirer' }));
    const dialogs = await screen.findAllByRole('dialog');
    const prompt = dialogs[dialogs.length - 1]!;
    fireEvent.change(within(prompt).getByLabelText(/^Motif/), { target: { value: 'Remplacée par la liste du jour' } });
    fireEvent.click(within(prompt).getByRole('button', { name: 'Retirer la liste' }));
    await waitFor(() => expect(fixture.records.retireRevocationList).toHaveBeenCalledWith(LIST, 'Remplacée par la liste du jour', expect.any(String)));
});

it('une signature montre son verdict de révocation : non révoqué, révoqué, indéterminé', async () => {
    fixture.records.documentSignatures.mockResolvedValue([
        signature({ id: 's1', signer: 'Signataire A', revocationStatus: 'NON_REVOQUE', revocationMessage: 'Aucun certificat de la chaîne n’est révoqué à la date retenue.' }),
        signature({ id: 's2', signer: 'Signataire B', revocationStatus: 'REVOQUE', revocationMessage: 'Le certificat « Signataire B » est révoqué depuis le 2026-09-01.' }),
        signature({ id: 's3', signer: 'Signataire C', revocationStatus: 'INDETERMINEE' })
    ]);
    render(<SignaturesPanel documentId={DOC} canEdit />);
    const panel = screen.getByRole('region', { name: 'Signatures électroniques' });
    expect(await within(panel).findByText('Certificat non révoqué')).toBeTruthy();
    expect(within(panel).getByText('Certificat révoqué')).toBeTruthy();
    expect(within(panel).getByText('Révocation indéterminée')).toBeTruthy();
    expect(within(panel).getByText(/Le certificat du signataire était révoqué à la date de la signature/)).toBeTruthy();
});
