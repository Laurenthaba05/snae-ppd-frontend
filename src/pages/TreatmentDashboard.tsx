import React from 'react';
import { useSession } from '../auth/session';
import { useWorkspace } from '../ui/workspace';
import { useScopeText } from '../ui/names';
import { navigate } from '../ui/navigation';
import { Icon } from '../ui/icons';
import { Notice, useResource } from '../ui/components';
import { Meter, ProgressBars, StackedBar, StackedColumns, nf, percent } from '../ui/charts';
import type { Column, Progress } from '../ui/charts';
import { EmptyNote, updatedText, useKeptData } from '../ui/DashboardParts';
import { can } from '../core/policy';
import { moduleVisible } from '../design/navigation';
import { formatPercent } from '../core/locale';
import { PipelineBoard } from '../ui/PipelineBoard';
import { OTHER_COLOR, PALETTE, STATUS_COLORS, monthLabel, type DigitizationSummary } from '../core/dashboard';
import { STAGES } from '../core/workflow';
import type { PipelineStage } from '../core/types';

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
/** Ce que le système fait réellement à chaque lot ; les exigences d'image (formats, résolution) ne sont pas codées ici : elles dépendent du profil de numérisation de l'institution. */
const rules: Array<{ icon: string; title: string; text: string }> = [
    { icon: 'docList', title: 'Traçabilité', text: 'Chaque passage d’une étape à l’autre est journalisé.' },
    { icon: 'alert', title: 'Contrôle qualité', text: 'Consigné à l’étape de contrôle ; le dernier contrôle de chaque élément fait foi.' },
    { icon: 'lock', title: 'Original scellé', text: 'Un seul original par page, scellé à l’étape finale.' },
    { icon: 'cog', title: 'Exigences d’image', text: 'Définies par les profils de numérisation de l’institution.' }
];

/** Couleurs des diagrammes : la teinte de la marque pour ce qui avance, le bleu pour « en cours », les couleurs d’état réservées pour conforme / à corriger. */
const color = { blue: PALETTE[3]!, green: PALETTE[0]!, muted: OTHER_COLOR, track: '#e1efe7', good: STATUS_COLORS.good, warn: STATUS_COLORS.warning };

export interface TreatmentData {
    projects: { enCours: number; termine: number; annule: number };
    elements: { termine: number; enCours: number; suspendu: number };
    controls: { conformes: number; aCorriger: number };
    monthly: Column[];
    progress: Progress[];
    /** Confiance moyenne des textes OCR (0 à 1) sur `ocrResults` résultats ; null quand il n'existe aucun résultat. */
    ocrAverage: number | null;
    ocrResults: number;
    /** Éléments par étape du parcours (RECEPTION, NUMERISATION…) : les mêmes nombres que le reste de l'écran, dans le même périmètre. */
    stages: Record<string, number>;
    /** Suivi par étapes avec l'âge du plus ancien élément : national seulement (le serveur ne le calcule pas par périmètre) ; null sinon. */
    pipeline: PipelineStage[] | null;
    generatedAt?: string;
}

/** Les nombres du serveur, rangés pour l'écran. Les éléments suspendus se comptent à part : ils n'avancent pas, mais ne sont pas perdus. */
export function treatmentFrom(summary: DigitizationSummary, pipeline: PipelineStage[] | null): TreatmentData {
    const n = (map: Record<string, number>, key: string) => map[key] ?? 0;
    const elements = summary.elements;
    const working = Object.entries(elements).filter(([key]) => key !== 'TERMINE' && key !== 'ANNULE' && key !== 'SUSPENDU').reduce((total, [, value]) => total + value, 0);
    const average = summary.ocr.averageConfidence === null || summary.ocr.averageConfidence === undefined ? NaN : Number(summary.ocr.averageConfidence);
    return {
        projects: { enCours: n(summary.projects, 'EN_COURS'), termine: n(summary.projects, 'TERMINE'), annule: n(summary.projects, 'ANNULE') },
        elements: { termine: n(elements, 'TERMINE'), enCours: working, suspendu: n(elements, 'SUSPENDU') },
        controls: { conformes: summary.controls.conformes, aCorriger: summary.controls.aCorriger },
        monthly: summary.controls.monthly.map(m => ({ key: m.month, label: monthLabel(m.month), good: m.good, warn: m.warn })),
        progress: summary.progress.map(p => ({ key: p.id, name: p.name, done: p.done, total: p.total })),
        ocrAverage: Number.isFinite(average) && summary.ocr.results > 0 ? average : null, ocrResults: summary.ocr.results,
        stages: elements, pipeline, generatedAt: summary.generatedAt
    };
}

/** Éléments à l'étape d'index donné (0 à 6) du parcours. */
function stageCount(stages: Record<string, number> | null | undefined, index: number): number | null {
    const status = STAGES[index]?.status;
    return stages && status ? stages[status] ?? 0 : null;
}

function useTreatmentData() {
    const { me, digitization, epoch } = useSession();
    const { scope } = useWorkspace();
    const institutionId = scope.institutionId ?? null, departmentId = scope.departmentId ?? null;
    const allowed = !!digitization && can(me, 'DIGITIZATION_READ', scope);
    const key = ['treatment', epoch, allowed, institutionId, departmentId].join(':');
    const resource = useResource<TreatmentData | null>(async signal => {
        if (!digitization || !allowed) return null;
        // un seul appel pour tous les nombres, calculés par le serveur dans le périmètre ; le suivi par étapes avec l'âge du plus ancien n'existe que pour l'ensemble du pays
        const [summary, pipeline] = await Promise.all([
            digitization.summary({ institutionId, departmentId }, signal),
            institutionId ? Promise.resolve(null) : digitization.pipeline(undefined, signal).catch(() => null)
        ]);
        return treatmentFrom(summary, pipeline);
    }, key);
    return { ...resource, data: useKeptData(resource.data, key) };
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
    const elementTotal = data.elements.termine + data.elements.enCours + data.elements.suspendu;
    const controlTotal = data.controls.conformes + data.controls.aCorriger;
    const monthlyTotal = data.monthly.reduce((n, c) => n + c.good + c.warn, 0);
    const good = { label: 'Conformes', color: color.good, icon: 'check' };
    const warn = { label: 'À corriger', color: color.warn, icon: 'alert' };
    return <>
        <div className="db-tiles">
            <Tile title="Projets de numérisation" hero={nf(projectTotal)} unit={projectTotal > 1 ? 'projets' : 'projet'}>
                <StackedBar title="Projets par statut" unit="projet(s)" layout="inline" segments={[
                    { key: 'EN_COURS', label: 'En cours', value: data.projects.enCours, color: color.blue },
                    { key: 'TERMINE', label: 'Terminés', value: data.projects.termine, color: color.green },
                    { key: 'ANNULE', label: 'Annulés', value: data.projects.annule, color: color.muted }]} />
            </Tile>
            <Tile title="Éléments numérisés" hero={formatPercent(percent(data.elements.termine, elementTotal))} unit={nf(data.elements.termine) + ' sur ' + nf(elementTotal)}>
                <Meter label="Éléments numérisés" value={data.elements.termine} total={elementTotal} fill={color.green} track={color.track} />
                <ul className="db-key"><li><i style={{ background: color.green }} /><span>Terminés</span><b>{nf(data.elements.termine)}</b></li><li><i style={{ background: color.track }} /><span>En cours</span><b>{nf(data.elements.enCours)}</b></li>
                    {data.elements.suspendu > 0 && <li><i style={{ background: color.muted }} /><span>Suspendus</span><b>{nf(data.elements.suspendu)}</b></li>}</ul>
            </Tile>
            <Tile title="Contrôles qualité" hero={nf(controlTotal)} unit={controlTotal > 1 ? 'éléments contrôlés' : 'élément contrôlé'}>
                <StackedBar title="Dernier contrôle par élément" unit="élément(s)" layout="inline" segments={[
                    { key: 'ok', label: good.label, value: data.controls.conformes, color: good.color, icon: good.icon },
                    { key: 'ko', label: warn.label, value: data.controls.aCorriger, color: warn.color, icon: warn.icon }]} />
            </Tile>
        </div>
        <div className="db-tiles two">
            <Tile title={'Contrôles qualité sur ' + data.monthly.length + ' mois'}>
                {monthlyTotal ? <StackedColumns title="Contrôles qualité par mois" unit="contrôle(s)" columns={data.monthly} good={good} warn={warn} /> : <p className="db-chart-note">Aucun contrôle consigné sur les {data.monthly.length} derniers mois.</p>}
            </Tile>
            <Tile title="Avancement des projets en cours">
                {data.progress.length ? <ProgressBars rows={data.progress} fill={color.green} track={color.track} /> : <p className="db-chart-note">Aucun projet en cours avec des éléments à suivre.</p>}
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
                    <tr><th scope="row" rowSpan={3}>Éléments numérisés</th><td>Terminés</td><td>{nf(data.elements.termine)}</td></tr>
                    <tr><td>En cours</td><td>{nf(data.elements.enCours)}</td></tr>
                    <tr><td>Suspendus</td><td>{nf(data.elements.suspendu)}</td></tr>
                    <tr><th scope="row" rowSpan={2}>Contrôles qualité (dernier par élément)</th><td>Conformes</td><td>{nf(data.controls.conformes)}</td></tr>
                    <tr><td>À corriger</td><td>{nf(data.controls.aCorriger)}</td></tr>
                    {data.monthly.map((c, i) => <tr key={c.key}>{i === 0 && <th scope="row" rowSpan={data.monthly.length}>Contrôles par mois</th>}<td>{c.label}</td><td>{nf(c.good)} conformes · {nf(c.warn)} à corriger</td></tr>)}
                    {data.progress.map((p, i) => <tr key={p.key}>{i === 0 && <th scope="row" rowSpan={data.progress.length}>Avancement des projets en cours</th>}<td>{p.name}</td><td>{nf(p.done)} / {nf(p.total)} ({formatPercent(percent(p.done, p.total))})</td></tr>)}
                </tbody>
            </table></div>
        </details>
    </>;
}

export function TreatmentDashboard() {
    const { me, demo } = useSession();
    const { scope } = useWorkspace();
    const scopeText = useScopeText(scope);
    const treatment = useTreatmentData();
    return <TreatmentView data={treatment.data ?? undefined} loading={treatment.loading && !treatment.data} error={!!treatment.error} onRetry={treatment.refresh} truncated={!!me?.truncated}
        scopeLabel={scopeText} canGo={route => moduleVisible(me, route, scope, demo)} />;
}

export interface TreatmentViewProps {
    data: TreatmentData | undefined; loading: boolean; error: boolean; onRetry: () => void; truncated: boolean; canGo: (route: string) => boolean;
    /** Le périmètre de travail en toutes lettres (« National », « Archives nationales »…) : les chiffres sont ceux de ce périmètre. */
    scopeLabel?: string;
}

/** Ce que voit la personne : les indicateurs déjà lus, sans accès au serveur (la page les lit, l'aperçu de conception les fabrique). */
export function TreatmentView({ data, loading, error, onRetry, truncated, canGo, scopeLabel }: TreatmentViewProps) {
    const treatment = { loading, error, refresh: onRetry };
    const count = (n: number | undefined) => treatment.loading ? '…' : treatment.error || n === undefined ? '—' : nf(n);
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
                        {scopeLabel && data && <p className="dv-card-meta"><span className="dv-chip">{scopeLabel}</span>{data.generatedAt ? <span>{updatedText(data.generatedAt)}</span> : null}</p>}
                    </div>
                    {treatment.loading ? <p className="db-chart-note">Chargement des indicateurs…</p>
                        : treatment.error ? <div className="db-chart-note">Impossible de charger les indicateurs de traitement. <button className="text-link" onClick={treatment.refresh}>Réessayer</button></div>
                        : !data ? <p className="db-chart-note">Les diagrammes s’affichent avec les données de numérisation du serveur (habilitation de lecture de la numérisation requise).</p>
                        : empty ? <EmptyNote>Aucun projet de numérisation ni contrôle qualité enregistré pour le moment.</EmptyNote>
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
                            <thead><tr><td />{stepTitles.map((title, index) => <th key={title} scope="col">{index + 1}. {title}{stageCount(data?.stages, index) !== null && <span className="db-count" title="Éléments à cette étape">{nf(stageCount(data?.stages, index)!)}</span>}</th>)}</tr></thead>
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
                    <Kpi icon="stack" tone="blue" value={count(data?.elements.termine)} label="Documents numérisés" hint="Éléments terminés, hors projets annulés" />
                    <Kpi icon="percent" tone="blue" value={treatment.loading ? '…' : data?.ocrAverage != null ? formatPercent(Math.round(data.ocrAverage * 100)) : '—'} label="Confiance moyenne de l’OCR"
                        hint={data?.ocrAverage != null ? `Moyenne de la confiance de ${nf(data.ocrResults)} résultat(s) : une lecture du moteur, pas un taux d’exactitude` : 'Aucun résultat OCR dans ce périmètre'} />
                    <Kpi icon="alertCircle" tone="red" value={count(data?.controls.aCorriger)} label="Documents à corriger" hint="Éléments dont le dernier contrôle qualité est non conforme" />
                    <Kpi icon="download" tone="amber" value={count(data ? stageCount(data.stages, 5) ?? 0 : undefined)} label="Éléments en validation" hint="Éléments à l’étape du circuit de validation" />
                </section>
                <section className="db-card db-panel">
                    <h2>Actions rapides</h2>
                    <div className="db-quick">
                        {quickActions.map(action => {
                            const ok = canGo(action.route);
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
        {truncated && <Notice tone="warning">Le serveur a transmis une liste de droits tronquée. Certains accès peuvent ne pas apparaître.</Notice>}
    </div>;
}
