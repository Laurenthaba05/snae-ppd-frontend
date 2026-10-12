/**
 * L'horodatage qualifié d'une version scellée demande une autorité d'horodatage externe. Quand il échoue, le serveur répond 503 avec un code court ;
 * on dit ce que ce code signifie, sans laisser croire à une panne générale (le reste du parcours ne dépend pas de l'horodatage).
 */
export interface TimestampFailure {
    /** Le service d'horodatage n'est pas mis en service : rien à réessayer tant que l'administration ne l'a pas configuré. */
    notConfigured: boolean;
    text: string;
}

const NOT_CONFIGURED = 'L’horodatage qualifié n’est pas activé sur ce serveur : il exige une autorité d’horodatage, ses certificats de confiance et sa liste de révocation. Ce n’est pas nécessaire pour clore le document ni planifier sa conservation.';

const TEXTS: Record<string, string> = {
    TIMESTAMPING_UNAVAILABLE: 'L’autorité d’horodatage n’a pas répondu. Réessayez plus tard ; le reste du parcours n’en dépend pas.',
    TSA_REJECTED: 'L’autorité d’horodatage a refusé la demande. Réessayez plus tard ou prévenez l’administration.',
    TSA_CONTENT_TYPE_INVALID: 'L’autorité d’horodatage a répondu dans un format inattendu. Prévenez l’administration.',
    TSA_CRYPTOGRAPHIC_VALIDATION_FAILED: 'La preuve reçue de l’autorité d’horodatage n’a pas pu être vérifiée (signature ou certificat). Elle n’est pas enregistrée.'
};

/** Explication d'un échec d'horodatage d'après le code du serveur ; null si le code n'est pas un code d'horodatage (l'erreur s'affiche alors telle quelle). */
export function timestampFailure(code: string | null | undefined): TimestampFailure | null {
    if (!code) return null;
    if (code === 'TIMESTAMPING_NOT_CONFIGURED') return { notConfigured: true, text: NOT_CONFIGURED };
    const text = TEXTS[code];
    return text ? { notConfigured: false, text } : null;
}
