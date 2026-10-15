import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { ArchivalIntake } from '../../src/core/types';
import type { IntegrationPreview } from '../../src/core/intakeExchange';

const INST = '97571d20-3f49-497e-a185-dac22208eb3f';
const fixture = vi.hoisted(() => ({
    epoch: 1, me: null as unknown,
    archivalIntake: { sedaExport: vi.fn(), importSedaFile: vi.fn(), integrationPreview: vi.fn(), integrate: vi.fn(), integrations: vi.fn(), depositPackage: vi.fn(), deposits: vi.fn() },
    records: { transport: { request: vi.fn() }, documentTypes: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/ui/names', () => ({
    EntityName: ({ kind, id }: { kind: string; id: string }) => <>{(kind === 'institutions' ? 'Institution ' : 'Agent ') + id.slice(0, 2)}</>,
    useEntityName: () => ({ name: null, loading: false })
}));
import { IntakeExchangePanel } from '../../src/ui/IntakeExchange';

const intake = (over: Partial<ArchivalIntake> = {}): ArchivalIntake => ({
    id: '11111111-1111-4111-8111-111111111111', numero: 'V-2026-001', modeEntree: 'VERSEMENT', statut: 'OUVERTE', etape: 'PREPARATION', institutionArchivesId: INST, producteurId: 'p', ...over
} as unknown as ArchivalIntake);
const description = (id: string, code: string, title: string, level: string) => ({ id, input: { institutionId: INST, code, title, level, parentId: null, producerId: null, confidentiality: 'INTERNE', documentId: null, dossierId: null, details: {} }, version: 0, updatedAt: '2026-10-01T00:00:00Z' });
const preview = (over: Partial<IntegrationPreview> = {}): IntegrationPreview => ({
    entryId: 'e', parentId: 'f1', parentLabel: 'FONDS-1 — Fonds', level: 'SERIE', integrated: 0, absent: 1, blockers: [],
    eligible: [{ lineId: 'l1', rank: 1, reference: 'REG-A', title: 'Registre A', finding: 'CONFORME', problems: [] }, { lineId: 'l2', rank: 2, reference: 'REG-B', title: 'Registre B', finding: 'ECART', problems: [] }], ...over
});

beforeEach(() => {
    fixture.epoch += 1;
    for (const fn of [...Object.values(fixture.archivalIntake), fixture.records.transport.request, fixture.records.documentTypes]) fn.mockReset();
    fixture.archivalIntake.integrations.mockResolvedValue([]);
    fixture.archivalIntake.deposits.mockResolvedValue([]);
    fixture.records.transport.request.mockResolvedValue([description('f1', 'FONDS-1', 'Fonds du ministère', 'FONDS'), description('s1', 'SER-1', 'Série comptable', 'SERIE')]);
});

it('exporte le bordereau en SEDA sans condition de gestion', async () => {
    fixture.archivalIntake.sedaExport.mockResolvedValue(new Blob(['<xml/>'], { type: 'application/xml' }));
    const created = vi.fn(() => 'blob:seda');
    Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(<IntakeExchangePanel intake={intake()} canManage={false} editable={false} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Exporter le bordereau (SEDA)' }));
    await waitFor(() => expect(fixture.archivalIntake.sedaExport).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111'));
    await waitFor(() => expect(created).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /Reprendre un manifeste/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Intégrer au plan de description' })).toBeNull();
    click.mockRestore();
});

it('reprend un paquet vérifié et dit ce qui a été contrôlé', async () => {
    const onChanged = vi.fn();
    fixture.archivalIntake.importSedaFile.mockResolvedValue({ manifest: 'manifest.xml', units: 3, objects: 4, verified: 4, warnings: ['Le fichier « x.txt » du paquet n’est référencé par aucun objet.'] });
    render(<IntakeExchangePanel intake={intake()} canManage editable onChanged={onChanged} />);
    const input = screen.getByLabelText('Fichier SEDA (XML ou ZIP)') as HTMLInputElement;
    const file = new File(['PK'], 'paquet.zip', { type: 'application/zip' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByText(/Paquet vérifié\. 3 unités reprises dans le bordereau ; 4 objets déclarés, dont 4 vérifiés par empreinte\. 1 avertissement/)).toBeTruthy();
    expect(fixture.archivalIntake.importSedaFile).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', file);
    expect(onChanged).toHaveBeenCalled();
});

it('un fichier d’un autre type n’est pas envoyé', async () => {
    render(<IntakeExchangePanel intake={intake()} canManage editable onChanged={vi.fn()} />);
    const input = screen.getByLabelText('Fichier SEDA (XML ou ZIP)') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'bordereau.xlsx')] } });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(fixture.archivalIntake.importSedaFile).not.toHaveBeenCalled();
});

it('un versement reçu s’intègre sous une notice choisie, au niveau qui la suit', async () => {
    fixture.archivalIntake.integrationPreview.mockResolvedValue(preview());
    fixture.archivalIntake.integrate.mockResolvedValue({ integrationId: 'i', lines: [] });
    render(<IntakeExchangePanel intake={intake({ etape: 'RECU' } as Partial<ArchivalIntake>)} canManage editable={false} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Intégrer au plan de description' }));
    const dialog = await screen.findByRole('dialog');
    const parent = await within(dialog).findByLabelText(/^Notice de rattachement/);
    const submit = within(dialog).getByRole('button', { name: 'Intégrer' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(parent, { target: { value: 'f1' } });
    const level = within(dialog).getByLabelText(/^Niveau des notices créées/) as HTMLSelectElement;
    expect([...level.options].map(o => o.textContent)).toEqual(['Choisir…', 'Sous-fonds', 'Série', 'Sous-série', 'Dossier', 'Pièce']);
    fireEvent.change(level, { target: { value: 'SERIE' } });
    expect(await within(dialog).findByText(/2 lignes à intégrer/)).toBeTruthy();
    expect(within(dialog).getByText('Registre A')).toBeTruthy();
    expect(within(dialog).getByText(/1 absente, laissée de côté/)).toBeTruthy();
    await waitFor(() => expect((within(dialog).getByRole('button', { name: 'Intégrer' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Intégrer' }));
    await waitFor(() => expect(fixture.archivalIntake.integrate).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', 'f1', 'SERIE'));
});

it('une référence déjà prise bloque l’intégration et l’écran le dit', async () => {
    fixture.archivalIntake.integrationPreview.mockResolvedValue(preview({
        eligible: [{ lineId: 'l1', rank: 1, reference: 'REG-A', title: 'Registre A', finding: 'CONFORME', problems: ['Cette référence existe déjà dans le plan de description de l’institution.'] }]
    }));
    render(<IntakeExchangePanel intake={intake({ etape: 'RECU' } as Partial<ArchivalIntake>)} canManage editable={false} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Intégrer au plan de description' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(await within(dialog).findByLabelText(/^Notice de rattachement/), { target: { value: 'f1' } });
    fireEvent.change(within(dialog).getByLabelText(/^Niveau des notices créées/), { target: { value: 'SERIE' } });
    expect(await within(dialog).findByText(/existe déjà dans le plan de description/)).toBeTruthy();
    expect((within(dialog).getByRole('button', { name: 'Intégrer' }) as HTMLButtonElement).disabled).toBe(true);
});

it('l’historique des intégrations se lit par le code de la notice, pas par un identifiant', async () => {
    fixture.archivalIntake.integrations.mockResolvedValue([{ id: 'h1', entryId: 'e', parentId: 'f1', parentCode: 'FONDS-1', parentTitle: 'Fonds du ministère', level: 'SERIE', lines: 2, createdById: 'ab', createdAt: '2026-10-10T09:00:00Z' }]);
    render(<IntakeExchangePanel intake={intake({ etape: 'RECU' } as Partial<ArchivalIntake>)} canManage={false} editable={false} onChanged={vi.fn()} />);
    expect(await screen.findByText(/2 notices/)).toBeTruthy();
    expect(screen.getByText(/FONDS-1 — Fonds du ministère/)).toBeTruthy();
    expect(screen.getByText(/Agent ab/)).toBeTruthy();
});

const TYPE = '33333333-3333-4333-8333-333333333333';
const depositReport = (over: Record<string, unknown> = {}) => ({ entryId: 'e', units: 2, documents: 2, deposited: 3, alreadyDeposited: 0, failed: 0, skipped: [], objects: [], ...over });

it('dépose le contenu d’un paquet pour un versement reçu : type, confidentialité, bilan', async () => {
    const onChanged = vi.fn();
    fixture.records.documentTypes.mockResolvedValue([{ id: TYPE, code: 'REG', label: 'Registre', family: null, status: 'ACTIF' }, { id: 'x', code: 'OLD', label: 'Ancien type', family: null, status: 'INACTIF' }]);
    fixture.archivalIntake.depositPackage.mockResolvedValue(depositReport({ skipped: ['La ligne « REG-3 » n’est pas constatée présente : ses objets ne sont pas déposés.'] }));
    render(<IntakeExchangePanel intake={intake({ etape: 'RECU' })} canManage editable={false} onChanged={onChanged} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Déposer le contenu du paquet' }));
    const dialog = await screen.findByRole('dialog');
    const submit = within(dialog).getByRole('button', { name: 'Déposer' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    const type = await within(dialog).findByLabelText(/Type des documents créés/) as HTMLSelectElement;
    expect(Array.from(type.options).map(o => o.textContent)).not.toContain('Ancien type');
    fireEvent.change(type, { target: { value: TYPE } });
    fireEvent.change(within(dialog).getByLabelText(/Confidentialité/), { target: { value: 'CONFIDENTIEL' } });
    const file = new File(['PK'], 'paquet.zip', { type: 'application/zip' });
    fireEvent.change(within(dialog).getByLabelText('Paquet ZIP'), { target: { files: [file] } });
    await waitFor(() => expect(submit.disabled).toBe(false));
    fireEvent.click(submit);
    expect(await within(dialog).findByText(/3 fichiers déposés pour 2 unités/)).toBeTruthy();
    expect(fixture.archivalIntake.depositPackage).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', file, { documentTypeId: TYPE, confidentiality: 'CONFIDENTIEL' });
    expect(within(dialog).getByText(/REG-3/)).toBeTruthy();
    expect(onChanged).toHaveBeenCalled();
});

it('un objet refusé est nommé avec sa cause, et le renvoi du même paquet est proposé', async () => {
    fixture.records.documentTypes.mockResolvedValue([{ id: TYPE, code: 'REG', label: 'Registre', family: null, status: 'ACTIF' }]);
    fixture.archivalIntake.depositPackage.mockResolvedValue(depositReport({ deposited: 1, failed: 1,
        objects: [{ path: 'objets/a.pdf', lineRank: 1, lineReference: 'REG-1', status: 'DEPOSE', documentId: 'd', fileId: 'f', errorCode: null },
            { path: 'objets/b.pdf', lineRank: 2, lineReference: 'REG-2', status: 'ECHEC', documentId: 'd2', fileId: null, errorCode: 'SCAN_INFECTED' }] }));
    render(<IntakeExchangePanel intake={intake({ etape: 'RECU' })} canManage editable={false} onChanged={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Déposer le contenu du paquet' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(await within(dialog).findByLabelText(/Type des documents créés/), { target: { value: TYPE } });
    fireEvent.change(within(dialog).getByLabelText('Paquet ZIP'), { target: { files: [new File(['PK'], 'paquet.zip')] } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Déposer' }));
    expect(await within(dialog).findByText(/1 en échec \(renvoyez le même paquet pour les retenter\)/)).toBeTruthy();
    expect(within(dialog).getByText(/refusé par l’antivirus/)).toBeTruthy();
    expect(within(dialog).getByText('objets/b.pdf')).toBeTruthy();
});

it('le dépôt n’est proposé qu’à un versement reçu et à une personne qui gère', async () => {
    const { unmount } = render(<IntakeExchangePanel intake={intake({ etape: 'PREPARATION' })} canManage editable onChanged={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Déposer le contenu du paquet' })).toBeNull();
    unmount();
    render(<IntakeExchangePanel intake={intake({ etape: 'RECU' })} canManage={false} editable={false} onChanged={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Déposer le contenu du paquet' })).toBeNull();
});

it('l’historique du dépôt liste chaque fichier avec son document ou sa cause d’échec', async () => {
    fixture.archivalIntake.deposits.mockResolvedValue([
        { path: 'objets/a.pdf', lineId: 'l1', lineRank: 1, lineReference: 'REG-1', status: 'DEPOSE', documentId: 'd', documentReference: 'V-2026-001-0001', fileId: 'f', errorCode: null, attempts: 1, updatedAt: '2026-10-12T10:00:00Z' },
        { path: 'objets/b.pdf', lineId: 'l2', lineRank: 2, lineReference: 'REG-2', status: 'ECHEC', documentId: 'd2', documentReference: 'V-2026-001-0002', fileId: null, errorCode: 'FILE_SIGNATURE_MISMATCH', attempts: 2, updatedAt: '2026-10-12T10:00:00Z' }]);
    render(<IntakeExchangePanel intake={intake({ etape: 'RECU' })} canManage={false} editable={false} onChanged={vi.fn()} />);
    expect(await screen.findByText(/Contenu déposé : 1 fichier · 1 en échec/)).toBeTruthy();
    expect(screen.getByText('V-2026-001-0001')).toBeTruthy();
    expect(screen.getByText(/le contenu ne correspond pas au type annoncé · 2 tentatives/)).toBeTruthy();
});
