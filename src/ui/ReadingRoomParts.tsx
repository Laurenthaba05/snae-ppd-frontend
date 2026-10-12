import React, { useRef, useState } from 'react';
import { commandKey } from '../api/archives';
import { useSession } from '../auth/session';
import { Busy, ErrorNotice, Field, Modal, useResource } from './components';
import { MIN_REASON, readerName, type Reader } from '../core/readingRoom';

/** Une action du guichet : une seule à la fois, la même clé d'idempotence tant que l'intention est la même (une reprise après coupure ne la double pas). */
export function useAction() {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const intention = useRef<ReturnType<typeof commandKey> | null>(null);
    const run = async <T,>(payload: unknown, call: (key: string) => Promise<T>): Promise<T | undefined> => {
        if (busy) return undefined;
        setBusy(true); setError(null);
        intention.current = commandKey(intention.current, payload);
        try {
            const result = await call(intention.current.key);
            intention.current = null;
            return result;
        } catch (e) { setError(e); return undefined; } finally { setBusy(false); }
    };
    return { busy, error, run, clearError: () => setError(null) };
}

/** Un motif obligatoire (annulation, refus, suspension), d'au moins MIN_REASON caractères comme l'exige le serveur. */
export function ReasonPrompt({ title, subtitle, hint, confirm, danger = true, onClose, onSubmit }: {
    title: string; subtitle?: string; hint?: string; confirm: string; danger?: boolean; onClose: () => void; onSubmit: (reason: string, key: string) => Promise<unknown>;
}) {
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const intention = useRef<ReturnType<typeof commandKey> | null>(null);
    const valid = reason.trim().length >= MIN_REASON;
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (busy || !valid) return;
        setBusy(true); setError(null);
        intention.current = commandKey(intention.current, { reason: reason.trim() });
        try { await onSubmit(reason.trim(), intention.current.key); onClose(); } catch (e) { setError(e); } finally { setBusy(false); }
    };
    return <Modal title={title} subtitle={subtitle} onClose={onClose} locked={busy}>
        <form onSubmit={submit}>
            <Field label="Motif *" hint={hint ?? `Au moins ${MIN_REASON} caractères.`} wide><textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} maxLength={500} disabled={busy} required /></Field>
            {error ? <ErrorNotice error={error} /> : null}
            <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Renoncer</button>
                <button type="submit" className={`btn ${danger ? 'danger' : 'primary'}`} disabled={busy || !valid}>{confirm}</button></footer>
        </form>
    </Modal>;
}

/** Le choix d'un lecteur par son nom ou son numéro : jamais par un identifiant. */
export function ReaderPicker({ institutionId, value, onChange, disabled = false, onlyActive = true, label = 'Lecteur *' }: {
    institutionId: string; value: string; onChange: (id: string, reader: Reader | null) => void; disabled?: boolean; onlyActive?: boolean; label?: string;
}) {
    const { readingRoom, epoch } = useSession();
    const [text, setText] = useState('');
    const q = useResource<Reader[]>(signal => readingRoom!.readers(institutionId, { q: text.trim() || null, status: onlyActive ? 'ACTIF' : null }, signal), `rr-readers-pick:${institutionId}:${onlyActive}:${text}:${epoch}`);
    const list = q.data ?? [];
    return <Field label={label} wide hint="Cherchez par nom, prénom ou numéro de carte.">
        <div className="reference-picker">
            <input aria-label="Chercher un lecteur" placeholder="Nom, prénom ou numéro…" value={text} onChange={e => setText(e.target.value)} disabled={disabled} />
            {q.loading && !q.data ? <Busy label="Recherche…" /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} />
                : <select aria-label="Lecteur" value={value} onChange={e => onChange(e.target.value, list.find(r => r.id === e.target.value) ?? null)} disabled={disabled}>
                    <option value="">Choisir un lecteur…</option>
                    {list.map(r => <option key={r.id} value={r.id}>{readerName(r)} — {r.number}{r.cardState === 'EXPIREE' ? ' (carte expirée)' : r.cardState === 'SUSPENDUE' ? ' (suspendue)' : ''}</option>)}
                </select>}
        </div>
    </Field>;
}

/** Enregistre un fichier produit par le serveur (tableur) sans passer par une adresse : le contenu reste dans le navigateur. */
export function saveBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = fileName; link.rel = 'noopener';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
