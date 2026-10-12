/**
 * Communicabilité et occultation. Une catégorie de communicabilité (donnée de référence, avec sa base légale) fixe un délai ; l'appliquer à un document calcule sa date de libre
 * communicabilité et pose la restriction d'accès jusque-là. L'occultation masque des zones d'une page dans toute lecture publique. Les règles reprennent celles du serveur pour
 * guider la saisie ; le serveur reste seul juge.
 */
export type CommunicabilityTrigger = 'DATE_DOCUMENT' | 'DATE_CLOTURE_DOCUMENT' | 'DATE_CLOTURE_DOSSIER' | 'DATE_EVENEMENT';
export type CommunicabilityState = 'LIBRE' | 'EN_ATTENTE' | 'INCOMMUNICABLE';
export type DelayUnit = 'JOURS' | 'MOIS' | 'ANNEES';
export type RestrictionLevel = 'RESTREINT' | 'CONFIDENTIEL' | 'SECRET';

export interface CommunicabilityCategory {
    id: string; code: string; label: string; description: string | null; scope: 'NATIONAL' | 'INSTITUTION'; institutionId: string | null; trigger: CommunicabilityTrigger;
    eventLabel: string | null; duration: number | null; unit: DelayUnit | null; perpetual: boolean; level: RestrictionLevel; legalBasis: string; legalSourceId: string | null;
    personalData: boolean; status: 'ACTIVE' | 'RETIREE'; typeDocumentIds: string[];
}
export interface Communicability {
    id: string; documentId: string; categoryId: string; code: string; label: string; trigger: CommunicabilityTrigger; duration: number | null; unit: DelayUnit | null; perpetual: boolean;
    baseDate: string; eventDate: string | null; freeDate: string | null; state: CommunicabilityState; daysRemaining: number | null; restrictionId: string | null; appliedById: string;
    appliedAt: string; reason: string | null; status: 'EN_VIGUEUR' | 'RETIREE'; removedById: string | null; removedAt: string | null; removalReason: string | null;
}
export interface DocumentCommunicability { current: Communicability | null; suggestions: CommunicabilityCategory[]; personalData: string; sensitiveData: boolean }
export interface PendingItem { documentId: string; reference: string; title: string; departmentId: string | null; baseDate: string | null; freeDate: string | null; personalData: string; blockers: string[] }
export interface UpcomingItem { documentId: string; reference: string; title: string; code: string; label: string; freeDate: string; daysRemaining: number }
export interface PersonalDataGap { documentId: string; reference: string; title: string; departmentId: string | null; sensitive: boolean; nature: string | null }

export const TRIGGER_LABELS: Record<CommunicabilityTrigger, string> = {
    DATE_DOCUMENT: 'la date du document', DATE_CLOTURE_DOCUMENT: 'la clôture du document', DATE_CLOTURE_DOSSIER: 'la clôture du dossier', DATE_EVENEMENT: 'une date d’événement'
};
export const LEVEL_LABELS: Record<RestrictionLevel, string> = { RESTREINT: 'Restreint', CONFIDENTIEL: 'Confidentiel', SECRET: 'Secret' };
export const STATE_LABELS: Record<CommunicabilityState, string> = { LIBRE: 'Librement communicable', EN_ATTENTE: 'En attente du délai', INCOMMUNICABLE: 'Incommunicable' };

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

export function durationText(duration: number, unit: DelayUnit): string {
    return unit === 'JOURS' ? plural(duration, 'jour', 'jours') : unit === 'MOIS' ? `${duration} mois` : plural(duration, 'an', 'ans');
}

/** « 50 ans après la date du document », « 120 ans après la date de naissance », « Perpétuelle : jamais communicable ». */
export function delayText(c: Pick<CommunicabilityCategory, 'perpetual' | 'duration' | 'unit' | 'trigger' | 'eventLabel'>): string {
    if (c.perpetual || c.duration === null || c.unit === null) return 'Perpétuelle : jamais librement communicable';
    const from = c.trigger === 'DATE_EVENEMENT' ? (c.eventLabel ? c.eventLabel.charAt(0).toLowerCase() + c.eventLabel.slice(1) : 'la date de l’événement') : TRIGGER_LABELS[c.trigger];
    return c.duration === 0 ? `Dès ${from}` : `${durationText(c.duration, c.unit)} après ${from}`;
}

/** Combien de temps reste-t-il, en une phrase lisible : « dans 40 jours », « dans environ 12 ans ». */
export function remainingText(days: number | null | undefined): string {
    if (days === null || days === undefined) return '';
    if (days < 1) return 'aujourd’hui';
    if (days < 90) return `dans ${plural(days, 'jour', 'jours')}`;
    if (days < 730) return `dans environ ${Math.round(days / 30.4375)} mois`;
    return `dans environ ${Math.round(days / 365.25)} ans`;
}

/** L'état d'une application, en une phrase : libre depuis, communicable le, ou incommunicable. */
export function stateText(v: Pick<Communicability, 'state' | 'freeDate' | 'daysRemaining'>, day: (iso: string) => string): string {
    switch (v.state) {
        case 'LIBRE': return v.freeDate ? `Librement communicable depuis le ${day(v.freeDate)}.` : 'Librement communicable.';
        case 'EN_ATTENTE': return `Communicable le ${day(v.freeDate ?? '')}, ${remainingText(v.daysRemaining)}.`;
        case 'INCOMMUNICABLE': return 'Incommunicable : le délai est perpétuel.';
    }
}

/** Ce que dit la restriction posée par une catégorie : à qui elle interdit la lecture, jusqu'à quand. */
export function restrictionText(v: Pick<Communicability, 'state' | 'restrictionId'>): string {
    if (v.state === 'LIBRE') return 'Aucune restriction n’est nécessaire : le délai est écoulé.';
    return v.restrictionId ? 'Une restriction d’accès est posée jusqu’à la date de libre communicabilité ; elle s’éteint d’elle-même.' : '';
}

export const PENDING_BLOCKERS: Record<string, string> = {
    COMMUNICABILITY_BASE_DATE_MISSING: 'La date d’où court le délai n’existe pas pour ce document.',
    COMMUNICABILITY_EVENT_DATE_REQUIRED: 'Le délai court d’une date d’événement : à saisir document par document.'
};
export const pendingBlockerText = (code: string): string => PENDING_BLOCKERS[code] ?? code.toLowerCase().replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()) + '.';

// ---------- catégorie
export interface CategoryForm {
    code: string; label: string; description: string; trigger: CommunicabilityTrigger; eventLabel: string; duration: string; unit: DelayUnit; perpetual: boolean; level: RestrictionLevel;
    legalBasis: string; personalData: boolean; typeDocumentIds: string[];
}
export const emptyCategory = (): CategoryForm => ({
    code: '', label: '', description: '', trigger: 'DATE_DOCUMENT', eventLabel: '', duration: '', unit: 'ANNEES', perpetual: false, level: 'RESTREINT', legalBasis: '', personalData: false, typeDocumentIds: []
});

export function categoryProblems(f: CategoryForm): string[] {
    const problems: string[] = [];
    const code = f.code.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_.-]{0,59}$/.test(code)) problems.push('Le code est en majuscules, chiffres, point, tiret ou soulignement (60 caractères au plus).');
    if (!f.label.trim()) problems.push('L’intitulé de la catégorie est obligatoire.'); else if (f.label.trim().length > 255) problems.push('L’intitulé est limité à 255 caractères.');
    if (!f.legalBasis.trim()) problems.push('La base légale du délai est obligatoire : le texte qui le fixe.'); else if (f.legalBasis.trim().length > 1000) problems.push('La base légale est limitée à 1000 caractères.');
    if (f.trigger === 'DATE_EVENEMENT' && !f.eventLabel.trim()) problems.push('Un délai qui court depuis une date d’événement doit dire quel événement (naissance, décès, fin du marché…).');
    if (!f.perpetual) {
        if (!/^\d+$/.test(f.duration.trim())) problems.push('La durée est un nombre entier, de 0 à 1000.');
        else if (Number(f.duration) > 1000) problems.push('La durée est un nombre entier, de 0 à 1000.');
    }
    if (f.description.trim().length > 4000) problems.push('La description est limitée à 4000 caractères.');
    return problems;
}

export function categoryBody(f: CategoryForm, institutionId: string | null): Record<string, unknown> {
    return {
        code: f.code.trim().toUpperCase(), label: f.label.trim(), description: f.description.trim() || null, institutionId, trigger: f.trigger,
        eventLabel: f.trigger === 'DATE_EVENEMENT' ? f.eventLabel.trim() : null, duration: f.perpetual ? null : Number(f.duration), unit: f.perpetual ? null : f.unit, perpetual: f.perpetual,
        level: f.level, legalBasis: f.legalBasis.trim(), personalData: f.personalData, typeDocumentIds: [...f.typeDocumentIds].sort()
    };
}

// ---------- application
export interface ApplyForm { categoryId: string; eventDate: string; reason: string }
export const emptyApply = (categoryId = ''): ApplyForm => ({ categoryId, eventDate: '', reason: '' });

export function applyProblems(f: ApplyForm, category: Pick<CommunicabilityCategory, 'trigger'> | null | undefined): string[] {
    const problems: string[] = [];
    if (!f.categoryId || !category) problems.push('Choisissez la catégorie à appliquer.');
    if (category?.trigger === 'DATE_EVENEMENT') {
        if (!f.eventDate) problems.push('Cette catégorie court d’une date d’événement : saisissez-la.');
        else if (Number.isNaN(Date.parse(f.eventDate))) problems.push('La date de l’événement n’est pas une date valide.');
    }
    if (f.reason.trim().length > 4000) problems.push('Le motif est limité à 4000 caractères.');
    return problems;
}
export const applyBody = (f: ApplyForm, category: Pick<CommunicabilityCategory, 'trigger'>): Record<string, unknown> =>
    ({ categoryId: f.categoryId, eventDate: category.trigger === 'DATE_EVENEMENT' ? f.eventDate : null, reason: f.reason.trim() || null });

/** La date libre que donnerait la catégorie : estimation à l'écran (le serveur calcule la valeur retenue), pour montrer ce qui va être posé. */
export function estimateFreeDate(c: Pick<CommunicabilityCategory, 'perpetual' | 'duration' | 'unit'>, base: string | null | undefined): string | null {
    if (c.perpetual || c.duration === null || c.unit === null || !base) return null;
    const [y, m, d] = base.slice(0, 10).split('-').map(Number);
    if (!y || !m || !d) return null;
    const result = new Date(Date.UTC(y, m - 1, d));
    if (c.unit === 'JOURS') result.setUTCDate(result.getUTCDate() + c.duration);
    else if (c.unit === 'MOIS') {
        const targetMonth = result.getUTCMonth() + c.duration;
        const lastDay = new Date(Date.UTC(result.getUTCFullYear(), targetMonth + 1, 0)).getUTCDate();
        result.setUTCDate(1); result.setUTCMonth(targetMonth); result.setUTCDate(Math.min(d, lastDay));
    } else {
        const target = result.getUTCFullYear() + c.duration;
        const lastDay = new Date(Date.UTC(target, m, 0)).getUTCDate();
        result.setUTCDate(1); result.setUTCFullYear(target); result.setUTCDate(Math.min(d, lastDay));
    }
    return result.toISOString().slice(0, 10);
}

// ---------- occultation
export interface RedactionZone {
    id: string; documentId: string; page: number; image: number; x: number; y: number; width: number; height: number; reason: string; status: 'ACTIVE' | 'RETIREE';
    createdById: string; createdAt: string; removedById: string | null; removedAt: string | null; removalReason: string | null;
}
export interface RedactionPage { number: number; images: number; fileId: string; fileName: string; zones: number }
export interface Rect { x: number; y: number; width: number; height: number }
export const MIN_ZONE = 0.002;
export const MAX_ZONES = 200;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Le rectangle (coordonnées relatives, de 0 à 1) tiré entre deux points de l'image affichée, quel que soit le sens du geste ; null si l'image n'a pas de taille. */
export function rectFromPoints(a: { x: number; y: number }, b: { x: number; y: number }, size: { width: number; height: number }): Rect | null {
    if (size.width <= 0 || size.height <= 0) return null;
    const x0 = clamp01(Math.min(a.x, b.x) / size.width), x1 = clamp01(Math.max(a.x, b.x) / size.width);
    const y0 = clamp01(Math.min(a.y, b.y) / size.height), y1 = clamp01(Math.max(a.y, b.y) / size.height);
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

export function zoneProblems(rect: Rect | null, reason: string, activeCount = 0): string[] {
    const problems: string[] = [];
    if (!rect || rect.width < MIN_ZONE || rect.height < MIN_ZONE) problems.push('Dessinez la zone à cacher sur la page : tirez un rectangle.');
    if (!reason.trim()) problems.push('Le motif de l’occultation est obligatoire (donnée personnelle, secret protégé…).');
    else if (reason.trim().length > 500) problems.push('Le motif est limité à 500 caractères.');
    if (activeCount >= MAX_ZONES) problems.push(`Un document compte ${MAX_ZONES} zones occultées au plus.`);
    return problems;
}

/** Les zones actives d'une image d'une page. */
export const zonesOf = (zones: readonly RedactionZone[], page: number, image: number): RedactionZone[] =>
    zones.filter(z => z.status === 'ACTIVE' && z.page === page && z.image === image);

export function redactionSummary(zones: readonly RedactionZone[]): string {
    const active = zones.filter(z => z.status === 'ACTIVE');
    if (active.length === 0) return 'Aucune zone occultée : la lecture publique montre les pages en entier.';
    const pages = new Set(active.map(z => z.page)).size;
    return `${plural(active.length, 'zone occultée', 'zones occultées')} sur ${plural(pages, 'page', 'pages')} : le lecteur du portail ne les voit jamais.`;
}

/** Le corps de la requête : la position s'arrondit, la taille s'arrondit vers le bas pour que la zone ne déborde jamais de la page à cause de l'arrondi. */
export const zoneBody = (page: number, image: number, r: Rect, reason: string): Record<string, unknown> => {
    const x = round6(r.x), y = round6(r.y);
    return { page, image, x, y, width: Math.min(floor6(r.width), floor6(1 - x)), height: Math.min(floor6(r.height), floor6(1 - y)), reason: reason.trim() };
};
const round6 = (v: number) => Math.round(v * 1e6) / 1e6;
const floor6 = (v: number) => Math.floor(v * 1e6 + 1e-9) / 1e6;
