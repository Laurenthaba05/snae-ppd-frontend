import React, { useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { IntentKey } from '../core/validation';
import { isWorkingStage, stageName, transitionLabel, SEAL_NOTICE } from '../core/workflow';
import type { DigitizationElementStatus, ElementWorkflow, LotAdvance, LotSummary, ScanLot } from '../core/types';
import { Busy, Empty, ErrorNotice, Field, Modal, Notice, useResource } from './components';

export function LotAdvanceDialog({ lot, onClose, onDone }: { lot: ScanLot; onClose: () => void; onDone: () => void }) {
    const { digitization, epoch } = useSession();
    const q = useResource<LotSummary>(signal => digitization!.lotSummary(lot.id, signal), 'advance-lot-summary:' + lot.id + ':' + epoch);
    const [source, setSource] = useState<DigitizationElementStatus | ''>('');
    const members = (q.data?.items ?? []).filter(item => isWorkingStage(item.statut));
    const stages = [...new Set(members.map(item => item.statut))];
    const from = source && stages.includes(source) ? source : stages[0];
    const sample = members.find(item => item.statut === from);
    const options = useResource<ElementWorkflow | null>(signal => sample ? digitization!.elementWorkflow(sample.elementId, signal) : Promise.resolve(null), 'advance-lot-options:' + (sample?.elementId ?? '') + ':' + from + ':' + epoch);
    const choices = (options.data?.options ?? []).filter(option => option.peutAgir && option.vers !== 'SUSPENDU');
    const [target, setTarget] = useState<DigitizationElementStatus | ''>('');
    const chosen = choices.find(option => option.vers === target);
    const [reason, setReason] = useState('');
    const [override, setOverride] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const [result, setResult] = useState<LotAdvance | null>(null);
    const intent = useRef(new IntentKey());
    const pending = useRef(false);
    const requiredReason = chosen?.renvoi || target === 'ANNULE' || (from === 'NUMERISATION' && target === 'CONTROLE_QUALITE');
    const withReason = requiredReason || override;
    const ready = Boolean(from && chosen && !q.loading && !options.loading && !q.error && !options.error && (!withReason || reason.trim().length >= 10));
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!ready || !from || !chosen || pending.current || result) return;
        pending.current = true; setBusy(true); setError(null);
        const body = { de: from, vers: chosen.vers, motif: withReason ? reason.trim() : null };
        const path = '/digitization/lots/' + lot.id + '/advance';
        try {
            const response = await digitization!.advanceLot(lot.id, body, intent.current.forRequest('POST', path, body));
            setResult(response); intent.current.clear(); onDone();
        } catch (e) { setError(e); }
        finally { pending.current = false; setBusy(false); }
    };
    return <Modal title="Faire avancer le lot" subtitle={lot.code + (lot.nom ? ' · ' + lot.nom : '')} onClose={onClose} locked={busy} wide>
        {result ? <div className="panel-padding">
            <Notice>{result.appliques} élément(s) traité(s), {result.ignores} laissé(s) à leur étape.</Notice>
            <ul>{result.resultats.map(item => <li key={item.elementId}><strong>{item.description || 'Élément du lot'}</strong> — {item.applique ? 'Passage effectué' : 'Non modifié'}{item.blockers.length > 0 && <ul>{item.blockers.map((blocker, index) => <li key={blocker.code + index}>{blocker.message}</li>)}</ul>}</li>)}</ul>
        </div> : <form id="lot-advance-form" onSubmit={submit}>
            {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : !stages.length ? <Empty title="Aucun élément à faire avancer" description="Ce lot ne contient aucun élément à une étape de travail." /> : <div className="form-grid">
                <Field label="Étape de départ"><select value={from} onChange={e => { setSource(e.target.value as DigitizationElementStatus); setTarget(''); setOverride(false); setReason(''); }} disabled={busy}>{stages.map(stage => <option key={stage} value={stage}>{stageName(stage)} ({members.filter(item => item.statut === stage).length})</option>)}</select></Field>
                {options.loading ? <Busy /> : options.error ? <ErrorNotice error={options.error} onRetry={options.refresh} /> : <Field label="Passage à appliquer"><select value={target} onChange={e => { setTarget(e.target.value as DigitizationElementStatus); setOverride(false); setReason(''); }} disabled={busy}><option value="">Choisir un passage</option>{choices.map(option => <option key={option.vers} value={option.vers}>{transitionLabel(from!, option.vers)}</option>)}</select></Field>}
                <p className="span2">{members.filter(item => item.statut === from).length} élément(s) à cette étape. Le serveur vérifie chaque élément et laisse les éléments bloqués à leur étape. Le résultat indique lesquels ont été traités.</p>
                {target === 'TERMINE' && <div className="span2"><Notice tone="warning">{SEAL_NOTICE}</Notice></div>}
                {chosen && !requiredReason && <label className="span2"><input type="checkbox" checked={override} onChange={e => setOverride(e.target.checked)} disabled={busy} /> Autoriser les écarts dérogeables avec un motif commun</label>}
                {withReason && <><div className="span2"><Notice tone="warning">Le motif s’applique à tous les éléments concernés et peut autoriser les écarts dérogeables. Les blocages obligatoires restent appliqués.</Notice></div><Field label="Motif commun (10 caractères minimum)" wide><textarea value={reason} onChange={e => setReason(e.target.value)} required minLength={10} maxLength={2000} disabled={busy} /></Field></>}
            </div>}
            {error ? <ErrorNotice error={error} /> : null}
        </form>}
        <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Fermer</button>{!result && <button type="submit" form="lot-advance-form" className={'btn ' + (target === 'ANNULE' ? 'danger' : 'primary')} disabled={busy || !ready}>Appliquer au lot</button>}</footer>
    </Modal>;
}
