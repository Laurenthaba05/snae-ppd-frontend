/**
 * Échanges d'un versement structuré : bordereau de transfert SEDA (export, import d'un manifeste ou d'un paquet ZIP) et intégration d'un versement reçu au plan de description.
 * Le serveur reste seul juge ; ces règles guident la saisie.
 */
export interface IntegrationCandidate { lineId: string; rank: number; reference: string; title: string; finding: string; problems: string[] }
export interface IntegrationPreview {
    entryId: string; parentId: string | null; parentLabel: string | null; level: string | null; eligible: IntegrationCandidate[]; integrated: number; absent: number; blockers: string[];
}
export interface IntegratedLine { lineId: string; rank: number; reference: string; descriptionId: string }
export interface IntegrationResult { integrationId: string; lines: IntegratedLine[] }
export interface IntegrationView { id: string; entryId: string; parentId: string; parentCode: string | null; parentTitle: string | null; level: string; lines: number; createdById: string | null; createdAt: string }
export interface SedaPackageReport { manifest: string; units: number; objects: number; verified: number; warnings: string[] }
/** Le dépôt du contenu d'un paquet : un document par unité d'archives qui porte des objets, repris à l'identique si on renvoie le paquet. */
export type DepositStatus = 'DEPOSE' | 'ECHEC';
export interface DepositedObject { path: string; lineRank: number; lineReference: string; status: DepositStatus; documentId: string | null; fileId: string | null; errorCode: string | null }
export interface DepositReport { entryId: string; units: number; documents: number; deposited: number; alreadyDeposited: number; failed: number; skipped: string[]; objects: DepositedObject[] }
export interface DepositView {
    path: string; lineId: string; lineRank: number; lineReference: string; status: DepositStatus; documentId: string | null; documentReference: string | null;
    fileId: string | null; errorCode: string | null; attempts: number; updatedAt: string;
}
export const DEPOSIT_CONFIDENTIALITY: Array<{ value: string; label: string }> = [
    { value: 'PUBLIC', label: 'Public' }, { value: 'INTERNE', label: 'Interne' }, { value: 'CONFIDENTIEL', label: 'Confidentiel' }, { value: 'SECRET', label: 'Secret' }
];
export const DEPOSIT_ERRORS: Record<string, string> = {
    FILE_SIGNATURE_MISMATCH: 'le contenu ne correspond pas au type annoncé',
    SCAN_INFECTED: 'refusé par l’antivirus',
    SCAN_FAILED: 'l’antivirus n’a pas pu analyser le fichier',
    STORAGE_UNAVAILABLE: 'le stockage n’a pas répondu',
    STORAGE_RETRYABLE: 'le stockage était indisponible',
    UNSUPPORTED_INGESTION_ROLE: 'rôle de fichier non accepté'
};
export const depositErrorText = (code: string | null): string => code ? (DEPOSIT_ERRORS[code] ?? code) : '';
export function depositSummary(r: Pick<DepositReport, 'units' | 'deposited' | 'alreadyDeposited' | 'failed'>): string {
    const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;
    const parts = [`${plural(r.deposited, 'fichier déposé', 'fichiers déposés')} pour ${plural(r.units, 'unité', 'unités')}`];
    if (r.alreadyDeposited) parts.push(`${plural(r.alreadyDeposited, 'déjà déposé', 'déjà déposés')}`);
    if (r.failed) parts.push(`${plural(r.failed, 'en échec', 'en échec')} (renvoyez le même paquet pour les retenter)`);
    return parts.join(' ; ') + '.';
}
export interface SedaManifest { messageId: string | null; lines: Array<{ reference: string; intitule: string }>; objects: unknown[]; warnings: string[] }

export const LEVEL_LABELS: Record<string, string> = {
    FONDS: 'Fonds', SOUS_FONDS: 'Sous-fonds', SERIE: 'Série', SOUS_SERIE: 'Sous-série', DOSSIER: 'Dossier', PIECE: 'Pièce'
};
export const LEVEL_ORDER = ['FONDS', 'SOUS_FONDS', 'SERIE', 'SOUS_SERIE', 'DOSSIER', 'PIECE'] as const;

/** Les niveaux qu'on peut créer sous une notice : ceux qui la suivent (jamais un fonds). */
export const levelsAfter = (parentLevel: string | null | undefined): string[] => {
    const index = LEVEL_ORDER.indexOf((parentLevel ?? '') as typeof LEVEL_ORDER[number]);
    return index < 0 ? [] : LEVEL_ORDER.slice(index + 1) as unknown as string[];
};

export const INTEGRATION_BLOCKERS: Record<string, string> = {
    INTEGRATION_NOT_RECEIVED: 'Le versement n’est pas reçu : seul un versement reçu s’intègre au plan de description.',
    INTEGRATION_NO_ARCHIVES_SERVICE: 'Le versement n’a pas de service d’archives destinataire.',
    INTEGRATION_PARENT_UNAVAILABLE: 'La notice de rattachement est introuvable ou n’appartient pas au service d’archives du versement.',
    INTEGRATION_LEVEL_INVALID: 'Le niveau choisi doit suivre celui de la notice de rattachement.'
};
export const blockerText = (code: string): string => INTEGRATION_BLOCKERS[code] ?? 'Cette intégration est bloquée.';

export function integrationProblems(parentId: string, level: string, parentLevel: string | null | undefined): string[] {
    const problems: string[] = [];
    if (!parentId) problems.push('Choisissez la notice sous laquelle intégrer le versement.');
    if (!level) problems.push('Choisissez le niveau des notices à créer.');
    else if (parentLevel && !levelsAfter(parentLevel).includes(level)) problems.push('Le niveau choisi doit suivre celui de la notice de rattachement.');
    return problems;
}

/** Le fichier d'échange est un manifeste XML ou un paquet ZIP, d'après son nom. */
export const exchangeFileKind = (name: string): 'xml' | 'zip' | null => /\.xml$/i.test(name) ? 'xml' : /\.zip$/i.test(name) ? 'zip' : null;

export function reportText(r: Pick<SedaPackageReport, 'units' | 'objects' | 'verified'>): string {
    const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;
    return `${plural(r.units, 'unité reprise', 'unités reprises')} dans le bordereau ; ${plural(r.objects, 'objet déclaré', 'objets déclarés')}, dont ${r.verified} vérifié${r.verified > 1 ? 's' : ''} par empreinte.`;
}
