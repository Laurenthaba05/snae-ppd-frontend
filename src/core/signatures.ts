/**
 * Signatures électroniques d'un document : celles que l'on déclare (qui a signé, en quelle qualité, quand) et celles que le serveur vérifie dans un PDF (le contenu a-t-il changé depuis
 * la signature ? le certificat correspond-il ?). Les règles reprennent celles du serveur pour guider la saisie ; le serveur reste seul juge.
 *
 * Ce que la vérification dit de l'intégrité (le contenu a-t-il changé ?) et, depuis qu'une institution déclare ses autorités de confiance, de la chaîne du certificat (remonte-t-elle à une
 * autorité que l'on reconnaît ?). La révocation du certificat n'est pas vérifiée : tout verdict de confiance le dit.
 */

export type SignatureFormat = 'PADES' | 'CADES' | 'XADES' | 'AUTRE';
export type SignatureLevel = 'SIMPLE' | 'AVANCEE' | 'QUALIFIEE' | 'INCONNU';
export type SignatureCheck = 'NON_VERIFIEE' | 'INTEGRITE_VALIDE' | 'INTEGRITE_INVALIDE' | 'INDETERMINEE';

export type ChainStatus = 'NON_EVALUEE' | 'VALIDE' | 'NON_ANCREE' | 'INVALIDE';
export const CHAIN_LABELS: Record<ChainStatus, string> = {
    NON_EVALUEE: 'Chaîne non évaluée', VALIDE: 'Chaîne de confiance établie', NON_ANCREE: 'Émetteur non reconnu', INVALIDE: 'Chaîne invalide à la date de signature'
};
export interface CertificateInfo { subject: string; issuer: string; serial: string; sha256: string; validFrom: string; validTo: string }
export interface DocumentSignature {
    id: string; fileId: string; fileName: string; source: 'DECLAREE' | 'VERIFIEE'; format: SignatureFormat; level: SignatureLevel; signer: string; quality: string | null; organization: string | null;
    signedAt: string | null; fileHash: string; status: SignatureCheck; verifiedAt: string | null; message: string | null; coversWholeFile: boolean | null; certificate: CertificateInfo | null;
    signedWithinCertificateValidity: boolean | null; comment: string | null; version: number; createdAt: string;
    chainStatus?: ChainStatus; chainAnchor?: string | null; chainMessage?: string | null;
}

export const FORMAT_LABELS: Record<SignatureFormat, string> = { PADES: 'PAdES (signature intégrée au PDF)', CADES: 'CAdES (signature CMS)', XADES: 'XAdES (signature XML)', AUTRE: 'Autre (papier, image, cachet…)' };
export const FORMAT_SHORT: Record<SignatureFormat, string> = { PADES: 'PAdES', CADES: 'CAdES', XADES: 'XAdES', AUTRE: 'Autre format' };
export const LEVEL_LABELS: Record<SignatureLevel, string> = { SIMPLE: 'Simple', AVANCEE: 'Avancée', QUALIFIEE: 'Qualifiée', INCONNU: 'Niveau inconnu' };
export const LEVEL_HINTS: Record<SignatureLevel, string> = {
    SIMPLE: 'Une signature manuscrite scannée, un nom saisi : elle identifie peu.',
    AVANCEE: 'Liée au signataire et détectant toute modification, mais pas forcément par un prestataire qualifié.',
    QUALIFIEE: 'Délivrée par un prestataire qualifié : la plus forte.',
    INCONNU: 'On ne sait pas : à renseigner si on l’apprend.'
};
export const CHECK_LABELS: Record<SignatureCheck, string> = {
    NON_VERIFIEE: 'Non vérifiée', INTEGRITE_VALIDE: 'Intégrité vérifiée', INTEGRITE_INVALIDE: 'Contenu modifié', INDETERMINEE: 'Indéterminée'
};
/**
 * Un fichier se vérifie s'il porte des signatures intégrées lisibles : un PDF (PAdES), un objet CMS à contenu intégré `.p7m` (CAdES) ou un document XML signé (XML-DSig, XAdES).
 * Une signature détachée `.p7s` ne se vérifie qu'avec le fichier qu'elle signe (voir `isDetachedSignature`).
 */
export function isVerifiable(mediaType: string | null | undefined, fileName?: string | null): boolean {
    const type = (mediaType ?? '').toLowerCase();
    const name = (fileName ?? '').toLowerCase();
    if (type === 'application/pdf') return true;
    if (type === 'application/pkcs7-mime' || name.endsWith('.p7m')) return true;
    if (type === 'application/xml' || type === 'text/xml' || name.endsWith('.xml')) return true;
    return false;
}
/** Une signature CAdES détachée : le fichier de signature, à vérifier avec le fichier qu'elle signe. */
export const isDetachedSignature = (mediaType: string | null | undefined, fileName?: string | null): boolean =>
    (mediaType ?? '').toLowerCase() === 'application/pkcs7-signature' || (fileName ?? '').toLowerCase().endsWith('.p7s');

/** Le nom commun d'un nom distinctif (« CN=Mamadou Diallo,O=Ministère,C=GN » → « Mamadou Diallo ») ; à défaut, le nom entier. */
export function commonName(distinguishedName: string | null | undefined): string {
    const dn = (distinguishedName ?? '').trim();
    const match = /(?:^|,)\s*CN=((?:\\.|[^,\\])+)/i.exec(dn);
    return match ? match[1]!.replace(/\\(.)/g, '$1').trim() : dn;
}
/** Le nom de l'émetteur, sans le détail technique du certificat. */
export const issuerName = commonName;
/** Un certificat dont l'émetteur est son propre sujet n'a été garanti par personne d'autre. */
export const isSelfSigned = (c: CertificateInfo | null | undefined): boolean => !!c && c.subject.trim() === c.issuer.trim();

/** L'empreinte du fichier en forme courte, pour le lire sans la recopier : « ab12…ef90 ». */
export const shortHash = (hash: string | null | undefined): string => !hash ? '' : hash.length > 16 ? hash.slice(0, 8) + '…' + hash.slice(-8) : hash;

export type VerdictTone = 'success' | 'danger' | 'warning' | 'neutral';
export interface Verdict { tone: VerdictTone; title: string; notes: string[] }

/**
 * Ce que dit une signature, en clair : un titre et les réserves à connaître. On ne conclut jamais « signature valable » : l'intégrité est établie, pas la confiance.
 */
export function verdictOf(s: Pick<DocumentSignature, 'source' | 'status' | 'coversWholeFile' | 'signedWithinCertificateValidity' | 'certificate' | 'message' | 'chainStatus' | 'chainAnchor'>): Verdict {
    if (s.source === 'DECLAREE') return { tone: 'neutral', title: 'Déclarée, non vérifiée', notes: ['Cette signature a été saisie par une personne : le serveur ne l’a pas contrôlée.'] };
    const notes: string[] = [];
    if (s.status === 'INTEGRITE_INVALIDE') return { tone: 'danger', title: 'Le contenu a été modifié depuis la signature', notes: ['Le fichier n’est plus celui que le signataire a signé, ou la signature ne correspond pas à son certificat.'] };
    if (s.status === 'INDETERMINEE') return { tone: 'warning', title: 'Vérification impossible', notes: s.message ? [s.message] : [] };
    if (s.coversWholeFile === false) notes.push('Des octets ont été ajoutés après cette signature (autre signature ou mise à jour du PDF) : elle ne couvre pas la fin du fichier.');
    if (s.signedWithinCertificateValidity === false) notes.push('Le certificat n’était pas valide à la date de signature.');
    const chain = s.chainStatus ?? 'NON_EVALUEE';
    // un certificat auto-signé que l'institution a déclaré de confiance est la racine de sa propre chaîne : ce n'est plus une réserve
    if (isSelfSigned(s.certificate) && chain !== 'VALIDE') notes.push('Le certificat est auto-signé : personne d’autre ne garantit l’identité du signataire.');
    const reserves = notes.length;
    if (chain === 'VALIDE') notes.push(`La chaîne du certificat remonte à une autorité de confiance déclarée${s.chainAnchor ? ' (' + commonName(s.chainAnchor) + ')' : ''}. La révocation du certificat n’est pas vérifiée.`);
    else if (chain === 'NON_ANCREE') notes.push('L’émetteur du certificat ne remonte à aucune autorité de confiance déclarée : l’identité du signataire n’est garantie par personne que vous reconnaissiez.');
    else if (chain === 'INVALIDE') notes.push('Un certificat de la chaîne n’était pas valide à la date de la signature : la chaîne n’est pas de confiance.');
    else notes.push('La chaîne de confiance du certificat n’est pas évaluée : l’émetteur n’est pas comparé à une liste d’autorités reconnues.');
    const warning = reserves > 0 || chain === 'NON_ANCREE' || chain === 'INVALIDE';
    return { tone: warning ? 'warning' : 'success', title: 'Le contenu n’a pas été modifié depuis la signature', notes };
}

/** Le décompte pour l'en-tête du panneau. */
export function overview(list: ReadonlyArray<Pick<DocumentSignature, 'source' | 'status'>>): { total: number; intact: number; altered: number; undetermined: number; declared: number } {
    return {
        total: list.length, declared: list.filter(s => s.source === 'DECLAREE').length,
        intact: list.filter(s => s.source === 'VERIFIEE' && s.status === 'INTEGRITE_VALIDE').length,
        altered: list.filter(s => s.source === 'VERIFIEE' && s.status === 'INTEGRITE_INVALIDE').length,
        undetermined: list.filter(s => s.source === 'VERIFIEE' && s.status === 'INDETERMINEE').length
    };
}
export function overviewText(o: ReturnType<typeof overview>): string {
    if (o.total === 0) return 'Aucune signature enregistrée.';
    const parts = [`${o.total} signature${o.total > 1 ? 's' : ''}`];
    if (o.intact) parts.push(`${o.intact} intacte${o.intact > 1 ? 's' : ''}`);
    if (o.altered) parts.push(`${o.altered} sur un contenu modifié`);
    if (o.undetermined) parts.push(`${o.undetermined} indéterminée${o.undetermined > 1 ? 's' : ''}`);
    if (o.declared) parts.push(`${o.declared} déclarée${o.declared > 1 ? 's' : ''}`);
    return parts[0] + (parts.length > 1 ? ' : ' + parts.slice(1).join(', ') : '') + '.';
}

/** Les signatures rangées par fichier, dans l'ordre où les fichiers apparaissent. */
export function groupByFile<T extends Pick<DocumentSignature, 'fileId' | 'fileName'>>(list: readonly T[]): Array<{ fileId: string; fileName: string; items: T[] }> {
    const groups: Array<{ fileId: string; fileName: string; items: T[] }> = [];
    for (const s of list) {
        const g = groups.find(x => x.fileId === s.fileId);
        if (g) g.items.push(s); else groups.push({ fileId: s.fileId, fileName: s.fileName, items: [s] });
    }
    return groups;
}

// ---------- déclaration
export interface DeclarationForm { fileId: string; format: SignatureFormat; level: SignatureLevel; signer: string; quality: string; organization: string; signedAt: string; comment: string }
export const emptyDeclaration = (fileId = ''): DeclarationForm => ({ fileId, format: 'AUTRE', level: 'INCONNU', signer: '', quality: '', organization: '', signedAt: '', comment: '' });

export function declarationProblems(f: DeclarationForm, now: Date = new Date()): string[] {
    const problems: string[] = [];
    if (!f.fileId) problems.push('Choisissez le fichier que cette signature couvre.');
    if (!f.signer.trim()) problems.push('Le nom du signataire est obligatoire.');
    else if (f.signer.trim().length > 500) problems.push('Le nom du signataire est limité à 500 caractères.');
    if (f.quality.trim().length > 300) problems.push('La qualité est limitée à 300 caractères.');
    if (f.organization.trim().length > 300) problems.push('L’organisme est limité à 300 caractères.');
    if (f.comment.trim().length > 2000) problems.push('Le commentaire est limité à 2000 caractères.');
    if (f.signedAt) {
        const at = Date.parse(f.signedAt);
        if (Number.isNaN(at)) problems.push('La date de signature n’est pas une date valide.');
        else if (at > now.getTime() + 86_400_000) problems.push('La date de signature est dans le futur.');
    }
    return problems;
}

/** Le corps de la requête : les champs vides deviennent absents ; la date saisie (jour ou jour et heure) devient un instant UTC. */
export function declarationBody(f: DeclarationForm): Record<string, unknown> {
    const nonEmpty = (v: string) => v.trim() === '' ? null : v.trim();
    return {
        fileId: f.fileId, format: f.format, level: f.level, signer: f.signer.trim(), quality: nonEmpty(f.quality), organization: nonEmpty(f.organization),
        signedAt: f.signedAt ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(f.signedAt) ? f.signedAt + 'T00:00:00Z' : f.signedAt).toISOString() : null, comment: nonEmpty(f.comment)
    };
}
