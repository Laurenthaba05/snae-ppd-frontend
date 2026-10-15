import type { Transport } from '../core/http';
import { uuid } from '../core/validation';

export const detailResources = {
    intakeAgreement: ['/archival-intake/agreements', 'Accord de versement'],
    systemStatus: ['/system/status', 'État du service'],
    assignment: ['/iam/role-assignments', 'Attribution de rôle'],
    delegation: ['/iam/delegations', 'Délégation'],
    auditEvent: ['/audit/events', 'Événement du journal'],
    classificationNode: ['/classification/nodes', 'Nœud de classement'],
    communication: ['/communications', 'Communication documentaire'],
    departmentImpact: ['/iam/departments/:id/impact', 'Impact du département'],
    physicalLocation: ['/physical-archives/locations', 'Emplacement physique'],
    workflowTransitions: ['/admin/workflow-definitions/:id/transitions', 'Transitions du circuit'],
    authorityRelations: ['/archives/authorities/:id/relations', 'Relations du producteur'],
    archiveDescription: ['/archives/descriptions', 'Description archivistique'],
    archiveAuthority: ['/archives/authorities', 'Producteur'],
    heritageEvent: ['/heritage/historical-events', 'Événement historique'],
    heritagePlace: ['/heritage/places', 'Lieu'],
    heritageReprise: ['/heritage/reprises', 'Reprise d’inventaire'],
    heritageSubject: ['/heritage/subjects', 'Sujet'],
    heritageText: ['/heritage/texts', 'Texte multilingue'],
    digitizationProject: ['/digitization/projects', 'Projet de numérisation'],
    contribution: ['/digitization/contributions', 'Contribution'],
    ocrResult: ['/digitization/ocr-results', 'Résultat OCR'],
    qualityControl: ['/digitization/quality-controls', 'Contrôle qualité'],
    scanner: ['/digitization/scanners', 'Scanner'],
    physicalMovement: ['/physical-archives/movements', 'Mouvement d’archive'],
    restoration: ['/physical-archives/restorations', 'Restauration'],
    storageUnit: ['/physical-archives/storage-units', 'Unité de rangement'],
    retentionEvent: ['/retention/events', 'Échéance de conservation'],
    legalHold: ['/retention/legal-holds', 'Gel légal'],
    triggerEvent: ['/retention/trigger-events', 'Événement déclencheur'],
    restriction: ['/rights/restrictions', 'Restriction d’accès'],
    legalSource: ['/rights/sources', 'Source juridique'],
    legalStatus: ['/rights/statuses', 'Statut juridique'],
    metadataSchema: ['/admin/metadata-schemas', 'Schéma de métadonnées'],
    workflowDefinition: ['/admin/workflow-definitions', 'Définition du circuit'],
    licence: ['/publication/licences', 'Licence de diffusion'],
    publication: ['/publication/publications', 'Publication'],
    intakeEntry: ['/archival-intake/entries', 'Entrée aux archives'],
    portalReader: ['/portal-admin/readers', 'Lecteur'],
    workflow: ['/workflows', 'Circuit de validation'],
} as const;
export type DetailResource = keyof typeof detailResources;
export class ResourceDetailsApi {
    constructor(private readonly transport: Transport) {}
    async get(resource: DetailResource, id?: string, signal?: AbortSignal): Promise<Record<string, unknown> | unknown[]> {
        const config = detailResources[resource];
        if (!config) throw new Error('Type de fiche inconnu.');
        if (resource === 'systemStatus') return this.transport.request(config[0], { signal });
        const cleanId = uuid(id ?? '');
        const path = config[0].includes(':id') ? config[0].replace(':id', cleanId) : config[0] + '/' + cleanId;
        return this.transport.request(path, { signal });
    }
}
