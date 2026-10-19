import React from 'react';
import { useSession } from '../auth/session';
import { useWorkspace } from '../ui/workspace';
import { navigate } from '../ui/navigation';
import { Busy, ErrorNotice, Notice, useResource } from '../ui/components';
import { AreaChart, Donut, Meter, StackedBar, nf } from '../ui/charts';
import { Card, Kpi, Unavailable } from '../ui/DashboardParts';
import {
    ARCHIVAL_LABELS, CONFIDENTIALITY_LABELS, RETENTION_LABELS, monthlySeries, slices, type InstitutionRow, type NationalDashboard
} from '../core/dashboard';

const BLUE = '#2a78d6';
/** Les étapes où un élément numérisé est encore en traitement (ni terminé, ni suspendu, ni annulé). */
const PROCESSING = ['RECEPTION', 'NUMERISATION', 'OCR_INDEXATION', 'CONTROLE_QUALITE', 'METADONNEES', 'VALIDATION'];
const OPEN_SLIPS = ['BROUILLON', 'SOUMIS', 'VISE'];
const OPEN_TRANSFERS = ['BROUILLON', 'SOUMIS', 'ACCEPTE'];

const count = (values: Record<string, number>, keys: string[]) => keys.reduce((total, key) => total + (values[key] ?? 0), 0);

/** Une ligne de chiffres d'une activité nationale. */
function Facts({ rows }: { rows: Array<[string, number | null]> }) {
    return <ul className="nd-facts">{rows.map(([label, value]) => <li key={label}><b>{value === null ? '—' : nf(value)}</b><span>{label}</span></li>)}</ul>;
}

/**
 * La vue d'ensemble du Directeur national des archives, sur un seul écran : les totaux de toutes les institutions, une ligne par institution (un clic ouvre son tableau de bord), et les
 * activités nationales. Elle ne montre que des nombres, jamais un titre ni un contenu.
 */
export function NationalDashboardPage() {
    const { dashboard, epoch } = useSession();
    const { setScope } = useWorkspace();
    const q = useResource<NationalDashboard | null>(signal => dashboard ? dashboard.national(signal) : Promise.resolve(null), `national-dashboard:${epoch}`);
    const data = q.data ?? null;
    if (q.loading && !data) return <Busy />;
    if (q.error) return <ErrorNotice error={q.error} onRetry={q.refresh} />;
    if (!data) return <Notice tone="warning">Le tableau de bord national n’est pas disponible dans cette session.</Notice>;

    const open = (institution: InstitutionRow) => { setScope({ institutionId: institution.id, departmentId: null }); navigate('/app/tableau-de-bord'); };
    const biggest = Math.max(1, ...data.institutionRows.map(row => row.documents));
    const updated = new Date(data.generatedAt);
    return <div className="hm nd">
        <header className="nd-head">
            <div><div className="eyebrow">PILOTAGE NATIONAL</div><h1>Tableau de bord national</h1></div>
            <p>{Number.isNaN(updated.getTime()) ? '' : `Mis à jour le ${updated.toLocaleDateString('fr-FR')} à ${updated.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`}
                <button type="button" className="btn small secondary" onClick={q.refresh}>Actualiser</button></p>
        </header>

        <section className="hm-kpis nd-kpis" aria-label="Indicateurs nationaux">
            <Kpi icon="building" tone="green" value={data.institutions} label="Institutions" />
            <Kpi icon="users" tone="mint" value={data.units} label="Unités" />
            <Kpi icon="docList" tone="blue" value={data.documents.total} label="Documents" hint={`${nf(data.documents.createdLast30Days)} créés ces 30 derniers jours`} />
            <Kpi icon="folder" tone="green2" value={data.dossiers.total} label="Dossiers" />
            <Kpi icon="hourglass" tone="red" value={data.retention.overdue} label="Échéances dépassées" hint="Échéances de conservation passées et non traitées" />
            <Kpi icon="snow" tone="amber" value={data.retention.activeLegalHolds} label="Gels actifs" />
            <Kpi icon="eye" tone="green2" value={data.consultation.pending} label="Demandes en attente" hint="Demandes de consultation déposées ou en instruction" />
            <Kpi icon="landmark" tone="blue" value={data.heritage.total} label="Biens patrimoniaux" />
        </section>

        <div className="nd-charts">
            <Card title="Documents ajoutés par mois"><AreaChart title="Documents ajoutés" unit="document(s)" points={monthlySeries(data.documents.monthly)} color={BLUE} /></Card>
            <Card title="Situation des documents">
                {data.documents.total === 0 ? <p className="db-chart-note">Aucun document.</p>
                    : <Donut title="Documents par situation" unit="document(s)" segments={slices(data.documents.byArchivalStatus, ARCHIVAL_LABELS)} centerLabel="documents" />}
            </Card>
            <Card title="Confidentialité et échéances">
                {data.documents.total === 0 ? <p className="db-chart-note">Aucun document.</p>
                    : <StackedBar title="Documents par niveau" unit="document(s)" segments={slices(data.documents.byConfidentiality, CONFIDENTIALITY_LABELS)} />}
                {Object.keys(data.retention.byStatus).length === 0 ? <p className="db-chart-note">Aucune échéance de conservation.</p>
                    : <StackedBar title="Échéances par état" unit="échéance(s)" segments={slices(data.retention.byStatus, RETENTION_LABELS)} />}
            </Card>
        </div>

        <div className="nd-lower">
            <Card title="Les institutions" className="nd-institutions">
                {data.institutionRows.length === 0 ? <p className="db-chart-note">Aucune institution.</p>
                    : <div className="nd-scroll" tabIndex={0} role="region" aria-label="Tableau des institutions, défilement possible"><table className="hm-table">
                        <thead><tr><th scope="col">Institution</th><th scope="col" className="num">Unités</th><th scope="col">Documents</th><th scope="col" className="num">Dossiers</th>
                            <th scope="col" className="num">Échéances dépassées</th><th scope="col" className="num">Gels</th><th scope="col" className="num">Demandes</th><th scope="col" className="num">Biens</th><th scope="col" className="num">Versements ouverts</th>
                            <th scope="col" className="num">Numérisation en cours</th><th scope="col" className="num">Archives physiques</th></tr></thead>
                        <tbody>{data.institutionRows.map(row => <tr key={row.id}>
                            <td><button type="button" className="hm-link" title="Afficher le tableau de bord de cette institution" onClick={() => open(row)}>{row.acronym ? row.acronym + ' · ' : ''}{row.name}</button></td>
                            <td className="num">{nf(row.units)}</td>
                            <td className="nd-bar"><span className="nd-bar-n">{nf(row.documents)}</span><Meter label={`Documents : ${row.name}`} value={row.documents} total={biggest} fill={BLUE} track="#e3ebf5" /></td>
                            <td className="num">{nf(row.dossiers)}</td>
                            <td className={'num' + (row.retentionOverdue > 0 ? ' nd-warn' : '')}>{nf(row.retentionOverdue)}</td>
                            <td className="num">{nf(row.activeLegalHolds)}</td><td className="num">{nf(row.pendingConsultations)}</td><td className="num">{nf(row.heritageAssets)}</td>
                            <td className="num">{nf(row.openIntakes ?? 0)}</td><td className="num">{nf(row.activeDigitizationProjects ?? 0)}</td><td className="num">{nf(row.physicalArchives ?? 0)}</td>
                        </tr>)}</tbody>
                    </table></div>}
            </Card>

            <div className="nd-activities">
                <Card title="Versements">
                    {!data.intake ? <Unavailable>Non disponible : votre habilitation ne couvre pas les versements.</Unavailable>
                        : <Facts rows={[['entrées ouvertes', data.intake.open], ['entrées au total', data.intake.total], ['sans institution versante', data.intake.unattributed ?? 0]]} />}
                </Card>
                <Card title="Numérisation">
                    {!data.digitization ? <Unavailable>Non disponible : votre habilitation ne couvre pas la numérisation.</Unavailable>
                        : <Facts rows={[['projets en cours', data.digitization.activeProjects], ['éléments en traitement', count(data.digitization.elementsByStatus, PROCESSING)],
                            ['éléments suspendus', data.digitization.elementsByStatus.SUSPENDU ?? 0], ['projets sans origine', data.digitization.unattributedProjects ?? 0]]} />}
                </Card>
                <Card title="Archives physiques">
                    {!data.physical ? <Unavailable>Non disponible : votre habilitation ne couvre pas les archives physiques.</Unavailable>
                        : <Facts rows={[['archives recensées', data.physical.total], ['détruites', data.physical.destroyed], ['sans origine', data.physical.unattributed ?? 0]]} />}
                </Card>
                <Card title="Portail des lecteurs">
                    {!data.portal ? <Unavailable>Non disponible : votre habilitation ne couvre pas le portail des lecteurs.</Unavailable>
                        : <Facts rows={[['lecteurs actifs', data.portal.activeReaders], ['abonnements actifs', data.portal.activeSubscriptions], ['demandes d’accès en attente', data.portal.pendingAccessRequests]]} />}
                </Card>
                <Card title="Éliminations et transferts">
                    {!data.transfers ? <Unavailable>Non disponible : votre habilitation ne couvre pas les éliminations et les transferts.</Unavailable>
                        : <Facts rows={[['bordereaux d’élimination en cours', count(data.transfers.eliminationSlipsByStatus, OPEN_SLIPS)],
                            ['transferts en cours', count(data.transfers.transfersByStatus, OPEN_TRANSFERS)]]} />}
                </Card>
            </div>
        </div>
    </div>;
}
