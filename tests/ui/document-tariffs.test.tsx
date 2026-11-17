import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const fixture=vi.hoisted(() => ({ me: null, epoch: 0, manage: true, portalAdmin: { transport: { request: vi.fn() }, command: vi.fn() } }));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: () => fixture.manage }));
import { DocumentTariffsPanel } from '../../src/ui/DocumentTariffs';
beforeEach(() => {
    fixture.manage=true;fixture.portalAdmin.transport.request.mockReset();fixture.portalAdmin.command.mockReset();
    fixture.portalAdmin.transport.request.mockResolvedValue({ items: [{ typeId: 'type-1', typeLabel: 'Rapport', amountGnf: null, durationDays: null, active: false, decisionReference: null, version: null }], page: 0, hasMore: false });
    fixture.portalAdmin.command.mockResolvedValue({});
});
it('le tarif sans valeur par defaut exige le prix la duree et la decision de la direction', async () => {
    render(<DocumentTariffsPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Définir le tarif de Rapport' }));
    const button=screen.getByRole('button', { name: 'Enregistrer la décision' });
    expect(button.hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByLabelText('Prix fixé par la direction (GNF)'), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText('Durée de lecture d’un document (jours)'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Référence de la décision de la direction'), { target: { value: 'DECISION RECETTE' } });
    fireEvent.click(screen.getByLabelText('Publier ce tarif'));fireEvent.click(button);
    await waitFor(() => expect(fixture.portalAdmin.command).toHaveBeenCalledWith('/document-tariffs/type-1', { amountGnf: 1000, durationDays: 30, active: true, decisionReference: 'DECISION RECETTE', expectedVersion: null }, expect.any(String), 'PUT'));
});
it('le personnel en lecture seule ne peut pas ouvrir la modification des tarifs', async () => {
    fixture.manage=false;render(<DocumentTariffsPanel />);await screen.findByText('Rapport');
    expect(screen.queryByRole('button',{name:'Définir le tarif de Rapport'})).toBeNull();
});
