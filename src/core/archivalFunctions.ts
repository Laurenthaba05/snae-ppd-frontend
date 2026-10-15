/**
 * Description des fonctions (ISDF) : la fonction, l'activité ou la tâche qu'un service exerce et qui produit des archives.
 * Le serveur reste seul juge ; ces règles guident la saisie.
 */
export type FunctionKind = 'FONCTION' | 'SOUS_FONCTION' | 'ACTIVITE' | 'TACHE' | 'PROCESSUS' | 'AUTRE';
export type FunctionStatus = 'BROUILLON' | 'REVISEE' | 'VALIDEE';
export type FunctionDetail = 'COMPLET' | 'PARTIEL' | 'MINIMAL';
export type FunctionLinkTarget = 'FUNCTION' | 'AUTHORITY' | 'DESCRIPTION';
export type FunctionLinkNature = 'ASSOCIEE' | 'SUCCEDE' | 'EXERCEE_PAR' | 'DOCUMENTEE_PAR';

export interface FunctionInput {
    institutionId: string; code: string; name: string; kind: FunctionKind; parentId: string | null;
    parallelNames: string | null; otherNames: string | null; classification: string | null; dateStart: string | null; dateEnd: string | null;
    description: string | null; history: string | null; legislation: string | null; rules: string | null;
    status: FunctionStatus; detailLevel: FunctionDetail | null; language: string | null; sources: string | null; maintenanceNotes: string | null; version?: number | null;
}
export interface FunctionView { id: string; input: FunctionInput; version: number; createdAt: string; updatedAt: string }
export interface FunctionLinkInput {
    institutionId: string; functionId: string; targetKind: FunctionLinkTarget; targetId: string; nature: FunctionLinkNature;
    dateStart: string | null; dateEnd: string | null; description: string | null; version?: number | null;
}
export interface FunctionLinkView { id: string; input: FunctionLinkInput; targetLabel: string | null; version: number; updatedAt: string }
export interface FunctionRef { id: string; code: string; name: string; kind: FunctionKind }
export interface FunctionDetailView { function: FunctionView; ancestors: FunctionRef[]; children: FunctionRef[]; links: FunctionLinkView[] }

export const KIND_LABELS: Record<FunctionKind, string> = {
    FONCTION: 'Fonction', SOUS_FONCTION: 'Sous-fonction', ACTIVITE: 'Activité', TACHE: 'Tâche', PROCESSUS: 'Processus', AUTRE: 'Autre'
};
export const KIND_ORDER = ['FONCTION', 'SOUS_FONCTION', 'ACTIVITE', 'TACHE', 'PROCESSUS', 'AUTRE'] as const satisfies readonly FunctionKind[];
const DEPTH: Record<FunctionKind, number | null> = { FONCTION: 0, SOUS_FONCTION: 1, ACTIVITE: 2, TACHE: 3, PROCESSUS: null, AUTRE: null };

export const STATUS_LABELS: Record<FunctionStatus, string> = { BROUILLON: 'Brouillon', REVISEE: 'Révisée', VALIDEE: 'Validée' };
export const DETAIL_LABELS: Record<FunctionDetail, string> = { MINIMAL: 'Minimal', PARTIEL: 'Partiel', COMPLET: 'Complet' };
export const TARGET_LABELS: Record<FunctionLinkTarget, string> = { FUNCTION: 'Autre fonction', AUTHORITY: 'Producteur (notice d’autorité)', DESCRIPTION: 'Fonds ou description' };
export const NATURE_LABELS: Record<FunctionLinkNature, string> = {
    ASSOCIEE: 'Associée', SUCCEDE: 'Succède à', EXERCEE_PAR: 'Exercée par', DOCUMENTEE_PAR: 'Documentée par'
};
const NATURES: Record<FunctionLinkTarget, FunctionLinkNature[]> = {
    FUNCTION: ['ASSOCIEE', 'SUCCEDE'], AUTHORITY: ['EXERCEE_PAR', 'ASSOCIEE'], DESCRIPTION: ['DOCUMENTEE_PAR', 'ASSOCIEE']
};
export const naturesFor = (target: FunctionLinkTarget): FunctionLinkNature[] => NATURES[target];

export const FUNCTION_ERRORS: Record<string, string> = {
    ARCHIVAL_INVALID: 'La saisie n’est pas valide.',
    ARCHIVAL_CONFLICT: 'La description a changé ou ce code est déjà pris : rechargez-la.',
    ARCHIVAL_NOT_FOUND: 'Cette fonction est introuvable ou n’est pas accessible.'
};

export function emptyFunction(institutionId: string): FunctionInput {
    return {
        institutionId, code: '', name: '', kind: 'FONCTION', parentId: null, parallelNames: null, otherNames: null, classification: null, dateStart: null, dateEnd: null,
        description: null, history: null, legislation: null, rules: null, status: 'BROUILLON', detailLevel: null, language: 'fr', sources: null, maintenanceNotes: null
    };
}

/** Les niveaux qui peuvent se placer sous la fonction mère choisie (processus et autre : partout). */
export function kindsUnder(parentKind: FunctionKind | null): FunctionKind[] {
    if (!parentKind) return [...KIND_ORDER];
    const parent = DEPTH[parentKind];
    return KIND_ORDER.filter(kind => { const depth = DEPTH[kind]; return parent === null || depth === null || depth > parent; });
}

/** Les fonctions qui peuvent être la mère de `kind` : un niveau plus haut, ou sans niveau. Une fonction ne se range ni sous elle-même ni sous ses descendantes. */
export function parentCandidates(all: FunctionView[], kind: FunctionKind, selfId: string | null): FunctionView[] {
    const descendants = new Set<string>();
    if (selfId) {
        const children = new Map<string, string[]>();
        for (const f of all) if (f.input.parentId) children.set(f.input.parentId, [...(children.get(f.input.parentId) ?? []), f.id]);
        const stack = [selfId];
        while (stack.length) { const id = stack.pop()!; for (const child of children.get(id) ?? []) if (!descendants.has(child)) { descendants.add(child); stack.push(child); } }
        descendants.add(selfId);
    }
    const depth = DEPTH[kind];
    return all.filter(f => !descendants.has(f.id) && (depth === null || DEPTH[f.input.kind] === null || DEPTH[f.input.kind]! < depth));
}

/** L'arbre à plat, chaque fonction sous sa mère, avec sa profondeur. Une fonction dont la mère est absente de la liste est affichée à la racine. */
export function flattenFunctions(rows: FunctionView[]): { row: FunctionView; depth: number }[] {
    const ids = new Set(rows.map(r => r.id));
    const children = new Map<string, FunctionView[]>();
    for (const row of rows) {
        const parent = row.input.parentId && ids.has(row.input.parentId) ? row.input.parentId : '';
        children.set(parent, [...(children.get(parent) ?? []), row]);
    }
    const result: { row: FunctionView; depth: number }[] = [];
    const seen = new Set<string>();
    const walk = (parent: string, depth: number) => {
        for (const row of (children.get(parent) ?? []).slice().sort((a, b) => a.input.code.localeCompare(b.input.code))) {
            if (seen.has(row.id)) continue;
            seen.add(row.id);
            result.push({ row, depth });
            walk(row.id, depth + 1);
        }
    };
    walk('', 0);
    return result;
}

const DATE = /^[0-9]{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12][0-9]|3[01]))?)?$/;

const lower = (d: string) => d.length === 4 ? `${d}-01-01` : d.length === 7 ? `${d}-01` : d;
const upper = (d: string) => d.length === 4 ? `${d}-12-31` : d.length === 7 ? `${d}-31` : d;
export function functionProblems(input: FunctionInput): string[] {
    const problems: string[] = [];
    if (!input.code.trim()) problems.push('Le code est obligatoire.');
    else if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/.test(input.code.trim())) problems.push('Le code ne contient que lettres, chiffres, point, tiret, barre oblique et tiret bas.');
    if (!input.name.trim()) problems.push('La forme autorisée du nom est obligatoire.');
    for (const [label, value] of [['La date de début', input.dateStart], ['La date de fin', input.dateEnd]] as const)
        if (value && !DATE.test(value)) problems.push(`${label} s’écrit AAAA, AAAA-MM ou AAAA-MM-JJ.`);
    if (input.dateStart && input.dateEnd && DATE.test(input.dateStart) && DATE.test(input.dateEnd) && lower(input.dateStart) > upper(input.dateEnd))
        problems.push('La date de début dépasse la date de fin.');
    if (input.status !== 'BROUILLON' && !input.description?.trim()) problems.push('Une description révisée ou validée porte sa description.');
    if (input.status === 'VALIDEE' && !input.sources?.trim()) problems.push('Une description validée cite ses sources.');
    return problems;
}
