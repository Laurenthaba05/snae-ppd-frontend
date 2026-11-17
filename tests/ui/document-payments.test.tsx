import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { DocumentPaymentPanel } from '../../src/portal/DocumentPaymentPanel';
import { DocumentPaymentsApi, testCheckoutUrl, type DocumentPayment } from '../../src/api/documentPayments';
import type { PublicDocumentsApi } from '../../src/api/publicDocuments';
const DOC = '11111111-1111-4111-8111-111111111111';
const ORDER = '22222222-2222-4222-8222-222222222222';
vi.mock('../../src/portal/context', () => ({ usePortal: () => ({ expired: vi.fn() }) }));
const pending: DocumentPayment = { id: ORDER, documentId: DOC, provider: 'ORANGE_MONEY', amountGnf: 1000, currency: 'GNF', durationDays: 30,
    status: 'EN_ATTENTE', mode: 'LOCAL_TEST', checkoutUrl: 'http://127.0.0.1:8097/checkout/' + ORDER + '?token=test', verifiedAt: null, validUntil: null, downloadAllowed: false };
beforeEach(() => history.replaceState(null, '', '/portail/documents/' + DOC + '?status=SUCCESS'));
function setup(reader = true, latest: DocumentPayment | null = null) {
    const client = { offer: vi.fn().mockResolvedValue({ mode: 'LOCAL_TEST', tariff: { typeLabel: 'Rapport de recette', amountGnf: 1000, durationDays: 30 }, currency: 'GNF',
        providers: [{ code: 'ORANGE_MONEY', label: 'Orange Money', available: true }, { code: 'PAYCARD', label: 'PayCard', available: true }] }) };
    const payments = { latest: vi.fn().mockResolvedValue({ payment: latest }), start: vi.fn().mockResolvedValue(pending), refresh: vi.fn().mockResolvedValue(pending) };
    const confirmed = vi.fn();
    render(<DocumentPaymentPanel client={client as unknown as PublicDocumentsApi} id={DOC} reader={reader} payments={payments as unknown as DocumentPaymentsApi} onConfirmed={confirmed} />);
    return { client, payments, confirmed };
}
it('un succès dans l’URL ou un paiement en attente ne déverrouille rien; seul le serveur confirme', async () => {
    const { payments, confirmed } = setup();
    const button = await screen.findByRole('button', { name: 'Payer avec Orange Money' });
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false)); fireEvent.click(button);
    await screen.findByText('En attente de confirmation');
    expect(confirmed).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Ouvrir le simulateur de paiement' }).getAttribute('rel')).toContain('noreferrer');
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier la confirmation du paiement' }));
    await waitFor(() => expect(payments.refresh).toHaveBeenCalledTimes(1)); expect(confirmed).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Vérifier la confirmation du paiement' }).hasAttribute('disabled')).toBe(false));
    payments.refresh.mockResolvedValue({ ...pending, status: 'CONFIRME', verifiedAt: '2026-11-09T12:00:00Z', validUntil: '2099-12-09T12:00:00Z' });
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier la confirmation du paiement' }));
    await waitFor(() => expect(confirmed).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('link', { name: /Télécharger/ })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Ouvrir le simulateur de paiement' })).toBeNull();
});
it('un visiteur doit se connecter avant de payer même si le prestataire est disponible', async () => {
    const { payments } = setup(false);
    expect((await screen.findByRole('button', { name: 'Payer avec PayCard' })).hasAttribute('disabled')).toBe(true);
    expect(payments.latest).not.toHaveBeenCalled(); expect(payments.start).not.toHaveBeenCalled();
});
it('une commande en attente est reprise après rechargement sans nouveau paiement', async () => {
    const { payments, confirmed } = setup(true, pending);
    await screen.findByText('En attente de confirmation');
    expect(screen.getByRole('button', { name: 'Payer avec PayCard' }).hasAttribute('disabled')).toBe(true);
    expect(payments.start).not.toHaveBeenCalled(); expect(confirmed).not.toHaveBeenCalled();
});
it('une panne garde la clé d’idempotence pour la reprise et n’ouvre aucun droit', async () => {
    const { payments, confirmed } = setup(); payments.start.mockRejectedValueOnce(new Error('Prestataire indisponible'));
    const button = await screen.findByRole('button', { name: 'Payer avec Orange Money' });
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false)); fireEvent.click(button);
    await screen.findByText('Prestataire indisponible'); fireEvent.click(button);
    await screen.findByText('En attente de confirmation');
    expect(payments.start.mock.calls[0]).toEqual(payments.start.mock.calls[1]); expect(confirmed).not.toHaveBeenCalled();
});
it.each(['ANNULE', 'REMBOURSE'] as const)('le statut %s ne déverrouille pas la lecture', async status => {
    const { payments, confirmed } = setup(true, pending);
    payments.refresh.mockResolvedValue({ ...pending, status });
    fireEvent.click(await screen.findByRole('button', { name: 'Vérifier la confirmation du paiement' }));
    await waitFor(() => expect(payments.refresh).toHaveBeenCalledTimes(1));
    expect(confirmed).not.toHaveBeenCalled();
});
it('le client transmet seulement le fournisseur et la clé, avec cookie lecteur et garde CSRF', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(pending), { status: 200 }));
    const api = new DocumentPaymentsApi(fetcher); await api.start(DOC, 'PAYCARD', ORDER);
    const init = fetcher.mock.calls[0][1];
    expect(init.credentials).toBe('same-origin'); expect(init.headers['X-Requested-With']).toBe('snae-portail'); expect(init.headers.Authorization).toBeUndefined();
    expect(JSON.parse(init.body)).toEqual({ provider: 'PAYCARD', idempotencyKey: ORDER });
    expect(init.cache).toBe('no-store'); expect(init.redirect).toBe('error');
});
it('les URL de paiement externes ou contenant des identifiants sont refusées dans le mode local', () => {
    expect(testCheckoutUrl(pending)).toBe(pending.checkoutUrl);
    for (const checkoutUrl of ['javascript:alert(1)', 'https://evil.example/checkout/test', 'http://secret@127.0.0.1:8097/checkout/test', 'http://127.0.0.1:8097/elsewhere'])
        expect(testCheckoutUrl({ ...pending, checkoutUrl })).toBeNull();
});

it('un ancien paiement confirmé mais expiré permet un nouvel achat et sa vérification ne renouvelle rien', async () => {
    const old = { ...pending, status: 'CONFIRME' as const, validUntil: '2020-01-01T00:00:00Z', verifiedAt: '2019-12-01T00:00:00Z', checkoutUrl: null };
    const { payments, confirmed } = setup(true, old);
    payments.refresh.mockResolvedValue(old);
    const pay = await screen.findByRole('button', { name: 'Payer avec Orange Money' });
    await waitFor(() => expect(pay.hasAttribute('disabled')).toBe(false));
    await screen.findByText('Ancien paiement confirmé — accès expiré');
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier la confirmation du paiement' }));
    await waitFor(() => expect(payments.refresh).toHaveBeenCalledWith(ORDER));
    await waitFor(() => expect(pay.hasAttribute('disabled')).toBe(false));
    expect(confirmed).not.toHaveBeenCalled();
    fireEvent.click(pay);await screen.findByText('En attente de confirmation');
    expect(payments.start).toHaveBeenCalledWith(DOC, 'ORANGE_MONEY', expect.any(String));
    expect(confirmed).not.toHaveBeenCalled();
});
it('après un refus la nouvelle tentative change de clé et un accès encore valide ne se repaie pas', async () => {
    const { payments, confirmed } = setup(true, pending);
    payments.refresh.mockResolvedValue({ ...pending, status: 'ANNULE' });
    fireEvent.click(await screen.findByRole('button', { name: 'Vérifier la confirmation du paiement' }));
    await screen.findByText('Paiement refusé ou annulé');
    fireEvent.click(screen.getByRole('button', { name: 'Payer avec Orange Money' }));
    await screen.findByText('En attente de confirmation');
    const firstKey = payments.start.mock.calls[0][2];
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier la confirmation du paiement' }));
    await screen.findByText('Paiement refusé ou annulé');
    fireEvent.click(screen.getByRole('button', { name: 'Payer avec Orange Money' }));
    await screen.findByText('En attente de confirmation');
    expect(payments.start.mock.calls[1][2]).not.toBe(firstKey);
    payments.refresh.mockResolvedValue({ ...pending, status: 'CONFIRME', validUntil: '2099-12-09T12:00:00Z' });
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier la confirmation du paiement' }));
    await waitFor(() => expect(confirmed).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Payer avec PayCard' }).hasAttribute('disabled')).toBe(true);
});
it('une confirmation reçue lors de la reprise de création relit aussi le droit serveur', async () => {
    const { payments, confirmed } = setup();
    payments.start.mockResolvedValue({ ...pending, status: 'CONFIRME', validUntil: '2099-12-09T12:00:00Z' });
    const button = await screen.findByRole('button', { name: 'Payer avec PayCard' });
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));fireEvent.click(button);
    await waitFor(() => expect(confirmed).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('link', { name: 'Ouvrir le simulateur de paiement' })).toBeNull();
});
