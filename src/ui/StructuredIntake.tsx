import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { Badge, ErrorNotice, Notice, formatDate, useResource } from './components';
import { BordereauPanel } from './Bordereau';
import { ActSealPanel } from './ActSeal';
import { IntakeExchangePanel } from './IntakeExchange';
import { useProducerNames } from './DepositAgreements';
import { EntityName, useEntityName } from './names';
import { factsOf, type AgreementView } from '../core/depositAgreements';
import {
    STAGE_HELP, STAGE_LABELS, acknowledgementHtml, actionsFor, receiveProblems, submitProblems,
    type ActionSpec, type BordereauView, type StageEvent
} from '../core/structuredIntake';
import type { ArchivalIntake } from '../core/types';
import { printHtml } from './printHtml';

/**
 * Le circuit d'un versement structuré dans la fiche de l'entrée : étape et son explication, parties, accord, actions possibles (avec ce qui les bloque),
 * bordereau, accusé de réception, journal des étapes.
 */
export function StructuredSection({ intake, canManage, onChanged }: { intake: ArchivalIntake; canManage: boolean; onChanged: () => void }) {
    const { archivalIntake, epoch } = useSession();
    const stage = intake.etape!;
    const [view, setView] = useState<BordereauView | null>(null);
    const agreementsQ = useResource<AgreementView[]>(signal => intake.accordId ? archivalIntake!.agreements(signal) : Promise.resolve([]), `intake-agreement:${intake.accordId ?? ''}:${epoch}`);
    const agreement = agreementsQ.data?.find(a => a.id === intake.accordId) ?? null;
    const producers = useProducerNames([intake.institutionArchivesId]);
    const journalQ = useResource<StageEvent[]>(signal => archivalIntake!.journal(intake.id, signal), `intake-journal:${intake.id}:${stage}:${epoch}`);
    const archives = useEntityName('institutions', intake.institutionArchivesId);
    const [pending, setPending] = useState<ActionSpec | null>(null);
    const [motif, setMotif] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const producerName = producers.nameOf(intake.producteurId);
    const today = new Date().toISOString().slice(0, 10);

    const blockers = (action: ActionSpec['action']): string[] => {
        if (!view) return ['Chargement du bordereau…'];
        if (action === 'submit') return submitProblems({ producteurId: intake.producteurId ?? null, institutionArchivesId: intake.institutionArchivesId ?? null, lines: view.lignes.map(l => l.input), agreement: agreement ? factsOf(agreement) : null, today });
        if (action === 'receive') return receiveProblems(view.lignes);
        return [];
    };
    const run = async () => {
        if (!pending || busy) return;
        setBusy(true); setError(null);
        try { await archivalIntake!.cycle(intake.id, pending.action, pending.needsMotif ? motif.trim() : undefined); setPending(null); setMotif(''); onChanged(); }
        catch (e) { setError(e); } finally { setBusy(false); }
    };
    const printReceipt = () => {
        if (!view || !intake.accuseReference || !intake.accuseDate) return;
        const html = acknowledgementHtml({ reference: intake.accuseReference, date: formatDate(intake.accuseDate), numero: intake.numero, producteur: producerName ?? 'Producteur', serviceArchives: archives.name ?? 'Service d’archives',
            accord: agreement ? `${agreement.input.reference} · ${agreement.input.intitule}` : null, lines: view.lignes });
        printHtml(html);
    };

    const actions = canManage && intake.statut === 'OUVERTE' ? actionsFor(stage) : [];
    const mainBlockers = actions.length ? blockers(actions[0]!.action) : [];
    return <section className="structured-intake" aria-label="Circuit du versement">
        <div className="stage-banner"><Badge value={stage} label={STAGE_LABELS[stage]} /><p>{STAGE_HELP[stage]}</p></div>
        {stage === 'A_CORRIGER' && intake.motifDecision && <Notice tone="warning"><strong>Correction demandée :</strong> {intake.motifDecision}</Notice>}
        {stage === 'REJETE' && intake.motifDecision && <Notice tone="warning"><strong>Motif du rejet :</strong> {intake.motifDecision}</Notice>}
        <dl className="detail-card">
            <div><dt>Producteur</dt><dd>{intake.producteurId ? producerName : <em>Non désigné</em>}</dd></div>
            <div><dt>Service d’archives</dt><dd>{intake.institutionArchivesId ? <EntityName kind="institutions" id={intake.institutionArchivesId} /> : <em>Non désigné</em>}</dd></div>
            <div><dt>Accord de versement</dt><dd>{intake.accordId ? agreement ? `${agreement.input.reference} · ${agreement.input.intitule}` : '…' : 'Aucun accord'}</dd></div>
            {intake.dateSoumission && <div><dt>Soumis le</dt><dd>{formatDate(intake.dateSoumission)}</dd></div>}
            {intake.accuseReference && <div><dt>Accusé de réception</dt><dd><strong>{intake.accuseReference}</strong>{intake.accuseDate && ` · ${formatDate(intake.accuseDate)}`} <button type="button" className="btn small secondary" onClick={printReceipt} disabled={!view}>Afficher et imprimer</button></dd></div>}
        </dl>
        {intake.accuseReference && <ActSealPanel type="ACCUSE_VERSEMENT" id={intake.id} />}
        {actions.length > 0 && <div className="stage-actions">
            <div className="table-actions">{actions.map((a, i) => <button key={a.action} type="button" className={'btn small ' + (a.tone === 'danger' ? 'danger-outline' : i === 0 ? 'primary' : 'secondary')}
                disabled={busy || (i === 0 && mainBlockers.length > 0)} onClick={() => { setPending(a); setMotif(''); setError(null); }}>{a.label}</button>)}</div>
            {mainBlockers.length > 0 && <ul className="relation-problems" aria-label={`Avant de ${actions[0]!.action === 'receive' ? 'constater la réception' : 'soumettre'}`}>{mainBlockers.slice(0, 6).map(p => <li key={p}>{p}</li>)}{mainBlockers.length > 6 && <li>… et {mainBlockers.length - 6} autre{mainBlockers.length - 6 > 1 ? 's' : ''}.</li>}</ul>}
        </div>}
        {pending && <div className="f3-hint" role="group" aria-label={pending.label}>
            <p>{pending.confirm}</p>
            {pending.needsMotif && <label className="field"><span>Motif</span><textarea value={motif} onChange={e => setMotif(e.target.value)} rows={2} maxLength={5000} disabled={busy} required /></label>}
            {blockers(pending.action).length > 0 && <ul className="relation-problems">{blockers(pending.action).slice(0, 6).map(p => <li key={p}>{p}</li>)}</ul>}
            {error ? <ErrorNotice error={error} /> : null}
            <button type="button" className="btn secondary" disabled={busy} onClick={() => setPending(null)}>Revenir</button>{' '}
            <button type="button" className={'btn ' + (pending.tone === 'danger' ? 'danger' : 'primary')} disabled={busy || (pending.needsMotif && !motif.trim()) || blockers(pending.action).length > 0} onClick={() => void run()}>{busy ? 'En cours…' : pending.label}</button>
        </div>}
        {!pending && error ? <ErrorNotice error={error} /> : null}
        <BordereauPanel intake={intake} canManage={canManage} onLoaded={setView} onChanged={onChanged} />
        <IntakeExchangePanel intake={intake} canManage={canManage} editable={!!view?.modifiable} onChanged={onChanged} />
        {journalQ.data && journalQ.data.length > 0 && <section aria-label="Journal des étapes"><h4>Journal des étapes</h4>
            <ol className="stage-journal">{journalQ.data.map(e => <li key={e.id}><time>{formatDate(e.date)}</time> — {e.de ? `${STAGE_LABELS[e.de]} → ${STAGE_LABELS[e.vers]}` : `Création (${STAGE_LABELS[e.vers].toLowerCase()})`}
                {e.acteurId && <> par <EntityName kind="users" id={e.acteurId} /></>}{e.motif && <em> : « {e.motif} »</em>}</li>)}</ol></section>}
    </section>;
}
