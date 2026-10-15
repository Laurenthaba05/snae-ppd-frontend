import type { DescriptionEnrichment } from './archiveEnrichment.js';
/**
 * Instruments de recherche publiés (inventaires des fonds) : ce que le public voit d'un fonds, et ce que le personnel publie. Une notice n'est visible que si elle est publique et validée,
 * et si chaque niveau au-dessus, jusqu'à la racine publiée, l'est aussi. Le serveur reste seul juge ; ici, l'affichage.
 */
export type FindingAidLevel = 'FONDS' | 'SOUS_FONDS' | 'SERIE' | 'SOUS_SERIE' | 'DOSSIER' | 'PIECE';

export interface FindingAidPublication {
    id: string; descriptionId: string; code: string; title: string; level: string; publishedAt: string; publishedByName: string | null;
    retiredAt: string | null; retireReason: string | null; retiredByName: string | null; visibleNodes: number; totalNodes: number;
}
export interface FindingAidCandidate { descriptionId: string; code: string; title: string; level: string; visibleNodes: number; totalNodes: number }
export interface FindingAidPreview {
    descriptionId: string; code: string; title: string; level: string; eligible: boolean; problems: string[]; totalNodes: number; visibleNodes: number;
    hiddenNotPublic: number; hiddenNotValidated: number; alreadyPublished: boolean;
}

export interface PublicFindingAid {
    id: string; institutionName: string; code: string; title: string; level: string; dateLabel: string | null; extent: string | null; producerName: string | null; summary: string | null; publishedAt: string;
}
export interface PublicNodeSummary { id: string; code: string; title: string; level: string; dateLabel: string | null; extent: string | null; childCount: number }
export interface PublicPathStep { id: string; code: string; title: string; level: string }
export interface PublicNode {
    id: string; rootId: string; code: string; title: string; level: string; institutionName: string; producerName: string | null; fields: Record<string, string>;
    path: PublicPathStep[]; children: PublicNodeSummary[]; hasMoreChildren: boolean; page: number;
    enrichment?: DescriptionEnrichment; producers?: {id:string;name:string;kind:string}[];
}

export const LEVEL_LABELS: Record<string, string> = {
    FONDS: 'Fonds', SOUS_FONDS: 'Sous-fonds', SERIE: 'Série', SOUS_SERIE: 'Sous-série', DOSSIER: 'Dossier', PIECE: 'Pièce'
};
export const levelLabel = (level: string): string => LEVEL_LABELS[level] ?? 'Notice';

/** Les éléments de description donnés au public, dans l'ordre où on les lit, avec leur libellé. */
export const FIELD_SECTIONS: Array<{ title: string; fields: Array<[string, string]> }> = [
    { title: 'Contenu et structure', fields: [['scopeContent', 'Présentation du contenu'], ['arrangement', 'Mode de classement'], ['accruals', 'Accroissements']] },
    { title: 'Conditions d’accès et d’utilisation', fields: [['accessConditions', 'Conditions d’accès'], ['reproductionConditions', 'Conditions de reproduction'], ['language', 'Langue'], ['scripts', 'Écritures'],
        ['physicalCharacteristics', 'Caractéristiques matérielles'], ['findingAids', 'Instruments de recherche']] },
    { title: 'Sources complémentaires', fields: [['originalsLocation', 'Existence et lieu de conservation des originaux'], ['copiesLocation', 'Existence et lieu de conservation des copies'],
        ['relatedUnits', 'Unités de description associées'], ['publicationNote', 'Note sur les publications']] },
    { title: 'Contexte', fields: [['custodialHistory', 'Historique de la conservation'], ['acquisition', 'Modalités d’entrée']] }
];

/** Les sections du détail d'une notice qui ont au moins un élément renseigné. */
export function filledSections(fields: Record<string, string>): Array<{ title: string; rows: Array<[string, string]> }> {
    return FIELD_SECTIONS.map(section => ({ title: section.title, rows: section.fields.flatMap(([key, label]) => (fields[key]?.trim() ? [[label, fields[key] as string] as [string, string]] : [])) }))
        .filter(section => section.rows.length > 0);
}

/** « 3 notices visibles sur 6 » : ce que le public verrait d'un instrument, par rapport à tout ce que le fonds compte. */
export function visibilityText(visible: number, total: number): string {
    if (total === 0) return 'Aucune notice';
    if (visible === total) return total === 1 ? 'La notice est visible' : `Les ${total} notices sont visibles`;
    return `${visible} notice${visible > 1 ? 's' : ''} visible${visible > 1 ? 's' : ''} sur ${total}`;
}

/** Les dates d'une notice en une ligne (étiquette, sinon intervalle des années). */
export function datesText(fields: Record<string, string>): string | null {
    if (fields.dateLabel?.trim()) return fields.dateLabel.trim();
    const years = [fields.dateStart, fields.dateEnd].filter((v): v is string => !!v?.trim()).map(v => v.slice(0, 4));
    const unique = [...new Set(years)];
    return unique.length ? unique.join('–') : null;
}

/** Les adresses d'export publiques d'une notice (RiC-O en JSON-LD, Dublin Core en XML). */
export const exportLinks = (id: string): { rico: string; dublinCore: string } => ({ rico: `/api/v1/portal/inventaires/notices/${id}/ric-o`, dublinCore: `/api/v1/portal/inventaires/notices/${id}/dc` });
