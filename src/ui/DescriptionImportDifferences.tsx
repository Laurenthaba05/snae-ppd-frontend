import React from 'react';
import type { EadChange } from '../api/archives';
import { EAD_LEVEL_LABELS } from '../core/eadImport';
import { DESCRIPTION_GROUPS, STATUS_LABELS, DATE_KIND_LABELS } from '../core/archivalDescription';
import { PRIORITIES, PROCESSING_STATES } from '../core/archiveEnrichment';
import { label } from '../core/format';

export const descriptionImportActions = { CREATE: 'À créer', UPDATE: 'À mettre à jour', UNCHANGED: 'Inchangée — aucune modification' };
export function DescriptionImportDifferences({ changes }: { changes: EadChange[] }) {
    const names: Record<string, string> = { ...Object.fromEntries(DESCRIPTION_GROUPS.flatMap(group => group.fields.map(field => [field.key, field.label]))),
        code: 'Référence', title: 'Intitulé', level: 'Niveau', parentId: 'Parent', producerId: 'Producteur principal', confidentiality: 'Confidentialité', documentId: 'Document lié', dossierId: 'Dossier lié',
        identifiers: 'Identifiants secondaires', dates: 'Dates structurées', extents: 'Volumes matériels', producers: 'Producteurs et périodes',
        'processing.priority': 'Priorité du traitement', 'processing.status': 'État du traitement', 'processing.plan': 'Plan de traitement', 'processing.estimatedHours': 'Heures prévues',
        'processing.actualHours': 'Heures réalisées', 'processing.processors': 'Intervenants', 'processing.funding': 'Financement' };
    const display = (field: string, value: string | null) => {
        if (value == null || value === '') return 'Non renseigné';
        if (field === 'confidentiality') return label('confidentiality', value);
        const labels = field === 'level' ? EAD_LEVEL_LABELS : field === 'status' ? STATUS_LABELS : field === 'dateKind' ? DATE_KIND_LABELS : field === 'processing.priority' ? PRIORITIES : field === 'processing.status' ? PROCESSING_STATES : {};
        return labels[value] ?? value;
    };
    return <dl aria-label="Différences avant confirmation">{changes.map(change => <React.Fragment key={change.field}>
        <dt><strong>{names[change.field] ?? change.field}</strong></dt><dd style={{ whiteSpace: 'pre-wrap' }}>Avant : {display(change.field, change.before)}<br />Après : {display(change.field, change.after)}</dd>
    </React.Fragment>)}</dl>;
}
