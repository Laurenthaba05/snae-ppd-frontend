import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/core/http';
import type { Elimination, EliminationCandidatePage, EliminationLine, EliminationSummary } from '../../src/core/physicalElimination';

const PV = '00000000-0000-4000-8000-0000000000e1';
const A1 = '00000000-0000-4000-8000-0000000000a1';
const A2 = '00000000-0000-4000-8000-0000000000a2';
const L1 = '00000000-0000-4000-8000-0000000000b1';
const L2 = '00000000-0000-4000-8000-0000000000b2';
const fixture = vi.hoisted(() => ({
    epoch: 1, demo: false, me: null as unknown, allowed: new Set<string>(),
    physicalArchives: { eliminations: vi.fn(), eliminationCandidates: vi.fn(), elimination: vi.fn(), createElimination: vi.fn(), addEliminationLines: vi.fn(), removeEliminationLine: vi.fn(),
        submitElimination: vi.fn(), decideEliminationLine: vi.fn(), approveElimination: vi.fn(), rejectElimination: vi.fn(), executeElimination: vi.fn(), cancelElimination: vi.fn() } as Record<string, ReturnType<typeof vi.fn>>
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
import { PhysicalEliminationSection } from '../../src/ui/PhysicalElimination';

const line = (over: Partial<EliminationLine> = {}): EliminationLine => ({ id: L1, rank: 1, archiveId: A1, status: 'INSCRITE', reference: 'REG-001', description: 'Registre des naissances', support: 'Papier',
    quantity: 2.5, unit: 'ML', storageUnit: 'BOITE-12', refusalReason: null, decidedByName: null, decidedAt: null, ...over });
const elimination = (over: Partial<Elimination> = {}): Elimination => ({ id: PV, reference: 'EP-2026-000001', title: 'Registres de l’état civil 1950', remarks: null, status: 'BROUILLON',
    createdByName: 'Awa Camara', createdAt: '2026-10-01T08:00:00Z', submittedByName: null, submittedAt: null, authority: null, visaReference: null, visaDate: null, minutes: null, visaByName: null,
    visaAt: null, destructionDate: null, method: null, place: null, operator: null, witness: null, executedByName: null, executedAt: null, fingerprint: null, cancelledByName: null,
    cancelledAt: null, cancelReason: null, version: 1, lines: [line(), line({ id: L2, rank: 2, archiveId: A2, reference: 'REG-002', description: 'Registre des décès' })], ...over });
const summary = (over: Partial<EliminationSummary> = {}): EliminationSummary => ({ id: PV, reference: 'EP-2026-000001', title: 'Registres de l’état civil 1950', status: 'BROUILLON', createdAt: '2026-10-01T08:00:00Z',
    lines: 2, accepted: 0, refused: 0, destroyed: 0, ...over });
const candidates = (): EliminationCandidatePage => ({ items: [{ archiveId: A1, reference: 'REG-001', description: 'Registre des naissances', support: 'Papier', quantity: 2.5, unit: 'ML', storageUnit: 'BOITE-12' },
    { archiveId: A2, reference: 'REG-002', description: 'Registre des décès', support: 'Papier', quantity: 1, unit: 'ML', storageUnit: 'BOITE-12' }], page: 0, size: 50, hasMore: false });

beforeEach(() => {
    fixture.epoch += 1;
    fixture.demo = false;
    fixture.allowed = new Set(['DISPOSITION_PROPOSE']);
    for (const fn of Object.values(fixture.physicalArchives)) fn.mockReset();
    fixture.physicalArchives.eliminations.mockResolvedValue([summary()]);
    fixture.physicalArchives.elimination.mockResolvedValue(elimination());
    fixture.physicalArchives.eliminationCandidates.mockResolvedValue(candidates());
});

it('rien n’apparaît sans habilitation ni en démonstration', () => {
    fixture.allowed = new Set();
    const first = render(<PhysicalEliminationSection />);
    expect(first.container.textContent).toBe('');
    first.unmount();
    fixture.allowed = new Set(['DISPOSITION_PROPOSE']);
    fixture.demo = true;
    const second = render(<PhysicalEliminationSection />);
    expect(second.container.textContent).toBe('');
});

it('liste les procès-verbaux par leur intitulé et leur état, sans identifiant', async () => {
    render(<PhysicalEliminationSection />);
    const row = (await screen.findByText('Registres de l’état civil 1950')).closest('tr')!;
    expect(within(row).getByText('En préparation')).toBeTruthy();
    expect(within(row).getByText('EP-2026-000001')).toBeTruthy();
    expect(document.body.textContent).not.toContain(PV);
});

it('constitue un procès-verbal en choisissant des archives éliminables', async () => {
    fixture.physicalArchives.createElimination.mockResolvedValue(elimination());
    render(<PhysicalEliminationSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Nouveau procès-verbal d’élimination' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^Constituer/ }));
    expect(await within(dialog).findByText(/Donnez un intitulé/)).toBeTruthy();
    expect(fixture.physicalArchives.createElimination).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText(/^Intitulé/), { target: { value: 'Registres 1950' } });
    const boxes = await within(dialog).findAllByRole('checkbox');
    fireEvent.click(boxes[0]!);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Constituer (1)' }));
    await waitFor(() => expect(fixture.physicalArchives.createElimination).toHaveBeenCalledWith('Registres 1950', null, [A1], expect.any(String)));
});

it('un procès-verbal en préparation se soumet', async () => {
    fixture.physicalArchives.submitElimination.mockResolvedValue(elimination({ status: 'SOUMIS' }));
    render(<PhysicalEliminationSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('REG-001')).toBeTruthy();
    expect(within(dialog).getAllByText('2,5 ML').length).toBe(2);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Soumettre à l’autorité' }));
    await waitFor(() => expect(fixture.physicalArchives.submitElimination).toHaveBeenCalledWith(PV, expect.any(String)));
});

it('le visa se fait ligne par ligne : accepter, refuser avec motif, puis viser', async () => {
    fixture.allowed = new Set(['DISPOSITION_VALIDATE']);
    fixture.physicalArchives.elimination.mockResolvedValue(elimination({ status: 'SOUMIS' }));
    fixture.physicalArchives.decideEliminationLine.mockResolvedValue(elimination({ status: 'SOUMIS' }));
    render(<PhysicalEliminationSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir' }));
    const dialog = await screen.findByRole('dialog');
    const first = (await within(dialog).findByText('REG-001')).closest('tr')!;
    expect((within(dialog).getByRole('button', { name: 'Viser' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(first).getByRole('button', { name: 'Accepter' }));
    await waitFor(() => expect(fixture.physicalArchives.decideEliminationLine).toHaveBeenCalledWith(PV, L1, true, null, expect.any(String)));
    const second = within(dialog).getByText('REG-002').closest('tr')!;
    fireEvent.click(within(second).getByRole('button', { name: 'Refuser' }));
    const prompt = (await screen.findAllByRole('dialog')).at(-1)!;
    fireEvent.change(within(prompt).getByLabelText(/^Motif/), { target: { value: 'Valeur historique avérée' } });
    fireEvent.click(within(prompt).getByRole('button', { name: 'Refuser l’élimination' }));
    await waitFor(() => expect(fixture.physicalArchives.decideEliminationLine).toHaveBeenCalledWith(PV, L2, false, 'Valeur historique avérée', expect.any(String)));
});

it('toutes les lignes décidées, le visa exige l’autorité, la référence et le procès-verbal', async () => {
    fixture.allowed = new Set(['DISPOSITION_VALIDATE']);
    fixture.physicalArchives.elimination.mockResolvedValue(elimination({ status: 'SOUMIS', lines: [line({ status: 'ACCEPTEE' }), line({ id: L2, rank: 2, status: 'REFUSEE', refusalReason: 'Valeur historique' })] }));
    fixture.physicalArchives.approveElimination.mockResolvedValue(elimination({ status: 'VISE' }));
    render(<PhysicalEliminationSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Viser' }));
    const visa = (await screen.findAllByRole('dialog')).at(-1)!;
    fireEvent.click(within(visa).getByRole('button', { name: 'Viser' }));
    expect(await within(visa).findByText(/Indiquez l’autorité/)).toBeTruthy();
    expect(fixture.physicalArchives.approveElimination).not.toHaveBeenCalled();
    fireEvent.change(within(visa).getByLabelText(/^Autorité/), { target: { value: 'Direction nationale des archives' } });
    fireEvent.change(within(visa).getByLabelText(/^Référence du visa/), { target: { value: 'V-2026-1' } });
    fireEvent.change(within(visa).getByLabelText(/^Procès-verbal du visa/), { target: { value: 'Une archive est conservée, l’autre éliminable.' } });
    fireEvent.click(within(visa).getByRole('button', { name: 'Viser' }));
    await waitFor(() => expect(fixture.physicalArchives.approveElimination).toHaveBeenCalledWith(PV,
        expect.objectContaining({ authority: 'Direction nationale des archives', visaReference: 'V-2026-1' }), expect.any(String)));
});

it('la destruction se constate avec un opérateur et un témoin distincts', async () => {
    fixture.allowed = new Set(['DISPOSITION_EXECUTE']);
    fixture.physicalArchives.elimination.mockResolvedValue(elimination({ status: 'VISE', visaDate: '2026-10-01', visaReference: 'V-1', authority: 'DNA', visaAt: '2026-10-01T09:00:00Z',
        lines: [line({ status: 'ACCEPTEE' })] }));
    fixture.physicalArchives.executeElimination.mockResolvedValue(elimination({ status: 'EXECUTE' }));
    render(<PhysicalEliminationSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Constater la destruction' }));
    const form = (await screen.findAllByRole('dialog')).at(-1)!;
    fireEvent.change(within(form).getByLabelText(/^Méthode/), { target: { value: 'Broyage' } });
    fireEvent.change(within(form).getByLabelText(/^Lieu/), { target: { value: 'Magasin 2' } });
    fireEvent.change(within(form).getByLabelText(/^Opérateur/), { target: { value: 'A. Camara' } });
    fireEvent.change(within(form).getByLabelText(/^Témoin/), { target: { value: 'a. camara' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Constater la destruction' }));
    expect(await within(form).findByText(/deux personnes/)).toBeTruthy();
    expect(fixture.physicalArchives.executeElimination).not.toHaveBeenCalled();
    fireEvent.change(within(form).getByLabelText(/^Témoin/), { target: { value: 'B. Diallo' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Constater la destruction' }));
    await waitFor(() => expect(fixture.physicalArchives.executeElimination).toHaveBeenCalledWith(PV,
        expect.objectContaining({ method: 'Broyage', place: 'Magasin 2', operator: 'A. Camara', witness: 'B. Diallo' }), expect.any(String)));
});

it('un refus de la règle du serveur est dit en toutes lettres', async () => {
    fixture.physicalArchives.submitElimination.mockRejectedValue(new ApiError(409, 'PHYSICAL_ELIMINATION_DUAL_CONTROL', 'conflit'));
    render(<PhysicalEliminationSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Soumettre à l’autorité' }));
    expect(await within(dialog).findByText('Celui qui vise ne peut pas être celui qui a soumis.')).toBeTruthy();
});

it('un procès-verbal exécuté montre sa destruction et son empreinte, sans action', async () => {
    fixture.allowed = new Set(['DISPOSITION_PROPOSE', 'DISPOSITION_VALIDATE', 'DISPOSITION_EXECUTE']);
    fixture.physicalArchives.elimination.mockResolvedValue(elimination({ status: 'EXECUTE', visaAt: '2026-10-01T09:00:00Z', visaDate: '2026-10-01', visaReference: 'V-1', authority: 'DNA',
        executedAt: '2026-10-05T09:00:00Z', destructionDate: '2026-10-05', method: 'Broyage', place: 'Magasin 2', operator: 'A. Camara', witness: 'B. Diallo', fingerprint: 'a'.repeat(64),
        lines: [line({ status: 'DETRUITE', decidedByName: 'Mamadou Bah' })] }));
    render(<PhysicalEliminationSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/Broyage, Magasin 2/)).toBeTruthy();
    expect(within(dialog).getByText('a'.repeat(64))).toBeTruthy();
    for (const name of ['Soumettre à l’autorité', 'Viser', 'Constater la destruction', 'Annuler le procès-verbal', 'Retirer']) expect(within(dialog).queryByRole('button', { name })).toBeNull();
});
