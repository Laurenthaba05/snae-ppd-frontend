import React, { useEffect, useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { can } from '../core/policy';
import { ANOMALY_LABELS, anomalyLabel, emptyRun, progressPercent, runVerdict, verifyWholeChain, type ChainRun } from '../core/auditChain';
import { ErrorNotice, Notice, formatDate } from './components';

/**
 * La vérification de la chaîne du journal d'audit : le serveur relit tout le journal (numéros consécutifs, empreinte de chaque événement, chaînage, cohérence avec les colonnes, tête de
 * chaîne) par tranches, l'écran les enchaîne jusqu'à la tête. Elle s'inscrit elle-même au journal. Réservée à l'habilitation de vérification, qui n'est attribuée à personne d'office.
 */
export function AuditChainPanel() {
    const { audit, me } = useSession();
    const [run, setRun] = useState<ChainRun | null>(null);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const controller = useRef<AbortController | null>(null);
    useEffect(() => () => controller.current?.abort(), []);
    if (!can(me, 'AUDIT_VERIFY', {})) return null;

    const start = async () => {
        const abort = new AbortController();
        controller.current = abort;
        setRun(emptyRun()); setError(null); setRunning(true);
        try { setRun(await verifyWholeChain((from, count, signal) => audit!.verifyChain(from, count, signal), setRun, abort.signal)); }
        catch (e) { if (!abort.signal.aborted) setError(e); }
        finally { setRunning(false); }
    };
    const verdict = run ? runVerdict(run, running) : null;
    const percent = run ? progressPercent(run) : 0;

    return <section className="panel panel-padding audit-chain" aria-label="Intégrité du journal">
        <div className="section-heading">
            <h2>Intégrité du journal</h2>
            <div className="actions">
                <button type="button" className="btn small primary" onClick={() => void start()} disabled={running}>Vérifier la chaîne</button>
                {running && <button type="button" className="btn small secondary" onClick={() => controller.current?.abort()}>Interrompre</button>}
            </div>
        </div>
        <p><small>Relit le journal depuis son premier événement : numéros consécutifs, empreinte de chaque événement, chaînage, cohérence avec les colonnes, tête de chaîne. La vérification s’inscrit elle-même au journal.</small></p>
        {error ? <ErrorNotice error={error} /> : null}
        {run && <>
            <p role="status">{running || !run.complete ? (run.headSequence ? `${run.checked} événement(s) relu(s) sur ${run.headSequence} (${percent} %)` : `${run.checked} événement(s) relu(s)`) : `${run.checked} événement(s) relu(s)`}</p>
            {verdict === 'INTACTE' && <Notice tone="success">{`Aucune anomalie : les ${run.checked} événements relus forment une chaîne cohérente jusqu’à la tête (événement n° ${run.headSequence}).`}</Notice>}
            {verdict === 'ANOMALIES' && <Notice tone="warning">{`${run.anomalyCount} anomalie(s) relevée(s) : le journal n’est pas cohérent. Ne vous y fiez pas avant d’en avoir cherché la cause.`}</Notice>}
            {verdict === 'INCOMPLETE' && <Notice tone="warning">{run.lastVerifiedSequence != null ? `Relecture interrompue : la chaîne n’a pas été relue jusqu’à la tête (jusqu’à l’événement n° ${run.lastVerifiedSequence}).` : 'Relecture interrompue : la chaîne n’a pas été relue jusqu’à la tête.'}</Notice>}
            {run.legacy && <p><small>{run.legacy.note}</small></p>}
            {run.verifiedAt && !running && <p><small>{`Terminé le ${formatDate(run.verifiedAt)} · ${run.windows} tranche(s) · ${Math.round(run.durationMillis / 1000)} s de relecture côté serveur.`}</small></p>}
            {run.anomalies.length > 0 && <div className="table-scroll"><table><thead><tr><th>Nature</th><th>Événement n°</th><th>Détail</th></tr></thead>
                <tbody>{run.anomalies.map((a, i) => <tr key={i}><td>{anomalyLabel(a.kind)}</td><td>{a.sequence ?? '—'}</td><td>{a.detail}</td></tr>)}</tbody></table>
                {run.anomalyCount > run.anomalies.length && <small>{`Les ${run.anomalies.length} premières anomalies sur ${run.anomalyCount} sont affichées.`}</small>}</div>}
        </>}
        <details><summary>Que signifient les anomalies ?</summary>
            <dl>{Object.entries(ANOMALY_LABELS).filter(([k]) => !k.startsWith('LEGACY_')).map(([k, label]) => <div key={k}><dt>{label}</dt><dd>{ANOMALY_HELP[k]}</dd></div>)}</dl>
            <p><small>Ce contrôle ne voit pas une réécriture cohérente de toute la suite de la chaîne à partir d’un point : relevez régulièrement la tête de chaîne hors de la base et comparez-la plus tard. Un script SQL indépendant (outils/verifier-journal-audit.sql) refait ce contrôle sans le code de l’application.</small></p>
        </details>
    </section>;
}

const ANOMALY_HELP: Record<string, string> = {
    GAP: 'Des numéros manquent : des événements ont été supprimés.',
    HASH_MISMATCH: 'L’empreinte enregistrée n’est pas celle du contenu : l’événement a été modifié après coup.',
    CHAIN_BREAK: 'L’événement ne prolonge pas celui qui le précède : un événement a été remplacé, retiré ou réécrit.',
    PAYLOAD_MISSING: 'Le contenu dont l’empreinte a été calculée n’est plus là.',
    PAYLOAD_UNREADABLE: 'Le contenu n’est plus lisible.',
    PAYLOAD_MISMATCH: 'Le contenu signé ne dit pas ce que disent l’identifiant, le numéro ou l’empreinte précédente de la ligne.',
    COLUMN_MISMATCH: 'Une colonne affichée (action, acteur, valeurs…) diffère du contenu signé.',
    HEAD_MISMATCH: 'La tête de chaîne ne désigne pas le dernier événement.',
    GENESIS_MISMATCH: 'Le premier événement ne prolonge pas l’historique antérieur.'
};
