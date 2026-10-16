import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { RecordDocument } from '../../src/core/types';

// L'accueil : « jamais un chiffre inventé » — une donnée absente (habilitation, périmètre, erreur) s'affiche « — » avec sa raison, jamais 0 ; les séries et la répartition par type sont
// calculées sur les documents lus, et un état de service ne se déclare « opérationnel » que si tout ce qui a été mesuré va bien.
vi.mock('../../src/ui/navigation', () => ({ navigate: vi.fn() }));
vi.mock('../../src/auth/session', () => ({ useSession: () => ({}) }));
import { HomeView, monthlySeries, typeSegments, type HomeData } from '../../src/pages/Dashboard';

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
    expect(kpis.getByText('Volume total').closest('a, div, button')!.textContent).toContain('—');
});

it('une donnée indisponible s’affiche « — » avec sa raison, et jamais 0', () => {
    render(<HomeView data={data({ docs: null, dossiers: null, tasks: { intakes: null, toControl: null, eliminations: null, holds: null, requests: null } })} loading={false} name="Ousmane" canGo={() => true} />);
    const kpis = within(screen.getByLabelText('Indicateurs clés'));
    for (const label of ['Documents', 'Dossiers', 'Versements en attente', 'Documents à contrôler', 'Demandes d’accès']) {
        const text = kpis.getByText(label).closest('a, div, button')!.textContent!;
        expect(text, label).toContain('—');
        expect(text, label).not.toMatch(/\b0\b/);
    }
    expect(kpis.getAllByTitle(/Donnée non disponible/).length).toBe(5);   // chacun des cinq indicateurs concernés dit pourquoi dans son infobulle
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
