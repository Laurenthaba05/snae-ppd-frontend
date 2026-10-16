import React from 'react';
import { useSession } from '../auth/session';
import { useWorkspace } from '../ui/workspace';
import { navigate } from '../ui/navigation';
import { Icon } from '../ui/icons';
import { Notice, useResource } from '../ui/components';
import { Meter, ProgressBars, StackedBar, StackedColumns, nf, percent } from '../ui/charts';
import type { Column, Progress } from '../ui/charts';
import { can } from '../core/policy';
import { moduleVisible } from '../design/navigation';
import { PipelineBoard } from '../ui/PipelineBoard';
import { STAGES, isTerminalStage } from '../core/workflow';
import type { PipelineStage, QualityControlListItem } from '../core/types';

type Tone = 'green' | 'blue' | 'amber';

const stepTitles = ['Réception du lot', 'Numérisation', 'OCR et indexation', 'Contrôle qualité', 'Enrichissement des métadonnées', 'Circuit de validation', 'Prêt pour versement'];

type Cell = { tone: Tone; icon: string; title: string; bullets: string[] };
const roles: Array<{ name: string; text: string; icon: string; color: string; cells: Record<number, Cell> }> = [
    { name: 'Agent de numérisation', text: 'Prépare et numérise les documents', icon: 'user', color: 'green', cells: {
        1: { tone: 'green', icon: 'inbox', title: 'Importer un lot', bullets: ['Enregistrer le lot dans le système'] },
        2: { tone: 'blue', icon: 'document', title: 'Numériser les documents', bullets: ['Scanner', 'Contrôler la qualité', 'Corriger l’orientation'] } } },
    { name: 'Opérateur OCR', text: 'Traite le texte et indexe', icon: 'user', color: 'blue', cells: {
        3: { tone: 'blue', icon: 'ocr', title: 'Lancer l’OCR', bullets: ['Exécuter la reconnaissance', 'Vérifier la confiance', 'Indexer automatiquement'] } } },
    { name: 'Contrôleur qualité', text: 'Vérifie la conformité des fichiers et du contenu', icon: 'user', color: 'gold', cells: {
        4: { tone: 'amber', icon: 'alert', title: 'Contrôler la qualité', bullets: ['Vérifier l’image', 'Contrôler le texte OCR', 'Détecter les doublons'] },
        5: { tone: 'blue', icon: 'tag', title: 'Compléter les métadonnées', bullets: ['Enrichir les métadonnées', 'Normaliser les champs', 'Assurer la cohérence'] } } },
    { name: 'Responsable validation', text: 'Approuve le lot pour versement', icon: 'user', color: 'purple', cells: {
        6: { tone: 'blue', icon: 'userCheck', title: 'Revoir et valider', bullets: ['Examiner le lot', 'Approuver ou rejeter', 'Demander une correction'] },
        7: { tone: 'green', icon: 'checkCircle', title: 'Valider le lot', bullets: ['Confirmer la conformité', 'Clôturer le traitement', 'Préparer le versement'] } } }
];
const outputs: Array<{ icon: string; text: string; tone: Tone }> = [
    { icon: 'inbox', text: 'Lot enregistré', tone: 'green' },
    { icon: 'docList', text: 'Fichiers numérisés', tone: 'blue' },
    { icon: 'document', text: 'Texte et index', tone: 'green' },
    { icon: 'alert', text: 'Rapport de contrôle', tone: 'amber' },
    { icon: 'checkCircle', text: 'Métadonnées enrichies', tone: 'blue' },
    { icon: 'docCheck', text: 'Lot validé', tone: 'blue' },
    { icon: 'checkCircle', text: 'Prêt pour versement', tone: 'green' }
];
const legend = [['todo', 'À faire'], ['run', 'En cours'], ['fix', 'À corriger'], ['ok', 'Validé']] as const;
const quickActions: Array<{ route: string; icon: string; label: string; tone: string }> = [
    { route: 'numerisation', icon: 'plusCircle', label: 'Nouveau lot de traitement', tone: 'primary' },
    { route: 'ocr', icon: 'ocr', label: 'Lancer l’OCR', tone: 'mint' },
    { route: 'controle', icon: 'search', label: 'Contrôle qualité', tone: 'sand' },
    { route: 'metadonnees', icon: 'tag', label: 'Enrichir les métadonnées', tone: 'sand' },
    { route: 'circuits-validation', icon: 'users', label: 'Soumettre à validation', tone: 'sand' }
];
const rules: Array<{ icon: string; title: string; text: string }> = [
    { icon: 'docCheck', title: 'Formats autorisés', text: 'PDF, TIFF, JPEG, PNG (300 dpi minimum)' },
    { icon: 'tag', title: 'Champs obligatoires', text: 'Titre, date, producteur, type, cote' },
    { icon: 'cog', title: 'Seuil minimal OCR', text: 'Confiance ≥ 80%' },
    { icon: 'docList', title: 'Traçabilité', text: 'Toutes les actions sont journalisées' }
];

/** Couleurs des diagrammes : palette catégorielle validée (bleu, turquoise) + couleurs d’état réservées. */
const color = { blue: '#2a78d6', aqua: '#1baf7a', muted: '#b4bcc3', track: '#cde2fb', good: '#0ca30c', warn: '#fab219' };

/** Les projets lus pour compter les éléments sont plafonnés pour borner le nombre d’appels. */
const PROJECT_CAP = 25;
const MONTHS = 6;
export interface TreatmentData {
    projects: { enCours: number; termine: number; annule: number };
    elements: { termine: number; enCours: number; partial: boolean };
    controls: { conformes: number; aCorriger: number };
    monthly: Column[];
    progress: Progress[];
    /** Confiance moyenne des textes OCR (0 à 1) ; null si le serveur n'expose pas encore la vue d'ensemble OCR ou si aucun résultat n'existe. */
    ocrAverage: number | null;
    /** Éléments par étape du parcours ; null si le serveur n'expose pas encore le suivi par étapes. */
    pipeline: PipelineStage[] | null;
}

/** Éléments à l'étape d'index donné (0 à 6) du parcours ; null si le suivi par étapes n'est pas disponible. */
function stageCount(pipeline: PipelineStage[] | null | undefined, index: number): number | null {
    const status = STAGES[index]?.status;
    return pipeline && status ? pipeline.find(p => p.statut === status)?.elements ?? 0 : null;
}

function monthKey(date: Date) { return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0'); }

function useTreatmentData() {
    const { me, digitization, epoch } = useSession();
    const allowed = !!digitization && can(me, 'DIGITIZATION_READ', {});
    return useResource<TreatmentData | null>(async signal => {
        if (!digitization || !allowed) return null;
        const [projects, controls, ocr, pipeline] = await Promise.all([digitization.projects(signal), digitization.qualityControls(signal), digitization.ocrResults(signal).catch(() => null), digitization.pipeline(undefined, signal).catch(() => null)]);
        const confidences = (ocr ?? []).map(r => Number(r.confiance)).filter(c => Number.isFinite(c));
        const live = projects.filter(p => p.statut !== 'ANNULE');
        const counted = live.slice(0, PROJECT_CAP);
        const elements = await Promise.all(counted.map(p => digitization.elementsByProject(p.id, signal)));
        const latest = new Map<string, QualityControlListItem>();
        for (const control of controls) {
            const previous = latest.get(control.elementNumerisationId);
            if (!previous || previous.dateControle < control.dateControle) latest.set(control.elementNumerisationId, control);
        }
        const now = new Date();
        const months = Array.from({ length: MONTHS }, (_, i) => new Date(now.getFullYear(), now.getMonth() - (MONTHS - 1 - i), 1));
        const monthly: Column[] = months.map(m => ({ key: monthKey(m), label: new Intl.DateTimeFormat('fr-FR', { month: 'short' }).format(m).replace('.', ''), good: 0, warn: 0 }));
        for (const control of controls) {
            const date = new Date(control.dateControle);
            if (Number.isNaN(date.getTime())) continue;
            const column = monthly.find(c => c.key === monthKey(date));
            if (column) { if (control.conforme) column.good++; else column.warn++; }
        }
        const progress = counted.flatMap((project, i) => {
            const list = elements[i] ?? [];
            const counted = list.filter(e => e.statut !== 'ANNULE');
            return project.statut === 'EN_COURS' && counted.length ? [{ key: project.id, name: project.nom, done: counted.filter(e => e.statut === 'TERMINE').length, total: counted.length }] : [];
        }).sort((a, b) => b.total - a.total).slice(0, 6);
        const flat = elements.flat();
        return {
            projects: { enCours: projects.filter(p => p.statut === 'EN_COURS').length, termine: projects.filter(p => p.statut === 'TERMINE').length, annule: projects.filter(p => p.statut === 'ANNULE').length },
            elements: { termine: flat.filter(e => e.statut === 'TERMINE').length, enCours: flat.filter(e => !isTerminalStage(e.statut)).length, partial: live.length > counted.length },
            controls: { conformes: [...latest.values()].filter(c => c.conforme).length, aCorriger: [...latest.values()].filter(c => !c.conforme).length },
            monthly,
            progress,
            ocrAverage: confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : null,
            pipeline
        };
    }, 'treatment-data:' + epoch + ':' + allowed);
}

function Kpi({ icon, tone, value, label, hint }: { icon: string; tone: string; value: string; label: string; hint?: string }) {
    return <div className="db-kpi" title={hint}><span className={'db-kpi-icon ' + tone}><Icon name={icon} size={22} /></span><div><strong>{value}</strong><span>{label}</span></div></div>;
}

function Tile({ title, hero, unit, children, wide }: { title: string; hero?: string; unit?: string; children: React.ReactNode; wide?: boolean }) {
    return <section className={'db-tile' + (wide ? ' wide' : '')} aria-label={title}>
        <h3>{title}</h3>
        {hero !== undefined && <p className="db-tile-hero"><strong>{hero}</strong>{unit && <span>{unit}</span>}</p>}
        {children}
    </section>;
}

export function TreatmentCharts({ data }: { data: TreatmentData }) {
    const projectTotal = data.projects.enCours + data.projects.termine + data.projects.annule;
    const elementTotal = data.elements.termine + data.elements.enCours;
    const controlTotal = data.controls.conformes + data.controls.aCorriger;
    const monthlyTotal = data.monthly.reduce((n, c) => n + c.good + c.warn, 0);
    const good = { label: 'Conformes', color: color.good, icon: 'check' };
    const warn = { label: 'À corriger', color: color.warn, icon: 'alert' };
    return <>
        <div className="db-tiles">
            <Tile title="Projets de numérisation" hero={nf(projectTotal)} unit={projectTotal > 1 ? 'projets' : 'projet'}>
                <StackedBar title="Projets par statut" unit="projet(s)" segments={[
                    { key: 'EN_COURS', label: 'En cours', value: data.projects.enCours, color: color.blue },
                    { key: 'TERMINE', label: 'Terminés', value: data.projects.termine, color: color.aqua },
                    { key: 'ANNULE', label: 'Annulés', value: data.projects.annule, color: color.muted }]} />
            </Tile>
            <Tile title="Éléments numérisés" hero={percent(data.elements.termine, elementTotal) + ' %'} unit={nf(data.elements.termine) + ' sur ' + nf(elementTotal) + (data.elements.partial ? ' (premiers ' + PROJECT_CAP + ' projets)' : '')}>
                <Meter label="Éléments numérisés" value={data.elements.termine} total={elementTotal} fill={color.blue} track={color.track} />
                <ul className="db-key"><li><i style={{ background: color.blue }} /><span>Terminés</span><b>{nf(data.elements.termine)}</b></li><li><i style={{ background: color.track }} /><span>En cours</span><b>{nf(data.elements.enCours)}</b></li></ul>
            </Tile>
            <Tile title="Contrôles qualité" hero={nf(controlTotal)} unit={controlTotal > 1 ? 'éléments contrôlés' : 'élément contrôlé'}>
                <StackedBar title="Dernier contrôle par élément" unit="élément(s)" segments={[
                    { key: 'ok', label: good.label, value: data.controls.conformes, color: good.color, icon: good.icon },
                    { key: 'ko', label: warn.label, value: data.controls.aCorriger, color: warn.color, icon: warn.icon }]} />
            </Tile>
        </div>
        <div className="db-tiles two">
            <Tile title={'Contrôles qualité sur ' + MONTHS + ' mois'}>
                {monthlyTotal ? <StackedColumns title="Contrôles qualité par mois" unit="contrôle(s)" columns={data.monthly} good={good} warn={warn} /> : <p className="db-chart-note">Aucun contrôle consigné sur les {MONTHS} derniers mois.</p>}
            </Tile>
            <Tile title="Avancement des projets en cours">
                {data.progress.length ? <ProgressBars rows={data.progress} fill={color.blue} track={color.track} /> : <p className="db-chart-note">Aucun projet en cours avec des éléments à suivre.</p>}
            </Tile>
        </div>
        <details className="db-data">
            <summary>Afficher les données sous forme de tableau</summary>
            <div className="db-matrix-scroll" tabIndex={0} role="region" aria-label="Tableau, défilement horizontal possible"><table>
                <caption>Indicateurs de traitement</caption>
                <thead><tr><th scope="col">Indicateur</th><th scope="col">Détail</th><th scope="col">Valeur</th></tr></thead>
                <tbody>
                    <tr><th scope="row" rowSpan={3}>Projets de numérisation</th><td>En cours</td><td>{nf(data.projects.enCours)}</td></tr>
                    <tr><td>Terminés</td><td>{nf(data.projects.termine)}</td></tr>
                    <tr><td>Annulés</td><td>{nf(data.projects.annule)}</td></tr>
                    <tr><th scope="row" rowSpan={2}>Éléments numérisés</th><td>Terminés</td><td>{nf(data.elements.termine)}</td></tr>
                    <tr><td>En cours</td><td>{nf(data.elements.enCours)}</td></tr>
                    <tr><th scope="row" rowSpan={2}>Contrôles qualité (dernier par élément)</th><td>Conformes</td><td>{nf(data.controls.conformes)}</td></tr>
                    <tr><td>À corriger</td><td>{nf(data.controls.aCorriger)}</td></tr>
                    {data.monthly.map((c, i) => <tr key={c.key}>{i === 0 && <th scope="row" rowSpan={data.monthly.length}>Contrôles par mois</th>}<td>{c.label}</td><td>{nf(c.good)} conformes · {nf(c.warn)} à corriger</td></tr>)}
                    {data.progress.map((p, i) => <tr key={p.key}>{i === 0 && <th scope="row" rowSpan={data.progress.length}>Avancement des projets en cours</th>}<td>{p.name}</td><td>{nf(p.done)} / {nf(p.total)} ({percent(p.done, p.total)} %)</td></tr>)}
                </tbody>
            </table></div>
        </details>
    </>;
}

export function TreatmentDashboard() {
    const { me, demo } = useSession();
    const { scope } = useWorkspace();
    const treatment = useTreatmentData();
    const data = treatment.data ?? undefined;
    const count = (n: number | undefined, partial = false) => treatment.loading ? '…' : treatment.error || n === undefined ? '—' : nf(n) + (partial ? '+' : '');
    const na = 'Indicateur non exposé par l’API actuelle';
    const empty = !!data && !data.projects.enCours && !data.projects.termine && !data.projects.annule && !data.controls.conformes && !data.controls.aCorriger;
    return <div className="db">
        <section className="db-hero">
            <div className="db-hero-text">
                <h1>Parcours utilisateur — Module Traitement</h1>
                <p>De la numérisation au versement, un processus maîtrisé pour des archives fiables et pérennes.</p>
            </div>
            <img className="db-hero-img" src="/dashboard/banner.jpg" alt="" />
            <blockquote className="db-hero-quote">« Des documents traités aujourd’hui, une mémoire durable demain. »</blockquote>
        </section>
        <div className="db-layout">
            <div className="db-main">
                <section className="db-card db-charts-card" aria-label="Indicateurs de traitement en diagrammes">
                    <div className="db-matrix-head">
                        <div><h2>Suivi du traitement</h2><p>Projets de numérisation, éléments numérisés et contrôles qualité.</p></div>
                    </div>
                    {treatment.loading ? <p className="db-chart-note">Chargement des indicateurs…</p>
                        : treatment.error ? <div className="db-chart-note">Impossible de charger les indicateurs de traitement. <button className="text-link" onClick={treatment.refresh}>Réessayer</button></div>
                        : !data ? <p className="db-chart-note">Les diagrammes s’affichent avec les données de numérisation du serveur (habilitation de lecture de la numérisation requise).</p>
                        : empty ? <p className="db-chart-note">Aucun projet de numérisation ni contrôle qualité enregistré pour le moment.</p>
                        : <TreatmentCharts data={data} />}
                </section>
                {data?.pipeline && <PipelineBoard pipeline={data.pipeline} />}
                <section className="db-card db-matrix-card" aria-label="Cartographie du parcours par rôle utilisateur">
                    <div className="db-matrix-head">
                        <div><h2>Cartographie du parcours par rôle utilisateur</h2><p>Visualisez les actions de chaque acteur tout au long du processus de traitement.</p></div>
                        <ul className="db-legend">{legend.map(([key, label]) => <li key={key}><i className={key} />{label}</li>)}</ul>
                    </div>
                    <div className="db-matrix-scroll" tabIndex={0} role="region" aria-label="Tableau, défilement horizontal possible">
                        <table className="db-matrix">
                            <thead><tr><td />{stepTitles.map((title, index) => <th key={title} scope="col">{index + 1}. {title}{stageCount(data?.pipeline, index) !== null && <span className="db-count" title="Éléments à cette étape">{nf(stageCount(data?.pipeline, index)!)}</span>}</th>)}</tr></thead>
                            <tbody>
                                {roles.map((role, rowIndex) => <tr key={role.name}>
                                    <th scope="row"><div className="db-role-inner"><span className={'db-avatar ' + role.color}><Icon name={role.icon} size={20} /></span><span><strong>{role.name}</strong><small>{role.text}</small></span></div></th>
                                    {stepTitles.map((_, index) => {
                                        const step = index + 1;
                                        const cell = role.cells[step];
                                        if (!cell) return <td key={step} className="db-empty"><span>—</span></td>;
                                        const crossRow = step > 1 && !roles[rowIndex]!.cells[step - 1];
                                        return <td key={step} className={'db-cell-wrap' + (step < stepTitles.length ? ' next' : '') + (crossRow ? ' from-prev' : '')}>
                                            <div className={'db-cell ' + cell.tone}><b><Icon name={cell.icon} size={15} />{cell.title}</b><ul>{cell.bullets.map(b => <li key={b}>{b}</li>)}</ul></div>
                                        </td>;
                                    })}
                                </tr>)}
                                <tr className="db-output">
                                    <th scope="row">Sortie de l’étape</th>
                                    {outputs.map(o => <td key={o.text}><span className={'db-out ' + o.tone}><i><Icon name={o.icon} size={15} /></i>{o.text}</span></td>)}
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>
            <aside className="db-aside">
                <section className="db-card db-panel">
                    <div className="db-panel-head"><h2>Indicateurs du traitement</h2><span className="db-period">À ce jour</span></div>
                    <Kpi icon="docList" tone="green" value={count(data?.projects.enCours)} label="Lots en cours de traitement" />
                    <Kpi icon="stack" tone="blue" value={count(data?.elements.termine, data?.elements.partial)} label="Documents numérisés" hint={data?.elements.partial ? 'Calculé sur les ' + PROJECT_CAP + ' premiers projets' : undefined} />
                    <Kpi icon="percent" tone="blue" value={treatment.loading ? '…' : data?.ocrAverage != null ? Math.round(data.ocrAverage * 100) + ' %' : '—'} label="Taux de reconnaissance OCR" hint={data?.ocrAverage != null ? 'Confiance moyenne des textes extraits' : 'Aucun résultat OCR ou vue d’ensemble indisponible'} />
                    <Kpi icon="alertCircle" tone="red" value={count(data?.controls.aCorriger)} label="Documents à corriger" />
                    <Kpi icon="download" tone="amber" value="—" label="Validations en attente" hint={na} />
                </section>
                <section className="db-card db-panel">
                    <h2>Actions rapides</h2>
                    <div className="db-quick">
                        {quickActions.map(action => {
                            const ok = moduleVisible(me, action.route, scope, demo);
                            return <button key={action.route} className={'db-quick-btn ' + action.tone} disabled={!ok} title={ok ? undefined : 'Non autorisé dans le périmètre sélectionné'} onClick={() => navigate('/app/' + action.route)}><Icon name={action.icon} size={18} />{action.label}</button>;
                        })}
                    </div>
                </section>
                <section className="db-card db-panel">
                    <h2>Règles métier</h2>
                    <ul className="db-rules">{rules.map(rule => <li key={rule.title}><span><Icon name={rule.icon} size={20} /></span><div><strong>{rule.title}</strong><small>{rule.text}</small></div></li>)}</ul>
                    <p className="db-rules-quote">« Des traitements rigoureux<br />pour des archives de confiance. »</p>
                </section>
            </aside>
        </div>
        {me?.truncated && <Notice tone="warning">Le serveur a transmis une liste de droits tronquée. Certains accès peuvent ne pas apparaître.</Notice>}
    </div>;
}
