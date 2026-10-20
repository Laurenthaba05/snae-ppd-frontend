import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { beforeEach, expect, it, vi } from 'vitest';

// Importer un EAD3 : choisir un fichier, le faire contrôler par le serveur, lire l'arborescence, les erreurs et les remarques, puis confirmer avec la confidentialité choisie.
const fixture = vi.hoisted(() => ({ epoch: 1, me: null as unknown }));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
import { EadImport } from '../../src/ui/EadImport';
import type { ArchivesApi, EadPreview } from '../../src/api/archives';

const INST = '22222222-2222-4222-8222-222222222222';
const api = { previewEad: vi.fn(), importEad: vi.fn() };
const asApi = () => api as unknown as ArchivesApi;
const XML = '<ead xmlns="http://ead3.archivists.org/schema/"><control/><archdesc level="fonds"/></ead>';
const good: EadPreview = { hash: 'h'.repeat(64), format: 'EAD 2002', units: 3, issues: [], warnings: ['Éléments non repris : controlaccess (2).'], outline: [
    { rank: 1, depth: 0, level: 'FONDS', reference: 'MIN-1', title: 'Papiers du ministère' }, { rank: 2, depth: 1, level: 'SERIE', reference: 'MIN-1/A', title: 'Correspondance' }, { rank: 3, depth: 2, level: 'DOSSIER', reference: 'MIN-1/A/1', title: 'Dossier 1' }] };

const setup = () => { const onClose = vi.fn(), onImported = vi.fn(); render(<EadImport api={asApi()} institution={INST} onClose={onClose} onImported={onImported} />); return { onClose, onImported }; };
const upload = async (file: File) => { fireEvent.change(document.querySelector('input[type=file]') as HTMLInputElement, { target: { files: [file] } }); await waitFor(() => expect((screen.getByRole('button', { name: 'Contrôler le fichier' }) as HTMLButtonElement).disabled).toBe(false)); };
const check = async () => { fireEvent.click(screen.getByRole('button', { name: 'Contrôler le fichier' })); await screen.findByRole('status'); };

beforeEach(() => { fixture.epoch += 1; api.previewEad.mockReset().mockResolvedValue(good); api.importEad.mockReset().mockResolvedValue({ count: 3 }); });

it('contrôle le fichier, montre l’arborescence lue et les éléments non repris, puis confirme avec la confidentialité choisie', async () => {
    const { onClose, onImported } = setup();
    expect((screen.getByRole('button', { name: 'Contrôler le fichier' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Confirmer l’import' }) as HTMLButtonElement).disabled).toBe(true);
    await upload(new File([XML], 'fonds.xml', { type: 'application/xml' }));
    fireEvent.change(screen.getByLabelText(/^Confidentialité des notices créées/), { target: { value: 'CONFIDENTIEL' } });
    await check();
    expect(api.previewEad).toHaveBeenCalledWith(INST, XML, 'CONFIDENTIEL', expect.anything());
    expect(screen.getByRole('status').textContent).toBe('3 unités lues, aucune erreur, 1 remarque.');
    expect(screen.getByText(/Format reconnu/).textContent).toBe('Format reconnu : EAD 2002.');
    const outline = screen.getByRole('list', { name: 'Arborescence lue' });
    expect(within(outline).getAllByRole('listitem').map(li => li.textContent)).toEqual(['Fonds · MIN-1 — Papiers du ministère', 'Série · MIN-1/A — Correspondance', 'Dossier · MIN-1/A/1 — Dossier 1']);
    expect(screen.getByText('Éléments non repris : controlaccess (2).')).toBeTruthy();
    expect(screen.getByText(/Le contrôle est réussi/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’import' }));
    await waitFor(() => expect(api.importEad).toHaveBeenCalledTimes(1));
    const [institution, xml, confidentiality, hash, key] = api.importEad.mock.calls[0]!;
    expect(institution).toBe(INST); expect(xml).toBe(XML); expect(confidentiality).toBe('CONFIDENTIEL'); expect(hash).toBe(good.hash); expect(typeof key).toBe('string');
    await waitFor(() => expect(onImported).toHaveBeenCalledWith(3)); expect(onClose).toHaveBeenCalled();
});

it('les erreurs du contrôle bloquent la confirmation et disent où elles sont', async () => {
    api.previewEad.mockResolvedValue({ ...good, issues: [{ unit: 0, reference: null, message: 'EAD3 non valide : ligne 4 : élément inattendu' }, { unit: 2, reference: 'MIN-1/A', message: 'La référence existe déjà.' }] });
    setup();
    await upload(new File([XML], 'fonds.xml'));
    await check();
    const alert = screen.getByRole('alert');
    expect(within(alert).getAllByRole('listitem').map(li => li.textContent)).toEqual(['Fichier : EAD3 non valide : ligne 4 : élément inattendu', 'Unité 2 (MIN-1/A) : La référence existe déjà.']);
    expect((screen.getByRole('button', { name: 'Confirmer l’import' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText(/Le contrôle est réussi/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’import' }));
    expect(api.importEad).not.toHaveBeenCalled();
});

it('changer la confidentialité après le contrôle oblige à contrôler de nouveau', async () => {
    setup();
    await upload(new File([XML], 'fonds.xml'));
    await check();
    expect((screen.getByRole('button', { name: 'Confirmer l’import' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.change(screen.getByLabelText(/^Confidentialité des notices créées/), { target: { value: 'SECRET' } });
    expect(screen.queryByRole('status')).toBeNull(); expect((screen.getByRole('button', { name: 'Confirmer l’import' }) as HTMLButtonElement).disabled).toBe(true);
});

it('un fichier trop gros ou d’un autre format est refusé avant tout envoi', async () => {
    setup();
    fireEvent.change(document.querySelector('input[type=file]') as HTMLInputElement, { target: { files: [new File(['a,b'], 'fonds.csv')] } });
    expect((await screen.findByRole('alert')).textContent).toContain('Choisissez un fichier EAD (EAD3 ou EAD 2002) au format XML');
    fireEvent.change(document.querySelector('input[type=file]') as HTMLInputElement, { target: { files: [new File([new Uint8Array(5_000_001)], 'gros.xml')] } });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('dépasse 5 Mo'));
    expect((screen.getByRole('button', { name: 'Contrôler le fichier' }) as HTMLButtonElement).disabled).toBe(true); expect(api.previewEad).not.toHaveBeenCalled();
});

it('un fichier qui n’est pas en UTF-8 est refusé', async () => {
    setup();
    fireEvent.change(document.querySelector('input[type=file]') as HTMLInputElement, { target: { files: [new File([new Uint8Array([0x3c, 0xe9, 0xff, 0x3e])], 'latin1.xml')] } });
    expect((await screen.findByRole('alert')).textContent).toContain('encodé en UTF-8');
    expect(api.previewEad).not.toHaveBeenCalled();
});

it('un refus du serveur est dit dans la fenêtre, qui reste ouverte', async () => {
    api.previewEad.mockRejectedValue(new Error('Ce fichier n’est pas un EAD3'));
    const { onClose } = setup();
    await upload(new File([XML], 'fonds.xml'));
    fireEvent.click(screen.getByRole('button', { name: 'Contrôler le fichier' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Ce fichier n’est pas un EAD3');
    expect(onClose).not.toHaveBeenCalled();
});

it('la fenêtre n’a aucune violation d’accessibilité détectée automatiquement', async () => {
    setup();
    await upload(new File([XML], 'fonds.xml'));
    await check();
    const results = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.map(v => v.id + ' : ' + v.nodes.map(n => n.html).join(' | '))).toEqual([]);
});
