import type { Transport } from '../core/http.js';
import { query } from '../core/http.js';
import { uuid } from '../core/validation.js';
import type {
    AnnualStatistics, DayOccupancy, Order, OrderSummary, Reader, ReaderDetail, Reservation, Room, Slip, SlipSummary, Tariff, Visit
} from '../core/readingRoom.js';

/** Salle de lecture : salles, lecteurs et carte, réservations, présence, bulletins de communication, reproductions, statistiques annuelles. */
export class ReadingRoomApi {
    constructor(readonly transport: Transport) { }
    // ---- salles
    rooms(institutionId: string, signal?: AbortSignal): Promise<Room[]> { return this.transport.request('/reading-room/rooms' + query({ institutionId }), { signal }); }
    occupancy(roomId: string, day: string, signal?: AbortSignal): Promise<DayOccupancy> { return this.transport.request('/reading-room/rooms/' + uuid(roomId) + '/occupancy' + query({ day }), { signal }); }
    createRoom(body: Record<string, unknown>, key: string): Promise<Room> { return this.command('/rooms', body, key); }
    updateRoom(id: string, body: Record<string, unknown>, key: string): Promise<Room> { return this.command('/rooms/' + uuid(id) + '/update', body, key); }
    openRoom(id: string, key: string): Promise<Room> { return this.command('/rooms/' + uuid(id) + '/open', {}, key); }
    closeRoom(id: string, key: string): Promise<Room> { return this.command('/rooms/' + uuid(id) + '/close', {}, key); }
    // ---- lecteurs
    readers(institutionId: string, filter: { q?: string | null; status?: string | null }, signal?: AbortSignal): Promise<Reader[]> {
        return this.transport.request('/reading-room/readers' + query({ institutionId, q: filter.q || undefined, status: filter.status || undefined }), { signal });
    }
    reader(id: string, signal?: AbortSignal): Promise<ReaderDetail> { return this.transport.request('/reading-room/readers/' + uuid(id), { signal }); }
    register(body: Record<string, unknown>, key: string): Promise<Reader> { return this.command('/readers', body, key); }
    updateReader(id: string, body: Record<string, unknown>, key: string): Promise<Reader> { return this.command('/readers/' + uuid(id) + '/update', body, key); }
    renewCard(id: string, validUntil: string, key: string): Promise<Reader> { return this.command('/readers/' + uuid(id) + '/renew', { validUntil }, key); }
    suspendReader(id: string, reason: string, key: string): Promise<Reader> { return this.command('/readers/' + uuid(id) + '/suspend', { reason }, key); }
    reinstateReader(id: string, key: string): Promise<Reader> { return this.command('/readers/' + uuid(id) + '/reinstate', {}, key); }
    // ---- réservations et présence
    reservations(institutionId: string, filter: { roomId?: string | null; day?: string | null; readerId?: string | null; status?: string | null }, signal?: AbortSignal): Promise<Reservation[]> {
        return this.transport.request('/reading-room/reservations' + query({ institutionId, roomId: filter.roomId || undefined, day: filter.day || undefined, readerId: filter.readerId || undefined, status: filter.status || undefined }), { signal });
    }
    reserve(roomId: string, readerId: string, day: string, slot: string, key: string): Promise<Reservation> { return this.command('/reservations', { roomId, readerId, day, slot }, key); }
    cancelReservation(id: string, reason: string, key: string): Promise<Reservation> { return this.command('/reservations/' + uuid(id) + '/cancel', { reason }, key); }
    markAbsent(id: string, key: string): Promise<Reservation> { return this.command('/reservations/' + uuid(id) + '/absent', {}, key); }
    visits(institutionId: string, filter: { roomId?: string | null; openOnly?: boolean }, signal?: AbortSignal): Promise<Visit[]> {
        return this.transport.request('/reading-room/visits' + query({ institutionId, roomId: filter.roomId || undefined, openOnly: filter.openOnly ? 'true' : undefined }), { signal });
    }
    checkIn(roomId: string, readerId: string, reservationId: string | null, key: string): Promise<Visit> { return this.command('/visits', { roomId, readerId, reservationId }, key); }
    checkOut(visitId: string, key: string): Promise<Visit> { return this.command('/visits/' + uuid(visitId) + '/check-out', {}, key); }
    // ---- bulletins de communication
    slips(institutionId: string, filter: { status?: string | null; readerId?: string | null; roomId?: string | null }, signal?: AbortSignal): Promise<SlipSummary[]> {
        return this.transport.request('/reading-room/slips' + query({ institutionId, status: filter.status || undefined, readerId: filter.readerId || undefined, roomId: filter.roomId || undefined }), { signal });
    }
    slip(id: string, signal?: AbortSignal): Promise<Slip> { return this.transport.request('/reading-room/slips/' + uuid(id), { signal }); }
    createSlip(roomId: string, readerId: string, items: Array<{ archiveId: string; derogationReference?: string | null }>, observations: string | null, key: string): Promise<Slip> {
        return this.command('/slips', { roomId, readerId, items, observations }, key);
    }
    prepareSlipLine(id: string, lineId: string, key: string): Promise<Slip> { return this.command('/slips/' + uuid(id) + '/lines/' + uuid(lineId) + '/prepare', {}, key); }
    refuseSlipLine(id: string, lineId: string, reason: string, key: string): Promise<Slip> { return this.command('/slips/' + uuid(id) + '/lines/' + uuid(lineId) + '/refuse', { reason }, key); }
    deliverSlip(id: string, conditions: Record<string, string>, key: string): Promise<Slip> { return this.command('/slips/' + uuid(id) + '/deliver', { conditions }, key); }
    returnSlipLine(id: string, lineId: string, condition: string | null, key: string): Promise<Slip> { return this.command('/slips/' + uuid(id) + '/lines/' + uuid(lineId) + '/return', { condition }, key); }
    cancelSlip(id: string, reason: string, key: string): Promise<Slip> { return this.command('/slips/' + uuid(id) + '/cancel', { reason }, key); }
    // ---- tarifs et reproductions
    tariffs(institutionId: string, includeRetired: boolean, signal?: AbortSignal): Promise<Tariff[]> {
        return this.transport.request('/reading-room/tariffs' + query({ institutionId, includeRetired: includeRetired ? 'true' : undefined }), { signal });
    }
    createTariff(body: Record<string, unknown>, key: string): Promise<Tariff> { return this.command('/tariffs', body, key); }
    retireTariff(id: string, key: string): Promise<Tariff> { return this.command('/tariffs/' + uuid(id) + '/retire', {}, key); }
    orders(institutionId: string, filter: { status?: string | null; readerId?: string | null }, signal?: AbortSignal): Promise<OrderSummary[]> {
        return this.transport.request('/reading-room/reproductions' + query({ institutionId, status: filter.status || undefined, readerId: filter.readerId || undefined }), { signal });
    }
    order(id: string, signal?: AbortSignal): Promise<Order> { return this.transport.request('/reading-room/reproductions/' + uuid(id), { signal }); }
    createOrder(body: Record<string, unknown>, key: string): Promise<Order> { return this.command('/reproductions', body, key); }
    acceptOrder(id: string, key: string): Promise<Order> { return this.command('/reproductions/' + uuid(id) + '/accept', {}, key); }
    refuseOrder(id: string, reason: string, key: string): Promise<Order> { return this.command('/reproductions/' + uuid(id) + '/refuse', { reason }, key); }
    recordPayment(id: string, reference: string, key: string): Promise<Order> { return this.command('/reproductions/' + uuid(id) + '/payment', { reference }, key); }
    completeOrder(id: string, key: string): Promise<Order> { return this.command('/reproductions/' + uuid(id) + '/complete', {}, key); }
    deliverOrder(id: string, key: string): Promise<Order> { return this.command('/reproductions/' + uuid(id) + '/deliver', {}, key); }
    cancelOrder(id: string, reason: string, key: string): Promise<Order> { return this.command('/reproductions/' + uuid(id) + '/cancel', { reason }, key); }
    // ---- statistiques
    statistics(institutionId: string, year: number, signal?: AbortSignal): Promise<AnnualStatistics> {
        return this.transport.request('/reading-room/statistics' + query({ institutionId, year: String(year) }), { signal });
    }
    statisticsCsv(institutionId: string, year: number, signal?: AbortSignal): Promise<Blob> {
        return this.transport.request('/reading-room/statistics.csv' + query({ institutionId, year: String(year) }), { signal, responseType: 'blob' });
    }
    command<T>(path: string, body: unknown, key: string): Promise<T> { return this.transport.request('/reading-room' + path, { method: 'POST', body, idempotencyKey: key }); }
}
