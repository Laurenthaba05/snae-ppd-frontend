import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import axe from 'axe-core';
import type { RecordDocument } from '../../src/core/types';
import { OTHER_COLOR, PALETTE } from '../../src/core/dashboard';

// L'accueil : « jamais un chiffre inventé » — une donnée absente (habilitation, périmètre, erreur) s'affiche « — » avec sa raison, jamais 0 ; les séries et la répartition par type sont
// calculées sur les documents lus, et un état de service ne se déclare « opérationnel » que si tout ce qui a été mesuré va bien.
vi.mock('../../src/ui/navigation', () => ({ navigate: vi.fn() }));
vi.mock('../../src/auth/session', () => ({ useSession: () => ({}) }));
import { HomeView, exactSeries, monthlySeries, typeSegments, typeSegmentsOf, type HomeData, type HomeExact } from '../../src/pages/Dashboard';
import { formatNumber } from '../../src/core/locale';

const doc = (id: string, over: Record<string, unknown> = {}) => ({ id, typeDocumentId: 't1', createdAt: '2026-10-05T08:00:00Z', archivalStatus: 'BROUILLON', businessStatus: 'OUVERT', ...over } as unknown as RecordDocument);
const NOW = new Date(2026, 9, 16, 12, 0, 0);   // 16 octobre 2026 (heure locale)
const data = (over: Partial<HomeData> = {}): HomeData => ({
    docs: { items: [doc('1'), doc('2', { createdAt: '2026-09-02T08:00:00Z' }), doc('3', { typeDocumentId: 't2' })], partial: false },
    dossiers: { count: 12, partial: false }, types: { t1: 'Courrier', t2: 'Rapport' },
    tasks: { intakes: 3, toControl: 0, eliminations: null, holds: 1, requests: 5 }, backup: 'ok', search: 'ok', ocr: 'ok', apiOk: true, ...over
});

it('la série annuelle va de janvier au mois courant, la série glissante couvre douze mois', () => {
    const docs = [doc('a', { createdAt: '2026-01-15T10:00:00' }), doc('b', { createdAt: '2026-10-02T10:00:00' }), doc('c', { createdAt: '2026-10-09T10:00:00' }), doc('d', { createdAt: '2025-11-20T10:00:00' })];
    const year = monthlySeries(docs, 'year', NOW)!;
    expect(year).toHaveLength(10);                       // janvier à octobre
    expect(new Set(year.map(p => p.key)).size).toBe(10);  // une clé par mois
    expect(year[0]!.value).toBe(1); expect(year[9]!.value).toBe(2); expect(year.reduce((n, p) => n + p.value, 0)).toBe(3);
    const rolling = monthlySeries(docs, 'rolling', NOW)!;
    expect(rolling).toHaveLength(12);
    expect(new Set(rolling.map(p => p.key)).size).toBe(12);
    expect(rolling[0]!.value).toBe(1);                    // novembre 2025
    expect(rolling[11]!.value).toBe(2);                   // octobre 2026
    expect(rolling.reduce((n, p) => n + p.value, 0)).toBe(4);
});

it('sans aucune date de création, il n’y a pas de série (et non une série de zéros)', () => {
    expect(monthlySeries([doc('x', { createdAt: null }), doc('y', { createdAt: undefined })], 'year', NOW)).toBeNull();
    expect(monthlySeries([], 'rolling', NOW)).toBeNull();
});

it('une date illisible n’est pas comptée et ne fait pas échouer la série', () => {
    const series = monthlySeries([doc('ok', { createdAt: '2026-10-02T10:00:00' }), doc('ko', { createdAt: 'pas une date' })], 'year', NOW)!;
    expect(series.reduce((n, p) => n + p.value, 0)).toBe(1);
});

it('les cinq types les plus fréquents sont nommés, le reste est regroupé en « Autres »', () => {
    const docs = [
        ...Array.from({ length: 6 }, (_, i) => doc('a' + i, { typeDocumentId: 'A' })), ...Array.from({ length: 5 }, (_, i) => doc('b' + i, { typeDocumentId: 'B' })),
        ...Array.from({ length: 4 }, (_, i) => doc('c' + i, { typeDocumentId: 'C' })), ...Array.from({ length: 3 }, (_, i) => doc('d' + i, { typeDocumentId: 'D' })),
        ...Array.from({ length: 2 }, (_, i) => doc('e' + i, { typeDocumentId: 'E' })), doc('f', { typeDocumentId: 'F' }), doc('g', { typeDocumentId: 'G' })
    ];
    const segments = typeSegments(docs, { A: 'Courrier', B: 'Rapport', C: 'Plan', D: 'Photo', E: 'Carte' });
    expect(segments.map(s => s.label)).toEqual(['Courrier', 'Rapport', 'Plan', 'Photo', 'Carte', 'Autres']);
    expect(segments.map(s => s.value)).toEqual([6, 5, 4, 3, 2, 2]);
    expect(new Set(segments.map(s => s.color)).size).toBe(6);
    expect(segments.map(s => s.color)).toEqual([...PALETTE.slice(0, 5), OTHER_COLOR]);   // les teintes contrôlées, dans leur ordre ; le reste en teinte neutre
});

it('un type inconnu est dit tel quel, et sans reste il n’y a pas de segment « Autres »', () => {
    const segments = typeSegments([doc('1'), doc('2')], {});
    expect(segments).toEqual([expect.objectContaining({ label: 'Type inconnu', value: 2 })]);
});

it('l’accueil montre les chiffres lus, sans nombre inventé pour ce qui manque', () => {
    render(<HomeView data={data()} loading={false} name="Mariama" canGo={() => true} />);
    expect(screen.getByRole('heading', { name: 'Bienvenue, Mariama' })).toBeTruthy();
    const kpis = within(screen.getByLabelText('Indicateurs clés'));
    expect(kpis.getByText('Documents').closest('a, div, button')!.textContent).toContain('3');
    expect(kpis.getByText('Dossiers').closest('a, div, button')!.textContent).toContain('12');
    expect(kpis.getByText('Versements en attente').closest('a, div, button')!.textContent).toContain('3');
    expect(kpis.getByText('Validations en retard').closest('a, div, button')!.textContent).toContain('—');   // sans les nombres exacts du serveur, pas de chiffre pour ce qui ne se compte pas sur un échantillon
});

it('une donnée indisponible s’affiche « — » avec sa raison, et jamais 0', () => {
    render(<HomeView data={data({ docs: null, dossiers: null, tasks: { intakes: null, toControl: null, eliminations: null, holds: null, requests: null } })} loading={false} name="Ousmane" canGo={() => true} />);
    const kpis = within(screen.getByLabelText('Indicateurs clés'));
    for (const label of ['Documents', 'Dossiers', 'Versements en attente', 'Documents à contrôler', 'Demandes d’accès', 'Validations en retard']) {
        const text = kpis.getByText(label).closest('a, div, button')!.textContent!;
        expect(text, label).toContain('—');
        expect(text, label).not.toMatch(/\b0\b/);
    }
    expect(kpis.getAllByTitle(/Donnée non disponible/).length).toBe(6);   // chacun des six indicateurs concernés dit pourquoi dans son infobulle
});

it('pendant le chargement, les chiffres sont des points de suspension et non des zéros', () => {
    render(<HomeView data={null} loading name="Aminata" canGo={() => true} />);
    const kpis = within(screen.getByLabelText('Indicateurs clés'));
    expect(kpis.getByText('Documents').closest('a, div, button')!.textContent).toContain('…');
});

it('un chiffre calculé sur un échantillon partiel est suivi de « + » et le dit', () => {
    render(<HomeView data={data({ docs: { items: [doc('1')], partial: true }, dossiers: { count: 200, partial: true } })} loading={false} name="X" canGo={() => true} />);
    const kpis = within(screen.getByLabelText('Indicateurs clés'));
    expect(kpis.getByText('Documents').closest('a, div, button')!.textContent).toMatch(/1\+/);
    expect(kpis.getByText('Dossiers').closest('a, div, button')!.textContent).toMatch(/200\+/);
    expect(kpis.getByTitle('Calculé sur les 500 documents les plus récents')).toBeTruthy();
});

it('l’état du système n’est « Opérationnel » que si tout ce qui a été mesuré va bien', () => {
    const state = (over: Partial<HomeData>) => {
        const view = render(<HomeView data={data(over)} loading={false} name="X" canGo={() => true} />);
        const text = view.container.querySelector('.hm-state')!.textContent;
        view.unmount();
        return text;
    };
    expect(state({})).toBe('Opérationnel');
    expect(state({ search: 'warn' })).toBe('À vérifier');
    expect(state({ backup: 'unknown', ocr: 'unknown' })).toBe('Opérationnel');   // ce qui n'est pas mesuré ne compte ni pour ni contre
    expect(state({ apiOk: false })).toBe('Indisponible');
});

it('l’accueil renvoie au tableau de bord du périmètre, seulement à qui peut l’ouvrir', async () => {
    const { navigate } = await import('../../src/ui/navigation');
    const first = render(<HomeView data={data()} loading={false} name="Mariama" canGo={route => route === 'tableau-de-bord'} />);
    const link = screen.getByRole('button', { name: 'Voir le tableau de bord complet de votre périmètre' });
    link.click();
    expect(navigate).toHaveBeenCalledWith('/app/tableau-de-bord');
    first.unmount();
    render(<HomeView data={data()} loading={false} name="Mariama" canGo={() => false} />);
    expect(screen.queryByRole('button', { name: 'Voir le tableau de bord complet de votre périmètre' })).toBeNull();
});

it('l’accueil attire l’œil sur ce qui attend une action, et reste calme quand il n’y a rien', () => {
    render(<HomeView data={data()} loading={false} name="Mariama" canGo={() => true} />);
    const tile = (label: string) => screen.getByText(label, { selector: '.hm-kpi-body > span' }).closest('.hm-kpi') as HTMLElement;
    expect(tile('Versements en attente').className).toContain('alert-warning');   // trois versements ouverts
    expect(tile('Demandes d’accès').className).toContain('alert-info');
    expect(tile('Documents à contrôler').className).not.toContain('alert-');       // aucun : rien à signaler
    expect(tile('Documents').querySelector('svg.dv-spark')).not.toBeNull();         // la tendance des documents ajoutés
});

it('l’accueil n’a aucune violation d’accessibilité détectée automatiquement', async () => {
    const titled = data({ docs: { items: [doc('1', { title: 'Rapport annuel' }), doc('2', { title: 'Décision du conseil' })], partial: false } });
    const { container } = render(<HomeView data={titled} loading={false} name="Mariama" canGo={() => true} />);
    const result = await axe.run(container, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
        rules: { 'color-contrast': { enabled: false }, region: { enabled: false }, 'landmark-one-main': { enabled: false }, 'page-has-heading-one': { enabled: false } }
    });
    expect(result.violations.map(v => v.id + ' : ' + v.nodes.map(n => n.target.join(' ')).join(' ; '))).toEqual([]);
});

// ------------------------------------------------------------------------------------------------ les nombres exacts du serveur
const months12 = ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
const exact = (over: Partial<HomeExact> = {}): HomeExact => ({
    documents: 4812, dossiers: 1203, createdLast30Days: 141, monthly: months12.map((month, i) => ({ month, count: i + 1 })), byType: { t1: 3000, t2: 1812 }, workflow: { pending: 30, overdue: 7 }, ...over
});

it('avec les nombres du serveur, l’accueil écrit les totaux exacts, sans « + » ni mention d’échantillon', () => {
    render(<HomeView data={data({ exact: exact(), docs: { items: [doc('1')], partial: false }, dossiers: { count: 1203, partial: false } })} loading={false} name="Mariama" canGo={() => true} />);
    const kpis = within(screen.getByLabelText('Indicateurs clés'));
    const tile = (label: string) => kpis.getByText(label).closest('.hm-kpi') as HTMLElement;
    expect(tile('Documents').textContent).toContain(formatNumber(4812));
    expect(tile('Documents').textContent).not.toContain('812+');   // un total exact n'est pas suivi de « + »
    expect(tile('Documents').textContent).toContain('+' + formatNumber(141) + ' ces 30 derniers jours');
    expect(tile('Documents').getAttribute('title')).toBe(formatNumber(141) + ' créés ces 30 derniers jours');
    expect(tile('Validations en retard').textContent).toContain('7');
    expect(tile('Validations en retard').className).toContain('alert-critical');
    expect(tile('Validations en retard').getAttribute('title')).toBe('30 tâche(s) de validation en attente au total');
    expect(screen.queryByText(/documents les plus récents/)).toBeNull();
});

it('la répartition par type et la série viennent des totaux du serveur, pas de l’échantillon des derniers documents', () => {
    const { container } = render(<HomeView data={data({ exact: exact(), docs: { items: [doc('1')], partial: false } })} loading={false} name="Mariama" canGo={() => true} />);
    const rows = [...container.querySelectorAll('.dv-rows li')].map(li => li.textContent);
    expect(rows.some(r => r!.includes('Courrier') && r!.includes(formatNumber(3000)))).toBe(true);
    expect(rows.some(r => r!.includes('Rapport') && r!.includes(formatNumber(1812)))).toBe(true);
    const group = screen.getByRole('group', { name: /^Documents ajoutés : / });
    expect(group.getAttribute('aria-label')).toContain('Oct. 12');                       // le dernier mois du serveur
});

it('« Circuits de validation en retard » compte les tâches échues du serveur ; sans elles, un tiret', () => {
    const view = render(<HomeView data={data({ exact: exact() })} loading={false} name="X" canGo={() => true} />);
    const row = () => screen.getByText('Circuits de validation en retard').closest('button')!.textContent;
    expect(row()).toContain('7');
    view.unmount();
    render(<HomeView data={data({ exact: exact({ workflow: null }) })} loading={false} name="X" canGo={() => true} />);
    expect(screen.getByText('Circuits de validation en retard').closest('button')!.textContent).toContain('—');
});

it('la série exacte : « cette année » garde les mois depuis janvier, « 12 derniers mois » les garde tous', () => {
    const monthly = months12.map((month, i) => ({ month, count: i + 1 }));
    const year = exactSeries(monthly, 'year', NOW);
    expect(year.map(p => p.key)).toEqual(months12.slice(2));
    expect(year[0]!.label).toBe('Janv.');
    expect(exactSeries(monthly, 'rolling', NOW)).toHaveLength(12);
    expect(exactSeries([], 'year', NOW)).toEqual([]);
});

it('la répartition par type d’un total serveur : cinq types nommés, le reste en « Autres », les types vides écartés', () => {
    const segments = typeSegmentsOf({ A: 60, B: 50, C: 40, D: 30, E: 20, F: 10, G: 5, H: 0 }, { A: 'Courrier', B: 'Rapport', C: 'Plan', D: 'Photo', E: 'Carte' });
    expect(segments.map(s => s.label)).toEqual(['Courrier', 'Rapport', 'Plan', 'Photo', 'Carte', 'Autres']);
    expect(segments.map(s => s.value)).toEqual([60, 50, 40, 30, 20, 15]);
    expect(typeSegmentsOf({ X: 3 }, {}).map(s => s.label)).toEqual(['Type inconnu']);   // jamais l'identifiant du type
});

it('les derniers documents donnent la priorité au titre, la référence et le type passent en seconde ligne', () => {
    const titled = data({ docs: { items: [doc('1', { title: 'Rapport annuel 2025', reference: 'REF-2025-001' })], partial: false } });
    render(<HomeView data={titled} loading={false} name="Mariama" canGo={() => true} />);
    const row = screen.getByRole('button', { name: 'Rapport annuel 2025' }).closest('tr')!;
    expect(row.querySelector('.hm-ref')!.textContent).toBe('REF-2025-001 · Courrier');
});
