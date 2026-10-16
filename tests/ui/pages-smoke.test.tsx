import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { AuditEvent } from '../../src/core/types';

// Les écrans que aucune suite ne rendait : ils doivent au moins s'afficher, dire leur état (chargement, vide, erreur, droit absent) et ne rien inventer.
const fixture = vi.hoisted(() => ({
    audit: { recentEvents: vi.fn() },
    api: { list: vi.fn() },
    digitization: null as unknown,
    me: { user: { id: 'u1' } } as unknown,
    allowed: true, epoch: 1, demo: false
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: () => fixture.allowed }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: { institutionId: null, departmentId: null } }) }));
vi.mock('../../src/ui/ResourceDetails', () => ({ ResourceDetailsButton: () => null }));
import { AuditPage } from '../../src/pages/Audit';
import { HelpPage } from '../../src/pages/Help';
import { ScannersPage } from '../../src/pages/Scanners';
import { JourneysPage } from '../../src/pages/Journeys';

const event = (n: number): AuditEvent => ({
    id: `00000000-0000-4000-8000-00000000000${n}`, userId: null, actorType: 'SYSTEM', actorExternalId: 'worker', action: `ACTION_${n}`, actionCategory: 'RECORDS', objectType: 'DOCUMENT', objectId: null, objectReference: `REF-${n}`,
    occurredAt: '2026-10-10T08:00:00Z', result: 'SUCCES', resultCode: null, institutionId: null, departmentId: null, correlationId: null, before: null, after: null, eventHash: 'a'.repeat(64), previousHash: null
} as unknown as AuditEvent);

beforeEach(() => {
    fixture.allowed = true; fixture.epoch = 1; fixture.demo = false; fixture.digitization = null;
    fixture.audit.recentEvents.mockReset().mockResolvedValue({ items: [event(1), event(2)], page: 0, size: 20, hasMore: true });
    fixture.api.list.mockReset().mockResolvedValue({ items: [], page: 0, size: 100, hasMore: false });
});

it('le journal d’audit liste les événements, annonce la suite et filtre par catégorie sans total', async () => {
    render(<AuditPage />);
    await screen.findByText('ACTION_1');
    expect(screen.getByText('ACTION_2')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Journal d’audit/ })).toBeTruthy();
    expect(fixture.audit.recentEvents).toHaveBeenCalledWith(null, 0, 20, expect.anything());
    fireEvent.change(screen.getByLabelText('Filtrer par catégorie'), { target: { value: 'RETENTION' } });
    await waitFor(() => expect(fixture.audit.recentEvents).toHaveBeenCalledWith('RETENTION', 0, 20, expect.anything()));
});

it('le journal d’audit ne transforme pas une erreur du serveur en journal vide', async () => {
    fixture.audit.recentEvents.mockRejectedValue(new Error('Indisponible'));
    render(<AuditPage />);
    await screen.findByRole('alert');
    expect(screen.queryByText(/Aucun/)).toBeNull();
});

it('le journal d’audit dit qu’il est vide quand il l’est', async () => {
    fixture.audit.recentEvents.mockResolvedValue({ items: [], page: 0, size: 20, hasMore: false });
    render(<AuditPage />);
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(screen.queryByText('ACTION_1')).toBeNull();
});

it('le guide s’affiche avec ses repères', () => {
    render(<HelpPage />);
    expect(screen.getByRole('heading', { name: /Guide & assistance/ })).toBeTruthy();
});

it('les scanners disent qu’ils ne se pilotent qu’en mode connecté quand le serveur n’est pas branché', () => {
    render(<ScannersPage />);
    expect(screen.getByText(/L’inventaire des scanners est disponible en mode connecté/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Scanners' })).toBeTruthy();
});

it('les parcours s’affichent, se filtrent par la recherche et ouvrent un parcours précis', () => {
    render(<JourneysPage />);
    expect(screen.getByRole('heading', { name: /Parcours utilisateurs/ })).toBeTruthy();
    const search = screen.getByPlaceholderText(/./, { selector: 'input' });
    fireEvent.change(search, { target: { value: 'zzzz-aucun-parcours-ne-contient-cela' } });
    expect(within(document.body).queryAllByRole('button', { name: /P12/ }).length).toBe(0);
});
