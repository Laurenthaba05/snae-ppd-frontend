/**
 * Le sceau des actes du système : un certificat de destruction ou un accusé de réception est scellé par une signature CMS détachée, posée avec la clé que l'institution a déclarée
 * (aucune clé n'est livrée). Le sceau se vérifie avec ce système ou sans lui. Le serveur reste seul juge ; ici, l'affichage.
 *
 * La révocation du certificat de scellement n'est pas vérifiée ; la chaîne ne se juge que contre les autorités de confiance que l'institution a déclarées.
 */
export type ActType = 'CERTIFICAT_DESTRUCTION' | 'ACCUSE_VERSEMENT' | 'ACCUSE_TRANSFERT';
export type SealStatus = 'SEALED' | 'UNSEALED' | 'NOT_SEALABLE';

export interface SealVerification {
    integrity: 'INTEGRITE_VALIDE' | 'INTEGRITE_INVALIDE' | 'INDETERMINEE' | 'NON_VERIFIEE';
    message: string;
    chain: 'NON_EVALUEE' | 'VALIDE' | 'NON_ANCREE' | 'INVALIDE';
    chainMessage: string | null;
    chainAnchor: string | null;
    matchesCurrentFacts: boolean | null;
}
export interface ActSeal {
    actType: ActType; objectId: string; reference: string | null; status: SealStatus; signingEnabled: boolean; sealedAt: string | null; signer: string | null; algorithm: string | null;
    certificateFingerprint: string | null; contentFingerprint: string | null; content: string | null; verification: SealVerification | null;
}

export const ACT_LABELS: Record<ActType, string> = {
    CERTIFICAT_DESTRUCTION: 'certificat de destruction', ACCUSE_VERSEMENT: 'accusé de réception du versement', ACCUSE_TRANSFERT: 'accusé de réception du transfert'
};
export const CHAIN_LABELS: Record<SealVerification['chain'], string> = {
    NON_EVALUEE: 'Chaîne non évaluée', VALIDE: 'Certificat reconnu', NON_ANCREE: 'Émetteur non reconnu', INVALIDE: 'Chaîne invalide à la date du sceau'
};

/** Ce que dit l'état du sceau, en clair, y compris quand il n'y en a pas (et pourquoi). */
export function sealHeadline(seal: Pick<ActSeal, 'status' | 'signingEnabled' | 'verification'>): { tone: 'ok' | 'warning' | 'info'; text: string } {
    if (seal.status === 'NOT_SEALABLE') return { tone: 'info', text: 'Cet acte n’est pas encore achevé : il n’y a rien à sceller.' };
    if (seal.status === 'UNSEALED') return seal.signingEnabled
        ? { tone: 'warning', text: 'Cet acte n’est pas encore scellé. Le scellement automatique n’a pas couvert cet acte : il peut être scellé maintenant.' }
        : { tone: 'info', text: 'Le scellement des actes n’est pas activé : aucune clé n’est configurée pour cette installation. L’acte n’est pas scellé.' };
    const v = seal.verification;
    if (!v) return { tone: 'warning', text: 'Le sceau n’a pas pu être vérifié.' };
    if (v.integrity !== 'INTEGRITE_VALIDE') return { tone: 'warning', text: 'La signature du sceau ne correspond plus à son contenu : ne vous y fiez pas.' };
    if (v.matchesCurrentFacts === false) return { tone: 'warning', text: 'La signature est valide, mais les constats de l’acte ne sont plus ceux qui ont été scellés.' };
    return { tone: 'ok', text: 'Acte scellé : la signature est valide et les constats sont ceux qui ont été scellés.' };
}

/** Le nom d'un fichier à télécharger : celui de l'acte, sans caractère interdit. */
export function sealFileName(reference: string | null, kind: 'content' | 'signature'): string {
    const stem = 'acte-' + ((reference ?? 'sans-reference').replace(/[^A-Za-z0-9._-]+/g, '-') || 'sans-reference');
    return kind === 'content' ? `${stem}.txt` : `${stem}.txt.p7s`;
}

/** La commande qui vérifie le sceau hors du système, avec OpenSSL, à partir des deux fichiers téléchargés. */
export const verifyCommand = (reference: string | null): string =>
    `openssl cms -verify -inform DER -in ${sealFileName(reference, 'signature')} -content ${sealFileName(reference, 'content')} -binary -noverify -out /dev/null`;

export const shortHash = (value: string | null | undefined): string => (value ? `${value.slice(0, 8)}…${value.slice(-8)}` : '—');
