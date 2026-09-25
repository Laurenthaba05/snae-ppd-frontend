import React, { useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { IntentKey } from '../core/validation';
import { ApiError } from '../core/http';
import { Modal, ErrorNotice, Notice } from './components';
import { Icon } from './icons';
export function CommandDialog({ title, description, path, method = 'POST', build, children, onClose, onSuccess, label = 'Confirmer', danger = false }: {
    title: string;
    description: string;
    path: string;
    method?: 'POST' | 'PUT';
    build: () => unknown;
    children: React.ReactNode;
    onClose: () => void;
    onSuccess: (data: any) => void;
    label?: string;
    danger?: boolean;
}) {
    const { api, refresh } = useSession();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const [preview, setPreview] = useState<unknown | null>(null);
    const [finished, setFinished] = useState(false);
    const key = useRef(new IntentKey());
    const stale = error instanceof ApiError && ['IAM_STALE_VERSION', 'OPTIMISTIC_LOCK_CONFLICT'].includes(error.code);
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy || finished || stale)
            return;
        setError(null);
        try {
            const body = preview === null ? build() : preview;
            if (preview === null) {
                setPreview(body);
                return;
            }
            setBusy(true);
            const idempotency = key.current.forRequest(method, path, body);
            const data = await api!.command(path, body, idempotency, method);
            setFinished(true);
            onSuccess(data);
            void refresh();
        }
        catch (err) {
            setError(err);
        }
        finally {
            setBusy(false);
        }
    };
    return <Modal title={title} subtitle={description} onClose={onClose} locked={busy} wide><form onSubmit={submit}>{preview === null ? <div className="form-grid">{children}</div> : <div className="command-review"><Notice tone={danger ? 'warning' : 'info'}>Relisez cette décision. Le serveur vérifie vos droits, l’état courant et la version avant toute écriture.</Notice><pre>{JSON.stringify(preview, null, 2)}</pre><p>Une réponse reçue après rejeu est un reçu historique. La fiche sera relue après succès.</p></div>}{Boolean(error) && <ErrorNotice error={error}/>}<footer className="modal-footer"><button type="button" className="btn secondary" disabled={busy} onClick={preview !== null && !stale ? () => setPreview(null) : onClose}>{stale ? 'Fermer et relire' : preview !== null ? 'Revenir au formulaire' : 'Annuler'}</button><button type="submit" className={'btn ' + (danger ? 'danger' : 'primary')} disabled={busy || stale || finished}>{busy ? <span className="spinner"/> : <Icon name={preview === null ? 'arrow' : 'check'} size={17}/>} {preview === null ? 'Vérifier la commande' : label}</button></footer></form></Modal>;
}
