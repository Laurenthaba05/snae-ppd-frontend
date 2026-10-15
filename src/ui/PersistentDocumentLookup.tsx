import React, { useEffect, useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { uuid } from '../core/validation';
import { ErrorNotice, Field } from './components';
import { navigate } from './navigation';

export function PersistentDocumentLookup() {
    const { records } = useSession();
    const [pid, setPid] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const pending = useRef<AbortController | null>(null);
    useEffect(() => () => pending.current?.abort(), []);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (pending.current || !pid.trim()) return;
        const controller = new AbortController();
        pending.current = controller; setBusy(true); setError(null);
        try {
            const document = await records!.documentByPersistentId(pid.trim(), controller.signal);
            if (!controller.signal.aborted) navigate('/app/documents/' + uuid(document.id));
        } catch (e) { if (!controller.signal.aborted) setError(e); }
        finally { if (!controller.signal.aborted) { pending.current = null; setBusy(false); } }
    };
    return <details className="panel panel-padding"><summary>Ouvrir par identifiant pérenne</summary>
        <form onSubmit={submit}><Field label="Identifiant pérenne du document"><input value={pid} onChange={e => setPid(e.target.value)} required maxLength={150} placeholder="snae-…" disabled={busy} /></Field>
            <button type="submit" className="btn secondary" disabled={busy || !pid.trim()}>Ouvrir la notice</button>
            {error ? <ErrorNotice error={error} /> : null}
        </form>
    </details>;
}
