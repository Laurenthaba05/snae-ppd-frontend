import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Me } from '../../src/core/types';
const f = vi.hoisted(() => ({ me: null as Me | null, api: { command: vi.fn() }, refresh: vi.fn() }));
vi.mock('../../src/auth/session', () => ({ useSession: () => f }));
import { extractionReviewSelfOption, ExtractionReviewSelfAssignmentDialog } from '../../src/ui/ExtractionReviewSelfAssignment';
const user = '11111111-1111-4111-8111-111111111111', role = '22222222-2222-4222-8222-222222222222';
const institution = '33333333-3333-4333-8333-333333333333';
beforeEach(() => {
    f.api.command.mockReset().mockResolvedValue({}); f.refresh.mockReset().mockResolvedValue(undefined);
    f.me = { user: { id: user, status: 'ACTIF', accountType: 'USER', scope: 'NATIONAL', email: 'admin@example.test' }, truncated: false,
        grants: [{ roleId: '44444444-4444-4444-8444-444444444444', roleCode: 'SNAE_PLATFORM_ADMIN', permission: 'IAM_ASSIGNMENT_MANAGE',
            scope: 'NATIONAL', institutionId: null, departmentId: null, delegationId: null, expiresAt: null }],
        extractionReviewSelfAssignment: { roleId: role, roleCode: 'RELECTEUR_EXTRACTION', roleName: 'Relecteur d’extraction', institutionId: institution, institutionName: 'Institution de recette' } } as Me;
});
it('exige la capacité du serveur et le titulaire, même pour un administrateur central', () => {
    expect(extractionReviewSelfOption(f.me, user)).toBeTruthy();
    expect(extractionReviewSelfOption(f.me, 'autre')).toBeNull();
    expect(extractionReviewSelfOption({ ...f.me!, extractionReviewSelfAssignment: null }, user)).toBeNull();
    expect(extractionReviewSelfOption({ ...f.me!, grants: [] }, user)).toBeNull();
    expect(extractionReviewSelfOption({ ...f.me!, user: { ...f.me!.user, status: 'SUSPENDU' } }, user)).toBeNull();
});
it('ne propose plus une attribution directe active et ignore les droits expirés', () => {
    f.me!.grants.push({ ...f.me!.grants[0]!, roleId: role, roleCode: 'RELECTEUR_EXTRACTION', scope: 'INSTITUTION', institutionId: institution });
    expect(extractionReviewSelfOption(f.me, user)).toBeNull();
    f.me!.grants[1]!.expiresAt = '2020-01-01T00:00:00Z';
    expect(extractionReviewSelfOption(f.me, user)).toBeTruthy();
});
it('fige le rôle, le bénéficiaire et le périmètre et exige une confirmation avant envoi', async () => {
    render(<ExtractionReviewSelfAssignmentDialog onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByText('Institution de recette', { selector: 'p' })).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
    fireEvent.change(screen.getByLabelText('Motif de mon attribution *'), { target: { value: 'Décision nominative d’extraction' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    expect(f.api.command).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmer mon attribution' }));
    await waitFor(() => expect(f.api.command).toHaveBeenCalledWith('/role-assignments', {
        utilisateurId: user, roleId: role, scope: 'INSTITUTION', institutionId: institution, departmentId: null,
        dateDebut: null, dateFin: null, motif: 'Décision nominative d’extraction'
    }, expect.any(String), 'POST'));
    expect(f.refresh).toHaveBeenCalled();
});
it('ne soumet aucune commande si la capacité a disparu', () => {
    f.me!.extractionReviewSelfAssignment = null;
    render(<ExtractionReviewSelfAssignmentDialog onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Continuer' })).toBeNull();
    expect(f.api.command).not.toHaveBeenCalled();
});
