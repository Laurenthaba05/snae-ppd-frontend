import { code, text } from './validation.js';
import { buildXlsx, type Table } from './spreadsheet.js';

/** Types d'institution acceptés par le serveur, avec le libellé utilisé dans le modèle Excel. */
export const INSTITUTION_TYPES = [
    { code: 'MINISTERE', label: 'Ministère' },
    { code: 'DIRECTION_GENERALE', label: 'Direction générale' },
    { code: 'ETABLISSEMENT_PUBLIC', label: 'Établissement public' },
    { code: 'COLLECTIVITE', label: 'Collectivité' },
    { code: 'AUTRE', label: 'Autre' }
] as const;
export const MAX_IMPORT_ROWS = 500;
export const TEMPLATE_HEADERS = ['Code', 'Intitulé', 'Sigle', 'Type'] as const;

export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const typeByKey = new Map<string, string>(INSTITUTION_TYPES.flatMap(t => [[fold(t.code), t.code], [fold(t.label), t.code]] as Array<[string, string]>));
const headerAliases: Record<'code' | 'nom' | 'sigle' | 'type', string[]> = {
    code: ['code', 'code institution', 'identifiant'],
    nom: ['intitule', 'nom', 'designation', 'libelle', 'nom de l institution', 'intitule de l institution'],
    sigle: ['sigle', 'abreviation', 'acronyme'],
    type: ['type', 'type d institution', 'type institution', 'typeinstitution', 'categorie']
};

export interface ImportBody { code: string; nom: string; sigle: string | null; typeInstitution: string }
export interface ImportRow {
    /** Numéro de ligne dans le fichier (1 = en-têtes). */
    line: number;
    code: string; nom: string; sigle: string; type: string;
    body: ImportBody | null;
    errors: string[];
}

export function parseInstitutionTable(table: Table): { rows: ImportRow[]; fatal: string | null } {
    const header = table[0] ?? [];
    const column = (key: keyof typeof headerAliases) => header.findIndex(h => headerAliases[key].includes(fold(h)));
    const at = { code: column('code'), nom: column('nom'), sigle: column('sigle'), type: column('type') };
    const missing = ([['code', 'Code'], ['nom', 'Intitulé'], ['type', 'Type']] as const).filter(([key]) => at[key] < 0).map(([, label]) => label);
    if (missing.length) return { rows: [], fatal: `Colonnes obligatoires introuvables en première ligne : ${missing.join(', ')}. Utilisez le modèle Excel fourni.` };
    const data = table.slice(1).map((cells, i) => ({ cells, line: i + 2 })).filter(r => r.cells.some(c => c !== ''));
    if (!data.length) return { rows: [], fatal: 'Le fichier ne contient aucune institution (seulement la ligne d’en-têtes).' };
    if (data.length > MAX_IMPORT_ROWS) return { rows: [], fatal: `Le fichier contient ${data.length} lignes : l’import est limité à ${MAX_IMPORT_ROWS} institutions à la fois.` };
    const seen = new Map<string, number>();
    const rows = data.map(({ cells, line }): ImportRow => {
        const get = (i: number) => (i >= 0 ? cells[i] ?? '' : '').trim();
        const row: ImportRow = { line, code: get(at.code), nom: get(at.nom), sigle: get(at.sigle), type: get(at.type), body: null, errors: [] };
        let normalizedCode = '';
        try { normalizedCode = code(row.code); } catch { row.errors.push(row.code ? 'Code invalide : une lettre en premier, puis lettres, chiffres, _ ou - (50 caractères max).' : 'Code manquant.'); }
        let nom = '';
        try { nom = text(row.nom, 255) ?? ''; } catch { row.errors.push(row.nom ? 'Intitulé trop long (255 caractères max).' : 'Intitulé manquant.'); }
        let sigle: string | null = null;
        try { sigle = text(row.sigle, 50, false); } catch { row.errors.push('Sigle trop long (50 caractères max).'); }
        const typeInstitution = typeByKey.get(fold(row.type));
        if (!typeInstitution) row.errors.push(row.type ? `Type inconnu « ${row.type.slice(0, 40)} » : ${INSTITUTION_TYPES.map(t => t.label).join(', ')}.` : 'Type manquant.');
        if (normalizedCode) {
            const first = seen.get(normalizedCode);
            if (first !== undefined) row.errors.push(`Code déjà utilisé à la ligne ${first}.`);
            else seen.set(normalizedCode, line);
        }
        if (!row.errors.length && typeInstitution) row.body = { code: normalizedCode, nom, sigle, typeInstitution };
        return row;
    });
    return { rows, fatal: null };
}

/** Modèle Excel : feuille « Institutions » vide (liste déroulante pour le type) + feuille d'instructions. */
export function institutionTemplate(): Uint8Array {
    return buildXlsx([
        { name: 'Institutions', rows: [[...TEMPLATE_HEADERS]], widths: [18, 60, 16, 26], list: { column: 3, values: INSTITUTION_TYPES.map(t => t.label), rows: MAX_IMPORT_ROWS } },
        { name: 'Instructions', header: false, widths: [28, 90], rows: [
            ['Import d’institutions', 'Remplissez la feuille « Institutions » (une institution par ligne), enregistrez au format .xlsx puis importez le fichier.'],
            ['Code *', 'Obligatoire, unique. Commence par une lettre ; lettres, chiffres, _ et - uniquement (50 caractères max). Converti en majuscules. Exemple : MEF'],
            ['Intitulé *', 'Obligatoire (255 caractères max). Exemple : Ministère de l’Économie et des Finances'],
            ['Sigle', 'Facultatif (50 caractères max). Exemple : MEF'],
            ['Type *', 'Obligatoire. Valeurs : ' + INSTITUTION_TYPES.map(t => t.label).join(', ') + '.'],
            ['Limites', `${MAX_IMPORT_ROWS} institutions par fichier, 2 Mo maximum. Supprimez les lignes d’exemple : toute ligne remplie sera importée.`],
            ['Contrôles', 'Les lignes invalides sont signalées avant l’import et ignorées. Un code déjà existant est refusé par le serveur sans modifier l’institution existante.']
        ] }
    ]);
}
