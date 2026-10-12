import type { ImageInfo } from './scanImage.js';
import type { PageFace } from './types.js';

/** Même convention que le serveur : en recto-verso, les pages impaires sont des rectos et les paires des versos. */
export const faceFor = (numero: number, rectoVerso: boolean): PageFace => rectoVerso && numero % 2 === 0 ? 'VERSO' : 'RECTO';

const collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });
/** Tri « naturel » : scan2.tif avant scan10.tif. */
export const naturalCompare = (a: string, b: string) => collator.compare(a, b);

export interface PlanInput { name: string; size: number; info: ImageInfo }
export interface PlanRow extends PlanInput {
    numero: number;
    face: PageFace;
    warnings: string[];
    /** Bloquant : la ligne ne sera pas envoyée. */
    errors: string[];
}
export interface PlanOptions {
    start: number;
    rectoVerso: boolean;
    resolutionMin: number | null;
    attendues: number | null;
    /** Numéros déjà enregistrés comme PRESENTE (non remplaçables sans rescan). */
    taken: ReadonlySet<number>;
}

const SUPPORTED = new Set(['PNG', 'JPEG', 'TIFF']);

/** Numérote les fichiers dans l'ordre naturel de leurs noms, à partir de `start`, et signale ce qui doit être revu avant envoi. */
export function planPages(files: PlanInput[], options: PlanOptions): PlanRow[] {
    const sorted = [...files].sort((a, b) => naturalCompare(a.name, b.name));
    const seen = new Set<string>();
    let next = options.start;
    return sorted.map((file): PlanRow => {
        const signature = file.name + '|' + file.size;
        const duplicate = seen.has(signature);
        seen.add(signature);
        const supported = SUPPORTED.has(file.info.format);
        // Un fichier inutilisable (PDF, format inconnu, doublon) ne consomme pas de numéro de page.
        const numero = supported && !duplicate ? next++ : 0;
        const row: PlanRow = { ...file, numero, face: faceFor(numero || 1, options.rectoVerso), warnings: [], errors: [] };
        if (duplicate) row.errors.push('Fichier en double dans la sélection.');
        if (!supported) row.errors.push(file.info.format === 'PDF' ? 'Les PDF ne sont pas acceptés comme page : fournissez une image par page (TIFF, JPEG ou PNG).' : 'Format non reconnu (TIFF, JPEG ou PNG attendus).');
        if (numero > 100000) row.errors.push('Numéro de page supérieur à 100 000.');
        if (numero > 0 && options.taken.has(numero)) row.errors.push(`La page ${numero} existe déjà : marquez-la « à rescanner » avant de la remplacer.`);
        if (numero > 0 && options.attendues !== null && numero > options.attendues) row.errors.push(`Au-delà des ${options.attendues} pages attendues : corrigez d’abord le nombre de pages attendues.`);
        if (supported) {
            if (file.info.dpi === null) row.warnings.push('Résolution non lisible dans le fichier.');
            else if (options.resolutionMin !== null && file.info.dpi < options.resolutionMin) row.warnings.push(`Résolution insuffisante : ${file.info.dpi} dpi (minimum ${options.resolutionMin}).`);
        }
        return row;
    });
}

/** Pages attendues qui ne seront couvertes ni par les pages déjà enregistrées ni par le lot de fichiers en préparation. */
export function remainingGaps(attendues: number | null, registered: Iterable<number>, planned: Iterable<number>, limit = 200): number[] {
    if (attendues === null) return [];
    const covered = new Set<number>([...registered, ...planned]);
    const gaps: number[] = [];
    for (let n = 1; n <= attendues && gaps.length < limit; n++) if (!covered.has(n)) gaps.push(n);
    return gaps;
}

/** Résume une liste de numéros : « 3, 4, 7-9, 12 ». */
export function formatRanges(numbers: number[]): string {
    const sorted = [...new Set(numbers)].sort((a, b) => a - b);
    const parts: string[] = [];
    for (let i = 0; i < sorted.length; i++) {
        let j = i;
        while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j++;
        parts.push(j - i >= 2 ? `${sorted[i]}-${sorted[j]}` : sorted.slice(i, j + 1).join(', '));
        i = j;
    }
    return parts.join(', ');
}
