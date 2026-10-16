/**
 * La clé qui scelle les actes (V98) : module matériel ou magasin logiciel, certificat, expiration et certificats déjà employés. Le serveur reste seul juge ; rien de secret n'est
 * affiché (ni mot de passe, ni code PIN, ni matériel de clé).
 */
export interface SealCertificateUse { fingerprint: string; subject: string | null; seals: number; firstSealedAt: string; lastSealedAt: string; current: boolean }
export interface SealKeyStatus {
    enabled: boolean; storeType: string | null; hardware: boolean; alias: string | null; subject: string | null; issuer: string | null; serial: string | null;
    fingerprint: string | null; notBefore: string | null; notAfter: string | null; daysRemaining: number | null; rotationDue: boolean; rotationWarnDays: number;
    algorithm: string | null; keyBits: number | null; sealsWithCurrentKey: number; history: SealCertificateUse[]; warnings: string[];
}

export const ALGORITHM_LABELS: Record<string, string> = { SHA256withRSA: 'SHA-256 avec RSA', SHA256withECDSA: 'SHA-256 avec ECDSA' };

/** « Module matériel (PKCS#11) » ou « Magasin logiciel (PKCS#12) ». */
export function storeLabel(status: Pick<SealKeyStatus, 'storeType' | 'hardware'>): string {
    if (status.hardware) return 'Module matériel (PKCS#11)';
    return status.storeType === 'PKCS11' ? 'Module matériel (PKCS#11)' : 'Magasin logiciel (PKCS#12)';
}

/** Ce qu'il reste avant l'expiration, en une phrase ; « expiré » si la date est passée. */
export function validityText(status: Pick<SealKeyStatus, 'daysRemaining' | 'rotationDue' | 'rotationWarnDays'>): string {
    const d = status.daysRemaining;
    if (d === null) return '—';
    if (d < 0) return 'Expiré';
    const text = d === 0 ? 'Expire aujourd’hui' : `${d} jour${d > 1 ? 's' : ''} restant${d > 1 ? 's' : ''}`;
    return status.rotationDue ? `${text} — rotation à préparer (seuil : ${status.rotationWarnDays} jours)` : text;
}

/** Le bilan d'un certificat de l'historique : « 12 actes scellés du 3 mars 2026 au 9 octobre 2026 ». */
export function usageText(use: Pick<SealCertificateUse, 'seals'>): string {
    return `${use.seals} acte${use.seals > 1 ? 's' : ''} scellé${use.seals > 1 ? 's' : ''}`;
}

export function badge(status: Pick<SealKeyStatus, 'enabled' | 'daysRemaining'>): string {
    if (!status.enabled) return 'BROUILLON';
    return status.daysRemaining !== null && status.daysRemaining < 0 ? 'ECHEC' : 'ACTIF';
}
