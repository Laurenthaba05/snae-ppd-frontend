import { naturalCompare } from './pageNumbering.js';
import { parseCode, resolveAmong, type ScanCode } from './scanCodes.js';

/** Découpage d'un lot de fichiers par feuilles séparatrices (codes SNAE) : fonctions pures, testées sans navigateur. */
export interface ScannedFile { name: string; size: number; /** Textes lus dans l'image. */ codes: string[]; /** Le navigateur n'a pas pu décoder l'image : aucun code n'a pu être lu. */ unreadable: boolean }

export interface FileGroup<F extends ScannedFile = ScannedFile> {
    /** Code de la feuille séparatrice qui ouvre le groupe. */
    code: ScanCode;
    separator: F;
    pages: F[];
}
export interface BatchSplit<F extends ScannedFile = ScannedFile> {
    groups: Array<FileGroup<F>>;
    /** Fichiers rencontrés avant toute feuille séparatrice : ils n'appartiennent à aucun élément. */
    orphans: F[];
    /** Feuilles de lot rencontrées (aucune page ne les suit : elles ne séparent rien). */
    lotSheets: Array<{ file: F; code: ScanCode }>;
    unreadable: F[];
}

const firstSnaeCode = (file: ScannedFile): ScanCode | null => {
    for (const text of file.codes) { const code = parseCode(text); if (code) return code; }
    return null;
};

export function splitByCodes<F extends ScannedFile>(files: readonly F[]): BatchSplit<F> {
    const result: BatchSplit<F> = { groups: [], orphans: [], lotSheets: [], unreadable: [] };
    let current: FileGroup<F> | null = null;
    for (const file of [...files].sort((a, b) => naturalCompare(a.name, b.name))) {
        if (file.unreadable) { result.unreadable.push(file); continue; }
        const code = firstSnaeCode(file);
        if (code?.kind === 'ELEMENT') { current = { code, separator: file, pages: [] }; result.groups.push(current); }
        else if (code?.kind === 'LOT') result.lotSheets.push({ file, code });
        else if (current) current.pages.push(file);
        else result.orphans.push(file);
    }
    return result;
}

export type GroupProblem = 'INTROUVABLE' | 'AMBIGU' | 'VIDE' | 'DOUBLON';
export interface ResolvedGroup<F extends ScannedFile, E extends { id: string }> { group: FileGroup<F>; element: E | null; problem: GroupProblem | null }

/** Rattache chaque groupe à un élément du projet ; un élément ne peut recevoir qu'un groupe, un groupe sans page est signalé. */
export function resolveGroups<F extends ScannedFile, E extends { id: string }>(groups: ReadonlyArray<FileGroup<F>>, elements: readonly E[]): Array<ResolvedGroup<F, E>> {
    const used = new Set<string>();
    return groups.map(group => {
        const { match, ambiguous } = resolveAmong(group.code, elements);
        let problem: GroupProblem | null = ambiguous ? 'AMBIGU' : !match ? 'INTROUVABLE' : null;
        if (!problem && match && used.has(match.id)) problem = 'DOUBLON';
        if (!problem && group.pages.length === 0) problem = 'VIDE';
        if (match && !problem) used.add(match.id);
        return { group, element: match, problem };
    });
}

export const PROBLEM_TEXT: Record<GroupProblem, string> = {
    INTROUVABLE: 'Aucun élément de ce projet ne correspond au code de la feuille séparatrice.',
    AMBIGU: 'Le code court correspond à plusieurs éléments : imprimez à nouveau la feuille (code QR complet).',
    VIDE: 'Aucune page ne suit cette feuille séparatrice.',
    DOUBLON: 'Cet élément apparaît déjà plus haut dans le lot : une seule feuille séparatrice par élément.'
};
