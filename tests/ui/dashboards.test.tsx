import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { beforeEach, expect, it, vi } from 'vitest';

// Les tableaux de bord : celui du périmètre de travail (institution ou unité, sous-unités comprises) et la vue d'ensemble nationale. Les chiffres viennent du serveur ; une rubrique que la
// personne ne peut pas lire s'affiche « non disponible », jamais comme un zéro ; un clic sur une unité ou une institution ouvre son propre tableau.
const fixture = vi.hoisted(() => ({
    epoch: 1, me: { user: { id: 'u1' } } as unknown, allowed: new Set<string>(),
    scope: { institutionId: null as string | null, departmentId: null as string | null }, setScope: vi.fn(),
    dashboard: { scope: vi.fn(), national: vi.fn() } as { scope: ReturnType<typeof vi.fn>; national: ReturnType<typeof vi.fn> } | null
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: fixture.scope, setScope: fixture.setScope }) }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
vi.mock('../../src/ui/navigation', () => ({ navigate: vi.fn() }));
import { navigate } from '../../src/ui/navigation';
import { ScopeDashboardPage } from '../../src/pages/ScopeDashboard';
import { NationalDashboardPage } from '../../src/pages/NationalDashboard';

const INST = '11111111-1111-4111-8111-111111111111';
const DEP = '22222222-2222-4222-8222-222222222222';
const DIR1 = '33333333-3333-4333-8333-333333333333';
const SRV1 = '44444444-4444-4444-8444-444444444444';
const months = Array.from({ length: 12 }, (_, i) => ({ month: '2026-' + String(i + 1).padStart(2, '0'), count: i === 11 ? 7 : 0 }));
const unit = (id: string, code: string, parentId: string | null, name: string, over: Record<string, unknown> = {}) =>
    ({ id, parentId, code, name, type: 'DIRECTION', documents: 0, dossiers: 0, directDocuments: 0, directDossiers: 0, ...over });
const scopeData = (over: Record<string, unknown> = {}) => ({
    scope: { institutionId: INST, institutionName: 'Ministère de la Justice', departmentId: null, departmentName: null }, generatedAt: '2026-10-19T10:00:00Z',
    documents: { total: 120, destroyed: 3, byArchivalStatus: { BROUILLON: 70, ACTIF: 50 }, byBusinessStatus: { OUVERT: 120 }, byConfidentiality: { INTERNE: 100, CONFIDENTIEL: 20 }, createdLast30Days: 7, monthly: months },
    dossiers: { total: 30, byBusinessStatus: { OUVERT: 30 }, byArchivalStatus: { ACTIF: 30 } },
    retention: { byStatus: { PLANIFIE: 9, EN_DECISION: 2 }, overdue: 4, dueWithin90Days: 5, activeLegalHolds: 2 },
    consultation: { byStatus: { DEPOSEE: 3 }, pending: 3 }, heritage: { total: 11, byStatus: { DEPOT: 11 } },
    digitization: { projects: 6, activeProjects: 2, elementsByStatus: { NUMERISATION: 9, TERMINE: 40 } }, physical: { total: 321, destroyed: 4 }, intake: { total: 14, open: 3 },
    units: [unit(DIR1, 'DIR1', DEP, 'Direction des études', { documents: 40, dossiers: 8, directDocuments: 25, directDossiers: 5 }), unit(DEP, 'DEP', null, 'Département des archives', { documents: 90, dossiers: 20, directDocuments: 10, directDossiers: 2 }),
        unit(SRV1, 'SRV1', DIR1, 'Service du courrier', { documents: 15, dossiers: 3, directDocuments: 15, directDossiers: 3 })],
    ...over
});
const institutionRow = (id: string, name: string, over: Record<string, unknown> = {}) =>
    ({ id, code: 'C-' + name, name, acronym: null, units: 4, documents: 100, dossiers: 20, retentionOverdue: 0, activeLegalHolds: 1, pendingConsultations: 2, heritageAssets: 3, openIntakes: 5, activeDigitizationProjects: 6, physicalArchives: 7, ...over });
const nationalData = (over: Record<string, unknown> = {}) => ({
    generatedAt: '2026-10-19T10:00:00Z', institutions: 12, units: 80,
    documents: { total: 5000, destroyed: 10, byArchivalStatus: { BROUILLON: 3000, ARCHIVE_DEFINITIVE: 2000 }, byBusinessStatus: { OUVERT: 5000 }, byConfidentiality: { INTERNE: 4500, SECRET: 500 }, createdLast30Days: 300, monthly: months },
    dossiers: { total: 900, byBusinessStatus: { OUVERT: 900 }, byArchivalStatus: { ACTIF: 900 } },
    retention: { byStatus: { PLANIFIE: 40, EN_DECISION: 6 }, overdue: 12, dueWithin90Days: 30, activeLegalHolds: 5 },
    consultation: { byStatus: { DEPOSEE: 8, EN_INSTRUCTION: 2 }, pending: 10 }, heritage: { total: 77, byStatus: { DEPOT: 77 } },
    institutionRows: [institutionRow('i1', 'Ministère de la Justice', { documents: 3000, retentionOverdue: 9, acronym: 'MJ' }), institutionRow('i2', 'Ministère de la Culture', { documents: 1500 })],
    intake: { total: 40, open: 6, byStatus: { OUVERTE: 6, CLOTUREE: 34 }, unattributed: 3 }, digitization: { projects: 9, activeProjects: 4, elementsByStatus: { NUMERISATION: 10, CONTROLE_QUALITE: 5, TERMINE: 200, SUSPENDU: 2 }, unattributedProjects: 2 },
    physical: { total: 3000, destroyed: 12, byPhysicalState: { BON: 2900 }, unattributed: 150 }, portal: { activeReaders: 150, activeSubscriptions: 60, pendingAccessRequests: 4 },
    transfers: { eliminationSlipsByStatus: { BROUILLON: 2, SOUMIS: 1, EXECUTE: 7 }, transfersByStatus: { BROUILLON: 1, ACCEPTE: 2, EXECUTE: 4 } },
    ...over
});

beforeEach(() => {
    fixture.epoch += 1; fixture.allowed = new Set(['DOCUMENT_READ']); fixture.scope = { institutionId: INST, departmentId: null };
    fixture.setScope.mockReset(); (navigate as unknown as ReturnType<typeof vi.fn>).mockReset();
    fixture.dashboard = { scope: vi.fn().mockResolvedValue(scopeData()), national: vi.fn().mockResolvedValue(nationalData()) };
});

const kpi = (label: string) => screen.getByText(label, { selector: '.hm-kpi-body > span' }).closest('.hm-kpi') as HTMLElement;
const kpiValue = (label: string) => within(kpi(label)).getByText(/./, { selector: 'strong' }).textContent;

// ------------------------------------------------------------------------------------------------ le périmètre
it('sans institution dans le périmètre, la page le dit et ne lit rien ; le national y trouve un lien vers sa vue', async () => {
    fixture.scope = { institutionId: null, departmentId: null };
    const first = render(<ScopeDashboardPage />);
    expect(await screen.findByText(/Choisissez une institution/)).toBeTruthy();
    expect(fixture.dashboard!.scope).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Ouvrir le tableau de bord national' })).toBeNull();
    first.unmount();
    fixture.allowed = new Set(['DASHBOARD_NATIONAL_READ']);
    render(<ScopeDashboardPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir le tableau de bord national' }));
    expect(navigate).toHaveBeenCalledWith('/app/tableau-national');
});

it('lit le tableau du périmètre choisi (institution seule, ou institution et unité) et montre les chiffres du serveur', async () => {
    fixture.scope = { institutionId: INST, departmentId: DEP };
    render(<ScopeDashboardPage />);
    await screen.findByText('Ministère de la Justice');
    expect(fixture.dashboard!.scope).toHaveBeenCalledWith(INST, DEP, expect.anything());
    expect(kpiValue('Documents')).toBe('120');
    expect(kpiValue('Dossiers')).toBe('30');
    expect(kpiValue('Échéances dépassées')).toBe('4');
    expect(kpiValue('Gels juridiques actifs')).toBe('2');
    expect(kpiValue('Demandes en attente')).toBe('3');
    expect(kpiValue('Biens patrimoniaux')).toBe('11');
    expect(screen.getByText('Cette unité et ses sous-unités', { selector: 'span' })).toBeTruthy();
    // les demandes de consultation se comptent par institution : l'indicateur d'une unité le dit
    expect(kpi('Demandes en attente').title).toBe('Les demandes de consultation se comptent par institution, pas par unité');
});

it('le titre dit toute l’institution quand aucune unité n’est choisie', async () => {
    render(<ScopeDashboardPage />);
    await screen.findByText('Ministère de la Justice');
    expect(fixture.dashboard!.scope).toHaveBeenCalledWith(INST, null, expect.anything());
    expect(screen.getByText('Toutes les unités de l’institution')).toBeTruthy();
    expect(kpi('Demandes en attente').title).toBe('Demandes déposées ou en instruction');
});

it('une rubrique interdite est « non disponible » et son indicateur affiche un tiret, jamais zéro', async () => {
    fixture.dashboard!.scope.mockResolvedValue(scopeData({ dossiers: null, retention: null, consultation: null, heritage: null }));
    render(<ScopeDashboardPage />);
    await screen.findByText('Ministère de la Justice');
    expect(kpiValue('Dossiers')).toBe('—');
    expect(kpiValue('Échéances dépassées')).toBe('—');
    expect(kpiValue('Gels juridiques actifs')).toBe('—');
    expect(kpiValue('Demandes en attente')).toBe('—');
    expect(kpiValue('Biens patrimoniaux')).toBe('—');
    expect(kpiValue('Documents')).toBe('120');
    expect(screen.getByText('Non disponible : votre habilitation ne couvre pas la conservation dans ce périmètre.')).toBeTruthy();
});

it('un périmètre sans document le dit, et les documents détruits sont signalés comme des traces', async () => {
    fixture.dashboard!.scope.mockResolvedValue(scopeData({ documents: { total: 0, destroyed: 0, byArchivalStatus: {}, byBusinessStatus: {}, byConfidentiality: {}, createdLast30Days: 0, monthly: months.map(m => ({ ...m, count: 0 })) } }));
    const first = render(<ScopeDashboardPage />);
    await screen.findByText('Ministère de la Justice');
    expect(screen.getAllByText('Aucun document dans ce périmètre.').length).toBeGreaterThan(0);
    first.unmount();
    fixture.dashboard!.scope.mockResolvedValue(scopeData());
    render(<ScopeDashboardPage />);
    expect(await screen.findByText(/3 document\(s\) détruit\(s\), conservés comme traces\./)).toBeTruthy();
});

it('les unités sont montrées en arbre, chacune avec ses chiffres, et un clic ouvre son tableau de bord', async () => {
    render(<ScopeDashboardPage />);
    await screen.findByText('Ministère de la Justice');
    const rows = screen.getAllByRole('row').slice(1).map(r => within(r).getAllByRole('cell').map(c => c.textContent));
    expect(rows.map(r => r[0])).toEqual(['Département des archives', 'Direction des études', 'Service du courrier']);
    expect(rows[1]).toEqual(['Direction des études', 'Direction', '40', '8', '25', '5']);   // le type se lit par son nom, jamais par son code
    const indent = (name: string) => Number.parseInt((screen.getByRole('button', { name }).closest('td') as HTMLElement).style.paddingLeft, 10);
    expect(indent('Direction des études')).toBeGreaterThan(indent('Département des archives'));
    expect(indent('Service du courrier')).toBeGreaterThan(indent('Direction des études'));
    fireEvent.click(screen.getByRole('button', { name: 'Direction des études' }));
    expect(fixture.setScope).toHaveBeenCalledWith({ institutionId: INST, departmentId: DIR1 });
});

it('le retour au tableau de toute l’institution n’est proposé qu’à qui y est habilité', async () => {
    fixture.scope = { institutionId: INST, departmentId: DIR1 };
    fixture.dashboard!.scope.mockResolvedValue(scopeData({ scope: { institutionId: INST, institutionName: 'Ministère de la Justice', departmentId: DIR1, departmentName: 'Direction des études' } }));
    fixture.allowed = new Set();
    const first = render(<ScopeDashboardPage />);
    await screen.findByText(/Direction des études/, { selector: 'strong' });
    expect(screen.queryByRole('button', { name: 'Voir le tableau de bord de toute l’institution' })).toBeNull();
    first.unmount();
    fixture.allowed = new Set(['DOCUMENT_READ']);
    render(<ScopeDashboardPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Voir le tableau de bord de toute l’institution' }));
    expect(fixture.setScope).toHaveBeenCalledWith({ institutionId: INST, departmentId: null });
});

it('un refus ou une panne du serveur est dit, avec une relecture ; actualiser relit', async () => {
    fixture.dashboard!.scope.mockRejectedValueOnce(new Error('Accès refusé.')).mockResolvedValue(scopeData());
    render(<ScopeDashboardPage />);
    expect(await screen.findByText('Accès refusé.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer la lecture' }));
    await screen.findByText('Ministère de la Justice');
    fixture.dashboard!.scope.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Actualiser' }));
    await waitFor(() => expect(fixture.dashboard!.scope).toHaveBeenCalledTimes(1));
});

it('sans client de tableau de bord (démonstration), la page le dit', async () => {
    fixture.dashboard = null;
    render(<ScopeDashboardPage />);
    expect(await screen.findByText('Le tableau de bord n’est pas disponible dans cette session.')).toBeTruthy();
});

it('les activités nationales rattachées au périmètre sont montrées, et la carte disparaît quand aucune n’est lisible', async () => {
    const first = render(<ScopeDashboardPage />);
    await screen.findByText('Ministère de la Justice');
    const card = screen.getByRole('heading', { name: 'Activités nationales rattachées' }).closest('section') as HTMLElement;
    expect(within(card.querySelector('.sd-facts') as HTMLElement).getAllByRole('listitem').map(li => li.textContent)).toEqual(['3versements ouverts', '14versements au total', '2projets de numérisation en cours', '6projets de numérisation au total', '321archives physiques']);
    expect(within(card).getByText('Numérisation')).toBeTruthy();   // la légende des étapes des éléments numérisés
    first.unmount();
    fixture.dashboard!.scope.mockResolvedValue(scopeData({ digitization: null, physical: null, intake: null }));
    render(<ScopeDashboardPage />);
    await screen.findByText('Ministère de la Justice');
    expect(screen.queryByRole('heading', { name: 'Activités nationales rattachées' })).toBeNull();
});

// ------------------------------------------------------------------------------------------------ le national
it('la vue nationale tient sur un seul écran : indicateurs, graphiques, institutions et activités nationales', async () => {
    render(<NationalDashboardPage />);
    await screen.findByText('Tableau de bord national');
    expect(fixture.dashboard!.national).toHaveBeenCalledTimes(1);
    expect(kpiValue('Institutions')).toBe('12'); expect(kpiValue('Unités')).toBe('80');
    expect(kpiValue('Documents')).toBe('5 000'); expect(kpiValue('Dossiers')).toBe('900');
    expect(kpiValue('Échéances dépassées')).toBe('12'); expect(kpiValue('Gels actifs')).toBe('5');
    expect(kpiValue('Demandes en attente')).toBe('10'); expect(kpiValue('Biens patrimoniaux')).toBe('77');
    for (const title of ['Documents ajoutés par mois', 'Situation des documents', 'Confidentialité et échéances', 'Les institutions', 'Versements', 'Numérisation', 'Archives physiques', 'Portail des lecteurs', 'Éliminations et transferts'])
        expect(screen.getByRole('heading', { name: title })).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
});

it('chaque activité nationale montre ses nombres, et les étapes ouvertes seules comptent comme « en cours »', async () => {
    render(<NationalDashboardPage />);
    await screen.findByText('Tableau de bord national');
    const card = (title: string) => screen.getByRole('heading', { name: title }).closest('section') as HTMLElement;
    const facts = (title: string) => within(card(title)).getAllByRole('listitem').map(li => li.textContent);
    expect(facts('Versements')).toEqual(['6entrées ouvertes', '40entrées au total', '3sans institution versante']);
    expect(facts('Numérisation')).toEqual(['4projets en cours', '15éléments en traitement', '2éléments suspendus', '2projets sans origine']);
    expect(facts('Archives physiques')).toEqual(['3 000archives recensées', '12détruites', '150sans origine']);
    expect(facts('Portail des lecteurs')).toEqual(['150lecteurs actifs', '60abonnements actifs', '4demandes d’accès en attente']);
    expect(facts('Éliminations et transferts')).toEqual(['3bordereaux d’élimination en cours', '3transferts en cours']);
});

it('une activité nationale sans habilitation est « non disponible », pas un zéro', async () => {
    fixture.dashboard!.national.mockResolvedValue(nationalData({ intake: null, digitization: null, physical: null, portal: null, transfers: null }));
    render(<NationalDashboardPage />);
    await screen.findByText('Tableau de bord national');
    expect(screen.getByText('Non disponible : votre habilitation ne couvre pas les versements.')).toBeTruthy();
    expect(screen.getByText('Non disponible : votre habilitation ne couvre pas la numérisation.')).toBeTruthy();
    expect(screen.getByText('Non disponible : votre habilitation ne couvre pas les archives physiques.')).toBeTruthy();
    expect(screen.getByText('Non disponible : votre habilitation ne couvre pas le portail des lecteurs.')).toBeTruthy();
    expect(screen.getByText('Non disponible : votre habilitation ne couvre pas les éliminations et les transferts.')).toBeTruthy();
});

it('le tableau des institutions en montre une ligne chacune, et un clic ouvre le tableau de bord de l’institution', async () => {
    render(<NationalDashboardPage />);
    await screen.findByText('Tableau de bord national');
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByRole('button', { name: 'MJ · Ministère de la Justice' })).toBeTruthy();
    expect(within(rows[0]!).getAllByRole('cell').map(c => c.textContent).filter(Boolean)).toContain('9');
    // les activités nationales rattachées à l'institution : versements ouverts, numérisation en cours, archives physiques
    expect(within(rows[0]!).getAllByRole('cell').slice(-3).map(c => c.textContent)).toEqual(['5', '6', '7']);
    fireEvent.click(within(rows[1]!).getByRole('button', { name: 'Ministère de la Culture' }));
    expect(fixture.setScope).toHaveBeenCalledWith({ institutionId: 'i2', departmentId: null });
    expect(navigate).toHaveBeenCalledWith('/app/tableau-de-bord');
});

it('une panne est dite avec une relecture, et actualiser relit', async () => {
    fixture.dashboard!.national.mockRejectedValueOnce(new Error('Service indisponible')).mockResolvedValue(nationalData());
    render(<NationalDashboardPage />);
    expect(await screen.findByText('Service indisponible')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer la lecture' }));
    await screen.findByText('Tableau de bord national');
    fixture.dashboard!.national.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Actualiser' }));
    await waitFor(() => expect(fixture.dashboard!.national).toHaveBeenCalledTimes(1));
});

// ------------------------------------------------------------------------------------------------ accessibilité
async function violations(container: HTMLElement): Promise<string[]> {
    const result = await axe.run(container, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
        rules: { 'color-contrast': { enabled: false }, region: { enabled: false }, 'landmark-one-main': { enabled: false }, 'page-has-heading-one': { enabled: false } }
    });
    return result.violations.map(v => v.id + ' (' + v.impact + ') : ' + v.nodes.map(n => n.target.join(' ')).join(' ; '));
}
it('les deux tableaux de bord n’ont aucune violation d’accessibilité', async () => {
    const scope = render(<ScopeDashboardPage />);
    await screen.findByText('Ministère de la Justice');
    expect(await violations(scope.container)).toEqual([]);
    scope.unmount();
    const national = render(<NationalDashboardPage />);
    await screen.findByText('Tableau de bord national');
    expect(await violations(national.container)).toEqual([]);
});

// ------------------------------------------------------------------------------------------------ la présentation
it('l’indicateur phare des documents montre sa tendance sur douze mois et sa variation sur trente jours', async () => {
    render(<ScopeDashboardPage />);
    await screen.findByText('Ministère de la Justice');
    const hero = kpi('Documents');
    expect(hero.className).toContain('hero');
    expect(hero.querySelector('svg.dv-spark')).not.toBeNull();
    expect(hero.querySelector('em')!.textContent).toBe('+7 ces 30 derniers jours');
    expect(hero.title).toBe('7 créés ces 30 derniers jours');   // l'infobulle garde le détail
    expect(kpi('Dossiers').className).not.toContain('hero');
});

it('les échéances dépassées ne prennent la mise en garde que s’il y en a', async () => {
    const first = render(<ScopeDashboardPage />);
    await screen.findByText('Ministère de la Justice');
    expect(kpi('Échéances dépassées').className).toContain('alert-critical');
    expect(kpi('Gels juridiques actifs').className).toContain('alert-info');
    expect(kpi('Demandes en attente').className).toContain('alert-warning');
    expect(kpi('Dossiers').className).not.toContain('alert-');
    first.unmount();
    fixture.dashboard!.scope.mockResolvedValue(scopeData({ retention: { byStatus: {}, overdue: 0, dueWithin90Days: 0, activeLegalHolds: 0 }, consultation: { byStatus: {}, pending: 0 } }));
    render(<ScopeDashboardPage />);
    await screen.findByText('Ministère de la Justice');
    expect(kpi('Échéances dépassées').className).not.toContain('alert-');
    expect(kpi('Demandes en attente').className).not.toContain('alert-');
});

it('la confidentialité se lit du plus clair (public) au plus foncé (secret), et le cycle de vie de même', async () => {
    fixture.dashboard!.scope.mockResolvedValue(scopeData({ documents: { total: 100, destroyed: 0, byArchivalStatus: { BROUILLON: 10, ACTIF: 50, DETRUIT: 5 }, byBusinessStatus: {}, byConfidentiality: { PUBLIC: 10, CONFIDENTIEL: 20, SECRET: 5 }, createdLast30Days: 0, monthly: months } }));
    render(<ScopeDashboardPage />);
    await screen.findByText('Ministère de la Justice');
    const segmentColors = (title: string) => [...(screen.getByRole('img', { name: new RegExp('^' + title) }).querySelectorAll('.db-sbar-seg'))].map(s => (s as HTMLElement).style.background);
    expect(segmentColors('Documents par niveau')).toEqual(['rgb(135, 186, 253)', 'rgb(63, 112, 173)', 'rgb(29, 77, 135)']);   // public, confidentiel, secret : de plus en plus foncé
    const ring = [...document.querySelectorAll('circle.db-donut-seg')].map(c => c.getAttribute('stroke'));
    expect(ring).toEqual(['#61c28e', '#3fa270', '#9aa8ae']);   // brouillon, actif (vert de plus en plus foncé), détruit (teinte neutre)
});

it('la courbe de l’activité a son tableau, qui s’ouvre à la demande sans s’ajouter au tableau des unités', async () => {
    render(<ScopeDashboardPage />);
    await screen.findByText('Ministère de la Justice');
    expect(screen.getAllByRole('table')).toHaveLength(1);   // les unités seulement
    fireEvent.click(screen.getByRole('button', { name: 'Afficher les données sous forme de tableau' }));
    const twin = within(screen.getByRole('table', { name: 'Documents ajoutés' }));
    expect(twin.getAllByRole('row')).toHaveLength(13);       // l'en-tête et douze mois
    expect(twin.getByRole('row', { name: /Déc\./ }).textContent).toContain('7');
    expect(screen.getAllByRole('table')).toHaveLength(2);
});

it('une relecture garde l’écran affiché, légèrement estompé et signalé comme occupé, au lieu de le vider', async () => {
    const { container } = render(<ScopeDashboardPage />);
    await screen.findByText('Ministère de la Justice');
    expect(container.querySelector('.dv.refreshing')).toBeNull();
    let release: (value: unknown) => void = () => undefined;
    fixture.dashboard!.scope.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    fireEvent.click(screen.getByRole('button', { name: 'Actualiser' }));
    await waitFor(() => expect(container.querySelector('.dv.refreshing')).not.toBeNull());
    expect(container.querySelector('.dv')!.getAttribute('aria-busy')).toBe('true');
    expect(kpiValue('Documents')).toBe('120');                // les chiffres restent
    release(scopeData());
    await waitFor(() => expect(container.querySelector('.dv.refreshing')).toBeNull());
});

it('au national, une institution en retard de conservation montre une pastille critique, les autres un zéro discret', async () => {
    render(<NationalDashboardPage />);
    await screen.findByText('Tableau de bord national');
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]!.querySelector('.dv-pill.crit')!.textContent).toBe('9');   // MJ : neuf échéances dépassées dans le jeu d'essai
    expect(rows[1]!.querySelector('.dv-pill.crit')).toBeNull();
    expect(rows[1]!.querySelector('.dv-pill.zero')!.textContent).toBe('0');
});

it('changer de périmètre pendant une relecture ne montre jamais les chiffres de l’ancien périmètre', async () => {
    const { rerender } = render(<ScopeDashboardPage />);
    await screen.findByText('Ministère de la Justice');
    fixture.dashboard!.scope.mockImplementation(() => new Promise(() => undefined));
    fixture.scope = { institutionId: INST, departmentId: DIR1 };
    rerender(<ScopeDashboardPage />);
    expect(screen.queryByText('Ministère de la Justice')).toBeNull();   // l'écran attend les chiffres de la nouvelle unité
    expect(screen.queryByText('120')).toBeNull();
});
