import React from 'react';
import { useSession } from '../auth/session';
import { useWorkspace } from '../ui/workspace';
import { navigate } from '../ui/navigation';
import { Icon } from '../ui/icons';
import { can } from '../core/policy';
import { label } from '../core/format';
import { Busy, ErrorNotice, Notice, PageHead, useResource } from '../ui/components';
import { AreaChart, Breakdown, Donut, RankBars, nf } from '../ui/charts';
import { Card, EmptyNote, Facts, Kpi, Unavailable, updatedText, useKeptData } from '../ui/DashboardParts';
import {
    ARCHIVAL_COLORS, ARCHIVAL_LABELS, CONFIDENTIALITY_COLORS, CONFIDENTIALITY_LABELS, ELEMENT_LABELS, PALETTE, RETENTION_COLORS, RETENTION_LABELS, monthlySeries, slices, unitTree, type ScopeDashboard
} from '../core/dashboard';

const BRAND = PALETTE[0]!;
const TRACK = '#e1efe7';
/** Les étapes où un élément numérisé est encore en traitement : les barres les comparent ; terminé et suspendu se disent en chiffres. */
const IN_PROGRESS = ['RECEPTION', 'NUMERISATION', 'OCR_INDEXATION', 'CONTROLE_QUALITE', 'METADONNEES', 'VALIDATION'];

/**
 * Le tableau de bord d'une institution ou d'une unité : le périmètre de travail. Une unité compte ses sous-unités, une institution toutes ses unités ; jamais une unité sœur. Les chiffres
 * sont ceux du serveur, calculés sur ce que la personne a le droit de lire.
 */
export function ScopeDashboardPage() {
    const { me, dashboard, epoch } = useSession();
    const { scope, setScope } = useWorkspace();
    const institutionId = scope.institutionId ?? null;
    const departmentId = scope.departmentId ?? null;
    const national = can(me, 'DASHBOARD_NATIONAL_READ', {});
    const key = `scope-dashboard:${institutionId}:${departmentId}:${epoch}`;
    const q = useResource<ScopeDashboard | null>(signal => dashboard && institutionId ? dashboard.scope(institutionId, departmentId, signal) : Promise.resolve(null), key);
    const data = useKeptData(q.data, key);
    const header = <PageHead eyebrow="PILOTAGE" title="Tableau de bord du périmètre" description="Les chiffres de l’institution ou de l’unité choisie dans le périmètre de travail, sous-unités comprises : ce que vous avez le droit de lire, rien de plus." />;
    if (!institutionId) return <>{header}
        <Notice tone="warning">Choisissez une institution (et, si besoin, une unité) dans le périmètre de travail pour voir son tableau de bord.
            {national && <> <button type="button" className="text-link" onClick={() => navigate('/app/tableau-national')}>Ouvrir le tableau de bord national</button></>}</Notice></>;
    if (q.loading && !data) return <>{header}<Busy /></>;
    if (q.error) return <>{header}<ErrorNotice error={q.error} onRetry={q.refresh} /></>;
    if (!data) return <>{header}<Notice tone="warning">Le tableau de bord n’est pas disponible dans cette session.</Notice></>;

    // le tableau de toute l'institution n'est proposé qu'à qui y est habilité : une unité ne remonte pas vers son parent
    const wide = ['DOCUMENT_READ', 'DOSSIER_READ', 'RETENTION_REVIEW', 'HERITAGE_READ'].some(code => can(me, code, { institutionId }));
    return <>
        {header}
        <ScopeDashboardView data={data} departmentId={departmentId} wide={wide} refreshing={q.loading} onRefresh={q.refresh} onGo={route => navigate('/app/' + route)}
            onOpenUnit={unitId => setScope({ institutionId: data.scope.institutionId, departmentId: unitId })} />
    </>;
}

export interface ScopeDashboardViewProps {
    data: ScopeDashboard; departmentId: string | null; wide: boolean;
    /** Une relecture est en cours : l'écran garde ce qu'il montre (légèrement estompé) au lieu de se vider. */
    refreshing?: boolean;
    onRefresh: () => void; onGo: (route: string) => void;
    /** Ouvre le tableau d'une unité ; `null` : celui de toute l'institution. */
    onOpenUnit: (unitId: string | null) => void;
}

/** Ce que voit la personne : les chiffres déjà lus, sans accès au serveur (la page les lit, l'aperçu de conception les fabrique). */
export function ScopeDashboardView({ data, departmentId, wide, refreshing = false, onRefresh, onGo, onOpenUnit }: ScopeDashboardViewProps) {
    const { documents, dossiers, retention, consultation, heritage, digitization, physical, intake, workflow } = data;
    const activities = !!(digitization || physical || intake);
    const rows = unitTree(data.units);
    const biggest = Math.max(1, ...data.units.map(unit => unit.documents));
    const where = [data.scope.institutionName, data.scope.departmentName].filter(Boolean).join(' · ');
    const go = (route: string) => () => onGo(route);
    const monthly = documents ? monthlySeries(documents.monthly) : [];
    const steps = digitization ? IN_PROGRESS.filter(key => (digitization.elementsByStatus[key] ?? 0) > 0).map(key => ({ key, label: ELEMENT_LABELS[key] ?? key, value: digitization.elementsByStatus[key] ?? 0 })) : [];
    const factsRows = [
        ...(intake ? [['versements ouverts', intake.open], ['versements au total', intake.total]] as Array<[string, number]> : []),
        ...(digitization ? [['projets de numérisation en cours', digitization.activeProjects], ['projets de numérisation au total', digitization.projects]] as Array<[string, number]> : []),
        ...(physical ? [['archives physiques', physical.total]] as Array<[string, number]> : [])];
    const stages = !!digitization && Object.keys(digitization.elementsByStatus).length > 0;
    return <>
        <div className="dv-scopebar">
            <span className="dv-scopebar-name"><Icon name="building" size={18} /><strong>{where}</strong></span>
            <span className="dv-chip">{departmentId ? 'Cette unité et ses sous-unités' : 'Toutes les unités de l’institution'}</span>
            <span className="dv-scopebar-meta">{updatedText(data.generatedAt)}</span>
            <button type="button" className="btn small secondary" onClick={onRefresh}><Icon name="refresh" size={14} />Actualiser</button>
        </div>
        <div className={'hm sd dv' + (refreshing ? ' refreshing' : '')} aria-busy={refreshing}>
            <section className="dv-band" aria-label="Indicateurs clés">
                <Kpi variant="hero" icon="docList" tone="green" value={documents?.total} label="Documents" hint={documents ? `${nf(documents.createdLast30Days)} créés ces 30 derniers jours` : undefined} onClick={go('documents')}
                    trend={documents ? monthly.map(point => point.value) : undefined} trendLabels={monthly.map(point => point.label)} trendCaption="12 derniers mois"
                    delta={documents ? { text: `+${nf(documents.createdLast30Days)} ces 30 derniers jours`, up: documents.createdLast30Days > 0 ? true : undefined } : null} />
                <div className="dv-groups">
                    <div className="dv-group volumes">
                        <Kpi icon="folder" tone="mint" value={dossiers?.total} label="Dossiers" onClick={go('dossiers')} />
                        <Kpi icon="landmark" tone="amber" value={heritage?.total} label="Biens patrimoniaux" onClick={go('patrimoine')} />
                    </div>
                    <div className="dv-group watch four">
                        <Kpi icon="hourglass" tone="red" alert="critical" value={retention?.overdue} label="Échéances dépassées" hint="Échéances de conservation passées et non traitées" onClick={go('sort-final')} />
                        <Kpi icon="clock" tone="red" alert="critical" value={workflow?.overdue} label="Validations en retard" hint={workflow ? `${nf(workflow.pending)} tâche(s) de validation en attente au total` : undefined} onClick={go('taches')} />
                        <Kpi icon="snow" tone="blue" alert="info" value={retention?.activeLegalHolds} label="Gels juridiques actifs" onClick={go('gel-legal')} />
                        <Kpi icon="users" tone="green2" alert="warning" value={consultation?.pending} label="Demandes en attente"
                            hint={departmentId ? 'Les demandes de consultation se comptent par institution, pas par unité' : 'Demandes déposées ou en instruction'} onClick={go('consultations')} />
                    </div>
                </div>
            </section>

            <div className="dv-grid charts">
                <Card title="Activité documentaire" subtitle="Documents ajoutés chaque mois" className="span-wide">
                    {!documents ? <Unavailable>Non disponible : votre habilitation ne couvre pas les documents dans ce périmètre.</Unavailable>
                        : <AreaChart title="Documents ajoutés" unit="document(s)" points={monthly} color={BRAND} />}
                </Card>
                <Card title="Situation des documents" subtitle="Où en est chaque document dans son cycle de vie">
                    {!documents ? <Unavailable>Non disponible : votre habilitation ne couvre pas les documents dans ce périmètre.</Unavailable>
                        : documents.total === 0 ? <EmptyNote>Aucun document dans ce périmètre.</EmptyNote>
                        : <Donut title="Documents par situation" unit="document(s)" segments={slices(documents.byArchivalStatus, ARCHIVAL_LABELS, undefined, ARCHIVAL_COLORS)} centerLabel="documents" />}
                </Card>
            </div>

            <div className="dv-grid pair">
                <Card title="Niveaux de confidentialité" subtitle="Du public au secret">
                    {!documents ? <Unavailable>Non disponible : votre habilitation ne couvre pas les documents dans ce périmètre.</Unavailable>
                        : documents.total === 0 ? <EmptyNote>Aucun document dans ce périmètre.</EmptyNote>
                        : <Breakdown title="Documents par niveau" unit="document(s)" segments={slices(documents.byConfidentiality, CONFIDENTIALITY_LABELS, undefined, CONFIDENTIALITY_COLORS)} />}
                    {documents && documents.destroyed > 0 && <p className="hm-foot">{nf(documents.destroyed)} document(s) détruit(s), conservés comme traces.</p>}
                </Card>
                <Card title="Conservation et échéances" subtitle="Les décisions de sort à venir">
                    {!retention ? <Unavailable>Non disponible : votre habilitation ne couvre pas la conservation dans ce périmètre.</Unavailable>
                        : <>
                            <ul className="dv-facts sd-facts">
                                <li><b className={retention.overdue === 0 ? 'zero' : undefined}>{nf(retention.overdue)}</b><span>échéances dépassées</span></li>
                                <li><b className={retention.dueWithin90Days === 0 ? 'zero' : undefined}>{nf(retention.dueWithin90Days)}</b><span>dans les 90 prochains jours</span></li>
                                <li><b className={retention.activeLegalHolds === 0 ? 'zero' : undefined}>{retention.activeLegalHolds === null ? '—' : nf(retention.activeLegalHolds)}</b><span>gels juridiques actifs</span></li>
                            </ul>
                            <p className="hm-foot">Dépassées : échéances encore ouvertes (planifiées, échues ou en décision) dont la date est passée ; l’état « échue » ci-dessous n’en est qu’une partie.</p>
                            {Object.keys(retention.byStatus).length === 0 ? <EmptyNote>Aucune échéance de conservation dans ce périmètre.</EmptyNote>
                                : <Breakdown title="Échéances par état" unit="échéance(s)" segments={slices(retention.byStatus, RETENTION_LABELS, undefined, RETENTION_COLORS)} />}
                        </>}
                </Card>
            </div>

            {activities && <Card title="Activités nationales rattachées" subtitle="Numérisation, archives physiques et versements" className="sd-activities">
                <div className={'dv-activity' + (stages ? '' : ' single')}>
                    <div><Facts className="sd-facts" rows={factsRows} /></div>
                    {stages && digitization && <div>
                        <h3 className="dv-sub">Éléments numérisés par étape</h3>
                        {steps.length > 0 && <RankBars rows={steps} fill={BRAND} track={TRACK} unit="élément(s)" />}
                        <Facts className="dv-facts-inline" rows={[['éléments terminés', digitization.elementsByStatus.TERMINE ?? 0], ['éléments suspendus', digitization.elementsByStatus.SUSPENDU ?? 0]]} />
                    </div>}
                </div>
                <p className="hm-foot">Ces activités sont rattachées à l’institution et à la direction d’origine de chacune ; celles qui n’ont pas encore d’origine n’y figurent pas.</p>
            </Card>}

            <Card title={departmentId ? 'Cette unité et ses sous-unités' : 'Les unités de l’institution'} subtitle="Documents et dossiers de chaque unité, sous-unités comprises">
                {rows.length === 0 ? <EmptyNote>Aucune unité n’est visible dans ce périmètre.</EmptyNote>
                    : <div className="db-matrix-scroll" tabIndex={0} role="region" aria-label="Tableau des unités, défilement horizontal possible"><table className="hm-table sd-units dv-units">
                        <thead><tr><th scope="col">Unité</th><th scope="col">Type</th><th scope="col" className="num">Documents</th><th scope="col" className="num">Dossiers</th>
                            <th scope="col" className="num">Documents rattachés</th><th scope="col" className="num">Dossiers rattachés</th></tr></thead>
                        <tbody>{rows.map(({ unit, depth }) => <tr key={unit.id}>
                            <td style={{ paddingLeft: 8 + depth * 18 }}>
                                {depth > 0 && <span className="dv-branch" aria-hidden="true" />}
                                <button type="button" className="hm-link" title="Afficher le tableau de bord de cette unité" onClick={() => onOpenUnit(unit.id)}>{unit.name}</button>
                            </td>
                            <td><span className="dv-chip subtle">{label('unitType', unit.type)}</span></td>
                            <td className="num"><span className="dv-numbar"><span>{nf(unit.documents)}</span><i aria-hidden="true"><b style={{ width: Math.round(unit.documents * 100 / biggest) + '%' }} /></i></span></td>
                            <td className="num">{nf(unit.dossiers)}</td>
                            <td className="num">{nf(unit.directDocuments)}</td><td className="num">{nf(unit.directDossiers)}</td>
                        </tr>)}</tbody>
                    </table></div>}
                {departmentId && wide && <p className="hm-foot"><button type="button" className="text-link" onClick={() => onOpenUnit(null)}>Voir le tableau de bord de toute l’institution</button></p>}
            </Card>
            <p className="dv-note"><Icon name="info" size={14} />Ces chiffres ne comptent que ce que vous avez le droit de lire, sans les documents sous restriction d’accès ; le tableau de bord national, lui, compte tout.</p>
        </div>
    </>;
}
