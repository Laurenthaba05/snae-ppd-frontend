/**
 * L'envoi de courrier : ce qui attend, ce qui est parti, ce qui a échoué. Le serveur ne renvoie que des codes, des compteurs et des adresses masquées ; jamais le contenu d'un
 * courrier (il porte des liens à usage unique).
 */
export interface MailFailure { category: string; recipient: string; subject: string; attempts: number; errorCode: string; createdAt: string }
export interface MailStatus {
    enabled: boolean; configured: boolean; security: string | null; pending: number; sent: number; failed: number; oldestPendingAt: string | null; lastSentAt: string | null;
    lastCycleFinishedAt: string | null; lastCycleCode: string | null; pausedUntil: string | null; failures: MailFailure[];
}

export const ERROR_TEXT: Record<string, string> = {
    MAIL_NOT_CONFIGURED: 'Aucun serveur de courrier n’est configuré : les courriers restent en attente.',
    MAIL_PAUSED: 'L’envoi est en pause après un refus du serveur de courrier : il reprendra de lui-même.',
    MAIL_AUTH_REJECTED: 'Le serveur de courrier a refusé l’identifiant ou le mot de passe configurés.',
    MAIL_TLS_FAILED: 'La connexion chiffrée au serveur de courrier a échoué (certificat ou version de chiffrement non acceptés).',
    MAIL_STARTTLS_REFUSED: 'Le serveur de courrier n’offre pas le chiffrement STARTTLS : rien n’est envoyé en clair.',
    MAIL_SENDER_REJECTED: 'Le serveur de courrier refuse l’adresse d’expédition configurée.',
    MAIL_GREETING_REFUSED: 'Le serveur de courrier a refusé la connexion.',
    MAIL_EHLO_REFUSED: 'Le serveur de courrier a refusé la présentation du serveur.',
    MAIL_CONNECTION_FAILED: 'Le serveur de courrier est injoignable.',
    MAIL_TIMEOUT: 'Le serveur de courrier n’a pas répondu à temps.',
    MAIL_RECIPIENT_REJECTED: 'Le serveur de courrier a refusé l’adresse du destinataire.',
    MAIL_RECIPIENT_DEFERRED: 'Le serveur de courrier a différé la réception pour ce destinataire.',
    MAIL_RECIPIENT_INVALID: 'L’adresse du destinataire est invalide.',
    MAIL_RECIPIENT_NOT_ALLOWED: 'Le domaine du destinataire n’est pas dans la liste autorisée de cet environnement.',
    MAIL_MESSAGE_REJECTED: 'Le serveur de courrier a refusé le message.',
    MAIL_MESSAGE_DEFERRED: 'Le serveur de courrier a différé le message.',
    MAIL_EXPIRED: 'Le courrier est trop ancien pour être encore envoyé.',
    MAIL_SENDER_FAILED: 'L’envoi a échoué de façon inattendue.',
    MAIL_CYCLE_FAILED: 'Le dernier cycle d’envoi a échoué : une intervention technique est nécessaire.'
};
export const errorText = (code: string | null): string => code ? (ERROR_TEXT[code] ?? 'Une erreur est survenue : une intervention technique est nécessaire.') : '';

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

export const CATEGORY_LABELS: Record<string, string> = { PORTAIL: 'Portail des lecteurs' };
export const categoryLabel = (category: string): string => CATEGORY_LABELS[category] ?? 'Notification';

/** L'état de l'envoi en une phrase : pas configuré, en pause, en retard, ou normal. */
export function summaryText(s: Pick<MailStatus, 'enabled' | 'configured' | 'pending' | 'pausedUntil' | 'lastCycleCode'>, now: number): { text: string; problem: boolean } {
    if (!s.configured) return { text: 'Aucun serveur de courrier n’est configuré : les courriers du portail restent en attente. Un agent habilité peut vérifier une adresse à la main.', problem: true };
    if (!s.enabled) return { text: 'Le serveur de courrier est configuré mais l’envoi est désactivé : les courriers restent en attente.', problem: true };
    if (s.pausedUntil && Date.parse(s.pausedUntil) > now) return { text: errorText(s.lastCycleCode && s.lastCycleCode !== 'MAIL_PAUSED' ? s.lastCycleCode : 'MAIL_PAUSED'), problem: true };
    if (s.lastCycleCode && s.lastCycleCode !== 'MAIL_PAUSED') return { text: errorText(s.lastCycleCode), problem: true };
    if (s.pending > 0) return { text: `${plural(s.pending, 'courrier attend', 'courriers attendent')} son envoi.`, problem: false };
    return { text: 'Tous les courriers déposés ont été traités.', problem: false };
}

export function failureTitle(f: Pick<MailFailure, 'category' | 'subject' | 'recipient'>): string {
    return `${f.subject} — ${f.recipient}`;
}
