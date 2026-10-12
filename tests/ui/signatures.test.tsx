import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { DocumentSignature } from '../../src/core/signatures';

const DOC = '33333333-3333-4333-8333-333333333333';
const FILE_PDF = '44444444-4444-4444-8444-444444444444';
const FILE_TIFF = '55555555-5555-4555-8555-555555555555';
const VERSION = '66666666-6666-4666-8666-666666666666';
const fixture = vi.hoisted(() => ({
    epoch: 1,
    records: { documentSignatures: vi.fn(), declareSignature: vi.fn(), verifySignatures: vi.fn(), deleteSignature: vi.fn(), versions: vi.fn(), files: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
import { SignaturesPanel } from '../../src/ui/Signatures';

const certificate = { subject: 'CN=Mamadou Diallo,O=Ministère,C=GN', issuer: 'CN=Autorité de test,O=Ministère,C=GN', serial: '1a2b', sha256: 'ab'.repeat(32), validFrom: '2026-01-01T00:00:00Z', validTo: '2027-01-01T00:00:00Z' };
const signature = (over: Partial<DocumentSignature> = {}): DocumentSignature => ({
    id: 'sig-1', fileId: FILE_PDF, fileName: 'contrat.pdf', source: 'VERIFIEE', format: 'PADES', level: 'INCONNU', signer: 'Mamadou Diallo', quality: null, organization: null, signedAt: '2026-09-01T09:00:00Z',
    fileHash: 'cd'.repeat(32), status: 'INTEGRITE_VALIDE', verifiedAt: '2026-10-10T08:00:00Z', message: null, coversWholeFile: true, certificate, signedWithinCertificateValidity: true, comment: null, version: 0,
    createdAt: '2026-10-10T08:00:00Z', ...over
});
const declared = (over: Partial<DocumentSignature> = {}) => signature({ id: 'sig-2', source: 'DECLAREE', format: 'AUTRE', level: 'AVANCEE', signer: 'Directeur général', quality: 'Ordonnateur', organization: 'Ministère des Finances',
    status: 'NON_VERIFIEE', verifiedAt: null, coversWholeFile: null, certificate: null, signedWithinCertificateValidity: null, comment: 'Signé sur papier', version: 3, ...over });

beforeEach(() => {
    fixture.epoch += 1;
    for (const fn of Object.values(fixture.records)) fn.mockReset();
    fixture.records.documentSignatures.mockResolvedValue([]);
    fixture.records.versions.mockResolvedValue([{ id: VERSION, documentId: DOC, number: 2 }]);
    fixture.records.files.mockResolvedValue([{ id: FILE_PDF, versionId: VERSION, originalFilename: 'contrat.pdf', mediaType: 'application/pdf' }, { id: FILE_TIFF, versionId: VERSION, originalFilename: 'scan.tif', mediaType: 'image/tiff' }]);
});

it('sans signature, le panneau l’explique et propose les deux actions à qui peut modifier', async () => {
    render(<SignaturesPanel documentId={DOC} canEdit />);
    expect(await screen.findByText('Aucune signature')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Déclarer une signature' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Vérifier les signatures d’un fichier' })).toBeTruthy();
});

it('un lecteur, ou un document détruit, ne peut ni déclarer ni vérifier', async () => {
    const { unmount } = render(<SignaturesPanel documentId={DOC} canEdit={false} />);
    await screen.findByText('Aucune signature');
    expect(screen.queryByRole('button', { name: 'Déclarer une signature' })).toBeNull();
    unmount();
    render(<SignaturesPanel documentId={DOC} canEdit destroyed />);
    await screen.findByText('Aucune signature');
    expect(screen.queryByRole('button', { name: 'Vérifier les signatures d’un fichier' })).toBeNull();
});

it('les signatures se lisent par fichier, avec leur verdict, leurs réserves et leur certificat, sans identifiant', async () => {
    fixture.records.documentSignatures.mockResolvedValue([signature(), signature({ id: 'sig-3', signer: 'Fatoumata Camara', coversWholeFile: false }), declared(), signature({ id: 'sig-4', fileId: FILE_TIFF, fileName: 'scan.tif', status: 'INTEGRITE_INVALIDE' })]);
    render(<SignaturesPanel documentId={DOC} canEdit />);
    const panel = screen.getByRole('region', { name: 'Signatures électroniques' });
    expect(await within(panel).findByText('4 signatures : 2 intactes, 1 sur un contenu modifié, 1 déclarée.')).toBeTruthy();
    expect(within(panel).getByRole('heading', { name: 'contrat.pdf' })).toBeTruthy();
    expect(within(panel).getByRole('heading', { name: 'scan.tif' })).toBeTruthy();
    expect(within(panel).getAllByText('Mamadou Diallo').length).toBeGreaterThan(0);
    expect(within(panel).getByText('Fatoumata Camara')).toBeTruthy();
    expect(within(panel).getAllByText('Le contenu n’a pas été modifié depuis la signature').length).toBe(2);
    expect(within(panel).getAllByText(/La chaîne de confiance du certificat n’est pas évaluée/).length).toBe(2);
    expect(within(panel).getByText(/Des octets ont été ajoutés après cette signature/)).toBeTruthy();
    expect(within(panel).getByText('Le contenu a été modifié depuis la signature')).toBeTruthy();
    expect(within(panel).getByText('Déclarée, non vérifiée')).toBeTruthy();
    expect(within(panel).getByText('Ordonnateur · Ministère des Finances')).toBeTruthy();
    expect(within(panel).getAllByText('Certificat du signataire').length).toBe(3);
    expect(within(panel).getAllByText('Autorité de test').length).toBeGreaterThan(0);
    expect(within(panel).getAllByText('Intégrité vérifiée').length).toBe(2);
    expect(within(panel).getByText('Contenu modifié')).toBeTruthy();
    expect(panel.textContent).not.toContain(FILE_PDF);
    expect(panel.textContent).not.toContain('ab'.repeat(32));                               // l'empreinte se lit en forme courte
});

it('une signature déclarée se retire après confirmation, avec sa version ; une vérifiée ne se retire pas', async () => {
    fixture.records.documentSignatures.mockResolvedValue([signature(), declared()]);
    fixture.records.deleteSignature.mockResolvedValue(undefined);
    render(<SignaturesPanel documentId={DOC} canEdit />);
    await screen.findByText('Directeur général');
    expect(screen.getAllByRole('button', { name: 'Retirer' }).length).toBe(1);               // seulement la déclarée
    fireEvent.click(screen.getByRole('button', { name: 'Retirer' }));
    expect(screen.getByText('Retirer cette signature ?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Garder' }));
    expect(screen.queryByText('Retirer cette signature ?')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retirer' }));
    fixture.records.documentSignatures.mockResolvedValue([signature()]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Retirer' })[0]!);
    await waitFor(() => expect(fixture.records.deleteSignature).toHaveBeenCalledWith(DOC, 'sig-2', 3, expect.any(String)));
    await waitFor(() => expect(screen.queryByText('Directeur général')).toBeNull());
});

it('la déclaration demande le fichier par son nom, refuse un signataire vide, puis s’enregistre', async () => {
    fixture.records.declareSignature.mockResolvedValue(declared());
    render(<SignaturesPanel documentId={DOC} canEdit />);
    await screen.findByText('Aucune signature');
    fireEvent.click(screen.getByRole('button', { name: 'Déclarer une signature' }));
    const dialog = await screen.findByRole('dialog');
    const file = within(dialog).getByLabelText(/^Fichier signé/) as HTMLSelectElement;
    await waitFor(() => expect(within(dialog).getByRole('option', { name: 'contrat.pdf · version 2' })).toBeTruthy());
    expect(within(dialog).getByRole('option', { name: 'scan.tif · version 2' })).toBeTruthy();
    expect(dialog.textContent).not.toContain(FILE_PDF);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(await within(dialog).findByText('Choisissez le fichier que cette signature couvre.')).toBeTruthy();
    expect(within(dialog).getByText('Le nom du signataire est obligatoire.')).toBeTruthy();
    expect(fixture.records.declareSignature).not.toHaveBeenCalled();
    fireEvent.change(file, { target: { value: FILE_PDF } });
    fireEvent.change(within(dialog).getByLabelText(/^Signataire/), { target: { value: 'Directeur général' } });
    fireEvent.change(within(dialog).getByLabelText(/^Qualité/), { target: { value: 'Ordonnateur' } });
    fireEvent.change(within(dialog).getByLabelText(/^Niveau/), { target: { value: 'AVANCEE' } });
    expect(within(dialog).getByText(/Liée au signataire et détectant toute modification/)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText(/^Date de signature/), { target: { value: '2026-09-01' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(fixture.records.declareSignature).toHaveBeenCalledWith(DOC, expect.objectContaining({ fileId: FILE_PDF, format: 'AUTRE', level: 'AVANCEE', signer: 'Directeur général', quality: 'Ordonnateur', signedAt: '2026-09-01T00:00:00.000Z' }), expect.any(String)));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

it('un seul fichier est présélectionné à la déclaration', async () => {
    fixture.records.files.mockResolvedValue([{ id: FILE_PDF, versionId: VERSION, originalFilename: 'contrat.pdf', mediaType: 'application/pdf' }]);
    render(<SignaturesPanel documentId={DOC} canEdit />);
    await screen.findByText('Aucune signature');
    fireEvent.click(screen.getByRole('button', { name: 'Déclarer une signature' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect((within(dialog).getByLabelText(/^Fichier signé/) as HTMLSelectElement).value).toBe(FILE_PDF));
});

it('la vérification ne propose que les PDF, affiche le verdict du serveur et peut être refaite', async () => {
    fixture.records.verifySignatures.mockResolvedValue([signature({ signer: 'Mamadou Diallo' }), signature({ id: 'sig-5', signer: 'Fatoumata Camara', status: 'INTEGRITE_INVALIDE' })]);
    render(<SignaturesPanel documentId={DOC} canEdit />);
    await screen.findByText('Aucune signature');
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier les signatures d’un fichier' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByRole('option', { name: 'contrat.pdf · version 2' })).toBeTruthy());
    expect(within(dialog).queryByRole('option', { name: /scan\.tif/ })).toBeNull();
    const verify = () => within(dialog).getByRole('button', { name: /^Vérifier/ }) as HTMLButtonElement;
    await waitFor(() => expect((within(dialog).getByLabelText(/^Fichier signé/) as HTMLSelectElement).value).toBe(FILE_PDF));      // un seul PDF : présélectionné
    fixture.records.documentSignatures.mockResolvedValue([signature()]);
    fireEvent.click(verify());
    await waitFor(() => expect(fixture.records.verifySignatures).toHaveBeenCalledWith(DOC, FILE_PDF, expect.any(String)));
    expect(await within(dialog).findByText('2 signatures : 1 intacte, 1 sur un contenu modifié.')).toBeTruthy();
    expect(within(dialog).getByText('Fatoumata Camara')).toBeTruthy();
    expect(verify().textContent).toBe('Vérifier de nouveau');
    fireEvent.click(verify());
    await waitFor(() => expect(fixture.records.verifySignatures).toHaveBeenCalledTimes(2));
    const keys = fixture.records.verifySignatures.mock.calls.map(c => c[2]);
    expect(keys[0]).not.toBe(keys[1]);                                                      // une nouvelle vérification est une nouvelle intention
});

it('un PDF sans signature, un fichier non validé et l’absence de PDF sont dits clairement', async () => {
    fixture.records.verifySignatures.mockResolvedValueOnce([]);
    render(<SignaturesPanel documentId={DOC} canEdit />);
    await screen.findByText('Aucune signature');
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier les signatures d’un fichier' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect((within(dialog).getByLabelText(/^Fichier signé/) as HTMLSelectElement).value).toBe(FILE_PDF));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Vérifier' }));
    expect(await within(dialog).findByText('Ce fichier ne porte aucune signature électronique.')).toBeTruthy();
    const { ApiError } = await import('../../src/core/http');
    fixture.records.verifySignatures.mockRejectedValueOnce(new ApiError(409, 'FILE_NOT_VALIDATED', 'Le fichier doit être validé avant téléchargement.'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Vérifier de nouveau' }));
    expect(await within(dialog).findByText(/Le fichier doit être validé/)).toBeTruthy();
});

it('sans PDF, la vérification renvoie vers la déclaration', async () => {
    fixture.records.files.mockResolvedValue([{ id: FILE_TIFF, versionId: VERSION, originalFilename: 'scan.tif', mediaType: 'image/tiff' }]);
    render(<SignaturesPanel documentId={DOC} canEdit />);
    await screen.findByText('Aucune signature');
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier les signatures d’un fichier' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/aucun fichier à signature vérifiable/)).toBeTruthy();
    expect((within(dialog).getByRole('button', { name: 'Vérifier' }) as HTMLButtonElement).disabled).toBe(true);
});
