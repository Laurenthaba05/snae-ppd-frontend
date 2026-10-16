import { code, text } from './validation.js';
import { buildXlsx, type Table } from './spreadsheet.js';
import { MAX_IMPORT_ROWS, fold } from './institutionImport.js';

export const DEPARTMENT_HEADERS = ['Code', 'Intitulé', 'Code du parent', 'Type d’unité'] as const;
const headerAliases: Record<'code' | 'nom' | 'parent' | 'type', string[]> = {
    code: ['code', 'code departement', 'code du departement', 'identifiant'],
    nom: ['intitule', 'nom', 'designation', 'libelle', 'nom du departement', 'intitule du departement'],
    parent: ['code du parent', 'code parent', 'parent', 'departement parent', 'code du departement parent', 'rattache a', 'rattachement'],
    type: ['type d unite', 'type unite', 'type', 'typeunite', 'nature']
};

/** Ce que le serveur reçoit pour un département (l'institution et le parent sont ajoutés au moment de l'envoi). */
export interface DepartmentBody { code: string; nom: string; typeUnite: string | null }
/** Le parent d'une ligne : un département qui existe déjà dans l'institution, ou une autre ligne du fichier (créée avant). */
export type ParentRef = { kind: 'existing'; id: string; code: string } | { kind: 'file'; line: number; code: string };
export interface DepartmentRow {
    /** Numéro de ligne dans le fichier (1 = en-têtes). */
    line: number;
    code: string; nom: string; parentCode: string; typeUnite: string;
    body: DepartmentBody | null;
    parent: ParentRef | null;
    errors: string[];
}
export interface ParsedDepartments {
    rows: DepartmentRow[];
    /** Les lignes valides, dans l'ordre où elles se créent : un parent du fichier avant ses enfants. */
    order: number[];
    fatal: string | null;
}

/**
 * Lit le tableau d'un fichier de départements pour UNE institution. `existing` : les départements déjà enregistrés dans cette institution (code en majuscules → identifiant) ;
 * ils servent à reconnaître un parent déjà là et à refuser un code déjà pris. Une ligne dont le parent est ignoré est ignorée à son tour.
 */
export function parseDepartmentTable(table: Table, existing: ReadonlyMap<string, string>): ParsedDepartments {
    const header = table[0] ?? [];
    const column = (key: keyof typeof headerAliases) => header.findIndex(h => headerAliases[key].includes(fold(h)));
    const at = { code: column('code'), nom: column('nom'), parent: column('parent'), type: column('type') };
    const missing = ([['code', 'Code'], ['nom', 'Intitulé']] as const).filter(([key]) => at[key] < 0).map(([, label]) => label);
    if (missing.length) return { rows: [], order: [], fatal: `Colonnes obligatoires introuvables en première ligne : ${missing.join(', ')}. Utilisez le modèle Excel fourni.` };
    const data = table.slice(1).map((cells, i) => ({ cells, line: i + 2 })).filter(r => r.cells.some(c => c !== ''));
    if (!data.length) return { rows: [], order: [], fatal: 'Le fichier ne contient aucun département (seulement la ligne d’en-têtes).' };
    if (data.length > MAX_IMPORT_ROWS) return { rows: [], order: [], fatal: `Le fichier contient ${data.length} lignes : l’import est limité à ${MAX_IMPORT_ROWS} départements à la fois.` };

    const firstLineOf = new Map<string, number>();
    const rows = data.map(({ cells, line }): DepartmentRow => {
        const get = (i: number) => (i >= 0 ? cells[i] ?? '' : '').trim();
        const row: DepartmentRow = { line, code: get(at.code), nom: get(at.nom), parentCode: get(at.parent), typeUnite: get(at.type), body: null, parent: null, errors: [] };
        let normalized = '';
        try { normalized = code(row.code); } catch { row.errors.push(row.code ? 'Code invalide : une lettre en premier, puis lettres, chiffres, _ ou - (50 caractères max).' : 'Code manquant.'); }
        try { text(row.nom, 255); } catch { row.errors.push(row.nom ? 'Intitulé trop long (255 caractères max).' : 'Intitulé manquant.'); }
        try { text(row.typeUnite, 50, false); } catch { row.errors.push('Type d’unité trop long (50 caractères max).'); }
        if (normalized) {
            const first = firstLineOf.get(normalized);
            if (first !== undefined) row.errors.push(`Code déjà utilisé à la ligne ${first}.`);
            else firstLineOf.set(normalized, line);
            if (existing.has(normalized)) row.errors.push('Ce code existe déjà dans l’institution : ligne ignorée.');
        }
        return row;
    });
    const byLine = new Map(rows.map(r => [r.line, r]));
    const lineOfCode = (c: string) => firstLineOf.get(c);

    // Le parent : un département de l'institution, ou une autre ligne du fichier.
    for (const row of rows) {
        if (!row.parentCode) continue;
        let parentCode: string;
        try { parentCode = code(row.parentCode); } catch { row.errors.push('Code du parent invalide : une lettre en premier, puis lettres, chiffres, _ ou - (50 caractères max).'); continue; }
        let own = ''; try { own = code(row.code); } catch { /* déjà signalé */ }
        if (parentCode === own) { row.errors.push('Un département ne peut pas être son propre parent.'); continue; }
        const inFile = lineOfCode(parentCode);
        const existingId = existing.get(parentCode);
        if (existingId) row.parent = { kind: 'existing', id: existingId, code: parentCode };
        else if (inFile !== undefined) row.parent = { kind: 'file', line: inFile, code: parentCode };
        else row.errors.push(`Parent introuvable : « ${parentCode} » n’existe ni dans l’institution ni dans le fichier.`);
    }

    // Boucle : une ligne qui, de parent en parent dans le fichier, revient à elle-même.
    for (const row of rows) {
        const path = new Set<number>([row.line]);
        for (let cursor = row.parent; cursor && cursor.kind === 'file';) {
            if (cursor.line === row.line) { row.errors.push('Boucle hiérarchique : ce département est son propre ancêtre dans le fichier.'); break; }
            if (path.has(cursor.line)) break; // la boucle ne passe pas par cette ligne : ses membres sont signalés eux-mêmes
            path.add(cursor.line);
            cursor = byLine.get(cursor.line)?.parent ?? null;
        }
    }

    // Un parent ignoré rend ses enfants impossibles à créer : on le dit, de proche en proche.
    for (let changed = true; changed;) {
        changed = false;
        for (const row of rows) {
            if (row.errors.length || row.parent?.kind !== 'file') continue;
            const parent = byLine.get(row.parent.line);
            if (parent && parent.errors.length) { row.errors.push(`Le parent « ${row.parent.code} » (ligne ${row.parent.line}) est ignoré : ce département ne peut pas être créé.`); changed = true; }
        }
    }

    for (const row of rows) if (!row.errors.length) row.body = { code: code(row.code), nom: text(row.nom, 255) ?? '', typeUnite: text(row.typeUnite, 50, false) };

    // Ordre de création : chaque parent du fichier avant ses enfants.
    const order: number[] = [];
    const placed = new Set<number>();
    const place = (row: DepartmentRow) => {
        if (placed.has(row.line) || !row.body) return;
        if (row.parent?.kind === 'file') { const parent = byLine.get(row.parent.line); if (parent) place(parent); }
        placed.add(row.line); order.push(row.line);
    };
    for (const row of rows) place(row);
    return { rows, order, fatal: null };
}

/** Modèle Excel : feuille « Départements » vide + feuille d'instructions. */
export function departmentTemplate(): Uint8Array {
    return buildXlsx([
        { name: 'Départements', rows: [[...DEPARTMENT_HEADERS]], widths: [18, 60, 22, 24] },
        { name: 'Instructions', header: false, widths: [28, 90], rows: [
            ['Import de départements', 'Choisissez l’institution dans l’application, remplissez la feuille « Départements » (un département par ligne), enregistrez au format .xlsx puis importez le fichier.'],
            ['Code *', 'Obligatoire, unique dans l’institution. Commence par une lettre ; lettres, chiffres, _ et - uniquement (50 caractères max). Converti en majuscules. Exemple : DAF'],
            ['Intitulé *', 'Obligatoire (255 caractères max). Exemple : Direction administrative et financière'],
            ['Code du parent', 'Facultatif. Le code du département dont celui-ci dépend : un département déjà enregistré dans l’institution, ou une autre ligne du fichier (peu importe l’ordre des lignes). Laissez vide pour un département de premier niveau.'],
            ['Type d’unité', 'Facultatif (50 caractères max). Exemple : Direction, Service, Bureau.'],
            ['Limites', `${MAX_IMPORT_ROWS} départements par fichier, 2 Mo maximum. Supprimez les lignes d’exemple : toute ligne remplie sera importée.`],
            ['Contrôles', 'Les lignes invalides sont signalées avant l’import et ignorées, ainsi que les départements qui dépendent d’une ligne ignorée. Un code déjà utilisé dans l’institution est refusé sans modifier le département existant.']
        ] }
    ]);
}
