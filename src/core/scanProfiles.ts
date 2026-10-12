/**
 * Profils de numérisation et caractéristiques techniques des images : ce qu'une institution exige d'une image numérisée (résolution, profondeur, mode colorimétrique, formats, compression
 * sans perte, profil ICC) et ce que contient réellement le fichier. Aucun profil n'est livré : c'est une décision de l'institution. Le serveur reste seul juge ; ici, la saisie guidée.
 *
 * La conformité compare des en-têtes de fichier à des exigences. Elle ne mesure ni la netteté, ni l'exactitude des couleurs (cela suppose une cible de numérisation et un outil de
 * mesure) : ce n'est pas une certification FADGI ou Metamorfoze.
 */

export type ColorMode = 'BITONAL' | 'GRAY' | 'RGB' | 'CMYK' | 'PALETTE' | 'AUTRE';

export interface ScanProfile {
    id: string; institutionId: string | null; code: string; name: string; description: string | null; source: string | null; ppiMin: number; bitsMin: number;
    colorModes: string[]; formats: string[]; lossless: boolean; iccRequired: boolean; status: 'ACTIF' | 'RETIRE'; retireReason: string | null; createdAt: string;
}

export interface TechnicalMetadata {
    format: string; width: number; height: number; bitsPerSample: number | null; samples: number | null; colorMode: ColorMode; compression: string | null;
    lossless: boolean | null; ppiX: number | null; ppiY: number | null; iccProfile: boolean;
}
export interface ImageTechnical { fileId: string; fileName: string; mediaType: string; size: number; metadata: TechnicalMetadata; extractedAt: string }

export interface ConformityFinding { code: string; ok: boolean; message: string }
export interface ConformityReport { profileId: string; profileName: string; conform: boolean; findings: ConformityFinding[] }

export const COLOR_MODE_LABELS: Record<ColorMode, string> = {
    BITONAL: 'Noir et blanc (1 bit)', GRAY: 'Niveaux de gris', RGB: 'Couleur (RVB)', CMYK: 'Couleur (CMJN)', PALETTE: 'Couleurs indexées (palette)', AUTRE: 'Autre mode'
};
/** Les modes qu'un profil peut exiger (le serveur n'accepte que ceux-ci). */
export const PROFILE_COLOR_MODES: ColorMode[] = ['BITONAL', 'GRAY', 'RGB', 'CMYK'];
/** Les formats d'image usuels qu'un profil peut restreindre ; la liste vide veut dire « tout format ». */
export const PROFILE_FORMATS: { value: string; label: string }[] = [
    { value: 'image/tiff', label: 'TIFF' }, { value: 'image/png', label: 'PNG' }, { value: 'image/jpeg', label: 'JPEG' }, { value: 'image/bmp', label: 'BMP' }, { value: 'image/gif', label: 'GIF' }
];
export const PROFILE_BITS = [1, 8, 16] as const;
export const STATUS_LABELS: Record<ScanProfile['status'], string> = { ACTIF: 'Actif', RETIRE: 'Retiré' };
export const FINDING_LABELS: Record<string, string> = {
    RESOLUTION: 'Résolution', BITS: 'Profondeur', COLOR_MODE: 'Mode colorimétrique', FORMAT: 'Format', COMPRESSION: 'Compression', ICC: 'Profil ICC'
};

export interface ProfileForm {
    code: string; name: string; description: string; source: string; ppiMin: string; bitsMin: number; colorModes: string[]; formats: string[]; lossless: boolean; iccRequired: boolean;
}
export const emptyProfileForm = (): ProfileForm => ({ code: '', name: '', description: '', source: '', ppiMin: '300', bitsMin: 8, colorModes: [], formats: [], lossless: false, iccRequired: false });

const CODE = /^[A-Z][A-Z0-9_]{1,59}$/;

/** Le code tel que le serveur le garde : majuscules, sans espace en bordure. */
export const normalizeCode = (value: string): string => value.trim().toUpperCase();

/** Ce qui manque à la saisie d'un profil ; vide si elle peut être envoyée. Le serveur relit tout. */
export function profileProblems(form: ProfileForm): string[] {
    const problems: string[] = [];
    if (!CODE.test(normalizeCode(form.code))) problems.push('Le code compte de 2 à 60 caractères : lettres majuscules, chiffres et souligné, la première étant une lettre.');
    if (form.name.trim().length === 0 || form.name.trim().length > 200) problems.push('Donnez un nom au profil (200 caractères au plus).');
    const ppi = Number(form.ppiMin);
    if (!Number.isInteger(ppi) || ppi < 50 || ppi > 9600) problems.push('La résolution minimale est un nombre entier compris entre 50 et 9600 points par pouce.');
    if (!(PROFILE_BITS as readonly number[]).includes(form.bitsMin)) problems.push('La profondeur minimale est de 1, 8 ou 16 bits par composante.');
    if (form.description.length > 2000) problems.push('La description est limitée à 2000 caractères.');
    if (form.source.length > 500) problems.push('La source est limitée à 500 caractères.');
    return problems;
}

/** Le corps de la demande de création (valide si `profileProblems` est vide). */
export function profilePayload(form: ProfileForm, institutionId: string | null) {
    return {
        institutionId, code: normalizeCode(form.code), name: form.name.trim(), description: form.description.trim() || null, source: form.source.trim() || null,
        ppiMin: Number(form.ppiMin), bitsMin: form.bitsMin, colorModes: form.colorModes, formats: form.formats, lossless: form.lossless, iccRequired: form.iccRequired
    };
}

const formatLabel = (mediaType: string): string => PROFILE_FORMATS.find(f => f.value === mediaType)?.label ?? mediaType;

/** Les exigences d'un profil en une phrase par ligne, dans l'ordre où l'on les juge. */
export function requirementLines(profile: Pick<ScanProfile, 'ppiMin' | 'bitsMin' | 'colorModes' | 'formats' | 'lossless' | 'iccRequired'>): string[] {
    const lines = [`Résolution d’au moins ${profile.ppiMin} ppp`, `Au moins ${profile.bitsMin} ${profile.bitsMin > 1 ? 'bits' : 'bit'} par composante`];
    if (profile.colorModes.length) lines.push(`Mode : ${profile.colorModes.map(m => COLOR_MODE_LABELS[m as ColorMode] ?? m).join(', ')}`);
    if (profile.formats.length) lines.push(`Format : ${profile.formats.map(formatLabel).join(', ')}`);
    if (profile.lossless) lines.push('Compression sans perte');
    if (profile.iccRequired) lines.push('Profil colorimétrique ICC embarqué');
    return lines;
}

/** Une résolution lisible : « 300 ppp », « 300 × 600 ppp » si elle diffère, « non renseignée » sinon. */
export function resolutionText(m: Pick<TechnicalMetadata, 'ppiX' | 'ppiY'>): string {
    const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ','));
    if (m.ppiX == null && m.ppiY == null) return 'Non renseignée dans le fichier';
    if (m.ppiX != null && m.ppiY != null && m.ppiX !== m.ppiY) return `${fmt(m.ppiX)} × ${fmt(m.ppiY)} ppp`;
    return `${fmt((m.ppiX ?? m.ppiY) as number)} ppp`;
}

/** Les caractéristiques d'une image en lignes « libellé / valeur » prêtes à afficher ; une valeur inconnue du fichier est dite telle, jamais supposée. */
export function technicalRows(m: TechnicalMetadata): { label: string; value: string }[] {
    return [
        { label: 'Format', value: m.format },
        { label: 'Dimensions', value: `${m.width} × ${m.height} pixels` },
        { label: 'Résolution', value: resolutionText(m) },
        { label: 'Profondeur', value: m.bitsPerSample != null ? `${m.bitsPerSample} ${m.bitsPerSample > 1 ? 'bits' : 'bit'} par composante` : 'Non déterminée' },
        { label: 'Mode colorimétrique', value: COLOR_MODE_LABELS[m.colorMode] ?? m.colorMode },
        { label: 'Compression', value: m.compression ? `${m.compression}${m.lossless === true ? ' (sans perte)' : m.lossless === false ? ' (avec perte)' : ''}` : 'Non compressé ou non déterminée' },
        { label: 'Profil ICC', value: m.iccProfile ? 'Embarqué' : 'Aucun' }
    ];
}

/** Un fichier a des caractéristiques d'image s'il est déclaré comme tel (le serveur lit alors ses en-têtes). */
export const isImageFile = (mediaType: string | null | undefined): boolean => !!mediaType && mediaType.toLowerCase().startsWith('image/');

/** Le nom du fichier d'export MIX : celui du fichier image, sans caractère interdit. */
export function mixFileName(fileName: string): string {
    const stem = fileName.replace(/\.[A-Za-z0-9]{1,5}$/, '').replace(/[^A-Za-z0-9._ -]+/g, '-').trim() || 'image';
    return `mix-${stem}.xml`;
}

export const isPdfFile = (mediaType: string | null | undefined): boolean => !!mediaType && mediaType.toLowerCase().startsWith('application/pdf');

/** Ce qu'un fichier PDF dit de lui-même : sa version et sa déclaration PDF/A. Une déclaration n'est jamais une validation. */
export interface PdfaDeclaration {
    fileId: string; fileName: string; mediaType: string; size: number; pdfVersion: string | null; declared: boolean; label: string | null; part: number | null; conformance: string | null;
    encrypted: boolean; xmpFound: boolean; validated: boolean; extractedAt: string; notice: string;
}

export const PDFA_LEVELS: Record<string, string> = { A: 'A — conformité complète, structure logique et texte', B: 'B — conformité de base, rendu visuel', U: 'U — conformité de base, texte en Unicode' };

/** Les lignes du tableau : une valeur absente est dite « non renseignée », jamais supposée. */
export function pdfaRows(d: PdfaDeclaration): Array<{ label: string; value: string }> {
    return [
        { label: 'Version du PDF', value: d.pdfVersion ?? 'non renseignée' },
        { label: 'Déclaration PDF/A', value: d.declared ? (d.label ?? 'déclarée') : 'aucune déclaration' },
        { label: 'Niveau', value: d.conformance ? (PDFA_LEVELS[d.conformance] ?? d.conformance) : d.declared ? 'sans niveau (partie 4)' : '—' },
        { label: 'Métadonnées XMP', value: d.xmpFound ? 'présentes' : 'absentes' },
        { label: 'Chiffrement', value: d.encrypted ? 'signalé : un PDF/A ne se chiffre pas' : 'non signalé' },
        { label: 'Validation', value: d.validated ? 'validé' : 'non validée : aucun validateur PDF/A n’est raccordé' }
    ];
}
