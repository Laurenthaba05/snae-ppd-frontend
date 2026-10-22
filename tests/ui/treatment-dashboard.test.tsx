import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { beforeEach, expect, it, vi } from 'vitest';

// Le tableau de bord de traitement : réservé à la lecture de la numérisation, tous les nombres viennent d'un seul appel au serveur (dans le périmètre de travail), jamais un chiffre inventé
// (— quand l'API ne le donne pas), le dernier contrôle de chaque élément est le seul compté, et les actions rapides suivent les droits du périmètre.
const fixture = vi.hoisted(() => ({
    digitization: { summary: vi.fn(), pipeline: vi.fn() },
    me: { truncated: false } as unknown, demo: false, epoch: 1,
    scope: { institutionId: null, departmentId: null } as { institutionId: string | null; departmentId: string | null },
    allowed: new Set<string>(['DIGITIZATION_READ']), visible: true
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: fixture.scope }) }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
vi.mock('../../src/design/navigation', () => ({ moduleVisible: () => fixture.visible }));
vi.mock('../../src/ui/navigation', () => ({ navigate: vi.fn() }));
vi.mock('../../src/ui/PipelineBoard', () => ({ PipelineBoard: ({ pipeline }: { pipeline: unknown[] }) => <div data-testid="pipeline-board">{pipeline.length} étapes</div> }));
import { TreatmentDashboard, treatmentFrom } from '../../src/pages/TreatmentDashboard';

const months = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
const summary = (over: Record<string, unknown> = {}) => ({
    generatedAt: '2026-10-21T08:00:00Z',
    projects: { EN_COURS: 1, TERMINE: 1, ANNULE: 1 },
    elements: { TERMINE: 3, NUMERISATION: 1, CONTROLE_QUALITE: 2, VALIDATION: 4, SUSPENDU: 1 },
    controls: { conformes: 2, aCorriger: 1, monthly: months.map((month, i) => ({ month, good: i === 5 ? 1 : 0, warn: i === 5 ? 1 : 0 })) },
    progress: [{ id: 'p1', name: 'Projet 1', done: 2, total: 3 }],
    ocr: { results: 3, averageConfidence: 0.7 },
    ...over
});
const kpi = (label: string) => screen.getByText(label).closest('.db-kpi')!;

beforeEach(() => {
    fixture.allowed = new Set(['DIGITIZATION_READ']); fixture.visible = true; fixture.epoch += 1; fixture.me = { truncated: false }; fixture.demo = false;
    fixture.scope = { institutionId: null, departmentId: null };
    fixture.digitization.summary.mockReset().mockResolvedValue(summary());
    fixture.digitization.pipeline.mockReset().mockResolvedValue(null);
});

it('sans l’habilitation de lecture de la numérisation, rien n’est lu et les indicateurs restent des tirets', async () => {
    fixture.allowed = new Set();
    render(<TreatmentDashboard />);
    expect(await screen.findByText(/habilitation de lecture de la numérisation requise/)).toBeTruthy();
    expect(fixture.digitization.summary).not.toHaveBeenCalled();
    expect(kpi('Lots en cours de traitement').textContent).toContain('—');
    expect(kpi('Documents à corriger').textContent).toContain('—');
});

it('pendant le chargement le dit, puis montre les indicateurs ; une erreur propose de réessayer sans inventer de chiffre', async () => {
    fixture.digitization.summary.mockRejectedValueOnce(new Error('Indisponible'));
    render(<TreatmentDashboard />);
    expect(await screen.findByText(/Impossible de charger les indicateurs de traitement/)).toBeTruthy();
    expect(kpi('Lots en cours de traitement').textContent).toContain('—');
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Suivi du traitement')).toBeTruthy();
    await waitFor(() => expect(kpi('Lots en cours de traitement').textContent).toContain('1'));
});

it('sans projet ni contrôle, l’écran dit qu’il n’y a rien à montrer', async () => {
    fixture.digitization.summary.mockResolvedValue(summary({ projects: {}, elements: {}, controls: { conformes: 0, aCorriger: 0, monthly: [] }, progress: [], ocr: { results: 0, averageConfidence: null } }));
    render(<TreatmentDashboard />);
    expect(await screen.findByText('Aucun projet de numérisation ni contrôle qualité enregistré pour le moment.')).toBeTruthy();
});

it('les indicateurs reprennent les nombres du serveur : projets en cours, éléments terminés, dernier contrôle de chaque élément, éléments en validation', async () => {
    render(<TreatmentDashboard />);
    await waitFor(() => expect(kpi('Lots en cours de traitement').textContent).toContain('1'));
    expect(kpi('Documents numérisés').textContent).toContain('3');
    expect(kpi('Documents à corriger').textContent).toContain('1');
    expect(kpi('Éléments en validation').textContent).toContain('4');
    const charts = screen.getByLabelText('Indicateurs de traitement en diagrammes');
    expect(within(charts).getByLabelText('Contrôles qualité').textContent).toContain('3');   // trois éléments contrôlés
    expect(fixture.digitization.summary).toHaveBeenCalledTimes(1);
});

it('les éléments suspendus se comptent à part : ils ne sont ni terminés ni en cours', async () => {
    render(<TreatmentDashboard />);
    const charts = await screen.findByLabelText('Indicateurs de traitement en diagrammes');
    await within(charts).findAllByLabelText('Éléments numérisés');
    const tile = charts.querySelector('section[aria-label="Éléments numérisés"]') as HTMLElement;
    expect(tile.textContent).toContain('3 sur 11');              // 3 terminés sur 3 + 7 en cours + 1 suspendu
    expect(within(tile).getByText('Suspendus').parentElement!.textContent).toContain('1');
    expect(within(tile).getByText('En cours').parentElement!.textContent).toContain('7');
});

it('l’avancement reprend les projets en cours du serveur, dans son ordre', async () => {
    fixture.digitization.summary.mockResolvedValue(summary({ progress: [{ id: 'p8', name: 'Projet 8', done: 1, total: 8 }, { id: 'p7', name: 'Projet 7', done: 1, total: 7 }, { id: 'p2', name: 'Projet 2', done: 1, total: 2 }] }));
    render(<TreatmentDashboard />);
    fireEvent.click(await screen.findByText('Afficher les données sous forme de tableau'));
    const table = within(screen.getByRole('table', { name: 'Indicateurs de traitement' }));
    expect(table.getAllByText(/^Projet \d$/).map(c => c.textContent)).toEqual(['Projet 8', 'Projet 7', 'Projet 2']);
    expect(table.getByText('1 / 8 (13 %)')).toBeTruthy();
});

it('le périmètre de travail se transmet au serveur, et le suivi par âge (national seulement) n’est pas lu pour une institution', async () => {
    fixture.scope = { institutionId: 'i1', departmentId: 'd1' };
    render(<TreatmentDashboard />);
    await waitFor(() => expect(kpi('Lots en cours de traitement').textContent).toContain('1'));
    expect(fixture.digitization.summary).toHaveBeenCalledWith({ institutionId: 'i1', departmentId: 'd1' }, expect.anything());
    expect(fixture.digitization.pipeline).not.toHaveBeenCalled();
    expect(screen.queryByTestId('pipeline-board')).toBeNull();
    expect(screen.getByText(/Institution sélectionnée/)).toBeTruthy();                    // le périmètre est nommé, jamais un identifiant
    expect([...document.querySelectorAll('.db-count')].map(c => c.textContent)).toEqual(['0', '1', '0', '2', '0', '4', '3']);   // les étapes comptent le même périmètre
});

it('la confiance OCR est la moyenne du serveur (une valeur texte est lue), avec le nombre de résultats ; un tiret quand il n’y en a pas', async () => {
    fixture.digitization.summary.mockResolvedValue(summary({ ocr: { results: 5, averageConfidence: '0.6' } }));
    const { unmount } = render(<TreatmentDashboard />);
    await waitFor(() => expect(kpi('Confiance moyenne de l’OCR').textContent).toContain('60 %'));
    expect(kpi('Confiance moyenne de l’OCR').getAttribute('title')).toContain('5 résultat(s)');
    unmount();
    fixture.epoch += 1;
    fixture.digitization.summary.mockResolvedValue(summary({ ocr: { results: 0, averageConfidence: null } }));
    render(<TreatmentDashboard />);
    await waitFor(() => expect(kpi('Lots en cours de traitement').textContent).toContain('1'));
    expect(kpi('Confiance moyenne de l’OCR').textContent).toContain('—');
    expect(kpi('Confiance moyenne de l’OCR').getAttribute('title')).toBe('Aucun résultat OCR dans ce périmètre');
});

it('le suivi par âge ne s’affiche que pour tout le pays et si le serveur l’expose', async () => {
    fixture.digitization.pipeline.mockResolvedValue([{ statut: 'NUMERISATION', elements: 12, plusAncienJours: 3 }, { statut: 'OCR_INDEXATION', elements: 4, plusAncienJours: null }]);
    const { unmount } = render(<TreatmentDashboard />);
    expect(await screen.findByTestId('pipeline-board')).toBeTruthy();
    unmount();
    fixture.epoch += 1;
    fixture.digitization.pipeline.mockResolvedValue(null);
    render(<TreatmentDashboard />);
    await screen.findByText('Suivi du traitement');
    await waitFor(() => expect(kpi('Lots en cours de traitement').textContent).toContain('1'));
    expect(screen.queryByTestId('pipeline-board')).toBeNull();
    expect(document.querySelectorAll('.db-count').length).toBe(7);                         // les compteurs d'étapes viennent du résumé, pas du suivi par âge
});

it('les contrôles du mois courant figurent dans le tableau mensuel sur six mois', async () => {
    render(<TreatmentDashboard />);
    fireEvent.click(await screen.findByText('Afficher les données sous forme de tableau'));
    const table = within(screen.getByRole('table', { name: 'Indicateurs de traitement' }));
    const rows = table.getAllByText(/conformes · \d+ à corriger/).map(c => c.textContent);
    expect(rows).toHaveLength(6);
    expect(rows[5]).toBe('1 conformes · 1 à corriger');
    expect(rows.slice(0, 5).every(r => r === '0 conformes · 0 à corriger')).toBe(true);
});

it('les actions rapides se désactivent hors du périmètre autorisé, avec leur raison', async () => {
    fixture.visible = false;
    render(<TreatmentDashboard />);
    const quick = await screen.findByRole('button', { name: /Nouveau lot de traitement/ });
    expect((quick as HTMLButtonElement).disabled).toBe(true);
    expect(quick.getAttribute('title')).toBe('Non autorisé dans le périmètre sélectionné');
});

it('les règles métier ne promettent que ce que le système fait', async () => {
    render(<TreatmentDashboard />);
    const rules = (await screen.findByText('Règles métier')).closest('section')!;
    expect(within(rules).getByText('Traçabilité')).toBeTruthy();
    expect(within(rules).getByText('Original scellé')).toBeTruthy();
    expect(rules.textContent).not.toMatch(/300 dpi|80 ?%|Formats autorisés/);              // aucun seuil écrit en dur : les exigences d'image sont celles des profils de numérisation
});

it('une liste de droits tronquée par le serveur est signalée', async () => {
    fixture.me = { truncated: true };
    render(<TreatmentDashboard />);
    expect(await screen.findByText(/liste de droits tronquée/)).toBeTruthy();
});

it('le tableau de bord de traitement n’a aucune violation d’accessibilité détectée automatiquement', async () => {
    fixture.digitization.pipeline.mockResolvedValue([{ statut: 'NUMERISATION', elements: 12, plusAncienJours: 3 }]);
    const { container } = render(<TreatmentDashboard />);
    await screen.findByTestId('pipeline-board');
    await waitFor(() => expect(kpi('Lots en cours de traitement').textContent).toContain('1'));
    const result = await axe.run(container, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
        rules: { 'color-contrast': { enabled: false }, region: { enabled: false }, 'landmark-one-main': { enabled: false }, 'page-has-heading-one': { enabled: false } }
    });
    expect(result.violations.map(v => v.id + ' : ' + v.nodes.map(n => n.target.join(' ')).join(' ; '))).toEqual([]);
});

it('les petites cartes du suivi gardent la légende en ligne, sans répéter les lignes de la répartition', async () => {
    render(<TreatmentDashboard />);
    const charts = await screen.findByLabelText('Indicateurs de traitement en diagrammes');
    await waitFor(() => expect(within(charts).getByLabelText('Contrôles qualité')).toBeTruthy());
    expect(charts.querySelector('.dv-rows')).toBeNull();
    expect(within(within(charts).getByLabelText('Projets de numérisation')).getByText('En cours')).toBeTruthy();
});

it('treatmentFrom : le résumé du serveur se range pour l’écran, sans inventer de valeur absente', () => {
    const data = treatmentFrom(summary({ projects: { EN_COURS: 2 }, elements: { TERMINE: 1, RECEPTION: 2, ANNULE: 9 } }) as never, null);
    expect(data.projects).toEqual({ enCours: 2, termine: 0, annule: 0 });
    expect(data.elements).toEqual({ termine: 1, enCours: 2, suspendu: 0 });                // les annulés ne comptent nulle part
    expect(data.monthly[5]).toEqual({ key: '2026-10', label: 'Oct.', good: 1, warn: 1 });
    expect(treatmentFrom(summary({ ocr: { results: 0, averageConfidence: 0 } }) as never, null).ocrAverage).toBeNull();   // zéro résultat : pas de moyenne, même si le serveur envoie 0
    expect(treatmentFrom(summary({ ocr: { results: 2, averageConfidence: 'abc' } }) as never, null).ocrAverage).toBeNull();
});
