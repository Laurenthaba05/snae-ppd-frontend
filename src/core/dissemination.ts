/**
 * Diffusion : identifiants pérennes ARK et dépôt OAI-PMH. L'autorité (NAAN) est donnée à l'institution par l'organisme qui les attribue ; un identifiant attribué ne change ni ne disparaît.
 * Le dépôt OAI-PMH est désactivé tant que l'exploitant n'a pas donné l'identifiant, le nom, le contact et l'adresse publique. Le serveur reste seul juge.
 */
export type ArkObjectType = 'DOCUMENT' | 'DOSSIER' | 'DESCRIPTION' | 'BIEN';

export interface ArkAuthority { id: string; institutionId: string; naan: string; prefix: string; createdAt: string }
export interface ArkIdentifier {
    id: string; institutionId: string; ark: string; naan: string; name: string; objectType: ArkObjectType; objectId: string; objectTitle: string | null; createdAt: string;
}
export interface OaiStatus {
    enabled: boolean; configured: boolean; problems: string[]; repositoryIdentifier: string; repositoryName: string; endpoint: string; pageSize: number;
}

export const OBJECT_LABELS: Record<ArkObjectType, string> = { DOCUMENT: 'Document', DOSSIER: 'Dossier', DESCRIPTION: 'Description archivistique', BIEN: 'Bien patrimonial' };

export const OAI_PROBLEMS: Record<string, string> = {
    OAI_REPOSITORY_IDENTIFIER_INVALID: 'L’identifiant du dépôt doit avoir la forme d’un nom de domaine (par exemple archives.exemple.gn).',
    OAI_REPOSITORY_NAME_REQUIRED: 'Le nom du dépôt n’est pas renseigné.',
    OAI_ADMIN_EMAIL_INVALID: 'L’adresse du contact du dépôt est absente ou invalide.',
    OAI_PUBLIC_URL_INVALID: 'L’adresse publique du portail est absente, invalide ou se termine par une barre.'
};
export const oaiProblemText = (code: string): string => OAI_PROBLEMS[code] ?? 'La configuration du dépôt est incomplète.';

export function oaiSummary(s: Pick<OaiStatus, 'enabled' | 'configured' | 'problems'>): { text: string; problem: boolean } {
    if (!s.enabled) return { text: 'Le dépôt OAI-PMH n’est pas ouvert : l’exploitant ne l’a pas activé.', problem: false };
    if (!s.configured) return { text: 'Le dépôt OAI-PMH est activé mais sa configuration est incomplète : il reste fermé au moissonnage.', problem: true };
    return { text: 'Le dépôt OAI-PMH est ouvert : les notices publiques sont moissonnables en Dublin Core.', problem: false };
}

export const NAAN = /^[0-9]{5,9}$/;
export const PREFIX = /^[0-9bcdfghjkmnpqrstvwxz]{0,8}$/;

export function authorityProblems(naan: string, prefix: string): string[] {
    const problems: string[] = [];
    if (!NAAN.test(naan.trim())) problems.push('Le NAAN est un nombre de 5 à 9 chiffres, donné par l’organisme qui attribue les NAAN.');
    if (!PREFIX.test(prefix.trim().toLowerCase())) problems.push('Le préfixe compte 8 caractères au plus, parmi les chiffres et les consonnes b c d f g h j k m n p q r s t v w x z.');
    return problems;
}

/** L'adresse de résolution d'un ARK à donner à la citation : base du résolveur de l'institution, puis l'identifiant. */
export const arkCitation = (ark: string): string => ark;
