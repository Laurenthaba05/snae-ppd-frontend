import { formatBytes } from './format.js';

/**
 * Planification de la conservation numérique : registre des formats avec niveau de risque, diagnostic des fichiers conservés, agents (PREMIS), relations entre fichiers, droits,
 * export PREMIS. Aucun format n'est livré : le registre est une donnée de référence ; ce qui n'y figure pas est « non évalué », jamais « sans risque ». Le serveur reste seul juge.
 */
export type RiskLevel = 'FAIBLE' | 'MOYEN' | 'ELEVE' | 'CRITIQUE';
export type Perennity = 'RECOMMANDE' | 'ACCEPTE' | 'A_SURVEILLER' | 'OBSOLETE';
export type AgentType = 'PERSONNE' | 'ORGANISATION' | 'LOGICIEL' | 'MATERIEL';
export type RelationType = 'DERIVE' | 'COPIE' | 'MIGRATION' | 'NORMALISATION' | 'COMPOSANT';
export type RightBasis = 'DROIT_AUTEUR' | 'LICENCE' | 'STATUT' | 'POLITIQUE' | 'CONTRAT' | 'AUTRE';
export type RightAct = 'STOCKER' | 'REPRODUIRE' | 'MIGRER' | 'DIFFUSER' | 'MODIFIER' | 'SUPPRIMER';

export interface FileFormat {
    id: string; institutionId: string | null; mediaType: string; name: string; extension: string | null; risk: RiskLevel; perennity: Perennity; motive: string | null;
    targetMediaType: string | null; source: string | null; status: 'ACTIF' | 'RETIRE'; createdAt: string;
}
export interface FormatRiskRow {
    mediaType: string; files: number; bytes: number; registered: boolean; name: string | null; risk: RiskLevel | null; perennity: Perennity | null; targetMediaType: string | null;
    scope: 'NATIONAL' | 'INSTITUTION' | null; atRisk: boolean;
}
export interface FormatRiskReport {
    institutionId: string; generatedAt: string; totalFiles: number; totalBytes: number; evaluatedFiles: number; unevaluatedFiles: number; atRiskFiles: number; atRiskBytes: number;
    rows: FormatRiskRow[];
}
export interface PreservationAgent {
    id: string; institutionId: string | null; type: AgentType; name: string; version: string | null; identifier: string | null; description: string | null; status: 'ACTIF' | 'RETIRE'; createdAt: string;
}
export interface FileRelation { id: string; sourceFileId: string; sourceName: string; targetFileId: string; targetName: string; type: RelationType; eventId: string | null; createdAt: string }
export interface PreservationRight {
    id: string; documentId: string; basis: RightBasis; holder: string | null; act: RightAct; granted: boolean; restriction: string | null; reference: string | null; startDate: string;
    endDate: string | null; status: 'ACTIF' | 'RETIRE'; retirementReason: string | null; createdAt: string;
}

export const RISK_LABELS: Record<RiskLevel, string> = { FAIBLE: 'Risque faible', MOYEN: 'Risque moyen', ELEVE: 'Risque élevé', CRITIQUE: 'Risque critique' };
export const PERENNITY_LABELS: Record<Perennity, string> = { RECOMMANDE: 'Recommandé', ACCEPTE: 'Accepté', A_SURVEILLER: 'À surveiller', OBSOLETE: 'Obsolète' };
export const AGENT_LABELS: Record<AgentType, string> = { PERSONNE: 'Personne', ORGANISATION: 'Organisation', LOGICIEL: 'Logiciel', MATERIEL: 'Matériel' };
export const RELATION_LABELS: Record<RelationType, string> = {
    DERIVE: 'Dérivé de', COPIE: 'Copie de', MIGRATION: 'Migré vers', NORMALISATION: 'Normalisé en', COMPOSANT: 'Composant de'
};
export const BASIS_LABELS: Record<RightBasis, string> = {
    DROIT_AUTEUR: 'Droit d’auteur', LICENCE: 'Licence', STATUT: 'Statut', POLITIQUE: 'Politique', CONTRAT: 'Contrat', AUTRE: 'Autre base'
};
export const ACT_LABELS: Record<RightAct, string> = {
    STOCKER: 'Stocker', REPRODUIRE: 'Reproduire', MIGRER: 'Migrer', DIFFUSER: 'Diffuser', MODIFIER: 'Modifier', SUPPRIMER: 'Supprimer'
};

/** Un format sans risque marqué et recommandé ou accepté n'exige pas de justification ; tout autre l'exige. */
export const requiresMotive = (risk: string, perennity: string): boolean => !(['FAIBLE', 'MOYEN'].includes(risk) && ['RECOMMANDE', 'ACCEPTE'].includes(perennity));
export const isAtRisk = (risk: string | null | undefined, perennity: string | null | undefined): boolean => risk === 'ELEVE' || risk === 'CRITIQUE' || perennity === 'OBSOLETE';

export const normalizeMediaType = (value: string): string => value.split(';')[0]!.trim().toLowerCase();
const MEDIA_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/;
export const isMediaType = (value: string): boolean => value.length <= 150 && MEDIA_TYPE.test(normalizeMediaType(value));

export interface FormatForm { mediaType: string; name: string; extension: string; risk: string; perennity: string; motive: string; target: string; source: string; national: boolean }
export const emptyFormatForm = (): FormatForm => ({ mediaType: '', name: '', extension: '', risk: 'FAIBLE', perennity: 'RECOMMANDE', motive: '', target: '', source: '', national: false });

export function formatProblems(form: FormatForm): string[] {
    const problems: string[] = [];
    if (!isMediaType(form.mediaType)) problems.push('Le type de média n’a pas la forme attendue (par exemple application/pdf).');
    if (!form.name.trim()) problems.push('Le nom du format est obligatoire.');
    if (form.extension.trim() && !/^[A-Za-z0-9]{1,20}$/.test(form.extension.trim().replace(/^\./, ''))) problems.push('L’extension est composée de lettres et de chiffres.');
    if (requiresMotive(form.risk, form.perennity) && form.motive.trim().length < 10) problems.push('Un format à risque, à surveiller ou obsolète se justifie (10 caractères au moins).');
    if (form.target.trim()) {
        if (!isMediaType(form.target)) problems.push('Le format cible n’a pas la forme attendue.');
        else if (normalizeMediaType(form.target) === normalizeMediaType(form.mediaType)) problems.push('Le format cible doit différer du format décrit.');
    }
    return problems;
}

export function formatBody(institutionId: string | null, form: FormatForm): Record<string, unknown> {
    const opt = (v: string) => v.trim() || null;
    return {
        institutionId: form.national ? null : institutionId, mediaType: normalizeMediaType(form.mediaType), name: form.name.trim(), extension: opt(form.extension.replace(/^\./, '')),
        risk: form.risk, perennity: form.perennity, motive: opt(form.motive), targetMediaType: form.target.trim() ? normalizeMediaType(form.target) : null, source: opt(form.source)
    };
}

export interface AgentForm { type: string; name: string; version: string; identifier: string; description: string; national: boolean }
export const emptyAgentForm = (): AgentForm => ({ type: 'LOGICIEL', name: '', version: '', identifier: '', description: '', national: false });
export function agentProblems(form: AgentForm): string[] {
    const problems: string[] = [];
    if (!form.name.trim()) problems.push('Le nom de l’agent est obligatoire.');
    if (!form.type) problems.push('Choisissez le type d’agent.');
    return problems;
}
export function agentBody(institutionId: string | null, form: AgentForm): Record<string, unknown> {
    const opt = (v: string) => v.trim() || null;
    return { institutionId: form.national ? null : institutionId, type: form.type, name: form.name.trim(), version: opt(form.version), identifier: opt(form.identifier), description: opt(form.description) };
}

export interface RightForm { basis: string; holder: string; act: string; granted: boolean; restriction: string; reference: string; startDate: string; endDate: string }
export const emptyRightForm = (today: string): RightForm => ({ basis: '', holder: '', act: '', granted: true, restriction: '', reference: '', startDate: today, endDate: '' });
export function rightProblems(form: RightForm): string[] {
    const problems: string[] = [];
    if (!form.basis) problems.push('Choisissez la base juridique.');
    if (!form.act) problems.push('Choisissez l’acte concerné.');
    if (!form.startDate) problems.push('La date de début est obligatoire.');
    if (form.startDate && form.endDate && form.endDate < form.startDate) problems.push('La fin précède le début.');
    if (!form.granted && !form.restriction.trim()) problems.push('Un acte non autorisé se motive : dites ce qui l’interdit.');
    return problems;
}
export function rightBody(form: RightForm): Record<string, unknown> {
    const opt = (v: string) => v.trim() || null;
    return { basis: form.basis, holder: opt(form.holder), act: form.act, granted: form.granted, restriction: opt(form.restriction), reference: opt(form.reference), startDate: form.startDate, endDate: opt(form.endDate) };
}

export const relationProblems = (targetId: string, type: string, sourceId: string): string[] => {
    const problems: string[] = [];
    if (!sourceId) problems.push('Choisissez le fichier de départ.');
    if (!targetId) problems.push('Choisissez le fichier d’arrivée.');
    if (sourceId && targetId && sourceId === targetId) problems.push('Un fichier ne se relie pas à lui-même.');
    if (!type) problems.push('Choisissez le type de relation.');
    return problems;
};

/** La part de fichiers à risque, en une phrase : ce qui est évalué, ce qui ne l'est pas, ce qui est à migrer. */
export function riskSummary(r: Pick<FormatRiskReport, 'totalFiles' | 'evaluatedFiles' | 'unevaluatedFiles' | 'atRiskFiles' | 'atRiskBytes'>): { text: string; problem: boolean } {
    if (r.totalFiles === 0) return { text: 'Aucun fichier conservé dans ce périmètre.', problem: false };
    const parts: string[] = [];
    if (r.atRiskFiles > 0) parts.push(`${r.atRiskFiles} fichier${r.atRiskFiles > 1 ? 's' : ''} (${formatBytes(r.atRiskBytes)}) dans un format à risque ou obsolète : à migrer`);
    if (r.unevaluatedFiles > 0) parts.push(`${r.unevaluatedFiles} fichier${r.unevaluatedFiles > 1 ? 's' : ''} dans un format non évalué`);
    if (parts.length === 0) return { text: `Les ${r.totalFiles} fichiers conservés sont dans des formats évalués, sans risque marqué.`, problem: false };
    return { text: parts.join(' ; ') + '.', problem: true };
}

export const riskBadge = (risk: string | null | undefined, registered: boolean): string => !registered ? 'NON_VALIDE' : risk === 'CRITIQUE' ? 'ECHEC' : risk === 'ELEVE' ? 'EN_COURS' : risk === 'MOYEN' ? 'PLANIFIE' : 'ACTIF';
export const riskText = (risk: string | null | undefined, registered: boolean): string => !registered ? 'Non évalué' : RISK_LABELS[risk as RiskLevel] ?? '—';
export const premisFileName = (reference: string): string => `premis-${reference.replace(/[^A-Za-z0-9._-]+/g, '_')}.xml`;

// ---------- paquets d'archivage et de diffusion (V89)
export type PackageProfile = 'AIP' | 'DIP';
export interface PackageExport {
    id: string; documentId: string; profile: PackageProfile; format: string; fileName: string; size: number; sha256: string; files: number; versions: number; exportedById: string; exportedAt: string;
}
export const PROFILE_LABELS: Record<PackageProfile, string> = { AIP: 'Paquet d’archivage (AIP)', DIP: 'Paquet de diffusion (DIP)' };
export const packageText = (p: Pick<PackageExport, 'files' | 'versions' | 'size'>): string =>
    `${p.files} fichier${p.files > 1 ? 's' : ''}, ${p.versions} version${p.versions > 1 ? 's' : ''}, ${formatBytes(p.size)}`;

// ---------- auto-diagnostic de maturité (OAIS, V89)
export type OaisStatus = 'CONFORME' | 'PARTIEL' | 'NON_CONFORME' | 'NON_APPLICABLE' | 'A_EVALUER';
export interface OaisIndicator {
    code: string; domain: string; title: string; description: string; kind: 'AUTOMATIQUE' | 'DECLARATIF'; status: OaisStatus; measure: string | null; justification: string | null;
    evaluatedById: string | null; evaluatedAt: string | null;
}
export interface OaisDiagnostic { institutionId: string; generatedAt: string; indicators: OaisIndicator[]; counts: Record<string, number>; evaluated: number; total: number }

export const OAIS_STATUS_LABELS: Record<OaisStatus, string> = {
    CONFORME: 'Conforme', PARTIEL: 'Partiel', NON_CONFORME: 'Non conforme', NON_APPLICABLE: 'Sans objet', A_EVALUER: 'À évaluer'
};
export const OAIS_DOMAIN_LABELS: Record<string, string> = {
    ENTREE: 'Entrée', STOCKAGE: 'Stockage archivistique', GESTION_DONNEES: 'Gestion des données', PLANIFICATION: 'Planification de la préservation', ACCES: 'Accès', SECURITE: 'Sécurité',
    ADMINISTRATION: 'Administration'
};
export const oaisBadge = (status: string): string =>
    status === 'CONFORME' ? 'ACTIF' : status === 'PARTIEL' ? 'EN_COURS' : status === 'NON_CONFORME' ? 'ECHEC' : status === 'NON_APPLICABLE' ? 'INACTIF' : 'NON_VALIDE';

/** Les indicateurs regroupés par fonction, dans l'ordre du serveur. */
export function oaisGroups(d: OaisDiagnostic | null | undefined): Array<{ domain: string; title: string; indicators: OaisIndicator[] }> {
    if (!d) return [];
    const order: string[] = [];
    const map = new Map<string, OaisIndicator[]>();
    for (const i of d.indicators) { if (!map.has(i.domain)) { map.set(i.domain, []); order.push(i.domain); } map.get(i.domain)!.push(i); }
    return order.map(domain => ({ domain, title: OAIS_DOMAIN_LABELS[domain] ?? domain, indicators: map.get(domain)! }));
}

export function oaisSummary(d: Pick<OaisDiagnostic, 'counts' | 'evaluated' | 'total'>): string {
    const n = (k: string) => d.counts[k] ?? 0;
    const parts = [`${n('CONFORME')} conforme${n('CONFORME') > 1 ? 's' : ''}`, `${n('PARTIEL')} partiel${n('PARTIEL') > 1 ? 's' : ''}`, `${n('NON_CONFORME')} non conforme${n('NON_CONFORME') > 1 ? 's' : ''}`];
    if (n('NON_APPLICABLE') > 0) parts.push(`${n('NON_APPLICABLE')} sans objet`);
    return `${d.evaluated} indicateur${d.evaluated > 1 ? 's' : ''} évalué${d.evaluated > 1 ? 's' : ''} sur ${d.total} : ${parts.join(', ')}, ${n('A_EVALUER')} à évaluer.`;
}

export function evaluationProblems(status: string, justification: string): string[] {
    const problems: string[] = [];
    if (!['CONFORME', 'PARTIEL', 'NON_CONFORME', 'NON_APPLICABLE'].includes(status)) problems.push('Choisissez l’évaluation.');
    if (justification.trim().length < 10) problems.push('La justification est obligatoire (10 caractères au moins).');
    return problems;
}

/** Le nom sous lequel le paquet est enregistré : profil, référence du document, jour. */
export const packageFileName = (reference: string, profile: string, now: Date = new Date()): string =>
    `${profile}-${reference.replace(/[^A-Za-z0-9._-]+/g, '_')}-${now.toISOString().slice(0, 10).replace(/-/g, '')}.zip`;
