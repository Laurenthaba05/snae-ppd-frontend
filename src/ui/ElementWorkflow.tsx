import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { Badge, Busy, ErrorNotice, Field, Modal, Notice, formatDate, useResource } from './components';
import { Icon } from './icons';
import { QualityPanel } from './QualityPanel';
import { SEAL_NOTICE, STAGES, canAdvance, isTerminalStage, sealingContextText, sealingSummary, shortHash, sinceText, splitOptions, stageIndex, stageName, transitionLabel } from '../core/workflow';
import type { DigitizationElement, ElementTransition, ElementWorkflow, ScanPage, TransitionOption, WorkflowBlocker } from '../core/types';

const MOTIF_MIN = 10;

const permissionNames: Record<string, string> = {
    DIGITIZATION_SCAN: 'numérisation', DIGITIZATION_OCR: 'OCR et indexation', DIGITIZATION_QC: 'contrôle qualité', DIGITIZATION_VALIDATE: 'validation', DIGITIZATION_MANAGE: 'gestion de la numérisation'
};

function Blockers({ blockers }: { blockers: WorkflowBlocker[] }) {
    if (!blockers.length) return null;
    return <ul className="wf-blockers">{blockers.map((b, index) => <li key={b.code + ':' + index} className={b.overridable ? 'warn' : 'bad'}><Icon name="alert" size={15} /><span>{b.message}{b.overridable && <small> Dérogation possible avec un motif écrit.</small>}</span></li>)}</ul>;
}

/** Frise des sept étapes : faites, en cours, à venir. Un élément suspendu ou annulé garde sa place sur la frise. */
function Stepper({ element }: { element: DigitizationElement }) {
    const place = element.statut === 'SUSPENDU' && element.etapeSuspension ? element.etapeSuspension : element.statut;
    const current = stageIndex(place);
    const finished = element.statut === 'TERMINE';
    return <ol className="wf-steps" aria-label="Étapes du traitement">{STAGES.map((stage, index) => {
        const state = finished || index < current ? 'done' : index === current ? 'current' : 'todo';
        return <li key={stage.status} className={'wf-step ' + state + (element.statut === 'SUSPENDU' && index === current ? ' paused' : '') + (element.statut === 'ANNULE' && index === current ? ' cancelled' : '')} aria-current={state === 'current' && !finished ? 'step' : undefined}>
            <i>{state === 'done' ? <Icon name="check" size={14} /> : index + 1}</i><span>{stage.label}</span></li>;
    })}</ol>;
}

export function TransitionDialog({ element, option, onClose, onDone, initialRescan }: { element: DigitizationElement; option: TransitionOption; onClose: () => void; onDone: () => void; initialRescan?: number[] }) {
    const { digitization, epoch } = useSession();
    const [motif, setMotif] = useState('');
    const [rescan, setRescan] = useState<number[]>(initialRescan ?? []);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const askPages = element.statut === 'CONTROLE_QUALITE' && option.vers === 'NUMERISATION';
    const pagesQ = useResource<ScanPage[]>(s => askPages ? digitization!.pagesByElement(element.id, s) : Promise.resolve([]), 'transition-pages:' + element.id + ':' + askPages + ':' + epoch);
    const presentes = (pagesQ.data ?? []).filter(p => p.statut === 'PRESENTE');
    const blocking = option.blockers.filter(b => !b.overridable);
    const motifNeeded = option.motifRequis;
    const motifOk = motif.trim().length >= MOTIF_MIN;
    const danger = option.vers === 'ANNULE';
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (blocking.length || (motifNeeded && !motifOk)) return;
        setBusy(true); setError(null);
        try {
            await digitization!.command(`/elements/${element.id}/transitions`, { vers: option.vers, etapeAttendue: element.statut, motif: motifNeeded ? motif.trim() : undefined, pagesARescanner: askPages ? rescan : [] }, crypto.randomUUID(), 'POST');
            onDone(); onClose();
        } catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal title={transitionLabel(element.statut, option.vers)} subtitle={stageName(element.statut) + ' → ' + stageName(option.vers)} onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            {error ? <ErrorNotice error={error} /> : null}
            <Blockers blockers={option.blockers} />
            {element.statut === 'VALIDATION' && option.vers === 'TERMINE' && <Notice>{SEAL_NOTICE}</Notice>}
            {!option.peutAgir && <Notice tone="warning">Ce passage demande l’habilitation « {permissionNames[option.permission] ?? option.permission} ».</Notice>}
            {askPages && <fieldset className="wf-pages" disabled={busy}><legend>Pages à rescanner (facultatif)</legend>
                {pagesQ.loading ? <Busy /> : presentes.length ? presentes.map(p => <label key={p.id}><input type="checkbox" checked={rescan.includes(p.numeroPage)} onChange={e => setRescan(e.target.checked ? [...rescan, p.numeroPage] : rescan.filter(n => n !== p.numeroPage))} />Page {p.numeroPage}</label>) : <small>Aucune page numérisée à renvoyer.</small>}</fieldset>}
            {motifNeeded && <div className="form-grid"><Field label={`Motif (au moins ${MOTIF_MIN} caractères) *`} hint="Conservé dans le journal des étapes et dans l’audit" wide><textarea value={motif} onChange={e => setMotif(e.target.value)} required minLength={MOTIF_MIN} maxLength={2000} disabled={busy} /></Field></div>}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button>
                <button type="submit" className={'btn ' + (danger ? 'danger' : 'primary')} disabled={busy || !option.peutAgir || blocking.length > 0 || (motifNeeded && !motifOk)}>{option.blockers.some(b => b.overridable) ? 'Continuer malgré les écarts' : transitionLabel(element.statut, option.vers)}</button></footer>
        </form>
    </Modal>;
}

function History({ elementId, stamp }: { elementId: string; stamp: string }) {
    const { digitization, epoch } = useSession();
    const q = useResource<ElementTransition[]>(s => digitization!.elementTransitions(elementId, s), 'element-transitions:' + elementId + ':' + stamp + ':' + epoch);
    if (q.loading) return <Busy />;
    if (q.error) return <ErrorNotice error={q.error} onRetry={q.refresh} />;
    const list = [...(q.data ?? [])].reverse();
    return <ol className="wf-history">{list.map(t => <li key={t.id}>
        <time dateTime={t.createdAt}>{formatDate(t.createdAt)}</time>
        <span>{t.de ? <><Badge value={t.de} label={stageName(t.de)} /> → </> : 'Création : '}<Badge value={t.vers} label={stageName(t.vers)} />{t.automatique && <small className="wf-auto"> automatique</small>}</span>
        {t.motif && <p>{t.motif}</p>}
        {Array.isArray(t.contexte?.pagesARescanner) && <small>Pages à rescanner : {(t.contexte!.pagesARescanner as number[]).join(', ')}</small>}
        {sealingContextText(t.contexte) && <small className="wf-seal">{sealingContextText(t.contexte)}</small>}
        {Array.isArray(t.contexte?.derogations) && <small>Dérogation : {(t.contexte!.derogations as Array<{ message: string }>).map(d => d.message).join(' ')}</small>}
    </li>)}</ol>;
}

/** Étape de traitement d'un élément : où il en est, ce qui bloque le passage suivant, et les passages offerts (avancer, renvoyer, suspendre). */
export function ElementWorkflowPanel({ element, onChanged }: { element: DigitizationElement; onChanged: () => void }) {
    const { me, digitization, epoch } = useSession();
    const stamp = [element.id, element.statut, element.versionLock].join(':');
    const q = useResource<ElementWorkflow>(s => digitization!.elementWorkflow(element.id, s), 'element-workflow:' + stamp + ':' + epoch);
    const [chosen, setChosen] = useState<TransitionOption | null>(null);
    const [preselected, setPreselected] = useState<number[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const options = q.data?.options ?? [];
    const split = splitOptions(element.statut, options);
    const terminal = isTerminalStage(element.statut);
    const label = (option: TransitionOption) => transitionLabel(element.statut, option.vers);
    const button = (option: TransitionOption, className: string) => {
        const disabled = !option.peutAgir || option.blockers.some(b => !b.overridable);
        const why = !option.peutAgir ? 'Habilitation requise : ' + (permissionNames[option.permission] ?? option.permission) : disabled ? 'Conditions non remplies' : undefined;
        return <button key={option.vers} type="button" className={'btn small ' + className} disabled={disabled} title={why} onClick={() => setChosen(option)}>{label(option)}</button>;
    };
    const refresh = () => { q.refresh(); onChanged(); };
    const toScanning = element.statut === 'CONTROLE_QUALITE' ? split.renvois.find(o => o.vers === 'NUMERISATION' && o.peutAgir) : undefined;
    const sendBack = toScanning ? (pages: number[]) => { setPreselected(pages); setChosen(toScanning); } : undefined;
    return <section className="wf" aria-label="Étape de traitement">
        <div className="wf-head"><h4>Parcours de traitement</h4><span className="wf-state"><Badge value={element.statut} label={stageName(element.statut)} />{q.data?.depuis && !terminal ? <small>{sinceText(q.data.depuis)}</small> : null}</span></div>
        <Stepper element={element} />
        {element.statut === 'SUSPENDU' && <Notice tone="warning">Élément suspendu : il reprendra à l’étape « {element.etapeSuspension ? stageName(element.etapeSuspension).toLowerCase() : '—'} ».</Notice>}
        {element.statut === 'ANNULE' && <Notice tone="warning">Élément annulé : il n’avance plus et ses pages sont figées.</Notice>}
        {element.statut === 'TERMINE' && <Notice>Traitement terminé : l’élément est prêt pour versement et n’est plus modifiable.</Notice>}
        {q.data?.scellement && (element.statut === 'TERMINE' || element.statut === 'VALIDATION') && <p className="wf-seal" role="status">
            <Icon name={q.data.scellement.scellee ? 'check' : 'alert'} size={15} /> {sealingSummary(q.data.scellement)}
            {q.data.scellement.scellee && q.data.scellement.empreinte && <small> — empreinte {shortHash(q.data.scellement.empreinte)}{q.data.scellement.dateScellement ? ', ' + formatDate(q.data.scellement.dateScellement) : ''}</small>}</p>}
        {element.statut === 'VALIDATION' && !q.data?.scellement?.scellee && <small className="wf-note">{SEAL_NOTICE}</small>}
        {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : !terminal && <>
            {split.next && <Blockers blockers={split.next.blockers} />}
            <div className="wf-actions">
                {split.next && button(split.next, 'primary')}
                {split.resume && button(split.resume, 'primary')}
                {split.skips.map(o => button(o, 'secondary'))}
                {split.renvois.map(o => button(o, 'secondary'))}
                {split.others.map(o => button(o, o.vers === 'ANNULE' ? 'danger-outline' : 'secondary'))}
            </div>
            {!canAdvance(me) && <small className="wf-note">Vous consultez cet élément : faire avancer une étape demande l’habilitation correspondante.</small>}
        </>}
        <button type="button" className="text-link wf-history-toggle" aria-expanded={showHistory} onClick={() => setShowHistory(v => !v)}>{showHistory ? 'Masquer le journal des étapes' : 'Journal des étapes'}</button>
        {(element.statut === 'NUMERISATION' || element.statut === 'CONTROLE_QUALITE') && <QualityPanel element={element} onSendBack={sendBack} />}
        {showHistory && <History elementId={element.id} stamp={stamp} />}
        {chosen && <TransitionDialog element={element} option={chosen} initialRescan={preselected} onClose={() => { setChosen(null); setPreselected([]); }} onDone={refresh} />}
    </section>;
}
