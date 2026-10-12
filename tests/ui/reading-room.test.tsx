import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Order, OrderSummary, Reader, ReaderDetail, Reservation, Room, Slip, SlipLine, SlipSummary, Visit } from '../../src/core/readingRoom';

const INST = '97571d20-3f49-497e-a185-dac22208eb3f';
const fixture = vi.hoisted(() => ({
    epoch: 1, me: null as unknown, allowed: new Set<string>(),
    readingRoom: {
        rooms: vi.fn(), occupancy: vi.fn(), createRoom: vi.fn(), updateRoom: vi.fn(), openRoom: vi.fn(), closeRoom: vi.fn(), readers: vi.fn(), reader: vi.fn(), register: vi.fn(),
        updateReader: vi.fn(), renewCard: vi.fn(), suspendReader: vi.fn(), reinstateReader: vi.fn(), reservations: vi.fn(), reserve: vi.fn(), cancelReservation: vi.fn(),
        markAbsent: vi.fn(), visits: vi.fn(), checkIn: vi.fn(), checkOut: vi.fn(), slips: vi.fn(), slip: vi.fn(), createSlip: vi.fn(), prepareSlipLine: vi.fn(), refuseSlipLine: vi.fn(),
        deliverSlip: vi.fn(), returnSlipLine: vi.fn(), cancelSlip: vi.fn(), tariffs: vi.fn(), createTariff: vi.fn(), retireTariff: vi.fn(), orders: vi.fn(), order: vi.fn(),
        createOrder: vi.fn(), acceptOrder: vi.fn(), refuseOrder: vi.fn(), recordPayment: vi.fn(), completeOrder: vi.fn(), deliverOrder: vi.fn(), cancelOrder: vi.fn(),
        statistics: vi.fn(), statisticsCsv: vi.fn()
    },
    physicalArchives: { archives: vi.fn() }
}));
vi.mock('../../src/auth/session', () => ({ useSession: () => fixture }));
vi.mock('../../src/core/policy', () => ({ can: (_me: unknown, code: string) => fixture.allowed.has(code) }));
import { ReadingRoomDesk, ReadingRoomReaders, ReadingRoomRooms } from '../../src/ui/ReadingRoom';
import { ReadingRoomSlips } from '../../src/ui/ReadingRoomSlips';
import { ReadingRoomOrders } from '../../src/ui/ReadingRoomOrders';
import { ReadingRoomStatistics } from '../../src/ui/ReadingRoomStatistics';

const today = new Date().toISOString().slice(0, 10);
const room = (over: Partial<Room> = {}): Room => ({ id: 'room-1', institutionId: INST, code: 'SALLE-1', name: 'Salle principale', capacity: 3, hours: '8 h – 16 h', status: 'OUVERTE', createdAt: '2026-10-01T08:00:00Z', ...over });
const reader = (over: Partial<Reader> = {}): Reader => ({
    id: 'reader-1', institutionId: INST, number: 'LS-2026-000001', lastName: 'Diallo', firstName: 'Mariama', birthDate: null, address: null, phone: null, email: null, organization: null,
    researchTopic: 'Histoire des quartiers de Conakry', pieceType: 'PASSEPORT', pieceEnd: '6789', regulationVersion: 'RI-2026', regulationAcceptedOn: '2026-10-01', cardValidUntil: '2027-10-01',
    status: 'ACTIF', cardState: 'VALIDE', suspensionReason: null, registeredById: 'u1', registeredAt: '2026-10-01T08:00:00Z', ...over
});
const reservation = (over: Partial<Reservation> = {}): Reservation => ({
    id: 'res-1', roomId: 'room-1', roomName: 'Salle principale', readerId: 'reader-1', readerNumber: 'LS-2026-000001', readerName: 'Mariama Diallo', day: today, slot: 'MATIN', status: 'RESERVEE',
    cancellationReason: null, createdAt: '2026-10-09T08:00:00Z', ...over
});
const visit = (over: Partial<Visit> = {}): Visit => ({
    id: 'visit-1', roomId: 'room-1', roomName: 'Salle principale', readerId: 'reader-2', readerNumber: 'LS-2026-000002', readerName: 'Ousmane Bah', reservationId: null,
    arrivedAt: '2026-10-10T08:30:00Z', leftAt: null, ...over
});
const line = (n: number, over: Partial<SlipLine> = {}): SlipLine => ({
    id: `line-${n}`, rank: n, archiveId: `arch-${n}`, cote: `RC-${n}`, title: `Registre ${n}`, documentId: null, restricted: false, derogationReference: null, status: 'DEMANDEE',
    refusalReason: null, handoverCondition: null, returnCondition: null, handedOverAt: null, returnedAt: null, ...over
});
const slipSummary = (over: Partial<SlipSummary> = {}): SlipSummary => ({
    id: 'slip-1', number: 'BC-2026-000001', institutionId: INST, roomId: 'room-1', roomName: 'Salle principale', readerId: 'reader-1', readerNumber: 'LS-2026-000001',
    readerName: 'Mariama Diallo', status: 'DEMANDE', lines: 2, delivered: 0, returned: 0, createdAt: '2026-10-10T08:00:00Z', version: 0, ...over
});
const slip = (status: SlipSummary['status'], lines: SlipLine[]): Slip => ({
    summary: slipSummary({ status, lines: lines.length }), observations: null, createdById: 'u1', preparedAt: null, deliveredAt: null, returnedAt: null, cancelledAt: null,
    cancellationReason: null, items: lines
});
const orderSummary = (over: Partial<OrderSummary> = {}): OrderSummary => ({
    id: 'order-1', number: 'RP-2026-000001', institutionId: INST, readerId: 'reader-1', readerNumber: 'LS-2026-000001', readerName: 'Mariama Diallo', status: 'REALISEE',
    currency: 'GNF', total: '5000.00', paid: false, createdAt: '2026-10-10T08:00:00Z', version: 0, ...over
});
const order = (over: Partial<OrderSummary> = {}): Order => ({
    summary: orderSummary(over), slipId: null, slipNumber: null, observations: null, reason: null, paymentReference: null, paidAt: null, decidedAt: null, completedAt: null, deliveredAt: null,
    lines: [{ id: 'ol-1', rank: 1, tariffId: 't-1', label: 'Photocopie A4', unit: 'PAGE', quantity: 10, unitPrice: '500.00', amount: '5000.00', archiveId: null, archiveCote: null, description: 'Pages 1 à 10' }]
});

beforeEach(() => {
    fixture.epoch += 1;
    fixture.allowed = new Set(['READING_ROOM_READ', 'READING_ROOM_DESK']);
    for (const fn of [...Object.values(fixture.readingRoom), fixture.physicalArchives.archives]) fn.mockReset();
    fixture.readingRoom.rooms.mockResolvedValue([room()]);
    fixture.readingRoom.occupancy.mockResolvedValue({ roomId: 'room-1', day: today, capacity: 3, morning: 1, afternoon: 0, present: 1 });
    fixture.readingRoom.visits.mockResolvedValue([]);
    fixture.readingRoom.reservations.mockResolvedValue([]);
    fixture.readingRoom.readers.mockResolvedValue([]);
    fixture.readingRoom.slips.mockResolvedValue([]);
    fixture.readingRoom.orders.mockResolvedValue([]);
    fixture.readingRoom.tariffs.mockResolvedValue([]);
});

it('l’accueil montre l’occupation, les présents et les réservations du jour, par noms', async () => {
    fixture.readingRoom.visits.mockResolvedValue([visit()]);
    fixture.readingRoom.reservations.mockResolvedValue([reservation()]);
    render(<ReadingRoomDesk institutionId={INST} />);
    expect(await screen.findByText(/Matin 1\/3 · Après-midi 0\/3 · 1 présent/)).toBeTruthy();
    expect(await screen.findByText('Ousmane Bah')).toBeTruthy();
    expect(await screen.findByText('Mariama Diallo')).toBeTruthy();
    expect(screen.getByText('Matin')).toBeTruthy();
    expect(screen.queryByText('room-1')).toBeNull();
});

it('enregistre l’arrivée sur la réservation du jour et le départ d’un présent', async () => {
    fixture.readingRoom.visits.mockResolvedValue([visit()]);
    fixture.readingRoom.reservations.mockResolvedValue([reservation()]);
    fixture.readingRoom.checkIn.mockResolvedValue(visit({ id: 'visit-2', readerId: 'reader-1', reservationId: 'res-1' }));
    fixture.readingRoom.checkOut.mockResolvedValue(visit({ leftAt: '2026-10-10T10:00:00Z' }));
    render(<ReadingRoomDesk institutionId={INST} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Arrivée' }));
    await waitFor(() => expect(fixture.readingRoom.checkIn).toHaveBeenCalledWith('room-1', 'reader-1', 'res-1', expect.any(String)));
    fireEvent.click(await screen.findByRole('button', { name: 'Enregistrer le départ' }));
    await waitFor(() => expect(fixture.readingRoom.checkOut).toHaveBeenCalledWith('visit-1', expect.any(String)));
});

it('sans l’habilitation d’accueil, aucune action n’est proposée', async () => {
    fixture.allowed = new Set(['READING_ROOM_READ']);
    fixture.readingRoom.visits.mockResolvedValue([visit()]);
    fixture.readingRoom.reservations.mockResolvedValue([reservation()]);
    render(<ReadingRoomDesk institutionId={INST} />);
    await screen.findByText('Ousmane Bah');
    expect(screen.queryByRole('button', { name: 'Arrivée' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Enregistrer le départ' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Nouvelle réservation' })).toBeNull();
});

it('sans salle, le dit et renvoie vers la configuration', async () => {
    fixture.readingRoom.rooms.mockResolvedValue([]);
    render(<ReadingRoomDesk institutionId={INST} />);
    expect(await screen.findByText('Aucune salle de lecture')).toBeTruthy();
});

it('annule une réservation avec un motif d’au moins dix caractères', async () => {
    fixture.readingRoom.reservations.mockResolvedValue([reservation()]);
    fixture.readingRoom.cancelReservation.mockResolvedValue(reservation({ status: 'ANNULEE' }));
    render(<ReadingRoomDesk institutionId={INST} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Annuler' }));
    const dialog = await screen.findByRole('dialog');
    const submit = within(dialog).getByRole('button', { name: 'Annuler la réservation' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Absence prévenue par téléphone' } });
    fireEvent.click(submit);
    await waitFor(() => expect(fixture.readingRoom.cancelReservation).toHaveBeenCalledWith('res-1', 'Absence prévenue par téléphone', expect.any(String)));
});

it('l’inscription nomme ce qui manque puis envoie le corps complet', async () => {
    fixture.readingRoom.register.mockResolvedValue(reader());
    fixture.readingRoom.reader.mockResolvedValue({ reader: reader(), visits: 0, reservations: 0, slips: 0, orders: 0, presentRoomId: null, presentRoomName: null, holding: 0 } satisfies ReaderDetail);
    render(<ReadingRoomReaders institutionId={INST} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Inscrire un lecteur' }));
    let dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Inscrire' }));
    expect(await within(dialog).findByText('Le nom est obligatoire.')).toBeTruthy();
    expect(within(dialog).getByText('Le lecteur doit accepter le règlement de la salle.')).toBeTruthy();
    expect(fixture.readingRoom.register).not.toHaveBeenCalled();
    const change = (label: RegExp | string, value: string) => fireEvent.change(within(dialog).getByLabelText(label), { target: { value } });
    change(/^Nom \*/, 'Diallo'); change(/^Prénom \*/, 'Mariama');
    change(/^Objet de la recherche/, 'Histoire des quartiers de Conakry');
    change(/^Pièce présentée/, 'PASSEPORT'); change(/^Numéro de la pièce/, 'P 123 456 789'); change(/^Version du règlement/, 'RI-2026');
    fireEvent.click(within(dialog).getByRole('checkbox'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Inscrire' }));
    await waitFor(() => expect(fixture.readingRoom.register).toHaveBeenCalledTimes(1));
    const body = fixture.readingRoom.register.mock.calls[0]![0] as Record<string, unknown>;
    expect(body).toMatchObject({ institutionId: INST, lastName: 'Diallo', firstName: 'Mariama', pieceType: 'PASSEPORT', pieceNumber: 'P 123 456 789', regulationAccepted: true });
    dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/Passeport se terminant par 6789/)).toBeTruthy();
});

it('la fiche d’un lecteur suspendu dit pourquoi, et seule la gestion lève la suspension', async () => {
    const suspended = reader({ status: 'SUSPENDU', cardState: 'SUSPENDUE', suspensionReason: 'Retard répété dans la restitution' });
    fixture.readingRoom.readers.mockResolvedValue([suspended]);
    fixture.readingRoom.reader.mockResolvedValue({ reader: suspended, visits: 3, reservations: 2, slips: 1, orders: 0, presentRoomId: null, presentRoomName: null, holding: 0 });
    const { unmount } = render(<ReadingRoomReaders institutionId={INST} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/Retard répété dans la restitution/)).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Lever la suspension' })).toBeNull();
    unmount();
    fixture.allowed = new Set(['READING_ROOM_READ', 'READING_ROOM_DESK', 'READING_ROOM_MANAGE']);
    fixture.readingRoom.reinstateReader.mockResolvedValue(reader());
    render(<ReadingRoomReaders institutionId={INST} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir' }));
    const manager = await screen.findByRole('dialog');
    fireEvent.click(await within(manager).findByRole('button', { name: 'Lever la suspension' }));
    await waitFor(() => expect(fixture.readingRoom.reinstateReader).toHaveBeenCalledWith('reader-1', expect.any(String)));
});

it('prépare chaque ligne puis remet au lecteur avec l’état constaté, et restitue ligne par ligne', async () => {
    const asked = slip('DEMANDE', [line(1), line(2)]);
    fixture.readingRoom.slips.mockResolvedValue([asked.summary]);
    fixture.readingRoom.slip.mockResolvedValue(asked);
    fixture.readingRoom.prepareSlipLine.mockResolvedValue(slip('DEMANDE', [line(1, { status: 'PREPAREE' }), line(2)]));
    const { unmount } = render(<ReadingRoomSlips institutionId={INST} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir' }));
    let dialog = await screen.findByRole('dialog');
    const first = (await within(dialog).findAllByRole('button', { name: 'Préparer' }))[0]!;
    fireEvent.click(first);
    await waitFor(() => expect(fixture.readingRoom.prepareSlipLine).toHaveBeenCalledWith('slip-1', 'line-1', expect.any(String)));
    unmount();

    const prepared = slip('PREPARE', [line(1, { status: 'PREPAREE' }), line(2, { status: 'REFUSEE', refusalReason: 'Original introuvable' })]);
    fixture.readingRoom.slips.mockResolvedValue([prepared.summary]);
    fixture.readingRoom.slip.mockResolvedValue(prepared);
    fixture.readingRoom.deliverSlip.mockResolvedValue(slip('COMMUNIQUE', [line(1, { status: 'COMMUNIQUEE' })]));
    const second = render(<ReadingRoomSlips institutionId={INST} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir' }));
    dialog = await screen.findByRole('dialog');
    fireEvent.change(await within(dialog).findByLabelText('État à la remise de RC-1'), { target: { value: 'Reliure en bon état' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remettre au lecteur' }));
    await waitFor(() => expect(fixture.readingRoom.deliverSlip).toHaveBeenCalledWith('slip-1', { 'line-1': 'Reliure en bon état' }, expect.any(String)));
    second.unmount();

    const out = slip('COMMUNIQUE', [line(1, { status: 'COMMUNIQUEE' })]);
    fixture.readingRoom.slips.mockResolvedValue([out.summary]);
    fixture.readingRoom.slip.mockResolvedValue(out);
    fixture.readingRoom.returnSlipLine.mockResolvedValue(slip('RESTITUE', [line(1, { status: 'RESTITUEE' })]));
    render(<ReadingRoomSlips institutionId={INST} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir' }));
    const last = await screen.findByRole('dialog');
    fireEvent.click(await within(last).findByRole('button', { name: 'Restituer' }));
    await waitFor(() => expect(fixture.readingRoom.returnSlipLine).toHaveBeenCalledWith('slip-1', 'line-1', null, expect.any(String)));
});

it('un document sous restriction montre sa dérogation et le refus se motive', async () => {
    const restricted = slip('DEMANDE', [line(1, { restricted: true, derogationReference: 'Décision n° 12 du directeur' })]);
    fixture.readingRoom.slips.mockResolvedValue([restricted.summary]);
    fixture.readingRoom.slip.mockResolvedValue(restricted);
    fixture.readingRoom.refuseSlipLine.mockResolvedValue(slip('REFUSE', [line(1, { status: 'REFUSEE', refusalReason: 'Original trop fragile' })]));
    render(<ReadingRoomSlips institutionId={INST} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/Décision n° 12 du directeur/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Refuser' }));
    const prompts = await screen.findAllByRole('dialog');
    const prompt = prompts[prompts.length - 1]!;
    fireEvent.change(within(prompt).getByRole('textbox'), { target: { value: 'Original trop fragile' } });
    fireEvent.click(within(prompt).getByRole('button', { name: 'Refuser' }));
    await waitFor(() => expect(fixture.readingRoom.refuseSlipLine).toHaveBeenCalledWith('slip-1', 'line-1', 'Original trop fragile', expect.any(String)));
});

it('une commande payante réalisée ne se remet qu’après l’encaissement enregistré', async () => {
    const unpaid = order();
    fixture.readingRoom.orders.mockResolvedValue([unpaid.summary]);
    fixture.readingRoom.order.mockResolvedValue(unpaid);
    fixture.readingRoom.recordPayment.mockResolvedValue(order({ paid: true }));
    render(<ReadingRoomOrders institutionId={INST} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/Enregistrez l’encaissement fait au guichet/)).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Remettre au lecteur' })).toBeNull();
    const record = within(dialog).getByRole('button', { name: 'Enregistrer l’encaissement' }) as HTMLButtonElement;
    expect(record.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/Référence de l’encaissement/), { target: { value: 'Quittance guichet n° 4471' } });
    fireEvent.click(record);
    await waitFor(() => expect(fixture.readingRoom.recordPayment).toHaveBeenCalledWith('order-1', 'Quittance guichet n° 4471', expect.any(String)));
});

it('une commande encaissée se remet, une commande gratuite n’a rien à encaisser', async () => {
    const paid = order({ paid: true });
    fixture.readingRoom.orders.mockResolvedValue([paid.summary]);
    fixture.readingRoom.order.mockResolvedValue({ ...paid, paymentReference: 'Quittance 1', paidAt: '2026-10-10T09:00:00Z' });
    fixture.readingRoom.deliverOrder.mockResolvedValue(order({ status: 'LIVREE', paid: true }));
    const { unmount } = render(<ReadingRoomOrders institutionId={INST} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Remettre au lecteur' }));
    await waitFor(() => expect(fixture.readingRoom.deliverOrder).toHaveBeenCalledWith('order-1', expect.any(String)));
    unmount();
    const free = order({ total: '0.00' });
    fixture.readingRoom.orders.mockResolvedValue([free.summary]);
    fixture.readingRoom.order.mockResolvedValue(free);
    render(<ReadingRoomOrders institutionId={INST} />);
    expect(await screen.findByText('Gratuit')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));
    const freeDialog = await screen.findByRole('dialog');
    expect(await within(freeDialog).findByRole('button', { name: 'Remettre au lecteur' })).toBeTruthy();
    expect(within(freeDialog).queryByRole('button', { name: 'Enregistrer l’encaissement' })).toBeNull();
});

it('les tarifs ne se créent ni ne se retirent sans la gestion de la salle', async () => {
    fixture.readingRoom.tariffs.mockResolvedValue([{ id: 't-1', institutionId: INST, code: 'COPIE', label: 'Photocopie A4', unit: 'PAGE', unitPrice: '500.00', currency: 'GNF', status: 'ACTIF', createdAt: '2026-10-01T08:00:00Z' }]);
    const { unmount } = render(<ReadingRoomOrders institutionId={INST} />);
    expect(await screen.findByText('Photocopie A4')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Nouveau tarif' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retirer' })).toBeNull();
    unmount();
    fixture.allowed = new Set(['READING_ROOM_READ', 'READING_ROOM_DESK', 'READING_ROOM_MANAGE']);
    fixture.readingRoom.retireTariff.mockResolvedValue({});
    render(<ReadingRoomOrders institutionId={INST} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retirer' }));
    await waitFor(() => expect(fixture.readingRoom.retireTariff).toHaveBeenCalledWith('t-1', expect.any(String)));
});

it('les statistiques se lisent par section et s’exportent en tableur', async () => {
    fixture.readingRoom.statistics.mockResolvedValue({
        institutionId: INST, year: new Date().getUTCFullYear(), generatedAt: '2026-10-10T09:00:00Z', lines: [
            { section: 'LECTEURS', indicator: 'REGISTERED', label: 'Lecteurs inscrits dans l’année', value: '42' },
            { section: 'COMMUNICATIONS', indicator: 'DELIVERED', label: 'Documents communiqués', value: '1200' }
        ]
    });
    fixture.readingRoom.statisticsCsv.mockResolvedValue(new Blob(['x'], { type: 'text/csv' }));
    const created = vi.fn(() => 'blob:test');
    Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(<ReadingRoomStatistics institutionId={INST} />);
    expect(await screen.findByText('Lecteurs inscrits dans l’année')).toBeTruthy();
    expect(screen.getByText('Documents communiqués')).toBeTruthy();
    expect(screen.getByText(/1\s?200/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Exporter en tableur (CSV)' }));
    await waitFor(() => expect(fixture.readingRoom.statisticsCsv).toHaveBeenCalledWith(INST, new Date().getUTCFullYear()));
    await waitFor(() => expect(created).toHaveBeenCalled());
    click.mockRestore();
});

it('les salles se créent avec nom et capacité, et se ferment', async () => {
    fixture.allowed = new Set(['READING_ROOM_READ', 'READING_ROOM_MANAGE']);
    fixture.readingRoom.closeRoom.mockResolvedValue(room({ status: 'FERMEE' }));
    fixture.readingRoom.createRoom.mockResolvedValue(room({ id: 'room-2' }));
    render(<ReadingRoomRooms institutionId={INST} />);
    expect(await screen.findByText('Salle principale')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    await waitFor(() => expect(fixture.readingRoom.closeRoom).toHaveBeenCalledWith('room-1', expect.any(String)));
    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle salle' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(await within(dialog).findByText(/La capacité est comprise entre 1 et 500 places/)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText(/^Code \*/), { target: { value: 'SALLE-2' } });
    fireEvent.change(within(dialog).getByLabelText(/^Nom \*/), { target: { value: 'Salle des fonds anciens' } });
    fireEvent.change(within(dialog).getByLabelText(/^Capacité/), { target: { value: '12' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(fixture.readingRoom.createRoom).toHaveBeenCalledWith(
        { institutionId: INST, code: 'SALLE-2', name: 'Salle des fonds anciens', capacity: 12, hours: null }, expect.any(String)));
});
