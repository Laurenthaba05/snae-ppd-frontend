import type { Transport, RequestOptions } from '../core/http.js';
import { uuid } from '../core/validation.js';
import type { ConformityReport, ImageTechnical, PdfaDeclaration, ScanProfile } from '../core/scanProfiles.js';
import type { LotAdvance, AccessPdf, DigitizationProject, DigitizationElement, QualityControl, QualityControlListItem, OcrLayout, OcrResult, Contribution, OcrListItem, Scanner, ScanLot, ScanPage, PageCheck, LotSummary, ElementWorkflow, ElementTransition, PipelineStage, QueueItem, DigitizationElementStatus, OcrJobs, OcrStatus, QualityAnalysis, FileAssets } from '../core/types.js';
export class DigitizationApi {
    constructor(readonly transport: Transport) { }
    projects(signal?: AbortSignal): Promise<DigitizationProject[]> { return this.transport.request('/digitization/projects', { signal }); }
    elementsByProject(projectId: string, signal?: AbortSignal): Promise<DigitizationElement[]> { return this.transport.request('/digitization/projects/' + uuid(projectId) + '/elements', { signal }); }
    qualityControls(signal?: AbortSignal): Promise<QualityControlListItem[]> { return this.transport.request('/digitization/quality-controls', { signal }); }
    qualityControlsByElement(elementId: string, signal?: AbortSignal): Promise<QualityControl[]> { return this.transport.request('/digitization/elements/' + uuid(elementId) + '/quality-controls', { signal }); }
    ocrLayout(id: string, signal?: AbortSignal, page?: number): Promise<OcrLayout> { return this.transport.request('/digitization/ocr-results/' + uuid(id) + '/layout' + (page === undefined ? '' : '?page=' + page), { signal }); }
    ocrResults(signal?: AbortSignal): Promise<OcrListItem[]> { return this.transport.request('/digitization/ocr-results', { signal }); }
    /** Le texte reconnu avec la boîte de chaque mot (ALTO 4). Sans numéro, regroupe toutes les pages OCR disponibles ; avec un numéro, exporte cette seule page. */
    ocrAlto(id: string, signal?: AbortSignal, page?: number): Promise<Blob> { return this.transport.request('/digitization/ocr-results/' + uuid(id) + '/alto' + (page === undefined ? '' : '?page=' + page), { signal, responseType: 'blob' }); }
    /** État d'ensemble de l'OCR automatique : configuré, moteur présent, file qui avance, pages en échec. */
    ocrStatus(signal?: AbortSignal): Promise<OcrStatus> { return this.transport.request('/digitization/ocr/status', { signal }); }
    ocrResultsByFile(fichierId: string, signal?: AbortSignal): Promise<OcrResult[]> { return this.transport.request('/digitization/files/' + uuid(fichierId) + '/ocr-results', { signal }); }
    contributionsByElement(elementId: string, signal?: AbortSignal): Promise<Contribution[]> { return this.transport.request('/digitization/elements/' + uuid(elementId) + '/contributions', { signal }); }
    element(id: string, signal?: AbortSignal): Promise<DigitizationElement> { return this.transport.request('/digitization/elements/' + uuid(id), { signal }); }
    lot(id: string, signal?: AbortSignal): Promise<ScanLot> { return this.transport.request('/digitization/lots/' + uuid(id), { signal }); }
    scanners(signal?: AbortSignal): Promise<Scanner[]> { return this.transport.request('/digitization/scanners', { signal }); }
    lotsByProject(projectId: string, signal?: AbortSignal): Promise<ScanLot[]> { return this.transport.request('/digitization/projects/' + uuid(projectId) + '/lots', { signal }); }
    advanceLot(id: string, body: { de: DigitizationElementStatus; vers: DigitizationElementStatus; motif: string | null }, key: string): Promise<LotAdvance> {
        return this.transport.request('/digitization/lots/' + uuid(id) + '/advance', { method: 'POST', body, idempotencyKey: key });
    }
    lotSummary(lotId: string, signal?: AbortSignal): Promise<LotSummary> { return this.transport.request('/digitization/lots/' + uuid(lotId) + '/summary', { signal }); }
    pagesByElement(elementId: string, signal?: AbortSignal): Promise<ScanPage[]> { return this.transport.request('/digitization/elements/' + uuid(elementId) + '/pages', { signal }); }
    pageCheck(elementId: string, signal?: AbortSignal): Promise<PageCheck> { return this.transport.request('/digitization/elements/' + uuid(elementId) + '/page-check', { signal }); }
    elementWorkflow(elementId: string, signal?: AbortSignal): Promise<ElementWorkflow> { return this.transport.request('/digitization/elements/' + uuid(elementId) + '/workflow', { signal }); }
    elementTransitions(elementId: string, signal?: AbortSignal): Promise<ElementTransition[]> { return this.transport.request('/digitization/elements/' + uuid(elementId) + '/transitions', { signal }); }
    ocrJobs(elementId: string, signal?: AbortSignal): Promise<OcrJobs> { return this.transport.request('/digitization/elements/' + uuid(elementId) + '/ocr-jobs', { signal }); }
    qualityAnalysis(elementId: string, signal?: AbortSignal): Promise<QualityAnalysis> { return this.transport.request('/digitization/elements/' + uuid(elementId) + '/quality-analysis', { signal }); }
    fileAssets(elementId: string, signal?: AbortSignal): Promise<FileAssets> { return this.transport.request('/digitization/elements/' + uuid(elementId) + '/file-assets', { signal }); }
    accessPdf(elementId: string, signal?: AbortSignal): Promise<AccessPdf> { return this.transport.request('/digitization/elements/' + uuid(elementId) + '/access-pdf', { signal }); }
    /** Un volume du PDF d'accès (octets du PDF). */
    accessPdfPart(elementId: string, part: number, signal?: AbortSignal): Promise<Blob> { return this.transport.request('/digitization/elements/' + uuid(elementId) + '/access-pdf/' + Math.trunc(part), { signal, responseType: 'blob' }); }
    pipeline(projectId?: string, signal?: AbortSignal): Promise<PipelineStage[]> { return this.transport.request('/digitization/pipeline' + (projectId ? '?projetId=' + uuid(projectId) : ''), { signal }); }
    queue(status: DigitizationElementStatus, projectId?: string, signal?: AbortSignal): Promise<QueueItem[]> { return this.transport.request('/digitization/queue?statut=' + status + (projectId ? '&projetId=' + uuid(projectId) : ''), { signal }); }
    /** Les profils de numérisation nationaux et ceux de l'institution (les profils retirés seulement si demandés). */
    scanProfiles(institutionId: string | null | undefined, includeRetired: boolean, signal?: AbortSignal): Promise<ScanProfile[]> {
        return this.transport.request('/digitization/scan-profiles?includeRetired=' + includeRetired + (institutionId ? '&institutionId=' + uuid(institutionId) : ''), { signal });
    }
    /** Ce que contient un fichier image : dimensions, résolution, profondeur, couleur, compression, profil ICC. */
    imageTechnical(fileId: string, signal?: AbortSignal): Promise<ImageTechnical> { return this.transport.request('/digitization/files/' + uuid(fileId) + '/technical', { signal }); }
    /** L'export MIX (XML) des caractéristiques d'une image. */
    /** La déclaration PDF/A d'un fichier PDF : ce qu'il dit de lui-même, jamais une validation. */
    pdfaDeclaration(fileId: string, signal?: AbortSignal): Promise<PdfaDeclaration> { return this.transport.request('/digitization/files/' + uuid(fileId) + '/pdfa', { signal }); }
    imageMix(fileId: string, signal?: AbortSignal): Promise<Blob> { return this.transport.request('/digitization/files/' + uuid(fileId) + '/technical/mix', { signal, responseType: 'blob' }); }
    /** Une image évaluée contre un profil actif : un constat par exigence. */
    imageConformity(fileId: string, profileId: string, signal?: AbortSignal): Promise<ConformityReport> {
        return this.transport.request('/digitization/files/' + uuid(fileId) + '/conformity?profileId=' + uuid(profileId), { signal });
    }
    command<T>(path: string, body: unknown, key: string, method: 'POST' | 'PUT' = 'POST'): Promise<T> { return this.transport.request('/digitization' + path, { method, body, idempotencyKey: key } satisfies RequestOptions); }
}
