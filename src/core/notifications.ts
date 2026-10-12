/**
 * Centre de notifications du personnel : ce qui attend la personne connectée (tâche de validation, versement à contrôler, décision sur un versement). Une notification est
 * personnelle : on ne lit, on ne marque et on n'archive que les siennes. Le serveur reste seul juge ; ici, l'affichage.
 */
export type NotificationFilter = 'UNREAD' | 'ALL' | 'ARCHIVED';

export interface StaffNotification {
    id: string; category: string; title: string; message: string | null; objectType: string | null; objectId: string | null;
    read: boolean; readAt: string | null; archivedAt: string | null; createdAt: string;
}
export interface NotificationPage { items: StaffNotification[]; page: number; size: number; hasMore: boolean; unread: number }
export interface NotificationPreference { category: string; enabled: boolean }

export const FILTERS: Array<[NotificationFilter, string]> = [['UNREAD', 'Non lues'], ['ALL', 'Toutes'], ['ARCHIVED', 'Archivées']];

export const CATEGORY_LABELS: Record<string, string> = {
    WORKFLOW_TASK: 'Tâches de validation',
    INTAKE_SUBMITTED: 'Versements à contrôler',
    INTAKE_DECISION: 'Décisions sur mes versements',
    ELIMINATION_SUBMITTED: 'Bordereaux d’élimination à viser',
    ELIMINATION_DECIDED: 'Décisions sur mes bordereaux d’élimination',
    ELIMINATION_TO_EXECUTE: 'Bordereaux d’élimination à exécuter',
    TRANSFER_SUBMITTED: 'Bordereaux de versement à recevoir',
    TRANSFER_RECEIVED: 'Réceptions de mes bordereaux de versement',
    TRANSFER_TO_EXECUTE: 'Bordereaux de versement à remettre',
    ACCESS_REQUESTED: 'Demandes d’accès à instruire',
    DEADLINE_APPROACHING: 'Échéances de conservation',
    RISK_FOLLOW_UP: 'Risques et plans d’urgence',
    EXIT_TO_EXAMINE: 'Sorties de collection à examiner',
    EXIT_TO_DECIDE: 'Sorties de collection à décider',
    EXIT_TO_EXECUTE: 'Sorties de collection à exécuter'
};
export const CATEGORY_HINTS: Record<string, string> = {
    WORKFLOW_TASK: 'Une étape d’un circuit de validation attend une personne de votre rôle.',
    INTAKE_SUBMITTED: 'Un versement a été soumis et attend un contrôle.',
    INTAKE_DECISION: 'Un versement que vous avez soumis est accepté, rejeté, à corriger ou reçu.',
    ELIMINATION_SUBMITTED: 'Un bordereau d’élimination a été soumis et attend le visa de l’autorité.',
    ELIMINATION_DECIDED: 'Un bordereau d’élimination que vous avez soumis est visé ou refusé.',
    ELIMINATION_TO_EXECUTE: 'Un bordereau d’élimination est visé : la destruction revient à une troisième personne.',
    TRANSFER_SUBMITTED: 'Un bordereau de versement a été soumis à votre institution et attend sa réception.',
    TRANSFER_RECEIVED: 'Un bordereau de versement que vous avez soumis est reçu ou refusé par l’institution destinataire.',
    TRANSFER_TO_EXECUTE: 'Un bordereau de versement est reçu : la remise revient à une troisième personne.',
    ACCESS_REQUESTED: 'Un lecteur du portail demande l’accès à un document de votre institution.',
    DEADLINE_APPROACHING: 'Des échéances de conservation de votre institution arrivent à terme ou sont dépassées (une fois par jour au plus).',
    RISK_FOLLOW_UP: 'Des revues de risques, des mesures ou des plans d’urgence des emplacements de conservation arrivent à échéance ou sont en retard (une fois par jour au plus).',
    EXIT_TO_EXAMINE: 'Une sortie définitive d’un bien a été proposée : son examen juridique revient à une autre personne que celle qui l’a proposée.',
    EXIT_TO_DECIDE: 'Une sortie définitive d’un bien est examinée : la décision revient à une personne qui n’a ni proposé ni examiné la sortie.',
    EXIT_TO_EXECUTE: 'Une sortie définitive d’un bien est décidée : son exécution revient à une personne autre que celle qui a décidé.'
};
export const categoryLabel = (category: string): string => CATEGORY_LABELS[category] ?? 'Notification';

/** La page où se traite la notification ; `null` quand on ne sait pas où elle mène (elle reste lisible). */
export function notificationPath(objectType: string | null, objectId: string | null): string | null {
    if (!objectType || !objectId) return null;
    if (objectType === 'DOCUMENT') return `/app/documents/${objectId}`;
    if (objectType === 'DOSSIER') return `/app/dossiers/${objectId}`;
    if (objectType === 'ENTREE_ARCHIVISTIQUE') return '/app/versements';
    // les bordereaux d'élimination et de versement se traitent sur la page des éliminations ; les demandes d'accès sur celle du portail
    if (objectType === 'BORDEREAU_ELIMINATION' || objectType === 'TRANSFERT_ARCHIVES') return '/app/eliminations';
    if (objectType === 'DEMANDE_ACCES_PORTAIL') return '/app/portail';
    // la sortie d'un bien se traite dans l'onglet « Sortie de collection » de sa fiche
    if (objectType === 'BIEN_PATRIMONIAL') return `/app/patrimoine?bien=${objectId}`;
    return null;
}

/** « il y a 5 min », « il y a 3 h », « hier », « il y a 4 j », puis la date. Une date future ou illisible s'écrit « à l’instant » ou « date inconnue ». */
export function relativeTime(iso: string, now: number = Date.now()): string {
    const at = Date.parse(iso);
    if (Number.isNaN(at)) return 'date inconnue';
    const seconds = Math.floor((now - at) / 1000);
    if (seconds < 60) return 'à l’instant';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `il y a ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `il y a ${hours} h`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'hier';
    if (days < 7) return `il y a ${days} j`;
    return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(at));
}

/** Le chiffre du badge de la cloche : rien à zéro, « 99+ » au-delà. */
export const unreadBadge = (count: number): string => (count <= 0 ? '' : count > 99 ? '99+' : String(count));

/** Le texte lu par un lecteur d'écran pour la cloche. */
export function bellLabel(count: number): string {
    if (count <= 0) return 'Notifications, aucune non lue';
    return `Notifications, ${count} non lue${count > 1 ? 's' : ''}`;
}

/** Intervalle de relecture du compteur, tant que la page est affichée. */
export const POLL_MS = 60_000;
