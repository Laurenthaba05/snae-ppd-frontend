import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { useWorkspace } from '../ui/workspace';
import { can } from '../core/policy';
import { PageHead, Busy, ErrorNotice, Empty, useResource, Badge, formatDate } from '../ui/components';
import { EventDispositions, ReleaseHoldDialog } from './Records';
import { RetentionRulesPanel } from '../ui/RetentionRules';
import { CertificatesPanel } from '../ui/Destruction';
import { BordereauxPanel } from '../ui/Bordereaux';
import { IntermediatePanel } from '../ui/Intermediate';
import { ArchiveTransfersPanel } from '../ui/ArchiveTransfers';
import { TriggerEventTypesPanel } from '../ui/TriggerEvents';
import { SamplingCampaignsPanel } from '../ui/SamplingCampaigns';
import type { RetentionEvent, LegalHold } from '../core/types';

export function RetentionNationalPage() {
    const { me, retention, epoch } = useSession();
    const { scope } = useWorkspace();
    const institutionId = scope.institutionId;
    const canReview = can(me, 'RETENTION_REVIEW', scope);
    const canManageHolds = can(me, 'LEGAL_HOLD_MANAGE', scope);
    const canManageRules = can(me, 'RETENTION_RULE_MANAGE', scope);
    const canBordereaux = canReview || can(me, 'DISPOSITION_PROPOSE', scope) || can(me, 'DISPOSITION_VALIDATE', scope) || can(me, 'DISPOSITION_EXECUTE', scope);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [releasing, setReleasing] = useState<string | null>(null);
    const eventsQ = useResource<RetentionEvent[]>(s => institutionId ? retention!.events(institutionId, scope.departmentId, s) : Promise.resolve([]), 'retention-events-national:' + institutionId + ':' + scope.departmentId + ':' + epoch);
    const holdsQ = useResource<LegalHold[]>(s => institutionId ? retention!.legalHolds(institutionId, scope.departmentId, s) : Promise.resolve([]), 'legal-holds-national:' + institutionId + ':' + scope.departmentId + ':' + epoch);
    const events = eventsQ.data ?? [];
    const holds = holdsQ.data ?? [];
    if (!institutionId)
        return <><PageHead eyebrow="MODULE · RÉTENTION" title="Durées, sort final et gels légaux" description="Vue nationale des échéances de conservation et des gels légaux."/><ErrorNotice error={new Error('Choisissez une institution dans le périmètre de travail pour afficher les échéances et les gels légaux de rétention.')}/></>;
    return <><PageHead eyebrow="MODULE · RÉTENTION" title="Durées, sort final et gels légaux" description="Vue nationale des échéances de conservation et des gels légaux, pour l’institution du périmètre de travail courant."/>
        {canManageRules && <RetentionRulesPanel />}
        {(canManageRules || canReview) && <TriggerEventTypesPanel institutionId={institutionId}/>}
        <div className="panel">
            <div className="section-heading"><h3>Échéances de rétention</h3></div>
            {!canReview ? <ErrorNotice error={new Error('Cette section exige une habilitation de revue de rétention pour ce périmètre.')}/> : eventsQ.loading ? <Busy /> : eventsQ.error ? <ErrorNotice error={eventsQ.error} onRetry={eventsQ.refresh}/> : events.length ? <div className="table-scroll"><table><thead><tr><th>Statut</th><th>Date de base</th><th>Échéance</th><th>Révisions</th></tr></thead><tbody>{events.map(ev => <React.Fragment key={ev.id}><tr><td><Badge value={ev.status}/></td><td>{formatDate(ev.baseDate)}</td><td>{formatDate(ev.dueDate)}</td><td><button className="btn small secondary" onClick={() => setExpanded(x => x === ev.id ? null : ev.id)}>{ev.reviewCount} · {expanded === ev.id ? 'Masquer' : 'Dispositions'}</button></td></tr>{expanded === ev.id && <EventDispositions eventId={ev.id} eventStatus={ev.status}/>}</React.Fragment>)}</tbody></table></div> : <Empty title="Aucune échéance de rétention" description="Aucune échéance planifiée pour ce périmètre." icon="clock"/>}
        </div>
        <div className="panel">
            <div className="section-heading"><h3>Gels légaux</h3></div>
            {!canManageHolds ? <ErrorNotice error={new Error('Cette section exige une habilitation de gestion des gels légaux pour ce périmètre.')}/> : holdsQ.loading ? <Busy /> : holdsQ.error ? <ErrorNotice error={holdsQ.error} onRetry={holdsQ.refresh}/> : holds.length ? <div className="table-scroll"><table><thead><tr><th>Référence</th><th>Statut</th><th>Motif</th><th>Ouvert le</th><th /></tr></thead><tbody>{holds.map(h => <tr key={h.id}><td><code>{h.reference}</code></td><td><Badge value={h.status}/></td><td>{h.reason}</td><td>{formatDate(h.openedAt)}</td><td>{h.status === 'ACTIF' && <button className="btn small danger-outline" onClick={() => setReleasing(h.id)}>Lever</button>}</td></tr>)}</tbody></table></div> : <Empty title="Aucun gel légal" description="Aucun gel légal actif ou passé pour ce périmètre." icon="shield"/>}
        </div>
        {canReview && <IntermediatePanel institutionId={institutionId} departmentId={scope.departmentId}/>}
        {canBordereaux && <SamplingCampaignsPanel institutionId={institutionId} departmentId={scope.departmentId}/>}
        {canBordereaux && <BordereauxPanel institutionId={institutionId} departmentId={scope.departmentId}/>}
        {canBordereaux && <ArchiveTransfersPanel institutionId={institutionId} departmentId={scope.departmentId}/>}
        {canReview && <CertificatesPanel institutionId={institutionId}/>}
        {releasing && <ReleaseHoldDialog holdId={releasing} onClose={() => setReleasing(null)} onSuccess={holdsQ.refresh}/>}
        </>;
}
