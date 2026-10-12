import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DigitizationElement, DigitizationElementStatus, QualityAnalysis, QualityPage, TransitionOption } from '../../src/core/types';
const fixture = vi.hoisted(() => ({
    epoch: 1, me: null as unknown, allowed: new Set<string>(['DIGITIZATION_READ', 'DIGITIZATION_QC']),
    digitization: { elementWorkflow: vi.fn(), elementTransitions: vi.fn(), pagesByElement: vi.fn(), command: vi.fn(), qualityAnalysis: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
import { QualityPanel } from '../../src/ui/QualityPanel';
import { ElementWorkflowPanel } from '../../src/ui/ElementWorkflow';

const ID = '00000000-0000-4000-8000-0000000000';
const element = (statut: DigitizationElementStatus = 'CONTROLE_QUALITE'): DigitizationElement => ({ id: ID + '01', projetNumerisationId: ID + '02', archivePhysiqueId: null, documentId: ID + '03', ordre: null, descriptionSource: 'Registre', statut, dateDebut: null, dateFin: null, versionLock: 1 });
const metrics = { width: 2480, height: 3508, sharpness: 126.4, contrast: 29.9, brightness: 231.9, inkRatio: 0.14, skewDegrees: -2.5 };
const good = { ...metrics, sharpness: 1836, contrast: 46, skewDegrees: 0 };
const page = (n: number, extra: Partial<QualityPage> = {}): QualityPage => ({ numeroPage: n, fichierId: ID + '1' + n, jobState: 'DONE', errorCode: null, analyzed: true, metrics: good, issues: [], flagged: false, ...extra });
const blur = { code: 'BLUR', message: 'Image floue (netteté 126, minimum 250).' };
const skew = { code: 'SKEW', message: 'Page inclinée de 2,5° (maximum 1,5°).' };
const analysis = (pages: QualityPage[], extra: Partial<QualityAnalysis> = {}): QualityAnalysis => ({ enabled: true, pages, flagged: pages.filter(p => p.flagged).map(p => p.numeroPage!), pending: 0, sample: [], sampleRate: 0.1, sampleMinimum: 5, ...extra });
const option = (vers: DigitizationElementStatus, extra: Partial<TransitionOption> = {}): TransitionOption => ({ vers, permission: 'DIGITIZATION_QC', peutAgir: true, autorise: true, motifRequis: false, renvoi: false, blockers: [], ...extra });

beforeEach(() => {
    fixture.allowed = new Set(['DIGITIZATION_READ', 'DIGITIZATION_QC']);
    fixture.digitization.command.mockReset().mockResolvedValue({ files: 3, queued: 1 });
    fixture.digitization.qualityAnalysis.mockReset();
    fixture.digitization.pagesByElement.mockReset().mockResolvedValue([]);
    fixture.digitization.elementTransitions.mockReset().mockResolvedValue([]);
    fixture.digitization.elementWorkflow.mockReset();
});
afterEach(() => { vi.useRealTimers(); });

it('liste les pages signalées avec leurs mesures, et l’échantillon à contrôler visuellement', async () => {
    fixture.digitization.qualityAnalysis.mockResolvedValue(analysis([page(1), page(2, { flagged: true, metrics, issues: [blur, skew] }), page(3), page(4)], { sample: [1, 2, 4] }));
    render(<QualityPanel element={element()} />);
    expect(await screen.findByText('4 / 4 pages analysées')).toBeTruthy();
    expect(screen.getByText('1 signalée')).toBeTruthy();
    expect(screen.getByText('Image floue (netteté 126, minimum 250).')).toBeTruthy();
    expect(screen.getByText('Page inclinée de 2,5° (maximum 1,5°).')).toBeTruthy();
    expect(screen.getByText(/netteté 126 · inclinaison -2,5°/)).toBeTruthy();
    expect(screen.getByText(/Échantillon à contrôler visuellement \(10 % des pages, au moins 5\)/)).toBeTruthy();
    expect(screen.getByText('p. 1, p. 2, p. 4')).toBeTruthy();
    expect(screen.getByText(/dont les pages signalées/)).toBeTruthy();
});

it('« Renvoyer » transmet les pages à rescanner, sans la page presque blanche', async () => {
    fixture.digitization.qualityAnalysis.mockResolvedValue(analysis([page(1, { flagged: true, issues: [skew] }), page(2, { flagged: true, issues: [{ code: 'BLANK_PAGE', message: 'Page presque blanche.' }] }), page(3, { flagged: true, issues: [blur] })]));
    const onSendBack = vi.fn();
    render(<QualityPanel element={element()} onSendBack={onSendBack} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Renvoyer les 2 pages signalées' }));
    expect(onSendBack).toHaveBeenCalledWith([1, 3]);
});

it('désactivée et sans mesure : rien n’est affiché ; désactivée avec mesures : les résultats restent sans bouton d’analyse', async () => {
    fixture.digitization.qualityAnalysis.mockResolvedValue(analysis([page(1, { analyzed: false, jobState: null, metrics: null })], { enabled: false }));
    const view = render(<QualityPanel element={element()} />);
    await waitFor(() => expect(fixture.digitization.qualityAnalysis).toHaveBeenCalled());
    await waitFor(() => expect(view.container.querySelector('.quality')).toBeNull());
    view.unmount();
    fixture.digitization.qualityAnalysis.mockResolvedValue(analysis([page(1, { flagged: true, issues: [blur], metrics })], { enabled: false }));
    render(<QualityPanel element={element()} />);
    expect(await screen.findByText(/désactivée sur ce serveur/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Analyser|Relancer/ })).toBeNull();
});

it('lance l’analyse des pages sans mesure avec l’habilitation de contrôle qualité', async () => {
    fixture.digitization.qualityAnalysis.mockResolvedValue(analysis([page(1), page(2, { analyzed: false, jobState: null, metrics: null }), page(3, { analyzed: false, jobState: 'FAILED', errorCode: 'IMAGE_PIXEL_LIMIT', metrics: null })]));
    render(<QualityPanel element={element()} />);
    expect(await screen.findByText(/Page 3 : image trop grande pour le moteur/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Relancer l’analyse' }));
    await waitFor(() => expect(fixture.digitization.command).toHaveBeenCalledTimes(1));
    expect(fixture.digitization.command.mock.calls[0]![0]).toBe(`/elements/${ID}01/quality-analysis/run`);
    await waitFor(() => expect(fixture.digitization.qualityAnalysis).toHaveBeenCalledTimes(2));
});

it('sans l’habilitation de contrôle qualité, aucun bouton d’analyse', async () => {
    fixture.allowed = new Set(['DIGITIZATION_READ']);
    fixture.digitization.qualityAnalysis.mockResolvedValue(analysis([page(1, { analyzed: false, jobState: null, metrics: null })]));
    render(<QualityPanel element={element()} />);
    await screen.findByText('0 / 1 page analysée');
    expect(screen.queryByRole('button', { name: /Analyser|Relancer/ })).toBeNull();
});

it('rafraîchit toutes les huit secondes tant que des analyses sont en attente, puis s’arrête', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fixture.digitization.qualityAnalysis.mockResolvedValueOnce(analysis([page(1), page(2, { analyzed: false, jobState: 'RUNNING', metrics: null })], { pending: 1 }));
    render(<QualityPanel element={element()} />);
    expect(await screen.findByText('1 en attente')).toBeTruthy();
    fixture.digitization.qualityAnalysis.mockResolvedValue(analysis([page(1), page(2)]));
    await act(async () => { await vi.advanceTimersByTimeAsync(8100); });
    expect(await screen.findByText('2 / 2 pages analysées')).toBeTruthy();
    const calls = fixture.digitization.qualityAnalysis.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(20000); });
    expect(fixture.digitization.qualityAnalysis.mock.calls.length).toBe(calls);
});

it('dans le parcours de traitement, « Renvoyer les pages signalées » ouvre le renvoi avec les pages déjà cochées', async () => {
    const el = element('CONTROLE_QUALITE');
    fixture.digitization.elementWorkflow.mockResolvedValue({ element: el, depuis: null, options: [
        option('METADONNEES', { autorise: false, blockers: [{ code: 'QUALITY_FLAGGED', message: 'L’analyse automatique signale 2 page(s) à examiner (p. 1, p. 3).', overridable: true }] }),
        option('NUMERISATION', { renvoi: true, motifRequis: true })] });
    fixture.digitization.qualityAnalysis.mockResolvedValue(analysis([page(1, { flagged: true, issues: [skew] }), page(2), page(3, { flagged: true, issues: [blur] })]));
    fixture.digitization.pagesByElement.mockResolvedValue([1, 2, 3].map(n => ({ id: 'p' + n, numeroPage: n, statut: 'PRESENTE' })));
    render(<ElementWorkflowPanel element={el} onChanged={vi.fn()} />);
    expect(await screen.findByText(/L’analyse automatique signale 2 page\(s\)/)).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Renvoyer les 2 pages signalées' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByLabelText('Page 2');
    expect((within(dialog).getByLabelText('Page 1') as HTMLInputElement).checked).toBe(true);
    expect((within(dialog).getByLabelText('Page 2') as HTMLInputElement).checked).toBe(false);
    expect((within(dialog).getByLabelText('Page 3') as HTMLInputElement).checked).toBe(true);
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Pages 1 et 3 signalées par l’analyse' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Renvoyer vers « numérisation »' }));
    await waitFor(() => expect(fixture.digitization.command).toHaveBeenCalledTimes(1));
    expect(fixture.digitization.command.mock.calls[0]![1]).toEqual({ vers: 'NUMERISATION', etapeAttendue: 'CONTROLE_QUALITE', motif: 'Pages 1 et 3 signalées par l’analyse', pagesARescanner: [1, 3] });
});
