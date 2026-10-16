import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { useWorkspace } from '../ui/workspace';
import { navigate } from '../ui/navigation';
import { Icon } from '../ui/icons';
import { Notice, useResource } from '../ui/components';
import { AreaChart, Donut, nf } from '../ui/charts';
import type { Segment, SeriesPoint } from '../ui/charts';
import { can } from '../core/policy';
import { moduleVisible } from '../design/navigation';
import type { Page, QualityControlListItem, RecordDocument } from '../core/types';

/** Données de l’accueil. `null` = indisponible (habilitation absente, périmètre manquant ou erreur) : jamais un chiffre inventé. */
export interface HomeData {
    docs: { items: RecordDocument[]; partial: boolean } | null;
    dossiers: { count: number; partial: boolean } | null;
    types: Record<string, string>;
    tasks: { intakes: number | null; toControl: number | null; eliminations: number | null; holds: number | null; requests: number | null };
    backup: 'ok' | 'warn' | 'unknown';
    /** `warn` : moteur désactivé, injoignable, ou index manquant / incomplet / mal répliqué. */
    search: 'ok' | 'warn' | 'unknown';
    /** `warn` : OCR automatique désactivé, moteur absent, file bloquée ou pages en échec. */
    ocr: 'ok' | 'warn' | 'unknown';
    apiOk: boolean;
}

const color = { blue: '#2a78d6', muted: '#b4bcc3', categories: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'] };
const DOC_PAGES = 5, DOSSIER_PAGES = 2, PAGE_SIZE = 100;

async function walk<T>(load: (page: number) => Promise<Page<T>>, maxPages: number) {
    const items: T[] = [];
    let more = false;
    for (let page = 0; page < maxPages; page++) {
        const result = await load(page);
        items.push(...result.items);
        more = result.hasMore;
        if (!more) break;
    }
    return { items, partial: more };
}
const settle = async <T,>(task: Promise<T> | null): Promise<T | null> => { if (!task) return null; try { return await task; } catch { return null; } };

function useHomeData() {
    const { me, demo, epoch, records, archivalIntake, digitization, retention, consultation, search } = useSession();
    const { scope } = useWorkspace();
    const institutionId = scope.institutionId ?? me?.user.institutionId ?? null;
    const key = ['home', epoch, scope.institutionId, scope.departmentId].join(':');
    return useResource<HomeData | null>(async signal => {
        if (!me || !records || demo) return null;
        const params = (page: number) => ({ institutionId: scope.institutionId, departmentId: scope.departmentId, page, size: PAGE_SIZE });
        const departmentId = scope.departmentId;
        const [docs, dossiers, types, intakes, controls, events, holds, requests, backup, searchStatus, ocrStatus] = await Promise.all([
            settle(can(me, 'DOCUMENT_READ', scope) ? walk(page => records.documents(params(page), signal), DOC_PAGES) : null),
            settle(can(me, 'DOSSIER_READ', scope) ? walk(page => records.dossiers(params(page), signal), DOSSIER_PAGES) : null),
            settle(can(me, 'DOCUMENT_READ', scope) ? records.documentTypes(signal) : null),
            settle(archivalIntake && can(me, 'ARCHIVAL_INTAKE_READ', {}) ? archivalIntake.entries(signal) : null),
            settle(digitization && can(me, 'DIGITIZATION_READ', {}) ? digitization.qualityControls(signal) : null),
            settle(retention && institutionId && can(me, 'RETENTION_REVIEW', scope) ? retention.events(institutionId, departmentId, signal) : null),
            settle(retention && institutionId && can(me, 'LEGAL_HOLD_MANAGE', scope) ? retention.legalHolds(institutionId, departmentId, signal) : null),
            settle(consultation && institutionId && can(me, 'CONSULTATION_READ', scope) ? consultation.requestsByInstitution(institutionId, signal) : null),
            settle(can(me, 'PRESERVATION_BACKUP_READ') ? records.backupMonitor(signal) : null),
            settle(search && can(me, 'SEARCH_READ') ? search.status(signal) : null),
            settle(digitization && can(me, 'DIGITIZATION_READ', {}) ? digitization.ocrStatus(signal) : null)
        ]);
        const latest = new Map<string, QualityControlListItem>();
        for (const control of controls ?? []) {
            const previous = latest.get(control.elementNumerisationId);
            if (!previous || previous.dateControle < control.dateControle) latest.set(control.elementNumerisationId, control);
        }
        return {
            docs, dossiers: dossiers ? { count: dossiers.items.length, partial: dossiers.partial } : null,
            types: Object.fromEntries((types ?? []).map(t => [t.id, t.label])),
            tasks: {
                intakes: intakes ? intakes.filter(x => x.statut === 'OUVERTE').length : null,
                toControl: controls ? [...latest.values()].filter(c => !c.conforme).length : null,
                eliminations: events ? events.filter(e => e.status === 'EN_DECISION').length : null,
                holds: holds ? holds.filter(h => h.status === 'ACTIF').length : null,
                requests: requests ? requests.filter(r => r.statut === 'DEPOSEE' || r.statut === 'EN_INSTRUCTION').length : null
            },
            backup: !backup ? 'unknown' : backup.enabled && backup.lastSuccessAt && !backup.errorCode ? 'ok' : 'warn',
            search: !searchStatus ? 'unknown' : searchStatus.status === 'OK' ? 'ok' : 'warn',
            ocr: !ocrStatus ? 'unknown' : ocrStatus.status === 'OK' ? 'ok' : 'warn',
            apiOk: !!(docs || dossiers || types)
        };
    }, key);
}

const shortMonth = (date: Date) => {
    const text = new Intl.DateTimeFormat('fr-FR', { month: 'short' }).format(date).replace('.', '');
    return text.charAt(0).toUpperCase() + text.slice(1);
};
const monthKey = (date: Date) => date.getFullYear() + '-' + date.getMonth();

/** Documents créés par mois (date de création de la fiche) ; `null` si le serveur ne fournit pas ces dates. */
export function monthlySeries(docs: RecordDocument[], period: 'year' | 'rolling', now = new Date()): SeriesPoint[] | null {
    if (!docs.some(d => d.createdAt)) return null;
    const months = period === 'year'
        ? Array.from({ length: now.getMonth() + 1 }, (_, i) => new Date(now.getFullYear(), i, 1))
        : Array.from({ length: 12 }, (_, i) => new Date(now.getFullYear(), now.getMonth() - 11 + i, 1));
    const counts = new Map<string, number>();
    for (const doc of docs) {
        const date = doc.createdAt ? new Date(doc.createdAt) : null;
        if (date && !Number.isNaN(date.getTime())) counts.set(monthKey(date), (counts.get(monthKey(date)) ?? 0) + 1);
    }
    return months.map(m => ({ key: monthKey(m), label: shortMonth(m), value: counts.get(monthKey(m)) ?? 0 }));
}

/** Les 5 types les plus fréquents, le reste regroupé en « Autres » (6 segments au plus). */
export function typeSegments(docs: RecordDocument[], types: Record<string, string>): Segment[] {
    const counts = new Map<string, number>();
    for (const doc of docs) counts.set(doc.typeDocumentId, (counts.get(doc.typeDocumentId) ?? 0) + 1);
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const head = sorted.slice(0, 5).map(([id, value], i) => ({ key: id, label: types[id] ?? 'Type inconnu', value, color: color.categories[i]! }));
    const rest = sorted.slice(5).reduce((sum, [, value]) => sum + value, 0);
    return rest ? [...head, { key: 'other', label: 'Autres', value: rest, color: color.muted }] : head;
}

const statusChip = (doc: RecordDocument): { label: string; tone: string } => {
    if (doc.destroyed || doc.archivalStatus === 'DETRUIT') return { label: 'Détruit', tone: 'gray' };
    if (doc.archivalStatus === 'ARCHIVE_DEFINITIVE') return { label: 'Archivé', tone: 'green' };
    if (doc.archivalStatus === 'ELIMINATION_APPROUVEE') return { label: 'Élimination approuvée', tone: 'amber' };
    if (doc.businessStatus === 'CLOS') return { label: 'Clos', tone: 'blue' };
    if (doc.archivalStatus === 'BROUILLON') return { label: 'Brouillon', tone: 'amber' };
    if (doc.archivalStatus === 'SEMI_ACTIF') return { label: 'Semi-actif', tone: 'blue' };
    return { label: 'En cours', tone: 'blue' };
};

const quickActions: Array<{ route: string; icon: string; label: string; tone: string }> = [
    { route: 'documents', icon: 'upload', label: 'Ajouter un document', tone: 'primary' },
    { route: 'numerisation', icon: 'scanner', label: 'Numériser un lot', tone: 'mint' },
    { route: 'dossiers', icon: 'folderPlus', label: 'Créer un dossier', tone: 'sand' },
    { route: 'versements', icon: 'download', label: 'Nouveau versement', tone: 'sand' },
    { route: 'recherche', icon: 'search', label: 'Recherche avancée', tone: 'sky' },
    { route: 'communications', icon: 'users', label: 'Demande de communication', tone: 'sky' }
];
const links: Array<{ route: string; icon: string; label: string }> = [
    { route: 'droits', icon: 'document', label: 'Textes de référence' },
    { route: 'help', icon: 'book', label: 'Guide utilisateur' },
    { route: 'help', icon: 'help', label: 'Foire aux questions' },
    { route: 'help', icon: 'headset', label: 'Assistance technique' }
];
const NA = 'Donnée non disponible (habilitation, périmètre ou API)';

function Kpi({ icon, tone, value, label, delta, hint, route }: { icon: string; tone: string; value: string; label: string; delta?: { text: string; up: boolean } | null; hint?: string; route?: string }) {
    const body = <>
        <span className={'hm-kpi-icon ' + tone}><Icon name={icon} size={26} /></span>
        <span className="hm-kpi-body"><strong>{value}</strong><span>{label}</span>{delta ? <em className={delta.up ? 'up' : 'down'}><Icon name={delta.up ? 'arrowUp' : 'arrowDown'} size={13} />{delta.text}</em> : <em className="none">&nbsp;</em>}</span>
    </>;
    return route ? <button className="hm-kpi" title={hint} onClick={() => navigate('/app/' + route)}>{body}</button> : <div className="hm-kpi" title={hint}>{body}</div>;
}

function TaskRow({ tone, icon, count, label, route, hint }: { tone: string; icon: string; count: number | null; label: string; route: string; hint?: string }) {
    return <li><button className={'hm-task ' + tone} title={count === null ? hint ?? NA : undefined} onClick={() => navigate('/app/' + route)}>
        <span className="hm-task-icon"><Icon name={icon} size={18} /></span><b>{count === null ? '—' : nf(count)}</b><span className="hm-task-label">{label}</span><Icon name="chevron" size={14} />
    </button></li>;
}

export function HomeView({ data, loading, name, canGo }: { data: HomeData | null; loading: boolean; name: string; canGo: (route: string) => boolean }) {
    const [period, setPeriod] = useState<'year' | 'rolling'>('year');
    const now = new Date();
    const docs = data?.docs?.items ?? [];
    const thisMonth = docs.filter(d => d.createdAt && new Date(d.createdAt).getFullYear() === now.getFullYear() && new Date(d.createdAt).getMonth() === now.getMonth()).length;
    const hasDates = docs.some(d => d.createdAt);
    const series = data?.docs ? monthlySeries(docs, period, now) : null;
    const segments = data?.docs ? typeSegments(docs, data.types) : [];
    const plus = (partial?: boolean) => partial ? '+' : '';
    const val = (n: number | null | undefined, partial?: boolean) => loading ? '…' : n === null || n === undefined ? '—' : nf(n) + plus(partial);
    const dateParts = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).formatToParts(now);
    const part = (type: string) => dateParts.find(p => p.type === type)?.value ?? '';
    const weekday = part('weekday').charAt(0).toUpperCase() + part('weekday').slice(1);
    const measured = data ? [data.apiOk, data.backup !== 'unknown' ? data.backup === 'ok' : null, data.search !== 'unknown' ? data.search === 'ok' : null, data.ocr !== 'unknown' ? data.ocr === 'ok' : null].filter(v => v !== null) : [];
    const overall = loading ? '…' : !data || !data.apiOk ? 'Indisponible' : measured.every(Boolean) ? 'Opérationnel' : 'À vérifier';
    const systemRows: Array<[string, 'ok' | 'warn' | 'none']> = [
        ['Base de données', data?.apiOk ? 'ok' : 'none'],
        ['Service de stockage', data?.backup === 'ok' ? 'ok' : data?.backup === 'warn' ? 'warn' : 'none'],
        ['Moteur de recherche', data?.search === 'ok' ? 'ok' : data?.search === 'warn' ? 'warn' : 'none'], ['Service OCR', data?.ocr === 'ok' ? 'ok' : data?.ocr === 'warn' ? 'warn' : 'none'],
        ['API', data?.apiOk ? 'ok' : 'none']
    ];
    return <div className="hm">
        <section className="hm-hero">
            <div className="hm-hero-text">
                <h1>Bienvenue, {name}</h1>
                <p>Système National d’Archivage Électronique et du Patrimoine Documentaire</p>
                <blockquote>« Préserver la mémoire aujourd’hui, construire le futur demain. »</blockquote>
            </div>
            <img className="hm-hero-img" src="/dashboard/banner-home.jpg" alt="" />
            <p className="hm-hero-motto">Des archives fiables pour un État plus moderne</p>
        </section>

        <section className="hm-kpis" aria-label="Indicateurs clés">
            <Kpi icon="docList" tone="green" route="documents" value={val(data?.docs?.items.length, data?.docs?.partial)} label="Documents" hint={data?.docs ? (data.docs.partial ? 'Calculé sur les ' + DOC_PAGES * PAGE_SIZE + ' documents les plus récents' : undefined) : NA}
                delta={hasDates ? { text: '+' + nf(thisMonth) + ' ce mois', up: true } : null} />
            <Kpi icon="folder" tone="mint" route="dossiers" value={val(data?.dossiers?.count, data?.dossiers?.partial)} label="Dossiers" hint={data?.dossiers ? undefined : NA} />
            <Kpi icon="inbox" tone="red" route="versements" value={val(data?.tasks.intakes)} label="Versements en attente" hint={data?.tasks.intakes === null ? NA : 'Entrées archivistiques ouvertes'} />
            <Kpi icon="checkCircle" tone="amber" route="controle" value={val(data?.tasks.toControl)} label="Documents à contrôler" hint={data?.tasks.toControl === null ? NA : 'Éléments dont le dernier contrôle qualité est non conforme'} />
            <Kpi icon="users" tone="green2" route="consultations" value={val(data?.tasks.requests)} label="Demandes d’accès" hint={data?.tasks.requests === null ? NA : 'Demandes déposées ou en instruction'} />
            <Kpi icon="stack" tone="blue" value="—" label="Volume total" hint="Volume de stockage non exposé par l’API actuelle" />
        </section>

        <div className="hm-grid">
            <div className="hm-left">
                <div className="hm-row a">
                    <section className="db-card hm-card">
                        <div className="hm-card-head"><h2>Activité documentaire</h2>
                            <select aria-label="Période" className="hm-select" value={period} onChange={e => setPeriod(e.target.value as 'year' | 'rolling')}><option value="year">Cette année</option><option value="rolling">12 derniers mois</option></select></div>
                        {loading ? <p className="db-chart-note">Chargement…</p>
                            : !data?.docs ? <p className="db-chart-note">{NA}</p>
                            : !series ? <p className="db-chart-note">Les dates de création ne sont pas fournies par le serveur : redémarrez le backend avec la version à jour pour afficher cette courbe.</p>
                            : <><div className="hm-legend"><i style={{ background: color.blue }} />Documents ajoutés</div><AreaChart title="Documents ajoutés" unit="document(s)" points={series} color={color.blue} />
                                {data.docs.partial && <p className="hm-foot">Calculé sur les {DOC_PAGES * PAGE_SIZE} documents les plus récents.</p>}</>}
                    </section>
                    <section className="db-card hm-card">
                        <div className="hm-card-head"><h2>Répartition des documents</h2></div>
                        {loading ? <p className="db-chart-note">Chargement…</p>
                            : !data?.docs ? <p className="db-chart-note">{NA}</p>
                            : segments.length ? <Donut title="Répartition par type" unit="document(s)" segments={segments} centerLabel="documents" /> : <p className="db-chart-note">Aucun document dans ce périmètre.</p>}
                    </section>
                </div>
                <div className="hm-row b">
                    <section className="db-card hm-card">
                        <div className="hm-card-head"><h2>Derniers documents ajoutés</h2><button className="hm-more" onClick={() => navigate('/app/documents')}>Voir tous<Icon name="arrow" size={15} /></button></div>
                        {loading ? <p className="db-chart-note">Chargement…</p>
                            : !data?.docs ? <p className="db-chart-note">{NA}</p>
                            : docs.length ? <div className="db-matrix-scroll" tabIndex={0} role="region" aria-label="Tableau, défilement horizontal possible"><table className="hm-table">
                                <thead><tr><th scope="col" /><th scope="col">Titre</th><th scope="col">Référence</th><th scope="col">Type</th><th scope="col">Date</th><th scope="col">Statut</th></tr></thead>
                                <tbody>{docs.slice(0, 5).map(doc => { const chip = statusChip(doc); const date = doc.createdAt ?? doc.documentDate; return <tr key={doc.id}>
                                    <td className="hm-ic"><span><Icon name="document" size={18} /></span></td>
                                    <td><button className="hm-link" onClick={() => navigate('/app/documents/' + doc.id)} title={doc.title}>{doc.title}</button></td>
                                    <td className="hm-ref">{doc.reference}</td><td>{data.types[doc.typeDocumentId] ?? '—'}</td>
                                    <td>{date ? new Date(date).toLocaleDateString('fr-FR') : '—'}</td>
                                    <td><span className={'hm-chip ' + chip.tone}>{chip.label}</span></td></tr>; })}</tbody>
                            </table></div> : <p className="db-chart-note">Aucun document dans ce périmètre.</p>}
                    </section>
                    <section className="db-card hm-card">
                        <div className="hm-card-head"><h2>Tâches et alertes</h2><button className="hm-more" onClick={() => navigate('/app/parcours')}>Voir tout<Icon name="arrow" size={15} /></button></div>
                        <ul className="hm-tasks">
                            <TaskRow tone="red" icon="download" count={loading ? null : data?.tasks.intakes ?? null} label="Versements en attente" route="versements" />
                            <TaskRow tone="amber" icon="checkCircle" count={loading ? null : data?.tasks.toControl ?? null} label="Documents à contrôler" route="controle" />
                            <TaskRow tone="blue" icon="trash" count={loading ? null : data?.tasks.eliminations ?? null} label="Éliminations à valider" route="eliminations" hint="Choisissez une institution et disposez de l’habilitation de revue" />
                            <TaskRow tone="purple" icon="snow" count={loading ? null : data?.tasks.holds ?? null} label="Documents sous gel" route="gel-legal" hint="Choisissez une institution et disposez de l’habilitation de gel" />
                            <TaskRow tone="green" icon="users" count={loading ? null : data?.tasks.requests ?? null} label="Demandes d’accès en attente" route="consultations" />
                            <TaskRow tone="red2" icon="userCheck" count={null} label="Circuits de validation en retard" route="circuits-validation" hint="Indicateur non exposé par l’API actuelle" />
                        </ul>
                    </section>
                </div>
            </div>
            <aside className="db-card hm-card hm-quick" aria-label="Actions rapides">
                <h2>Actions rapides</h2>
                <div className="db-quick">{quickActions.map(action => { const ok = canGo(action.route); return <button key={action.label} className={'db-quick-btn hm-q ' + action.tone} disabled={!ok} title={ok ? undefined : 'Non autorisé dans le périmètre sélectionné'} onClick={() => navigate('/app/' + action.route)}><Icon name={action.icon} size={22} />{action.label}</button>; })}</div>
            </aside>
        </div>

        <div className="hm-bottom">
            <section className="hm-banner"><p>« Les archives sont la mémoire vivante des nations. »</p><span className="hm-banner-rule" /><div className="hm-banner-mark"><strong>GUINÉE</strong><span>Notre histoire<br />Notre avenir</span></div></section>
            <section className="db-card hm-card"><h2>Liens utiles</h2><ul className="hm-links">{links.map(link => <li key={link.label}><button onClick={() => navigate('/app/' + link.route)}><Icon name={link.icon} size={20} />{link.label}</button></li>)}</ul></section>
            <section className="db-card hm-card"><div className="hm-card-head"><h2>Statut du système</h2><span className={'hm-state ' + (overall === 'Opérationnel' ? 'ok' : 'warn')}>{overall === 'Opérationnel' && <i />}{overall}</span></div>
                <ul className="hm-system">{systemRows.map(([label, state]) => <li key={label}><span className={'hm-dot ' + state}><Icon name={state === 'ok' ? 'check' : state === 'warn' ? 'alert' : 'clock'} size={11} /></span><span>{label}</span><em>{state === 'ok' ? 'Opérationnel' : state === 'warn' ? 'À vérifier' : 'Non mesuré'}</em></li>)}</ul></section>
            <section className="db-card hm-card hm-date"><div className="hm-date-top"><Icon name="calendar" size={30} /><div><strong>{weekday}</strong><span>{part('day')} {part('month')} {part('year')}</span></div></div>
                <p className="hm-date-quote"><span>« Organiser</span><span>Conserver</span><span>Valoriser</span><i>pour les générations futures. »</i></p></section>
        </div>
    </div>;
}

export function Dashboard() {
    const { me, demo } = useSession();
    const { scope } = useWorkspace();
    const home = useHomeData();
    const name = [me?.user.prenom, me?.user.nom].filter(Boolean).join(' ') || 'dans votre espace';
    return <>
        <HomeView data={home.data ?? null} loading={home.loading} name={name} canGo={route => moduleVisible(me, route, scope, demo)} />
        {home.error ? <Notice tone="warning">Impossible de charger les indicateurs de l’accueil. <button className="text-link" onClick={home.refresh}>Réessayer</button></Notice> : null}
        {me?.truncated && <Notice tone="warning">Le serveur a transmis une liste de droits tronquée. Certains accès peuvent ne pas apparaître.</Notice>}
    </>;
}
