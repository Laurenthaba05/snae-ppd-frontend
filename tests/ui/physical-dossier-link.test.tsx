import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { PhysicalArchive } from '../../src/core/types';

// Un dossier papier et un dossier du système sont la même affaire : on les relie, sans changer aucun droit. L'écran guide, le serveur reste seul juge.
const fixture = vi.hoisted(() => ({
    epoch: 1, me: { user: { id: 'u1' } } as unknown, canRead: true,
    records: { dossiers: vi.fn(), dossier: vi.fn() },
    physicalArchives: { command: vi.fn(), dossierArchives: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: () => true, canAnywhere: () => fixture.canRead }));
vi.mock('../../src/ui/navigation', () => ({ navigate: vi.fn() }));
import { navigate } from '../../src/ui/navigation';
import { ArchiveDossierField, DossierPaperArchives } from '../../src/ui/PhysicalDossierLink';

const archive = (extra: Partial<PhysicalArchive> = {}): PhysicalArchive => ({
    id: 'a1', documentId: null, dossierId: null, uniteStockageId: 'u1', cote: 'DP-001', intitule: 'Dossier de la mission', support: 'Papier', etatPhysique: null, description: null,
    dateExtremeDebut: null, dateExtremeFin: null, quantite: null, uniteQuantite: null, versionLock: 3, institutionId: 'inst-a', departmentId: null, ...extra
});
const dossier = (id: string, reference: string, title: string) => ({ id, reference, title, institutionId: 'inst-a', departmentId: null });
const page = <T,>(items: T[], hasMore = false) => ({ items, page: 0, size: 10, hasMore });

beforeEach(() => {
    fixture.epoch += 1; fixture.canRead = true;
    fixture.records.dossiers.mockReset().mockResolvedValue(page([dossier('d1', 'DOS-001', 'Mission de 2019'), dossier('d2', 'DOS-002', 'Mission de 2020')]));
    fixture.records.dossier.mockReset().mockImplementation(async (id: string) => dossier(id, 'DOS-001', 'Mission de 2019'));
    fixture.physicalArchives.command.mockReset().mockResolvedValue(archive());
    fixture.physicalArchives.dossierArchives.mockReset().mockResolvedValue(page([]));
    vi.mocked(navigate).mockReset();
});

it('une archive sans dossier propose d’en relier un, qui se cherche dans l’institution de l’archive', async () => {
    const onChanged = vi.fn();
    render(<ArchiveDossierField archive={archive()} canManage onChanged={onChanged} />);
    fireEvent.click(screen.getByRole('button', { name: 'Relier un dossier' }));
    expect(await screen.findByText('Mission de 2019', { exact: false })).toBeTruthy();
    expect(fixture.records.dossiers).toHaveBeenCalledWith(expect.objectContaining({ institutionId: 'inst-a', size: 10 }), expect.anything());
    fireEvent.change(screen.getByLabelText('Référence ou titre du dossier'), { target: { value: 'mission 2020' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }));
    await waitFor(() => expect(fixture.records.dossiers).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'mission 2020' }), expect.anything()));
    fireEvent.click((await screen.findAllByRole('button', { name: 'Relier' }))[1]!);
    await waitFor(() => expect(fixture.physicalArchives.command).toHaveBeenCalledWith('/archives/a1/dossier', { versionLock: 3, dossierId: 'd2' }, expect.any(String), 'POST'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
});

it('un refus du serveur reste affiché et la fenêtre reste ouverte', async () => {
    fixture.physicalArchives.command.mockRejectedValue(Object.assign(new Error('Ce dossier n’a pas la même origine que cette archive physique.'), { status: 409, code: 'PHYSICALARCHIVES_ORIGIN_MISMATCH' }));
    render(<ArchiveDossierField archive={archive()} canManage onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Relier un dossier' }));
    fireEvent.click((await screen.findAllByRole('button', { name: 'Relier' }))[0]!);
    expect(await screen.findByText(/même origine/)).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
});

it('une archive reliée montre le nom du dossier, jamais son identifiant, et se détache sur confirmation', async () => {
    const onChanged = vi.fn();
    render(<ArchiveDossierField archive={archive({ dossierId: 'd1' })} canManage onChanged={onChanged} />);
    const name = await screen.findByText('DOS-001 · Mission de 2019');
    expect(screen.queryByText('d1')).toBeNull();
    fireEvent.click(name);
    expect(navigate).toHaveBeenCalledWith('/app/dossiers/d1');
    fireEvent.click(screen.getByRole('button', { name: 'Détacher' }));
    expect(screen.getByText(/Ni l’une ni l’autre n’est supprimé/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Détacher' }).at(-1)!);
    await waitFor(() => expect(fixture.physicalArchives.command).toHaveBeenCalledWith('/archives/a1/dossier', { versionLock: 3, dossierId: null }, expect.any(String), 'POST'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
});

it('sans le droit de gérer l’archive, aucun geste n’est proposé', async () => {
    render(<ArchiveDossierField archive={archive()} canManage={false} onChanged={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Relier un dossier' })).toBeNull();
    render(<ArchiveDossierField archive={archive({ dossierId: 'd1' })} canManage={false} onChanged={vi.fn()} />);
    await screen.findByText('DOS-001 · Mission de 2019');
    expect(screen.queryByRole('button', { name: 'Détacher' })).toBeNull();
});

it('un dossier que la personne ne peut pas lire n’a pas de nom : un texte neutre le remplace', async () => {
    fixture.records.dossier.mockRejectedValue(Object.assign(new Error('Ressource introuvable.'), { status: 404 }));
    render(<ArchiveDossierField archive={archive({ dossierId: 'd9' })} canManage={false} onChanged={vi.fn()} />);
    expect(await screen.findByText('Dossier non disponible')).toBeTruthy();
    expect(screen.queryByText('d9')).toBeNull();
});

it('la fiche d’un dossier liste ses archives papier pour qui peut lire les archives physiques', async () => {
    fixture.physicalArchives.dossierArchives.mockResolvedValue(page([archive(), archive({ id: 'a2', cote: 'DP-002', intitule: null, support: null })]));
    render(<DossierPaperArchives dossierId="d1" />);
    fireEvent.click(await screen.findByText(/DP-001/));
    expect(navigate).toHaveBeenCalledWith('/app/archives-physiques?archive=a1');
    expect(screen.getByText('DP-002')).toBeTruthy();
    expect(screen.getByText('Papier')).toBeTruthy();
});

it('la fiche d’un dossier dit quand aucune archive papier n’est reliée, et ne montre rien sans le droit', async () => {
    const { container } = render(<DossierPaperArchives dossierId="d1" />);
    expect(await screen.findByText('Aucune archive physique n’est reliée à ce dossier.')).toBeTruthy();
    fixture.canRead = false; fixture.epoch += 1;
    fixture.physicalArchives.dossierArchives.mockClear();
    const hidden = render(<DossierPaperArchives dossierId="d1" />);
    expect(hidden.container.textContent).toBe('');
    expect(fixture.physicalArchives.dossierArchives).not.toHaveBeenCalled();
    expect(container).toBeTruthy();
});
