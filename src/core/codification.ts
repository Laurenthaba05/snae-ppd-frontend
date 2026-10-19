/** La codification guidée des références (documents, dossiers, notices de description) : les types partagés avec le serveur et les libellés de l'écran. */
export type CodificationKind = 'DOCUMENT' | 'DOSSIER' | 'NOTICE';
export type CodificationMode = 'INDICATIF' | 'OBLIGATOIRE';
export type SegmentType = 'TEXTE' | 'ANNEE' | 'CLASSEMENT' | 'PARENT' | 'COMPTEUR';

/** Une pièce du modèle : `value` pour un texte fixe, `digits` pour le compteur. */
export interface CodificationSegment { type: SegmentType; value?: string | null; digits?: number | null }

export interface CodificationModel {
    id: string;
    institutionId: string;
    kind: CodificationKind;
    label: string | null;
    segments: CodificationSegment[];
    mode: CodificationMode;
    version: number;
    /** Le modèle en toutes lettres, par exemple « ARC-AAAA-0001 ». */
    pattern: string;
    example: string;
}

/** La référence suivante du modèle : elle n'est pas réservée, elle devient réelle à la création. */
export interface CodificationProposal { code: string; counter: number; pattern: string; mode: CodificationMode }

export interface CodificationCheck { conform: boolean; mode: CodificationMode | null; pattern: string | null; example: string | null; message: string | null }

export const KIND_LABELS: Record<CodificationKind, string> = { DOCUMENT: 'Documents', DOSSIER: 'Dossiers', NOTICE: 'Notices de description' };
export const MODE_LABELS: Record<CodificationMode, string> = { INDICATIF: 'Indicatif', OBLIGATOIRE: 'Obligatoire' };

/** Ce que désigne la pièce « contenant » selon l'objet : le dossier d'un document, le dossier parent d'un dossier, la notice parente d'une notice. */
export const PARENT_LABELS: Record<CodificationKind, string> = { DOCUMENT: 'Dossier du document', DOSSIER: 'Dossier parent', NOTICE: 'Notice parente' };

export function segmentLabel(type: SegmentType, kind: CodificationKind): string {
    switch (type) {
        case 'TEXTE': return 'Texte fixe';
        case 'ANNEE': return 'Année';
        case 'CLASSEMENT': return 'Code du classement';
        case 'PARENT': return PARENT_LABELS[kind];
        case 'COMPTEUR': return 'Compteur';
    }
}

/** Le modèle en toutes lettres, comme le serveur le décrit : le texte tel quel, AAAA pour l'année, un numéro d'exemple pour le compteur. */
export function patternOf(segments: CodificationSegment[]): string {
    return segments.map(s => {
        switch (s.type) {
            case 'TEXTE': return (s.value ?? '').trim().toUpperCase();
            case 'ANNEE': return 'AAAA';
            case 'CLASSEMENT': return '{classement}';
            case 'PARENT': return '{contenant}';
            case 'COMPTEUR': return '1'.padStart(Math.max(1, Math.min(9, s.digits ?? 4)), '0');
        }
    }).join('');
}

/** Un modèle de départ, à adapter : ce ne sont pas des règles, seulement des formes courantes. */
export const STARTERS: Array<{ id: string; label: string; segments: (kind: CodificationKind) => CodificationSegment[] }> = [
    { id: 'annuel', label: 'Texte, année et numéro (ARC-AAAA-0001)', segments: () => [{ type: 'TEXTE', value: 'ARC' }, { type: 'TEXTE', value: '-' }, { type: 'ANNEE' }, { type: 'TEXTE', value: '-' }, { type: 'COMPTEUR', digits: 4 }] },
    { id: 'contenant', label: 'Référence du contenant et numéro ({contenant}/001)', segments: () => [{ type: 'PARENT' }, { type: 'TEXTE', value: '/' }, { type: 'COMPTEUR', digits: 3 }] },
    { id: 'classement', label: 'Code du classement, année et numéro ({classement}-AAAA-01)', segments: () => [{ type: 'CLASSEMENT' }, { type: 'TEXTE', value: '-' }, { type: 'ANNEE' }, { type: 'TEXTE', value: '-' }, { type: 'COMPTEUR', digits: 2 }] },
    { id: 'simple', label: 'Un numéro continu (00001)', segments: () => [{ type: 'COMPTEUR', digits: 5 }] }
];
