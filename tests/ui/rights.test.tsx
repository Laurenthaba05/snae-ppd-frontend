import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

// Les droits : le référentiel des sources juridiques (création réservée), les statuts et restrictions d'un document ; chaque envoi porte sa propre clé d'idempotence, une erreur laisse la
// fenêtre ouverte avec le texte saisi, seule une restriction active se lève, et rien n'est proposé sans l'habilitation.
const fixture = vi.hoisted(() => ({
    rights: { sources: vi.fn(), documentStatuses: vi.fn(), documentRestrictions: vi.fn(), command: vi.fn() },
    me: { user: { id: 'u1' } } as unknown, epoch: 1,
    allowed: new Set<string>(), scope: { institutionId: null as string | null, departmentId: null as string | null }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: fixture.scope }) }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
vi.mock('../../src/ui/ResourceDetails', () => ({ ResourceDetailsButton: () => null }));
vi.mock('../../src/ui/OptionalFields', () => ({ OptionalFields: () => null, useOptionalFields: () => ({ payload: () => ({}), values: {} }) }));
vi.mock('../../src/ui/Communicability', () => ({
    CommunicabilityCatalogPanel: ({ institutionId, canCatalog, canApply }: { institutionId: string; canCatalog: boolean; canApply: boolean }) => <div data-testid="catalog">{institutionId}:{String(canCatalog)}:{String(canApply)}</div>,
    DocumentCommunicabilityPanel: ({ canManage }: { canManage: boolean }) => <div data-testid="communicability">{String(canManage)}</div>
}));
vi.mock('../../src/ui/Redaction', () => ({ RedactionPanel: ({ canManage }: { canManage: boolean }) => <div data-testid="redaction">{String(canManage)}</div> }));
import { RightsPage, RightsPanel } from '../../src/pages/Rights';

const DOC = 'd-1';
const source = (n: number, over: Record<string, unknown> = {}) => ({ id: 's' + n, typeSource: 'LOI', reference: 'Loi n° ' + n, titre: n === 1 ? 'Code du patrimoine' : null, autorite: n === 1 ? 'Assemblée nationale' : null, ...over });
const restriction = (n: number, over: Record<string, unknown> = {}) => ({ id: 'r' + n, niveau: 'CONFIDENTIEL', statut: 'ACTIF', motif: 'Vie privée ' + n, dateDebut: '2026-10-01T08:00:00Z', ...over });
const status = (n: number) => ({ id: 'st' + n, typeStatut: 'DROIT_AUTEUR', titulaire: n === 1 ? 'Famille Camara' : null, justification: null });

beforeEach(() => {
    fixture.allowed = new Set(); fixture.epoch += 1; fixture.scope = { institutionId: null, departmentId: null };
    fixture.rights.sources.mockReset().mockResolvedValue([source(1), source(2)]);
    fixture.rights.documentStatuses.mockReset().mockResolvedValue([status(1), status(2)]);
    fixture.rights.documentRestrictions.mockReset().mockResolvedValue([restriction(1), restriction(2, { statut: 'LEVE' })]);
    fixture.rights.command.mockReset().mockResolvedValue({ id: 'new-id', fichierId: null });
});

// ---------- la page des sources juridiques

it('la page liste les sources du référentiel, avec un tiret pour ce qui n’est pas renseigné', async () => {
    render(<RightsPage />);
    expect(await screen.findByText('Loi n° 1')).toBeTruthy();
    expect(screen.getByText('Code du patrimoine')).toBeTruthy();
    expect(screen.getByText('Assemblée nationale')).toBeTruthy();
    const row = screen.getByText('Loi n° 2').closest('tr')!;
    expect(within(row).getAllByText('—').length).toBe(2);
    expect(screen.queryByRole('button', { name: 'Créer une source' })).toBeNull();
});

it('un référentiel vide le dit, et une erreur du serveur n’est pas présentée comme un référentiel vide', async () => {
    fixture.rights.sources.mockResolvedValue([]);
    const first = render(<RightsPage />);
    expect(await screen.findByText('Aucune source juridique')).toBeTruthy();
    first.unmount();
    fixture.epoch += 1;
    fixture.rights.sources.mockRejectedValue(new Error('Indisponible'));
    render(<RightsPage />);
    expect(await screen.findByText('Indisponible')).toBeTruthy();
    expect(screen.queryByText('Aucune source juridique')).toBeNull();
});

it('créer une source envoie les champs nettoyés avec une clé d’idempotence, puis recharge la liste et ferme la fenêtre', async () => {
    fixture.allowed = new Set(['RIGHTS_SOURCE_MANAGE']);
    render(<RightsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Créer une source' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/^Type/), { target: { value: ' DECRET ' } });
    fireEvent.change(within(dialog).getByLabelText(/^Référence/), { target: { value: ' Décret 2026-14 ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer' }));
    await waitFor(() => expect(fixture.rights.command).toHaveBeenCalledWith('/sources', { typeSource: 'DECRET', reference: 'Décret 2026-14', titre: null, autorite: null }, expect.stringMatching(/^[0-9a-f-]{36}$/), 'POST'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(fixture.rights.sources).toHaveBeenCalledTimes(2);
});

it('une création refusée laisse la fenêtre ouverte avec le texte saisi et dit pourquoi', async () => {
    fixture.allowed = new Set(['RIGHTS_SOURCE_MANAGE']);
    fixture.rights.command.mockRejectedValue(new Error('Cette source existe déjà'));
    render(<RightsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Créer une source' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/^Type/), { target: { value: 'LOI' } });
    fireEvent.change(within(dialog).getByLabelText(/^Référence/), { target: { value: 'Loi n° 1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer' }));
    expect(await within(dialog).findByText('Cette source existe déjà')).toBeTruthy();
    expect((within(dialog).getByLabelText(/^Référence/) as HTMLInputElement).value).toBe('Loi n° 1');
    expect(fixture.rights.sources).toHaveBeenCalledTimes(1);
});

it('le catalogue de communicabilité n’apparaît qu’avec une institution et le droit de lecture, et reçoit les droits de gestion', async () => {
    const without = render(<RightsPage />);
    await screen.findByText('Loi n° 1');
    expect(screen.queryByTestId('catalog')).toBeNull();
    without.unmount();
    fixture.epoch += 1; fixture.scope = { institutionId: 'i-1', departmentId: null };
    fixture.allowed = new Set(['RIGHTS_READ', 'RIGHTS_RESTRICTION_MANAGE']);
    render(<RightsPage />);
    expect((await screen.findByTestId('catalog')).textContent).toBe('i-1:false:true');
});

// ---------- le panneau d'un document

it('le panneau liste les statuts et les restrictions du document, sans proposer d’action sans habilitation', async () => {
    render(<RightsPanel documentId={DOC} />);
    expect(await screen.findByText('Famille Camara')).toBeTruthy();
    expect(screen.getByText('Vie privée 1')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ajouter un statut' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ouvrir une restriction' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Lever' })).toBeNull();
    expect(fixture.rights.documentStatuses).toHaveBeenCalledWith(DOC, expect.anything());
});

it('le panneau dit l’absence de statut et de restriction, et une erreur n’est pas présentée comme une absence', async () => {
    fixture.rights.documentStatuses.mockResolvedValue([]);
    fixture.rights.documentRestrictions.mockRejectedValue(new Error('Restrictions indisponibles'));
    render(<RightsPanel documentId={DOC} />);
    expect(await screen.findByText('Aucun statut juridique')).toBeTruthy();
    expect(await screen.findByText('Restrictions indisponibles')).toBeTruthy();
    expect(screen.queryByText('Aucune restriction d’accès')).toBeNull();
});

it('seule une restriction active se lève, avec sa référence de levée', async () => {
    fixture.allowed = new Set(['RIGHTS_RESTRICTION_MANAGE']);
    render(<RightsPanel documentId={DOC} />);
    await screen.findByText('Vie privée 1');
    expect(screen.getAllByRole('button', { name: 'Lever' }).length).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Lever' }));
    const dialog = await screen.findByRole('dialog', { name: 'Lever la restriction' });
    fireEvent.change(within(dialog).getByLabelText(/^Référence de levée/), { target: { value: '  Arrêté 2026-77  ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lever' }));
    await waitFor(() => expect(fixture.rights.command).toHaveBeenCalledWith('/restrictions/r1/release', { releaseReference: 'Arrêté 2026-77' }, expect.any(String), 'POST'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(fixture.rights.documentRestrictions).toHaveBeenCalledTimes(2);
});

it('ouvrir une restriction envoie le niveau, le motif nettoyé et la source choisie', async () => {
    fixture.allowed = new Set(['RIGHTS_RESTRICTION_MANAGE']);
    render(<RightsPanel documentId={DOC} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir une restriction' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ouvrir une restriction d’accès' });
    fireEvent.change(within(dialog).getByLabelText('Niveau'), { target: { value: 'SECRET' } });
    fireEvent.change(within(dialog).getByLabelText(/^Source juridique/), { target: { value: 's2' } });
    fireEvent.change(within(dialog).getByLabelText(/^Motif/), { target: { value: '  Sécurité de l’État  ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ouvrir' }));
    await waitFor(() => expect(fixture.rights.command).toHaveBeenCalledWith('/documents/d-1/restrictions', { niveau: 'SECRET', motif: 'Sécurité de l’État', autorite: null, sourceJuridiqueId: 's2' }, expect.any(String), 'POST'));
});

it('ajouter un statut envoie le document, puis confirme l’enregistrement et recharge la liste', async () => {
    fixture.allowed = new Set(['RIGHTS_STATUS_MANAGE']);
    render(<RightsPanel documentId={DOC} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ajouter un statut' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ajouter un statut juridique' });
    fireEvent.change(within(dialog).getByLabelText(/^Type de statut/), { target: { value: 'DOMAINE_PUBLIC' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ajouter' }));
    expect(await screen.findByRole('dialog', { name: 'Statut juridique enregistré' })).toBeTruthy();
    expect(fixture.rights.command).toHaveBeenCalledWith('/statuses', expect.objectContaining({ documentId: DOC, typeStatut: 'DOMAINE_PUBLIC', titulaire: null, sourceJuridiqueId: null }), expect.any(String), 'POST');
    expect(screen.getByText(/pour ce document/)).toBeTruthy();
    await waitFor(() => expect(fixture.rights.documentStatuses).toHaveBeenCalledTimes(2));
});

it('la communicabilité et l’occultation n’apparaissent que pour un document d’une institution, avec le droit de gestion transmis', async () => {
    const plain = render(<RightsPanel documentId={DOC} />);
    await screen.findByText('Famille Camara');
    expect(screen.queryByTestId('communicability')).toBeNull();
    plain.unmount();
    fixture.epoch += 1; fixture.allowed = new Set(['RIGHTS_RESTRICTION_MANAGE']);
    render(<RightsPanel documentId={DOC} institutionId="i-1" />);
    expect((await screen.findByTestId('communicability')).textContent).toBe('true');
    expect(screen.getByTestId('redaction').textContent).toBe('true');
});
