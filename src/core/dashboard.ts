import { monthShort } from './locale.js';

/**
 * Les tableaux de bord : les types que le serveur renvoie et ce qu'il faut pour les lire (libellés en français, arbre des unités, série par mois).
 * Une rubrique que la personne n'a pas le droit de lire vaut `null` : jamais un zéro inventé.
 */
export interface MonthPoint { month: string; count: number }

export interface DocumentsStats {
    total: number; destroyed: number; byArchivalStatus: Record<string, number>; byBusinessStatus: Record<string, number>; byConfidentiality: Record<string, number>;
    createdLast30Days: number; monthly: MonthPoint[];
    /** Les documents par type : la clé est l'identifiant du type de document (le libellé se lit dans la liste des types). Absent des serveurs antérieurs. */
    byType?: Record<string, number>;
}
export interface DossiersStats { total: number; byBusinessStatus: Record<string, number>; byArchivalStatus: Record<string, number> }
export interface RetentionStats { byStatus: Record<string, number>; overdue: number; dueWithin90Days: number; activeLegalHolds: number | null }
export interface ConsultationStats { byStatus: Record<string, number>; pending: number }
export interface HeritageStats { total: number; byStatus: Record<string, number> }
/** `documents` et `dossiers` comptent aussi les sous-unités ; `direct…` seulement ce qui est rattaché à l'unité elle-même. */
export interface UnitStats { id: string; parentId: string | null; code: string; name: string; type: string | null; documents: number; dossiers: number; directDocuments: number; directDossiers: number }
/** Les activités des modules nationaux rattachées au périmètre par leur institution et leur unité d'origine. */
export interface ScopeDigitization { projects: number; activeProjects: number; elementsByStatus: Record<string, number> }
export interface ScopePhysical { total: number; destroyed: number }
export interface ScopeIntake { total: number; open: number }
/** Les tâches de validation du périmètre : `pending` ouvertes ou en cours, dont `overdue` dont l'échéance est passée. */
export interface ScopeWorkflow { pending: number; overdue: number }
export interface ScopeInfo { institutionId: string | null; institutionName: string | null; departmentId: string | null; departmentName: string | null }

export interface ScopeDashboard {
    scope: ScopeInfo; generatedAt: string; documents: DocumentsStats | null; dossiers: DossiersStats | null; retention: RetentionStats | null;
    consultation: ConsultationStats | null; heritage: HeritageStats | null; units: UnitStats[];
    digitization?: ScopeDigitization | null; physical?: ScopePhysical | null; intake?: ScopeIntake | null; workflow?: ScopeWorkflow | null;
}

export interface InstitutionRow {
    id: string; code: string; name: string; acronym: string | null; units: number; documents: number; dossiers: number; retentionOverdue: number; activeLegalHolds: number;
    pendingConsultations: number; heritageAssets: number; activeDigitizationProjects?: number; physicalArchives?: number; openIntakes?: number;
}
/** `unattributed…` : ce qui n'est encore rattaché à aucune institution d'origine. */
export interface IntakeStats { total: number; open: number; byStatus: Record<string, number>; unattributed?: number }
export interface DigitizationStats { projects: number; activeProjects: number; elementsByStatus: Record<string, number>; unattributedProjects?: number }
export interface PhysicalStats { total: number; destroyed: number; byPhysicalState: Record<string, number>; unattributed?: number }
export interface PortalStats { activeReaders: number; activeSubscriptions: number; pendingAccessRequests: number }
export interface TransferStats { eliminationSlipsByStatus: Record<string, number>; transfersByStatus: Record<string, number> }

export interface NationalDashboard {
    generatedAt: string; institutions: number; units: number; documents: DocumentsStats; dossiers: DossiersStats; retention: RetentionStats; consultation: ConsultationStats;
    heritage: HeritageStats; institutionRows: InstitutionRow[]; intake: IntakeStats | null; digitization: DigitizationStats | null; physical: PhysicalStats | null;
    portal: PortalStats | null; transfers: TransferStats | null;
}

/** Les nombres de l'écran de traitement, calculés par le serveur : les projets et les éléments par état, les contrôles qualité, l'avancement des projets en cours, la confiance OCR moyenne. */
export interface QualityMonth { month: string; good: number; warn: number }
export interface ProjectProgressRow { id: string; name: string; done: number; total: number }
export interface DigitizationSummary {
    generatedAt: string; projects: Record<string, number>; elements: Record<string, number>;
    controls: { conformes: number; aCorriger: number; monthly: QualityMonth[] };
    progress: ProjectProgressRow[]; ocr: { results: number; averageConfidence: number | null };
}

// ------------------------------------------------------------------------------------------------ libellés
export const ARCHIVAL_LABELS: Record<string, string> = {
    BROUILLON: 'Brouillon', ACTIF: 'Actif', SEMI_ACTIF: 'Semi-actif', ARCHIVE_DEFINITIVE: 'Archivé définitivement', ELIMINATION_APPROUVEE: 'Élimination approuvée', DETRUIT: 'Détruit'
};
export const CONFIDENTIALITY_LABELS: Record<string, string> = { PUBLIC: 'Public', INTERNE: 'Interne', CONFIDENTIEL: 'Confidentiel', SECRET: 'Secret' };
export const RETENTION_LABELS: Record<string, string> = {
    PLANIFIE: 'Planifiée', ECHEANCE: 'Échue', EN_DECISION: 'En décision', SUSPENDU: 'Suspendue', CLOTURE: 'Clôturée', ANNULE: 'Annulée'
};
export const CONSULTATION_LABELS: Record<string, string> = { DEPOSEE: 'Déposée', EN_INSTRUCTION: 'En instruction', AUTORISEE: 'Autorisée', REFUSEE: 'Refusée' };
export const HERITAGE_LABELS: Record<string, string> = {
    A_EXAMINER: 'À examiner', ACQUISITION_VALIDEE: 'Acquisition validée', DEPOT: 'En dépôt', PRET_ENTRANT: 'Prêt entrant', SITUATION_A_CLARIFIER: 'Situation à clarifier', REFUSE: 'Refusé', SORTI: 'Sorti'
};
export const ELEMENT_LABELS: Record<string, string> = {
    RECEPTION: 'Réception', NUMERISATION: 'Numérisation', OCR_INDEXATION: 'OCR et indexation', CONTROLE_QUALITE: 'Contrôle qualité', METADONNEES: 'Métadonnées', VALIDATION: 'Validation',
    TERMINE: 'Terminé', SUSPENDU: 'Suspendu', ANNULE: 'Annulé'
};
export const SLIP_LABELS: Record<string, string> = { BROUILLON: 'Brouillon', SOUMIS: 'Soumis', VISE: 'Visé', ACCEPTE: 'Accepté', REFUSE: 'Refusé', EXECUTE: 'Exécuté', ANNULE: 'Annulé' };

// ------------------------------------------------------------------------------------------------ les couleurs
// Les couleurs des diagrammes, contrôlées avec le validateur de palettes (teintes catégorielles : écart entre voisines pour les daltoniens et pour la vision normale, contraste d'au moins 3:1
// sur fond blanc ; rampes ordonnées : clarté monotone, pas visibles, extrémité claire à 2:1 au moins). Les couleurs d'état gardent un sens réservé et s'accompagnent toujours d'un libellé.
/** Les teintes qui désignent des séries distinctes (types de documents…), dans leur ordre fixe : jamais cyclées au-delà de six. */
export const PALETTE = ['#1f8a5b', '#6b57d1', '#b88a0d', '#2a78d6', '#e0642e', '#12929f'];
/** Le reste regroupé (« Autres ») et ce qui n'a pas de couleur propre. */
export const OTHER_COLOR = '#9aa8ae';
/** Rampe ordonnée verte (du plus clair au plus foncé) : une suite dont l'ordre compte. */
export const RAMP_GREEN = ['#61c28e', '#3fa270', '#158353', '#02633c'];
/** Rampe ordonnée bleue : le niveau de confidentialité, du public au secret. */
export const RAMP_BLUE = ['#87bafd', '#6295d4', '#3f70ad', '#1d4d87'];
/** Couleurs d'état (sens réservé : bon, vigilance, sérieux, critique). */
export const STATUS_COLORS = { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b' };

/** Le cycle de vie d'un document se lit comme une suite (vert de plus en plus foncé) ; une élimination approuvée alerte, un document détruit s'éteint. */
export const ARCHIVAL_COLORS: Record<string, string> = {
    BROUILLON: RAMP_GREEN[0]!, ACTIF: RAMP_GREEN[1]!, SEMI_ACTIF: RAMP_GREEN[2]!, ARCHIVE_DEFINITIVE: RAMP_GREEN[3]!, ELIMINATION_APPROUVEE: STATUS_COLORS.warning, DETRUIT: OTHER_COLOR
};
/** La confidentialité est ordonnée : du public (clair) au secret (foncé). */
export const CONFIDENTIALITY_COLORS: Record<string, string> = { PUBLIC: RAMP_BLUE[0]!, INTERNE: RAMP_BLUE[1]!, CONFIDENTIEL: RAMP_BLUE[2]!, SECRET: RAMP_BLUE[3]! };
/** Les échéances de conservation : une échéance dépassée est critique, une décision attendue demande de la vigilance, le reste est calme. */
export const RETENTION_COLORS: Record<string, string> = {
    PLANIFIE: RAMP_BLUE[1]!, ECHEANCE: STATUS_COLORS.critical, EN_DECISION: STATUS_COLORS.warning, SUSPENDU: OTHER_COLOR, CLOTURE: RAMP_GREEN[1]!, ANNULE: '#c4ced3'
};

export interface Slice { key: string; label: string; value: number; color: string }

/**
 * Les parts d'un tout, dans l'ordre des libellés connus puis les autres par ordre alphabétique ; une clé inconnue garde son code, jamais un nom inventé.
 * `colors` donne la couleur de chaque clé quand la suite a un sens (cycle de vie, confidentialité, état) ; une clé qui n'y figure pas prend la teinte neutre.
 */
export function slices(values: Record<string, number>, labels: Record<string, string>, palette: string[] = PALETTE, colors?: Record<string, string>): Slice[] {
    const known = Object.keys(labels).filter(key => key in values);
    const other = Object.keys(values).filter(key => !(key in labels)).sort();
    return [...known, ...other].map((key, index) => ({ key, label: labels[key] ?? key, value: values[key] ?? 0, color: colors ? colors[key] ?? OTHER_COLOR : palette[index % palette.length]! }));
}

// ------------------------------------------------------------------------------------------------ l'arbre des unités
export interface UnitRow { unit: UnitStats; depth: number }

/** Les unités dans l'ordre de lecture d'un arbre : le parent d'abord, ses sous-unités ensuite (par code). Une unité dont le parent n'est pas dans la liste devient une racine ; une boucle n'est jamais suivie. */
export function unitTree(units: UnitStats[]): UnitRow[] {
    const ids = new Set(units.map(u => u.id));
    const children = new Map<string | null, UnitStats[]>();
    for (const unit of units) {
        const parent = unit.parentId && ids.has(unit.parentId) && unit.parentId !== unit.id ? unit.parentId : null;
        children.set(parent, [...(children.get(parent) ?? []), unit]);
    }
    const rows: UnitRow[] = [];
    const seen = new Set<string>();
    const walk = (parent: string | null, depth: number) => {
        for (const unit of (children.get(parent) ?? []).sort((a, b) => a.code.localeCompare(b.code, 'fr'))) {
            if (seen.has(unit.id)) continue;
            seen.add(unit.id);
            rows.push({ unit, depth });
            walk(unit.id, depth + 1);
        }
    };
    walk(null, 0);
    // ce qui reste n'est atteignable depuis aucune racine (boucle) : on le montre quand même, à plat
    for (const unit of units) if (!seen.has(unit.id)) rows.push({ unit, depth: 0 });
    return rows;
}

// ------------------------------------------------------------------------------------------------ la série par mois

/** « 2026-10 » devient « Oct. » ; une valeur mal formée garde son texte. */
export function monthLabel(month: string): string {
    const match = /^(\d{4})-(\d{2})$/.exec(month);
    const index = match ? Number(match[2]) - 1 : -1;
    return index >= 0 && index < 12 ? monthShort(index) : month;
}

export function monthlySeries(points: MonthPoint[]): Array<{ key: string; label: string; value: number }> {
    return points.map(point => ({ key: point.month, label: monthLabel(point.month), value: point.count }));
}

/** Pour une part de `total` : un pourcentage entier, 0 si le total est vide. */
export function share(part: number, total: number): number { return total > 0 ? Math.round(part * 100 / total) : 0; }

/** Le total d'une table de nombres. */
export function sum(values: Record<string, number>): number { return Object.values(values).reduce((a, b) => a + b, 0); }
