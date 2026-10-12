import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/core/http';
import type { ActSeal } from '../../src/core/actSeals';

const ID = '12345678-1234-4234-8234-123456789012';
const fixture = vi.hoisted(() => ({
    epoch: 1, demo: false,
    retention: { actSeal: vi.fn(), sealAct: vi.fn(), actSealContent: vi.fn(), actSealSignature: vi.fn() } as Record<string, ReturnType<typeof vi.fn>>
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
import { ActSealPanel } from '../../src/ui/ActSeal';

const seal = (over: Partial<ActSeal> = {}): ActSeal => ({
    actType: 'ACCUSE_TRANSFERT', objectId: ID, reference: 'ART-2026-000001', status: 'SEALED', signingEnabled: true, sealedAt: '2026-10-10T20:00:00Z', signer: 'CN=Sceau SNAE-PPD,O=Autorité de test,C=GN',
    algorithm: 'SHA256withRSA', certificateFingerprint: 'ab'.repeat(32), contentFingerprint: 'cd'.repeat(32), content: 'SNAE-PPD-ACT/1\nacte: ACCUSE_TRANSFERT\n',
    verification: { integrity: 'INTEGRITE_VALIDE', message: 'ok', chain: 'NON_EVALUEE', chainMessage: 'Aucune ancre de confiance n’est déclarée.', chainAnchor: null, matchesCurrentFacts: true }, ...over
});

beforeEach(() => {
    fixture.epoch += 1;
    fixture.demo = false;
    for (const fn of Object.values(fixture.retention)) fn.mockReset();
    fixture.retention.actSeal.mockResolvedValue(seal());
});

it('un acte scellé montre sa signature, son empreinte courte et la vérification hors du système', async () => {
    render(<ActSealPanel type="ACCUSE_TRANSFERT" id={ID} />);
    const panel = await screen.findByRole('region', { name: /Sceau du accusé de réception du transfert/ });
    expect(await within(panel).findByText(/Acte scellé : la signature est valide/)).toBeTruthy();
    expect(within(panel).getByText('Valide')).toBeTruthy();
    expect(within(panel).getByText(/Chaîne non évaluée/)).toBeTruthy();
    expect(panel.textContent).not.toContain('ab'.repeat(32));
    expect(panel.textContent).toContain('abababab…abababab');
    fireEvent.click(within(panel).getByText('Vérifier hors du système'));
    expect(within(panel).getByText(/openssl cms -verify -inform DER -in acte-ART-2026-000001\.txt\.p7s/)).toBeTruthy();
});

it('un acte modifié depuis son sceau le dit, la signature restant valide', async () => {
    fixture.retention.actSeal.mockResolvedValue(seal({ verification: { integrity: 'INTEGRITE_VALIDE', message: 'ok', chain: 'VALIDE', chainMessage: null, chainAnchor: 'CN=Autorité racine', matchesCurrentFacts: false } }));
    render(<ActSealPanel type="ACCUSE_TRANSFERT" id={ID} />);
    expect(await screen.findByText(/ne sont plus ceux qui ont été scellés/)).toBeTruthy();
    expect(screen.getByText(/Certificat reconnu — CN=Autorité racine/)).toBeTruthy();
});

it('télécharge le contenu signé et la signature détachée', async () => {
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:seal');
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
    fixture.retention.actSealContent.mockResolvedValue(new Blob(['x'], { type: 'text/plain' }));
    fixture.retention.actSealSignature.mockResolvedValue(new Blob(['y'], { type: 'application/pkcs7-signature' }));
    render(<ActSealPanel type="ACCUSE_TRANSFERT" id={ID} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Télécharger le contenu signé' }));
    await waitFor(() => expect(fixture.retention.actSealContent).toHaveBeenCalledWith('ACCUSE_TRANSFERT', ID));
    fireEvent.click(screen.getByRole('button', { name: 'Télécharger la signature (.p7s)' }));
    await waitFor(() => expect(fixture.retention.actSealSignature).toHaveBeenCalledWith('ACCUSE_TRANSFERT', ID));
});

it('un acte non scellé avec un scellement actif se scelle à la demande, sinon on dit pourquoi', async () => {
    fixture.retention.actSeal.mockResolvedValueOnce(seal({ status: 'UNSEALED', sealedAt: null, signer: null, verification: null, content: null }));
    fixture.retention.actSeal.mockResolvedValue(seal());
    fixture.retention.sealAct.mockResolvedValue(seal());
    const first = render(<ActSealPanel type="ACCUSE_TRANSFERT" id={ID} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sceller maintenant' }));
    await waitFor(() => expect(fixture.retention.sealAct).toHaveBeenCalledWith('ACCUSE_TRANSFERT', ID, expect.any(String)));
    expect(await screen.findByText(/Acte scellé/)).toBeTruthy();
    first.unmount();
    fixture.retention.actSeal.mockResolvedValue(seal({ status: 'UNSEALED', signingEnabled: false, sealedAt: null, signer: null, verification: null, content: null }));
    render(<ActSealPanel type="CERTIFICAT_DESTRUCTION" id={ID} />);
    expect(await screen.findByText(/Le scellement des actes n’est pas activé/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sceller maintenant' })).toBeNull();
});

it('rien ne s’affiche en démonstration, ni quand le serveur ne connaît pas l’acte', async () => {
    fixture.demo = true;
    const demo = render(<ActSealPanel type="ACCUSE_TRANSFERT" id={ID} />);
    expect(demo.container.textContent).toBe('');
    demo.unmount();
    fixture.demo = false;
    fixture.retention.actSeal.mockRejectedValue(new ApiError(404, 'ACT_NOT_FOUND', 'Acte introuvable.'));
    const missing = render(<ActSealPanel type="ACCUSE_TRANSFERT" id={ID} />);
    await waitFor(() => expect(fixture.retention.actSeal).toHaveBeenCalled());
    await waitFor(() => expect(missing.container.textContent).toBe(''));
});
