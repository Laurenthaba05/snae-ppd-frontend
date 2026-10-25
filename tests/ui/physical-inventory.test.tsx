import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// Le récolement d'une unité par lecture des étiquettes : chaque archive lue est constatée présente, une archive d'ailleurs se constate « trouvée ici », et les non lues se déclarent introuvables avec une note.
const fixture = vi.hoisted(() => ({ epoch: 1, physicalArchives: { command: vi.fn(), archive: vi.fn(), findArchives: vi.fn() } }));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
import { PhysicalInventoryDialog } from '../../src/ui/PhysicalInventory';

const A = '8b1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', B = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', C = '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e', FOREIGN = '99999999-aaaa-4bbb-8ccc-dddddddddddd';
const unit = { id: 'u1', localisationId: 'l1', typeUnite: 'BOITE', cote: 'BOITE-14', capacite: null, conditionsConservation: null, statut: 'ACTIVE', versionLock: 0 } as never;
const archive = (id: string, cote: string, intitule: string | null = null) => ({ id, cote, intitule, support: 'PAPIER', etatPhysique: null, documentId: null, uniteStockageId: 'u1', versionLock: 0, description: null,
    dateExtremeDebut: null, dateExtremeFin: null, quantite: null, uniteQuantite: null }) as never;
const archives = [archive(A, 'DP-2015-001', 'Dossier Camara'), archive(B, 'DP-2016-002', 'Dossier Barry'), archive(C, 'DP-2017-003')];

beforeEach(() => {
    fixture.epoch += 1;
    fixture.physicalArchives.command.mockReset().mockResolvedValue({});
    fixture.physicalArchives.archive.mockReset();
    fixture.physicalArchives.findArchives.mockReset().mockResolvedValue({ items: [], page: 0, size: 20, hasMore: false });
});
afterEach(() => cleanup());

const open = (onClose = vi.fn(), onDone = vi.fn()) => { render(<PhysicalInventoryDialog unit={unit} place="Archives nationales › Salle 3" archives={archives} onClose={onClose} onDone={onDone} />); return { onClose, onDone }; };
const scan = async (text: string) => { fireEvent.change(screen.getByLabelText('Code ou cote lu'), { target: { value: text } }); fireEvent.click(screen.getByRole('button', { name: 'Constater' })); };
const verifications = () => fixture.physicalArchives.command.mock.calls.filter(c => String(c[0]).endsWith('/verifications'));

it('constate présente chaque archive lue, par sa cote ou par son QR, et compte celles qui restent', async () => {
    open();
    await scan('dp-2015-001');
    await waitFor(() => expect(fixture.physicalArchives.command).toHaveBeenCalledWith('/archives/' + A + '/verifications', expect.objectContaining({ resultat: 'PRESENTE' }), expect.any(String), 'POST'));
    expect((await screen.findByRole('status')).textContent).toBe('DP-2015-001 : présente.');
    await scan('SNAE:A:' + B.toUpperCase());
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('DP-2016-002 : présente.'));
    expect(screen.getByText('2 archives lues sur 3.')).toBeTruthy();
    expect(within(screen.getByText('DP-2015-001').closest('tr') as HTMLElement).getByText('Présente')).toBeTruthy();
    expect(within(screen.getByText('DP-2017-003').closest('tr') as HTMLElement).getByText('À vérifier')).toBeTruthy();
    // relire la même étiquette n'enregistre rien de plus
    await scan('DP-2015-001');
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('DP-2015-001 : déjà lue.'));
    expect(verifications()).toHaveLength(2);
});

it('dit pourquoi un constat échoue et laisse l’archive à vérifier', async () => {
    fixture.physicalArchives.command.mockRejectedValue(new Error('Cette archive est sortie : enregistrez son retour avant de vérifier sa présence.'));
    open();
    await scan('DP-2015-001');
    expect(await screen.findByText(/Cette archive est sortie/, { selector: 'td span' })).toBeTruthy();
    expect(screen.getByText('0 archive lue sur 3.')).toBeTruthy();
});

it('signale une archive rangée ailleurs et la constate ici d’un clic', async () => {
    fixture.physicalArchives.archive.mockResolvedValue(archive(FOREIGN, 'MT-2019-044'));
    open();
    await scan('SNAE:A:' + FOREIGN.toUpperCase());
    expect(await screen.findByText(/MT-2019-044 n’est pas rangée dans cette unité/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Constater ici' }));
    await waitFor(() => expect(fixture.physicalArchives.command).toHaveBeenCalledWith('/archives/' + FOREIGN + '/verifications', expect.objectContaining({ resultat: 'AUTRE_EMPLACEMENT', uniteConstateeId: 'u1' }), expect.any(String), 'POST'));
    expect(await screen.findByText('Constatée ici')).toBeTruthy();
    expect(screen.getByText('0 archive lue sur 3.')).toBeTruthy();
});

it('cherche une cote inconnue ici : trouvée une seule fois elle se constate ici, absente ou ambiguë elle est dite', async () => {
    open();
    await scan('XX-999');
    expect(await screen.findByText('Aucune archive de cote « XX-999 » n’est enregistrée.')).toBeTruthy();
    fixture.physicalArchives.findArchives.mockResolvedValue({ items: [archive(FOREIGN, 'XX-999'), archive('e', 'XX-999')], page: 0, size: 20, hasMore: false });
    await scan('XX-999');
    expect(await screen.findByText('Plusieurs archives portent cette cote : lisez le QR de l’étiquette.')).toBeTruthy();
    fixture.physicalArchives.findArchives.mockResolvedValue({ items: [archive(FOREIGN, 'XX-999')], page: 0, size: 20, hasMore: false });
    await scan('XX-999');
    expect(await screen.findByText(/XX-999 n’est pas rangée dans cette unité/)).toBeTruthy();
    await scan('SNAE:U:' + A.toUpperCase());
    expect(await screen.findByText('C’est l’étiquette d’une unité, pas celle d’une archive.')).toBeTruthy();
});

it('à la fin, les archives non lues se déclarent introuvables, avec une note qui dit où l’on a cherché', async () => {
    const { onClose, onDone } = open();
    await scan('DP-2015-001');
    await waitFor(() => expect(verifications()).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Terminer le récolement' }));
    expect(await screen.findByText('Non lues : 2')).toBeTruthy();
    const declare = screen.getByRole('button', { name: 'Déclarer introuvables' }) as HTMLButtonElement;
    expect(declare.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Où a-t-on cherché/), { target: { value: 'court' } });
    expect(await screen.findByText(/au moins 10 caractères/)).toBeTruthy();
    expect(declare.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Où a-t-on cherché/), { target: { value: 'Cherchées en salle 3 et au bureau' } });
    fireEvent.click(declare);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const lost = verifications().filter(c => (c[1] as { resultat: string }).resultat === 'ABSENTE');
    expect(lost.map(c => c[0]).sort()).toEqual(['/archives/' + B + '/verifications', '/archives/' + C + '/verifications']);
    expect(lost.every(c => (c[1] as { note: string }).note === 'Cherchées en salle 3 et au bureau')).toBe(true);
    expect(onDone).toHaveBeenCalled();
});

it('terminer quand tout est lu ferme sans rien proposer d’introuvable', async () => {
    const { onClose } = open();
    for (const a of ['DP-2015-001', 'DP-2016-002', 'DP-2017-003']) await scan(a);
    await waitFor(() => expect(verifications()).toHaveLength(3));
    fireEvent.click(screen.getByRole('button', { name: 'Terminer le récolement' }));
    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByText(/Non lues/)).toBeNull();
});

it('laisser à vérifier ne déclare rien introuvable', async () => {
    const { onClose } = open();
    fireEvent.click(screen.getByRole('button', { name: 'Terminer le récolement' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Laisser à vérifier' }));
    expect(onClose).toHaveBeenCalled();
    expect(verifications()).toHaveLength(0);
});

it('n’a aucune violation d’accessibilité', async () => {
    open();
    await scan('DP-2015-001');
    await screen.findByText('1 archive lue sur 3.');
    const dialog = screen.getByRole('dialog');
    const result = await axe.run(dialog, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations.map(v => v.id + ': ' + v.nodes.map(n => n.html).join(' | '))).toEqual([]);
});
