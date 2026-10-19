import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

// La page de la salle de lecture : elle est celle d'une institution (le périmètre de travail), et ne s'ouvre qu'avec une habilitation de la salle pour cette institution.
const fixture = vi.hoisted(() => ({
    me: { user: { id: 'u1' } } as unknown, epoch: 1,
    scope: { institutionId: null as string | null, departmentId: null }, allowed: [] as Array<[string, unknown]>
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/ui/workspace', () => ({ useWorkspace: () => ({ scope: fixture.scope }) }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string, scope: { institutionId?: string }) => fixture.allowed.some(([c, inst]) => c === code && inst === scope.institutionId) }));
vi.mock('../../src/ui/ReadingRoom', () => ({
    ReadingRoomDesk: ({ institutionId }: { institutionId: string }) => <div data-testid="desk">{institutionId}</div>,
    ReadingRoomReaders: ({ institutionId }: { institutionId: string }) => <div data-testid="readers">{institutionId}</div>,
    ReadingRoomRooms: ({ institutionId }: { institutionId: string }) => <div data-testid="rooms">{institutionId}</div>
}));
vi.mock('../../src/ui/ReadingRoomSlips', () => ({ ReadingRoomSlips: ({ institutionId }: { institutionId: string }) => <div data-testid="slips">{institutionId}</div> }));
vi.mock('../../src/ui/ReadingRoomOrders', () => ({ ReadingRoomOrders: ({ institutionId }: { institutionId: string }) => <div data-testid="orders">{institutionId}</div> }));
vi.mock('../../src/ui/ReadingRoomStatistics', () => ({ ReadingRoomStatistics: ({ institutionId }: { institutionId: string }) => <div data-testid="stats">{institutionId}</div> }));
import { ReadingRoomPage } from '../../src/pages/ReadingRoom';

beforeEach(() => { fixture.scope = { institutionId: null, departmentId: null }; fixture.allowed = []; });

it('sans institution dans le périmètre, la page demande d’en choisir une et n’ouvre aucun volet', () => {
    fixture.allowed = [['READING_ROOM_READ', 'i1']];
    render(<ReadingRoomPage />);
    expect(screen.getByText(/Choisissez une institution dans le périmètre de travail/)).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
});

it('sans habilitation de la salle pour cette institution, la page le dit ; une habilitation d’une autre institution ne suffit pas', () => {
    fixture.scope = { institutionId: 'i1', departmentId: null };
    fixture.allowed = [['READING_ROOM_MANAGE', 'i2']];
    render(<ReadingRoomPage />);
    expect(screen.getByText('Cette section exige une habilitation de la salle de lecture pour cette institution.')).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByTestId('desk')).toBeNull();
});

it('chacune des trois habilitations de la salle ouvre la page, à l’accueil, avec l’institution du périmètre', () => {
    fixture.scope = { institutionId: 'i1', departmentId: null };
    for (const code of ['READING_ROOM_READ', 'READING_ROOM_DESK', 'READING_ROOM_MANAGE']) {
        fixture.allowed = [[code, 'i1']];
        const view = render(<ReadingRoomPage />);
        expect(screen.getByTestId('desk').textContent).toBe('i1');
        expect(screen.getByRole('tab', { name: 'Accueil' }).getAttribute('aria-selected')).toBe('true');
        view.unmount();
    }
});

it('les six sections se parcourent par onglets, chacune pour l’institution du périmètre', () => {
    fixture.scope = { institutionId: 'i1', departmentId: null };
    fixture.allowed = [['READING_ROOM_READ', 'i1']];
    render(<ReadingRoomPage />);
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Accueil', 'Lecteurs', 'Bulletins de communication', 'Reproductions', 'Statistiques', 'Salles']);
    const expected: Array<[string, string]> = [['Lecteurs', 'readers'], ['Bulletins de communication', 'slips'], ['Reproductions', 'orders'], ['Statistiques', 'stats'], ['Salles', 'rooms'], ['Accueil', 'desk']];
    for (const [name, id] of expected) {
        fireEvent.click(screen.getByRole('tab', { name }));
        expect(screen.getByTestId(id).textContent).toBe('i1');
        expect(screen.getByRole('tab', { name }).getAttribute('aria-selected')).toBe('true');
        expect(screen.getAllByTestId(/^(desk|readers|slips|orders|stats|rooms)$/)).toHaveLength(1);
    }
});
