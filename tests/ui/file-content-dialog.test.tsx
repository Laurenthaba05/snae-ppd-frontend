import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../../src/core/http';
import type { DocumentFile } from '../../src/core/types';

const session = vi.hoisted(() => ({ records: { fileContent: vi.fn(), streamTicket: vi.fn() }, epoch: 1 }));
vi.mock('../../src/auth/session', () => ({ useSession: () => session }));
import { FileContentDialog } from '../../src/ui/FileContentDialog';

const file: DocumentFile = { id: 'validated-file', versionId: 'version', originalFilename: '../archive.txt',
    mediaType: 'text/plain', size: 7, role: 'PIECE_JOINTE', state: 'VALIDE', scanStatus: 'CLEAN', master: false, validatedAt: '2026-09-30T12:00:00Z' };
const blob = () => new Blob(['Archive'], { type: 'text/plain' });
const GIB = 1024 * 1024 * 1024;
const ticket = (extra = {}) => ({ url: '/api/v1/files/big-file/stream?ticket=' + 'T'.repeat(43), expiresAt: '2026-11-18T09:00:00Z', maxExpiresAt: '2026-11-18T20:00:00Z', size: 3 * GIB, mediaType: 'video/mp4', filename: 'entretien.mp4', playable: true, ...extra });
const big = (over: Partial<DocumentFile>): DocumentFile => ({ ...file, id: 'big-file', originalFilename: "L'entretien intégral.mp4", mediaType: 'video/mp4', size: 3 * GIB, ...over });
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
    session.records.streamTicket.mockReset().mockResolvedValue(ticket());
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


describe('Lecture en continu : audio, vidéo et fichiers au-delà de la limite de mémoire', () => {
    it('lit une vidéo de plusieurs Gio dans la balise vidéo avec le jeton, sans jamais la charger en mémoire', async () => {
        render(<OpenDialog preview document={big({})}/>);
        const link = await screen.findByRole('link', { name: 'Enregistrer le fichier' });
        const video = document.querySelector('video')!;
        expect(video.getAttribute('src')).toBe(ticket().url);
        expect(video.hasAttribute('controls')).toBe(true);
        expect(link.getAttribute('href')).toBe(ticket().url + '&download=true');                  // l'enregistrement passe par le navigateur, en continu
        expect(link.getAttribute('download')).toBe("L'entretien intégral.mp4");
        expect(session.records.streamTicket.mock.calls[0][0]).toBe('big-file');
        expect(session.records.streamTicket.mock.calls[0][1]).toBeInstanceOf(AbortSignal);
        expect(session.records.fileContent).not.toHaveBeenCalled();
        expect(URL.createObjectURL).not.toHaveBeenCalled();
    });

    it('lit un son dans la balise audio, même court', async () => {
        render(<OpenDialog preview document={big({ mediaType: 'audio/mpeg', size: 2_000_000, originalFilename: 'voix.mp3' })}/>);
        await screen.findByRole('link', { name: 'Enregistrer le fichier' });
        expect(document.querySelector('audio')!.getAttribute('src')).toBe(ticket().url);
        expect(session.records.fileContent).not.toHaveBeenCalled();
    });

    it('télécharge sans rien charger : un gros fichier de tout type devient un lien de téléchargement en continu', async () => {
        render(<OpenDialog document={big({ mediaType: 'application/zip', originalFilename: 'depot.zip' })}/>);
        const link = await screen.findByRole('link', { name: 'Enregistrer le fichier' });
        expect(link.getAttribute('href')).toBe(ticket().url + '&download=true');
        expect(document.querySelector('video')).toBeNull();
        expect(screen.getByText(/lu directement depuis le serveur, sans être chargé en mémoire/)).toBeTruthy();
        expect(session.records.fileContent).not.toHaveBeenCalled();
    });

    it('dit pourquoi un gros PDF n’a pas d’aperçu, et le propose en téléchargement', async () => {
        render(<OpenDialog preview document={big({ mediaType: 'application/pdf', size: 80 * 1024 * 1024, originalFilename: 'registre.pdf' })}/>);
        await screen.findByRole('link', { name: 'Enregistrer le fichier' });
        expect(screen.getByText(/limitée aux fichiers de moins de 50 Mo/)).toBeTruthy();
        expect(document.querySelector('video')).toBeNull();
    });

    it('garde le chargement vérifié pour un petit fichier à télécharger, même une vidéo', async () => {
        session.records.fileContent.mockResolvedValue(new Blob(['1234567'], { type: 'video/mp4' }));
        render(<OpenDialog document={big({ size: 7, mediaType: 'video/mp4' })}/>);
        await screen.findByRole('link', { name: 'Enregistrer le fichier' });
        expect(session.records.fileContent).toHaveBeenCalled();
        expect(session.records.streamTicket).not.toHaveBeenCalled();
    });

    it('un jeton refusé ne crée aucun lien et permet de recommencer', async () => {
        session.records.streamTicket.mockRejectedValueOnce(new ApiError(409, 'FILE_NOT_VALIDATED', 'Le fichier doit être validé avant téléchargement.'));
        render(<OpenDialog preview document={big({})}/>);
        expect((await screen.findByRole('alert')).textContent).toContain('validé');
        expect(screen.queryByRole('link')).toBeNull();
        expect(document.querySelector('video')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Réessayer la lecture' }));
        await screen.findByRole('link', { name: 'Enregistrer le fichier' });
        expect(session.records.streamTicket).toHaveBeenCalledTimes(2);
    });

    it('annonce un format que le navigateur ne lit pas, avec la possibilité d’enregistrer', async () => {
        render(<OpenDialog preview document={big({})}/>);
        await screen.findByRole('link', { name: 'Enregistrer le fichier' });
        fireEvent.error(document.querySelector('video')!);
        expect((await screen.findByRole('alert')).textContent).toContain('ne peut pas être lu');
        expect(screen.getByRole('link', { name: 'Enregistrer le fichier' })).toBeTruthy();
    });

    it('annule la demande de jeton en fermant la fenêtre', async () => {
        const pending = deferred<ReturnType<typeof ticket>>();
        session.records.streamTicket.mockReturnValue(pending.promise);
        render(<OpenDialog preview document={big({})}/>);
        const signal = session.records.streamTicket.mock.calls[0][1] as AbortSignal;
        fireEvent.click(screen.getAllByRole('button', { name: 'Fermer' })[0]!);
        expect(signal.aborted).toBe(true);
        await act(async () => { pending.resolve(ticket()); });
        expect(document.querySelector('video')).toBeNull();
    });
});
