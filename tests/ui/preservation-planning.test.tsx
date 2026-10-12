import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { FileFormat, FileRelation, FormatRiskReport, PreservationAgent, PreservationRight } from '../../src/core/preservationPlanning';

const INST = '97571d20-3f49-497e-a185-dac22208eb3f';
const DOC = '80f0f431-a8f1-4da0-b0b2-bbca91b9a739';
const fixture = vi.hoisted(() => ({
    epoch: 1, demo: false, me: null as unknown, allowed: new Set<string>(),
    preservationPlanning: {
        agents: vi.fn(), createAgent: vi.fn(), retireAgent: vi.fn(), formats: vi.fn(), createFormat: vi.fn(), retireFormat: vi.fn(), formatRisk: vi.fn(), relations: vi.fn(),
        addRelation: vi.fn(), rights: vi.fn(), addRight: vi.fn(), retireRight: vi.fn(), premis: vi.fn(), packages: vi.fn(), downloadPackage: vi.fn(), oaisDiagnostic: vi.fn(),
        evaluateOais: vi.fn()
    },
    records: { versions: vi.fn(), files: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: { institutionId: INST, departmentId: null } }) }));
import { DocumentPremisPanel, PreservationPlanningSection } from '../../src/ui/PreservationPlanning';

const report = (over: Partial<FormatRiskReport> = {}): FormatRiskReport => ({
    institutionId: INST, generatedAt: '2026-10-10T09:00:00Z', totalFiles: 10, totalBytes: 10240, evaluatedFiles: 7, unevaluatedFiles: 3, atRiskFiles: 2, atRiskBytes: 2048,
    rows: [
        { mediaType: 'application/pdf', files: 5, bytes: 5120, registered: true, name: 'PDF', risk: 'MOYEN', perennity: 'ACCEPTE', targetMediaType: null, scope: 'NATIONAL', atRisk: false },
        { mediaType: 'application/x-shockwave-flash', files: 2, bytes: 2048, registered: true, name: 'Flash', risk: 'CRITIQUE', perennity: 'OBSOLETE', targetMediaType: 'video/mp4', scope: 'INSTITUTION', atRisk: true },
        { mediaType: 'image/jpeg', files: 3, bytes: 3072, registered: false, name: null, risk: null, perennity: null, targetMediaType: null, scope: null, atRisk: false }
    ], ...over
});
const format = (over: Partial<FileFormat> = {}): FileFormat => ({
    id: 'fmt-1', institutionId: INST, mediaType: 'application/x-shockwave-flash', name: 'Flash', extension: 'swf', risk: 'CRITIQUE', perennity: 'OBSOLETE', motive: 'Lecteur abandonné',
    targetMediaType: 'video/mp4', source: null, status: 'ACTIF', createdAt: '2026-10-01T08:00:00Z', ...over
});
const agent = (over: Partial<PreservationAgent> = {}): PreservationAgent => ({
    id: 'agent-1', institutionId: INST, type: 'LOGICIEL', name: 'Convertisseur', version: '2.1', identifier: null, description: null, status: 'ACTIF', createdAt: '2026-10-01T08:00:00Z', ...over
});
const relation = (): FileRelation => ({ id: 'rel-1', sourceFileId: 'f1', sourceName: 'scan.tif', targetFileId: 'f2', targetName: 'scan.pdf', type: 'MIGRATION', eventId: null, createdAt: '2026-10-01T08:00:00Z' });
const right = (over: Partial<PreservationRight> = {}): PreservationRight => ({
    id: 'right-1', documentId: DOC, basis: 'DROIT_AUTEUR', holder: 'Famille Diallo', act: 'DIFFUSER', granted: false, restriction: 'Jusqu’à accord écrit', reference: 'Courrier du 3 mars',
    startDate: '2026-01-01', endDate: null, status: 'ACTIF', retirementReason: null, createdAt: '2026-10-01T08:00:00Z', ...over
});

const diagnostic = () => ({
    institutionId: INST, generatedAt: '2026-10-10T09:00:00Z', total: 3, evaluated: 2, counts: { CONFORME: 1, NON_CONFORME: 1, A_EVALUER: 1 },
    indicators: [
        { code: 'FIXITE_CONTROLEE', domain: 'STOCKAGE', title: 'Fixité contrôlée', description: 'Chaque fichier a subi un contrôle récent.', kind: 'AUTOMATIQUE', status: 'NON_CONFORME',
          measure: '0 sur 4 (0 %) contrôlés avec succès', justification: null, evaluatedById: null, evaluatedAt: null },
        { code: 'PAQUETS_EXPORTES', domain: 'ACCES', title: 'Paquets d’archivage et de diffusion', description: 'Export démontré.', kind: 'AUTOMATIQUE', status: 'CONFORME',
          measure: '1 paquet(s) d’archivage, 1 paquet(s) de diffusion exportés', justification: null, evaluatedById: null, evaluatedAt: null },
        { code: 'PLAN_PRESERVATION', domain: 'PLANIFICATION', title: 'Plan de préservation', description: 'Un plan approuvé existe.', kind: 'DECLARATIF', status: 'A_EVALUER',
          measure: null, justification: null, evaluatedById: null, evaluatedAt: null }
    ]
});
const exported = () => ({ id: 'pkg-1', documentId: DOC, profile: 'AIP', format: 'BAGIT', fileName: 'AIP-DOC-20261010.zip', size: 4096, sha256: 'a'.repeat(64), files: 3, versions: 1,
    exportedById: 'u1', exportedAt: '2026-10-10T09:00:00Z' });

beforeEach(() => {
    fixture.epoch += 1;
    fixture.demo = false;
    fixture.allowed = new Set(['PRESERVATION_PLANNING_READ']);
    for (const fn of [...Object.values(fixture.preservationPlanning), ...Object.values(fixture.records)]) fn.mockReset();
    fixture.preservationPlanning.formatRisk.mockResolvedValue(report());
    fixture.preservationPlanning.formats.mockResolvedValue([format()]);
    fixture.preservationPlanning.agents.mockResolvedValue([agent()]);
    fixture.preservationPlanning.relations.mockResolvedValue([]);
    fixture.preservationPlanning.rights.mockResolvedValue([]);
    fixture.preservationPlanning.packages.mockResolvedValue([]);
    fixture.preservationPlanning.oaisDiagnostic.mockResolvedValue(diagnostic());
});

it('le diagnostic montre ce qui est à migrer et dit « non évalué » pour un format absent du registre', async () => {
    render(<PreservationPlanningSection />);
    expect(await screen.findByText(/2 fichiers \(2 Ko\) dans un format à risque ou obsolète : à migrer/)).toBeTruthy();
    const diagnostic = screen.getByRole('region', { name: 'Diagnostic des formats' });
    const row = within(diagnostic).getByText('application/x-shockwave-flash').closest('tr')!;
    expect(within(row).getByText('Risque critique')).toBeTruthy();
    expect(within(row).getByText('Obsolète')).toBeTruthy();
    expect(within(row).getByText('video/mp4')).toBeTruthy();
    const jpeg = within(diagnostic).getByText('image/jpeg').closest('tr')!;
    expect(within(jpeg).getByText('Non évalué')).toBeTruthy();
});

it('rien n’apparaît en démonstration ni sans habilitation de planification', async () => {
    fixture.allowed = new Set();
    const { container, unmount } = render(<PreservationPlanningSection />);
    expect(container.textContent).toBe('');
    unmount();
    fixture.allowed = new Set(['PRESERVATION_PLANNING_READ']);
    fixture.demo = true;
    const demo = render(<PreservationPlanningSection />);
    expect(demo.container.textContent).toBe('');
});

it('la lecture seule ne propose ni inscription ni retrait', async () => {
    render(<PreservationPlanningSection />);
    await screen.findByText('Registre des formats');
    expect(screen.queryByRole('button', { name: 'Inscrire un format' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Nouvel agent' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retirer' })).toBeNull();
});

it('inscrit un format à risque seulement avec sa justification', async () => {
    fixture.allowed = new Set(['PRESERVATION_PLANNING_READ', 'PRESERVATION_PLANNING_MANAGE']);
    fixture.preservationPlanning.createFormat.mockResolvedValue(format({ id: 'fmt-2' }));
    render(<PreservationPlanningSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Inscrire un format' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/^Type de média/), { target: { value: 'application/x-shockwave-flash' } });
    fireEvent.change(within(dialog).getByLabelText(/^Nom/), { target: { value: 'Flash' } });
    fireEvent.change(within(dialog).getByLabelText(/^Niveau de risque/), { target: { value: 'CRITIQUE' } });
    fireEvent.change(within(dialog).getByLabelText(/^Pérennité/), { target: { value: 'OBSOLETE' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Inscrire' }));
    expect(await within(dialog).findByText(/se justifie/)).toBeTruthy();
    expect(fixture.preservationPlanning.createFormat).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText(/^Justification/), { target: { value: 'Lecteur abandonné par son éditeur' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Inscrire' }));
    await waitFor(() => expect(fixture.preservationPlanning.createFormat).toHaveBeenCalledTimes(1));
    expect(fixture.preservationPlanning.createFormat.mock.calls[0]![0]).toMatchObject({
        institutionId: INST, mediaType: 'application/x-shockwave-flash', risk: 'CRITIQUE', perennity: 'OBSOLETE', motive: 'Lecteur abandonné par son éditeur'
    });
});

it('une inscription nationale ne se retire pas depuis l’institution, une inscription de l’institution se retire', async () => {
    fixture.allowed = new Set(['PRESERVATION_PLANNING_READ', 'PRESERVATION_PLANNING_MANAGE']);
    fixture.preservationPlanning.formats.mockResolvedValue([format(), format({ id: 'fmt-n', institutionId: null, mediaType: 'application/pdf', name: 'PDF', risk: 'MOYEN', perennity: 'ACCEPTE', motive: null, targetMediaType: null })]);
    fixture.preservationPlanning.agents.mockResolvedValue([]);
    fixture.preservationPlanning.retireFormat.mockResolvedValue(format({ status: 'RETIRE' }));
    render(<PreservationPlanningSection />);
    const retire = await screen.findAllByRole('button', { name: 'Retirer' });
    expect(retire).toHaveLength(1);
    fireEvent.click(retire[0]!);
    await waitFor(() => expect(fixture.preservationPlanning.retireFormat).toHaveBeenCalledWith('fmt-1', expect.any(String)));
});

it('la fiche du document liste ses relations et ses droits et exporte PREMIS', async () => {
    fixture.preservationPlanning.relations.mockResolvedValue([relation()]);
    fixture.preservationPlanning.rights.mockResolvedValue([right()]);
    fixture.preservationPlanning.premis.mockResolvedValue(new Blob(['<premis/>'], { type: 'application/xml' }));
    const created = vi.fn(() => 'blob:premis');
    Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(<DocumentPremisPanel documentId={DOC} reference="DOC-1950-01" canManage={false} />);
    expect(await screen.findByText('scan.tif')).toBeTruthy();
    expect(screen.getByText(/migré vers/)).toBeTruthy();
    expect(screen.getByText('Diffuser — interdit')).toBeTruthy();
    expect(screen.getByText('Famille Diallo')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Inscrire un droit' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Exporter en XML' }));
    await waitFor(() => expect(fixture.preservationPlanning.premis).toHaveBeenCalledWith(DOC));
    await waitFor(() => expect(created).toHaveBeenCalled());
    click.mockRestore();
});

it('relie deux fichiers du document par leurs noms et retire un droit avec un motif', async () => {
    fixture.preservationPlanning.rights.mockResolvedValue([right()]);
    fixture.preservationPlanning.addRelation.mockResolvedValue(relation());
    fixture.preservationPlanning.retireRight.mockResolvedValue(right({ status: 'RETIRE' }));
    fixture.records.versions.mockResolvedValue([{ id: 'v1', documentId: DOC, number: 1, state: 'BROUILLON', sealed: false, sealedHash: null, sealedAt: null }]);
    fixture.records.files.mockResolvedValue([
        { id: 'f1', versionId: 'v1', originalFilename: 'scan.tif', mediaType: 'image/tiff', role: 'MAITRE_CONSERVATION', size: 10, state: 'VALIDE', scanStatus: 'CLEAN', master: true, validatedAt: null },
        { id: 'f2', versionId: 'v1', originalFilename: 'scan.pdf', mediaType: 'application/pdf', role: 'DERIVE_CONSULTATION', size: 5, state: 'VALIDE', scanStatus: 'CLEAN', master: false, validatedAt: null }
    ]);
    render(<DocumentPremisPanel documentId={DOC} reference="DOC-1950-01" canManage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Relier deux fichiers' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findAllByRole('option', { name: 'scan.tif (version 1)' });
    fireEvent.change(within(dialog).getByLabelText(/^Fichier de départ/), { target: { value: 'f1' } });
    fireEvent.change(within(dialog).getByLabelText(/^Fichier d’arrivée/), { target: { value: 'f2' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Relier' }));
    await waitFor(() => expect(fixture.preservationPlanning.addRelation).toHaveBeenCalledWith('f1', 'f2', 'MIGRATION', null, expect.any(String)));

    fireEvent.click(await screen.findByRole('button', { name: 'Retirer' }));
    const prompts = await screen.findAllByRole('dialog');
    const prompt = prompts[prompts.length - 1]!;
    fireEvent.change(within(prompt).getByRole('textbox'), { target: { value: 'Accord écrit des ayants droit reçu' } });
    fireEvent.click(within(prompt).getByRole('button', { name: 'Retirer le droit' }));
    await waitFor(() => expect(fixture.preservationPlanning.retireRight).toHaveBeenCalledWith('right-1', 'Accord écrit des ayants droit reçu', expect.any(String)));
});

it('l’auto-diagnostic sépare ce qui est mesuré de ce qui est déclaré et ne s’évalue qu’avec l’habilitation de gestion', async () => {
    fixture.allowed = new Set(['PRESERVATION_DIAGNOSTIC_READ']);
    const { unmount } = render(<PreservationPlanningSection />);
    expect(await screen.findByText(/2 indicateurs évalués sur 3 : 1 conforme, 0 partiel, 1 non conforme, 1 à évaluer/)).toBeTruthy();
    const mesure = screen.getByText('Fixité contrôlée').closest('tr')!;
    expect(within(mesure).getByText('Mesuré')).toBeTruthy();
    expect(within(mesure).getByText('Non conforme')).toBeTruthy();
    expect(within(mesure).getByText(/0 sur 4/)).toBeTruthy();
    const declare = screen.getByText('Plan de préservation').closest('tr')!;
    expect(within(declare).getByText('Déclaré')).toBeTruthy();
    expect(within(declare).getByText('À évaluer')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Évaluer' })).toBeNull();
    expect(screen.queryByText('Registre des formats')).toBeNull();
    unmount();
});

it('une évaluation déclarative se justifie puis s’enregistre', async () => {
    fixture.allowed = new Set(['PRESERVATION_DIAGNOSTIC_READ', 'PRESERVATION_DIAGNOSTIC_MANAGE']);
    fixture.preservationPlanning.evaluateOais.mockResolvedValue({});
    render(<PreservationPlanningSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Évaluer' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer l’évaluation' }));
    expect(await within(dialog).findByText(/justification est obligatoire/)).toBeTruthy();
    expect(fixture.preservationPlanning.evaluateOais).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText(/^Évaluation/), { target: { value: 'PARTIEL' } });
    fireEvent.change(within(dialog).getByLabelText(/^Justification/), { target: { value: 'Plan rédigé, approbation prévue en décembre' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer l’évaluation' }));
    await waitFor(() => expect(fixture.preservationPlanning.evaluateOais).toHaveBeenCalledWith(INST, 'PLAN_PRESERVATION', 'PARTIEL', 'Plan rédigé, approbation prévue en décembre', expect.any(String)));
});

it('l’export d’un paquet n’est proposé qu’avec l’habilitation, et le registre des paquets se lit', async () => {
    fixture.preservationPlanning.packages.mockResolvedValue([exported()]);
    fixture.preservationPlanning.downloadPackage.mockResolvedValue(new Blob(['zip'], { type: 'application/zip' }));
    const { unmount } = render(<DocumentPremisPanel documentId={DOC} reference="DOC-1950-01" canManage={false} />);
    await screen.findByText('Description PREMIS');
    expect(screen.queryByText('Paquets exportés')).toBeNull();
    unmount();
    const created = vi.fn(() => 'blob:zip');
    Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(<DocumentPremisPanel documentId={DOC} reference="DOC-1950-01" canManage={false} canExport />);
    expect(await screen.findByText('Paquet d’archivage (AIP)')).toBeTruthy();
    expect(screen.getByText('3 fichiers, 1 version, 4 Ko')).toBeTruthy();
    expect(screen.getByText('aaaaaaaaaaaaaaaa…')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Exporter un paquet de diffusion' }));
    await waitFor(() => expect(fixture.preservationPlanning.downloadPackage).toHaveBeenCalledWith(DOC, 'DIP'));
    await waitFor(() => expect(created).toHaveBeenCalled());
    click.mockRestore();
});
