import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

// Le choix de l'institution d'une création : figé sur l'institution où l'on travaille (ou celle du compte), libre pour l'administration centrale qui ne travaille dans aucune.
const INST_A = '00000000-0000-4000-8000-0000000000a1';
const INST_B = '00000000-0000-4000-8000-0000000000b2';
const grant = (over: Record<string, unknown> = {}) => ({ permission: 'IAM_DEPARTMENT_MANAGE', roleCode: 'AUTRE', scope: 'INSTITUTION', institutionId: INST_A, departmentId: null, delegationId: null, expiresAt: null, ...over });
const platformAdmin = { user: { id: 'u1', status: 'ACTIF', accountType: 'USER', institutionId: null, departmentId: null, scope: 'NATIONAL' }, grants: [grant({ roleCode: 'SNAE_PLATFORM_ADMIN', scope: 'NATIONAL', institutionId: null })] };
const institutionAccount = { user: { id: 'u2', status: 'ACTIF', accountType: 'USER', institutionId: INST_A, departmentId: null, scope: 'INSTITUTION' }, grants: [grant()] };
const fixture = vi.hoisted(() => ({ me: null as unknown, scope: { institutionId: null, departmentId: null } as { institutionId: string | null; departmentId: string | null } }));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: fixture.scope }) }));
vi.mock('../../src/ui/ReferencePicker', () => ({
    ReferencePicker: ({ label, value, onChange, disabled, scope }: { label: string; value: string; onChange: (id: string) => void; disabled?: boolean; scope?: { institutionId?: string } }) =>
        <button type="button" aria-label={label} disabled={disabled} data-scope={scope?.institutionId ?? ''} onClick={() => onChange('choisie')}>{value || 'vide'}</button>
}));
import { InstitutionChoice } from '../../src/ui/InstitutionChoice';

const picker = () => screen.getByRole('button', { name: 'Sélectionner une institution' }) as HTMLButtonElement;

beforeEach(() => { fixture.me = platformAdmin; fixture.scope = { institutionId: null, departmentId: null }; });

it('l’administration centrale qui ne travaille dans aucune institution choisit librement', () => {
    const onChange = vi.fn();
    render(<InstitutionChoice value="" onChange={onChange} />);
    expect(picker().disabled).toBe(false);
    fireEvent.click(picker());
    expect(onChange).toHaveBeenCalledWith('choisie');
    expect(screen.queryByText(/la création lui est rattachée/)).toBeNull();
});

it('travailler dans une institution fige le choix sur elle et le dit', () => {
    fixture.scope = { institutionId: INST_B, departmentId: null };
    const onChange = vi.fn();
    render(<InstitutionChoice value="" onChange={onChange} />);
    expect(picker().disabled).toBe(true);
    expect(picker().textContent).toBe(INST_B);
    expect(onChange).toHaveBeenCalledWith(INST_B);
    expect(screen.queryByText(/Vous travaillez dans cette institution : la création lui est rattachée/)).not.toBeNull();
});

it('un formulaire déjà à la bonne institution n’est pas réécrit', () => {
    fixture.scope = { institutionId: INST_B, departmentId: null };
    const onChange = vi.fn();
    render(<InstitutionChoice value={INST_B} onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
});

it('un compte d’institution est figé sur son institution, même sans institution de travail', () => {
    fixture.me = institutionAccount;
    const onChange = vi.fn();
    render(<InstitutionChoice value="" onChange={onChange} />);
    expect(picker().disabled).toBe(true);
    expect(onChange).toHaveBeenCalledWith(INST_A);
});

it('un champ déjà verrouillé par le formulaire garde sa valeur', () => {
    fixture.scope = { institutionId: INST_B, departmentId: null };
    const onChange = vi.fn();
    render(<InstitutionChoice value={INST_A} onChange={onChange} disabled />);
    expect(onChange).not.toHaveBeenCalled();
    expect(picker().textContent).toBe(INST_A);
    expect(screen.queryByText(/la création lui est rattachée/)).toBeNull();
});

it('une origine d’archives ne suit pas l’institution de travail de l’administration centrale', () => {
    fixture.scope = { institutionId: INST_B, departmentId: null };
    const onChange = vi.fn();
    render(<InstitutionChoice value="" onChange={onChange} followWorkspace={false} nullable />);
    expect(picker().disabled).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
});

it('une origine d’archives reste celle du compte d’institution', () => {
    fixture.me = institutionAccount;
    fixture.scope = { institutionId: INST_B, departmentId: null };
    const onChange = vi.fn();
    render(<InstitutionChoice value="" onChange={onChange} followWorkspace={false} />);
    expect(picker().disabled).toBe(true);
    expect(onChange).toHaveBeenCalledWith(INST_A);
    expect(screen.queryByText(/Votre compte est rattaché à cette institution/)).not.toBeNull();
});
