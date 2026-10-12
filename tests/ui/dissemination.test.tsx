import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/core/http';
import type { ArkAuthority, ArkIdentifier, OaiStatus } from '../../src/core/dissemination';

const INST = '97571d20-3f49-497e-a185-dac22208eb3f';
const OBJ = '80f0f431-a8f1-4da0-b0b2-bbca91b9a739';
const fixture = vi.hoisted(() => ({
    epoch: 1, demo: false, me: null as unknown, allowed: new Set<string>(),
    dissemination: { authority: vi.fn(), declareAuthority: vi.fn(), identifiers: vi.fn(), ofObject: vi.fn(), mint: vi.fn(), oaiStatus: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: { institutionId: INST, departmentId: null } }) }));
import { ArkPanel, DisseminationSection } from '../../src/ui/Dissemination';

const status = (over: Partial<OaiStatus> = {}): OaiStatus => ({
    enabled: true, configured: true, problems: [], repositoryIdentifier: 'archives.exemple.gn', repositoryName: 'Archives nationales', endpoint: 'https://archives.exemple.gn/api/v1/portal/oai', pageSize: 100, ...over
});
const authority = (): ArkAuthority => ({ id: 'a1', institutionId: INST, naan: '12345', prefix: 'gn', createdAt: '2026-10-01T08:00:00Z' });
const identifier = (over: Partial<ArkIdentifier> = {}): ArkIdentifier => ({
    id: 'i1', institutionId: INST, ark: 'ark:/12345/gn3k9x0rdq', naan: '12345', name: 'gn3k9x0rdq', objectType: 'BIEN', objectId: OBJ, objectTitle: 'Registre de Kankan', createdAt: '2026-10-02T08:00:00Z', ...over
});

beforeEach(() => {
    fixture.epoch += 1;
    fixture.demo = false;
    fixture.allowed = new Set(['DISSEMINATION_READ']);
    for (const fn of Object.values(fixture.dissemination)) fn.mockReset();
    fixture.dissemination.oaiStatus.mockResolvedValue(status());
    fixture.dissemination.authority.mockResolvedValue(authority());
    fixture.dissemination.identifiers.mockResolvedValue([identifier()]);
});

it('montre l’état du dépôt, l’autorité et les identifiants par le titre de l’objet', async () => {
    render(<DisseminationSection />);
    expect(await screen.findByText(/Le dépôt OAI-PMH est ouvert/)).toBeTruthy();
    expect(screen.getByText('https://archives.exemple.gn/api/v1/portal/oai')).toBeTruthy();
    expect(await screen.findByText(/NAAN 12345/)).toBeTruthy();
    const row = screen.getByText('ark:/12345/gn3k9x0rdq').closest('tr')!;
    expect(within(row).getByText('Registre de Kankan')).toBeTruthy();
    expect(within(row).getByText('Bien patrimonial')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Déclarer l’autorité ARK' })).toBeNull();
});

it('un dépôt activé mais incomplet dit ce qui manque', async () => {
    fixture.dissemination.oaiStatus.mockResolvedValue(status({ configured: false, problems: ['OAI_ADMIN_EMAIL_INVALID', 'OAI_PUBLIC_URL_INVALID'] }));
    render(<DisseminationSection />);
    expect(await screen.findByText(/configuration est incomplète/)).toBeTruthy();
    expect(screen.getByText(/adresse du contact du dépôt/)).toBeTruthy();
    expect(screen.getByText(/adresse publique du portail/)).toBeTruthy();
});

it('rien n’apparaît en démonstration ni sans habilitation', async () => {
    fixture.allowed = new Set();
    const first = render(<DisseminationSection />);
    expect(first.container.textContent).toBe('');
    first.unmount();
    fixture.allowed = new Set(['DISSEMINATION_READ']);
    fixture.demo = true;
    const second = render(<DisseminationSection />);
    expect(second.container.textContent).toBe('');
});

it('déclare l’autorité avec un NAAN valide, une seule fois', async () => {
    fixture.allowed = new Set(['DISSEMINATION_READ', 'DISSEMINATION_MANAGE']);
    fixture.dissemination.authority.mockResolvedValue(null);
    fixture.dissemination.identifiers.mockResolvedValue([]);
    fixture.dissemination.declareAuthority.mockResolvedValue(authority());
    render(<DisseminationSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Déclarer l’autorité ARK' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/^NAAN/), { target: { value: '123' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Déclarer' }));
    expect(await within(dialog).findByText(/nombre de 5 à 9 chiffres/)).toBeTruthy();
    expect(fixture.dissemination.declareAuthority).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText(/^NAAN/), { target: { value: '12345' } });
    fireEvent.change(within(dialog).getByLabelText(/^Préfixe/), { target: { value: 'GN' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Déclarer' }));
    await waitFor(() => expect(fixture.dissemination.declareAuthority).toHaveBeenCalledWith(INST, '12345', 'gn', expect.any(String)));
});

it('la fiche d’un objet montre son identifiant, ou propose d’en attribuer un', async () => {
    fixture.dissemination.ofObject.mockResolvedValue(identifier());
    const first = render(<ArkPanel objectType="BIEN" objectId={OBJ} institutionId={INST} canManage={false} />);
    expect(await screen.findByText('ark:/12345/gn3k9x0rdq')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Attribuer un identifiant pérenne' })).toBeNull();
    first.unmount();

    fixture.dissemination.ofObject.mockReset().mockRejectedValue(new ApiError(404, 'ARK_NOT_FOUND', 'Identifiant introuvable.'));
    fixture.dissemination.mint.mockResolvedValue(identifier());
    render(<ArkPanel objectType="BIEN" objectId={OBJ} institutionId={INST} canManage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Attribuer un identifiant pérenne' }));
    await waitFor(() => expect(fixture.dissemination.mint).toHaveBeenCalledWith('BIEN', OBJ, expect.any(String)));
});

it('sans autorité déclarée, l’attribution renvoie vers sa déclaration', async () => {
    fixture.dissemination.ofObject.mockRejectedValue(new ApiError(404, 'ARK_NOT_FOUND', 'Identifiant introuvable.'));
    fixture.dissemination.authority.mockResolvedValue(null);
    render(<ArkPanel objectType="DOCUMENT" objectId={OBJ} institutionId={INST} canManage />);
    expect(await screen.findByText(/autorité ARK de l’institution doit d’abord être déclarée/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Attribuer un identifiant pérenne' })).toBeNull();
});
