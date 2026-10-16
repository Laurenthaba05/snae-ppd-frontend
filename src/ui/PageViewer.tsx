import React, { useEffect, useState } from 'react';
import { useSession } from '../auth/session';
import { ApiError } from '../core/http';
import { Busy, ErrorNotice, Modal, Notice, useResource } from './components';
import { IiifZoomViewer } from './IiifViewer';

/**
 * Copie de consultation d'une page (JPEG d'affichage) : consultable avant la validation du maître, c'est ainsi que le contrôle qualité voit
 * les pages. Les octets passent par l'API avec les droits de la personne ; rien n'est mis en cache par le navigateur au-delà de la fenêtre.
 * Un fichier de plusieurs images (TIFF) se parcourt image après image : [images] est leur nombre (1 par défaut).
 * La visionneuse zoomable (API d'images IIIF) est employée d'abord ; si le serveur ne la sert pas, l'image entière s'affiche telle quelle.
 */
export function PageViewerDialog({ fichierId, title, images = 1, onClose }: { fichierId: string; title: string; images?: number; onClose: () => void }) {
    const total = Math.max(1, Math.trunc(images));
    const [frame, setFrame] = useState(1);
    const [plain, setPlain] = useState(false);
    const caption = total > 1 ? `${title} · image ${frame} sur ${total}` : title;
    return <Modal title="Copie de consultation" subtitle={caption} onClose={onClose} wide>
        <div className="panel-padding file-content">
            {total > 1 && <div className="page-viewer-nav" role="group" aria-label="Images du fichier">
                <button type="button" className="btn small secondary" disabled={frame <= 1} onClick={() => setFrame(f => f - 1)} aria-label="Image précédente">‹</button>
                <span aria-live="polite">Image {frame} sur {total}</span>
                <button type="button" className="btn small secondary" disabled={frame >= total} onClick={() => setFrame(f => f + 1)} aria-label="Image suivante">›</button>
            </div>}
            {plain ? <PlainCopy fichierId={fichierId} frame={frame} caption={caption} />
                : <IiifZoomViewer fileId={fichierId} frame={frame} alt={caption} onUnavailable={() => setPlain(true)} />}
        </div>
        <footer className="modal-footer"><button type="button" className="btn secondary" onClick={onClose}>Fermer</button></footer>
    </Modal>;
}

/** L'image entière, sans zoom : ce qui s'affichait avant la visionneuse, et ce qui reste si le service d'images est désactivé. */
function PlainCopy({ fichierId, frame, caption }: { fichierId: string; frame: number; caption: string }) {
    const { records, epoch } = useSession();
    const q = useResource<Blob>(signal => records!.fileDerivative(fichierId, 'consultation', signal, frame), 'page-copy:' + fichierId + ':' + frame + ':' + epoch);
    const [url, setUrl] = useState('');
    useEffect(() => {
        if (!q.data) return;
        const value = URL.createObjectURL(q.data);
        setUrl(value);
        return () => { URL.revokeObjectURL(value); setUrl(''); };
    }, [q.data]);
    const missing = q.error instanceof ApiError && q.error.status === 404;
    return q.loading ? <Busy label="Récupération de la copie…" />
        : missing ? <Notice tone="warning">Aucune copie de consultation n’est disponible pour cette page. Elle est générée après l’import, ou à la demande depuis la fiche de l’élément.</Notice>
        : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} />
        : url ? <img className="file-preview-image" src={url} alt={caption} /> : <Busy />;
}
