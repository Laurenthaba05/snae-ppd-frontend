import type { Transport, RequestOptions } from '../core/http.js';
import type { ArchivalIntake } from '../core/types.js';
import type { BordereauLine, BordereauView, CycleAction, Finding, LineInput, StageEvent } from '../core/structuredIntake.js';
import type { AgreementBody, AgreementView } from '../core/depositAgreements.js';
import type { DepositReport, DepositView, IntegrationPreview, IntegrationResult, IntegrationView, SedaManifest, SedaPackageReport } from '../core/intakeExchange.js';
import { uuid } from '../core/validation.js';

export class ArchivalIntakeApi {
    constructor(readonly transport: Transport) { }
    entries(signal?: AbortSignal): Promise<ArchivalIntake[]> { return this.transport.request('/archival-intake/entries', { signal }); }
    command<T>(path: string, body: unknown, key: string, method: 'POST' | 'PUT' = 'POST'): Promise<T> { return this.transport.request('/archival-intake' + path, { method, body, idempotencyKey: key } satisfies RequestOptions); }

    // ---- versement structuré : circuit, journal
    /** Fait avancer le versement : soumettre, prendre en charge, accepter, demander une correction, rejeter, recevoir. Le motif n'est lu que pour une correction ou un rejet. */
    cycle(id: string, action: CycleAction, motif?: string): Promise<ArchivalIntake> {
        const needsBody = action === 'request-correction' || action === 'reject';
        return this.command(`/entries/${uuid(id)}/${action}`, needsBody ? { motif: motif ?? '' } : {}, crypto.randomUUID());
    }
    journal(id: string, signal?: AbortSignal): Promise<StageEvent[]> { return this.transport.request(`/archival-intake/entries/${uuid(id)}/journal`, { signal }); }

    // ---- bordereau
    bordereau(id: string, signal?: AbortSignal): Promise<BordereauView> { return this.transport.request(`/archival-intake/entries/${uuid(id)}/bordereau`, { signal }); }
    /** Remplace tout le bordereau (import d'un fichier) : tout ou rien. */
    replaceBordereau(id: string, lignes: LineInput[]): Promise<BordereauView> { return this.command(`/entries/${uuid(id)}/bordereau`, { lignes }, crypto.randomUUID(), 'PUT'); }
    addLine(id: string, ligne: LineInput): Promise<BordereauLine> { return this.command(`/entries/${uuid(id)}/bordereau/lines`, ligne, crypto.randomUUID()); }
    updateLine(id: string, lineId: string, ligne: LineInput, version: number): Promise<BordereauLine> { return this.command(`/entries/${uuid(id)}/bordereau/lines/${uuid(lineId)}`, { ligne, version }, crypto.randomUUID(), 'PUT'); }
    deleteLine(id: string, lineId: string, version: number): Promise<void> { return this.command(`/entries/${uuid(id)}/bordereau/lines/${uuid(lineId)}/delete`, { version }, crypto.randomUUID()); }
    controlLine(id: string, lineId: string, control: { constat: Finding; quantiteConstatee: number | null; motifEcart: string | null }, version: number): Promise<BordereauLine> {
        return this.command(`/entries/${uuid(id)}/bordereau/lines/${uuid(lineId)}/control`, { ...control, version }, crypto.randomUUID());
    }
    conformRemaining(id: string): Promise<BordereauView> { return this.command(`/entries/${uuid(id)}/bordereau/conform-remaining`, {}, crypto.randomUUID()); }

    // ---- échanges : SEDA et intégration au plan de description
    /** Le bordereau de transfert SEDA du versement (XML). */
    sedaExport(id: string, signal?: AbortSignal): Promise<Blob> { return this.transport.request(`/archival-intake/entries/${uuid(id)}/seda`, { signal, responseType: 'blob' }); }
    /** Remplace le bordereau par un manifeste SEDA (XML) ou un paquet ZIP vérifié par empreintes. */
    importSedaFile(id: string, file: File): Promise<SedaManifest | SedaPackageReport> {
        if (!this.transport.upload) throw new Error('Le téléversement n’est pas disponible.');
        return this.transport.upload(`/archival-intake/entries/${uuid(id)}/bordereau/seda-file`, file, {}, crypto.randomUUID());
    }
    /** Dépose le contenu d'un paquet SEDA d'un versement reçu : un document par unité, ses fichiers par le parcours habituel. Reprenable. */
    depositPackage(id: string, file: File, options: { documentTypeId: string; confidentiality: string }): Promise<DepositReport> {
        if (!this.transport.upload) throw new Error('Le téléversement n’est pas disponible.');
        return this.transport.upload(`/archival-intake/entries/${uuid(id)}/deposit`, file, { documentTypeId: uuid(options.documentTypeId), confidentiality: options.confidentiality }, crypto.randomUUID());
    }
    deposits(id: string, signal?: AbortSignal): Promise<DepositView[]> { return this.transport.request(`/archival-intake/entries/${uuid(id)}/deposits`, { signal }); }
    integrationPreview(id: string, parentId: string | null, level: string | null, signal?: AbortSignal): Promise<IntegrationPreview> {
        const params = new URLSearchParams(); if (parentId) params.set('parentId', parentId); if (level) params.set('level', level);
        const q = params.toString();
        return this.transport.request(`/archival-intake/entries/${uuid(id)}/integration` + (q ? '?' + q : ''), { signal });
    }
    integrate(id: string, parentId: string, level: string): Promise<IntegrationResult> { return this.command(`/entries/${uuid(id)}/integration`, { parentId, level }, crypto.randomUUID()); }
    integrations(id: string, signal?: AbortSignal): Promise<IntegrationView[]> { return this.transport.request(`/archival-intake/entries/${uuid(id)}/integrations`, { signal }); }

    // ---- accords de versement
    agreements(signal?: AbortSignal): Promise<AgreementView[]> { return this.transport.request('/archival-intake/agreements', { signal }); }
    saveAgreement(id: string | undefined, body: AgreementBody): Promise<AgreementView> {
        return id ? this.command(`/agreements/${uuid(id)}`, body, crypto.randomUUID(), 'PUT') : this.command('/agreements', body, crypto.randomUUID());
    }
}
