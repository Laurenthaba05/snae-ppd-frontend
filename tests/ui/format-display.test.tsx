import React from 'react';
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { ApiError } from '../../src/core/http';
import { Badge, ErrorNotice } from '../../src/ui/components';

it('un badge dont le code n’a pas de libellé se lit en toutes lettres, jamais en code brut', () => {
    render(<div><Badge value="A_PRENDRE_EN_CHARGE" /><Badge value="ORIGINAL_A_REMETTRE" /><Badge value="ACTIF" /><Badge value="EN_COURS" label="En traitement" /></div>);
    expect(screen.getByText('À prendre en charge')).toBeTruthy();
    expect(screen.getByText('Original à remettre')).toBeTruthy();
    expect(screen.getByText('Actif')).toBeTruthy();
    expect(screen.getByText('En traitement')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/[A-Z]+_[A-Z]+/);
});

it('le message du serveur s’affiche avec des apostrophes typographiques', () => {
    render(<ErrorNotice error={new ApiError(422, 'WORKFLOW_DEFINITION_MISSING', "Aucun workflow actif n'est applicable à ce document.")} />);
    expect(screen.getByText('Aucun workflow actif n’est applicable à ce document.')).toBeTruthy();
});
