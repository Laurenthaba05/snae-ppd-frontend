import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

// Le tableau de bord de traitement : réservé à la lecture de la numérisation, jamais un chiffre inventé (— quand l'API ne le donne pas), le dernier contrôle de chaque élément est le seul
// compté, les projets lus pour les éléments sont plafonnés et l'écran le dit, et les actions rapides suivent les droits du périmètre.
const fixture = vi.hoisted(() => ({
    digitization: { projects: vi.fn(), qualityControls: vi.fn(), ocrResults: vi.fn(), pipeline: vi.fn(), elementsByProject: vi.fn() },
    me: { truncated: false } as unknown, demo: false, epoch: 1,
    allowed: new Set<string>(['DIGITIZATION_READ']), visible: true
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: { institutionId: null, departmentId: null } }) }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
vi.mock('../../src/design/navigation', () => ({ moduleVisible: () => fixture.visible }));
vi.mock('../../src/ui/navigation', () => ({ navigate: vi.fn() }));
vi.mock('../../src/ui/PipelineBoard', () => ({ PipelineBoard: ({ pipeline }: { pipeline: unknown[] }) => <div data-testid="pipeline-board">{pipeline.length} étapes</div> }));
import { TreatmentDashboard } from '../../src/pages/TreatmentDashboard';

const project = (n: number, over: Record<string, unknown> = {}) => ({ id: 'p' + n, code: null, nom: 'Projet ' + n, statut: 'EN_COURS', ...over });
const element = (statut: string, over: Record<string, unknown> = {}) => ({ id: 'x' + Math.random(), statut, ...over });
const control = (elementId: string, conforme: boolean, date: string) => ({ id: 'c' + Math.random(), elementNumerisationId: elementId, dateControle: date, conforme });
const today = () => new Date().toISOString();
const kpi = (label: string) => screen.getByText(label).closest('.db-kpi')!;

beforeEach(() => {
    fixture.allowed = new Set(['DIGITIZATION_READ']); fixture.visible = true; fixture.epoch += 1; fixture.me = { truncated: false }; fixture.demo = false;
    fixture.digitization.projects.mockReset().mockResolvedValue([project(1), project(2, { statut: 'TERMINE' }), project(3, { statut: 'ANNULE' })]);
    fixture.digitization.elementsByProject.mockReset().mockImplementation(async (id: string) => id === 'p1' ? [element('TERMINE'), element('TERMINE'), element('NUMERISATION'), element('ANNULE')] : [element('TERMINE')]);
    fixture.digitization.qualityControls.mockReset().mockResolvedValue([control('e1', false, '2026-01-01T00:00:00Z'), control('e1', true, '2026-02-01T00:00:00Z'), control('e2', false, today()), control('e3', true, today())]);
    fixture.digitization.ocrResults.mockReset().mockResolvedValue([{ confiance: 0.8 }, { confiance: '0.6' }, { confiance: 'illisible' }]);
    fixture.digitization.pipeline.mockReset().mockResolvedValue(null);
});

it('sans l’habilitation de lecture de la numérisation, rien n’est lu et les indicateurs restent des tirets', async () => {
    fixture.allowed = new Set();
    render(<TreatmentDashboard />);
    expect(await screen.findByText(/habilitation de lecture de la numérisation requise/)).toBeTruthy();
    expect(fixture.digitization.projects).not.toHaveBeenCalled();
    expect(kpi('Lots en cours de traitement').textContent).toContain('—');
    expect(kpi('Documents à corriger').textContent).toContain('—');
});

it('pendant le chargement le dit, puis montre les indicateurs ; une erreur propose de réessayer sans inventer de chiffre', async () => {
    fixture.digitization.projects.mockRejectedValueOnce(new Error('Indisponible'));
    render(<TreatmentDashboard />);
    expect(await screen.findByText(/Impossible de charger les indicateurs de traitement/)).toBeTruthy();
    expect(kpi('Lots en cours de traitement').textContent).toContain('—');
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Suivi du traitement')).toBeTruthy();
    await waitFor(() => expect(kpi('Lots en cours de traitement').textContent).toContain('1'));
});

it('sans projet ni contrôle, l’écran dit qu’il n’y a rien à montrer', async () => {
    fixture.digitization.projects.mockResolvedValue([]); fixture.digitization.qualityControls.mockResolvedValue([]);
    render(<TreatmentDashboard />);
    expect(await screen.findByText('Aucun projet de numérisation ni contrôle qualité enregistré pour le moment.')).toBeTruthy();
});

it('les indicateurs comptent les projets en cours, les éléments terminés (hors projets annulés) et le dernier contrôle de chaque élément', async () => {
    render(<TreatmentDashboard />);
    await waitFor(() => expect(kpi('Lots en cours de traitement').textContent).toContain('1'));
    expect(kpi('Documents numérisés').textContent).toContain('3');         // 2 dans p1 + 1 dans p2 ; le projet annulé n'est pas lu
    expect(fixture.digitization.elementsByProject).not.toHaveBeenCalledWith('p3', expect.anything());
    expect(kpi('Documents à corriger').textContent).toContain('1');          // e1 : le dernier contrôle est conforme ; e2 : non conforme
    const charts = screen.getByLabelText('Indicateurs de traitement en diagrammes');
    expect(within(charts).getByLabelText('Contrôles qualité').textContent).toContain('3');   // trois éléments contrôlés
});

it('l’avancement ne liste que les projets en cours avec des éléments, du plus gros au plus petit, six au plus', async () => {
    const projects = Array.from({ length: 8 }, (_, i) => project(i + 1));
    fixture.digitization.projects.mockResolvedValue([...projects, project(9, { statut: 'TERMINE' })]);
    fixture.digitization.elementsByProject.mockImplementation(async (id: string) => {
        const n = Number(id.slice(1));
        return n === 5 ? [] : Array.from({ length: n }, (_, i) => element(i === 0 ? 'TERMINE' : 'NUMERISATION'));
    });
    render(<TreatmentDashboard />);
    const details = await screen.findByText('Afficher les données sous forme de tableau');
    fireEvent.click(details);
    const table = within(screen.getByRole('table', { name: 'Indicateurs de traitement' }));
    const named = table.getAllByText(/^Projet \d$/).map(c => c.textContent);
    expect(named).toEqual(['Projet 8', 'Projet 7', 'Projet 6', 'Projet 4', 'Projet 3', 'Projet 2']);   // le 5 n'a aucun élément, le 1 passe sous la barre des six
    expect(table.getByText('1 / 8 (13 %)')).toBeTruthy();
});

it('au-delà de vingt-cinq projets, la lecture s’arrête et l’écran le dit avec un « + »', async () => {
    const many = Array.from({ length: 30 }, (_, i) => project(i + 1));
    fixture.digitization.projects.mockResolvedValue(many);
    fixture.digitization.elementsByProject.mockResolvedValue([element('TERMINE')]);
    render(<TreatmentDashboard />);
    await waitFor(() => expect(kpi('Documents numérisés').textContent).toContain('25+'));
    expect(fixture.digitization.elementsByProject).toHaveBeenCalledTimes(25);
    expect(kpi('Documents numérisés').getAttribute('title')).toBe('Calculé sur les 25 premiers projets');
    expect(screen.getByText(/\(premiers 25 projets\)/)).toBeTruthy();
});

it('le taux de reconnaissance est la moyenne des confiances lisibles, et un tiret si l’API ne répond pas ou ne donne rien', async () => {
    render(<TreatmentDashboard />);
    await waitFor(() => expect(kpi('Taux de reconnaissance OCR').textContent).toContain('70 %'));
    expect(kpi('Taux de reconnaissance OCR').getAttribute('title')).toBe('Confiance moyenne des textes extraits');
});

it('sans vue d’ensemble OCR, l’indicateur est un tiret et le reste de l’écran s’affiche', async () => {
    fixture.digitization.ocrResults.mockRejectedValue(new Error('non exposé'));
    render(<TreatmentDashboard />);
    await waitFor(() => expect(kpi('Lots en cours de traitement').textContent).toContain('1'));
    expect(kpi('Taux de reconnaissance OCR').textContent).toContain('—');
});

it('le suivi par étapes ne s’affiche que si le serveur l’expose, et les étapes sans élément valent zéro', async () => {
    fixture.digitization.pipeline.mockResolvedValue([{ statut: 'NUMERISATION', elements: 12, plusAncienJours: 3 }, { statut: 'OCR_INDEXATION', elements: 4, plusAncienJours: null }]);
    const { unmount } = render(<TreatmentDashboard />);
    expect(await screen.findByTestId('pipeline-board')).toBeTruthy();
    const counts = [...document.querySelectorAll('.db-count')].map(c => c.textContent);
    expect(counts).toEqual(['0', '12', '4', '0', '0', '0', '0']);
    unmount();
    fixture.epoch += 1;
    fixture.digitization.pipeline.mockResolvedValue(null);
    render(<TreatmentDashboard />);
    await screen.findByText('Suivi du traitement');
    await waitFor(() => expect(kpi('Lots en cours de traitement').textContent).toContain('1'));
    expect(screen.queryByTestId('pipeline-board')).toBeNull();
    expect(document.querySelectorAll('.db-count').length).toBe(0);
});

it('les contrôles du mois courant figurent dans le tableau mensuel, ceux d’avant la fenêtre de six mois non', async () => {
    render(<TreatmentDashboard />);
    fireEvent.click(await screen.findByText('Afficher les données sous forme de tableau'));
    const table = within(screen.getByRole('table', { name: 'Indicateurs de traitement' }));
    const rows = table.getAllByText(/conformes · \d+ à corriger/).map(c => c.textContent);
    expect(rows).toHaveLength(6);
    expect(rows[5]).toBe('1 conformes · 1 à corriger');                     // le mois courant : e3 conforme, e2 à corriger
    expect(rows.slice(0, 5).every(r => r === '0 conformes · 0 à corriger')).toBe(true);
});

it('les actions rapides se désactivent hors du périmètre autorisé, avec leur raison', async () => {
    fixture.visible = false;
    render(<TreatmentDashboard />);
    const quick = await screen.findByRole('button', { name: /Nouveau lot de traitement/ });
    expect((quick as HTMLButtonElement).disabled).toBe(true);
    expect(quick.getAttribute('title')).toBe('Non autorisé dans le périmètre sélectionné');
});

it('une liste de droits tronquée par le serveur est signalée', async () => {
    fixture.me = { truncated: true };
    render(<TreatmentDashboard />);
    expect(await screen.findByText(/liste de droits tronquée/)).toBeTruthy();
});
