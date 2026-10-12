import type { Transport } from '../core/http.js';
import { query } from '../core/http.js';
import { uuid } from '../core/validation.js';
import type { NotificationFilter, NotificationPage, NotificationPreference, StaffNotification } from '../core/notifications.js';

/** Centre de notifications du personnel (V93) : la boîte de la personne connectée. */
export class NotificationsApi {
    constructor(readonly transport: Transport) { }
    list(status: NotificationFilter, page: number, signal?: AbortSignal): Promise<NotificationPage> {
        return this.transport.request('/notifications' + query({ status, page }), { signal });
    }
    unread(signal?: AbortSignal): Promise<{ unread: number }> { return this.transport.request('/notifications/summary', { signal }); }
    markRead(id: string, key: string): Promise<StaffNotification> { return this.command('/notifications/' + uuid(id) + '/read', {}, key); }
    markAllRead(key: string): Promise<{ marked: number }> { return this.command('/notifications/read-all', {}, key); }
    archive(id: string, key: string): Promise<StaffNotification> { return this.command('/notifications/' + uuid(id) + '/archive', {}, key); }
    preferences(signal?: AbortSignal): Promise<NotificationPreference[]> { return this.transport.request('/notifications/preferences', { signal }); }
    setPreference(category: string, enabled: boolean, key: string): Promise<NotificationPreference[]> { return this.command('/notifications/preferences', { category, enabled }, key); }
    command<T>(path: string, body: unknown, key: string): Promise<T> { return this.transport.request(path, { method: 'POST', body, idempotencyKey: key }); }
}
