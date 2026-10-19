import React from 'react';
import { useSession } from '../auth/session';
import { findOcrSearchTarget } from './findOcrSearchTarget';
import { FileContentDialog } from './FileContentDialog';
import { Busy, ErrorNotice, Modal, Notice, useResource } from './components';
import { navigate } from './navigation';

export function SearchOcrPreview({ documentId, title, query, onClose }: {
    documentId: string; title: string; query: string; onClose: () => void;
}) {
    const { records, digitization, epoch } = useSession();
    const q = useResource(signal => findOcrSearchTarget(records!, digitization!, documentId, query, signal),
        'search-ocr:' + JSON.stringify([documentId, query, epoch]));
    if (!q.loading && !q.error && q.data) return <FileContentDialog file={q.data.file} preview ocrFocus={q.data.focus} documentTitle={title} onClose={onClose}/>;
    return <Modal title="Mot recherché dans le document" subtitle={title} onClose={onClose}>
        <div className="panel-padding">{q.loading ? <Busy label="Localisation du mot dans les pages OCR validées…"/> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh}/> :
            <Notice>Aucune position correspondant aux mots exacts de la recherche dans les PDF consultables de la dernière version. Le résultat peut provenir de la notice, d’une variante du mot ou d’un texte sans positions OCR.</Notice>}</div>
        <footer className="modal-footer"><button className="btn secondary" onClick={onClose}>Fermer</button><button className="btn primary" onClick={() => { onClose(); navigate('/app/documents/' + documentId); }}>Ouvrir la notice</button></footer>
    </Modal>;
}
