import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { expect, it } from 'vitest';
import { AreaChart, Breakdown, ChartTable, Donut, RankBars, Sparkline } from '../../src/ui/charts';
import { Card, EmptyNote, Facts, Kpi, Unavailable, updatedText } from '../../src/ui/DashboardParts';

// Les diagrammes et les pièces communes des tableaux de bord : une part se lit par sa valeur et son pourcentage, le survol met en valeur la part (barre et ligne), chaque courbe a son
// tableau jumeau, une valeur absente est un tiret (jamais zéro) et une valeur positive à surveiller se voit.
const nf = (n: number) => n.toLocaleString('fr-FR');
const segments = [
    { key: 'pub', label: 'Public', value: 640, color: '#87bafd' }, { key: 'int', label: 'Interne', value: 3350, color: '#6295d4' },
    { key: 'sec', label: 'Secret', value: 2, color: '#1d4d87' }, { key: 'vid', label: 'Confidentiel', value: 0, color: '#3f70ad' }
];
const series = (values: number[]) => ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin'].slice(0, values.length).map((label, i) => ({ key: 'm' + i, label, value: values[i]! }));
const points = series([0, 0, 40, 0, 0]);                 // clairsemée : des colonnes
const trend = series([3, 5, 4, 9, 12]);                  // assez de valeurs pour une courbe
const spiky = series([2, 40, 3, 3, 41, 4]);              // un pic net : la courbe ne doit pas le dépasser

it('une répartition montre, pour chaque part, sa valeur et son pourcentage ; une part minuscule est « < 1 % » et une part vide reste listée', () => {
    render(<Breakdown title="Documents par niveau" unit="document(s)" segments={segments} />);
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(4);
    expect(rows[0]!.textContent).toContain('Public' + nf(640) + '16 %');
    expect(rows[1]!.textContent).toContain('Interne' + nf(3350) + '84 %');
    expect(rows[2]!.textContent).toContain('Secret2< 1 %');
    expect(rows[3]!.textContent).toContain('Confidentiel00 %');
    // la barre ne porte que les parts non vides, et se résume en une phrase
    expect(screen.getByRole('img', { name: new RegExp('^Documents par niveau : Public ' + nf(640) + ', Interne ' + nf(3350) + ', Secret 2, Confidentiel 0$') })).toBeTruthy();
    expect(document.querySelectorAll('.db-sbar-seg')).toHaveLength(3);
});

it('survoler une ligne met sa part en valeur dans la barre et estompe les autres, et inversement', () => {
    const { container } = render(<Breakdown title="Documents par niveau" unit="document(s)" segments={segments} />);
    const rows = screen.getAllByRole('listitem');
    fireEvent.pointerEnter(rows[1]!);
    expect(rows[1]!.className).toContain('on');
    expect(rows[0]!.className).toContain('dim');
    const bars = [...container.querySelectorAll('.db-sbar-seg')];
    expect(bars[1]!.className).toContain('on');
    expect(bars[0]!.className).toContain('dim');
    fireEvent.pointerLeave(rows[1]!);
    expect(rows[0]!.className).not.toContain('dim');
    fireEvent.pointerMove(bars[0]!);
    expect(rows[0]!.className).toContain('on');
    const tip = container.querySelector('.db-tip')!;
    expect(tip.textContent).toContain(nf(640) + ' document(s) · 16 %');   // l'infobulle redit la ligne ; elle est décorative, la lecture reste le texte
    expect(tip.getAttribute('aria-hidden')).toBe('true');
    fireEvent.pointerLeave(bars[0]!);
    expect(container.querySelector('.db-tip')).toBeNull();
});

it('la légende « en ligne » des petites cartes ne répète pas les lignes de la répartition', () => {
    const { container } = render(<Breakdown title="Projets par statut" unit="projet(s)" layout="inline" segments={segments.slice(0, 2)} />);
    expect(container.querySelector('.dv-rows')).toBeNull();
    expect(container.querySelector('.db-key')!.textContent).toContain('Public' + nf(640));
});

it('l’anneau montre le total au centre, la part survolée quand on en survole une, et la même légende en lignes', () => {
    const { container } = render(<Donut title="Documents par situation" unit="document(s)" segments={segments} centerLabel="documents" />);
    expect(container.querySelector('.db-donut-total')!.textContent).toBe(nf(3992));
    expect(container.querySelector('.db-donut-label')!.textContent).toBe('documents');
    fireEvent.pointerMove(container.querySelector('circle.db-donut-seg')!);
    expect(container.querySelector('.db-donut-total')!.textContent).toBe(nf(640));
    expect(container.querySelector('.db-donut-label')!.textContent).toBe('16 %');
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByRole('img', { name: /^Documents par situation : Public 16 %, Interne 84 %/ })).toBeTruthy();
});

it('la courbe se résume en texte, écrit sa dernière valeur et se parcourt aux flèches (un seul arrêt de tabulation) comme à la souris', () => {
    const { container } = render(<AreaChart title="Documents ajoutés" unit="document(s)" points={trend} color="#1f8a5b" />);
    const group = screen.getByRole('group', { name: 'Documents ajoutés : Janv. 3 ; Févr. 5 ; Mars 4 ; Avr. 9 ; Mai 12' });
    expect(container.querySelector('.dv-endlabel text')!.textContent).toBe('12');   // la dernière période
    expect(container.querySelectorAll('[tabindex]')).toHaveLength(1);                // le diagramme n'est qu'un arrêt ; ses marques ne sont pas des rôles imbriqués
    expect(group.getAttribute('tabindex')).toBe('0');
    const status = () => screen.getByRole('status').textContent;
    expect(status()).toBe('');
    fireEvent.keyDown(group, { key: 'ArrowLeft' });
    expect(status()).toBe('Mai : 12 document(s)');
    fireEvent.keyDown(group, { key: 'ArrowLeft' });
    expect(status()).toBe('Avr. : 9 document(s)');
    const tip = container.querySelector('.db-tip')!;
    expect(tip.textContent).toContain('Avr.');
    expect(tip.textContent).toContain('9 document(s)');
    expect(tip.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('.dv-endlabel')).toBeNull();                      // la valeur finale cède la place au repère actif
    fireEvent.keyDown(group, { key: 'Home' });
    expect(status()).toBe('Janv. : 3 document(s)');
    fireEvent.keyDown(group, { key: 'End' });
    expect(status()).toBe('Mai : 12 document(s)');
    fireEvent.keyDown(group, { key: 'Escape' });
    expect(status()).toBe('');
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(status()).toBe('Janv. : 3 document(s)');
    fireEvent.blur(group);
    expect(status()).toBe('');
    expect(container.querySelector('.dv-endlabel')).not.toBeNull();
    // à la souris : la zone de la période
    fireEvent.pointerMove(container.querySelectorAll('svg rect[fill="transparent"]')[2]!);
    expect(status()).toBe('Mars : 4 document(s)');
    fireEvent.pointerLeave(container.querySelectorAll('svg rect[fill="transparent"]')[2]!);
    expect(status()).toBe('');
});

it('peu de périodes avec une valeur : des colonnes, jamais une courbe lissée qui inventerait une montée', () => {
    const { container } = render(<AreaChart title="Documents ajoutés" unit="document(s)" points={points} color="#1f8a5b" />);
    expect(container.querySelector('path[stroke="#1f8a5b"]')).toBeNull();                         // aucune courbe
    expect(container.querySelectorAll('path[fill="#1f8a5b"]')).toHaveLength(1);                   // une colonne : mars
    expect(container.querySelectorAll('rect[fill="#1f8a5b"]')).toHaveLength(4);                   // les autres périodes : un trait d'axe, pas un trou
    expect(container.querySelector('.dv-endlabel')).toBeNull();                                   // la dernière période vaut zéro : rien n'est écrit
    expect(screen.getByRole('group', { name: /Mars 40/ })).toBeTruthy();
    const { container: smooth } = render(<AreaChart title="Documents ajoutés" unit="document(s)" points={points} color="#1f8a5b" variant="area" />);
    expect(smooth.querySelector('path[stroke="#1f8a5b"]')).not.toBeNull();                        // sauf si on la demande
});

it('la courbe ne descend jamais sous l’axe ni ne monte au-dessus de son sommet entre deux points (interpolation monotone)', () => {
    const { container } = render(<AreaChart title="Documents ajoutés" unit="document(s)" points={spiky} color="#1f8a5b" />);
    const baseline = Number(container.querySelector('line.axis')!.getAttribute('y1'));
    const line = [...container.querySelectorAll('path')].find(p => p.getAttribute('stroke') === '#1f8a5b')!;
    const ys = (line.getAttribute('d')!.match(/-?\d+(\.\d+)? -?\d+(\.\d+)?/g) ?? []).map(pair => Number(pair.split(' ')[1]));
    expect(ys.length).toBeGreaterThan(5);
    expect(Math.max(...ys)).toBeLessThanOrEqual(baseline + 0.05);
    const top = Math.min(...ys);
    const highestTick = Math.min(...[...container.querySelectorAll('line.grid')].map(l => Number(l.getAttribute('y1'))));
    expect(top).toBeGreaterThanOrEqual(highestTick - 0.05);
});

it('chaque courbe a son tableau jumeau, montré et masqué à la demande, avec toutes ses valeurs', () => {
    render(<AreaChart title="Documents ajoutés" unit="document(s)" points={points} color="#1f8a5b" />);
    expect(screen.queryByRole('table')).toBeNull();
    const toggle = screen.getByRole('button', { name: 'Afficher les données sous forme de tableau' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    const table = within(screen.getByRole('table', { name: 'Documents ajoutés' }));
    expect(table.getAllByRole('row')).toHaveLength(6);
    expect(table.getByRole('row', { name: /Mars/ }).textContent).toContain('40');
    expect(screen.getByRole('button', { name: 'Masquer le tableau' }).getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Masquer le tableau' }));
    expect(screen.queryByRole('table')).toBeNull();
});

it('le tableau jumeau seul se déplie sur ses lignes', () => {
    render(<ChartTable caption="Échéances" head={['État', 'Nombre']} rows={[['Échue', '41'], ['Planifiée', '920']]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Afficher les données sous forme de tableau' }));
    expect(screen.getAllByRole('row').map(r => r.textContent)).toEqual(['ÉtatNombre', 'Échue41', 'Planifiée920']);
});

it('la mini-courbe est décorative, marque sa dernière valeur et ne s’affiche pas avec moins de deux points', () => {
    const { container, rerender } = render(<Sparkline values={[3, 5, 4, 9]} />);
    const svg = container.querySelector('svg.dv-spark')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.querySelectorAll('circle')).toHaveLength(1);
    rerender(<Sparkline values={[3]} />);
    expect(container.querySelector('svg')).toBeNull();
});

it('une tendance clairsemée devient des colonnes (la dernière mise en valeur) : zéro, zéro, puis cinq ne dessine pas une montée', () => {
    const { container } = render(<Sparkline values={[0, 0, 0, 0, 0, 5]} labels={['Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.']} color="#fff" accent="#f1d98c" />);
    const svg = container.querySelector('svg.dv-spark')!;
    expect(svg.getAttribute('class')).toContain('bars');
    expect(svg.querySelectorAll('circle')).toHaveLength(0);
    expect(svg.querySelectorAll('path[stroke]')).toHaveLength(0);
    const bars = [...svg.querySelectorAll('rect')];
    expect(bars).toHaveLength(6);
    expect(bars[5]!.getAttribute('fill')).toBe('#f1d98c');                         // la dernière période
    expect(bars[5]!.querySelector('title')!.textContent).toBe('Oct. : 5');          // nommée au survol, sans lire un tableau
    expect(Number(bars[5]!.getAttribute('height'))).toBeGreaterThan(Number(bars[0]!.getAttribute('height')));
});

it('l’anneau cède la place à la répartition quand il reste deux parts ou moins : un anneau ne dirait rien de plus', () => {
    const { container } = render(<Donut title="Documents par situation" unit="document(s)" segments={segments.slice(0, 2)} centerLabel="documents" />);
    expect(container.querySelector('.db-donut')).toBeNull();
    expect(container.querySelector('.dv-break')).not.toBeNull();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
});

it('les barres de classement comparent sur une même échelle : la plus grande remplit la piste, une valeur nulle reste vide', () => {
    render(<RankBars rows={[{ key: 'a', label: 'Numérisation', value: 220 }, { key: 'b', label: 'Réception', value: 55 }, { key: 'c', label: 'Validation', value: 0 }]} fill="#1f8a5b" track="#e1efe7" unit="élément(s)" />);
    const fill = (name: string) => (screen.getByRole('meter', { name }).firstElementChild as HTMLElement).style.width;
    expect(fill('Numérisation')).toBe('100%');
    expect(fill('Réception')).toBe('25%');
    expect(fill('Validation')).toBe('0%');
    expect(screen.getByRole('meter', { name: 'Réception' }).getAttribute('aria-valuetext')).toBe('55 élément(s)');
});

// ------------------------------------------------------------------------------------------------ les indicateurs
it('un indicateur écrit sa valeur formatée, son suffixe et son libellé ; une valeur absente est un tiret avec sa raison, jamais zéro', () => {
    const { container, rerender } = render(<Kpi icon="docList" tone="green" value={4812} suffix="+" label="Documents" />);
    expect(container.querySelector('strong')!.textContent).toBe(nf(4812) + '+');
    expect(container.querySelector('.hm-kpi-body > span')!.textContent).toBe('Documents');
    rerender(<Kpi icon="docList" tone="green" value={null} label="Documents" />);
    expect(container.querySelector('strong')!.textContent).toBe('—');
    expect(container.querySelector('.hm-kpi')!.getAttribute('title')).toMatch(/^Non disponible/);
    rerender(<Kpi icon="docList" tone="green" value={undefined} label="Documents" hint="Raison précise" />);
    expect(container.querySelector('.hm-kpi')!.getAttribute('title')).toBe('Raison précise');
    rerender(<Kpi icon="docList" tone="green" value="…" label="Documents" />);
    expect(container.querySelector('.hm-kpi')!.className).toContain('loading');
});

it('seule une valeur positive à surveiller prend la mise en garde ; zéro et absent restent calmes', () => {
    const cls = (value: number | null) => { const { container, unmount } = render(<Kpi icon="hourglass" tone="red" alert="critical" value={value} label="Échéances dépassées" />); const c = container.querySelector('.hm-kpi')!.className; unmount(); return c; };
    expect(cls(41)).toContain('alert-critical');
    expect(cls(0)).not.toContain('alert-');
    expect(cls(null)).not.toContain('alert-');
});

it('l’indicateur phare montre sa tendance et sa variation ; un indicateur sans clic n’est pas un bouton', () => {
    const { container, rerender } = render(<Kpi variant="hero" icon="docList" tone="green" value={4812} label="Documents" trend={[3, 5, 4, 9]} delta={{ text: '+141 ces 30 derniers jours', up: true }} />);
    expect(container.querySelector('.hm-kpi.hero')).not.toBeNull();
    expect(container.querySelector('svg.dv-spark')).not.toBeNull();
    expect(container.querySelector('em.up')!.textContent).toBe('+141 ces 30 derniers jours');
    expect(screen.queryByRole('button')).toBeNull();
    let clicked = 0;
    rerender(<Kpi icon="docList" tone="green" value={1} label="Documents" onClick={() => { clicked++; }} />);
    fireEvent.click(screen.getByRole('button'));
    expect(clicked).toBe(1);
});

it('l’indicateur phare dit ce que couvre sa tendance : légende, première et dernière période ; sans tendance, le chiffre seul', () => {
    const { container, rerender } = render(<Kpi variant="hero" icon="docList" tone="green" value={5} label="Documents" trend={[0, 0, 0, 5]} trendLabels={['Juil.', 'Août', 'Sept.', 'Oct.']} trendCaption="12 derniers mois" />);
    expect(container.querySelector('.dv-hero-cap')!.textContent).toBe('12 derniers mois');
    expect([...container.querySelectorAll('.dv-hero-axis span')].map(s => s.textContent)).toEqual(['Juil.', 'Oct.']);
    expect(container.querySelector('.dv-hero-axis')!.getAttribute('aria-hidden')).toBe('true');   // l'axe est décoratif : les valeurs se lisent à la mini-courbe et dans le tableau
    expect(container.querySelector('svg.dv-spark')!.getAttribute('class')).toContain('bars');
    rerender(<Kpi variant="hero" icon="docList" tone="green" value={5} label="Documents" />);
    expect(container.querySelector('.dv-hero-trend')).toBeNull();
    expect(container.querySelector('.dv-hero-grid')!.className).toContain('alone');
});

it('un zéro s’éteint dans un indicateur ordinaire, pas dans l’indicateur phare', () => {
    const { container, rerender } = render(<Kpi icon="folder" tone="mint" value={0} label="Dossiers" />);
    expect(container.querySelector('strong')!.className).toBe('zero');
    rerender(<Kpi variant="hero" icon="docList" tone="green" value={0} label="Documents" />);
    expect(container.querySelector('strong')!.className).toBe('');
});

it('une carte, une rubrique non disponible, un état vide et une suite de chiffres se disent en clair', () => {
    render(<>
        <Card title="Activité" subtitle="Par mois"><Unavailable>Non disponible : votre habilitation ne couvre pas cette rubrique.</Unavailable><EmptyNote>Aucun document.</EmptyNote></Card>
        <Facts className="nd-facts" rows={[['entrées ouvertes', 6], ['sans origine', null]]} />
    </>);
    expect(screen.getByRole('heading', { name: 'Activité' })).toBeTruthy();
    expect(screen.getByText('Par mois')).toBeTruthy();
    expect(screen.getByText('Non disponible : votre habilitation ne couvre pas cette rubrique.')).toBeTruthy();
    expect(screen.getByText('Aucun document.')).toBeTruthy();
    expect(screen.getAllByRole('listitem').map(li => li.textContent)).toEqual(['6entrées ouvertes', '—sans origine']);
});

it('la date de mise à jour se dit en français ; une date illisible ne dit rien', () => {
    expect(updatedText('2026-10-19T10:30:00')).toBe('Mis à jour le 19/10/2026 à 10:30');
    expect(updatedText('pas une date')).toBe('');
});

it('les diagrammes et indicateurs n’ont aucune violation d’accessibilité détectée automatiquement', async () => {
    const { container } = render(<main>
        <Kpi variant="hero" icon="docList" tone="green" value={4812} label="Documents" trend={[3, 5, 4, 9]} delta={{ text: '+141 ces 30 derniers jours', up: true }} onClick={() => undefined} />
        <Kpi icon="hourglass" tone="red" alert="critical" value={41} label="Échéances dépassées" />
        <Card title="Activité"><AreaChart title="Documents ajoutés" unit="document(s)" points={points} color="#1f8a5b" /></Card>
        <Card title="Situation"><Donut title="Documents par situation" unit="document(s)" segments={segments} centerLabel="documents" /></Card>
        <Card title="Niveaux"><Breakdown title="Documents par niveau" unit="document(s)" segments={segments} /></Card>
        <Card title="Étapes"><RankBars rows={[{ key: 'a', label: 'Numérisation', value: 220 }]} fill="#1f8a5b" track="#e1efe7" unit="élément(s)" /></Card>
    </main>);
    const result = await axe.run(container, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
        rules: { 'color-contrast': { enabled: false }, region: { enabled: false }, 'page-has-heading-one': { enabled: false } }
    });
    expect(result.violations.map(v => v.id + ' : ' + v.nodes.map(n => n.target.join(' ')).join(' ; '))).toEqual([]);
});
