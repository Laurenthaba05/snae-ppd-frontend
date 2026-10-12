import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/core/http';
import type { AccessJournalEntry, AccessRequestRow, AdminAccessRequest } from '../../src/core/types';
const fixture = vi.hoisted(() => ({
    epoch: 1, me: null as unknown, allowed: new Set<string>(),
    portalAdmin: { accessRequests: vi.fn(), accessRequest: vi.fn(), accessRequestJournal: vi.fn(), command: vi.fn() },
    consultation: { requestsByInstitution: vi.fn(), myRequests: vi.fn() },
    records: { documents: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: { institutionId: 'inst1', departmentId: null } }) }));
import { ConsultationsPage } from '../../src/pages/Consultations';

const page = <T,>(items: T[]) => ({ items, page: 0, size: 20, total: items.length, hasMore: false });
const reader = { id: 'r1', numero: 'LEC-000001', nom: 'Awa Camara', email: 'awa@exemple.gn', categorie: null, suspendu: false, emailVerifie: true };
const row = (extra: Partial<AccessRequestRow> = {}): AccessRequestRow => ({ id: 'q1', numero: 'ACC-2026-000001', lecteurNumero: 'LEC-000001', lecteurNom: 'Awa Camara', documentTitre: 'Registre sous réserve', noticeIntitule: 'Registre des naissances de Kankan',
    statut: 'DEPOSEE', etat: 'DEPOSEE', deposeLe: '2026-10-05T09:00:00Z', accordeJusquAu: null, instructeur: null, ...extra });
const detail = (extra: Partial<AdminAccessRequest> = {}): AdminAccessRequest => ({ id: 'q1', numero: 'ACC-2026-000001', lecteur: reader, lecteurOrganisme: 'Université de Kankan', documentId: 'd2', documentTitre: 'Registre sous réserve', documentIdentifiant: 'DOC-000042', noticeId: 'n1',
    noticeIntitule: 'Registre des naissances de Kankan', institutionId: 'inst1', motif: 'Recherche sur l’état civil colonial de Kankan', statut: 'DEPOSEE', etat: 'DEPOSEE', deposeLe: '2026-10-05T09:00:00Z', instructeur: null, prisEnChargeLe: null, decidePar: null, decideLe: null,
    message: null, accordeJusquAu: null, revoquePar: null, revoqueLe: null, revoqueMotif: null, annuleLe: null, peutPrendreEnCharge: true, peutAccorder: false, peutRefuser: false, peutRevoquer: false, lecteurAbonne: true, ...extra });
const entry = (genre: string, extra: Partial<AccessJournalEntry> = {}): AccessJournalEntry => ({ id: 'e-' + genre, genre, auteur: 'Awa Camara', auteurLecteur: true, motif: null, createdAt: '2026-10-05T09:00:00Z', ...extra });

const open = async () => {
    render(<ConsultationsPage />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Demandes des lecteurs du portail' }));
};

beforeEach(() => {
    fixture.allowed = new Set(['CONSULTATION_READ', 'CONSULTATION_REVIEW']);
    for (const fn of [...Object.values(fixture.portalAdmin), ...Object.values(fixture.consultation), ...Object.values(fixture.records)]) fn.mockReset();
    fixture.consultation.requestsByInstitution.mockResolvedValue([]);
    fixture.consultation.myRequests.mockResolvedValue([]);
    fixture.portalAdmin.accessRequests.mockResolvedValue(page([row()]));
    fixture.portalAdmin.accessRequest.mockResolvedValue(detail());
    fixture.portalAdmin.accessRequestJournal.mockResolvedValue([entry('DEPOT')]);
    fixture.portalAdmin.command.mockResolvedValue({});
});

it('la page des consultations garde les dérogations et ajoute les demandes des lecteurs du portail', async () => {
    render(<ConsultationsPage />);
    expect(await screen.findByText('Aucune demande de dérogation dans ce périmètre.')).toBeTruthy();
    expect(fixture.portalAdmin.accessRequests).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('tab', { name: 'Demandes des lecteurs du portail' }));
    expect(await screen.findByRole('button', { name: 'ACC-2026-000001' })).toBeTruthy();
    expect(fixture.portalAdmin.accessRequests).toHaveBeenCalledWith({ statut: 'OUVERTES', q: '', page: 0, size: 20 }, expect.anything());
    expect(screen.getByText('Awa Camara')).toBeTruthy(); expect(screen.getByText('Registre sous réserve')).toBeTruthy(); expect(within(screen.getByRole('table')).getByText('Déposée')).toBeTruthy();
});

it('le filtre d’état et la recherche relancent la liste depuis la première page', async () => {
    await open();
    await screen.findByRole('button', { name: 'ACC-2026-000001' });
    fireEvent.change(screen.getByLabelText('État'), { target: { value: 'ACTIFS' } });
    await waitFor(() => expect(fixture.portalAdmin.accessRequests).toHaveBeenLastCalledWith({ statut: 'ACTIFS', q: '', page: 0, size: 20 }, expect.anything()));
    fireEvent.change(screen.getByLabelText('Recherche'), { target: { value: 'Camara' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }));
    await waitFor(() => expect(fixture.portalAdmin.accessRequests).toHaveBeenLastCalledWith({ statut: 'ACTIFS', q: 'Camara', page: 0, size: 20 }, expect.anything()));
});

it('une liste vide le dit', async () => {
    fixture.portalAdmin.accessRequests.mockResolvedValue(page([]));
    await open();
    expect(await screen.findByText('Aucune demande')).toBeTruthy();
});

it('la fiche montre le motif, le lecteur et l’historique ; les boutons viennent du serveur', async () => {
    await open();
    fireEvent.click(await screen.findByRole('button', { name: 'ACC-2026-000001' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Recherche sur l’état civil colonial de Kankan')).toBeTruthy();
    expect(within(dialog).getByText(/awa@exemple.gn/)).toBeTruthy(); expect(within(dialog).getByText('DOC-000042')).toBeTruthy(); expect(within(dialog).getByText('En cours')).toBeTruthy();
    expect(await within(dialog).findByText('Demande déposée')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Prendre en charge' })).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Accorder l’accès' })).toBeNull(); expect(within(dialog).queryByRole('button', { name: 'Refuser' })).toBeNull();
});

it('prendre en charge envoie la commande une seule fois puis relit la fiche', async () => {
    await open();
    fireEvent.click(await screen.findByRole('button', { name: 'ACC-2026-000001' }));
    const dialog = await screen.findByRole('dialog');
    fixture.portalAdmin.accessRequest.mockResolvedValue(detail({ statut: 'EN_INSTRUCTION', etat: 'EN_INSTRUCTION', instructeur: 'Mamadou Bah', prisEnChargeLe: '2026-10-05T10:00:00Z', peutPrendreEnCharge: false, peutAccorder: true, peutRefuser: true }));
    const claim = await within(dialog).findByRole('button', { name: 'Prendre en charge' });
    fireEvent.click(claim); fireEvent.click(claim);
    await waitFor(() => expect(fixture.portalAdmin.command).toHaveBeenCalledTimes(1));
    expect(fixture.portalAdmin.command).toHaveBeenCalledWith('/access-requests/q1/claim', {}, expect.any(String), 'POST');
    expect(await within(dialog).findByRole('button', { name: 'Accorder l’accès' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Refuser' })).toBeTruthy();
    expect(within(dialog).getByText('En instruction')).toBeTruthy();
});

it('accorder exige un jour à venir dans l’année et prévient quand le lecteur n’est pas abonné', async () => {
    fixture.portalAdmin.accessRequest.mockResolvedValue(detail({ statut: 'EN_INSTRUCTION', etat: 'EN_INSTRUCTION', peutPrendreEnCharge: false, peutAccorder: true, peutRefuser: true, lecteurAbonne: false }));
    await open();
    fireEvent.click(await screen.findByRole('button', { name: 'ACC-2026-000001' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Accorder l’accès' }));
    const grant = (await screen.findAllByRole('dialog')).at(-1)!;
    expect(within(grant).getByText(/n’a pas d’abonnement en cours/)).toBeTruthy();
    const date = within(grant).getByLabelText(/Accès accordé jusqu’au/) as HTMLInputElement;
    expect(date.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    fireEvent.change(date, { target: { value: '2020-01-01' } });
    fireEvent.click(within(grant).getByRole('button', { name: 'Accorder l’accès' }));
    expect(within(grant).getByText('L’accès est accordé jusqu’à un jour à venir.')).toBeTruthy();
    expect(fixture.portalAdmin.command).not.toHaveBeenCalled();
    const far = new Date(Date.now() + 400 * 86400000).toISOString().slice(0, 10);
    fireEvent.change(date, { target: { value: far } });
    fireEvent.click(within(grant).getByRole('button', { name: 'Accorder l’accès' }));
    expect(within(grant).getByText('Un accès s’accorde pour un an au plus.')).toBeTruthy();
    expect(fixture.portalAdmin.command).not.toHaveBeenCalled();
    const ok = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    fireEvent.change(date, { target: { value: ok } });
    fireEvent.change(within(grant).getByLabelText(/Message au lecteur/), { target: { value: '  Accès accordé pour votre thèse  ' } });
    fireEvent.click(within(grant).getByRole('button', { name: 'Accorder l’accès' }));
    await waitFor(() => expect(fixture.portalAdmin.command).toHaveBeenCalledTimes(1));
    expect(fixture.portalAdmin.command).toHaveBeenCalledWith('/access-requests/q1/grant', { jusquAu: ok, message: 'Accès accordé pour votre thèse' }, expect.any(String), 'POST');
});

it('refuser exige un message écrit pour le lecteur, et une erreur du serveur reste affichée', async () => {
    fixture.portalAdmin.accessRequest.mockResolvedValue(detail({ statut: 'EN_INSTRUCTION', etat: 'EN_INSTRUCTION', peutPrendreEnCharge: false, peutAccorder: true, peutRefuser: true }));
    await open();
    fireEvent.click(await screen.findByRole('button', { name: 'ACC-2026-000001' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Refuser' }));
    const refuse = (await screen.findAllByRole('dialog')).at(-1)!;
    fireEvent.change(within(refuse).getByLabelText(/^Message au lecteur/), { target: { value: 'court' } });
    fireEvent.click(within(refuse).getByRole('button', { name: 'Refuser la demande' }));
    expect(within(refuse).getByText(/au moins 10 caractères/)).toBeTruthy();
    expect(fixture.portalAdmin.command).not.toHaveBeenCalled();
    fixture.portalAdmin.command.mockRejectedValueOnce(new ApiError(403, 'FORBIDDEN', 'Vous ne pouvez pas décider cette demande.'));
    fireEvent.change(within(refuse).getByLabelText(/^Message au lecteur/), { target: { value: 'Le document est encore sous réserve' } });
    fireEvent.click(within(refuse).getByRole('button', { name: 'Refuser la demande' }));
    expect(await within(refuse).findByText('Vous ne pouvez pas décider cette demande.')).toBeTruthy();
    expect(fixture.portalAdmin.command).toHaveBeenCalledWith('/access-requests/q1/refuse', { message: 'Le document est encore sous réserve' }, expect.any(String), 'POST');
});

it('révoquer un accès accordé demande le motif et le montre dans la fiche', async () => {
    fixture.portalAdmin.accessRequest.mockResolvedValue(detail({ statut: 'ACCORDEE', etat: 'ACCORDEE', peutPrendreEnCharge: false, peutRevoquer: true, accordeJusquAu: '2026-11-06T00:00:00Z', decidePar: 'Mamadou Bah', decideLe: '2026-10-06T08:00:00Z', message: 'Accès accordé pour votre thèse' }));
    fixture.portalAdmin.accessRequests.mockResolvedValue(page([row({ statut: 'ACCORDEE', etat: 'ACCORDEE', accordeJusquAu: '2026-11-06T00:00:00Z', instructeur: 'Mamadou Bah' })]));
    await open();
    expect(await screen.findByText('jusqu’au 5 novembre 2026')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'ACC-2026-000001' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Accès accordé pour votre thèse')).toBeTruthy();
    expect(within(dialog).getByText('5 novembre 2026')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Révoquer l’accès' }));
    const revoke = (await screen.findAllByRole('dialog')).at(-1)!;
    fireEvent.change(within(revoke).getByLabelText(/^Motif de la révocation/), { target: { value: 'Usage non conforme aux conditions' } });
    fireEvent.click(within(revoke).getByRole('button', { name: 'Révoquer l’accès' }));
    await waitFor(() => expect(fixture.portalAdmin.command).toHaveBeenCalledWith('/access-requests/q1/revoke', { message: 'Usage non conforme aux conditions' }, expect.any(String), 'POST'));
});

it('une fiche sans action possible le dit, et un historique illisible n’empêche pas de lire la demande', async () => {
    fixture.portalAdmin.accessRequest.mockResolvedValue(detail({ statut: 'REFUSEE', etat: 'REFUSEE', peutPrendreEnCharge: false, decidePar: 'Mamadou Bah', decideLe: '2026-10-06T08:00:00Z', message: 'Le document est encore sous réserve' }));
    fixture.portalAdmin.accessRequestJournal.mockRejectedValue(new ApiError(500, 'HTTP_ERROR', 'Le service est momentanément indisponible.'));
    await open();
    fireEvent.click(await screen.findByRole('button', { name: 'ACC-2026-000001' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/Aucune action n’est possible pour votre profil/)).toBeTruthy();
    expect(within(dialog).getByText('Le document est encore sous réserve')).toBeTruthy();
    expect(await within(dialog).findByText('Le service est momentanément indisponible.')).toBeTruthy();
});
