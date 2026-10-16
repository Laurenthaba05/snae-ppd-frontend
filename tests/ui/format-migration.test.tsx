import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { MigratedCopy, MigrationCampaign, MigrationCampaignSummary, MigrationCandidates, MigrationConverter } from '../../src/core/formatMigration';

const INST = '97571d20-3f49-497e-a185-dac22208eb3f';
const DOC = '80f0f431-a8f1-4da0-b0b2-bbca91b9a739';
const FILE = '11111111-1111-4111-8111-111111111111';
const FILE_2 = '22222222-2222-4222-8222-222222222222';
const CAMPAIGN = '33333333-3333-4333-8333-333333333333';
const CREATOR = '44444444-4444-4444-8444-444444444444';
const APPROVER = '55555555-5555-4555-8555-555555555555';
const fixture = vi.hoisted(() => ({
    epoch: 1, demo: false, me: { user: { id: '55555555-5555-4555-8555-555555555555' } } as unknown, allowed: new Set<string>(),
    preservationPlanning: {
        migrationConverters: vi.fn(), migrationCandidates: vi.fn(), migrationCampaigns: vi.fn(), migrationCampaign: vi.fn(), createMigration: vi.fn(), validateMigration: vi.fn(),
        cancelMigration: vi.fn(), retryMigration: vi.fn(), documentMigrations: vi.fn(), downloadMigratedCopy: vi.fn()
    },
    saved: vi.fn()
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
vi.mock('../../src/ui/names', () => ({ EntityName: ({ id }: { id: string }) => <>{id === '44444444-4444-4444-8444-444444444444' ? 'Aminata Camara' : 'Mamadou Diallo'}</> }));
vi.mock('../../src/ui/ReadingRoomParts', async importOriginal => ({ ...(await importOriginal<typeof import('../../src/ui/ReadingRoomParts')>()), saveBlob: fixture.saved }));
import { DocumentMigrationsList, FormatMigrationPanel } from '../../src/ui/FormatMigration';

const converter = (over: Partial<MigrationConverter> = {}): MigrationConverter => ({
    code: 'IMAGE_TO_TIFF', version: '1', label: 'Image vers TIFF non compressé', sources: ['image/bmp', 'image/gif'], target: 'image/tiff', extension: 'tif', lossless: true, enabled: true, ...over
});
const summary = (over: Partial<MigrationCampaignSummary> = {}): MigrationCampaignSummary => ({
    id: CAMPAIGN, reference: 'MG-2026-000001', institutionId: INST, title: 'Migration des BMP', converter: 'IMAGE_TO_TIFF', converterVersion: '1', sourceType: 'image/bmp',
    targetType: 'image/tiff', status: 'BROUILLON', lines: 2, pending: 2, migrated: 0, failed: 0, cancelled: 0, createdById: CREATOR, createdAt: '2026-10-15T09:00:00Z',
    validatedById: null, validatedAt: null, completedAt: null, version: 0, ...over
});
const campaign = (over: Partial<MigrationCampaignSummary> = {}, lines: MigrationCampaign['lines'] = []): MigrationCampaign => ({
    summary: summary(over), motive: 'Le format sort de la liste recommandée', cancelledById: null, cancelledAt: null, cancellationReason: null,
    lines: lines.length ? lines : [
        { id: 'l1', rank: 1, fileId: FILE, documentId: DOC, documentReference: 'DOC-1', size: 2048, status: 'A_FAIRE', attempts: 0, errorCode: null, errorMessage: null, copyId: null, eventId: null, processedAt: null },
        { id: 'l2', rank: 2, fileId: FILE_2, documentId: DOC, documentReference: 'DOC-2', size: 4096, status: 'A_FAIRE', attempts: 0, errorCode: null, errorMessage: null, copyId: null, eventId: null, processedAt: null }
    ]
});
const candidates = (over: Partial<MigrationCandidates> = {}): MigrationCandidates => ({
    converter: converter(),
    policy: { registered: true, name: 'BMP', scope: 'INSTITUTION', risk: 'ELEVE', perennity: 'A_SURVEILLER', registryTarget: 'image/tiff', converterTarget: 'image/tiff', matches: true },
    items: [
        { fileId: FILE, documentId: DOC, documentReference: 'DOC-1', mediaType: 'image/bmp', size: 2048, version: 1, role: 'MAITRE_CONSERVATION' },
        { fileId: FILE_2, documentId: DOC, documentReference: 'DOC-2', mediaType: 'image/bmp', size: 4096, version: 1, role: 'MAITRE_CONSERVATION' }
    ], hasMore: false, ...over
});

beforeEach(() => {
    fixture.epoch += 1;
    fixture.demo = false;
    fixture.me = { user: { id: APPROVER } };
    fixture.allowed = new Set(['PRESERVATION_MIGRATION_MANAGE', 'PRESERVATION_MIGRATION_APPROVE']);
    for (const fn of Object.values(fixture.preservationPlanning)) fn.mockReset();
    fixture.saved.mockReset();
    fixture.preservationPlanning.migrationConverters.mockResolvedValue([converter()]);
    fixture.preservationPlanning.migrationCampaigns.mockResolvedValue([summary()]);
    fixture.preservationPlanning.migrationCampaign.mockResolvedValue(campaign());
    fixture.preservationPlanning.documentMigrations.mockResolvedValue([]);
});

it('la liste montre chaque campagne avec son état, son avancement et le nom de la personne qui l’a préparée', async () => {
    fixture.preservationPlanning.migrationCampaigns.mockResolvedValue([summary(), summary({ id: 'c2', reference: 'MG-2026-000002', status: 'TERMINEE', lines: 3, pending: 0, migrated: 2, failed: 1 })]);
    render(<FormatMigrationPanel institutionId={INST} />);
    const first = (await screen.findByText('MG-2026-000001')).closest('tr')!;
    expect(within(first).getByText('Brouillon')).toBeTruthy();
    expect(within(first).getByText(/2 en attente sur 2 fichiers/)).toBeTruthy();
    expect(within(first).getByText('Aminata Camara')).toBeTruthy();
    expect(within(first).getByText(/image\/bmp → image\/tiff/)).toBeTruthy();
    const second = screen.getByText('MG-2026-000002').closest('tr')!;
    expect(within(second).getByText(/2 migrés, 1 en échec sur 3 fichiers/)).toBeTruthy();
    expect(document.body.textContent).not.toContain(CREATOR);
});

it('sans habilitation de préparation, le bouton n’est pas proposé ; sans exécution activée, le panneau le dit', async () => {
    fixture.allowed = new Set(['PRESERVATION_PLANNING_READ']);
    fixture.preservationPlanning.migrationConverters.mockResolvedValue([converter({ enabled: false })]);
    render(<FormatMigrationPanel institutionId={INST} />);
    await screen.findByText('MG-2026-000001');
    expect(screen.queryByRole('button', { name: 'Préparer une migration' })).toBeNull();
    expect(screen.getByText(/n’est pas activée sur ce serveur/)).toBeTruthy();
});

it('une campagne se prépare : convertisseur, format, fichiers éligibles, intitulé et motif', async () => {
    fixture.preservationPlanning.migrationCandidates.mockResolvedValue(candidates());
    fixture.preservationPlanning.createMigration.mockResolvedValue(campaign());
    render(<FormatMigrationPanel institutionId={INST} />);
    await screen.findByText('MG-2026-000001');
    fireEvent.click(screen.getByRole('button', { name: 'Préparer une migration' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/^Convertisseur/), { target: { value: 'IMAGE_TO_TIFF' } });
    fireEvent.change(within(dialog).getByLabelText(/^Format à migrer/), { target: { value: 'image/bmp' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Chercher les fichiers éligibles' }));
    expect(await within(dialog).findByText(/Conforme au registre \(institution\)/)).toBeTruthy();
    expect(fixture.preservationPlanning.migrationCandidates).toHaveBeenCalledWith(INST, 'IMAGE_TO_TIFF', 'image/bmp', 200);
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /DOC-1/ }));
    fireEvent.change(within(dialog).getByLabelText(/^Intitulé/), { target: { value: 'Migration des BMP' } });
    fireEvent.change(within(dialog).getByLabelText(/^Motif de la migration/), { target: { value: 'Le format sort de la liste recommandée' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Préparer la campagne' }));
    await waitFor(() => expect(fixture.preservationPlanning.createMigration).toHaveBeenCalledTimes(1));
    expect(fixture.preservationPlanning.createMigration.mock.calls[0]![0]).toEqual({
        institutionId: INST, converter: 'IMAGE_TO_TIFF', sourceType: 'image/bmp', title: 'Migration des BMP', motive: 'Le format sort de la liste recommandée', fileIds: [FILE]
    });
});

it('une politique du registre qui ne correspond pas bloque la préparation et le dit', async () => {
    fixture.preservationPlanning.migrationCandidates.mockResolvedValue(candidates({
        policy: { registered: true, name: 'BMP', scope: 'NATIONAL', risk: 'ELEVE', perennity: 'A_SURVEILLER', registryTarget: 'image/png', converterTarget: 'image/tiff', matches: false }
    }));
    render(<FormatMigrationPanel institutionId={INST} />);
    await screen.findByText('MG-2026-000001');
    fireEvent.click(screen.getByRole('button', { name: 'Préparer une migration' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/^Convertisseur/), { target: { value: 'IMAGE_TO_TIFF' } });
    fireEvent.change(within(dialog).getByLabelText(/^Format à migrer/), { target: { value: 'image/bmp' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Chercher les fichiers éligibles' }));
    expect(await within(dialog).findByText(/Le registre désigne image\/png comme format cible/)).toBeTruthy();
    expect((within(dialog).getByRole('button', { name: 'Préparer la campagne' }) as HTMLButtonElement).disabled).toBe(true);
});

it('une autre personne valide le brouillon ; celle qui l’a préparé ne le peut pas', async () => {
    fixture.preservationPlanning.validateMigration.mockResolvedValue(campaign({ status: 'VALIDEE', validatedById: APPROVER, validatedAt: '2026-10-15T10:00:00Z' }));
    render(<FormatMigrationPanel institutionId={INST} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir la campagne MG-2026-000001' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('DOC-1')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Valider la campagne' }));
    await waitFor(() => expect(fixture.preservationPlanning.validateMigration).toHaveBeenCalledWith(CAMPAIGN, expect.any(String)));
});

it('la personne qui a préparé la campagne ne voit pas le bouton de validation et en lit la raison', async () => {
    fixture.me = { user: { id: CREATOR } };
    render(<FormatMigrationPanel institutionId={INST} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir la campagne MG-2026-000001' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/validée par une autre personne que celle qui l’a préparée/)).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Valider la campagne' })).toBeNull();
});

it('une ligne en échec dit pourquoi et se relance seule', async () => {
    fixture.preservationPlanning.migrationCampaigns.mockResolvedValue([summary({ status: 'TERMINEE', pending: 0, migrated: 1, failed: 1, validatedById: APPROVER })]);
    fixture.preservationPlanning.migrationCampaign.mockResolvedValue(campaign({ status: 'TERMINEE', pending: 0, migrated: 1, failed: 1, validatedById: APPROVER }, [
        { id: 'l1', rank: 1, fileId: FILE, documentId: DOC, documentReference: 'DOC-1', size: 2048, status: 'MIGRE', attempts: 1, errorCode: null, errorMessage: null, copyId: 'c', eventId: 'e',
          processedAt: '2026-10-15T10:05:00Z' },
        { id: 'l2', rank: 2, fileId: FILE_2, documentId: DOC, documentReference: 'DOC-2', size: 4096, status: 'ECHEC', attempts: 1, errorCode: 'MIGRATION_SOURCE_UNREADABLE',
          errorMessage: 'Le fichier source ne se décode pas : il est corrompu ou d’une variante non prise en charge.', copyId: null, eventId: null, processedAt: '2026-10-15T10:05:00Z' }
    ]));
    fixture.preservationPlanning.retryMigration.mockResolvedValue(campaign({ status: 'VALIDEE', pending: 1, migrated: 1, failed: 0 }));
    render(<FormatMigrationPanel institutionId={INST} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir la campagne MG-2026-000001' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/ne se décode pas/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Relancer la ligne 2' }));
    await waitFor(() => expect(fixture.preservationPlanning.retryMigration).toHaveBeenCalledWith(CAMPAIGN, 'l2', expect.any(String)));
});

it('l’annulation demande un motif d’au moins dix caractères', async () => {
    fixture.preservationPlanning.cancelMigration.mockResolvedValue(campaign({ status: 'ANNULEE' }));
    render(<FormatMigrationPanel institutionId={INST} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir la campagne MG-2026-000001' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Annuler la campagne' }));
    const dialogs = await screen.findAllByRole('dialog');
    const prompt = dialogs[dialogs.length - 1]!;
    const confirm = within(prompt).getByRole('button', { name: 'Annuler la campagne' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(prompt).getByLabelText(/^Motif/), { target: { value: 'Le registre doit être revu avant la migration' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(fixture.preservationPlanning.cancelMigration).toHaveBeenCalledWith(CAMPAIGN, 'Le registre doit être revu avant la migration', expect.any(String)));
});

it('les copies migrées d’un document se listent et se téléchargent avec le droit de contenu', async () => {
    const copy: MigratedCopy = { id: 'copy-1', fileId: FILE, fileName: 'scan-1.bmp', mediaType: 'image/tiff', size: 1200, sha256: 'a'.repeat(64), width: 24, height: 16,
        converter: 'IMAGE_TO_TIFF/1', campaignReference: 'MG-2026-000001', eventId: 'e', createdAt: '2026-10-15T10:05:00Z' };
    fixture.preservationPlanning.documentMigrations.mockResolvedValue([copy]);
    fixture.preservationPlanning.downloadMigratedCopy.mockResolvedValue(new Blob(['x']));
    fixture.allowed = new Set(['FILE_CONTENT_DOWNLOAD']);
    render(<DocumentMigrationsList documentId={DOC} />);
    expect(await screen.findByText('scan-1.bmp')).toBeTruthy();
    expect(screen.getByText(/image\/tiff — 24 × 16 px/)).toBeTruthy();
    expect(screen.getByText(/Campagne MG-2026-000001/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Télécharger la copie migrée de scan-1.bmp/ }));
    await waitFor(() => expect(fixture.saved).toHaveBeenCalledWith(expect.any(Blob), 'scan-1.tif'));
    expect(fixture.preservationPlanning.downloadMigratedCopy).toHaveBeenCalledWith(FILE, 'copy-1');
});

it('sans le droit de contenu, la copie se voit mais ne se télécharge pas ; sans copie, le document le dit', async () => {
    const copy: MigratedCopy = { id: 'copy-1', fileId: FILE, fileName: 'scan-1.bmp', mediaType: 'image/tiff', size: 1200, sha256: 'a'.repeat(64), width: 24, height: 16,
        converter: 'IMAGE_TO_TIFF/1', campaignReference: null, eventId: null, createdAt: '2026-10-15T10:05:00Z' };
    fixture.preservationPlanning.documentMigrations.mockResolvedValue([copy]);
    fixture.allowed = new Set();
    const view = render(<DocumentMigrationsList documentId={DOC} />);
    expect(await screen.findByText('scan-1.bmp')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Télécharger/ })).toBeNull();
    view.unmount();
    fixture.preservationPlanning.documentMigrations.mockResolvedValue([]);
    render(<DocumentMigrationsList documentId={DOC} />);
    expect(await screen.findByText(/conservés dans leur format d’origine/)).toBeTruthy();
});
