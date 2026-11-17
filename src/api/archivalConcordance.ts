import type { Transport } from '../core/http';
import { uuid } from '../core/validation';
export interface ConcordanceChoice { archiveId: string | null; cote: string | null; title: string | null; location: string[]; fingerprint: string; blockers: string[]; }
export interface ConcordanceHistory { id: string; origin: string; cote: string | null; location: string[]; note: string; validatedBy: string; validatedAt: string; current: boolean; }
export interface ConcordanceHistoryPage { items: ConcordanceHistory[]; page: number; hasMore: boolean; }
export interface ConcordanceState { valid: boolean; status: string; canValidate: boolean; physicalReadable: boolean; choices: ConcordanceChoice[]; nativeChoice: ConcordanceChoice; history: ConcordanceHistoryPage; }
export interface ConcordanceInput { origin: 'PAPIER' | 'NATIF_NUMERIQUE'; archiveId: string | null; observedCote: string | null; fingerprint: string;
    checks: { identity: boolean; context: boolean; completeness: boolean; legibility: boolean }; note: string; }
export class ArchivalConcordanceApi {
    constructor(readonly transport: Transport) {}
    state(id: string, signal?: AbortSignal): Promise<ConcordanceState> { return this.transport.request('/documents/' + uuid(id) + '/archival-concordance', { signal }); }
    history(id: string, page: number, signal?: AbortSignal): Promise<ConcordanceHistoryPage> { return this.transport.request('/documents/' + uuid(id) + '/archival-concordance/history?page=' + page, { signal }); }
    validate(id: string, input: ConcordanceInput, key: string): Promise<ConcordanceState> { return this.transport.request('/documents/' + uuid(id) + '/archival-concordance', { method: 'POST', body: input, idempotencyKey: key }); }
}
export const concordanceBlockers: Record<string, string> = {
    DOCUMENT_UNAVAILABLE: 'Document détruit ou indisponible.', CLASSIFICATION_REQUIRED: 'Rattachez le document au plan de classement.',
    SEALED_VERSION_REQUIRED: 'La dernière version doit être scellée.', PAPER_ORIGIN_REQUIRED: 'Ce document provient du papier : le contrôle de l’original est obligatoire.',
    PHYSICAL_LINK_REQUIRED: 'Reliez une archive physique à ce document.', PHYSICAL_SCOPE_MISMATCH: 'L’institution et le département doivent correspondre à ceux de la fiche physique.',
    COTE_REQUIRED: 'Renseignez la cote de la fiche physique.', PHYSICAL_LOCATION_REQUIRED: 'Renseignez un emplacement complet et actif.',
    PHYSICAL_PRESENCE_REQUIRED: 'Vérifiez la présence de l’original à son rangement habituel : aucune sortie en cours et constat de moins d’un an.', ORIGIN_REQUIRED: 'Indiquez l’origine du document.'
};
