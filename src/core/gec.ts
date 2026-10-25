/** L'interopérabilité avec la gestion électronique du courrier (GEC) : les sources déclarées, les courriers reçus et ce que l'écran en dit. Voir docs/GEC.md du serveur. */

export type GecDirection = 'ARRIVEE' | 'DEPART' | 'INTERNE';
export type GecStatus = 'RECU' | 'ARCHIVE' | 'ECHEC';
export type GecPieceRole = 'PRINCIPAL' | 'ANNEXE' | 'ACCUSE' | 'PARAPHEUR' | 'AUTRE';
export type GecConfidentiality = 'PUBLIC' | 'INTERNE' | 'CONFIDENTIEL' | 'SECRET';

export interface GecSource {
    id: string; code: string; nom: string; institutionId: string; departementId: string | null; typeDocumentId: string; noeudClassementId: string | null;
    confidentialiteDefaut: GecConfidentiality; actif: boolean; version: number; updatedAt: string;
}
export interface GecSourceBody {
    code?: string | null; nom: string; institutionId: string; departementId: string | null; typeDocumentId: string; noeudClassementId: string | null;
    confidentialiteDefaut: GecConfidentiality; actif: boolean; version?: number;
}
export interface GecCourrierRow {
    id: string; sourceCode: string; sourceNom: string; referenceGec: string; numeroEnregistrement: string; sens: GecDirection; objet: string; dateCourrier: string | null;
    statut: GecStatus; etape: string; codeErreur: string | null; documentId: string | null; documentReference: string | null; accuseNumero: string | null; accuseLe: string | null;
    pieces: number; recuLe: string;
}
export interface GecPiece {
    rang: number; nomOrigine: string; nomDepose: string; role: GecPieceRole; sha256: string; taille: number; statut: 'EN_ATTENTE' | 'DEPOSE' | 'VALIDE' | 'ECHEC'; fichierId: string | null; codeErreur: string | null; tentatives: number;
}
export interface GecCourrier {
    id: string; source: string; referenceGec: string; numeroEnregistrement: string; sens: GecDirection; objet: string; dateCourrier: string | null; dateCloture: string | null;
    expediteur: string | null; destinataires: string[]; metadonnees: Record<string, unknown>; statut: GecStatus; etape: string; codeErreur: string | null; accuse: string | null; accuseLe: string | null;
    rejeu: boolean; document: { id: string; reference: string; statutMetier: string; statutArchivistique: string } | null; dossier: { id: string; reference: string } | null;
    version: { id: string; numero: number; scellee: boolean; empreinte: string | null } | null; pieces: GecPiece[]; tentatives: number; recuLe: string;
}
export interface GecFilters { source: string; statut: '' | GecStatus; q: string }
export const EMPTY_FILTERS: GecFilters = { source: '', statut: '', q: '' };

export const STATUS_LABELS: Record<GecStatus, string> = { RECU: 'En cours ou à reprendre', ARCHIVE: 'Archivé', ECHEC: 'En échec' };
export const DIRECTION_LABELS: Record<GecDirection, string> = { ARRIVEE: 'Arrivée', DEPART: 'Départ', INTERNE: 'Interne' };
export const ROLE_LABELS: Record<GecPieceRole, string> = { PRINCIPAL: 'Pièce principale', ANNEXE: 'Annexe', ACCUSE: 'Accusé', PARAPHEUR: 'Parapheur', AUTRE: 'Autre' };
export const PIECE_STATUS_LABELS: Record<GecPiece['statut'], string> = { EN_ATTENTE: 'En attente', DEPOSE: 'Déposée', VALIDE: 'Validée', ECHEC: 'Refusée' };
export const CONFIDENTIALITY_LABELS: Record<GecConfidentiality, string> = { PUBLIC: 'Public', INTERNE: 'Interne', CONFIDENTIEL: 'Confidentiel', SECRET: 'Secret' };
export const CONFIDENTIALITIES: GecConfidentiality[] = ['PUBLIC', 'INTERNE', 'CONFIDENTIEL', 'SECRET'];
/** Jusqu'où le courrier est allé, dans l'ordre du parcours. */
export const STEP_LABELS: Record<string, string> = {
    RECU: 'Reçu', DOCUMENT_CREE: 'Document créé', PIECES_DEPOSEES: 'Pièces déposées et validées', SCELLE: 'Version scellée', CLOS: 'Document clos'
};

/** Les codes d'erreur que le serveur écrit sur un courrier ou une pièce, en une phrase qui dit quoi faire. Un code inconnu est montré tel quel, jamais caché. */
const ERRORS: Record<string, string> = {
    GEC_PIECE_REJETEE: 'Une pièce a été refusée : la GEC doit renvoyer le courrier (même référence) ou, si la pièce est infectée ou d’un format refusé, sous une nouvelle référence.',
    SCAN_INFECTED: 'L’antivirus a trouvé une menace dans ce fichier : il n’est jamais accepté.',
    SCAN_UNAVAILABLE: 'L’antivirus n’était pas disponible : le renvoi du même courrier reprend l’envoi.',
    STORAGE_UNAVAILABLE: 'Le stockage n’était pas disponible : le renvoi du même courrier reprend l’envoi.',
    UNSUPPORTED_FILE_FORMAT: 'Ce format de fichier n’est pas accepté.',
    FILE_SIGNATURE_MISMATCH: 'Le contenu du fichier ne correspond pas à son extension.',
    INVALID_FILENAME: 'Le nom du fichier n’est pas acceptable.',
    FILE_TOO_LARGE: 'Le fichier dépasse la taille autorisée.',
    GEC_PERMISSIONS_MISSING: 'Le compte qui téléverse n’a pas toutes les habilitations nécessaires dans cette institution.',
    DOCUMENT_REFERENCE_EXISTS: 'Un document porte déjà cette référence d’archivage.',
    DOSSIER_CLOSED: 'Le dossier de l’affaire est clos : il n’accepte plus de document.',
    MANDATORY_WORKFLOW_INCOMPLETE: 'Le type de document de cette source impose un circuit de validation : il bloque le scellement. Choisissez un type sans circuit obligatoire.',
    INGESTION_ATTEMPT_LIMIT: 'Le nombre maximal de tentatives de dépôt est atteint : une revue est requise.',
    GEC_ERREUR_INTERNE: 'Une erreur interne a arrêté le traitement : le renvoi du même courrier le reprend.'
};
export function errorText(code: string | null | undefined): string | null {
    if (!code) return null;
    return ERRORS[code] ?? 'Arrêt avec le code ' + code + '.';
}

/** Ce qui empêche d'enregistrer le formulaire d'une source (le code ne se saisit qu'à la création : il ne change plus ensuite). */
export function sourceProblems(form: { code: string; nom: string; typeDocumentId: string }, creating: boolean): string[] {
    const problems: string[] = [];
    if (creating && !/^[A-Z0-9][A-Z0-9-]{1,29}$/.test(form.code.trim().toUpperCase())) problems.push('Le code compte de 2 à 30 caractères : majuscules, chiffres et tirets, sans commencer par un tiret.');
    if (!form.nom.trim()) problems.push('Le nom de la source est obligatoire.');
    if (form.nom.trim().length > 200) problems.push('Le nom de la source compte 200 caractères au plus.');
    if (!form.typeDocumentId) problems.push('Choisissez le type de document des courriers de cette source.');
    return problems;
}

/** Un courrier qui n'est pas archivé est à suivre : en échec, ou encore en cours depuis longtemps. */
export function needsAttention(row: Pick<GecCourrierRow, 'statut'>): boolean { return row.statut === 'ECHEC'; }

/** Le résumé du journal : combien de lignes par état (sur la page affichée). */
export function countByStatus(rows: readonly Pick<GecCourrierRow, 'statut'>[]): Record<GecStatus, number> {
    const counts: Record<GecStatus, number> = { RECU: 0, ARCHIVE: 0, ECHEC: 0 };
    rows.forEach(r => { counts[r.statut]++; });
    return counts;
}
