import React from 'react';
import type { EadChange } from '../api/archives';
import { KIND_LABELS, STATUS_LABELS, DETAIL_LABELS } from '../core/archivalFunctions';
const fields: Record<string, string> = { code: 'Code', name: 'Forme autorisée du nom', kind: 'Type de fonction', parentId: 'Fonction mère', parallelNames: 'Formes parallèles du nom', otherNames: 'Autres formes du nom', classification: 'Classification', dateStart: 'Date de début', dateEnd: 'Date de fin', description: 'Description', history: 'Historique', legislation: 'Textes qui l’instituent', rules: 'Règles', status: 'État de rédaction', detailLevel: 'Niveau de détail', language: 'Langue', sources: 'Sources', maintenanceNotes: 'Notes de mise à jour' };
const values: Record<string, string> = { ...KIND_LABELS, ...STATUS_LABELS, ...DETAIL_LABELS };
export function FunctionImportDifferences({ changes }: { changes: EadChange[] }) {
    const display = (change: EadChange, value: string | null) => value == null || value === '' ? 'Non renseigné' : ['kind', 'status', 'detailLevel'].includes(change.field) ? values[value] ?? value : value;
    return <dl aria-label="Différences avant confirmation">{changes.map(change => <React.Fragment key={change.field}>
        <dt><strong>{fields[change.field] ?? change.field}</strong></dt><dd style={{ whiteSpace: 'pre-wrap' }}>Avant : {display(change, change.before)}<br />Après : {display(change, change.after)}</dd>
    </React.Fragment>)}</dl>;
}
