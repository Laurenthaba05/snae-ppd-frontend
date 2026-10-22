import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { useWorkspace } from '../ui/workspace';
import { navigate } from '../ui/navigation';
import { Icon } from '../ui/icons';
import { Busy, ErrorNotice, Notice, useResource } from '../ui/components';
import { AreaChart, Breakdown, Donut, Meter, nf } from '../ui/charts';
import { Card, EmptyNote, Facts, Kpi, Unavailable, updatedText, useKeptData } from '../ui/DashboardParts';
import {
    ARCHIVAL_COLORS, ARCHIVAL_LABELS, CONFIDENTIALITY_COLORS, CONFIDENTIALITY_LABELS, PALETTE, RETENTION_COLORS, RETENTION_LABELS, monthlySeries, slices, type InstitutionRow, type NationalDashboard
} from '../core/dashboard';

const BRAND = PALETTE[0]!;
/** Les étapes où un élément numérisé est encore en traitement (ni terminé, ni suspendu, ni annulé). */
const PROCESSING = ['RECEPTION', 'NUMERISATION', 'OCR_INDEXATION', 'CONTROLE_QUALITE', 'METADONNEES', 'VALIDATION'];
const OPEN_SLIPS = ['BROUILLON', 'SOUMIS', 'VISE'];
const OPEN_TRANSFERS = ['BROUILLON', 'SOUMIS', 'ACCEPTE'];

const count = (values: Record<string, number>, keys: string[]) => keys.reduce((total, key) => total + (values[key] ?? 0), 0);

/** Une institution sans aucune activité (ni document, ni dossier, ni échéance, ni versement…) : on ne lui consacre une ligne que si l'on demande à les voir. */
const idle = (row: InstitutionRow) => !(row.documents || row.dossiers || row.retentionOverdue || row.activeLegalHolds || row.pendingConsultations || row.heritageAssets || row.openIntakes || row.activeDigitizationProjects || row.physicalArchives);

/** Une cellule de nombre : un zéro s'atténue, pour que ce qui est là se voie. */
const Num = ({ value }: { value: number }) => <td className={'num' + (value === 0 ? ' zero' : '')}>{nf(value)}</td>;

/**
 * La vue d'ensemble du Directeur national des archives, sur un seul écran : les totaux de toutes les institutions, une ligne par institution (un clic ouvre son tableau de bord), et les
 * activités nationales. Elle ne montre que des nombres, jamais un titre ni un contenu.
 */
export function NationalDashboardPage() {
    const { dashboard, epoch } = useSession();
    const { setScope } = useWorkspace();
    const key = `national-dashboard:${epoch}`;
    const q = useResource<NationalDashboard | null>(signal => dashboard ? dashboard.national(signal) : Promise.resolve(null), key);
    const data = useKeptData(q.data, key);
    if (q.loading && !data) return <Busy />;
    if (q.error) return <ErrorNotice error={q.error} onRetry={q.refresh} />;
    if (!data) return <Notice tone="warning">Le tableau de bord national n’est pas disponible dans cette session.</Notice>;
    const open = (institution: InstitutionRow) => { setScope({ institutionId: institution.id, departmentId: null }); navigate('/app/tableau-de-bord'); };
    return <NationalDashboardView data={data} refreshing={q.loading} onRefresh={q.refresh} onOpenInstitution={open} />;
}

/** Ce que voit la personne : les chiffres déjà lus, sans accès au serveur (la page les lit, l'aperçu de conception les fabrique). */
export function NationalDashboardView({ data, refreshing = false, onRefresh, onOpenInstitution }: { data: NationalDashboard; refreshing?: boolean; onRefresh: () => void; onOpenInstitution: (institution: InstitutionRow) => void }) {
    const open = onOpenInstitution;
    const [showIdle, setShowIdle] = useState(false);
    const biggest = Math.max(1, ...data.institutionRows.map(row => row.documents));
    const monthly = monthlySeries(data.documents.monthly);
    const idleRows = data.institutionRows.filter(idle);
    // sans aucune institution active, on montre tout (un tableau vide ne dirait rien) ; sinon les institutions sans activité se déplient à la demande
    const collapsible = idleRows.length > 0 && idleRows.length < data.institutionRows.length;
    const shown = collapsible && !showIdle ? data.institutionRows.filter(row => !idle(row)) : data.institutionRows;
    return <div className={'hm nd dv' + (refreshing ? ' refreshing' : '')} aria-busy={refreshing}>
        <header className="dv-pagehead">
            <div><div className="eyebrow">PILOTAGE NATIONAL</div><h1>Tableau de bord national</h1></div>
            <p className="dv-pagehead-meta"><span>{updatedText(data.generatedAt)}</span>
                <button type="button" className="btn small secondary" onClick={onRefresh}><Icon name="refresh" size={14} />Actualiser</button></p>
        </header>

        <section className="dv-band" aria-label="Indicateurs nationaux">
            <Kpi variant="hero" icon="docList" tone="blue" value={data.documents.total} label="Documents" hint={`${nf(data.documents.createdLast30Days)} créés ces 30 derniers jours`}
                trend={monthly.map(point => point.value)} trendLabels={monthly.map(point => point.label)} trendCaption="12 derniers mois"
                delta={{ text: `+${nf(data.documents.createdLast30Days)} ces 30 derniers jours`, up: data.documents.createdLast30Days > 0 ? true : undefined }} />
            <div className="dv-groups">
                <div className="dv-group volumes four">
                    <Kpi icon="building" tone="green" value={data.institutions} label="Institutions" />
                    <Kpi icon="users" tone="mint" value={data.units} label="Unités" />
                    <Kpi icon="folder" tone="green2" value={data.dossiers.total} label="Dossiers" />
                    <Kpi icon="landmark" tone="amber" value={data.heritage.total} label="Biens patrimoniaux" />
                </div>
                <div className="dv-group watch">
                    <Kpi icon="hourglass" tone="red" alert="critical" value={data.retention.overdue} label="Échéances dépassées" hint="Échéances de conservation passées et non traitées" />
                    <Kpi icon="snow" tone="blue" alert="info" value={data.retention.activeLegalHolds} label="Gels actifs" />
                    <Kpi icon="eye" tone="green2" alert="warning" value={data.consultation.pending} label="Demandes en attente" hint="Demandes de consultation déposées ou en instruction" />
                </div>
            </div>
        </section>

        <div className="dv-grid charts">
            <Card title="Documents ajoutés par mois" subtitle="Tous les documents, sur douze mois"><AreaChart title="Documents ajoutés" unit="document(s)" points={monthly} color={BRAND} /></Card>
            <Card title="Situation des documents" subtitle="Cycle de vie">
                {data.documents.total === 0 ? <EmptyNote>Aucun document.</EmptyNote>
                    : <Donut title="Documents par situation" unit="document(s)" segments={slices(data.documents.byArchivalStatus, ARCHIVAL_LABELS, undefined, ARCHIVAL_COLORS)} centerLabel="documents" />}
            </Card>
        </div>

        <Card title="Confidentialité et échéances" subtitle="Du public au secret, et l’état des échéances de conservation">
            <div className="dv-split">
                <div>
                    <h3 className="dv-sub">Niveaux de confidentialité</h3>
                    {data.documents.total === 0 ? <EmptyNote>Aucun document.</EmptyNote>
                        : <Breakdown title="Documents par niveau" unit="document(s)" segments={slices(data.documents.byConfidentiality, CONFIDENTIALITY_LABELS, undefined, CONFIDENTIALITY_COLORS)} />}
                </div>
                <div>
                    <h3 className="dv-sub">Échéances par état</h3>
                    {Object.keys(data.retention.byStatus).length === 0 ? <EmptyNote>Aucune échéance de conservation.</EmptyNote>
                        : <Breakdown title="Échéances par état" unit="échéance(s)" segments={slices(data.retention.byStatus, RETENTION_LABELS, undefined, RETENTION_COLORS)} />}
                </div>
            </div>
        </Card>

        <Card title="Les institutions" subtitle="Un clic ouvre le tableau de bord de l’institution" className="nd-institutions">
            {data.institutionRows.length === 0 ? <EmptyNote>Aucune institution.</EmptyNote>
                : <div className="nd-scroll" tabIndex={0} role="region" aria-label="Tableau des institutions, défilement possible"><table className="hm-table dv-institutions">
                    <thead><tr><th scope="col">Institution</th><th scope="col" className="num">Unités</th><th scope="col">Documents</th><th scope="col" className="num">Dossiers</th>
                        <th scope="col" className="num">Échéances dépassées</th><th scope="col" className="num">Gels</th><th scope="col" className="num">Demandes</th><th scope="col" className="num">Biens</th><th scope="col" className="num">Versements ouverts</th>
                        <th scope="col" className="num">Numérisation en cours</th><th scope="col" className="num">Archives physiques</th></tr></thead>
                    <tbody>{shown.map(row => <tr key={row.id}>
                        <td><button type="button" className="hm-link" title="Afficher le tableau de bord de cette institution" onClick={() => open(row)}>{row.acronym ? row.acronym + ' · ' : ''}{row.name}</button></td>
                        <Num value={row.units} />
                        <td className="nd-bar"><span className={'nd-bar-n' + (row.documents === 0 ? ' zero' : '')}>{nf(row.documents)}</span><Meter label={`Documents : ${row.name}`} value={row.documents} total={biggest} fill={BRAND} track="#e1efe7" /></td>
                        <Num value={row.dossiers} />
                        <td className={'num' + (row.retentionOverdue > 0 ? ' nd-warn' : ' zero')}><span className={'dv-pill ' + (row.retentionOverdue > 0 ? 'crit' : 'zero')}>{nf(row.retentionOverdue)}</span></td>
                        <Num value={row.activeLegalHolds} /><Num value={row.pendingConsultations} /><Num value={row.heritageAssets} />
                        <Num value={row.openIntakes ?? 0} /><Num value={row.activeDigitizationProjects ?? 0} /><Num value={row.physicalArchives ?? 0} />
                    </tr>)}</tbody>
                </table></div>}
            {collapsible && <p className="dv-idle"><button type="button" className="text-link" aria-expanded={showIdle} onClick={() => setShowIdle(!showIdle)}>
                {showIdle ? 'Masquer les institutions sans activité' : `Afficher les ${idleRows.length} institution(s) sans activité`}</button></p>}
            <p className="hm-foot">Les totaux nationaux comptent tous les documents, y compris ceux sous restriction d’accès et ceux d’institutions qui ne sont plus actives ; le tableau de bord d’une institution ne compte que ce que vous avez le droit de lire.</p>
        </Card>

        <div className="dv-grid activities nd-activities">
            <Card title="Versements">
                {!data.intake ? <Unavailable>Non disponible : votre habilitation ne couvre pas les versements.</Unavailable>
                    : <Facts className="nd-facts" rows={[['entrées ouvertes', data.intake.open], ['entrées au total', data.intake.total], ['sans institution versante', data.intake.unattributed ?? 0]]} />}
            </Card>
            <Card title="Numérisation">
                {!data.digitization ? <Unavailable>Non disponible : votre habilitation ne couvre pas la numérisation.</Unavailable>
                    : <Facts className="nd-facts" rows={[['projets en cours', data.digitization.activeProjects], ['éléments en traitement', count(data.digitization.elementsByStatus, PROCESSING)],
                        ['éléments suspendus', data.digitization.elementsByStatus.SUSPENDU ?? 0], ['projets sans origine', data.digitization.unattributedProjects ?? 0]]} />}
            </Card>
            <Card title="Archives physiques">
                {!data.physical ? <Unavailable>Non disponible : votre habilitation ne couvre pas les archives physiques.</Unavailable>
                    : <Facts className="nd-facts" rows={[['archives recensées', data.physical.total], ['détruites', data.physical.destroyed], ['sans origine', data.physical.unattributed ?? 0]]} />}
            </Card>
            <Card title="Portail des lecteurs">
                {!data.portal ? <Unavailable>Non disponible : votre habilitation ne couvre pas le portail des lecteurs.</Unavailable>
                    : <Facts className="nd-facts" rows={[['lecteurs actifs', data.portal.activeReaders], ['abonnements actifs', data.portal.activeSubscriptions], ['demandes d’accès en attente', data.portal.pendingAccessRequests]]} />}
            </Card>
            <Card title="Éliminations et transferts">
                {!data.transfers ? <Unavailable>Non disponible : votre habilitation ne couvre pas les éliminations et les transferts.</Unavailable>
                    : <Facts className="nd-facts" rows={[['bordereaux d’élimination en cours', count(data.transfers.eliminationSlipsByStatus, OPEN_SLIPS)],
                        ['transferts en cours', count(data.transfers.transfersByStatus, OPEN_TRANSFERS)]]} />}
            </Card>
        </div>
    </div>;
}
