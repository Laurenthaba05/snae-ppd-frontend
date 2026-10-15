import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { ErrorNotice, Notice } from './components';

interface BatchResult { examined: number; changed: number; hasMore: boolean }

/**
 * Fait passer à « échue » les échéances planifiées dont la date est arrivée (ou à « suspendue » si un gel légal les retient).
 * Aucune tâche planifiée ne le fait : sans ce geste, une échéance reste « planifiée » après sa date et aucune décision ne peut être proposée.
 */
export function RefreshDueButton({ institutionId, departmentId, onDone }: { institutionId: string; departmentId?: string | null; onDone?: () => void }) {
    const { retention } = useSession();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const [result, setResult] = useState<BatchResult | null>(null);
    const run = async () => {
        if (busy) return;
        setBusy(true);
        setError(null);
        setResult(null);
        try {
            const r = await retention!.command<BatchResult>('/events/refresh-due', { institutionId, departmentId: departmentId ?? null, limit: 100 }, crypto.randomUUID(), 'POST');
            setResult(r);
            onDone?.();
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    };
    return <div className="panel-padding">
        <button type="button" className="btn small secondary" onClick={run} disabled={busy}>{busy ? 'Actualisation…' : 'Actualiser les échéances'}</button>
        {result && <Notice tone="info">{result.changed === 0 ? 'Aucune échéance nouvelle : toutes celles dont la date est passée sont déjà à jour.'
            : `${result.changed} échéance${result.changed > 1 ? 's' : ''} arrivée${result.changed > 1 ? 's' : ''} à terme${result.hasMore ? ' ; il en reste, relancez l’actualisation.' : '.'}`}</Notice>}
        {Boolean(error) && <ErrorNotice error={error} />}
    </div>;
}
