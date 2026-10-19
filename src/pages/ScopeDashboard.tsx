import React from 'react';
import { useSession } from '../auth/session';
import { useWorkspace } from '../ui/workspace';
import { navigate } from '../ui/navigation';
import { can } from '../core/policy';
import { Busy, ErrorNotice, Notice, PageHead, useResource } from '../ui/components';
import { AreaChart, Donut, StackedBar, nf } from '../ui/charts';
import { Card, Kpi, Unavailable } from '../ui/DashboardParts';
import {
    ARCHIVAL_LABELS, CONFIDENTIALITY_LABELS, ELEMENT_LABELS, RETENTION_LABELS, monthlySeries, slices, unitTree, type ScopeDashboard
} from '../core/dashboard';

const BLUE = '#2a78d6';

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
    const q = useResource<ScopeDashboard | null>(signal => dashboard && institutionId ? dashboard.scope(institutionId, departmentId, signal) : Promise.resolve(null), `scope-dashboard:${institutionId}:${departmentId}:${epoch}`);
    const data = q.data ?? null;
    const header = <PageHead eyebrow="PILOTAGE" title="Tableau de bord du périmètre" description="Les chiffres de l’institution ou de l’unité choisie dans le périmètre de travail, sous-unités comprises : ce que vous avez le droit de lire, rien de plus." />;
    if (!institutionId) return <>{header}
        <Notice tone="warning">Choisissez une institution (et, si besoin, une unité) dans le périmètre de travail pour voir son tableau de bord.
            {national && <> <button type="button" className="text-link" onClick={() => navigate('/app/tableau-national')}>Ouvrir le tableau de bord national</button></>}</Notice></>;
    if (q.loading && !data) return <>{header}<Busy /></>;
    if (q.error) return <>{header}<ErrorNotice error={q.error} onRetry={q.refresh} /></>;
    if (!data) return <>{header}<Notice tone="warning">Le tableau de bord n’est pas disponible dans cette session.</Notice></>;

    const { documents, dossiers, retention, consultation, heritage, digitization, physical, intake } = data;
    const activities = !!(digitization || physical || intake);
    const rows = unitTree(data.units);
    // le tableau de toute l'institution n'est proposé qu'à qui y est habilité : une unité ne remonte pas vers son parent
    const wide = ['DOCUMENT_READ', 'DOSSIER_READ', 'RETENTION_REVIEW', 'HERITAGE_READ'].some(code => can(me, code, { institutionId }));
    const where = [data.scope.institutionName, data.scope.departmentName].filter(Boolean).join(' · ');
    const go = (route: string) => () => navigate('/app/' + route);
    return <>
        {header}
        <p className="sd-scope"><strong>{where}</strong><span>{departmentId ? 'Cette unité et ses sous-unités' : 'Toutes les unités de l’institution'}</span>
            <button type="button" className="btn small secondary" onClick={q.refresh}>Actualiser</button></p>
        <div className="hm sd">
            <section className="hm-kpis sd-kpis" aria-label="Indicateurs clés">
                <Kpi icon="docList" tone="green" value={documents?.total} label="Documents" hint={documents ? `${nf(documents.createdLast30Days)} créés ces 30 derniers jours` : undefined} onClick={go('documents')} />
                <Kpi icon="folder" tone="mint" value={dossiers?.total} label="Dossiers" onClick={go('dossiers')} />
                <Kpi icon="hourglass" tone="red" value={retention?.overdue} label="Échéances dépassées" hint="Échéances de conservation passées et non traitées" onClick={go('sort-final')} />
                <Kpi icon="snow" tone="blue" value={retention?.activeLegalHolds} label="Gels juridiques actifs" onClick={go('gel-legal')} />
                <Kpi icon="users" tone="green2" value={consultation?.pending} label="Demandes en attente"
                    hint={departmentId ? 'Les demandes de consultation se comptent par institution, pas par unité' : 'Demandes déposées ou en instruction'} onClick={go('consultations')} />
                <Kpi icon="landmark" tone="amber" value={heritage?.total} label="Biens patrimoniaux" onClick={go('patrimoine')} />
            </section>

            <div className="sd-grid">
                <Card title="Activité documentaire">
                    {!documents ? <Unavailable>Non disponible : votre habilitation ne couvre pas les documents dans ce périmètre.</Unavailable>
                        : <AreaChart title="Documents ajoutés" unit="document(s)" points={monthlySeries(documents.monthly)} color={BLUE} />}
                </Card>
                <Card title="Situation des documents">
                    {!documents ? <Unavailable>Non disponible : votre habilitation ne couvre pas les documents dans ce périmètre.</Unavailable>
                        : documents.total === 0 ? <p className="db-chart-note">Aucun document dans ce périmètre.</p>
                        : <Donut title="Documents par situation" unit="document(s)" segments={slices(documents.byArchivalStatus, ARCHIVAL_LABELS)} centerLabel="documents" />}
                </Card>
                <Card title="Niveaux de confidentialité">
                    {!documents ? <Unavailable>Non disponible : votre habilitation ne couvre pas les documents dans ce périmètre.</Unavailable>
                        : documents.total === 0 ? <p className="db-chart-note">Aucun document dans ce périmètre.</p>
                        : <StackedBar title="Documents par niveau" unit="document(s)" segments={slices(documents.byConfidentiality, CONFIDENTIALITY_LABELS)} />}
                    {documents && documents.destroyed > 0 && <p className="hm-foot">{nf(documents.destroyed)} document(s) détruit(s), conservés comme traces.</p>}
                </Card>
                <Card title="Conservation et échéances">
                    {!retention ? <Unavailable>Non disponible : votre habilitation ne couvre pas la conservation dans ce périmètre.</Unavailable>
                        : <>
                            <ul className="sd-facts">
                                <li><b>{nf(retention.overdue)}</b><span>échéances dépassées</span></li>
                                <li><b>{nf(retention.dueWithin90Days)}</b><span>dans les 90 prochains jours</span></li>
                                <li><b>{retention.activeLegalHolds === null ? '—' : nf(retention.activeLegalHolds)}</b><span>gels juridiques actifs</span></li>
                            </ul>
                            {Object.keys(retention.byStatus).length === 0 ? <p className="db-chart-note">Aucune échéance de conservation dans ce périmètre.</p>
                                : <StackedBar title="Échéances par état" unit="échéance(s)" segments={slices(retention.byStatus, RETENTION_LABELS)} />}
                        </>}
                </Card>
            </div>

            {activities && <Card title="Activités nationales rattachées" className="sd-activities">
                <ul className="sd-facts">
                    {intake && <><li><b>{nf(intake.open)}</b><span>versements ouverts</span></li><li><b>{nf(intake.total)}</b><span>versements au total</span></li></>}
                    {digitization && <><li><b>{nf(digitization.activeProjects)}</b><span>projets de numérisation en cours</span></li><li><b>{nf(digitization.projects)}</b><span>projets de numérisation au total</span></li></>}
                    {physical && <><li><b>{nf(physical.total)}</b><span>archives physiques</span></li></>}
                </ul>
                {digitization && Object.keys(digitization.elementsByStatus).length > 0 && <StackedBar title="Éléments numérisés par étape" unit="élément(s)" segments={slices(digitization.elementsByStatus, ELEMENT_LABELS)} />}
                <p className="hm-foot">Ces activités sont rattachées à l’institution et à la direction d’origine de chacune ; celles qui n’ont pas encore d’origine n’y figurent pas.</p>
            </Card>}

            <Card title={departmentId ? 'Cette unité et ses sous-unités' : 'Les unités de l’institution'}>
                {rows.length === 0 ? <p className="db-chart-note">Aucune unité n’est visible dans ce périmètre.</p>
                    : <div className="db-matrix-scroll" tabIndex={0} role="region" aria-label="Tableau des unités, défilement horizontal possible"><table className="hm-table sd-units">
                        <thead><tr><th scope="col">Unité</th><th scope="col">Type</th><th scope="col" className="num">Documents</th><th scope="col" className="num">Dossiers</th>
                            <th scope="col" className="num">Documents rattachés</th><th scope="col" className="num">Dossiers rattachés</th></tr></thead>
                        <tbody>{rows.map(({ unit, depth }) => <tr key={unit.id}>
                            <td style={{ paddingLeft: 8 + depth * 18 }}>
                                <button type="button" className="hm-link" title="Afficher le tableau de bord de cette unité" onClick={() => setScope({ institutionId: data.scope.institutionId, departmentId: unit.id })}>{unit.name}</button>
                            </td>
                            <td>{unit.type ?? '—'}</td>
                            <td className="num">{nf(unit.documents)}</td><td className="num">{nf(unit.dossiers)}</td>
                            <td className="num">{nf(unit.directDocuments)}</td><td className="num">{nf(unit.directDossiers)}</td>
                        </tr>)}</tbody>
                    </table></div>}
                {departmentId && wide && <p className="hm-foot"><button type="button" className="text-link" onClick={() => setScope({ institutionId: data.scope.institutionId, departmentId: null })}>Voir le tableau de bord de toute l’institution</button></p>}
            </Card>
        </div>
    </>;
}
