import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { ArchivalIntake } from '../../src/core/types';
import type { IntegrationPreview } from '../../src/core/intakeExchange';

const INST = '97571d20-3f49-497e-a185-dac22208eb3f';
const fixture = vi.hoisted(() => ({
    epoch: 1, me: null as unknown,
    archivalIntake: { sedaExport: vi.fn(), importSedaFile: vi.fn(), integrationPreview: vi.fn(), integrate: vi.fn(), integrations: vi.fn() },
    records: { transport: { request: vi.fn() } }
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
    for (const fn of [...Object.values(fixture.archivalIntake), fixture.records.transport.request]) fn.mockReset();
    fixture.archivalIntake.integrations.mockResolvedValue([]);
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
