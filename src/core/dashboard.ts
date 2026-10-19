/**
 * Les tableaux de bord : les types que le serveur renvoie et ce qu'il faut pour les lire (libellés en français, arbre des unités, série par mois).
 * Une rubrique que la personne n'a pas le droit de lire vaut `null` : jamais un zéro inventé.
 */
export interface MonthPoint { month: string; count: number }

export interface DocumentsStats {
    total: number; destroyed: number; byArchivalStatus: Record<string, number>; byBusinessStatus: Record<string, number>; byConfidentiality: Record<string, number>;
    createdLast30Days: number; monthly: MonthPoint[];
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
export interface ScopeInfo { institutionId: string | null; institutionName: string | null; departmentId: string | null; departmentName: string | null }

export interface ScopeDashboard {
    scope: ScopeInfo; generatedAt: string; documents: DocumentsStats | null; dossiers: DossiersStats | null; retention: RetentionStats | null;
    consultation: ConsultationStats | null; heritage: HeritageStats | null; units: UnitStats[];
    digitization?: ScopeDigitization | null; physical?: ScopePhysical | null; intake?: ScopeIntake | null;
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

/** Une palette de catégories qui ne se répète pas (les mêmes que celles du reste de l'interface). */
export const PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#7a5bd6', '#b4bcc3'];

export interface Slice { key: string; label: string; value: number; color: string }

/** Les parts d'un tout, dans l'ordre des libellés connus puis les autres par ordre alphabétique ; une clé inconnue garde son code, jamais un nom inventé. */
export function slices(values: Record<string, number>, labels: Record<string, string>, palette: string[] = PALETTE): Slice[] {
    const known = Object.keys(labels).filter(key => key in values);
    const other = Object.keys(values).filter(key => !(key in labels)).sort();
    return [...known, ...other].map((key, index) => ({ key, label: labels[key] ?? key, value: values[key] ?? 0, color: palette[index % palette.length]! }));
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
const MONTHS = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];

/** « 2026-10 » devient « Oct. » ; une valeur mal formée garde son texte. */
export function monthLabel(month: string): string {
    const match = /^(\d{4})-(\d{2})$/.exec(month);
    const index = match ? Number(match[2]) - 1 : -1;
    return index >= 0 && index < 12 ? MONTHS[index]! : month;
}

export function monthlySeries(points: MonthPoint[]): Array<{ key: string; label: string; value: number }> {
    return points.map(point => ({ key: point.month, label: monthLabel(point.month), value: point.count }));
}

/** Pour une part de `total` : un pourcentage entier, 0 si le total est vide. */
export function share(part: number, total: number): number { return total > 0 ? Math.round(part * 100 / total) : 0; }

/** Le total d'une table de nombres. */
export function sum(values: Record<string, number>): number { return Object.values(values).reduce((a, b) => a + b, 0); }
