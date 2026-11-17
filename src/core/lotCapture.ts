import type { ConfidentialityLevel } from './types.js';
export interface LotContext {
    lotId: string; lotCode: string; institutionId: string; departmentId: string | null;
    typeDocumentId: string; typeName: string; classificationNodeId: string; classificationName: string;
    responsibleId: string; responsibleName: string; dossierId: string | null; confidentiality: ConfidentialityLevel;
    validatedBy: string; validatedAt: string;
}
export interface CapturedDocument { documentId: string; versionId: string; elementId: string; reference: string; lotId: string; }
export interface CaptureInput { title: string; reference?: string | null; documentDate?: string | null; origin: 'IMPORTE' | 'NUMERISE'; }
export interface LotContextInput { expectedVersion: number; typeDocumentId: string; classificationNodeId: string; responsibleId: string; dossierId: string | null; confidentiality: ConfidentialityLevel; }
export function captureFileProblem(files: File[]) {
    if (!files.length || files.length > 100) return 'Choisissez entre 1 et 100 fichiers.';
    if (files.some(f => !/\.(pdf|png|jpe?g|tiff?)$/i.test(f.name))) return 'Choisissez des PDF ou des images PNG, JPEG ou TIFF.';
    if (files.some(f => f.size === 0 || f.size > 64 * 1024 * 1024)) return 'Chaque fichier doit contenir entre 1 octet et 64 Mio.';
    return null;
}
