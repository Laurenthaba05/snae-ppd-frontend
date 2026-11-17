import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { ExitPage, ExitRequest } from '../../src/core/physicalExit';

// La sortie d'une archive ordinaire se demande, une autre personne l'autorise, le magasin la remet puis la reprend : l'écran guide, le serveur reste seul juge.
const fixture = vi.hoisted(() => ({
    epoch: 1, me: { user: { id: 'u-requester' } } as unknown, allowed: new Set<string>(),
    physicalArchives: { exitRequests: vi.fn(), exitRequest: vi.fn(), exitRequestsByArchive: vi.fn(), command: vi.fn(), vocabulary: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
const printed = vi.hoisted(() => vi.fn());
vi.mock('../../src/ui/printHtml', () => ({ printHtml: printed }));
import { ArchiveExits, ExitQueueSection } from '../../src/ui/PhysicalExit';

const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
const req = (extra: Partial<ExitRequest> = {}): ExitRequest => ({
    id: 'r1', numero: 'SOR-2026-000001', archiveId: 'a1', archiveCote: 'DP-001', archiveIntitule: 'Dossier personnel Camara', institutionId: 'inst-a', departmentId: null,
    objet: 'CONSULTATION', motif: 'Consultation par un chercheur accrédité', destination: 'Salle de lecture', destinataire: 'Équipe de recherche', retourPrevu: soon, statut: 'DEMANDEE', enRetard: false,
    demandeParId: 'u-requester', demandePar: 'Awa Camara', demandeLe: '2026-10-01T09:00:00Z', decidePar: null, decideLe: null, decisionMotif: null, conditions: null,
    remisPar: null, remisLe: null, mouvementId: null, retourPar: null, retourLe: null, retourConforme: null, retourNote: null, fermePar: null, fermeLe: null, fermeMotif: null, version: 2,
    evenements: [{ genre: 'DEMANDE', le: '2026-10-01T09:00:00Z', par: 'Awa Camara', texte: 'Consultation par un chercheur accrédité' }], ...extra
});
const page = (items: ExitRequest[], extra: Partial<ExitPage> = {}): ExitPage => ({ items, page: 0, size: 20, hasMore: false, ...extra });
const top = () => { const all = screen.getAllByRole('dialog'); return all[all.length - 1]!; };

beforeEach(() => {
    fixture.allowed = new Set(['PHYSICALARCHIVES_EXIT_REQUEST']);
    fixture.epoch += 1; fixture.me = { user: { id: 'u-requester' } };
    const api = fixture.physicalArchives;
    api.exitRequests.mockReset().mockResolvedValue(page([]));
    api.exitRequest.mockReset().mockResolvedValue(req());
    api.exitRequestsByArchive.mockReset().mockResolvedValue([]);
    api.command.mockReset().mockResolvedValue(req());
    api.vocabulary.mockReset().mockResolvedValue([]);
});

// ---------- la file

it('la file montre d’abord les demandes ouvertes, avec leur étape et le retard', async () => {
    fixture.physicalArchives.exitRequests.mockResolvedValue(page([
        req(), req({ id: 'r2', numero: 'SOR-2026-000002', archiveCote: 'DP-002', archiveIntitule: null, statut: 'REMISE', enRetard: true, retourPrevu: '2026-10-01', demandePar: null })]));
    render(<ExitQueueSection />);
    expect(await screen.findByText('SOR-2026-000001')).toBeTruthy();
    expect(fixture.physicalArchives.exitRequests).toHaveBeenCalledWith({ ouvertes: 'true' }, 0, expect.anything());
    expect(screen.getByText('Demandée', { selector: '.badge' })).toBeTruthy();
    expect(screen.getByText('Remise', { selector: '.badge' })).toBeTruthy();
    expect(screen.getByText('En retard', { selector: '.badge' })).toBeTruthy();
    expect(screen.getByText('Dossier personnel Camara')).toBeTruthy();
    expect(screen.getAllByText('Consultation').length).toBeGreaterThan(0);
    expect(screen.getByText(/En retard de \d+ jours/)).toBeTruthy();
});

it('la file se filtre par regroupement ou par étape et par texte, et revient à la première page', async () => {
    render(<ExitQueueSection />);
    await screen.findByText('Aucune demande');
    expect(screen.getByText(/Aucune sortie n’est demandée ni en cours/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Étape'), { target: { value: 'EN_RETARD' } });
    await waitFor(() => expect(fixture.physicalArchives.exitRequests).toHaveBeenLastCalledWith({ enRetard: 'true' }, 0, expect.anything()));
    fireEvent.change(screen.getByLabelText('Étape'), { target: { value: 'REMISE' } });
    await waitFor(() => expect(fixture.physicalArchives.exitRequests).toHaveBeenLastCalledWith({ statut: 'REMISE' }, 0, expect.anything()));
    fireEvent.change(screen.getByLabelText('Recherche'), { target: { value: ' DP-001 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }));
    await waitFor(() => expect(fixture.physicalArchives.exitRequests).toHaveBeenLastCalledWith({ statut: 'REMISE', q: 'DP-001' }, 0, expect.anything()));
    expect(await screen.findByText('Aucune demande ne correspond à ces critères.')).toBeTruthy();
});

it('la file se parcourt page par page, sans total', async () => {
    fixture.physicalArchives.exitRequests.mockResolvedValue(page([req()], { hasMore: true }));
    render(<ExitQueueSection />);
    await screen.findByText('SOR-2026-000001');
    fireEvent.click(screen.getByRole('button', { name: 'Suivante' }));
    await waitFor(() => expect(fixture.physicalArchives.exitRequests).toHaveBeenLastCalledWith({ ouvertes: 'true' }, 1, expect.anything()));
});

it('une erreur du serveur est dite à l’écran, sans la confondre avec une file vide', async () => {
    fixture.physicalArchives.exitRequests.mockRejectedValue(new Error('File indisponible'));
    render(<ExitQueueSection />);
    expect(await screen.findByText('File indisponible')).toBeTruthy();
    expect(screen.queryByText('Aucune demande')).toBeNull();
});

// ---------- la fiche d'une archive

const archive = { id: 'a1', cote: 'DP-001' };
const renderArchive = (requests: ExitRequest[] = [], canRequest = true, onChanged = vi.fn()) => {
    fixture.physicalArchives.exitRequestsByArchive.mockResolvedValue(requests);
    return render(<ArchiveExits archive={archive} requests={requests} loading={false} error={null} onRetry={vi.fn()} canRequest={canRequest} onChanged={onChanged} />);
};

it('une archive en réserve propose de demander sa sortie, seulement avec l’habilitation', () => {
    const first = renderArchive();
    expect(screen.getByText(/Cette archive est en réserve/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Demander la sortie' })).toBeTruthy();
    first.unmount();
    renderArchive([], false);
    expect(screen.queryByRole('button', { name: 'Demander la sortie' })).toBeNull();
});

it('une demande ouverte remplace le bouton de demande et dit ce qui est attendu ; les closes se listent', async () => {
    renderArchive([req({ statut: 'AUTORISEE' }), req({ id: 'r0', numero: 'SOR-2026-000000', statut: 'RETOURNEE' })]);
    expect(screen.getByText(/Le magasin remet l’archive/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Demander la sortie' })).toBeNull();
    expect(screen.getByText('Demandes closes')).toBeTruthy();
    expect(screen.getByText('Rendue', { selector: '.badge' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir la demande' }));
    await waitFor(() => expect(fixture.physicalArchives.exitRequest).toHaveBeenCalledWith('r1', expect.anything()));
});

it('la demande exige ce qu’une sortie suppose, part avec une clé et ouvre la demande créée', async () => {
    const onChanged = vi.fn();
    renderArchive([], true, onChanged);
    fireEvent.click(screen.getByRole('button', { name: 'Demander la sortie' }));
    const dialog = top();
    expect(within(dialog).getByText(/autorisée par une autre personne que vous/)).toBeTruthy();
    const confirm = within(dialog).getByRole('button', { name: 'Déposer la demande' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/Pour quoi/), { target: { value: 'Rangement' } });
    expect(within(dialog).getByText(/réservé au changement d’emplacement/)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText(/Pour quoi/), { target: { value: 'Consultation' } });
    fireEvent.change(within(dialog).getByLabelText(/Motif/), { target: { value: 'court' } });
    expect(within(dialog).getByText(/Le motif dit pourquoi l’archive sort/)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText(/Motif/), { target: { value: '  Consultation par un chercheur accrédité  ' } });
    fireEvent.change(within(dialog).getByLabelText(/Où l’archive ira/), { target: { value: 'Salle de lecture' } });
    fireEvent.change(within(dialog).getByLabelText(/Qui la reçoit/), { target: { value: 'Équipe de recherche' } });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/Retour prévu/), { target: { value: '2099-01-15' } });
    expect(within(dialog).getByText(/ne peut pas dépasser cinq ans/)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText(/Retour prévu/), { target: { value: soon } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(fixture.physicalArchives.command).toHaveBeenCalledTimes(1));
    const [path, body, key, method] = fixture.physicalArchives.command.mock.calls[0]!;
    expect(path).toBe('/archives/a1/exit-requests');
    expect(body).toEqual({ objet: 'Consultation', motif: 'Consultation par un chercheur accrédité', destination: 'Salle de lecture', destinataire: 'Équipe de recherche', retourPrevu: soon });
    expect(typeof key).toBe('string'); expect(method).toBe('POST');
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    await waitFor(() => expect(fixture.physicalArchives.exitRequest).toHaveBeenCalledWith('r1', expect.anything()));
});

it('un refus du serveur à la demande est dit, et la fenêtre reste ouverte', async () => {
    fixture.physicalArchives.command.mockRejectedValue(new Error('Une demande est déjà ouverte pour cette archive (SOR-2026-000007).'));
    renderArchive();
    fireEvent.click(screen.getByRole('button', { name: 'Demander la sortie' }));
    const dialog = top();
    fireEvent.change(within(dialog).getByLabelText(/Pour quoi/), { target: { value: 'Prêt' } });
    fireEvent.change(within(dialog).getByLabelText(/Motif/), { target: { value: 'Prêt à un service voisin' } });
    fireEvent.change(within(dialog).getByLabelText(/Où l’archive ira/), { target: { value: 'Bureau' } });
    fireEvent.change(within(dialog).getByLabelText(/Qui la reçoit/), { target: { value: 'Service voisin' } });
    fireEvent.change(within(dialog).getByLabelText(/Retour prévu/), { target: { value: soon } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Déposer la demande' }));
    expect(await within(dialog).findByText(/déjà ouverte pour cette archive/)).toBeTruthy();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
});

// ---------- la fiche d'une demande

async function openFiche(request: ExitRequest, rights: string[], userId = 'u-requester') {
    fixture.allowed = new Set(rights); fixture.me = { user: { id: userId } };
    fixture.physicalArchives.exitRequest.mockResolvedValue(request);
    renderArchive([request]);
    fireEvent.click(screen.getByRole('button', { name: ['REFUSEE', 'ANNULEE', 'RETOURNEE'].includes(request.statut) ? 'Ouvrir' : 'Ouvrir la demande' }));
    return await screen.findByRole('dialog');
}

it('la fiche montre pour quoi, où, pour qui, jusqu’à quand, l’historique et ce que la personne peut faire', async () => {
    const dialog = await openFiche(req(), ['PHYSICALARCHIVES_EXIT_REQUEST']);
    expect(await within(dialog).findByText('Salle de lecture')).toBeTruthy();
    expect(within(dialog).getByText('Équipe de recherche')).toBeTruthy();
    expect(within(dialog).getByText('Demande déposée · Awa Camara')).toBeTruthy();
    expect(within(dialog).getByText(/Une autre personne que le demandeur autorise ou refuse la sortie/, { selector: 'p.modal-summary' })).toBeTruthy();
    // le demandeur peut annuler sa demande, mais pas l’autoriser
    expect((within(dialog).getByRole('button', { name: 'Annuler la demande' }) as HTMLButtonElement).disabled).toBe(false);
    const authorize = within(dialog).getByRole('button', { name: 'Autoriser la sortie' }) as HTMLButtonElement;
    expect(authorize.disabled).toBe(true);
    expect(authorize.title).toContain('Habilitation requise');
});

it('le bon de sortie s’imprime dès que la sortie est autorisée, jamais avant', async () => {
    printed.mockClear();
    const first = await openFiche(req(), ['PHYSICALARCHIVES_EXIT_REQUEST']);
    await within(first).findByText('Salle de lecture');
    expect(within(first).queryByRole('button', { name: 'Imprimer le bon de sortie' })).toBeNull();
    cleanup();
    const dialog = await openFiche(req({ statut: 'REMISE', decidePar: 'Mamadou Bah', decideLe: '2026-10-02T09:00:00Z', remisPar: 'Aminata Diallo', remisLe: '2026-10-03T09:00:00Z', conditions: 'Gants exigés' }), ['PHYSICALARCHIVES_EXIT_HANDLE']);
    await within(dialog).findByText('Salle de lecture');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Imprimer le bon de sortie' }));
    expect(printed).toHaveBeenCalledTimes(1);
    const html = String(printed.mock.calls[0]![0]);
    for (const text of ['SOR-2026-000001', 'DP-001', 'Salle de lecture', 'Gants exigés', 'Mamadou Bah', 'Aminata Diallo']) expect(html).toContain(text);
});

it('le demandeur ne peut pas autoriser sa propre demande, même avec l’habilitation : la raison est affichée', async () => {
    const dialog = await openFiche(req(), ['PHYSICALARCHIVES_EXIT_REQUEST', 'PHYSICALARCHIVES_EXIT_AUTHORIZE']);
    const authorize = await within(dialog).findByRole('button', { name: 'Autoriser la sortie' }) as HTMLButtonElement;
    expect(authorize.disabled).toBe(true);
    expect(authorize.title).toBe('Une autre personne que le demandeur autorise ou refuse la sortie.');
    expect((within(dialog).getByRole('button', { name: 'Refuser la demande' }) as HTMLButtonElement).disabled).toBe(true);
});

it('une autre personne autorise avec des conditions facultatives, et la version lue part avec la commande', async () => {
    const dialog = await openFiche(req(), ['PHYSICALARCHIVES_EXIT_AUTHORIZE'], 'u-authorizer');
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Autoriser la sortie' }));
    const form = top();
    expect(within(form).getByText(/L’autorisation engage l’institution/)).toBeTruthy();
    const confirm = within(form).getByRole('button', { name: 'Confirmer' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);
    fireEvent.change(within(form).getByLabelText(/Conditions de manipulation/), { target: { value: ' Gants de coton, consultation sur place ' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(fixture.physicalArchives.command).toHaveBeenCalledTimes(1));
    const [path, body, , method] = fixture.physicalArchives.command.mock.calls[0]!;
    expect(path).toBe('/exit-requests/r1/transition');
    expect(body).toEqual({ vers: 'AUTORISEE', expectedVersion: 2, conditions: 'Gants de coton, consultation sur place' });
    expect(method).toBe('POST');
});

it('refuser exige un motif écrit et prévient que la décision est définitive', async () => {
    const dialog = await openFiche(req(), ['PHYSICALARCHIVES_EXIT_AUTHORIZE'], 'u-authorizer');
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Refuser la demande' }));
    const form = top();
    expect(within(form).getByText(/Cette décision est définitive/)).toBeTruthy();
    const confirm = within(form).getByRole('button', { name: 'Confirmer' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(form).getByLabelText(/Motif du refus/), { target: { value: 'Le fonds est en cours de récolement' } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(fixture.physicalArchives.command).toHaveBeenCalledTimes(1));
    expect(fixture.physicalArchives.command.mock.calls[0]![1]).toEqual({ vers: 'REFUSEE', expectedVersion: 2, texte: 'Le fonds est en cours de récolement' });
});

it('la remise se fait d’un clic, sans fenêtre', async () => {
    const dialog = await openFiche(req({ statut: 'AUTORISEE', decidePar: 'Mamadou Bah', decideLe: '2026-10-02T09:00:00Z', conditions: 'Gants exigés' }), ['PHYSICALARCHIVES_EXIT_HANDLE'], 'u-handler');
    expect(await within(dialog).findByText('Gants exigés')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remettre l’archive' }));
    await waitFor(() => expect(fixture.physicalArchives.command).toHaveBeenCalledTimes(1));
    expect(fixture.physicalArchives.command.mock.calls[0]![1]).toEqual({ vers: 'REMISE', expectedVersion: 2 });
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
});

it('le retour dit si l’archive est comme elle est partie, et décrit l’anomalie sinon', async () => {
    const dialog = await openFiche(req({ statut: 'REMISE', remisPar: 'Aminata Camara', remisLe: '2026-10-03T09:00:00Z', mouvementId: 'm1' }), ['PHYSICALARCHIVES_EXIT_HANDLE'], 'u-handler');
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Enregistrer le retour' }));
    const form = top();
    const confirm = within(form).getByRole('button', { name: 'Confirmer' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(within(form).getByLabelText(/Rendue dans un autre état/));
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(form).getByLabelText(/Anomalie constatée/), { target: { value: 'Déchirure apparue en marge de la page douze' } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(fixture.physicalArchives.command).toHaveBeenCalledTimes(1));
    expect(fixture.physicalArchives.command.mock.calls[0]![1]).toEqual({ vers: 'RETOURNEE', expectedVersion: 2, conforme: false, texte: 'Déchirure apparue en marge de la page douze' });
});

it('une demande close n’a plus de passage et montre son issue', async () => {
    const dialog = await openFiche(req({ statut: 'RETOURNEE', retourLe: '2026-10-09T09:00:00Z', retourPar: 'Aminata Camara', retourConforme: false, retourNote: 'Déchirure en marge de la page douze' }), ['PHYSICALARCHIVES_EXIT_REQUEST', 'PHYSICALARCHIVES_EXIT_AUTHORIZE', 'PHYSICALARCHIVES_EXIT_HANDLE']);
    expect(await within(dialog).findByText('Rendue dans un autre état')).toBeTruthy();
    expect(within(dialog).getByText('Anomalie constatée')).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Enregistrer le retour' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Annuler la demande' })).toBeNull();
});

it('un refus du serveur à un passage est dit dans la fiche', async () => {
    fixture.physicalArchives.command.mockRejectedValue(new Error('Cette demande a changé depuis que vous l’avez ouverte : rouvrez-la pour voir son état à jour.'));
    const dialog = await openFiche(req({ statut: 'AUTORISEE' }), ['PHYSICALARCHIVES_EXIT_HANDLE'], 'u-handler');
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Remettre l’archive' }));
    expect(await within(dialog).findByText(/Cette demande a changé/)).toBeTruthy();
});
