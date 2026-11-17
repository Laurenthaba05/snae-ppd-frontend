import { useCallback, useEffect, useState } from 'react';
import { DocumentPaymentsApi, type ReaderDocumentPaymentsPage } from '../api/documentPayments';

type Kind = 'alerts' | 'purchased' | 'history';
/** Refresh visible reader lists without discarding an open renewal form. */
export function useReaderPayments(client: DocumentPaymentsApi, reader: string, kind: Kind, page: number, status = '', documentId = '') {
    const key = `${reader}:${kind}:${page}:${status}:${documentId}`;
    const [state, setState] = useState<{ key: string; data?: ReaderDocumentPaymentsPage; error?: unknown; loading: boolean }>({key, loading:true});
    const [revision, setRevision] = useState(0);
    const refresh = useCallback(() => setRevision(n => n + 1), []);
    useEffect(() => {
        let alive = true;
        let controller: AbortController | undefined;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let inFlight = false;
        async function read() {
            if (inFlight || !alive) return;
            inFlight = true;
            clearTimeout(timer);
            controller = new AbortController();
            let delay = 60_000;
            setState(previous => ({key, data:previous.key === key ? previous.data : undefined, loading:previous.key !== key || !previous.data}));
            try {
                const data = await (documentId ? client.purchasedDocument(documentId, controller.signal) : kind === 'alerts' ? client.alerts(page, controller.signal) : kind === 'purchased' ? client.purchased(page, controller.signal) : client.history(page, status || undefined, controller.signal));
                if (!alive) return;
                setState({key, data, loading:false});
                // Use the server's evaluation instant, never the workstation's wall clock.
                const now = Date.parse(data.evaluatedAt);
                for (const item of data.items) if (item.canRead && item.validUntil && Number.isFinite(now)) {
                    const left = Date.parse(item.validUntil) - now;
                    if (left >= 0) delay = Math.min(delay, Math.max(1000, left + 100));
                }
            } catch (error) { if (alive) setState({key, error, loading:false}); }
            finally {
                inFlight = false;
                if (alive && kind !== 'history') timer = setTimeout(() => { if (document.visibilityState === 'visible') void read(); }, delay);
            }
        }
        const resume = () => { if (document.visibilityState === 'visible') void read(); };
        void read();
        if (kind !== 'history') { window.addEventListener('focus', resume); document.addEventListener('visibilitychange', resume); }
        return () => { alive = false; controller?.abort(); clearTimeout(timer); window.removeEventListener('focus', resume); document.removeEventListener('visibilitychange', resume); };
    }, [client, key, kind, page, status, documentId, revision]);
    return {...(state.key === key ? state : {loading:true, data:undefined, error:undefined}), refresh};
}
