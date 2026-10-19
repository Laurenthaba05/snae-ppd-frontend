import type { OcrSearchFocus } from '../core/ocrSearch';
import React, { lazy, Suspense, useEffect, useState } from 'react';
import { useSession } from '../auth/session';
import type { DocumentFile } from '../core/types';
import { checkFileContent, downloadFilename, previewKind } from '../core/file-content';
import { Busy, ErrorNotice, Modal, Notice, useResource } from './components';

const DocumentPdfPreview = lazy(() => import('./DocumentPdfPreview'));

class PreviewBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    render() { return this.state.failed ? <ErrorNotice error={new Error('Le lecteur n’a pas pu démarrer. Téléchargez le fichier ou fermez puis rouvrez cette fenêtre.')}/> : this.props.children; }
}

function Preview({ blob, url, file, ocrFocus }: { blob: Blob; url: string; file: DocumentFile; ocrFocus?: OcrSearchFocus }) {
    const kind = previewKind(blob.type, blob.size);
    const [text, setText] = useState<string | null>(null);
    const [error, setError] = useState<unknown>(null);
    useEffect(() => {
        let active = true;
        if (kind === 'text') blob.text().then(value => { if (active) setText(value); }).catch(err => { if (active) setError(err); });
        return () => { active = false; };
    }, [blob, kind]);
    if (error) return <ErrorNotice error={error}/>;
    switch (kind) {
        case 'pdf': return <Suspense fallback={<Busy label="Ouverture du lecteur PDF…"/>}><DocumentPdfPreview key={file.id} blob={blob} fileId={file.id} searchFocus={ocrFocus}/></Suspense>;
        case 'image': return <img className="file-preview-image" src={url} alt={file.originalFilename} onError={() => setError(new Error('Cette image ne peut pas être affichée. Vous pouvez télécharger le fichier.'))}/>;
        case 'text': return text === null ? <Busy /> : <pre className="file-preview-text">{text}</pre>;
        case 'audio': return <audio controls src={url} onError={() => setError(new Error('Ce format audio ne peut pas être lu par votre navigateur.'))}/>;
        case 'video': return <video className="file-preview-video" controls src={url} onError={() => setError(new Error('Ce format vidéo ne peut pas être lu par votre navigateur.'))}/>;
        default: return <Notice>La consultation intégrée est disponible pour les PDF, images, textes et certains fichiers audio ou vidéo de moins de 50 Mo (1 Mo pour le texte). Téléchargez ce fichier pour le consulter avec une application adaptée.</Notice>;
    }
}

function LoadedContent({ blob, file, preview, ocrFocus }: { blob: Blob; file: DocumentFile; preview: boolean; ocrFocus?: OcrSearchFocus }) {
    const [url, setUrl] = useState('');
    useEffect(() => {
        const value = URL.createObjectURL(blob);
        setUrl(value);
        return () => URL.revokeObjectURL(value);
    }, [blob]);
    if (!url) return <Busy />;
    return <>{preview ? <PreviewBoundary><Preview blob={blob} url={url} file={file} ocrFocus={ocrFocus}/></PreviewBoundary> : <Notice>Le fichier est prêt à être enregistré sur votre appareil.</Notice>}
        <div className="file-download"><a className="btn primary" href={url} download={downloadFilename(file.originalFilename)}>Enregistrer le fichier</a></div></>;
}

export function FileContentDialog({ file, preview, onClose, ocrFocus, documentTitle }: { file: DocumentFile; preview: boolean; onClose: () => void; ocrFocus?: OcrSearchFocus; documentTitle?: string }) {
    const { records, epoch } = useSession();
    const q = useResource(async signal => checkFileContent(await records!.fileContent(file.id, signal), file), 'content:' + file.id + ':' + epoch);
    return <Modal title={preview ? 'Consulter le fichier' : 'Télécharger le fichier'} subtitle={documentTitle ? documentTitle + ' · ' + file.originalFilename : file.originalFilename} onClose={onClose} wide>
        <div className="panel-padding file-content">{q.loading ? <Busy label="Vérification et récupération du fichier…"/> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh}/> : <LoadedContent blob={q.data!} file={file} preview={preview} ocrFocus={ocrFocus}/>}</div>
        <footer className="modal-footer"><button className="btn secondary" onClick={onClose}>Fermer</button></footer>
    </Modal>;
}
