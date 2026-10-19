import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

// « Créer un département » : l'institution est celle où l'on travaille (ou celle du compte) ; l'administration centrale qui ne travaille dans aucune choisit librement.
const INST_A = '00000000-0000-4000-8000-0000000000a1';
const INST_B = '00000000-0000-4000-8000-0000000000b2';
const grant = (over: Record<string, unknown> = {}) => ({ permission: 'IAM_DEPARTMENT_MANAGE', roleCode: 'AUTRE', scope: 'INSTITUTION', institutionId: INST_A, departmentId: null, delegationId: null, expiresAt: null, ...over });
const platformAdmin = { user: { id: 'u1', status: 'ACTIF', accountType: 'USER', institutionId: null, departmentId: null, scope: 'NATIONAL' }, grants: [grant({ roleCode: 'SNAE_PLATFORM_ADMIN', scope: 'NATIONAL', institutionId: null })] };
const institutionAccount = { user: { id: 'u2', status: 'ACTIF', accountType: 'USER', institutionId: INST_A, departmentId: null, scope: 'INSTITUTION' }, grants: [grant()] };
const fixture = vi.hoisted(() => ({
    me: null as unknown, refresh: vi.fn(), api: { command: vi.fn() },
    scope: { institutionId: null, departmentId: null } as { institutionId: string | null; departmentId: string | null }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: fixture.scope }) }));
vi.mock('../../src/ui/CommandSummary', () => ({ CommandSummary: () => <div>Résumé</div> }));
vi.mock('../../src/ui/ReferencePicker', () => ({
    ReferencePicker: ({ kind, label, value, onChange, disabled }: { kind: string; label: string; value: string; onChange: (id: string) => void; disabled?: boolean }) =>
        <button type="button" aria-label={label} disabled={disabled} onClick={() => onChange(kind === 'institutions' ? INST_B : 'parent-1')}>{value || 'vide'}</button>
}));
import { EntityForm } from '../../src/pages/EntityForm';

const institutionPicker = () => screen.getByRole('button', { name: 'Sélectionner une institution' }) as HTMLButtonElement;
async function createDepartment() {
    fireEvent.change(screen.getByLabelText(/^Code/), { target: { value: 'DAF' } });
    fireEvent.change(screen.getByLabelText(/^Intitulé/), { target: { value: 'Direction administrative' } });
    fireEvent.click(screen.getByRole('button', { name: /Continuer/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Confirmer/ }));
    await waitFor(() => expect(fixture.api.command).toHaveBeenCalledTimes(1));
    return fixture.api.command.mock.calls[0]![1] as Record<string, unknown>;
}

beforeEach(() => {
    fixture.me = platformAdmin; fixture.scope = { institutionId: null, departmentId: null };
    fixture.refresh.mockReset(); fixture.api.command.mockReset().mockResolvedValue({});
});

it('dans l’institution de travail, le département lui est rattaché et le choix est figé', async () => {
    fixture.scope = { institutionId: INST_A, departmentId: null };
    render(<EntityForm kind="departments" onClose={() => {}} onSuccess={() => {}} />);
    expect(institutionPicker().disabled).toBe(true);
    expect(institutionPicker().textContent).toBe(INST_A);
    expect(screen.queryByText(/la création lui est rattachée/)).not.toBeNull();
    const body = await createDepartment();
    expect(body).toMatchObject({ institutionId: INST_A, code: 'DAF' });
});

it('un compte d’institution ne peut créer que dans la sienne, même sans institution de travail', async () => {
    fixture.me = institutionAccount;
    render(<EntityForm kind="departments" onClose={() => {}} onSuccess={() => {}} />);
    expect(institutionPicker().disabled).toBe(true);
    expect((await createDepartment()).institutionId).toBe(INST_A);
});

it('l’administration centrale sans institution de travail choisit librement', async () => {
    render(<EntityForm kind="departments" onClose={() => {}} onSuccess={() => {}} />);
    expect(institutionPicker().disabled).toBe(false);
    fireEvent.click(institutionPicker());
    expect((await createDepartment()).institutionId).toBe(INST_B);
});
