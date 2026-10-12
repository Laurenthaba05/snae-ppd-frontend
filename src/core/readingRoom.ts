import { formatNumber } from './format.js';

/**
 * Salle de lecture : lecteurs inscrits sur place (carte), réservations par créneau, présence, bulletins de communication jusqu'à la restitution, reproductions avec tarifs et
 * encaissement enregistré, statistiques annuelles. Ces règles reprennent celles du serveur pour guider la saisie ; le serveur reste seul juge.
 */
export type RoomStatus = 'OUVERTE' | 'FERMEE';
export type CardState = 'VALIDE' | 'EXPIREE' | 'SUSPENDUE';
export type Slot = 'MATIN' | 'APRES_MIDI' | 'JOURNEE';
export type ReservationStatus = 'RESERVEE' | 'PRESENT' | 'ABSENT' | 'ANNULEE';
export type SlipStatus = 'DEMANDE' | 'PREPARE' | 'COMMUNIQUE' | 'RESTITUE' | 'REFUSE' | 'ANNULE';
export type SlipLineStatus = 'DEMANDEE' | 'PREPAREE' | 'COMMUNIQUEE' | 'RESTITUEE' | 'REFUSEE';
export type OrderStatus = 'DEMANDEE' | 'ACCEPTEE' | 'REALISEE' | 'LIVREE' | 'REFUSEE' | 'ANNULEE';
export type TariffUnit = 'PAGE' | 'IMAGE' | 'FICHIER' | 'FEUILLET' | 'LOT';
export type PieceType = 'CARTE_IDENTITE' | 'PASSEPORT' | 'PERMIS_CONDUIRE' | 'CARTE_PROFESSIONNELLE' | 'AUTRE';

export interface Room { id: string; institutionId: string; code: string; name: string; capacity: number; hours: string | null; status: RoomStatus; createdAt: string }
export interface DayOccupancy { roomId: string; day: string; capacity: number; morning: number; afternoon: number; present: number }
export interface Reader {
    id: string; institutionId: string; number: string; lastName: string; firstName: string; birthDate: string | null; address: string | null; phone: string | null; email: string | null;
    organization: string | null; researchTopic: string; pieceType: PieceType; pieceEnd: string; regulationVersion: string; regulationAcceptedOn: string; cardValidUntil: string;
    status: 'ACTIF' | 'SUSPENDU'; cardState: CardState; suspensionReason: string | null; registeredById: string; registeredAt: string;
}
export interface ReaderDetail { reader: Reader; visits: number; reservations: number; slips: number; orders: number; presentRoomId: string | null; presentRoomName: string | null; holding: number }
export interface Reservation {
    id: string; roomId: string; roomName: string; readerId: string; readerNumber: string; readerName: string; day: string; slot: Slot; status: ReservationStatus;
    cancellationReason: string | null; createdAt: string;
}
export interface Visit {
    id: string; roomId: string; roomName: string; readerId: string; readerNumber: string; readerName: string; reservationId: string | null; arrivedAt: string; leftAt: string | null;
}
export interface SlipLine {
    id: string; rank: number; archiveId: string; cote: string; title: string | null; documentId: string | null; restricted: boolean; derogationReference: string | null;
    status: SlipLineStatus; refusalReason: string | null; handoverCondition: string | null; returnCondition: string | null; handedOverAt: string | null; returnedAt: string | null;
}
export interface SlipSummary {
    id: string; number: string; institutionId: string; roomId: string; roomName: string; readerId: string; readerNumber: string; readerName: string; status: SlipStatus;
    lines: number; delivered: number; returned: number; createdAt: string; version: number;
}
export interface Slip {
    summary: SlipSummary; observations: string | null; createdById: string; preparedAt: string | null; deliveredAt: string | null; returnedAt: string | null;
    cancelledAt: string | null; cancellationReason: string | null; items: SlipLine[];
}
export interface Tariff { id: string; institutionId: string; code: string; label: string; unit: TariffUnit; unitPrice: number | string; currency: string; status: 'ACTIF' | 'RETIRE'; createdAt: string }
export interface OrderLine {
    id: string; rank: number; tariffId: string; label: string; unit: TariffUnit; quantity: number; unitPrice: number | string; amount: number | string; archiveId: string | null;
    archiveCote: string | null; description: string | null;
}
export interface OrderSummary {
    id: string; number: string; institutionId: string; readerId: string; readerNumber: string; readerName: string; status: OrderStatus; currency: string; total: number | string;
    paid: boolean; createdAt: string; version: number;
}
export interface Order {
    summary: OrderSummary; slipId: string | null; slipNumber: string | null; observations: string | null; reason: string | null; paymentReference: string | null; paidAt: string | null;
    decidedAt: string | null; completedAt: string | null; deliveredAt: string | null; lines: OrderLine[];
}
export interface StatisticsLine { section: string; indicator: string; label: string; value: string }
export interface AnnualStatistics { institutionId: string; year: number; generatedAt: string; lines: StatisticsLine[] }

export const ROOM_LABELS: Record<RoomStatus, string> = { OUVERTE: 'Ouverte', FERMEE: 'Fermée' };
export const CARD_LABELS: Record<CardState, string> = { VALIDE: 'Carte valide', EXPIREE: 'Carte expirée', SUSPENDUE: 'Carte suspendue' };
export const SLOT_LABELS: Record<Slot, string> = { MATIN: 'Matin', APRES_MIDI: 'Après-midi', JOURNEE: 'Journée entière' };
export const RESERVATION_LABELS: Record<ReservationStatus, string> = { RESERVEE: 'Réservée', PRESENT: 'Présent', ABSENT: 'Non honorée', ANNULEE: 'Annulée' };
export const SLIP_LABELS: Record<SlipStatus, string> = {
    DEMANDE: 'Demandé', PREPARE: 'Préparé', COMMUNIQUE: 'Communiqué', RESTITUE: 'Restitué', REFUSE: 'Refusé', ANNULE: 'Annulé'
};
export const SLIP_LINE_LABELS: Record<SlipLineStatus, string> = {
    DEMANDEE: 'À préparer', PREPAREE: 'Préparée', COMMUNIQUEE: 'Entre les mains du lecteur', RESTITUEE: 'Restituée', REFUSEE: 'Refusée'
};
export const ORDER_LABELS: Record<OrderStatus, string> = {
    DEMANDEE: 'Demandée', ACCEPTEE: 'Acceptée', REALISEE: 'Réalisée', LIVREE: 'Livrée', REFUSEE: 'Refusée', ANNULEE: 'Annulée'
};
export const UNIT_LABELS: Record<TariffUnit, string> = { PAGE: 'page', IMAGE: 'image', FICHIER: 'fichier', FEUILLET: 'feuillet', LOT: 'lot' };
export const PIECE_LABELS: Record<PieceType, string> = {
    CARTE_IDENTITE: 'Carte d’identité', PASSEPORT: 'Passeport', PERMIS_CONDUIRE: 'Permis de conduire', CARTE_PROFESSIONNELLE: 'Carte professionnelle', AUTRE: 'Autre pièce'
};
export const SECTION_LABELS: Record<string, string> = {
    LECTEURS: 'Lecteurs', FREQUENTATION: 'Fréquentation', RESERVATIONS: 'Réservations', COMMUNICATIONS: 'Communications', REPRODUCTIONS: 'Reproductions',
    ENTREES: 'Entrées', FONDS: 'Fonds numérique', ELIMINATIONS: 'Éliminations', TRANSFERTS: 'Transferts'
};

export const MAX_CARD_YEARS = 10;
export const MAX_BOOKING_DAYS = 180;
export const MAX_SLIP_ITEMS = 20;
export const MAX_ORDER_LINES = 30;
export const MIN_REASON = 10;

export const todayIso = (now: Date = new Date()): string => now.toISOString().slice(0, 10);
export const addDays = (iso: string, days: number): string => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
export const addYears = (iso: string, years: number): string => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCFullYear(d.getUTCFullYear() + years); return d.toISOString().slice(0, 10); };

/** Une quantité entière ou un prix exprimés en montant lisible : « 5 000,00 GNF ». */
export function moneyText(amount: number | string | null | undefined, currency: string): string {
    const value = typeof amount === 'string' ? Number(amount) : amount;
    if (value === null || value === undefined || !Number.isFinite(value)) return '—';
    return `${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} ${currency}`;
}

/** Le numéro de pièce n'est jamais affiché en entier : seule sa fin est conservée. */
export const pieceText = (type: PieceType, end: string): string => `${PIECE_LABELS[type] ?? 'Pièce'} se terminant par ${end}`;

export const readerName = (r: Pick<Reader, 'firstName' | 'lastName'>): string => `${r.firstName} ${r.lastName}`.trim();

/** Ce qui est occupé ce jour-là, en clair, pour l'accueil. */
export function occupancyText(o: DayOccupancy): string {
    return `Matin ${o.morning}/${o.capacity} · Après-midi ${o.afternoon}/${o.capacity} · ${o.present} présent${o.present > 1 ? 's' : ''}`;
}
export const slotFull = (o: DayOccupancy | null | undefined, slot: Slot): boolean => {
    if (!o) return false;
    return slot === 'MATIN' ? o.morning >= o.capacity : slot === 'APRES_MIDI' ? o.afternoon >= o.capacity : o.morning >= o.capacity || o.afternoon >= o.capacity;
};

// ---------- inscription
export interface RegistrationForm {
    lastName: string; firstName: string; birthDate: string; address: string; phone: string; email: string; organization: string; researchTopic: string; pieceType: string;
    pieceNumber: string; regulationVersion: string; regulationAccepted: boolean; cardValidUntil: string;
}
export const emptyRegistration = (now: Date = new Date()): RegistrationForm => ({
    lastName: '', firstName: '', birthDate: '', address: '', phone: '', email: '', organization: '', researchTopic: '', pieceType: '', pieceNumber: '', regulationVersion: '',
    regulationAccepted: false, cardValidUntil: addYears(todayIso(now), 1)
});

export function registrationProblems(form: RegistrationForm, now: Date = new Date()): string[] {
    const problems: string[] = [];
    const today = todayIso(now);
    if (!form.lastName.trim()) problems.push('Le nom est obligatoire.');
    if (!form.firstName.trim()) problems.push('Le prénom est obligatoire.');
    if (form.researchTopic.trim().length < 5) problems.push('L’objet de la recherche est obligatoire (5 caractères au moins).');
    if (!form.pieceType) problems.push('Choisissez le type de pièce présentée.');
    if (form.pieceNumber.replace(/[^0-9A-Za-z]/g, '').length < 4) problems.push('Le numéro de la pièce présentée est obligatoire (4 caractères au moins).');
    if (!form.regulationVersion.trim()) problems.push('Indiquez la version du règlement de la salle présentée au lecteur.');
    if (!form.regulationAccepted) problems.push('Le lecteur doit accepter le règlement de la salle.');
    if (form.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) problems.push('L’adresse électronique n’a pas la forme attendue.');
    if (!form.cardValidUntil) problems.push('La validité de la carte est obligatoire.');
    else if (form.cardValidUntil < today) problems.push('La carte ne peut pas être valable avant aujourd’hui.');
    else if (form.cardValidUntil > addYears(today, MAX_CARD_YEARS)) problems.push(`La validité de la carte est limitée à ${MAX_CARD_YEARS} ans.`);
    if (form.birthDate && form.birthDate > today) problems.push('La date de naissance est dans le futur.');
    return problems;
}

export function registrationBody(institutionId: string, form: RegistrationForm): Record<string, unknown> {
    const opt = (v: string) => v.trim() || null;
    return {
        institutionId, lastName: form.lastName.trim(), firstName: form.firstName.trim(), birthDate: opt(form.birthDate), address: opt(form.address), phone: opt(form.phone),
        email: opt(form.email), organization: opt(form.organization), researchTopic: form.researchTopic.trim(), pieceType: form.pieceType, pieceNumber: form.pieceNumber.trim(),
        regulationVersion: form.regulationVersion.trim(), regulationAccepted: form.regulationAccepted, cardValidUntil: form.cardValidUntil
    };
}

export function reservationProblems(roomId: string, readerId: string, day: string, slot: string, now: Date = new Date()): string[] {
    const problems: string[] = [];
    const today = todayIso(now);
    if (!roomId) problems.push('Choisissez la salle.');
    if (!readerId) problems.push('Choisissez le lecteur.');
    if (!slot) problems.push('Choisissez le créneau.');
    if (!day) problems.push('Choisissez le jour.');
    else if (day < today) problems.push('On ne réserve pas pour un jour passé.');
    else if (day > addDays(today, MAX_BOOKING_DAYS)) problems.push(`On réserve au plus ${MAX_BOOKING_DAYS} jours à l’avance.`);
    return problems;
}

export const reasonProblem = (reason: string): string | null => reason.trim().length < MIN_REASON ? `Le motif est obligatoire (${MIN_REASON} caractères au moins).` : null;

// ---------- bulletins
export interface SlipActions { prepare: string[]; refuse: string[]; deliver: boolean; returnLines: string[]; cancel: boolean }

/** Ce que l'accueil peut faire sur le bulletin dans son état actuel. */
export function slipActions(slip: Slip): SlipActions {
    const s = slip.summary.status;
    const lines = slip.items;
    return {
        prepare: s === 'DEMANDE' ? lines.filter(l => l.status === 'DEMANDEE').map(l => l.id) : [],
        refuse: s === 'DEMANDE' ? lines.filter(l => l.status === 'DEMANDEE' || l.status === 'PREPAREE').map(l => l.id) : [],
        deliver: s === 'PREPARE' && lines.some(l => l.status === 'PREPAREE'),
        returnLines: s === 'COMMUNIQUE' ? lines.filter(l => l.status === 'COMMUNIQUEE').map(l => l.id) : [],
        cancel: s === 'DEMANDE' || s === 'PREPARE'
    };
}

export function slipProgressText(s: Pick<SlipSummary, 'lines' | 'delivered' | 'returned'>): string {
    const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;
    if (s.lines === 0) return 'Aucun document';
    if (s.delivered === 0) return plural(s.lines, 'document demandé', 'documents demandés');
    return `${s.returned} restitué${s.returned > 1 ? 's' : ''} sur ${s.delivered} communiqué${s.delivered > 1 ? 's' : ''}`;
}

export function slipProblems(roomId: string, readerId: string, archiveIds: readonly string[]): string[] {
    const problems: string[] = [];
    if (!roomId) problems.push('Choisissez la salle.');
    if (!readerId) problems.push('Choisissez le lecteur.');
    if (archiveIds.length === 0) problems.push('Choisissez au moins un document.');
    if (archiveIds.length > MAX_SLIP_ITEMS) problems.push(`Un bulletin compte ${MAX_SLIP_ITEMS} documents au plus.`);
    return problems;
}

// ---------- reproductions
export interface OrderItemDraft { tariffId: string; quantity: string; description: string; archiveId?: string | null }
export interface OrderActions { accept: boolean; refuse: boolean; payment: boolean; complete: boolean; deliver: boolean; cancel: boolean }

export function orderActions(order: Pick<Order, 'summary'>): OrderActions {
    const s = order.summary;
    const open = s.status === 'DEMANDEE' || s.status === 'ACCEPTEE' || s.status === 'REALISEE';
    const total = Number(s.total);
    return {
        accept: s.status === 'DEMANDEE',
        refuse: s.status === 'DEMANDEE',
        payment: open && total > 0 && !s.paid,
        complete: s.status === 'ACCEPTEE',
        deliver: s.status === 'REALISEE' && (total === 0 || s.paid),
        cancel: s.status === 'DEMANDEE' || s.status === 'ACCEPTEE'
    };
}

export function orderBlockedText(order: Pick<Order, 'summary'>): string | null {
    const s = order.summary;
    if (s.status === 'REALISEE' && Number(s.total) > 0 && !s.paid) return 'Enregistrez l’encaissement fait au guichet avant de remettre les reproductions.';
    return null;
}

export function orderProblems(readerId: string, items: readonly OrderItemDraft[], tariffs: readonly Tariff[]): string[] {
    const problems: string[] = [];
    if (!readerId) problems.push('Choisissez le lecteur.');
    if (items.length === 0) problems.push('Ajoutez au moins une ligne.');
    if (items.length > MAX_ORDER_LINES) problems.push(`Une commande compte ${MAX_ORDER_LINES} lignes au plus.`);
    const used = items.map(i => tariffs.find(t => t.id === i.tariffId));
    if (used.some(t => !t)) problems.push('Choisissez un tarif pour chaque ligne.');
    if (new Set(used.filter(Boolean).map(t => t!.currency)).size > 1) problems.push('Une commande n’a qu’une seule devise : séparez les commandes.');
    if (items.some(i => !/^\d+$/.test(i.quantity.trim()) || Number(i.quantity) < 1 || Number(i.quantity) > 10000)) problems.push('Chaque quantité est un nombre entier de 1 à 10000.');
    return problems;
}

/** Le total calculé avec les tarifs choisis, au centime, ou null tant que la commande est incomplète. */
export function orderTotal(items: readonly OrderItemDraft[], tariffs: readonly Tariff[]): { amount: number; currency: string } | null {
    let cents = 0;
    let currency = '';
    for (const item of items) {
        const t = tariffs.find(x => x.id === item.tariffId);
        const quantity = Number(item.quantity);
        if (!t || !Number.isInteger(quantity) || quantity < 1) return null;
        if (currency && currency !== t.currency) return null;
        currency = t.currency;
        cents += Math.round(Number(t.unitPrice) * 100) * quantity;
    }
    return items.length === 0 ? null : { amount: cents / 100, currency };
}

export function orderBody(institutionId: string, readerId: string, slipId: string | null, items: readonly OrderItemDraft[], observations: string): Record<string, unknown> {
    return {
        institutionId, readerId, slipId, observations: observations.trim() || null,
        items: items.map(i => ({ tariffId: i.tariffId, quantity: Number(i.quantity), archiveId: i.archiveId ?? null, description: i.description.trim() || null }))
    };
}

export function tariffProblems(code: string, label: string, unit: string, price: string, currency: string): string[] {
    const problems: string[] = [];
    if (!/^[A-Za-z0-9_-]{2,40}$/.test(code.trim())) problems.push('Le code est de 2 à 40 caractères : lettres, chiffres, tiret ou souligné.');
    if (!label.trim()) problems.push('Le libellé est obligatoire.');
    if (!unit) problems.push('Choisissez l’unité.');
    if (!/^\d+([.,]\d{1,2})?$/.test(price.trim())) problems.push('Le prix est un montant positif ou nul, à deux décimales au plus.');
    if (!/^[A-Za-z]{3}$/.test(currency.trim())) problems.push('La devise est un code de trois lettres (GNF, EUR…).');
    return problems;
}
export const parsePrice = (value: string): number => Number(value.trim().replace(',', '.'));

// ---------- salles
export function roomProblems(code: string, name: string, capacity: string, withCode = true): string[] {
    const problems: string[] = [];
    if (withCode && !/^[A-Za-z0-9_-]{2,40}$/.test(code.trim())) problems.push('Le code est de 2 à 40 caractères : lettres, chiffres, tiret ou souligné.');
    if (!name.trim()) problems.push('Le nom de la salle est obligatoire.');
    if (!/^\d+$/.test(capacity.trim()) || Number(capacity) < 1 || Number(capacity) > 500) problems.push('La capacité est comprise entre 1 et 500 places.');
    return problems;
}

// ---------- statistiques
export interface StatisticsSection { section: string; title: string; lines: Array<StatisticsLine & { text: string }> }

export function statisticText(line: StatisticsLine): string {
    if (/^\d+$/.test(line.value)) return formatNumber(Number(line.value));
    if (/^\d+\.\d+$/.test(line.value)) return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(line.value));
    return line.value;
}

export function statisticsSections(stats: AnnualStatistics | null | undefined): StatisticsSection[] {
    if (!stats) return [];
    const order: string[] = [];
    const groups = new Map<string, StatisticsSection>();
    for (const line of stats.lines) {
        if (!groups.has(line.section)) { groups.set(line.section, { section: line.section, title: SECTION_LABELS[line.section] ?? line.section, lines: [] }); order.push(line.section); }
        groups.get(line.section)!.lines.push({ ...line, text: statisticText(line) });
    }
    return order.map(key => groups.get(key)!);
}

export const statisticsYears = (now: Date = new Date(), count = 6): number[] => Array.from({ length: count }, (_, i) => now.getUTCFullYear() - i);
export const statisticsFileName = (year: number): string => `statistiques-annuelles-${year}.csv`;
