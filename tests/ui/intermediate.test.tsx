import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { IntermediateCandidate, IntermediatePassage } from '../../src/core/intermediate';

const INST = '97571d20-3f49-497e-a185-dac22208eb3f';
const DOC = '33333333-3333-4333-8333-333333333333';
const fixture = vi.hoisted(() => ({
    epoch: 1, me: null as unknown, allowed: new Set<string>(),
    retention: { intermediateCandidates: vi.fn(), intermediatePassages: vi.fn(), intermediatePassage: vi.fn(), createIntermediatePassage: vi.fn(), documentIntermediate: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
vi.mock('../../src/ui/names', () => ({
    EntityName: ({ id }: { id: string }) => <>{'Agent ' + id.slice(0, 2)}</>,
    useEntityName: (_kind: string, id: string | null | undefined) => ({ name: id ? 'Agent ' + id.slice(0, 2) : null, loading: false })
}));
import { DocumentIntermediateNotice, IntermediatePanel } from '../../src/ui/Intermediate';

const candidate = (n: number, over: Partial<IntermediateCandidate> = {}): IntermediateCandidate => ({
    eventId: `e${n}`, documentId: `d${n}`, reference: `DOC-${n}`, title: `Registre ${n}`, departmentId: null, baseDate: '2015-01-01', phaseDate: '2020-01-01', dueDate: '2025-01-01', rule: 'Registres',
    fileCount: 1, totalBytes: 1024, phaseReached: true, blockers: [], ...over
});
const passage = (): IntermediatePassage => ({
    summary: { id: 'p1', reference: 'PI-2026-000001', institutionId: INST, place: 'Magasin 3', manager: 'Mme Camara', versementReference: 'VERS-2026-04', documentCount: 2, totalBytes: 2048, createdById: '11-a', createdAt: '2026-10-10T08:00:00Z' },
    observations: null, lines: [{ rank: 1, documentId: 'd1', reference: 'DOC-1', title: 'Registre 1', baseDate: '2015-01-01', phaseDate: '2020-01-01', dueDate: '2025-01-01', rule: 'Registres', fileCount: 1, totalBytes: 1024 }]
});

beforeEach(() => {
    fixture.epoch += 1;
    fixture.allowed = new Set(['RETENTION_REVIEW', 'DISPOSITION_PROPOSE']);
    for (const fn of Object.values(fixture.retention)) fn.mockReset();
    fixture.retention.intermediateCandidates.mockResolvedValue([]);
    fixture.retention.intermediatePassages.mockResolvedValue([]);
});

it('sans document concerné ni passage, le panneau l’explique', async () => {
    render(<IntermediatePanel institutionId={INST} />);
    expect(await screen.findByText('Aucun document concerné')).toBeTruthy();
    expect(await screen.findByText('Aucun passage')).toBeTruthy();
});

it('les documents dont la phase est terminée se cochent, les autres se lisent avec leur raison', async () => {
    fixture.retention.intermediateCandidates.mockResolvedValue([candidate(1), candidate(2), candidate(3, { phaseReached: false, phaseDate: '2027-06-01', blockers: ['PHASE_NOT_REACHED'] })]);
    render(<IntermediatePanel institutionId={INST} />);
    const panel = screen.getByRole('region', { name: 'Archives intermédiaires' });
    expect(await within(panel).findByText('DOC-1')).toBeTruthy();
    expect(within(panel).getAllByText('Peut passer').length).toBe(2);
    expect(within(panel).getByText('La phase courante n’est pas terminée.')).toBeTruthy();
    expect(within(panel).getByText(/^Passage prévu le/)).toBeTruthy();
    expect((within(panel).getByLabelText('Choisir DOC-3') as HTMLInputElement).disabled).toBe(true);
    const pass = within(panel).getByRole('button', { name: 'Faire passer en archives intermédiaires' }) as HTMLButtonElement;
    expect(pass.disabled).toBe(true);                                                  // rien de choisi
    fireEvent.click(within(panel).getByLabelText('Tout choisir'));
    expect(within(panel).getByText(/^2 documents \(.*\) choisis\.$/)).toBeTruthy();
    expect(pass.disabled).toBe(false);
});

it('constater un passage exige le lieu et le responsable, puis part avec les échéances choisies et s’ouvre', async () => {
    fixture.retention.intermediateCandidates.mockResolvedValue([candidate(1), candidate(2)]);
    fixture.retention.createIntermediatePassage.mockResolvedValue(passage());
    fixture.retention.intermediatePassage.mockResolvedValue(passage());
    render(<IntermediatePanel institutionId={INST} />);
    fireEvent.click(await screen.findByLabelText('Choisir DOC-1'));
    fireEvent.click(screen.getByRole('button', { name: 'Faire passer en archives intermédiaires' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Constater le passage' }));
    expect(await within(dialog).findByText('Le lieu des archives intermédiaires est obligatoire.')).toBeTruthy();
    expect(within(dialog).getByText('Le responsable des archives intermédiaires est obligatoire.')).toBeTruthy();
    expect(fixture.retention.createIntermediatePassage).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText(/^Lieu des archives intermédiaires/), { target: { value: 'Magasin 3' } });
    fireEvent.change(within(dialog).getByLabelText(/^Responsable/), { target: { value: 'Mme Camara' } });
    fireEvent.change(within(dialog).getByLabelText(/^Référence du versement/), { target: { value: 'VERS-2026-04' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Constater le passage' }));
    await waitFor(() => expect(fixture.retention.createIntermediatePassage).toHaveBeenCalledWith(
        { institutionId: INST, place: 'Magasin 3', manager: 'Mme Camara', versementReference: 'VERS-2026-04', observations: null, eventIds: ['e1'] }, expect.any(String)));
    // le passage constaté s'ouvre, avec son lieu et son responsable
    expect(await screen.findByText('Passage en archives intermédiaires', { selector: 'h2, h3, [id]' })).toBeTruthy();
    expect(await screen.findByText('PI-2026-000001', { selector: '[class*=subtitle], p, small, span, div' })).toBeTruthy();
});

it('sans le droit de proposer une décision, on voit mais on ne peut pas faire passer', async () => {
    fixture.allowed = new Set(['RETENTION_REVIEW']);
    fixture.retention.intermediateCandidates.mockResolvedValue([candidate(1)]);
    render(<IntermediatePanel institutionId={INST} />);
    expect(await screen.findByText('DOC-1')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Faire passer en archives intermédiaires' })).toBeNull();
    expect((screen.getByLabelText('Choisir DOC-1') as HTMLInputElement).disabled).toBe(true);
});

it('les passages constatés se listent avec leur lieu, leur responsable et leur auteur par son nom', async () => {
    fixture.retention.intermediatePassages.mockResolvedValue([passage().summary]);
    render(<IntermediatePanel institutionId={INST} />);
    expect(await screen.findByText('PI-2026-000001')).toBeTruthy();
    expect(screen.getByText('Magasin 3')).toBeTruthy(); expect(screen.getByText('Mme Camara')).toBeTruthy();
    expect(screen.getByText('Versement VERS-2026-04')).toBeTruthy();
    expect(screen.getAllByText('Agent 11').length).toBeGreaterThan(0);
});

it('la fiche d’un document semi-actif dit où il est ; rien tant qu’il est en phase courante', async () => {
    fixture.retention.documentIntermediate.mockResolvedValue(null);
    const { unmount } = render(<DocumentIntermediateNotice documentId={DOC} />);
    await waitFor(() => expect(fixture.retention.documentIntermediate).toHaveBeenCalled());
    expect(screen.queryByText(/Archives intermédiaires\./)).toBeNull();
    unmount();
    fixture.retention.documentIntermediate.mockResolvedValue({ passageId: 'p1', reference: 'PI-2026-000001', place: 'Magasin 3', manager: 'Mme Camara', versementReference: null,
        passedAt: '2026-10-10T08:00:00Z', phaseDate: '2020-01-01', dueDate: '2025-01-01' });
    render(<DocumentIntermediateNotice documentId={DOC} />);
    expect(await screen.findByText(/En archives intermédiaires depuis le/)).toBeTruthy();
    expect(screen.getByText(/Magasin 3, sous la garde de Mme Camara/)).toBeTruthy();
});
