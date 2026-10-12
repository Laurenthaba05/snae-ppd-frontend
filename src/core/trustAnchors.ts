/**
 * Ancres de confiance : les certificats (racines ou intermédiaires) que l'institution, ou le niveau national, reconnaît pour évaluer la chaîne des signatures électroniques. Aucune n'est
 * livrée avec l'application : c'est une décision de l'institution, qui engage la valeur de toutes les vérifications. Le serveur reste seul juge ; ici, la saisie guidée.
 */
export interface TrustAnchor {
    id: string; institutionId: string | null; label: string; subject: string; issuer: string; serial: string; fingerprint: string; validFrom: string; validTo: string;
    selfSigned: boolean; expired: boolean; status: 'ACTIF' | 'RETIRE'; retireReason: string | null; retiredAt: string | null; createdAt: string;
}

const PEM_BEGIN = '-----BEGIN CERTIFICATE-----';
const MAX_PEM = 20_000;

/** Ce qui manque à la saisie d'une ancre ; vide si elle peut être envoyée. Le serveur relit tout : seul un certificat X.509, jamais une clé. */
export function anchorProblems(label: string, pem: string): string[] {
    const problems: string[] = [];
    if (label.trim().length === 0 || label.trim().length > 200) problems.push('Donnez un libellé (200 caractères au plus) : par exemple le nom de l’autorité.');
    const text = pem.trim();
    if (text.length === 0) problems.push('Collez ou choisissez le certificat, au format PEM.');
    else if (/PRIVATE KEY/.test(text)) problems.push('Ce texte contient une clé privée : ne la déposez jamais. Fournissez le certificat seul.');
    else if (!text.startsWith(PEM_BEGIN)) problems.push('Le certificat doit être au format PEM : il commence par « -----BEGIN CERTIFICATE----- ».');
    else if ((text.match(/-----BEGIN CERTIFICATE-----/g) ?? []).length > 1) problems.push('Déposez un seul certificat à la fois.');
    if (text.length > MAX_PEM) problems.push('Ce certificat est trop volumineux.');
    return problems;
}

export const STATUS_LABELS: Record<TrustAnchor['status'], string> = { ACTIF: 'Active', RETIRE: 'Retirée' };

/** Le périmètre d'une ancre : nationale (valable pour toutes les institutions) ou propre à l'institution. */
export const scopeLabel = (a: Pick<TrustAnchor, 'institutionId'>): string => (a.institutionId ? 'Institution' : 'Nationale');

/** Une ancre périmée reste lisible mais ne fait plus de chaîne pour les signatures récentes : on le signale. */
export function expiryNote(a: Pick<TrustAnchor, 'expired' | 'selfSigned' | 'status'>): string | null {
    if (a.status === 'RETIRE') return null;
    if (a.expired) return 'Ce certificat est expiré : il ne fait de chaîne que pour des signatures datées de sa période de validité.';
    return null;
}
