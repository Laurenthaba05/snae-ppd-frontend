/**
 * Listes de révocation (CRL) : les listes que l'institution, ou le niveau national, dépose pour évaluer la révocation des certificats de signature, hors ligne. Aucune n'est livrée ;
 * le serveur n'ouvre aucune adresse de point de distribution. Le serveur reste seul juge ; ici, la saisie guidée.
 */
export interface RevocationList {
    id: string; institutionId: string | null; label: string; issuer: string; number: string | null; thisUpdate: string; nextUpdate: string | null; entries: number; fingerprint: string;
    status: 'ACTIF' | 'RETIRE'; retireReason: string | null; retiredAt: string | null; createdAt: string;
}

const MAX_TEXT = 8_000_000;

/** Ce qui manque à la saisie d'une liste ; vide si elle peut être envoyée. */
export function listProblems(label: string, content: string): string[] {
    const problems: string[] = [];
    if (label.trim().length === 0 || label.trim().length > 200) problems.push('Donnez un libellé (200 caractères au plus) : par exemple l’autorité qui l’émet et sa date.');
    const text = content.trim();
    if (text.length === 0) problems.push('Choisissez la liste de révocation (fichier .crl) ou collez-la au format PEM.');
    else if (/PRIVATE KEY/.test(text)) problems.push('Ce texte contient une clé privée : ne la déposez jamais. Fournissez la liste seule.');
    else if (text.includes('-----BEGIN') && !text.includes('-----BEGIN X509 CRL-----')) problems.push('Ce texte n’est pas une liste de révocation : il commence par « -----BEGIN X509 CRL----- ».');
    else if ((text.match(/-----BEGIN X509 CRL-----/g) ?? []).length > 1) problems.push('Déposez une seule liste à la fois.');
    if (text.length > MAX_TEXT) problems.push('Cette liste est trop volumineuse (5 Mo au plus).');
    return problems;
}

export const LIST_STATUS_LABELS: Record<RevocationList['status'], string> = { ACTIF: 'Active', RETIRE: 'Retirée' };
export const listScopeLabel = (l: Pick<RevocationList, 'institutionId'>): string => (l.institutionId ? 'Institution' : 'Nationale');

/** Une liste dont la prochaine mise à jour est passée : elle reste utile pour juger une signature ancienne, mais plus pour la situation actuelle. */
export function freshnessNote(l: Pick<RevocationList, 'nextUpdate' | 'status'>, now: Date = new Date()): string | null {
    if (l.status === 'RETIRE') return null;
    if (!l.nextUpdate) return 'Cette liste n’indique pas de prochaine mise à jour.';
    if (new Date(l.nextUpdate).getTime() < now.getTime()) return 'La prochaine mise à jour est passée : elle ne dit plus la situation actuelle, seulement celle de son émission.';
    return null;
}

/**
 * Le contenu d'un fichier de liste, prêt à l'envoi : un fichier PEM reste du texte ; un fichier DER (binaire) est envoyé en base64. Le serveur accepte les deux.
 */
export function listContent(bytes: Uint8Array): string {
    const head = String.fromCharCode(...bytes.slice(0, 40));
    if (head.includes('-----BEGIN')) return new TextDecoder('latin1').decode(bytes).trim();
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.slice(i, i + 0x8000));
    return btoa(binary);
}
