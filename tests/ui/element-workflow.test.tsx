import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { DigitizationElement, DigitizationElementStatus, ElementWorkflow, PipelineStage, TransitionOption } from '../../src/core/types';
const fixture = vi.hoisted(() => ({
    epoch: 1, me: null as unknown, allowed: new Set<string>(['DIGITIZATION_READ', 'DIGITIZATION_MANAGE', 'DIGITIZATION_SCAN', 'DIGITIZATION_OCR', 'DIGITIZATION_QC', 'DIGITIZATION_VALIDATE']),
    digitization: { elementWorkflow: vi.fn(), elementTransitions: vi.fn(), pagesByElement: vi.fn(), command: vi.fn(), queue: vi.fn(), qualityAnalysis: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
const navigate = vi.hoisted(() => vi.fn());
vi.mock('../../src/ui/navigation', () => ({ navigate }));
import { ElementWorkflowPanel } from '../../src/ui/ElementWorkflow';
import { PipelineBoard } from '../../src/ui/PipelineBoard';

const ID = '00000000-0000-4000-8000-0000000000';
const element = (statut: DigitizationElementStatus, extra: Partial<DigitizationElement> = {}): DigitizationElement => ({ id: ID + '01', projetNumerisationId: ID + '02', archivePhysiqueId: null, documentId: ID + '03', ordre: null, descriptionSource: 'Registre 1964', statut, dateDebut: null, dateFin: null, versionLock: 3, ...extra });
const option = (vers: DigitizationElementStatus, extra: Partial<TransitionOption> = {}): TransitionOption => ({ vers, permission: 'DIGITIZATION_SCAN', peutAgir: true, autorise: true, motifRequis: false, renvoi: false, blockers: [], ...extra });
const workflow = (el: DigitizationElement, options: TransitionOption[], depuis: string | null = '2026-10-01T09:00:00Z'): ElementWorkflow => ({ element: el, depuis, options });
const onChanged = vi.fn();
const LONG = 'Motif suffisamment détaillé';

beforeEach(() => {
    fixture.allowed = new Set(['DIGITIZATION_READ', 'DIGITIZATION_MANAGE', 'DIGITIZATION_SCAN', 'DIGITIZATION_OCR', 'DIGITIZATION_QC', 'DIGITIZATION_VALIDATE']);
    onChanged.mockReset(); navigate.mockReset();
    fixture.digitization.command.mockReset().mockResolvedValue({});
    fixture.digitization.elementTransitions.mockReset().mockResolvedValue([]);
    fixture.digitization.pagesByElement.mockReset().mockResolvedValue([]);
    fixture.digitization.elementWorkflow.mockReset();
    fixture.digitization.queue.mockReset().mockResolvedValue([]);
    fixture.digitization.qualityAnalysis.mockReset().mockResolvedValue({ enabled: false, pages: [], flagged: [], pending: 0, sample: [], sampleRate: 0.1, sampleMinimum: 5 });
});

it('montre la frise, l’étape courante et le passage suivant ; un obstacle dérogeable demande un motif avant d’envoyer le passage', async () => {
    const el = element('NUMERISATION');
    fixture.digitization.elementWorkflow.mockResolvedValue(workflow(el, [
        option('OCR_INDEXATION', { motifRequis: true, blockers: [{ code: 'PAGES_INCOMPLETE', message: 'Contrôle des pages non conforme (pages manquantes : 3).', overridable: true }] }),
        option('CONTROLE_QUALITE', { motifRequis: true }), option('SUSPENDU', { permission: 'DIGITIZATION_MANAGE', motifRequis: true }), option('ANNULE', { permission: 'DIGITIZATION_MANAGE', motifRequis: true })]));
    render(<ElementWorkflowPanel element={el} onChanged={onChanged} />);
    const next = await screen.findByRole('button', { name: 'Terminer la numérisation' });
    expect(screen.getByText('Contrôle des pages non conforme (pages manquantes : 3).')).toBeTruthy();
    expect(screen.getByText(/Dérogation possible/)).toBeTruthy();
    const current = screen.getAllByRole('listitem').find(li => li.getAttribute('aria-current') === 'step')!;
    expect(current.textContent).toContain('Numérisation');
    expect(screen.getByRole('button', { name: 'Passer sans OCR' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Suspendre l’élément' })).toBeTruthy();

    fireEvent.click(next);
    const dialog = await screen.findByRole('dialog');
    const submit = within(dialog).getByRole('button', { name: 'Continuer malgré les écarts' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: LONG } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() => expect(fixture.digitization.command).toHaveBeenCalledTimes(1));
    const [path, body, key, method] = fixture.digitization.command.mock.calls[0]!;
    expect(path).toBe(`/elements/${el.id}/transitions`);
    expect(body).toEqual({ vers: 'OCR_INDEXATION', etapeAttendue: 'NUMERISATION', motif: LONG, pagesARescanner: [] });
    expect(typeof key).toBe('string');
    expect(method).toBe('POST');
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
});

it('un passage sans obstacle ni motif part directement ; un obstacle non dérogeable ou une habilitation manquante désactive le bouton', async () => {
    const el = element('CONTROLE_QUALITE');
    fixture.digitization.elementWorkflow.mockResolvedValue(workflow(el, [
        option('METADONNEES', { permission: 'DIGITIZATION_QC', autorise: false, blockers: [{ code: 'QC_MISSING', message: 'Aucun contrôle qualité n’a été consigné depuis l’entrée dans cette étape.', overridable: false }] }),
        option('NUMERISATION', { permission: 'DIGITIZATION_QC', renvoi: true, motifRequis: true }),
        option('OCR_INDEXATION', { permission: 'DIGITIZATION_QC', renvoi: true, motifRequis: true, peutAgir: false, autorise: false })]));
    render(<ElementWorkflowPanel element={el} onChanged={onChanged} />);
    const accept = await screen.findByRole('button', { name: 'Accepter la qualité' }) as HTMLButtonElement;
    expect(accept.disabled).toBe(true);
    expect(screen.getByText(/Aucun contrôle qualité n’a été consigné/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Renvoyer vers « ocr et indexation »' }) as HTMLButtonElement).title).toContain('Habilitation requise');
    expect((screen.getByRole('button', { name: 'Renvoyer vers « ocr et indexation »' }) as HTMLButtonElement).disabled).toBe(true);
    expect(fixture.digitization.command).not.toHaveBeenCalled();
});

it('un renvoi vers la numérisation propose les pages à rescanner et les transmet avec le motif', async () => {
    const el = element('CONTROLE_QUALITE');
    fixture.digitization.elementWorkflow.mockResolvedValue(workflow(el, [option('NUMERISATION', { permission: 'DIGITIZATION_QC', renvoi: true, motifRequis: true })]));
    fixture.digitization.pagesByElement.mockResolvedValue([{ id: 'p1', numeroPage: 1, statut: 'PRESENTE' }, { id: 'p2', numeroPage: 2, statut: 'PRESENTE' }, { id: 'p3', numeroPage: 3, statut: 'VIDE' }]);
    render(<ElementWorkflowPanel element={el} onChanged={onChanged} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Renvoyer vers « numérisation »' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByLabelText('Page 2');
    expect(within(dialog).queryByLabelText('Page 3')).toBeNull();   // une page blanche n'est pas à rescanner
    fireEvent.click(within(dialog).getByLabelText('Page 2'));
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Page 2 floue et coupée' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Renvoyer vers « numérisation »' }));
    await waitFor(() => expect(fixture.digitization.command).toHaveBeenCalledTimes(1));
    expect(fixture.digitization.command.mock.calls[0]![1]).toEqual({ vers: 'NUMERISATION', etapeAttendue: 'CONTROLE_QUALITE', motif: 'Page 2 floue et coupée', pagesARescanner: [2] });
});

it('une erreur du serveur reste affichée dans la fenêtre sans la fermer', async () => {
    const el = element('RECEPTION');
    fixture.digitization.elementWorkflow.mockResolvedValue(workflow(el, [option('NUMERISATION')]));
    fixture.digitization.command.mockRejectedValue(new Error('Cet élément n’est plus à l’étape attendue.'));
    render(<ElementWorkflowPanel element={el} onChanged={onChanged} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Démarrer la numérisation' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Démarrer la numérisation' }));
    await within(dialog).findByText('Cet élément n’est plus à l’étape attendue.');
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(onChanged).not.toHaveBeenCalled();
});

it('un élément suspendu indique où il reprendra ; terminé ou annulé, aucun passage n’est proposé', async () => {
    const suspended = element('SUSPENDU', { etapeSuspension: 'OCR_INDEXATION' });
    fixture.digitization.elementWorkflow.mockResolvedValue(workflow(suspended, [option('OCR_INDEXATION', { permission: 'DIGITIZATION_MANAGE' }), option('ANNULE', { permission: 'DIGITIZATION_MANAGE', motifRequis: true })]));
    const view = render(<ElementWorkflowPanel element={suspended} onChanged={onChanged} />);
    expect(await screen.findByText(/il reprendra à l’étape « ocr et indexation »/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reprendre : ocr et indexation' })).toBeTruthy();
    view.unmount();

    const done = element('TERMINE');
    fixture.digitization.elementWorkflow.mockResolvedValue(workflow(done, []));
    render(<ElementWorkflowPanel element={done} onChanged={onChanged} />);
    expect(await screen.findByText(/prêt pour versement et n’est plus modifiable/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Renvoyer|Suspendre|Annuler|Terminer/ })).toBeNull();
});

it('le journal des étapes se déplie, du plus récent au plus ancien, avec motif et dérogation', async () => {
    const el = element('OCR_INDEXATION');
    fixture.digitization.elementWorkflow.mockResolvedValue(workflow(el, []));
    fixture.digitization.elementTransitions.mockResolvedValue([
        { id: 't1', elementId: el.id, de: null, vers: 'RECEPTION', motif: null, acteurId: null, automatique: false, contexte: {}, createdAt: '2026-10-01T09:00:00Z' },
        { id: 't2', elementId: el.id, de: 'RECEPTION', vers: 'NUMERISATION', motif: null, acteurId: null, automatique: true, contexte: {}, createdAt: '2026-10-01T10:00:00Z' },
        { id: 't3', elementId: el.id, de: 'NUMERISATION', vers: 'OCR_INDEXATION', motif: LONG, acteurId: null, automatique: false, contexte: { derogations: [{ code: 'PAGES_INCOMPLETE', message: 'pages manquantes : 3' }] }, createdAt: '2026-10-02T10:00:00Z' }]);
    render(<ElementWorkflowPanel element={el} onChanged={onChanged} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Journal des étapes' }));
    await waitFor(() => expect(document.querySelectorAll('.wf-history li')).toHaveLength(3));
    const items = [...document.querySelectorAll('.wf-history li')];
    expect(items[0]!.textContent).toContain(LONG);
    expect(items[0]!.textContent).toContain('Dérogation : pages manquantes : 3');
    expect(items[1]!.textContent).toContain('automatique');
    expect(items[2]!.textContent).toContain('Création');
});

const sealing = (extra: Partial<NonNullable<ElementWorkflow['scellement']>> = {}): NonNullable<ElementWorkflow['scellement']> =>
    ({ versionId: ID + '09', numeroVersion: 1, scellee: false, empreinte: null, dateScellement: null, pages: 12, fichiers: 12, ecartes: 1, ...extra });

it('la validation finale annonce qu’elle scelle la version, et ses obstacles de scellement bloquent le bouton', async () => {
    const el = element('VALIDATION');
    fixture.digitization.elementWorkflow.mockResolvedValue({ ...workflow(el, [
        option('TERMINE', { permission: 'DIGITIZATION_VALIDATE', blockers: [
            { code: 'SEAL_PERMISSION', message: 'Cette étape scelle la version : la permission « sceller une version » est requise sur ce document.', overridable: false },
            { code: 'SEAL_PERMISSION', message: 'Cette étape scelle la version : la permission « valider un fichier maître » est requise sur ce document.', overridable: false }] }),
        option('METADONNEES', { permission: 'DIGITIZATION_VALIDATE', motifRequis: true, renvoi: true })]), scellement: sealing() });
    render(<ElementWorkflowPanel element={el} onChanged={onChanged} />);
    const button = await screen.findByRole('button', { name: 'Valider : prêt pour versement' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText(/sceller une version » est requise/)).toBeTruthy();
    expect(screen.getByText(/valider un fichier maître » est requise/)).toBeTruthy();
    expect(document.querySelector('p.wf-seal')!.textContent).toContain('Version n° 1 à sceller : 12 pages, 1 fichier écarté');
    expect(screen.getAllByText(/Valider scelle la version du document/).length).toBeGreaterThan(0);
});

it('quand la validation est possible, la fenêtre de confirmation rappelle le scellement', async () => {
    const el = element('VALIDATION');
    fixture.digitization.elementWorkflow.mockResolvedValue({ ...workflow(el, [option('TERMINE', { permission: 'DIGITIZATION_VALIDATE' })]), scellement: sealing() });
    render(<ElementWorkflowPanel element={el} onChanged={onChanged} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Valider : prêt pour versement' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/chaque page devient un maître de conservation/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Valider : prêt pour versement' }));
    await waitFor(() => expect(fixture.digitization.command).toHaveBeenCalledTimes(1));
    expect(fixture.digitization.command.mock.calls[0]![1]).toMatchObject({ vers: 'TERMINE', etapeAttendue: 'VALIDATION' });
});

it('un élément prêt pour versement montre la version scellée, et le journal décrit le scellement', async () => {
    const el = element('TERMINE', { dateFin: '2026-10-04T10:00:00Z' });
    fixture.digitization.elementWorkflow.mockResolvedValue({ ...workflow(el, []), scellement: sealing({ scellee: true, empreinte: 'abcdef012345' + '0'.repeat(52), dateScellement: '2026-10-04T10:00:00Z' }) });
    fixture.digitization.elementTransitions.mockResolvedValue([
        { id: 't1', elementId: el.id, de: 'VALIDATION', vers: 'TERMINE', motif: null, acteurId: null, automatique: false, createdAt: '2026-10-04T10:00:00Z',
            contexte: { scellement: { versionId: ID + '09', numeroVersion: 1, empreinte: 'abcdef012345' + '0'.repeat(52), pages: 12, fichiers: 12, ecartes: 1 } } }]);
    render(<ElementWorkflowPanel element={el} onChanged={onChanged} />);
    await waitFor(() => expect(document.querySelector('p.wf-seal')).toBeTruthy());
    const line = document.querySelector('p.wf-seal')!;
    expect(line.textContent).toContain('Version n° 1 scellée : 12 pages, 1 fichier écarté');
    expect(line.textContent).toContain('abcdef012345…');
    expect(screen.queryByText(/Valider scelle la version du document/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Journal des étapes' }));
    await waitFor(() => expect(document.querySelector('.wf-history .wf-seal')).toBeTruthy());
    expect(document.querySelector('.wf-history .wf-seal')!.textContent).toContain('empreinte abcdef012345…');
});

it('le tableau d’avancement affiche les comptes par étape et ouvre la file d’une étape', async () => {
    const stage = (statut: DigitizationElementStatus, elements: number, plusAncienJours: number | null = null): PipelineStage => ({ statut, elements, plusAncienJours });
    fixture.digitization.queue.mockResolvedValue([{ elementId: ID + '09', projetId: ID + '08', projetNom: 'État civil', description: 'Registre 1964', lotCode: 'LOT-1', statut: 'CONTROLE_QUALITE', depuis: '2026-10-01T09:00:00Z' }]);
    render(<PipelineBoard pipeline={[stage('RECEPTION', 2), stage('NUMERISATION', 0), stage('OCR_INDEXATION', 1), stage('CONTROLE_QUALITE', 4, 6), stage('METADONNEES', 0), stage('VALIDATION', 0), stage('TERMINE', 9), stage('SUSPENDU', 1), stage('ANNULE', 0)]} />);
    expect(screen.getByText(/16 éléments dans le parcours/)).toBeTruthy();
    const qc = screen.getByRole('button', { name: /Contrôle qualité/ });
    expect(qc.textContent).toContain('4');
    expect(qc.textContent).toContain('Le plus ancien : 6 j');
    expect(screen.getByRole('button', { name: 'Suspendu : 1' })).toBeTruthy();
    fireEvent.click(qc);
    await screen.findByText('Registre 1964');
    expect(fixture.digitization.queue).toHaveBeenCalledWith('CONTROLE_QUALITE', undefined, expect.anything());
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));
    expect(navigate).toHaveBeenCalledWith(`/app/numerisation?project=${ID}08&element=${ID}09`);
});
