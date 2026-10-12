import React, { useEffect, useState } from 'react';
import { useSession } from '../auth/session';
import { ApiError } from '../core/http';
import { Busy, ErrorNotice, Modal, Notice, useResource } from './components';

/**
 * Copie de consultation d'une page (JPEG d'affichage) : consultable avant la validation du maître, c'est ainsi que le contrôle qualité voit
 * les pages. Les octets passent par l'API avec les droits de la personne ; rien n'est mis en cache par le navigateur au-delà de la fenêtre.
 * Un fichier de plusieurs images (TIFF) se parcourt image après image : [images] est leur nombre (1 par défaut).
 */
export function PageViewerDialog({ fichierId, title, images = 1, onClose }: { fichierId: string; title: string; images?: number; onClose: () => void }) {
    const { records, epoch } = useSession();
    const total = Math.max(1, Math.trunc(images));
    const [frame, setFrame] = useState(1);
    const q = useResource<Blob>(signal => records!.fileDerivative(fichierId, 'consultation', signal, frame), 'page-copy:' + fichierId + ':' + frame + ':' + epoch);
    const [url, setUrl] = useState('');
    useEffect(() => {
        if (!q.data) return;
        const value = URL.createObjectURL(q.data);
        setUrl(value);
        return () => URL.revokeObjectURL(value);
    }, [q.data]);
    const missing = q.error instanceof ApiError && q.error.status === 404;
    const caption = total > 1 ? `${title} · image ${frame} sur ${total}` : title;
    return <Modal title="Copie de consultation" subtitle={caption} onClose={onClose} wide>
        <div className="panel-padding file-content">
            {total > 1 && <div className="page-viewer-nav" role="group" aria-label="Images du fichier">
                <button type="button" className="btn small secondary" disabled={frame <= 1} onClick={() => { setUrl(''); setFrame(f => f - 1); }} aria-label="Image précédente">‹</button>
                <span aria-live="polite">Image {frame} sur {total}</span>
                <button type="button" className="btn small secondary" disabled={frame >= total} onClick={() => { setUrl(''); setFrame(f => f + 1); }} aria-label="Image suivante">›</button>
            </div>}
            {q.loading ? <Busy label="Récupération de la copie…" />
                : missing ? <Notice tone="warning">Aucune copie de consultation n’est disponible pour cette page. Elle est générée après l’import, ou à la demande depuis la fiche de l’élément.</Notice>
                : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} />
                : url ? <img className="file-preview-image" src={url} alt={caption} /> : <Busy />}
        </div>
        <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose}>Fermer</button></footer>
    </Modal>;
}
