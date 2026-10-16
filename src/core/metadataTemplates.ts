import type { MetadataValueType } from './types.js';
import { uuid } from './validation.js';

/**
 * Gabarits de schémas de métadonnées (Dublin Core, gestion des documents d'activité) : des valeurs d'exemple. Les instancier crée un schéma en BROUILLON, que l'institution relit,
 * adapte, lie à ses types documentaires puis active.
 */
export interface MetadataTemplateField {
    code: string; name: string; description: string; type: MetadataValueType; required: boolean; repeatable: boolean; maxLength: number | null; group: string | null;
}
export interface MetadataTemplate { code: string; name: string; description: string; reference: string; note: string; fields: MetadataTemplateField[] }
export interface MetadataTemplateInstance {
    schema: { id: string; code: string; name: string; version: number; status: string; institutionId: string | null };
    fields: number;
}

export const GROUP_LABELS: Record<string, string> = {
    IDENTITE: 'Identité', DESCRIPTION: 'Description', USAGE: 'Usage', PLAN_EVENEMENTS: 'Plan d’événements', HISTORIQUE_EVENEMENTS: 'Historique d’événements', RELATIONS: 'Relations'
};

/** « 15 champs : 15 facultatifs, 15 répétables » */
export function templateSummary(t: Pick<MetadataTemplate, 'fields'>): string {
    const n = t.fields.length;
    const required = t.fields.filter(f => f.required).length;
    const repeatable = t.fields.filter(f => f.repeatable).length;
    const parts = [required === 0 ? 'tous facultatifs' : `${required} obligatoire${required > 1 ? 's' : ''}`];
    if (repeatable > 0) parts.push(repeatable === n ? 'tous répétables' : `${repeatable} répétable${repeatable > 1 ? 's' : ''}`);
    return `${n} champ${n > 1 ? 's' : ''} : ${parts.join(', ')}`;
}

/** Les champs regroupés dans l'ordre du gabarit ; les gabarits sans groupe forment un seul ensemble. */
export function templateGroups(t: Pick<MetadataTemplate, 'fields'>): { group: string | null; label: string; fields: MetadataTemplateField[] }[] {
    const order: (string | null)[] = [];
    for (const f of t.fields) if (!order.includes(f.group)) order.push(f.group);
    return order.map(group => ({ group, label: group ? (GROUP_LABELS[group] ?? group) : 'Éléments', fields: t.fields.filter(f => f.group === group) }));
}

export function schemaCodeProblem(code: string): string | null {
    const clean = code.trim();
    if (clean.length === 0) return null;                      // vide : le serveur reprend le code du gabarit
    if (clean.length > 100) return 'Le code est limité à 100 caractères.';
    return null;
}

export function instantiateBody(institutionId: string | null | undefined, schemaCode: string): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    if (institutionId) body.institutionId = uuid(institutionId);
    if (schemaCode.trim()) body.schemaCode = schemaCode.trim();
    return body;
}
