/**
 * Déclencheurs liés à un événement : le délai de conservation de certains documents part d'un événement (fin d'un marché, décès, fin d'un mandat…) dont la survenue est constatée
 * plus tard. Les types d'événements sont une donnée de référence saisie par le niveau national ou par l'institution ; aucun n'est livré.
 */
export interface TriggerEventType {
    id: string; code: string; label: string; description: string | null; scope: 'NATIONAL' | 'INSTITUTION'; institutionId: string | null; status: 'ACTIF' | 'RETIRE'; versionsUsing: number;
}
export interface TriggerEvent {
    id: string; typeId: string; typeLabel: string; institutionId: string; documentId: string | null; documentReference: string | null; documentTitle: string | null;
    dossierId: string | null; dossierReference: string | null; dossierTitle: string | null; eventDate: string; justification: string; observations: string | null;
    status: 'CONSTATE' | 'ANNULE'; declaredById: string; declaredAt: string; cancelledById: string | null; cancelledAt: string | null; cancellationReason: string | null; inUse: boolean;
}
export type TriggerEventDocumentStatus = 'PLANIFIABLE' | 'PLANIFIE' | 'DEJA_PLANIFIE' | 'NON_CLOS' | 'AUTRE_REGLE' | 'SANS_REGLE' | 'CONSERVE_DEFINITIVEMENT' | 'DETRUIT' | 'ECHEC';
export interface TriggerEventDocument { documentId: string; reference: string; title: string; status: TriggerEventDocumentStatus }
export interface TriggerEventScheduling { event: TriggerEvent; documents: TriggerEventDocument[]; scheduled: number; failures: string[] }

export const DOCUMENT_STATUS_TEXT: Record<TriggerEventDocumentStatus, string> = {
    PLANIFIABLE: 'Peut être planifié', PLANIFIE: 'Planifié à l’instant', DEJA_PLANIFIE: 'Déjà planifié', NON_CLOS: 'Pas encore clos : clôturez-le d’abord',
    AUTRE_REGLE: 'La règle applicable n’attend pas cet événement', SANS_REGLE: 'Aucune règle applicable', CONSERVE_DEFINITIVEMENT: 'Déjà conservé définitivement',
    DETRUIT: 'Détruit', ECHEC: 'Échec de la planification'
};

export const ERROR_TEXT: Record<string, string> = {
    TRIGGER_EVENT_ALREADY_DECLARED: 'Cet événement est déjà constaté : annulez-le d’abord, avec un motif, pour le corriger.',
    TRIGGER_EVENT_IN_USE: 'Une échéance de conservation est déjà partie de cet événement : il ne peut plus être annulé.',
    TRIGGER_EVENT_DATE_FUTURE: 'L’événement ne peut pas être daté dans le futur : constatez-le quand il est survenu.',
    TRIGGER_EVENT_TYPE_RETIRED: 'Ce type d’événement est retiré.',
    TRIGGER_EVENT_TYPE_SCOPE: 'Ce type d’événement appartient à une autre institution.'
};

export const MAX_JUSTIFICATION = 500;

export interface DeclareForm { typeId: string; date: string; justification: string; observations: string; scope: 'DOCUMENT' | 'DOSSIER' }
export const emptyDeclareForm = (typeId = '', hasDossier = false): DeclareForm => ({ typeId, date: '', justification: '', observations: '', scope: hasDossier ? 'DOSSIER' : 'DOCUMENT' });

export function declareProblems(form: DeclareForm, today: string): string[] {
    const problems: string[] = [];
    if (!form.typeId) problems.push('Choisissez le type d’événement.');
    if (!form.date) problems.push('La date de l’événement est obligatoire.');
    else if (form.date > today) problems.push('L’événement ne peut pas être daté dans le futur : constatez-le quand il est survenu.');
    else if (form.date < '1800-01-01') problems.push('La date de l’événement est invalide.');
    const justification = form.justification.trim();
    if (justification.length < 5) problems.push('La justification (acte, procès-verbal ou référence qui atteste l’événement) est obligatoire : 5 caractères au moins.');
    else if (justification.length > MAX_JUSTIFICATION) problems.push(`La justification est limitée à ${MAX_JUSTIFICATION} caractères.`);
    if (form.observations.length > 4000) problems.push('Les observations sont limitées à 4000 caractères.');
    return problems;
}

export function declareBody(form: DeclareForm, documentId: string | null, dossierId: string | null): Record<string, unknown> {
    const onDossier = form.scope === 'DOSSIER' && dossierId;
    return {
        typeId: form.typeId, documentId: onDossier ? null : documentId, dossierId: onDossier ? dossierId : null, eventDate: form.date,
        justification: form.justification.trim(), observations: form.observations.trim() || null
    };
}

export interface CreateTypeForm { code: string; label: string; description: string; scope: 'NATIONAL' | 'INSTITUTION' }
export const emptyTypeForm = (): CreateTypeForm => ({ code: '', label: '', description: '', scope: 'INSTITUTION' });
export function typeProblems(form: CreateTypeForm): string[] {
    const problems: string[] = [];
    const code = form.code.trim().toUpperCase().replace(/[\s-]+/g, '_');
    if (!/^[A-Z0-9_]{3,60}$/.test(code)) problems.push('Le code se compose de 3 à 60 lettres, chiffres ou tirets bas.');
    if (!form.label.trim()) problems.push('Le libellé est obligatoire.');
    else if (form.label.trim().length > 200) problems.push('Le libellé est limité à 200 caractères.');
    if (form.description.length > 2000) problems.push('La description est limitée à 2000 caractères.');
    return problems;
}
export const typeBody = (form: CreateTypeForm, institutionId: string | null): Record<string, unknown> => ({
    code: form.code.trim(), label: form.label.trim(), description: form.description.trim() || null, institutionId: form.scope === 'INSTITUTION' ? institutionId : null
});

/** Une phrase pour un événement constaté : « Réception définitive du marché, le 5 mai 2026 — Procès-verbal n° 12 (dossier DOS-1) ». */
export function eventSentence(e: Pick<TriggerEvent, 'typeLabel' | 'eventDate' | 'justification' | 'documentReference' | 'dossierReference'>, day: (iso: string) => string): string {
    const where = e.dossierReference ? ` (dossier ${e.dossierReference})` : e.documentReference ? ` (document ${e.documentReference})` : '';
    return `${e.typeLabel}, le ${day(e.eventDate)} — ${e.justification}${where}`;
}

export function schedulingText(r: Pick<TriggerEventScheduling, 'scheduled' | 'failures'>): string {
    const done = r.scheduled === 0 ? 'Aucune échéance n’a été planifiée.' : r.scheduled === 1 ? '1 échéance a été planifiée.' : `${r.scheduled} échéances ont été planifiées.`;
    return r.failures.length > 0 ? `${done} ${r.failures.length === 1 ? '1 document n’a pas pu l’être' : `${r.failures.length} documents n’ont pas pu l’être`} (voir ci-dessous).` : done;
}
