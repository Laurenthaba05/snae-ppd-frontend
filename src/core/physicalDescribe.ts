import type { PhysicalArchive } from './types.js';

/* Corriger la description d'une archive physique : tout est remplacé d'un bloc, la version lue protège de deux personnes qui corrigent en même temps. */

export interface DescribeForm {
    intitule: string;
    support: string;
    etatPhysique: string;
    description: string;
    dateExtremeDebut: string;
    dateExtremeFin: string;
    quantite: string;
    uniteQuantite: string;
}

/** Le formulaire rempli avec ce que l'archive porte aujourd'hui. */
export function describeForm(a: PhysicalArchive): DescribeForm {
    return {
        intitule: a.intitule ?? '', support: a.support ?? '', etatPhysique: a.etatPhysique ?? '', description: a.description ?? '',
        dateExtremeDebut: a.dateExtremeDebut ?? '', dateExtremeFin: a.dateExtremeFin ?? '',
        // le serveur rend « 12.000 » : on montre « 12 » ; une quantité absente ou illisible reste vide
        quantite: Number.isFinite(Number(a.quantite ?? Number.NaN)) ? String(Number(a.quantite)) : '', uniteQuantite: a.uniteQuantite ?? '',
    };
}

/** Une quantité saisie avec une virgule ou un point ; vide : aucune. Rend NaN si ce n'est pas un nombre. */
export function parseQuantity(text: string): number | null {
    const clean = text.trim().replace(',', '.');
    if (clean === '') return null;
    return /^\d+(\.\d{1,3})?$/.test(clean) ? Number(clean) : Number.NaN;
}

/** Ce qui empêche d'enregistrer, en phrases ; liste vide quand tout va bien. */
export function describeProblems(f: DescribeForm): string[] {
    const problems: string[] = [];
    if (f.dateExtremeDebut && f.dateExtremeFin && f.dateExtremeFin < f.dateExtremeDebut) problems.push('La date extrême de fin doit suivre la date extrême de début.');
    if (Number.isNaN(parseQuantity(f.quantite))) problems.push('La quantité est un nombre positif, avec au plus trois décimales.');
    if (f.uniteQuantite.trim() && f.quantite.trim() === '') problems.push('Indiquez la quantité, ou retirez son unité.');
    return problems;
}

export function describeBody(f: DescribeForm, versionLock: number): Record<string, unknown> {
    const text = (value: string): string | null => value.trim() || null;
    return {
        versionLock, intitule: text(f.intitule), support: text(f.support), etatPhysique: text(f.etatPhysique), description: text(f.description),
        dateExtremeDebut: text(f.dateExtremeDebut), dateExtremeFin: text(f.dateExtremeFin), quantite: parseQuantity(f.quantite), uniteQuantite: text(f.uniteQuantite),
    };
}
