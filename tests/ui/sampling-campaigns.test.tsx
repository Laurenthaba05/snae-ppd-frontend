import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Campaign, CampaignLine, CampaignSummary, SamplingCandidate } from '../../src/core/sampling';

const INST = '97571d20-3f49-497e-a185-dac22208eb3f';
const CID = '11111111-1111-4111-8111-111111111111';
const fixture = vi.hoisted(() => ({
    epoch: 1, me: null as unknown, allowed: new Set<string>(),
    retention: { samplingCampaigns: vi.fn(), samplingCampaign: vi.fn(), samplingCandidates: vi.fn(), createSamplingCampaign: vi.fn(), removeSamplingLine: vi.fn(), resetSamplingLine: vi.fn(),
        adjustSamplingLine: vi.fn(), stopSamplingCampaign: vi.fn(), validateSamplingRetained: vi.fn(), executeSamplingRetained: vi.fn(), cancelSamplingCampaign: vi.fn(), documentSampling: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
vi.mock('../../src/ui/names', () => ({
    EntityName: ({ id }: { id: string }) => <>{'Agent ' + String(id).slice(0, 2)}</>,
    useEntityName: (_kind: string, id: string | null | undefined) => ({ name: id ? 'Agent ' + id.slice(0, 2) : null, loading: false })
}));
import { DocumentSamplingNotice, SamplingCampaignsPanel } from '../../src/ui/SamplingCampaigns';

const sampling = { method: 'SYSTEMATIQUE', step: 3, rate: null, modulo: null, remainder: null, note: null };
const summary = (over: Partial<CampaignSummary> = {}): CampaignSummary => ({ id: CID, reference: 'TR-2026-000001', institutionId: INST, title: 'Registres de 1980 à 1989', status: 'BROUILLON', sampling,
    ruleLabel: 'REG — Registres à trier', lines: 4, retained: 1, eliminated: 3, manual: 0, createdById: '11-a', createdAt: '2026-10-10T08:00:00Z', stoppedAt: null, version: 0, ...over });
const line = (n: number, over: Partial<CampaignLine> = {}): CampaignLine => ({ id: `l${n}`, rank: n, eventId: `e${n}`, documentId: `d${n}`, reference: `DOC-${n}`, title: `Registre ${n}`, baseDate: '1980-01-01',
    documentDate: '1980-03-01', retained: n === 1, origin: 'METHODE', reason: null, essential: false, actionId: null, outcome: n === 1 ? 'RETENU' : 'A_ELIMINER', ...over });
const campaign = (over: Partial<Campaign> = {}, sum: Partial<CampaignSummary> = {}, lines: CampaignLine[] = [line(1), line(2), line(3), line(4)]): Campaign => ({
    summary: summary(sum), observations: null, seed: 'ab'.repeat(16), fingerprint: null, stoppedById: null, conservationValidatedById: null, conservationValidatedAt: null,
    conservationExecutedById: null, conservationExecutedAt: null, cancelledById: null, cancelledAt: null, cancellationReason: null, description: 'un document sur 3', lines, ...over });
const candidate = (n: number, over: Partial<SamplingCandidate> = {}): SamplingCandidate => ({ eventId: `e${n}`, documentId: `d${n}`, reference: `DOC-${n}`, title: `Registre ${n}`, departmentId: null,
    baseDate: '1980-01-01', dueDate: '2026-01-01', rule: 'REG — Registres à trier', ruleVersionId: 'v1', ruleVersionNumber: 1, sampling, essential: false, blockers: [], campaignId: null, campaignReference: null, ...over });

beforeEach(() => {
    fixture.epoch += 1;
    fixture.allowed = new Set(['DISPOSITION_PROPOSE', 'DISPOSITION_VALIDATE', 'DISPOSITION_EXECUTE']);
    for (const fn of Object.values(fixture.retention)) fn.mockReset();
    fixture.retention.samplingCampaigns.mockResolvedValue([]);
    fixture.retention.samplingCandidates.mockResolvedValue([]);
});

const opened = async (c: Campaign) => {
    fixture.retention.samplingCampaigns.mockResolvedValue([c.summary]);
    fixture.retention.samplingCampaign.mockResolvedValue(c);
    render(<SamplingCampaignsPanel institutionId={INST} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir' }));
    return await screen.findByRole('dialog');
};
const lastDialog = async () => { const dialogs = await screen.findAllByRole('dialog'); return dialogs[dialogs.length - 1]!; };

it('sans campagne, l’explique et propose d’en constituer une à qui peut proposer', async () => {
    render(<SamplingCampaignsPanel institutionId={INST} />);
    expect(await screen.findByText('Aucune campagne de tri')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Nouvelle campagne de tri' })).toBeTruthy();
});

it('la liste dit la méthode, la part retenue et l’auteur par son nom', async () => {
    fixture.retention.samplingCampaigns.mockResolvedValue([summary({ status: 'ARRETEE' })]);
    render(<SamplingCampaignsPanel institutionId={INST} />);
    expect(await screen.findByText('TR-2026-000001')).toBeTruthy();
    expect(screen.getByText('Systématique (un sur N)')).toBeTruthy();
    expect(screen.getByText('1 sur 4 (25 %)')).toBeTruthy();
    expect(screen.getByText('Arrêtée')).toBeTruthy();
    expect(screen.getByText('Agent 11')).toBeTruthy();
});

it('constituer : règle, méthode dite, document bloqué non cochable, création avec les échéances choisies', async () => {
    fixture.retention.samplingCandidates.mockResolvedValue([candidate(1), candidate(2), candidate(3, { blockers: ['ACTIVE_LEGAL_HOLD'] }), candidate(4, { blockers: ['ALREADY_IN_CAMPAIGN'], campaignReference: 'TR-2026-000009' })]);
    fixture.retention.createSamplingCampaign.mockResolvedValue(campaign());
    fixture.retention.samplingCampaign.mockResolvedValue(campaign());
    render(<SamplingCampaignsPanel institutionId={INST} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Nouvelle campagne de tri' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Constituer la campagne' }));
    expect(await within(dialog).findByText('Choisissez la règle dont la méthode de tri s’applique.')).toBeTruthy();
    expect(fixture.retention.createSamplingCampaign).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText(/^Règle appliquée/), { target: { value: 'v1' } });
    expect(within(dialog).getByText(/Un document sur 3, dans l’ordre chronologique/)).toBeTruthy();
    expect(within(dialog).getByText('Un gel juridique actif bloque le document.')).toBeTruthy();
    expect(within(dialog).getByText('Déjà dans la campagne TR-2026-000009.')).toBeTruthy();
    expect((within(dialog).getByLabelText('Choisir DOC-3') as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(within(dialog).getByLabelText('Tout choisir'));
    expect(within(dialog).getByText('2 documents choisis.')).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText(/^Intitulé de la campagne/), { target: { value: 'Registres de 1980 à 1989' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Constituer la campagne' }));
    await waitFor(() => expect(fixture.retention.createSamplingCampaign).toHaveBeenCalledWith(INST, 'v1', 'Registres de 1980 à 1989', null, ['e1', 'e2'], expect.any(String)));
    expect(await screen.findByText('Campagne de tri')).toBeTruthy();
});

it('un brouillon montre la décision de la méthode, permet d’écarter avec un motif, puis s’arrête', async () => {
    fixture.retention.adjustSamplingLine.mockResolvedValue(campaign());
    fixture.retention.stopSamplingCampaign.mockResolvedValue(campaign({}, { status: 'ARRETEE' }));
    const dialog = await opened(campaign());
    expect(within(dialog).getByText('Un document sur 3, dans l’ordre chronologique.', { exact: false })).toBeTruthy();
    expect(within(dialog).getByText('Retenu dans l’échantillon')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Écarter DOC-1' }));
    const reason = await lastDialog();
    fireEvent.click(within(reason).getByRole('button', { name: 'Écarter' }));
    expect(await within(reason).findByText(/Le motif est obligatoire/)).toBeTruthy();
    fireEvent.change(within(reason).getByLabelText(/^Motif/), { target: { value: 'Registre déjà numérisé et conservé ailleurs' } });
    fireEvent.click(within(reason).getByRole('button', { name: 'Écarter' }));
    await waitFor(() => expect(fixture.retention.adjustSamplingLine).toHaveBeenCalledWith(CID, 'l1', false, 'Registre déjà numérisé et conservé ailleurs', expect.any(String)));
    await waitFor(() => expect(screen.queryByText('Écarter de l’échantillon')).toBeNull());
    fireEvent.click(within(dialog).getByRole('button', { name: 'Arrêter la campagne' }));
    const stop = await lastDialog();
    expect(within(stop).getByText(/La décision est figée/)).toBeTruthy();
    fireEvent.click(within(stop).getByRole('button', { name: 'Arrêter la campagne' }));
    await waitFor(() => expect(fixture.retention.stopSamplingCampaign).toHaveBeenCalledWith(CID, expect.any(String)));
});

it('un document essentiel n’offre pas d’écarter, un ajustement se rend à la méthode', async () => {
    const dialog = await opened(campaign({}, { manual: 1 }, [line(1, { essential: true }), line(2, { origin: 'MANUEL', retained: true, reason: 'Période de l’indépendance', outcome: 'RETENU' })]));
    expect(within(dialog).queryByRole('button', { name: 'Écarter DOC-1' })).toBeNull();
    expect(within(dialog).getByText('Document essentiel')).toBeTruthy();
    expect(within(dialog).getByText('Ajusté : Période de l’indépendance')).toBeTruthy();
    fixture.retention.resetSamplingLine.mockResolvedValue(campaign());
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rendre DOC-2 à la méthode' }));
    await waitFor(() => expect(fixture.retention.resetSamplingLine).toHaveBeenCalledWith(CID, 'l2', expect.any(String)));
});

it('la conservation de l’échantillon se valide avec la décision et le procès-verbal, puis s’exécute', async () => {
    const stopped = campaign({ fingerprint: 'f'.repeat(64), stoppedById: '22-b' }, { status: 'ARRETEE' },
        [line(1, { outcome: 'CONSERVATION_PROPOSEE', actionId: 'a1' }), line(2, { outcome: 'A_ELIMINER' })]);
    fixture.retention.validateSamplingRetained.mockResolvedValue(stopped);
    const dialog = await opened(stopped);
    expect(within(dialog).queryByRole('button', { name: 'Conserver définitivement l’échantillon' })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Valider la conservation de l’échantillon' }));
    const validate = await lastDialog();
    fireEvent.click(within(validate).getByRole('button', { name: 'Valider la conservation' }));
    expect(await within(validate).findByText('La référence de la décision est obligatoire.')).toBeTruthy();
    fireEvent.change(within(validate).getByLabelText(/^Référence de la décision/), { target: { value: 'DEC-2026-14' } });
    fireEvent.change(within(validate).getByLabelText(/^Procès-verbal/), { target: { value: 'Décision de la commission.' } });
    fireEvent.click(within(validate).getByRole('button', { name: 'Valider la conservation' }));
    await waitFor(() => expect(fixture.retention.validateSamplingRetained).toHaveBeenCalledWith(CID, 'DEC-2026-14', 'Décision de la commission.', expect.any(String)));
});

it('l’exécution dit combien de documents sont conservés et nomme les échecs', async () => {
    const validated = campaign({ conservationValidatedById: '33-c' }, { status: 'ARRETEE' }, [line(1, { outcome: 'CONSERVATION_VALIDEE', actionId: 'a1' }), line(2, { outcome: 'CONSERVATION_VALIDEE', actionId: 'a2', retained: true })]);
    fixture.retention.executeSamplingRetained.mockResolvedValue({ campaign: validated, done: 1, failures: ['Ligne 2 (DOC-2) : DOCUMENT_ESSENTIAL'] });
    const dialog = await opened(validated);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Conserver définitivement l’échantillon' }));
    expect(await within(dialog).findByText(/1 document a été conservé définitivement\. 1 ligne a échoué/)).toBeTruthy();
    expect(within(dialog).getByText('Ligne 2 (DOC-2) : DOCUMENT_ESSENTIAL')).toBeTruthy();
});

it('sans le droit de proposer, aucune modification ; la fiche d’un document dit ce que la campagne a décidé', async () => {
    fixture.allowed = new Set(['DISPOSITION_VALIDATE']);
    const dialog = await opened(campaign());
    expect(within(dialog).queryByRole('button', { name: 'Arrêter la campagne' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Écarter DOC-1' })).toBeNull();
});

it('la fiche d’un document soumis à un tri dit la décision, son origine et où elle en est', async () => {
    fixture.retention.documentSampling.mockResolvedValue({ campaignId: CID, campaignReference: 'TR-2026-000001', campaignStatus: 'ARRETEE', method: 'un document sur 3', retained: false,
        origin: 'MANUEL', reason: 'Doublon d’un registre conservé', essential: false, outcome: 'EN_BORDEREAU' });
    render(<DocumentSamplingNotice documentId="d1" />);
    expect(await screen.findByText('Soumis à un tri.')).toBeTruthy();
    expect(screen.getByText(/non retenu \(élimination\) — ajusté à la main/)).toBeTruthy();
    expect(screen.getByText(/Au bordereau d’élimination/)).toBeTruthy();
    expect(screen.getByText('Motif : Doublon d’un registre conservé')).toBeTruthy();
});
