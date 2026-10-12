import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/core/http';
import type { AdminPlan, AdminReader, AdminSubscription, PortalPayment, PortalReceipt } from '../../src/core/types';
const fixture = vi.hoisted(() => ({
    epoch: 1, me: null as unknown, allowed: new Set<string>(),
    portalAdmin: { plans: vi.fn(), readers: vi.fn(), subscriptions: vi.fn(), subscription: vi.fn(), subscriptionByReference: vi.fn(), payments: vi.fn(), receipt: vi.fn(), command: vi.fn(), mailStatus: vi.fn() },
    heritage: { references: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
vi.mock('../../src/ui/printHtml', () => ({ printHtml: vi.fn() }));
import { printHtml } from '../../src/ui/printHtml';
import { PortalAdminPage } from '../../src/pages/PortalAdmin';

const flat = (text: string | null) => (text ?? '').replace(/[  ]/g, ' ');
const page = <T,>(items: T[]) => ({ items, page: 0, size: 20, total: items.length, hasMore: false });
const reader = (extra: Partial<AdminSubscription['lecteur']> = {}) => ({ id: 'r1', numero: 'LEC-000001', nom: 'Awa Camara', email: 'awa@exemple.gn', categorie: null, suspendu: false, emailVerifie: true, ...extra });
const payment = (extra: Partial<PortalPayment> = {}): PortalPayment => ({ id: 'pay1', numero: 'REC-2026-000001', abonnementId: 's1', abonnementNumero: 'ABO-2026-000001', lecteurNumero: 'LEC-000001', lecteurNom: 'Awa Camara', formuleLibelle: 'Abonnement annuel',
    montant: 150000, devise: 'GNF', mode: 'ESPECES', referenceExterne: null, note: null, recuPar: 'Mamadou Bah', recuParId: 'u1', recuLe: '2026-10-05T09:00:00Z', statut: 'ENREGISTRE', annulePar: null, annuleLe: null, annuleMotif: null, peutAnnuler: false, ...extra });
const sub = (extra: Partial<AdminSubscription> = {}): AdminSubscription => ({ id: 's1', numero: 'ABO-2026-000001', lecteur: reader(), formuleCode: 'ANNUEL', formuleLibelle: 'Abonnement annuel', dureeMois: 12, montant: 150000, devise: 'GNF',
    referencePaiement: 'PAY-ABCDEFGH', statut: 'EN_ATTENTE_PAIEMENT', etat: 'EN_ATTENTE_PAIEMENT', demandeLe: '2026-10-01T09:00:00Z', debutLe: null, finLe: null, modeActivation: null, exonerationMotif: null, paiement: null, annuleLe: null, annuleMotif: null,
    peutEncaisser: true, peutExonerer: false, peutAnnuler: true, ...extra });
const plan = (extra: Partial<AdminPlan> = {}): AdminPlan => ({ id: 'p1', code: 'ANNUEL', libelle: 'Abonnement annuel', description: null, dureeMois: 12, montant: 150000, devise: 'GNF', telechargement: false, categorie: null, actif: true, ordre: 100, version: 3, abonnementsEnCours: 2, ...extra });
const adminReader = (extra: Partial<AdminReader> = {}): AdminReader => ({ id: 'r1', numero: 'LEC-000001', email: 'awa@exemple.gn', prenom: 'Awa', nom: 'Camara', organisme: null, categorie: null, suspendu: false, motifSuspension: null, emailVerifie: true,
    creeLe: '2026-10-01T09:00:00Z', derniereConnexionLe: '2026-10-04T09:00:00Z', abonnementEtat: 'EN_COURS', abonnementFinLe: '2027-10-05T09:00:00Z', pagesLuesHeure: 0, ...extra });
const receipt = (): PortalReceipt => ({ paiement: payment(), lecteurEmail: 'awa@exemple.gn', formuleCode: 'ANNUEL', dureeMois: 12, debutLe: '2026-10-05T09:00:00Z', finLe: '2027-10-05T09:00:00Z' });

beforeEach(() => {
    fixture.allowed = new Set(['PORTAL_CASHIER']);
    for (const fn of [...Object.values(fixture.portalAdmin), ...Object.values(fixture.heritage)]) fn.mockReset();
    vi.mocked(printHtml).mockReset();
    fixture.portalAdmin.payments.mockResolvedValue(page([]));
    fixture.portalAdmin.subscriptions.mockResolvedValue(page([]));
    fixture.portalAdmin.readers.mockResolvedValue(page([]));
    fixture.portalAdmin.plans.mockResolvedValue([]);
    fixture.portalAdmin.subscription.mockResolvedValue(sub());
    fixture.portalAdmin.command.mockResolvedValue({});
    fixture.portalAdmin.mailStatus.mockResolvedValue({ enabled: false, configured: false, security: null, pending: 0, sent: 0, failed: 0, oldestPendingAt: null, lastSentAt: null,
        lastCycleFinishedAt: null, lastCycleCode: null, pausedUntil: null, failures: [] });
    fixture.heritage.references.mockResolvedValue([{ domaine: 'CATEGORIE_LECTEUR', code: 'CHERCHEUR', libelle: 'Chercheur', description: null, ordre: 10, actif: true }]);
});

const top = () => { const all = screen.getAllByRole('dialog'); return all[all.length - 1]!; };
const tabNames = () => screen.getAllByRole('tab').map(t => t.textContent);

it('chaque personne ne voit que les sections que ses droits ouvrent', async () => {
    const view = render(<PortalAdminPage />);
    expect(tabNames()).toEqual(['Caisse', 'Abonnements', 'Lecteurs']);
    view.unmount();
    fixture.allowed = new Set(['PORTAL_PLAN_MANAGE']);
    const second = render(<PortalAdminPage />);
    expect(tabNames()).toEqual(['Formules']);
    second.unmount();
    fixture.allowed = new Set(['PORTAL_READER_MANAGE']);
    render(<PortalAdminPage />);
    expect(tabNames()).toEqual(['Lecteurs']);
});

it('la caisse refuse une référence mal écrite sans interroger le serveur, et retrouve l’abonnement par sa référence', async () => {
    fixture.portalAdmin.subscriptionByReference.mockResolvedValue(sub());
    render(<PortalAdminPage />);
    const input = await screen.findByLabelText('Référence de paiement');
    fireEvent.change(input, { target: { value: 'pay-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Retrouver' }));
    expect(await screen.findByText(/PAY- suivi de huit lettres ou chiffres/)).toBeTruthy();
    expect(fixture.portalAdmin.subscriptionByReference).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: ' pay-abcdefgh ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Retrouver' }));
    await waitFor(() => expect(fixture.portalAdmin.subscriptionByReference).toHaveBeenCalledWith('PAY-ABCDEFGH'));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Abonnement ABO-2026-000001', { selector: 'h2' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Enregistrer le paiement' })).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Accorder par exonération' })).toBeNull();
});

it('une référence inconnue montre le message du serveur', async () => {
    fixture.portalAdmin.subscriptionByReference.mockRejectedValue(new ApiError(404, 'PORTAL_REFERENCE_UNKNOWN', 'Aucun abonnement ne porte cette référence.'));
    render(<PortalAdminPage />);
    fireEvent.change(await screen.findByLabelText('Référence de paiement'), { target: { value: 'PAY-ZZZZZZZZ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Retrouver' }));
    expect(await screen.findByText('Aucun abonnement ne porte cette référence.')).toBeTruthy();
});

const openPayment = async () => {
    fixture.portalAdmin.subscriptionByReference.mockResolvedValue(sub());
    render(<PortalAdminPage />);
    fireEvent.change(await screen.findByLabelText('Référence de paiement'), { target: { value: 'PAY-ABCDEFGH' } });
    fireEvent.click(screen.getByRole('button', { name: 'Retrouver' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Enregistrer le paiement' }));
    await waitFor(() => expect(screen.getAllByRole('dialog').length).toBe(2));
    return top();
};

it('l’encaissement part pour le montant exact, en espèces par défaut, et refuse un autre montant', async () => {
    const dialog = await openPayment();
    expect(within(dialog).getByText('Enregistrer un paiement', { selector: 'h2' })).toBeTruthy();
    expect((within(dialog).getByLabelText(/Montant encaissé/) as HTMLInputElement).value).toBe('150000');
    fireEvent.change(within(dialog).getByLabelText(/Montant encaissé/), { target: { value: '100000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer le paiement' }));
    expect(await within(dialog).findByText(/exactement celui de la formule demandée/)).toBeTruthy();
    expect(fixture.portalAdmin.command).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText(/Montant encaissé/), { target: { value: '150 000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer le paiement' }));
    await waitFor(() => expect(fixture.portalAdmin.command).toHaveBeenCalledTimes(1));
    const [path, body, key, method] = fixture.portalAdmin.command.mock.calls[0]!;
    expect(path).toBe('/payments'); expect(method).toBe('POST'); expect(typeof key).toBe('string');
    expect(body).toEqual({ abonnementId: 's1', mode: 'ESPECES', montant: 150000, devise: 'GNF' });
});

it('hors espèces la pièce est obligatoire, et un échec incertain rejoue la même intention avec la même clé', async () => {
    const dialog = await openPayment();
    fireEvent.change(within(dialog).getByLabelText('Mode d’encaissement'), { target: { value: 'VIREMENT' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer le paiement' }));
    expect(await within(dialog).findByText(/Hors espèces, indiquez la pièce/)).toBeTruthy();
    expect(fixture.portalAdmin.command).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText(/Pièce de l’encaissement/), { target: { value: 'VIR-2026-1042' } });
    fixture.portalAdmin.command.mockRejectedValueOnce(new ApiError(0, 'NETWORK_UNCERTAIN', 'La réponse n’est pas confirmée.', null, {}, true));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer le paiement' }));
    expect(await within(dialog).findByText('La réponse n’est pas confirmée.')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer le paiement' }));
    await waitFor(() => expect(fixture.portalAdmin.command).toHaveBeenCalledTimes(2));
    const [first, second] = fixture.portalAdmin.command.mock.calls;
    expect(first![1]).toEqual({ abonnementId: 's1', mode: 'VIREMENT', montant: 150000, devise: 'GNF', referenceExterne: 'VIR-2026-1042' });
    expect(second![1]).toEqual(first![1]);
    expect(second![2]).toBe(first![2]);
});

it('une exonération se motive par écrit avant d’être envoyée, et seul le superviseur la voit proposée', async () => {
    fixture.allowed = new Set(['PORTAL_SUPERVISE']);
    fixture.portalAdmin.subscriptionByReference.mockResolvedValue(sub({ peutEncaisser: false, peutExonerer: true }));
    fixture.portalAdmin.subscription.mockResolvedValue(sub({ peutEncaisser: false, peutExonerer: true }));
    render(<PortalAdminPage />);
    fireEvent.change(await screen.findByLabelText('Référence de paiement'), { target: { value: 'PAY-ABCDEFGH' } });
    fireEvent.click(screen.getByRole('button', { name: 'Retrouver' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByRole('button', { name: 'Accorder par exonération' })).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Enregistrer le paiement' })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Accorder par exonération' }));
    await waitFor(() => expect(screen.getAllByRole('dialog').length).toBe(2));
    const motif = top();
    fireEvent.change(within(motif).getByLabelText(/^Motif de l’exonération/), { target: { value: 'court' } });
    fireEvent.click(within(motif).getByRole('button', { name: 'Accorder' }));
    expect(await within(motif).findByText(/au moins 10 caractères/)).toBeTruthy();
    expect(fixture.portalAdmin.command).not.toHaveBeenCalled();
    fireEvent.change(within(motif).getByLabelText(/^Motif de l’exonération/), { target: { value: 'Convention signée avec l’université de Kankan' } });
    fireEvent.click(within(motif).getByRole('button', { name: 'Accorder' }));
    await waitFor(() => expect(fixture.portalAdmin.command).toHaveBeenCalledTimes(1));
    expect(fixture.portalAdmin.command.mock.calls[0]!.slice(0, 2)).toEqual(['/subscriptions/s1/exempt', { motif: 'Convention signée avec l’université de Kankan' }]);
});

it('la liste des paiements propose le reçu, et l’annulation seulement quand le serveur l’autorise', async () => {
    fixture.allowed = new Set(['PORTAL_SUPERVISE']);
    fixture.portalAdmin.payments.mockResolvedValue(page([payment({ peutAnnuler: true }), payment({ id: 'pay2', numero: 'REC-2026-000002', peutAnnuler: false, statut: 'ANNULE', annuleMotif: 'Erreur de lecteur' })]));
    fixture.portalAdmin.receipt.mockResolvedValue(receipt());
    render(<PortalAdminPage />);
    expect(await screen.findByText('REC-2026-000001')).toBeTruthy();
    expect(screen.getByText('Erreur de lecteur')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Annuler' })).toHaveLength(1);
    fireEvent.click(screen.getAllByRole('button', { name: 'Reçu' })[0]!);
    await waitFor(() => expect(printHtml).toHaveBeenCalledTimes(1));
    expect(fixture.portalAdmin.receipt).toHaveBeenCalledWith('pay1');
    expect(vi.mocked(printHtml).mock.calls[0]![0]).toContain('REC-2026-000001');
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/^Motif de l’annulation/), { target: { value: 'Paiement saisi sur le mauvais lecteur' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Annuler le paiement' }));
    await waitFor(() => expect(fixture.portalAdmin.command).toHaveBeenCalledTimes(1));
    expect(fixture.portalAdmin.command.mock.calls[0]!.slice(0, 2)).toEqual(['/payments/pay1/cancel', { motif: 'Paiement saisi sur le mauvais lecteur' }]);
});

it('les filtres de la caisse partent au serveur', async () => {
    render(<PortalAdminPage />);
    await screen.findByText('Aucun paiement');
    fireEvent.change(screen.getByLabelText('Mode'), { target: { value: 'VIREMENT' } });
    await waitFor(() => expect(fixture.portalAdmin.payments).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'VIREMENT', statut: '', mine: '' }), expect.anything()));
    fireEvent.click(screen.getByLabelText('Mes encaissements'));
    await waitFor(() => expect(fixture.portalAdmin.payments).toHaveBeenLastCalledWith(expect.objectContaining({ mine: 'true' }), expect.anything()));
});

it('les abonnements en attente de paiement s’affichent d’abord et s’ouvrent en fiche', async () => {
    fixture.portalAdmin.subscriptions.mockResolvedValue(page([sub()]));
    render(<PortalAdminPage />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Abonnements' }));
    expect(await screen.findByText('ABO-2026-000001')).toBeTruthy();
    expect(fixture.portalAdmin.subscriptions).toHaveBeenCalledWith(expect.objectContaining({ etat: 'EN_ATTENTE_PAIEMENT' }), expect.anything());
    expect(flat(screen.getByText(/150 000/).textContent)).toMatch(/150 000\s?GNF/);
    fireEvent.click(screen.getByRole('button', { name: 'ABO-2026-000001' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(await screen.findByText('Aucune action', { exact: false }).catch(() => null)).toBeNull();
});

it('un lecteur se suspend avec un motif écrit, se rétablit, et son adresse se confirme à la main', async () => {
    fixture.allowed = new Set(['PORTAL_READER_MANAGE']);
    fixture.portalAdmin.readers.mockResolvedValue(page([adminReader(), adminReader({ id: 'r2', numero: 'LEC-000002', nom: 'Moussa', prenom: 'Aly', email: 'aly@exemple.gn', suspendu: true, motifSuspension: 'Abus constaté', emailVerifie: false })]));
    render(<PortalAdminPage />);
    expect(await screen.findByText('LEC-000001 · awa@exemple.gn')).toBeTruthy();
    expect(screen.getByText('Abus constaté')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’adresse' }));
    await waitFor(() => expect(fixture.portalAdmin.command).toHaveBeenCalledWith('/readers/r2/verify-email', {}, expect.any(String), 'POST'));
    fireEvent.click(await screen.findByRole('button', { name: 'Rétablir' }));
    await waitFor(() => expect(fixture.portalAdmin.command).toHaveBeenCalledWith('/readers/r2/reinstate', {}, expect.any(String), 'POST'));
    fireEvent.click(await screen.findByRole('button', { name: 'Suspendre' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/^Motif de la suspension/), { target: { value: 'Partage du compte constaté' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Suspendre' }));
    await waitFor(() => expect(fixture.portalAdmin.command).toHaveBeenCalledWith('/readers/r1/suspend', { motif: 'Partage du compte constaté' }, expect.any(String), 'POST'));
});

it('sans formule, la page n’invente aucun tarif et guide la personne habilitée', async () => {
    fixture.allowed = new Set(['PORTAL_PLAN_MANAGE']);
    render(<PortalAdminPage />);
    expect(await screen.findByText('Aucune formule')).toBeTruthy();
    expect(screen.getByText(/tarif et la durée décidés par l’institution/)).toBeTruthy();
    expect(screen.queryByText(/GNF/)).toBeNull();
});

it('une formule se crée avec son code, sa durée, son montant et sa devise, et refuse un montant mal écrit', async () => {
    fixture.allowed = new Set(['PORTAL_PLAN_MANAGE']);
    render(<PortalAdminPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Nouvelle formule' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(fixture.heritage.references).toHaveBeenCalledWith('CATEGORIE_LECTEUR', expect.anything()));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer la formule' }));
    expect(await within(dialog).findByText(/Le libellé est obligatoire/)).toBeTruthy();
    expect(fixture.portalAdmin.command).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText(/^Code/), { target: { value: 'annuel' } });
    fireEvent.change(within(dialog).getByLabelText(/^Libellé/), { target: { value: 'Abonnement annuel' } });
    fireEvent.change(within(dialog).getByLabelText(/^Montant/), { target: { value: '150,555' } });
    fireEvent.change(within(dialog).getByLabelText(/^Devise/), { target: { value: 'gnf' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer la formule' }));
    expect(await within(dialog).findByText(/deux décimales au plus/)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText(/^Montant/), { target: { value: '150000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer la formule' }));
    await waitFor(() => expect(fixture.portalAdmin.command).toHaveBeenCalledTimes(1));
    const [path, body, , method] = fixture.portalAdmin.command.mock.calls[0]!;
    expect(path).toBe('/plans'); expect(method).toBe('POST');
    expect(body).toEqual({ libelle: 'Abonnement annuel', dureeMois: 12, montant: 150000, devise: 'GNF', telechargement: false, ordre: 100, code: 'ANNUEL' });
});

it('une formule existante se modifie avec sa version, sans changer son code, et l’on peut la retirer du public', async () => {
    fixture.allowed = new Set(['PORTAL_PLAN_MANAGE']);
    fixture.portalAdmin.plans.mockResolvedValue([plan()]);
    render(<PortalAdminPage />);
    expect(await screen.findByText('Abonnement annuel')).toBeTruthy();
    expect(flat(screen.getByText(/150 000/).textContent)).toMatch(/150 000\s?GNF/);
    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByLabelText(/^Code/)).toBeNull();
    expect(within(dialog).getByText(/gardent les conditions de leur demande/)).toBeTruthy();
    fireEvent.click(within(dialog).getByLabelText('Formule proposée au public'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(fixture.portalAdmin.command).toHaveBeenCalledTimes(1));
    const [path, body, , method] = fixture.portalAdmin.command.mock.calls[0]!;
    expect(path).toBe('/plans/p1'); expect(method).toBe('PUT');
    expect(body).toMatchObject({ libelle: 'Abonnement annuel', dureeMois: 12, montant: 150000, devise: 'GNF', expectedVersion: 3, actif: false });
    expect(body).not.toHaveProperty('code');
});

it('sans le droit de gérer les formules, aucune création ni modification n’est proposée', async () => {
    fixture.allowed = new Set(['PORTAL_READ']);
    fixture.portalAdmin.plans.mockResolvedValue([plan()]);
    render(<PortalAdminPage />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Formules' }));
    expect(await screen.findByText('Abonnement annuel')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Nouvelle formule' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Modifier' })).toBeNull();
});
