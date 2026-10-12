import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../../src/core/http';
import type { DocumentFile } from '../../src/core/types';

const session = vi.hoisted(() => ({ records: { fileContent: vi.fn() }, epoch: 1 }));
vi.mock('../../src/auth/session', () => ({ useSession: () => session }));
import { FileContentDialog } from '../../src/ui/FileContentDialog';

const file: DocumentFile = { id: 'validated-file', versionId: 'version', originalFilename: '../archive.txt',
    mediaType: 'text/plain', size: 7, role: 'PIECE_JOINTE', state: 'VALIDE', scanStatus: 'CLEAN', master: false, validatedAt: '2026-09-30T12:00:00Z' };
const blob = () => new Blob(['Archive'], { type: 'text/plain' });
function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(yes => { resolve = yes; });
    return { promise, resolve };
}
function OpenDialog({ preview = false, document = file }: { preview?: boolean; document?: DocumentFile }) {
    const [open, setOpen] = useState(true);
    return open ? <FileContentDialog file={document} preview={preview} onClose={() => setOpen(false)}/> : <p>Fenêtre fermée</p>;
}
beforeEach(() => {
    session.epoch = 1;
    session.records.fileContent.mockReset().mockResolvedValue(blob());
    vi.mocked(URL.createObjectURL).mockReturnValue('blob:private-file');
});

describe('Fenêtre réelle : récupération, vérification, téléchargement et fermeture', () => {
    it('attend le contenu vérifié avant de proposer son enregistrement sous un nom sûr', async () => {
        const loading = deferred<Blob>();
        session.records.fileContent.mockReturnValue(loading.promise);
        render(<OpenDialog/>);
        expect(screen.getByRole('status').textContent).toContain('récupération');
        expect(screen.queryByRole('link')).toBeNull();
        const content = blob();
        await act(async () => { loading.resolve(content); });
        const link = await screen.findByRole('link', { name: 'Enregistrer le fichier' });
        expect(link.getAttribute('href')).toBe('blob:private-file');
        expect(link.getAttribute('download')).toBe('_archive.txt');
        expect(URL.createObjectURL).toHaveBeenCalledWith(content);
        expect(session.records.fileContent.mock.calls[0][0]).toBe(file.id);
        expect(session.records.fileContent.mock.calls[0][1]).toBeInstanceOf(AbortSignal);
    });

    it.each([
        ['taille différente', () => new Blob(['Tronqué'], { type: 'text/plain' })],
        ['type différent', () => new Blob(['Archive'], { type: 'text/html' })],
    ])('refuse un contenu incohérent : %s', async (_name, content) => {
        session.records.fileContent.mockResolvedValue(content());
        render(<OpenDialog/>);
        expect((await screen.findByRole('alert')).textContent).toContain('CONTENT_MISMATCH');
        expect(screen.queryByRole('link')).toBeNull();
        expect(URL.createObjectURL).not.toHaveBeenCalled();
    });

    it.each([401, 403, 404, 409])('ne crée aucun lien lors du refus HTTP %i et permet une nouvelle lecture', async status => {
        session.records.fileContent.mockRejectedValueOnce(new ApiError(status, 'FILE_REFUSED', 'Fichier indisponible.'));
        render(<OpenDialog/>);
        await screen.findByRole('alert');
        expect(screen.queryByRole('link')).toBeNull();
        expect(URL.createObjectURL).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Réessayer la lecture' }));
        await screen.findByRole('link', { name: 'Enregistrer le fichier' });
        expect(session.records.fileContent).toHaveBeenCalledTimes(2);
    });

    it('annule la requête en fermant la fenêtre et ignore sa réponse tardive', async () => {
        const loading = deferred<Blob>();
        session.records.fileContent.mockReturnValue(loading.promise);
        render(<OpenDialog/>);
        const signal = session.records.fileContent.mock.calls[0][1] as AbortSignal;
        fireEvent.click(screen.getAllByRole('button', { name: 'Fermer' })[0]!);
        expect(signal.aborted).toBe(true);
        await act(async () => { loading.resolve(blob()); });
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(URL.createObjectURL).not.toHaveBeenCalled();
    });

    it('révoque le lien privé à la fermeture par Échap', async () => {
        render(<OpenDialog/>);
        await screen.findByRole('link');
        fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: false, cancelable: true }));
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:private-file');
    });

    it('rend le focus au bouton d’ouverture après fermeture', async () => {
        function Trigger() {
            const [open, setOpen] = useState(false);
            return <><button onClick={() => setOpen(true)}>Télécharger</button>{open && <FileContentDialog file={file} preview={false} onClose={() => setOpen(false)}/>}</>;
        }
        const user = userEvent.setup();
        render(<Trigger/>);
        const trigger = screen.getByRole('button', { name: 'Télécharger' });
        await user.click(trigger);
        await screen.findByRole('link');
        await user.click(screen.getAllByRole('button', { name: 'Fermer' })[1]!);
        expect(document.activeElement).toBe(trigger);
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('retire immédiatement le fichier précédent après un changement de session', async () => {
        const next = deferred<Blob>();
        const view = render(<OpenDialog/>);
        await screen.findByRole('link');
        session.epoch++;
        session.records.fileContent.mockReturnValue(next.promise);
        view.rerender(<OpenDialog/>);
        expect(screen.queryByRole('link')).toBeNull();
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:private-file');
        expect(session.records.fileContent).toHaveBeenCalledTimes(2);
        await act(async () => { next.resolve(blob()); });
        await screen.findByRole('link');
    });

    it('affiche le texte comme du texte, sans exécuter son balisage', async () => {
        const text = '<img src=x onerror="alert(1)">';
        const content = new Blob([text], { type: 'text/plain' });
        session.records.fileContent.mockResolvedValue(content);
        const view = render(<OpenDialog preview document={{ ...file, size: content.size }}/>);
        await screen.findByText(text);
        expect(view.container.querySelector('img')).toBeNull();
        expect(screen.getByRole('link')).toBeTruthy();
    });

    it('laisse télécharger l’original quand son aperçu image échoue', async () => {
        const content = new Blob(['invalid image'], { type: 'image/png' });
        session.records.fileContent.mockResolvedValue(content);
        render(<OpenDialog preview document={{ ...file, mediaType: content.type, size: content.size }}/>);
        fireEvent.error(await screen.findByRole('img', { name: file.originalFilename }));
        await screen.findByRole('alert');
        expect(screen.getByRole('link', { name: 'Enregistrer le fichier' })).toBeTruthy();
    });

    it('propose uniquement le téléchargement d’un format actif non autorisé en aperçu', async () => {
        const content = new Blob(['<script>alert(1)</script>'], { type: 'text/html' });
        session.records.fileContent.mockResolvedValue(content);
        const view = render(<OpenDialog preview document={{ ...file, mediaType: content.type, size: content.size }}/>);
        await screen.findByRole('link');
        await waitFor(() => expect(screen.getByText(/application adaptée/)).toBeTruthy());
        expect(view.container.querySelector('iframe,object,embed,script')).toBeNull();
    });
});
