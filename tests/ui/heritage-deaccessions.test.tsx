import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { AssetExits, Exit, ExitPage } from '../../src/core/deaccessions';
import type { HeritageAsset, HeritageReference } from '../../src/core/types';

const BIEN = '00000000-0000-4000-8000-000000000001';
const SORTIE = '00000000-0000-4000-8000-0000000000d1';
const INST = '00000000-0000-4000-8000-0000000000a1';

const fixture = vi.hoisted(() => ({
    epoch: 1, me: null as unknown, allowed: new Set<string>(['HERITAGE_READ', 'HERITAGE_DEACCESSION_PROPOSE', 'HERITAGE_DEACCESSION_DECIDE']),
    heritage: { assetDeaccessions: vi.fn(), deaccession: vi.fn(), deaccessions: vi.fn(), references: vi.fn(), proposeDeaccession: vi.fn(), examineDeaccession: vi.fn(), decideDeaccession: vi.fn(),
        executeDeaccession: vi.fn(), cancelDeaccession: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
vi.mock('../../src/ui/navigation', () => ({ navigate: vi.fn() }));
import { DeaccessionTab, DeaccessionsPanel } from '../../src/ui/HeritageDeaccessions';

const api = fixture.heritage;
const asset = (extra: Partial<HeritageAsset> = {}) => ({ id: BIEN, identifiant: 'PAT-000001', institutionId: INST, statutPriseEnCharge: 'ACQUISITION_VALIDEE', version: 4,
    champs: { intitule: 'Registre des naissances' }, ...extra }) as unknown as HeritageAsset;
const exits = (extra: Partial<AssetExits> = {}): AssetExits => ({ items: [], priseEnCharge: 'ACQUISITION_VALIDEE', situationJuridique: 'CLAIRE',
    obstacles: { RESTITUTION: [], TRANSFERT: [], DISPARITION: [] }, peutProposer: true, ouverte: null, ...extra });
const exit = (extra: Partial<Exit> = {}): Exit => ({ id: SORTIE, numero: 'SOR-2026-000001', bienId: BIEN, bienIdentifiant: 'PAT-000001', bienIntitule: 'Registre des naissances', institutionId: INST,
    nature: 'TRANSFERT', motifCode: 'ECHANGE', motifLabel: 'Échange avec une autre institution', justification: 'Le registre est cédé en échange d’une série complète du musée partenaire.',
    destinataire: 'Musée partenaire', valeurVenale: null, devise: null, valeurSource: null, statut: 'PROPOSEE', proposeParNom: 'A. Camara', proposeLe: '2026-10-01T10:00:00Z', examen: null,
    examineParNom: null, examineLe: null, decideParNom: null, decideLe: null, decisionReference: null, decisionDate: null, decisionMotif: null, executeParNom: null, executeLe: null,
    dateSortie: null, acteReference: null, observations: null, annuleParNom: null, annuleLe: null, annulationMotif: null, version: 0, originaux: [{ archiveId: 'a1', reference: 'COTE-1', label: null }],
    obstacles: [], actions: [], ...extra });
const motifs: HeritageReference[] = [
    { domaine: 'MOTIF_SORTIE', code: 'ECHANGE', libelle: 'Échange avec une autre institution', description: null, ordre: 30, actif: true },
    { domaine: 'MOTIF_SORTIE', code: 'ANCIEN', libelle: 'Motif retiré', description: null, ordre: 40, actif: false }
];

beforeEach(() => {
    fixture.allowed = new Set(['HERITAGE_READ', 'HERITAGE_DEACCESSION_PROPOSE', 'HERITAGE_DEACCESSION_DECIDE']);
    for (const fn of Object.values(api)) fn.mockReset();
    api.assetDeaccessions.mockResolvedValue(exits());
    api.references.mockResolvedValue(motifs);
    api.deaccession.mockResolvedValue(exit());
    api.deaccessions.mockResolvedValue({ items: [], page: 0, size: 50, hasMore: false } as ExitPage);
});

it('la fiche du bien propose la sortie, avec les motifs actifs du référentiel et sans destinataire pour une disparition', async () => {
    api.proposeDeaccession.mockResolvedValue(exit());
    render(<DeaccessionTab asset={asset()} onChanged={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Proposer la sortie du bien' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Proposer la sortie' }));
    expect(await within(dialog).findByText('Choisissez le motif dans le référentiel.')).toBeTruthy();
    expect(api.proposeDeaccession).not.toHaveBeenCalled();
    const motif = within(dialog).getByLabelText(/^Motif/) as HTMLSelectElement;
    expect(within(motif).queryByText('Motif retiré')).toBeNull();
    fireEvent.change(motif, { target: { value: 'ECHANGE' } });
    fireEvent.change(within(dialog).getByLabelText(/^Destinataire/), { target: { value: 'Musée partenaire' } });
    fireEvent.change(within(dialog).getByLabelText(/^Justification/), { target: { value: 'Le registre est cédé en échange d’une série complète du musée partenaire.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Proposer la sortie' }));
    await waitFor(() => expect(api.proposeDeaccession).toHaveBeenCalledTimes(1));
    expect(api.proposeDeaccession.mock.calls[0]![0]).toMatchObject({ bienId: BIEN, nature: 'RESTITUTION', motif: 'ECHANGE', destinataire: 'Musée partenaire', valeurVenale: null, devise: null });
});

it('un bien qui ne peut pas sortir dit pourquoi, nature par nature, sans bouton de proposition', async () => {
    const obstacle = { code: 'LEGAL_UNCLEAR', message: 'La situation juridique du bien est à clarifier : on ne propose pas sa sortie avant de savoir à qui il appartient.' };
    api.assetDeaccessions.mockResolvedValue(exits({ peutProposer: false, situationJuridique: 'A_CLARIFIER', obstacles: { RESTITUTION: [obstacle], TRANSFERT: [obstacle], DISPARITION: [obstacle] } }));
    render(<DeaccessionTab asset={asset()} onChanged={() => {}} />);
    expect(await screen.findByText(/Aucune sortie ne peut être proposée/)).toBeTruthy();
    expect(screen.getByText(/La situation juridique du bien est à clarifier/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Proposer la sortie du bien' })).toBeNull();
});

it('un bien sorti le dit, et sa fiche ne propose plus rien', async () => {
    api.assetDeaccessions.mockResolvedValue(exits({ peutProposer: false, priseEnCharge: 'SORTI', items: [{ id: SORTIE, numero: 'SOR-2026-000001', bienId: BIEN, bienIdentifiant: 'PAT-000001',
        bienIntitule: 'Registre', institutionId: INST, nature: 'TRANSFERT', motifLabel: 'Échange', statut: 'EXECUTEE', destinataire: 'Musée partenaire', proposeLe: '2026-10-01T10:00:00Z' }] }));
    render(<DeaccessionTab asset={asset({ statutPriseEnCharge: 'SORTI' } as Partial<HeritageAsset>)} onChanged={() => {}} />);
    expect(await screen.findByText(/Ce bien est sorti de la collection/)).toBeTruthy();
    expect(screen.getByText('Exécutée')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Proposer la sortie du bien' })).toBeNull();
});

it('chaque geste n’apparaît que si le serveur le permet à la personne connectée : examiner, approuver, exécuter', async () => {
    api.assetDeaccessions.mockResolvedValue(exits({ peutProposer: false, ouverte: SORTIE, items: [{ id: SORTIE, numero: 'SOR-2026-000001', bienId: BIEN, bienIdentifiant: 'PAT-000001',
        bienIntitule: 'Registre', institutionId: INST, nature: 'TRANSFERT', motifLabel: 'Échange', statut: 'PROPOSEE', destinataire: 'Musée partenaire', proposeLe: '2026-10-01T10:00:00Z' }] }));
    api.deaccession.mockResolvedValue(exit({ actions: ['EXAMINE', 'CANCEL'] }));
    api.examineDeaccession.mockResolvedValue(exit({ statut: 'EXAMINEE', version: 1 }));
    render(<DeaccessionTab asset={asset()} onChanged={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir' }));
    const detail = await screen.findByRole('dialog', { name: /SOR-2026-000001/ });
    expect(await within(detail).findByRole('button', { name: 'Examiner la sortie' })).toBeTruthy();
    expect(within(detail).queryByRole('button', { name: 'Approuver la sortie' })).toBeNull();
    expect(within(detail).queryByRole('button', { name: 'Exécuter la sortie' })).toBeNull();
    fireEvent.click(within(detail).getByRole('button', { name: 'Examiner la sortie' }));
    const form = await screen.findByRole('dialog', { name: 'Examiner la sortie' });
    fireEvent.click(within(form).getByRole('button', { name: 'Enregistrer l’examen' }));
    expect(await within(form).findByText(/L’examen juridique et de provenance se rédige en 30 caractères au moins/)).toBeTruthy();
    fireEvent.change(within(form).getByLabelText(/^Examen/), { target: { value: 'Titre de propriété vérifié, aucune clause de dépôt, accord écrit obtenu du déposant.' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Enregistrer l’examen' }));
    await waitFor(() => expect(api.examineDeaccession).toHaveBeenCalledTimes(1));
    expect(api.examineDeaccession.mock.calls[0]![0]).toBe(SORTIE);
    expect(api.examineDeaccession.mock.calls[0]![1]).toMatchObject({ version: 0, examen: 'Titre de propriété vérifié, aucune clause de dépôt, accord écrit obtenu du déposant.' });
});

it('une sortie approuvée retenue par une opération en cours montre ce qui la retient et ne propose pas l’exécution', async () => {
    api.assetDeaccessions.mockResolvedValue(exits({ peutProposer: false, ouverte: SORTIE, items: [{ id: SORTIE, numero: 'SOR-2026-000001', bienId: BIEN, bienIdentifiant: 'PAT-000001',
        bienIntitule: 'Registre', institutionId: INST, nature: 'TRANSFERT', motifLabel: 'Échange', statut: 'APPROUVEE', destinataire: 'Musée partenaire', proposeLe: '2026-10-01T10:00:00Z' }] }));
    api.deaccession.mockResolvedValue(exit({ statut: 'APPROUVEE', decisionReference: 'Décision 2026/14', decisionDate: '2026-10-02', decideParNom: 'B. Diallo', decideLe: '2026-10-02T09:00:00Z',
        examen: 'Titre vérifié.', examineParNom: 'C. Bah', examineLe: '2026-10-01T15:00:00Z', obstacles: [{ code: 'ORIGINAL_OUT', message: 'Un original de ce bien est sorti de réserve : enregistrez son retour d’abord.' }],
        actions: ['CANCEL'] }));
    render(<DeaccessionTab asset={asset()} onChanged={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir' }));
    const detail = await screen.findByRole('dialog', { name: /SOR-2026-000001/ });
    expect(await within(detail).findByText(/Ce qui retient la sortie/)).toBeTruthy();
    expect(within(detail).getByText(/Un original de ce bien est sorti de réserve/)).toBeTruthy();
    expect(within(detail).queryByRole('button', { name: 'Exécuter la sortie' })).toBeNull();
    expect(within(detail).getByText(/Acte « Décision 2026\/14 »/)).toBeTruthy();
});

it('l’exécution demande la date et l’acte de sortie, et ne part pas sans eux', async () => {
    api.assetDeaccessions.mockResolvedValue(exits({ peutProposer: false, ouverte: SORTIE, items: [{ id: SORTIE, numero: 'SOR-2026-000001', bienId: BIEN, bienIdentifiant: 'PAT-000001',
        bienIntitule: 'Registre', institutionId: INST, nature: 'TRANSFERT', motifLabel: 'Échange', statut: 'APPROUVEE', destinataire: 'Musée partenaire', proposeLe: '2026-10-01T10:00:00Z' }] }));
    api.deaccession.mockResolvedValue(exit({ statut: 'APPROUVEE', decisionDate: '2026-10-02', decisionReference: 'Décision 2026/14', actions: ['EXECUTE', 'CANCEL'], version: 3 }));
    api.executeDeaccession.mockResolvedValue(exit({ statut: 'EXECUTEE' }));
    render(<DeaccessionTab asset={asset()} onChanged={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir' }));
    const detail = await screen.findByRole('dialog', { name: /SOR-2026-000001/ });
    fireEvent.click(await within(detail).findByRole('button', { name: 'Exécuter la sortie' }));
    const form = await screen.findByRole('dialog', { name: 'Exécuter la sortie' });
    fireEvent.click(within(form).getByRole('button', { name: 'Exécuter la sortie' }));
    expect(await within(form).findByText(/Indiquez la référence de l’acte de sortie/)).toBeTruthy();
    expect(api.executeDeaccession).not.toHaveBeenCalled();
    fireEvent.change(within(form).getByLabelText(/^Référence de l’acte de sortie/), { target: { value: 'Procès-verbal de remise 7' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Exécuter la sortie' }));
    await waitFor(() => expect(api.executeDeaccession).toHaveBeenCalledTimes(1));
    expect(api.executeDeaccession.mock.calls[0]![1]).toMatchObject({ version: 3, acteReference: 'Procès-verbal de remise 7', observations: null });
});

it('la page liste les sorties visibles et filtre par état', async () => {
    api.deaccessions.mockResolvedValue({ items: [{ id: SORTIE, numero: 'SOR-2026-000001', bienId: BIEN, bienIdentifiant: 'PAT-000001', bienIntitule: 'Registre des naissances', institutionId: INST,
        nature: 'RESTITUTION', motifLabel: 'Restitution à son propriétaire', statut: 'EXAMINEE', destinataire: 'Famille déposante', proposeLe: '2026-10-01T10:00:00Z' }], page: 0, size: 50, hasMore: false });
    render(<DeaccessionsPanel />);
    expect(await screen.findByText('SOR-2026-000001')).toBeTruthy();
    expect(screen.getByText('Restitution')).toBeTruthy();
    expect(within(screen.getByRole('table')).getByText('Examinée')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('État'), { target: { value: 'EXECUTEE' } });
    await waitFor(() => expect(api.deaccessions).toHaveBeenLastCalledWith({ status: 'EXECUTEE', page: 0 }, expect.anything()));
});
