import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { NotificationPage, StaffNotification } from '../../src/core/notifications';

const DOC = '80f0f431-a8f1-4da0-b0b2-bbca91b9a739';
const N1 = '0a1b2c3d-0000-4000-8000-000000000001';
const N2 = '0a1b2c3d-0000-4000-8000-000000000002';
const fixture = vi.hoisted(() => ({
    epoch: 1, demo: false, me: null as unknown, allowed: new Set<string>(),
    notifications: { list: vi.fn(), unread: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn(), archive: vi.fn(), preferences: vi.fn(), setPreference: vi.fn() } as Record<string, ReturnType<typeof vi.fn>>,
    navigate: vi.fn()
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/ui/navigation', () => ({ navigate: (path: string) => fixture.navigate(path) }));
import { NotificationBell, NotificationsPage } from '../../src/ui/Notifications';

const note = (over: Partial<StaffNotification> = {}): StaffNotification => ({
    id: N1, category: 'WORKFLOW_TASK', title: 'Une tâche attend votre action', message: 'Étape « Revue » du document DOC-0001.', objectType: 'DOCUMENT', objectId: DOC, read: false,
    readAt: null, archivedAt: null, createdAt: new Date(Date.now() - 5 * 60_000).toISOString(), ...over
});
const page = (items: StaffNotification[], unread = items.filter(i => !i.read).length, hasMore = false): NotificationPage => ({ items, page: 0, size: 30, hasMore, unread });

beforeEach(() => {
    fixture.epoch += 1;
    fixture.demo = false;
    for (const fn of Object.values(fixture.notifications)) fn.mockReset();
    fixture.navigate.mockReset();
    fixture.notifications.unread.mockResolvedValue({ unread: 2 });
    fixture.notifications.list.mockResolvedValue(page([note(), note({ id: N2, title: 'Un versement attend votre contrôle', message: 'Le versement ENT-2026-001 a été soumis.', objectType: 'ENTREE_ARCHIVISTIQUE', objectId: DOC, category: 'INTAKE_SUBMITTED' })]));
    fixture.notifications.preferences.mockResolvedValue([{ category: 'WORKFLOW_TASK', enabled: true }, { category: 'INTAKE_SUBMITTED', enabled: false }]);
});

it('la cloche annonce le nombre de non lues, sans identifiant', async () => {
    render(<NotificationBell open={false} onToggle={() => undefined} onClose={() => undefined} />);
    expect(await screen.findByRole('button', { name: 'Notifications, 2 non lues' })).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
});

it('sans client des notifications (démonstration), la cloche reste inerte', () => {
    const saved = fixture.notifications;
    (fixture as unknown as { notifications: unknown }).notifications = null;
    try {
        render(<NotificationBell open={false} onToggle={() => undefined} onClose={() => undefined} />);
        expect(screen.getByRole('button', { name: 'Notifications' }).getAttribute('title')).toMatch(/Aucune notification/);
    } finally { (fixture as unknown as { notifications: unknown }).notifications = saved; }
});

it('ouverte, elle liste les dernières, marque lue et mène à l’objet', async () => {
    fixture.notifications.markRead.mockResolvedValue(note({ read: true }));
    const onClose = vi.fn();
    render(<NotificationBell open onToggle={() => undefined} onClose={onClose} />);
    const first = await screen.findByRole('button', { name: /Une tâche attend votre action/ });
    expect(screen.getByText('Étape « Revue » du document DOC-0001.')).toBeTruthy();
    expect(screen.getByText(/Tâches de validation · il y a 5 min/)).toBeTruthy();
    fireEvent.click(first);
    await waitFor(() => expect(fixture.notifications.markRead).toHaveBeenCalledWith(N1, expect.any(String)));
    await waitFor(() => expect(fixture.navigate).toHaveBeenCalledWith(`/app/documents/${DOC}`));
    expect(onClose).toHaveBeenCalled();
});

it('tout marquer comme lu, puis aller à la page des notifications', async () => {
    fixture.notifications.markAllRead.mockResolvedValue({ marked: 2 });
    const onClose = vi.fn();
    render(<NotificationBell open onToggle={() => undefined} onClose={onClose} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Tout marquer comme lu' }));
    await waitFor(() => expect(fixture.notifications.markAllRead).toHaveBeenCalledWith(expect.any(String)));
    fireEvent.click(screen.getByRole('button', { name: 'Voir toutes les notifications' }));
    expect(fixture.navigate).toHaveBeenCalledWith('/app/notifications');
});

it('la page filtre, ouvre, marque lue et archive', async () => {
    fixture.notifications.markRead.mockResolvedValue(note({ read: true }));
    fixture.notifications.archive.mockResolvedValue(note({ read: true, archivedAt: '2026-10-10T10:00:00Z' }));
    render(<NotificationsPage />);
    expect(await screen.findByText('Un versement attend votre contrôle')).toBeTruthy();
    expect(fixture.notifications.list).toHaveBeenCalledWith('UNREAD', 0, expect.anything());
    const row = screen.getByText('Une tâche attend votre action').closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Marquer comme lue' }));
    await waitFor(() => expect(fixture.notifications.markRead).toHaveBeenCalledWith(N1, expect.any(String)));
    fireEvent.click(within(row).getByRole('button', { name: 'Archiver' }));
    await waitFor(() => expect(fixture.notifications.archive).toHaveBeenCalledWith(N1, expect.any(String)));
    fireEvent.click(screen.getByRole('tab', { name: 'Archivées' }));
    await waitFor(() => expect(fixture.notifications.list).toHaveBeenCalledWith('ARCHIVED', 0, expect.anything()));
});

it('les préférences se lisent et se changent par catégorie', async () => {
    fixture.notifications.setPreference.mockResolvedValue([{ category: 'WORKFLOW_TASK', enabled: true }, { category: 'INTAKE_SUBMITTED', enabled: true }]);
    render(<NotificationsPage />);
    const box = await screen.findByRole('checkbox', { name: /Versements à contrôler/ });
    expect((box as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole('checkbox', { name: /Tâches de validation/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(box);
    await waitFor(() => expect(fixture.notifications.setPreference).toHaveBeenCalledWith('INTAKE_SUBMITTED', true, expect.any(String)));
});

it('une boîte vide le dit', async () => {
    fixture.notifications.list.mockResolvedValue(page([]));
    render(<NotificationsPage />);
    expect(await screen.findByText('Rien ne vous attend')).toBeTruthy();
});
