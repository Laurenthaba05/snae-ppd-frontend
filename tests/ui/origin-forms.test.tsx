import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

// L'origine à la création : un projet de numérisation, une archive physique et un versement envoient l'institution et la direction choisies, ou null quand on n'en choisit pas ;
// l'institution et la direction versantes d'un versement portent leurs propres noms de champs.
const fixture = vi.hoisted(() => ({
    epoch: 1, me: { user: { id: 'u1' } } as unknown,
    digitization: { command: vi.fn() }, physicalArchives: { command: vi.fn() }, archivalIntake: { command: vi.fn(), agreements: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: () => true, platform: () => true }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: { institutionId: null, departmentId: null } }) }));
vi.mock('../../src/ui/ResourceDetails', () => ({ ResourceDetailsButton: () => null }));
vi.mock('../../src/ui/OptionalFields', () => ({ OptionalFields: () => null, useOptionalFields: () => ({ payload: () => ({}), values: {} }) }));
vi.mock('../../src/ui/names', () => ({ EntityName: ({ id }: { id: string }) => <span>{id}</span>, DocumentName: ({ id }: { id: string }) => <span>{id}</span> }));
vi.mock('../../src/ui/ReferencePicker', () => ({
    ReferencePicker: ({ kind, label, value, onChange, disabled }: { kind: string; label: string; value: string; onChange: (id: string) => void; disabled?: boolean }) =>
        <button type="button" aria-label={label} disabled={disabled} onClick={() => onChange(kind === 'institutions' ? 'inst-1' : 'dir-1')}>{value || 'vide'}</button>
}));
import { CreateProjectDialog } from '../../src/pages/Digitization';
import { CreateArchiveDialog } from '../../src/pages/PhysicalArchives';
import { CreateIntakeDialog } from '../../src/pages/ArchivalIntake';

beforeEach(() => {
    fixture.epoch += 1;
    fixture.digitization.command.mockReset().mockResolvedValue({});
    fixture.physicalArchives.command.mockReset().mockResolvedValue({});
    fixture.archivalIntake.command.mockReset().mockResolvedValue({});
    fixture.archivalIntake.agreements.mockReset().mockResolvedValue([]);
});

const pickOrigin = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Sélectionner une institution' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sélectionner une direction ou un service' }));
};

// ------------------------------------------------------------------------------------------------ un projet de numérisation
it('un projet de numérisation envoie son institution et sa direction d’origine', async () => {
    const onCreated = vi.fn(); const onClose = vi.fn();
    render(<CreateProjectDialog onClose={onClose} onCreated={onCreated} />);
    fireEvent.change(screen.getByLabelText(/^Nom/), { target: { value: 'Registres 1950' } });
    pickOrigin();
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }));
    await waitFor(() => expect(fixture.digitization.command).toHaveBeenCalledTimes(1));
    const [path, body, key, method] = fixture.digitization.command.mock.calls[0]!;
    expect(path).toBe('/projects'); expect(method).toBe('POST'); expect(typeof key).toBe('string');
    expect(body).toMatchObject({ nom: 'Registres 1950', institutionId: 'inst-1', departmentId: 'dir-1' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onCreated).toHaveBeenCalled();
});

it('un projet sans origine envoie deux null : l’origine reste facultative', async () => {
    render(<CreateProjectDialog onClose={() => {}} onCreated={() => {}} />);
    fireEvent.change(screen.getByLabelText(/^Nom/), { target: { value: 'Sans origine' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }));
    await waitFor(() => expect(fixture.digitization.command).toHaveBeenCalled());
    expect(fixture.digitization.command.mock.calls[0]![1]).toMatchObject({ institutionId: null, departmentId: null });
});

// ------------------------------------------------------------------------------------------------ une archive physique
it('une archive physique envoie son origine avec sa cote et son unité de stockage', async () => {
    const onClose = vi.fn();
    render(<CreateArchiveDialog unitId="unit-1" onClose={onClose} onCreated={() => {}} />);
    fireEvent.change(screen.getByLabelText(/^Cote/), { target: { value: 'ARCH-1950-001' } });
    pickOrigin();
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }));
    await waitFor(() => expect(fixture.physicalArchives.command).toHaveBeenCalledTimes(1));
    const [path, body] = fixture.physicalArchives.command.mock.calls[0]!;
    expect(path).toBe('/archives');
    expect(body).toMatchObject({ uniteStockageId: 'unit-1', cote: 'ARCH-1950-001', institutionId: 'inst-1', departmentId: 'dir-1' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
});

it('une archive sans origine envoie deux null (le serveur reprend celle du document quand il y en a un)', async () => {
    render(<CreateArchiveDialog unitId="unit-1" onClose={() => {}} onCreated={() => {}} />);
    fireEvent.change(screen.getByLabelText(/^Cote/), { target: { value: 'ARCH-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }));
    await waitFor(() => expect(fixture.physicalArchives.command).toHaveBeenCalled());
    expect(fixture.physicalArchives.command.mock.calls[0]![1]).toMatchObject({ institutionId: null, departmentId: null });
});

// ------------------------------------------------------------------------------------------------ un versement
it('un versement envoie son institution et sa direction versantes sous leurs noms de champs', async () => {
    const onClose = vi.fn();
    render(<CreateIntakeDialog onClose={onClose} onCreated={() => {}} />);
    fireEvent.change(screen.getByLabelText(/^Numéro/), { target: { value: 'V-2026-001' } });
    fireEvent.change(screen.getByLabelText(/^Date d’entrée/), { target: { value: '2026-10-01T09:00' } });
    expect(screen.getByText('Institution versante')).toBeTruthy(); expect(screen.getByText('Direction ou service versant')).toBeTruthy();
    pickOrigin();
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }));
    await waitFor(() => expect(fixture.archivalIntake.command).toHaveBeenCalledTimes(1));
    const [path, body] = fixture.archivalIntake.command.mock.calls[0]!;
    expect(path).toBe('/entries');
    expect(body).toMatchObject({ numero: 'V-2026-001', sourceInstitutionId: 'inst-1', sourceDepartmentId: 'dir-1' });
    expect(body).not.toHaveProperty('institutionId');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
});

it('un versement sans institution versante envoie deux null', async () => {
    render(<CreateIntakeDialog onClose={() => {}} onCreated={() => {}} />);
    fireEvent.change(screen.getByLabelText(/^Numéro/), { target: { value: 'V-2' } });
    fireEvent.change(screen.getByLabelText(/^Date d’entrée/), { target: { value: '2026-10-01T09:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }));
    await waitFor(() => expect(fixture.archivalIntake.command).toHaveBeenCalled());
    expect(fixture.archivalIntake.command.mock.calls[0]![1]).toMatchObject({ sourceInstitutionId: null, sourceDepartmentId: null });
});

it('un refus du serveur sur l’origine est dit dans la fenêtre, qui reste ouverte avec la saisie', async () => {
    fixture.digitization.command.mockRejectedValue(new Error('Cette unité n’existe pas dans cette institution, ou elle est inactive.'));
    const onClose = vi.fn();
    render(<CreateProjectDialog onClose={onClose} onCreated={() => {}} />);
    fireEvent.change(screen.getByLabelText(/^Nom/), { target: { value: 'Projet' } });
    pickOrigin();
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }));
    expect(await screen.findByText('Cette unité n’existe pas dans cette institution, ou elle est inactive.')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByLabelText(/^Nom/) as HTMLInputElement).value).toBe('Projet');
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sélectionner une institution' }).textContent).toBe('inst-1');
});
