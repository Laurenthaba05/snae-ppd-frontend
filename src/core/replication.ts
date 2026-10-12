import { formatBytes } from './format.js';

/**
 * L'hébergement et les réplicas : où sont les copies de chaque fichier, ce qui manque, ce qui est en erreur. Les textes disent ce que la personne doit comprendre ou faire ;
 * le serveur ne renvoie que des codes.
 */
export type ReplicaObjectStatus = 'A_COPIER' | 'COPIE' | 'ECART' | 'ERREUR' | 'A_SUPPRIMER';

export interface ReplicaStatus {
    name: string; provider: string; offsite: boolean; jurisdiction: string | null; copied: number; pending: number; mismatched: number; failed: number; toDelete: number;
    copiedBytes: number; oldestPendingAt: string | null; lastVerifiedAt: string | null;
}
export interface ReplicationPosture { copies: number; distinctStores: number; offsiteCopies: number; meetsThreeTwoOne: boolean }
export interface ReplicationProblem {
    replica: string; status: ReplicaObjectStatus; attempts: number; errorCode: string | null; kind: 'FICHIER' | 'COPIE' | 'PDF_ACCES' | null; documentReference: string | null;
    fileName: string | null; size: number; updatedAt: string;
}
export interface ReplicationStatus {
    enabled: boolean; configured: boolean; primaryProvider: string; posture: ReplicationPosture; replicas: ReplicaStatus[]; trackedObjects: number; fallbackReads: number;
    lastCycleStartedAt: string | null; lastCycleFinishedAt: string | null; lastCycleCode: string | null; lastInventoryAt: string | null; problems: ReplicationProblem[];
}

export const PROVIDER_LABELS: Record<string, string> = { LOCAL_PRIVATE: 'Volume local privé', SUPABASE_PRIVATE: 'Stockage distant privé' };
export const providerLabel = (provider: string): string => PROVIDER_LABELS[provider] ?? 'Stockage';

export const OBJECT_STATUS_LABELS: Record<ReplicaObjectStatus, string> = {
    A_COPIER: 'À copier', COPIE: 'Copie vérifiée', ECART: 'Copie à refaire', ERREUR: 'Copie impossible', A_SUPPRIMER: 'Suppression en attente'
};
export const KIND_LABELS: Record<string, string> = { FICHIER: 'Fichier de conservation', COPIE: 'Copie de consultation', PDF_ACCES: 'PDF d’accès' };

export const ERROR_TEXT: Record<string, string> = {
    REPLICA_SOURCE_MISMATCH: 'Le fichier du stockage principal ne correspond plus à son empreinte : il n’a pas été copié. Il faut le restaurer depuis une autre copie.',
    REPLICA_SOURCE_UNAVAILABLE: 'Le fichier est introuvable dans le stockage principal et dans les autres copies vérifiées.',
    REPLICA_SOURCE_TOO_LARGE: 'Le fichier dépasse la taille que la copie sait traiter.',
    REPLICA_MISMATCH: 'La copie du réplica ne correspond plus à l’empreinte attendue : elle sera refaite.',
    REPLICA_MISSING: 'La copie a disparu du réplica : elle sera refaite.',
    REPLICA_UNAVAILABLE: 'Le réplica ne répond pas : la vérification sera reprise.',
    REPLICA_VERIFY_FAILED: 'La copie écrite ne correspond pas à l’empreinte lors de sa relecture.',
    REPLICA_NOT_CONFIGURED: 'Ce réplica n’est plus configuré : ses copies ne sont plus suivies.',
    REPLICA_DELETE_FAILED: 'Le réplica a refusé la suppression : elle sera reprise.',
    REPLICA_IO_FAILED: 'Une erreur d’écriture ou de lecture est survenue sur le réplica.',
    REPLICA_OBJECT_EXISTS: 'Le réplica contient déjà un objet à cet emplacement.',
    REPLICA_OPERATION_FAILED: 'L’opération a échoué sur le réplica.',
    STORAGE_PROVIDER_REJECTED: 'Le fournisseur de stockage a refusé l’opération.',
    STORAGE_UNAVAILABLE: 'Le stockage ne répond pas.',
    STORAGE_OBJECT_UNAVAILABLE: 'L’objet est introuvable dans le stockage.',
    REPLICATION_CYCLE_FAILED: 'Le dernier cycle de réplication a échoué : une intervention technique est nécessaire.'
};
export const errorText = (code: string | null): string => code ? (ERROR_TEXT[code] ?? 'Une erreur est survenue : une intervention technique est nécessaire.') : '';

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/** La posture de protection, en une phrase, d'après la configuration déclarée (le serveur ne constate pas l'emplacement physique). */
export function postureText(p: ReplicationPosture): string {
    if (p.copies <= 1) return 'Une seule copie : la perte du stockage principal ferait perdre les fichiers. Configurez au moins un réplica.';
    const base = `${plural(p.copies, 'copie', 'copies')} sur ${plural(p.distinctStores, 'support distinct', 'supports distincts')}, dont ${plural(p.offsiteCopies, 'hors site', 'hors site')}`;
    return p.meetsThreeTwoOne ? `Règle 3-2-1 respectée : ${base}.` : `${base} : la règle 3-2-1 (trois copies, deux supports, une hors site) n’est pas atteinte.`;
}

export type Health = 'OK' | 'ATTENTION' | 'ALERTE';

/** La santé d'un réplica : alerte s'il a des copies impossibles ou altérées, attention s'il reste du travail, sinon bon. */
export function replicaHealth(r: Pick<ReplicaStatus, 'failed' | 'mismatched' | 'pending' | 'toDelete'>): Health {
    if (r.failed > 0 || r.mismatched > 0) return 'ALERTE';
    if (r.pending > 0 || r.toDelete > 0) return 'ATTENTION';
    return 'OK';
}
export const HEALTH_LABELS: Record<Health, string> = { OK: 'À jour', ATTENTION: 'En cours de rattrapage', ALERTE: 'À examiner' };

export function replicaSummary(r: ReplicaStatus): string {
    const parts = [`${plural(r.copied, 'copie vérifiée', 'copies vérifiées')} (${formatBytes(r.copiedBytes)})`];
    if (r.pending > 0) parts.push(`${r.pending} à copier`);
    if (r.mismatched > 0) parts.push(`${r.mismatched} à refaire`);
    if (r.failed > 0) parts.push(`${plural(r.failed, 'impossible', 'impossibles')}`);
    if (r.toDelete > 0) parts.push(`${r.toDelete} à supprimer`);
    return parts.join(' · ');
}

/** Le dernier cycle, en une phrase ; `late` si la dernière fin de cycle est plus ancienne que le seuil donné. */
export function cycleText(s: Pick<ReplicationStatus, 'enabled' | 'configured' | 'lastCycleFinishedAt' | 'lastCycleCode'>, now: number, lateAfterMs = 6 * 3600_000): { text: string; late: boolean } {
    if (!s.configured) return { text: 'Aucun réplica n’est configuré.', late: false };
    if (!s.enabled) return { text: 'La réplication est configurée mais désactivée : aucune copie n’est refaite ni vérifiée.', late: true };
    if (s.lastCycleCode) return { text: errorText(s.lastCycleCode), late: true };
    if (!s.lastCycleFinishedAt) return { text: 'Aucun cycle n’est encore terminé.', late: false };
    const age = now - Date.parse(s.lastCycleFinishedAt);
    return { text: age > lateAfterMs ? 'Le dernier cycle est ancien : vérifiez que le service fonctionne.' : 'Le dernier cycle s’est terminé normalement.', late: age > lateAfterMs };
}

export function problemTitle(p: Pick<ReplicationProblem, 'kind' | 'documentReference' | 'fileName'>): string {
    const what = p.kind ? KIND_LABELS[p.kind] ?? 'Objet' : 'Objet';
    const where = p.documentReference ? ` du document ${p.documentReference}` : '';
    return p.fileName ? `${p.fileName}${where}` : `${what}${where}`;
}
