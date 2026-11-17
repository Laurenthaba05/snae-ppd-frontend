import React, { useEffect, useState } from 'react';
import { useSession } from '../auth/session';
import { useWorkspace } from './workspace';
import { Busy, ErrorNotice, Field, Notice, useResource } from './components';
import { CommandDialog } from './CommandDialog';
import { can } from '../core/policy';
import { MODE_EXPLANATION, MODE_LABEL, modeLabel, policyCommand, sourceLabel } from '../core/ocrIndexing';
import type { OcrIndexingMode, OcrIndexingPolicy } from '../core/types';

function PolicyDialog({ policy, onClose, onSuccess }: { policy: OcrIndexingPolicy; onClose: () => void; onSuccess: () => void }) {
    const { search } = useSession();
    const [mode, setMode] = useState<string>(policy.explicit ?? policy.effective);
    const [motif, setMotif] = useState('');
    const known = mode === 'VALIDATION_SEULE' || mode === 'FIABLE_SIGNALE' ? MODE_EXPLANATION[mode as OcrIndexingMode] : 'L’institution suit la politique du niveau national (ou le réglage par défaut du serveur).';
    return <CommandDialog title="Politique d’indexation du texte reconnu" description="Décidez si le texte reconnu par le moteur et jugé fiable entre dans l’index de recherche avant sa validation. Un motif est consigné au journal."
        path="/ocr-indexing-policy" method="PUT" api={search!} build={() => policyCommand(policy.institutionId, mode, motif, policy.version)} onClose={onClose} onSuccess={onSuccess}>
        <Field label="Politique *" wide>
            <select value={mode} onChange={ev => setMode(ev.target.value)}>
                <option value="VALIDATION_SEULE">{MODE_LABEL.VALIDATION_SEULE}</option>
                <option value="FIABLE_SIGNALE">{MODE_LABEL.FIABLE_SIGNALE}</option>
                {policy.institutionId && <option value="HERITE">Hériter du niveau national</option>}
            </select>
        </Field>
        <Notice>{known}</Notice>
        <Notice tone="warning">Les seuils de fiabilité n’ont été étalonnés que sur des pages de test : vérifiez-les sur vos scans avant d’activer cette indexation.</Notice>
        <Field label="Motif *" wide><textarea required maxLength={2000} value={motif} onChange={ev => setMotif(ev.target.value)} /></Field>
    </CommandDialog>;
}

/**
 * La politique d'indexation du texte reconnu, sur l'écran « OCR et indexation » : ce que décide la portée de travail (l'institution du bandeau, ou le niveau national), d'où cela vient, et de
 * quoi la modifier pour qui en a le droit. Après un changement, la réindexation des documents touchés se suit ici.
 */
export function OcrIndexingPolicyPanel() {
    const { me, search, epoch } = useSession();
    const { scope } = useWorkspace();
    const institutionId = scope.institutionId ?? null;
    const target = institutionId ? { institutionId } : {};
    const mayDecide = can(me, 'SEARCH_OCR_POLICY_MANAGE', target);
    const mayRead = mayDecide || can(me, 'DIGITIZATION_READ', target);
    const [editing, setEditing] = useState(false);
    const q = useResource<OcrIndexingPolicy | null>(signal => search && mayRead ? search.ocrIndexingPolicy(institutionId, signal) : Promise.resolve(null), JSON.stringify(['ocr-indexing-policy', institutionId, epoch, mayRead]));
    const running = q.data?.reprojection?.state === 'RUNNING';
    useEffect(() => { if (!running) return; const timer = window.setInterval(q.refresh, 3000); return () => window.clearInterval(timer); }, [running]); // eslint-disable-line react-hooks/exhaustive-deps
    if (!search || !mayRead) return null;
    if (q.loading && !q.data) return <div className="panel panel-padding"><Busy /></div>;
    if (q.error && !q.data) return <div className="panel panel-padding"><ErrorNotice error={q.error} onRetry={q.refresh} /></div>;
    const policy = q.data;
    if (!policy) return null;
    const run = policy.reprojection;
    return <section className="panel panel-padding ocr-policy" aria-label="Indexation du texte reconnu">
        <div className="section-heading">
            <h3>Indexation du texte reconnu</h3>
            {mayDecide && <button type="button" className="btn small secondary" onClick={() => setEditing(true)}>Modifier la politique</button>}
        </div>
        <p><strong>{modeLabel(policy.effective)}</strong> <small className="cell-sub">({sourceLabel(policy)})</small></p>
        <p className="subtle">{MODE_EXPLANATION[policy.effective]}</p>
        {run && run.state === 'RUNNING' && <p role="status">Réindexation en cours : {run.done} sur {run.total}</p>}
        {run && run.state === 'DONE' && <p role="status">Réindexation terminée : {run.done}{run.failures > 0 && <> · en échec : {run.failures}</>}</p>}
        {run && run.state === 'FAILED' && <Notice tone="warning">Réindexation interrompue après {run.done} sur {run.total} : lancez une réindexation complète.</Notice>}
        {editing && <PolicyDialog policy={policy} onClose={() => setEditing(false)} onSuccess={() => { setEditing(false); q.refresh(); }} />}
    </section>;
}
